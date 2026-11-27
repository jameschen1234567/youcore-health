// 後台客戶頁：影像紀錄（影像同意、上傳照片／對照、貼影片連結、講解）
import { useCallback, useEffect, useState } from 'react'
import {
  KIND_LABEL, adminDeleteMedia, adminSaveMedia, adminSetMediaConsent, getMediaConsent, listMedia, signedUrls, validateMedia,
} from '../../lib/media'
import { listTrainingSessions, todayTaipei } from '../../lib/training'
import MediaCard from '../../components/MediaCard'

const fmtDate = (iso) => new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(iso))
const blank = (kind = 'photo') => ({ kind, title: '', note: '', taken_on: todayTaipei(), session_id: '', video_url: '', file1: null, file2: null })

export default function AdminMedia({ profileId, memberNo }) {
  const [consent, setConsent] = useState(undefined)
  const [rows, setRows] = useState(null)
  const [urls, setUrls] = useState({})
  const [sessions, setSessions] = useState([])
  const [editing, setEditing] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [c, m, s] = await Promise.all([getMediaConsent(profileId), listMedia(profileId), listTrainingSessions(profileId)])
      setConsent(c); setRows(m); setSessions([...s].reverse())
      setUrls(await signedUrls(m))
    } catch { setErr('影像紀錄載入失敗') }
  }, [profileId])
  useEffect(() => { reload() }, [reload])

  async function toggleConsent(on) {
    setBusy(true); setErr('')
    try { setConsent(await adminSetMediaConsent(profileId, on)) } catch { setErr('更新同意狀態失敗') } finally { setBusy(false) }
  }

  return (
    <section className="card">
      <div className="row spread head-row">
        <h2>影像紀錄（{rows?.length ?? '…'}）</h2>
        <span className="pill private">本人＋後台可見</span>
      </div>
      {err && <p className="error small">{err}</p>}
      <label className="row small consent-row">
        <input type="checkbox" checked={!!consent} disabled={busy || consent === undefined} onChange={(e) => toggleConsent(e.target.checked)} />
        <span>已取得此客人的影像拍攝與保存同意{consent && `（${fmtDate(consent)} 勾選）`}</span>
      </label>
      {!memberNo && <p className="tag warn">還沒有會員編號：客人端看不到影像紀錄（會員限定）</p>}

      {(rows ?? []).map((m) => (
        <MediaCard key={m.id} m={m} urls={urls}>
          <MediaActions m={m} profileId={profileId} onEdit={() => setEditing({ ...blank(m.kind), ...m, note: m.note ?? '', session_id: m.session_id ?? '', video_url: m.video_url ?? '' })} onChanged={reload} />
        </MediaCard>
      ))}

      {editing
        ? <MediaEditor value={editing} onChange={setEditing} sessions={sessions} profileId={profileId}
            onCancel={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload() }} />
        : consent
          ? <button className="btn ghost block" onClick={() => setEditing(blank())}>＋ 新增影像</button>
          : <p className="muted small">勾選影像同意後才能新增。</p>}
      <p className="muted small">照片會自動壓縮（長邊 1400 px），存在私有空間，只有客人本人與你看得到。影片請上傳到 Google 雲端（共用設定「知道連結的人都能查看」）或 YouTube 不公開影片，再貼連結。</p>
    </section>
  )
}

function MediaActions({ m, profileId, onEdit, onChanged }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  if (confirm) {
    return (
      <div className="row confirm-row">
        <span className="small">刪除這則影像？{m.kind !== 'video' && '照片檔會一起刪除，'}無法復原。</span>
        <button className="btn ghost" disabled={busy} onClick={() => setConfirm(false)}>取消</button>
        <button className="btn danger" disabled={busy} onClick={async () => { setBusy(true); try { await adminDeleteMedia(profileId, m); await onChanged() } finally { setBusy(false) } }}>
          {busy ? '刪除中…' : '確定刪除'}
        </button>
      </div>
    )
  }
  return (
    <div className="row">
      <button className="link-btn" onClick={onEdit}>修改講解</button>
      <button className="link-btn danger-text" onClick={() => setConfirm(true)}>刪除</button>
    </div>
  )
}

function MediaEditor({ value: v, onChange, sessions, profileId, onCancel, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => onChange({ ...v, [k]: e.target.value })
  const setFile = (k) => (e) => onChange({ ...v, [k]: e.target.files?.[0] ?? null })

  async function save() {
    const e = validateMedia(v)
    if (e) return setErr(e)
    setBusy(true); setErr('')
    try { await adminSaveMedia(profileId, v); await onSaved() }
    catch (x) { setErr(x.message === 'UNREADABLE_IMAGE' ? '照片讀不到，請換一張（或先轉成 JPG）' : '儲存失敗，請稍後再試'); setBusy(false) }
  }

  return (
    <div className="session-editor">
      {!v.id && (
        <div className="chips media-kinds">
          {Object.entries(KIND_LABEL).map(([k, l]) => (
            <button key={k} className={`chip ${v.kind === k ? 'on' : ''}`} onClick={() => onChange({ ...v, kind: k })}>{l}</button>
          ))}
        </div>
      )}
      <label className="small">標題<input className="search" value={v.title} maxLength={60} onChange={set('title')} placeholder="例如：深蹲側面 第 4 週" /></label>
      <div className="form-grid two-col">
        <label className="small">日期<input className="search" type="date" value={v.taken_on} onChange={set('taken_on')} /></label>
        <label className="small">連到訓練紀錄（選填）
          <select className="search" value={v.session_id} onChange={set('session_id')}>
            <option value="">不連結</option>
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.session_date.replaceAll('-', '/')}</option>)}
          </select>
        </label>
      </div>
      {!v.id && v.kind === 'photo' && <label className="small">照片<input type="file" accept="image/*" onChange={setFile('file1')} /></label>}
      {!v.id && v.kind === 'compare' && (
        <div className="form-grid two-col">
          <label className="small">Before<input type="file" accept="image/*" onChange={setFile('file1')} /></label>
          <label className="small">After<input type="file" accept="image/*" onChange={setFile('file2')} /></label>
        </div>
      )}
      {v.kind === 'video' && (
        <label className="small">影片連結<input className="search" value={v.video_url} maxLength={500} onChange={set('video_url')} placeholder="https://drive.google.com/file/d/…/view 或 YouTube" /></label>
      )}
      <label className="small">講解給客人看（選填）<textarea className="search" rows={5} value={v.note} maxLength={2000} onChange={set('note')} placeholder="這次動作哪裡進步、哪裡要注意、下次的重點" /></label>
      {err && <p className="error small">{err}</p>}
      <div className="row">
        <button className="btn ghost" disabled={busy} onClick={onCancel}>取消</button>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? '上傳中…' : v.id ? '儲存修改' : '新增'}</button>
      </div>
    </div>
  )
}
