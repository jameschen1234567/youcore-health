import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { hasCurrentConsent } from './lib/api'
import { getProfileInfo, saveProfileInfo } from './lib/training'
import ProfileInfoForm from './components/ProfileInfoForm'
import Training from './pages/Training'
import TrainingSession from './pages/TrainingSession'
import Consent from './pages/Consent'
import Me from './pages/Me'
import ContentHome from './pages/ContentHome'
import ContentDetail from './pages/ContentDetail'
import Scales from './pages/Scales'
import QuestionnaireForm from './pages/QuestionnaireForm'
import ScaleHistory from './pages/ScaleHistory'
import PainMapForm from './pages/PainMapForm'
import PainMapHistory from './pages/PainMapHistory'
import FootHome from './pages/FootHome'
import FootMeasure from './pages/FootMeasure'
import Learn, { LearnView } from './pages/Learn'
import AdminModules from './pages/admin/AdminModules'
import AdminHome from './pages/admin/AdminHome'
import AdminClient from './pages/admin/AdminClient'
import AdminBookings from './pages/admin/AdminBookings'
import AdminCalendar from './pages/admin/AdminCalendar'
import AdminRequests from './pages/admin/AdminRequests'
import AdminPackagesOverview from './pages/admin/AdminPackagesOverview'
import Booking from './pages/Booking'
import MyBookings from './pages/MyBookings'
import Live, { LiveWatch } from './pages/Live'
import AdminLive from './pages/admin/AdminLive'
import AdminLiveHost from './pages/admin/AdminLiveHost'
import TabBar from './components/TabBar'

// 需要身份的頁面：第一次進來才開始 LINE 登入 → 同意書 → 基本資料
function Gate() {
  const { status, profile, error, start } = useAuth()
  const [consent, setConsent] = useState('checking') // checking | needed | ok | error
  const [info, setInfo] = useState('checking') // checking | needed | ok | error

  useEffect(() => { start() }, [start])

  useEffect(() => {
    if (status !== 'ready') return
    hasCurrentConsent(profile.id)
      .then((ok) => setConsent(ok ? 'ok' : 'needed'))
      .catch(() => setConsent('error'))
    getProfileInfo(profile.id)
      .then((i) => setInfo(i?.info_completed_at ? 'ok' : 'needed'))
      .catch(() => setInfo('error'))
  }, [status, profile])

  if (status === 'error') return <Message title="登入失敗" text={error} />
  if (status === 'idle' || status === 'loading' || consent === 'checking' || info === 'checking') return <Message title="載入中…" />
  if (consent === 'error' || info === 'error') return <Message title="連線失敗" text="請確認網路後重新開啟" />
  if (consent === 'needed') return <Consent profile={profile} onDone={() => setConsent('ok')} />
  if (info === 'needed') return <Onboarding profile={profile} onDone={() => setInfo('ok')} />

  return (
        <Routes>
          <Route path="/scales" element={<Scales />} />
          <Route path="/scales/painmap" element={<PainMapForm />} />
          <Route path="/scales/painmap/history" element={<PainMapHistory />} />
          <Route path="/scales/:key" element={<QuestionnaireForm />} />
          <Route path="/scales/:key/history" element={<ScaleHistory />} />
          <Route path="/foot" element={<FootHome />} />
          <Route path="/foot/measure" element={<FootMeasure />} />
          <Route path="/foot/insole" element={<Navigate to="/foot" replace />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/learn/:id" element={<LearnView />} />
          <Route path="/admin/learning" element={<AdminOnly><AdminModules /></AdminOnly>} />
          <Route path="/training" element={<Training />} />
          <Route path="/training/:sessionId" element={<TrainingSession />} />
          <Route path="/me" element={<Me />} />
          <Route path="/booking" element={<Booking />} />
          <Route path="/booking/mine" element={<MyBookings />} />
          <Route path="/admin/bookings" element={<AdminOnly><AdminBookings /></AdminOnly>} />
          <Route path="/live" element={<Live />} />
          <Route path="/live/:id" element={<LiveWatch />} />
          <Route path="/admin/live" element={<AdminOnly><AdminLive /></AdminOnly>} />
          <Route path="/admin/live/:id" element={<AdminOnly><AdminLiveHost /></AdminOnly>} />
          <Route path="/admin/requests" element={<AdminOnly><AdminRequests /></AdminOnly>} />
          <Route path="/admin/calendar" element={<AdminOnly><AdminCalendar /></AdminOnly>} />
          <Route path="/admin/packages" element={<AdminOnly><AdminPackagesOverview /></AdminOnly>} />
          <Route path="/admin" element={<AdminOnly><AdminHome /></AdminOnly>} />
          <Route path="/admin/client/:id" element={<AdminOnly><AdminClient /></AdminOnly>} />
          <Route path="*" element={<Message title="找不到這個頁面" />} />
        </Routes>
  )
}

// 介面上的把關；真正的權限由資料庫 RLS（is_admin）負責
function AdminOnly({ children }) {
  const { profile } = useAuth()
  if (profile?.role !== 'admin') return <Message title="沒有權限" text="這個頁面只有管理員可以使用" />
  return children
}

// 同意書之後必填的基本資料
function Onboarding({ profile, onDone }) {
  return (
    <main className="page consent">
      <header className="consent-head">
        <p className="eyebrow">YouCore 宥芯健筋療育所</p>
        <h1>先認識一下你</h1>
        <p className="muted">填一次就好，教練會依照這些資料安排你的評估與訓練。</p>
      </header>
      <section className="card">
        <ProfileInfoForm submitLabel="完成，開始使用" onSubmit={async (fields) => { await saveProfileInfo(profile.id, fields); onDone() }} />
      </section>
    </main>
  )
}

function Message({ title, text }) {
  return (
    <main className="page center">
      <h1>{title}</h1>
      {text && <p className="muted">{text}</p>}
    </main>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <div className="app">
          <Routes>
            {/* 公開頁面：衛教文章、短影音、關於宥芯，免登入即可瀏覽與分享 */}
            <Route path="/" element={<ContentHome />} />
            <Route path="/content/:id" element={<ContentDetail />} />
            <Route path="*" element={<Gate />} />
          </Routes>
          <TabBar />
        </div>
      </HashRouter>
    </AuthProvider>
  )
}
