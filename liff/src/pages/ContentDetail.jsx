import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getContent } from '../lib/api'
import { LINE_OA_ID } from '../config'
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

      {item.related_service && <ServiceCta service={item.related_service} />}
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

function ServiceCta({ service }) {
  const href = LINE_OA_ID ? `https://line.me/R/oaMessage/${encodeURIComponent(LINE_OA_ID)}/?${encodeURIComponent(`我想預約${service}`)}` : null
  return (
    <section className="card cta">
      <p className="eyebrow">想進一步了解？</p>
      <h2>預約{service}</h2>
      <p className="muted">由臺師大運動科學背景的防護員親自評估，找出問題根源。</p>
      {href
        ? <a className="btn primary block" href={href}>傳 LINE 預約</a>
        : <button className="btn primary block" disabled>預約功能即將推出</button>}
    </section>
  )
}
