// 客戶端：今天吃了什麼（會員限定）— 搜尋食物清單選份量或手填，今日總熱量／蛋白質對照目標，近 7 天長條圖
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  MAX_BACK_DAYS, MEALS, PORTION_STEPS, calcIntake, dailySeries, dayTotals, deleteFoodLog, getDietTarget, listFoodLogs,
  listFoods, saveFoodLog, searchFoods, todayTaipei, validateLog,
} from '../lib/diet'
import { isMember } from '../lib/homework'

const addDays = (d, n) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
const fmt = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`

export default function DietCard({ profile }) {
  const member = isMember(profile)
  const today = todayTaipei()
  const [day, setDay] = useState(today)
  const [logs, setLogs] = useState(null)
  const [foods, setFoods] = useState([])
  const [target, setTarget] = useState({})
  const [adding, setAdding] = useState(null) // meal key
  const [err, setErr] = useState('')

  const reload = useCallback(() => Promise.all([listFoodLogs(profile.id, addDays(today, -6 - MAX_BACK_DAYS)), getDietTarget(profile.id)])
    .then(([l, t]) => { setLogs(l); setTarget(t ?? {}) }).catch(() => setErr('飲食紀錄載入失敗')), [profile.id, today])
  useEffect(() => { if (member) { reload(); listFoods().then(setFoods).catch(() => {}) } }, [member, reload])

  if (!member) return null
  const dayLogs = (logs ?? []).filter((l) => l.eaten_on === day)
  const tot = dayTotals(dayLogs)
  const series = dailySeries(logs ?? [], today)
  const kT = target.diet_kcal_target
  const pT = target.diet_protein_target

  return (
    <section className="card">
      <div className="row spread head-row">
        <h2>{day === today ? '今天吃了什麼' : `${fmt(day)} 吃了什麼`}</h2>
        <input className="search day-pick" type="date" value={day} min={addDays(today, -MAX_BACK_DAYS)} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="選擇日期" />
      </div>
      {err && <p className="error small">{err}</p>}
      <div className="diet-totals">
        <Meter label="熱量" value={tot.kcal} target={kT} unit="大卡" />
        <Meter label="蛋白質" value={tot.protein_g} target={pT} unit="g" />
      </div>
      {!kT && <p className="muted small">每日目標由教練幫你設定。</p>}

      {Object.entries(MEALS).map(([k, label]) => {
        const items = dayLogs.filter((l) => l.meal === k)
        const sub = dayTotals(items)
        return (
          <div key={k} className="meal-block">
            <div className="row spread">
              <b>{label}{items.length > 0 && <span className="muted small"> {sub.kcal} 大卡</span>}</b>
              {adding !== k && <button className="link-btn small" onClick={() => setAdding(k)}>＋ 加食物</button>}
            </div>
            {items.map((l) => <LogRow key={l.id} l={l} profileId={profile.id} onChanged={reload} />)}
            {adding === k && <AddFood meal={k} day={day} foods={foods} profileId={profile.id}
              onCancel={() => setAdding(null)} onSaved={async () => { setAdding(null); await reload() }} />}
          </div>
        )
      })}

      {logs && <DailyBars series={series} target={kT} />}
      <p className="muted small note">食材熱量來自衛福部食藥署「食品營養成分資料集」；份量克數為一般家用估計，實際會依大小不同。</p>
    </section>
  )
}

function Meter({ label, value, target, unit }) {
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : 0
  const left = target ? Math.round((target - value) * 10) / 10 : null
  return (
    <div className="diet-meter">
      <span className="muted small">{label}</span>
      <span className="big-num">{value}<small> {unit}</small></span>
      {target != null && (
        <>
          <div className="progress"><div style={{ width: `${pct}%`, background: value > target && label === '熱量' ? 'var(--danger)' : undefined }} /></div>
          <span className="muted small">目標 {target}｜{left >= 0 ? `還有 ${left}` : `超過 ${-left}`}</span>
        </>
      )}
    </div>
  )
}

function LogRow({ l, profileId, onChanged }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="log-row">
      <span>{l.name}<span className="muted small">{l.amount_label && ` ${l.amount_label}`}</span></span>
      <span className="small">{Math.round(l.kcal)} 大卡{l.protein_g != null && `｜${l.protein_g} g`}</span>
      <button className="link-btn danger-text small" aria-label={`刪除 ${l.name}`} disabled={busy}
        onClick={async () => { setBusy(true); try { await deleteFoodLog(profileId, l.id); await onChanged() } finally { setBusy(false) } }}>✕</button>
    </div>
  )
}

function AddFood({ meal, day, foods, profileId, onCancel, onSaved }) {
  const [q, setQ] = useState('')
  const [pick, setPick] = useState(null)
  const [mode, setMode] = useState('portion')
  const [qty, setQty] = useState('1')
  const [manual, setManual] = useState(null) // { name, kcal, protein_g }
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const hits = useMemo(() => searchFoods(foods, q), [foods, q])
  const calc = pick ? calcIntake(pick, mode, qty) : null

  async function save() {
    const v = manual
      ? { eaten_on: day, meal, name: manual.name, kcal: manual.kcal, protein_g: manual.protein_g, amount_label: '' }
      : { eaten_on: day, meal, food_id: pick?.id, name: pick?.name ?? '', ...(calc ?? { kcal: '' }) }
    const e = validateLog(v)
    if (e) return setErr(e)
    setBusy(true); setErr('')
    try { await saveFoodLog(profileId, v); await onSaved() } catch { setErr('儲存失敗，請稍後再試'); setBusy(false) }
  }

  return (
    <div className="session-editor">
      {manual ? (
        <>
          <label className="small">食物名稱<input className="search" autoFocus value={manual.name} maxLength={60} onChange={(e) => setManual({ ...manual, name: e.target.value })} placeholder="例如：雞腿便當" /></label>
          <div className="form-grid two-col">
            <label className="small">熱量（大卡）<input className="search" type="number" inputMode="numeric" min="0" value={manual.kcal} onChange={(e) => setManual({ ...manual, kcal: e.target.value })} /></label>
            <label className="small">蛋白質 g（選填）<input className="search" type="number" inputMode="decimal" min="0" value={manual.protein_g} onChange={(e) => setManual({ ...manual, protein_g: e.target.value })} /></label>
          </div>
          <button className="link-btn small" onClick={() => setManual(null)}>‹ 回到清單搜尋</button>
        </>
      ) : !pick ? (
        <>
          <input className="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋食物，例如：雞胸、白飯、香蕉" aria-label="搜尋食物" />
          {hits.length > 0 && (
            <ul className="food-hits">
              {hits.map((f) => (
                <li key={f.id}><button onClick={() => { setPick(f); setMode('portion'); setQty('1') }}>
                  <span>{f.name}</span><span className="muted small">{f.portion_label} {Math.round(f.kcal_portion)} 大卡</span>
                </button></li>
              ))}
            </ul>
          )}
          {q.trim() && hits.length === 0 && <p className="muted small">清單裡找不到「{q.trim()}」</p>}
          <button className="link-btn small" onClick={() => setManual({ name: q.trim(), kcal: '', protein_g: '' })}>找不到？手動輸入</button>
        </>
      ) : (
        <>
          <p><b>{pick.name}</b><span className="muted small"> {pick.portion_label}{pick.portion_g ? `（約 ${pick.portion_g} g）` : ''} {Math.round(pick.kcal_portion)} 大卡</span></p>
          {pick.kcal_100g != null && (
            <div className="chips">
              <button className={`chip ${mode === 'portion' ? 'on' : ''}`} onClick={() => { setMode('portion'); setQty('1') }}>用份數</button>
              <button className={`chip ${mode === 'gram' ? 'on' : ''}`} onClick={() => { setMode('gram'); setQty(String(pick.portion_g ?? 100)) }}>用克數</button>
            </div>
          )}
          {mode === 'portion' ? (
            <div className="chips">
              {PORTION_STEPS.map((s) => <button key={s} className={`chip ${Number(qty) === s ? 'on' : ''}`} onClick={() => setQty(String(s))}>{s} 份</button>)}
            </div>
          ) : (
            <label className="small">克數<input className="search" type="number" inputMode="decimal" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
          )}
          {calc && <p className="small">＝ <b>{calc.kcal} 大卡</b>{calc.protein_g != null && `｜蛋白質 ${calc.protein_g} g`}</p>}
          <p className="muted small">來源：{pick.source}</p>
          <button className="link-btn small" onClick={() => setPick(null)}>‹ 換一個</button>
        </>
      )}
      {err && <p className="error small">{err}</p>}
      <div className="row">
        <button className="btn ghost" disabled={busy} onClick={onCancel}>取消</button>
        <button className="btn primary" disabled={busy || (!pick && !manual)} onClick={save}>{busy ? '儲存中…' : '加入'}</button>
      </div>
    </div>
  )
}

function DailyBars({ series, target }) {
  const max = Math.max(1, target ?? 0, ...series.map((d) => d.kcal))
  const W = 320; const H = 120; const pad = { t: 16, b: 20 }
  const bw = W / series.length
  const sy = (v) => H - pad.b - ((H - pad.t - pad.b) * v) / max
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="近 7 天每日熱量">
        {target && <line x1="0" x2={W} y1={sy(target)} y2={sy(target)} stroke="var(--accent)" strokeDasharray="6 5" strokeWidth="2" />}
        {series.map((d, i) => {
          const y = sy(d.kcal)
          return (
            <g key={d.day}>
              <rect x={i * bw + bw * 0.15} y={y} width={bw * 0.7} height={H - pad.b - y} rx="3" fill={i === series.length - 1 ? 'var(--brand)' : '#B9C7B4'}>
                <title>{`${fmt(d.day)}：${d.kcal} 大卡、蛋白質 ${d.protein_g} g`}</title>
              </rect>
              {d.kcal > 0 && <text x={i * bw + bw / 2} y={y - 3} className="tick" textAnchor="middle">{d.kcal}</text>}
              <text x={i * bw + bw / 2} y={H - 5} className="tick" textAnchor="middle">{i === series.length - 1 ? '今天' : fmt(d.day)}</text>
            </g>
          )
        })}
      </svg>
      {target && <figcaption className="legend"><span><i style={{ background: 'var(--accent)' }} />目標 {target} 大卡</span></figcaption>}
    </figure>
  )
}
