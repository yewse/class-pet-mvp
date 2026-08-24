import express from 'express'
import cookieParser from 'cookie-parser'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { AppState } from '../src/types'
import { addStudent as engineAddStudent, deleteStudent as engineDeleteStudent, renameStudent as engineRenameStudent, setStudentNo as engineSetStudentNo } from '../src/engine'
import {
  accountById,
  accountByUsername,
  accountsCount,
  allClasses,
  appendEvent,
  classById,
  classIdsOf,
  db,
  loadClassState,
  maybeDailyBackup,
  saveClassState,
  schoolName,
  setMeta,
  studentAccounts,
  type AccountRow,
} from './db'
import {
  clearFails,
  createSession,
  destroyAccountSessions,
  destroySession,
  hashCredential,
  pruneSessions,
  randomPin,
  rateLimited,
  recordFail,
  sessionAccount,
  validatePassword,
  validatePin,
  verifyCredential,
} from './auth'
import { ACTIONS, auditSlices, seatSlices } from './actions'
import { viewFor } from './views'
import { registerAdminRoutes } from './admin-api'

const PORT = Number(process.env.PORT || 3050)
const app = express()
app.use(express.json({ limit: '256kb' }))
app.use(cookieParser())

/* 每个班的单步撤销快照（内存；重启即失效，无害） */
const undoBuf = new Map<string, { audit?: ReturnType<typeof auditSlices>; seat?: ReturnType<typeof seatSlices> }>()

function ipOf(req: express.Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown'
}

/** 简易 CSRF：变更请求必须带自定义头（同源 fetch 才能带上） */
app.use('/api', (req, res, next) => {
  maybeDailyBackup()
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'fetch') {
    res.status(403).json({ error: '非法请求来源' })
    return
  }
  next()
})

function requireAuth(req: express.Request, res: express.Response): AccountRow | null {
  const me = sessionAccount(req)
  if (!me) {
    res.status(401).json({ error: '未登录' })
    return null
  }
  return me
}

function classAccess(me: AccountRow, classId: string): boolean {
  return classIdsOf(me).includes(classId)
}

function rosterMetaFor(classId: string): AppState['rosterMeta'] {
  const rows = db
    .prepare("SELECT id, credHash, consentAt, consentMethod FROM accounts WHERE role = 'student' AND classId = ? AND active = 1")
    .all(classId) as { id: string; credHash: string | null; consentAt: string | null; consentMethod: string | null }[]
  return Object.fromEntries(
    rows.map((r) => [r.id, { hasPin: !!r.credHash, consentAt: r.consentAt, consentMethod: r.consentMethod }]),
  )
}

function stateResponse(me: AccountRow, classId: string): AppState | { error: string } {
  const state = loadClassState(classId)
  if (!state) return { error: '班级不存在' }
  const view = viewFor(state, me, schoolName(), allClasses().filter((c) => classIdsOf(me).includes(c.id)), classId)
  if (me.role === 'homeroom') view.rosterMeta = rosterMetaFor(classId)
  return view
}

/* ---------- 引导与安装 ---------- */

app.get('/api/bootstrap', (_req, res) => {
  const setupNeeded = accountsCount() === 0
  res.json({
    setupNeeded,
    schoolName: setupNeeded ? null : schoolName(),
    classes: allClasses(),
  })
})

const setupSchema = z.object({
  schoolName: z.string().min(2).max(30),
  adminName: z.string().min(2).max(20),
  username: z.string().min(3).max(30).regex(/^[A-Za-z0-9_.-]+$/, '用户名只能是字母数字._-'),
  password: z.string().max(72),
})

/** 首次安装：只创建学校与管理员；班级与教师由管理员在管理台创建。 */
app.post('/api/setup', (req, res) => {
  if (accountsCount() > 0) {
    res.status(403).json({ error: '系统已初始化' })
    return
  }
  const parsed = setupSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数不合法' })
    return
  }
  const p = parsed.data
  const pwErr = validatePassword(p.password)
  if (pwErr) {
    res.status(400).json({ error: pwErr })
    return
  }
  const adminId = `a-${crypto.randomBytes(4).toString('hex')}`
  const now = new Date().toISOString()
  db.transaction(() => {
    setMeta('schoolName', p.schoolName)
    db.prepare(
      'INSERT INTO accounts(id, role, name, username, credHash, active, createdAt) VALUES (?, ?, ?, ?, ?, 1, ?)',
    ).run(adminId, 'admin', p.adminName, p.username, hashCredential(p.password), now)
  })()
  appendEvent({ actorId: adminId, classId: null, type: 'setup', payload: { schoolName: p.schoolName }, ok: true })
  createSession(res, adminId)
  res.json({ ok: true })
})

