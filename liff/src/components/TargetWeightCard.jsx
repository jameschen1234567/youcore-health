// 客戶端：目標體重（會員限定）— 進度用店內量的體重
import { useState } from 'react'
import { saveTarget, weightProgress } from '../lib/selfTraining'
import { fmtDay } from '../lib/training'

export default function TargetWeightCard({ profileId, target, bodyRows, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [kg, setKg] = useState(target?.target_weight_kg ?? '')
  const [date, setDate] = useState(target?.target_date ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const prog = weightProgress(bodyRows, target?.target_weight_kg)

  async function save(clear = false) {
    setBusy(true); setErr('')
    try { await saveTarget(profileId, clear ? '' : kg, date); setEditing(false); await onSaved() }
    catch (e) { setErr(e.message === 'BAD_TARGET' ? '目標體重請填 30～250 kg' : '儲存失敗，請稍後再試') }
    finally { setBusy(false) }
  }

  return (
    <section className="card">
      <div className="row spread head-row">
        <h2>目標體重</h2>
        {!editing && <button className="link-btn" onClick={() => { setKg(target?.target_weight_kg ?? ''); setDate(target?.target_date ?? ''); setEditing(true) }}>{prog ? '修改' : '設定'}</button>}
      </div>
      {editing ? (
        <>
          <div className="form-grid two-col">
            <label className="small">目標體重（kg）<input className="search" type="number" inputMode="decimal" step="0.1" min="30" max="250" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="例如 75" /></label>
            <label className="small">目標日期（選填）<input className="search" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          </div>
          {err && <p className="error small">{err}</p>}
          <div className="row">
            {target?.target_weight_kg != null && <button className="btn ghost" disabled={busy} onClick={() => save(true)}>清除目標</button>}
            <button className="btn ghost" disabled={busy} onClick={() => setEditing(false)}>取消</button>
            <button className="btn primary" disabled={busy || kg === ''} onClick={() => save()}>{busy ? '儲存中…' : '儲存'}</button>
          </div>
        </>
      ) : !prog ? (
        <p className="muted small">設定一個目標體重，進度會用教練在店裡幫你量的體重來計算。</p>
      ) : prog.current == null ? (
        <p className="small">目標 <b>{prog.target} kg</b>{target.target_date && `（${fmtDay(target.target_date)}）`}｜下次到店量體重後就會開始計算進度。</p>
      ) : (
        <>
          <p className="small">
            目前 <b>{prog.current} kg</b> → 目標 <b>{prog.target} kg</b>
            {target.target_date && `（${fmtDay(target.target_date)}）`}
          </p>
          {prog.reached
            ? <p className="good-text"><b>🎉 已達成目標！</b></p>
            : <p className="small">還差 <b>{Math.abs(prog.remaining)} kg</b>（{prog.remaining > 0 ? '要減' : '要增'}）</p>}
          <div className="progress" aria-label={`完成 ${prog.pct}%`}><div style={{ width: `${prog.pct}%` }} /></div>
          <p className="muted small">從第一次量測 {prog.start} kg 起完成 {prog.pct}%｜最新量測 {fmtDay(prog.measured_on)}（店內）</p>
        </>
      )}
    </section>
  )
}
