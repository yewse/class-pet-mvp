import type {
  AppState,
  BaseHabitStatus,
  ClassLayout,
  ClassOkrRecord,
  Expression,
  FacePreset,
  HonorItem,
  HonorTier,
  KrTick,
  MoodId,
  OkrRecord,
  PersonalOkr,
  Pet,
  ReportCategory,
  Role,
  Seat,
} from '../types'
import {
  DEFAULT_CLASS_PERK,
  DEFAULT_KR_TARGET,
  KR_TARGET_MAX,
  KR_TARGET_MIN,
  LAYOUT_MAX_COLS,
  LAYOUT_MAX_ROWS,
  LAYOUT_MIN_COLS,
  LAYOUT_MIN_ROWS,
  MOUNT_ID,
  REFLECT_CHIP,
  RETRO_MAX_LEN,
  SELF_SCORE_OPTIONS,
  SKIN_TO_CLOTHES,
  categoryLabel,
  DEFAULT_LAYOUT,
  isHomeroomRole,
  isStaffRole,
  rulesOf,
  seatKey,
} from '../types'
import { basePetById, basePetForSpecies, cosmeticById } from '../catalog'
import { SHOP_ITEMS } from '../shop'
import {
  ACHIEVEMENTS,
  autoCreditTimedOut,
  balance,
  canEarn,
  canReview,
  canSpend,
  canSubmit,
  classBaseProgress,
  earnedAchievements,
  ensureAuditSize,
  honorAllowed,
  honorsInWeek,
  isClassHourLocked,
  nowMs,
  schoolDaysOfWeekId,
  squadTier,
  todayStr,
  weekIdOf,
  withPetLife,
} from '../rules'
import {
  classIdOf,
  classOkrOf,
  classOkrProgress,
  emptyPersonalOkr,
  pendingTicksOf,
  personalOkrOf,
  validateMotto,
  validatePetName,
} from './selectors'

/** 操作者身份：由服务端会话注入，客户端不可伪造。 */
export type Actor = { id: string; role: Role }

export type EngineResult = { state: AppState; error: string | null; result?: unknown }

function ok(state: AppState, result?: unknown): EngineResult {
  return { state, error: null, result }
}

function err(state: AppState, error: string): EngineResult {
  return { state, error }
}

function requireHomeroom(_s: AppState, actor: Actor): string | null {
  return isHomeroomRole(actor.role) ? null : '仅班主任可操作'
}

function requireStaff(_s: AppState, actor: Actor): string | null {
  return isStaffRole(actor.role) ? null : '仅教师可操作'
}

function requireSelfStudent(_s: AppState, actor: Actor, studentId: string): string | null {
  if (actor.role !== 'student') return '仅学生本人可操作'
  if (actor.id !== studentId) return '只能操作自己的数据'
  return null
}

