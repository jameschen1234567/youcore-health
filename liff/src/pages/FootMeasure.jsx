// 量腳：站在 A4 紙上，用尺量足長、前掌寬、腳跟寬（不拍照、不經過伺服器計算）
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { saveFeet } from '../lib/api'
import { FootGuide } from '../components/FootGuides'
import FeetForm from '../components/FeetForm'

export default function FootMeasure() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [filling, setFilling] = useState(false)
  return (
    <main className="page">
      <button className="back" onClick={() => (filling ? setFilling(false) : navigate('/foot'))}>‹ {filling ? '看量法' : '足部與鞋墊'}</button>
      <h1>量腳</h1>
      {filling
        ? <section className="card"><FeetForm onSave={async (feet) => { await saveFeet(profile.id, feet); navigate('/foot?new=1') }} /></section>
        : <><FootGuide /><button className="btn primary block" onClick={() => setFilling(true)}>量好了，填寫數字</button></>}
    </main>
  )
}
