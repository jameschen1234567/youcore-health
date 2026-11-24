// 客戶：我的預約（即將到來可改期／取消；24 小時內改用傳訊息）
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import {
  CHANGE_HOURS, NO_SHOW_LIMIT, STATUS_LABELS, bookingErrorText, canClientChange, cancelBooking, fmtSlot,
  getBookingAccess, getNoShowCount, isUpcoming, listMyBookings,
} from '../lib/booking'
import { MessageButton } from '../components/MessageButton'

export default function MyBookings() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { state } = useLocation()
  const [rows, setRows] = useState(null)
  const [noShows, setNoShows] = useState(0)
  const [access, setAccess] = useState(false)
  const [err, setErr] = useState('')
  const [showPast, setShowPast] = useState(false)

  const reload = useCallback(() => Promise.all([listMyBookings(profile.id), getNoShowCount(profile.id), getBookingAccess(profile.id)])
    .then(([r, n, a]) => { setRows(r); setNoShows(n); setAccess(a || profile.role === 'admin') })
    .catch(() => setErr('載入失敗，請稍後再試')), [profile.id, profile.role])
  useEffect(() => { reload() }, [reload])

  const upcoming = (rows ?? []).filter((b) => isUpcoming(b))
  const past = (rows ?? []).filter((b) => !isUpcoming(b)).reverse()

  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/me')}>‹ 我的</button>
      <h1>我的預約</h1>
      {state?.flash && <p className="banner ok">{state.flash}</p>}
      {err && <p className="error">{err}</p>}
      {noShows > 0 && (
        <p className={`banner ${noShows >= NO_SHOW_LIMIT ? 'warn' : ''} left`}>
          無故未到 {noShows} / {NO_SHOW_LIMIT} 次{noShows >= NO_SHOW_LIMIT ? '，線上預約已暫停' : ''}
        </p>
      )}

      {rows && upcoming.length === 0 && (
        <section className="card">
          <p className="muted">目前沒有即將到來的預約</p>
        </section>
      )}
      {upcoming.map((b) => <UpcomingItem key={b.id} b={b} access={access} onChanged={reload} />)}
      {rows && <Link className="btn primary block" to="/booking">{access ? '＋ 新增預約' : '申請體驗課程'}</Link>}

      {past.length > 0 && (
        <>
          <button className="link-btn section-title" onClick={() => setShowPast(!showPast)}>
            過去的預約（{past.length}）{showPast ? '▾' : '▸'}
          </button>
          {showPast && (
            <ul className="client-list">
              {past.map((b) => (
                <li key={b.id}><div className="booking-row">
                  <span><b>{fmtSlot(b.starts_at)}</b><span className="muted small">{b.service?.name}</span></span>
                  <span className={`pill ${b.status}`}>{STATUS_LABELS[b.status]}</span>
                </div></li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  )
}

function UpcomingItem({ b, access, onChanged }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const changeable = canClientChange(b)

  async function cancel() {
    setBusy(true)
    setErr('')
    try { await cancelBooking(b.id); await onChanged() } catch (e) { setErr(bookingErrorText(e)); setBusy(false) }
  }

  return (
    <section className="card">
      <p className="big">{fmtSlot(b.starts_at)}</p>
      <p>{b.service?.name}</p>
      {b.note && <p className="muted small">備註：{b.note}</p>}
      {err && <p className="error small">{err}</p>}
      {changeable ? (
        confirm ? (
          <div className="row confirm-row">
            <span className="small">確定取消這筆預約？</span>
            <button className="btn ghost" disabled={busy} onClick={() => setConfirm(false)}>不取消</button>
            <button className="btn danger" disabled={busy} onClick={cancel}>{busy ? '取消中…' : '確定取消'}</button>
          </div>
        ) : (
          <div className="row">
            <button className="btn ghost" onClick={() => setConfirm(true)}>取消預約</button>
            {access && <Link className="btn primary" to={`/booking?reschedule=${b.id}`}>改期</Link>}
          </div>
        )
      ) : null}
      {changeable && !access && <MessageButton text={`我想修改 ${fmtSlot(b.starts_at)} 的預約`} label="傳訊息改時間" />}
      {!changeable && (
        <>
          <p className="muted small">開始前 {CHANGE_HOURS} 小時內無法線上修改，需要調整請傳訊息給我們。</p>
          <MessageButton text={`我想修改 ${fmtSlot(b.starts_at)} 的預約`} label="傳訊息修改" />
        </>
      )}
    </section>
  )
}
