export type Role = 'teacher' | 'student' | 'parent' | 'school'
export type SpeciesId = 'fox' | 'owl' | 'otter' | 'cat' | 'dog' | 'rabbit' | 'panda' | 'deer' | 'penguin' | 'bear'
export type PaletteId = 'chi' | 'qing' | 'mo'
export type MarkingId = 'none' | 'stripe' | 'spots'
export type Expression =
  | 'idle'
  | 'happy'
  | 'calm'
  | 'tired'
  | 'focus'
  | 'cheer'
  | 'shy'
  | 'missSoft'

export type ReportCategory = 'quality' | 'correction' | 'quiz_self' | 'participation'
export type ReportStatus =
  | 'submitted'
  | 'in_review'
  | 'queued'
  | 'posted'
  | 'rejected'
  | 'auto_posted'

export type HonorTier = 'bronze' | 'silver' | 'gold'

export interface FacePreset {
  eye_size: number
  eye_spacing: number
  muzzle_length: number
  ear_tilt: number
  brow_height: number
  cheek: number
  body_round: number
}

export interface Seat {
  /** 1-based 排：第 1 排最靠近讲台 */
  row: number
  /** 1-based 列：教师面向学生时从左到右 */
  col: number
}

export interface ClassLayout {
  cols: number
  rows: number
}

export const DEFAULT_LAYOUT: ClassLayout = { cols: 6, rows: 5 }

export function seatLabel(seat: Seat | undefined | null): string {
  if (!seat) return '—'
  return `第${seat.col}列第${seat.row}排`
}

export function seatKey(seat: Seat): string {
  return `${seat.row}-${seat.col}`
}

export interface ClassRoom {
  id: string
  name: string
}

export interface User {
  id: string
  name: string
  role: Role
  code: string
  studentId?: string
  classId?: string
  classIds?: string[]
  dnd: boolean
  seat?: Seat
  seatNumber?: number
}

export interface Pet {
  id: string
  ownerId: string
  species: SpeciesId
  basePetId: string
  paletteId: PaletteId
  marking: MarkingId
  nickname: string
  /** 宠物名（领养时填写） */
  name: string
  /** 个性签名 / motto */
  motto: string
  face: FacePreset
  hunger: number
  mood: number
  growth: number
  lastCareDate: string | null
  lastCareGrowthDate: string | null
  skinId: string
  mountId: string | null
  headwearId: string
  clothesId: string
  shoesId: string
  expression: Expression
}

export interface Report {
  id: string
  authorId: string
  date: string
  category: ReportCategory
  evidence: string
  status: ReportStatus
  peerFacts: number
  peerDoubts: number
  queuedAt: string | null
  submittedAt: string
  credited: boolean
}

export interface PeerReview {
  id: string
  reportId: string
  reviewerId: string
  date: string
  verdict: 'fact' | 'doubt'
}

export interface LedgerEntry {
  id: string
  studentId: string
  date: string
  delta: number
  kind: 'earn' | 'spend' | 'reverse'
  reason: string
  ref?: string
}

export interface VisitEvent {
  id: string
  fromId: string
  toId: string
  date: string
  type: 'visit' | 'emoji' | 'snack' | 'cotrain'
  emoji?: string
}

export interface SquadWeek {
  weekId: string
  teamId: string
  points: number
  comboUsed: boolean
  honor?: HonorTier
}

export interface HonorItem {
  id: string
  weekId: string
  studentId: string
  label: string
}

export interface AchievementDef {
  id: string
  title: string
  itemId: string
  desc: string
}

export interface ShopItem {
  id: string
  name: string
  cost: 4 | 8 | 12
  kind: 'skin' | 'mount'
  rare: boolean
}

export interface AppState {
  schoolName: string
  className: string
  classes: ClassRoom[]
  classLayout: ClassLayout
  users: User[]
  pets: Pet[]
  reports: Report[]
  reviews: PeerReview[]
  ledger: LedgerEntry[]
  visits: VisitEvent[]
  squads: { id: string; name: string; memberIds: string[] }[]
  squadWeeks: SquadWeek[]
  honors: HonorItem[]
  unlocked: Record<string, string[]>
  unlockedAchievements: Record<string, string[]>
  inClassHour: Record<string, boolean>
  activeWeek: string
  lastSettledWeek: string | null
  session: { userId: string; viewClassId?: string } | null
  todayOverride?: string
  /** 课堂分：教师现场加减，不受每日 8 分上限 */
  classScores: Record<string, number>
}

