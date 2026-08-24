export type Role = 'admin' | 'homeroom' | 'subject' | 'student'

export const ROLE_ZH: Record<Role, string> = {
  admin: '管理员',
  homeroom: '班主任',
  subject: '任课教师',
  student: '学生',
}

export function isStaffRole(role: string): boolean {
  return role === 'homeroom' || role === 'subject'
}

export function isHomeroomRole(role: string): boolean {
  return role === 'homeroom'
}
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
  | 'dormant'

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
export const LAYOUT_MIN_ROWS = 2
export const LAYOUT_MAX_ROWS = 8
export const LAYOUT_MIN_COLS = 2
export const LAYOUT_MAX_COLS = 12

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
  /** 学号（选填）：允许同名学生并存，登录用「姓名#学号」区分 */
  studentNo?: string
  studentId?: string
  classId?: string
  classIds?: string[]
  dnd: boolean
  seat?: Seat
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
  /** ISO 时间；缺省时用 lastCareDate 正午估算 */
  lastCareAt: string | null
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
  rejectNote?: string
  /** 错题重测：指向 3 天前那条已入账的订正申报 */
  retestOf?: string
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
  /** 操作者（审计用）：教师 id / 学生本人 / system */
  by?: string
  /** 精确时间 ISO（审计用） */
  at?: string
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
  by?: string
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
  session: { userId: string } | null
  todayOverride?: string
  /** 演示/测试时钟，毫秒 */
  now?: number
  personalOkrs: Record<string, PersonalOkr>
  classOkr: ClassOkr
  classSession: ClassSession
  krTicks: KrTick[]
  dailyMoods: DailyMood[]
  baseHabits: BaseHabit[]
  /** 已归档的个人周期（周目标 + 打钩 + 自评复盘） */
  okrHistory: OkrRecord[]
  /** 已归档的班级周期 */
  classOkrHistory: ClassOkrRecord[]
  /** 服务端按角色注入的派生数据（客户端只读；学生视图收不到他人明细时用） */
  derived?: {
    classPct?: number
    weekActiveStudents?: number
    rosterCount?: number
  }
  /** 学生视图专用：匿名互评池（服务端已剥离申报者身份） */
  reviewPool?: { id: string; category: ReportCategory; evidence: string }[]
  /** 班主任视图专用：账号侧的名册元数据（PIN 状态、监护人同意记录） */
  rosterMeta?: Record<string, { hasPin: boolean; consentAt: string | null; consentMethod: string | null }>
  /** 服务端注入的当前激励规则（管理员可改） */
  rules?: RuleConfig
}

export type MoodId = 'sun' | 'overcast' | 'rain'

export const MOOD_LABEL: Record<MoodId, string> = {
  sun: '晴',
  overcast: '云',
  rain: '雨',
}

export interface DailyMood {
  studentId: string
  date: string
  mood: MoodId
}

export interface KrTick {
  id: string
  studentId: string
  weekId: string
  date: string
  note: string
  status: 'pending' | 'confirmed'
  confirmerId: string | null
}

export interface PersonalOkr {
  weekId: string
  objective: string
  krTarget: number
  krDone: number
  lastTickDate: string | null
  /** 周五起的自评：0 / 0.3 / 0.7 / 1；null 表示未复盘 */
  selfScore?: number | null
  /** 一句复盘（≤40 字） */
  retro?: string
}

export interface OkrRecord {
  studentId: string
  weekId: string
  objective: string
  krTarget: number
  krDone: number
  selfScore: number | null
  retro: string | null
}

export interface ClassOkr {
  weekId: string
  objective: string
  perkText?: string
  perkGranted?: boolean
  /** 班级一句复盘（班主任填写） */
  retro?: string
}

export interface ClassOkrRecord {
  weekId: string
  objective: string
  progressPct: number
  perkGranted: boolean
  perkText?: string
  retro: string | null
}

export type BaseHabitStatus = 'done' | 'missed' | 'exempt'

export interface BaseHabit {
  studentId: string
  weekId: string
  date: string
  /** done=达标；missed=未完成（仅教师可见，计入分母）；exempt=豁免（病假等，不计分母） */
  status: BaseHabitStatus
  by?: string
}

