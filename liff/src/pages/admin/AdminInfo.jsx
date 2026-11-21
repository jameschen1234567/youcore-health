// 後台：客戶基本資料（管理員可修改，含身高）
import { useEffect, useState } from 'react'
import { adminSaveProfileInfo, getProfileInfo } from '../../lib/training'
import ProfileInfoForm from '../../components/ProfileInfoForm'
import InfoSummary from '../../components/InfoSummary'

export default function AdminInfo({ profileId }) {
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
        <ProfileInfoForm initial={info} submitLabel="儲存（含身高）" onCancel={() => setEditing(false)}
          onSubmit={async (fields) => {
            await adminSaveProfileInfo(profileId, { ...fields, info_completed_at: info.info_completed_at })
            setInfo({ ...info, ...fields, info_completed_at: info.info_completed_at ?? new Date().toISOString() })
            setEditing(false)
          }} />
      ) : <InfoSummary info={info} />)}
    </section>
  )
}
