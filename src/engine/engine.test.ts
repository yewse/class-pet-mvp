import { describe, expect, it } from 'vitest'
import type { AppState } from '../types'
import { DEFAULT_RULES, rulesOf } from '../types'
import { squadTier } from '../rules'
import { emptyClassState } from '../../server/blank'
import * as engine from './index'

const HOMEROOM = { id: 't1', role: 'homeroom' as const }
const SUBJECT = { id: 't2', role: 'subject' as const }
const LIN = { id: 's1', role: 'student' as const }
const CHEN = { id: 's2', role: 'student' as const }

function baseState(): AppState {
  let s = emptyClassState('c1', '初二（3）班', [
    { id: 't1', name: '叶老师', role: 'homeroom' },
    { id: 't2', name: '王老师', role: 'subject' },
  ])
  s = { ...s, todayOverride: '2026-08-24' } // 周一
  const r1 = engine.addStudent(s, HOMEROOM, { id: 's1', name: '林小舟', studentNo: '01' })
  const r2 = engine.addStudent(r1.state, HOMEROOM, { id: 's2', name: '陈安安', studentNo: '02' })
  return r2.state
}

describe('权限：服务端注入的 actor 决定一切', () => {
  it('学生不能抽查审核 / 全班达标 / 发集体奖励 / 记互助点', () => {
    const s = baseState()
    expect(engine.teacherAudit(s, LIN, { reportId: 'x', action: 'approve' }).error).toBe('仅教师可操作')
    expect(engine.markClassBaseDone(s, LIN).error).toBe('仅班主任可操作')
    expect(engine.grantClassPerk(s, LIN, '随便').error).toBe('仅班主任可操作')
    expect(engine.awardSquadPoint(s, LIN, 'sq1').error).toBe('仅班主任可操作')
  })

  it('任课教师不能发集体奖励、不能改学生个人目标', () => {
    const s = baseState()
    expect(engine.grantClassPerk(s, SUBJECT, '优惠').error).toBe('仅班主任可操作')
    expect(engine.setStudentObjective(s, SUBJECT, 's1', '订正全做完').error).toBe('个人目标由学生本人或班主任修改')
  })

  it('学生只能改自己的目标，不能替别人打钩确认', () => {
    const s = baseState()
    expect(engine.setStudentObjective(s, LIN, 's2', '别人的目标').error).toBe('只能改自己的目标')
    const ticked = engine.submitKrTick(s, LIN, '订正本第3页做完')
    expect(ticked.error).toBeNull()
    const tickId = ticked.state.krTicks[0].id
    expect(engine.confirmKrTick(ticked.state, LIN, tickId).error).toBe('不能确认自己的勾选')
    const confirmed = engine.confirmKrTick(ticked.state, CHEN, tickId)
    expect(confirmed.error).toBeNull()
    expect(engine.personalOkrOf(confirmed.state, 's1').krDone).toBe(1)
  })

  it('照料与申报都以会话身份执行，无法冒充他人', () => {
    const s = baseState()
    // adopt 以 actor.id 为 owner
    const adopted = engine.adopt(s, LIN, {
      species: 'fox',
      nickname: '赤赤',
      face: { eye_size: 50, eye_spacing: 50, muzzle_length: 50, ear_tilt: 50, brow_height: 50, cheek: 50, body_round: 50 },
      motto: '赤心向前',
    })
    expect(adopted.error).toBeNull()
    expect(adopted.state.pets[0].ownerId).toBe('s1')
    const fed = engine.feedPet(adopted.state, LIN)
    expect(fed.error).toBeNull()
    expect(fed.state.pets[0].lastCareDate).toBe('2026-08-24')
  })
})

