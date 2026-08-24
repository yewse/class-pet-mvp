import { z } from 'zod'
import type { AppState } from '../src/types'
import * as engine from '../src/engine'
import type { Actor, EngineResult } from '../src/engine'

const face = z.object({
  eye_size: z.number(),
  eye_spacing: z.number(),
  muzzle_length: z.number(),
  ear_tilt: z.number(),
  brow_height: z.number(),
  cheek: z.number(),
  body_round: z.number(),
})

const category = z.enum(['quality', 'correction', 'quiz_self', 'participation'])
const species = z.enum(['fox', 'owl', 'otter', 'cat', 'dog', 'rabbit', 'panda', 'deer', 'penguin', 'bear'])

type Handler = (s: AppState, actor: Actor, payload: unknown) => EngineResult

/** 撤销快照的切片类型：audit=抽查审核，seat=课堂座位操作 */
export type SnapshotKind = 'audit' | 'seat' | null

export interface ActionDef {
  schema: z.ZodTypeAny
  handler: Handler
  snapshot: SnapshotKind
}

function def<T extends z.ZodTypeAny>(
  schema: T,
  handler: (s: AppState, actor: Actor, payload: z.infer<T>) => EngineResult,
  snapshot: SnapshotKind = null,
): ActionDef {
  return {
    schema,
    handler: (s, actor, payload) => handler(s, actor, payload as z.infer<T>),
    snapshot,
  }
}

/**
 * 全部业务动作：客户端只能提交 type + payload，
 * actor 由服务端会话注入，权限在引擎内校验，结果写入事件日志。
 */
