// 後台：身體組成（新增、修改、刪除）
import { useCallback, useEffect, useState } from 'react'
import { adminDeleteBodyComp, adminSaveBodyComp, listBodyComps, todayTaipei } from '../../lib/training'
import { bodyFatPct } from '../../lib/strength'

const EMPTY = { measured_on: '', weight_kg: '', muscle_kg: '', fat_kg: '', visceral_level: '', note: '' }

export default function AdminBody({ profileId }) {
  const [rows, setRows] = useState(null)
  const [form, setForm] = useState(null) // null = 收起；物件 = 新增或修改中
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)

  const reload = useCallback(() => listBodyComps(profileId).then(setRows).catch(() => setErr('載入失敗')), [profileId])
  useEffect(() => { reload() }, [reload])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const anyValue = form && ['weight_kg', 'muscle_kg', 'fat_kg', 'visceral_level'].some((k) => form[k] !== '' && form[k] != null)

  async function save() {
    if (!form.measured_on) return setErr('請填量測日期')
    if (!anyValue) return setErr('至少填一個數值')
    setBusy(true)
    setErr('')
    try {
      await adminSaveBodyComp(profileId, form)
      setForm(null)
      await reload()
    } catch {
      setErr('儲存失敗，請確認數值是否正確')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id) {
    setBusy(true)
    try { await adminDeleteBodyComp(profileId, id); setConfirmDel(null); await reload() } catch { setErr('刪除失敗') } finally { setBusy(false) }
  }

  const fat = form ? bodyFatPct(form) : null
  return (
    <section className="card">
      <div className="row spread head-row">
        <h2>身體組成（{rows?.length ?? '…'} 筆）</h2>
        {!form && <button className="btn primary" onClick={() => { setErr(''); setForm({ ...EMPTY, measured_on: todayTaipei() }) }}>＋ 新增</button>}
      </div>
      {err && <p className="error small">{err}</p>}

      {form && (
        <div className="form-grid two-col">
          <label className="small">量測日期<input className="search" type="date" value={form.measured_on} onChange={set('measured_on')} /></label>
          <label className="small">體重（kg）<input className="search" type="number" inputMode="decimal" step="0.1" value={form.weight_kg} onChange={set('weight_kg')} /></label>
          <label className="small">骨骼肌重（kg）<input className="search" type="number" inputMode="decimal" step="0.1" value={form.muscle_kg} onChange={set('muscle_kg')} /></label>
          <label className="small">體脂肪重（kg）<input className="search" type="number" inputMode="decimal" step="0.1" value={form.fat_kg} onChange={set('fat_kg')} /></label>
          <label className="small">內臟脂肪等級<input className="search" type="number" inputMode="decimal" step="0.5" value={form.visceral_level} onChange={set('visceral_level')} /></label>
          <label className="small">體脂率（自動）<input className="search" value={fat != null ? `${fat} %` : '—'} disabled /></label>
          <label className="small full">備註<input className="search" value={form.note ?? ''} maxLength={200} onChange={set('note')} placeholder="選填，例如：早上空腹量測" /></label>
          <div className="row full">
            <button className="btn ghost" onClick={() => setForm(null)} disabled={busy}>取消</button>
            <button className="btn primary" onClick={save} disabled={busy}>{busy ? '儲存中…' : '儲存'}</button>
          </div>
        </div>
      )}

      {rows && rows.length === 0 && !form && <p className="muted">還沒有身體組成紀錄</p>}
      {rows && rows.length > 0 && (
        <div className="table-wrap">
          <table className="sets-table">
            <thead><tr><th>日期</th><th>體重</th><th>骨骼肌</th><th>體脂肪</th><th>體脂率</th><th>內臟</th><th></th></tr></thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.id}>
                  <td>{r.measured_on.slice(5).replace('-', '/')}</td>
                  <td>{r.weight_kg ?? '—'}</td>
                  <td>{r.muscle_kg ?? '—'}</td>
                  <td>{r.fat_kg ?? '—'}</td>
                  <td>{bodyFatPct(r) ?? '—'}</td>
                  <td>{r.visceral_level ?? '—'}</td>
                  <td className="actions">
                    {confirmDel === r.id ? (
                      <>
                        <button className="link-btn danger-text" disabled={busy} onClick={() => remove(r.id)}>確定刪除</button>
                        <button className="link-btn" onClick={() => setConfirmDel(null)}>取消</button>
                      </>
                    ) : (
                      <>
                        <button className="link-btn" onClick={() => setForm({ ...EMPTY, ...nullToEmpty(r) })}>改</button>
                        <button className="link-btn danger-text" onClick={() => setConfirmDel(r.id)}>刪</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows && rows.length > 0 && <p className="muted small">單位：kg；體脂率 = 體脂肪 ÷ 體重。</p>}
    </section>
  )
}

const nullToEmpty = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? '']))
