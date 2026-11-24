// 後台：直播主持畫面（不播影片，避免回音；專心看留言）
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fmtSlot } from '../../lib/booking'
import { adminListLive, livePhase, PHASE_LABELS } from '../../lib/live'
import LiveChat from '../../components/LiveChat'

export default function AdminLiveHost() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [s, setS] = useState(undefined)
  const [err, setErr] = useState('')
  useEffect(() => { adminListLive().then((r) => setS(r.find((x) => x.id === id) ?? null)).catch(() => setErr('載入失敗')) }, [id])

  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/admin/live')}>‹ 直播管理</button>
      <h1>主持畫面</h1>
      {err && <p className="error">{err}</p>}
      {s === null && <p className="muted">找不到這場直播</p>}
      {s && (
        <>
          <p className="muted small">{s.title}｜{fmtSlot(s.starts_at)}｜{PHASE_LABELS[livePhase(s)]}</p>
          <LiveChat streamId={id} host />
          <Link className="link-btn" to={`/live/${id}`}>看觀眾畫面 ›</Link>
        </>
      )}
    </main>
  )
}
