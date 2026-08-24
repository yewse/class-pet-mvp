import { useState } from 'react'
import { awardSquadPoint, settleCurrentWeek, settleHonor, squadCombo } from '../store'
import type { AppState, HonorTier, RuleConfig } from '../types'
import { rulesOf } from '../types'
import { squadTier, weekIdOf } from '../rules'
import { showToast } from '../toast'

function tierText(points: number, cfg: RuleConfig, honor?: HonorTier): string {
  const t = honor ?? squadTier(points, cfg)
  if (t === 'gold') return '金'
  if (t === 'silver') return '银'
  if (t === 'bronze') return '铜'
  return '进行中'
}

export function SquadPage({ state, meId, isTeacher }: { state: AppState; meId: string; isTeacher?: boolean }) {
  const week = weekIdOf(state)
  const cfg = rulesOf(state)
  const roster = state.users.filter((u) => u.role === 'student')
  const squads = state.squads
  const myTeam = squads.find((s) => s.memberIds.includes(meId))
  const [label, setLabel] = useState('进步之星')
  const [honorTo, setHonorTo] = useState(roster[0]?.id ?? '')

  return (
    <div className="grid2">
      <div className="card">
        <h2>小队周赛 {week}</h2>
        <p className="muted">
          无班级总分榜、无垫底名单。档位：铜≥{cfg.squadBronze} / 银≥{cfg.squadSilver} / 金≥{cfg.squadGold}。
          互助点来源：老师记互助、每周一次小队连携（+{cfg.squadComboBonus}）。换周自动结算。
        </p>
        {squads.length === 0 && <p className="muted">还没有小队。（小队编组功能在花名册完善后开放）</p>}
        {squads.map((sq) => {
          const sw = state.squadWeeks.find((w) => w.weekId === week && w.teamId === sq.id)
          const pts = sw?.points ?? 0
          return (
            <div key={sq.id} className="item">
              <strong>{sq.name}</strong> · {pts} 互助点 · {tierText(pts, cfg, sw?.honor)}
              <div className="muted">
                {sq.memberIds.map((id) => state.users.find((u) => u.id === id)?.name).join('、')}
                {sw?.comboUsed ? ' · 已连携' : ''}
                {sw?.honor ? ` · 已结算${tierText(pts, cfg, sw.honor)}` : ''}
              </div>
              <div className="row">
                {myTeam?.id === sq.id && (
                  <button type="button" className="primary" onClick={() => {
                    void squadCombo(sq.id).then((e) => showToast(e ?? `小队连携 +${cfg.squadComboBonus}`, e ? 'err' : 'ok'))
                  }}>本周连携</button>
                )}
                {isTeacher && (
                  <button type="button" onClick={() => {
                    void awardSquadPoint(sq.id).then((e) => showToast(e ?? `${sq.name} 互助 +1`, e ? 'err' : 'ok'))
                  }}>
                    记互助 +1
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {isTeacher && (
          <div className="row">
            <button className="primary" type="button" onClick={() => {
              void settleCurrentWeek().then((e) => showToast(e ?? '已按档位结算并写入荣誉橱窗', e ? 'err' : 'ok'))
            }}>
              结算本周档位
            </button>
          </div>
        )}
      </div>
      <div className="card">
        <h2>本周荣誉橱窗 ≤{cfg.honorWallMax}</h2>
        <p className="muted">上限按本周计，同一人连续上墙不超过 {cfg.honorStreakMax} 周</p>
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
              写给谁
              <select value={honorTo} onChange={(e) => setHonorTo(e.target.value)}>
                {roster.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.studentNo ? `（${s.studentNo}）` : ''}
                  </option>
                ))}
              </select>
            </label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={12} aria-label="荣誉名称" />
            <button
              onClick={() => {
                if (!honorTo) {
                  showToast('先选择学生', 'err')
                  return
                }
                void settleHonor(honorTo, label).then((e) => showToast(e ?? '已上墙', e ? 'err' : 'ok'))
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
