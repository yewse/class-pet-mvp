import { useState } from 'react'
import type { AppState } from '../types'
import { HONOR_WALL_MAX } from '../types'
import { classProgressPoints, habitRate, todayStr, weekRange } from '../rules'
import { leaveClassWipe } from '../store'

const DEMO_LEAVE_ID = 's4'

export function SchoolHomePage({ state }: { state: AppState }) {
  const today = todayStr(state)
  const week = weekRange(today, 0)
  const weekId = state.activeWeek
  const honors = state.honors.filter((h) => h.weekId === weekId).slice(-HONOR_WALL_MAX)
  const demo = state.users.find((u) => u.id === DEMO_LEAVE_ID)
  const demoPet = state.pets.find((p) => p.ownerId === DEMO_LEAVE_ID)
  const [note, setNote] = useState<string | null>(null)

  return (
    <div>
      <div className="card">
        <h2>{state.schoolName} · 校务首页</h2>
        <p className="muted">
          本周 {week.start}–{week.end} · 只看习惯完成率与学习进步分，不排考试名次
        </p>
      </div>
      <div className="grid2">
        {(state.classes ?? []).map((c) => {
          const n = state.users.filter((u) => u.role === 'student' && u.classId === c.id).length
          return (
            <div key={c.id} className="card">
              <h3>{c.name}</h3>
              <p>{n} 名学生</p>
              <p>
                周习惯完成率 <strong>{habitRate(state, c.id, week.days)}%</strong>
              </p>
              <p>
                学习进步分 <strong>{classProgressPoints(state, c.id, week.days)}</strong>
                <span className="muted">（作业/订正/自测/参与入账，非考试排名）</span>
              </p>
            </div>
          )
        })}
      </div>
      <div className="card">
        <h3>离班清退（演示）</h3>
        <p className="muted">校务操作：从本地存储删除该生宠物、钱包流水、申报（含互评）。账号仍在名册，但养成数据清空。</p>
        {demo && demoPet ? (
          <div className="row">
            <button
              onClick={() => {
                if (!confirm(`确认清退 ${demo.name}？将删除宠物「${demoPet.nickname}」、积分流水与全部申报。`)) return
                const e = leaveClassWipe(demo.id)
                setNote(e ?? `已清退 ${demo.name}：宠物、积分流水与申报已从本地数据删除`)
              }}
            >
              清退 {demo.name}（二班演示）
            </button>
          </div>
        ) : (
          <p className="muted">演示对象苏晚晚的养成数据已清空。点顶栏「重置演示」可恢复。</p>
        )}
        {note && <p className="err">{note}</p>}
      </div>
      <div className="card">
        <h3>荣誉橱窗精选</h3>
        <p className="muted">仅高亮上墙条目，不公开全校排名</p>
        {honors.length === 0 && <p>本周暂无上墙</p>}
        <ol>
          {honors.map((h) => (
            <li key={h.id}>
              {h.weekId} {state.users.find((u) => u.id === h.studentId)?.name} · {h.label}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
