import type { AppState, BaseHabit, LedgerEntry, Pet, Report, RuleConfig, User } from './types'
import {
  AUDIT_MIN,
  categoryLabel,
  HONOR_STREAK_MAX,
  HONOR_WALL_MAX,
  rulesOf,
} from './types'

/** 本地时区的 yyyy-mm-dd（部署在校内服务器/东八区时，凌晨与清晨不再串日期） */
export function localDateStr(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function todayStr(state: AppState): string {
  return state.todayOverride ?? localDateStr()
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export function isWeekend(iso: string): boolean {
  const dow = new Date(iso + 'T12:00:00').getDay()
  return dow === 0 || dow === 6
}

export function dayEarn(state: AppState, studentId: string, date: string): number {
  return state.ledger
    .filter((l) => l.studentId === studentId && l.date === date && l.kind === 'earn' && !l.reason.startsWith('超时有效入账'))
    .reduce((s, l) => s + l.delta, 0)
}

export function daySpendAbs(state: AppState, studentId: string, date: string): number {
  return state.ledger
    .filter((l) => l.studentId === studentId && l.date === date && l.kind === 'spend')
    .reduce((s, l) => s + Math.abs(l.delta), 0)
}

export function balance(state: AppState, studentId: string): number {
  return state.ledger.filter((l) => l.studentId === studentId).reduce((s, l) => s + l.delta, 0)
}

export function canEarn(state: AppState, studentId: string, date: string, amount: number): boolean {
  return dayEarn(state, studentId, date) + amount <= rulesOf(state).dailyEarnCap
}

/** 每日消耗帽只管社交消耗（点心/共训），商城兑换与领养只看余额。 */
export function canSpend(state: AppState, studentId: string, date: string, amount: number): boolean {
  if (amount <= 0) return true
  if (balance(state, studentId) < amount) return false
  return daySpendAbs(state, studentId, date) + amount <= rulesOf(state).dailySpendCap
}

export function reportsToday(state: AppState, authorId: string, date: string): number {
  if (!authorId) return 0
  return state.reports.filter((r) => r.authorId === authorId && r.date === date && r.status !== 'rejected').length
}

export function reviewsToday(state: AppState, reviewerId: string, date: string): number {
  return state.reviews.filter((r) => r.reviewerId === reviewerId && r.date === date).length
}

export function canSubmit(state: AppState, authorId: string, date: string): boolean {
  return reportsToday(state, authorId, date) < rulesOf(state).dailyReportCap
}

export function canReview(state: AppState, reviewerId: string, date: string): boolean {
  return reviewsToday(state, reviewerId, date) < rulesOf(state).dailyReviewCap
}

export function reportClassId(state: AppState, r: Report): string | undefined {
  return state.users.find((u) => u.id === r.authorId)?.classId
}

/** 确定性种子随机：同一天抽样结果稳定，跨天变化。 */
function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededShuffle<T>(arr: T[], rnd: () => number): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * 抽查队列：存疑的必进；其余按「日期+班级」种子随机抽样，
 * 晚提交者与早提交者被抽中的概率一致，杜绝系统性逃检。
 */
export function auditQueue(state: AppState, classId?: string): Report[] {
  const pool = state.reports.filter((r) => {
    if (classId && reportClassId(state, r) !== classId) return false
    return r.status === 'queued' || (r.status === 'in_review' && r.peerDoubts > 0)
  })
  const doubted = pool.filter((r) => r.peerDoubts > 0)
  const clean = pool.filter((r) => r.peerDoubts === 0)
  const rnd = mulberry32(hashSeed(`${todayStr(state)}|${classId ?? 'all'}`))
  return [...doubted, ...seededShuffle(clean, rnd)].slice(0, rulesOf(state).auditMax)
}

export function ensureAuditSize(
  reports: Report[],
  users?: { id: string; classId?: string }[],
  auditMin: number = AUDIT_MIN,
): Report[] {
  const classIds = new Set<string>()
  const ownerClass = new Map<string, string | undefined>()
  for (const u of users ?? []) {
    ownerClass.set(u.id, u.classId)
    if (u.classId) classIds.add(u.classId)
  }
  if (!classIds.size) classIds.add('__all__')
  let next = reports
  for (const cid of classIds) {
    const inClass = (r: Report) => cid === '__all__' || ownerClass.get(r.authorId) === cid
    const queued = next.filter((r) => inClass(r) && r.status === 'queued')
    if (queued.length >= auditMin) continue
    const extra = next.filter((r) => inClass(r) && r.status === 'in_review' && !queued.includes(r))
    let need = auditMin - queued.length
    next = next.map((r) => {
      if (need > 0 && extra.includes(r)) {
        need -= 1
        return { ...r, status: 'queued' as const, queuedAt: r.queuedAt ?? r.submittedAt }
      }
      return r
    })
  }
  return next
}

export function autoCreditTimedOut(state: AppState): AppState {
  const today = todayStr(state)
  const ledger = [...state.ledger]
  const reports = state.reports.map((r) => {
    if (r.credited) return r
    if (r.status !== 'queued' && r.status !== 'in_review') return r
    if (r.peerDoubts > 0) return r
    const day = (r.queuedAt ?? r.submittedAt.slice(0, 10))
    if (day >= today) return r
    const pts = rulesOf(state).categoryPoints[r.category]
    const entry: LedgerEntry = {
      id: `auto-${r.id}`,
      studentId: r.authorId,
      date: day,
      delta: pts,
      kind: 'earn',
      reason: `超时有效入账 · ${categoryLabel(r.category)}`,
      ref: r.id,
      by: 'system',
      at: new Date(nowMs(state)).toISOString(),
    }
    ledger.push(entry)
    return { ...r, status: 'auto_posted' as const, credited: true }
  })
  return { ...state, reports, ledger }
}

export function honorWeekStreak(honors: { studentId: string; weekId: string }[], studentId: string): number {
  const weeks = [...new Set(honors.map((h) => h.weekId))].sort()
  let streak = 0
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (honors.some((h) => h.weekId === weeks[i] && h.studentId === studentId)) streak++
    else break
  }
  return streak
}

export function honorsInWeek(honors: { studentId: string; weekId: string }[], weekId: string): number {
  return honors.filter((h) => h.weekId === weekId).length
}

export function honorAllowed(
  honors: { studentId: string; weekId: string }[],
  studentId: string,
  weekId?: string,
  wallMax: number = HONOR_WALL_MAX,
  streakMax: number = HONOR_STREAK_MAX,
): boolean {
  if (weekId && honorsInWeek(honors, weekId) >= wallMax) return false
  if (!weekId && honors.length >= wallMax) return false
  return honorWeekStreak(honors, studentId) < streakMax
}

export function petOf(state: AppState, studentId: string): Pet | undefined {
  return state.pets.find((p) => p.ownerId === studentId)
}

export function userById(state: AppState, id: string): User | undefined {
  return state.users.find((u) => u.id === id)
}

export function studentsOfClass(state: AppState, classId: string): User[] {
  return state.users.filter((u) => u.role === 'student' && u.classId === classId)
}

export function weekRange(endIso: string, weeksBack = 0): { start: string; end: string; days: string[] } {
  const end = addDays(endIso, -7 * weeksBack)
  const start = addDays(end, -6)
  const days: string[] = []
  for (let i = 0; i < 7; i++) days.push(addDays(start, i))
  return { start, end, days }
}

function careDates(state: AppState, studentId: string): Set<string> {
  const dates = new Set<string>()
  const pet = petOf(state, studentId)
  if (pet?.lastCareDate) dates.add(pet.lastCareDate)
  if (pet?.lastCareGrowthDate) dates.add(pet.lastCareGrowthDate)
  if (pet?.lastCareAt) dates.add(pet.lastCareAt.slice(0, 10))
  for (const l of state.ledger) {
    if (l.studentId !== studentId || l.kind !== 'spend') continue
    if (l.reason.includes('抚摸') || l.reason.includes('喂食') || l.reason.includes('照料')) {
      dates.add(l.date)
    }
  }
  return dates
}

export function careStreak(state: AppState, studentId: string): number {
  const dates = careDates(state, studentId)
  const today = todayStr(state)
  let n = 0
  let d = today
  // if today has no care, start from yesterday so streak still shows
  if (!dates.has(d)) d = addDays(d, -1)
  while (dates.has(d)) {
    n += 1
    d = addDays(d, -1)
  }
  return n
}

export function careDaysIn(state: AppState, studentId: string, days: string[]): number {
  const dates = careDates(state, studentId)
  return days.filter((d) => dates.has(d)).length
}

export function progressPoints(state: AppState, studentId: string, days: string[]): number {
  const set = new Set(days)
  return state.ledger
    .filter((l) => l.studentId === studentId && l.kind === 'earn' && set.has(l.date))
    .reduce((s, l) => s + l.delta, 0)
}

export function reportsIn(state: AppState, studentId: string, days: string[], category?: Report['category']): Report[] {
  const set = new Set(days)
  return state.reports.filter(
    (r) => r.authorId === studentId && set.has(r.date) && (category ? r.category === category : true),
  )
}

export function weekIdFromDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

export function weekIdOf(state: AppState): string {
  return weekIdFromDate(todayStr(state))
}

/** 该 ISO 周的周一日期 */
export function mondayOfWeekId(weekId: string): string {
  const [y, w] = weekId.split('-W')
  const jan4 = new Date(Date.UTC(Number(y), 0, 4))
  const dow = jan4.getUTCDay() || 7
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - (dow - 1) + (Number(w) - 1) * 7)
  return monday.toISOString().slice(0, 10)
}

