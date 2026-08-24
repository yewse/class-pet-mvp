/**
 * 客户端状态：服务端才是唯一事实源。
 * 这里只做「视图缓存 + 动作转发」：每个动作 POST 到 /api/action，
 * 服务端校验身份与规则后回传本角色可见的新视图。
 */
import { apiGet, apiPost } from './api'
import type { AppState, FacePreset, MoodId, ReportCategory, Role, RuleConfig, SpeciesId } from './types'

/* 只读选择器与共享目录：直接复用引擎与规则层 */
export {
  classIdOf,
  classLayoutOf,
  classMoodMix,
  classOkrOf,
  classOkrProgress,
  classPerkOf,
  emptyPersonalOkr,
  moodOf,
  occupantAt,
  okrHistoryOf,
  pendingTicksOf,
  personalOkrOf,
  petDisplayName,
  reviewCandidate,
  stalePendingTicks,
  todayBaseOf,
  validateMotto,
  validatePetName,
  adoptCost,
} from './engine'
export { balance } from './rules'
export { SHOP_ITEMS } from './shop'

/* ---------- 会话与缓存 ---------- */

export type Phase = 'loading' | 'setup' | 'anon' | 'ready'

export interface Me {
  id: string
  role: Role
  name: string
  studentNo?: string
  classId?: string
  classIds: string[]
  classes: { id: string; name: string }[]
  schoolName: string
}

export interface BootstrapInfo {
  setupNeeded: boolean
  schoolName: string | null
  classes: { id: string; name: string }[]
}

export interface Snapshot {
  phase: Phase
  me: Me | null
  state: AppState | null
  activeClassId: string | null
  bootstrap: BootstrapInfo | null
  offline: boolean
}

let snap: Snapshot = { phase: 'loading', me: null, state: null, activeClassId: null, bootstrap: null, offline: false }
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function patch(p: Partial<Snapshot>) {
  snap = { ...snap, ...p }
  emit()
}

export function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function getSnapshot(): Snapshot {
  return snap
}

export function getState(): AppState | null {
  return snap.state
}

export async function initStore() {
  const boot = await apiGet<BootstrapInfo>('/bootstrap')
  if (!boot.ok || !boot.data) {
    patch({ phase: 'anon', offline: true, bootstrap: { setupNeeded: false, schoolName: null, classes: [] } })
    return
  }
  if (boot.data.setupNeeded) {
    patch({ phase: 'setup', bootstrap: boot.data, offline: false })
    return
  }
  patch({ bootstrap: boot.data, offline: false })
  const me = await apiGet<Me>('/me')
  if (!me.ok || !me.data) {
    patch({ phase: 'anon', me: null, state: null })
    return
  }
  if (me.data.role === 'admin') {
    // 管理员不进班级视图：只维护教师账号与激励规则，看不到学生过程数据
    patch({ phase: 'ready', me: me.data, activeClassId: null, state: null })
    return
  }
  const activeClassId = me.data.classId ?? me.data.classIds[0] ?? null
  patch({ me: me.data, activeClassId })
  await refreshState()
}

export async function refreshState(): Promise<void> {
  if (!snap.me || !snap.activeClassId) return
  const res = await apiGet<AppState>(`/state?classId=${encodeURIComponent(snap.activeClassId)}`)
  if (res.status === 401) {
    patch({ phase: 'anon', me: null, state: null })
    return
  }
  if (res.ok && res.data) {
    patch({ phase: 'ready', state: res.data, offline: false })
  } else if (res.status === 0) {
    patch({ offline: true })
  }
}

export async function setActiveClass(classId: string) {
  if (!snap.me?.classIds.includes(classId)) return
  patch({ activeClassId: classId })
  await refreshState()
}

/* ---------- 认证 ---------- */

export async function doSetup(args: {
  schoolName: string
  adminName: string
  username: string
  password: string
}): Promise<string | null> {
  const res = await apiPost('/setup', args)
  if (!res.ok) return res.error
  await initStore()
  return null
}

export async function teacherLogin(username: string, password: string): Promise<string | null> {
  const res = await apiPost('/auth/teacher-login', { username, password })
  if (!res.ok) return res.error
  await initStore()
  return null
}

export async function studentLogin(args: {
  classId: string
  name: string
  studentNo?: string
  pin: string
}): Promise<string | null> {
  const res = await apiPost('/auth/student-login', args)
  if (!res.ok) return res.error
  await initStore()
  return null
}

