// 渲染 notion-sync 存下來的簡化 blocks（格式見 supabase/functions/notion-sync/mapping.ts）
import { toEmbedUrl, isVertical } from '../lib/video'

export function RichText({ parts = [] }) {
  return parts.map((p, i) => {
    let node = p.text
    if (p.code) node = <code>{node}</code>
    if (p.bold) node = <strong>{node}</strong>
    if (p.italic) node = <em>{node}</em>
    if (p.underline) node = <u>{node}</u>
    if (p.strikethrough) node = <s>{node}</s>
    if (p.href) node = <a href={p.href} target="_blank" rel="noopener noreferrer">{node}</a>
    return <span key={i}>{node}</span>
  })
}

export function VideoEmbed({ url, title = '影片' }) {
  const src = toEmbedUrl(url)
  if (!src) return <a className="link-card" href={url} target="_blank" rel="noopener noreferrer">{url}</a>
  return (
    <div className={`video ${isVertical(url) ? 'vertical' : ''}`}>
      <iframe src={src} title={title} loading="lazy" allowFullScreen
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" />
    </div>
  )
}

// 把連續的清單項目包成 <ul>／<ol>
function group(blocks) {
  const out = []
  for (const b of blocks) {
    const listType = b.type === 'bulleted_list_item' ? 'ul' : b.type === 'numbered_list_item' ? 'ol' : null
    const last = out[out.length - 1]
    if (listType && last?.list === listType) last.items.push(b)
    else if (listType) out.push({ list: listType, items: [b] })
    else out.push(b)
  }
  return out
}

export default function Blocks({ blocks = [] }) {
  return group(blocks).map((b, i) => {
    if (b.list) {
      const List = b.list
      return (
        <List key={i}>
          {b.items.map((it, j) => (
            <li key={j}><RichText parts={it.text} />{it.children && <Blocks blocks={it.children} />}</li>
          ))}
        </List>
      )
    }
    return <Block key={i} b={b} />
  })
}

function Block({ b }) {
  const kids = b.children ? <Blocks blocks={b.children} /> : null
  switch (b.type) {
    case 'paragraph':
      return <><p className="para"><RichText parts={b.text} /></p>{kids}</>
    case 'heading_1':
      return <h2 className="h-1"><RichText parts={b.text} /></h2>
    case 'heading_2':
      return <h3 className="h-2"><RichText parts={b.text} /></h3>
    case 'heading_3':
      return <h4 className="h-3"><RichText parts={b.text} /></h4>
    case 'quote':
      return <blockquote><RichText parts={b.text} />{kids}</blockquote>
    case 'callout':
      return (
        <div className="callout">
          {b.icon && <span className="callout-icon" aria-hidden="true">{b.icon}</span>}
          <div><RichText parts={b.text} />{kids}</div>
        </div>
      )
    case 'toggle':
      return <details className="toggle"><summary><RichText parts={b.text} /></summary>{kids}</details>
    case 'divider':
      return <hr />
    case 'image':
      return (
        <figure>
          <img src={b.src} alt={b.caption?.map((c) => c.text).join('') || ''} loading="lazy" />
          {b.caption?.length > 0 && <figcaption><RichText parts={b.caption} /></figcaption>}
        </figure>
      )
    case 'video':
      return <VideoEmbed url={b.url} />
    case 'embed':
      return toEmbedUrl(b.url) ? <VideoEmbed url={b.url} /> : <a className="link-card" href={b.url} target="_blank" rel="noopener noreferrer">{b.url}</a>
    case 'bookmark':
      return <a className="link-card" href={b.url} target="_blank" rel="noopener noreferrer">{b.url}</a>
    default:
      return null
  }
}
