// 衛教首頁：文章／短影音／關於宥芯 三個分段，文章與短影音可依分類篩選
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listContent } from '../lib/api'
import About from './About'

const SEGMENTS = [
  { key: 'article', label: '衛教文章' },
  { key: 'video', label: '短影音' },
  { key: 'brand', label: '關於宥芯' },
]

export default function ContentHome() {
  const [params, setParams] = useSearchParams()
  const seg = SEGMENTS.some((s) => s.key === params.get('tab')) ? params.get('tab') : 'article'
  const [cat, setCat] = useState('全部')
  const [items, setItems] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setItems(null)
    setError(false)
    setCat('全部')
    listContent(seg).then(setItems).catch(() => setError(true))
  }, [seg])

  const categories = useMemo(
    () => ['全部', ...new Set((items ?? []).flatMap((i) => i.category))],
    [items],
  )
  const shown = (items ?? []).filter((i) => cat === '全部' || i.category.includes(cat))

  return (
    <main className="page">
      <h1>衛教專區</h1>

      <div className="segmented" role="tablist">
        {SEGMENTS.map((s) => (
          <button key={s.key} role="tab" aria-selected={seg === s.key}
            className={seg === s.key ? 'on' : ''} onClick={() => setParams({ tab: s.key }, { replace: true })}>
            {s.label}
          </button>
        ))}
      </div>

      {seg === 'brand' ? (
        <About items={items} error={error} />
      ) : (
        <>
          {categories.length > 2 && (
            <div className="chips" aria-label="分類篩選">
              {categories.map((c) => (
                <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>
              ))}
            </div>
          )}
          {error && <p className="error">內容載入失敗，請稍後再試</p>}
          {!error && items === null && <p className="muted">載入中…</p>}
          {!error && items && shown.length === 0 && <section className="card empty"><p className="muted">這個分類還沒有內容</p></section>}
          <div className="content-list">
            {shown.map((item) => <ContentCard key={item.id} item={item} />)}
          </div>
        </>
      )}
    </main>
  )
}

export function ContentCard({ item }) {
  return (
    <Link to={`/content/${item.id}`} className="content-card">
      <Cover item={item} />
      <div className="content-card-body">
        {item.category.length > 0 && <p className="eyebrow">{item.category.join('・')}</p>}
        <h2>{item.title}</h2>
        {item.published_at && <p className="muted small">{item.published_at.replaceAll('-', '/')}</p>}
      </div>
    </Link>
  )
}

export function Cover({ item, large = false }) {
  if (item.cover_url) {
    return <img className={`cover ${large ? 'large' : ''}`} src={item.cover_url} alt="" loading="lazy" />
  }
  // 沒封面時用品牌色塊
  return (
    <div className={`cover placeholder ${large ? 'large' : ''}`} aria-hidden="true">
      <span>{item.type === 'video' ? '▶' : item.category[0] ?? 'YouCore'}</span>
    </div>
  )
}
