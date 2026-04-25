import { useState, useRef, useCallback, useEffect } from 'react'
import axios from 'axios'
import VideoUpload from './components/VideoUpload'
import SkeletonCanvas from './components/SkeletonCanvas'
import JointAngleChart from './components/JointAngleChart'
import StatsTable from './components/StatsTable'
import JumpAnalysis from './components/JumpAnalysis'
import JointMoments from './components/JointMoments'
import { exportToExcel } from './utils/exportExcel'
import { API, AXIOS_HEADERS } from './utils/api'
import { chunkedUpload } from './utils/chunkedUpload'
import { isLoggedIn, isAdmin, getUser, clearAuth, authHeaders } from './utils/auth'
import LoginPage from './pages/LoginPage'
import ClientDashboard from './pages/ClientDashboard'
import ClientManager from './pages/ClientManager'

const TABS = ['upload', 'analysis', 'report', 'clients']
const TAB_LABELS = { upload: '上傳影片', analysis: '動作分析', report: '數據報告', clients: '👥 客戶管理' }

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())

  // ── Route guard ───────────────────────────────────────────────────────────
  if (!loggedIn) {
    return <LoginPage onLogin={() => setLoggedIn(true)} />
  }
  if (!isAdmin()) {
    return <ClientDashboard onLogout={() => setLoggedIn(false)} />
  }

  return <AdminApp onLogout={() => { clearAuth(); setLoggedIn(false) }} />
}

