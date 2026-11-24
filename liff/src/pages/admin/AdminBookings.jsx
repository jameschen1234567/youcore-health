// 後台：預約管理（依日檢視、完成／未到／取消／改期、代客預約、關閉時段、服務設定）
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  CLOSE, OPEN, STATUS_LABELS, WEEKLY_REASONS, adminAddBlocked, adminCancelSeriesFrom, adminCreateWeekly, adminDeleteBlocked, adminListBookings, adminSetBookingStatus,
  adminUpdateService, bookingErrorText, cancelBooking, createBooking, fmtDateLabel, fmtSlot, listBlocked, listServices,
  addDays, rescheduleBooking, startTimes, taipei, taipeiDate, taipeiTime,
} from '../../lib/booking'
import { adminListClients } from '../../lib/adminApi'
import { adminUsagesForBookings } from '../../lib/packages'

const ALL_TIMES = startTimes(30) // 管理員可選 10:00–20:00 每 30 分的開始時間

export default function AdminBookings() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [date, setDate] = useState(() => (/^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date') : taipeiDate(new Date())))
  const paramDate = params.get('date')
  useEffect(() => { if (/^\d{4}-\d{2}-\d{2}$/.test(paramDate ?? '')) setDate(paramDate) }, [paramDate])
  const [rows, setRows] = useState(null)
  const [blocked, setBlocked] = useState([])
  const [usage, setUsage] = useState({})
  const [services, setServices] = useState([])
  const [err, setErr] = useState('')

  const reload = useCallback(() => {
    const from = taipei(date, '00:00').toISOString()
    const to = taipei(addDays(date, 1), '00:00').toISOString()
    return Promise.all([adminListBookings(from, to), listBlocked(from, to), listServices({ all: true })])
      .then(async ([r, b, s]) => {
        setRows(r); setBlocked(b); setServices(s)
        setUsage(await adminUsagesForBookings(r.filter((x) => x.status === 'completed').map((x) => x.id)).catch(() => ({})))
      })
      .catch(() => setErr('載入失敗'))
  }, [date])
  useEffect(() => { reload() }, [reload])

  const { md, wd } = fmtDateLabel(date)
  const active = (rows ?? []).filter((b) => b.status !== 'cancelled')
  const cancelled = (rows ?? []).filter((b) => b.status === 'cancelled')

  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/admin')}>‹ 管理後台</button>
      <div className="row spread head-row">
        <h1>預約管理</h1>
        <Link className="link-btn" to={`/admin/calendar?week=${date}`}>行事曆總表 ›</Link>
      </div>
      {err && <p className="error">{err}</p>}

      <div className="row day-nav">
        <button className="btn ghost" onClick={() => setDate(addDays(date, -1))} aria-label="前一天">‹</button>
        <input className="search" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button className="btn ghost" onClick={() => setDate(addDays(date, 1))} aria-label="後一天">›</button>
      </div>
      <h2 className="section-title">{md}（{wd}）{wd === '一' ? '｜公休' : ''}｜{active.length} 筆預約</h2>

      {blocked.map((b) => (
        <p key={b.id} className="banner left">
          🔒 關閉 {taipeiTime(new Date(b.starts_at))}–{taipeiTime(new Date(b.ends_at))}{b.reason ? `｜${b.reason}` : ''}
        </p>
      ))}
      {rows && active.length === 0 && <p className="muted">這天沒有預約</p>}
      {active.map((b) => <BookingItem key={b.id} b={b} usage={usage[b.id]} onChanged={reload} />)}
      {cancelled.length > 0 && (
        <p className="muted small">已取消：{cancelled.map((b) => `${taipeiTime(new Date(b.starts_at))} ${name(b)}`).join('、')}</p>
      )}

      <AddForClient date={date} services={services} preset={{ profile: params.get('client') ?? '', service: params.get('service') ?? '' }} onDone={reload} />
      <BlockTimes date={date} onDone={reload} />
      <ServiceSettings services={services} onDone={reload} />
    </main>
  )
}

const name = (b) => b.profile?.full_name || b.profile?.display_name || '客戶'