/** 该 ISO 周的全部工作日（周一至周五，含未来） */
export function schoolDaysOfWeekId(weekId: string): string[] {
  const monday = mondayOfWeekId(weekId)
  return Array.from({ length: 5 }, (_, i) => addDays(monday, i))
}

/** ISO 周内截至今天的工作日（周一至周五） */
export function weekSchoolDaysSoFar(state: AppState): string[] {
  const today = todayStr(state)
  const days = schoolDaysOfWeekId(weekIdFromDate(today)).filter((d) => d <= today)
  return days.length ? days : [today]
}

/**
 * 班级基础达标进度（%）。
 * 分母 = 全周 5 个工作日：已过天数按「名册 − 当日豁免」计，未来天数按整名册计。
 * 豁免（病假等）不进分母；「未完成」留在分母但不进分子——个体永不被公示。
 * 周一全员达标 ≈ 20%，杜绝「周一点一次即 100%、当天发完集体奖励」。
 */
export function classBaseProgress(
  habits: BaseHabit[],
  rosterIds: string[],
  weekId: string,
  weekDays: string[],
  today: string,
): number {
  if (!rosterIds.length || !weekDays.length) return 0
  const roster = new Set(rosterIds)
  let denom = 0
  let num = 0
  for (const d of weekDays) {
    if (d > today) {
      denom += rosterIds.length
      continue
    }
    const dayHabits = habits.filter((h) => h.weekId === weekId && h.date === d && roster.has(h.studentId))
    const exempt = dayHabits.filter((h) => h.status === 'exempt').length
    denom += Math.max(0, rosterIds.length - exempt)
    num += dayHabits.filter((h) => h.status === 'done').length
  }
  if (!denom) return 0
  return Math.min(100, Math.round((num / denom) * 100))
}

