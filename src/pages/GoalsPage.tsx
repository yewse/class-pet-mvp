import { useState } from 'react'
import {
  classOkrOf,
  classOkrProgress,
  personalOkrOf,
  setClassObjective,
  setStudentKrTarget,
  setStudentObjective,
} from '../store'
import type { AppState } from '../types'

export function GoalsPage({ state }: { state: AppState }) {
  const students = state.users.filter((u) => u.role === 'student' && u.classId === 'c1')
  const classOkr = classOkrOf(state)
  const [classO, setClassO] = useState(classOkr.objective)
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(students.map((s) => [s.id, personalOkrOf(state, s.id).objective])),
  )
  const [msg, setMsg] = useState<string | null>(null)

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
          当前进度 {classOkrProgress(state)} / 100（{classOkr.doneCount}/{students.length}）
        </p>
        {msg && <p className={msg.startsWith('已') ? 'ok' : 'err'}>{msg}</p>}
      </div>
      <div className="card">
        <h3>个人目标</h3>
        <table className="school-table">
          <thead>
            <tr>
              <th>姓名</th>
              <th>目标</th>
              <th>勾选</th>
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
                    {okr.krDone}/{okr.krTarget}{' '}
                    <button type="button" onClick={() => setStudentKrTarget(s.id, okr.krTarget === 4 ? 6 : 4)}>
                      {okr.krTarget} 格
                    </button>
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
