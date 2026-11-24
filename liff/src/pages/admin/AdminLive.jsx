// 後台：直播管理（新增、修改、結束、取消）
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fmtSlot, taipei, taipeiDate, taipeiTime } from '../../lib/booking'
import { AUTO_END_HOURS, OPEN_BEFORE_MIN, PHASE_LABELS, adminListLive, adminSaveLive, livePhase, youtubeId } from '../../lib/live'
import { LIFF_ID } from '../../config'

export default function AdminLive() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | id
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState('')
  const reload = useCallback(() => adminListLive().then((r) => { setRows(r); setErr('') }).catch(() => setErr('載入失敗')), [])
  useEffect(() => { reload() }, [reload])
  const done = async () => { setEditing(null); await reload() }

  async function copy() {
    try { await navigator.clipboard.writeText(`https://liff.line.me/${LIFF_ID}/live`); setCopied('已複製直播頁連結') } catch { setCopied('無法複製') }
  }

  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/admin')}>‹ 管理後台</button>
      <h1>直播管理</h1>
      <p className="muted small">能觀看的客戶：已開通預約，或有未到期且有剩餘堂數的課程包。影片連結請用 YouTube「不公開」。</p>
      {err && <p className="error">{err}</p>}
      {editing === 'new'
        ? <LiveForm onCancel={() => setEditing(null)} onDone={done} />
        : <button className="btn primary block" onClick={() => setEditing('new')}>＋ 新增直播</button>}
      <button className="btn ghost block" onClick={copy}>複製直播頁連結</button>
      {copied && <p className="muted small">{copied}</p>}
      {rows?.length === 0 && <p className="muted">還沒有直播</p>}
      {(rows ?? []).map((s) => (editing === s.id
        ? <LiveForm key={s.id} s={s} onCancel={() => setEditing(null)} onDone={done} />
        : <LiveItem key={s.id} s={s} onEdit={() => setEditing(s.id)} onChanged={reload} />))}
    </main>
  )
}

function LiveItem({ s, onEdit, onChanged }) {
  const [confirm, setConfirm] = useState(null) // null | end | cancel
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const phase = livePhase(s)

  async function run(row) {
    setBusy(true)
    setErr('')
    try { await adminSaveLive(s.id, row); setConfirm(null); await onChanged() } catch { setErr('操作失敗，請稍後再試') } finally { setBusy(false) }
  }

  return (
    <section className="card">
      <div className="row spread">
        <b>{s.title}</b>
        <span className={`pill live-${phase}`}>{PHASE_LABELS[phase]}</span>
      </div>
      <p className="muted small">{fmtSlot(s.starts_at)}｜回放 {s.replay_days ? `${s.replay_days} 天` : '不開放'}</p>
      {!s.video_id && phase !== 'cancelled' && <p className="error small">還沒貼 YouTube 連結，客戶進來會看到「直播準備中」</p>}
      {err && <p className="error small">{err}</p>}
      {confirm ? (
        <div className="row confirm-row">
          <span className="small">{confirm === 'end' ? `結束直播？之後${s.replay_days ? '改為回放' : '客戶無法再觀看'}。` : '取消這場直播？客戶清單上會消失。'}</span>
          <button className="btn ghost" onClick={() => setConfirm(null)}>返回</button>
          <button className="btn danger" disabled={busy} onClick={() => run(confirm === 'end' ? { ended_at: new Date().toISOString() } : { cancelled: true })}>確定</button>
        </div>
      ) : (
        <div className="action-grid">
          <button className="btn ghost" onClick={onEdit}>修改</button>
          {(phase === 'live' || phase === 'replay') && s.video_id && <Link className="btn ghost" to={`/live/${s.id}`}>預覽</Link>}
          {phase === 'live' && <button className="btn primary" onClick={() => setConfirm('end')}>結束直播</button>}
          {phase === 'cancelled'
            ? <button className="btn ghost" disabled={busy} onClick={() => run({ cancelled: false })}>恢復</button>
            : <button className="btn ghost danger" onClick={() => setConfirm('cancel')}>{phase === 'upcoming' || phase === 'live' ? '取消場次' : '下架'}</button>}
        </div>
      )}
    </section>
  )
}

function LiveForm({ s, onCancel, onDone }) {
  const start = s ? new Date(s.starts_at) : null
  const [f, setF] = useState({
    title: s?.title ?? '', description: s?.description ?? '',
    date: taipeiDate(start ?? new Date()), time: start ? taipeiTime(start) : '20:00',
    url: s?.video_id ? `https://youtu.be/${s.video_id}` : '', replay: s?.replay_days ?? 30,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function save() {
    if (!f.title.trim()) return setErr('請填主題')
    if (!f.date || !f.time) return setErr('請選日期與時間')
    const video_id = f.url.trim() ? youtubeId(f.url) : null
    if (f.url.trim() && !video_id) return setErr('看不懂這個 YouTube 連結，請貼直播的觀看網址')
    const starts_at = taipei(f.date, f.time).toISOString()
    const row = { title: f.title.trim(), description: f.description.trim() || null, starts_at, video_id, replay_days: Number(f.replay) }
    // 已結束的場次改到未來時間 → 視為重新開放
    if (s?.ended_at && new Date(starts_at) > new Date()) row.ended_at = null
    setBusy(true)
    setErr('')
    try { await adminSaveLive(s?.id, row); await onDone() } catch { setErr('儲存失敗，請稍後再試'); setBusy(false) }
  }

  return (
    <section className="card">
      <h2>{s ? '修改直播' : '新增直播'}</h2>
      <div className="form-grid two-col">
        <label className="small full">主題 *<input className="search" maxLength={80} value={f.title} onChange={set('title')} placeholder="例如：久坐族肩頸自救" /></label>
        <label className="small">日期 *<input className="search" type="date" value={f.date} onChange={set('date')} /></label>
        <label className="small">開始時間 *<input className="search" type="time" value={f.time} onChange={set('time')} /></label>
        <label className="small full">YouTube 連結（可開播前再補）<input className="search" value={f.url} onChange={set('url')} placeholder="https://youtube.com/live/…" /></label>
        <label className="small full">回放
          <select value={f.replay} onChange={set('replay')}>
            {[...new Set([0, 7, 30, 90, Number(f.replay)])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n ? `結束後開放 ${n} 天` : '不開放回放'}</option>)}
          </select>
        </label>
        <label className="small full">說明<textarea rows={3} maxLength={500} value={f.description} onChange={set('description')} placeholder="選填" /></label>
        <p className="muted small full">開始前 {OPEN_BEFORE_MIN} 分鐘客戶可進入；忘記按「結束直播」會在開始後 {AUTO_END_HOURS} 小時自動結束。</p>
        {err && <p className="error small full">{err}</p>}
        <div className="row full">
          <button className="btn ghost" disabled={busy} onClick={onCancel}>返回</button>
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? '儲存中…' : '儲存'}</button>
        </div>
      </div>
    </section>
  )
}