export function baseDoneDays(state: AppState, studentId: string, days: string[]): number {
  const set = new Set(days)
  return (state.baseHabits ?? []).filter((h) => h.studentId === studentId && set.has(h.date) && h.status === 'done').length
}

export function squadTier(
  points: number,
  t?: Pick<RuleConfig, 'squadBronze' | 'squadSilver' | 'squadGold'>,
): 'gold' | 'silver' | 'bronze' | null {
  const gold = t?.squadGold ?? 10
  const silver = t?.squadSilver ?? 6
  const bronze = t?.squadBronze ?? 3
  if (points >= gold) return 'gold'
  if (points >= silver) return 'silver'
  if (points >= bronze) return 'bronze'
  return null
}

export const ACHIEVEMENTS = [
  { id: 'streak_mount', title: '三日照料', itemId: 'mount_deskpad_01', desc: '连续照料 3 天解锁课桌垫坐骑' },
  { id: 'weekly_gold', title: '周赛金档', itemId: 'skin_rare_week', desc: '小队周赛金档解锁周赛银辉（不可购买）' },
  { id: 'learn_loop', title: '学习闭环', itemId: 'skin_rare_achieve', desc: '近 7 日作业质量、订正错题、自己测一次各至少一条' },
]

export function studentHasGold(state: AppState, studentId: string): boolean {
  const cfg = rulesOf(state)
  return state.squadWeeks.some((sw) => {
    if (sw.honor !== 'gold' && squadTier(sw.points, cfg) !== 'gold') return false
    const team = state.squads.find((s) => s.id === sw.teamId)
    return !!team?.memberIds.includes(studentId)
  })
}

export function isPostedReport(status: Report['status']): boolean {
  return status === 'posted' || status === 'auto_posted'
}

export function hasLearnLoop(state: AppState, studentId: string): boolean {
  const today = todayStr(state)
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i))
  const cats = new Set(
    reportsIn(state, studentId, days)
      .filter((r) => isPostedReport(r.status))
      .map((r) => r.category),
  )
  return cats.has('quality') && cats.has('correction') && cats.has('quiz_self')
}

