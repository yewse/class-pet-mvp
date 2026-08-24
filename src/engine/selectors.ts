import type { AppState, BaseHabit, ClassOkr, KrTick, MoodId, OkrRecord, PersonalOkr, Pet } from '../types'
import { DEFAULT_CLASS_PERK, DEFAULT_KR_TARGET, rulesOf } from '../types'
import { classBaseProgress, schoolDaysOfWeekId, todayStr, weekIdOf } from '../rules'

/** 本份状态对应的班级 id（每个班一份独立状态） */
export function classIdOf(s: AppState): string {
  return s.classes[0]?.id ?? 'c1'
}

export function rosterIdsOf(s: AppState): string[] {
  return s.users.filter((u) => u.role === 'student').map((u) => u.id)
}

export function petDisplayName(p: Pet): string {
  return (p.name || p.nickname || '').trim()
}

export function validatePetName(raw: string): string | null {
  const n = raw.trim()
  if (!n) return '请填写宠物名'
  if (!/^[一-鿿A-Za-z0-9]{2,8}$/.test(n)) return '宠物名为 2–8 个汉字、字母或数字'
  return null
}

export function validateMotto(raw: string): string | null {
  const n = raw.trim()
  if (!n) return '请填写个性签名'
  if (n.length > 20) return '个性签名最多 20 字'
  return null
}

export function emptyPersonalOkr(weekId: string, objective = '', krTarget: number = DEFAULT_KR_TARGET): PersonalOkr {
  return { weekId, objective, krTarget, krDone: 0, lastTickDate: null, selfScore: null, retro: '' }
}

export function personalOkrOf(s: AppState, studentId: string): PersonalOkr {
  const week = weekIdOf(s)
  const defTarget = rulesOf(s).defaultKrTarget
  const raw = s.personalOkrs?.[studentId]
  if (!raw) return emptyPersonalOkr(week, '', defTarget)
  if (raw.weekId !== week) return { ...emptyPersonalOkr(week, '', defTarget), objective: raw.objective }
  return {
    weekId: week,
    objective: raw.objective ?? '',
    krTarget: Math.max(1, raw.krTarget || defTarget),
    krDone: Math.max(0, raw.krDone ?? 0),
    lastTickDate: raw.lastTickDate ?? null,
    selfScore: raw.selfScore ?? null,
    retro: raw.retro ?? '',
  }
}

export function classOkrOf(s: AppState): ClassOkr {
  const week = weekIdOf(s)
  const raw = s.classOkr
  if (!raw || raw.weekId !== week) {
    return { weekId: week, objective: raw?.objective || '作业准时率' }
  }
  return {
    weekId: week,
    objective: raw.objective || '作业准时率',
    perkText: raw.perkText,
    perkGranted: !!raw.perkGranted,
    retro: raw.retro,
  }
}

export function classPerkOf(s: AppState): { text: string; granted: boolean } | null {
  const o = classOkrOf(s)
  if (!o.perkGranted) return null
  return { text: (o.perkText || DEFAULT_CLASS_PERK).trim(), granted: true }
}

export function todayBaseOf(s: AppState, studentId: string): BaseHabit | undefined {
  const today = todayStr(s)
  return (s.baseHabits ?? []).find((h) => h.studentId === studentId && h.date === today)
}

/**
 * 班级周进度：全周分母 + 豁免剔除。
 * 学生视图收不到他人习惯明细，优先用服务端算好的 derived.classPct。
 */
export function classOkrProgress(s: AppState & { derived?: { classPct?: number } }): number {
  if (s.derived?.classPct != null) return s.derived.classPct
  const week = weekIdOf(s)
  return classBaseProgress(s.baseHabits ?? [], rosterIdsOf(s), week, schoolDaysOfWeekId(week), todayStr(s))
}

export function pendingTicksOf(s: AppState, studentId?: string): KrTick[] {
  const week = weekIdOf(s)
  return (s.krTicks ?? []).filter(
    (k) => k.weekId === week && k.status === 'pending' && (!studentId || k.studentId === studentId),
  )
}

export function stalePendingTicks(s: AppState, studentId?: string): KrTick[] {
  const week = weekIdOf(s)
  return (s.krTicks ?? []).filter(
    (k) => k.weekId < week && k.status === 'pending' && (!studentId || k.studentId === studentId),
  )
}

export function moodOf(s: AppState, studentId: string): MoodId | null {
  const today = todayStr(s)
  return (s.dailyMoods ?? []).find((m) => m.studentId === studentId && m.date === today)?.mood ?? null
}

export function classMoodMix(s: AppState): Record<MoodId, number> {
  const today = todayStr(s)
  const mix: Record<MoodId, number> = { sun: 0, overcast: 0, rain: 0 }
  for (const m of s.dailyMoods ?? []) {
    if (m.date === today) mix[m.mood] += 1
  }
  return mix
}

export function okrHistoryOf(s: AppState, studentId: string): OkrRecord[] {
  return (s.okrHistory ?? [])
    .filter((r) => r.studentId === studentId)
    .sort((a, b) => (a.weekId < b.weekId ? 1 : -1))
}

export type ReviewCandidate = { weekId: string; kind: 'current' | 'past' }

/** 当前可做的复盘：周五起做本周；否则补最近一条未复盘的归档周。 */
export function reviewCandidate(s: AppState, studentId: string): ReviewCandidate | null {
  const week = weekIdOf(s)
  const d = new Date(todayStr(s) + 'T12:00:00Z')
  const dayNum = d.getUTCDay() || 7
  const cur = personalOkrOf(s, studentId)
  if (dayNum >= 5 && cur.selfScore == null) return { weekId: week, kind: 'current' }
  const latest = okrHistoryOf(s, studentId)[0]
  if (latest && latest.selfScore == null) return { weekId: latest.weekId, kind: 'past' }
  return null
}
