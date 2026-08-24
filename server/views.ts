import type { AppState } from '../src/types'
import { classOkrProgress } from '../src/engine'
import { assignMissingSeats, classLayoutOf } from '../src/engine/mutations'
import { mondayOfWeekId, weekIdOf } from '../src/rules'
import { weekActiveStudents, type AccountRow, type ClassRow } from './db'

/**
 * 视图裁剪：客户端只拿到自己角色应见的数据。
 * 这是「未完成/心情/流水仅教师可见」从 UI 约定变成服务端保证的地方。
 */

function base(state: AppState, schoolName: string, classes: ClassRow[], activeClassId: string): AppState {
  return {
    ...state,
    schoolName,
    classes: classes.map((c) => ({ id: c.id, name: c.name })),
    className: classes.find((c) => c.id === activeClassId)?.name ?? state.className,
    session: null,
  }
}

export function teacherView(
  state: AppState,
  me: AccountRow,
  schoolName: string,
  classes: ClassRow[],
  activeClassId: string,
): AppState {
  const week = weekIdOf(state)
  const layout = classLayoutOf(state)
  const updatedState = {
    ...base(state, schoolName, classes, activeClassId),
    users: assignMissingSeats(state.users, layout),
    derived: {
      classPct: classOkrProgress(state),
      weekActiveStudents: weekActiveStudents(activeClassId, mondayOfWeekId(week)),
      rosterCount: state.users.filter((u) => u.role === 'student').length,
    },
  }
  return updatedState
}

export function studentView(
  state: AppState,
  me: AccountRow,
  schoolName: string,
  classes: ClassRow[],
  activeClassId: string,
): AppState {
  const myId = me.id
  const reviewed = new Set(state.reviews.filter((r) => r.reviewerId === myId).map((r) => r.reportId))
  return {
    ...base(state, schoolName, classes, activeClassId),
    // 名册：同学只暴露展示必需字段；学号只给本人
    users: state.users.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      code: u.code,
      classId: u.classId,
      dnd: u.dnd,
      seat: u.seat,
      studentNo: u.id === myId ? (u.studentNo ?? undefined) : undefined,
    })),
    // 宠物外观是班级公共视觉，全量保留
    pets: state.pets,
    // 申报：只看自己的；互评池由服务端剥离申报者身份后单独下发
    reports: state.reports.filter((r) => r.authorId === myId),
    reviewPool: state.reports
      .filter(
        (r) =>
          r.authorId !== myId &&
          (r.status === 'in_review' || r.status === 'queued') &&
          !reviewed.has(r.id),
      )
      .map((r) => ({ id: r.id, category: r.category, evidence: r.evidence })),
    reviews: state.reviews.filter((r) => r.reviewerId === myId),
    // 账本 / 心情 / 习惯明细 / 周期历史：只看自己的
    ledger: state.ledger.filter((l) => l.studentId === myId),
    dailyMoods: (state.dailyMoods ?? []).filter((m) => m.studentId === myId),
    baseHabits: (state.baseHabits ?? []).filter((h) => h.studentId === myId),
    okrHistory: (state.okrHistory ?? []).filter((r) => r.studentId === myId),
    personalOkrs: state.personalOkrs?.[myId] ? { [myId]: state.personalOkrs[myId] } : {},
    // 打钩：自己的全量 + 同学的待确认（互相确认需要）
    krTicks: (state.krTicks ?? []).filter((k) => k.studentId === myId || k.status === 'pending'),
    visits: state.visits.filter((v) => v.fromId === myId || v.toId === myId),
    unlocked: { [myId]: state.unlocked[myId] ?? [] },
    unlockedAchievements: { [myId]: state.unlockedAchievements?.[myId] ?? [] },
    // 班级进度只给聚合值，不给他人明细
    derived: { classPct: classOkrProgress(state) },
  }
}

export function viewFor(
  state: AppState,
  me: AccountRow,
  schoolName: string,
  classes: ClassRow[],
  activeClassId: string,
): AppState {
  if (me.role === 'student') {
    return studentView(state, me, schoolName, classes, activeClassId)
  }
  if (me.role === 'admin') {
    return base(state, schoolName, classes, activeClassId)
  }
  return teacherView(state, me, schoolName, classes, activeClassId)
}
