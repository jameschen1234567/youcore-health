// 後台：體驗課程申請（聯繫確認 → 協助預約 → 結案）
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fmtSlot, taipeiDate } from '../../lib/booking'
import { ageFrom } from '../../lib/strength'
import { GENDERS } from '../../lib/training'
import { REQUEST_STATUS, adminListRequests, adminSetRequestStatus, isOpenRequest } from '../../lib/requests'

const FILTERS = [['open', '處理中'], ['all', '全部']]

export default function AdminRequests() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [filter, setFilter] = useState('open')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => adminListRequests().then((r) => { setRows(r); setErr('') }).catch(() => setErr('載入失敗')), [])
  useEffect(() => { reload() }, [reload])

  async function setStatus(id, status) {
    setBusy(true)
    try { await adminSetRequestStatus(id, status); await reload() } catch { setErr('操作失敗，這位客戶可能已有另一筆處理中的申請') } finally { setBusy(false) }
  }

  const shown = (rows ?? []).filter((r) => filter === 'all' || isOpenRequest(r))
  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/admin')}>‹ 管理後台</button>
      <h1>體驗申請</h1>
      {err && <p className="error">{err}</p>}
      <div className="chips">
        {FILTERS.map(([k, label]) => <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{label}</button>)}
      </div>
      {rows && shown.length === 0 && <p className="muted">目前沒有申請</p>}
      {shown.map((r) => {
        const p = r.profile
        return (
          <section key={r.id} className="card">
            <div className="row spread">
              <Link to={`/admin/client/${r.profile_id}`}><b>{p?.full_name || p?.display_name || '客戶'}</b></Link>
              <span className={`pill req-${r.status}`}>{REQUEST_STATUS[r.status]}</span>
            </div>
            <p className="muted small">送出：{fmtSlot(r.created_at)}{p?.display_name ? `｜LINE：${p.display_name}` : ''}</p>
            <p className="small">{GENDERS[p?.gender] ?? '性別未填'}｜{p?.birthday ? `${ageFrom(p.birthday)} 歲` : '年齡未填'}</p>
            {p?.phone && <p className="small">手機：<a href={`tel:${p.phone}`}>{p.phone}</a></p>}
            <p><b>{r.service?.name}</b></p>
            <p className="small">困擾：{r.concern}</p>
            <p className="small">方便時段：{r.preferred}</p>
            {r.source && <p className="muted small">得知管道：{r.source}</p>}
            {isOpenRequest(r) && (
              <>
                <Link className="btn primary block" to={`/admin/bookings?date=${taipeiDate(new Date())}&client=${r.profile_id}&service=${r.service_id}`}>協助預約</Link>
                <div className="row">
                  {r.status === 'pending' && <button className="btn ghost" disabled={busy} onClick={() => setStatus(r.id, 'contacted')}>標記已聯繫</button>}
                  <button className="btn ghost" disabled={busy} onClick={() => setStatus(r.id, 'closed')}>結案（不預約）</button>
                </div>
              </>
            )}
            {r.status === 'closed' && <button className="link-btn" disabled={busy} onClick={() => setStatus(r.id, 'pending')}>重新開啟</button>}
          </section>
        )
      })}
    </main>
  )
}
