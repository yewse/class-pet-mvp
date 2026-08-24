import { personalOkrOf } from '../store'
import type { AppState, User } from '../types'
import {
  baseDoneDays,
  careDaysIn,
  isPostedReport,
  moodCareList,
  rainStreak,
  reportsIn,
  schoolDaysOfWeekId,
  todayStr,
  weekIdOf,
} from '../rules'

type RowData = {
  student: User
  care: number
  baseDone: number
  quality: number
  correction: number
  quiz: number
  participation: number
  krDone: number
  krTarget: number
  selfScore: number | null
  retro: string
  rain: number
}

function buildRows(state: AppState): { rows: RowData[]; days: string[]; week: string } {
  const week = weekIdOf(state)
  const days = schoolDaysOfWeekId(week)
  const students = state.users.filter((u) => u.role === 'student' && u.classId === 'c1')
  const rows = students.map((student) => {
    const posted = reportsIn(state, student.id, days).filter((r) => isPostedReport(r.status))
    const okr = personalOkrOf(state, student.id)
    return {
      student,
      care: careDaysIn(state, student.id, days),
      baseDone: baseDoneDays(state, student.id, days),
      quality: posted.filter((r) => r.category === 'quality').length,
      correction: posted.filter((r) => r.category === 'correction').length,
      quiz: posted.filter((r) => r.category === 'quiz_self').length,
      participation: posted.filter((r) => r.category === 'participation').length,
      krDone: okr.krDone,
      krTarget: okr.krTarget,
      selfScore: okr.selfScore ?? null,
      retro: okr.retro ?? '',
      rain: rainStreak(state, student.id),
    }
  })
  return { rows, days, week }
}

function exportHtml(state: AppState) {
  const { rows, days, week } = buildRows(state)
  const body = rows
    .map(
      (r) =>
        `<tr><td>${r.student.studentNo ?? ''}</td><td>${r.student.name}</td><td>${r.baseDone}</td><td>${r.care}</td>` +
        `<td>${r.quality}/${r.correction}/${r.quiz}/${r.participation}</td>` +
        `<td>${r.krDone}/${r.krTarget}</td><td>${r.selfScore ?? '未复盘'}</td><td>${r.retro || ''}</td></tr>`,
    )
    .join('')
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><title>班级周报 ${week}</title>
<style>
body{font-family:"PingFang SC","Noto Sans SC",sans-serif;padding:24px;color:#2b241c}
h1{font-size:20px} table{border-collapse:collapse;width:100%}
th,td{border:1px solid #c9a56a;padding:8px;text-align:left}
th{background:#fff6e8} .note{color:#7a6a55;font-size:13px}
@media print { button{display:none} }
</style></head><body>
<h1>${state.schoolName} ${state.className} 班级周报 ${week}（${days[0]} 至 ${days[4]}）</h1>
<p class="note">仅教师留存：过程数据，不排名次、不含心情明细、数据不出班。</p>
<button onclick="window.print()">打印 / 另存为文件</button>
<table><thead><tr><th>学号</th><th>学生</th><th>基础达标天</th><th>照料天</th><th>申报 质/订/测/参</th><th>努力勾选</th><th>自评</th><th>一句复盘</th></tr></thead>
<tbody>${body}</tbody></table>
</body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
}

export function WeeklyReportPage({ state }: { state: AppState }) {
  const { rows, days, week } = buildRows(state)
  const care = moodCareList(state, state.classes[0]?.id ?? '')
  const today = todayStr(state)
  const active = state.derived?.weekActiveStudents
  const rosterN = state.derived?.rosterCount ?? rows.length

  return (
    <div>
      <div className="card">
        <h2>班级周报 · {week}</h2>
        <p className="muted">
          {days[0]} 至 {days[4]}（今天 {today}）· 仅教师可见：过程数据，不排名、不公示。导出后可作学期留存与家长面谈材料。
        </p>
        {active != null && (
          <p className="meta-copy">本周活跃学生 {active} / {rosterN}（有过任意一次成功操作即计）</p>
        )}
        <button className="primary" onClick={() => exportHtml(state)}>
          导出可打印网页
        </button>
        <table className="school-table">
          <thead>
            <tr>
              <th>学号</th>
              <th>学生</th>
              <th>基础达标天</th>
              <th>照料天</th>
              <th>申报 质/订/测/参</th>
              <th>努力勾选</th>
              <th>自评</th>
              <th>一句复盘</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.student.id}>
                <td>{r.student.studentNo ?? '—'}</td>
                <td>{r.student.name}</td>
                <td>{r.baseDone}</td>
                <td>{r.care}</td>
                <td>
                  {r.quality}/{r.correction}/{r.quiz}/{r.participation}
                </td>
                <td>
                  {r.krDone}/{r.krTarget}
                </td>
                <td>{r.selfScore ?? '未复盘'}</td>
                <td>{r.retro || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3>关怀提醒（不导出、不公示）</h3>
        {care.length === 0 && <p className="muted">今天没有报「雨」的同学。</p>}
        {care.map(({ student, streak }) => (
          <div key={student.id} className="item">
            {student.name}
            {streak >= 2 ? `（连续 ${streak} 天雨，建议课后聊聊）` : '（今日报雨）'}
          </div>
        ))}
      </div>
    </div>
  )
}