export function uid(p: string): string {
  return `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function nowIso(s: AppState): string {
  return new Date(nowMs(s)).toISOString()
}

const FALLBACK_O = ['本周订正全做完', '晚自习专注四次']

/* ---------- 归档与周期 ---------- */

export function archiveAndSyncOkrs(s: AppState): AppState {
  const week = weekIdOf(s)
  const personalOkrs: Record<string, PersonalOkr> = { ...(s.personalOkrs ?? {}) }
  const okrHistory: OkrRecord[] = [...(s.okrHistory ?? [])]
  const defTarget = rulesOf(s).defaultKrTarget
  let i = 0
  for (const u of s.users.filter((x) => x.role === 'student')) {
    const cur = personalOkrs[u.id]
    if (!cur) {
      personalOkrs[u.id] = emptyPersonalOkr(week, FALLBACK_O[i % FALLBACK_O.length], defTarget)
    } else if (cur.weekId !== week) {
      if (!okrHistory.some((r) => r.studentId === u.id && r.weekId === cur.weekId)) {
        okrHistory.push({
          studentId: u.id,
          weekId: cur.weekId,
          objective: cur.objective ?? '',
          krTarget: Math.max(1, cur.krTarget || DEFAULT_KR_TARGET),
          krDone: Math.max(0, cur.krDone ?? 0),
          selfScore: cur.selfScore ?? null,
          retro: (cur.retro ?? '').trim() || null,
        })
      }
      personalOkrs[u.id] = { ...emptyPersonalOkr(week, '', defTarget), objective: cur.objective }
    }
    i += 1
  }
  const classOkrHistory: ClassOkrRecord[] = [...(s.classOkrHistory ?? [])]
  const rawClass = s.classOkr
  if (rawClass && rawClass.weekId && rawClass.weekId !== week && !classOkrHistory.some((r) => r.weekId === rawClass.weekId)) {
    const pct = classBaseProgress(
      s.baseHabits ?? [],
      s.users.filter((u) => u.role === 'student').map((u) => u.id),
      rawClass.weekId,
      schoolDaysOfWeekId(rawClass.weekId),
      '9999-12-31',
    )
    classOkrHistory.push({
      weekId: rawClass.weekId,
      objective: rawClass.objective || '作业准时率',
      progressPct: pct,
      perkGranted: !!rawClass.perkGranted,
      perkText: rawClass.perkText,
      retro: (rawClass.retro ?? '').trim() || null,
    })
  }
  const classOkr = classOkrOf({ ...s, personalOkrs, okrHistory, classOkrHistory })
  const classSession = s.classSession ?? { active: false, classKrMoved: false }
  return {
    ...s,
    personalOkrs,
    okrHistory,
    classOkrHistory,
    classOkr,
    classSession: { active: !!classSession.active, classKrMoved: !!classSession.classKrMoved },
    krTicks: s.krTicks ?? [],
    dailyMoods: s.dailyMoods ?? [],
    baseHabits: s.baseHabits ?? [],
  }
}

function applyAchievements(s: AppState): AppState {
  const unlocked = { ...s.unlocked }
  const unlockedAchievements = { ...(s.unlockedAchievements ?? {}) }
  for (const u of s.users.filter((x) => x.role === 'student')) {
    const earned = earnedAchievements(s, u.id)
    const haveA = new Set(unlockedAchievements[u.id] ?? [])
    const haveI = new Set(unlocked[u.id] ?? [])
    for (const aid of earned) {
      haveA.add(aid)
      const def = ACHIEVEMENTS.find((a) => a.id === aid)
      if (def) haveI.add(def.itemId)
    }
    unlockedAchievements[u.id] = [...haveA]
    unlocked[u.id] = [...haveI]
  }
  return { ...s, unlocked, unlockedAchievements }
}

const TIER_LABEL: Record<HonorTier, string> = { gold: '金档', silver: '银档', bronze: '铜档' }

function ensureSquadRows(s: AppState, week: string): AppState {
  const rows = [...s.squadWeeks]
  for (const sq of s.squads) {
    if (!rows.some((r) => r.weekId === week && r.teamId === sq.id)) {
      rows.push({ weekId: week, teamId: sq.id, points: 0, comboUsed: false })
    }
  }
  return { ...s, squadWeeks: rows, activeWeek: week }
}

function applyHonorForWeek(s: AppState, week: string): AppState {
  const cfg = rulesOf(s)
  const honors = [...s.honors]
  const squadWeeks = s.squadWeeks.map((sw) => {
    if (sw.weekId !== week) return sw
    const honor = squadTier(sw.points, cfg) ?? undefined
    return { ...sw, honor }
  })
  const ranked = [...squadWeeks]
    .filter((sw) => sw.weekId === week && sw.honor)
    .sort((a, b) => b.points - a.points)
  for (const sw of ranked) {
    const team = s.squads.find((x) => x.id === sw.teamId)
    if (!team || !sw.honor) continue
    for (const sid of team.memberIds) {
      if (honors.some((h) => h.weekId === week && h.studentId === sid)) continue
      if (!honorAllowed(honors, sid, week, cfg.honorWallMax, cfg.honorStreakMax)) continue
      const item: HonorItem = {
        id: uid('h'),
        weekId: week,
        studentId: sid,
        label: `${TIER_LABEL[sw.honor]} · ${team.name}`,
      }
      honors.push(item)
    }
  }
  return { ...s, honors, squadWeeks, lastSettledWeek: week }
}

function alreadySettled(s: AppState, week: string): boolean {
  return s.lastSettledWeek === week || s.squadWeeks.some((sw) => sw.weekId === week && sw.honor)
}

function maybeAutoSettle(s: AppState): AppState {
  const cur = weekIdOf(s)
  let next = ensureSquadRows(s, cur)
  const oldWeeks = [...new Set(next.squadWeeks.map((w) => w.weekId))]
    .filter((w) => w < cur)
    .sort()
  for (const w of oldWeeks) {
    if (alreadySettled(next, w) && next.lastSettledWeek && next.lastSettledWeek >= w) continue
    next = applyHonorForWeek(next, w)
  }
  return { ...next, activeWeek: cur }
}

function ensureSized(s: AppState): AppState {
  return { ...s, reports: ensureAuditSize(s.reports, s.users, rulesOf(s).auditMin) }
}

function tickPets(s: AppState): AppState {
  return { ...s, pets: s.pets.map((p) => withPetLife(p, s)) }
}

/** 读写前的规范化：超时入账、周结算、周期归档、成就、宠物生命。服务端每次加载状态时调用。 */
export function normalizeState(s: AppState): AppState {
  return tickPets(applyAchievements(maybeAutoSettle(autoCreditTimedOut(ensureSized(archiveAndSyncOkrs(s))))))
}

/* ---------- 花名册与教室 ---------- */

export function classLayoutOf(s: AppState): ClassLayout {
  const L = s.classLayout ?? DEFAULT_LAYOUT
  return { cols: L.cols || DEFAULT_LAYOUT.cols, rows: L.rows || DEFAULT_LAYOUT.rows }
}

export function firstEmptySeat(users: AppState['users'], layout: ClassLayout): Seat | null {
  const taken = new Set(
    users.filter((u) => u.role === 'student' && u.seat).map((u) => seatKey(u.seat!)),
  )
  for (let row = 1; row <= layout.rows; row++) {
    for (let col = 1; col <= layout.cols; col++) {
      if (!taken.has(`${row}-${col}`)) return { row, col }
    }
  }
  return null
}

export function assignMissingSeats(users: AppState['users'], layout: ClassLayout): AppState['users'] {
  const taken = new Set<string>()
  const next = users.map((u) => ({ ...u }))
  for (const u of next) {
    if (u.role !== 'student') continue
    const s = u.seat
    if (s && s.row >= 1 && s.col >= 1 && s.row <= layout.rows && s.col <= layout.cols && !taken.has(`${s.row}-${s.col}`)) {
      taken.add(`${s.row}-${s.col}`)
    } else {
      u.seat = undefined
    }
  }
  for (const u of next) {
    if (u.role !== 'student' || u.seat) continue
    let found: Seat | undefined
    for (let row = 1; row <= layout.rows && !found; row++) {
      for (let col = 1; col <= layout.cols && !found; col++) {
        if (!taken.has(`${row}-${col}`)) found = { row, col }
      }
    }
    if (found) {
      u.seat = found
      taken.add(`${found.row}-${found.col}`)
    }
  }
  return next
}

export function occupantAt(users: AppState['users'], row: number, col: number) {
  return users.find((u) => u.role === 'student' && u.seat?.row === row && u.seat?.col === col)
}

export function setClassLayout(s: AppState, actor: Actor, rows: number, cols: number): EngineResult {
  const denied = requireHomeroom(s, actor)
  if (denied) return err(s, denied)
  const r = Math.round(rows)
  const c = Math.round(cols)
  if (r < LAYOUT_MIN_ROWS || r > LAYOUT_MAX_ROWS) return err(s, `排数需在 ${LAYOUT_MIN_ROWS}–${LAYOUT_MAX_ROWS} 之间`)
  if (c < LAYOUT_MIN_COLS || c > LAYOUT_MAX_COLS) return err(s, `列数需在 ${LAYOUT_MIN_COLS}–${LAYOUT_MAX_COLS} 之间`)
  const students = s.users.filter((u) => u.role === 'student').length
  if (r * c < students) return err(s, `座位数 ${r * c} 小于现有学生数 ${students}`)
  const layout = { rows: r, cols: c }
  return ok({ ...s, classLayout: layout, users: assignMissingSeats(s.users, layout) })
}

export function assignSeat(s: AppState, actor: Actor, studentId: string, row: number, col: number): EngineResult {
  const denied = requireHomeroom(s, actor)
  if (denied) return err(s, denied)
  const layout = classLayoutOf(s)
  if (row < 1 || col < 1 || row > layout.rows || col > layout.cols) return err(s, '座位超出教室范围')
  const me = s.users.find((x) => x.id === studentId)
  if (!me || me.role !== 'student') return err(s, '只能给学生排座')
  const other = occupantAt(s.users, row, col)
  if (other && other.id === studentId) return ok(s)
  return ok({
    ...s,
    users: s.users.map((u) => {
      if (u.id === studentId) return { ...u, seat: { row, col } }
      if (other && u.id === other.id) return { ...u, seat: me.seat }
      return u
    }),
  })
}

/** 服务端先创建账号，拿到 id 再进花名册（账号与名册同一事务）。 */
export function addStudent(
  s: AppState,
  actor: Actor,
  args: { id: string; name: string; studentNo?: string },
): EngineResult {
  const denied = requireHomeroom(s, actor)
  if (denied) return err(s, denied)
  const n = args.name.trim()
  if (!n) return err(s, '姓名必填')
  const no = (args.studentNo ?? '').trim() || undefined
  const sameName = s.users.filter((u) => u.role === 'student' && u.name === n)
  if (sameName.length) {
    if (!no) return err(s, `已有同名学生「${n}」：请给新学生填学号区分`)
    if (sameName.some((d) => !d.studentNo)) return err(s, `已有同名学生「${n}」未填学号，请先为其补学号`)
  }
  if (no && s.users.some((u) => u.role === 'student' && u.studentNo === no)) return err(s, `学号 ${no} 已被使用`)
  const layout = classLayoutOf(s)
  const seat = firstEmptySeat(s.users, layout)
  if (!seat) return err(s, '座位已满，可先在花名册调大教室布局')
  return ok({
    ...s,
    users: [
      ...s.users,
      { id: args.id, name: n, role: 'student', code: 'student', studentNo: no, classId: classIdOf(s), dnd: false, seat },
    ],
    personalOkrs: { ...s.personalOkrs, [args.id]: emptyPersonalOkr(weekIdOf(s), FALLBACK_O[0]) },
  })
}

export function renameStudent(s: AppState, actor: Actor, studentId: string, name: string): EngineResult {
  const denied = requireHomeroom(s, actor)
  if (denied) return err(s, denied)
  const n = name.trim()
  if (!n) return err(s, '姓名必填')
  const u = s.users.find((x) => x.id === studentId)
  if (!u || u.role !== 'student') return err(s, '只能改学生姓名')
  const clash = s.users.filter((x) => x.role === 'student' && x.name === n && x.id !== studentId)
  if (clash.length && (!u.studentNo || clash.some((c) => !c.studentNo))) {
    return err(s, '与他人同名：请先为双方都填学号再改名')
  }
  return ok({ ...s, users: s.users.map((x) => (x.id === studentId ? { ...x, name: n } : x)) })
}

export function setStudentNo(s: AppState, actor: Actor, studentId: string, studentNo: string): EngineResult {
  const denied = requireHomeroom(s, actor)
  if (denied) return err(s, denied)
  const u = s.users.find((x) => x.id === studentId)
  if (!u || u.role !== 'student') return err(s, '只能改学生学号')
  const no = studentNo.trim()
  if (no && s.users.some((x) => x.role === 'student' && x.id !== studentId && x.studentNo === no)) {
    return err(s, `学号 ${no} 已被使用`)
  }
  if (!no && s.users.some((x) => x.role === 'student' && x.id !== studentId && x.name === u.name)) {
    return err(s, '存在同名学生，学号不能清空')
  }
  return ok({ ...s, users: s.users.map((x) => (x.id === studentId ? { ...x, studentNo: no || undefined } : x)) })
}

/** 离班清退：删除该生全部养成数据（数据删除权的引擎原语）。 */
export function deleteStudent(s: AppState, actor: Actor, studentId: string): EngineResult {
  const denied = requireHomeroom(s, actor)
  if (denied) return err(s, denied)
  const u = s.users.find((x) => x.id === studentId)
  if (!u || u.role !== 'student') return err(s, '只能清退学生')
  const reportIds = new Set(s.reports.filter((r) => r.authorId === studentId).map((r) => r.id))
  const unlocked = { ...s.unlocked }
  const unlockedAchievements = { ...s.unlockedAchievements }
  delete unlocked[studentId]
  delete unlockedAchievements[studentId]
  return ok({
    ...s,
    users: s.users.filter((x) => x.id !== studentId),
    pets: s.pets.filter((p) => p.ownerId !== studentId),
    ledger: s.ledger.filter((l) => l.studentId !== studentId),
    reports: s.reports.filter((r) => r.authorId !== studentId),
    reviews: s.reviews.filter((r) => r.reviewerId !== studentId && !reportIds.has(r.reportId)),
    visits: s.visits.filter((v) => v.fromId !== studentId && v.toId !== studentId),
    honors: s.honors.filter((h) => h.studentId !== studentId),
    krTicks: (s.krTicks ?? []).filter((k) => k.studentId !== studentId),
    dailyMoods: (s.dailyMoods ?? []).filter((m) => m.studentId !== studentId),
    baseHabits: (s.baseHabits ?? []).filter((h) => h.studentId !== studentId),
    okrHistory: (s.okrHistory ?? []).filter((r) => r.studentId !== studentId),
    unlocked,
    unlockedAchievements,
    squads: s.squads.map((x) => ({ ...x, memberIds: x.memberIds.filter((id) => id !== studentId) })),
    personalOkrs: Object.fromEntries(Object.entries(s.personalOkrs ?? {}).filter(([k]) => k !== studentId)),
  })
}

/* ---------- 领养与照料 ---------- */

export function adoptCost(ids: string[]): number {
  return ids.reduce((n, id) => n + (cosmeticById(id)?.cost ?? 0), 0)
}

export function adopt(
  s: AppState,
  actor: Actor,
  args: {
    species: Pet['species']
    nickname: string
    face: FacePreset
    basePetId?: string
    headwearId?: string
    clothesId?: string
    shoesId?: string
    motto?: string
  },
): EngineResult {
  const ownerId = actor.id
  if (actor.role !== 'student') return err(s, '只有学生能领养')
  if (s.pets.some((p) => p.ownerId === ownerId)) return err(s, '每人只能领养一只')
  const nameErr = validatePetName(args.nickname)
  if (nameErr) return err(s, nameErr)
  const mottoErr = validateMotto(args.motto ?? '')
  if (mottoErr) return err(s, mottoErr)
  const petName = args.nickname.trim()
  const motto = (args.motto ?? '').trim()
  const base = (args.basePetId && basePetById(args.basePetId)) || basePetForSpecies(args.species)
  const headwearId = args.headwearId ?? 'hw_leaf'
  const clothesId = args.clothesId ?? 'cl_scarf'
  const shoesId = args.shoesId ?? 'sh_none'
  const cost = adoptCost([headwearId, clothesId, shoesId])
  const bal = balance(s, ownerId)
  if (cost > bal) return err(s, '养成积分不足')
  const today = todayStr(s)
  const ledger = [...s.ledger]
  if (cost > 0) {
    ledger.push({
      id: uid('led'),
      studentId: ownerId,
      date: today,
      delta: -cost,
      kind: 'spend',
      reason: '领养装扮',
      by: ownerId,
      at: nowIso(s),
    })
  }
  const have = new Set(s.unlocked[ownerId] || ['skin_basic_leaf'])
  have.add('skin_basic_leaf')
  have.add(clothesId)
  have.add(headwearId)
  have.add(shoesId)
  const pet: Pet = {
    id: uid('pet'),
    ownerId,
    species: base.species,
    basePetId: base.id,
    paletteId: base.palette,
    marking: base.marking,
    nickname: petName,
    name: petName,
    motto,
    face: args.face,
    hunger: 50,
    mood: 60,
    growth: 0,
    lastCareDate: null,
    lastCareGrowthDate: null,
    lastCareAt: null,
    skinId: 'skin_basic_leaf',
    mountId: null,
    headwearId,
    clothesId,
    shoesId,
    expression: 'shy',
  }
  return ok({
    ...s,
    ledger,
    pets: [...s.pets, pet],
    unlocked: { ...s.unlocked, [ownerId]: [...have] },
  })
}

function applyCare(s: AppState, actor: Actor, mood: number, expr: Expression): EngineResult {
  const ownerId = actor.id
  if (actor.role !== 'student') return err(s, '只有学生能照料自己的宠物')
  if (isClassHourLocked(s, ownerId)) return err(s, '上课中，课后再照料')
  const today = todayStr(s)
  const pet = s.pets.find((p) => p.ownerId === ownerId)
  if (!pet) return err(s, '还没有宠物')
  let growth = pet.growth
  let lastCareGrowthDate = pet.lastCareGrowthDate
  if (pet.lastCareGrowthDate !== today) {
    growth += rulesOf(s).growthCare
    lastCareGrowthDate = today
  }
  const at = nowIso(s)
  return ok(
    applyAchievements({
      ...s,
      pets: s.pets.map((p) =>
        p.ownerId === ownerId
          ? {
              ...p,
              mood: Math.max(0, Math.min(100, p.mood + mood)),
              hunger: 0,
              growth,
              lastCareDate: today,
              lastCareGrowthDate,
              lastCareAt: at,
              expression: expr,
            }
          : p,
      ),
    }),
  )
}

export function tapPet(s: AppState, actor: Actor): EngineResult {
  return applyCare(s, actor, 2, 'happy')
}
export function petPet(s: AppState, actor: Actor): EngineResult {
  return applyCare(s, actor, 10, 'shy')
}
export function feedPet(s: AppState, actor: Actor): EngineResult {
  return applyCare(s, actor, 6, 'cheer')
}

/* ---------- 申报与互评 ---------- */

export function submitReport(
  s: AppState,
  actor: Actor,
  args: { category: ReportCategory; evidence: string; retestOf?: string },
): EngineResult {
  if (actor.role !== 'student') return err(s, '只有学生能申报')
  const authorId = actor.id
  const today = todayStr(s)
  const cfg = rulesOf(s)
  if (!canSubmit(s, authorId, today)) return err(s, `今日申报已达 ${cfg.dailyReportCap} 条`)
  const ev = args.evidence.trim()
  if (ev.length < cfg.evidenceMinLen) return err(s, `证据至少 ${cfg.evidenceMinLen} 个字：写清楚做了什么`)
  if ((args.category as string) === 'exam_rank') return err(s, '考试名次不加分')
  if (args.retestOf && !s.reports.some((r) => r.id === args.retestOf && r.authorId === authorId)) {
    return err(s, '重测关联的申报不存在')
  }
  const report = {
    id: uid('rep'),
    authorId,
    date: today,
    category: args.category,
    evidence: ev,
    status: 'in_review' as const,
    peerFacts: 0,
    peerDoubts: 0,
    queuedAt: null,
    submittedAt: nowIso(s),
    credited: false,
    retestOf: args.retestOf,
  }
  return ok(applyAchievements({ ...s, reports: [...s.reports, report] }))
}

export function peerReview(s: AppState, actor: Actor, reportId: string, verdict: 'fact' | 'doubt'): EngineResult {
  if (actor.role !== 'student') return err(s, '只有学生能互评')
  const reviewerId = actor.id
  const today = todayStr(s)
  if (!canReview(s, reviewerId, today)) return err(s, `今日互评已达 ${rulesOf(s).dailyReviewCap} 条`)
  const report = s.reports.find((r) => r.id === reportId)
  if (!report) return err(s, '申报不存在')
  if (report.authorId === reviewerId) return err(s, '不能评自己')
  if (s.reviews.some((r) => r.reportId === reportId && r.reviewerId === reviewerId)) {
    return err(s, '已评过这条')
  }
  const reviews = [...s.reviews, { id: uid('rv'), reportId, reviewerId, date: today, verdict }]
  const reports = s.reports.map((r) => {
    if (r.id !== reportId) return r
    const peerFacts = r.peerFacts + (verdict === 'fact' ? 1 : 0)
    const peerDoubts = r.peerDoubts + (verdict === 'doubt' ? 1 : 0)
    const status = peerDoubts > 0 || peerFacts >= 1 ? ('queued' as const) : r.status
    return { ...r, peerFacts, peerDoubts, status, queuedAt: r.queuedAt ?? today }
  })
  return ok({ ...s, reviews, reports })
}

export function teacherAudit(
  s: AppState,
  actor: Actor,
  args: { reportId: string; action: 'approve' | 'reject'; rejectNote?: string },
): EngineResult {
  const denied = requireStaff(s, actor)
  if (denied) return err(s, denied)
  const today = todayStr(s)
  const report = s.reports.find((r) => r.id === args.reportId)
  if (!report || report.credited) return err(s, '无法处理')
  if (args.action === 'reject' && !args.rejectNote?.trim()) return err(s, '驳回必须填写理由')
  const cfg = rulesOf(s)
  const pts = cfg.categoryPoints[report.category]
  const ledger = [...s.ledger]
  if (args.action === 'approve') {
    if (!canEarn(s, report.authorId, today, pts)) return err(s, `该生日入账将超过 ${cfg.dailyEarnCap} 分`)
    ledger.push({
      id: uid('led'),
      studentId: report.authorId,
      date: today,
      delta: pts,
      kind: 'earn',
      reason: categoryLabel(report.category),
      ref: args.reportId,
      by: actor.id,
      at: nowIso(s),
    })
  }
  return ok(
    applyAchievements({
      ...s,
      ledger,
      reports: s.reports.map((r) =>
        r.id === args.reportId
          ? {
              ...r,
              status: args.action === 'approve' ? ('posted' as const) : ('rejected' as const),
              credited: args.action === 'approve',
              rejectNote: args.action === 'reject' ? args.rejectNote!.trim() : r.rejectNote,
            }
          : r,
      ),
    }),
  )
}

/* ---------- 社交 ---------- */

export function social(
  s: AppState,
  actor: Actor,
  args: { toId: string; type: 'visit' | 'emoji' | 'snack' | 'cotrain'; emoji?: string },
): EngineResult {
  if (actor.role !== 'student') return err(s, '只有学生能互访')
  const fromId = actor.id
  const { toId, type } = args
  if (isClassHourLocked(s, fromId) || isClassHourLocked(s, toId)) {
    return err(s, '上课中，课后再照料')
  }
  const today = todayStr(s)
  const to = s.users.find((u) => u.id === toId)
  if (!to || to.role !== 'student') return err(s, '只能访问本班同学')
  if (to.dnd) return err(s, '对方已开启免打扰')
  if (fromId === toId && type !== 'visit') return err(s, '不能对自己使用该互动')
  if (type === 'cotrain') {
    if (s.visits.some((v) => v.date === today && v.type === 'cotrain' && (v.fromId === fromId || v.toId === fromId))) {
      return err(s, '每人每天只能共训一次')
    }
    if (s.visits.some((v) => v.date === today && v.type === 'cotrain' && (v.fromId === toId || v.toId === toId))) {
      return err(s, '对方今日已共训')
    }
    if (!canSpend(s, fromId, today, 2) || !canSpend(s, toId, today, 2)) {
      return err(s, '双方积分或今日消耗额度不足（各 −2）')
    }
  }
  if (type === 'snack') {
    if (!canSpend(s, fromId, today, 2)) return err(s, '今日消耗已满或积分不足')
  }
  const ledger = [...s.ledger]
  if (type === 'snack') {
    ledger.push({ id: uid('led'), studentId: fromId, date: today, delta: -2, kind: 'spend', reason: '投喂点心', by: fromId, at: nowIso(s) })
  }
  if (type === 'cotrain') {
    ledger.push({ id: uid('led'), studentId: fromId, date: today, delta: -2, kind: 'spend', reason: '共训', by: fromId, at: nowIso(s) })
    ledger.push({ id: uid('led'), studentId: toId, date: today, delta: -2, kind: 'spend', reason: '共训', by: fromId, at: nowIso(s) })
  }
  const pets = s.pets.map((p) => {
    if (p.ownerId === toId && (type === 'snack' || type === 'emoji' || type === 'visit')) {
      return { ...p, mood: Math.min(100, p.mood + 4), expression: 'happy' as Expression }
    }
    if ((p.ownerId === fromId || p.ownerId === toId) && type === 'cotrain') {
      return { ...p, mood: Math.min(100, p.mood + 8), expression: 'focus' as Expression }
    }
    return p
  })
  return ok({
    ...s,
    ledger,
    pets,
    visits: [...s.visits, { id: uid('vi'), fromId, toId, date: today, type, emoji: args.emoji }],
  })
}

export function toggleDnd(s: AppState, actor: Actor): EngineResult {
  if (actor.role !== 'student') return err(s, '只有学生能设置免打扰')
  return ok({
    ...s,
    users: s.users.map((u) => (u.id === actor.id ? { ...u, dnd: !u.dnd } : u)),
  })
}

/* ---------- 小队与荣誉 ---------- */

export function squadCombo(s: AppState, actor: Actor, teamId: string): EngineResult {
  if (actor.role !== 'student') return err(s, '只有队员能发起连携')
  const week = weekIdOf(s)
  const team = s.squads.find((x) => x.id === teamId)
  if (!team) return err(s, '小队不存在')
  if (!team.memberIds.includes(actor.id)) return err(s, '只能给自己的小队连携')
  const withRows = ensureSquadRows(s, week)
  const sw = withRows.squadWeeks.find((x) => x.weekId === week && x.teamId === teamId)
  if (!sw) return err(s, '本周小队未开赛')
  if (sw.comboUsed) return err(s, '本周连携已使用')
  const bonus = rulesOf(s).squadComboBonus
  return ok({
    ...withRows,
    squadWeeks: withRows.squadWeeks.map((x) =>
      x.weekId === week && x.teamId === teamId ? { ...x, comboUsed: true, points: x.points + bonus } : x,
    ),
  })
}

export function awardSquadPoint(s: AppState, actor: Actor, teamId: string, n = 1): EngineResult {
  const denied = requireHomeroom(s, actor)
  if (denied) return err(s, denied)
  const week = weekIdOf(s)
  const withRows = ensureSquadRows(s, week)
  const sw = withRows.squadWeeks.find((x) => x.weekId === week && x.teamId === teamId)
  if (!sw) return err(s, '小队不存在')
  if (sw.points >= rulesOf(s).squadWeeklyCap) return err(s, '本周互助点已达上限')
  return ok(
    applyAchievements({
      ...withRows,
      squadWeeks: withRows.squadWeeks.map((x) =>
        x.weekId === week && x.teamId === teamId ? { ...x, points: x.points + n } : x,
      ),
    }),
  )
}

export function settleHonor(s: AppState, actor: Actor, studentId: string, label: string): EngineResult {
  const denied = requireHomeroom(s, actor)
  if (denied) return err(s, denied)
  const u = s.users.find((x) => x.id === studentId)
  if (!u || u.role !== 'student') return err(s, '只能给学生写荣誉')
  const week = weekIdOf(s)
  const cfg = rulesOf(s)
  if (honorsInWeek(s.honors, week) >= cfg.honorWallMax) return err(s, `本周荣誉橱窗最多 ${cfg.honorWallMax} 席`)
  if (!honorAllowed(s.honors, studentId, week, cfg.honorWallMax, cfg.honorStreakMax)) {
    return err(s, `同一人连续上墙不得超过 ${cfg.honorStreakMax} 次`)
  }
  return ok({
    ...s,
    honors: [...s.honors, { id: uid('h'), weekId: week, studentId, label, by: actor.id }],
  })
}

export function settleCurrentWeek(s: AppState, actor: Actor): EngineResult {
  const denied = requireHomeroom(s, actor)
  if (denied) return err(s, denied)
  const week = weekIdOf(s)
  if (alreadySettled(s, week)) return err(s, '本周已结算')
  return ok(applyAchievements(applyHonorForWeek(ensureSquadRows(s, week), week)))
}

/* ---------- 商店 ---------- */

export function buyItem(s: AppState, actor: Actor, itemId: string): EngineResult {
  if (actor.role !== 'student') return err(s, '只有学生能兑换')
  const studentId = actor.id
  const item = SHOP_ITEMS.find((i) => i.id === itemId)
  if (!item) return err(s, '商品不存在')
  if (item.rare || item.kind === 'mount' || itemId === MOUNT_ID || itemId === REFLECT_CHIP) {
    return err(s, '稀有外观与坐骑仅能由成就/周赛解锁，不可购买')
  }
  const have = s.unlocked[studentId] || []
  if (have.includes(itemId)) return err(s, '已拥有')
  const today = todayStr(s)
  const bal = balance(s, studentId)
  if (bal < item.cost) return err(s, `积分不足，还差 ${item.cost - bal} 分`)
  return ok({
    ...s,
    ledger: [
      ...s.ledger,
      {
        id: uid('led'),
        studentId,
        date: today,
        delta: -item.cost,
        kind: 'spend',
        reason: `兑换 ${item.name}`,
        by: studentId,
        at: nowIso(s),
      },
    ],
    unlocked: { ...s.unlocked, [studentId]: [...have, itemId] },
  })
}

export function equip(s: AppState, actor: Actor, itemId: string): EngineResult {
  if (actor.role !== 'student') return err(s, '只有学生能装扮')
  const studentId = actor.id
  const have = s.unlocked[studentId] || []
  if (!have.includes(itemId)) return err(s, '未解锁')
  const item = SHOP_ITEMS.find((i) => i.id === itemId)
  const cos = cosmeticById(itemId)
  return ok({
    ...s,
    pets: s.pets.map((p) => {
      if (p.ownerId !== studentId) return p
      if (item?.kind === 'mount' || itemId === MOUNT_ID) return { ...p, mountId: itemId }
      if (cos?.slot === 'headwear') return { ...p, headwearId: itemId }
      if (cos?.slot === 'clothes') return { ...p, clothesId: itemId }
      if (cos?.slot === 'shoes') return { ...p, shoesId: itemId }
      return { ...p, skinId: itemId }
    }),
  })
}

/* ---------- 心情（只记录，永不影响宠物） ---------- */

export function setDailyMood(s: AppState, actor: Actor, mood: MoodId): EngineResult {
  if (actor.role !== 'student') return err(s, '只有学生能记心情')
  const studentId = actor.id
  const today = todayStr(s)
  const dailyMoods = (s.dailyMoods ?? []).filter((m) => !(m.studentId === studentId && m.date === today))
  dailyMoods.push({ studentId, date: today, mood })
  return ok({ ...s, dailyMoods })
}

/* ---------- OKR：打钩 / 确认 / 复盘 ---------- */

export function submitKrTick(s: AppState, actor: Actor, note: string): EngineResult {
  if (actor.role !== 'student') return err(s, '只有学生能勾选自己的关键结果')
  const studentId = actor.id
  const n = note.trim()
  if (n.length < 4) return err(s, '证据至少 4 个字')
  if (n.length > 24) return err(s, '证据请控制在 24 字内')
  if (!/[一-鿿]/.test(n)) return err(s, '请用简短中文写下证据')
  const cur = personalOkrOf(s, studentId)
  const pending = pendingTicksOf(s, studentId).length
  if (cur.krDone + pending >= cur.krTarget) return err(s, '本周关键结果已满或已有待确认')
  const week = weekIdOf(s)
  const tick: KrTick = {
    id: uid('kt'),
    studentId,
    weekId: week,
    date: todayStr(s),
    note: n,
    status: 'pending',
    confirmerId: null,
  }
  return ok({ ...s, krTicks: [...(s.krTicks ?? []), tick] })
}

function maybeUnlockReflect(s: AppState, studentId: string): AppState {
  const obj = personalOkrOf(s, studentId).objective
  if (!obj.includes('订正')) return s
  const have = new Set(s.unlocked[studentId] ?? [])
  if (have.has(REFLECT_CHIP)) return s
  have.add(REFLECT_CHIP)
  return { ...s, unlocked: { ...s.unlocked, [studentId]: [...have] } }
}

function creditConfirmedTick(s: AppState, studentId: string): AppState {
  const today = todayStr(s)
  const cur = personalOkrOf(s, studentId)
  if (cur.krDone >= cur.krTarget) return s
  const grew = cur.lastTickDate !== today
  const personalOkrs = {
    ...s.personalOkrs,
    [studentId]: { ...cur, krDone: cur.krDone + 1, lastTickDate: today },
  }
  const pets = s.pets.map((p) => {
    if (p.ownerId !== studentId) return p
    return {
      ...p,
      growth: grew ? p.growth + rulesOf(s).growthTick : p.growth,
      mood: Math.min(100, p.mood + 4),
      expression: 'cheer' as Expression,
    }
  })
  return maybeUnlockReflect({ ...s, personalOkrs, pets }, studentId)
}

export function confirmKrTick(s: AppState, actor: Actor, tickId: string): EngineResult {
  const tick = (s.krTicks ?? []).find((k) => k.id === tickId)
  if (!tick) return err(s, '没有这条勾选')
  if (tick.status === 'confirmed') return err(s, '已经确认过了')
  if (tick.studentId === actor.id) return err(s, '不能确认自己的勾选')
  if (actor.role !== 'student' && !isStaffRole(actor.role)) return err(s, '只有同学或老师能确认')
  let next: AppState = {
    ...s,
    krTicks: (s.krTicks ?? []).map((k) =>
      k.id === tickId ? { ...k, status: 'confirmed' as const, confirmerId: actor.id } : k,
    ),
  }
  const curWeek = weekIdOf(next)
  if (tick.weekId === curWeek) {
    next = creditConfirmedTick(next, tick.studentId)
    if (isStaffRole(actor.role) && next.classSession?.active) {
      next = { ...next, classSession: { ...next.classSession, classKrMoved: true } }
    }
  } else {
    // 往周补确认：计入历史记录，劳动不蒸发（不再补成长，防刷）
    const idx = (next.okrHistory ?? []).findIndex((r) => r.studentId === tick.studentId && r.weekId === tick.weekId)
    if (idx >= 0) {
      const rec = next.okrHistory[idx]
      const okrHistory = [...next.okrHistory]
      okrHistory[idx] = { ...rec, krDone: Math.min(rec.krTarget, rec.krDone + 1) }
      next = { ...next, okrHistory }
    } else {
      const cur = next.personalOkrs[tick.studentId]
      if (cur && cur.weekId === tick.weekId) {
        next = {
          ...next,
          personalOkrs: {
            ...next.personalOkrs,
            [tick.studentId]: { ...cur, krDone: Math.min(cur.krTarget, cur.krDone + 1) },
          },
        }
      }
    }
  }
  return ok(next)
}

export function submitSelfReview(
  s: AppState,
  actor: Actor,
  args: { weekId: string; score: number; retro: string },
): EngineResult {
  const denied = requireSelfStudent(s, actor, actor.id)
  if (denied) return err(s, denied)
  const studentId = actor.id
  if (!SELF_SCORE_OPTIONS.some((v) => v === args.score)) return err(s, '自评只能选 0 / 0.3 / 0.7 / 1')
  const retro = args.retro.trim()
  if (!retro) return err(s, '写一句复盘：哪里做得好，哪里卡住了')
  if (retro.length > RETRO_MAX_LEN) return err(s, `复盘请控制在 ${RETRO_MAX_LEN} 字内`)
  const curWeek = weekIdOf(s)
  let next: AppState
  if (args.weekId === curWeek) {
    const d = new Date(todayStr(s) + 'T12:00:00Z')
    const dayNum = d.getUTCDay() || 7
    if (dayNum < 5) return err(s, '周五起才能做本周复盘')
    const cur = personalOkrOf(s, studentId)
    if (cur.selfScore != null) return err(s, '本周已复盘')
    next = {
      ...s,
      personalOkrs: { ...s.personalOkrs, [studentId]: { ...cur, selfScore: args.score, retro } },
    }
  } else {
    const idx = (s.okrHistory ?? []).findIndex((r) => r.studentId === studentId && r.weekId === args.weekId)
    if (idx < 0) return err(s, '找不到该周记录')
    if (s.okrHistory[idx].selfScore != null) return err(s, '该周已复盘')
    const okrHistory = [...s.okrHistory]
    okrHistory[idx] = { ...okrHistory[idx], selfScore: args.score, retro }
    next = { ...s, okrHistory }
  }
  next = {
    ...next,
    pets: next.pets.map((p) =>
      p.ownerId === studentId
        ? { ...p, growth: p.growth + rulesOf(s).growthRetro, mood: Math.min(100, p.mood + 6), expression: 'cheer' as Expression }
        : p,
    ),
  }
  return ok(applyAchievements(next))
}

export function saveClassRetro(s: AppState, actor: Actor, text: string): EngineResult {
  const denied = requireHomeroom(s, actor)
  if (denied) return err(s, denied)
  const n = text.trim()
  if (!n) return err(s, '写一句班级复盘')
  if (n.length > RETRO_MAX_LEN) return err(s, `复盘请控制在 ${RETRO_MAX_LEN} 字内`)
  const cur = classOkrOf(s)
  return ok({ ...s, classOkr: { ...cur, retro: n } })
}

/* ---------- 课堂：基础达标 / 例外 / 突破 / 表扬 ---------- */

export function markClassBaseDone(s: AppState, actor: Actor): EngineResult {
  const denied = requireHomeroom(s, actor)
  if (denied) return err(s, denied)
  const week = weekIdOf(s)
  const today = todayStr(s)
  const roster = s.users.filter((u) => u.role === 'student')
  const habits = [...(s.baseHabits ?? [])]
  let added = 0
  for (const u of roster) {
    const cur = habits.find((h) => h.studentId === u.id && h.date === today)
    if (cur) continue
    habits.push({ studentId: u.id, weekId: week, date: today, status: 'done', by: actor.id })
    added += 1
  }
  const next = {
    ...s,
    baseHabits: habits,
    classSession: s.classSession?.active
      ? { ...s.classSession, classKrMoved: s.classSession.classKrMoved || added > 0 }
      : s.classSession,
  }
  return ok(next, added ? `已记 ${added} 人今日基础达标` : '今日基础已记过')
}

function upsertTodayHabit(s: AppState, actor: Actor, status: BaseHabitStatus, studentId: string): EngineResult {
  const denied = requireStaff(s, actor)
  if (denied) return err(s, denied)
  const u = s.users.find((x) => x.id === studentId)
  if (!u || u.role !== 'student') return err(s, '只能标记学生')
  const today = todayStr(s)
  const week = weekIdOf(s)
  const habits = [...(s.baseHabits ?? [])]
  const idx = habits.findIndex((h) => h.studentId === studentId && h.date === today)
  if (idx >= 0) habits[idx] = { ...habits[idx], status, by: actor.id }
  else habits.push({ studentId, weekId: week, date: today, status, by: actor.id })
  return ok({ ...s, baseHabits: habits })
}

export function markMissed(s: AppState, actor: Actor, studentId: string): EngineResult {
  return upsertTodayHabit(s, actor, 'missed', studentId)
}

export function markExempt(s: AppState, actor: Actor, studentId: string): EngineResult {
  return upsertTodayHabit(s, actor, 'exempt', studentId)
}

export function clearTodayMark(s: AppState, actor: Actor, studentId: string): EngineResult {
  const denied = requireStaff(s, actor)
  if (denied) return err(s, denied)
  const today = todayStr(s)
  return ok({
    ...s,
    baseHabits: (s.baseHabits ?? []).filter((h) => !(h.studentId === studentId && h.date === today)),
  })
}

export function confirmBreakthrough(s: AppState, actor: Actor, studentId: string, note: string): EngineResult {
  const denied = requireStaff(s, actor)
  if (denied) return err(s, denied)
  const u = s.users.find((x) => x.id === studentId)
  if (!u || u.role !== 'student') return err(s, '只能给学生记特别突破')
  const pending = pendingTicksOf(s, studentId)
  if (pending.length) {
    return confirmKrTick(s, actor, pending[0].id)
  }
  const n = note.trim()
  if (!n) return err(s, '特别突破需要已有证据，或写一句备注')
  if (n.length > 24) return err(s, '备注请控制在 24 字内')
  if (!/[一-鿿]/.test(n)) return err(s, '请用中文写备注')
  const cur = personalOkrOf(s, studentId)
  if (cur.krDone >= cur.krTarget) return err(s, '个人关键结果已满')
  const week = weekIdOf(s)
  const tick: KrTick = {
    id: uid('kt'),
    studentId,
    weekId: week,
    date: todayStr(s),
    note: n,
    status: 'confirmed',
    confirmerId: actor.id,
  }
  let next: AppState = { ...s, krTicks: [...(s.krTicks ?? []), tick] }
  next = creditConfirmedTick(next, studentId)
  if (next.classSession?.active) {
    next = { ...next, classSession: { ...next.classSession, classKrMoved: true } }
  }
  return ok(next)
}

export function praiseWholeClass(s: AppState, actor: Actor, reason = '全班表扬'): EngineResult {
  const denied = requireStaff(s, actor)
  if (denied) return err(s, denied)
  if (!s.classSession?.active) return err(s, '先点「上课」再表扬')
  if (!s.classSession.classKrMoved) return err(s, '本课班级目标尚未推进，暂不可全班表扬')
  const students = s.users.filter((u) => u.role === 'student')
  const today = todayStr(s)
  const pets = s.pets.map((p) => {
    if (!students.some((u) => u.id === p.ownerId)) return p
    return { ...p, mood: Math.min(100, p.mood + 4), expression: 'cheer' as Expression }
  })
  const ledger = [...s.ledger]
  for (const u of students) {
    ledger.push({
      id: uid('cs'),
      studentId: u.id,
      date: today,
      delta: 0,
      kind: 'earn',
      reason,
      by: actor.id,
      at: nowIso(s),
    })
  }
  return ok({ ...s, pets, ledger })
}

export function grantClassPerk(s: AppState, actor: Actor, text: string): EngineResult {
  const denied = requireHomeroom(s, actor)
  if (denied) return err(s, denied)
  const threshold = rulesOf(s).perkThresholdPct
  const pct = classOkrProgress(s)
  if (pct < threshold) return err(s, `班级周关键结果未到 ${threshold}%，还不能发集体奖励`)
  const o = classOkrOf(s)
  if (o.perkGranted) return err(s, '本周集体奖励已发放')
  const n = (text || DEFAULT_CLASS_PERK).trim()
  if (!n) return err(s, '请写一项中文优惠')
  if (n.length > 24) return err(s, '优惠请控制在 24 字内')
  if (!/[一-鿿]/.test(n)) return err(s, '请用中文写优惠')
  return ok({ ...s, classOkr: { ...o, perkText: n, perkGranted: true } })
}

export function startClassSession(s: AppState, actor: Actor): EngineResult {
  const denied = requireStaff(s, actor)
  if (denied) return err(s, denied)
  if (s.classSession?.active) return err(s, '本课已开始')
  return ok({
    ...s,
    classSession: { active: true, classKrMoved: false },
    inClassHour: { ...s.inClassHour, [classIdOf(s)]: true },
  })
}

export function endClassSession(s: AppState, actor: Actor): EngineResult {
  const denied = requireStaff(s, actor)
  if (denied) return err(s, denied)
  return ok({
    ...s,
    classSession: { active: false, classKrMoved: false },
    inClassHour: { ...s.inClassHour, [classIdOf(s)]: false },
  })
}

export function toggleClassHour(s: AppState, actor: Actor): EngineResult {
  const denied = requireStaff(s, actor)
  if (denied) return err(s, denied)
  const cid = classIdOf(s)
  return ok({ ...s, inClassHour: { ...s.inClassHour, [cid]: !s.inClassHour?.[cid] } })
}

/* ---------- 目标设置 ---------- */

export function setStudentObjective(s: AppState, actor: Actor, studentId: string, objective: string): EngineResult {
  if (actor.role === 'student' && actor.id !== studentId) return err(s, '只能改自己的目标')
  if (actor.role === 'subject') return err(s, '个人目标由学生本人或班主任修改')
  const u = s.users.find((x) => x.id === studentId)
  if (!u || u.role !== 'student') return err(s, '只能改学生目标')
  const o = objective.trim()
  if (!o) return err(s, '目标不能为空')
  if (o.length > 16) return err(s, '目标请控制在 16 字内')
  const cur = personalOkrOf(s, studentId)
  return ok({
    ...s,
    personalOkrs: { ...s.personalOkrs, [studentId]: { ...cur, objective: o } },
  })
}

export function setStudentKrTarget(s: AppState, actor: Actor, studentId: string, n: number): EngineResult {
  const denied = requireHomeroom(s, actor)
  if (denied) return err(s, denied)
  const u = s.users.find((x) => x.id === studentId)
  if (!u || u.role !== 'student') return err(s, '只能改学生关键结果')
  const t = Math.max(KR_TARGET_MIN, Math.min(KR_TARGET_MAX, Math.round(n) || DEFAULT_KR_TARGET))
  const cur = personalOkrOf(s, studentId)
  return ok({
    ...s,
    personalOkrs: { ...s.personalOkrs, [studentId]: { ...cur, krTarget: t, krDone: Math.min(cur.krDone, t) } },
  })
}

export function setClassObjective(s: AppState, actor: Actor, objective: string): EngineResult {
  const denied = requireHomeroom(s, actor)
  if (denied) return err(s, denied)
  const o = objective.trim()
  if (!o) return err(s, '班级目标不能为空')
  if (o.length > 16) return err(s, '目标请控制在 16 字内')
  const cur = classOkrOf(s)
  return ok({ ...s, classOkr: { ...cur, objective: o } })
}

/** 宠物皮肤规范化（迁移/种子用） */
export function normalizePet(p: Pet): Pet {
  const base = (p.basePetId && basePetById(p.basePetId)) || basePetForSpecies(p.species)
  const clothesId = p.clothesId || SKIN_TO_CLOTHES[p.skinId] || 'cl_scarf'
  const name = (p.name || p.nickname || '').trim() || base.name
  return {
    ...p,
    species: base.species,
    basePetId: base.id,
    paletteId: p.paletteId || base.palette,
    marking: p.marking || base.marking,
    headwearId: p.headwearId || 'hw_leaf',
    clothesId,
    shoesId: p.shoesId || 'sh_none',
    name,
    nickname: name,
    motto: (p.motto ?? '').trim(),
    lastCareAt: p.lastCareAt || (p.lastCareDate ? `${p.lastCareDate}T12:00:00` : null),
  }
}
