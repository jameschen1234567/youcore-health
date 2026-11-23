// 客戶預約：選服務 → 選日期 → 選時段（別人已預約的顯示灰色）→ 確認規則後送出
// 網址帶 ?reschedule=<預約 id> 時為改期模式
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import {
  CHANGE_HOURS, LEAD_HOURS, MAX_DAYS, NO_SHOW_LIMIT, bookingDates, bookingErrorText, buildSlots, canClientChange,
  createBooking, fmtSlot, getBusy, getNoShowCount, lineMessageUrl, listMyBookings, listServices, rescheduleBooking,
} from '../lib/booking'

export default function Booking() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const rescheduleId = params.get('reschedule')
  const [data, setData] = useState(null) // { services, mine, noShows }
  const [busy, setBusy] = useState([])
  const [err, setErr] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [date, setDate] = useState('')
  const [slot, setSlot] = useState(null)

  const dates = useMemo(() => bookingDates(), [])
  const loadBusy = useCallback(() => {
    const now = new Date()
    return getBusy(now.toISOString(), new Date(now.getTime() + (MAX_DAYS + 1) * 864e5).toISOString()).then(setBusy)
  }, [])

  useEffect(() => {
    Promise.all([listServices(), listMyBookings(profile.id), getNoShowCount(profile.id), loadBusy()])
      .then(([services, mine, noShows]) => {
        setData({ services, mine, noShows })
        const target = rescheduleId && mine.find((b) => b.id === rescheduleId)
        setServiceId(target ? target.service_id : services[0]?.id ?? '')
        setDate(dates.find((d) => !d.closed)?.date ?? '')
      })
      .catch(() => setErr('載入失敗，請稍後再試'))
  }, [profile.id, rescheduleId, loadBusy, dates])

  if (!data) return <main className="page"><h1>預約</h1>{err ? <p className="error">{err}</p> : <p className="muted">載入中…</p>}</main>

  const target = rescheduleId ? data.mine.find((b) => b.id === rescheduleId) : null
  if (rescheduleId && (!target || !canClientChange(target))) {
    return (
      <main className="page">
        <button className="back" onClick={() => navigate('/booking/mine')}>‹ 我的預約</button>
        <h1>無法線上改期</h1>
        <p className="muted">開始前 {CHANGE_HOURS} 小時內的預約，請直接傳訊息給我們修改。</p>
        {target && <MessageButton text={`我想修改 ${fmtSlot(target.starts_at)} 的預約`} />}
      </main>
    )
  }
  if (!target && data.noShows >= NO_SHOW_LIMIT) {
    return (
      <main className="page">
        <h1>預約</h1>
        <section className="card">
          <h2>線上預約已暫停</h2>
          <p>因為無故未到已累計 {NO_SHOW_LIMIT} 次，暫時無法線上預約。需要預約請直接傳訊息給我們。</p>
          <MessageButton text="我想預約" />
        </section>
      </main>
    )
  }

  const service = data.services.find((s) => s.id === serviceId)
  const ignore = target ? { starts_at: target.starts_at, ends_at: target.block_until } : null
  const slots = buildSlots(date, service, busy, new Date(), ignore)

  return (
    <main className="page">
      <button className="back" onClick={() => navigate(target ? '/booking/mine' : '/me')}>‹ {target ? '我的預約' : '我的'}</button>
      <div className="row spread head-row">
        <h1>{target ? '改期' : '預約'}</h1>
        {!target && <Link className="link-btn" to="/booking/mine">我的預約 ›</Link>}
      </div>
      {target && <p className="muted">原時間：{fmtSlot(target.starts_at)}｜{target.service?.name}</p>}
      {err && <p className="error">{err}</p>}

      {!target && (
        <section className="card">
          <h2>1. 選擇服務</h2>
          <div className="chips">
            {data.services.map((s) => (
              <button key={s.id} className={`chip ${serviceId === s.id ? 'on' : ''}`} onClick={() => { setServiceId(s.id); setSlot(null) }}>
                {s.name}<span className="muted small">｜{s.duration_min} 分</span>
              </button>
            ))}
          </div>
          <p className="muted small">專業健康檢測、頌缽療育請傳訊息預約。</p>
        </section>
      )}

      <section className="card">
        <h2>{target ? '1.' : '2.'} 選擇日期</h2>
        <div className="date-strip" role="listbox" aria-label="日期">
          {dates.map((d) => (
            <button key={d.date} role="option" aria-selected={date === d.date} disabled={d.closed}
              className={`date-cell ${date === d.date ? 'on' : ''}`} onClick={() => { setDate(d.date); setSlot(null) }}>
              <span className="small">{d.wd}</span>
              <b>{d.md}</b>
              {d.closed && <span className="small">公休</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>{target ? '2.' : '3.'} 選擇時段</h2>
        {slots.length === 0 && <p className="muted">這天沒有可預約的時段</p>}
        <div className="slot-grid">
          {slots.map((s) => (
            <button key={s.time} disabled={s.state !== 'free'} aria-pressed={slot?.time === s.time}
              className={`slot ${s.state} ${slot?.time === s.time ? 'on' : ''}`} onClick={() => setSlot(s)}>
              <b>{s.time}</b>
              {s.state === 'taken' && <span className="small">已預約</span>}
            </button>
          ))}
        </div>
        <p className="muted small">灰色為已被預約或不開放的時段；最晚需在開始前 {LEAD_HOURS} 小時預約。</p>
      </section>

      {slot && service && (
        <Confirm service={service} slot={slot} target={target}
          onDone={() => navigate('/booking/mine', { state: { flash: target ? '已改期' : '預約成功！LINE 也會收到通知' } })}
          onTaken={(msg) => { setErr(msg); setSlot(null); loadBusy() }} />
      )}
    </main>
  )
}

function Confirm({ service, slot, target, onDone, onTaken }) {
  const [agree, setAgree] = useState(false)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    setSending(true)
    setErr('')
    try {
      if (target) await rescheduleBooking(target.id, slot.start.toISOString())
      else await createBooking(service.id, slot.start.toISOString(), note)
      onDone()
    } catch (e) {
      const msg = bookingErrorText(e)
      setSending(false)
      if (String(e?.message).includes('SLOT_TAKEN')) onTaken(msg)
      else setErr(msg)
    }
  }

  return (
    <section className="card confirm-card">
      <h2>確認{target ? '改期' : '預約'}</h2>
      <p className="big">{fmtSlot(slot.start.toISOString())}</p>
      <p>{service.name}（約 {service.duration_min} 分鐘）</p>
      <ul className="rules">
        <li>開始前 <b>{CHANGE_HOURS} 小時</b>之前，可以在 App 自己改期或取消。</li>
        <li>開始前 {CHANGE_HOURS} 小時內就不能線上修改，請直接傳 LINE 訊息給我們。</li>
        <li>無故未到累計 <b>{NO_SHOW_LIMIT} 次</b>，將暫停線上預約的權限。</li>
      </ul>
      {!target && (
        <label className="small">想先告訴我們的事（選填）
          <input className="search" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="例如：右肩舉手會痛" />
        </label>
      )}
      <label className="check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        我已了解以上預約規則
      </label>
      {err && <p className="error small">{err}</p>}
      <button className="btn primary block" disabled={!agree || sending} onClick={submit}>
        {sending ? '送出中…' : target ? '確定改期' : '確定預約'}
      </button>
    </section>
  )
}

export function MessageButton({ text, label = '傳 LINE 訊息給我們' }) {
  const href = lineMessageUrl(text)
  return href
    ? <a className="btn primary block" href={href}>{label}</a>
    : <button className="btn primary block" disabled>{label}</button>
}
