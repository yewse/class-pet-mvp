import { useState } from 'react'
import { PetSvg } from '../components/PetSvg'
import {
  classOkrOf,
  classOkrProgress,
  classPerkOf,
  confirmKrTick,
  grantClassPerk,
  pendingTicksOf,
  personalOkrOf,
  saveClassRetro,
  setClassObjective,
  setStudentKrTarget,
  setStudentObjective,
} from '../store'
import { DEFAULT_CLASS_PERK, KR_TARGET_MAX, KR_TARGET_MIN, RETRO_MAX_LEN, rulesOf } from '../types'
import type { AppState } from '../types'
import { showToast } from '../toast'

export function GoalsPage({ state, meId }: { state: AppState; meId: string }) {
  const students = state.users.filter((u) => u.role === 'student')
  const classOkr = classOkrOf(state)
  const [classO, setClassO] = useState(classOkr.objective)
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(students.map((s) => [s.id, personalOkrOf(state, s.id).objective])),
  )
  const [msg, setMsg] = useState<string | null>(null)
  const [perkDraft, setPerkDraft] = useState(classOkr.perkText || DEFAULT_CLASS_PERK)
  const [retroDraft, setRetroDraft] = useState(classOkr.retro ?? '')
  const perk = classPerkOf(state)
  const pct = classOkrProgress(state)
  const perkThreshold = rulesOf(state).perkThresholdPct
  const lastClassRecord = [...(state.classOkrHistory ?? [])].sort((a, b) => (a.weekId < b.weekId ? 1 : -1))[0]

  async function saveAll() {
    let okCount = 0
    const errs: string[] = []
    for (const s of students) {
      const draft = drafts[s.id]
      if (draft == null || draft === personalOkrOf(state, s.id).objective) continue
      const e = await setStudentObjective(s.id, draft)
      if (e) errs.push(`${s.name}：${e}`)
      else okCount += 1
    }
    const text = errs.length ? `已保存 ${okCount} 人；${errs.join('；')}` : okCount ? `已保存 ${okCount} 人` : '没有改动'
    setMsg(text)
    showToast(text, errs.length ? 'err' : 'ok')
  }

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
          onClick={() => void setClassObjective(classO).then((e) => setMsg(e ?? '已保存班级目标'))}
        >
          保存班级目标
        </button>
        <p className="goal-formula">
          当前进度 {Math.min(100, pct)} / 100。按全周（周一到周五）计算：达标人次 ÷ 应到人次，豁免不计。
        </p>
        {pct >= perkThreshold && !perk && (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault()
              void grantClassPerk(perkDraft).then((err) => setMsg(err ?? '已发放本周集体奖励'))
            }}
          >
            <label>
              集体奖励说明
              <input value={perkDraft} onChange={(e) => setPerkDraft(e.target.value)} maxLength={24} />
            </label>
            <button type="submit" className="primary">发放本周集体奖励</button>
          </form>
        )}
        {perk && <p className="ok">本周集体奖励：{perk.text}（老师兑现）</p>}
        {pct < 50 && (
          <p className="week-rest">目标落后时，全班一起复盘，不是谁的错。</p>
        )}
        <div className="row">
          <label style={{ flex: 1 }}>
            班级一句复盘（周五仪式：什么有用 / 什么卡住 / 下周改一件事）
            <input
              value={retroDraft}
              onChange={(e) => setRetroDraft(e.target.value)}
              maxLength={RETRO_MAX_LEN}
              placeholder="例如：收作业改小组互查，快了很多"
            />
          </label>
          <button
            type="button"
            className="primary"
            onClick={() =>
              void saveClassRetro(retroDraft).then((e) => {
                setMsg(e ?? '已保存班级复盘')
                showToast(e ?? '已保存班级复盘', e ? 'err' : 'ok')
              })
            }
          >
            保存复盘
          </button>
        </div>
        {lastClassRecord && (
          <p className="muted">
            上周（{lastClassRecord.weekId}）：进度 {lastClassRecord.progressPct}%
            {lastClassRecord.perkGranted ? ' · 已发集体奖励' : ''}
            {lastClassRecord.retro ? ` · 复盘：${lastClassRecord.retro}` : ' · 未复盘'}
          </p>
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
                  expression={pet.expression}
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
        <p className="muted">目标以学生自己写为主；老师代改是兜底。格子数按学生近期水平定（最近发展区），不公示对比。</p>
        <table className="school-table">
          <thead>
            <tr>
              <th>姓名</th>
              <th>目标</th>
              <th>努力勾选</th>
              <th>本周自评</th>
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
                    <button
                      type="button"
                      disabled={okr.krTarget <= KR_TARGET_MIN}
                      onClick={() => void setStudentKrTarget(s.id, okr.krTarget - 1)}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      disabled={okr.krTarget >= KR_TARGET_MAX}
                      onClick={() => void setStudentKrTarget(s.id, okr.krTarget + 1)}
                    >
                      +
                    </button>
                    {pendingTicksOf(state, s.id).map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        className="primary"
                        onClick={() => void confirmKrTick(k.id, meId).then((e) => setMsg(e ?? `已确认 ${s.name}`))}
                      >
                        确认
                      </button>
                    ))}
                  </td>
                  <td>{okr.selfScore != null ? `${okr.selfScore}${okr.retro ? ` · ${okr.retro}` : ''}` : '未复盘'}</td>
                  <td>
                    <button
                      type="button"
                      className="primary"
                      onClick={() =>
                        void setStudentObjective(s.id, drafts[s.id] ?? okr.objective).then((e) =>
                          setMsg(e ?? `已保存 ${s.name}`),
                        )
                      }
                    >
                      保存
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="row">
          <button type="button" className="primary" onClick={() => void saveAll()}>
            全部保存
          </button>
        </div>
      </div>
    </div>
  )
}
