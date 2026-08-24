import type { AppState, LedgerEntry, Pet, Report, User } from './types'
import {
  AUDIT_MAX,
  AUDIT_MIN,
  categoryLabel,
  CATEGORY_POINTS,
  DAILY_EARN_CAP,
  DAILY_REPORT_CAP,
  DAILY_REVIEW_CAP,
  DAILY_SPEND_CAP,
  HONOR_STREAK_MAX,
  HONOR_WALL_MAX,
} from './types'

export function todayStr(state: AppState): string {
  return state.todayOverride ?? new Date().toISOString().slice(0, 10)
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
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
  return dayEarn(state, studentId, date) + amount <= DAILY_EARN_CAP
}

export function canSpend(state: AppState, studentId: string, date: string, amount: number): boolean {
  if (amount <= 0) return true
  if (balance(state, studentId) < amount) return false
  return daySpendAbs(state, studentId, date) + amount <= DAILY_SPEND_CAP
}

export function reportsToday(state: AppState, authorId: string, date: string): number {
  if (!authorId) return 0
  return state.reports.filter((r) => r.authorId === authorId && r.date === date && r.status !== 'rejected').length
}

export function reviewsToday(state: AppState, reviewerId: string, date: string): number {
  return state.reviews.filter((r) => r.reviewerId === reviewerId && r.date === date).length
}

export function canSubmit(state: AppState, authorId: string, date: string): boolean {
  return reportsToday(state, authorId, date) < DAILY_REPORT_CAP
}

export function canReview(state: AppState, reviewerId: string, date: string): boolean {
  return reviewsToday(state, reviewerId, date) < DAILY_REVIEW_CAP
}

export function reportClassId(state: AppState, r: Report): string | undefined {
  return state.users.find((u) => u.id === r.authorId)?.classId
}

export function auditQueue(state: AppState, classId?: string): Report[] {
  const queued = state.reports.filter((r) => {
    if (classId && reportClassId(state, r) !== classId) return false
    return r.status === 'queued' || (r.status === 'in_review' && r.peerDoubts > 0)
  })
  return queued.slice(0, AUDIT_MAX)
}

