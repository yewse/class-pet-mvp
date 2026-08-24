import { createSeed, SHOP_ITEMS } from './seed'
import type { AppState, BaseHabit, ClassLayout, ClassOkr, ClassSession, Expression, FacePreset, KrTick, MoodId, PersonalOkr, Pet, ReportCategory, Role, Seat, SpeciesId } from './types'
import { isHomeroomRole, isStaffRole } from './types'
import { DEFAULT_LAYOUT, seatKey } from './types'
import { SKIN_TO_CLOTHES, DEFAULT_KR_TARGET, DEFAULT_CLASS_PERK, REFLECT_CHIP, SESSION_POS_CAP, SESSION_NEG_CAP, MOOD_LABEL } from './types'
import { BASE_PETS, basePetById, basePetForSpecies, COSMETICS, cosmeticById } from './catalog'
import {
  CATEGORY_POINTS,
  categoryLabel,
  HONOR_STREAK_MAX,
  HONOR_WALL_MAX,
  MOUNT_ID,
} from './types'
import {
  ACHIEVEMENTS,
  addDays,
  autoCreditTimedOut,
  balance,
  canEarn,
  canReview,
  canSpend,
  canSubmit,
  earnedAchievements,
  ensureAuditSize,
  honorAllowed,
  honorsInWeek,
  isClassHourLocked,
  nowMs,
  squadTier,
  todayStr,
  weekIdFromDate,
  weekIdOf,
  weekSchoolDaysSoFar,
  withPetLife,
} from './rules'
import type { HonorItem, HonorTier } from './types'

const KEY = 'class-pet-mvp-v13'
const OLD_KEYS = ['class-pet-mvp-v12', 'class-pet-mvp-v11', 'class-pet-mvp-v10', 'class-pet-mvp-v9']

const ONLY_CLASS = 'c1'

function normalizeRole(role: string): Role | null {
  if (role === 'teacher' || role === 'homeroom') return 'homeroom'
  if (role === 'subject') return 'subject'
  if (role === 'student') return 'student'
  return null
}

function sessionUser() {
  const id = state.session?.userId
  return id ? state.users.find((u) => u.id === id) : undefined
}

function requireHomeroom(): string | null {
  const u = sessionUser()
  if (!u || !isHomeroomRole(u.role)) return '仅班主任可操作'
  return null
}

function requireStaff(): string | null {
  const u = sessionUser()
  if (!u || !isStaffRole(u.role)) return '仅教师可操作'
  return null
}

function staffConfirmerId(): string {
  return sessionUser()?.id ?? 't1'
}


const CHI_CHI_MOTTO = '赤心向前'

export function petDisplayName(p: Pet): string {
  return (p.name || p.nickname || '').trim()
}

export function validatePetName(raw: string): string | null {
  const n = raw.trim()
  if (!n) return '请填写宠物名'
  if (!/^[一-鿿A-Za-z]{2,8}$/.test(n)) return '宠物名为 2–8 个汉字或字母'
  return null
}

export function validateMotto(raw: string): string | null {
  const n = raw.trim()
  if (!n) return '请填写个性签名'
  if (n.length > 20) return '个性签名最多 20 字'
  return null
}

function normalizePet(p: Pet): Pet {
  const base = (p.basePetId && basePetById(p.basePetId)) || basePetForSpecies(p.species)
  const clothesId = p.clothesId || SKIN_TO_CLOTHES[p.skinId] || 'cl_scarf'
  const name = (p.name || p.nickname || '').trim() || base.name
  let motto = (p.motto ?? '').trim()
  if (!motto && name === '赤赤') motto = CHI_CHI_MOTTO
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
    motto,
    lastCareAt: p.lastCareAt || (p.lastCareDate ? `${p.lastCareDate}T12:00:00` : null),
  }
}


const FALLBACK_O = ['本周订正全做完', '晚自习专注四次']

export function emptyPersonalOkr(weekId: string, objective = ''): PersonalOkr {
  return { weekId, objective, krTarget: DEFAULT_KR_TARGET, krDone: 0, lastTickDate: null }
}

export function personalOkrOf(s: AppState, studentId: string): PersonalOkr {
  const week = weekIdOf(s)
  const raw = s.personalOkrs?.[studentId]
  if (!raw) return emptyPersonalOkr(week)
  if (raw.weekId !== week) return { ...emptyPersonalOkr(week), objective: raw.objective }
  return {
    weekId: week,
    objective: raw.objective ?? '',
    krTarget: Math.max(1, raw.krTarget || DEFAULT_KR_TARGET),
    krDone: Math.max(0, raw.krDone ?? 0),
    lastTickDate: raw.lastTickDate ?? null,
  }
}

