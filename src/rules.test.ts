import { describe, expect, it } from 'vitest'
import {
  auditQueue,
  classBaseProgress,
  growthStage,
  liveHunger,
  mondayOfWeekId,
  retestsDue,
  schoolDaysOfWeekId,
  schoolHoursBetween,
  weekIdFromDate,
} from './rules'
import type { AppState, BaseHabit, Pet, Report } from './types'

// 2026-08-24 是周一
const WEEK = weekIdFromDate('2026-08-24')
const DAYS = schoolDaysOfWeekId(WEEK)

function habit(studentId: string, date: string, status: BaseHabit['status']): BaseHabit {
  return { studentId, weekId: WEEK, date, status }
}

describe('classBaseProgress（班级周进度：全周分母 + 豁免剔除）', () => {
  const roster = ['s1', 's2', 's3', 's4']

  it('周一全员达标只有 20%，不能当天发集体奖励', () => {
    const habits = roster.map((id) => habit(id, '2026-08-24', 'done'))
    expect(classBaseProgress(habits, roster, WEEK, DAYS, '2026-08-24')).toBe(20)
  })

  it('豁免不进分母：周一 1 人豁免 3 人达标 = 3/19', () => {
    const habits = [
      habit('s1', '2026-08-24', 'done'),
      habit('s2', '2026-08-24', 'done'),
      habit('s3', '2026-08-24', 'done'),
      habit('s4', '2026-08-24', 'exempt'),
    ]
    expect(classBaseProgress(habits, roster, WEEK, DAYS, '2026-08-24')).toBe(Math.round((3 / 19) * 100))
  })

  it('未完成留在分母：周一 1 人未完成 = 3/20', () => {
    const habits = [
      habit('s1', '2026-08-24', 'done'),
      habit('s2', '2026-08-24', 'done'),
      habit('s3', '2026-08-24', 'done'),
      habit('s4', '2026-08-24', 'missed'),
    ]
    expect(classBaseProgress(habits, roster, WEEK, DAYS, '2026-08-24')).toBe(15)
  })

  it('全周全员达标 = 100%', () => {
    const habits = DAYS.flatMap((d) => roster.map((id) => habit(id, d, 'done')))
    expect(classBaseProgress(habits, roster, WEEK, DAYS, '2026-08-28')).toBe(100)
  })
})

describe('schoolHoursBetween / liveHunger（想念值周末暂停）', () => {
  it('周五 18:00 到周一 08:00 只计 14 个工作日小时', () => {
    const from = new Date('2026-08-21T18:00:00').getTime()
    const to = new Date('2026-08-24T08:00:00').getTime()
    expect(Math.round(schoolHoursBetween(from, to))).toBe(14)
  })

  it('周六照料到周日晚，想念值为 0（周末不涨）', () => {
    const from = new Date('2026-08-22T09:00:00').getTime()
    const to = new Date('2026-08-23T21:00:00').getTime()
    expect(schoolHoursBetween(from, to)).toBe(0)
  })

  it('liveHunger 按工作日小时 ×5 封顶 100', () => {
    const pet = { lastCareAt: '2026-08-21T18:00:00', lastCareDate: '2026-08-21' } as Pet
    const state = { now: new Date('2026-08-24T08:00:00').getTime() } as AppState
    expect(liveHunger(pet, state)).toBe(70)
  })
})

describe('auditQueue（存疑优先 + 按日种子抽样）', () => {
  function report(id: string, opts?: Partial<Report>): Report {
    return {
      id,
      authorId: 's1',
      date: '2026-08-24',
      category: 'quality',
      evidence: '测试证据满六字',
      status: 'queued',
      peerFacts: 0,
      peerDoubts: 0,
      queuedAt: '2026-08-24',
      submittedAt: '2026-08-24T08:00:00',
      credited: false,
      ...opts,
    }
  }

  const reports = [
    ...Array.from({ length: 12 }, (_, i) => report(`q${i}`)),
    report('doubted', { status: 'in_review', peerDoubts: 1 }),
  ]
  const state = {
    reports,
    users: [{ id: 's1', name: '林小舟', role: 'student', code: 'student', classId: 'c1', dnd: false }],
    todayOverride: '2026-08-24',
  } as unknown as AppState

  it('存疑的必进队列且排最前，总数不超过 8', () => {
    const q = auditQueue(state, 'c1')
    expect(q[0].id).toBe('doubted')
    expect(q.length).toBe(8)
  })

  it('同一天两次抽样结果一致（老师刷新不跳）', () => {
    const a = auditQueue(state, 'c1').map((r) => r.id)
    const b = auditQueue(state, 'c1').map((r) => r.id)
    expect(a).toEqual(b)
  })

  it('不是简单取前 8 条（晚提交不再系统性逃检）', () => {
    const q = auditQueue(state, 'c1').map((r) => r.id)
    const fifo = ['doubted', 'q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6']
    expect(q).not.toEqual(fifo)
  })
})

describe('retestsDue（错题重测调度）', () => {
  const base: Report = {
    id: 'c1r',
    authorId: 's1',
    date: '2026-08-21',
    category: 'correction',
    evidence: '数学错题两道已订正',
    status: 'posted',
    peerFacts: 1,
    peerDoubts: 0,
    queuedAt: '2026-08-21',
    submittedAt: '2026-08-21T17:00:00',
    credited: true,
  }

  it('入账 3 天后到期提示重测', () => {
    const state = { reports: [base], todayOverride: '2026-08-24' } as unknown as AppState
    expect(retestsDue(state, 's1').map((r) => r.id)).toEqual(['c1r'])
  })

  it('不满 3 天不提示', () => {
    const state = { reports: [base], todayOverride: '2026-08-23' } as unknown as AppState
    expect(retestsDue(state, 's1')).toHaveLength(0)
  })

  it('已有重测申报后不再提示', () => {
    const retest: Report = { ...base, id: 'rt1', category: 'quiz_self', date: '2026-08-24', retestOf: 'c1r' }
    const state = { reports: [base, retest], todayOverride: '2026-08-24' } as unknown as AppState
    expect(retestsDue(state, 's1')).toHaveLength(0)
  })
})

describe('growthStage（成长节奏重平衡）', () => {
  it('阈值：幼 <40、少 <110、成 ≥110', () => {
    expect(growthStage(0)).toBe('幼')
    expect(growthStage(39)).toBe('幼')
    expect(growthStage(40)).toBe('少')
    expect(growthStage(109)).toBe('少')
    expect(growthStage(110)).toBe('成')
  })
})

describe('ISO 周工具', () => {
  it('mondayOfWeekId 与 weekIdFromDate 互逆（2026-08-24 是周一）', () => {
    expect(mondayOfWeekId(weekIdFromDate('2026-08-24'))).toBe('2026-08-24')
  })

  it('schoolDaysOfWeekId 返回周一到周五', () => {
    expect(DAYS).toHaveLength(5)
    expect(DAYS[0]).toBe('2026-08-24')
    expect(DAYS[4]).toBe('2026-08-28')
  })
})
