import { useEffect, useRef, useState } from 'react'
import { PetSvg } from './PetSvg'
import type { Expression, FacePreset, MarkingId, PaletteId, SpeciesId } from '../types'

const MIN_MS = 3500
const SKIP_AFTER_MS = 3500

export function AdoptCeremony(props: {
  name: string
  motto?: string
  studentName?: string
  species: SpeciesId
  face: FacePreset
  expression?: Expression
  paletteId?: PaletteId
  marking?: MarkingId
  headwearId?: string
  clothesId?: string
  shoesId?: string
  mountId?: string | null
  onDone: () => void
}) {
  const [canSkip, setCanSkip] = useState(false)
  const doneRef = useRef(false)
  const onDoneRef = useRef(props.onDone)
  onDoneRef.current = props.onDone

  function finish() {
    if (doneRef.current) return
    doneRef.current = true
    onDoneRef.current()
  }

  useEffect(() => {
    const skipT = window.setTimeout(() => setCanSkip(true), SKIP_AFTER_MS)
    const endT = window.setTimeout(() => finish(), MIN_MS)
    return () => {
      window.clearTimeout(skipT)
      window.clearTimeout(endT)
    }
    // 只播一次，结束前不切页
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const petName = props.name.trim() || '小宠物'
  const title = props.studentName
    ? `欢迎，${props.studentName} 与 ${petName}`
    : `欢迎，${petName}`

  return (
    <div className="ceremony" role="dialog" aria-modal="true" aria-label="领养仪式">
      <div className="ceremony-room" aria-hidden />
      <div className="ceremony-spot" />
      <div className="ceremony-sparkles" aria-hidden>
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className={`spark s${i % 7}`} />
        ))}
      </div>
      <div className="ceremony-walk">
        <PetSvg
          species={props.species}
          face={props.face}
          expression={props.expression ?? 'shy'}
          paletteId={props.paletteId}
          marking={props.marking}
          headwearId={props.headwearId}
          clothesId={props.clothesId}
          shoesId={props.shoesId}
          mountId={props.mountId}
        />
      </div>
      <h2 className="ceremony-title">{title}</h2>
      <p className="ceremony-sub">{(props.motto ?? '').trim()}</p>
      {canSkip && (
        <button type="button" className="ceremony-skip" onClick={finish}>
          跳过
        </button>
      )}
    </div>
  )
}
