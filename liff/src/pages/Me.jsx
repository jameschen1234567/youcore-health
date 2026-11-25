import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { listFootMeasurements, listOrders, requestDeletion } from '../lib/api'
import { buildReport, toCm } from '../lib/foot'
import { sortOrders } from '../lib/orders'
import { fmtDate } from '../lib/format'
import OrderCard from '../components/OrderCard'
import { DEMO } from '../config'
import ProfileInfoForm from '../components/ProfileInfoForm'
import InfoSummary from '../components/InfoSummary'
import { getProfileInfo, saveProfileInfo } from '../lib/training'
import { countMyUnread } from '../lib/feedback'

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

      <section className="card">
        <h2>預約</h2>
        <p className="muted small">第一次來可以申請體驗課程，由我們協助安排時間；已開通的會員可以直接線上預約。</p>
        <div className="row">
          <Link className="btn ghost" to="/booking/mine">我的預約</Link>
          <Link className="btn primary" to="/booking">預約／申請體驗</Link>
        </div>
      </section>

      <section className="card">
        <h2>線上直播</h2>
        <p className="muted small">課程會員專屬的直播與回放。</p>
        <div className="row"><Link className="btn ghost" to="/live">查看直播</Link></div>
      </section>

      <section className="card">
        <h2>互動模擬教室</h2>
        <p className="muted small">會員專屬的 3D 動作與肌肉骨骼模擬，動手玩、邊學邊懂。</p>
        <div className="row"><Link className="btn ghost" to="/learn">進入教室</Link></div>
      </section>

      <FeedbackCard profileId={profile.id} />

      <MyInfo profileId={profile.id} />

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
            <p className="muted">還沒量過腳或鞋墊，用尺就能量。</p>
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

function MyInfo({ profileId }) {
  const [info, setInfo] = useState(null)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => { getProfileInfo(profileId).then(setInfo).catch(() => setError(true)) }, [profileId])

  return (
    <section className="card">
      <div className="row spread head-row">
        <h2>基本資料</h2>
        {info && !editing && <button className="link-btn" onClick={() => setEditing(true)}>修改</button>}
      </div>
      {error && <p className="error small">基本資料載入失敗</p>}
      {info && (editing ? (
        <ProfileInfoForm initial={info} heightLocked={info.height_cm != null} onCancel={() => setEditing(false)}
          onSubmit={async (fields) => {
            // 身高已填過就不送出（只有教練能改）
            const payload = info.height_cm != null ? { ...fields, height_cm: info.height_cm } : fields
            await saveProfileInfo(profileId, { ...payload, info_completed_at: info.info_completed_at })
            setInfo({ ...info, ...payload })
            setEditing(false)
          }} />
      ) : <InfoSummary info={info} />)}
    </section>
  )
}

function FeedbackCard({ profileId }) {
  const [unread, setUnread] = useState(0)
  useEffect(() => { countMyUnread(profileId).then(setUnread).catch(() => {}) }, [profileId])
  return (
    <section className="card">
      <h2>意見回饋{unread > 0 && <span className="dot">{unread} 則新回覆</span>}</h2>
      <p className="muted small">使用上的問題或建議，都可以告訴我們。</p>
      <div className="row"><Link className={`btn ${unread ? 'primary' : 'ghost'}`} to="/feedback">{unread ? '看回覆' : '我要回饋'}</Link></div>
    </section>
  )
}
