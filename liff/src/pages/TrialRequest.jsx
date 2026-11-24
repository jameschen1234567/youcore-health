// 新客人（未開通預約）：填體驗課程申請，由我們確認後協助預約
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { bookingErrorText, usedTrials } from '../lib/booking'
import { REQUEST_SOURCES, isOpenRequest, listMyRequests, submitTrialRequest } from '../lib/requests'
import { MessageButton } from '../components/MessageButton'

export default function TrialRequest({ profileId, services, mine }) {
  const navigate = useNavigate()
  const used = usedTrials(mine)
  const trials = services.filter((s) => s.is_trial && !used.has(s.id))
  const [requests, setRequests] = useState(null)
  const [f, setF] = useState({ serviceId: '', concern: '', preferred: '', source: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  const reload = useCallback(() => listMyRequests(profileId).then(setRequests).catch(() => setErr('載入失敗，請稍後再試')), [profileId])
  useEffect(() => { reload() }, [reload])

  const open = (requests ?? []).find(isOpenRequest)
  const service = trials.find((s) => s.id === f.serviceId)

  async function submit() {
    if (!service) return setErr('請選擇想體驗的課程')
    if (!f.concern.trim() || !f.preferred.trim()) return setErr('請填寫困擾與方便的時段')
    setBusy(true)
    setErr('')
    try { await submitTrialRequest(profileId, { ...f, service }); await reload() } catch (e) { setErr(bookingErrorText(e)) } finally { setBusy(false) }
  }

  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/me')}>‹ 我的</button>
      <div className="row spread head-row">
        <h1>體驗課程申請</h1>
        <Link className="link-btn" to="/booking/mine">我的預約 ›</Link>
      </div>

      {requests === null && !err && <p className="muted">載入中…</p>}

      {open && (
        <section className="card">
          <h2>已收到你的申請 ✅</h2>
          <p>{open.service?.name}</p>
          <p className="muted small">困擾：{open.concern}</p>
          <p className="muted small">方便時段：{open.preferred}</p>
          <p>我們會先跟你聯繫確認，再幫你安排時間。預約成立後會收到 LINE 通知。</p>
          <MessageButton text={`我送出了「${open.service?.name ?? '體驗課程'}」申請，想補充：`} label="傳訊息補充" />
        </section>
      )}

      {requests && !open && trials.length === 0 && (
        <section className="card">
          <h2>想了解後續課程？</h2>
          <p>課程方案與時間，歡迎直接傳訊息給我們。</p>
          <MessageButton text="我想了解課程方案" />
        </section>
      )}

      {requests && !open && trials.length > 0 && (
        <section className="card">
          <p className="muted small">第一次來，請先留下你的狀況。我們確認後會與你聯繫，並協助安排體驗時間。</p>
          <h2>1. 想體驗的課程</h2>
          <div className="trial-list" role="radiogroup" aria-label="想體驗的課程">
            {trials.map((s) => (
              <button key={s.id} role="radio" aria-checked={f.serviceId === s.id} className={`trial-item ${f.serviceId === s.id ? 'on' : ''}`}
                onClick={() => setF((x) => ({ ...x, serviceId: s.id }))}>
                <b>{s.name}</b>{s.description && <span className="small">{s.description}</span>}
              </button>
            ))}
          </div>
          <h2>2. 告訴我們你的狀況</h2>
          <div className="form-grid">
            <label className="small">目前最困擾的問題 *
              <textarea rows={3} maxLength={500} value={f.concern} onChange={set('concern')} placeholder="例如：右肩舉高會痛，大約 2 個月了" />
            </label>
            <label className="small">方便的時段 *
              <input className="search" maxLength={200} value={f.preferred} onChange={set('preferred')} placeholder="例如：平日晚上 7 點後、週六下午" />
            </label>
            <label className="small">怎麼認識我們的（選填）
              <select value={f.source} onChange={set('source')}>
                <option value="">請選擇…</option>
                {REQUEST_SOURCES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
          </div>
          <p className="muted small">我們會用你在基本資料留的電話或 LINE 聯繫你。營業時間：週二至週日 10:00–20:30。</p>
          {err && <p className="error small">{err}</p>}
          <button className="btn primary block" disabled={busy} onClick={submit}>{busy ? '送出中…' : '送出申請'}</button>
        </section>
      )}
      {requests === null && err && <p className="error">{err}</p>}
    </main>
  )
}
