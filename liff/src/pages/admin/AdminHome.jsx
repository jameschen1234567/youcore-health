// 管理後台首頁：客戶列表、Notion 立即同步、足部數據匯出
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { adminAllFoot, adminLastSync, adminListClients, adminRunSync } from '../../lib/adminApi'
import { allFootCsvFilename, downloadText, footCsv } from '../../lib/csv'
import { fmtDate } from '../../lib/format'

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
    (!q || (c.display_name ?? '').toLowerCase().includes(q.toLowerCase())) &&
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

      <Tools />

      <h2 className="section-title">客戶（{clients?.length ?? '…'}）</h2>
      <input className="search" type="search" placeholder="搜尋 LINE 名稱" value={q} onChange={(e) => setQ(e.target.value)} />
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
                <b>{c.display_name || '未命名'}</b>
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
