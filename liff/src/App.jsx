import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { hasCurrentConsent } from './lib/api'
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
import AdminHome from './pages/admin/AdminHome'
import AdminClient from './pages/admin/AdminClient'
import TabBar from './components/TabBar'

function Gate() {
  const { status, profile, error } = useAuth()
  const [consent, setConsent] = useState('checking') // checking | needed | ok | error

  useEffect(() => {
    if (status !== 'ready') return
    hasCurrentConsent(profile.id)
      .then((ok) => setConsent(ok ? 'ok' : 'needed'))
      .catch(() => setConsent('error'))
  }, [status, profile])

  if (status === 'error') return <Message title="登入失敗" text={error} />
  if (status === 'loading' || consent === 'checking') return <Message title="載入中…" />
  if (consent === 'error') return <Message title="連線失敗" text="請確認網路後重新開啟" />
  if (consent === 'needed') return <Consent profile={profile} onDone={() => setConsent('ok')} />

  return (
    <HashRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<ContentHome />} />
          <Route path="/content/:id" element={<ContentDetail />} />
          <Route path="/scales" element={<Scales />} />
          <Route path="/scales/painmap" element={<PainMapForm />} />
          <Route path="/scales/painmap/history" element={<PainMapHistory />} />
          <Route path="/scales/:key" element={<QuestionnaireForm />} />
          <Route path="/scales/:key/history" element={<ScaleHistory />} />
          <Route path="/foot" element={<FootHome />} />
          <Route path="/foot/measure" element={<FootMeasure />} />
          <Route path="/me" element={<Me />} />
          <Route path="/admin" element={<AdminOnly><AdminHome /></AdminOnly>} />
          <Route path="/admin/client/:id" element={<AdminOnly><AdminClient /></AdminOnly>} />
        </Routes>
        <TabBar />
      </div>
    </HashRouter>
  )
}

// 介面上的把關；真正的權限由資料庫 RLS（is_admin）負責
function AdminOnly({ children }) {
  const { profile } = useAuth()
  if (profile?.role !== 'admin') return <Message title="沒有權限" text="這個頁面只有管理員可以使用" />
  return children
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
      <Gate />
    </AuthProvider>
  )
}
