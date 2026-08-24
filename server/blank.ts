import type { AppState, Role } from '../src/types'
import { DEFAULT_LAYOUT } from '../src/types'
import { localDateStr, weekIdFromDate } from '../src/rules'

export interface StaffSeed {
  id: string
  name: string
  role: Extract<Role, 'homeroom' | 'subject'>
}

/** 新班级的空白状态：只有教师，等待花名册导入。 */
export function emptyClassState(classId: string, className: string, staff: StaffSeed[]): AppState {
  const week = weekIdFromDate(localDateStr())
  return {
    schoolName: '',
    className,
    classes: [{ id: classId, name: className }],
    classLayout: { ...DEFAULT_LAYOUT },
    users: staff.map((t) => ({
      id: t.id,
      name: t.name,
      role: t.role,
      code: t.role,
      classId,
      classIds: [classId],
      dnd: false,
    })),
    pets: [],
    reports: [],
    reviews: [],
    ledger: [],
    visits: [],
    squads: [],
    squadWeeks: [],
    honors: [],
    unlocked: {},
    unlockedAchievements: {},
    inClassHour: { [classId]: false },
    activeWeek: week,
    lastSettledWeek: null,
    session: null,
    personalOkrs: {},
    classOkr: { weekId: week, objective: '作业准时率' },
    classSession: { active: false, classKrMoved: false },
    krTicks: [],
    dailyMoods: [],
    baseHabits: [],
    okrHistory: [],
    classOkrHistory: [],
  }
}
