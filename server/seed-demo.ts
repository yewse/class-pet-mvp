/**
 * 演示环境种子：npm run seed:demo
 * 创建 阳光实验中学 + 两个班 + 三位教师 + 四名学生（含宠物与过程数据）。
 * 仅允许在空库或 --fresh 下运行，绝不覆盖生产数据。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import type { AppState, Pet, User } from '../src/types'
import { DEFAULT_KR_TARGET, MOUNT_ID } from '../src/types'
import { basePetForSpecies } from '../src/catalog'
import { addDays, localDateStr, weekIdFromDate } from '../src/rules'
import { db, paths, saveClassState, setMeta, accountsCount } from './db'
import { hashCredential } from './auth'
import { emptyClassState } from './blank'

const fresh = process.argv.includes('--fresh')
if (accountsCount() > 0) {
  if (!fresh) {
    console.error('数据库非空。若确认要清空重建演示数据，请加 --fresh 参数。')
    process.exit(1)
  }
  db.exec('DELETE FROM accounts; DELETE FROM sessions; DELETE FROM classes; DELETE FROM class_state; DELETE FROM events; DELETE FROM meta;')
}

const now = new Date().toISOString()
const today = localDateStr()
const week = weekIdFromDate(today)
const prevWeek = weekIdFromDate(addDays(today, -7))

const C1 = 'c-demo31'
const C2 = 'c-demo41'

const ADMIN = { id: 'a-demo', name: '周主任', username: 'admin', password: 'admin12345678' }

const TEACHERS = [
  { id: 't-ye', name: '叶老师', role: 'homeroom' as const, username: 'yelaoshi', password: 'ye12345678', classIds: [C1] },
  { id: 't-li', name: '李老师', role: 'homeroom' as const, username: 'lilaoshi', password: 'li12345678', classIds: [C2] },
  { id: 't-wang', name: '王老师', role: 'subject' as const, username: 'wanglaoshi', password: 'wang12345678', classIds: [C1, C2] },
]

const STUDENTS = [
  { id: 's-lin', name: '林小舟', no: '01', pin: '111111', classId: C1 },
  { id: 's-chen', name: '陈安安', no: '02', pin: '222222', classId: C1 },
  { id: 's-zhou', name: '周牧野', no: '03', pin: '333333', classId: C1 },
  { id: 's-su', name: '苏晚晚', no: '04', pin: '444444', classId: C1 },
  { id: 's-han', name: '韩一一', no: '01', pin: '555555', classId: C2 },
  { id: 's-qin', name: '秦朵朵', no: '02', pin: '666666', classId: C2 },
]

function pet(id: string, ownerId: string, species: Pet['species'], nickname: string, n: number, motto: string, growth: number): Pet {
  const base = basePetForSpecies(species)
  return {
    id,
    ownerId,
    species,
    nickname,
    name: nickname,
    motto,
    face: {
      eye_size: 40 + n * 8,
      eye_spacing: 45 + n * 5,
      muzzle_length: 35 + n * 7,
      ear_tilt: 30 + n * 10,
      brow_height: 50,
      cheek: 40 + n * 6,
      body_round: 50 + n * 4,
    },
    hunger: 30,
    mood: 60 + n * 4,
    growth,
    lastCareDate: addDays(today, -1),
    lastCareGrowthDate: addDays(today, -1),
    lastCareAt: `${addDays(today, -1)}T20:00:00`,
    skinId: n % 2 === 0 ? 'skin_basic_leaf' : 'skin_basic_cloud',
    mountId: n === 0 ? MOUNT_ID : null,
    headwearId: n === 0 ? 'hw_leaf' : 'hw_bow',
    clothesId: n % 2 === 0 ? 'cl_scarf' : 'cl_cloud',
    shoesId: n === 3 ? 'sh_socks' : 'sh_none',
    basePetId: base.id,
    paletteId: base.palette,
    marking: base.marking,
    expression: 'idle',
  }
}

function studentUser(s: (typeof STUDENTS)[number], seatIdx: number): User {
  return {
    id: s.id,
    name: s.name,
    role: 'student',
    code: 'student',
    studentNo: s.no,
    classId: s.classId,
    dnd: s.id === 's-zhou',
    seat: { row: 1, col: seatIdx + 2 },
  }
}

/* 班一：带过程数据的演示班 */
function classOneState(): AppState {
  const staff = TEACHERS.filter((t) => t.classIds.includes(C1)).map((t) => ({ id: t.id, name: t.name, role: t.role }))
  const s = emptyClassState(C1, '初二（3）班', staff)
  const kids = STUDENTS.filter((x) => x.classId === C1)
  s.users = [...s.users, ...kids.map((k, i) => studentUser(k, i))]
  s.pets = [
    pet('pet1', 's-lin', 'fox', '赤赤', 0, '赤心向前', 46),
    pet('pet2', 's-chen', 'owl', '咕咕', 1, '夜里也认真想', 22),
    pet('pet3', 's-zhou', 'otter', '滑滑', 2, '慢慢游也能到', 30),
    pet('pet4', 's-su', 'rabbit', '团团', 3, '软软也要努力', 12),
  ]
  const d1 = addDays(today, -1)
  const d3 = addDays(today, -3)
  s.reports = [
    {
      id: 'r-quality-lin',
      authorId: 's-lin',
      date: d1,
      category: 'quality',
      evidence: '数学订正本第3页已重做，老师签字。',
      status: 'posted',
      peerFacts: 2,
      peerDoubts: 0,
      queuedAt: d1,
      submittedAt: `${d1}T10:00:00`,
      credited: true,
    },
    {
      id: 'r-corr-lin',
      authorId: 's-lin',
      date: d3,
      category: 'correction',
      evidence: '数学错题两道已订正并写清错因。',
      status: 'posted',
      peerFacts: 1,
      peerDoubts: 0,
      queuedAt: d3,
      submittedAt: `${d3}T17:00:00`,
      credited: true,
    },
    {
      id: 'r-corr-chen',
      authorId: 's-chen',
      date: today,
      category: 'correction',
      evidence: '英语错题本闭环：错因+再练两题。',
      status: 'in_review',
      peerFacts: 1,
      peerDoubts: 0,
      queuedAt: null,
      submittedAt: `${today}T08:10:00`,
      credited: false,
    },
    {
      id: 'r-quiz-zhou',
      authorId: 's-zhou',
      date: today,
      category: 'quiz_self',
      evidence: '课前自测 8/10，对照答案订了两处概念。',
      status: 'queued',
      peerFacts: 1,
      peerDoubts: 0,
      queuedAt: today,
      submittedAt: `${today}T08:20:00`,
      credited: false,
    },
    {
      id: 'r-part-su',
      authorId: 's-su',
      date: today,
      category: 'participation',
      evidence: '小组汇报主动补充了一条例子。',
      status: 'queued',
      peerFacts: 0,
      peerDoubts: 0,
      queuedAt: today,
      submittedAt: `${today}T08:30:00`,
      credited: false,
    },
    {
      id: 'r-corr-su',
      authorId: 's-su',
      date: d1,
      category: 'correction',
      evidence: '物理公式写错已订正并讲给同桌听。',
      status: 'in_review',
      peerFacts: 0,
      peerDoubts: 1,
      queuedAt: null,
      submittedAt: `${d1}T16:20:00`,
      credited: false,
    },
  ]
  s.reviews = [
    { id: 'v1', reportId: 'r-corr-chen', reviewerId: 's-lin', date: today, verdict: 'fact' },
    { id: 'v2', reportId: 'r-quiz-zhou', reviewerId: 's-su', date: d1, verdict: 'fact' },
  ]
  s.ledger = [
    { id: 'l1', studentId: 's-lin', date: d1, delta: 2, kind: 'earn', reason: '作业质量', ref: 'r-quality-lin', by: 't-ye', at: `${d1}T18:00:00` },
    { id: 'l2', studentId: 's-lin', date: d3, delta: 2, kind: 'earn', reason: '订正错题', ref: 'r-corr-lin', by: 't-ye', at: `${d3}T18:00:00` },
    { id: 'l3', studentId: 's-chen', date: d1, delta: 2, kind: 'earn', reason: '订正错题', by: 't-ye', at: `${d1}T18:00:00` },
    { id: 'l4', studentId: 's-zhou', date: d1, delta: 1, kind: 'earn', reason: '课堂参与', by: 't-ye', at: `${d1}T18:00:00` },
    { id: 'l5', studentId: 's-su', date: d1, delta: 4, kind: 'earn', reason: '作业质量+自测', by: 't-ye', at: `${d1}T18:00:00` },
  ]
  s.squads = [
    { id: 'sq1', name: '赤云小队', memberIds: ['s-lin', 's-chen'] },
    { id: 'sq2', name: '滑团小队', memberIds: ['s-zhou', 's-su'] },
  ]
  s.squadWeeks = [
    { weekId: week, teamId: 'sq1', points: 7, comboUsed: false },
    { weekId: week, teamId: 'sq2', points: 4, comboUsed: true },
  ]
  s.honors = [
    { id: 'h1', weekId: prevWeek, studentId: 's-chen', label: '互助小星' },
    { id: 'h2', weekId: prevWeek, studentId: 's-su', label: '订正达人' },
  ]
  s.unlocked = {
    's-lin': ['skin_basic_leaf', MOUNT_ID],
    's-chen': ['skin_basic_cloud'],
    's-zhou': ['skin_basic_leaf'],
    's-su': ['skin_basic_cloud'],
  }
  s.unlockedAchievements = { 's-lin': ['streak_mount'] }
  s.personalOkrs = {
    's-lin': { weekId: week, objective: '本周订正全做完', krTarget: DEFAULT_KR_TARGET, krDone: 2, lastTickDate: d1, selfScore: null, retro: '' },
    's-chen': { weekId: week, objective: '晚自习专注四次', krTarget: DEFAULT_KR_TARGET, krDone: 1, lastTickDate: null, selfScore: null, retro: '' },
    's-zhou': { weekId: week, objective: '本周订正全做完', krTarget: DEFAULT_KR_TARGET, krDone: 0, lastTickDate: null, selfScore: null, retro: '' },
    's-su': { weekId: week, objective: '晚自习专注四次', krTarget: DEFAULT_KR_TARGET, krDone: 1, lastTickDate: null, selfScore: null, retro: '' },
  }
  s.okrHistory = [
    { studentId: 's-lin', weekId: prevWeek, objective: '每天订正当日错题', krTarget: 4, krDone: 3, selfScore: 0.7, retro: '错题当天清，考前不慌' },
    { studentId: 's-chen', weekId: prevWeek, objective: '晚自习专注四次', krTarget: 4, krDone: 2, selfScore: null, retro: null },
  ]
  s.classOkrHistory = [
    { weekId: prevWeek, objective: '作业准时率', progressPct: 75, perkGranted: false, retro: '收作业改小组互查，快了很多' },
  ]
  return s
}

