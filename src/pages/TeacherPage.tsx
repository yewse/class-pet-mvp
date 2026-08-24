import { useEffect, useState } from 'react'
import {
  changePassword,
  classMoodMix,
  confirmKrTick,
  pendingTicksOf,
  stalePendingTicks,
  teacherAudit,
  toggleClassHour,
  undoTeacherAudit,
} from '../store'
import type { AppState, Report } from '../types'
import { CATEGORY_LABEL, STATUS_LABEL } from '../types'
import { auditQueue, moodCareList } from '../rules'
import { showToast } from '../toast'
import { classIdOf } from '../engine'

export function TeacherPage({ state, meId }: { state: AppState; meId: string }) {
  const cid = classIdOf(state)
  const q = auditQueue(state, undefined)
  const locked = !!state.inClassHour?.[cid]
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [openReject, setOpenReject] = useState<string | null>(null)
  const [rows, setRows] = useState<Report[]>(() => q)
  const [faded, setFaded] = useState<Set<string>>(new Set())
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const pending = pendingTicksOf(state)
  const stale = stalePendingTicks(state)
  const careList = moodCareList(state, cid)
  const mix = classMoodMix(state)

  useEffect(() => {
    setRows((prev) => {
      const seen = new Set(prev.map((r) => r.id))
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
    void teacherAudit(id, 'approve').then((e) => showToast(e ?? '已通过入账', e ? 'err' : 'ok'))
  }

  function reject(id: string) {
    const note = (reasons[id] ?? '').trim()
    if (!note) {
      setOpenReject(id)
      showToast('驳回必须填写理由', 'err')
      return
    }
    void teacherAudit(id, 'reject', note).then((e) => {
      showToast(e ?? '已驳回', 'err')
      if (!e) {
        setOpenReject(null)
        setReasons((r) => ({ ...r, [id]: '' }))
      }
    })
  }

  function confirmTick(tickId: string) {
    void confirmKrTick(tickId, meId).then((e) => showToast(e ?? '已确认', e ? 'err' : 'ok'))
  }

  const visible = rows.filter((r) => !faded.has(r.id))
  const nameOf = (id: string) => state.users.find((u) => u.id === id)?.name ?? (id === 'system' ? '系统' : id)

  return (
    <div>
      {(pending.length > 0 || stale.length > 0) && (
        <div className="card">
          <h2>待确认打钩</h2>
          <p className="meta-copy">学生的努力勾选，同学没来得及确认的，老师一键补上；上周遗留也在这里，不会蒸发。</p>
          {pending.map((k) => (
            <div key={k.id} className="item">
              {nameOf(k.studentId)} · {k.note} · {k.date}
              <button type="button" className="primary" onClick={() => confirmTick(k.id)}>
                确认
              </button>
            </div>
          ))}
          {stale.map((k) => (
            <div key={k.id} className="item">
              <span className="muted">上周 · </span>
              {nameOf(k.studentId)} · {k.note} · {k.date}
              <button type="button" className="primary" onClick={() => confirmTick(k.id)}>
                补确认
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>抽查 · {state.className}队列</h2>
        <p className="meta-copy">
          仅本班，{q.length} 条待处理（每班 5–8）。存疑优先，其余按日随机抽样——晚提交也会被抽到。
        </p>
        <label className="class-hour-toggle">
          <input type="checkbox" checked={locked} onChange={() => void toggleClassHour(cid)} />
          <span>上课中（暂停本班轻点/喂食/互访）</span>
        </label>
        <div className="row">
          <button
            type="button"
            className="undo-audit"
            onClick={() => {
              void undoTeacherAudit().then((e) => {
                showToast(e ?? '已撤销上次核验', e ? 'err' : 'ok')
                if (!e) setFaded(new Set())
              })
            }}
          >
            撤销上次操作
          </button>
        </div>
        {visible.map((r) => {
          const done = r.status === 'posted' || r.status === 'rejected' || r.status === 'auto_posted'
          return (
            <div key={r.id} className={`item audit-row ${done ? 'audit-done' : ''}`}>
              <div>
                {nameOf(r.authorId)} · {CATEGORY_LABEL[r.category]} · {STATUS_LABEL[r.status] ?? r.status}
                {r.retestOf ? ' · 错题重测' : ''}
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
      </div>

      <div className="card">
        <h3>今日心情与关怀（仅教师可见）</h3>
        <p className="meta-copy">
          晴 {mix.sun} · 云 {mix.overcast} · 雨 {mix.rain}。心情不影响宠物、不上公屏，只用来提醒你课后聊聊。
        </p>
        {careList.length === 0 && <p className="muted">今天没有报「雨」的同学。</p>}
        {careList.map(({ student, streak }) => (
          <div key={student.id} className="item">
            {student.name}
            {streak >= 2 ? `（连续 ${streak} 天雨，建议今天课后单独聊聊）` : '（今日报雨）'}
          </div>
        ))}
      </div>

      <div className="card">
        <h3>修改我的登录密码</h3>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            void changePassword(oldPw, newPw).then((err) => {
              showToast(err ?? '密码已修改', err ? 'err' : 'ok')
              if (!err) {
                setOldPw('')
                setNewPw('')
              }
            })
          }}
        >
          <input
            type="password"
            value={oldPw}
            onChange={(e) => setOldPw(e.target.value)}
            placeholder="原密码"
            aria-label="原密码"
            style={{ maxWidth: 200 }}
          />
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="新密码（至少 8 位，含字母数字）"
            aria-label="新密码"
            style={{ maxWidth: 260 }}
          />
          <button type="submit" className="primary" disabled={!oldPw || !newPw}>
            修改
          </button>
        </form>
      </div>
    </div>
  )
}
