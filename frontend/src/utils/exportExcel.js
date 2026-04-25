/**
 * Export all analysis raw data to a multi-sheet Excel file.
 * Uses SheetJS (xlsx) — browser-side, no server needed.
 */
import * as XLSX from 'xlsx'

const JOINT_LABELS_ZH = {
  left_elbow:     '左肘',     right_elbow:     '右肘',
  left_shoulder:  '左肩',     right_shoulder:  '右肩',
  left_hip:       '左髖',     right_hip:       '右髖',
  left_knee:      '左膝',     right_knee:      '右膝',
  left_ankle:     '左踝(脛骨傾斜)', right_ankle: '右踝(脛骨傾斜)',
}

function safeVal(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number' && !isFinite(v)) return ''
  return v
}

/** Sheet 1 — 基本資訊 */
function makeInfoSheet(data, clientName, weight, height) {
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
  const rows = [
    ['項目', '數值'],
    ['匯出時間', now],
    ['客戶姓名', clientName || '—'],
    ['體重 (kg)', weight || '—'],
    ['身高 (cm)', height || '—'],
    ['影片長度 (s)', data.duration],
    ['分析幀率 (fps)', data.fps?.toFixed(2)],
    ['原始幀率 (fps)', data.original_fps?.toFixed(2)],
    ['解析度', `${data.width} × ${data.height}`],
    ['分析幀數', data.total_frames],
    ['體型比例 (norm)', safeVal(data.body_scale)],
  ]
  return XLSX.utils.aoa_to_sheet(rows)
}

/** Sheet 2 — 關節角度 (°) */
function makeJointAngleSheet(data) {
  const joints = Object.keys(data.joint_angles)
  const header = ['時間 (s)', ...joints.map(j => JOINT_LABELS_ZH[j] || j)]
  const rows   = [header]
  const n      = data.frames.length
  for (let i = 0; i < n; i++) {
    const row = [safeVal(data.frames[i].timestamp)]
    for (const j of joints) {
      row.push(safeVal(data.joint_angles[j]?.[i]))
    }
    rows.push(row)
  }
  return XLSX.utils.aoa_to_sheet(rows)
}

/** Sheet 3 — 質量中心動力學 */
function makeComSheet(data) {
  const header = [
    '時間 (s)',
    'COM X (norm)', 'COM Y (norm)', 'COM Z (norm)',
    'Vel X (norm/s)', 'Vel Y (norm/s)', 'Vel Z (norm/s)',
    'Acc X (norm/s²)', 'Acc Y (norm/s²)', 'Acc Z (norm/s²)',
  ]
  const rows = [header]
  const n    = data.frames.length
  const kin  = data.com_kinematics || {}
  const com  = data.com || {}
  for (let i = 0; i < n; i++) {
    rows.push([
      safeVal(data.frames[i].timestamp),
      safeVal(com.x?.[i]),  safeVal(com.y?.[i]),  safeVal(com.z?.[i]),
      safeVal(kin.vel_x?.[i]), safeVal(kin.vel_y?.[i]), safeVal(kin.vel_z?.[i]),
      safeVal(kin.acc_x?.[i]), safeVal(kin.acc_y?.[i]), safeVal(kin.acc_z?.[i]),
    ])
  }
  return XLSX.utils.aoa_to_sheet(rows)
}

/** Sheet 4 — 關節力矩係數 (norm; × BW × g × scale_m = N·m) */
function makeJointMomentSheet(data) {
  if (!data.joint_moments) return null
  const joints = Object.keys(data.joint_moments)
  const header = ['時間 (s)', ...joints.map(j => JOINT_LABELS_ZH[j] || j)]
  const rows   = [header]
  const n      = data.frames.length
  for (let i = 0; i < n; i++) {
    const row = [safeVal(data.frames[i].timestamp)]
    for (const j of joints) {
      row.push(safeVal(data.joint_moments[j]?.[i]))
    }
    rows.push(row)
  }
  return XLSX.utils.aoa_to_sheet(rows)
}

