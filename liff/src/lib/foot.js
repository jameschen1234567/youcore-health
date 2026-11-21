// 足部初篩：錯誤碼提示、報告整理（純函式，方便測試）

export const FOOT_ERRORS = {
  PAPER_NOT_FOUND: '找不到 A4 紙，請讓紙的四個角都完整入鏡。',
  TOO_OBLIQUE: '拍攝角度太斜了，請從腳的正上方往下拍。',
  FOOT_OUT_OF_PAPER: '腳超出紙張範圍。足長超過約 28 cm 的話，請改用 A3 紙。',
  FOOT_NOT_FOUND: '紙上找不到腳，請確認整隻腳都踩在紙上，而且地板是深色的。',
  UNREADABLE_IMAGE: '這張照片無法讀取，請重新拍一張。',
  UNSUPPORTED_FORMAT: '請上傳 JPG 或 PNG 照片。',
  FILE_TOO_LARGE: '照片太大了（超過 10 MB），請重新拍一張。',
  RATE_LIMITED: '量測太頻繁了，請等 1 分鐘再試。',
  UNAUTHORIZED: '登入已過期，請關閉後重新開啟。',
  NETWORK: '連線失敗，請確認網路後再試。',
  NOT_CONFIGURED: '量測服務還沒開放，請稍後再試。',
}

export const footErrorMessage = (code) => FOOT_ERRORS[code] ?? '量測失敗，請重新拍一張再試。'

export const FLAG_NOTES = {
  LOW_RESOLUTION: '照片解析度偏低，數值可能比較不準，建議靠近一點重拍。',
  FOOT_ROTATED: '腳沒有和紙張長邊平行，建議擺正後重拍。',
  DEMO: '這是示範數值，不是你的量測結果。',
}

export const WIDTH_LABELS = { narrow: '偏窄', standard: '標準', wide: '偏寬' }

export const SIDE_LABELS = { left: '左腳', right: '右腳' }

/** 左右足長差超過此值（mm）提示重拍確認 */
export const LR_DIFF_WARN_MM = 10

/** 由所有量測紀錄整理出報告：各取左右腳最新一筆 */
export function buildReport(rows) {
  const latest = {}
  for (const r of rows ?? []) {
    if (!latest[r.side] || r.created_at > latest[r.side].created_at) latest[r.side] = r
  }
  const { left, right } = latest
  const diff = left && right ? Math.round(Math.abs(Number(left.length_mm) - Number(right.length_mm)) * 10) / 10 : null
  const flags = [...new Set([...(left?.quality_flags ?? []), ...(right?.quality_flags ?? [])])]
  return {
    left: left ?? null,
    right: right ?? null,
    complete: Boolean(left && right),
    lengthDiff: diff,
    diffWarning: diff != null && diff > LR_DIFF_WARN_MM,
    flags,
  }
}

/** 客戶可自行刪除量測紀錄的時限（與資料庫 0006 policy 一致） */
export const CLIENT_DELETE_HOURS = 24

/** 這筆量測客戶還能不能自己刪 */
export function canClientDelete(row, now = Date.now()) {
  if (!row?.created_at) return false
  return now - new Date(row.created_at).getTime() < CLIENT_DELETE_HOURS * 3600 * 1000
}

/** mm → 顯示用 cm，一位小數 */
export const toCm = (mm) => (Math.round(Number(mm)) / 10).toFixed(1)
