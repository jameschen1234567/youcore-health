// 可點選的人體分區圖；顏色深淺代表疼痛分數
import { BODY_VIEWS } from '../lib/bodyRegions'

// 0 分不上色；1–10 從淡金到深紅
export function heatColor(v) {
  if (!v) return 'var(--body)'
  const t = (v - 1) / 9
  const hue = 40 - 32 * t // 40（金）→ 8（紅）
  const light = 72 - 30 * t
  return `hsl(${hue} 70% ${light}%)`
}

function Shape({ s, ...props }) {
  if (s.type === 'circle') return <circle cx={s.cx} cy={s.cy} r={s.r} {...props} />
  if (s.type === 'ellipse') return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...props} />
  return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={Math.min(s.w, s.h) / 2.4} {...props} />
}

export default function BodyMap({ view, values, selected, onSelect }) {
  const sideNote = view === 'front' ? ['右', '左'] : ['左', '右']
  return (
    <figure className="bodymap">
      <svg viewBox="0 0 200 420" role="group" aria-label={view === 'front' ? '身體正面' : '身體背面'}>
        {BODY_VIEWS[view].map((r) => (
          <Shape key={r.key} s={r.shape}
            className={`region ${selected === r.key ? 'selected' : ''}`}
            fill={heatColor(values[r.key])}
            role="button" tabIndex={0} aria-label={`${r.label}${values[r.key] ? `，${values[r.key]} 分` : ''}`}
            onClick={() => onSelect(r.key)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(r.key))} />
        ))}
      </svg>
      <figcaption className="side-note">
        <span>{sideNote[0]}</span>
        <span>{view === 'front' ? '正面' : '背面'}</span>
        <span>{sideNote[1]}</span>
      </figcaption>
    </figure>
  )
}
