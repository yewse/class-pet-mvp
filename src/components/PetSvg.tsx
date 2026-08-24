import type { Expression, FacePreset, MarkingId, PaletteId, SpeciesId } from '../types'
import { MOUNT_ID } from '../types'

type Palette = { body: string; ear: string; accent: string; line: string; extra: string }

const BASE: Record<SpeciesId, Palette> = {
  fox: { body: '#e07a3d', ear: '#8a2a1a', accent: '#fff4d6', line: '#7a3a18', extra: '#f4c27a' },
  owl: { body: '#6b4e32', ear: '#3d2a1c', accent: '#f3e2b8', line: '#3a2818', extra: '#c4a06a' },
  otter: { body: '#5e7a86', ear: '#3e545c', accent: '#d7c4b0', line: '#2c3c42', extra: '#8aa0a8' },
  cat: { body: '#c9b8a6', ear: '#8a6a78', accent: '#fff8ef', line: '#5a4638', extra: '#d8c8b8' },
  dog: { body: '#c68642', ear: '#7a4a28', accent: '#fff1dc', line: '#5a3418', extra: '#e8c090' },
  rabbit: { body: '#f0d0d8', ear: '#e08aa0', accent: '#fff6f8', line: '#8a5060', extra: '#ffffff' },
  panda: { body: '#f4f0ea', ear: '#2a2a2a', accent: '#ffffff', line: '#222', extra: '#3a3a3a' },
  deer: { body: '#c48a4a', ear: '#8a5a2a', accent: '#f3e2c0', line: '#5a3418', extra: '#e8c090' },
  penguin: { body: '#2c3340', ear: '#1a1e26', accent: '#f6f1e8', line: '#12141a', extra: '#f0b060' },
  bear: { body: '#8a6238', ear: '#5a3a1c', accent: '#e8d2b0', line: '#3a2410', extra: '#c4a06a' },
}

const TINT: Record<PaletteId, { body: string; ear: string; accent: string; extra: string }> = {
  chi: { body: '#e24a2a', ear: '#7a180c', accent: '#ffd8a8', extra: '#ffb060' },
  qing: { body: '#4aa0d8', ear: '#1c4a78', accent: '#e8f6ff', extra: '#8ad0f0' },
  mo: { body: '#2e3a42', ear: '#14181c', accent: '#c8d0d4', extra: '#5a686e' },
}

function mix(species: SpeciesId, palette?: PaletteId): Palette {
  const b = BASE[species] ?? BASE.fox
  if (!palette) return b
  const t = TINT[palette]
  return { body: t.body, ear: t.ear, accent: t.accent, line: b.line, extra: t.extra }
}

const SKIN_TINT: Record<string, string> = {
  skin_basic_leaf: '#7ecf7a',
  skin_basic_cloud: '#c9e7ff',
  skin_mid_star: '#8a7cff',
  skin_mid_ink: '#3d4454',
  skin_high_aurora: '#5ad0c8',
  skin_high_festival: '#ff8a5c',
  skin_rare_week: '#c0c8d8',
  skin_rare_achieve: '#e6c35c',
  cl_scarf: '#7ecf7a',
  cl_cloud: '#c9e7ff',
  cl_cape: '#8a7cff',
  cl_vest: '#3d4454',
  cl_aurora: '#5ad0c8',
}

function eyeKind(expr: Expression) {
  if (expr === 'tired' || expr === 'calm' || expr === 'dormant') return 'line'
  if (expr === 'cheer' || expr === 'happy') return 'arc'
  if (expr === 'focus') return 'narrow'
  return 'round'
}

