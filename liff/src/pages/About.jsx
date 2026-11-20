// 關於宥芯：Notion 品牌頁＋固定的店家資訊
import { Link } from 'react-router-dom'

const STUDIO = {
  address: '台北市南港區成福路 51 之 3 號 1 樓',
  near: '鄰近後山埤捷運站、玉成公園',
  phone: '(02)2653-9433',
  hours: '週二至週日 10:00–20:30（週一公休）',
}

export default function About({ items, error }) {
  return (
    <>
      <section className="card brand-hero">
        <p className="eyebrow">YouCore Health Advisors</p>
        <h2>宥芯健筋療育所</h2>
        <p>以運動醫學與科學防護為基底，把職業運動員等級的檢測、修復與訓練，帶給每一位想好好動、好好生活的人。</p>
        <p className="slogan">Your Health, Our Core Mission</p>
      </section>

      {error && <p className="error">內容載入失敗，請稍後再試</p>}
      {(items ?? []).map((item) => (
        <Link key={item.id} to={`/content/${item.id}`} className="card row-link">
          <span>{item.title}</span>
          <span aria-hidden="true">›</span>
        </Link>
      ))}

      <section className="card">
        <h2>店家資訊</h2>
        <dl className="info">
          <dt>地址</dt>
          <dd>
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(STUDIO.address)}`} target="_blank" rel="noopener noreferrer">{STUDIO.address}</a>
            <br /><span className="muted small">{STUDIO.near}</span>
          </dd>
          <dt>電話</dt>
          <dd><a href={`tel:${STUDIO.phone.replace(/[^\d]/g, '')}`}>{STUDIO.phone}</a></dd>
          <dt>營業時間</dt>
          <dd>{STUDIO.hours}</dd>
        </dl>
      </section>
    </>
  )
}
