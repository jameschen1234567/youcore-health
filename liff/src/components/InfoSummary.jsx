// 基本資料唯讀顯示（「我的」與後台共用）
import { GENDERS } from '../lib/training'
import { ageFrom } from '../lib/strength'

export default function InfoSummary({ info }) {
  if (!info?.info_completed_at) return <p className="muted">尚未填寫基本資料</p>
  const age = ageFrom(info.birthday)
  const rows = [
    ['姓名', info.full_name],
    ['性別', GENDERS[info.gender]],
    ['生日', info.birthday ? `${info.birthday.replaceAll('-', '/')}${age != null ? `（${age} 歲）` : ''}` : null],
    ['電話', info.phone],
    ['信箱', info.email],
    ['身高', info.height_cm != null ? `${Number(info.height_cm)} cm` : null],
    ['相關病史', info.medical_notes],
  ]
  return (
    <dl className="info-list">
      {rows.map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v || '—'}</dd></div>
      ))}
    </dl>
  )
}
