// 在側面照上依序標 5 個點；拖曳時另一側上方顯示放大鏡
import { useEffect, useRef, useState } from 'react'
import { POINTS } from '../lib/archModel'

const COLORS = { heel: '#C9A96E', toe: '#C9A96E', mall: '#4A90D9', nav: '#E04F4F', mt1: '#4A90D9' }

/** points 為圖片像素座標 */
export function ArchOverlay({ points, w, h, active }) {
  const u = w / 400
  return (
    <svg className="arch-overlay" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {points.heel && points.toe && <line x1={points.heel[0]} y1={points.heel[1]} x2={points.toe[0]} y2={points.toe[1]} stroke="#C9A96E" strokeWidth={1.5 * u} strokeDasharray={`${5 * u} ${4 * u}`} />}
      {points.mall && points.mt1 && <line x1={points.mall[0]} y1={points.mall[1]} x2={points.mt1[0]} y2={points.mt1[1]} stroke="#4A90D9" strokeWidth={1.5 * u} />}
      {POINTS.map(([k], i) => points[k] && (
        <g key={k} transform={`translate(${points[k][0]} ${points[k][1]})`}>
          <circle r={(active === k ? 9 : 6) * u} fill="none" stroke="#fff" strokeWidth={4 * u} />
          <circle r={(active === k ? 9 : 6) * u} fill="none" stroke={COLORS[k]} strokeWidth={2 * u} />
          <circle r={1.5 * u} fill={COLORS[k]} />
          <text x={10 * u} y={-8 * u} fontSize={13 * u} fontWeight="700" fill="#fff" stroke="#1C2B1A" strokeWidth={3 * u} paintOrder="stroke">{i + 1}</text>
        </g>
      ))}
    </svg>
  )
}

export default function ArchMarker({ src, points, onChange, onSize }) {
  const [size, setSize] = useState(null)
  const [active, setActive] = useState(POINTS.find(([k]) => !points[k])?.[0] ?? 'nav')
  const [drag, setDrag] = useState(null)
  const box = useRef(null)
  const img = useRef(null)
  const loupe = useRef(null)

  useEffect(() => {
    if (!drag || !loupe.current || !img.current) return
    const c = loupe.current.getContext('2d')
    const r = size.w / 14
    c.fillStyle = '#1C2B1A'
    c.fillRect(0, 0, 110, 110)
    c.drawImage(img.current, drag[0] - r, drag[1] - r, r * 2, r * 2, 0, 0, 110, 110)
    c.strokeStyle = '#E04F4F'
    c.beginPath(); c.moveTo(55, 35); c.lineTo(55, 75); c.moveTo(35, 55); c.lineTo(75, 55); c.stroke()
  }, [drag, size])

  const at = (e) => {
    const b = box.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(size.w, ((e.clientX - b.left) / b.width) * size.w))
    const y = Math.max(0, Math.min(size.h, ((e.clientY - b.top) / b.height) * size.h))
    return [Math.round(x), Math.round(y)]
  }
  const move = (e) => { const p = at(e); setDrag(p); onChange({ ...points, [active]: p }) }
  const up = () => {
    setDrag(null)
    const next = POINTS.find(([k]) => k !== active && !points[k])
    if (next) setActive(next[0])
  }

  return (
    <div className="arch-marker">
      <p className="small"><b>{POINTS.findIndex(([k]) => k === active) + 1}／5 請點：{POINTS.find(([k]) => k === active)[1]}</b></p>
      <div ref={box} className="arch-box" onPointerDown={(e) => { if (size) { e.currentTarget.setPointerCapture?.(e.pointerId); move(e) } }}
        onPointerMove={(e) => drag && move(e)} onPointerUp={up} onPointerCancel={() => setDrag(null)}>
        <img ref={img} src={src} alt="腳的內側照片" draggable="false" onLoad={(e) => { const s = { w: e.target.naturalWidth, h: e.target.naturalHeight }; setSize(s); onSize?.(s) }} />
        {size && <ArchOverlay points={points} w={size.w} h={size.h} active={active} />}
        {drag && <canvas ref={loupe} className={`arch-loupe ${drag[0] < size.w / 2 ? "right" : ""}`} width="110" height="110" />}
      </div>
      <div className="chips">
        {POINTS.map(([k], i) => <button key={k} type="button" className={`chip ${active === k ? 'on' : ''}`} onClick={() => setActive(k)}>{points[k] ? '✓ ' : ''}{i + 1}</button>)}
      </div>
      <p className="muted small">按住可以拖曳微調，點下面的數字可以重標那一點。</p>
    </div>
  )
}
