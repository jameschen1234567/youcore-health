// 客戶端：我的影像紀錄（會員限定）— 照片、Before/After、影片與教練講解
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { isMember } from '../lib/homework'
import { listMedia, signedUrls } from '../lib/media'
import MediaCard from '../components/MediaCard'
import { MessageButton } from '../components/MessageButton'

export default function MediaList() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const member = isMember(profile)
  const [rows, setRows] = useState(null)
  const [urls, setUrls] = useState({})
  const [err, setErr] = useState(false)

  useEffect(() => {
    if (!member) return
    listMedia(profile.id).then(async (m) => { setRows(m); setUrls(await signedUrls(m)) }).catch(() => setErr(true))
  }, [member, profile.id])

  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/training')}>‹ 訓練</button>
      <h1>我的影像紀錄</h1>
      {!member ? (
        <section className="card">
          <p>教練幫你拍的動作影片、Before／After 對照與講解，是會員專屬功能。</p>
          <MessageButton text="我想了解會員" label="傳 LINE 詢問會員" />
        </section>
      ) : (
        <section className="card">
          {err && <p className="error">載入失敗，請稍後再試</p>}
          {!rows && !err && <p className="muted">載入中…</p>}
          {rows && rows.length === 0 && <p className="muted">還沒有影像紀錄，上課時教練會幫你拍下來。</p>}
          {(rows ?? []).map((m) => <MediaCard key={m.id} m={m} urls={urls} />)}
          {rows && rows.length > 0 && <p className="muted small note">照片只有你和教練看得到；點照片可以放大。</p>}
        </section>
      )}
    </main>
  )
}
