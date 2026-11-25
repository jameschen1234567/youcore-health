// 管理後台首頁：課程包提醒、客戶列表、Notion 立即同步、足部數據匯出
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminAllFoot, adminLastSync, adminListClients, adminRunSync } from '../../lib/adminApi'
import { allFootCsvFilename, downloadText, footCsv } from '../../lib/csv'
import { fmtDate } from '../../lib/format'
import { adminListAllPackages, packageAlerts } from '../../lib/packages'
import { adminCountUnread } from '../../lib/feedback'
import { adminListRequests, isOpenRequest } from '../../lib/requests'

const FILTERS = [
  ['all', '全部'],
  ['deletion', '待刪除'],
  ['orders', '製作中訂單'],
]

export default function AdminHome() {
  const navigate = useNavigate()
  const [clients, setClients] = useState(null)
  const [error, setError] = useState(false)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    adminListClients().then(setClients).catch(() => setError(true))
  }, [])

  const shown = (clients ?? []).filter((c) =>
    (!q || [c.display_name, c.full_name, c.phone].some((v) => (v ?? '').toLowerCase().includes(q.toLowerCase()))) &&
    (filter === 'all' || (filter === 'deletion' && c.deletion_pending) || (filter === 'orders' && c.open_orders > 0)))
  const pendingDeletion = (clients ?? []).filter((c) => c.deletion_pending).length

  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/me')}>‹ 我的</button>
      <h1>管理後台</h1>
      {pendingDeletion > 0 && (
        <button className="banner warn left" onClick={() => setFilter('deletion')}>
          有 {pendingDeletion} 位客戶申請刪除資料，請盡快處理 ›
        </button>
      )}

      <div className="row admin-actions">
        <Link className="btn primary" to="/admin/bookings">預約管理</Link>
        <Link className="btn ghost" to="/admin/calendar">預約總表（行事曆）</Link>
      </div>
      <Link className="btn ghost block" to="/admin/live">直播管理</Link>
      <Link className="btn ghost block" to="/admin/learning">模擬教材</Link>
      <RequestAlert />
      <FeedbackAlert />
      <PackageAlerts />

      <Tools />

      <h2 className="section-title">客戶（{clients?.length ?? '…'}）</h2>
      <input className="search" type="search" placeholder="搜尋姓名、LINE 名稱或電話" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        {FILTERS.map(([k, label]) => (
          <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>
      {error && <p className="error">載入失敗，請確認你有管理員權限</p>}
      {clients && shown.length === 0 && <p className="muted">沒有符合的客戶</p>}
      <ul className="client-list">
        {shown.map((c) => (
          <li key={c.id}>
            <Link to={`/admin/client/${c.id}`}>
              <span>
                <b>{c.full_name || c.display_name || '未命名'}{c.full_name && c.display_name ? <span className="muted small">（LINE：{c.display_name}）</span> : null}</b>
                <span className="muted small">
                  加入 {fmtDate(c.created_at)}{c.last_foot_at ? `｜足部量測 ${fmtDate(c.last_foot_at)}` : ''}
                </span>
              </span>
              <span className="badges">
                {c.role === 'admin' && <span className="tag">管理員</span>}
                {c.deletion_pending && <span className="tag danger">待刪除</span>}
                {c.open_orders > 0 && <span className="tag">訂單 {c.open_orders}</span>}
                <span aria-hidden="true">›</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}

function Tools() {
  const [sync, setSync] = useState({ state: 'idle', log: null })
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState('')

  useEffect(() => {
    adminLastSync().then((log) => setSync((s) => ({ ...s, log }))).catch(() => {})
  }, [])

  async function runSync() {
    setSync((s) => ({ ...s, state: 'running' }))
    try {
      const log = await adminRunSync()
      setSync({ state: 'done', log })
    } catch {
      setSync((s) => ({ ...s, state: 'error' }))
    }
  }

  async function exportAll() {
    setExporting(true)
    setExportMsg('')
    try {
      const rows = await adminAllFoot()
      if (rows.length === 0) setExportMsg('目前沒有足部量測資料')
      else downloadText(allFootCsvFilename(), footCsv(rows))
    } catch {
      setExportMsg('匯出失敗，請稍後再試')
    } finally {
      setExporting(false)
    }
  }

  const log = sync.log
  return (
    <section className="card">
      <h2>工具</h2>
      <div className="tool-row">
        <div>
          <b>衛教內容同步（Notion）</b>
          <p className="muted small">
            {log
              ? `上次：${fmtDate(log.started_at)} ${new Date(log.started_at).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false })}｜${log.ok ? `成功，更新 ${log.items_synced ?? 0} 篇` : `失敗：${log.error ?? '未知錯誤'}`}`
              : '每小時自動同步一次'}
          </p>
          {sync.state === 'error' && <p className="error small">同步失敗，請稍後再試</p>}
        </div>
        <button className="btn ghost" onClick={runSync} disabled={sync.state === 'running'}>
          {sync.state === 'running' ? '同步中…' : '立即同步'}
        </button>
      </div>
      <div className="tool-row">
        <div>
          <b>足部數據匯出</b>
          <p className="muted small">全部客戶的線上量測（CSV，可用 Excel 開）。僅供參考，正式建模以到店手量為準。</p>
          {exportMsg && <p className="muted small">{exportMsg}</p>}
        </div>
        <button className="btn ghost" onClick={exportAll} disabled={exporting}>{exporting ? '匯出中…' : '匯出 CSV'}</button>
      </div>
    </section>
  )
}

// 課程包提醒：快到期、快用完、已到期還有剩（只有管理員看得到）
function PackageAlerts() {
  const [alerts, setAlerts] = useState(null)
  useEffect(() => { adminListAllPackages().then((p) => setAlerts(packageAlerts(p))).catch(() => setAlerts([])) }, [])
  const name = (p) => p.profile?.full_name || p.profile?.display_name || '客戶'
  return (
    <section className="card">
      <div className="row spread head-row">
        <h2>課程包提醒{alerts?.length ? `（${alerts.length}）` : ''}</h2>
        <Link className="link-btn" to="/admin/packages">課程包總覽 ›</Link>
      </div>
      {alerts === null && <p className="muted small">載入中…</p>}
      {alerts?.length === 0 && <p className="muted small">目前沒有快到期或快用完的課程包 👍</p>}
      {alerts?.length > 0 && (
        <ul className="plain-list">
          {alerts.slice(0, 5).map((p) => (
            <li key={p.id} className="row spread">
              <Link className="small" to={`/admin/client/${p.profile_id}`}><b>{name(p)}</b>｜{p.service?.name}</Link>
              <span className="small error">{p.reasons.join('、')}</span>
            </li>
          ))}
        </ul>
      )}
      {alerts?.length > 5 && <Link className="link-btn" to="/admin/packages">還有 {alerts.length - 5} 筆，查看全部 ›</Link>}
    </section>
  )
}

// 體驗申請：有待處理的就顯示提醒
function RequestAlert() {
  const [open, setOpen] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => { adminListRequests().then((r) => setOpen(r.filter(isOpenRequest))).catch(() => setFailed(true)) }, [])
  const pending = (open ?? []).filter((r) => r.status === 'pending').length
  return (
    <Link className={`banner left ${pending || failed ? 'warn' : ''}`} to="/admin/requests">
      {failed ? '體驗申請載入失敗，點這裡重試 ›' : pending ? `有 ${pending} 筆體驗申請待確認 ›` : `體驗申請${open?.length ? `（${open.length} 筆處理中）` : ''} ›`}
    </Link>
  )
}

// 意見回饋：有未讀就顯示提醒
function FeedbackAlert() {
  const [n, setN] = useState(null)
  useEffect(() => { adminCountUnread().then(setN).catch(() => setN(-1)) }, [])
  return <Link className={`banner left ${n ? 'warn' : ''}`} to="/admin/feedback">{n === -1 ? '意見回饋載入失敗，點這裡重試 ›' : n ? `有 ${n} 筆意見回饋未讀 ›` : '意見回饋 ›'}</Link>
}
