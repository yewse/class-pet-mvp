/** 管理员 API：维护教师账号、班级与激励规则。管理员看不到任何学生过程数据（最小权限）。 */
import crypto from 'node:crypto'
import type { Express, Request, Response } from 'express'
import { z } from 'zod'
import type { AppState } from '../src/types'
import { DEFAULT_RULES } from '../src/types'
import {
  allClasses,
  appendEvent,
  db,
  getRules,
  saveClassState,
  schoolName,
  setMeta,
  setRules,
  type AccountRow,
} from './db'
import { destroyAccountSessions, hashCredential, sessionAccount, validatePassword } from './auth'
import { emptyClassState } from './blank'

function requireAdmin(req: Request, res: Response): AccountRow | null {
  const me = sessionAccount(req)
  if (!me || me.role !== 'admin') {
    res.status(me ? 403 : 401).json({ error: me ? '仅管理员可操作' : '未登录' })
    return null
  }
  return me
}

function loadRawState(classId: string): AppState | null {
  const row = db.prepare('SELECT json FROM class_state WHERE classId = ?').get(classId) as { json: string } | undefined
  return row ? (JSON.parse(row.json) as AppState) : null
}

/** 把教师写进班级状态的 users（保留历史条目，权限以账号表 classIds 为准）。 */
function ensureTeacherInClasses(teacher: { id: string; name: string; role: 'homeroom' | 'subject' }, classIds: string[]) {
  for (const cid of classIds) {
    const s = loadRawState(cid)
    if (!s) continue
    if (!s.users.some((u) => u.id === teacher.id)) {
      saveClassState(cid, {
        ...s,
        users: [
          ...s.users,
          { id: teacher.id, name: teacher.name, role: teacher.role, code: teacher.role, classId: cid, classIds, dnd: false },
        ],
      })
    }
  }
}

function teacherList() {
  return (
    db
      .prepare("SELECT id, name, username, role, classId, classIds, active FROM accounts WHERE role IN ('homeroom','subject') ORDER BY createdAt")
      .all() as { id: string; name: string; username: string; role: 'homeroom' | 'subject'; classId: string | null; classIds: string | null; active: number }[]
  ).map((t) => ({
    id: t.id,
    name: t.name,
    username: t.username,
    role: t.role,
    classIds: t.classIds ? (JSON.parse(t.classIds) as string[]) : t.classId ? [t.classId] : [],
    active: !!t.active,
  }))
}

const pointSchema = z.number().int().min(0).max(5)

const rulesSchema = z
  .object({
    categoryPoints: z.object({
      quality: pointSchema,
      correction: pointSchema,
      quiz_self: pointSchema,
      participation: pointSchema,
    }),
    dailyEarnCap: z.number().int().min(2).max(30),
    dailySpendCap: z.number().int().min(0).max(30),
    dailyReportCap: z.number().int().min(1).max(10),
    dailyReviewCap: z.number().int().min(1).max(10),
    auditMin: z.number().int().min(1).max(20),
    auditMax: z.number().int().min(1).max(30),
    honorWallMax: z.number().int().min(1).max(20),
    honorStreakMax: z.number().int().min(1).max(10),
    squadBronze: z.number().int().min(1).max(100),
    squadSilver: z.number().int().min(1).max(100),
    squadGold: z.number().int().min(1).max(100),
    squadComboBonus: z.number().int().min(0).max(10),
    squadWeeklyCap: z.number().int().min(5).max(100),
    growthCare: z.number().int().min(0).max(50),
    growthTick: z.number().int().min(0).max(50),
    growthRetro: z.number().int().min(0).max(50),
    perkThresholdPct: z.number().int().min(50).max(100),
    retestDelayDays: z.number().int().min(1).max(14),
    defaultKrTarget: z.number().int().min(1).max(12),
    evidenceMinLen: z.number().int().min(0).max(20),
  })
  .refine((r) => r.auditMin <= r.auditMax, { message: '抽查下限不能大于上限' })
  .refine((r) => r.squadBronze < r.squadSilver && r.squadSilver < r.squadGold, {
    message: '小队档位需满足 铜 < 银 < 金',
  })