/* ---------- 认证 ---------- */

app.post('/api/auth/teacher-login', (req, res) => {
  const p = z.object({ username: z.string().max(40), password: z.string().max(72) }).safeParse(req.body)
  if (!p.success) {
    res.status(400).json({ error: '参数不合法' })
    return
  }
  const key = `t|${ipOf(req)}|${p.data.username}`
  if (rateLimited(key)) {
    res.status(429).json({ error: '尝试过多，请 15 分钟后再试' })
    return
  }
  const acc = accountByUsername(p.data.username.trim())
  if (!acc || acc.role === 'student' || !verifyCredential(p.data.password, acc.credHash)) {
    recordFail(key)
    res.status(401).json({ error: '用户名或密码不正确' })
    return
  }
  clearFails(key)
  createSession(res, acc.id)
  appendEvent({ actorId: acc.id, classId: acc.classId, type: 'login', payload: { kind: 'teacher' }, ok: true })
  res.json({ ok: true })
})

app.post('/api/auth/student-login', (req, res) => {
  const p = z
    .object({
      classId: z.string().max(40),
      name: z.string().max(20),
      studentNo: z.string().max(10).optional(),
      pin: z.string().max(12),
    })
    .safeParse(req.body)
  if (!p.success) {
    res.status(400).json({ error: '参数不合法' })
    return
  }
  const key = `s|${ipOf(req)}|${p.data.classId}|${p.data.name}`
  if (rateLimited(key)) {
    res.status(429).json({ error: '尝试过多，请 15 分钟后再试' })
    return
  }
  const candidates = studentAccounts(p.data.classId, p.data.name.trim())
  let acc: AccountRow | undefined
  if (candidates.length === 0) {
    recordFail(key)
    res.status(401).json({ error: '没有找到这个同学，检查班级和姓名' })
    return
  }
  if (candidates.length > 1 || p.data.studentNo) {
    if (!p.data.studentNo) {
      res.status(400).json({ error: '有同名同学，请再填学号' })
      return
    }
    acc = candidates.find((c) => (c.studentNo ?? '') === p.data.studentNo!.trim())
  } else {
    acc = candidates[0]
  }
  if (!acc) {
    recordFail(key)
    res.status(401).json({ error: '学号不匹配' })
    return
  }
  if (!acc.consentAt) {
    res.status(403).json({ error: '监护人同意书还没登记，请先找班主任' })
    return
  }
  if (!verifyCredential(p.data.pin, acc.credHash)) {
    recordFail(key)
    res.status(401).json({ error: 'PIN 不正确' })
    return
  }
  clearFails(key)
  createSession(res, acc.id)
  appendEvent({ actorId: acc.id, classId: acc.classId, type: 'login', payload: { kind: 'student' }, ok: true })
  res.json({ ok: true })
})

app.post('/api/auth/logout', (req, res) => {
  destroySession(req, res)
  res.json({ ok: true })
})

app.post('/api/auth/change-password', (req, res) => {
  const me = requireAuth(req, res)
  if (!me) return
  const p = z.object({ oldPassword: z.string().max(72), newPassword: z.string().max(72) }).safeParse(req.body)
  if (!p.success) {
    res.status(400).json({ error: '参数不合法' })
    return
  }
  if (me.role === 'student') {
    const pinErr = validatePin(p.data.newPassword)
    if (pinErr) {
      res.status(400).json({ error: pinErr })
      return
    }
  } else {
    const pwErr = validatePassword(p.data.newPassword)
    if (pwErr) {
      res.status(400).json({ error: pwErr })
      return
    }
  }
  if (!verifyCredential(p.data.oldPassword, me.credHash)) {
    res.status(401).json({ error: '原密码不正确' })
    return
  }
  db.prepare('UPDATE accounts SET credHash = ? WHERE id = ?').run(hashCredential(p.data.newPassword), me.id)
  destroyAccountSessions(me.id)
  createSession(res, me.id)
  appendEvent({ actorId: me.id, classId: me.classId, type: 'changePassword', payload: null, ok: true })
  res.json({ ok: true })
})

