import { useState } from 'react'
import { AdoptCeremony } from '../components/AdoptCeremony'
import { PetSvg } from '../components/PetSvg'
import {
  balance,
  confirmKrTick,
  feedPet,
  moodOf,
  pendingTicksOf,
  personalOkrOf,
  petDisplayName,
  petPet,
  setDailyMood,
  setStudentObjective,
  submitKrTick,
  tapPet,
} from '../store'
import { DAILY_EARN_CAP, DAILY_SPEND_CAP, ITEM_LABEL, MOOD_LABEL, displayLedgerReason } from '../types'
import type { MoodId } from '../types'
import { ACHIEVEMENTS, dayEarn, daySpendAbs, isClassHourLocked, todayStr } from '../rules'
import { showToast } from '../toast'
import type { AppState as S } from '../types'

const CLASS_CARE = '上课中，课后再照料'
const MOODS: MoodId[] = ['sun', 'overcast', 'rain']

export function HomePage({
  state,
  studentId,
  studentName,
  readonly,
}: {
  state: S
  studentId: string
  studentName?: string
  readonly?: boolean
}) {
  const pet = state.pets.find((p) => p.ownerId === studentId)
  const today = todayStr(state)
  const [replay, setReplay] = useState(false)
  const okr = personalOkrOf(state, studentId)
  const [myO, setMyO] = useState(okr.objective)
  const [note, setNote] = useState('')
  const locked = isClassHourLocked(state, studentId)
  const minePending = pendingTicksOf(state, studentId)
  const peerPending = pendingTicksOf(state).filter((k) => k.studentId !== studentId)
  const myMood = moodOf(state, studentId)
  if (!pet) {
    return <p>尚未领养，将进入领养。</p>
  }
  if (replay) {
    return (
      <AdoptCeremony
        name={petDisplayName(pet)}
        motto={pet.motto}
        studentName={studentName}
        species={pet.species}
        face={pet.face}
        expression="cheer"
        paletteId={pet.paletteId}
        marking={pet.marking}
        headwearId={pet.headwearId}
        clothesId={pet.clothesId}
        shoesId={pet.shoesId}
        mountId={pet.mountId}
        onDone={() => setReplay(false)}
      />
    )
  }

  function care(fn: () => string | null, ok: string) {
    if (locked) {
      showToast(CLASS_CARE)
      return
    }
    const e = fn()
    showToast(e ?? ok)
  }

  return (
    <div className="card home-card">
      <div className="home-pet">
        <h2>
          <span className="muted">成长 {pet.growth}</span>
        </h2>
        <PetSvg
          species={pet.species}
          face={pet.face}
          expression={pet.expression}
          skinId={pet.skinId}
          mountId={pet.mountId}
          paletteId={pet.paletteId}
          marking={pet.marking}
          headwearId={pet.headwearId}
          clothesId={pet.clothesId}
          shoesId={pet.shoesId}
        />
        <div className="pet-caption">
          <div className="pet-caption-name">{petDisplayName(pet)}</div>
          <div className="pet-caption-motto">{pet.motto}</div>
        </div>
      </div>
      <div className="home-meta">
        <p>
          心情 {pet.mood} · 饱食 {pet.hunger} · 养成积分 {balance(state, studentId)}
        </p>
        {!readonly && (
          <div className="row mood-row">
            <span className="muted">今日心情</span>
            {MOODS.map((m) => (
              <button
                key={m}
                type="button"
                className={myMood === m ? 'on' : ''}
                onClick={() => showToast(setDailyMood(studentId, m) ?? `已记 ${MOOD_LABEL[m]}`)}
              >
                {MOOD_LABEL[m]}
              </button>
            ))}
          </div>
        )}
        <p>
          本周目标 {okr.objective || '未设'} · 进度 {okr.krDone}/{okr.krTarget}
          {minePending.length ? ` · 待确认 ${minePending.length}` : ''}（只和自己比）
        </p>
        <div className="kr-dots" aria-label={`个人进度 ${okr.krDone}/${okr.krTarget}`}>
          {Array.from({ length: okr.krTarget }, (_, i) => (
            <span key={i} className={i < okr.krDone ? 'on' : i < okr.krDone + minePending.length ? 'pending' : ''} />
          ))}
        </div>
        {!readonly && (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault()
              showToast(setStudentObjective(studentId, myO) ?? '已保存本周目标')
            }}
          >
            <input value={myO} onChange={(e) => setMyO(e.target.value)} maxLength={16} aria-label="本周目标" />
            <button type="submit" className="primary">保存目标</button>
          </form>
        )}
        {!readonly && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const err = submitKrTick(studentId, note)
              showToast(err ?? '已打钩，待同学或老师确认')
              if (!err) setNote('')
            }}
          >
            <label>
              勾选本周关键结果（须写一句证据）
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={24}
                placeholder="例如：订正本第3页做完"
                aria-label="关键结果证据"
              />
            </label>
            <button type="submit" className="primary">打钩</button>
          </form>
        )}
        {minePending.map((k) => (
          <p key={k.id} className="pending-tag">待确认 · {k.note}</p>
        ))}
        {!readonly && peerPending.length > 0 && (
          <div>
            <h3>同学待确认</h3>
            {peerPending.map((k) => (
              <div key={k.id} className="item">
                {state.users.find((u) => u.id === k.studentId)?.name} · {k.note}
                <button
                  type="button"
                  className="primary"
                  onClick={() => showToast(confirmKrTick(k.id, studentId) ?? '已确认')}
                >
                  确认
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="muted">
          今日入账 {dayEarn(state, studentId, today)}/{DAILY_EARN_CAP} · 消耗{' '}
          {daySpendAbs(state, studentId, today)}/{DAILY_SPEND_CAP}
        </p>
        {!readonly && (
          <div className="row">
            <button type="button" disabled={locked} onClick={() => care(() => tapPet(studentId), '轻点')}>
              轻点 0
            </button>
            <button type="button" disabled={locked} onClick={() => care(() => petPet(studentId), '摸头 −2')}>
              抚摸 −2
            </button>
            <button type="button" disabled={locked} onClick={() => care(() => feedPet(studentId), '喂食 −2')}>
              喂食 −2
            </button>
            <button type="button" className="secondary" onClick={() => setReplay(true)}>
              再看领养
            </button>
          </div>
        )}
        {locked && <p className="lock-banner">{CLASS_CARE}</p>}
        <p className="muted">确认后的勾选才计入成长与班级进度。待确认不加成长。</p>
        <h3>流水</h3>
        <ul className="home-led">
          {state.ledger
            .filter((l) => l.studentId === studentId)
            .map((l) => (
              <li key={l.id}>
                {l.date} {l.delta > 0 ? '+' : ''}
                {l.delta} {displayLedgerReason(l.reason)}
              </li>
            ))}
        </ul>
        <h3>成就</h3>
        <ul className="home-ach">
          {ACHIEVEMENTS.map((a) => {
            const on = (state.unlockedAchievements?.[studentId] || []).includes(a.id)
            return (
              <li key={a.id}>
                {on ? '已解锁' : '未解锁'} · {a.title} → {ITEM_LABEL[a.itemId] ?? a.itemId}
                <div className="muted">{a.desc}</div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
