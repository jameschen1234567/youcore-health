// 後台客戶頁：正式課程預約權限、該客戶的預約紀錄、無故未到次數、恢復預約權限
import { useCallback, useEffect, useState } from 'react'
import {
  NO_SHOW_LIMIT, STATUS_LABELS, adminResetNoShow, adminSetBookingAccess, fmtSlot, getBookingAccess, getNoShowCount, listMyBookings,
} from '../../lib/booking'

export default function AdminClientBookings({ profileId }) {
  const [rows, setRows] = useState(null)
  const [noShows, setNoShows] = useState(0)
  const [access, setAccess] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [err, setErr] = useState('')

  const reload = useCallback(() => Promise.all([listMyBookings(profileId), getNoShowCount(profileId), getBookingAccess(profileId)])
    .then(([r, n, a]) => { setRows(r); setNoShows(n); setAccess(a) })
    .catch(() => setErr('載入失敗')), [profileId])
  useEffect(() => { reload() }, [reload])

  async function reset() {
    try { await adminResetNoShow(profileId); setConfirm(false); await reload() } catch { setErr('操作失敗') }
  }

  async function toggleAccess() {
    try { await adminSetBookingAccess(profileId, !access); await reload() } catch { setErr('操作失敗') }
  }

  const suspended = noShows >= NO_SHOW_LIMIT
  return (
    <section className="card">
      <h2>預約（{rows?.length ?? '…'} 筆）</h2>
      {err && <p className="error small">{err}</p>}
      {access !== null && (
        <div className="row spread">
          <span className="small">{access ? '✅ 已開通正式課程線上預約' : '尚未開通：只能送出體驗申請，由我們代為預約'}</span>
          <button className={`btn ${access ? 'ghost' : 'primary'}`} onClick={toggleAccess}>{access ? '取消開通' : '開通預約'}</button>
        </div>
      )}
      <p className={suspended ? 'error' : 'muted small'}>
        無故未到 {noShows} / {NO_SHOW_LIMIT} 次{suspended ? '｜線上預約已暫停' : ''}
      </p>
      {noShows > 0 && (confirm ? (
        <div className="row confirm-row">
          <span className="small">恢復後，之前的未到次數不再計算。</span>
          <button className="btn ghost" onClick={() => setConfirm(false)}>返回</button>
          <button className="btn primary" onClick={reset}>確定恢復</button>
        </div>
      ) : <button className="btn ghost" onClick={() => setConfirm(true)}>恢復預約權限（未到歸零）</button>)}
      {rows && rows.length > 0 && (
        <ul className="plain-list">
          {[...rows].reverse().slice(0, 20).map((b) => (
            <li key={b.id} className="row spread">
              <span className="small">{fmtSlot(b.starts_at)}｜{b.service?.name}</span>
              <span className={`pill ${b.status}`}>{STATUS_LABELS[b.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
