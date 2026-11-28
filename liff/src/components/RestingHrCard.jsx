// 客戶端：今日安靜心跳（自己看手錶／手機 App 填，一天一筆）＋ 趨勢圖
import { useState } from 'react'
import { REST_RANGE, saveRestingHr } from '../lib/heart'
import { fmtDay, toDate, todayTaipei } from '../lib/training'
import LineChart from './LineChart'

export default function RestingHrCard({ profileId, rows, onSaved }) {
  const today = todayTaipei()
  const mine = rows.find((r) => r.measured_on === today)
  const [editing, setEditing] = useState(!mine)
  const [v, setV] = useState(mine?.bpm ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const recent = rows.slice(-30)
  const avg7 = (() => {
    const last = rows.slice(-7)
    return last.length >= 3 ? Math.round(last.reduce((a, r) => a + r.bpm, 0) / last.length) : null
  })()

  async function save() {
    const n = Number(v)
    if (!Number.isInteger(n) || n < REST_RANGE[0] || n > REST_RANGE[1]) return setErr(`請填 ${REST_RANGE[0]}～${REST_RANGE[1]} 的整數`)
    setBusy(true); setErr('')
    try { await saveRestingHr(profileId, today, n); await onSaved(); setEditing(false) }
    catch { setErr('儲存失敗，請稍後再試') }
    finally { setBusy(false) }
  }

  return (
    <section className="card">
      <h2>今日安靜心跳</h2>
      {editing || !mine ? (
        <>
          <div className="rhr-form">
            <input className="search" type="number" inputMode="numeric" min={REST_RANGE[0]} max={REST_RANGE[1]}
              value={v} onChange={(e) => setV(e.target.value)} placeholder="例如 62" aria-label="今日安靜心跳（bpm）" />
            <span className="muted">bpm</span>
            <button className="btn primary" disabled={busy || v === ''} onClick={save}>{busy ? '儲存中…' : '記錄'}</button>
            {mine && <button className="btn ghost" disabled={busy} onClick={() => { setEditing(false); setV(mine.bpm) }}>取消</button>}
          </div>
          {err && <p className="error small">{err}</p>}
        </>
      ) : (
        <p className="stat">
          <span className="big-num">{mine.bpm}<small> bpm</small></span>
          {mine.source === 'shortcut' && <span className="delta neutral">iPhone 自動</span>}
          {avg7 != null && <span className="delta neutral">近 7 筆平均 {avg7}</span>}
          <button className="link-btn" onClick={() => setEditing(true)}>修改</button>
        </p>
      )}
      {recent.length >= 2 && (
        <LineChart auto unit=" bpm" label="安靜心跳趨勢圖"
          series={[{ key: 'rhr', label: '安靜心跳', color: 'var(--brand)', points: recent.map((r) => ({ x: toDate(r.measured_on), y: r.bpm })) }]} />
      )}
      {recent.length >= 2 && <p className="muted small">最近 {recent.length} 筆（{fmtDay(recent[0].measured_on)} 起）。比平常高 5～10 下，常常是沒睡好、壓力大或還沒恢復，上課時跟教練說一聲。</p>}
      <details className="toggle">
        <summary className="small">安靜心跳在哪裡看？</summary>
        <ul className="small">
          <li><b>Apple Watch／iPhone</b>：「健康」App → 瀏覽 → 心臟 → 靜止心率</li>
          <li><b>Garmin</b>：Garmin Connect → 健康統計 → 心率 → 靜止心率</li>
          <li><b>小米／Zepp</b>：首頁 → 心率 → 靜息心率</li>
          <li><b>華為</b>：運動健康 → 心率 → 靜息心率</li>
          <li><b>沒有手錶</b>：早上起床前躺著，摸手腕脈搏數 30 秒 × 2</li>
        </ul>
        <p className="muted small">每天早上起床後看最準。填的數字會自動帶進當天的訓練紀錄，讓教練推估你上課的強度。</p>
      </details>
    </section>
  )
}