function BookingItem({ b, usage, onChanged }) {
  const [mode, setMode] = useState(null) // null | cancel | no_show | move
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [moveDate, setMoveDate] = useState(taipeiDate(new Date(b.starts_at)))
  const [moveTime, setMoveTime] = useState(taipeiTime(new Date(b.starts_at)))

  async function run(fn) {
    setBusy(true)
    setErr('')
    try { await fn(); setMode(null); await onChanged() } catch (e) { setErr(bookingErrorText(e)) } finally { setBusy(false) }
  }

  return (
    <section className="card">
      <div className="row spread">
        <b>{taipeiTime(new Date(b.starts_at))}–{taipeiTime(new Date(b.ends_at))}</b>
        <span className="row tight">
          {b.series_id && <span className="pill series">🔁 固定</span>}
          <span className={`pill ${b.status}`}>{STATUS_LABELS[b.status]}</span>
        </span>
      </div>
      <p><Link to={`/admin/client/${b.profile_id}`}>{name(b)}</Link>{b.profile?.phone ? <span className="muted small">｜{b.profile.phone}</span> : null}</p>
      <p className="muted small">{b.service?.name}{b.note ? `｜備註：${b.note}` : ''}</p>
      {b.status === 'completed' && !b.service?.is_trial && (
        usage
          ? <p className="small ok-text">已扣 1 堂｜課程包剩 {usage.remaining} 堂</p>
          : <p className="small error">未扣堂：這位客戶沒有可用的「{b.service?.name}」課程包</p>
      )}
      {err && <p className="error small">{err}</p>}

      {b.status === 'booked' && mode === null && (
        <div className="action-grid">
          <button className="btn primary" disabled={busy} onClick={() => run(() => adminSetBookingStatus(b.id, 'completed'))}>完成</button>
          <button className="btn ghost" onClick={() => setMode('no_show')}>無故未到</button>
          <button className="btn ghost" onClick={() => setMode('move')}>改期</button>
          <button className="btn ghost danger" onClick={() => setMode('cancel')}>取消</button>
        </div>
      )}
      {b.status !== 'booked' && mode === null && (
        <button className="link-btn" disabled={busy} onClick={() => run(() => adminSetBookingStatus(b.id, 'booked'))}>改回「已預約」</button>
      )}
      {mode === 'no_show' && (
        <div className="row confirm-row">
          <span className="small">標記為無故未到？累計 3 次會暫停該客戶的線上預約。</span>
          <button className="btn ghost" onClick={() => setMode(null)}>返回</button>
          <button className="btn danger" disabled={busy} onClick={() => run(() => adminSetBookingStatus(b.id, 'no_show'))}>確定</button>
        </div>
      )}
      {mode === 'cancel' && (
        <div className="row confirm-row">
          <span className="small">取消這筆預約？客戶會收到 LINE 通知。</span>
          <button className="btn ghost" onClick={() => setMode(null)}>返回</button>
          <button className="btn danger" disabled={busy} onClick={() => run(() => cancelBooking(b.id, { asAdmin: true }))}>只取消這堂</button>
          {b.series_id && (
            <button className="btn danger" disabled={busy} onClick={() => run(() => adminCancelSeriesFrom(b.id))}>這堂及之後的固定預約全部取消</button>
          )}
        </div>
      )}
      {mode === 'move' && (
        <div className="form-grid two-col">
          <label className="small">新日期<input className="search" type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} /></label>
          <label className="small">新時間<TimeSelect value={moveTime} onChange={setMoveTime} /></label>
          <p className="muted small full">管理員改期不受 24 小時與營業時間限制，但不能和其他預約重疊。客戶會收到 LINE 通知。</p>
          <div className="row full">
            <button className="btn ghost" onClick={() => setMode(null)}>返回</button>
            <button className="btn primary" disabled={busy || !moveDate} onClick={() => run(() => rescheduleBooking(b.id, taipei(moveDate, moveTime).toISOString(), { asAdmin: true }))}>確定改期</button>
          </div>
        </div>
      )}
    </section>
  )
}

function TimeSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {ALL_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
  )
}

