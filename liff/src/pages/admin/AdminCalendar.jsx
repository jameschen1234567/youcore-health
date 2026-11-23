// 後台：預約總表（週曆）。每天一欄、每 30 分一格，預約依時間長度畫成色塊；點色塊或日期進入當天的預約管理
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  DAY_MINUTES, STATUS_LABELS, adminListBookings, addDays, dayPosition, fmtDateLabel, isClosedDay, listBlocked,
  startTimes, taipei, taipeiDate, taipeiTime, weekOf,
} from '../../lib/booking'

const PX_PER_MIN = 1.2 // 30 分鐘 = 36px
const HOURS = startTimes(30).filter((t) => t.endsWith(':00')) // 每小時一條標線
const SHORT = {
  科技結合運動按摩: '按摩',
  一對一肌力與體能課程: '肌力課',
  運動傷害防護與康復訓練: '康復訓練',
  專業健康檢測: '健康檢測',
  頌缽療育: '頌缽',
}
const shortName = (s) => SHORT[s?.name] ?? s?.name ?? ''
const clientName = (b) => b.profile?.full_name || b.profile?.display_name || '客戶'

export default function AdminCalendar() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const today = taipeiDate(new Date())
  const anchor = params.get('week') || today
  const days = useMemo(() => weekOf(anchor), [anchor])
  const [rows, setRows] = useState(null)
  const [blocked, setBlocked] = useState([])
  const [err, setErr] = useState('')

  const reload = useCallback(() => {
    const from = taipei(days[0], '00:00').toISOString()
    const to = taipei(addDays(days[6], 1), '00:00').toISOString()
    setRows(null)
    return Promise.all([adminListBookings(from, to), listBlocked(from, to)])
      .then(([r, b]) => { setRows(r.filter((x) => x.status !== 'cancelled')); setBlocked(b) })
      .catch(() => setErr('載入失敗'))
  }, [days])
  useEffect(() => { reload() }, [reload])

  const go = (n) => setParams({ week: addDays(anchor, n * 7) }, { replace: true })
  const openDay = (date) => navigate(`/admin/bookings?date=${date}`)
  const first = fmtDateLabel(days[0]), last = fmtDateLabel(days[6])
  const openDays = days.filter((d) => !isClosedDay(d))
  const byDay = (date) => (rows ?? []).filter((b) => taipeiDate(new Date(b.starts_at)) === date)
  const total = (rows ?? []).length

  return (
    <main className="page wide">
      <button className="back" onClick={() => navigate('/admin/bookings')}>‹ 預約管理</button>
      <h1>預約總表</h1>
      {err && <p className="error">{err}</p>}

      <div className="row day-nav">
        <button className="btn ghost" onClick={() => go(-1)} aria-label="上一週">‹</button>
        <button className="btn ghost cal-range" onClick={() => setParams({}, { replace: true })}>
          {first.md}–{last.md}{days.includes(today) ? '（本週）' : ''}
        </button>
        <button className="btn ghost" onClick={() => go(1)} aria-label="下一週">›</button>
      </div>
      <p className="muted small">本週 {rows ? total : '…'} 筆預約｜週一公休不顯示｜點預約或日期可進入當天管理</p>

      <div className="cal-scroll">
        <div className="cal" style={{ '--cols': openDays.length }}>
          <div className="cal-head cal-corner" />
          {openDays.map((d) => {
            const { md, wd } = fmtDateLabel(d)
            const n = byDay(d).length
            return (
              <button key={d} className={`cal-head ${d === today ? 'today' : ''}`} onClick={() => openDay(d)}>
                <span className="small">{wd}</span><b>{md}</b>
                <span className="small muted">{n ? `${n} 筆` : '—'}</span>
              </button>
            )
          })}

          <div className="cal-times" style={{ height: DAY_MINUTES * PX_PER_MIN }}>
            {HOURS.map((t, i) => <span key={t} style={{ top: i * 60 * PX_PER_MIN }}>{t}</span>)}
          </div>
          {openDays.map((d) => (
            <div key={d} className={`cal-day ${d === today ? 'today' : ''}`} style={{ height: DAY_MINUTES * PX_PER_MIN }}>
              {blocked.map((b) => {
                const pos = dayPosition(d, b.starts_at, b.ends_at)
                return pos && (
                  <div key={b.id} className="cal-block closed" style={place(pos)} title={b.reason ?? ''}>
                    <span>🔒 關閉</span>{b.reason && <span className="cal-sub">{b.reason}</span>}
                  </div>
                )
              })}
              {byDay(d).map((b) => {
                const pos = dayPosition(d, b.starts_at, b.ends_at)
                return pos && (
                  <button key={b.id} className={`cal-block ${b.status} ${b.service?.is_trial ? 'trial' : ''}`} style={place(pos)}
                    onClick={() => openDay(d)}
                    title={`${taipeiTime(new Date(b.starts_at))} ${clientName(b)}｜${b.service?.name ?? ''}｜${STATUS_LABELS[b.status]}`}>
                    <span className="cal-time">{taipeiTime(new Date(b.starts_at))}</span>
                    <b>{clientName(b)}</b>
                    <span className="cal-sub">{shortName(b.service)}{b.status !== 'booked' ? `・${STATUS_LABELS[b.status]}` : ''}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="cal-legend small">
        <span><i className="sw booked" />正式課程</span>
        <span><i className="sw trial" />體驗課程</span>
        <span><i className="sw completed" />已完成</span>
        <span><i className="sw no_show" />未到</span>
        <span><i className="sw closed" />關閉時段</span>
      </div>
    </main>
  )
}

const place = ({ top, height }) => ({ top: top * PX_PER_MIN, height: Math.max(height * PX_PER_MIN - 2, 18) })
