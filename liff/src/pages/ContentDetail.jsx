import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getContent } from '../lib/api'
import { BOOKING_OPEN, LIFF_ID, LINE_OA_ID } from '../config'
import { MessageButton } from '../components/MessageButton'
import { copyLink, shareContent } from '../lib/share'
import Blocks, { VideoEmbed } from '../components/Blocks'
import { Cover } from './ContentHome'
import { isVideoFile } from '../lib/video'

export default function ContentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [item, setItem] = useState(undefined) // undefined = 載入中, null = 找不到
  const [error, setError] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
    getContent(id).then(setItem).catch(() => setError(true))
  }, [id])

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/'))

  if (error) return <Shell back={back}><p className="error">內容載入失敗，請稍後再試</p></Shell>
  if (item === undefined) return <Shell back={back}><p className="muted">載入中…</p></Shell>
  if (item === null) return <Shell back={back}><p className="muted">這篇內容已下架或不存在</p></Shell>

  // 短影音：優先用內文裡自己上傳的影片檔放在最上方（沒有 YouTube 介面），其次才用「影片連結」
  const body = item.body ?? []
  const ownVideo = item.type === 'video' ? body.find((b) => b.type === 'video' && isVideoFile(b.url)) : null
  const heroUrl = ownVideo?.url ?? item.video_url
  const rest = ownVideo ? body.filter((b) => b !== ownVideo) : body

  return (
    <Shell back={back}>
      {item.type === 'video'
        ? heroUrl ? <VideoEmbed url={heroUrl} title={item.title} /> : <Cover item={item} large />
        : item.type !== 'brand' && <Cover item={item} large />}

      <header className="article-head">
        {item.category.length > 0 && <p className="eyebrow">{item.category.join('・')}</p>}
        <h1>{item.title}</h1>
        {item.published_at && <p className="muted small">{item.published_at.replaceAll('-', '/')}</p>}
      </header>

      <article className="article">
        <Blocks blocks={rest} />
      </article>

      {item.type !== 'brand' && <ShareBar item={item} />}
      {item.related_service ? <ServiceCta service={item.related_service} /> : <JoinCta />}
    </Shell>
  )
}

function Shell({ back, children }) {
  return (
    <main className="page">
      <button className="back" onClick={back}>‹ 返回</button>
      {children}
    </main>
  )
}

// 分享給朋友：LINE 裡跳出好友選擇器，由客人自己傳送（不吃官方帳號的訊息額度）
function ShareBar({ item }) {
  const [msg, setMsg] = useState('')
  async function share() {
    setMsg('')
    const r = await shareContent(item).catch(() => 'error')
    if (r === 'picker') setMsg('已分享，謝謝你幫忙推薦 🙏')
    if (r === 'error') setMsg('分享失敗，可以改用「複製連結」')
  }
  async function copy() {
    try { await copyLink(item.id); setMsg('連結已複製，可以貼到 LINE、IG 或 FB') } catch { setMsg('無法複製，請長按網址列複製') }
  }
  return (
    <section className="card share-bar">
      <p className="small">覺得有幫助？分享給可能需要的朋友 💬</p>
      <div className="row">
        <button className="btn ghost" onClick={copy}>複製連結</button>
        <button className="btn primary" onClick={share}>分享給朋友</button>
      </div>
      {msg && <p className="small muted">{msg}</p>}
    </section>
  )
}

const LIFF_URL = (path) => `https://liff.line.me/${LIFF_ID}${path}`
const ADD_FRIEND_URL = LINE_OA_ID ? `https://line.me/R/ti/p/${encodeURIComponent(LINE_OA_ID)}` : null

function ServiceCta({ service }) {
  return (
    <section className="card cta">
      <p className="eyebrow">想進一步了解？</p>
      <h2>預約{service}</h2>
      <p className="muted">由臺師大運動科學背景的防護員親自評估，找出問題根源。</p>
      {BOOKING_OPEN ? <a className="btn primary block" href={LIFF_URL('/booking')}>預約／申請體驗</a> : <MessageButton text={`我想預約${service}`} label="傳 LINE 預約" />}
      {ADD_FRIEND_URL && <a className="btn ghost block" href={ADD_FRIEND_URL}>加入宥芯 LINE 好友</a>}
    </section>
  )
}

function JoinCta() {
  if (!ADD_FRIEND_URL) return null
  return (
    <section className="card cta">
      <p className="eyebrow">宥芯健筋療育所｜南港後山埤</p>
      <h2>想收到更多健康新知？</h2>
      <p className="muted">加入 LINE 好友，第一手看到新文章，也能申請體驗課程。</p>
      <a className="btn primary block" href={ADD_FRIEND_URL}>加入宥芯 LINE 好友</a>
    </section>
  )
}
