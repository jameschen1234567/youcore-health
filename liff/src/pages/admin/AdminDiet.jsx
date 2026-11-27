// 後台客戶頁：飲食目標設定＋近 7 天飲食紀錄（唯讀）
import { useCallback, useEffect, useState } from 'react'
import { adminSetNutrition, getNutritionEnabled } from '../../lib/energy'
import { MEALS, adminSetDietTarget, dailySeries, getDietTarget, listFoodLogs, todayTaipei } from '../../lib/diet'

const addDays = (d, n) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
const fmt = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`

export default function AdminDiet({ profileId }) {
  const today = todayTaipei()
  const [logs, setLogs] = useState(null)
  const [target, setTarget] = useState({ diet_kcal_target: '', diet_protein_target: '' })
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [enabled, setEnabled] = useState(undefined)
  useEffect(() => { getNutritionEnabled(profileId).then(setEnabled).catch(() => setEnabled(false)) }, [profileId])
  async function toggle(on) {
    setBusy(true)
    try { await adminSetNutrition(profileId, on); setEnabled(on) } catch { setMsg('更新開放狀態失敗') } finally { setBusy(false) }
  }

  const reload = useCallback(() => Promise.all([listFoodLogs(profileId, addDays(today, -6)), getDietTarget(profileId)])
    .then(([l, t]) => { setLogs(l); setTarget({ diet_kcal_target: t?.diet_kcal_target ?? '', diet_protein_target: t?.diet_protein_target ?? '' }) })
    .catch(() => setMsg('飲食資料載入失敗')), [profileId, today])
  useEffect(() => { reload() }, [reload])

  async function save() {
    setBusy(true); setMsg('')
    try { await adminSetDietTarget(profileId, target.diet_kcal_target, target.diet_protein_target); setMsg('已儲存') }
    catch (e) { setMsg(e.message === 'BAD_KCAL' ? '熱量目標請填 800～6000' : e.message === 'BAD_PROTEIN' ? '蛋白質目標請填 10～400' : '儲存失敗') }
    finally { setBusy(false) }
  }

  const series = dailySeries(logs ?? [], today)
  return (
    <section className="card">
      <div className="row spread head-row"><h2>飲食與熱量</h2><span className="pill">客人自己記</span></div>
      <label className="row small consent-row">
        <input type="checkbox" checked={!!enabled} disabled={busy || enabled === undefined} onChange={(e) => toggle(e.target.checked)} />
        <span>開放飲食與熱量功能給這位客人（還需要有會員編號）</span>
      </label>
      <div className="form-grid two-col">
        <label className="small">每日熱量目標（大卡）<input className="search" type="number" inputMode="numeric" min="800" max="6000" value={target.diet_kcal_target} onChange={(e) => setTarget({ ...target, diet_kcal_target: e.target.value })} placeholder="未設定" /></label>
        <label className="small">每日蛋白質目標（g）<input className="search" type="number" inputMode="numeric" min="10" max="400" value={target.diet_protein_target} onChange={(e) => setTarget({ ...target, diet_protein_target: e.target.value })} placeholder="未設定" /></label>
      </div>
      <div className="row"><button className="btn ghost" disabled={busy} onClick={save}>{busy ? '儲存中…' : '儲存目標'}</button>{msg && <span className="small">{msg}</span>}</div>
      <ul className="history">
        {[...series].reverse().map((d) => {
          const items = (logs ?? []).filter((l) => l.eaten_on === d.day)
          return (
            <li key={d.day} className="diet-day">
              <span>
                <button className="link-btn" onClick={() => setOpen(open === d.day ? null : d.day)} disabled={items.length === 0}>
                  {fmt(d.day)} {items.length ? `${d.kcal} 大卡｜蛋白質 ${d.protein_g} g｜${items.length} 項` : '沒有紀錄'}
                </button>
                {open === d.day && (
                  <ul className="small">
                    {items.map((l) => <li key={l.id}>{MEALS[l.meal]}｜{l.name} {l.amount_label ?? ''}｜{Math.round(l.kcal)} 大卡{l.protein_g != null && `｜${l.protein_g} g`}</li>)}
                  </ul>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
