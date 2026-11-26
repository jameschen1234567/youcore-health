// 後台：模擬教材（上傳、換檔、公開）
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CATEGORIES, MAX_HTML_MB, adminSaveModule, listModules } from '../../lib/learning'

export default function AdminModules() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [editing, setEditing] = useState(null)
  const [err, setErr] = useState('')
  const reload = useCallback(() => listModules().then(setRows).catch(() => setErr('載入失敗')), [])
  useEffect(() => { reload() }, [reload])
  const done = async () => { setEditing(null); await reload() }
  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/admin')}>‹ 管理後台</button>
      <h1>模擬教材</h1>
      <p className="muted small">新增課程包會自動開通 3 個月；手動延長在「客戶頁 → 模擬教室權限」。勾「免費試玩」的單元，登入就能開。教材是單一 HTML 檔，上限 {MAX_HTML_MB} MB。</p>
      {err && <p className="error">{err}</p>}
      {editing === 'new' ? <Form onDone={done} onCancel={() => setEditing(null)} /> : <button className="btn primary block" onClick={() => setEditing('new')}>＋ 新增教材</button>}
      {(rows ?? []).map((m) => editing === m.id ? <Form key={m.id} m={m} onDone={done} onCancel={() => setEditing(null)} /> : (
        <section key={m.id} className="card">
          <div className="row spread"><b>{m.title}</b><span className="pill">{m.published ? (m.free ? '公開・免費試玩' : '公開') : '未公開'}</span></div>
          <p className="muted small">{m.summary}</p>
          <div className="row"><button className="btn ghost" onClick={() => setEditing(m.id)}>修改</button><Link className="btn ghost" to={`/learn/${m.id}`}>預覽</Link></div>
        </section>
      ))}
    </main>
  )
}

function Form({ m, onDone, onCancel }) {
  const [f, setF] = useState({ title: m?.title ?? '', summary: m?.summary ?? '', sort: m?.sort ?? 10, published: m?.published ?? false, category: m?.category ?? 'posture', free: m?.free ?? false })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function save() {
    if (!f.title.trim()) return setErr('請填名稱')
    if (!m && !file) return setErr('請選擇 HTML 檔')
    setBusy(true)
    setErr('')
    try { await adminSaveModule(m?.id, { ...f, title: f.title.trim(), sort: Number(f.sort) || 0, path: m?.path }, file); await onDone() } catch (e) { setErr(e?.message === 'TOO_LARGE' ? `檔案超過 ${MAX_HTML_MB} MB` : '儲存失敗'); setBusy(false) }
  }
  return (
    <section className="card">
      <div className="form-grid">
        <label className="small">名稱<input className="search" maxLength={60} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="small">說明<textarea rows={3} maxLength={300} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></label>
        <label className="small">分類<select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        <label className="small">排序（小的在前）<input className="search" type="number" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} /></label>
        <label className="small">{m ? '換檔（不選就不變）' : 'HTML 檔'}<input type="file" accept=".html,text/html" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        <label className="small check-row"><input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} />公開（期限內的客戶都看得到）</label>
        <label className="small check-row"><input type="checkbox" checked={f.free} onChange={(e) => setF({ ...f, free: e.target.checked })} />免費試玩（登入就能開）</label>
      </div>
      {err && <p className="error small">{err}</p>}
      <div className="row"><button className="btn ghost" disabled={busy} onClick={onCancel}>返回</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? '儲存中…' : '儲存'}</button></div>
    </section>
  )
}
