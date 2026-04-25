/**
 * Unified API base URL.
 * Dev  → '' (Vite proxy handles all /api calls → localhost:8000)
 * Prod → VITE_API_BASE env var
 */
export const API_BASE = import.meta.env.VITE_API_BASE || ''

export const API = {
  // Auth
  login:          `${API_BASE}/auth/login`,
  me:             `${API_BASE}/auth/me`,
  changePassword: `${API_BASE}/auth/change-password`,

  // Analysis
  analyze:        `${API_BASE}/analyze`,
  status:         (jobId) => `${API_BASE}/status/${jobId}`,
  poll:           (jobId) => `${API_BASE}/poll/${jobId}`,
  generatePdf:    `${API_BASE}/generate-pdf`,
  health:         `${API_BASE}/health`,

  // Upload (chunked)
  uploadStart:    `${API_BASE}/upload/start`,
  uploadChunk:    `${API_BASE}/upload/chunk`,
  uploadFinish:   `${API_BASE}/upload/finish`,

  // Admin
  adminClients:         `${API_BASE}/admin/clients`,
  adminClientAnalyses:  (id) => `${API_BASE}/admin/clients/${id}/analyses`,
  adminAnalysis:        (id) => `${API_BASE}/admin/analyses/${id}`,

  // Client (read-only)
  clientAnalyses:  `${API_BASE}/client/analyses`,
  clientAnalysis:  (id) => `${API_BASE}/client/analyses/${id}`,
  clientVideo:     (id) => `${API_BASE}/client/videos/${id}`,
}

/**
 * Default headers — ngrok-skip + optional auth token.
 * Import authHeaders from utils/auth.js for the full version with Bearer token.
 */
export const AXIOS_HEADERS = {
  'ngrok-skip-browser-warning': '1',
}
