/**
 * Admin: Client Management Page
 * - List all clients
 * - Create client + optional login account
 * - Edit client info
 * - Delete client
 * - View client analysis history
 */
import { useState, useEffect } from 'react'
import { API } from '../utils/api'
import { authHeaders } from '../utils/auth'

export default function ClientManager() {
  const [clients,   setClients]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [view,      setView]      = useState('list')   // 'list' | 'new' | 'detail'
  const [selected,  setSelected]  = useState(null)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState('')

  const loadClients = async () => {
    setLoading(true)
    try {
      const res = await fetch(API.adminClients, { headers: authHeaders() })
      const data = await res.json()
      setClients(Array.isArray(data) ? data : [])
    } catch { }
    setLoading(false)
  }

  useEffect(() => { loadClients() }, [])

  const handleDelete = async (id, name) => {
    if (!window.confirm(`確定要刪除客戶「${name}」？相關分析紀錄也會一併刪除。`)) return
    const res = await fetch(`${API.adminClients}/${id}`, {
      method: 'DELETE', headers: authHeaders(),
    })
    if (res.ok) {
      setSuccess(`已刪除客戶「${name}」`)
      loadClients()
    } else {
      setError('刪除失敗')
    }
    setTimeout(() => { setSuccess(''); setError('') }, 3000)
  }

  if (view === 'new') {
    return (
      <NewClientForm
        onDone={() => { setView('list'); loadClients() }}
        onBack={() => setView('list')}
      />
    )
  }

  if (view === 'detail' && selected) {
    return (
      <ClientDetail
        client={selected}
        onBack={() => { setView('list'); setSelected(null) }}
        onUpdated={() => { loadClients(); setView('list'); setSelected(null) }}
      />
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>客戶管理</div>
        <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setView('new')}>
          + 新增客戶
        </button>
      </div>

      {success && <div className="error-banner" style={{ background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)', color: '#4ade80', marginBottom: 12 }}>{success}</div>}
      {error   && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>載入中…</div>
      ) : clients.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
          尚無客戶資料。點擊「+ 新增客戶」開始建立。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {clients.map(c => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px', background: 'var(--bg)',
              borderRadius: 10, border: '1px solid var(--border)',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                  ID: {c.id}
                  {c.username && <span style={{ marginLeft: 10 }}>👤 帳號：{c.username}</span>}
                  {c.birthday && <span style={{ marginLeft: 10 }}>🎂 {c.birthday}</span>}
                  {c.gender   && <span style={{ marginLeft: 10 }}>{c.gender === 'M' ? '♂' : '♀'}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-outline"
                  style={{ fontSize: 12, padding: '5px 12px' }}
                  onClick={() => { setSelected(c); setView('detail') }}
                >
                  詳情
                </button>
                <button
                  className="btn btn-outline"
                  style={{ fontSize: 12, padding: '5px 12px', color: '#f87171', borderColor: 'rgba(248,113,113,0.4)' }}
                  onClick={() => handleDelete(c.id, c.name)}
                >
                  刪除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── New Client Form ───────────────────────────────────────────────────────────
function NewClientForm({ onDone, onBack }) {
  const [form, setForm] = useState({
    name: '', birthday: '', gender: '', weight: '', height: '', notes: '',
    create_user: false, username: '', password: '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('請填寫客戶姓名'); return }
    if (form.create_user && (!form.username.trim() || !form.password.trim())) {
      setError('建立帳號需填寫帳號與密碼'); return
    }
    setSaving(true); setError('')
    try {
      const body = {
        name:     form.name.trim(),
        birthday: form.birthday || null,
        gender:   form.gender   || null,
        weight:   form.weight   ? parseFloat(form.weight) : null,
        height:   form.height   ? parseFloat(form.height) : null,
        notes:    form.notes    || null,
      }
      if (form.create_user) {
        body.username = form.username.trim()
        body.password = form.password
      }
      const res = await fetch(API.adminClients, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.detail || '建立失敗'); setSaving(false); return }
      onDone()
    } catch { setError('網路錯誤'); setSaving(false) }
  }

  return (
    <div>
      <button className="btn btn-outline" style={{ marginBottom: 16 }} onClick={onBack}>← 返回列表</button>
      <div className="card">
        <div className="card-title">新增客戶</div>
        {error && <div className="error-banner" style={{ marginBottom: 14 }}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>姓名 *</label>
              <input className="form-input" placeholder="客戶全名" value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div className="form-group">
              <label>生日</label>
              <input className="form-input" type="date" value={form.birthday} onChange={e => set('birthday', e.target.value)} />
            </div>
            <div className="form-group">
              <label>性別</label>
              <select className="form-input" value={form.gender} onChange={e => set('gender', e.target.value)}>
                <option value="">不設定</option>
                <option value="M">男</option>
                <option value="F">女</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>體重 (kg)</label>
              <input className="form-input" type="number" placeholder="75" value={form.weight} onChange={e => set('weight', e.target.value)} />
            </div>
            <div className="form-group">
              <label>身高 (cm)</label>
              <input className="form-input" type="number" placeholder="175" value={form.height} onChange={e => set('height', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>備注</label>
            <textarea
              className="form-input"
              rows={2}
              placeholder="受傷史、目標、注意事項…"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* Create login toggle */}
          <div style={{
            marginTop: 16, padding: '14px 16px',
            background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)',
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={form.create_user}
                onChange={e => set('create_user', e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ fontWeight: 600, fontSize: 14 }}>同時建立登入帳號</span>
            </label>
            {form.create_user && (
              <div className="form-row" style={{ marginTop: 12 }}>
                <div className="form-group">
                  <label>帳號</label>
                  <input className="form-input" placeholder="login_username" value={form.username} onChange={e => set('username', e.target.value)} autoCapitalize="none" />
                </div>
                <div className="form-group">
                  <label>密碼</label>
                  <input className="form-input" type="password" placeholder="初始密碼" value={form.password} onChange={e => set('password', e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button type="button" className="btn btn-outline" onClick={onBack}>取消</button>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1 }}>
              {saving ? '建立中…' : '建立客戶'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Client Detail / Edit ──────────────────────────────────────────────────────
function ClientDetail({ client, onBack, onUpdated }) {
  const [form, setForm] = useState({
    name:     client.name     || '',
    birthday: client.birthday || '',
    gender:   client.gender   || '',
    weight:   client.weight   != null ? String(client.weight) : '',
    height:   client.height   != null ? String(client.height) : '',
    notes:    client.notes    || '',
  })
  const [analyses, setAnalyses] = useState([])
  const [loadingA, setLoadingA] = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    fetch(API.adminClientAnalyses(client.id), { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { setAnalyses(Array.isArray(data) ? data : []) })
      .catch(() => {})
      .finally(() => setLoadingA(false))
  }, [client.id])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true); setError(''); setSuccess('')
    try {
      const body = {
        name:     form.name.trim(),
        birthday: form.birthday || null,
        gender:   form.gender   || null,
        weight:   form.weight   ? parseFloat(form.weight) : null,
        height:   form.height   ? parseFloat(form.height) : null,
        notes:    form.notes    || null,
      }
      const res = await fetch(`${API.adminClients}/${client.id}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setSuccess('已儲存')
        setTimeout(() => setSuccess(''), 2000)
      } else {
        const d = await res.json()
        setError(d.detail || '儲存失敗')
      }
    } catch { setError('網路錯誤') }
    setSaving(false)
  }

  const handleDeleteAnalysis = async (id) => {
    if (!window.confirm('確定要刪除此筆分析紀錄？')) return
    const res = await fetch(API.adminAnalysis(id), { method: 'DELETE', headers: authHeaders() })
    if (res.ok) setAnalyses(a => a.filter(x => x.id !== id))
  }

  return (
    <div>
      <button className="btn btn-outline" style={{ marginBottom: 16 }} onClick={onBack}>← 返回列表</button>

      {/* Edit form */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">客戶資料：{client.name}</div>
        {error   && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}
        {success && <div className="error-banner" style={{ background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)', color: '#4ade80', marginBottom: 12 }}>{success}</div>}
        <form onSubmit={handleSave}>
          <div className="form-row">
            <div className="form-group">
              <label>姓名</label>
              <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div className="form-group">
              <label>生日</label>
              <input className="form-input" type="date" value={form.birthday} onChange={e => set('birthday', e.target.value)} />
            </div>
            <div className="form-group">
              <label>性別</label>
              <select className="form-input" value={form.gender} onChange={e => set('gender', e.target.value)}>
                <option value="">不設定</option>
                <option value="M">男</option>
                <option value="F">女</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>體重 (kg)</label>
              <input className="form-input" type="number" value={form.weight} onChange={e => set('weight', e.target.value)} />
            </div>
            <div className="form-group">
              <label>身高 (cm)</label>
              <input className="form-input" type="number" value={form.height} onChange={e => set('height', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>備注</label>
            <textarea className="form-input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} style={{ resize: 'vertical' }} />
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 12 }} disabled={saving}>
            {saving ? '儲存中…' : '儲存變更'}
          </button>
        </form>
      </div>

      {/* Analysis history */}
      <div className="card">
        <div className="card-title">分析紀錄（{analyses.length} 筆）</div>
        {loadingA ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>載入中…</div>
        ) : analyses.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>尚無分析紀錄</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {analyses.map(a => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', background: 'var(--bg)',
                borderRadius: 8, border: '1px solid var(--border)',
              }}>
                <div>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>
                    {a.mode === 'jump' ? '🏃 跳躍' : '🧍 站立平衡'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 12 }}>
                    {new Date(a.created_at).toLocaleString('zh-TW')}
                    {a.duration && ` · ${a.duration.toFixed(0)}s`}
                    {a.total_frames && ` · ${a.total_frames} 幀`}
                  </span>
                </div>
                <button
                  className="btn btn-outline"
                  style={{ fontSize: 11, padding: '4px 10px', color: '#f87171', borderColor: 'rgba(248,113,113,0.4)' }}
                  onClick={() => handleDeleteAnalysis(a.id)}
                >
                  刪除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
