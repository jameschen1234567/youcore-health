// 量鞋墊：長度 → 依長度算出量測位置 → 逐一填寬度
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { saveInsole } from '../lib/api'
import { INSOLE_SIDE_LABELS, RANGES, checkWidths, insolePoints, insoleWarnings, parseCm, toCm } from '../lib/foot'
import { InsoleGuide } from '../components/FootGuides'

export default function InsoleMeasure() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [note, setNote] = useState('')
  const [side, setSide] = useState('both')
  const [len, setLen] = useState('')
  const [w, setW] = useState({})
  const [err, setErr] = useState('')
  const [warn, setWarn] = useState(null)
  const [busy, setBusy] = useState(false)

  const parsed = parseCm(len, RANGES.length, '鞋墊長度')
  const points = parsed.mm ? insolePoints(parsed.mm) : []

  async function submit() {
    setErr('')
    if (parsed.error) return setErr(parsed.error)
    const widths = []
    for (const [i, p] of points.entries()) {
      const r = parseCm(w[i], RANGES.insoleWidth, `距腳跟 ${toCm(p)} 公分的寬度`)
      if (r.error) return setErr(r.error)
      widths.push([p, r.mm])
    }
    const c = checkWidths(widths, parsed.mm)
    if (c.error) return setErr(c.error)
    const warnings = insoleWarnings(widths)
    if (warnings.length && !warn) return setWarn(warnings)
    setBusy(true)
    try {
      await saveInsole(profile.id, { side, length_mm: parsed.mm, widths, note: note.trim() || null })
      navigate('/foot?new=1')
    } catch { setErr('儲存失敗，請稍後再試'); setBusy(false) }
  }

  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/foot')}>‹ 足部與鞋墊</button>
      <h1>量鞋墊</h1>
      <InsoleGuide />
      <section className="card">
        <div className="form-grid">
          <label className="small">哪一雙鞋（選填）<input className="search" maxLength={100} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：平常上班的布鞋" /></label>
          <label className="small">量的是哪一腳
            <select value={side} onChange={(e) => setSide(e.target.value)}>
              {['both', 'left', 'right'].map((s) => <option key={s} value={s}>{INSOLE_SIDE_LABELS[s]}</option>)}
            </select>
          </label>
          <label className="small">1. 鞋墊長度（公分）
            {/* 改長度會改變量測位置，舊的寬度要清掉 */}
            <input className="search" inputMode="decimal" value={len} onChange={(e) => { setLen(e.target.value); setW({}); setWarn(null) }} placeholder="例如 25.5" />
          </label>
        </div>
        {len && parsed.error && <p className="muted small">{parsed.error}</p>}
        {points.length > 0 && (
          <>
            <p className="small"><b>2. 在這些位置做記號，量寬度（公分）</b></p>
            <p className="muted small">距離都從<b>腳跟最後面</b>量起，沿著鞋墊的中線。</p>
            <div className="form-grid two-col">
              {points.map((p, i) => (
                <label key={p} className="small">距腳跟 {toCm(p)} 公分
                  <input className="search" inputMode="decimal" value={w[i] ?? ''} placeholder="寬度" aria-label={`距腳跟 ${toCm(p)} 公分的寬度`}
                    onChange={(e) => { setWarn(null); setW((x) => ({ ...x, [i]: e.target.value })) }} />
                </label>
              ))}
            </div>
          </>
        )}
        {warn?.map((x) => <p key={x} className="banner warn">{x}</p>)}
        {err && <p className="error small" role="alert">{err}</p>}
        <button className="btn primary block" disabled={busy || !points.length} onClick={submit}>{busy ? '儲存中…' : warn ? '確認沒錯，儲存' : '儲存'}</button>
      </section>
    </main>
  )
}
