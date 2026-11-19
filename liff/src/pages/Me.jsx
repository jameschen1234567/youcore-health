import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { requestDeletion } from '../lib/api'
import { DEMO } from '../config'

export default function Me() {
  const { profile } = useAuth()
  const [deletion, setDeletion] = useState('idle') // idle | confirm | sent | error

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
        <h2>我的足型報告</h2>
        <p className="muted">完成足部初篩後會顯示在這裡（里程碑 4）</p>
      </section>

      <section className="card">
        <h2>產品訂單</h2>
        <p className="muted">到店評估後，鞋墊、五指鞋、拖鞋的製作進度會顯示在這裡（里程碑 5）</p>
      </section>

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