function Eyes(props: { kind: string; lx: number; rx: number; y: number; s: number; fill?: string }) {
  const { kind, lx, rx, y, s, fill = '#1c1410' } = props
  if (kind === 'arc') {
    return (
      <g className="layer-eyes">
        <path d={`M${lx - 7} ${y} q 7 -9 14 0`} stroke={fill} fill="none" strokeWidth="3" strokeLinecap="round" />
        <path d={`M${rx - 7} ${y} q 7 -9 14 0`} stroke={fill} fill="none" strokeWidth="3" strokeLinecap="round" />
      </g>
    )
  }
  if (kind === 'line') {
    return (
      <g className="layer-eyes">
        <line x1={lx - 7} y1={y} x2={lx + 7} y2={y} stroke={fill} strokeWidth="3" strokeLinecap="round" />
        <line x1={rx - 7} y1={y} x2={rx + 7} y2={y} stroke={fill} strokeWidth="3" strokeLinecap="round" />
      </g>
    )
  }
  if (kind === 'narrow') {
    return (
      <g className="layer-eyes">
        <ellipse cx={lx} cy={y} rx={s} ry={s * 0.32} fill={fill} />
        <ellipse cx={rx} cy={y} rx={s} ry={s * 0.32} fill={fill} />
      </g>
    )
  }
  return (
    <g className="layer-eyes">
      <circle className="eye-blink" cx={lx} cy={y} r={s} fill={fill} />
      <circle className="eye-blink" cx={rx} cy={y} r={s} fill={fill} />
      <circle cx={lx + 2} cy={y - 2} r={s * 0.28} fill="#fff" />
      <circle cx={rx + 2} cy={y - 2} r={s * 0.28} fill="#fff" />
    </g>
  )
}

function Mouth({ expr, x, y, line }: { expr: Expression; x: number; y: number; line: string }) {
  if (expr === 'cheer' || expr === 'happy') {
    return <path d={`M${x - 8} ${y} q 8 8 16 0`} stroke={line} fill="none" strokeWidth="2.2" strokeLinecap="round" />
  }
  if (expr === 'shy') {
    return <path d={`M${x - 4} ${y} q 4 3 8 0`} stroke={line} fill="none" strokeWidth="2" />
  }
  if (expr === 'missSoft') {
    return <path d={`M${x - 6} ${y + 1} q 6 4 12 0`} stroke={line} fill="none" strokeWidth="2" />
  }
  if (expr === 'tired' || expr === 'dormant') {
    return <line x1={x - 5} y1={y} x2={x + 5} y2={y} stroke={line} strokeWidth="2" />
  }
  if (expr === 'focus') {
    return <path d={`M${x - 5} ${y + 1} q 5 -4 10 0`} stroke={line} fill="none" strokeWidth="2" />
  }
  return <ellipse cx={x} cy={y} rx="3.2" ry="2" fill={line} />
}

function Marking({ marking, c }: { marking?: MarkingId; c: Palette }) {
  if (marking === 'stripe') {
    return (
      <g className="layer-mark" opacity="0.45">
        <path d="M78 108 q 10 18 0 36" stroke={c.ear} strokeWidth="6" fill="none" strokeLinecap="round" />
        <path d="M100 106 q 8 20 0 40" stroke={c.ear} strokeWidth="6" fill="none" strokeLinecap="round" />
        <path d="M122 108 q -10 18 0 36" stroke={c.ear} strokeWidth="6" fill="none" strokeLinecap="round" />
      </g>
    )
  }
  if (marking === 'spots') {
    return (
      <g className="layer-mark" opacity="0.5">
        <circle cx="78" cy="118" r="5" fill={c.ear} />
        <circle cx="118" cy="122" r="4" fill={c.ear} />
        <circle cx="96" cy="138" r="4.5" fill={c.ear} />
        <circle cx="128" cy="140" r="3.5" fill={c.ear} />
      </g>
    )
  }
  return null
}

function Clothes({ id, tint }: { id?: string; tint?: string }) {
  const color = (id && SKIN_TINT[id]) || tint
  if (!id && !color) return null
  if (id === 'cl_cape' || id === 'skin_mid_star') {
    return (
      <g className="layer-clothes">
        <path d="M70 118 Q100 168 130 118 L122 150 Q100 166 78 150 Z" fill={color} opacity="0.92" />
        <circle cx="100" cy="122" r="4" fill="#ffe27a" />
      </g>
    )
  }
  if (id === 'cl_vest' || id === 'skin_mid_ink' || id === 'skin_rare_achieve') {
    return (
      <g className="layer-clothes">
        <path d="M76 116 L124 116 L118 152 L82 152 Z" fill={color} />
        <path d="M100 116 L100 152" stroke="#e8d8a8" strokeWidth="2" />
      </g>
    )
  }
  if (id === 'cl_aurora' || id === 'skin_high_aurora' || id === 'skin_high_festival') {
    return (
      <g className="layer-clothes">
        <path d="M68 114 Q100 170 132 114 Q100 136 68 114" fill={color} opacity="0.9" />
        <path d="M74 128 Q100 148 126 128" stroke="#fff8" strokeWidth="3" fill="none" />
      </g>
    )
  }
  return (
    <g className="layer-clothes">
      <path d="M74 126 Q100 150 126 126" stroke={color || '#7ecf7a'} strokeWidth="9" fill="none" strokeLinecap="round" />
    </g>
  )
}

