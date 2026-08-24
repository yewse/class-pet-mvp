import { useEffect, useState } from 'react'
import { PetSvg } from '../components/PetSvg'
import {
  classLayoutOf,
  classMoodMix,
  classOkrOf,
  classOkrProgress,
  classPerkOf,
  confirmBreakthrough,
  displayExpr,
  endClassSession,
  excludeStudentBase,
  grantClassPerk,
  majorityRain,
  markClassBaseDone,
  occupantAt,
  pendingTicksOf,
  personalOkrOf,
  praiseWholeClass,
  startClassSession,
  todayBaseOf,
} from '../store'
import { showToast } from '../toast'
import { DEFAULT_CLASS_PERK } from '../types'
import type { AppState, User } from '../types'

type Fx = { id: number; studentId: string; kind: 'up' | 'down' | 'all'; n: number }

const HINT_KEY = 'class-pet-board-hint-v2'

function KrDots({ done, target }: { done: number; target: number }) {
  return (
    <div className="kr-dots" aria-label={`个人进度 ${done}/${target}`}>
      {Array.from({ length: target }, (_, i) => (
        <span key={i} className={i < done ? 'on' : ''} />
      ))}
    </div>
  )
}

export function ClassroomBoard({ state }: { state: AppState }) {
  const cid = 'c1'
  const layout = classLayoutOf(state)
  const roster = state.users.filter((u) => u.role === 'student' && u.classId === cid)
  const [picked, setPicked] = useState<User | null>(null)
  const [fx, setFx] = useState<Fx[]>([])
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

  const classOkr = classOkrOf(state)
  const classPct = classOkrProgress(state)
  const perk = classPerkOf(state)
  const inSession = !!state.classSession?.active
  const mix = classMoodMix(state)
  const tiredClass = majorityRain(state)

  useEffect(() => {
    if (!fx.length) return
    const t = window.setTimeout(() => setFx((xs) => xs.slice(1)), 900)
    return () => window.clearTimeout(t)
  }, [fx])

  function burst(studentId: string, n: number, kind: Fx['kind']) {
    setFx((xs) => [...xs, { id: Date.now() + Math.random(), studentId, kind, n }])
  }

  function markAllBase() {
    const err = markClassBaseDone()
    if (err && !err.startsWith('已记')) {
      window.alert(err)
      return
    }
    setShimmer(true)
    window.setTimeout(() => setShimmer(false), 900)
    for (const s of roster) {
      if (todayBaseOf(state, s.id)?.status !== 'excluded') burst(s.id, 1, 'up')
    }
  }

  function markMiss(studentId: string) {
    const err = excludeStudentBase(studentId)
    if (err) {
      window.alert(err)
      return
    }
    burst(studentId, -1, 'down')
    setPicked(null)
  }

  function markBreak(studentId: string) {
    const err = confirmBreakthrough(studentId, breakNote)
    if (err) {
      window.alert(err)
      return
    }
    burst(studentId, 1, 'up')
    setBreakNote('')
    setPicked(null)
  }

  function praise() {
    const err = praiseWholeClass('全班表扬')
    if (err) {
      window.alert(err)
      return
    }
    setShimmer(true)
    window.setTimeout(() => setShimmer(false), 1200)
    for (const s of roster) burst(s.id, 1, 'all')
  }

  function dismissHint() {
    setShowHint(false)
    try {
      localStorage.setItem(HINT_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  return (
    <div className={`board ${shimmer ? 'board-shimmer' : ''}`}>
      <div className="board-bar">
        <div>
          <h1>课堂大屏</h1>
          <p>
            初二（3）班 · {layout.cols} 列 × {layout.rows} 排 · {inSession ? '上课中' : '未上课'}
          </p>
        </div>
        <div className="board-bar-ops">
          {inSession ? (
            <button type="button" onClick={() => endClassSession()}>
              下课
            </button>
          ) : (
            <button type="button" className="primary" onClick={() => startClassSession()}>
              上课
            </button>
          )}
          <button type="button" className="primary" onClick={markAllBase}>
            全班基础达标
          </button>
          <button
            className="board-praise"
            type="button"
            onClick={praise}
            disabled={!state.classSession?.classKrMoved}
            title={state.classSession?.classKrMoved ? '全班表扬' : '本课班级目标推进后才可表扬'}
          >
            全班表扬
          </button>
        </div>
      </div>

      <div className="mood-mix">
        <span>班级心情</span>
        <span>晴 {mix.sun}</span>
        <span>云 {mix.overcast}</span>
        <span>雨 {mix.rain}</span>
      </div>
      {tiredClass && <p className="mood-banner">班级有点累，先看看大家</p>}

      <div className="class-okr-banner">
        <div className="class-okr-title">
          本周班级目标 · {classOkr.objective}
        </div>
        <div className="class-okr-bar">
          <div className="class-okr-fill" style={{ width: `${classPct}%` }} />
          <span>
            {classPct} / 100（{classOkr.doneCount}/{roster.length}）
          </span>
        </div>
        <p className="muted">进度 = 本周每日基础达标人次 ÷（人数 × 工作日）。个人贡献只计确认过的努力勾选，不计考试分。</p>
        {classPct >= 80 && !perk && (
          <form
            className="row perk-row"
            onSubmit={(e) => {
              e.preventDefault()
              const err = grantClassPerk(perkDraft)
              if (err) window.alert(err)
            }}
          >
            <label>
              集体奖励
              <input value={perkDraft} onChange={(e) => setPerkDraft(e.target.value)} maxLength={24} />
            </label>
            <button type="submit" className="primary">发放本周集体奖励</button>
          </form>
        )}
        {perk && <p className="ok">本周集体奖励：{perk.text}（不自动删作业）</p>}
      </div>

      {showHint && (
        <div className="board-hint">
          <span>先点「全班基础达标」，再只点未完成或特别突破。不比考试分。</span>
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
          const okr = personalOkrOf(state, s.id)
          const wait = pendingTicksOf(state, s.id).length
          const cardFx = fx.filter((f) => f.studentId === s.id)
          const last = cardFx[cardFx.length - 1]
          return (
            <button
              type="button"
              key={s.id}
              className={`board-card desk ${last?.kind === 'up' || last?.kind === 'all' ? 'fx-up' : ''} ${last?.kind === 'down' ? 'fx-down' : ''}`}
              onClick={() => setPicked(s)}
            >
              <div className="board-name">{s.name}</div>
              <div className="board-pet-slot">
                {last && (
                  <span className={`float-n ${last.n >= 0 ? 'pos' : 'neg'}`}>
                    {last.n > 0 ? '+' : ''}
                    {last.n}
                  </span>
                )}
                {(last?.kind === 'up' || last?.kind === 'all') && <span className="gold-burst" aria-hidden />}
                {pet ? (
                  <PetSvg
                    species={pet.species}
                    face={pet.face}
                    expression={displayExpr(state, pet) === 'dormant' ? 'dormant' : 'idle'}
                    growth={pet.growth}
                    paletteId={pet.paletteId}
                    marking={pet.marking}
                  />
                ) : (
                  <div className="muted">尚未领养</div>
                )}
              </div>
              {pet && <div className="board-petname">{pet.name || pet.nickname}</div>}
              <div className="board-okr">{okr.objective || '未设目标'}</div>
              <KrDots done={okr.krDone} target={okr.krTarget} />
              {wait > 0 && <div className="pending-tag">待确认</div>}
              {todayBaseOf(state, s.id)?.status === 'done' && <div className="ok">今日基础</div>}
              {todayBaseOf(state, s.id)?.status === 'excluded' && <div className="err">未完成</div>}
            </button>
          )
        })}
      </div>

      {picked && (
        <div className="pad-mask" onClick={() => setPicked(null)}>
          <div className="score-pad" onClick={(e) => e.stopPropagation()}>
            <h2>例外 · {picked.name}</h2>
            <p className="muted">
              {personalOkrOf(state, picked.id).objective || '未设个人目标'} · 个人勾选{' '}
              {personalOkrOf(state, picked.id).krDone}/{personalOkrOf(state, picked.id).krTarget}
              （努力勾选，不是考试分）
            </p>
            {pendingTicksOf(state, picked.id).map((k) => (
              <p key={k.id} className="pending-tag">待确认 · {k.note}</p>
            ))}
            <KrDots
              done={personalOkrOf(state, picked.id).krDone}
              target={personalOkrOf(state, picked.id).krTarget}
            />
            <p className="muted">
              今日基础：{todayBaseOf(state, picked.id)?.status === 'done' ? '已达标' : todayBaseOf(state, picked.id)?.status === 'excluded' ? '未完成' : '未记'}
            </p>
            <label>
              特别突破备注
              <input
                value={breakNote}
                onChange={(e) => setBreakNote(e.target.value)}
                maxLength={24}
                placeholder="有证据可留空，否则写一句"
              />
            </label>
            <div className="row pad-ops">
              <button type="button" className="pad-minus" onClick={() => markMiss(picked.id)}>
                未完成
              </button>
              <button type="button" className="primary" onClick={() => markBreak(picked.id)}>
                特别突破
              </button>
              <button
                type="button"
                onClick={() => {
                  showToast(`已私下提醒 ${picked.name} 注意听讲`)
                  setPicked(null)
                }}
              >
                走神提醒
              </button>
            </div>
            <button type="button" onClick={() => setPicked(null)}>
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
