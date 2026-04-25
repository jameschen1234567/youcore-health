import { useState } from 'react'
import { API } from '../utils/api'
import { saveAuth } from '../utils/auth'

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username || !password) { setError('請輸入帳號與密碼'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(API.login, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
        body:    JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.detail || '登入失敗'); return }
      saveAuth(data.access_token, {
        username:  data.username,
        role:      data.role,
        client_id: data.client_id,
      })
      onLogin(data.role)
    } catch {
      setError('網路錯誤，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg)',
    }}>
      <div style={{
        width: '100%', maxWidth: 380,
        background: 'var(--surface)', borderRadius: 16,
        padding: '40px 32px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🏃</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>
            YouCore
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            宥芯健康顧問｜動作分析系統
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
              帳號
            </label>
            <input
              className="form-input"
              style={{ width: '100%', boxSizing: 'border-box' }}
              placeholder="請輸入帳號"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoCapitalize="none"
              autoComplete="username"
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
              密碼
            </label>
            <input
              className="form-input"
              style={{ width: '100%', boxSizing: 'border-box' }}
              type="password"
              placeholder="請輸入密碼"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8, padding: '10px 14px', color: '#f87171',
              fontSize: 13, marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px 0', fontSize: 15, fontWeight: 600 }}
            type="submit"
            disabled={loading}
          >
            {loading ? '登入中…' : '登入'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--text-muted)' }}>
          Your Health, Our Core Mission
        </div>
      </div>
    </div>
  )
}
