import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { listFootMeasurements, listOrders, requestDeletion } from '../lib/api'
import { buildReport, toCm } from '../lib/foot'
import { sortOrders } from '../lib/orders'
import { fmtDate } from '../lib/format'
import OrderCard from '../components/OrderCard'
import { DEMO } from '../config'

export default function Me() {
  const { profile } = useAuth()
  const [deletion, setDeletion] = useState('idle') // idle | confirm | sent | error
  const [orders, setOrders] = useState(null)
  const [foot, setFoot] = useState(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    Promise.all([listOrders(profile.id), listFootMeasurements(profile.id)])
      .then(([o, f]) => { setOrders(sortOrders(o)); setFoot(buildReport(f)) })
      .catch(() => setLoadError(true))
  }, [profile.id])

  const confirmDeletion = async () => {
    try {
      await requestDeletion(profile.id)
      setDeletion('sent')
    } catch {
      setDeletion('error')
    }
  }

  return (
    <main className="page">
      <h1>我的</h1>

      <section className="card">
        <p className="muted small">LINE 名稱</p>
        <p className="big">{profile.display_name || '未命名'}</p>
        {DEMO && <p className="tag">Demo 模式</p>}
      </section>

      {profile.role === 'admin' && (
        <Link className="btn primary block" to="/admin">進入管理後台</Link>
      )}

      {loadError && <p className="error">資料載入失敗，請稍後再試</p>}

      <section className="card">
        <h2>我的足型報告</h2>
        {foot && (foot.left || foot.right) ? (
          <>
            <p className="muted small">
              {foot.left && `左腳 ${toCm(foot.left.length_mm)} cm`}
              {foot.left && foot.right && '｜'}
              {foot.right && `右腳 ${toCm(foot.right.length_mm)} cm`}
            </p>
            <div className="row"><Link className="btn ghost" to="/foot">看完整報告</Link></div>
          </>
        ) : (
          <>
            <p className="muted">還沒做過足部初篩，用一張 A4 紙就能量。</p>
            <div className="row"><Link className="btn ghost" to="/foot">開始量測</Link></div>
          </>
        )}
      </section>

      <h2 className="section-title">產品訂單</h2>
      {orders && orders.length === 0 && (
        <section className="card">
          <p className="muted">到店評估後，鞋墊、五指鞋、拖鞋的製作進度會顯示在這裡；可以取件時也會用 LINE 通知你。</p>
        </section>
      )}
      {orders?.map((o) => (
        <OrderCard key={o.id} order={o}>
          <p className="muted small">建立於 {fmtDate(o.created_at)}</p>
        </OrderCard>
      ))}

      <section className="card">
        <h2>個人資料</h2>
        {deletion === 'idle' && (
          <button className="btn ghost danger" onClick={() => setDeletion('confirm')}>
            申請刪除我的全部資料
          </button>
        )}
        {deletion === 'confirm' && (
          <div className="confirm">
            <p>送出後，我們會刪除您的量表、足部照片、量測結果與訂單紀錄，刪除後無法復原。確定要申請嗎？</p>
            <div className="row">
              <button className="btn ghost" onClick={() => setDeletion('idle')}>取消</button>
              <button className="btn danger" onClick={confirmDeletion}>確定申請</button>
            </div>
          </div>
        )}
        {deletion === 'sent' && <p>已收到您的申請，我們會盡快處理並通知您。</p>}
        {deletion === 'error' && <p className="error">送出失敗，請稍後再試，或直接聯繫客服。</p>}
      </section>
    </main>
  )
}
