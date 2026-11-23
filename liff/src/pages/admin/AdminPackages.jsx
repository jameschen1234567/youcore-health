// 後台客戶頁：課程包（堂數、到期日、用堂紀錄）— 只有管理員看得到
import { useCallback, useEffect, useState } from 'react'
import { listServices } from '../../lib/booking'
import {
  PACKAGE_STATUS, adminAdjustPackage, adminCreatePackage, adminDeletePackage, adminListPackages, adminUpdatePackage,
  daysLeft, packageStats,
} from '../../lib/packages'

const fmtD = (d) => (d ? d.replaceAll('-', '/') : '不限期')
const fmtTs = (iso) => new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))

export default function AdminPackages({ profileId }) {
  const [rows, setRows] = useState(null)
  const [services, setServices] = useState([])
  const [adding, setAdding] = useState(false)
  const [showOld, setShowOld] = useState(false)
  const [err, setErr] = useState('')

  const reload = useCallback(() => Promise.all([adminListPackages(profileId), listServices({ all: true })])
    .then(([p, s]) => { setRows(p); setServices(s.filter((x) => !x.is_trial)) })
    .catch(() => setErr('課程包載入失敗')), [profileId])
  useEffect(() => { reload() }, [reload])

  const withStats = (rows ?? []).map((p) => ({ ...p, st: packageStats(p) }))
  const active = withStats.filter((p) => p.st.status === 'active')
  const old = withStats.filter((p) => p.st.status !== 'active')

  return (
    <section className="card">
      <div className="row spread head-row">
        <h2>課程包</h2>
        <span className="pill private">僅後台可見</span>
      </div>
      {err && <p className="error small">{err}</p>}
      {rows && active.length === 0 && <p className="muted small">目前沒有使用中的課程包</p>}
      {active.map((p) => <PackageItem key={p.id} p={p} onChanged={reload} />)}

      {old.length > 0 && (
        <>
          <button className="link-btn" onClick={() => setShowOld(!showOld)}>已到期／已用完（{old.length}）{showOld ? '▾' : '▸'}</button>
          {showOld && old.map((p) => <PackageItem key={p.id} p={p} onChanged={reload} />)}
        </>
      )}

      {adding
        ? <AddPackage profileId={profileId} services={services} onCancel={() => setAdding(false)} onDone={async () => { setAdding(false); await reload() }} />
        : <button className="btn ghost block" onClick={() => setAdding(true)}>＋ 新增課程包</button>}
      <p className="muted small">預約按「完成」會自動從同服務、最早到期的課程包扣 1 堂；改回其他狀態會自動退回。無故未到、24 小時內取消不自動扣，需要時用「手動扣堂」。</p>
    </section>
  )
}

