// 左右腳三個數字的表單（客戶自己量與後台到店量共用）
import { useState } from 'react'
import { RANGES, footWarnings, parseCm } from '../lib/foot'

const FIELDS = [['length', '足長', RANGES.length, '例如 24.5'], ['width', '前掌寬', RANGES.width, '例如 9.6'], ['heel', '腳跟寬', RANGES.heel, '例如 6.2']]
const SIDES = [['left', '左腳'], ['right', '右腳']]
const empty = { left: {}, right: {} }

export default function FeetForm({ onSave }) {
  const [f, setF] = useState(empty)
  const [err, setErr] = useState('')
  const [warn, setWarn] = useState(null) // 有提醒時要再按一次確認
  const [busy, setBusy] = useState(false)
  const set = (side, k) => (e) => { setWarn(null); setF((x) => ({ ...x, [side]: { ...x[side], [k]: e.target.value } })) }

  async function submit() {
    setErr('')
    const feet = []
    const warnings = []
    for (const [side, label] of SIDES) {
      if (FIELDS.every(([k]) => !f[side][k]?.trim())) continue // 整隻腳沒填 → 只存另一隻
      const v = {}
      for (const [k, name, range] of FIELDS) {
        const r = parseCm(f[side][k], range, `${label}${name}`)
        if (r.error) return setErr(r.error)
        v[k] = r.mm
      }
      warnings.push(...footWarnings(v).map((w) => `${label}：${w}`))
      feet.push({ side, length_mm: v.length, width_mm: v.width, heel_width_mm: v.heel })
    }
    if (!feet.length) return setErr('請至少填一隻腳')
    if (warnings.length && !warn) return setWarn(warnings)
    setBusy(true)
    try { await onSave(feet); setF(empty); setWarn(null) } catch { setErr('儲存失敗，請稍後再試') } finally { setBusy(false) }
  }

  return (
    <>
      <p className="muted small">單位都是<b>公分</b>，量到小數一位。只量一隻腳也可以先存。</p>
      {SIDES.map(([side, label]) => (
        <fieldset key={side} className="plain">
          <legend><b>{label}</b></legend>
          <div className="form-grid two-col">
            {FIELDS.map(([k, name, , ph]) => (
              <label key={k} className="small">{name}（公分）
                <input className="search" inputMode="decimal" value={f[side][k] ?? ''} onChange={set(side, k)} placeholder={ph} aria-label={`${label}${name}`} />
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {warn?.map((w) => <p key={w} className="banner warn">{w}</p>)}
      {err && <p className="error small" role="alert">{err}</p>}
      <button className="btn primary block" disabled={busy} onClick={submit}>{busy ? '儲存中…' : warn ? '確認沒錯，儲存' : '儲存'}</button>
    </>
  )
}