// preset：從「體驗申請」按「協助預約」過來時，先帶入客戶與服務
function AddForClient({ date, services, preset, onDone }) {
  const [open, setOpen] = useState(!!preset.profile)
  const [clients, setClients] = useState(null)
  const [form, setForm] = useState({ ...preset, time: OPEN, note: '', repeat: false, weeks: 8 })
  const [result, setResult] = useState(null) // 每週重複的建立結果
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { if (open && !clients) adminListClients().then(setClients).catch(() => setErr('客戶清單載入失敗')) }, [open, clients])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (!form.profile || !form.service) return setErr('請選客戶與服務')
    setBusy(true)
    setErr('')
    try {
      const startIso = taipei(date, form.time).toISOString()
      if (form.repeat) {
        setResult(await adminCreateWeekly(form.profile, form.service, startIso, Number(form.weeks), form.note))
      } else {
        await createBooking(form.service, startIso, form.note, form.profile, { asAdmin: true })
        setOpen(false)
      }
      setForm({ profile: '', service: '', time: OPEN, note: '', repeat: false, weeks: 8 })
      await onDone()
    } catch (e) { setErr(bookingErrorText(e)) } finally { setBusy(false) }
  }

  if (result) {
    const ok = result.filter((r) => r.ok), bad = result.filter((r) => !r.ok)
    return (
      <section className="card">
        <h2>固定預約已建立 {ok.length} 堂</h2>
        {ok.length > 0 && <p className="small">客戶會收到一則 LINE 彙整通知。</p>}
        {bad.length > 0 && (
          <>
            <p className="error small">以下 {bad.length} 週沒有排進去，需要另外處理：</p>
            <ul className="plain-list">
              {bad.map((r) => <li key={r.slot_start} className="small">{fmtSlot(r.slot_start)}｜{WEEKLY_REASONS[r.reason] ?? r.reason}</li>)}
            </ul>
          </>
        )}
        <button className="btn primary block" onClick={() => { setResult(null); setOpen(false) }}>完成</button>
      </section>
    )
  }
  if (!open) return <button className="btn ghost block" onClick={() => setOpen(true)}>＋ 代客預約（{fmtDateLabel(date).md}）</button>
  return (
    <section className="card">
      <h2>代客預約｜{fmtDateLabel(date).md}</h2>
      <div className="form-grid two-col">
        <label className="small">客戶
          <select value={form.profile} onChange={set('profile')}>
            <option value="">{clients ? '選擇客戶…' : '載入中…'}</option>
            {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.full_name || c.display_name || '未命名'}{c.phone ? `（${c.phone}）` : ''}</option>)}
          </select>
        </label>
        <label className="small">服務
          <select value={form.service} onChange={set('service')}>
            <option value="">選擇服務…</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}（{s.duration_min} 分）</option>)}
          </select>
        </label>
        <label className="small">開始時間<TimeSelect value={form.time} onChange={(t) => setForm((f) => ({ ...f, time: t }))} /></label>
        <label className="small">備註<input className="search" value={form.note} maxLength={200} onChange={set('note')} placeholder="選填" /></label>
        <label className="small full check-row">
          <input type="checkbox" checked={form.repeat} onChange={(e) => setForm((f) => ({ ...f, repeat: e.target.checked }))} />
          每週重複（每週{fmtDateLabel(date).wd} {form.time}）
        </label>
        {form.repeat && (
          <label className="small full">重複幾週（含這週）
            <select value={form.weeks} onChange={set('weeks')}>
              {Array.from({ length: 25 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n} 週</option>)}
            </select>
            <span className="muted">遇到已被預約或關閉的那週會自動跳過，最後列出給你。</span>
          </label>
        )}
        {err && <p className="error small full">{err}</p>}
        <div className="row full">
          <button className="btn ghost" onClick={() => setOpen(false)} disabled={busy}>取消</button>
          <button className="btn primary" onClick={save} disabled={busy}>{busy ? '儲存中…' : form.repeat ? `建立 ${form.weeks} 週固定預約` : '建立預約'}</button>
        </div>
      </div>
    </section>
  )
}