app.get('/api/me', (req, res) => {
  const me = sessionAccount(req)
  if (!me) {
    res.status(401).json({ error: '未登录' })
    return
  }
  const classes = allClasses().filter((c) => classIdsOf(me).includes(c.id))
  res.json({
    id: me.id,
    role: me.role,
    name: me.name,
    studentNo: me.studentNo ?? undefined,
    classId: me.classId,
    classIds: classIdsOf(me),
    classes,
    schoolName: schoolName(),
  })
})

/* ---------- 状态与动作 ---------- */

app.get('/api/state', (req, res) => {
  const me = requireAuth(req, res)
  if (!me) return
  const classId = String(req.query.classId || me.classId || classIdsOf(me)[0] || '')
  if (!classId || !classAccess(me, classId)) {
    res.status(403).json({ error: '无权访问该班级' })
    return
  }
  const view = stateResponse(me, classId)
  if ('error' in view) {
    res.status(404).json(view)
    return
  }
  res.json(view)
})

const actionSchema = z.object({
  classId: z.string().max(40),
  type: z.string().max(40),
  payload: z.unknown().optional(),
})

app.post('/api/action', (req, res) => {
  const me = requireAuth(req, res)
  if (!me) return
  const parsed = actionSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: '参数不合法' })
    return
  }
  const { classId, type } = parsed.data
  if (!classAccess(me, classId)) {
    res.status(403).json({ error: '无权访问该班级' })
    return
  }
  const state = loadClassState(classId)
  if (!state) {
    res.status(404).json({ error: '班级不存在' })
    return
  }
  const actor = { id: me.id, role: me.role }

  /* 单步撤销：非引擎动作，直接还原切片 */
  if (type === 'undoTeacherAudit' || type === 'undoSeatAction') {
    if (me.role === 'student') {
      res.status(403).json({ error: '仅教师可操作' })
      return
    }
    const buf = undoBuf.get(classId)
    const snap = type === 'undoTeacherAudit' ? buf?.audit : buf?.seat
    if (!snap) {
      res.status(400).json({ error: '没有可撤销的操作' })
      return
    }
    const restored = { ...state, ...snap }
    saveClassState(classId, restored)
    if (type === 'undoTeacherAudit') undoBuf.set(classId, { ...buf, audit: undefined })
    else undoBuf.set(classId, { ...buf, seat: undefined })
    appendEvent({ actorId: me.id, classId, type, payload: null, ok: true })
    res.json({ ok: true, state: stateResponse(me, classId) })
    return
  }

  const def = ACTIONS[type]
  if (!def) {
    res.status(400).json({ error: `未知操作 ${type}` })
    return
  }
  const payload = def.schema.safeParse(parsed.data.payload ?? {})
  if (!payload.success) {
    res.status(400).json({ error: payload.error.issues[0]?.message ?? '参数不合法' })
    return
  }
  if (def.snapshot === 'audit') {
    undoBuf.set(classId, { ...undoBuf.get(classId), audit: auditSlices(state) })
  } else if (def.snapshot === 'seat') {
    undoBuf.set(classId, { ...undoBuf.get(classId), seat: seatSlices(state) })
  }
  const out = def.handler(state, actor, payload.data)
  appendEvent({ actorId: me.id, classId, type, payload: payload.data, ok: !out.error, error: out.error })
  if (out.error) {
    res.status(400).json({ error: out.error })
    return
  }
  saveClassState(classId, out.state)
  res.json({ ok: true, result: out.result ?? null, state: stateResponse(me, classId) })
})

/* ---------- 花名册（引擎 + 账号同事务） ---------- */

function requireHomeroomOf(req: express.Request, res: express.Response, classId: string): AccountRow | null {
  const me = requireAuth(req, res)
  if (!me) return null
  if (me.role !== 'homeroom' || !classAccess(me, classId)) {
    res.status(403).json({ error: '仅本班班主任可操作' })
    return null
  }
  return me
}

