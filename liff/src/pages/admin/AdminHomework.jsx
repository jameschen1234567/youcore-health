// 後台客戶頁：回家作業指派、打勾進度、點數加減
import { useCallback, useEffect, useState } from 'react'
import {
  STATUS_LABEL, addDays, adminAdjustPoints, adminArchiveHomework, adminDeleteHomework, adminSaveHomework,
  daySpan, homeworkStatus, listHomework, listPoints, pointsBalance, todayTaipei, validateHomework,
} from '../../lib/homework'

const fmt = (d) => d.replaceAll('-', '/')
const fmtTs = (iso) => new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric' }).format(new Date(iso))
const blank = () => {
  const t = todayTaipei()
  return { title: '', detail: '', link: '', starts_on: t, ends_on: addDays(t, 13), target_days: 10, points: 10 }
}

export default function AdminHomework({ profileId, memberNo }) {
  const [rows, setRows] = useState(null)
  const [points, setPoints] = useState([])
  const [editing, setEditing] = useState(null)
  const [showOld, setShowOld] = useState(false)
  const [err, setErr] = useState('')

  const reload = useCallback(() => Promise.all([listHomework(profileId), listPoints(profileId)])
    .then(([h, p]) => { setRows(h); setPoints(p) })
    .catch(() => setErr('回家作業載入失敗')), [profileId])
  useEffect(() => { reload() }, [reload])

  const withSt = (rows ?? []).map((h) => ({ ...h, st: homeworkStatus(h, h.days.length) }))
  const current = withSt.filter((h) => h.st === 'active' || h.st === 'upcoming')
  const old = withSt.filter((h) => !(h.st === 'active' || h.st === 'upcoming'))

  return (
    <section className="card">
      <div className="row spread head-row">
        <h2>回家作業與點數</h2>
        <span className="pill">{pointsBalance(points)} 點</span>
      </div>
      {!memberNo && <p className="tag warn">還沒有會員編號：客人看得到作業，但不能打勾（會員限定）</p>}
      {err && <p className="error small">{err}</p>}
      {rows && current.length === 0 && !editing && <p className="muted small">目前沒有進行中的作業</p>}
      {current.map((h) => <HwItem key={h.id} h={h} profileId={profileId} onEdit={() => setEditing({ ...h, detail: h.detail ?? '', link: h.link ?? '' })} onChanged={reload} />)}
      {old.length > 0 && (
        <>
          <button className="link-btn" onClick={() => setShowOld(!showOld)}>已達成／已結束／已封存（{old.length}）{showOld ? '▾' : '▸'}</button>
          {showOld && old.map((h) => <HwItem key={h.id} h={h} profileId={profileId} onEdit={() => setEditing({ ...h, detail: h.detail ?? '', link: h.link ?? '' })} onChanged={reload} />)}
        </>
      )}
      {editing
        ? <HwEditor value={editing} onChange={setEditing} profileId={profileId} onCancel={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload() }} />
        : <button className="btn ghost block" onClick={() => setEditing(blank())}>＋ 指派回家作業</button>}
      <PointsPanel profileId={profileId} rows={points} onChanged={reload} />
    </section>
  )
}

function HwItem({ h, profileId, onEdit, onChanged }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const n = h.days.length
  const pct = Math.min(100, Math.round((n / h.target_days) * 100))
  const act = async (fn) => { setBusy(true); try { await fn(); await onChanged() } finally { setBusy(false); setConfirm(false) } }
  return (
    <div className="hw-item">
      <div className="row spread"><b>{h.title}</b><span className="pill">{STATUS_LABEL[h.st]}</span></div>
      {h.detail && <p className="small hw-detail">{h.detail}</p>}
      <div className="progress"><div style={{ width: `${pct}%` }} /></div>
      <p className="muted small">
        {n}／{h.target_days} 天｜{fmt(h.starts_on)}～{fmt(h.ends_on)}｜{h.points} 點
        {h.completed_at && `｜${fmtTs(h.completed_at)} 達成`}
      </p>
      {n > 0 && <p className="muted small">打勾日：{h.days.map((d) => d.slice(5).replace('-', '/')).join('、')}</p>}
      {confirm ? (
        <div className="row confirm-row">
          <span className="small">刪除這項作業與打勾紀錄？{h.completed_at && '已發的點數會保留。'}無法復原。</span>
          <button className="btn ghost" disabled={busy} onClick={() => setConfirm(false)}>取消</button>
          <button className="btn danger" disabled={busy} onClick={() => act(() => adminDeleteHomework(profileId, h.id))}>確定刪除</button>
        </div>
      ) : (
        <div className="row">
          <button className="link-btn" onClick={onEdit}>修改</button>
          <button className="link-btn" disabled={busy} onClick={() => act(() => adminArchiveHomework(profileId, h.id, !h.archived))}>{h.archived ? '取消封存' : '封存'}</button>
          <button className="link-btn danger-text" onClick={() => setConfirm(true)}>刪除</button>
        </div>
      )}
    </div>
  )
}