describe('红线不变量', () => {
  it('报雨绝不影响任何宠物状态', () => {
    let s = baseState()
    s = engine.adopt(s, LIN, {
      species: 'fox',
      nickname: '赤赤',
      face: { eye_size: 50, eye_spacing: 50, muzzle_length: 50, ear_tilt: 50, brow_height: 50, cheek: 50, body_round: 50 },
      motto: '赤心向前',
    }).state
    const before = JSON.stringify(s.pets)
    const r1 = engine.setDailyMood(s, LIN, 'rain')
    const r2 = engine.setDailyMood(r1.state, CHEN, 'rain')
    expect(r2.error).toBeNull()
    expect(JSON.stringify(r2.state.pets)).toBe(before)
  })

  it('未完成/豁免只改教师账本字段，不产生任何公开积分或宠物变化', () => {
    let s = baseState()
    s = engine.markClassBaseDone(s, HOMEROOM).state
    const before = { pets: JSON.stringify(s.pets), ledger: s.ledger.length }
    const r = engine.markMissed(s, HOMEROOM, 's1')
    expect(r.error).toBeNull()
    expect(JSON.stringify(r.state.pets)).toBe(before.pets)
    expect(r.state.ledger.length).toBe(before.ledger)
    expect(engine.todayBaseOf(r.state, 's1')?.status).toBe('missed')
  })

  it('豁免不进班级分母，未完成留在分母', () => {
    let s = baseState()
    s = engine.markClassBaseDone(s, HOMEROOM).state // 2 人 done，周一
    // 全周分母 = 2 人 × 5 天 = 10 → 2/10 = 20%
    expect(engine.classOkrProgress(s)).toBe(20)
    const exempted = engine.markExempt(s, HOMEROOM, 's1').state
    // s1 豁免：今日分母 1，其余 4 天 2 人 → 1/(1+8) ≈ 11%
    expect(engine.classOkrProgress(exempted)).toBe(Math.round((1 / 9) * 100))
    const missed = engine.markMissed(s, HOMEROOM, 's1').state
    // s1 未完成：分母不变 10，分子 1 → 10%
    expect(engine.classOkrProgress(missed)).toBe(10)
  })
})

describe('管理员与激励规则', () => {
  const ADMIN = { id: 'a1', role: 'admin' as const }

  it('管理员不是课堂角色：不能操作任何班级引擎动作', () => {
    const s = baseState()
    expect(engine.markClassBaseDone(s, ADMIN).error).toBe('仅班主任可操作')
    expect(engine.teacherAudit(s, ADMIN, { reportId: 'x', action: 'approve' }).error).toBe('仅教师可操作')
    expect(engine.setDailyMood(s, ADMIN, 'rain').error).toBe('只有学生能记心情')
  })

  it('激励规则配置即时生效：档位阈值、分值与日上限都来自配置', () => {
    let s = baseState()
    s = {
      ...s,
      rules: {
        ...DEFAULT_RULES,
        dailyEarnCap: 2,
        squadGold: 5,
        categoryPoints: { ...DEFAULT_RULES.categoryPoints, quality: 3 },
      },
    }
    // 档位阈值随配置：5 分在自定义规则下是金档，默认规则下只是铜档
    expect(squadTier(5, rulesOf(s))).toBe('gold')
    expect(squadTier(5)).toBe('bronze')
    // 审核入账使用配置分值（3 分）与配置日上限（2 分）→ 超帽被拒
    const submitted = engine.submitReport(s, LIN, { category: 'quality', evidence: '数学卷子已全部订正' })
    expect(submitted.error).toBeNull()
    const reportId = submitted.state.reports[0].id
    const audited = engine.teacherAudit(submitted.state, HOMEROOM, { reportId, action: 'approve' })
    expect(audited.error).toBe('该生日入账将超过 2 分')
  })

  it('集体奖励阈值可配置：100% 门槛下 80% 进度发不出奖励', () => {
    let s = baseState()
    s = { ...s, rules: { ...DEFAULT_RULES, perkThresholdPct: 100 } }
    const r = engine.grantClassPerk(s, HOMEROOM, '自由选座')
    expect(r.error).toBe('班级周关键结果未到 100%，还不能发集体奖励')
  })
})

describe('花名册与账号一致性前提', () => {
  it('同名学生必须都有学号才能并存', () => {
    const s = baseState()
    const dup = engine.addStudent(s, HOMEROOM, { id: 's3', name: '林小舟' })
    expect(dup.error).toContain('已有同名学生')
    const withNo = engine.addStudent(s, HOMEROOM, { id: 's3', name: '林小舟', studentNo: '03' })
    expect(withNo.error).toBeNull()
  })

  it('清退学生会删除其全部养成数据（删除权原语）', () => {
    let s = baseState()
    s = engine.adopt(s, LIN, {
      species: 'fox',
      nickname: '赤赤',
      face: { eye_size: 50, eye_spacing: 50, muzzle_length: 50, ear_tilt: 50, brow_height: 50, cheek: 50, body_round: 50 },
      motto: '赤心向前',
    }).state
    s = engine.submitKrTick(s, LIN, '订正本第3页做完').state
    const r = engine.deleteStudent(s, HOMEROOM, 's1')
    expect(r.error).toBeNull()
    expect(r.state.users.some((u) => u.id === 's1')).toBe(false)
    expect(r.state.pets.some((p) => p.ownerId === 's1')).toBe(false)
    expect(r.state.krTicks.some((k) => k.studentId === 's1')).toBe(false)
    expect(r.state.personalOkrs['s1']).toBeUndefined()
  })
})
