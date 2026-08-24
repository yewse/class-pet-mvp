import { useState } from 'react'
import {
  addStudent,
  addStudentsBatch,
  assignSeat,
  classLayoutOf,
  deleteStudent,
  occupantAt,
  personalOkrOf,
  recordConsent,
  resetPin,
  setClassLayout,
  setStudentObjective,
  updateStudent,
} from '../store'
import { LAYOUT_MAX_COLS, LAYOUT_MAX_ROWS, LAYOUT_MIN_COLS, LAYOUT_MIN_ROWS, seatLabel } from '../types'
import { showToast } from '../toast'
import type { AppState } from '../types'

type BatchRow = { name: string; studentNo?: string; pin: string }

export function RosterPage({ state }: { state: AppState }) {
  const layout = classLayoutOf(state)
  const students = state.users
    .filter((u) => u.role === 'student')
    .slice()
    .sort((a, b) => {
      const ar = a.seat?.row ?? 99
      const br = b.seat?.row ?? 99
      if (ar !== br) return ar - br
      return (a.seat?.col ?? 99) - (b.seat?.col ?? 99)
    })
  const meta = state.rosterMeta ?? {}
  const [name, setName] = useState('')
  const [no, setNo] = useState('')
  const [batch, setBatch] = useState('')
  const [showBatch, setShowBatch] = useState(false)
  const [batchRows, setBatchRows] = useState<BatchRow[] | null>(null)
  const [batchErrors, setBatchErrors] = useState<string[]>([])
  const [pins, setPins] = useState<Record<string, string>>({})
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editNo, setEditNo] = useState('')
  const [editO, setEditO] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [placingId, setPlacingId] = useState<string | null>(null)

  function setSeat(studentId: string, row: number, col: number) {
    void assignSeat(studentId, row, col).then((e) => {
      const text = e ?? `已调至 ${seatLabel({ row, col })}`
      setMsg(text)
      showToast(text, e ? 'err' : 'ok')
      if (!e) setPlacingId(null)
    })
  }

  function changeLayout(rows: number, cols: number) {
    void setClassLayout(rows, cols).then((e) =>
      showToast(e ?? `教室已调整为 ${cols} 列 × ${rows} 排（${rows * cols} 座）`, e ? 'err' : 'ok'),
    )
  }

  const placing = students.find((s) => s.id === placingId)
  const capacity = layout.rows * layout.cols

  return (
    <div>
      <div className="card roster-add">
        <h2>花名册</h2>
        <p className="muted">
          新学生入册即生成 6 位 PIN（抄给学生登录用）。学生登录前必须先登记监护人同意书。同名学生用学号区分。
        </p>
        <div className="row" aria-label="教室布局">
          <span className="muted">教室布局 {layout.cols} 列 × {layout.rows} 排 · {capacity} 座（学生 {students.length} 人）</span>
          <button
            type="button"
            disabled={layout.rows <= LAYOUT_MIN_ROWS}
            onClick={() => changeLayout(layout.rows - 1, layout.cols)}
          >
            排 −
          </button>
          <button
            type="button"
            disabled={layout.rows >= LAYOUT_MAX_ROWS}
            onClick={() => changeLayout(layout.rows + 1, layout.cols)}
          >
            排 +
          </button>
          <button
            type="button"
            disabled={layout.cols <= LAYOUT_MIN_COLS}
            onClick={() => changeLayout(layout.rows, layout.cols - 1)}
          >
            列 −
          </button>
          <button
            type="button"
            disabled={layout.cols >= LAYOUT_MAX_COLS}
            onClick={() => changeLayout(layout.rows, layout.cols + 1)}
          >
            列 +
          </button>
        </div>
        <form
          className="row roster-add-form"
          onSubmit={(e) => {
            e.preventDefault()
            void addStudent(name, no).then(({ error, result }) => {
              if (error) {
                setMsg(error)
                showToast(error, 'err')
                return
              }
              const text = `已加入 ${name.trim()}，PIN：${result?.pin}（抄给学生，仅显示一次）`
              setMsg(text)
              showToast(text, 'ok')
              if (result) setPins((p) => ({ ...p, [result.id]: result.pin }))
              setName('')
              setNo('')
            })
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="学生姓名（必填）"
            aria-label="学生姓名"
          />
          <input
            value={no}
            onChange={(e) => setNo(e.target.value)}
            placeholder="学号（选填）"
            aria-label="学号"
            style={{ maxWidth: 120 }}
          />
          <button className="primary" type="submit">
            添加学生
          </button>
          <button type="button" className="secondary" onClick={() => setShowBatch((v) => !v)}>
            {showBatch ? '收起批量导入' : '批量导入'}
          </button>
        </form>
        {showBatch && (
          <div>
            <textarea
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              rows={5}
              placeholder={'每行一个学生：\n张伟 07\n李娜\n08 王芳'}
              aria-label="批量导入名单"
            />
            <button
              type="button"
              className="primary"
              onClick={() =>
                void addStudentsBatch(batch).then(({ error, result }) => {
                  if (error) {
                    showToast(error, 'err')
                    return
                  }
                  setBatchRows(result?.rows ?? [])
                  setBatchErrors(result?.errors ?? [])
                  setBatch('')
                  showToast(`已导入 ${result?.rows.length ?? 0} 人`, 'ok')
                })
              }
            >
              导入名单
            </button>
            {batchRows && (
              <div className="retest-box">
                <p className="pad-block-label">本次导入的登录 PIN（仅显示一次，请立即抄发或打印）</p>
                <table className="school-table">
                  <thead>
                    <tr>
                      <th>姓名</th>
                      <th>学号</th>
                      <th>PIN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchRows.map((r, i) => (
                      <tr key={i}>
                        <td>{r.name}</td>
                        <td>{r.studentNo ?? '—'}</td>
                        <td><strong>{r.pin}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {batchErrors.length > 0 && <p className="err">跳过：{batchErrors.join('；')}</p>}
              </div>
            )}
          </div>
        )}
        {msg && <p className={msg.startsWith('已') ? 'ok' : 'err'}>{msg}</p>}
      </div>

      <div className="card">
        <div className="roster-room">
          <div className="roster-stage">讲台</div>
          <div className="roster-grid" style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: layout.rows * layout.cols }, (_, i) => {
              const row = Math.floor(i / layout.cols) + 1
              const col = (i % layout.cols) + 1
              const who = occupantAt(state.users, row, col)
              const coord = seatLabel({ row, col })
              return (
                <button
                  key={`${row}-${col}`}
                  type="button"
                  className={`roster-desk ${who ? 'occ' : 'empty'}`}
                  disabled={!!who || !placingId}
                  title={coord}
                  onClick={() => {
                    if (placingId && !who) setSeat(placingId, row, col)
                  }}
                >
                  {who ? who.name : coord}
                </button>
              )
            })}
          </div>
        </div>

        <table className="school-table roster-table">
          <thead>
            <tr>
              <th>座号</th>
              <th>学号</th>
              <th>姓名</th>
              <th>宠物</th>
              <th>本周目标</th>
              <th>同意书</th>
              <th>PIN</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const pet = state.pets.find((p) => p.ownerId === s.id)
              const okr = personalOkrOf(state, s.id)
              const m = meta[s.id]
              return (
                <tr key={s.id} className={placingId === s.id ? 'placing-row' : ''}>
                  <td>{seatLabel(s.seat)}</td>
                  <td>
                    {editId === s.id ? (
                      <input value={editNo} onChange={(e) => setEditNo(e.target.value)} style={{ maxWidth: 80 }} />
                    ) : (
                      s.studentNo ?? '—'
                    )}
                  </td>
                  <td>
                    {editId === s.id ? (
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                    ) : (
                      s.name
                    )}
                  </td>
                  <td>{pet ? pet.nickname : '尚未领养'}</td>
                  <td>
                    {editId === s.id ? (
                      <input value={editO} onChange={(e) => setEditO(e.target.value)} maxLength={16} />
                    ) : (
                      `${okr.objective || '未设'} ${okr.krDone}/${okr.krTarget}`
                    )}
                  </td>
                  <td>
                    {m?.consentAt ? (
                      <span className="ok">已登记</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          void recordConsent(s.id, 'paper').then(({ error }) =>
                            showToast(error ?? `已登记 ${s.name} 的监护人同意（纸质）`, error ? 'err' : 'ok'),
                          )
                        }
                      >
                        登记（收到纸质）
                      </button>
                    )}
                  </td>
                  <td>
                    {pins[s.id] ? (
                      <strong>{pins[s.id]}</strong>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          void resetPin(s.id).then(({ error, result }) => {
                            if (error) {
                              showToast(error, 'err')
                              return
                            }
                            if (result) setPins((p) => ({ ...p, [s.id]: result.pin }))
                            showToast(`已重置 ${s.name} 的 PIN，请抄给学生`, 'ok')
                          })
                        }
                      >
                        重置 PIN
                      </button>
                    )}
                  </td>
                  <td>
                    {editId === s.id ? (
                      <div className="row">
                        <button
                          type="button"
                          className="primary"
                          onClick={() => {
                            void (async () => {
                              const r1 = await updateStudent(s.id, editName, editNo)
                              const e = r1.error ?? (await setStudentObjective(s.id, editO))
                              setMsg(e ?? '已保存')
                              showToast(e ?? '已保存', e ? 'err' : 'ok')
                              if (!e) setEditId(null)
                            })()
                          }}
                        >
                          保存
                        </button>
                        <button type="button" onClick={() => setEditId(null)}>
                          取消
                        </button>
                      </div>
                    ) : (
                      <div className="row">
                        <button
                          type="button"
                          className={placingId === s.id ? 'primary' : ''}
                          onClick={() => setPlacingId(placingId === s.id ? null : s.id)}
                        >
                          {placingId === s.id ? '取消点位' : '点空位'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditId(s.id)
                            setEditName(s.name)
                            setEditNo(s.studentNo ?? '')
                            setEditO(okr.objective)
                          }}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm(`确认删除 ${s.name}？将删除其账号、宠物、积分、申报与周期历史（不可恢复）。`)) return
                            void deleteStudent(s.id).then(({ error }) => {
                              setMsg(error ?? `已删除 ${s.name}`)
                              showToast(error ?? `已删除 ${s.name}`, error ? 'err' : 'ok')
                            })
                          }}
                        >
                          删除
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {placing && <p className="muted">正在给 {placing.name} 调座。</p>}
        <p className="muted">
          学生登录方式：班级 + 姓名（同名加学号）+ PIN。忘记 PIN 用「重置 PIN」；转学/毕业用「删除」行使数据删除。
        </p>
      </div>
    </div>
  )
}
