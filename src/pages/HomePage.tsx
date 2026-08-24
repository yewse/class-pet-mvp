import { useState } from 'react'
import { AdoptCeremony } from '../components/AdoptCeremony'
import { PetSvg } from '../components/PetSvg'
import { balance, feedPet, personalOkrOf, petDisplayName, petPet, setStudentObjective, tapPet } from '../store'
import { DAILY_EARN_CAP, DAILY_SPEND_CAP, ITEM_LABEL, displayLedgerReason } from '../types'
import { ACHIEVEMENTS, dayEarn, daySpendAbs, isClassHourLocked, todayStr } from '../rules'
import { showToast } from '../toast'
import type { AppState as S } from '../types'

const CLASS_CARE = '上课中，课后再照料'

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
  const locked = isClassHourLocked(state, studentId)
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
        <p>
          本周目标 {okr.objective || '未设'} · 进度 {okr.krDone}/{okr.krTarget}（只和自己比）
        </p>
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
        <p className="muted">当日个人关键结果每新增一格，成长 +8。大屏乱点不加成长。</p>
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
