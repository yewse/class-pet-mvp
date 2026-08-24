import { useEffect, useState } from 'react'
import { PetSvg } from '../components/PetSvg'
import {
  classLayoutOf,
  classOkrOf,
  classOkrProgress,
  classPerkOf,
  clearTodayMark,
  confirmBreakthrough,
  endClassSession,
  grantClassPerk,
  markClassBaseDone,
  markExempt,
  markMissed,
  occupantAt,
  pendingTicksOf,
  praiseWholeClass,
  stalePendingTicks,
  startClassSession,
  todayBaseOf,
  undoSeatAction,
} from '../store'
import { auditQueue, isPostedReport, schoolDaysOfWeekId, weekIdOf } from '../rules'
import { showToast } from '../toast'
import { DEFAULT_CLASS_PERK, rulesOf } from '../types'
import type { AppState, Role, User } from '../types'
import { isHomeroomRole, isStaffRole } from '../types'

const HINT_KEY = 'class-pet-board-hint-v3'


const BASE_STATUS_LABEL: Record<string, string> = {
  done: '今日已达标',
  missed: '今日未完成（仅教师可见）',
  exempt: '今日豁免（不计分母）',
}

export function ClassroomBoard({ state, meRole }: { state: AppState; meRole: Role }) {
  const layout = classLayoutOf(state)
  const roster = state.users.filter((u) => u.role === 'student')
  const [picked, setPicked] = useState<User | null>(null)
  const [shimmer, setShimmer] = useState(false)
  const [breakNote, setBreakNote] = useState('')
  const [perkDraft, setPerkDraft] = useState(DEFAULT_CLASS_PERK)
  const [showHint, setShowHint] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) !== '1'
    } catch {
      return true
    }
  })

  const homeroom = isHomeroomRole(meRole)
  const staff = isStaffRole(meRole)
  const pendingVerify = pendingTicksOf(state).length + stalePendingTicks(state).length
  const pendingAudit = auditQueue(state, undefined).length
  const classOkr = classOkrOf(state)
  const classPct = classOkrProgress(state)
  const perk = classPerkOf(state)
  const inSession = !!state.classSession?.active
  const perkThreshold = rulesOf(state).perkThresholdPct

  const week = weekIdOf(state)
  const weekDays = new Set(schoolDaysOfWeekId(week))
  const weekReports = state.reports.filter((r) => weekDays.has(r.date) && isPostedReport(r.status))
  const aggCorrection = weekReports.filter((r) => r.category === 'correction').length
  const aggQuiz = weekReports.filter((r) => r.category === 'quiz_self').length
  const aggConfirms = (state.krTicks ?? []).filter((k) => k.weekId === week && k.status === 'confirmed').length

  useEffect(() => {
    if (!picked) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPicked(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picked])

  async function markAllBase() {
    const err = await markClassBaseDone()
    if (err && !err.startsWith('已记')) {
      showToast(err, 'err')
      return
    }
    showToast(err ?? '已记全班基础达标', 'ok')
    setShimmer(true)
    window.setTimeout(() => setShimmer(false), 900)
  }

  /** 例外只进教师账本：公屏不打负标、不飘红字。 */
  async function markMiss(studentId: string) {
    const err = await markMissed(studentId)
    if (err) {
      showToast(err, 'err')
      return
    }
    showToast('已记未完成（仅教师端与周报可见）', 'ok')
    setPicked(null)
  }

  async function markEx(studentId: string) {
    const err = await markExempt(studentId)
    if (err) {
      showToast(err, 'err')
      return
    }
    showToast('已记今日豁免，不计入班级分母', 'ok')
    setPicked(null)
  }

  async function clearMark(studentId: string) {
    const err = await clearTodayMark(studentId)
    showToast(err ?? '已恢复为未记录', err ? 'err' : 'ok')
    if (!err) setPicked(null)
  }

  async function markBreak(studentId: string) {
    const err = await confirmBreakthrough(studentId, breakNote)
    if (err) {
      showToast(err, 'err')
      return
    }
    setBreakNote('')
    setPicked(null)
  }

  async function praise() {
    const err = await praiseWholeClass()
    if (err) {
      showToast(err, 'err')
      return
    }
    setShimmer(true)
    window.setTimeout(() => setShimmer(false), 1200)
  }

  function dismissHint() {
    setShowHint(false)
    try {
      localStorage.setItem(HINT_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  const pickedStatus = picked ? todayBaseOf(state, picked.id)?.status : undefined

  return (
    <div className={`board ${shimmer ? 'board-shimmer' : ''}`}>
      <div className="board-bar">
        <div>
          <h1>课堂大屏</h1>
          <p>
            {state.className} · {layout.cols} 列 × {layout.rows} 排 · {inSession ? '上课中' : '未上课'}
          </p>
        </div>
        <div className="board-bar-ops">
          {inSession ? (
            <button type="button" onClick={() => void endClassSession().then((e) => e && showToast(e, 'err'))}>
              下课
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={() => void startClassSession().then((e) => e && showToast(e, 'err'))}
            >
              上课
            </button>
          )}
          {homeroom && (
            <button type="button" className="primary" onClick={() => void markAllBase()}>
              全班基础达标
            </button>
          )}
          <button
            className="board-praise"
            type="button"
            onClick={() => void praise()}
            disabled={!state.classSession?.classKrMoved}
            title={state.classSession?.classKrMoved ? '全班表扬' : '本课班级目标推进后才可表扬'}
          >
            全班表扬
          </button>
        </div>
      </div>

      {staff && (
        <div className="today-ops-banner" aria-label="今日待办">
          <span className="today-ops-label">今日</span>
          <span>待核验 <strong>{pendingVerify}</strong></span>
          <span>待抽查 <strong>{pendingAudit}</strong></span>
        </div>
      )}

      <div className="class-okr-banner">
        <div className="class-okr-title">
          本周班级目标 · {classOkr.objective}
        </div>
        <div className="class-okr-bar">
          <div className="class-okr-fill" style={{ width: `${classPct}%` }} />
          <span>
            {Math.min(100, classPct)} / 100
          </span>
        </div>
        <p className="goal-formula">按周一到周五全周计算：达标人次 ÷ 应到人次（豁免不计）。周五前到 {perkThreshold}% 即可发集体奖励。</p>
        {homeroom && classPct >= perkThreshold && !perk && (
          <form
            className="row perk-row"
            onSubmit={(e) => {
              e.preventDefault()
              void grantClassPerk(perkDraft).then((err) => err && showToast(err, 'err'))
            }}
          >
            <label>
              集体奖励
              <input value={perkDraft} onChange={(e) => setPerkDraft(e.target.value)} maxLength={24} />
            </label>
            <button type="submit" className="primary">发放本周集体奖励</button>
          </form>
        )}
        {perk && <p className="ok">本周集体奖励：{perk.text}（老师兑现，不自动删作业）</p>}
      </div>

      <div className="board-aggregates" aria-label="本周班级学习聚合">
        <span>本周全班</span>
        <span>订正 <strong>{aggCorrection}</strong></span>
        <span>自测 <strong>{aggQuiz}</strong></span>
        <span>互助确认 <strong>{aggConfirms}</strong></span>
      </div>

      {showHint && (
        <div className="board-hint">
          <span>先点「全班基础达标」，例外（未完成/豁免）只记在教师端，公屏只放好消息。</span>
          <button type="button" onClick={dismissHint}>
            知道了
          </button>
        </div>
      )}

      <div className="stage">讲台</div>

      <div
        className="board-grid seat-chart"
        style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: layout.rows * layout.cols }, (_, i) => {
          const row = Math.floor(i / layout.cols) + 1
          const col = (i % layout.cols) + 1
          const s = occupantAt(state.users, row, col)
          if (!s) {
            return <div key={`${row}-${col}`} className="board-card desk empty-desk" aria-hidden />
          }
          const pet = state.pets.find((p) => p.ownerId === s.id)
          return (
            <button
              type="button"
              key={s.id}
              className="board-card desk"
              onClick={() => staff && setPicked(s)}
            >
              <div className="board-name">{s.name}</div>
              <div className="board-pet-slot">
                {pet ? (
                  <PetSvg
                    species={pet.species}
                    face={pet.face}
                    expression="idle"
                    growth={pet.growth}
                    paletteId={pet.paletteId}
                    marking={pet.marking}
                  />
                ) : (
                  <div className="muted">尚未领养</div>
                )}
              </div>
              {pet && <div className="board-petname">{pet.name || pet.nickname}</div>}
            </button>
          )
        })}
      </div>

      {picked && staff && (
        <div className="pad-mask" onClick={() => setPicked(null)}>
          <div className="score-pad pad-slim" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={picked.name}>
            <button type="button" className="pad-close" aria-label="关闭" onClick={() => setPicked(null)}>
              ✕
            </button>
            <h2>{picked.name}</h2>
            <p className="pad-status">
              {pickedStatus ? BASE_STATUS_LABEL[pickedStatus] : '今日未记录'}
            </p>
            <div className="pad-split">
              <div className="pad-miss-block">
                <p className="pad-block-label">例外 · 仅教师可见，不上公屏</p>
                <div className="pad-stack">
                  <button type="button" className="danger pad-medium" onClick={() => void markMiss(picked.id)}>
                    记未完成
                  </button>
                  <button type="button" className="secondary pad-medium" onClick={() => void markEx(picked.id)}>
                    今日豁免
                  </button>
                  {pickedStatus && (
                    <button type="button" className="pad-medium" onClick={() => void clearMark(picked.id)}>
                      恢复未记录
                    </button>
                  )}
                </div>
              </div>
              <div className="pad-break-block">
                <p className="pad-block-label">特别突破</p>
                <input
                  className="pad-note"
                  value={breakNote}
                  onChange={(e) => setBreakNote(e.target.value)}
                  maxLength={24}
                  placeholder="写一句备注（有证据可留空）"
                  aria-label="特别突破备注"
                />
                <button type="button" className="primary pad-huge" onClick={() => void markBreak(picked.id)}>
                  记特别突破
                </button>
              </div>
            </div>
            <button
              type="button"
              className="undo-seat"
              onClick={() =>
                void undoSeatAction().then((e) => showToast(e ?? '已撤销上一步操作', e ? 'err' : 'ok'))
              }
            >
              撤销上一步
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
