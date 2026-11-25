// 後台：到店量測輸入（足部、鞋墊）與鞋墊紀錄
import { useState } from 'react'
import FeetForm from '../../components/FeetForm'
import { deleteInsole, saveFeet, saveInsole } from '../../lib/api'
import { INSOLE_SIDE_LABELS, RANGES, SOURCE_LABELS, insolePoints, insoleWarnings, parseCm, parseWidths, toCm, widthsToText } from '../../lib/foot'
import { fmtDate } from '../../lib/format'

export function FeetEntry({ profileId, onSaved }) {
  const [open, setOpen] = useState(false)
  if (!open) return <button className="btn ghost block" onClick={() => setOpen(true)}>＋ 到店量腳</button>
  return (
    <div>
      <FeetForm onSave={async (feet) => { await saveFeet(profileId, feet, 'onsite'); setOpen(false); onSaved() }} />
      <button className="btn ghost block" onClick={() => setOpen(false)}>返回</button>
    </div>
  )
}

export function InsolePanel({ profileId, rows, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="card">
      <h2>鞋墊尺寸（{rows.length} 筆）</h2>
      {rows.length === 0 && <p className="muted">還沒有鞋墊尺寸</p>}
      <ul className="foot-rows">{[...rows].reverse().map((r) => <InsoleRow key={r.id} r={r} onChange={onChange} />)}</ul>
      {open
        ? <InsoleForm onCancel={() => setOpen(false)} onSave={async (row) => { await saveInsole(profileId, row, 'onsite'); setOpen(false); onChange() }} />
        : <button className="btn ghost block" onClick={() => setOpen(true)}>＋ 到店量鞋墊</button>}
    </section>
  )
}

function InsoleRow({ r, onChange }) {
  const [msg, setMsg] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(widthsToText(r.widths)); setMsg('已複製寬度點，可貼進鞋墊製作 App') } catch { setMsg('無法複製') }
  }
  const del = async () => {
    setBusy(true)
    try { await deleteInsole(r.id); onChange() } catch { setMsg('刪除失敗'); setBusy(false) }
  }
  return (
    <li>
      <div className="foot-row-head">
        <span><b>{INSOLE_SIDE_LABELS[r.side]}</b> 長 {toCm(r.length_mm)} cm｜{SOURCE_LABELS[r.source]}{r.note && `｜${r.note}`}</span>
        <span className="muted small">{fmtDate(r.created_at)}</span>
      </div>
      <p className="muted small">距腳跟:寬（mm）{r.widths.map(([p, w]) => `${p}:${w}`).join('、')}</p>
      <div className="row">
        <button className="link-btn" onClick={copy}>複製寬度點</button>
        {!confirm && <button className="link-btn danger-text" onClick={() => setConfirm(true)}>刪除</button>}
      </div>
      {confirm && (
        <div className="row confirm-row">
          <span className="small">確定刪除這筆？無法復原。</span>
          <button className="btn ghost" disabled={busy} onClick={() => setConfirm(false)}>取消</button>
          <button className="btn danger" disabled={busy} onClick={del}>確定刪除</button>
        </div>
      )}
      {msg && <p className="muted small">{msg}</p>}
    </li>
  )
}

function InsoleForm({ onSave, onCancel }) {
  const [side, setSide] = useState('both')
  const [len, setLen] = useState('')
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [warn, setWarn] = useState(null)
  const [busy, setBusy] = useState(false)
  const parsed = parseCm(len, RANGES.length, '鞋墊長度')

  async function submit() {
    setErr('')
    if (parsed.error) return setErr(parsed.error)
    const r = parseWidths(text, parsed.mm)
    if (r.error) return setErr(r.error)
    const warnings = insoleWarnings(r.widths)
    if (warnings.length && !warn) return setWarn(warnings)
    setBusy(true)
    try { await onSave({ side, length_mm: parsed.mm, widths: r.widths, note: note.trim() || null }) } catch { setErr('儲存失敗，請稍後再試'); setBusy(false) }
  }

  return (
    <div className="form-grid">
      <label className="small">腳別
        <select value={side} onChange={(e) => setSide(e.target.value)}>
          {['both', 'left', 'right'].map((s) => <option key={s} value={s}>{INSOLE_SIDE_LABELS[s]}</option>)}
        </select>
      </label>
      <label className="small">鞋墊長度（公分）<input className="search" inputMode="decimal" value={len} onChange={(e) => setLen(e.target.value)} placeholder="例如 25.5" /></label>
      {parsed.mm && <p className="muted small">建議位置（距腳跟 mm）：{insolePoints(parsed.mm).join('、')}，也可以自己決定位置。</p>}
      <label className="small">寬度點：每行「距腳跟 mm、寬度 mm」
        <textarea rows={7} value={text} onChange={(e) => { setText(e.target.value); setWarn(null) }} placeholder={'25  58\n80  74\n…'} />
      </label>
      <label className="small">鞋款備註<input className="search" maxLength={100} value={note} onChange={(e) => setNote(e.target.value)} placeholder="選填" /></label>
      {warn?.map((x) => <p key={x} className="banner warn">{x}</p>)}
      {err && <p className="error small">{err}</p>}
      <div className="row">
        <button className="btn ghost" disabled={busy} onClick={onCancel}>返回</button>
        <button className="btn primary" disabled={busy} onClick={submit}>{warn ? '確認沒錯，儲存' : '儲存'}</button>
      </div>
    </div>
  )
}
