// 一則影像紀錄（客戶端、後台共用）：照片／Before-After 並排／內嵌影片＋講解
import { KIND_LABEL, parseVideoUrl } from '../lib/media'

const fmt = (d) => d.replaceAll('-', '/')

export default function MediaCard({ m, urls, children }) {
  const video = m.kind === 'video' ? parseVideoUrl(m.video_url) : null
  return (
    <article className="media-card">
      <div className="row spread">
        <b>{m.title}</b>
        <span className="muted small">{fmt(m.taken_on)}｜{KIND_LABEL[m.kind]}</span>
      </div>
      {m.kind === 'photo' && <Photo url={urls[m.photo_path]} alt={m.title} />}
      {m.kind === 'compare' && (
        <div className="media-compare">
          <figure><Photo url={urls[m.photo_path]} alt={`${m.title} Before`} /><figcaption>Before</figcaption></figure>
          <figure><Photo url={urls[m.photo2_path]} alt={`${m.title} After`} /><figcaption>After</figcaption></figure>
        </div>
      )}
      {m.kind === 'video' && (video ? (
        <div className="media-video">
          <iframe src={video.embed} title={m.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" />
        </div>
      ) : <p className="error small">影片連結無法播放</p>)}
      {m.kind === 'video' && video?.provider === 'drive' && (
        <a className="link-btn small" href={m.video_url} target="_blank" rel="noreferrer">播放不了？在 Google 雲端開啟 ›</a>
      )}
      {m.note && <p className="media-note">{m.note}</p>}
      {children}
    </article>
  )
}

function Photo({ url, alt }) {
  if (!url) return <div className="media-ph muted small">照片載入中…</div>
  return <a href={url} target="_blank" rel="noreferrer"><img className="media-img" src={url} alt={alt} loading="lazy" /></a>
}