export function ensureAuditSize(reports: Report[], users?: { id: string; classId?: string }[]): Report[] {
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
    if (queued.length >= AUDIT_MIN) continue
    const extra = next.filter((r) => inClass(r) && r.status === 'in_review' && !queued.includes(r))
    let need = AUDIT_MIN - queued.length
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
  let ledger = [...state.ledger]
  const reports = state.reports.map((r) => {
    if (r.credited) return r
    if (r.status !== 'queued' && r.status !== 'in_review') return r
    if (r.peerDoubts > 0) return r
    const day = (r.queuedAt ?? r.submittedAt.slice(0, 10))
    if (day >= today) return r
    const pts = CATEGORY_POINTS[r.category]
    const entry: LedgerEntry = {
      id: `auto-${r.id}`,
      studentId: r.authorId,
      date: day,
      delta: pts,
      kind: 'earn',
      reason: `超时有效入账 · ${categoryLabel(r.category)}`,
      ref: r.id,
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
): boolean {
  if (weekId && honorsInWeek(honors, weekId) >= HONOR_WALL_MAX) return false
  if (!weekId && honors.length >= HONOR_WALL_MAX) return false
  return honorWeekStreak(honors, studentId) < HONOR_STREAK_MAX
}

export function petOf(state: AppState, studentId: string): Pet | undefined {
  return state.pets.find((p) => p.ownerId === studentId)
}

export function userById(state: AppState, id: string): User | undefined {
  return state.users.find((u) => u.id === id)
}

export function classIdOf(user: User | undefined): string | undefined {
  return user?.classId
}

export function studentsOfClass(state: AppState, classId: string): User[] {
  return state.users.filter((u) => u.role === 'student' && u.classId === classId)
}

export function allStudents(state: AppState): User[] {
  return state.users.filter((u) => u.role === 'student')
}

export function sameClass(a: User | undefined, b: User | undefined): boolean {
  return !!a?.classId && a.classId === b?.classId
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

export function habitRate(state: AppState, classId: string, days: string[]): number {
  const students = studentsOfClass(state, classId)
  if (!students.length || !days.length) return 0
  const total = students.length * days.length
  const done = students.reduce((s, u) => s + careDaysIn(state, u.id, days), 0)
  return Math.round((done / total) * 100)
}

export function progressPoints(state: AppState, studentId: string, days: string[]): number {
  const set = new Set(days)
  return state.ledger
    .filter((l) => l.studentId === studentId && l.kind === 'earn' && set.has(l.date))
    .reduce((s, l) => s + l.delta, 0)
}

export function classProgressPoints(state: AppState, classId: string, days: string[]): number {
  return studentsOfClass(state, classId).reduce((s, u) => s + progressPoints(state, u.id, days), 0)
}

export function reportsIn(state: AppState, studentId: string, days: string[], category?: Report['category']): Report[] {
  const set = new Set(days)
  return state.reports.filter(
    (r) => r.authorId === studentId && set.has(r.date) && (category ? r.category === category : true),
  )
}

export type StudentEffect = {
  studentId: string
  name: string
  classId: string
  className: string
  streak: number
  careDays: number
  qualityCount: number
  quizThis: number
  quizPrev: number
  quizDelta: number
  progress: number
}

export function schoolEffects(state: AppState): StudentEffect[] {
  const today = todayStr(state)
  const thisW = weekRange(today, 0)
  const prevW = weekRange(today, 1)
  return allStudents(state).map((u) => {
    const quizThis = reportsIn(state, u.id, thisW.days, 'quiz_self').length
    const quizPrev = reportsIn(state, u.id, prevW.days, 'quiz_self').length
    const cls = state.classes?.find((c) => c.id === u.classId)
    return {
      studentId: u.id,
      name: u.name,
      classId: u.classId ?? '',
      className: cls?.name ?? state.className,
      streak: careStreak(state, u.id),
      careDays: careDaysIn(state, u.id, thisW.days),
      qualityCount: reportsIn(state, u.id, thisW.days, 'quality').length,
      quizThis,
      quizPrev,
      quizDelta: quizThis - quizPrev,
      progress: progressPoints(state, u.id, thisW.days),
    }
  })
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

/** ISO 周内截至今天的工作日（周一至周五） */
export function weekSchoolDaysSoFar(state: AppState): string[] {
  const today = todayStr(state)
  const d = new Date(today + 'T12:00:00Z')
  const dayNum = d.getUTCDay() || 7
  const monday = addDays(today, 1 - dayNum)
  const days: string[] = []
  for (let i = 0; i < 5; i++) {
    const day = addDays(monday, i)
    if (day > today) break
    days.push(day)
  }
  return days.length ? days : [today]
}

export function squadTier(points: number): 'gold' | 'silver' | 'bronze' | null {
  if (points >= 10) return 'gold'
  if (points >= 6) return 'silver'
  if (points >= 3) return 'bronze'
  return null
}

export const ACHIEVEMENTS = [
  { id: 'streak_mount', title: '三日照料', itemId: 'mount_deskpad_01', desc: '连续照料 3 天解锁课桌垫坐骑' },
  { id: 'weekly_gold', title: '周赛金档', itemId: 'skin_rare_week', desc: '小队周赛金档解锁周赛银辉（不可购买）' },
  { id: 'learn_loop', title: '学习闭环', itemId: 'skin_rare_achieve', desc: '近 7 日作业质量、订正闭环、自测对照各至少一条' },
]

export function studentHasGold(state: AppState, studentId: string): boolean {
  return state.squadWeeks.some((sw) => {
    if (sw.honor !== 'gold' && squadTier(sw.points) !== 'gold') return false
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

export type GrowthStage = '幼' | '少' | '成'

export function growthStage(growth: number): GrowthStage {
  if (growth < 20) return '幼'
  if (growth < 48) return '少'
  return '成'
}

export function nowMs(state: AppState): number {
  return state.now ?? Date.now()
}

export function hoursSinceCare(pet: Pet, state: AppState): number {
  const stamp = pet.lastCareAt || (pet.lastCareDate ? `${pet.lastCareDate}T12:00:00` : null)
  if (!stamp) return 18
  const h = (nowMs(state) - new Date(stamp).getTime()) / 3600000
  return Math.max(0, h)
}

/** 饱食这里表示「想念值」：越久没照料越高；照料会清零。 */
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
