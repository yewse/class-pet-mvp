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
  okrHistoryOf,
  pendingTicksOf,
  personalOkrOf,
  petDisplayName,
  petPet,
  reviewCandidate,
  setDailyMood,
  setStudentObjective,
  stalePendingTicks,
  submitKrTick,
  submitSelfReview,
  tapPet,
} from '../store'
import {
  ITEM_LABEL,
  MOOD_LABEL,
  REFLECT_CHIP,
  SELF_SCORE_OPTIONS,
  RETRO_MAX_LEN,
  displayLedgerReason,
  rulesOf,
} from '../types'
import type { MoodId } from '../types'
import {
  ACHIEVEMENTS,
  dayEarn,
  daySpendAbs,
  growthStage,
  isClassHourLocked,
  isWeekend,
  petMissCopy,
  retestsDue,
  todayStr,
} from '../rules'
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
  const cfg = rulesOf(state)
  const [replay, setReplay] = useState(false)
  const okr = personalOkrOf(state, studentId)
  const [myO, setMyO] = useState(okr.objective)
  const [note, setNote] = useState('')
  const [tickErr, setTickErr] = useState<string | null>(null)
  const [score, setScore] = useState<number | null>(null)
  const [retro, setRetro] = useState('')
  const locked = isClassHourLocked(state, studentId)
  const minePending = pendingTicksOf(state, studentId)
  const mineStale = stalePendingTicks(state, studentId)
  const peerPending = pendingTicksOf(state).filter((k) => k.studentId !== studentId)
  const myMood = moodOf(state, studentId)
  const review = reviewCandidate(state, studentId)
  const history = okrHistoryOf(state, studentId).slice(0, 4)
  const dueRetests = retestsDue(state, studentId)
  const weekend = isWeekend(today)
  const [showCoach, setShowCoach] = useState(() => {
    try {
      return localStorage.getItem('class-pet-home-coach-v2') !== '1'
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

  async function care(fn: () => Promise<string | null>, ok: string) {
    if (locked) {
      showToast(CLASS_CARE)
      return
    }
    const e = await fn()
    showToast(e ?? ok)
  }

  const missCopy = weekend ? '周末休息中，不用惦记' : petMissCopy(pet, state)

  return (
    <div className="card home-card">
      {showCoach && !readonly && (
        <div className="home-coach">
          <ol>
            <li>定目标：写下本周想完成的一件事</li>
            <li>打卡：做完就勾选，等同学或老师确认</li>
            <li>周五：给自己打个分，写一句复盘</li>
            <li>照料免费：轻点、抚摸、喂食随时可做</li>
          </ol>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setShowCoach(false)
              try {
                localStorage.setItem('class-pet-home-coach-v2', '1')
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
          {missCopy ? ` · ${missCopy}` : ''}
        </p>
        {!readonly && (
          <div className="row mood-row">
            <span className="muted">今日心情</span>
            {MOODS.map((m) => (
              <button
                key={m}
                type="button"
                className={myMood === m ? 'on' : ''}
                onClick={() => void setDailyMood(studentId, m).then((e) => showToast(e ?? `已记 ${MOOD_LABEL[m]}`))}
              >
                {MOOD_LABEL[m]}
              </button>
            ))}
            <span className="muted">只有老师看得到，不影响宠物</span>
          </div>
        )}
        {classPerkOf(state) && (
          <p className="ok">本周集体奖励：{classPerkOf(state)!.text}（老师兑现）</p>
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
              void setStudentObjective(studentId, myO).then((err) => showToast(err ?? '已保存本周目标', err ? 'err' : 'ok'))
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
              void submitKrTick(studentId, note).then((err) => {
                setTickErr(err)
                showToast(err ?? '已打钩，待同学或老师确认', err ? 'err' : 'ok')
                if (!err) setNote('')
              })
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
        {mineStale.length > 0 && (
          <p className="muted">上周还有 {mineStale.length} 条打钩待老师补确认，不会丢。</p>
        )}
        {!readonly && dueRetests.length > 0 && (
          <p className="lock-banner">
            有 {dueRetests.length} 道 3 天前订正的错题等你重测：去「申报」页点「错题重测」，测完还会才算真的会。
          </p>
        )}
        {!readonly && review && (
          <div className="retro-card">
            <p className="pad-block-label">
              {review.kind === 'current' ? '周五复盘 · 本周做得怎么样？' : `补复盘 · ${review.weekId}`}
            </p>
            <div className="row">
              {SELF_SCORE_OPTIONS.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={score === v ? 'on' : ''}
                  onClick={() => setScore(v)}
                >
                  {v}
                </button>
              ))}
            </div>
            <input
              value={retro}
              onChange={(e) => setRetro(e.target.value)}
              maxLength={RETRO_MAX_LEN}
              placeholder="一句复盘：哪里做得好，哪里卡住了"
              aria-label="一句复盘"
            />
            <button
              type="button"
              className="primary"
              onClick={() => {
                if (score == null) {
                  showToast('先选一个自评分', 'err')
                  return
                }
                void submitSelfReview(studentId, review.weekId, score, retro).then((err) => {
                  showToast(err ?? `复盘完成，宠物成长 +${cfg.growthRetro}`, err ? 'err' : 'ok')
                  if (!err) {
                    setScore(null)
                    setRetro('')
                  }
                })
              }}
            >
              交复盘
            </button>
            <p className="muted">自评 0 / 0.3 / 0.7 / 1，只和自己比；完成复盘本身就有成长。</p>
          </div>
        )}
        {history.length > 0 && (
          <div>
            <h3>我的周期</h3>
            <ul className="home-led">
              {history.map((r) => (
                <li key={r.weekId}>
                  {r.weekId} · {r.objective || '未设目标'} · {r.krDone}/{r.krTarget}
                  {r.selfScore != null ? ` · 自评 ${r.selfScore}` : ' · 未复盘'}
                  {r.retro ? ` · ${r.retro}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(state.unlocked[studentId] || []).includes(REFLECT_CHIP) && (
          <div className="item">
            已解锁头饰 反思之眼（订正目标确认勾选，不可购买）
            {!readonly && pet.headwearId !== REFLECT_CHIP && (
              <button
                type="button"
                className="primary"
                onClick={() => void equip(studentId, REFLECT_CHIP).then((e) => showToast(e ?? '已戴上反思之眼'))}
              >
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
                  onClick={() => void confirmKrTick(k.id, studentId).then((e) => showToast(e ?? '已确认', e ? 'err' : 'ok'))}
                >
                  确认
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="muted">
          今日入账 {dayEarn(state, studentId, today)}/{cfg.dailyEarnCap} · 社交消耗{' '}
          {daySpendAbs(state, studentId, today)}/{cfg.dailySpendCap}（兑换装扮不占）
        </p>
        {!readonly && (
          <div className="row">
            <button type="button" className={locked ? 'care-later' : ''} onClick={() => void care(() => tapPet(studentId), '轻点了它')}>
              {locked ? '轻点 · 课后可用' : '轻点'}
            </button>
            <button type="button" className={locked ? 'care-later' : ''} onClick={() => void care(() => petPet(studentId), '摸了摸它')}>
              {locked ? '抚摸 · 课后可用' : '抚摸'}
            </button>
            <button type="button" className={locked ? 'care-later' : ''} onClick={() => void care(() => feedPet(studentId), '喂饱了它')}>
              {locked ? '喂食 · 课后可用' : '喂食'}
            </button>
            <button type="button" className="secondary" onClick={() => setReplay(true)}>
              再看领养
            </button>
          </div>
        )}
        <p className="muted">照料全部免费，不花积分；想念值周末不涨。</p>
        {locked && <p className="lock-banner">{CLASS_CARE}</p>}
        <p className="muted">确认后的勾选才计入成长与班级进度。待确认不加成长。</p>
        <h3>流水（只有你和老师看得到）</h3>
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
