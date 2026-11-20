// 輕量趨勢折線圖（不引入圖表套件）。series: [{ key, label, color, points: [{x: Date, y: number|null}] }]
export default function LineChart({ series, yMax = 100, height = 180 }) {
  const all = series.flatMap((s) => s.points)
  if (all.length === 0) return null
  const W = 320
  const H = height
  const pad = { l: 30, r: 12, t: 12, b: 26 }
  const xs = all.map((p) => +p.x)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const sx = (x) => (x1 === x0 ? (pad.l + W - pad.r) / 2 : pad.l + ((+x - x0) / (x1 - x0)) * (W - pad.l - pad.r))
  const sy = (y) => pad.t + (1 - y / yMax) * (H - pad.t - pad.b)
  const ticks = [0, yMax / 2, yMax]
  const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="分數趨勢圖">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} className="grid" />
            <text x={pad.l - 6} y={sy(t) + 4} className="tick" textAnchor="end">{t}</text>
          </g>
        ))}
        {[all[0], all[all.length - 1]].map((p, i) => (
          <text key={i} x={sx(p.x)} y={H - 6} className="tick" textAnchor={i === 0 && x1 !== x0 ? 'start' : 'end'}>{fmt(p.x)}</text>
        ))}
        {series.map((s) => {
          const pts = s.points.filter((p) => p.y != null)
          return (
            <g key={s.key}>
              {pts.length > 1 && (
                <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
                  points={pts.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')} />
              )}
              {pts.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="1.5" />)}
            </g>
          )
        })}
      </svg>
      {series.length > 1 && (
        <figcaption className="legend">
          {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
        </figcaption>
      )}
    </figure>
  )
}
