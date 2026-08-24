import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import type { AppState, Role, RuleConfig } from '../src/types'
import { DEFAULT_RULES } from '../src/types'
import { normalizeState } from '../src/engine'
import { localDateStr } from '../src/rules'

const DATA_DIR = process.env.CLASS_PET_DATA_DIR || path.resolve(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'school.db')
const BACKUP_DIR = path.join(DATA_DIR, 'backups')

fs.mkdirSync(DATA_DIR, { recursive: true })
fs.mkdirSync(BACKUP_DIR, { recursive: true })

export const db: Database.Database = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS classes(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS accounts(
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  studentNo TEXT,
  classId TEXT,
  classIds TEXT,
  username TEXT UNIQUE,
  credHash TEXT,
  consentAt TEXT,
  consentBy TEXT,
  consentMethod TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY,
  accountId TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  expiresAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS class_state(
  classId TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actorId TEXT NOT NULL,
  classId TEXT,
  type TEXT NOT NULL,
  payload TEXT,
  ok INTEGER NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_class_at ON events(classId, at);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(accountId);
`)

/* ---------- meta ---------- */

export function getMeta(key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setMeta(key: string, value: string) {
  db.prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

export function schoolName(): string {
  return getMeta('schoolName') ?? '未命名学校'
}

/* ---------- 激励规则（管理员维护，全校生效） ---------- */

export function getRules(): RuleConfig {
  const raw = getMeta('ruleConfig')
  if (!raw) return DEFAULT_RULES
  try {
    const saved = JSON.parse(raw) as Partial<RuleConfig>
    return {
      ...DEFAULT_RULES,
      ...saved,
      categoryPoints: { ...DEFAULT_RULES.categoryPoints, ...(saved.categoryPoints ?? {}) },
    }
  } catch {
    return DEFAULT_RULES
  }
}

export function setRules(cfg: RuleConfig) {
  setMeta('ruleConfig', JSON.stringify(cfg))
}

/* ---------- accounts ---------- */

export interface AccountRow {
  id: string
  role: Role
  name: string
  studentNo: string | null
  classId: string | null
  classIds: string | null
  username: string | null
  credHash: string | null
  consentAt: string | null
  consentBy: string | null
  consentMethod: string | null
  active: number
  createdAt: string
}

export function accountById(id: string): AccountRow | undefined {
  return db.prepare('SELECT * FROM accounts WHERE id = ? AND active = 1').get(id) as AccountRow | undefined
}

export function accountByUsername(username: string): AccountRow | undefined {
  return db.prepare('SELECT * FROM accounts WHERE username = ? AND active = 1').get(username) as AccountRow | undefined
}

export function studentAccounts(classId: string, name: string): AccountRow[] {
  return db
    .prepare("SELECT * FROM accounts WHERE role = 'student' AND classId = ? AND name = ? AND active = 1")
    .all(classId, name) as AccountRow[]
}

export function accountsCount(): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number }
  return row.n
}

export function classIdsOf(a: AccountRow): string[] {
  if (a.role === 'student') return a.classId ? [a.classId] : []
  if (a.classIds) {
    try {
      const arr = JSON.parse(a.classIds) as string[]
      if (Array.isArray(arr)) return arr
    } catch {
      /* fall through */
    }
  }
  return a.classId ? [a.classId] : []
}

/* ---------- classes & state ---------- */

export interface ClassRow {
  id: string
  name: string
}

export function allClasses(): ClassRow[] {
  return db.prepare('SELECT id, name FROM classes ORDER BY name').all() as ClassRow[]
}

export function classById(id: string): ClassRow | undefined {
  return db.prepare('SELECT id, name FROM classes WHERE id = ?').get(id) as ClassRow | undefined
}

export function saveClassState(classId: string, state: AppState) {
  // 激励规则单点存于 meta，不随每个班的状态重复落盘
  const { rules: _rules, ...rest } = state
  db.prepare(
    'INSERT INTO class_state(classId, json, updatedAt) VALUES (?, ?, ?) ON CONFLICT(classId) DO UPDATE SET json = excluded.json, updatedAt = excluded.updatedAt',
  ).run(classId, JSON.stringify(rest), new Date().toISOString())
}

/** 读取并规范化（超时入账/周结算/周期归档/宠物生命随时间演化）；注入当前激励规则。 */
export function loadClassState(classId: string): AppState | null {
  const row = db.prepare('SELECT json FROM class_state WHERE classId = ?').get(classId) as { json: string } | undefined
  if (!row) return null
  const raw = JSON.parse(row.json) as AppState
  return normalizeState({ ...raw, rules: getRules() })
}

/* ---------- events（追加式审计日志） ---------- */

export function appendEvent(args: {
  actorId: string
  classId: string | null
  type: string
  payload: unknown
  ok: boolean
  error?: string | null
}) {
  db.prepare('INSERT INTO events(at, actorId, classId, type, payload, ok, error) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    new Date().toISOString(),
    args.actorId,
    args.classId,
    args.type,
    args.payload == null ? null : JSON.stringify(args.payload),
    args.ok ? 1 : 0,
    args.error ?? null,
  )
}

/** 本周（周一起）有过成功操作的学生数：最基础的运营指标。 */
export function weekActiveStudents(classId: string, mondayIso: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT e.actorId) AS n
       FROM events e JOIN accounts a ON a.id = e.actorId
       WHERE e.classId = ? AND e.ok = 1 AND a.role = 'student' AND e.at >= ?`,
    )
    .get(classId, `${mondayIso}T00:00:00`) as { n: number }
  return row.n
}

/* ---------- 备份 ---------- */

let lastBackupDay = ''

/** 每天首次调用时把整库备份到 data/backups/school-YYYY-MM-DD.db（保留 30 份）。 */
export function maybeDailyBackup() {
  const today = localDateStr()
  if (lastBackupDay === today) return
  lastBackupDay = today
  const target = path.join(BACKUP_DIR, `school-${today}.db`)
  if (fs.existsSync(target)) return
  db.backup(target)
    .then(() => {
      const files = fs
        .readdirSync(BACKUP_DIR)
        .filter((f) => f.startsWith('school-') && f.endsWith('.db'))
        .sort()
      while (files.length > 30) {
        const oldest = files.shift()!
        fs.unlinkSync(path.join(BACKUP_DIR, oldest))
      }
    })
    .catch((e) => console.error('[backup] failed:', e))
}

export const paths = { DATA_DIR, DB_PATH, BACKUP_DIR }
