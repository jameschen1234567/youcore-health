// 足弓自評模型（純函式）。依據：
//   Nilsson 2012（J Foot Ankle Res 5:3，254 位成人、站立）：舟狀骨高度 NH、Feiss 線 FL、縱弓角 LAA 的平均 ± 1／2 SD 分界
//   Murley 2009（J Foot Ankle Res 2:22）：NNHt 一般足弓 0.27 ± 0.03、扁平 0.18 ± 0.04（只供後台參考，不參與分級）
//   Menz 2012（J Foot Ankle Res 5:10）：腳印目測三分類（只用來檢查一致性；沒有其他資料時才單獨使用）
export const ARCH_VERSION = 'arch-1'
export const ADULT_AGE = 18

export const LEVELS = {
  '-2': '明顯偏低', '-1': '偏低', 0: '一般範圍', 1: '偏高', 2: '明顯偏高',
}
export const LEVEL_SHORT = { '-2': '扁平足傾向明顯', '-1': '扁平足傾向', 0: '一般足弓', 1: '高足弓傾向', 2: '高足弓傾向明顯' }

// 分界：[低於此＝明顯偏低, 低於此＝偏低, 高於此＝偏高, 高於此＝明顯偏高]（Nilsson 2012 Table 3）
export const CUTS = {
  fl: { label: '舟狀骨與連線的距離', unit: 'cm', cut: [-3.3, -2.6, -1.2, -0.4], mean: -1.9, sd: 0.7 },
  laa: { label: '足弓角度', unit: '°', cut: [121, 131, 152, 162], mean: 142, sd: 10.4 },
  nh: { label: '舟狀骨離地高度', unit: 'cm', cut: [2.7, 3.6, 5.5, 6.4], mean: 4.6, sd: 0.9 },
}

export function classify(key, v) {
  const c = CUTS[key].cut
  if (v < c[0]) return -2
  if (v < c[1]) return -1
  if (v > c[3]) return 2
  if (v > c[2]) return 1
  return 0
}

export const POINTS = [
  ['heel', '腳跟最後面、貼地的位置'],
  ['toe', '大拇趾尖、貼地的位置'],
  ['mall', '內踝最突出的中心'],
  ['nav', '舟狀骨：內踝前下方突起的骨頭'],
  ['mt1', '大拇趾根部內側、骨頭突起的中心'],
]

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1]
const cross = (a, b) => a[0] * b[1] - a[1] * b[0]
const len = (a) => Math.hypot(a[0], a[1])
const r1 = (x) => Math.round(x * 10) / 10

/**
 * 由側面照五個點計算。points: {heel, toe, mall, nav, mt1} = [x, y]（同一比例的像素）
 * footLengthMm 作為比例尺。回傳 { metrics } 或 { error }
 */
export function measureArch(points, footLengthMm) {
  if (POINTS.some(([k]) => !points?.[k])) return { error: '還有點沒標' }
  const { heel, toe, mall, nav, mt1 } = points
  const axis = sub(toe, heel)
  const L = len(axis)
  if (L < 50) return { error: '腳跟和腳尖的點太近，請重新標記' }
  const s = footLengthMm / L // mm / px
  // 高度以內踝所在的那一側為正
  const sign = Math.sign(cross(axis, sub(mall, heel))) || 1
  const height = (p) => (sign * cross(axis, sub(p, heel)) / L) * s
  const along = (p) => dot(sub(p, heel), axis) / (L * L)
  const hM = height(mall), hN = height(nav), h1 = height(mt1)
  const aM = along(mall), aN = along(nav), a1 = along(mt1)
  if (!(aM < aN && aN < a1 && aM > 0 && a1 < 0.95)) return { error: '點的前後順序不對：由後往前應該是內踝、舟狀骨、大拇趾根部' }
  if (!(hM > hN)) return { error: '內踝應該比舟狀骨高，請檢查這兩個點' }
  if (hN < 5 || hN > 90 || h1 < 3 || h1 > 60 || hM < 40 || hM > 120) return { error: '點的高度不太合理，請確認腳跟、腳尖的點在貼地的位置，再重新標記' }
  const line = sub(mt1, mall)
  // 連線上與舟狀骨同一垂足的距離；舟狀骨在連線上方（遠離地面）為正
  const d = (cross(line, sub(nav, mall)) / len(line)) * s
  const floorSide = Math.sign(cross(line, sub(heel, mall)))
  const fl = floorSide * d > 0 ? -Math.abs(d) : Math.abs(d)
  const u = sub(mall, nav), v = sub(mt1, nav)
  let laa = (Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (len(u) * len(v))))) * 180) / Math.PI
  if (fl > 0) laa = 360 - laa
  return { metrics: { fl: r1(fl / 10), laa: Math.round(laa), nh: r1(hN / 10) } }
}

/** 一隻腳的判定。input: { metrics?, navHeightMm?, footprint? }；回傳 { level, consistency, items } ，level null = 無法判定 */
export function judgeFoot({ metrics, navHeightMm, footprint }) {
  const items = []
  if (metrics) {
    items.push({ key: 'fl', value: metrics.fl }, { key: 'laa', value: metrics.laa })
  }
  // 用尺量的舟狀骨高度優先於照片換算
  const nh = navHeightMm ? r1(navHeightMm / 10) : metrics?.nh
  if (nh != null) items.push({ key: 'nh', value: nh })
  for (const i of items) i.level = classify(i.key, i.value)
  const fp = { high: 1, normal: 0, low: -1 }[footprint]
  if (!items.length) return fp == null ? { level: null, consistency: 'none', items } : { level: fp, consistency: 'single', items, footprint }
  const lv = items.map((i) => i.level).sort((a, b) => a - b)
  // 中位數；兩項時取較接近一般的那一個，避免高估
  const level = lv.length === 2 ? (Math.abs(lv[0]) <= Math.abs(lv[1]) ? lv[0] : lv[1]) : lv[Math.floor(lv.length / 2)]
  const range = lv.at(-1) - lv[0]
  const opposite = (lv[0] < 0 && lv.at(-1) > 0) || (fp != null && Math.abs(fp - Math.sign(level)) === 2)
  let consistency = items.length === 1 && fp == null ? 'single' : 'good'
  if (opposite || range >= 3) consistency = 'poor'
  else if (range === 2 || (fp != null && fp !== Math.sign(level))) consistency = 'partial'
  return { level, consistency, items, ...(footprint ? { footprint } : {}) }
}

