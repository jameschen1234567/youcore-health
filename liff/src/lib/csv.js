// 足部數據匯出（給模板鞋墊 App）
// 規格：每列一隻腳，欄位「客戶名, 腳別, 足長_mm, 足寬_mm, 量測日期, algo_version, 腳跟寬_mm, 來源」
//       單筆檔名「客戶名_腳別_量測日期.csv」
// 加 UTF-8 BOM，Excel 直接開中文才不會亂碼。

const TZ = 'Asia/Taipei'
const HEADER = ['客戶名', '腳別', '足長_mm', '足寬_mm', '量測日期', 'algo_version', '腳跟寬_mm', '來源']
const SOURCE = { self: '自己量', onsite: '到店量', photo: '拍照' }
const SIDE = { left: '左', right: '右' }

/** ISO 時間 → 台北日期 YYYY-MM-DD */
export function taipeiDate(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

function cell(v) {
  const s = v == null ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** rows: [{ client_name, side, length_mm, width_mm, created_at, algo_version }] */
export function footCsv(rows) {
  const lines = [HEADER, ...rows.map((r) => [
    r.client_name ?? '',
    SIDE[r.side] ?? r.side,
    Number(r.length_mm).toFixed(1),
    Number(r.width_mm).toFixed(1),
    taipeiDate(r.created_at),
    r.algo_version,
    r.heel_width_mm == null ? '' : Number(r.heel_width_mm).toFixed(1),
    SOURCE[r.source] ?? '',
  ])]
  return '﻿' + lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n'
}

/** 檔名不能有 Windows 不允許的字元 */
const safe = (s) => String(s ?? '').replace(/[\\/:*?"<>|\s]+/g, '').slice(0, 40) || '未命名'

export function footCsvFilename(row) {
  return `${safe(row.client_name)}_${SIDE[row.side] ?? row.side}_${taipeiDate(row.created_at).replaceAll('-', '')}.csv`
}

export function allFootCsvFilename(now = new Date()) {
  return `足部量測_全部_${taipeiDate(now.toISOString()).replaceAll('-', '')}.csv`
}

export function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
