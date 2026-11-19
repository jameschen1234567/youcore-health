// 個資同意書。⚠ 文字為草稿，正式上線前由 James 定稿（建議請律師或個資顧問審閱），並升級 CONSENT_VERSION。
import { useState } from 'react'
import { giveConsent } from '../lib/api'

const SECTIONS = [
  {
    title: '我們蒐集哪些資料',
    body: 'LINE 顯示名稱與識別碼、您填寫的評估量表與疼痛部位、足部照片與量測結果、產品訂單紀錄。',
  },
  {
    title: '蒐集目的',
    body: '提供足部初步篩檢、健康評估追蹤、客製化足部產品製作，以及到店服務前的狀況了解。不會用於其他目的，也不會提供給第三方。',
  },
  {
    title: '特別說明',
    body: '量表與疼痛部位屬於健康相關資料（個人資料保護法第 6 條特種個資）。本 App 提供的是「初步篩檢與建議」，不是醫療診斷；如有持續疼痛或不適，請就醫評估。',
  },
  {
    title: '保存與您的權利',
    body: '資料保存至您申請刪除為止。您可以隨時在「我的」頁面查閱自己的資料，或申請刪除全部資料。',
  },
]

export default function Consent({ profile, onDone }) {
  const [checked, setChecked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      await giveConsent(profile.id)
      onDone()
    } catch {
      setError('儲存失敗，請稍後再試')
      setSaving(false)
    }
  }

  return (
    <main className="page consent">
      <header className="consent-head">
        <p className="eyebrow">YouCore 宥芯健筋療育所</p>
        <h1>使用前，先跟您說清楚</h1>
        <p className="muted">我們會用到一些健康相關資料，請花 1 分鐘看一下。</p>
      </header>

      {SECTIONS.map((s) => (
        <section key={s.title} className="card">
          <h2>{s.title}</h2>
          <p>{s.body}</p>
        </section>
      ))}

      <label className="check">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span>我已閱讀並同意上述個人資料蒐集、處理及利用說明</span>
      </label>

      {error && <p className="error">{error}</p>}

      <button className="btn primary block" disabled={!checked || saving} onClick={submit}>
        {saving ? '儲存中…' : '同意並開始使用'}
      </button>
    </main>
  )
}
