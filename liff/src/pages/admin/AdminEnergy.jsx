// 後台客戶頁：客人的熱量收支（唯讀，與客人看到的相同計算）
import { useEffect, useState } from 'react'
import { getProfileInfo, listBodyComps, listTrainingSessions } from '../../lib/training'
import { ageFrom } from '../../lib/strength'
import EnergyCard from '../../components/EnergyCard'

export default function AdminEnergy({ profileId }) {
  const [d, setD] = useState(null)
  useEffect(() => {
    Promise.all([listBodyComps(profileId), listTrainingSessions(profileId), getProfileInfo(profileId)])
      .then(([body, sessions, info]) => setD({ body, sessions, info, age: ageFrom(info?.birthday) })).catch(() => setD(false))
  }, [profileId])
  if (d === false) return <section className="card"><p className="error small">熱量收支載入失敗</p></section>
  if (!d) return null
  return <EnergyCard profile={{ id: profileId }} readOnly {...d} />
}
