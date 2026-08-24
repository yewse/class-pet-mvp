import type { AppState } from '../types'
import { schoolEffects, todayStr, weekRange } from '../rules'

function exportHtml(state: AppState) {
  const week = weekRange(todayStr(state), 0)
  const rows = schoolEffects(state)
  const body = rows
    .map(
      (r) =>
        `<tr><td>${r.className}</td><td>${r.name}</td><td>${r.streak}</td><td>${r.careDays}</td><td>${r.qualityCount}</td><td>${r.quizThis}（上周 ${r.quizPrev}，${r.quizDelta >= 0 ? '+' : ''}${r.quizDelta}）</td><td>${r.progress}</td></tr>`,
    )
    .join('')
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><title>成效周报</title>
<style>
body{font-family:"PingFang SC","Noto Sans SC",sans-serif;padding:24px;color:#2b241c}
h1{font-size:20px} table{border-collapse:collapse;width:100%}
th,td{border:1px solid #c9a56a;padding:8px;text-align:left}
th{background:#fff6e8} .note{color:#7a6a55;font-size:13px}
@media print { button{display:none} }
</style></head><body>
<h1>${state.schoolName} 成效周报 ${week.start}–${week.end}</h1>
<p class="note">对照自己，不排班级名次。学习进步分≠考试排名。家长只读、数据不出班。</p>
<button onclick="window.print()">打印 / 另存为文件</button>
<table><thead><tr><th>班级</th><th>学生</th><th>照料连续</th><th>本周照料天数</th><th>作业质量申报</th><th>自测对照（较自己）</th><th>学习进步分</th></tr></thead>
<tbody>${body}</tbody></table>
</body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
}

export function SchoolReportPage({ state }: { state: AppState }) {
  const week = weekRange(todayStr(state), 0)
  const rows = schoolEffects(state)
  return (
    <div className="card">
      <h2>成效周报</h2>
      <p className="muted">
        {week.start}–{week.end} · 连续照料、照料天数、作业质量条数、自测对照相对自己上周
      </p>
      <button className="primary" onClick={() => exportHtml(state)}>
        导出可打印网页
      </button>
      <table className="school-table">
        <thead>
          <tr>
            <th>班级</th>
            <th>学生</th>
            <th>连续</th>
            <th>照料天</th>
            <th>质量申报</th>
            <th>自测对照上周</th>
            <th>进步分</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.studentId}>
              <td>{r.className}</td>
              <td>{r.name}</td>
              <td>{r.streak}</td>
              <td>{r.careDays}</td>
              <td>{r.qualityCount}</td>
              <td>
                {r.quizThis}（上周 {r.quizPrev}，{r.quizDelta >= 0 ? '+' : ''}
                {r.quizDelta}）
              </td>
              <td>{r.progress}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
