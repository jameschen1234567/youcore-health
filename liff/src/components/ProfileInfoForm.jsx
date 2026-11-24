// 基本資料表單：首次填寫（Gate）、客戶在「我的」修改、管理員在後台修改共用
import { useState } from 'react'
import { GENDERS } from '../lib/training'

/** 檢查欄位，回傳 { 欄位: 錯誤訊息 }；沒有錯誤回傳空物件 */
export function validateInfo(v) {
  const e = {}
  if (!v.full_name?.trim()) e.full_name = '請填寫姓名'
  if (!GENDERS[v.gender]) e.gender = '請選擇生理性別'
  if (!v.birthday) e.birthday = '請填寫生日'
  else if (v.birthday > new Date().toISOString().slice(0, 10) || v.birthday < '1900-01-01') e.birthday = '生日不正確'
  if (!/^[0-9+\-\s()]{8,20}$/.test(v.phone?.trim() ?? '')) e.phone = '請填寫正確的聯絡電話'
  if (v.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = '信箱格式不正確'
  const h = Number(v.height_cm)
  if (v.height_cm === '' || v.height_cm == null || !(h >= 80 && h <= 250)) e.height_cm = '請填寫身高（80～250 cm）'
  return e
}

export default function ProfileInfoForm({ initial = {}, heightLocked = false, submitLabel = '儲存', onSubmit, onCancel }) {
  const [v, setV] = useState({
    full_name: initial.full_name ?? '',
    gender: initial.gender ?? '',
    birthday: initial.birthday ?? '',
    phone: initial.phone ?? '',
    email: initial.email ?? '',
    height_cm: initial.height_cm ?? '',
    medical_notes: initial.medical_notes ?? '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    const errs = validateInfo(v)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    setSaveError('')
    try {
      await onSubmit({
        full_name: v.full_name.trim(),
        gender: v.gender,
        birthday: v.birthday,
        phone: v.phone.trim(),
        email: v.email.trim() || null,
        height_cm: Number(v.height_cm),
        medical_notes: v.medical_notes.trim() || null,
      })
    } catch {
      setSaveError('儲存失敗，請稍後再試')
      setSaving(false)
    }
  }

  const err = (k) => errors[k] && <span className="error small">{errors[k]}</span>
  return (
    <form className="form-grid" onSubmit={submit} noValidate>
      <label className="small">姓名 *
        <input className="search" value={v.full_name} onChange={set('full_name')} autoComplete="name" maxLength={50} />
        {err('full_name')}
      </label>
      <fieldset className="small gender">
        <legend>生理性別 *</legend>
        <div className="chips">
          {Object.entries(GENDERS).map(([k, label]) => (
            <button type="button" key={k} className={`chip ${v.gender === k ? 'on' : ''}`} onClick={() => setV((s) => ({ ...s, gender: k }))}>{label}</button>
          ))}
        </div>
        {err('gender')}
      </fieldset>
      <label className="small">生日 *
        <input className="search" type="date" value={v.birthday} onChange={set('birthday')} max={new Date().toISOString().slice(0, 10)} />
        {err('birthday')}
      </label>
      <label className="small">聯絡電話 *
        <input className="search" type="tel" inputMode="tel" value={v.phone} onChange={set('phone')} autoComplete="tel" placeholder="0912-345-678" />
        {err('phone')}
      </label>
      <label className="small">信箱
        <input className="search" type="email" inputMode="email" value={v.email} onChange={set('email')} autoComplete="email" placeholder="選填，例如 name@gmail.com" />
        {err('email')}
      </label>
      <label className="small">身高（cm）*
        <input className="search" type="number" inputMode="decimal" step="0.1" value={v.height_cm} onChange={set('height_cm')} disabled={heightLocked} />
        {heightLocked && <span className="muted small">身高如需修改，請告訴教練由我們協助更新。</span>}
        {err('height_cm')}
      </label>
      <label className="small">相關病史
        <textarea className="search" rows={3} value={v.medical_notes} onChange={set('medical_notes')} maxLength={1000}
          placeholder="選填，例如：曾經扭傷右腳踝、高血壓、膝蓋手術（2022）" />
      </label>
      {saveError && <p className="error">{saveError}</p>}
      <div className="row">
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>取消</button>}
        <button type="submit" className="btn primary" disabled={saving}>{saving ? '儲存中…' : submitLabel}</button>
      </div>
    </form>
  )
}
