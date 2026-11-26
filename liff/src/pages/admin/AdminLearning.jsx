// 後台：客戶的模擬教室權限（以月計；新增課程包會自動開通 3 個月）
import { useCallback, useEffect, useState } from 'react'
import { MONTH_PRESETS, adminGrantLearning, adminRevokeLearning, endDate, learningStatus, listGrants, nextStart } from '../../lib/learning'
import { fmtDay } from '../../lib/training'

export default function AdminLearning({ profileId }) {
  const [grants, setGrants] = useState(null)
  const [months, setMonths] = useState(3)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const reload = useCallback(() => listGrants(profileId).then(setGrants).catch(() => setErr('載入失敗')), [profileId])
  useEffect(() => { reload() }, [reload])
  const run = async (fn) => {
    setBusy(true)
    setErr('')
    try { await fn(); setConfirm(false); await reload() } catch { setErr('操作失敗，請稍後再試') } finally { setBusy(false) }
  }
  if (!grants) return <section className="card"><h2>模擬教室權限</h2><p className={err ? 'error' : 'muted'}>{err || '載入中…'}</p></section>
  const st = learningStatus(grants)
  const n = Number(months)
  const ok = Number.isInteger(n) && n >= 1 && n <= 36
  const start = nextStart(grants)
  return (
    <section className="card">
      <h2>模擬教室權限</h2>
      <p>{st.active ? `使用中，到 ${fmtDay(st.until)}` : st.startsLater ? `${fmtDay(st.startsLater)} 開始` : '未開通'}</p>
      <div className="chips wrap">{MONTH_PRESETS.map((p) => <button key={p} className={`chip ${n === p ? 'on' : ''}`} onClick={() => setMonths(p)}>{p === 6 ? '半年' : p === 12 ? '1 年' : `${p} 個月`}</button>)}</div>
      <label className="small">月數（1–36）<input className="search" type="number" min="1" max="36" value={months} onChange={(e) => setMonths(e.target.value)} /></label>
      {ok && <p className="muted small">效期：{fmtDay(start)} 到 {fmtDay(endDate(start, n))}（含當天）{st.until ? '，接在目前期限之後' : ''}</p>}
      {err && <p className="error small">{err}</p>}
      <button className="btn primary block" disabled={busy || !ok} onClick={() => run(() => adminGrantLearning(profileId, n))}>{st.until ? `延長 ${ok ? n : ''} 個月` : `開通 ${ok ? n : ''} 個月`}</button>
      {st.until && (confirm ? (
        <div className="row confirm-row">
          <span className="small">停用後客戶馬上無法使用，包含已續約的期間。</span>
          <button className="btn ghost" disabled={busy} onClick={() => setConfirm(false)}>返回</button>
          <button className="btn danger" disabled={busy} onClick={() => run(() => adminRevokeLearning(profileId))}>確定停用</button>
        </div>
      ) : <button className="link-btn danger-text" onClick={() => setConfirm(true)}>停用權限</button>)}
      {grants.length > 0 && <ul className="foot-rows">{grants.map((g) => <li key={g.id} className="small muted">{fmtDay(g.starts_on)}–{fmtDay(g.expires_on)}（{g.months} 個月）{g.package_id ? '｜買課自動' : ''}{g.revoked_at ? '｜已停用' : ''}</li>)}</ul>}
    </section>
  )
}

