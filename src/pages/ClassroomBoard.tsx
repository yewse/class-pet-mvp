import { useEffect, useState } from 'react'
import { PetSvg } from '../components/PetSvg'
import { adjustClassScore, CLASS_REASONS, classLayoutOf, occupantAt, praiseWholeClass } from '../store'
import type { AppState, User } from '../types'

type Fx = { id: number; studentId: string; kind: 'up' | 'down' | 'all'; n: number }

const HINT_KEY = 'class-pet-board-hint-v1'

export function ClassroomBoard({ state }: { state: AppState }) {
  const cid = 'c1'
  const layout = classLayoutOf(state)
  const roster = state.users.filter((u) => u.role === 'student' && u.classId === cid)
  const [picked, setPicked] = useState<User | null>(null)
  const [reason, setReason] = useState<(typeof CLASS_REASONS)[number]>('发言')
  const [fx, setFx] = useState<Fx[]>([])
  const [shimmer, setShimmer] = useState(false)
  const [showHint, setShowHint] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) !== '1'
    } catch {
      return true
    }
  })

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
            初二（3）班 · {layout.cols} 列 × {layout.rows} 排
          </p>
        </div>
        <button className="board-praise" type="button" onClick={praise}>
          全班表扬 +1
        </button>
      </div>

      {showHint && (
        <div className="board-hint">
          <span>点座位即可加减分</span>
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
          const live = state.classScores?.[s.id] ?? 0
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
                    expression={last && last.n > 0 ? 'cheer' : pet.expression}
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
              <div className="board-live">
                课堂分 <strong>{live}</strong>
              </div>
            </button>
          )
        })}
      </div>

      {picked && (
        <div className="pad-mask" onClick={() => setPicked(null)}>
          <div className="score-pad" onClick={(e) => e.stopPropagation()}>
            <h2>给 {picked.name} 记分</h2>
            <p className="muted">当前课堂分 {state.classScores?.[picked.id] ?? 0}</p>
            <div className="row">
              {CLASS_REASONS.map((r) => (
                <button key={r} type="button" className={reason === r ? 'on' : ''} onClick={() => setReason(r)}>
                  {r}
                </button>
              ))}
            </div>
            <div className="row pad-ops">
              <button type="button" className="primary" onClick={() => apply(picked.id, 1)}>
                +1
              </button>
              <button type="button" className="primary" onClick={() => apply(picked.id, 2)}>
                +2
              </button>
              <button type="button" className="pad-minus" onClick={() => apply(picked.id, -1)}>
                −1
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