function Headwear({ id }: { id?: string }) {
  if (!id) return null
  if (id === 'hw_leaf') {
    return (
      <g className="layer-headwear">
        <ellipse cx="128" cy="48" rx="10" ry="5" fill="#7ecf7a" transform="rotate(24 128 48)" />
        <path d="M124 48 q 10 -14 18 2" fill="#5aaa52" />
      </g>
    )
  }
  if (id === 'hw_bow') {
    return (
      <g className="layer-headwear">
        <path d="M118 44 L132 36 L132 52 Z" fill="#f48ab0" />
        <path d="M146 44 L132 36 L132 52 Z" fill="#f48ab0" />
        <circle cx="132" cy="44" r="4" fill="#ffe0ec" />
      </g>
    )
  }
  if (id === 'hw_star') {
    return (
      <g className="layer-headwear">
        <path d="M70 58 Q100 36 130 58" fill="#8a7cff" />
        <polygon points="100,28 104,40 116,40 106,48 110,60 100,52 90,60 94,48 84,40 96,40" fill="#ffe27a" />
      </g>
    )
  }
  if (id === 'hw_hat') {
    return (
      <g className="layer-headwear">
        <ellipse cx="100" cy="58" rx="38" ry="8" fill="#2a2233" />
        <rect x="78" y="28" width="44" height="30" rx="6" fill="#3d3348" />
        <rect x="96" y="18" width="8" height="14" fill="#f4b942" />
      </g>
    )
  }
  if (id === 'hw_crown') {
    return (
      <g className="layer-headwear">
        <path d="M68 60 L80 36 L100 52 L120 36 L132 60 Z" fill="#e6c35c" stroke="#b8860b" />
        <circle cx="80" cy="40" r="3" fill="#ff6a6a" />
        <circle cx="100" cy="46" r="3" fill="#6ad0ff" />
        <circle cx="120" cy="40" r="3" fill="#7ecf7a" />
      </g>
    )
  }
  if (id === 'hw_reflect') {
    return (
      <g className="layer-headwear">
        <ellipse cx="100" cy="42" rx="16" ry="10" fill="#2a3348" stroke="#c8e4ff" strokeWidth="2" />
        <ellipse cx="100" cy="42" rx="7" ry="6" fill="#7ad0ff" opacity="0.85" />
        <circle cx="103" cy="39" r="2" fill="#fff" />
      </g>
    )
  }
  return null
}

function Shoes({ id }: { id?: string }) {
  if (!id || id === 'sh_none') return <g className="layer-shoes" />
  const fill =
    id === 'sh_gold' ? '#e6c35c' : id === 'sh_star' ? '#8a7cff' : id === 'sh_boots' ? '#5a3a22' : '#c9e7ff'
  return (
    <g className="layer-shoes">
      <ellipse cx="78" cy="156" rx="14" ry="8" fill={fill} />
      <ellipse cx="120" cy="156" rx="14" ry="8" fill={fill} />
      {id === 'sh_star' && (
        <>
          <circle cx="78" cy="154" r="2" fill="#ffe27a" />
          <circle cx="120" cy="154" r="2" fill="#ffe27a" />
        </>
      )}
    </g>
  )
}