function BlockTimes({ date, onDone }) {
  const [list, setList] = useState([])
  const [form, setForm] = useState({ date, start: OPEN, end: CLOSE, reason: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    const now = new Date()
    return listBlocked(now.toISOString(), new Date(now.getTime() + 62 * 864e5).toISOString()).then(setList).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { setForm((f) => ({ ...f, date })) }, [date])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function add() {
    setBusy(true)
    setErr('')
    try {
      await adminAddBlocked(taipei(form.date, form.start).toISOString(), taipei(form.date, form.end).toISOString(), form.reason)
      setForm((f) => ({ ...f, reason: '' }))
      await Promise.all([load(), onDone()])
    } catch { setErr('結束時間要晚於開始時間') } finally { setBusy(false) }
  }
  async function remove(id) { await adminDeleteBlocked(id); await Promise.all([load(), onDone()]) }

  const times = [...startTimes(0), CLOSE]
  return (
    <section className="card">
      <h2>關閉時段（休假、外出）</h2>
      <p className="muted small">已有的預約不會被取消，請另外處理。</p>
      <div className="form-grid two-col">
        <label className="small">日期<input className="search" type="date" value={form.date} onChange={set('date')} /></label>
        <label className="small">原因（選填，客戶看不到）<input className="search" value={form.reason} maxLength={100} onChange={set('reason')} /></label>
        <label className="small">從<select value={form.start} onChange={set('start')}>{times.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="small">到<select value={form.end} onChange={set('end')}>{times.map((t) => <option key={t}>{t}</option>)}</select></label>
        {err && <p className="error small full">{err}</p>}
        <div className="row full">
          <button className="btn ghost" onClick={() => setForm((f) => ({ ...f, start: OPEN, end: CLOSE }))}>整天</button>
          <button className="btn primary" disabled={busy} onClick={add}>關閉這段時間</button>
        </div>
      </div>
      {list.length > 0 && (
        <ul className="plain-list">
          {list.map((b) => (
            <li key={b.id} className="row spread">
              <span className="small">{fmtSlot(b.starts_at)}–{taipeiTime(new Date(b.ends_at))}{b.reason ? `｜${b.reason}` : ''}</span>
              <button className="link-btn danger-text" onClick={() => remove(b.id)}>重新開放</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ServiceSettings({ services, onDone }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState({})
  const [msg, setMsg] = useState('')
  if (!open) return <button className="link-btn" onClick={() => setOpen(true)}>服務時長與開放設定 ›</button>
  const val = (s, k) => draft[s.id]?.[k] ?? s[k]
  const set = (s, k, v) => setDraft((d) => ({ ...d, [s.id]: { ...d[s.id], [k]: v } }))
  async function save(s) {
    try {
      await adminUpdateService(s.id, { duration_min: val(s, 'duration_min'), buffer_min: val(s, 'buffer_min'), bookable: val(s, 'bookable') })
      setMsg(`已儲存「${s.name}」`)
      await onDone()
    } catch { setMsg('儲存失敗，時長需介於 15–240 分、緩衝 0–60 分') }
  }
  return (
    <section className="card">
      <h2>服務設定</h2>
      <div className="table-wrap">
        <table className="sets-table">
          <thead><tr><th>服務</th><th>時長</th><th>緩衝</th><th>線上</th><th></th></tr></thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td><input type="number" min="15" max="240" step="5" value={val(s, 'duration_min')} onChange={(e) => set(s, 'duration_min', e.target.value)} aria-label={`${s.name}時長`} /></td>
                <td><input type="number" min="0" max="60" step="5" value={val(s, 'buffer_min')} onChange={(e) => set(s, 'buffer_min', e.target.value)} aria-label={`${s.name}緩衝`} /></td>
                <td><input type="checkbox" checked={!!val(s, 'bookable')} onChange={(e) => set(s, 'bookable', e.target.checked)} aria-label={`${s.name}開放線上預約`} /></td>
                <td><button className="link-btn" onClick={() => save(s)}>存</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">單位：分鐘。修改時長只影響之後的新預約。</p>
      {msg && <p className="small">{msg}</p>}
    </section>
  )
}
