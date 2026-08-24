import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import type { Request, Response } from 'express'
import { db, type AccountRow } from './db'

const SESSION_COOKIE = 'cp_session'
const SESSION_DAYS = 14
const BCRYPT_ROUNDS = 10

/* ---------- 密码 / PIN ---------- */

export function hashCredential(plain: string): string {
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS)
}

export function verifyCredential(plain: string, hash: string | null): boolean {
  if (!hash) return false
  try {
    return bcrypt.compareSync(plain, hash)
  } catch {
    return false
  }
}

export function randomPin(): string {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0')
}

export function validatePin(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return 'PIN 为 6 位数字'
  return null
}

export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return '密码至少 8 位'
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return '密码需同时包含字母和数字'
  return null
}

/* ---------- 登录限速（内存滑动窗口） ---------- */

const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILS = 5
const fails = new Map<string, number[]>()

export function rateLimited(key: string): boolean {
  const now = Date.now()
  const arr = (fails.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  fails.set(key, arr)
  return arr.length >= MAX_FAILS
}

export function recordFail(key: string) {
  const arr = fails.get(key) ?? []
  arr.push(Date.now())
  fails.set(key, arr)
}

export function clearFails(key: string) {
  fails.delete(key)
}

/* ---------- 会话 ---------- */

export function createSession(res: Response, accountId: string) {
  const token = crypto.randomBytes(32).toString('hex')
  const now = new Date()
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400000)
  db.prepare('INSERT INTO sessions(token, accountId, createdAt, expiresAt) VALUES (?, ?, ?, ?)').run(
    token,
    accountId,
    now.toISOString(),
    expires.toISOString(),
  )
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    expires,
    path: '/',
  })
}

export function destroySession(req: Request, res: Response) {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
  res.clearCookie(SESSION_COOKIE, { path: '/' })
}

export function destroyAccountSessions(accountId: string) {
  db.prepare('DELETE FROM sessions WHERE accountId = ?').run(accountId)
}

export function sessionAccount(req: Request): AccountRow | null {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined
  if (!token) return null
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token) as
    | { token: string; accountId: string; expiresAt: string }
    | undefined
  if (!row) return null
  if (row.expiresAt < new Date().toISOString()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    return null
  }
  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND active = 1').get(row.accountId) as
    | AccountRow
    | undefined
  return account ?? null
}

/** 过期会话清理（启动时 + 每日）。 */
export function pruneSessions() {
  db.prepare('DELETE FROM sessions WHERE expiresAt < ?').run(new Date().toISOString())
}
