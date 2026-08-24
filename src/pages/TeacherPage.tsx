import { teacherAudit, toggleClassHour } from '../store'
import type { AppState } from '../types'
import { CATEGORY_LABEL, STATUS_LABEL, displayLedgerReason } from '../types'
import { auditQueue } from '../rules'

export function TeacherPage({ state, classId }: { state: AppState; classId?: string }) {
  const cid = classId || 'c1'
  const q = auditQueue(state, cid)
  const locked = !!(cid && state.inClassHour?.[cid])
  const cname = state.classes.find((c) => c.id === cid)?.name ?? '初二（3）班'
  return (
    <div className="card">
      <h2>抽查 · {cname}队列</h2>
      <p className="muted">仅本班，{q.length} 条（每班 5–8）。不见全校混排、不见补给名单、不评皮肤。</p>
      {cid && (
        <label className="class-hour-toggle">
          <input type="checkbox" checked={locked} onChange={() => toggleClassHour(cid)} />
          <span>上课中（暂停本班轻点/喂食/互访）</span>
        </label>
      )}
      {q.map((r) => (
        <div key={r.id} className="item">
          <div>
            {state.users.find((u) => u.id === r.authorId)?.name} · {CATEGORY_LABEL[r.category]} · {STATUS_LABEL[r.status] ?? r.status}
          </div>
          <p>{r.evidence}</p>
          <div className="muted">
            互评属实 {r.peerFacts} / 存疑 {r.peerDoubts}（不展示评者姓名）
          </div>
          <div className="row">
            <button onClick={() => alert(teacherAudit(r.id, 'approve') ?? '已通过入账')}>通过</button>
            <button onClick={() => alert(teacherAudit(r.id, 'reject') ?? '已驳回')}>驳回</button>
          </div>
        </div>
      ))}
      <h3>本班流水</h3>
      <ul>
        {state.ledger
          .filter((l) => {
            const u = state.users.find((x) => x.id === l.studentId)
            return !cid || u?.classId === cid
          })
          .map((l) => (
            <li key={l.id}>
              {l.date} {state.users.find((u) => u.id === l.studentId)?.name} {l.delta > 0 ? '+' : ''}
              {l.delta} {displayLedgerReason(l.reason)}
            </li>
          ))}
      </ul>
    </div>
  )
}