app.post('/api/roster/add-student', (req, res) => {
  const p = z
    .object({ classId: z.string().max(40), name: z.string().max(20), studentNo: z.string().max(10).optional() })
    .safeParse(req.body)
  if (!p.success) {
    res.status(400).json({ error: '参数不合法' })
    return
  }
  const me = requireHomeroomOf(req, res, p.data.classId)
  if (!me) return
  const state = loadClassState(p.data.classId)
  if (!state) {
    res.status(404).json({ error: '班级不存在' })
    return
  }
  const id = `s-${crypto.randomBytes(5).toString('hex')}`
  const out = engineAddStudent(state, { id: me.id, role: me.role }, { id, name: p.data.name, studentNo: p.data.studentNo })
  appendEvent({ actorId: me.id, classId: p.data.classId, type: 'addStudent', payload: { name: p.data.name, studentNo: p.data.studentNo }, ok: !out.error, error: out.error })
  if (out.error) {
    res.status(400).json({ error: out.error })
    return
  }
  const pin = randomPin()
  db.transaction(() => {
    db.prepare(
      'INSERT INTO accounts(id, role, name, studentNo, classId, credHash, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
    ).run(id, 'student', p.data.name.trim(), (p.data.studentNo ?? '').trim() || null, p.data.classId, hashCredential(pin), new Date().toISOString())
    saveClassState(p.data.classId, out.state)
  })()
  res.json({ ok: true, result: { id, pin }, state: stateResponse(me, p.data.classId) })
})