function classTwoState(): AppState {
  const staff = TEACHERS.filter((t) => t.classIds.includes(C2)).map((t) => ({ id: t.id, name: t.name, role: t.role }))
  const s = emptyClassState(C2, '初二（4）班', staff)
  const kids = STUDENTS.filter((x) => x.classId === C2)
  s.users = [...s.users, ...kids.map((k, i) => studentUser(k, i))]
  s.pets = [
    pet('pet5', 's-han', 'cat', '喵喵', 0, '静静思考', 36),
    pet('pet6', 's-qin', 'dog', '旺旺', 1, '开心每一天', 24),
  ]
  return s
}

db.transaction(() => {
  setMeta('schoolName', '阳光实验中学')
  db.prepare('INSERT INTO classes(id, name, createdAt) VALUES (?, ?, ?)').run(C1, '初二（3）班', now)
  db.prepare('INSERT INTO classes(id, name, createdAt) VALUES (?, ?, ?)').run(C2, '初二（4）班', now)
  db.prepare(
    'INSERT INTO accounts(id, role, name, username, credHash, active, createdAt) VALUES (?, ?, ?, ?, ?, 1, ?)',
  ).run(ADMIN.id, 'admin', ADMIN.name, ADMIN.username, hashCredential(ADMIN.password), now)
  for (const t of TEACHERS) {
    db.prepare(
      'INSERT INTO accounts(id, role, name, classId, classIds, username, credHash, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)',
    ).run(t.id, t.role, t.name, t.classIds[0], JSON.stringify(t.classIds), t.username, hashCredential(t.password), now)
  }
  for (const s of STUDENTS) {
    db.prepare(
      'INSERT INTO accounts(id, role, name, studentNo, classId, credHash, consentAt, consentBy, consentMethod, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
    ).run(s.id, 'student', s.name, s.no, s.classId, hashCredential(s.pin), now, 't-ye', 'paper', now)
  }
  saveClassState(C1, classOneState())
  saveClassState(C2, classTwoState())
})()

const summary = [
  '演示数据已写入。',
  `数据库：${paths.DB_PATH}`,
  '',
  '管理员登录（教师/管理员入口）：',
  `  ${ADMIN.name}  ${ADMIN.username} / ${ADMIN.password}  →  教师账号与激励规则维护`,
  '',
  '教师登录（用户名 / 密码）：',
  ...TEACHERS.map((t) => `  ${t.name}  ${t.username} / ${t.password}  →  ${t.classIds.join(', ')}`),
  '',
  '学生登录（班级 + 姓名 + PIN，监护人同意已登记）：',
  ...STUDENTS.map((s) => `  ${s.name}（学号${s.no}）  PIN ${s.pin}  →  ${s.classId === C1 ? '初二（3）班' : '初二（4）班'}`),
  '',
  '生产部署请勿使用本脚本，账号请通过 花名册 / admin CLI 创建。',
]
console.log(summary.join('\n'))
fs.writeFileSync(`${paths.DATA_DIR}/demo-accounts.txt`, summary.join('\n'), 'utf8')