/** Sheet 5 — 跳躍分析摘要 */
function makeJumpSheet(data) {
  if (!data.jump_metrics) return null
  const jm = data.jump_metrics
  const summary = [
    ['指標', '數值'],
    ['偵測跳躍次數', (jm.jumps || []).length],
    ['峰值起跳速度 (norm/s)', safeVal(jm.peak_velocity_norm)],
    ['最大跳躍高度 (norm)', safeVal(jm.max_height_norm)],
    ['峰值功率指數 (norm)', safeVal(jm.peak_power_index)],
    ['COM 基準 Y (norm)', safeVal(jm.baseline_y)],
    [],
    ['#', '時間 (s)', '高度 (norm)', '起跳速度 (norm/s)', '峰值功率指數'],
    ...(jm.jumps || []).map((j, idx) => [
      idx + 1,
      safeVal(j.timestamp),
      safeVal(j.height_norm),
      safeVal(j.peak_velocity_norm),
      safeVal(j.peak_power_index),
    ]),
  ]
  return XLSX.utils.aoa_to_sheet(summary)
}

/** Sheet 6 — 逐幀關鍵點座標 */
function makeLandmarkSheet(data) {
  const kpNames = [
    'nose','l_eye','r_eye','l_ear','r_ear',
    'l_shoulder','r_shoulder','l_elbow','r_elbow',
    'l_wrist','r_wrist','l_hip','r_hip',
    'l_knee','r_knee','l_ankle','r_ankle',
  ]
  const header = ['時間 (s)', '幀索引']
  for (const kp of kpNames) {
    header.push(`${kp}_x`, `${kp}_y`, `${kp}_conf`)
  }
  const rows = [header]
  for (const frame of data.frames) {
    const row = [safeVal(frame.timestamp), safeVal(frame.frame_idx)]
    const lm  = frame.landmarks
    for (let i = 0; i < 17; i++) {
      if (lm && lm[i]) {
        row.push(safeVal(lm[i].x), safeVal(lm[i].y), safeVal(lm[i].conf))
      } else {
        row.push('', '', '')
      }
    }
    rows.push(row)
  }
  return XLSX.utils.aoa_to_sheet(rows)
}

/** Sheet 7 — 平衡分析 */
function makeBalanceSheet(data) {
  if (!data.balance_metrics) return null
  const bm  = data.balance_metrics
  const sum = bm.summary || {}
  const n   = data.frames.length

  // ── Summary table ──────────────────────────────────────────
  const summaryRows = [
    ['身體平衡檢測摘要'],
    [],
    ['指標', '平均值', '標準差', '最大偏移'],
    [
      '體幹中線偏移 (半肩寬為單位)',
      safeVal(sum.body_centerline_dev?.mean),
      safeVal(sum.body_centerline_dev?.std),
      safeVal(sum.body_centerline_dev?.max_abs),
    ],
    [
      '左腳承重比例 (%)',
      safeVal(sum.foot_weight_left_pct?.mean),
      safeVal(sum.foot_weight_left_pct?.std),
      safeVal(sum.foot_weight_left_pct?.max_abs),
    ],
    [
      '右腳承重比例 (%)',
      safeVal(sum.foot_weight_right_pct?.mean),
      safeVal(sum.foot_weight_right_pct?.std),
      safeVal(sum.foot_weight_right_pct?.max_abs),
    ],
    [
      '兩腳重心差異比例 (踝骨中點)',
      safeVal(sum.com_lateral_bias?.mean),
      safeVal(sum.com_lateral_bias?.std),
      safeVal(sum.com_lateral_bias?.max_abs),
    ],
    [
      '肩膀角度歪斜 (°)',
      safeVal(sum.shoulder_tilt_deg?.mean),
      safeVal(sum.shoulder_tilt_deg?.std),
      safeVal(sum.shoulder_tilt_deg?.max_abs),
    ],
    [
      '骨盆角度歪斜 (°)',
      safeVal(sum.pelvis_tilt_deg?.mean),
      safeVal(sum.pelvis_tilt_deg?.std),
      safeVal(sum.pelvis_tilt_deg?.max_abs),
    ],
    [
      '膝關節角度差 左-右 (°)',
      safeVal(sum.knee_angle_diff_deg?.mean),
      safeVal(sum.knee_angle_diff_deg?.std),
      safeVal(sum.knee_angle_diff_deg?.max_abs),
    ],
    [
      '膝關節不對稱比例 (%)',
      safeVal(sum.knee_asymmetry_pct?.mean),
      safeVal(sum.knee_asymmetry_pct?.std),
      safeVal(sum.knee_asymmetry_pct?.max_abs),
    ],
    [],
    ['說明'],
    ['體幹中線偏移', '0 = COM 在肩膀中線；正值 = 偏影像右側；負值 = 偏左；1 = 偏半個肩寬'],
    ['腳的承重比例', '槓桿原理估算：COM 距兩踝骨的比例；左腳 + 右腳 = 100%'],
    ['重心差異比例', '0 = 完全置中；正值 = 重心偏右；負值 = 偏左（以影像方向為準）'],
    ['肩膀/骨盆歪斜', '0° = 水平；正值 = 右側較低；負值 = 左側較低'],
    ['膝關節差', '正值 = 左膝彎曲角度較大；負值 = 右膝彎曲角度較大'],
    ['不對稱比例', '|左-右| / 平均 × 100%；< 5% 視為對稱'],
  ]

  // ── Time-series table ──────────────────────────────────────
  const seriesHeader = [
    '時間 (s)',
    '體幹中線偏移',
    '左腳承重 (%)',
    '右腳承重 (%)',
    '重心側向差異 (踝)',
    '肩膀歪斜 (°)',
    '骨盆歪斜 (°)',
    '膝關節差 左-右 (°)',
    '膝關節不對稱 (%)',
  ]
  const seriesRows = [seriesHeader]
  for (let i = 0; i < n; i++) {
    seriesRows.push([
      safeVal(data.frames[i].timestamp),
      safeVal(bm.body_centerline_dev?.[i]),
      safeVal(bm.foot_weight_left_pct?.[i]),
      safeVal(bm.foot_weight_right_pct?.[i]),
      safeVal(bm.com_lateral_bias?.[i]),
      safeVal(bm.shoulder_tilt_deg?.[i]),
      safeVal(bm.pelvis_tilt_deg?.[i]),
      safeVal(bm.knee_angle_diff_deg?.[i]),
      safeVal(bm.knee_asymmetry_pct?.[i]),
    ])
  }

  // Combine: summary at top, blank row, then time series
  const allRows = [
    ...summaryRows,
    [],
    ['── 逐幀時間序列 ──'],
    ...seriesRows,
  ]
  return XLSX.utils.aoa_to_sheet(allRows)
}

