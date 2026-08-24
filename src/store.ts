import { createSeed, SHOP_ITEMS } from './seed'
import type { AppState, ClassLayout, Expression, FacePreset, Pet, ReportCategory, Seat, SpeciesId } from './types'
import { DEFAULT_LAYOUT, seatKey } from './types'
import { SKIN_TO_CLOTHES } from './types'
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
  isClassHourLocked,
  squadTier,
  todayStr,
  weekIdFromDate,
  weekIdOf,
} from './rules'
import type { HonorItem, HonorTier } from './types'

const KEY = 'class-pet-mvp-v8'

const ONLY_CLASS = 'c1'

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
  }
}

function migrate(s: AppState): AppState {
  const seed = createSeed()
  const savedById = new Map((s.users ?? []).map((u) => [u.id, u]))
  const seedUsers = seed.users.map((su) => {
    const old = savedById.get(su.id)
    if (!old) return { ...su, classId: ONLY_CLASS, classIds: su.role === 'teacher' ? [ONLY_CLASS] : su.classIds }
    return {
      ...su,
      dnd: old.dnd,
      name: old.name || su.name,
      seat: old.seat ?? su.seat,
      classId: ONLY_CLASS,
      classIds: su.role === 'teacher' ? [ONLY_CLASS] : su.classIds,
    }
  })
  const seedIds = new Set(seed.users.map((u) => u.id))
  const extras = (s.users ?? []).filter((u) => !seedIds.has(u.id)).map((u) => ({
    ...u,
    classId: u.role === 'student' || u.role === 'teacher' ? ONLY_CLASS : u.classId,
  }))
  const users = assignMissingSeats([...seedUsers, ...extras], s.classLayout ?? seed.classLayout ?? DEFAULT_LAYOUT)
  const studentIds = new Set(users.filter((u) => u.role === 'student').map((u) => u.id))
  let pets = (s.pets ?? []).filter((p) => studentIds.has(p.ownerId)).map(normalizePet)
  for (const p of seed.pets) {
    if (!pets.some((x) => x.ownerId === p.ownerId)) pets = [...pets, normalizePet(p)]
  }
  const classScores: Record<string, number> = {}
  for (const id of studentIds) {
    const saved = s.classScores?.[id]
    classScores[id] = typeof saved === 'number' ? saved : (seed.classScores?.[id] ?? 0)
  }
  const session = s.session
    ? { userId: s.session.userId, viewClassId: ONLY_CLASS }
    : null
  return {
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
  }
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
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

function boot(s: AppState): AppState {
  return applyAchievements(maybeAutoSettle(autoCreditTimedOut(ensureSized(s))))
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
  localStorage.removeItem(KEY)
  state = boot(createSeed())
  persist()
}

export function login(role: AppState['users'][0]['role'], name: string): string | null {
  const u = state.users.find((x) => x.role === role && x.name === name.trim())
  if (!u) return '姓名与角色不匹配。演示：叶老师 / 林小舟 / 林妈妈'
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
  })
  return null
}

