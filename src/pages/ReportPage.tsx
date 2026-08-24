import { useState } from 'react'
import { peerReview, submitReport } from '../store'
import type { AppState, ReportCategory } from '../types'
import { CATEGORY_LABEL, CATEGORY_POINTS, DAILY_REPORT_CAP, DAILY_REVIEW_CAP, STATUS_LABEL } from '../types'
import { canReview, canSubmit, reportsToday, reviewsToday, todayStr } from '../rules'
import { showToast } from '../toast'

export function ReportPage({ state, studentId }: { state: AppState; studentId: string }) {
  const today = todayStr(state)
  const [cat, setCat] = useState<ReportCategory>('quality')
  const [text, setText] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const mine = state.reports.filter((r) => r.authorId === studentId)
  const myClass = state.users.find((u) => u.id === studentId)?.classId
  const pool = state.reports.filter((r) => {
    const author = state.users.find((u) => u.id === r.authorId)
    return (
      r.authorId !== studentId &&
      (r.status === 'in_review' || r.status === 'queued') &&
      (!myClass || author?.classId === myClass) &&
      !state.reviews.some((v) => v.reportId === r.id && v.reviewerId === studentId)
    )
  })
  const used = reportsToday(state, studentId, today)

  return (
    <div className="grid2">
      <div className="card">
        <h2>申报</h2>
        <p className="muted">
          今日 {used}/{DAILY_REPORT_CAP}（仅计本账号） · 考试名次不加分
        </p>
        <div className="row wrap">
          {(Object.keys(CATEGORY_LABEL) as ReportCategory[]).map((k) => (
            <button key={k} className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>
              {CATEGORY_LABEL[k]} +{CATEGORY_POINTS[k]}
            </button>
          ))}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="文字证据（必填）" rows={4} />
        {msg && <p className={ok ? 'ok' : 'err'}>{msg}</p>}
        <button
          className="primary"
          disabled={!canSubmit(state, studentId, today)}
          onClick={() => {
            const e = submitReport(studentId, cat, text)
            if (e) {
              setOk(false)
              setMsg(e)
              showToast(e)
              return
            }
            setOk(true)
            setMsg('已提交，进入互评')
            showToast('已提交，进入互评')
            setText('')
          }}
        >
          提交
        </button>
        <h3>我的申报</h3>
        <ul>
          {mine.map((r) => (
            <li key={r.id}>
              {r.date} {CATEGORY_LABEL[r.category]} · {STATUS_LABEL[r.status] ?? r.status}
              <div className="muted">{r.evidence}</div>
            </li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h2>匿名互评</h2>
        <p className="muted">
          今日 {reviewsToday(state, studentId, today)}/{DAILY_REVIEW_CAP} · 不见评者
        </p>
        {pool.length === 0 && <p>暂无待评</p>}
        {pool.map((r) => (
          <div key={r.id} className="item">
            <div className="muted">同学申报 · {CATEGORY_LABEL[r.category]}</div>
            <p>{r.evidence}</p>
            <div className="row">
              <button
                disabled={!canReview(state, studentId, today)}
                onClick={() => {
                  const e = peerReview(studentId, r.id, 'fact')
                  setOk(!e)
                  setMsg(e ?? '记为属实')
                }}
              >
                属实
              </button>
              <button
                disabled={!canReview(state, studentId, today)}
                onClick={() => {
                  const e = peerReview(studentId, r.id, 'doubt')
                  setOk(!e)
                  setMsg(e ?? '存疑')
                }}
              >
                存疑
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
