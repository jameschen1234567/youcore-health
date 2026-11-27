// 後台：食物清單管理（新增／修改外食品項；食藥署食材只能停用）
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminSaveFood, adminSetFoodActive, listFoods, validateFood } from '../../lib/diet'

const blank = () => ({ name: '', category: '外食', portion_label: '1 份', portion_g: '', kcal_portion: '', protein_portion: '', source: '' })

export default function AdminFoods() {
  const navigate = useNavigate()
  const [foods, setFoods] = useState(null)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)
  const [err, setErr] = useState('')
  const reload = () => listFoods({ all: true }).then(setFoods).catch(() => setErr('載入失敗'))
  useEffect(() => { reload() }, [])

  const shown = (foods ?? []).filter((f) => !q.trim() || f.name.includes(q.trim()) || f.category.includes(q.trim()))
  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/admin')}>‹ 管理後台</button>
      <h1>食物清單（{foods?.length ?? '…'}）</h1>
      {err && <p className="error">{err}</p>}
      {editing
        ? <FoodEditor value={editing} onChange={setEditing} onCancel={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload() }} />
        : <button className="btn primary block" onClick={() => setEditing(blank())}>＋ 新增外食品項</button>}
      <input className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋名稱或分類" />
      <section className="card">
        <ul className="history">
          {shown.map((f) => (
            <li key={f.id} className={f.active ? '' : 'muted'}>
              <span>
                <b>{f.name}</b> <span className="muted small">{f.category}｜{f.portion_label}{f.portion_g ? `（${f.portion_g} g）` : ''}</span><br />
                <span className="small">{Math.round(f.kcal_portion)} 大卡{f.protein_portion != null && `｜蛋白質 ${f.protein_portion} g`}</span>
                <span className="muted small">｜{f.source}</span>
              </span>
              <span className="row">
                {f.is_custom && <button className="link-btn small" onClick={() => setEditing({ ...f, portion_g: f.portion_g ?? '', protein_portion: f.protein_portion ?? '' })}>修改</button>}
                <button className="link-btn small" onClick={async () => { await adminSetFoodActive(f.id, !f.active); await reload() }}>{f.active ? '停用' : '啟用'}</button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

function FoodEditor({ value: v, onChange, onCancel, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => onChange({ ...v, [k]: e.target.value })
  async function save() {
    const e = validateFood(v)
    if (e) return setErr(e)
    setBusy(true); setErr('')
    try { await adminSaveFood(v); await onSaved() } catch { setErr('儲存失敗'); setBusy(false) }
  }
  return (
    <section className="card session-editor">
      <div className="form-grid two-col">
        <label className="small">名稱<input className="search" value={v.name} maxLength={40} onChange={set('name')} placeholder="例如：雞腿便當" /></label>
        <label className="small">分類<input className="search" value={v.category} maxLength={20} onChange={set('category')} /></label>
        <label className="small">份量<input className="search" value={v.portion_label} maxLength={30} onChange={set('portion_label')} placeholder="例如：1 個便當" /></label>
        <label className="small">份量克數（選填）<input className="search" type="number" inputMode="decimal" value={v.portion_g} onChange={set('portion_g')} /></label>
        <label className="small">每份熱量（大卡）<input className="search" type="number" inputMode="numeric" value={v.kcal_portion} onChange={set('kcal_portion')} /></label>
        <label className="small">每份蛋白質 g（選填）<input className="search" type="number" inputMode="decimal" value={v.protein_portion} onChange={set('protein_portion')} /></label>
      </div>
      <label className="small">資料來源<input className="search" value={v.source} maxLength={200} onChange={set('source')} placeholder="例如：店家營養標示、國健署資料、營養師估算" /></label>
      {err && <p className="error small">{err}</p>}
      <div className="row">
        <button className="btn ghost" disabled={busy} onClick={onCancel}>取消</button>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? '儲存中…' : '儲存'}</button>
      </div>
    </section>
  )
}
