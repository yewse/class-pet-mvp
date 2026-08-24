import { useState } from 'react'
import { PetSvg } from '../components/PetSvg'
import {
  classOkrOf,
  classOkrProgress,
  classPerkOf,
  classWeekBehind,
  confirmKrTick,
  displayExpr,
  grantClassPerk,
  pendingTicksOf,
  personalOkrOf,
  setClassObjective,
  setStudentKrTarget,
  setStudentObjective,
} from '../store'
import { DEFAULT_CLASS_PERK } from '../types'
import type { AppState } from '../types'

export function GoalsPage({ state }: { state: AppState }) {
  const students = state.users.filter((u) => u.role === 'student' && u.classId === 'c1')
  const classOkr = classOkrOf(state)
  const [classO, setClassO] = useState(classOkr.objective)
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(students.map((s) => [s.id, personalOkrOf(state, s.id).objective])),
  )
  const [msg, setMsg] = useState<string | null>(null)
  const [perkDraft, setPerkDraft] = useState(classOkr.perkText || DEFAULT_CLASS_PERK)
  const perk = classPerkOf(state)
  const pct = classOkrProgress(state)

  return (
    <div>
      <div className="card">
        <h2>本周目标</h2>
        <p className="muted">只和自己比进度。班级目标显示在课堂大屏顶端。</p>
        <label>
          班级目标
          <input value={classO} onChange={(e) => setClassO(e.target.value)} maxLength={16} />
        </label>
        <button
          type="button"
          className="primary"
          onClick={() => setMsg(setClassObjective(classO) ?? '已保存班级目标')}
        >
          保存班级目标
        </button>
        <p className="muted">
          当前进度 {pct} / 100（本周基础达标人次 ÷ 人数×工作日）。个人贡献只计确认过的努力勾选，不计考试分。
        </p>
        {pct >= 80 && !perk && (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault()
              setMsg(grantClassPerk(perkDraft) ?? '已发放本周集体奖励')
            }}
          >
            <label>
              集体奖励说明
              <input value={perkDraft} onChange={(e) => setPerkDraft(e.target.value)} maxLength={24} />
            </label>
            <button type="submit" className="primary">发放本周集体奖励</button>
          </form>
        )}
        {perk && <p className="ok">本周集体奖励：{perk.text}（不自动删作业）</p>}
        {classWeekBehind(state) && (
          <p className="week-rest">目标没到，全班一起复盘，不是谁的错。</p>
        )}
        {msg && <p className={msg.startsWith('已') ? 'ok' : 'err'}>{msg}</p>}
        <div className="week-pets">
          {students.map((s) => {
            const pet = state.pets.find((p) => p.ownerId === s.id)
            if (!pet) return null
            return (
              <div key={s.id} className="week-pet">
                <PetSvg
                  compact
                  species={pet.species}
                  face={pet.face}
                  expression={displayExpr(state, pet, true)}
                  skinId={pet.skinId}
                  mountId={pet.mountId}
                  paletteId={pet.paletteId}
                  marking={pet.marking}
                  headwearId={pet.headwearId}
                  clothesId={pet.clothesId}
                  shoesId={pet.shoesId}
                />
                <div>{s.name}</div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="card">
        <h3>个人目标</h3>
        <table className="school-table">
          <thead>
            <tr>
              <th>姓名</th>
              <th>目标</th>
              <th>努力勾选</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const okr = personalOkrOf(state, s.id)
              return (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>
                    <input
                      value={drafts[s.id] ?? okr.objective}
                      onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                      maxLength={16}
                    />
                  </td>
                  <td>
                    {okr.krDone}/{okr.krTarget}
                    {pendingTicksOf(state, s.id).length ? ' · 待确认' : ''}{' '}
                    <button type="button" onClick={() => setStudentKrTarget(s.id, okr.krTarget === 4 ? 6 : 4)}>
                      {okr.krTarget} 格
                    </button>
                    {pendingTicksOf(state, s.id).map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        className="primary"
                        onClick={() => setMsg(confirmKrTick(k.id, state.session?.userId ?? 't1') ?? `已确认 ${s.name}`)}
                      >
                        确认
                      </button>
                    ))}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => setMsg(setStudentObjective(s.id, drafts[s.id] ?? okr.objective) ?? `已保存 ${s.name}`)}
                    >
                      保存
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