export const DEFAULT_CLASS_PERK = '周五自习课自由选座'
export const REFLECT_CHIP = 'hw_reflect'

export interface ClassSession {
  active: boolean
  classKrMoved: boolean
}

export const DEFAULT_KR_TARGET = 4
export const KR_TARGET_MIN = 1
export const KR_TARGET_MAX = 12
export const SEED_OBJECTIVES = ['本周订正全做完', '晚自习专注四次'] as const
export const SELF_SCORE_OPTIONS = [0, 0.3, 0.7, 1] as const
export const RETRO_MAX_LEN = 40
export const EVIDENCE_MIN_LEN = 6
export const RETEST_DELAY_DAYS = 3

/** 成长节奏：照料 / 当日首次确认打钩 / 完成周复盘 */
export const GROWTH_CARE = 4
export const GROWTH_TICK = 6
export const GROWTH_RETRO = 20

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
  correction: '订正错题',
  quiz_self: '自己测一次',
  participation: '课堂参与',
}

/** Raw category keys that may leak into stored ledger reasons. */
export const REASON_KEY_LABEL: Record<string, string> = {
  quality: '作业质量',
  participation: '课堂参与',
  correction: '订正错题',
  quiz_self: '自己测一次',
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
  out = out.replace(/订正闭环/g, '订正错题')
  out = out.replace(/自测对照/g, '自己测一次')
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
  hw_reflect: '反思之眼',
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

/**
 * 激励规则：由管理员维护，存于服务端，随视图下发。
 * 「产品宪法」不在此列（无排行榜、心情不影响宠物、公屏无负面、积分不可转让）——那些是结构，不是参数。
 */
export interface RuleConfig {
  /** 各类申报的积分值 */
  categoryPoints: Record<ReportCategory, number>
  /** 每日入账上限（反肝） */
  dailyEarnCap: number
  /** 每日社交消耗上限 */
  dailySpendCap: number
  /** 每日申报条数上限 */
  dailyReportCap: number
  /** 每日互评条数上限 */
  dailyReviewCap: number
  /** 抽查队列下限 / 上限 */
  auditMin: number
  auditMax: number
  /** 荣誉橱窗每周席位 / 连续上墙上限 */
  honorWallMax: number
  honorStreakMax: number
  /** 小队档位阈值与加分 */
  squadBronze: number
  squadSilver: number
  squadGold: number
  squadComboBonus: number
  squadWeeklyCap: number
  /** 宠物成长：照料 / 当日首次确认打钩 / 完成周复盘 */
  growthCare: number
  growthTick: number
  growthRetro: number
  /** 集体奖励解锁阈值（班级周进度 %） */
  perkThresholdPct: number
  /** 错题重测间隔天数 */
  retestDelayDays: number
  /** 新学生默认周关键结果格数 */
  defaultKrTarget: number
  /** 申报证据最少字数 */
  evidenceMinLen: number
}

export const DEFAULT_RULES: RuleConfig = {
  categoryPoints: { ...CATEGORY_POINTS },
  dailyEarnCap: DAILY_EARN_CAP,
  dailySpendCap: DAILY_SPEND_CAP,
  dailyReportCap: DAILY_REPORT_CAP,
  dailyReviewCap: DAILY_REVIEW_CAP,
  auditMin: AUDIT_MIN,
  auditMax: AUDIT_MAX,
  honorWallMax: HONOR_WALL_MAX,
  honorStreakMax: HONOR_STREAK_MAX,
  squadBronze: 3,
  squadSilver: 6,
  squadGold: 10,
  squadComboBonus: 3,
  squadWeeklyCap: 30,
  growthCare: GROWTH_CARE,
  growthTick: GROWTH_TICK,
  growthRetro: GROWTH_RETRO,
  perkThresholdPct: 80,
  retestDelayDays: RETEST_DELAY_DAYS,
  defaultKrTarget: DEFAULT_KR_TARGET,
  evidenceMinLen: EVIDENCE_MIN_LEN,
}

/** 读取当前生效规则（服务端注入；缺省用默认值，保证引擎纯函数可独立运行） */
export function rulesOf(s: { rules?: RuleConfig }): RuleConfig {
  return s.rules ?? DEFAULT_RULES
}