function HwEditor({ value: v, onChange, profileId, onCancel, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => onChange({ ...v, [k]: e.target.value })
  const span = v.starts_on && v.ends_on && v.ends_on >= v.starts_on ? daySpan(v.starts_on, v.ends_on) : null

  async function save() {
    const e = validateHomework(v)
    if (e) return setErr(e)
    setBusy(true); setErr('')
    try { await adminSaveHomework(profileId, v); await onSaved() }
    catch { setErr('儲存失敗，請稍後再試'); setBusy(false) }
  }

  return (
    <div className="session-editor">
      <label className="small">作業名稱<input className="search" value={v.title} maxLength={60} onChange={set('title')} placeholder="例如：腳趾抓地站 每天 3 組" /></label>
      <label className="small">說明（選填）<textarea className="search" rows={3} value={v.detail} maxLength={500} onChange={set('detail')} placeholder="動作重點、組數、注意事項" /></label>
      <label className="small">教學連結（選填）<input className="search" value={v.link} maxLength={500} onChange={set('link')} placeholder="https://…（互動教室或文章）" /></label>
      <div className="form-grid two-col">
        <label className="small">開始日<input className="search" type="date" value={v.starts_on} onChange={set('starts_on')} /></label>
        <label className="small">結束日<input className="search" type="date" value={v.ends_on} onChange={set('ends_on')} /></label>
      </div>
      <div className="form-grid two-col">
        <label className="small">目標天數{span && `（期間共 ${span} 天）`}<input className="search" type="number" inputMode="numeric" min="1" value={v.target_days} onChange={set('target_days')} /></label>
        <label className="small">達成可得點數<input className="search" type="number" inputMode="numeric" min="0" max="1000" value={v.points} onChange={set('points')} /></label>
      </div>
      <p className="muted small">客人每天可打勾一次（也能補勾昨天）；打勾天數達到目標時自動發點，每項作業只發一次。</p>
      {err && <p className="error small">{err}</p>}
      <div className="row">
        <button className="btn ghost" disabled={busy} onClick={onCancel}>取消</button>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? '儲存中…' : v.id ? '儲存修改' : '指派作業'}</button>
      </div>
    </div>
  )
}

function PointsPanel({ profileId, rows, onChanged }) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    setBusy(true); setErr('')
    try { await adminAdjustPoints(profileId, amount, reason); setAmount(''); setReason(''); await onChanged() }
    catch (e) { setErr(e.message === 'BAD_AMOUNT' ? '點數請填非 0 的整數（負數＝扣點）' : e.message === 'NO_REASON' ? '請填原因' : '儲存失敗') }
    finally { setBusy(false) }
  }

  return (
    <>
      <button className="link-btn" onClick={() => setOpen(!open)}>點數紀錄與加減點（{rows.length}）{open ? '▾' : '▸'}</button>
      {open && (
        <div>
          <div className="form-grid two-col">
            <label className="small">點數（負數＝扣點）<input className="search" type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="例如 -30" /></label>
            <label className="small">原因<input className="search" value={reason} maxLength={100} onChange={(e) => setReason(e.target.value)} placeholder="例如：兌換專屬文章" /></label>
          </div>
          {err && <p className="error small">{err}</p>}
          <button className="btn ghost" disabled={busy || amount === '' || !reason.trim()} onClick={save}>{busy ? '儲存中…' : '送出'}</button>
          <ul className="history">
            {rows.map((r) => (
              <li key={r.id}><span className="small">{fmtTs(r.created_at)} {r.reason}</span><b className={r.amount > 0 ? 'good-text' : 'danger-text'}>{r.amount > 0 ? '+' : ''}{r.amount}</b></li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
