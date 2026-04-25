/**
 * Upload a file in small chunks to bypass ngrok / proxy size limits.
 *
 * Flow:
 *   POST /upload/start   → { upload_id }
 *   POST /upload/chunk × N
 *   POST /upload/finish  → { job_id }
 *
 * @param {File}     file
 * @param {string}   mode        'balance' | 'jump'
 * @param {Function} onProgress  (0–100) → void
 * @returns {Promise<string>}    job_id
 */
export async function chunkedUpload(file, mode, onProgress, clientId = null) {
  const CHUNK_SIZE = 512 * 1024   // 512 KB per chunk — well under ngrok limits

  // Import authHeaders lazily to avoid circular deps
  const { authHeaders } = await import('./auth.js')
  const HEADERS = authHeaders()

  // ── Step 1: register upload ───────────────────────────────────────────────
  const startForm = new FormData()
  startForm.append('filename', file.name)
  startForm.append('mode', mode)
  if (clientId) startForm.append('client_id', String(clientId))

  const startRes = await fetch('/upload/start', {
    method: 'POST',
    headers: HEADERS,
    body: startForm,
  })
  if (!startRes.ok) {
    const err = await startRes.json().catch(() => ({}))
    throw new Error(`上傳初始化失敗：${err.detail || startRes.statusText}`)
  }
  const { upload_id } = await startRes.json()

  // ── Step 2: send chunks ───────────────────────────────────────────────────
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE
    const end   = Math.min(start + CHUNK_SIZE, file.size)
    const blob  = file.slice(start, end)

    const chunkForm = new FormData()
    chunkForm.append('upload_id',   upload_id)
    chunkForm.append('chunk_index', String(i))
    chunkForm.append('chunk',       blob, file.name)

    let ok = false
    for (let attempt = 0; attempt < 3; attempt++) {  // retry up to 3×
      const res = await fetch('/upload/chunk', {
        method: 'POST',
        headers: HEADERS,
        body: chunkForm,
      })
      if (res.ok) { ok = true; break }
      if (attempt === 2) {
        const err = await res.json().catch(() => ({}))
        throw new Error(`第 ${i + 1} 塊上傳失敗：${err.detail || res.statusText}`)
      }
      await new Promise(r => setTimeout(r, 800))   // wait before retry
    }
    if (!ok) throw new Error(`第 ${i + 1} 塊上傳失敗（重試 3 次）`)

    onProgress(Math.round(((i + 1) / totalChunks) * 80))  // 0–80 % during upload
  }

  // ── Step 3: trigger analysis ──────────────────────────────────────────────
  const finishForm = new FormData()
  finishForm.append('upload_id', upload_id)

  const finishRes = await fetch('/upload/finish', {
    method: 'POST',
    headers: HEADERS,
    body: finishForm,
  })
  if (!finishRes.ok) {
    const err = await finishRes.json().catch(() => ({}))
    throw new Error(`分析啟動失敗：${err.detail || finishRes.statusText}`)
  }
  const { job_id } = await finishRes.json()
  onProgress(85)
  return job_id
}