export function PetSvg(props: {
  species: SpeciesId
  face: FacePreset
  expression: Expression
  skinId?: string
  mountId?: string | null
  compact?: boolean
  paletteId?: PaletteId
  marking?: MarkingId
  headwearId?: string
  clothesId?: string
  shoesId?: string
  /** 养成积分成长点：幼 <20 / 少 <48 / 成 */
  growth?: number
  stage?: '幼' | '少' | '成'
}) {
  const stage = props.stage ?? (props.growth == null ? '成' : props.growth < 20 ? '幼' : props.growth < 48 ? '少' : '成')
  const stageScale = stage === '幼' ? 0.72 : stage === '少' ? 0.88 : 1
  const c = mix(props.species, props.paletteId)
  const f = props.face
  const size = props.compact ? 132 : 196
  const bodyR = 38 + (f.body_round - 50) * 0.16
  const eyeS = 5.5 + f.eye_size * 0.055
  const gap = 11 + f.eye_spacing * 0.1
  const muzzle = 7 + f.muzzle_length * 0.07
  const earRot = (f.ear_tilt - 50) * 0.42
  const brow = (f.brow_height - 50) * 0.12
  const cheek = 3.5 + f.cheek * 0.035
  const kind = eyeKind(props.expression)
  const tint = props.skinId ? SKIN_TINT[props.skinId] : undefined
  const showMount = props.mountId === MOUNT_ID
  const sp = props.species
  const eyeY = (sp === 'owl' ? 86 : 84) + brow
  const lx = 100 - gap
  const rx = 100 + gap
  const clothesId = props.clothesId || props.skinId

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={`pet-svg expr-${props.expression} stage-${stage}${props.expression === 'dormant' ? ' pet-dormant' : ''}`}
      role="img"
      data-stage={stage}
      aria-label={props.expression === 'dormant' ? '休眠宠物' : `${stage}阶段班级宠物`}
      opacity={props.expression === 'dormant' ? 0.55 : 1}
    >
      {showMount && (
        <g className="layer-mount">
          <ellipse cx="100" cy="176" rx="62" ry="10" fill="#000" opacity="0.08" />
          <rect x="38" y="158" width="124" height="24" rx="7" fill="#c4a574" stroke="#8a6a3c" />
          <rect x="46" y="162" width="108" height="7" rx="2" fill="#e8d3a8" />
          <rect x="52" y="172" width="16" height="8" rx="2" fill="#8a6a3c" />
          <rect x="132" y="172" width="16" height="8" rx="2" fill="#8a6a3c" />
        </g>
      )}

      <g className="layer-body pet-react" transform={`translate(100 128) scale(${stageScale}) translate(-100 -128)`}>
        {sp === 'fox' && (
          <>
            <ellipse cx="148" cy="132" rx="36" ry="16" fill={c.body} transform="rotate(28 148 132)" />
            <ellipse cx="176" cy="146" rx="12" ry="8" fill={c.accent} transform="rotate(28 176 146)" />
            <ellipse cx="100" cy="122" rx={bodyR * 0.78} ry={bodyR * 0.95} fill={c.body} />
            <ellipse cx="100" cy="136" rx={bodyR * 0.42} ry={bodyR * 0.32} fill={c.accent} />
            <ellipse cx="72" cy="148" rx="10" ry="7" fill={c.body} />
            <ellipse cx="120" cy="150" rx="10" ry="7" fill={c.body} />
          </>
        )}
        {sp === 'owl' && (
          <>
            <ellipse cx="100" cy="118" rx={bodyR * 0.72} ry={bodyR * 1.05} fill={c.body} />
            <ellipse cx="62" cy="122" rx="18" ry="28" fill={c.ear} />
            <ellipse cx="138" cy="122" rx="18" ry="28" fill={c.ear} />
            <path d="M70 150 Q100 168 130 150" fill={c.extra} />
          </>
        )}
        {sp === 'otter' && (
          <>
            <ellipse cx="146" cy="138" rx="34" ry="10" fill={c.body} />
            <ellipse cx="168" cy="142" rx="10" ry="6" fill={c.ear} />
            <ellipse cx="96" cy="128" rx={bodyR * 1.05} ry={bodyR * 0.62} fill={c.body} />
            <ellipse cx="98" cy="136" rx={bodyR * 0.7} ry={bodyR * 0.28} fill={c.accent} />
            <ellipse cx="70" cy="150" rx="14" ry="6" fill={c.extra} />
            <ellipse cx="118" cy="150" rx="14" ry="6" fill={c.extra} />
          </>
        )}
        {sp === 'cat' && (
          <>
            <path d="M142 118 C168 90 176 140 150 148" fill={c.body} />
            <ellipse cx="100" cy="124" rx={bodyR * 0.78} ry={bodyR * 0.88} fill={c.body} />
            <ellipse cx="100" cy="138" rx={bodyR * 0.38} ry={bodyR * 0.26} fill={c.accent} />
            <ellipse cx="78" cy="150" rx="8" ry="6" fill={c.extra} />
            <ellipse cx="118" cy="150" rx="8" ry="6" fill={c.extra} />
          </>
        )}
        {sp === 'dog' && (
          <>
            <ellipse cx="148" cy="136" rx="22" ry="9" fill={c.body} transform="rotate(-12 148 136)" />
            <ellipse cx="100" cy="124" rx={bodyR * 0.92} ry={bodyR * 0.86} fill={c.body} />
            <ellipse cx="100" cy="138" rx={bodyR * 0.4} ry={bodyR * 0.28} fill={c.accent} />
            <ellipse cx="74" cy="150" rx="12" ry="7" fill={c.ear} />
            <ellipse cx="122" cy="150" rx="12" ry="7" fill={c.ear} />
          </>
        )}
        {sp === 'rabbit' && (
          <>
            <ellipse cx="132" cy="142" rx="10" ry="8" fill={c.extra} />
            <ellipse cx="100" cy="130" rx={bodyR * 0.86} ry={bodyR * 0.78} fill={c.body} />
            <ellipse cx="78" cy="152" rx="16" ry="10" fill={c.body} />
            <ellipse cx="118" cy="152" rx="16" ry="10" fill={c.body} />
            <ellipse cx="100" cy="140" rx={bodyR * 0.32} ry={bodyR * 0.22} fill={c.accent} />
          </>
        )}
        {sp === 'panda' && (
          <>
            <ellipse cx="100" cy="124" rx={bodyR * 0.9} ry={bodyR * 0.88} fill={c.body} />
            <ellipse cx="72" cy="126" rx="16" ry="18" fill={c.ear} />
            <ellipse cx="128" cy="126" rx="16" ry="18" fill={c.ear} />
            <ellipse cx="100" cy="140" rx={bodyR * 0.36} ry={bodyR * 0.24} fill={c.accent} />
            <ellipse cx="76" cy="150" rx="10" ry="7" fill={c.ear} />
            <ellipse cx="122" cy="150" rx="10" ry="7" fill={c.ear} />
          </>
        )}
        {sp === 'deer' && (
          <>
            <ellipse cx="150" cy="134" rx="20" ry="8" fill={c.body} />
            <ellipse cx="100" cy="126" rx={bodyR * 0.8} ry={bodyR * 0.9} fill={c.body} />
            <ellipse cx="100" cy="140" rx={bodyR * 0.34} ry={bodyR * 0.24} fill={c.accent} />
            <ellipse cx="76" cy="150" rx="9" ry="7" fill={c.body} />
            <ellipse cx="120" cy="150" rx="9" ry="7" fill={c.body} />
          </>
        )}
        {sp === 'penguin' && (
          <>
            <ellipse cx="100" cy="122" rx={bodyR * 0.7} ry={bodyR * 1.05} fill={c.body} />
            <ellipse cx="100" cy="130" rx={bodyR * 0.46} ry={bodyR * 0.72} fill={c.accent} />
            <ellipse cx="64" cy="128" rx="10" ry="16" fill={c.body} />
            <ellipse cx="136" cy="128" rx="10" ry="16" fill={c.body} />
            <ellipse cx="78" cy="152" rx="10" ry="6" fill={c.extra} />
            <ellipse cx="122" cy="152" rx="10" ry="6" fill={c.extra} />
          </>
        )}
        {sp === 'bear' && (
          <>
            <ellipse cx="100" cy="124" rx={bodyR * 0.95} ry={bodyR * 0.9} fill={c.body} />
            <ellipse cx="100" cy="138" rx={bodyR * 0.4} ry={bodyR * 0.28} fill={c.accent} />
            <ellipse cx="72" cy="150" rx="12" ry="8" fill={c.body} />
            <ellipse cx="124" cy="150" rx="12" ry="8" fill={c.body} />
          </>
        )}
        <Marking marking={props.marking} c={c} />
      </g>

      <g className="layer-skin">
        {!props.clothesId && tint && (
          <path d="M74 126 Q100 150 126 126" stroke={tint} strokeWidth="9" fill="none" strokeLinecap="round" />
        )}
      </g>

      <g className="layer-face pet-head" transform={`translate(100 86) scale(${stageScale}) translate(-100 -86)`}>
        {sp === 'fox' && (
          <>
            <g transform={`rotate(${-18 - earRot} 72 58)`}>
              <polygon points="72,78 54,34 90,70" fill={c.body} />
              <polygon points="72,70 62,42 82,66" fill={c.ear} />
            </g>
            <g transform={`rotate(${18 + earRot} 128 58)`}>
              <polygon points="128,78 146,34 110,70" fill={c.body} />
              <polygon points="128,70 138,42 118,66" fill={c.ear} />
            </g>
            <ellipse cx="100" cy="86" rx={36 + f.cheek * 0.06} ry="30" fill={c.body} />
            <polygon points={`${100},${104 + muzzle * 0.4} ${100 - muzzle},${96} ${100 + muzzle},${96}`} fill={c.accent} />
          </>
        )}
        {sp === 'owl' && (
          <>
            <polygon points="70,52 78,28 90,58" fill={c.ear} />
            <polygon points="130,52 122,28 110,58" fill={c.ear} />
            <ellipse cx="100" cy="88" rx="40" ry="34" fill={c.body} />
            <ellipse cx="100" cy="90" rx="34" ry="28" fill={c.accent} />
            <circle cx={lx} cy={eyeY} r={eyeS + 6} fill={c.extra} opacity="0.55" />
            <circle cx={rx} cy={eyeY} r={eyeS + 6} fill={c.extra} opacity="0.55" />
          </>
        )}
        {sp === 'otter' && (
          <>
            <ellipse cx="78" cy="70" rx="7" ry="6" fill={c.ear} />
            <ellipse cx="118" cy="70" rx="7" ry="6" fill={c.ear} />
            <ellipse cx="96" cy="88" rx={34 + f.cheek * 0.05} ry="26" fill={c.body} />
            <ellipse cx="100" cy={102 + muzzle * 0.1} rx={muzzle + 6} ry={muzzle * 0.7} fill={c.accent} />
            <line x1="72" y1="100" x2="54" y2="96" stroke={c.line} strokeWidth="1.4" />
            <line x1="72" y1="104" x2="54" y2="106" stroke={c.line} strokeWidth="1.4" />
            <line x1="128" y1="100" x2="146" y2="96" stroke={c.line} strokeWidth="1.4" />
            <line x1="128" y1="104" x2="146" y2="106" stroke={c.line} strokeWidth="1.4" />
          </>
        )}
        {sp === 'cat' && (
          <>
            <g transform={`rotate(${-earRot} 70 56)`}>
              <polygon points="70,78 54,40 86,68" fill={c.body} />
              <polygon points="70,72 62,48 80,66" fill={c.ear} />
            </g>
            <g transform={`rotate(${earRot} 130 56)`}>
              <polygon points="130,78 146,40 114,68" fill={c.body} />
              <polygon points="130,72 138,48 120,66" fill={c.ear} />
            </g>
            <ellipse cx="100" cy="86" rx={32 + f.cheek * 0.06} ry="28" fill={c.body} />
            <line x1="70" y1="100" x2="54" y2="96" stroke={c.line} strokeWidth="1.2" />
            <line x1="70" y1="104" x2="52" y2="106" stroke={c.line} strokeWidth="1.2" />
            <line x1="130" y1="100" x2="146" y2="96" stroke={c.line} strokeWidth="1.2" />
            <line x1="130" y1="104" x2="148" y2="106" stroke={c.line} strokeWidth="1.2" />
          </>
        )}
        {sp === 'dog' && (
          <>
            <g transform={`rotate(${20 + earRot} 68 70)`}>
              <ellipse cx="64" cy="86" rx="12" ry="22" fill={c.ear} />
            </g>
            <g transform={`rotate(${-20 - earRot} 132 70)`}>
              <ellipse cx="136" cy="86" rx="12" ry="22" fill={c.ear} />
            </g>
            <ellipse cx="100" cy="86" rx={34 + f.cheek * 0.05} ry="28" fill={c.body} />
            <ellipse cx="100" cy={104 + muzzle * 0.15} rx={muzzle + 4} ry={muzzle * 0.7} fill={c.accent} />
          </>
        )}
        {sp === 'rabbit' && (
          <>
            <g transform={`rotate(${-12 - earRot} 78 40)`}>
              <ellipse cx="78" cy="28" rx="9" ry="32" fill={c.body} />
              <ellipse cx="78" cy="30" rx="4" ry="22" fill={c.ear} />
            </g>
            <g transform={`rotate(${12 + earRot} 122 40)`}>
              <ellipse cx="122" cy="28" rx="9" ry="32" fill={c.body} />
              <ellipse cx="122" cy="30" rx="4" ry="22" fill={c.ear} />
            </g>
            <ellipse cx="100" cy="90" rx={30 + f.cheek * 0.06} ry="26" fill={c.body} />
          </>
        )}
        {sp === 'panda' && (
          <>
            <ellipse cx="68" cy="58" rx="12" ry="14" fill={c.ear} />
            <ellipse cx="132" cy="58" rx="12" ry="14" fill={c.ear} />
            <ellipse cx="100" cy="86" rx="36" ry="30" fill={c.body} />
            <ellipse cx={lx} cy={eyeY} rx={eyeS + 8} ry={eyeS + 7} fill={c.ear} />
            <ellipse cx={rx} cy={eyeY} rx={eyeS + 8} ry={eyeS + 7} fill={c.ear} />
          </>
        )}
        {sp === 'deer' && (
          <>
            <path d="M74 50 L66 18 L80 48" stroke={c.line} strokeWidth="3" fill="none" />
            <path d="M126 50 L134 18 L120 48" stroke={c.line} strokeWidth="3" fill="none" />
            <ellipse cx="74" cy="62" rx="8" ry="10" fill={c.body} />
            <ellipse cx="126" cy="62" rx="8" ry="10" fill={c.body} />
            <ellipse cx="100" cy="88" rx={32 + f.cheek * 0.05} ry="26" fill={c.body} />
            <ellipse cx="100" cy={104 + muzzle * 0.1} rx={muzzle + 3} ry={muzzle * 0.55} fill={c.accent} />
          </>
        )}
        {sp === 'penguin' && (
          <>
            <ellipse cx="100" cy="86" rx="32" ry="28" fill={c.body} />
            <ellipse cx="100" cy="92" rx="22" ry="18" fill={c.accent} />
          </>
        )}
        {sp === 'bear' && (
          <>
            <ellipse cx="68" cy="60" rx="12" ry="12" fill={c.body} />
            <ellipse cx="132" cy="60" rx="12" ry="12" fill={c.body} />
            <ellipse cx="68" cy="60" rx="6" ry="6" fill={c.ear} />
            <ellipse cx="132" cy="60" rx="6" ry="6" fill={c.ear} />
            <ellipse cx="100" cy="86" rx={34 + f.cheek * 0.05} ry="28" fill={c.body} />
            <ellipse cx="100" cy={102} rx="10" ry="8" fill={c.accent} />
          </>
        )}

        <ellipse cx={lx - 2} cy={eyeY + 6} rx={cheek} ry={cheek * 0.55} fill="#e89" opacity="0.32" />
        <ellipse cx={rx + 2} cy={eyeY + 6} rx={cheek} ry={cheek * 0.55} fill="#e89" opacity="0.32" />

        <Eyes kind={kind} lx={lx} rx={rx} y={eyeY} s={sp === 'owl' || sp === 'panda' ? eyeS + 2 : eyeS} />

        {sp === 'owl' ? (
          <polygon points={`100,${96 + muzzle * 0.08} 92,88 108,88`} fill="#d4a24a" />
        ) : sp === 'penguin' ? (
          <polygon points="100,100 92,92 108,92" fill={c.extra} />
        ) : (
          <circle cx="100" cy={sp === 'fox' ? 98 : 99 + muzzle * 0.05} r={sp === 'rabbit' ? 2.4 : 3.1} fill="#3a2a20" />
        )}
        <Mouth expr={props.expression} x={100} y={sp === 'owl' ? 108 : 110} line={c.line} />
        {props.expression === 'missSoft' && (
          <text x="154" y="46" fontSize="16">
            💭
          </text>
        )}
      </g>

      <Headwear id={props.headwearId} />
      <Clothes id={clothesId} tint={tint} />
      <Shoes id={props.shoesId} />
    </svg>
  )
}
