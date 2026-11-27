// 每週訓練量長條圖（近 8 週，最後一根是本週）
export default function WeeklyBars({ weeks, label = '近 8 週訓練量' }) {
  const max = Math.max(1, ...weeks.map((w) => w.load))
  const W = 320
  const H = 120
  const pad = { l: 4, r: 4, t: 16, b: 20 }
  const bw = (W - pad.l - pad.r) / weeks.length
  const fmt = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {weeks.map((w, i) => {
          const h = ((H - pad.t - pad.b) * w.load) / max
          const x = pad.l + i * bw + bw * 0.15
          const y = H - pad.b - h
          const last = i === weeks.length - 1
          return (
            <g key={w.week}>
              <rect x={x} y={y} width={bw * 0.7} height={Math.max(h, w.load ? 2 : 0)} rx="3" fill={last ? 'var(--brand)' : 'var(--accent)'}>
                <title>{`${fmt(w.week)} 起：${w.load}（${w.count} 次、${w.minutes} 分）`}</title>
              </rect>
              {w.load > 0 && <text x={x + bw * 0.35} y={y - 3} className="tick" textAnchor="middle">{w.load}</text>}
              {(i === 0 || last || i === Math.floor(weeks.length / 2)) && (
                <text x={x + bw * 0.35} y={H - 5} className="tick" textAnchor="middle">{last ? '本週' : fmt(w.week)}</text>
              )}
            </g>
          )
        })}
      </svg>
    </figure>
  )
}
