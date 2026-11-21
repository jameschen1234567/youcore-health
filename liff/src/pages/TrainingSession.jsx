// 客戶端：單次訓練明細（每個動作的每一組與推估 1RM）
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { fmtDay, groupSets, listExercises, listTrainingSessions } from '../lib/training'
import SessionSets from '../components/SessionSets'

export default function TrainingSession() {
  const { sessionId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(undefined)

  useEffect(() => {
    Promise.all([listTrainingSessions(profile.id), listExercises()])
      .then(([sessions, exercises]) => setData({ session: sessions.find((s) => s.id === sessionId) ?? null, exercises }))
      .catch(() => setData(null))
  }, [profile.id, sessionId])

  return (
    <main className="page">
      <button className="back" onClick={() => navigate('/training')}>‹ 訓練</button>
      {data === undefined && <p className="muted">載入中…</p>}
      {data === null || data?.session === null ? <p className="muted">找不到這次訓練</p> : data && (
        <>
          <h1>{fmtDay(data.session.session_date)} 訓練</h1>
          {data.session.note && <p className="muted">{data.session.note}</p>}
          <SessionSets groups={groupSets(data.session.sets)} exercises={data.exercises} />
        </>
      )}
    </main>
  )
}
