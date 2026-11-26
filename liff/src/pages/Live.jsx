// 線上直播：用 LINE 登入就能看。影片連結只有在開放時間內才會由資料庫給出
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fmtSlot } from '../lib/booking'
import { OPEN_BEFORE_MIN, PHASE_LABELS, getLiveVideo, listLive, liveEmbedUrl, liveErrorText } from '../lib/live'
import { MessageButton } from '../components/MessageButton'
import LiveChat from '../components/LiveChat'

/** 載入清單，並每分鐘更新一次狀態 */
function useLiveList() {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const reload = useCallback(() => listLive().then((r) => { setRows(r); setErr('') }).catch(() => setErr('載入失敗，請稍後再試')), [])
  useEffect(() => {
    reload()
    const t = setInterval(reload, 60000)
    return () => clearInterval(t)
  }, [reload])
  return { rows, err }
}

export default function Live() {
  const navigate = useNavigate()
  const { rows, err } = useLiveList()
  const member = rows?.[0]?.can_watch
  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/me')}>‹ 我的</button>
      <h1>線上直播</h1>
      {err && <p className="error">{err}</p>}
      {!rows && !err && <p className="muted">載入中…</p>}
      {rows?.length === 0 && <section className="card"><p className="muted">目前沒有安排直播，有新的場次會公布在這裡。</p></section>}
      {rows?.length > 0 && !member && (
        <section className="card">
          <p>🔒 目前無法觀看，請重新整理，或傳訊息給我們協助。</p>
          <MessageButton text="我想觀看線上直播" />
        </section>
      )}
      {(rows ?? []).map((s) => (
        <section key={s.id} className="card">
          <div className="row spread">
            <b>{s.title}</b>
            <span className={`pill live-${s.phase}`}>{s.phase === 'live' ? '🔴 ' : ''}{PHASE_LABELS[s.phase]}</span>
          </div>
          <p className="muted small">{fmtSlot(s.starts_at)}</p>
          {s.description && <p className="pre-line">{s.description}</p>}
          {s.can_watch && (s.phase === 'upcoming'
            ? <p className="muted small">開始前 {OPEN_BEFORE_MIN} 分鐘可以進入。</p>
            : <Link className="btn primary block" to={`/live/${s.id}`}>{s.phase === 'live' ? '進入直播' : '觀看回放'}</Link>)}
        </section>
      ))}
    </main>
  )
}

export function LiveWatch() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { rows } = useLiveList()
  const [video, setVideo] = useState(null)
  const [err, setErr] = useState('')

  const load = useCallback(() => getLiveVideo(id).then((v) => { setVideo(v); setErr('') }).catch((e) => { setVideo(null); setErr(liveErrorText(e)) }), [id])
  useEffect(() => { load() }, [load])

  const s = rows?.find((x) => x.id === id)
  // 場次結束、取消或資格失效（清單每分鐘更新）時收起播放器
  const closed = rows && (!s || !s.can_watch || s.phase === 'upcoming')
  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/live')}>‹ 線上直播</button>
      {video && !closed && (
        <div className="video">
          <iframe src={liveEmbedUrl(video)} title={s?.title ?? '線上直播'} allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" />
        </div>
      )}
      {!video && !err && <p className="muted">載入中…</p>}
      {err && <section className="card"><p>{err}</p><button className="btn ghost block" onClick={load}>重新整理</button></section>}
      {video && closed && <section className="card"><p>這場直播已經結束或目前無法觀看。</p></section>}
      {s && (
        <>
          <h1>{s.title}</h1>
          <p className="muted small">{fmtSlot(s.starts_at)}｜{PHASE_LABELS[s.phase]}</p>
          {s.description && <p className="pre-line">{s.description}</p>}
        </>
      )}
      {video && !closed && (
        <>
          <LiveChat streamId={id} />
          <p className="muted small">歡迎分享給需要的朋友，請勿錄影轉傳。</p>
          <MessageButton text={`我在看直播「${s?.title ?? ''}」，想請問：`} label="傳 LINE 提問" />
        </>
      )}
    </main>
  )
}