export const ACTIONS: Record<string, ActionDef> = {
  /* 照料与心情 */
  tapPet: def(z.object({}), (s, a) => engine.tapPet(s, a)),
  petPet: def(z.object({}), (s, a) => engine.petPet(s, a)),
  feedPet: def(z.object({}), (s, a) => engine.feedPet(s, a)),
  setDailyMood: def(z.object({ mood: z.enum(['sun', 'overcast', 'rain']) }), (s, a, p) =>
    engine.setDailyMood(s, a, p.mood),
  ),

  /* 领养 / 商店 */
  adopt: def(
    z.object({
      species,
      nickname: z.string().max(16),
      face,
      basePetId: z.string().max(32).optional(),
      headwearId: z.string().max(32).optional(),
      clothesId: z.string().max(32).optional(),
      shoesId: z.string().max(32).optional(),
      motto: z.string().max(40).optional(),
    }),
    (s, a, p) => engine.adopt(s, a, p),
  ),
  buyItem: def(z.object({ itemId: z.string().max(40) }), (s, a, p) => engine.buyItem(s, a, p.itemId)),
  equip: def(z.object({ itemId: z.string().max(40) }), (s, a, p) => engine.equip(s, a, p.itemId)),

  /* 申报 / 互评 / 抽查 */
  submitReport: def(
    z.object({ category, evidence: z.string().max(400), retestOf: z.string().max(40).optional() }),
    (s, a, p) => engine.submitReport(s, a, p),
  ),
  peerReview: def(
    z.object({ reportId: z.string().max(40), verdict: z.enum(['fact', 'doubt']) }),
    (s, a, p) => engine.peerReview(s, a, p.reportId, p.verdict),
  ),
  teacherAudit: def(
    z.object({
      reportId: z.string().max(40),
      action: z.enum(['approve', 'reject']),
      rejectNote: z.string().max(60).optional(),
    }),
    (s, a, p) => engine.teacherAudit(s, a, p),
    'audit',
  ),

  /* 社交 */
  social: def(
    z.object({
      toId: z.string().max(40),
      type: z.enum(['visit', 'emoji', 'snack', 'cotrain']),
      emoji: z.string().max(8).optional(),
    }),
    (s, a, p) => engine.social(s, a, p),
  ),
  toggleDnd: def(z.object({}), (s, a) => engine.toggleDnd(s, a)),

  /* OKR */
  submitKrTick: def(z.object({ note: z.string().max(40) }), (s, a, p) => engine.submitKrTick(s, a, p.note)),
  confirmKrTick: def(z.object({ tickId: z.string().max(40) }), (s, a, p) => engine.confirmKrTick(s, a, p.tickId)),
  submitSelfReview: def(
    z.object({ weekId: z.string().max(12), score: z.number(), retro: z.string().max(60) }),
    (s, a, p) => engine.submitSelfReview(s, a, p),
  ),
  setStudentObjective: def(
    z.object({ studentId: z.string().max(40), objective: z.string().max(30) }),
    (s, a, p) => engine.setStudentObjective(s, a, p.studentId, p.objective),
  ),
  setStudentKrTarget: def(
    z.object({ studentId: z.string().max(40), n: z.number() }),
    (s, a, p) => engine.setStudentKrTarget(s, a, p.studentId, p.n),
  ),
  setClassObjective: def(z.object({ objective: z.string().max(30) }), (s, a, p) =>
    engine.setClassObjective(s, a, p.objective),
  ),
  saveClassRetro: def(z.object({ text: z.string().max(60) }), (s, a, p) => engine.saveClassRetro(s, a, p.text)),

  /* 课堂 */
  startClassSession: def(z.object({}), (s, a) => engine.startClassSession(s, a)),
  endClassSession: def(z.object({}), (s, a) => engine.endClassSession(s, a)),
  toggleClassHour: def(z.object({}), (s, a) => engine.toggleClassHour(s, a)),
  markClassBaseDone: def(z.object({}), (s, a) => engine.markClassBaseDone(s, a), 'seat'),
  markMissed: def(z.object({ studentId: z.string().max(40) }), (s, a, p) => engine.markMissed(s, a, p.studentId), 'seat'),
  markExempt: def(z.object({ studentId: z.string().max(40) }), (s, a, p) => engine.markExempt(s, a, p.studentId), 'seat'),
  clearTodayMark: def(
    z.object({ studentId: z.string().max(40) }),
    (s, a, p) => engine.clearTodayMark(s, a, p.studentId),
    'seat',
  ),
  confirmBreakthrough: def(
    z.object({ studentId: z.string().max(40), note: z.string().max(40) }),
    (s, a, p) => engine.confirmBreakthrough(s, a, p.studentId, p.note),
    'seat',
  ),
  praiseWholeClass: def(z.object({}), (s, a) => engine.praiseWholeClass(s, a)),
  grantClassPerk: def(z.object({ text: z.string().max(40) }), (s, a, p) => engine.grantClassPerk(s, a, p.text)),

  /* 小队与荣誉 */
  squadCombo: def(z.object({ teamId: z.string().max(40) }), (s, a, p) => engine.squadCombo(s, a, p.teamId)),
  awardSquadPoint: def(z.object({ teamId: z.string().max(40) }), (s, a, p) => engine.awardSquadPoint(s, a, p.teamId, 1)),
  settleHonor: def(
    z.object({ studentId: z.string().max(40), label: z.string().max(20) }),
    (s, a, p) => engine.settleHonor(s, a, p.studentId, p.label),
  ),
  settleCurrentWeek: def(z.object({}), (s, a) => engine.settleCurrentWeek(s, a)),

  /* 花名册（账号相关的部分由 index.ts 的专用路由处理） */
  assignSeat: def(
    z.object({ studentId: z.string().max(40), row: z.number(), col: z.number() }),
    (s, a, p) => engine.assignSeat(s, a, p.studentId, p.row, p.col),
  ),
  setClassLayout: def(z.object({ rows: z.number(), cols: z.number() }), (s, a, p) =>
    engine.setClassLayout(s, a, p.rows, p.cols),
  ),
  // 改名 / 学号 / 增删学生须与账号表同事务，走 /api/roster/* 专用路由，不进本注册表
}

/** 撤销用的状态切片 */
export function auditSlices(s: AppState) {
  return { reports: s.reports, ledger: s.ledger }
}

export function seatSlices(s: AppState) {
  return {
    baseHabits: s.baseHabits,
    classOkr: s.classOkr,
    classSession: s.classSession,
    krTicks: s.krTicks,
    personalOkrs: s.personalOkrs,
    pets: s.pets,
  }
}