export const SPECIES: { id: SpeciesId; label: string }[] = [
  { id: 'fox', label: '狐' },
  { id: 'owl', label: '猫头鹰' },
  { id: 'otter', label: '水獭' },
  { id: 'cat', label: '猫' },
  { id: 'dog', label: '犬' },
  { id: 'rabbit', label: '兔' },
  { id: 'panda', label: '熊猫' },
  { id: 'deer', label: '小鹿' },
  { id: 'penguin', label: '企鹅' },
  { id: 'bear', label: '熊' },
]

export const CATEGORY_POINTS: Record<ReportCategory, number> = {
  quality: 2,
  correction: 2,
  quiz_self: 2,
  participation: 1,
}

export const CATEGORY_LABEL: Record<ReportCategory, string> = {
  quality: '作业质量',
  correction: '订正闭环',
  quiz_self: '自测对照',
  participation: '课堂参与',
}

/** Raw category keys that may leak into stored ledger reasons. */
export const REASON_KEY_LABEL: Record<string, string> = {
  quality: '作业质量',
  participation: '课堂参与',
  correction: '订正闭环',
  quiz_self: '自测对照',
  exam_rank: '考试名次',
}

export function categoryLabel(category: string): string {
  return REASON_KEY_LABEL[category] ?? CATEGORY_LABEL[category as ReportCategory] ?? category
}

/** Display-time fallback: replace leftover English category keys in a reason. */
export function displayLedgerReason(reason: string): string {
  let out = reason
  const keys = Object.keys(REASON_KEY_LABEL).sort((a, b) => b.length - a.length)
  for (const k of keys) {
    out = out.replace(new RegExp(`(?<![A-Za-z0-9_])${k}(?![A-Za-z0-9_])`, 'g'), REASON_KEY_LABEL[k])
  }
  return out
}

export const STATUS_LABEL: Record<ReportStatus, string> = {
  submitted: '已提交',
  in_review: '互评中',
  queued: '待抽查',
  posted: '已入账',
  rejected: '已驳回',
  auto_posted: '超时入账',
}

export const ITEM_LABEL: Record<string, string> = {
  skin_basic_leaf: '叶绿围巾',
  skin_basic_cloud: '云朵围脖',
  skin_mid_star: '星点披风',
  skin_mid_ink: '墨纹马甲',
  skin_high_aurora: '极光外衣',
  skin_high_festival: '节庆花纹',
  skin_rare_week: '周赛银辉',
  skin_rare_achieve: '成就金纹',
  mount_deskpad_01: '课桌垫坐骑',
  hw_leaf: '叶绿发卡',
  hw_bow: '粉结发带',
  hw_star: '星点小冠',
  hw_hat: '学士软帽',
  hw_crown: '节庆金冠',
  cl_scarf: '叶绿围巾',
  cl_cloud: '云朵围脖',
  cl_cape: '星点披风',
  cl_vest: '墨纹马甲',
  cl_aurora: '极光外衣',
  sh_none: '赤足',
  sh_socks: '云朵袜',
  sh_boots: '小皮靴',
  sh_star: '星点鞋',
  sh_gold: '金纹靴',
}

export const SKIN_TO_CLOTHES: Record<string, string> = {
  skin_basic_leaf: 'cl_scarf',
  skin_basic_cloud: 'cl_cloud',
  skin_mid_star: 'cl_cape',
  skin_mid_ink: 'cl_vest',
  skin_high_aurora: 'cl_aurora',
  skin_high_festival: 'cl_aurora',
  skin_rare_week: 'cl_cape',
  skin_rare_achieve: 'cl_vest',
}

export const DAILY_EARN_CAP = 8
export const DAILY_SPEND_CAP = 6
export const DAILY_REPORT_CAP = 4
export const DAILY_REVIEW_CAP = 3
export const AUDIT_MIN = 5
export const AUDIT_MAX = 8
export const HONOR_WALL_MAX = 6
export const HONOR_STREAK_MAX = 2
export const MOUNT_ID = 'mount_deskpad_01'
