// 客戶端：單次訓練明細（每個動作的每一組與推估 1RM）
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { fmtDay, getProfileInfo, groupSets, listExercises, listTrainingSessions } from '../lib/training'
import { ageFrom } from '../lib/strength'
import SessionSets from '../components/SessionSets'
import SessionHeart from '../components/SessionHeart'
import MediaCard from '../components/MediaCard'
import { listMedia, signedUrls } from '../lib/media'
import { isMember } from '../lib/homework'

export default function TrainingSession() {
  const { sessionId } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(undefined)
  const [media, setMedia] = useState({ rows: [], urls: {} })

  useEffect(() => {
    if (!isMember(profile)) return
    listMedia(profile.id, { sessionId }).then(async (rows) => setMedia({ rows, urls: await signedUrls(rows) })).catch(() => {})
  }, [profile, sessionId])

  useEffect(() => {
    Promise.all([listTrainingSessions(profile.id), listExercises(), getProfileInfo(profile.id).catch(() => ({}))])
      .then(([sessions, exercises, info]) => setData({ session: sessions.find((s) => s.id === sessionId) ?? null, exercises, age: ageFrom(info?.birthday) }))
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
          <SessionHeart s={data.session} age={data.age} />
          {media.rows.length > 0 && (
            <section className="card">
              <h2>這次的影像紀錄</h2>
              {media.rows.map((m) => <MediaCard key={m.id} m={m} urls={media.urls} />)}
            </section>
          )}
          <SessionSets groups={groupSets(data.session.sets)} exercises={data.exercises} age={data.age} restHr={data.session.rest_hr} />
        </>
      )}
    </main>
  )
}
