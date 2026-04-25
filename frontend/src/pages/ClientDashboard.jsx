import { useState, useEffect } from 'react'
import { API } from '../utils/api'
import { authHeaders, getUser, clearAuth } from '../utils/auth'

export default function ClientDashboard({ onLogout }) {
  const user = getUser()
  const [analyses, setAnalyses] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)   // selected analysis detail
  const [tab,      setTab]      = useState('history') // 'history' | 'videos' | 'guidelines'

  useEffect(() => {
    fetch(API.clientAnalyses, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { setAnalyses(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const loadDetail = async (id) => {
    const res = await fetch(API.clientAnalysis(id), { headers: authHeaders() })
    if (res.ok) setSelected(await res.json())
  }

  const handleLogout = () => { clearAuth(); onLogout() }

  return (
    <div className="app">
      {/* Topbar */}
      <div className="topbar" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="topbar-brand">動作分析系統</span>
          <span className="topbar-dot">·</span>
          <span className="topbar-sub">宥芯健康顧問</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
          <span style={{ color: 'var(--text-muted)' }}>👤 {user?.username}</span>
          <button className="btn btn-outline" style={{ padding: '4px 12px', fontSize: 12 }} onClick={handleLogout}>
            登出
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[
          { key: 'history',    label: '📊 分析紀錄' },
          { key: 'videos',     label: '🎬 教學影片' },
          { key: 'guidelines', label: '📋 拍攝規範' },
        ].map(t => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => { setTab(t.key); setSelected(null) }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="content">
        {/* ── History Tab ── */}
        {tab === 'history' && (
          selected ? (
            <AnalysisDetail analysis={selected} onBack={() => setSelected(null)} />
          ) : (
            <div className="card">
              <div className="card-title">我的分析紀錄</div>
              {loading ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>載入中…</div>
              ) : analyses.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                  尚無分析紀錄，請聯絡宥芯健康顧問預約分析
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {analyses.map(a => (
                    <div key={a.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', background: 'var(--bg)', borderRadius: 10,
                      border: '1px solid var(--border)',
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {a.mode === 'jump' ? '🏃 跳躍分析' : '🧍 站立平衡分析'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                          {new Date(a.created_at).toLocaleDateString('zh-TW')}
                          {a.duration && ` · ${a.duration.toFixed(0)}s`}
                          {a.total_frames && ` · ${a.total_frames} 幀`}
                        </div>
                      </div>
                      <button className="btn btn-outline" style={{ fontSize: 12, padding: '6px 14px' }}
                        onClick={() => loadDetail(a.id)}>
                        查看
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        )}

        {/* ── Videos Tab ── */}
        {tab === 'videos' && <TeachingVideos />}

        {/* ── Guidelines Tab ── */}
        {tab === 'guidelines' && <Guidelines />}
      </div>
    </div>
  )
}

// ── Analysis Detail (client view) ────────────────────────────────────────────
function AnalysisDetail({ analysis, onBack }) {
  const { result } = analysis
  return (
    <div>
      <button className="btn btn-outline" style={{ marginBottom: 16 }} onClick={onBack}>
        ← 返回列表
      </button>
      <div className="card">
        <div className="card-title">
          {analysis.mode === 'jump' ? '🏃 跳躍分析' : '🧍 站立平衡分析'}
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 10 }}>
            {new Date(analysis.created_at).toLocaleDateString('zh-TW')}
          </span>
        </div>
        {result ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            <p>🎯 分析完整資料已儲存，如需詳細報告請聯絡宥芯健康顧問。</p>
            <p>影片長度：{result.duration?.toFixed(1)}s　幀率：{result.fps?.toFixed(0)} fps　幀數：{result.total_frames}</p>
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)' }}>資料載入中…</p>
        )}
      </div>
    </div>
  )
}

// ── Teaching Videos ───────────────────────────────────────────────────────────
function TeachingVideos() {
  const videos = [
    {
      title: '叉腰下蹲跳（Counter Movement Jump）示範教學',
      url: 'https://www.youtube.com/embed/A6QgLSAuZH8',
      category: '跳躍分析',
      desc: '雙手叉腰、快速下蹲後往上跳，全程保持身體直立。本系統「跳躍分析」模式即以此動作評估爆發力與關節力矩。',
    },
    {
      title: '雙腳站立平衡測試示範',
      url: 'https://www.youtube.com/embed/mglfVFrK2ZI',
      category: '站立平衡',
      desc: '雙手叉腰、雙腳併攏站立，目視正前方，保持靜止 10–15 秒。本系統「站立平衡分析」模式即以此動作評估重心穩定度。',
    },
  ]
  return (
    <div className="card">
      <div className="card-title">教學示範影片</div>
      {videos.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>教練尚未新增教學影片</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {videos.map((v, i) => (
            <div key={i}>
              <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 15 }}>
                <span style={{
                  fontSize: 11, background: 'var(--accent)', color: '#000',
                  borderRadius: 4, padding: '2px 6px', marginRight: 8,
                }}>{v.category}</span>
                {v.title}
              </div>
              {v.desc && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
                  {v.desc}
                </div>
              )}
              <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 10, overflow: 'hidden' }}>
                <iframe
                  src={v.url}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Guidelines ────────────────────────────────────────────────────────────────
function Guidelines() {
  const rules = [
    { icon: '📐', title: '拍攝距離', desc: '全身入鏡，鏡頭距離 2–3 公尺' },
    { icon: '📍', title: '鏡頭高度', desc: '與腰部同高，避免仰角或俯角' },
    { icon: '💡', title: '光線建議', desc: '正面光源，避免逆光（背對窗戶）' },
    { icon: '🎽', title: '服裝建議', desc: '貼身運動服，避免寬鬆衣物遮蓋關節' },
    { icon: '📱', title: '拍攝方向', desc: '手機直拍（portrait），固定架設不晃動' },
    { icon: '🕐', title: '影片時長', desc: '站立平衡：10–15 秒　／　跳躍分析：15–30 秒' },
    { icon: '📁', title: '格式支援', desc: 'MP4、MOV（iPhone 預設格式即可）' },
  ]
  return (
    <div className="card">
      <div className="card-title">影片拍攝規範</div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
        為確保系統能準確辨識骨架與關節角度，請依照以下規範拍攝影片：
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rules.map((r, i) => (
          <div key={i} style={{
            display: 'flex', gap: 14, alignItems: 'flex-start',
            padding: '14px 16px', background: 'var(--bg)',
            borderRadius: 10, border: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 24, flexShrink: 0 }}>{r.icon}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{r.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: 20, padding: '14px 16px',
        background: 'rgba(99,102,241,0.1)', borderRadius: 10,
        border: '1px solid rgba(99,102,241,0.3)', fontSize: 13,
        color: 'var(--accent)',
      }}>
        💡 如有任何問題，請聯絡宥芯健康顧問：(02)2653-9433
      </div>
    </div>
  )
}
