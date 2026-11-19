import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { hasCurrentConsent } from './lib/api'
import Consent from './pages/Consent'
import Me from './pages/Me'
import Placeholder from './pages/Placeholder'
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
          <Route path="/" element={<Placeholder title="衛教專區" desc="足部、肩頸、下背、訓練與恢復的衛教文章和短影音，內容由 Notion 同步。" milestone={2} />} />
          <Route path="/scales" element={<Placeholder title="評估量表" desc="足部功能指數（FFI-TC）、疼痛分數與身體疼痛地圖，可追蹤前後變化。" milestone={3} />} />
          <Route path="/foot" element={<Placeholder title="足部初篩" desc="用一張 A4 紙，在家量出足長與足寬，拿到你的足型報告。" milestone={4} />} />
          <Route path="/me" element={<Me />} />
        </Routes>
        <TabBar />
      </div>
    </HashRouter>
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
      <Gate />
    </AuthProvider>
  )
}