/**
 * 错题重测调度（通往成绩的桥）：
 * 订正申报入账 3 天后，提示学生「再测一遍」，直到出现引用它的重测申报。
 */
export function retestsDue(state: AppState, studentId: string): Report[] {
  const today = todayStr(state)
  const delay = rulesOf(state).retestDelayDays
  return state.reports.filter(
    (r) =>
      r.authorId === studentId &&
      r.category === 'correction' &&
      isPostedReport(r.status) &&
      addDays(r.date, delay) <= today &&
      !state.reports.some((x) => x.authorId === studentId && x.retestOf === r.id),
  )
}

export type GrowthStage = '幼' | '少' | '成'

/** 成长阶段重平衡：绑定「完整周期」节奏，约一学期走完，而非 6 天到顶。 */
export function growthStage(growth: number): GrowthStage {
  if (growth < 40) return '幼'
  if (growth < 110) return '少'
  return '成'
}

export function nowMs(state: AppState): number {
  return state.now ?? Date.now()
}

/** 两个时刻之间落在工作日（周一至周五）内的小时数；周末不计。 */
export function schoolHoursBetween(fromMs: number, toMs: number): number {
  if (toMs <= fromMs) return 0
  let total = 0
  let cursor = fromMs
  while (cursor < toMs) {
    const day = new Date(cursor)
    const dayEnd = new Date(day)
    dayEnd.setHours(24, 0, 0, 0)
    const sliceEnd = Math.min(dayEnd.getTime(), toMs)
    const dow = day.getDay()
    if (dow !== 0 && dow !== 6) total += (sliceEnd - cursor) / 3600000
    cursor = sliceEnd
  }
  return total
}

export function hoursSinceCare(pet: Pet, state: AppState): number {
  const stamp = pet.lastCareAt || (pet.lastCareDate ? `${pet.lastCareDate}T12:00:00` : null)
  if (!stamp) return 18
  return Math.max(0, schoolHoursBetween(new Date(stamp).getTime(), nowMs(state)))
}

/** 「想念值」：只在工作日累积（周末假期暂停，不做愧疚设计）；照料清零。 */
export function liveHunger(pet: Pet, state: AppState): number {
  return Math.min(100, Math.round(hoursSinceCare(pet, state) * 5))
}

export function lifeExpression(pet: Pet, state: AppState): Pet['expression'] {
  const hunger = liveHunger(pet, state)
  if (hunger >= 16) return 'missSoft'
  if (pet.mood >= 72) return 'happy'
  if (pet.mood < 36) return 'calm'
  return pet.expression === 'cheer' || pet.expression === 'happy' || pet.expression === 'shy'
    ? pet.expression
    : 'idle'
}

export function petMissCopy(pet: Pet, state: AppState): string | null {
  if (isWeekend(todayStr(state))) return null
  return liveHunger(pet, state) >= 16 ? '有点想你' : null
}

export function withPetLife(pet: Pet, state: AppState): Pet {
  const hunger = liveHunger(pet, state)
  return { ...pet, hunger, expression: lifeExpression(pet, state) }
}

export function earnedAchievements(state: AppState, studentId: string): string[] {
  const out: string[] = []
  if (careStreak(state, studentId) >= 3) out.push('streak_mount')
  if (studentHasGold(state, studentId)) out.push('weekly_gold')
  if (hasLearnLoop(state, studentId)) out.push('learn_loop')
  return out
}

export function isClassHourLocked(state: AppState, studentId: string): boolean {
  const u = userById(state, studentId)
  if (!u?.classId) return false
  return !!state.inClassHour?.[u.classId]
}

/** 今日连续报「雨」的天数（含今日）。仅教师端关怀清单使用。 */
export function rainStreak(state: AppState, studentId: string): number {
  let n = 0
  let d = todayStr(state)
  while ((state.dailyMoods ?? []).some((m) => m.studentId === studentId && m.date === d && m.mood === 'rain')) {
    n += 1
    d = addDays(d, -1)
  }
  return n
}

/** 教师关怀清单：今天报雨的学生，按连续天数降序。绝不进公屏。 */
export function moodCareList(state: AppState, classId: string): { student: User; streak: number }[] {
  return studentsOfClass(state, classId)
    .map((u) => ({ student: u, streak: rainStreak(state, u.id) }))
    .filter((x) => x.streak > 0)
    .sort((a, b) => b.streak - a.streak)
}