function AdminApp({ onLogout }) {
  const [tab, setTab]               = useState('upload')
  const [videoFile, setVideoFile]   = useState(null)
  const [videoUrl, setVideoUrl]     = useState(null)
  const [data, setData]             = useState(null)
  const [loading, setLoading]       = useState(false)
  const [progress, setProgress]     = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [error, setError]           = useState(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [weight, setWeight]         = useState('')
  const [height, setHeight]         = useState('')
  const [clientName, setClientName] = useState('')
  const [analysisMode, setAnalysisMode] = useState('balance')   // 'balance' | 'jump'
  const [activeJoints, setActiveJoints] = useState(['left_knee', 'right_knee', 'left_ankle', 'right_ankle'])
  const [comMode, setComMode]           = useState('velocity')
  const [pdfLoading, setPdfLoading]   = useState(false)
  const [excelLoading, setExcelLoading] = useState(false)
  const [clients, setClients]           = useState([])          // for client selector
  const [selectedClientId, setSelectedClientId] = useState('')  // '' = unbound
  const videoRef = useRef(null)

  // Load clients for the upload selector
  useEffect(() => {
    fetch(API.adminClients, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setClients(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  const handleFile = useCallback(async (file) => {
    setError(null)
    setData(null)
    setProgress(0)
    setProgressMsg('上傳中…')
    setVideoFile(file)
    setVideoUrl(URL.createObjectURL(file))
    setLoading(true)
    setTab('analysis')

    // ── 檔案基本檢查 ──────────────────────────────────────────────────────
    if (!file || file.size === 0) {
      setError('影片檔案無效（大小為 0），請重新錄製後再試。')
      setLoading(false)
      return
    }
    const fileMB = (file.size / 1024 / 1024).toFixed(1)
    setProgressMsg(`上傳中… (${fileMB} MB)`)

    let jobId = null
    try {
      // 分塊上傳：每次送 512 KB，不受 ngrok 單一 request 大小限制
      const cid = selectedClientId ? parseInt(selectedClientId) : null
      jobId = await chunkedUpload(file, analysisMode, (pct) => {
        setProgress(pct)
        setProgressMsg(`上傳中… ${pct}%（${fileMB} MB）`)
      }, cid)
    } catch (err) {
      setError(`上傳失敗：${err.message}（${fileMB} MB）`)
      setLoading(false)
      return
    }

    // ── 輪詢進度（iOS Safari 相容，含背景恢復）────────────────────────────
    let stopped      = false
    let failCount    = 0
    let pollTimer    = null
    const MAX_FAIL   = 60         // 允許最多 60 次連續失敗（≈ 3 分鐘容錯）
    const POLL_MS    = 3000       // 每 3 秒 poll 一次
    const FAIL_MS    = 6000       // 失敗後等 6 秒再試

    const doPoll = async () => {
      if (stopped) return
      try {
        const res = await fetch(API.poll(jobId), {
          headers: authHeaders(),
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const payload = await res.json()
        failCount = 0   // 成功就重置

        setProgress(payload.progress || 0)
        setProgressMsg(payload.message || '分析中…')

        if (payload.status === 'done') {
          stopped = true
          if (payload.result?.joint_angles) {
            setData(payload.result)
            setLoading(false)
          } else {
            setError('分析結果格式錯誤，請重試。')
            setLoading(false)
          }
          return
        }
        if (payload.status === 'error') {
          stopped = true
          setError(`分析失敗：${payload.error || payload.message}`)
          setLoading(false)
          return
        }
      } catch {
        failCount++
        // 不要因為短暫網路抖動就報錯，等到 MAX_FAIL 才放棄
      }
      if (!stopped) pollTimer = setTimeout(doPoll, failCount > 0 ? FAIL_MS : POLL_MS)
    }

    // Page Visibility API：手機從背景切回來時立刻補 poll 一次
    const onVisible = () => {
      if (!stopped && document.visibilityState === 'visible') {
        clearTimeout(pollTimer)
        doPoll()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    doPoll()

    // cleanup（若 component unmount）
    return () => {
      stopped = true
      clearTimeout(pollTimer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [analysisMode])

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime)
  }, [])

  const seekTo = useCallback((time) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time
      setCurrentTime(time)
    }
  }, [])

  const toggleJoint = (joint) => {
    setActiveJoints(prev =>
      prev.includes(joint)
        ? prev.filter(j => j !== joint)
        : [...prev, joint]
    )
  }

  const handleDownloadPdf = async () => {
    if (!data) return
    setPdfLoading(true)
    try {
      const payload = {
        ...data,
        weight: weight ? parseFloat(weight) : null,
        height: height ? parseFloat(height) : null,
        client_name: clientName,
        frames: undefined,
        joint_moments: undefined,  // omit large arrays from PDF payload
      }
      const res = await axios.post(API.generatePdf, payload, { responseType: 'blob', headers: authHeaders() })
      const url = URL.createObjectURL(res.data)
      const a   = document.createElement('a')
      a.href     = url
      a.download = 'motion_analysis_report.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('PDF 產生失敗，請稍後再試。')
    } finally {
      setPdfLoading(false)
    }
  }

  const handleDownloadExcel = () => {
    if (!data) return
    setExcelLoading(true)
    try {
      exportToExcel(data, { clientName, weight, height })
    } catch (e) {
      setError('Excel 匯出失敗，請稍後再試。')
    } finally {
      setExcelLoading(false)
    }
  }

  const availableJoints = data ? Object.keys(data.joint_angles) : []

  return (
    <div className="app">
      {/* Topbar */}
      <div className="topbar" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="topbar-brand">動作分析系統</span>
          <span className="topbar-dot">·</span>
          <span className="topbar-sub">宥芯健康顧問｜YouCore Health Advisors</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
          <span style={{ color: 'var(--text-muted)' }}>🔑 {getUser()?.username}</span>
          <button
            className="btn btn-outline"
            style={{ padding: '4px 12px', fontSize: 12 }}
            onClick={onLogout}
          >
            登出
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {TABS.map(t => (
          <button
            key={t}
            className={`tab-btn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
            disabled={t !== 'upload' && t !== 'clients' && !data && !loading}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="content">
        {/* ── Upload Tab ── */}
        {tab === 'upload' && (
          <div className="upload-page">

            {/* ── Analysis Mode Selector ── */}
            <div className="card">
              <div className="card-title">選擇分析模式</div>
              <div className="mode-selector">
                <button
                  className={`mode-card ${analysisMode === 'balance' ? 'active' : ''}`}
                  onClick={() => setAnalysisMode('balance')}
                >
                  <div className="mode-icon">🧍</div>
                  <div className="mode-label">站立平衡分析</div>
                  <div className="mode-desc">
                    評估靜態站立姿勢，分析重心偏移、<br />
                    肩膀/骨盆歪斜及膝關節對稱性
                  </div>
                  <div className="mode-tags">
                    <span className="mode-tag">重心分析</span>
                    <span className="mode-tag">姿勢對稱</span>
                    <span className="mode-tag">關節角度</span>
                  </div>
                </button>

                <button
                  className={`mode-card ${analysisMode === 'jump' ? 'active' : ''}`}
                  onClick={() => setAnalysisMode('jump')}
                >
                  <div className="mode-icon">🏃</div>
                  <div className="mode-label">跳躍分析</div>
                  <div className="mode-desc">
                    偵測跳躍事件，計算起跳速度、<br />
                    跳躍高度、功率及關節力矩
                  </div>
                  <div className="mode-tags">
                    <span className="mode-tag">跳躍偵測</span>
                    <span className="mode-tag">速度/功率</span>
                    <span className="mode-tag">關節力矩</span>
                  </div>
                </button>
              </div>
            </div>

            <VideoUpload onFile={handleFile} />

            <div className="card">
              <div className="card-title">客戶資料</div>
              <div className="form-row">
                <div className="form-group">
                  <label>綁定客戶帳號</label>
                  <select
                    className="form-input"
                    value={selectedClientId}
                    onChange={e => {
                      const cid = e.target.value
                      setSelectedClientId(cid)
                      // Auto-fill name from client list
                      if (cid) {
                        const c = clients.find(x => x.id === parseInt(cid))
                        if (c) {
                          setClientName(c.name)
                          if (c.weight) setWeight(String(c.weight))
                          if (c.height) setHeight(String(c.height))
                        }
                      }
                    }}
                  >
                    <option value="">— 不綁定客戶 —</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>客戶姓名</label>
                  <input
                    className="form-input"
                    placeholder="例：James Chen"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>體重 (kg)</label>
                  <input
                    className="form-input"
                    type="number"
                    placeholder="例：75"
                    value={weight}
                    onChange={e => setWeight(e.target.value)}
                    min={20} max={300}
                  />
                </div>
                <div className="form-group">
                  <label>身高 (cm)</label>
                  <input
                    className="form-input"
                    type="number"
                    placeholder="例：175"
                    value={height}
                    onChange={e => setHeight(e.target.value)}
                    min={100} max={250}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Analysis Tab ── */}
        {tab === 'analysis' && (
          <>
            {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

            {loading && (
              <div className="loading-overlay">
                <div className="spinner" />
                <div className="loading-text">{progressMsg || '準備中…'}</div>
                <div style={{ width: 280, background: 'var(--border)', borderRadius: 6, height: 8, marginTop: 8 }}>
                  <div style={{
                    width: `${progress}%`, height: '100%',
                    background: 'var(--accent)', borderRadius: 6,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                  {progress}% — 依影片長度約需 1–5 分鐘，請保持畫面開啟
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>
                  ⚠️ 請勿切換其他 App 或鎖定螢幕
                </div>
              </div>
            )}

            {!loading && data && (
              <>
                {/* Mode badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span className={`mode-badge mode-badge-${data.mode || analysisMode}`}>
                    {(data.mode || analysisMode) === 'jump' ? '🏃 跳躍分析模式' : '🧍 站立平衡分析模式'}
                  </span>
                </div>

                <div className="analysis-grid" style={{ marginBottom: 16 }}>
                  {/* Left: video + skeleton */}
                  <div className="card">
                    <div className="card-title">骨架辨識</div>
                    <div className="video-wrapper">
                      <SkeletonCanvas
                        videoUrl={videoUrl}
                        data={data}
                        videoRef={videoRef}
                        onTimeUpdate={handleTimeUpdate}
                      />
                    </div>
                    <div style={{ marginTop: 10, color: 'var(--text-muted)', fontSize: 12 }}>
                      時間：{currentTime.toFixed(2)} s &nbsp;·&nbsp; 總長：{data.duration} s
                    </div>
                  </div>

                  {/* Right: chart */}
                  <div className="card">
                    <div className="card-title">關節角度曲線</div>
                    <div className="joint-selector">
                      {availableJoints.map(j => (
                        <button
                          key={j}
                          className={`joint-tag ${activeJoints.includes(j) ? 'active' : ''}`}
                          onClick={() => toggleJoint(j)}
                        >
                          {j.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                    <JointAngleChart
                      data={data}
                      activeJoints={activeJoints}
                      currentTime={currentTime}
                      onSeek={seekTo}
                    />
                  </div>
                </div>

                {/* Bottom: stats + button */}
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div className="card-title" style={{ marginBottom: 0 }}>統計摘要</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-outline"
                        onClick={handleDownloadExcel}
                        disabled={excelLoading}
                        title="匯出所有 raw data 為 Excel（6 個工作表）"
                      >
                        {excelLoading ? '匯出中…' : '⬇ 匯出 Excel'}
                      </button>
                      <button className="btn btn-success" onClick={() => setTab('report')}>
                        查看完整報告 →
                      </button>
                    </div>
                  </div>
                  <StatsTable data={data} activeJoints={activeJoints} />
                </div>

                {/* COM kinematics with mode selector */}
                {data.com_kinematics && (
                  <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <div className="card-title" style={{ marginBottom: 0 }}>質量中心（COM）動力學</div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[
                          { key: 'displacement', label: '位移' },
                          { key: 'velocity',     label: '速度' },
                          { key: 'acceleration', label: '加速度' },
                        ].map(({ key, label }) => (
                          <button
                            key={key}
                            className={`btn ${comMode === key ? 'btn-primary' : 'btn-outline'}`}
                            style={{ padding: '5px 12px', fontSize: 12 }}
                            onClick={() => setComMode(key)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <JointAngleChart
                      data={data}
                      activeJoints={[]}
                      currentTime={currentTime}
                      onSeek={seekTo}
                      showCom
                      comMode={comMode}
                    />
                  </div>
                )}

                {/* Jump & moments only in jump mode */}
                {(data.mode || analysisMode) === 'jump' && (
                  <>
                    <JumpAnalysis data={data} weight={weight} height={height} />
                    <JointMoments data={data} weight={weight} height={height} />
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ── Clients Tab ── */}
        {tab === 'clients' && (
          <div className="card">
            <ClientManager />
          </div>
        )}

        {/* ── Report Tab ── */}
        {tab === 'report' && data && (
          <div className="report-page">
            {error && <div className="error-banner">{error}</div>}

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div className="card-title" style={{ marginBottom: 0 }}>完整數據報告</div>
                <div className="report-actions">
                  <button
                    className="btn btn-outline"
                    onClick={handleDownloadExcel}
                    disabled={excelLoading}
                  >
                    {excelLoading ? '匯出中…' : '⬇ 匯出 Excel'}
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleDownloadPdf}
                    disabled={pdfLoading}
                  >
                    {pdfLoading ? '產生中…' : '⬇ 下載 PDF 報告'}
                  </button>
                </div>
              </div>

              {/* Video metadata */}
              <table className="stats-table" style={{ marginBottom: 20 }}>
                <tbody>
                  {clientName && <tr><td style={{ color: 'var(--text-muted)' }}>客戶</td><td>{clientName}</td></tr>}
                  {weight && <tr><td style={{ color: 'var(--text-muted)' }}>體重</td><td>{weight} kg</td></tr>}
                  {height && <tr><td style={{ color: 'var(--text-muted)' }}>身高</td><td>{height} cm</td></tr>}
                  <tr><td style={{ color: 'var(--text-muted)' }}>影片長度</td><td>{data.duration} 秒</td></tr>
                  <tr><td style={{ color: 'var(--text-muted)' }}>幀率</td><td>{data.fps?.toFixed(0)} fps</td></tr>
                  <tr><td style={{ color: 'var(--text-muted)' }}>解析度</td><td>{data.width} × {data.height}</td></tr>
                  <tr><td style={{ color: 'var(--text-muted)' }}>分析幀數</td><td>{data.total_frames} frames</td></tr>
                </tbody>
              </table>

              <div className="card-title">所有關節角度統計</div>
              <StatsTable data={data} activeJoints={Object.keys(data.joint_angles)} />
            </div>

            {/* COM summary */}
            {data.com_kinematics && (
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div className="card-title" style={{ marginBottom: 0 }}>質量中心（COM）動力學</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[
                      { key: 'displacement', label: '位移' },
                      { key: 'velocity',     label: '速度' },
                      { key: 'acceleration', label: '加速度' },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        className={`btn ${comMode === key ? 'btn-primary' : 'btn-outline'}`}
                        style={{ padding: '5px 12px', fontSize: 12 }}
                        onClick={() => setComMode(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <JointAngleChart
                  data={data}
                  activeJoints={[]}
                  currentTime={currentTime}
                  onSeek={seekTo}
                  showCom
                  comMode={comMode}
                />
              </div>
            )}

            {(data.mode || analysisMode) === 'jump' && (
              <>
                <JumpAnalysis data={data} weight={weight} height={height} />
                <JointMoments data={data} weight={weight} height={height} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
