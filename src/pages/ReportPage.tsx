import { useState } from 'react'
import { peerReview, submitReport } from '../store'
import type { AppState, ReportCategory } from '../types'
import { CATEGORY_LABEL, STATUS_LABEL, rulesOf } from '../types'
import { canReview, canSubmit, reportsToday, retestsDue, reviewsToday, todayStr } from '../rules'
import { showToast } from '../toast'

export function ReportPage({ state, studentId }: { state: AppState; studentId: string }) {
  const today = todayStr(state)
  const cfg = rulesOf(state)
  const [cat, setCat] = useState<ReportCategory>('quality')
  const [text, setText] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [retestOf, setRetestOf] = useState<string | null>(null)
  const mine = state.reports.filter((r) => r.authorId === studentId)
  const dueRetests = retestsDue(state, studentId)
  /* 互评池由服务端下发（已剥离申报者身份），不再从全量数据推导 */
  const pool = state.reviewPool ?? []
  const used = reportsToday(state, studentId, today)
  const retestTarget = retestOf ? state.reports.find((r) => r.id === retestOf) : null

  function startRetest(reportId: string) {
    setCat('quiz_self')
    setRetestOf(reportId)
    setText('错题重测：')
    setMsg(null)
    showToast('已进入错题重测：写下这次测的结果')
  }

  return (
    <div className="grid2">
      <div className="card">
        <h2>申报</h2>
        <p className="meta-copy">
          今日 {used}/{cfg.dailyReportCap}（仅计本账号） · 考试名次不加分
        </p>
        {dueRetests.length > 0 && (
          <div className="retest-box">
            <p className="pad-block-label">错题重测（3 天前订正的，现在还会吗？）</p>
            {dueRetests.map((r) => (
              <div key={r.id} className="item">
                <span className="muted">{r.date} · </span>
                {r.evidence}
                <button type="button" className="primary" onClick={() => startRetest(r.id)}>
                  重测这题
                </button>
              </div>
            ))}
            <p className="muted">隔几天再测一遍，测完还会才算真的会——这是最能带动成绩的一步。</p>
          </div>
        )}
        <div className="row wrap">
          {(Object.keys(CATEGORY_LABEL) as ReportCategory[]).map((k) => (
            <button key={k} className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>
              {CATEGORY_LABEL[k]} +{cfg.categoryPoints[k]}
            </button>
          ))}
        </div>
        {retestTarget && (
          <p className="ok">
            重测关联：{retestTarget.date} 的订正「{retestTarget.evidence.slice(0, 12)}…」
            <button type="button" className="secondary" onClick={() => { setRetestOf(null); setText('') }}>
              取消关联
            </button>
          </p>
        )}
        <textarea
          className={msg && !ok ? 'field-err' : ''}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (msg && !ok) setMsg(null)
          }}
          placeholder={`至少 ${cfg.evidenceMinLen} 个字：具体做了什么、结果如何`}
          rows={4}
          aria-invalid={!!(msg && !ok)}
        />
        {msg && <p className={ok ? 'ok' : 'field-err-msg'}>{msg}</p>}
        <button
          className="primary"
          disabled={!canSubmit(state, studentId, today)}
          onClick={() => {
            void submitReport(studentId, cat, text, retestOf ?? undefined).then((e) => {
              if (e) {
                setOk(false)
                setMsg(e)
                showToast(e, 'err')
                return
              }
              setOk(true)
              setMsg('已提交，进入互评')
              showToast('已提交，进入互评')
              setText('')
              setRetestOf(null)
            })
          }}
        >
          提交
        </button>
        <h3>我的申报</h3>
        <ul>
          {mine.map((r) => (
            <li key={r.id}>
              {r.date} {CATEGORY_LABEL[r.category]}
              {r.retestOf ? '（错题重测）' : ''} · {STATUS_LABEL[r.status] ?? r.status}
              <div className="muted">{r.evidence}</div>
              {r.status === 'rejected' && r.rejectNote && <div className="err">驳回理由：{r.rejectNote}</div>}
            </li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h2>匿名互评</h2>
        <p className="meta-copy">
          今日 {reviewsToday(state, studentId, today)}/{cfg.dailyReviewCap} · 你看不到是谁申报的，对方也看不到是谁评的
        </p>
        {pool.length === 0 && <p>暂无待评</p>}
        {pool.map((r) => (
          <div key={r.id} className="item">
            <div className="muted">同学申报 · {CATEGORY_LABEL[r.category]}</div>
            <p>{r.evidence}</p>
            <div className="row">
              <button
                disabled={!canReview(state, studentId, today)}
                onClick={() =>
                  void peerReview(studentId, r.id, 'fact').then((e) => {
                    setOk(!e)
                    setMsg(e ?? '记为属实')
                  })
                }
              >
                属实
              </button>
              <button
                disabled={!canReview(state, studentId, today)}
                onClick={() =>
                  void peerReview(studentId, r.id, 'doubt').then((e) => {
                    setOk(!e)
                    setMsg(e ?? '存疑')
                  })
                }
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
