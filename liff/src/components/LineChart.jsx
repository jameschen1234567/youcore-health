// 輕量趨勢折線圖（不引入圖表套件）。series: [{ key, label, color, points: [{x: Date, y: number|null}] }]
// series 可加 dashed: true 畫虛線（例如目標線，不畫點）
// auto=true 時依資料自動決定 Y 軸範圍（體重、1RM 等不從 0 開始的數值用）
export default function LineChart({ series, yMax: yMaxProp = 100, yMin: yMinProp = 0, auto = false, height = 180, label = '分數趨勢圖', unit = '' }) {
  const all = series.flatMap((s) => s.points)
  if (all.length === 0) return null
  const [yMin, yMax] = auto ? autoRange(all.map((p) => p.y).filter((y) => y != null)) : [yMinProp, yMaxProp]
  const W = 320
  const H = height
  const pad = { l: 30, r: 12, t: 12, b: 26 }
  const xs = all.map((p) => +p.x)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const sx = (x) => (x1 === x0 ? (pad.l + W - pad.r) / 2 : pad.l + ((+x - x0) / (x1 - x0)) * (W - pad.l - pad.r))
  const sy = (y) => pad.t + (1 - (y - yMin) / (yMax - yMin)) * (H - pad.t - pad.b)
  const ticks = [yMin, (yMin + yMax) / 2, yMax]
  const fmtY = (t) => `${Math.round(t * 10) / 10}`
  const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} className="grid" />
            <text x={pad.l - 6} y={sy(t) + 4} className="tick" textAnchor="end">{fmtY(t)}</text>
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
                <polyline fill="none" stroke={s.color} strokeWidth={s.dashed ? 2 : 2.5} strokeLinejoin="round" strokeLinecap="round"
                  strokeDasharray={s.dashed ? '6 5' : undefined}
                  points={pts.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')} />
              )}
              {!s.dashed && pts.map((p, i) => (
                <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="1.5">
                  <title>{`${fmt(p.x)}：${p.y}${unit}`}</title>
                </circle>
              ))}
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

/** 依資料決定 Y 軸範圍：上下留 10% 空間，取整數 */
export function autoRange(ys) {
  if (ys.length === 0) return [0, 100]
  let lo = Math.min(...ys)
  let hi = Math.max(...ys)
  const span = hi - lo || Math.max(Math.abs(hi) * 0.1, 1)
  lo = Math.floor(lo - span * 0.1)
  hi = Math.ceil(hi + span * 0.1)
  if (lo < 0 && Math.min(...ys) >= 0) lo = 0
  return [lo, hi]
}