/** Column widths helper */
function setColWidths(ws, widths) {
  ws['!cols'] = widths.map(w => ({ wch: w }))
}

/** Main export entry point */
export function exportToExcel(data, { clientName = '', weight = '', height = '' } = {}) {
  if (!data) return

  const wb = XLSX.utils.book_new()

  // Sheet 1 — Info
  const wsInfo = makeInfoSheet(data, clientName, weight, height)
  setColWidths(wsInfo, [20, 24])
  XLSX.utils.book_append_sheet(wb, wsInfo, '基本資訊')

  // Sheet 2 — Joint Angles
  const wsAngles = makeJointAngleSheet(data)
  const angleJoints = Object.keys(data.joint_angles).length
  setColWidths(wsAngles, [10, ...Array(angleJoints).fill(14)])
  XLSX.utils.book_append_sheet(wb, wsAngles, '關節角度(°)')

  // Sheet 3 — COM Kinematics
  const wsCom = makeComSheet(data)
  setColWidths(wsCom, [10, 12, 12, 12, 14, 14, 14, 16, 16, 16])
  XLSX.utils.book_append_sheet(wb, wsCom, 'COM動力學')

  // Sheet 4 — Joint Moments (optional)
  const wsMoments = makeJointMomentSheet(data)
  if (wsMoments) {
    const momentJoints = Object.keys(data.joint_moments).length
    setColWidths(wsMoments, [10, ...Array(momentJoints).fill(14)])
    XLSX.utils.book_append_sheet(wb, wsMoments, '關節力矩(norm)')
  }

  // Sheet 5 — Jump Metrics (optional)
  const wsJump = makeJumpSheet(data)
  if (wsJump) {
    setColWidths(wsJump, [20, 16])
    XLSX.utils.book_append_sheet(wb, wsJump, '跳躍分析')
  }

  // Sheet 6 — Balance Analysis
  const wsBalance = makeBalanceSheet(data)
  if (wsBalance) {
    setColWidths(wsBalance, [30, 14, 13, 13, 22, 14, 14, 20, 18])
    XLSX.utils.book_append_sheet(wb, wsBalance, '平衡分析')
  }

  // Sheet 7 — Raw Landmarks
  const wsLm = makeLandmarkSheet(data)
  setColWidths(wsLm, [10, 8, ...Array(51).fill(8)])
  XLSX.utils.book_append_sheet(wb, wsLm, '關鍵點座標(raw)')

  // Build filename
  const dateStr = new Date().toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).replace(/\//g, '')
  const name = clientName ? `${clientName}_` : ''
  const filename = `YouCore_${name}動作分析_${dateStr}.xlsx`

  XLSX.writeFile(wb, filename)
}
