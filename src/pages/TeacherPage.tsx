import { useEffect, useState } from 'react'
import { lastTeacherAudit, teacherAudit, toggleClassHour, undoTeacherAudit } from '../store'
import type { AppState, Report } from '../types'
import { CATEGORY_LABEL, STATUS_LABEL, displayLedgerReason } from '../types'
import { auditQueue } from '../rules'
import { showToast } from '../toast'

export function TeacherPage({ state, classId }: { state: AppState; classId?: string }) {
  const cid = classId || 'c1'
  const q = auditQueue(state, cid)
  const locked = !!(cid && state.inClassHour?.[cid])
  const cname = state.classes.find((c) => c.id === cid)?.name ?? '初二（3）班'
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [openReject, setOpenReject] = useState<string | null>(null)
  const [rows, setRows] = useState<Report[]>(() => q)
  const [faded, setFaded] = useState<Set<string>>(new Set())
  const canUndo = !!lastTeacherAudit()

  useEffect(() => {
    setRows((prev) => {
      const order = prev.map((r) => r.id)
      const seen = new Set(order)
      const next: Report[] = prev.map((r) => state.reports.find((x) => x.id === r.id) ?? r)
      for (const r of q) {
        if (!seen.has(r.id)) {
          next.push(r)
          seen.add(r.id)
        }
      }
      return next
    })
  }, [state.reports, q])

  useEffect(() => {
    const done = rows.filter((r) => r.status === 'posted' || r.status === 'rejected' || r.status === 'auto_posted')
    if (!done.length) return
    const timers = done.map((r) =>
      window.setTimeout(() => {
        setFaded((s) => new Set([...s, r.id]))
      }, 2200),
    )
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [rows])

  function approve(id: string) {
    const e = teacherAudit(id, 'approve')
    showToast(e ?? '已通过入账', e ? 'err' : 'ok')
  }

  function reject(id: string) {
    const note = (reasons[id] ?? '').trim()
    if (!note) {
      setOpenReject(id)
      showToast('驳回必须填写理由', 'err')
      return
    }
    const e = teacherAudit(id, 'reject', note)
    showToast(e ?? '已驳回', e ? 'err' : 'err')
    if (!e) {
      setOpenReject(null)
      setReasons((r) => ({ ...r, [id]: '' }))
    }
  }

  const visible = rows.filter((r) => !faded.has(r.id))

  return (
    <div className="card">
      <h2>抽查 · {cname}队列</h2>
      <p className="meta-copy">仅本班，{q.length} 条待处理（每班 5–8）。不见全校混排、不见补给名单、不评皮肤。</p>
      {cid && (
        <label className="class-hour-toggle">
          <input type="checkbox" checked={locked} onChange={() => toggleClassHour(cid)} />
          <span>上课中（暂停本班轻点/喂食/互访）</span>
        </label>
      )}
      {canUndo && (
        <div className="row">
          <button
            type="button"
            className="undo-audit"
            onClick={() => {
              const e = undoTeacherAudit()
              showToast(e ?? '已撤销上次核验', e ? 'err' : 'ok')
              setFaded(new Set())
            }}
          >
            撤销上次操作
          </button>
        </div>
      )}
      {visible.map((r) => {
        const done = r.status === 'posted' || r.status === 'rejected' || r.status === 'auto_posted'
        return (
          <div key={r.id} className={`item audit-row ${done ? 'audit-done' : ''}`}>
            <div>
              {state.users.find((u) => u.id === r.authorId)?.name} · {CATEGORY_LABEL[r.category]} · {STATUS_LABEL[r.status] ?? r.status}
              {done && <span className="handled-tag"> 已处理</span>}
            </div>
            <p>{r.evidence}</p>
            <div className="meta-copy">
              互评属实 {r.peerFacts} / 存疑 {r.peerDoubts}（不展示评者姓名）
            </div>
            {!done && (
              <div className="row">
                <button type="button" className="primary" onClick={() => approve(r.id)}>
                  通过
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    if (openReject !== r.id) setOpenReject(r.id)
                    else reject(r.id)
                  }}
                >
                  驳回
                </button>
              </div>
            )}
            {!done && openReject === r.id && (
              <label>
                驳回理由（必填）
                <input
                  value={reasons[r.id] ?? ''}
                  onChange={(e) => setReasons((m) => ({ ...m, [r.id]: e.target.value }))}
                  maxLength={40}
                  placeholder="写一句理由后再点驳回"
                />
              </label>
            )}
          </div>
        )
      })}
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
