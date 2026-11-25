// 後台：客戶的模擬教室權限（以月計）
import { useCallback, useEffect, useState } from 'react'
import { MONTH_PRESETS, adminGrantLearning, adminRevokeLearning, adminSetUnlocks, byCategory, endDate, learningStatus, listGrants, listModules, listUnlocks, nextStart } from '../../lib/learning'
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
      <button className="btn primary block" disabled={busy || !ok} onClick={() => run(() => adminGrantLearning(profileId, n))}>{st.until ? `續約 ${ok ? n : ''} 個月` : `開通 ${ok ? n : ''} 個月`}</button>
      {st.until && (confirm ? (
        <div className="row confirm-row">
          <span className="small">停用後客戶馬上無法使用，包含已續約的期間。</span>
          <button className="btn ghost" disabled={busy} onClick={() => setConfirm(false)}>返回</button>
          <button className="btn danger" disabled={busy} onClick={() => run(() => adminRevokeLearning(profileId))}>確定停用</button>
        </div>
      ) : <button className="link-btn danger-text" onClick={() => setConfirm(true)}>停用權限</button>)}
      {grants.length > 0 && <ul className="foot-rows">{grants.map((g) => <li key={g.id} className="small muted">{fmtDay(g.starts_on)}–{fmtDay(g.expires_on)}（{g.months} 個月）{g.revoked_at ? '｜已停用' : ''}</li>)}</ul>}
      <Unlocks profileId={profileId} active={st.until != null} />
    </section>
  )
}

// 逐單元開放（勾選後按儲存；沒勾的就看不到內容）
function Unlocks({ profileId, active }) {
  const [mods, setMods] = useState(null)
  const [saved, setSaved] = useState([])
  const [on, setOn] = useState([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    Promise.all([listModules(), listUnlocks(profileId)]).then(([m, u]) => { setMods(m); setSaved(u); setOn(u) }).catch(() => setMsg('單元載入失敗'))
  }, [profileId])
  if (!mods) return <p className="muted small">{msg || '單元載入中…'}</p>
  const toggle = (ids, want) => { setMsg(''); setOn((x) => (want ? [...new Set([...x, ...ids])] : x.filter((i) => !ids.includes(i)))) }
  const dirty = on.length !== saved.length || on.some((i) => !saved.includes(i))
  async function save() {
    setBusy(true)
    setMsg('')
    try { await adminSetUnlocks(profileId, on); setSaved(on); setMsg('已儲存，客戶重新進入教室就會更新') } catch { setMsg('儲存失敗，請稍後再試') } finally { setBusy(false) }
  }
  return (
    <div className="unlocks">
      <h3>開放單元（{saved.length}／{mods.length}）</h3>
      {!active && <p className="muted small">這位客戶目前沒有使用期限，勾選後要再開通月數才看得到。</p>}
      {byCategory(mods).map((g) => {
        const ids = g.mods.map((m) => m.id)
        const all = ids.every((i) => on.includes(i))
        return (
          <div key={g.key}>
            <div className="row spread"><b className="small">{g.label}</b><button className="link-btn" onClick={() => toggle(ids, !all)}>{all ? '全部取消' : '全選'}</button></div>
            {g.mods.map((m) => (
              <label key={m.id} className="small check-row"><input type="checkbox" checked={on.includes(m.id)} onChange={(e) => toggle([m.id], e.target.checked)} />{m.title}{!m.published && '（未公開）'}</label>
            ))}
          </div>
        )
      })}
      <button className="btn primary block" disabled={busy || !dirty} onClick={save}>{busy ? '儲存中…' : '儲存開放單元'}</button>
      {msg && <p className="muted small">{msg}</p>}
    </div>
  )
}
