import { useState } from 'react'
import { advanceWeek, currentWeek, settleCurrentWeek, settleHonor, squadCombo } from '../store'
import type { AppState, HonorTier } from '../types'
import { HONOR_WALL_MAX } from '../types'
import { squadTier } from '../rules'
import { showToast } from '../toast'

function tierText(points: number, honor?: HonorTier): string {
  const t = honor ?? squadTier(points)
  if (t === 'gold') return '金'
  if (t === 'silver') return '银'
  if (t === 'bronze') return '铜'
  return '进行中'
}

export function SquadPage({ state, meId, isTeacher }: { state: AppState; meId: string; isTeacher?: boolean }) {
  const week = currentWeek()
  const viewClassId = 'c1'
  const squads = state.squads.filter((s) =>
    s.memberIds.some((id) => {
      const u = state.users.find((x) => x.id === id)
      return u?.role === 'student' && (u.classId === viewClassId || !u.classId)
    }),
  )
  const myTeam = squads.find((s) => s.memberIds.includes(meId))
  const [label, setLabel] = useState('进步之星')
  const students = state.users.filter((u) => u.role === 'student' && u.classId === viewClassId)
  const [honorSid, setHonorSid] = useState(students[0]?.id ?? '')

  return (
    <div className="grid2">
      <div className="card">
        <h2>小队周赛 {week}</h2>
        <p className="muted">无班级总分榜、无垫底名单。档位：铜≥3 / 银≥6 / 金≥10。换周自动结算。</p>
        {squads.map((sq) => {
          const sw = state.squadWeeks.find((w) => w.weekId === week && w.teamId === sq.id)
          const pts = sw?.points ?? 0
          return (
            <div key={sq.id} className="item">
              <strong>{sq.name}</strong> · {pts} 互助点 · {tierText(pts, sw?.honor)}
              <div className="muted">
                {sq.memberIds.map((id) => state.users.find((u) => u.id === id)?.name).join('、')}
                {sw?.comboUsed ? ' · 已连携' : ''}
                {sw?.honor ? ` · 已结算${tierText(pts, sw.honor)}` : ''}
              </div>
              {myTeam?.id === sq.id && (
                <button type="button" className="primary" onClick={() => {
                  const e = squadCombo(sq.id)
                  showToast(e ?? '小队连携 +3', e ? 'err' : 'ok')
                }}>本周连携</button>
              )}
            </div>
          )
        })}
        {isTeacher && (
          <div className="row">
            <button className="primary" type="button" onClick={() => {
              const e = settleCurrentWeek()
              showToast(e ?? '已按档位结算并写入荣誉橱窗', e ? 'err' : 'ok')
            }}>
              结算本周档位
            </button>
            <button type="button" className="secondary" onClick={() => {
              const e = advanceWeek()
              showToast(e ?? '已进入下一周', e ? 'err' : 'ok')
            }}>模拟进入下一周</button>
          </div>
        )}
      </div>
      <div className="card">
        <h2>本周荣誉橱窗 ≤{HONOR_WALL_MAX}</h2>
        <p className="muted">上限按本周计，同一人连续上墙不超过 2 周</p>
        <ol>
          {state.honors.filter((h) => h.weekId === week).map((h) => (
            <li key={h.id}>
              {h.weekId} {state.users.find((u) => u.id === h.studentId)?.name} · {h.label}
            </li>
          ))}
        </ol>
        {isTeacher && (
          <>
            <label>
              选择学生
              <select value={honorSid} onChange={(e) => setHonorSid(e.target.value)} aria-label="上墙学生">
                <option value="">请选择</option>
                {students.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} aria-label="荣誉称号" />
            <button
              onClick={() => {
                if (!honorSid) {
                  showToast('请先选择学生', 'err')
                  return
                }
                const e = settleHonor(honorSid, label)
                showToast(e ?? '已上墙', e ? 'err' : 'ok')
              }}
            >
              老师写入荣誉
            </button>
          </>
        )}
      </div>
    </div>
  )
}
