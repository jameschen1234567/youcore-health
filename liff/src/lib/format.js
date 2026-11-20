// 日期一律以台北時間顯示
const TZ = 'Asia/Taipei'

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('zh-TW', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
}