export const CONSISTENCY = {
  good: '各項結果一致', partial: '各項結果部分一致', poor: '各項結果不一致，建議到店確認', single: '只有一項資料，僅供參考', none: '資料不足',
}

export const MEANING = {
  low: '足弓比多數人低。站立時足弓可能較容易往下壓、內側較累。沒有不舒服的話不一定要處理；鞋墊的足弓不是越高越好，要配合足弓能接受的高度。',
  normal: '足弓在多數人的範圍內。重點是鞋子大小合適，以及維持足部與小腿的肌力。',
  high: '足弓比多數人高。腳掌接觸地面的面積可能較小，壓力較集中在前掌和腳跟。鞋墊重點通常是貼合與緩衝。',
}
export const meaningOf = (level) => (level < 0 ? MEANING.low : level > 0 ? MEANING.high : MEANING.normal)

/** 整份結果。data: { feet:{left,right}, arch:{left,right}, insole, flags } */
export function buildAssessment(data, age) {
  const child = age != null && age < ADULT_AGE
  const out = { version: ARCH_VERSION, child, notes: [] }
  for (const side of ['left', 'right']) {
    const a = data.arch?.[side] ?? {}
    const m = a.points ? measureArch(a.points, data.feet[side].length_mm) : {}
    out[side] = child ? { level: null, consistency: 'none', items: [] }
      : judgeFoot({ metrics: m.metrics, navHeightMm: a.nav_height_mm, footprint: a.footprint })
    out[side].flexible = a.tiptoe ?? null
  }
  const { left, right } = data.feet
  const dl = Math.abs(left.length_mm - right.length_mm)
  if (dl > 10) out.notes.push(`左右足長差 ${r1(dl / 10)} 公分，差距較大，建議再量一次。`)
  if (out.left.level != null && out.right.level != null && Math.abs(out.left.level - out.right.level) >= 2) out.notes.push('左右腳的足弓差異較大，建議到店確認。')
  const fl = Math.max(left.length_mm, right.length_mm)
  const il = data.insole.length_mm
  if (il < fl) out.notes.push(`鞋墊長度（${r1(il / 10)} 公分）比足長（${r1(fl / 10)} 公分）短，這雙鞋可能偏小，或其中一項需要再量。`)
  else if (il - fl > 25) out.notes.push(`鞋墊比足長多 ${r1((il - fl) / 10)} 公分，這雙鞋可能偏大，或其中一項需要再量。`)
  const fw = Math.max(left.width_mm, right.width_mm)
  const iw = Math.max(...data.insole.widths.map(([, w]) => w))
  if (fw - iw > 8) out.notes.push(`前掌寬（${r1(fw / 10)} 公分）比鞋墊最寬處（${r1(iw / 10)} 公分）多，前掌可能會擠，選鞋時留意鞋楦寬度。`)
  return out
}

export const RED_FLAGS = [
  ['diabetes', '有糖尿病、足部麻木或傷口不易癒合'],
  ['collapse', '近期單側足弓突然塌下來，或內踝後下方腫痛'],
  ['tiptoe', '單腳踮不起腳尖，或踮腳會明顯疼痛'],
  ['injury', '近 6 個月足踝骨折、手術，或目前紅腫熱痛'],
]
export const PAINS = [['none', '沒有不舒服'], ['heel', '腳跟'], ['arch', '足弓'], ['forefoot', '前掌'], ['knee', '膝蓋']]
export const USES = [['daily', '日常走路'], ['stand', '長時間站立'], ['sport', '運動']]
export const FOOTPRINTS = [['high', '中間很細或斷開'], ['normal', '中間約一半寬'], ['low', '中間幾乎一樣寬'], ['', '沒有做']]
export const TIPTOE = [['appears', '踮腳時足弓會出現'], ['always', '站著就有明顯足弓'], ['no', '踮腳時也沒有足弓'], ['cannot', '踮不起來'], ['', '不確定']]

/** 足寬量測位置（距腳跟 mm） */
export const footPoints = (lengthMm) => [0.1, 0.3, 0.5, 0.7, 0.85].map((r) => Math.round((lengthMm * r) / 5) * 5)

// ── 以下只給後台：沿用既有「鞋墊處方引擎」的對照，不是文獻公式 ──
const ENGINE = {
  '-2': { infill: 80, contact: 1, support: '剛性內側縱弓支撐' }, '-1': { infill: 72, contact: 1, support: '剛性內側縱弓支撐' },
  0: { infill: 58, contact: 0.95, support: '標準足弓貼合' }, 1: { infill: 48, contact: 0.95, support: '全接觸貼合＋加強吸震' }, 2: { infill: 42, contact: 0.95, support: '全接觸貼合＋高吸震' },
}
export function insoleHint(level, clearanceMm) {
  if (level == null) return null
  const e = ENGINE[level]
  return { ...e, heightMm: clearanceMm ? r1(clearanceMm * e.contact) : null }
}
export const nnht = (nhCm, ballMm) => (nhCm && ballMm ? Math.round(((nhCm * 10) / ballMm) * 100) / 100 : null)