export function registerAdminRoutes(app: Express) {
  app.get('/api/admin/overview', (req, res) => {
    const me = requireAdmin(req, res)
    if (!me) return
    res.json({
      schoolName: schoolName(),
      classes: allClasses(),
      teachers: teacherList(),
      rules: getRules(),
      defaults: DEFAULT_RULES,
    })
  })

  app.post('/api/admin/add-class', (req, res) => {
    const me = requireAdmin(req, res)
    if (!me) return
    const p = z.object({ name: z.string().min(2).max(20) }).safeParse(req.body)
    if (!p.success) {
      res.status(400).json({ error: '班级名 2–20 字' })
      return
    }
    if (allClasses().some((c) => c.name === p.data.name.trim())) {
      res.status(400).json({ error: '班级名已存在' })
      return
    }
    const id = `c-${crypto.randomBytes(4).toString('hex')}`
    db.transaction(() => {
      db.prepare('INSERT INTO classes(id, name, createdAt) VALUES (?, ?, ?)').run(id, p.data.name.trim(), new Date().toISOString())
      saveClassState(id, emptyClassState(id, p.data.name.trim(), []))
    })()
    appendEvent({ actorId: me.id, classId: id, type: 'adminAddClass', payload: { name: p.data.name }, ok: true })
    res.json({ ok: true, result: { id } })
  })

  app.post('/api/admin/add-teacher', (req, res) => {
    const me = requireAdmin(req, res)
    if (!me) return
    const p = z
      .object({
        name: z.string().min(2).max(20),
        username: z.string().min(3).max(30).regex(/^[A-Za-z0-9_.-]+$/, '用户名只能是字母数字._-'),
        password: z.string().max(72),
        role: z.enum(['homeroom', 'subject']),
        classIds: z.array(z.string().max(40)).min(1).max(20),
      })
      .safeParse(req.body)
    if (!p.success) {
      res.status(400).json({ error: p.success === false ? p.error.issues[0]?.message ?? '参数不合法' : '参数不合法' })
      return
    }
    const pwErr = validatePassword(p.data.password)
    if (pwErr) {
      res.status(400).json({ error: pwErr })
      return
    }
    const classes = allClasses()
    for (const cid of p.data.classIds) {
      if (!classes.some((c) => c.id === cid)) {
        res.status(400).json({ error: `班级不存在：${cid}` })
        return
      }
    }
    if (db.prepare('SELECT 1 FROM accounts WHERE username = ?').get(p.data.username)) {
      res.status(400).json({ error: '用户名已存在' })
      return
    }
    const id = `t-${crypto.randomBytes(4).toString('hex')}`
    db.transaction(() => {
      db.prepare(
        'INSERT INTO accounts(id, role, name, classId, classIds, username, credHash, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)',
      ).run(
        id,
        p.data.role,
        p.data.name.trim(),
        p.data.classIds[0],
        JSON.stringify(p.data.classIds),
        p.data.username.trim(),
        hashCredential(p.data.password),
        new Date().toISOString(),
      )
      ensureTeacherInClasses({ id, name: p.data.name.trim(), role: p.data.role }, p.data.classIds)
    })()
    appendEvent({ actorId: me.id, classId: null, type: 'adminAddTeacher', payload: { id, username: p.data.username, role: p.data.role, classIds: p.data.classIds }, ok: true })
    res.json({ ok: true, result: { id } })
  })

  app.post('/api/admin/set-teacher-classes', (req, res) => {
    const me = requireAdmin(req, res)
    if (!me) return
    const p = z
      .object({ teacherId: z.string().max(40), classIds: z.array(z.string().max(40)).min(1).max(20) })
      .safeParse(req.body)
    if (!p.success) {
      res.status(400).json({ error: '参数不合法' })
      return
    }
    const t = db.prepare("SELECT * FROM accounts WHERE id = ? AND role IN ('homeroom','subject')").get(p.data.teacherId) as AccountRow | undefined
    if (!t) {
      res.status(404).json({ error: '教师不存在' })
      return
    }
    const classes = allClasses()
    for (const cid of p.data.classIds) {
      if (!classes.some((c) => c.id === cid)) {
        res.status(400).json({ error: `班级不存在：${cid}` })
        return
      }
    }
    db.transaction(() => {
      db.prepare('UPDATE accounts SET classId = ?, classIds = ? WHERE id = ?').run(p.data.classIds[0], JSON.stringify(p.data.classIds), t.id)
      ensureTeacherInClasses({ id: t.id, name: t.name, role: t.role as 'homeroom' | 'subject' }, p.data.classIds)
    })()
    appendEvent({ actorId: me.id, classId: null, type: 'adminSetTeacherClasses', payload: p.data, ok: true })
    res.json({ ok: true })
  })

  app.post('/api/admin/reset-teacher-password', (req, res) => {
    const me = requireAdmin(req, res)
    if (!me) return
    const p = z.object({ teacherId: z.string().max(40), password: z.string().max(72) }).safeParse(req.body)
    if (!p.success) {
      res.status(400).json({ error: '参数不合法' })
      return
    }
    const pwErr = validatePassword(p.data.password)
    if (pwErr) {
      res.status(400).json({ error: pwErr })
      return
    }
    const t = db.prepare("SELECT * FROM accounts WHERE id = ? AND role IN ('homeroom','subject')").get(p.data.teacherId) as AccountRow | undefined
    if (!t) {
      res.status(404).json({ error: '教师不存在' })
      return
    }
    db.prepare('UPDATE accounts SET credHash = ? WHERE id = ?').run(hashCredential(p.data.password), t.id)
    destroyAccountSessions(t.id)
    appendEvent({ actorId: me.id, classId: null, type: 'adminResetTeacherPassword', payload: { teacherId: t.id }, ok: true })
    res.json({ ok: true })
  })

  app.post('/api/admin/set-teacher-active', (req, res) => {
    const me = requireAdmin(req, res)
    if (!me) return
    const p = z.object({ teacherId: z.string().max(40), active: z.boolean() }).safeParse(req.body)
    if (!p.success) {
      res.status(400).json({ error: '参数不合法' })
      return
    }
    const t = db.prepare("SELECT * FROM accounts WHERE id = ? AND role IN ('homeroom','subject')").get(p.data.teacherId) as AccountRow | undefined
    if (!t) {
      res.status(404).json({ error: '教师不存在' })
      return
    }
    db.prepare('UPDATE accounts SET active = ? WHERE id = ?').run(p.data.active ? 1 : 0, t.id)
    if (!p.data.active) destroyAccountSessions(t.id)
    appendEvent({ actorId: me.id, classId: null, type: 'adminSetTeacherActive', payload: p.data, ok: true })
    res.json({ ok: true })
  })

  app.post('/api/admin/rules', (req, res) => {
    const me = requireAdmin(req, res)
    if (!me) return
    const p = rulesSchema.safeParse(req.body?.rules)
    if (!p.success) {
      res.status(400).json({ error: p.error.issues[0]?.message ?? '规则参数不合法' })
      return
    }
    setRules(p.data)
    appendEvent({ actorId: me.id, classId: null, type: 'adminUpdateRules', payload: p.data, ok: true })
    res.json({ ok: true, result: { rules: getRules() } })
  })

  app.post('/api/admin/delete-teacher', (req, res) => {
    const me = requireAdmin(req, res)
    if (!me) return
    const p = z.object({ teacherId: z.string().max(40) }).safeParse(req.body)
    if (!p.success) {
      res.status(400).json({ error: '参数不合法' })
      return
    }
    const t = db.prepare("SELECT * FROM accounts WHERE id = ? AND role IN ('homeroom','subject')").get(p.data.teacherId) as AccountRow | undefined
    if (!t) {
      res.status(404).json({ error: '教师不存在' })
      return
    }
    db.transaction(() => {
      db.prepare('DELETE FROM accounts WHERE id = ?').run(t.id)
      destroyAccountSessions(t.id)
      const classIds = t.classIds ? (JSON.parse(t.classIds) as string[]) : t.classId ? [t.classId] : []
      for (const cid of classIds) {
        const s = loadRawState(cid)
        if (!s) continue
        const updatedUsers = s.users.filter((u) => u.id !== t.id)
        saveClassState(cid, { ...s, users: updatedUsers })
      }
    })()
    appendEvent({ actorId: me.id, classId: null, type: 'adminDeleteTeacher', payload: { teacherId: t.id }, ok: true })
    res.json({ ok: true })
  })

  app.post('/api/admin/school-name', (req, res) => {
    const me = requireAdmin(req, res)
    if (!me) return
    const p = z.object({ name: z.string().min(2).max(30) }).safeParse(req.body)
    if (!p.success) {
      res.status(400).json({ error: '校名 2–30 字' })
      return
    }
    setMeta('schoolName', p.data.name.trim())
    appendEvent({ actorId: me.id, classId: null, type: 'adminRenameSchool', payload: p.data, ok: true })
    res.json({ ok: true })
  })
}
