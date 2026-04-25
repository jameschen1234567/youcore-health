import { useState, useRef, useEffect, useCallback } from 'react'

const ACCEPTED = '.mp4,.mov,.avi,.mkv,.webm'

// ── File-pick tab ────────────────────────────────────────────────────────────
function FilePicker({ onFile }) {
  const [dragOver, setDragOver]   = useState(false)
  const [selected, setSelected]   = useState(null)
  const inputRef                  = useRef(null)

  const handle = (file) => {
    if (!file) return
    setSelected(file)
    onFile(file)
  }

  return (
    <>
      <div
        className={`dropzone ${dragOver ? 'drag-over' : ''}`}
        onClick={() => inputRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handle(e.dataTransfer.files[0]) }}
      >
        <div className="dropzone-icon">🎬</div>
        {selected ? (
          <>
            <div className="dropzone-title" style={{ color: 'var(--accent-g)' }}>
              ✓ {selected.name}
            </div>
            <div className="dropzone-sub">
              {(selected.size / (1024 * 1024)).toFixed(1)} MB · 點擊重新選擇
            </div>
          </>
        ) : (
          <>
            <div className="dropzone-title">拖曳影片到此，或點擊選擇</div>
            <div className="dropzone-sub">支援 MP4、MOV、AVI、MKV · 最大 500 MB</div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          style={{ display: 'none' }}
          onChange={e => handle(e.target.files[0])}
        />
      </div>
    </>
  )
}

// ── Camera-record tab ────────────────────────────────────────────────────────
function CameraRecorder({ onFile }) {
  const videoRef      = useRef(null)
  const recorderRef   = useRef(null)
  const chunksRef     = useRef([])
  const streamRef     = useRef(null)

  const [status, setStatus]         = useState('idle')   // idle | previewing | recording | done | error
  const [errMsg, setErrMsg]         = useState('')
  const [elapsed, setElapsed]       = useState(0)
  const [facingMode, setFacingMode] = useState('environment')  // 'environment'=rear, 'user'=front
  const [previewUrl, setPreviewUrl] = useState(null)
  const timerRef = useRef(null)

  // ── helpers ──────────────────────────────────────────────────────────────

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startPreview = useCallback(async (facing = facingMode) => {
    stopStream()
    setErrMsg('')
    setPreviewUrl(null)
    setElapsed(0)

    // navigator.mediaDevices 在 HTTP（非 localhost）環境下不存在
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('error')
      setErrMsg('需要 HTTPS 才能使用鏡頭。請改用「選擇影片」上傳，或請管理員啟用 HTTPS。')
      return
    }

    setStatus('previewing')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
    } catch (e) {
      setStatus('error')
      setErrMsg(e.name === 'NotAllowedError'
        ? '請允許瀏覽器存取相機權限後再試'
        : `相機開啟失敗：${e.message}`)
    }
  }, [facingMode, stopStream])

  // ── lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => { stopStream() }
  }, [stopStream])

  // ── recording ─────────────────────────────────────────────────────────────

  const MAX_RECORD_SEC = 30   // 自動停止上限（秒）
  const autoStopRef = useRef(null)

  const startRecording = () => {
    if (!streamRef.current) return
    chunksRef.current = []

    // Pick best supported codec
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
      .find(m => MediaRecorder.isTypeSupported(m)) || ''

    // iOS Safari 不一定支援 videoBitsPerSecond，用 try/catch 降級
    let recorder
    try {
      recorder = new MediaRecorder(
        streamRef.current,
        mimeType ? { mimeType, videoBitsPerSecond: 2_000_000 } : {}
      )
    } catch {
      recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : {})
    }
    recorderRef.current = recorder

    recorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      clearTimeout(autoStopRef.current)
      stopStream()
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' })
      const ext  = recorder.mimeType?.includes('mp4') ? 'mp4' : 'webm'
      const file = new File([blob], `recording_${Date.now()}.${ext}`, { type: blob.type })
      const url  = URL.createObjectURL(blob)
      setPreviewUrl(url)
      setStatus('done')
      onFile(file)
    }

    // 自動在上限時間後停止
    autoStopRef.current = setTimeout(() => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }, MAX_RECORD_SEC * 1000)

    recorder.start(200)   // collect data every 200 ms
    setStatus('recording')
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
  }

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const retake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    startPreview()
  }

  const toggleCamera = async () => {
    const next = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
    await startPreview(next)
  }

  // ── format timer ─────────────────────────────────────────────────────────

  const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  // ── render ────────────────────────────────────────────────────────────────

  if (status === 'idle') {
    return (
      <div className="camera-idle">
        <div style={{ fontSize: 52, marginBottom: 12 }}>📷</div>
        <div className="dropzone-title">使用裝置鏡頭錄影</div>
        <div className="dropzone-sub" style={{ marginBottom: 16 }}>
          錄製完成後自動送出分析，建議錄製 5–30 秒
        </div>
        <button className="btn btn-primary" onClick={() => startPreview()}>
          開啟鏡頭
        </button>
      </div>
    )
  }

  if (status === 'error') {
    const isHttpsErr = errMsg.includes('HTTPS')
    return (
      <div className="camera-idle">
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div className="dropzone-title" style={{ color: 'var(--accent-r)', fontSize: 14, maxWidth: 320, textAlign: 'center' }}>
          {errMsg}
        </div>
        {!isHttpsErr && (
          <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={() => startPreview()}>
            重試
          </button>
        )}
        <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={() => setStatus('idle')}>
          返回
        </button>
      </div>
    )
  }

  return (
    <div className="camera-wrapper">
      {/* Live / preview video */}
      {status !== 'done' ? (
        <video
          ref={videoRef}
          className="camera-video"
          autoPlay playsInline muted
        />
      ) : (
        <video
          src={previewUrl}
          className="camera-video"
          controls
          playsInline
        />
      )}

      {/* Recording pulse + timer */}
      {status === 'recording' && (
        <div className="camera-rec-badge">
          <span className="camera-rec-dot" /> REC {fmtTime(elapsed)}
          {elapsed >= MAX_RECORD_SEC - 10 && (
            <span style={{ marginLeft: 6, color: '#f87171' }}>
              ({MAX_RECORD_SEC - elapsed}s 後自動停止)
            </span>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="camera-controls">
        {status === 'previewing' && (
          <>
            <button className="cam-btn cam-btn-rec" onClick={startRecording} title="開始錄影">
              ⏺
            </button>
            <button className="cam-btn cam-btn-flip" onClick={toggleCamera} title="切換鏡頭">
              🔄
            </button>
          </>
        )}

        {status === 'recording' && (
          <button className="cam-btn cam-btn-stop" onClick={stopRecording} title="停止錄影">
            ⏹
          </button>
        )}

        {status === 'done' && (
          <>
            <div className="camera-done-msg">✅ 錄影完成，分析中…</div>
            <button className="cam-btn cam-btn-retake" onClick={retake} title="重新錄影">
              🔄 重錄
            </button>
          </>
        )}
      </div>
    </div>
  )
}


// ── Main export ─────────────────────────────────────────────────────────────
export default function VideoUpload({ onFile }) {
  const [tab, setTab] = useState('file')   // 'file' | 'camera'

  return (
    <div className="card">
      <div className="card-title">上傳 / 錄影</div>

      {/* Tab switcher */}
      <div className="upload-tabs">
        <button
          className={`upload-tab ${tab === 'file' ? 'active' : ''}`}
          onClick={() => setTab('file')}
        >
          📂 選擇影片
        </button>
        <button
          className={`upload-tab ${tab === 'camera' ? 'active' : ''}`}
          onClick={() => setTab('camera')}
        >
          📷 即時錄影
        </button>
      </div>

      {tab === 'file'   && <FilePicker    onFile={onFile} />}
      {tab === 'camera' && <CameraRecorder onFile={onFile} />}
    </div>
  )
}