export function renameStudent(studentId: string, name: string): string | null {
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
  const err = leaveClassWipe(studentId)
  if (err) return err
  const classScores = { ...state.classScores }
  delete classScores[studentId]
  set({
    ...state,
    users: state.users.filter((u) => u.id !== studentId),
    classScores,
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

function applyCare(ownerId: string, spend: number, reason: string, mood: number, hunger: number, expr: Expression) {
  if (isClassHourLocked(state, ownerId)) return '上课中，课后再照料'
  const today = todayStr(state)
  if (spend > 0 && !canSpend(state, ownerId, today, spend)) {
    return '今日消耗已达上限 6，或积分不足'
  }
  const pet = state.pets.find((p) => p.ownerId === ownerId)
  if (!pet) return '还没有宠物'
  let growth = pet.growth
  let lastCareGrowthDate = pet.lastCareGrowthDate
  if (spend > 0 && pet.lastCareGrowthDate !== today) {
    growth += 8
    lastCareGrowthDate = today
  }
  const ledger = [...state.ledger]
  if (spend > 0) {
    ledger.push({
      id: uid('led'),
      studentId: ownerId,
      date: today,
      delta: -spend,
      kind: 'spend',
      reason,
    })
  }
  set(
    applyAchievements({
      ...state,
      ledger,
      pets: state.pets.map((p) =>
        p.ownerId === ownerId
          ? {
              ...p,
              mood: Math.max(0, Math.min(100, p.mood + mood)),
              hunger: Math.max(0, Math.min(100, p.hunger + hunger)),
              growth,
              lastCareDate: today,
              lastCareGrowthDate,
              expression: expr,
            }
          : p,
      ),
    }),
  )
  return null
}

export function tapPet(ownerId: string) {
  return applyCare(ownerId, 0, '轻点', 2, 0, 'happy')
}
export function petPet(ownerId: string) {
  return applyCare(ownerId, 2, '抚摸', 10, 0, 'shy')
}
export function feedPet(ownerId: string) {
  return applyCare(ownerId, 2, '喂食', 6, 18, 'cheer')
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
  set({
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
  })
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
      if (!honorAllowed(honors, sid)) continue
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
  if (state.honors.length >= HONOR_WALL_MAX) return '荣誉橱窗最多 6 席'
  if (!honorAllowed(state.honors, studentId)) {
    return `同一人连续上墙不得超过 ${HONOR_STREAK_MAX} 次`
  }
  set({
    ...state,
    honors: [...state.honors, { id: uid('h'), weekId: currentWeek(), studentId, label }],
  })
  return null
}

export function settleCurrentWeek() {
  const week = currentWeek()
  if (alreadySettled(state, week)) return '本周已结算'
  set(applyAchievements(applyHonorForWeek(ensureSquadRows(state, week), week)))
  return null
}

export function advanceWeek() {
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
  set({
    ...state,
    inClassHour: { ...state.inClassHour, [classId]: !state.inClassHour?.[classId] },
  })
}

export function buyItem(studentId: string, itemId: string) {
  const item = SHOP_ITEMS.find((i) => i.id === itemId)
  if (!item) return '商品不存在'
  if (item.rare || item.kind === 'mount' || itemId === MOUNT_ID) {
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
  set({
    ...state,
    pets: state.pets.map((p) => {
      if (p.ownerId !== studentId) return p
      if (item?.kind === 'mount' || itemId === MOUNT_ID) return { ...p, mountId: itemId }
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


export const CLASS_REASONS = ['发言', '作业', '互助', '纪律'] as const

export function classScoreOf(studentId: string): number {
  return state.classScores?.[studentId] ?? 0
}

/** 课堂分：不受每日 8 分养成上限 */
export function adjustClassScore(studentId: string, delta: number, reason: string): string | null {
  const u = state.users.find((x) => x.id === studentId)
  if (!u || u.role !== 'student') return '只能给学生记课堂分'
  const today = todayStr(state)
  const next = Math.max(0, (state.classScores?.[studentId] ?? 0) + delta)
  const pets = state.pets.map((p) => {
    if (p.ownerId !== studentId) return p
    const mood = Math.max(0, Math.min(100, p.mood + (delta > 0 ? 4 : -6)))
    return { ...p, mood, expression: (delta > 0 ? 'cheer' : 'tired') as Expression }
  })
  set({
    ...state,
    classScores: { ...state.classScores, [studentId]: next },
    pets,
    ledger: [
      ...state.ledger,
      {
        id: uid('cs'),
        studentId,
        date: today,
        delta: 0,
        kind: delta >= 0 ? 'earn' : 'reverse',
        reason: `课堂分 ${delta > 0 ? '+' : ''}${delta} · ${reason}`,
      },
    ],
  })
  return null
}

export function praiseWholeClass(reason = '全班表扬'): string | null {
  const students = state.users.filter((u) => u.role === 'student' && u.classId === 'c1')
  const today = todayStr(state)
  const classScores = { ...state.classScores }
  const pets = state.pets.map((p) => {
    if (!students.some((u) => u.id === p.ownerId)) return p
    return { ...p, mood: Math.min(100, p.mood + 4), expression: 'cheer' as Expression }
  })
  const ledger = [...state.ledger]
  for (const u of students) {
    classScores[u.id] = (classScores[u.id] ?? 0) + 1
    ledger.push({
      id: uid('cs'),
      studentId: u.id,
      date: today,
      delta: 0,
      kind: 'earn',
      reason: `课堂分 +1 · ${reason}`,
    })
  }
  set({ ...state, classScores, pets, ledger })
  return null
}

export { SHOP_ITEMS, balance, BASE_PETS, COSMETICS }
