import { useEffect, useState } from 'react'
import { PetSvg } from '../components/PetSvg'
import {
  adjustClassScore,
  CLASS_REASONS,
  classLayoutOf,
  classMoodMix,
  classOkrOf,
  classOkrProgress,
  displayExpr,
  endClassSession,
  majorityRain,
  occupantAt,
  pendingTicksOf,
  personalOkrOf,
  praiseWholeClass,
  sessionDeltaOf,
  startClassSession,
  tapClassKr,
} from '../store'
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
  const [reason, setReason] = useState<(typeof CLASS_REASONS)[number]>('推进个人目标')
  const [fx, setFx] = useState<Fx[]>([])
  const [shimmer, setShimmer] = useState(false)
  const [showHint, setShowHint] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) !== '1'
    } catch {
      return true
    }
  })

  const classOkr = classOkrOf(state)
  const classPct = classOkrProgress(state)
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

  function apply(studentId: string, delta: number) {
    const err = adjustClassScore(studentId, delta, reason)
    if (err) {
      window.alert(err)
      return
    }
    burst(studentId, delta, delta > 0 ? 'up' : 'down')
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
        <div className="class-okr-bar" onClick={() => tapClassKr(1)}>
          <div className="class-okr-fill" style={{ width: `${classPct}%` }} />
          <span>
            {classPct} / 100（{classOkr.doneCount}/{roster.length}）
          </span>
        </div>
        <p className="muted">点进度条或记「帮助班级目标」推进；进度 = 勾选人数 ÷ 全班人数。</p>
      </div>

      {showHint && (
        <div className="board-hint">
          <span>点座位记录目标进展，对照自己打钩，不比课堂总分</span>
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
                    expression={last && last.n > 0 ? 'cheer' : displayExpr(state, pet)}
                    skinId={pet.skinId}
                    mountId={pet.mountId}
                    paletteId={pet.paletteId}
                    marking={pet.marking}
                    headwearId={pet.headwearId}
                    clothesId={pet.clothesId}
                    shoesId={pet.shoesId}
                  />
                ) : (
                  <div className="muted">尚未领养</div>
                )}
              </div>
              {pet && <div className="board-petname">{pet.name || pet.nickname}</div>}
              <div className="board-okr">{okr.objective || '未设目标'}</div>
              <KrDots done={okr.krDone} target={okr.krTarget} />
              {wait > 0 && <div className="pending-tag">待确认</div>}
            </button>
          )
        })}
      </div>

      {picked && (
        <div className="pad-mask" onClick={() => setPicked(null)}>
          <div className="score-pad" onClick={(e) => e.stopPropagation()}>
            <h2>核验 · {picked.name}</h2>
            <p className="muted">
              {personalOkrOf(state, picked.id).objective || '未设个人目标'} · 本课核验次数{' '}
              {sessionDeltaOf(picked.id)}（上限 6 / 3）
            </p>
            {pendingTicksOf(state, picked.id).map((k) => (
              <p key={k.id} className="pending-tag">待确认 · {k.note}</p>
            ))}
            <KrDots
              done={personalOkrOf(state, picked.id).krDone}
              target={personalOkrOf(state, picked.id).krTarget}
            />
            <div className="row">
              {CLASS_REASONS.map((r) => (
                <button key={r} type="button" className={reason === r ? 'on' : ''} onClick={() => setReason(r)}>
                  {r === '推进个人目标' ? '确认' : r === '帮助班级目标' ? '推进' : r}
                </button>
              ))}
            </div>
            <div className="row pad-ops">
              {reason === '走神提醒' ? (
                <button type="button" className="pad-minus" onClick={() => apply(picked.id, -1)}>
                  提醒
                </button>
              ) : reason === '推进个人目标' ? (
                <button type="button" className="primary" onClick={() => apply(picked.id, 1)}>
                  确认
                </button>
              ) : (
                <button type="button" className="primary" onClick={() => apply(picked.id, 1)}>
                  推进
                </button>
              )}
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
