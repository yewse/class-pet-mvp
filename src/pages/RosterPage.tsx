import { useState } from 'react'
import { addStudent, assignSeat, classLayoutOf, deleteStudent, occupantAt, renameStudent } from '../store'
import { seatLabel } from '../types'
import { showToast } from '../toast'
import type { AppState } from '../types'

export function RosterPage({ state }: { state: AppState }) {
  const layout = classLayoutOf(state)
  const students = state.users
    .filter((u) => u.role === 'student' && u.classId === 'c1')
    .slice()
    .sort((a, b) => {
      const ar = a.seat?.row ?? 99
      const br = b.seat?.row ?? 99
      if (ar !== br) return ar - br
      return (a.seat?.col ?? 99) - (b.seat?.col ?? 99)
    })
  const [name, setName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [placingId, setPlacingId] = useState<string | null>(null)

  function setSeat(studentId: string, row: number, col: number) {
    const e = assignSeat(studentId, row, col)
    const text = e ?? `已调至 ${seatLabel({ row, col })}`
    setMsg(text)
    showToast(text)
    if (!e) setPlacingId(null)
  }

  const placing = students.find((s) => s.id === placingId)

  return (
    <div>
      <div className="card roster-add">
        <h2>花名册</h2>
        <p className="muted">点「点空位」后再点教室图中的空座位即可调座。</p>
        <form
          className="row roster-add-form"
          onSubmit={(e) => {
            e.preventDefault()
            const err = addStudent(name)
            const text = err ?? `已加入 ${name.trim()}（默认第一空位）`
            setMsg(text)
            showToast(text)
            if (!err) setName('')
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="学生姓名（必填）"
            aria-label="学生姓名"
          />
          <button className="primary" type="submit">
            添加学生
          </button>
        </form>
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
              <th>姓名</th>
              <th>宠物</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const pet = state.pets.find((p) => p.ownerId === s.id)
              return (
                <tr key={s.id} className={placingId === s.id ? 'placing-row' : ''}>
                  <td>{seatLabel(s.seat)}</td>
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
                      <div className="row">
                        <button
                          type="button"
                          className="primary"
                          onClick={() => {
                            setMsg(renameStudent(s.id, editName) ?? '已改名')
                            setEditId(null)
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
                          }}
                        >
                          改名
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm(`确认删除 ${s.name}？将清空宠物与积分（与退班相同）。`)) return
                            setMsg(deleteStudent(s.id) ?? `已删除 ${s.name}`)
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
      </div>
    </div>
  )
}
