import { useState } from 'react'
import { PetSvg } from '../components/PetSvg'
import { confirmKrTick, pendingTicksOf, social, toggleDnd } from '../store'
import { isClassHourLocked } from '../rules'
import { showToast } from '../toast'
import type { AppState } from '../types'
import { SPECIES } from '../types'

const CLASS_CARE = '上课中，课后再照料'

export function VisitPage({ state, meId }: { state: AppState; meId: string }) {
  const others = state.users.filter((u) => u.role === 'student' && u.id !== meId)
  const [to, setTo] = useState(others[0]?.id ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const me = state.users.find((u) => u.id === meId)
  const target = state.pets.find((p) => p.ownerId === to)
  const tu = state.users.find((u) => u.id === to)
  const locked = isClassHourLocked(state, meId)

  function act(type: 'visit' | 'emoji' | 'snack' | 'cotrain', ok: string, emoji?: string) {
    if (locked) {
      showToast(CLASS_CARE)
      setMsg(CLASS_CARE)
      return
    }
    void social(meId, to, type, emoji).then((e) => {
      setMsg(e ?? ok)
      showToast(e ?? ok, e ? 'err' : 'ok')
    })
  }

  return (
    <div className="card">
      <h2>宠物互访</h2>
      <label>
        <input type="checkbox" checked={!!me?.dnd} onChange={() => void toggleDnd(meId)} /> 免打扰
      </label>
      <div className="row wrap">
        {others.map((u) => (
          <button key={u.id} className={to === u.id ? 'on' : ''} onClick={() => setTo(u.id)}>
            {u.name}
            {u.dnd ? ' · 勿扰' : ''}
          </button>
        ))}
      </div>
      {target && (
        <PetSvg
          compact
          species={target.species}
          face={target.face}
          expression={tu?.dnd ? 'missSoft' : target.expression}
          skinId={target.skinId}
          mountId={target.mountId}
          paletteId={target.paletteId}
          marking={target.marking}
          headwearId={target.headwearId}
          clothesId={target.clothesId}
          shoesId={target.shoesId}
        />
      )}
      <p className="muted">
        {target ? SPECIES.find((s) => s.id === target.species)?.label : ''} · 探望/表情 0 · 点心 −2 · 共训双方 −2/日 1 次
      </p>
      {locked && <p className="lock-banner">{CLASS_CARE}</p>}
      {msg && <p className={msg.includes('上课') ? 'lock-banner' : msg.includes('不足') || msg.includes('只能') || msg.includes('已') ? 'muted' : 'ok'}>{msg}</p>}
      {pendingTicksOf(state, to).map((k) => (
        <div key={k.id} className="item">
          待确认 · {k.note}{' '}
          <button
            type="button"
            className="primary"
            onClick={() =>
              void confirmKrTick(k.id, meId).then((e) => {
                setMsg(e ?? '已确认')
                showToast(e ?? '已确认', e ? 'err' : 'ok')
              })
            }
          >
            确认
          </button>
        </div>
      ))}
      <div className="row wrap">
        <button type="button" disabled={locked} onClick={() => act('visit', '探望成功')}>探望 0</button>
        <button type="button" disabled={locked} onClick={() => act('emoji', '表情 ✨', '✨')}>表情 ✨ 0</button>
        <button type="button" disabled={locked} onClick={() => act('snack', '点心 −2')}>点心 −2</button>
        <button type="button" disabled={locked} onClick={() => act('cotrain', '共训双方 −2')}>共训 −2</button>
      </div>
    </div>
  )
}