export async function logout() {
  await apiPost('/auth/logout')
  patch({ phase: 'anon', me: null, state: null, activeClassId: null })
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<string | null> {
  const res = await apiPost('/auth/change-password', { oldPassword, newPassword })
  return res.ok ? null : res.error
}

/* ---------- 动作通道 ---------- */

interface ActionResponse {
  ok: boolean
  result: unknown
  state: AppState
}

async function action(type: string, payload: Record<string, unknown> = {}): Promise<string | null> {
  if (!snap.activeClassId) return '尚未选择班级'
  const res = await apiPost<ActionResponse>('/action', { classId: snap.activeClassId, type, payload })
  if (res.status === 401) {
    patch({ phase: 'anon', me: null, state: null })
    return '登录已过期，请重新登录'
  }
  if (res.ok && res.data?.state) {
    patch({ state: res.data.state })
    return null
  }
  return res.error
}

async function actionWithResult<T>(type: string, payload: Record<string, unknown> = {}): Promise<{ error: string | null; result: T | null }> {
  if (!snap.activeClassId) return { error: '尚未选择班级', result: null }
  const res = await apiPost<ActionResponse>('/action', { classId: snap.activeClassId, type, payload })
  if (res.ok && res.data?.state) {
    patch({ state: res.data.state })
    return { error: null, result: (res.data.result as T) ?? null }
  }
  return { error: res.error, result: null }
}

/* 照料与心情（服务端以会话身份执行，忽略传入的 studentId） */
export const tapPet = (_sid?: string) => action('tapPet')
export const petPet = (_sid?: string) => action('petPet')
export const feedPet = (_sid?: string) => action('feedPet')
export const setDailyMood = (_sid: string, mood: MoodId) => action('setDailyMood', { mood })

/* 领养 / 商店 */
export function adopt(
  _ownerId: string,
  species: SpeciesId,
  nickname: string,
  face: FacePreset,
  opts?: { basePetId?: string; headwearId?: string; clothesId?: string; shoesId?: string; motto?: string },
) {
  return action('adopt', { species, nickname, face, ...opts })
}
export const buyItem = (_sid: string, itemId: string) => action('buyItem', { itemId })
export const equip = (_sid: string, itemId: string) => action('equip', { itemId })

/* 申报 / 互评 / 抽查 */
export const submitReport = (_sid: string, category: ReportCategory, evidence: string, retestOf?: string) =>
  action('submitReport', { category, evidence, retestOf })
export const peerReview = (_sid: string, reportId: string, verdict: 'fact' | 'doubt') =>
  action('peerReview', { reportId, verdict })
export const teacherAudit = (reportId: string, act: 'approve' | 'reject', rejectNote?: string) =>
  action('teacherAudit', { reportId, action: act, rejectNote })
export const undoTeacherAudit = () => action('undoTeacherAudit')

/* 社交 */
export const social = (_fromId: string, toId: string, type: 'visit' | 'emoji' | 'snack' | 'cotrain', emoji?: string) =>
  action('social', { toId, type, emoji })
export const toggleDnd = (_uid?: string) => action('toggleDnd')

/* OKR */
export const submitKrTick = (_sid: string, note: string) => action('submitKrTick', { note })
export const confirmKrTick = (tickId: string, _confirmerId?: string) => action('confirmKrTick', { tickId })
export const submitSelfReview = (_sid: string, weekId: string, score: number, retro: string) =>
  action('submitSelfReview', { weekId, score, retro })
export const setStudentObjective = (studentId: string, objective: string) =>
  action('setStudentObjective', { studentId, objective })
export const setStudentKrTarget = (studentId: string, n: number) => action('setStudentKrTarget', { studentId, n })
export const setClassObjective = (objective: string) => action('setClassObjective', { objective })
export const saveClassRetro = (text: string) => action('saveClassRetro', { text })

/* 课堂 */
export const startClassSession = () => action('startClassSession')
export const endClassSession = () => action('endClassSession')
export const toggleClassHour = (_cid?: string) => action('toggleClassHour')
export const markClassBaseDone = () => action('markClassBaseDone')
export const markMissed = (studentId: string) => action('markMissed', { studentId })
export const markExempt = (studentId: string) => action('markExempt', { studentId })
export const clearTodayMark = (studentId: string) => action('clearTodayMark', { studentId })
export const confirmBreakthrough = (studentId: string, note: string) =>
  action('confirmBreakthrough', { studentId, note })
export const praiseWholeClass = () => action('praiseWholeClass')
export const grantClassPerk = (text: string) => action('grantClassPerk', { text })
export const undoSeatAction = () => action('undoSeatAction')

/* 小队与荣誉 */
export const squadCombo = (teamId: string) => action('squadCombo', { teamId })
export const awardSquadPoint = (teamId: string) => action('awardSquadPoint', { teamId })
export const settleHonor = (studentId: string, label: string) => action('settleHonor', { studentId, label })
export const settleCurrentWeek = () => action('settleCurrentWeek')

/* 座位与布局 */
export const assignSeat = (studentId: string, row: number, col: number) =>
  action('assignSeat', { studentId, row, col })
export const setClassLayout = (rows: number, cols: number) => action('setClassLayout', { rows, cols })

/* ---------- 花名册（账号相关，走专用路由） ---------- */

async function rosterPost<T>(path: string, body: Record<string, unknown>): Promise<{ error: string | null; result: T | null }> {
  if (!snap.activeClassId) return { error: '尚未选择班级', result: null }
  const res = await apiPost<{ ok: boolean; result?: T; state?: AppState }>(path, { classId: snap.activeClassId, ...body })
  if (res.ok && res.data) {
    if (res.data.state) patch({ state: res.data.state })
    return { error: null, result: (res.data.result as T) ?? null }
  }
  return { error: res.error, result: null }
}

export const addStudent = (name: string, studentNo?: string) =>
  rosterPost<{ id: string; pin: string }>('/roster/add-student', { name, studentNo })

export const addStudentsBatch = (text: string) =>
  rosterPost<{ rows: { name: string; studentNo?: string; pin: string }[]; errors: string[] }>('/roster/batch', { text })

export const updateStudent = (studentId: string, name: string, studentNo: string) =>
  rosterPost('/roster/rename', { studentId, name, studentNo })

export const deleteStudent = (studentId: string) => rosterPost('/roster/delete-student', { studentId })

export const resetPin = (studentId: string) => rosterPost<{ pin: string }>('/roster/reset-pin', { studentId })

export const recordConsent = (studentId: string, method: 'paper' | 'online' | 'verbal') =>
  rosterPost('/roster/consent', { studentId, method })

/* ---------- 管理员（教师账号与激励规则维护） ---------- */

export interface AdminTeacher {
  id: string
  name: string
  username: string
  role: 'homeroom' | 'subject'
  classIds: string[]
  active: boolean
}

export interface AdminOverview {
  schoolName: string
  classes: { id: string; name: string }[]
  teachers: AdminTeacher[]
  rules: RuleConfig
  defaults: RuleConfig
}

export async function adminOverview(): Promise<{ error: string | null; data: AdminOverview | null }> {
  const res = await apiGet<AdminOverview>('/admin/overview')
  return { error: res.error, data: res.ok ? res.data : null }
}

async function adminPost(path: string, body: Record<string, unknown>): Promise<string | null> {
  const res = await apiPost(path, body)
  return res.ok ? null : res.error
}

export const adminAddClass = (name: string) => adminPost('/admin/add-class', { name })
export const adminAddTeacher = (args: {
  name: string
  username: string
  password: string
  role: 'homeroom' | 'subject'
  classIds: string[]
}) => adminPost('/admin/add-teacher', args)
export const adminSetTeacherClasses = (teacherId: string, classIds: string[]) =>
  adminPost('/admin/set-teacher-classes', { teacherId, classIds })
export const adminResetTeacherPassword = (teacherId: string, password: string) =>
  adminPost('/admin/reset-teacher-password', { teacherId, password })
export const adminSetTeacherActive = (teacherId: string, active: boolean) =>
  adminPost('/admin/set-teacher-active', { teacherId, active })
export const adminSaveRules = (rules: RuleConfig) => adminPost('/admin/rules', { rules })
export const adminRenameSchool = (name: string) => adminPost('/admin/school-name', { name })

/** 兼容旧签名的空实现清单（已迁移到服务端/删除的演示功能不再暴露） */
export { actionWithResult as _internalActionWithResult }
