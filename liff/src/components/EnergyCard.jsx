// 客戶端：熱量收支（會員＋個別開放）— 填手機步數／活動熱量；基礎代謝＋活動 vs 飲食攝取；近 7 天
import { useCallback, useEffect, useState } from 'react'
import {
  MAX_BACK_DAYS, coachSessionKcal, dayBalance, latestWeight, listActivity, mifflin, saveActivity, selfWorkoutKcal,
  todayTaipei, validateActivity,
} from '../lib/energy'
import { listSelfWorkouts, KINDS } from '../lib/selfTraining'
import { dayTotals, listFoodLogs } from '../lib/diet'

const addDays = (d, n) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
const fmt = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`
const GENDER = { male: '男', female: '女' }

export default function EnergyCard({ profile, body, sessions, info, age, readOnly = false }) {
  const today = todayTaipei()
  const from = addDays(today, -6 - MAX_BACK_DAYS)
  const [day, setDay] = useState(today)
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [showHow, setShowHow] = useState(false)

  const reload = useCallback(() => Promise.all([listActivity(profile.id, from), listSelfWorkouts(profile.id), listFoodLogs(profile.id, from)])
    .then(([activity, selfW, food]) => setD({ activity, selfW, food })).catch(() => setErr('熱量資料載入失敗')), [profile.id, from])
  useEffect(() => { reload() }, [reload])

  const w = latestWeight(body)
  const bmr = mifflin({ weight_kg: w?.kg, height_cm: info?.height_cm, age, gender: info?.gender })
  const calc = (dd) => {
    const workouts = [
      ...(sessions ?? []).filter((s) => s.session_date === dd).map((s) => ({ name: '教練課', min: s.duration_min, ...(coachSessionKcal(s, w?.kg) ?? { kcal: null }) })),
      ...(d?.selfW ?? []).filter((x) => x.done_on === dd).map((x) => ({ name: KINDS[x.kind], min: x.duration_min, ...(selfWorkoutKcal(x, w?.kg) ?? { kcal: null }) })),
    ]
    const foods = (d?.food ?? []).filter((f) => f.eaten_on === dd)
    const activity = (d?.activity ?? []).find((a) => a.day === dd)
    return { ...dayBalance({ bmr, intake: foods.length ? dayTotals(foods).kcal : null, activity, workouts }), workouts, activity }
  }
  const cur = d ? calc(day) : null
  const series = d ? Array.from({ length: 7 }, (_, i) => { const dd = addDays(today, -6 + i); return { day: dd, ...calc(dd) } }) : []

  return (
    <section className="card">
      <div className="row spread head-row">
        <h2>{day === today ? '今日熱量收支' : `${fmt(day)} 熱量收支`}</h2>
        <input className="search day-pick" type="date" value={day} min={addDays(today, -MAX_BACK_DAYS)} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="選擇日期" />
      </div>
      {err && <p className="error small">{err}</p>}
      {d && readOnly && <p className="muted small">手機資料：{cur.activity ? `步數 ${cur.activity.steps ?? '—'}｜活動熱量 ${cur.activity.active_kcal ?? '—'}${cur.activity.source === 'shortcut' ? '（iPhone 自動）' : '（手填）'}` : '這天沒填'}</p>}
      {d && !readOnly && <ActivityForm key={day} day={day} cur={cur.activity} profileId={profile.id} onSaved={reload} />}

      {cur && (
        <>
          <div className="energy-grid">
            <div><span className="muted small">攝取</span><b>{cur.intake ?? '—'}</b></div>
            <div><span className="muted small">消耗</span><b>{cur.burn ?? '—'}</b></div>
            <div><span className="muted small">差額</span><b className={cur.balance == null ? '' : cur.balance > 0 ? 'danger-text' : 'good-text'}>
              {cur.balance == null ? '—' : `${cur.balance > 0 ? '+' : ''}${cur.balance}`}</b></div>
          </div>
          {cur.balance != null && <p className="small center">{cur.balance > 0 ? '熱量盈餘（吃的比消耗多）' : '熱量赤字（消耗比吃的多）'}</p>}
          {cur.intake == null && <p className="muted small">這天還沒記飲食，記了才算得出差額。</p>}
          {bmr == null && <p className="muted small">{!w ? '還沒有店內量測的體重，' : ''}{!info?.height_cm ? '還沒填身高，' : ''}{age == null ? '還沒填生日，' : ''}{!GENDER[info?.gender] ? '基礎代謝公式只分男女，' : ''}暫時算不出基礎代謝。</p>}

          <button className="link-btn small" onClick={() => setShowHow(!showHow)}>怎麼算的？{showHow ? '▾' : '▸'}</button>
          {showHow && (
            <ul className="small how-list">
              <li>基礎代謝 {bmr ?? '—'} 大卡：Mifflin-St Jeor 公式{bmr != null && `（${w.kg} kg、${info.height_cm} cm、${age} 歲、${GENDER[info.gender]}；體重是 ${fmt(w.on)} 店內量測）`}</li>
              <li>活動 {cur.active} 大卡：{cur.activeSource === 'phone' ? '用你填的手機活動熱量（通常已包含有戴手錶的運動）' : '沒填手機活動熱量，用當天訓練推估'}</li>
              {cur.workouts.map((x, i) => (
                <li key={i}>{x.name} {x.min ?? '—'} 分：{x.kcal != null ? `約 ${x.kcal} 大卡（MET ${x.met}，Compendium ${x.code} ${x.label}）` : x.min ? '這類運動不估算' : '沒有上課分鐘，不估算'}</li>
              ))}
              <li>運動熱量＝MET × 體重 × 時數（2024 Adult Compendium of Physical Activities）。RPE 7 以上用高強度值是宥芯自訂規則。所有數字都是估計值。</li>
            </ul>
          )}
          <BalanceBars series={series} />
        </>
      )}
      {!readOnly && <details className="toggle">
        <summary className="small">步數和活動熱量在哪裡看？</summary>
        <ul className="small">
          <li><b>iPhone／Apple Watch</b>：「健康」App → 瀏覽 → 活動 → 步數、活動能量</li>
          <li><b>Garmin</b>：Garmin Connect → 今天 → 步數、活動卡路里</li>
          <li><b>小米／Zepp</b>：首頁 → 步數、消耗（活動）</li>
          <li><b>華為</b>：運動健康 → 步數、活動熱量</li>
        </ul>
        <p className="muted small">只填「活動」的熱量，不要填「總消耗」（總消耗已經含基礎代謝，會重複算）。</p>
      </details>}
    </section>
  )
}

function ActivityForm({ day, cur, profileId, onSaved }) {
  const [steps, setSteps] = useState(cur?.steps ?? '')
  const [kcal, setKcal] = useState(cur?.active_kcal ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  async function save() {
    const v = { day, steps, active_kcal: kcal }
    const e = validateActivity(v)
    if (e) return setMsg(e)
    setBusy(true); setMsg('')
    try { await saveActivity(profileId, v); await onSaved(); setMsg('已儲存') } catch { setMsg('儲存失敗，請稍後再試') } finally { setBusy(false) }
  }
  return (
    <div className="activity-form">
      <label className="small">步數<input className="search" type="number" inputMode="numeric" min="0" value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="例如 8000" /></label>
      <label className="small">活動熱量（大卡）<input className="search" type="number" inputMode="numeric" min="0" value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder="手機上的數字" /></label>
      <button className="btn ghost" disabled={busy} onClick={save}>{busy ? '儲存中…' : '儲存'}</button>
      {msg && <span className="small">{msg}</span>}
      {cur?.source === 'shortcut' && <span className="muted small">這天是 iPhone 自動同步的，改了就以你填的為準（晚上同步時會再更新）。</span>}
    </div>
  )
}

function BalanceBars({ series }) {
  const vals = series.map((s) => s.balance).filter((v) => v != null)
  if (vals.length === 0) return <p className="muted small">記了飲食、而且算得出基礎代謝，這裡就會出現近 7 天收支圖。</p>
  const max = Math.max(100, ...vals.map(Math.abs))
  const W = 320; const H = 140; const mid = 66; const half = 50
  const bw = W / series.length
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="近 7 天熱量收支（正＝盈餘、負＝赤字）">
        <line x1="0" x2={W} y1={mid} y2={mid} className="grid" />
        {series.map((s, i) => {
          if (s.balance == null) return <text key={s.day} x={i * bw + bw / 2} y={H - 4} className="tick" textAnchor="middle">{i === 6 ? '今天' : fmt(s.day)}</text>
          const h = (Math.abs(s.balance) / max) * half
          const y = s.balance > 0 ? mid - h : mid
          return (
            <g key={s.day}>
              <rect x={i * bw + bw * 0.2} y={y} width={bw * 0.6} height={Math.max(h, 2)} rx="3" fill={s.balance > 0 ? 'var(--danger)' : 'var(--brand)'}>
                <title>{`${fmt(s.day)}：攝取 ${s.intake}、消耗 ${s.burn}、差額 ${s.balance}`}</title>
              </rect>
              <text x={i * bw + bw / 2} y={s.balance > 0 ? y - 3 : y + h + 11} className="tick" textAnchor="middle">{s.balance}</text>
              <text x={i * bw + bw / 2} y={H - 4} className="tick" textAnchor="middle">{i === 6 ? '今天' : fmt(s.day)}</text>
            </g>
          )
        })}
      </svg>
      <figcaption className="legend"><span><i style={{ background: 'var(--brand)' }} />赤字</span><span><i style={{ background: 'var(--danger)' }} />盈餘</span></figcaption>
    </figure>
  )
}