export function classOkrOf(s: AppState): ClassOkr {
  const week = weekIdOf(s)
  const raw = s.classOkr
  if (!raw || raw.weekId !== week) {
    return { weekId: week, objective: raw?.objective || '作业准时率', doneCount: 0 }
  }
  return {
    weekId: week,
    objective: raw.objective || '作业准时率',
    doneCount: Math.max(0, raw.doneCount ?? 0),
    perkText: raw.perkText,
    perkGranted: !!raw.perkGranted,
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

export function classOkrProgress(s: AppState): number {
  const roster = s.users.filter((u) => u.role === 'student' && u.classId === ONLY_CLASS)
  if (!roster.length) return 0
  const week = weekIdOf(s)
  const days = weekSchoolDaysSoFar(s)
  const done = (s.baseHabits ?? []).filter((h) => h.weekId === week && h.status === 'done' && days.includes(h.date)).length
  const denom = roster.length * Math.max(1, days.length)
  return Math.min(100, Math.round((done / denom) * 100))
}

export function pendingTicksOf(s: AppState, studentId?: string): KrTick[] {
  const week = weekIdOf(s)
  return (s.krTicks ?? []).filter(
    (k) => k.weekId === week && k.status === 'pending' && (!studentId || k.studentId === studentId),
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

export function majorityRain(s: AppState): boolean {
  const roster = s.users.filter((u) => u.role === 'student' && u.classId === ONLY_CLASS).length
  const rain = classMoodMix(s).rain
  return roster > 0 && rain * 2 >= roster
}

export function classWeekBehind(s: AppState): boolean {
  return classOkrProgress(s) < 50
}

export function displayExpr(s: AppState, pet: Pet, weekView = false): Expression {
  if (weekView && classWeekBehind(s)) return 'dormant'
  if (majorityRain(s)) return 'tired'
  return pet.expression
}

function syncOkrs(s: AppState): AppState {
  const week = weekIdOf(s)
  const personalOkrs: Record<string, PersonalOkr> = { ...(s.personalOkrs ?? {}) }
  let i = 0
  for (const u of s.users.filter((x) => x.role === 'student')) {
    const cur = personalOkrs[u.id]
    if (!cur) {
      personalOkrs[u.id] = emptyPersonalOkr(week, FALLBACK_O[i % FALLBACK_O.length])
    } else if (cur.weekId !== week) {
      personalOkrs[u.id] = { ...emptyPersonalOkr(week), objective: cur.objective }
    }
    i += 1
  }
  const classOkr = classOkrOf({ ...s, personalOkrs })
  const classSession: ClassSession = s.classSession ?? { active: false, deltas: {}, classKrMoved: false }
  return {
    ...s,
    personalOkrs,
    classOkr,
    classSession,
    krTicks: s.krTicks ?? [],
    dailyMoods: s.dailyMoods ?? [],
    baseHabits: s.baseHabits ?? [],
  }
}

function migrate(s: AppState): AppState {
  const seed = createSeed()
  const savedById = new Map((s.users ?? []).map((u) => [u.id, u]))
  const seedUsers = seed.users.map((su) => {
    const old = savedById.get(su.id)
    if (!old) return { ...su, classId: ONLY_CLASS, classIds: isStaffRole(su.role) ? [ONLY_CLASS] : su.classIds }
    const role = normalizeRole(old.role) ?? su.role
    return {
      ...su,
      role,
      code: role,
      dnd: old.dnd,
      name: old.name || su.name,
      seat: old.seat ?? su.seat,
      classId: ONLY_CLASS,
      classIds: isStaffRole(role) ? [ONLY_CLASS] : su.classIds,
    }
  })
  const seedIds = new Set(seed.users.map((u) => u.id))
  const extras = (s.users ?? [])
    .filter((u) => !seedIds.has(u.id))
    .map((u) => {
      const role = normalizeRole(u.role)
      if (!role) return null
      return {
        ...u,
        role,
        code: role,
        classId: role === 'student' || isStaffRole(role) ? ONLY_CLASS : u.classId,
      }
    })
    .filter((u): u is NonNullable<typeof u> => !!u)
  const users = assignMissingSeats([...seedUsers, ...extras], s.classLayout ?? seed.classLayout ?? DEFAULT_LAYOUT)
  const studentIds = new Set(users.filter((u) => u.role === 'student').map((u) => u.id))
  let pets = (s.pets ?? []).filter((p) => studentIds.has(p.ownerId)).map(normalizePet)
  for (const p of seed.pets) {
    if (!pets.some((x) => x.ownerId === p.ownerId)) pets = [...pets, normalizePet(p)]
  }
  const week = weekIdOf(s)
  const classScores: Record<string, number> = {}
  const sameScoreWeek = (s.classScoreWeek ?? week) === week
  for (const id of studentIds) {
    if (!sameScoreWeek) {
      classScores[id] = 0
      continue
    }
    const saved = s.classScores?.[id]
    classScores[id] = typeof saved === 'number' ? saved : (seed.classScores?.[id] ?? 0)
  }
  let session = s.session
    ? { userId: s.session.userId, viewClassId: ONLY_CLASS }
    : null
  if (session && !users.some((u) => u.id === session!.userId)) session = null
  return syncOkrs({
    ...s,
    schoolName: s.schoolName ?? seed.schoolName,
    className: seed.className,
    classes: seed.classes,
    classLayout: s.classLayout ?? seed.classLayout ?? DEFAULT_LAYOUT,
    users,
    pets,
    session,
    unlockedAchievements: s.unlockedAchievements ?? seed.unlockedAchievements,
    inClassHour: { [ONLY_CLASS]: !!(s.inClassHour?.[ONLY_CLASS] ?? seed.inClassHour?.[ONLY_CLASS]) },
    activeWeek: s.activeWeek ?? seed.activeWeek,
    lastSettledWeek: s.lastSettledWeek === undefined ? seed.lastSettledWeek : s.lastSettledWeek,
    classScores,
    classScoreWeek: week,
    personalOkrs: s.personalOkrs ?? seed.personalOkrs,
    classOkr: s.classOkr ?? seed.classOkr,
    classSession: s.classSession ?? seed.classSession,
    krTicks: s.krTicks ?? seed.krTicks ?? [],
    dailyMoods: s.dailyMoods ?? seed.dailyMoods ?? [],
    baseHabits: s.baseHabits ?? seed.baseHabits ?? [],
  })
}

function load(): AppState {
  try {
    let raw = localStorage.getItem(KEY)
    if (!raw) {
      for (const k of OLD_KEYS) {
        raw = localStorage.getItem(k)
        if (raw) break
      }
    }
    if (raw) {
      const parsed = JSON.parse(raw) as AppState
      return boot(migrate(parsed))
    }
  } catch {
    /* seed */
  }
  return boot(createSeed())
}

function ensureSized(s: AppState): AppState {
  return { ...s, reports: ensureAuditSize(s.reports, s.users) }
}

function tickPets(s: AppState): AppState {
  return {
    ...s,
    pets: s.pets.map((p) => withPetLife(p, s)),
  }
}

function boot(s: AppState): AppState {
  return tickPets(applyAchievements(maybeAutoSettle(autoCreditTimedOut(ensureSized(s)))))
}

let state: AppState = load()
const listeners = new Set<() => void>()

function persist() {
  localStorage.setItem(KEY, JSON.stringify(state))
  listeners.forEach((l) => l())
}

function set(next: AppState) {
  state = next
  persist()
}

function uid(p: string) {
  return `${p}-${Math.random().toString(36).slice(2, 9)}`
}

export function getState(): AppState {
  return state
}

export function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function resetDemo() {
  if (requireHomeroom()) return
  localStorage.removeItem(KEY)
  for (const k of OLD_KEYS) localStorage.removeItem(k)
  state = boot(createSeed())
  persist()
}

export function login(role: AppState['users'][0]['role'], name: string): string | null {
  const u = state.users.find((x) => x.role === role && x.name === name.trim())
  if (!u) return '姓名与角色不匹配。演示：叶老师 / 王老师 / 林小舟'
  set({ ...state, session: { userId: u.id, viewClassId: ONLY_CLASS } })
  return null
}

export function setViewClass(_classId: string) {
  if (!state.session) return
  set({ ...state, session: { ...state.session, viewClassId: ONLY_CLASS } })
}

export function teacherClassIds(user: AppState['users'][0] | undefined): string[] {
  if (!user) return []
  if (user.classIds?.length) return user.classIds
  return user.classId ? [user.classId] : []
}

export function leaveClassWipe(studentId: string) {
  const denied = requireHomeroom()
  if (denied) return denied
  const u = state.users.find((x) => x.id === studentId)
  if (!u || u.role !== 'student') return '只能清退学生'
  const reportIds = new Set(state.reports.filter((r) => r.authorId === studentId).map((r) => r.id))
  const unlocked = { ...state.unlocked }
  const unlockedAchievements = { ...state.unlockedAchievements }
  delete unlocked[studentId]
  delete unlockedAchievements[studentId]
  set({
    ...state,
    pets: state.pets.filter((p) => p.ownerId !== studentId),
    ledger: state.ledger.filter((l) => l.studentId !== studentId),
    reports: state.reports.filter((r) => r.authorId !== studentId),
    reviews: state.reviews.filter((r) => r.reviewerId !== studentId && !reportIds.has(r.reportId)),
    visits: state.visits.filter((v) => v.fromId !== studentId && v.toId !== studentId),
    honors: state.honors.filter((h) => h.studentId !== studentId),
    unlocked,
    unlockedAchievements,
    squads: state.squads.map((s) => ({ ...s, memberIds: s.memberIds.filter((id) => id !== studentId) })),
  })
  return null
}

export function logout() {
  set({ ...state, session: null })
}

export function adoptCost(ids: string[]): number {
  return ids.reduce((n, id) => n + (cosmeticById(id)?.cost ?? 0), 0)
}

export function adopt(
  ownerId: string,
  species: SpeciesId,
  nickname: string,
  face: FacePreset,
  opts?: { basePetId?: string; headwearId?: string; clothesId?: string; shoesId?: string; motto?: string },
) {
  if (state.pets.some((p) => p.ownerId === ownerId)) return '每人只能领养一只'
  const nameErr = validatePetName(nickname)
  if (nameErr) return nameErr
  const mottoErr = validateMotto(opts?.motto ?? '')
  if (mottoErr) return mottoErr
  const petName = nickname.trim()
  const motto = (opts?.motto ?? '').trim()
  const base = (opts?.basePetId && basePetById(opts.basePetId)) || basePetForSpecies(species)
  const headwearId = opts?.headwearId ?? 'hw_leaf'
  const clothesId = opts?.clothesId ?? 'cl_scarf'
  const shoesId = opts?.shoesId ?? 'sh_none'
  const cost = adoptCost([headwearId, clothesId, shoesId])
  const bal = balance(state, ownerId)
  if (cost > bal) return '养成积分不足'
  const today = todayStr(state)
  const ledger = [...state.ledger]
  if (cost > 0) {
    ledger.push({
      id: uid('led'),
      studentId: ownerId,
      date: today,
      delta: -cost,
      kind: 'spend',
      reason: '领养装扮',
    })
  }
  const have = new Set(state.unlocked[ownerId] || ['skin_basic_leaf'])
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
    face,
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
  set({
    ...state,
    ledger,
    pets: [...state.pets, pet],
    unlocked: { ...state.unlocked, [ownerId]: [...have] },
  })
  return null
}


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

function assignMissingSeats(users: AppState['users'], layout: ClassLayout): AppState['users'] {
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

/** 调座：空位直接落座；已被占用则互换。 */
export function assignSeat(studentId: string, row: number, col: number): string | null {
  const denied = requireHomeroom()
  if (denied) return denied
  const layout = classLayoutOf(state)
  if (row < 1 || col < 1 || row > layout.rows || col > layout.cols) return '座位超出教室范围'
  const me = state.users.find((x) => x.id === studentId)
  if (!me || me.role !== 'student') return '只能给学生排座'
  const other = occupantAt(state.users, row, col)
  if (other && other.id === studentId) return null
  set({
    ...state,
    users: state.users.map((u) => {
      if (u.id === studentId) return { ...u, seat: { row, col } }
      if (other && u.id === other.id) return { ...u, seat: me.seat }
      return u
    }),
  })
  return null
}

export function addStudent(name: string): string | null {
  const denied = requireHomeroom()
  if (denied) return denied
  const n = name.trim()
  if (!n) return '姓名必填'
  if (state.users.some((u) => u.role === 'student' && u.name === n)) return '姓名已在花名册中'
  const layout = classLayoutOf(state)
  const seat = firstEmptySeat(state.users, layout)
  if (!seat) return '座位已满'
  const id = uid('s')
  set({
    ...state,
    users: [...state.users, { id, name: n, role: 'student', code: 'student', classId: ONLY_CLASS, dnd: false, seat }],
    classScores: { ...state.classScores, [id]: 0 },
    personalOkrs: { ...state.personalOkrs, [id]: emptyPersonalOkr(weekIdOf(state), FALLBACK_O[0]) },
    krTicks: state.krTicks ?? [],
  })
  return null
}

export function renameStudent(studentId: string, name: string): string | null {
  const denied = requireHomeroom()
  if (denied) return denied
  const n = name.trim()
  if (!n) return '姓名必填'
  const u = state.users.find((x) => x.id === studentId)
  if (!u || u.role !== 'student') return '只能改学生姓名'
  if (state.users.some((x) => x.role === 'student' && x.name === n && x.id !== studentId)) return '姓名已在花名册中'
  set({
    ...state,
    users: state.users.map((x) => (x.id === studentId ? { ...x, name: n } : x)),
  })
  return null
}

export function deleteStudent(studentId: string): string | null {
  const denied = requireHomeroom()
  if (denied) return denied
  const err = leaveClassWipe(studentId)
  if (err) return err
  const classScores = { ...state.classScores }
  delete classScores[studentId]
  set({
    ...state,
    users: state.users.filter((u) => u.id !== studentId),
    classScores,
    personalOkrs: Object.fromEntries(Object.entries(state.personalOkrs ?? {}).filter(([k]) => k !== studentId)),
  })
  return null
}

export function updateFace(ownerId: string, face: FacePreset, species?: SpeciesId) {
  set({
    ...state,
    pets: state.pets.map((p) =>
      p.ownerId === ownerId ? { ...p, face, ...(species ? { species } : {}) } : p,
    ),
  })
}

function applyCare(ownerId: string, _spend: number, reason: string, mood: number, _hunger: number, expr: Expression) {
  if (isClassHourLocked(state, ownerId)) return '上课中，课后再照料'
  const today = todayStr(state)
  const pet = state.pets.find((p) => p.ownerId === ownerId)
  if (!pet) return '还没有宠物'
  let growth = pet.growth
  let lastCareGrowthDate = pet.lastCareGrowthDate
  if (pet.lastCareGrowthDate !== today) {
    growth += 8
    lastCareGrowthDate = today
  }
  const at = new Date(nowMs(state)).toISOString()
  set(
    applyAchievements({
      ...state,
      pets: state.pets.map((p) =>
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
  void reason
  return null
}

export function tapPet(ownerId: string) {
  return applyCare(ownerId, 0, '轻点', 2, 0, 'happy')
}
export function petPet(ownerId: string) {
  return applyCare(ownerId, 0, '抚摸', 10, 0, 'shy')
}
export function feedPet(ownerId: string) {
  return applyCare(ownerId, 0, '喂食', 6, 0, 'cheer')
}

export function submitReport(authorId: string, category: ReportCategory, evidence: string) {
  const today = todayStr(state)
  if (!canSubmit(state, authorId, today)) return '今日申报已达 4 条'
  if (!evidence.trim()) return '需要文字证据'
  if (category === ('exam_rank' as ReportCategory)) return '考试名次不加分'
  const report = {
    id: uid('rep'),
    authorId,
    date: today,
    category,
    evidence: evidence.trim(),
    status: 'in_review' as const,
    peerFacts: 0,
    peerDoubts: 0,
    queuedAt: null,
    submittedAt: new Date().toISOString(),
    credited: false,
  }
  set(applyAchievements({ ...state, reports: [...state.reports, report] }))
  return null
}

export function peerReview(reviewerId: string, reportId: string, verdict: 'fact' | 'doubt') {
  const today = todayStr(state)
  if (!canReview(state, reviewerId, today)) return '今日互评已达 3 条'
  const report = state.reports.find((r) => r.id === reportId)
  if (!report) return '申报不存在'
  if (report.authorId === reviewerId) return '不能评自己'
  if (state.reviews.some((r) => r.reportId === reportId && r.reviewerId === reviewerId)) {
    return '已评过这条'
  }
  const reviews = [
    ...state.reviews,
    { id: uid('rv'), reportId, reviewerId, date: today, verdict },
  ]
  const reports = state.reports.map((r) => {
    if (r.id !== reportId) return r
    const peerFacts = r.peerFacts + (verdict === 'fact' ? 1 : 0)
    const peerDoubts = r.peerDoubts + (verdict === 'doubt' ? 1 : 0)
    const status = peerDoubts > 0 || peerFacts >= 1 ? 'queued' : r.status
    return { ...r, peerFacts, peerDoubts, status, queuedAt: r.queuedAt ?? today }
  })
  set({ ...state, reviews, reports })
  return null
}

export function teacherAudit(reportId: string, action: 'approve' | 'reject') {
  const denied = requireStaff()
  if (denied) return denied
  const today = todayStr(state)
  const report = state.reports.find((r) => r.id === reportId)
  if (!report || report.credited) return '无法处理'
  const pts = CATEGORY_POINTS[report.category]
  let ledger = [...state.ledger]
  if (action === 'approve') {
    if (!canEarn(state, report.authorId, today, pts)) return `该生日入账将超过 ${8} 分`
    ledger.push({
      id: uid('led'),
      studentId: report.authorId,
      date: today,
      delta: pts,
      kind: 'earn',
      reason: categoryLabel(report.category),
      ref: reportId,
    })
  }
  set(applyAchievements({
    ...state,
    ledger,
    reports: state.reports.map((r) =>
      r.id === reportId
        ? {
            ...r,
            status: action === 'approve' ? 'posted' : 'rejected',
            credited: action === 'approve',
          }
        : r,
    ),
  }))
  return null
}

export function social(
  fromId: string,
  toId: string,
  type: 'visit' | 'emoji' | 'snack' | 'cotrain',
  emoji?: string,
) {
  if (isClassHourLocked(state, fromId) || isClassHourLocked(state, toId)) {
    return '上课中，课后再照料'
  }
  const today = todayStr(state)
  const from = state.users.find((u) => u.id === fromId)
  const to = state.users.find((u) => u.id === toId)
  if (!to || to.role !== 'student') return '只能访问本班同学'
  if (from?.classId && to.classId && from.classId !== to.classId) return '只能访问本班同学'
  if (to.dnd) return '对方已开启免打扰'
  if (fromId === toId && type !== 'visit') return '不能对自己使用该互动'
  if (type === 'cotrain') {
    if (state.visits.some((v) => v.date === today && v.type === 'cotrain' && (v.fromId === fromId || v.toId === fromId))) {
      return '每人每天只能共训一次'
    }
    if (state.visits.some((v) => v.date === today && v.type === 'cotrain' && (v.fromId === toId || v.toId === toId))) {
      return '对方今日已共训'
    }
    if (!canSpend(state, fromId, today, 2) || !canSpend(state, toId, today, 2)) {
      return '双方积分或今日消耗额度不足（各 −2）'
    }
  }
  if (type === 'snack') {
    if (!canSpend(state, fromId, today, 2)) return '今日消耗已满或积分不足'
  }
  const ledger = [...state.ledger]
  if (type === 'snack') {
    ledger.push({ id: uid('led'), studentId: fromId, date: today, delta: -2, kind: 'spend', reason: '投喂点心' })
  }
  if (type === 'cotrain') {
    ledger.push({ id: uid('led'), studentId: fromId, date: today, delta: -2, kind: 'spend', reason: '共训' })
    ledger.push({ id: uid('led'), studentId: toId, date: today, delta: -2, kind: 'spend', reason: '共训' })
  }
  const pets = state.pets.map((p) => {
    if (p.ownerId === toId && (type === 'snack' || type === 'emoji' || type === 'visit')) {
      return { ...p, mood: Math.min(100, p.mood + 4), expression: 'happy' as Expression }
    }
    if ((p.ownerId === fromId || p.ownerId === toId) && type === 'cotrain') {
      return { ...p, mood: Math.min(100, p.mood + 8), expression: 'focus' as Expression }
    }
    return p
  })
  set({
    ...state,
    ledger,
    pets,
    visits: [...state.visits, { id: uid('vi'), fromId, toId, date: today, type, emoji }],
  })
  return null
}

export function toggleDnd(userId: string) {
  set({
    ...state,
    users: state.users.map((u) => (u.id === userId ? { ...u, dnd: !u.dnd } : u)),
  })
}

export function squadCombo(teamId: string) {
  const week = currentWeek()
  const sw = state.squadWeeks.find((s) => s.weekId === week && s.teamId === teamId)
  if (!sw) return '本周小队未开赛'
  if (sw.comboUsed) return '本周连携已使用'
  set({
    ...state,
    squadWeeks: state.squadWeeks.map((s) =>
      s.weekId === week && s.teamId === teamId
        ? { ...s, comboUsed: true, points: s.points + 3 }
        : s,
    ),
  })
  return null
}

export function currentWeek() {
  return weekIdOf(state)
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
  let honors = [...s.honors]
  const squadWeeks = s.squadWeeks.map((sw) => {
    if (sw.weekId !== week) return sw
    const honor = squadTier(sw.points) ?? undefined
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
      if (!honorAllowed(honors, sid, week)) continue
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

export function settleHonor(studentId: string, label: string) {
  const denied = requireHomeroom()
  if (denied) return denied
  const week = currentWeek()
  if (honorsInWeek(state.honors, week) >= HONOR_WALL_MAX) return '本周荣誉橱窗最多 6 席'
  if (!honorAllowed(state.honors, studentId, week)) {
    return `同一人连续上墙不得超过 ${HONOR_STREAK_MAX} 次`
  }
  set({
    ...state,
    honors: [...state.honors, { id: uid('h'), weekId: week, studentId, label }],
  })
  return null
}

export function settleCurrentWeek() {
  const denied = requireHomeroom()
  if (denied) return denied
  const week = currentWeek()
  if (alreadySettled(state, week)) return '本周已结算'
  set(applyAchievements(applyHonorForWeek(ensureSquadRows(state, week), week)))
  return null
}

export function advanceWeek() {
  const denied = requireHomeroom()
  if (denied) return denied
  const today = todayStr(state)
  const nextDay = addDays(today, 7)
  const prev = currentWeek()
  let next: AppState = { ...state, todayOverride: nextDay }
  next = maybeAutoSettle(next)
  if (!alreadySettled(next, prev) && prev < weekIdOf(next)) {
    next = applyHonorForWeek(next, prev)
  }
  set(applyAchievements(next))
  return `已进入 ${weekIdOf(getState())}，并自动结算 ${prev}`
}

export function toggleClassHour(classId: string) {
  if (requireStaff()) return
  set({
    ...state,
    inClassHour: { ...state.inClassHour, [classId]: !state.inClassHour?.[classId] },
  })
}

export function buyItem(studentId: string, itemId: string) {
  const item = SHOP_ITEMS.find((i) => i.id === itemId)
  if (!item) return '商品不存在'
  if (item.rare || item.kind === 'mount' || itemId === MOUNT_ID || itemId === REFLECT_CHIP) {
    return '稀有外观与坐骑仅能由成就/周赛解锁，不可购买'
  }
  const have = state.unlocked[studentId] || []
  if (have.includes(itemId)) return '已拥有'
  const today = todayStr(state)
  const bal = balance(state, studentId)
  if (bal < item.cost) return `积分不足，还差 ${item.cost - bal} 分`
  if (!canSpend(state, studentId, today, item.cost)) return '今日消耗将超过 6'
  set({
    ...state,
    ledger: [
      ...state.ledger,
      {
        id: uid('led'),
        studentId,
        date: today,
        delta: -item.cost,
        kind: 'spend',
        reason: `兑换 ${item.name}`,
      },
    ],
    unlocked: { ...state.unlocked, [studentId]: [...have, itemId] },
  })
  return null
}

export function equip(studentId: string, itemId: string) {
  const have = state.unlocked[studentId] || []
  if (!have.includes(itemId)) return '未解锁'
  const item = SHOP_ITEMS.find((i) => i.id === itemId)
  const cos = cosmeticById(itemId)
  set({
    ...state,
    pets: state.pets.map((p) => {
      if (p.ownerId !== studentId) return p
      if (item?.kind === 'mount' || itemId === MOUNT_ID) return { ...p, mountId: itemId }
      if (cos?.slot === 'headwear') return { ...p, headwearId: itemId }
      if (cos?.slot === 'clothes') return { ...p, clothesId: itemId }
      if (cos?.slot === 'shoes') return { ...p, shoesId: itemId }
      return { ...p, skinId: itemId }
    }),
  })
  return null
}

export function giftBlocked() {
  return '禁止赠送'
}

export function transferBlocked() {
  return '积分不可转让'
}


export function setDailyMood(studentId: string, mood: MoodId): string | null {
  const u = state.users.find((x) => x.id === studentId)
  if (!u || u.role !== 'student') return '只有学生能记心情'
  const today = todayStr(state)
  const dailyMoods = (state.dailyMoods ?? []).filter((m) => !(m.studentId === studentId && m.date === today))
  dailyMoods.push({ studentId, date: today, mood })
  let pets = state.pets
  if (majorityRain({ ...state, dailyMoods })) {
    pets = pets.map((p) => ({ ...p, expression: 'tired' as Expression }))
  }
  set({ ...state, dailyMoods, pets })
  return null
}

export function submitKrTick(studentId: string, note: string): string | null {
  const u = state.users.find((x) => x.id === studentId)
  if (!u || u.role !== 'student') return '只有学生能勾选自己的关键结果'
  const n = note.trim()
  if (!n) return '打钩需要一句短证据'
  if (n.length > 24) return '证据请控制在 24 字内'
  if (!/[一-鿿]/.test(n)) return '请用简短中文写下证据'
  const cur = personalOkrOf(state, studentId)
  const pending = pendingTicksOf(state, studentId).length
  if (cur.krDone + pending >= cur.krTarget) return '本周关键结果已满或已有待确认'
  const week = weekIdOf(state)
  const tick: KrTick = {
    id: uid('kt'),
    studentId,
    weekId: week,
    date: todayStr(state),
    note: n,
    status: 'pending',
    confirmerId: null,
  }
  set({ ...state, krTicks: [...(state.krTicks ?? []), tick] })
  return null
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
      growth: grew ? p.growth + 8 : p.growth,
      mood: Math.min(100, p.mood + 4),
      expression: 'cheer' as Expression,
    }
  })
  return maybeUnlockReflect({ ...s, personalOkrs, pets }, studentId)
}

export function confirmKrTick(tickId: string, confirmerId: string): string | null {
  const tick = (state.krTicks ?? []).find((k) => k.id === tickId)
  if (!tick) return '没有这条勾选'
  if (tick.status === 'confirmed') return '已经确认过了'
  if (tick.studentId === confirmerId) return '不能确认自己的勾选'
  const who = state.users.find((u) => u.id === confirmerId)
  if (!who || (who.role !== 'student' && !isStaffRole(who.role))) return '只有同学或老师能确认'
  if (who.role === 'student' && who.classId !== state.users.find((u) => u.id === tick.studentId)?.classId) {
    return '只能确认本班同学'
  }
  let s: AppState = {
    ...state,
    krTicks: (state.krTicks ?? []).map((k) =>
      k.id === tickId ? { ...k, status: 'confirmed' as const, confirmerId } : k,
    ),
  }
  s = creditConfirmedTick(s, tick.studentId)
  set(s)
  return null
}


export function markClassBaseDone(): string | null {
  const denied = requireHomeroom()
  if (denied) return denied
  const week = weekIdOf(state)
  const today = todayStr(state)
  const roster = state.users.filter((u) => u.role === 'student' && u.classId === ONLY_CLASS)
  let habits = [...(state.baseHabits ?? [])]
  let added = 0
  for (const u of roster) {
    const cur = habits.find((h) => h.studentId === u.id && h.date === today)
    if (cur?.status === 'excluded') continue
    if (cur?.status === 'done') continue
    habits.push({ studentId: u.id, weekId: week, date: today, status: 'done' })
    added += 1
  }
  const classOkr = classOkrOf(state)
  set({
    ...state,
    baseHabits: habits,
    classOkr: { ...classOkr, doneCount: classOkr.doneCount + added },
    classSession: state.classSession?.active
      ? { ...state.classSession, classKrMoved: state.classSession.classKrMoved || added > 0 }
      : state.classSession,
  })
  return added ? `已记 ${added} 人今日基础达标` : '今日基础已记过，或全员为例外'
}

export function excludeStudentBase(studentId: string): string | null {
  const denied = requireStaff()
  if (denied) return denied
  const u = state.users.find((x) => x.id === studentId)
  if (!u || u.role !== 'student') return '只能标记学生'
  const today = todayStr(state)
  const week = weekIdOf(state)
  const habits = [...(state.baseHabits ?? [])]
  const idx = habits.findIndex((h) => h.studentId === studentId && h.date === today)
  let undo = false
  if (idx >= 0) {
    undo = habits[idx].status === 'done'
    habits[idx] = { ...habits[idx], status: 'excluded' }
  } else {
    habits.push({ studentId, weekId: week, date: today, status: 'excluded' })
  }
  const classOkr = classOkrOf(state)
  set({
    ...state,
    baseHabits: habits,
    classOkr: undo ? { ...classOkr, doneCount: Math.max(0, classOkr.doneCount - 1) } : classOkr,
  })
  return null
}

export function confirmBreakthrough(studentId: string, note: string): string | null {
  const denied = requireStaff()
  if (denied) return denied
  const u = state.users.find((x) => x.id === studentId)
  if (!u || u.role !== 'student') return '只能给学生记特别突破'
  const pending = pendingTicksOf(state, studentId)
  if (pending.length) return confirmKrTick(pending[0].id, staffConfirmerId())
  const n = note.trim()
  if (!n) return '特别突破需要已有证据，或写一句备注'
  if (n.length > 24) return '备注请控制在 24 字内'
  if (!/[一-鿿]/.test(n)) return '请用中文写备注'
  const cur = personalOkrOf(state, studentId)
  if (cur.krDone >= cur.krTarget) return '个人关键结果已满'
  const week = weekIdOf(state)
  const tick: KrTick = {
    id: uid('kt'),
    studentId,
    weekId: week,
    date: todayStr(state),
    note: n,
    status: 'confirmed',
    confirmerId: staffConfirmerId(),
  }
  let s: AppState = { ...state, krTicks: [...(state.krTicks ?? []), tick] }
  s = creditConfirmedTick(s, studentId)
  set(s)
  return null
}

export function grantClassPerk(text: string): string | null {
  const denied = requireHomeroom()
  if (denied) return denied
  const pct = classOkrProgress(state)
  if (pct < 80) return '班级周关键结果未到 80%，还不能发集体奖励'
  const o = classOkrOf(state)
  if (o.perkGranted) return '本周集体奖励已发放'
  const n = (text || DEFAULT_CLASS_PERK).trim()
  if (!n) return '请写一项中文优惠'
  if (n.length > 24) return '优惠请控制在 24 字内'
  if (!/[一-鿿]/.test(n)) return '请用中文写优惠'
  set({ ...state, classOkr: { ...o, perkText: n, perkGranted: true } })
  return null
}

export const CLASS_REASONS = ['推进个人目标', '帮助班级目标', '走神提醒'] as const
export type ClassReason = (typeof CLASS_REASONS)[number]

export function classScoreOf(studentId: string): number {
  return personalOkrOf(state, studentId).krDone
}

export function sessionDeltaOf(studentId: string): number {
  return state.classSession?.deltas?.[studentId] ?? 0
}

function ensureSession(s: AppState): AppState {
  if (s.classSession?.active) return s
  return {
    ...s,
    classSession: { active: true, deltas: {}, classKrMoved: false },
    inClassHour: { ...s.inClassHour, [ONLY_CLASS]: true },
  }
}

export function startClassSession(): string | null {
  const denied = requireStaff()
  if (denied) return denied
  if (state.classSession?.active) return '本课已开始'
  set(ensureSession(state))
  return null
}

export function endClassSession(): string | null {
  const denied = requireStaff()
  if (denied) return denied
  set({
    ...state,
    classSession: { active: false, deltas: {}, classKrMoved: false },
    inClassHour: { ...state.inClassHour, [ONLY_CLASS]: false },
  })
  return null
}

function applySessionCap(s: AppState, studentId: string, delta: number): string | null {
  const used = s.classSession?.deltas?.[studentId] ?? 0
  const next = used + delta
  if (next > SESSION_POS_CAP) return `本课最多加 ${SESSION_POS_CAP}`
  if (next < -SESSION_NEG_CAP) return `本课最多减 ${SESSION_NEG_CAP}`
  return null
}

export function setStudentObjective(studentId: string, objective: string): string | null {
  const denied = requireHomeroom()
  if (denied) return denied
  const u = state.users.find((x) => x.id === studentId)
  if (!u || u.role !== 'student') return '只能改学生目标'
  const o = objective.trim()
  if (!o) return '目标不能为空'
  if (o.length > 16) return '目标请控制在 16 字内'
  const cur = personalOkrOf(state, studentId)
  set({
    ...state,
    personalOkrs: { ...state.personalOkrs, [studentId]: { ...cur, objective: o } },
  })
  return null
}

export function setStudentKrTarget(studentId: string, n: number): string | null {
  const denied = requireHomeroom()
  if (denied) return denied
  const u = state.users.find((x) => x.id === studentId)
  if (!u || u.role !== 'student') return '只能改学生关键结果'
  const t = Math.max(1, Math.min(12, Math.round(n) || DEFAULT_KR_TARGET))
  const cur = personalOkrOf(state, studentId)
  set({
    ...state,
    personalOkrs: { ...state.personalOkrs, [studentId]: { ...cur, krTarget: t, krDone: Math.min(cur.krDone, t) } },
  })
  return null
}

export function setClassObjective(objective: string): string | null {
  const denied = requireHomeroom()
  if (denied) return denied
  const o = objective.trim()
  if (!o) return '班级目标不能为空'
  if (o.length > 16) return '目标请控制在 16 字内'
  const cur = classOkrOf(state)
  set({ ...state, classOkr: { ...cur, objective: o } })
  return null
}

export function tapClassKr(n = 1): string | null {
  const denied = requireStaff()
  if (denied) return denied
  let s = ensureSession(state)
  const nextCount = Math.max(0, classOkrOf(s).doneCount + n)
  const cur = classOkrOf(s)
  set({
    ...s,
    classOkr: { ...cur, doneCount: nextCount },
    classSession: { ...s.classSession!, classKrMoved: s.classSession!.classKrMoved || n > 0 },
  })
  return null
}

/** 记分板：理由对应个人 / 班级 OKR，本课上限 +6 / −3 */
export function adjustClassScore(studentId: string, delta: number, reason: string): string | null {
  const denied = requireStaff()
  if (denied) return denied
  const u = state.users.find((x) => x.id === studentId)
  if (!u || u.role !== 'student') return '只能给学生记课堂记录'
  if (!CLASS_REASONS.includes(reason as ClassReason)) return '请选择与目标相关的理由'
  if (reason === '走神提醒' && delta > 0) return '走神提醒只能减'
  if (reason !== '走神提醒' && delta < 0) return '该理由请用加分'
  let s = ensureSession(state)
  const cap = applySessionCap(s, studentId, delta)
  if (cap) return cap
  const today = todayStr(s)
  let personalOkrs = { ...s.personalOkrs }
  let classOkr = classOkrOf(s)
  let classKrMoved = s.classSession!.classKrMoved
  let pets = s.pets
  if (reason === '推进个人目标' && delta > 0) {
    const pending = pendingTicksOf(s, studentId)
    if (pending.length) {
      const take = pending.slice(0, Math.max(1, delta))
      s = {
        ...s,
        krTicks: (s.krTicks ?? []).map((k) =>
          take.some((x) => x.id === k.id) ? { ...k, status: 'confirmed' as const, confirmerId: staffConfirmerId() } : k,
        ),
      }
      for (const _ of take) s = creditConfirmedTick(s, studentId)
      personalOkrs = s.personalOkrs
      pets = s.pets
    } else {
    const cur = personalOkrOf(s, studentId)
    const ticks = Math.min(delta, Math.max(0, cur.krTarget - cur.krDone))
    if (ticks <= 0) return '个人关键结果已满'
    const grew = cur.lastTickDate !== today
    personalOkrs[studentId] = {
      ...cur,
      krDone: cur.krDone + ticks,
      lastTickDate: today,
    }
    if (grew) {
      pets = pets.map((p) =>
        p.ownerId === studentId
          ? { ...p, growth: p.growth + 8, mood: Math.min(100, p.mood + 4), expression: 'cheer' as Expression }
          : p,
      )
    } else {
      pets = pets.map((p) =>
        p.ownerId === studentId
          ? { ...p, mood: Math.min(100, p.mood + 4), expression: 'cheer' as Expression }
          : p,
      )
    }
    }
  } else if (reason === '帮助班级目标' && delta > 0) {
    classOkr = { ...classOkr, doneCount: classOkr.doneCount + 1 }
    classKrMoved = true
    pets = pets.map((p) =>
      p.ownerId === studentId ? { ...p, mood: Math.min(100, p.mood + 4), expression: 'cheer' as Expression } : p,
    )
  } else if (reason === '走神提醒') {
    /* 不公开减分、不把宠物画成疲惫惩罚 */
  }
  const deltas = { ...s.classSession!.deltas, [studentId]: (s.classSession!.deltas[studentId] ?? 0) + delta }
  set({
    ...s,
    personalOkrs,
    classOkr,
    pets,
    classSession: { active: true, deltas, classKrMoved },
    ledger: [
      ...s.ledger,
      {
        id: uid('cs'),
        studentId,
        date: today,
        delta: 0,
        kind: delta >= 0 ? 'earn' : 'reverse',
        reason: `核验 · ${reason}`,
      },
    ],
  })
  return null
}

export function praiseWholeClass(reason = '全班表扬'): string | null {
  const denied = requireStaff()
  if (denied) return denied
  let s = ensureSession(state)
  if (!s.classSession?.classKrMoved) return '本课班级目标尚未推进，暂不可全班表扬'
  const students = s.users.filter((u) => u.role === 'student' && u.classId === 'c1')
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
    })
  }
  set({ ...s, pets, ledger })
  return null
}

export function remindDistract(studentId: string): string | null {
  const u = state.users.find((x) => x.id === studentId)
  if (!u || u.role !== 'student') return '只能提醒学生'
  return null
}

export { SHOP_ITEMS, balance, BASE_PETS, COSMETICS, MOOD_LABEL, honorsInWeek, withPetLife }
export { growthStage, petMissCopy, liveHunger } from './rules'