app.post('/api/roster/batch', (req, res) => {
  const p = z.object({ classId: z.string().max(40), text: z.string().max(20000) }).safeParse(req.body)
  if (!p.success) {
    res.status(400).json({ error: '参数不合法' })
    return
  }
  const me = requireHomeroomOf(req, res, p.data.classId)
  if (!me) return
  let state = loadClassState(p.data.classId)
  if (!state) {
    res.status(404).json({ error: '班级不存在' })
    return
  }
  const lines = p.data.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const okRows: { name: string; studentNo?: string; pin: string }[] = []
  const errors: string[] = []
  const inserts: { id: string; name: string; no: string | null; pinHash: string }[] = []
  for (const line of lines) {
    const tokens = line.split(/[\s,，#]+/).filter(Boolean)
    let no: string | undefined
    const nameParts: string[] = []
    for (const t of tokens) {
      if (!no && /^\d{1,6}$/.test(t)) no = t
      else nameParts.push(t)
    }
    const name = nameParts.join('')
    const id = `s-${crypto.randomBytes(5).toString('hex')}`
    const out = engineAddStudent(state, { id: me.id, role: me.role }, { id, name, studentNo: no })
    if (out.error) {
      errors.push(`${line}（${out.error}）`)
      continue
    }
    state = out.state
    const pin = randomPin()
    inserts.push({ id, name: name.trim(), no: no ?? null, pinHash: hashCredential(pin) })
    okRows.push({ name: name.trim(), studentNo: no, pin })
  }
  if (inserts.length) {
    db.transaction(() => {
      for (const r of inserts) {
        db.prepare(
          'INSERT INTO accounts(id, role, name, studentNo, classId, credHash, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
        ).run(r.id, 'student', r.name, r.no, p.data.classId, r.pinHash, new Date().toISOString())
      }
      saveClassState(p.data.classId, state!)
    })()
  }
  appendEvent({ actorId: me.id, classId: p.data.classId, type: 'batchAddStudents', payload: { count: okRows.length, errors: errors.length }, ok: true })
  res.json({ ok: true, result: { rows: okRows, errors }, state: stateResponse(me, p.data.classId) })
})

app.post('/api/roster/rename', (req, res) => {
  const p = z
    .object({ classId: z.string().max(40), studentId: z.string().max(40), name: z.string().max(20), studentNo: z.string().max(10) })
    .safeParse(req.body)
  if (!p.success) {
    res.status(400).json({ error: '参数不合法' })
    return
  }
  const me = requireHomeroomOf(req, res, p.data.classId)
  if (!me) return
  const state = loadClassState(p.data.classId)
  if (!state) {
    res.status(404).json({ error: '班级不存在' })
    return
  }
  const actor = { id: me.id, role: me.role }
  const r1 = engineRenameStudent(state, actor, p.data.studentId, p.data.name)
  if (r1.error) {
    res.status(400).json({ error: r1.error })
    return
  }
  const r2 = engineSetStudentNo(r1.state, actor, p.data.studentId, p.data.studentNo)
  if (r2.error) {
    res.status(400).json({ error: r2.error })
    return
  }
  db.transaction(() => {
    db.prepare('UPDATE accounts SET name = ?, studentNo = ? WHERE id = ?').run(
      p.data.name.trim(),
      p.data.studentNo.trim() || null,
      p.data.studentId,
    )
    saveClassState(p.data.classId, r2.state)
  })()
  appendEvent({ actorId: me.id, classId: p.data.classId, type: 'renameStudent', payload: p.data, ok: true })
  res.json({ ok: true, state: stateResponse(me, p.data.classId) })
})

app.post('/api/roster/delete-student', (req, res) => {
  const p = z.object({ classId: z.string().max(40), studentId: z.string().max(40) }).safeParse(req.body)
  if (!p.success) {
    res.status(400).json({ error: '参数不合法' })
    return
  }
  const me = requireHomeroomOf(req, res, p.data.classId)
  if (!me) return
  const state = loadClassState(p.data.classId)
  if (!state) {
    res.status(404).json({ error: '班级不存在' })
    return
  }
  const out = engineDeleteStudent(state, { id: me.id, role: me.role }, p.data.studentId)
  if (out.error) {
    res.status(400).json({ error: out.error })
    return
  }
  db.transaction(() => {
    db.prepare('DELETE FROM accounts WHERE id = ?').run(p.data.studentId)
    db.prepare('DELETE FROM sessions WHERE accountId = ?').run(p.data.studentId)
    saveClassState(p.data.classId, out.state)
  })()
  appendEvent({ actorId: me.id, classId: p.data.classId, type: 'deleteStudent', payload: { studentId: p.data.studentId }, ok: true })
  res.json({ ok: true, state: stateResponse(me, p.data.classId) })
})

app.post('/api/roster/reset-pin', (req, res) => {
  const p = z.object({ classId: z.string().max(40), studentId: z.string().max(40) }).safeParse(req.body)
  if (!p.success) {
    res.status(400).json({ error: '参数不合法' })
    return
  }
  const me = requireHomeroomOf(req, res, p.data.classId)
  if (!me) return
  const acc = accountById(p.data.studentId)
  if (!acc || acc.role !== 'student' || acc.classId !== p.data.classId) {
    res.status(404).json({ error: '学生不存在' })
    return
  }
  const pin = randomPin()
  db.prepare('UPDATE accounts SET credHash = ? WHERE id = ?').run(hashCredential(pin), acc.id)
  destroyAccountSessions(acc.id)
  appendEvent({ actorId: me.id, classId: p.data.classId, type: 'resetPin', payload: { studentId: acc.id }, ok: true })
  res.json({ ok: true, result: { pin } })
})

app.post('/api/roster/consent', (req, res) => {
  const p = z
    .object({ classId: z.string().max(40), studentId: z.string().max(40), method: z.enum(['paper', 'online', 'verbal']) })
    .safeParse(req.body)
  if (!p.success) {
    res.status(400).json({ error: '参数不合法' })
    return
  }
  const me = requireHomeroomOf(req, res, p.data.classId)
  if (!me) return
  const acc = accountById(p.data.studentId)
  if (!acc || acc.role !== 'student' || acc.classId !== p.data.classId) {
    res.status(404).json({ error: '学生不存在' })
    return
  }
  db.prepare('UPDATE accounts SET consentAt = ?, consentBy = ?, consentMethod = ? WHERE id = ?').run(
    new Date().toISOString(),
    me.id,
    p.data.method,
    acc.id,
  )
  appendEvent({ actorId: me.id, classId: p.data.classId, type: 'recordConsent', payload: { studentId: acc.id, method: p.data.method }, ok: true })
  res.json({ ok: true, state: stateResponse(me, p.data.classId) })
})

registerAdminRoutes(app)

/* ---------- 静态托管（生产：服务端直接伺服打包后的前端） ---------- */

const distDir = path.resolve(process.cwd(), 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

pruneSessions()
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[class-pet] server listening on http://0.0.0.0:${PORT}`)
})
