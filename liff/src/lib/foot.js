// 足部與鞋墊量測：輸入檢查、報告整理（純函式，方便測試）

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

export const SOURCE_LABELS = { self: '自己量', onsite: '到店量', photo: '拍照' }
export const INSOLE_SIDE_LABELS = { left: '左腳', right: '右腳', both: '左右相同' }

/** 各欄位合理範圍（mm），與資料庫 0018 一致 */
export const RANGES = { length: [150, 350], width: [50, 160], heel: [30, 120], insoleWidth: [20, 160] }

/** 使用者填的公分 → mm。回傳 { mm } 或 { error } */
export function parseCm(text, [min, max], label) {
  const t = String(text ?? '').normalize('NFKC').replace(/cm|公分/gi, '').trim()
  if (!t) return { error: `請填${label}` }
  if (!/^\d+(\.\d+)?$/.test(t)) return { error: `${label}請填數字，例如 24.5` }
  const mm = Math.round(Number(t) * 10)
  if (mm > max && Number(t) >= min && Number(t) <= max) return { error: `${label}看起來是公釐，請改填公分（例如 ${(Number(t) / 10).toFixed(1)}）` }
  if (mm < min || mm > max) return { error: `${label}應在 ${min / 10}–${max / 10} 公分之間，請再量一次` }
  return { mm }
}

/** 鞋墊寬度量測位置（距腳跟 mm）：依鞋墊長度按比例，取到最接近的 0.5 公分 */
const POINT_RATIOS = [0.09, 0.29, 0.48, 0.66, 0.82, 0.92, 0.96]
export function insolePoints(lengthMm) {
  return POINT_RATIOS.map((r) => Math.round((lengthMm * r) / 5) * 5)
}

/** 每行「距腳跟 寬度」(mm) ↔ 陣列；可直接貼進「YouCore 鞋墊製作」App */
export const widthsToText = (widths) => (widths ?? []).map(([p, w]) => `${p}  ${w}`).join('\n')

/** 回傳 { widths } 或 { error } */
export function parseWidths(text, lengthMm) {
  const widths = []
  for (const line of String(text ?? '').normalize('NFKC').split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/^(\d+(?:\.\d+)?)[\s,:]+(\d+(?:\.\d+)?)$/)
    if (!m) return { error: `看不懂這一行：「${line}」` }
    widths.push([Number(m[1]), Number(m[2])])
  }
  return checkWidths(widths, lengthMm)
}

export function checkWidths(widths, lengthMm) {
  if (widths.length < 4 || widths.length > 12) return { error: '寬度需要 4 到 12 個位置' }
  let prev = 0
  for (const [p, w] of widths) {
    if (p <= prev) return { error: '位置要由腳跟往腳尖，依序變大' }
    if (p >= lengthMm) return { error: `位置 ${p} mm 超過鞋墊長度` }
    if (w < RANGES.insoleWidth[0] || w > RANGES.insoleWidth[1]) return { error: `位置 ${p} mm 的寬度 ${w} mm 不合理` }
    prev = p
  }
  return { widths }
}

/** 不擋儲存、只提醒再確認的地方 */
export function footWarnings({ length, width, heel }) {
  const out = []
  if (heel >= width) out.push('腳跟寬通常比前掌窄，請確認有沒有填反。')
  if (width / length < 0.3 || width / length > 0.5) out.push('前掌寬和足長的比例比較少見，建議再量一次。')
  return out
}

/** 相鄰寬度差太多（> 35 mm）多半是量錯或填錯 */
export function insoleWarnings(widths) {
  const bad = widths.slice(1).find(([, w], i) => Math.abs(w - widths[i][1]) > 35)
  return bad ? [`距腳跟 ${bad[0] / 10} 公分的寬度和前一個位置差很多，建議再量一次。`] : []
}