function PackageItem({ p, onChanged }) {
  const [mode, setMode] = useState(null) // null | extend | adjust | history | delete
  const [expires, setExpires] = useState(p.expires_on ?? '')
  const [adj, setAdj] = useState({ amount: 1, note: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const { st } = p
  const left = daysLeft(p.expires_on)
  const soon = st.status === 'active' && left !== null && left <= 14

  async function run(fn) {
    setBusy(true)
    setErr('')
    try { await fn(); setMode(null); await onChanged() } catch { setErr('操作失敗，請稍後再試') } finally { setBusy(false) }
  }

  const history = [...(p.usages ?? [])].sort((a, b) => (b.booking?.starts_at ?? b.created_at).localeCompare(a.booking?.starts_at ?? a.created_at))

  return (
    <div className={`pkg ${st.status}`}>
      <div className="row spread pkg-head">
        <b>{p.service?.name}</b>
        <span className={`pill pkg-${st.status}`}>{PACKAGE_STATUS[st.status]}</span>
      </div>
      <p className="pkg-count"><b className="big">{Math.max(st.remaining, 0)}</b> / {p.total} 堂<span className="muted small">｜已用 {st.used}</span></p>
      <p className={`small ${soon || st.expired ? 'error' : 'muted'}`}>
        到期：{fmtD(p.expires_on)}
        {left !== null && st.status === 'active' ? `（剩 ${left} 天）` : ''}
        {st.expired && st.remaining > 0 ? `｜還有 ${st.remaining} 堂未用，可延期` : ''}
      </p>
      {p.note && <p className="muted small">備註：{p.note}</p>}
      {err && <p className="error small">{err}</p>}

      {mode === null && (
        <div className="action-grid">
          <button className="btn ghost" onClick={() => setMode('extend')}>延期</button>
          <button className="btn ghost" onClick={() => setMode('adjust')}>手動扣／補堂</button>
          <button className="btn ghost" onClick={() => setMode('history')}>用堂紀錄（{history.length}）</button>
          <button className="btn ghost danger" onClick={() => setMode('delete')}>刪除</button>
        </div>
      )}
      {mode === 'extend' && (
        <div className="form-grid two-col">
          <label className="small full">新的到期日（留空 = 不限期）
            <input className="search" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </label>
          <div className="row full">
            <button className="btn ghost" onClick={() => setMode(null)}>返回</button>
            <button className="btn primary" disabled={busy} onClick={() => run(() => adminUpdatePackage(p.id, { expires_on: expires }))}>儲存</button>
          </div>
        </div>
      )}
      {mode === 'adjust' && (
        <div className="form-grid two-col">
          <label className="small">動作
            <select value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: Number(e.target.value) })}>
              <option value={1}>扣 1 堂</option>
              <option value={-1}>補 1 堂</option>
            </select>
          </label>
          <label className="small">原因
            <input className="search" value={adj.note} maxLength={200} placeholder="例如：11/30 無故未到" onChange={(e) => setAdj({ ...adj, note: e.target.value })} />
          </label>
          <div className="row full">
            <button className="btn ghost" onClick={() => setMode(null)}>返回</button>
            <button className="btn primary" disabled={busy || !adj.note.trim()} onClick={() => run(() => adminAdjustPackage(p.id, adj.amount, adj.note))}>
              確定{adj.amount > 0 ? '扣堂' : '補堂'}
            </button>
          </div>
        </div>
      )}
      {mode === 'history' && (
        <>
          {history.length === 0 && <p className="muted small">還沒有用堂紀錄</p>}
          <ul className="plain-list">
            {history.map((u) => (
              <li key={u.id} className="row spread">
                <span className="small">
                  {u.kind === 'booking' ? `上課 ${u.booking ? fmtTs(u.booking.starts_at) : '（預約已刪除）'}` : `手動｜${u.note ?? ''}`}
                </span>
                <span className={`small ${u.amount > 0 ? '' : 'ok-text'}`}>{u.amount > 0 ? `−${u.amount}` : `+${-u.amount}`}</span>
              </li>
            ))}
          </ul>
          <button className="link-btn" onClick={() => setMode(null)}>收起</button>
        </>
      )}
      {mode === 'delete' && (
        <div className="row confirm-row">
          <span className="small">刪除這個課程包和全部用堂紀錄？無法復原。</span>
          <button className="btn ghost" onClick={() => setMode(null)}>返回</button>
          <button className="btn danger" disabled={busy} onClick={() => run(() => adminDeletePackage(p.id))}>確定刪除</button>
        </div>
      )}
    </div>
  )
}

/** 新增課程包表單。沒給 profileId 時顯示客戶下拉（總覽頁用） */
export function AddPackage({ profileId, clients, services, onCancel, onDone }) {
  const [f, setF] = useState({ profileId: profileId ?? '', serviceId: '', total: 10, remaining: '', startsOn: '', expiresOn: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function save() {
    if (!f.profileId) return setErr('請選客戶')
    if (!f.serviceId) return setErr('請選服務')
    if (!(Number(f.total) >= 1)) return setErr('購買堂數至少 1 堂')
    if (f.remaining !== '' && !(Number(f.remaining) >= 0 && Number(f.remaining) <= Number(f.total))) return setErr('目前剩餘要介於 0 到購買堂數之間')
    setBusy(true)
    setErr('')
    try { await adminCreatePackage(f); await onDone() } catch { setErr('新增失敗，請稍後再試') } finally { setBusy(false) }
  }

  return (
    <div className="form-grid two-col pkg-form">
      {!profileId && (
        <label className="small full">客戶
          <select value={f.profileId} onChange={set('profileId')}>
            <option value="">{clients ? '選擇客戶…' : '載入中…'}</option>
            {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.full_name || c.display_name || '未命名'}{c.phone ? `（${c.phone}）` : ''}</option>)}
          </select>
        </label>
      )}
      <label className="small full">服務（課程包只能用在這項服務）
        <select value={f.serviceId} onChange={set('serviceId')}>
          <option value="">選擇服務…</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="small">購買堂數<input className="search" type="number" min="1" max="500" value={f.total} onChange={set('total')} /></label>
      <label className="small">目前剩餘（舊客才填）<input className="search" type="number" min="0" max="500" value={f.remaining} placeholder="新購買留空" onChange={set('remaining')} /></label>
      <label className="small">購買日<input className="search" type="date" value={f.startsOn} onChange={set('startsOn')} /></label>
      <label className="small">到期日<input className="search" type="date" value={f.expiresOn} onChange={set('expiresOn')} /></label>
      <label className="small">備註<input className="search" value={f.note} maxLength={200} placeholder="選填，例如：方案名稱" onChange={set('note')} /></label>
      <p className="muted small full">購買日留空 = 今天；到期日留空 = 不限期。已經上過幾堂的舊客，填「目前剩餘」，系統會自動記一筆「導入前已使用」。</p>
      {err && <p className="error small full">{err}</p>}
      <div className="row full">
        <button className="btn ghost" onClick={onCancel} disabled={busy}>取消</button>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? '儲存中…' : '新增課程包'}</button>
      </div>
    </div>
  )
}
