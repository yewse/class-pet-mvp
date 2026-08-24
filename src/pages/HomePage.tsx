import { useState } from 'react'
import { AdoptCeremony } from '../components/AdoptCeremony'
import { PetSvg } from '../components/PetSvg'
import {
  balance,
  classPerkOf,
  confirmKrTick,
  equip,
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
import { DAILY_EARN_CAP, DAILY_SPEND_CAP, ITEM_LABEL, MOOD_LABEL, REFLECT_CHIP, displayLedgerReason } from '../types'
import type { MoodId } from '../types'
import { ACHIEVEMENTS, dayEarn, daySpendAbs, growthStage, isClassHourLocked, petMissCopy, todayStr } from '../rules'
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
  const [tickErr, setTickErr] = useState<string | null>(null)
  const locked = isClassHourLocked(state, studentId)
  const minePending = pendingTicksOf(state, studentId)
  const peerPending = pendingTicksOf(state).filter((k) => k.studentId !== studentId)
  const myMood = moodOf(state, studentId)
  const [showCoach, setShowCoach] = useState(() => {
    try {
      return localStorage.getItem('class-pet-home-coach-v1') !== '1'
    } catch {
      return true
    }
  })
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
        allowSkipNow
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
      {showCoach && !readonly && (
        <div className="home-coach">
          <ol>
            <li>定目标：写下本周想完成的一件事</li>
            <li>打卡：做完就勾选，等同学或老师确认</li>
            <li>免费照料：轻点、抚摸、喂食都不花积分</li>
          </ol>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setShowCoach(false)
              try {
                localStorage.setItem('class-pet-home-coach-v1', '1')
              } catch {
                /* ignore */
              }
            }}
          >
            知道了
          </button>
        </div>
      )}
      <div className="home-pet">
        <h2>
          <span className="muted">成长 {pet.growth} · {growthStage(pet.growth)}</span>
        </h2>
        <PetSvg
          species={pet.species}
          face={pet.face}
          expression={pet.expression}
          growth={pet.growth}
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
          心情 {pet.mood} · 想念 {pet.hunger} · 养成积分 {balance(state, studentId)}
          {petMissCopy(pet, state) ? ` · ${petMissCopy(pet, state)}` : ''}
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
        {classPerkOf(state) && (
          <p className="ok">本周集体奖励：{classPerkOf(state)!.text}（老师发放，不自动删作业）</p>
        )}
        <p>
          本周目标 {okr.objective || '未设'} · 努力勾选 {okr.krDone}/{okr.krTarget}
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
              setTickErr(err)
              showToast(err ?? '已打钩，待同学或老师确认')
              if (!err) setNote('')
            }}
          >
            <label>
              勾选本周关键结果（须写一句证据）
              <input
                className={tickErr ? 'field-err' : ''}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value)
                  if (tickErr) setTickErr(null)
                }}
                maxLength={24}
                placeholder="例如：订正本第3页做完"
                aria-label="关键结果证据"
                aria-invalid={!!tickErr}
              />
              {tickErr && <p className="field-err-msg">{tickErr}</p>}
            </label>
            <button type="submit" className="primary">打钩</button>
          </form>
        )}
        {minePending.map((k) => (
          <p key={k.id} className="pending-tag">待确认 · {k.note}</p>
        ))}
        {(state.unlocked[studentId] || []).includes(REFLECT_CHIP) && (
          <div className="item">
            已解锁头饰 反思之眼（订正目标确认勾选，不可购买）
            {!readonly && pet.headwearId !== REFLECT_CHIP && (
              <button type="button" className="primary" onClick={() => showToast(equip(studentId, REFLECT_CHIP) ?? '已戴上反思之眼')}>
                戴上
              </button>
            )}
          </div>
        )}
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
            <button type="button" className={locked ? 'care-later' : ''} onClick={() => care(() => tapPet(studentId), '轻点')}>
              {locked ? '轻点 · 课后可用' : '轻点 0'}
            </button>
            <button type="button" className={locked ? 'care-later' : ''} onClick={() => care(() => petPet(studentId), '抚摸')}>
              {locked ? '抚摸 · 课后可用' : '抚摸 0'}
            </button>
            <button type="button" className={locked ? 'care-later' : ''} onClick={() => care(() => feedPet(studentId), '喂食')}>
              {locked ? '喂食 · 课后可用' : '喂食 0'}
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
