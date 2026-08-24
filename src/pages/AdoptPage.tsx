import { useState } from 'react'
import { AdoptCeremony } from '../components/AdoptCeremony'
import { PetSvg } from '../components/PetSvg'
import { BASE_PETS, COSMETICS, cosmeticsOf } from '../catalog'
import { adopt, adoptCost, balance, petDisplayName, validateMotto, validatePetName } from '../store'
import type { FacePreset } from '../types'
import type { AppState } from '../types'

const emptyFace = (): FacePreset => ({
  eye_size: 50,
  eye_spacing: 50,
  muzzle_length: 50,
  ear_tilt: 50,
  brow_height: 50,
  cheek: 50,
  body_round: 50,
})

const STEPS = ['选动物', '选装扮', '取名签名', '确认'] as const

export function AdoptPage({
  state,
  studentId,
  studentName,
  onAdopted,
}: {
  state: AppState
  studentId: string
  studentName?: string
  onAdopted?: () => void
}) {
  const existing = state.pets.find((p) => p.ownerId === studentId)
  const [baseId, setBaseId] = useState(existing?.basePetId ?? BASE_PETS[0].id)
  const [nick, setNick] = useState(existing ? petDisplayName(existing) : '')
  const [motto, setMotto] = useState(existing?.motto ?? '')
  const [face] = useState<FacePreset>(existing?.face ?? emptyFace())
  const [hw, setHw] = useState(existing?.headwearId ?? 'hw_leaf')
  const [cl, setCl] = useState(existing?.clothesId ?? 'cl_scarf')
  const [sh, setSh] = useState(existing?.shoesId ?? 'sh_none')
  const [msg, setMsg] = useState<string | null>(null)
  const [showCere, setShowCere] = useState(false)
  const [step, setStep] = useState(0)

  const base = BASE_PETS.find((p) => p.id === baseId) ?? BASE_PETS[0]
  const pts = balance(state, studentId)
  const pickCost = existing ? 0 : adoptCost([hw, cl, sh])

  function lockNeed(id: string) {
    const item = COSMETICS.find((c) => c.id === id)
    if (!item || item.cost === 0) return 0
    const others = [hw, cl, sh].filter((x) => x !== id)
    const rest = adoptCost(others)
    const need = rest + item.cost - pts
    return need > 0 ? need : 0
  }

  const preview = (
    <PetSvg
      species={base.species}
      face={face}
      expression="idle"
      paletteId={base.palette}
      marking={base.marking}
      headwearId={hw}
      clothesId={cl}
      shoesId={sh}
    />
  )

  if (showCere) {
    return (
      <AdoptCeremony
        name={nick.trim() || existing?.name || base.name}
        motto={motto.trim() || existing?.motto || ''}
        studentName={studentName}
        species={base.species}
        face={face}
        paletteId={base.palette}
        marking={base.marking}
        headwearId={hw}
        clothesId={cl}
        shoesId={sh}
        onDone={() => {
          setShowCere(false)
          onAdopted?.()
        }}
      />
    )
  }

  if (existing) {
    return (
      <div className="card">
        <h2>已领养</h2>
        <p className="meta-copy">每人一只。装扮在领养时锁定。回主页点「再看领养」可重看仪式。</p>
        {preview}
        <p>
          宠物名 <strong>{petDisplayName(existing)}</strong>
        </p>
        <p className="meta-copy">{existing.motto}</p>
        {msg && <p className="meta-copy">{msg}</p>}
      </div>
    )
  }

  return (
    <div className="card">
      <h2>领养</h2>
      <ol className="adopt-steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'on' : i < step ? 'done' : ''}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>
      {preview}

      {step === 0 && (
        <>
          <label>动物（{BASE_PETS.length} 只基础宠物）</label>
          <div className="pet-grid">
            {BASE_PETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`pet-pick ${baseId === p.id ? 'on' : ''}`}
                onClick={() => setBaseId(p.id)}
              >
                <PetSvg
                  compact
                  species={p.species}
                  face={face}
                  expression="idle"
                  paletteId={p.palette}
                  marking={p.marking}
                />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 1 &&
        (['headwear', 'clothes', 'shoes'] as const).map((slot) => (
          <div key={slot}>
            <label>{slot === 'headwear' ? '头饰' : slot === 'clothes' ? '衣服' : '鞋子'}</label>
            <div className="row wrap">
              {cosmeticsOf(slot).map((c) => {
                const selected = (slot === 'headwear' ? hw : slot === 'clothes' ? cl : sh) === c.id
                const need = lockNeed(c.id)
                const locked = need > 0 && !selected
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={selected ? 'on' : ''}
                    disabled={locked}
                    onClick={() => {
                      if (slot === 'headwear') setHw(c.id)
                      else if (slot === 'clothes') setCl(c.id)
                      else setSh(c.id)
                    }}
                  >
                    {c.name}
                    {c.cost ? ` · ${c.cost}` : ' · 免费'}
                    {locked ? ` · 再攒 ${need} 分解锁` : ''}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

      {step === 2 && (
        <>
          <label>宠物名</label>
          <input
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            placeholder="2–8 个汉字或字母"
            maxLength={8}
            required
          />
          <label>个性签名</label>
          <input
            value={motto}
            onChange={(e) => setMotto(e.target.value.slice(0, 20))}
            placeholder="最多 20 字"
            maxLength={20}
            required
          />
        </>
      )}

      {step === 3 && (
        <div className="adopt-confirm">
          <p>
            动物 <strong>{base.name}</strong>
          </p>
          <p>
            名字 <strong>{nick.trim() || '（未填）'}</strong>
          </p>
          <p>
            签名 <strong>{motto.trim() || '（未填）'}</strong>
          </p>
          <p className="muted">
            养成积分 {pts} · 本次装扮 {pickCost} 分
          </p>
        </div>
      )}

      {step < 3 && (
        <p className="muted">
          养成积分 {pts}
          {` · 本次装扮 ${pickCost} 分`}
        </p>
      )}
      {msg && <p className="err">{msg}</p>}

      <div className="row">
        {step > 0 && (
          <button type="button" onClick={() => setStep((s) => s - 1)}>
            上一步
          </button>
        )}
        {step < 3 && (
          <button
            type="button"
            className="primary"
            disabled={step === 2 && (!!validatePetName(nick) || !!validateMotto(motto))}
            onClick={() => setStep((s) => s + 1)}
          >
            下一步
          </button>
        )}
        {step === 2 && (!!validatePetName(nick) || !!validateMotto(motto)) && (
          <p className="hint">{validatePetName(nick) || validateMotto(motto)}，填写后即可下一步</p>
        )}
        {step === 3 && (
          <button
            className="primary"
            disabled={!!validatePetName(nick) || !!validateMotto(motto)}
            onClick={() => {
              const err = adopt(studentId, base.species, nick, face, {
                basePetId: base.id,
                headwearId: hw,
                clothesId: cl,
                shoesId: sh,
                motto,
              })
              if (err) {
                setMsg(err)
                return
              }
              setShowCere(true)
            }}
          >
            确认领养
          </button>
        )}
      </div>
    </div>
  )
}
