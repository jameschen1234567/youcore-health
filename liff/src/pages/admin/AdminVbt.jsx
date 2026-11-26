// 後台工具：VBT 速度與體態（只給管理員）
//   工具 HTML 放在私有 bucket「staff-tools」，storage 規則只允許管理員下載（supabase/migrations/0026_staff_tools.sql）
//   原始碼：Downloads\youcore-vbt\index.html；學員紀錄存在這支手機的瀏覽器，不進資料庫
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DEMO } from '../../config'
import { supabase } from '../../lib/supabase'

const WEB_URL = 'https://youcore-health.vercel.app/admin/vbt'

export default function AdminVbt() {
  const navigate = useNavigate()
  const [html, setHtml] = useState('')
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    let alive = true
    const load = DEMO
      ? Promise.resolve('<!doctype html><meta charset="utf-8"><p style="font:18px sans-serif;padding:24px">示範模式：VBT 工具</p>')
      : supabase.storage.from('staff-tools').download('vbt.html').then(({ data, error }) => { if (error) throw error; return data.text() })
    load.then((h) => alive && setHtml(h)).catch(() => alive && setErr('工具載入失敗：請確認網路，或確認你是管理員帳號。'))
    return () => { alive = false }
  }, [])
  const copy = () => navigator.clipboard?.writeText(WEB_URL).then(() => setCopied(true), () => {})
  return (
    <main className="page learn-view">
      <button className="back" onClick={() => navigate('/admin')}>‹ 後台</button>
      <p className="muted small">
        在 LINE 裡如果打不開鏡頭，請改用 Safari／Chrome 開 <b>{WEB_URL}</b>{' '}
        <button className="link-btn" onClick={copy}>{copied ? '已複製' : '複製網址'}</button>
      </p>
      {err && <section className="card"><p>{err}</p></section>}
      {!html && !err && <p className="muted">載入中…</p>}
      {/* 這是自家後台工具：需要同源才能用鏡頭、存紀錄（IndexedDB）與下載 CSV */}
      {html && (
        <iframe
          title="VBT 速度與體態"
          sandbox="allow-scripts allow-same-origin allow-downloads allow-modals"
          allow="camera; autoplay; screen-wake-lock; fullscreen"
          srcDoc={html}
        />
      )}
    </main>
  )
}
