// 量表共用計分模組：讀量表設定檔（src/questionnaires/*.json）計算分數
//
// 設定檔重點欄位：
//   scale:    { min, max, allowNA }              題目預設量尺（題目可用 item.scale 覆寫）
//   subscales:[{ key, label }]                  分量表；題目用 item.subscale 對應
//   scoring:  {
//     method: 'percent_of_max' | 'single',      percent_of_max = 已作答題目得分 ÷ 已作答題目滿分 × 100
//     minAnsweredRatio: 0~1,                    分量表作答比例低於此值 → 無法計分
//     total: true                               是否另算總分（所有已作答題目合併）
//   }
// answers: { [itemId]: number | 'NA' }，未作答就不放

export const NA = 'NA'

const isAnswered = (v) => typeof v === 'number' && Number.isFinite(v)
const round1 = (n) => Math.round(n * 10) / 10

function scaleOf(config, item) {
  return { ...config.scale, ...(item.scale ?? {}) }
}

function percentScore(config, items, answers) {
  const answered = items.filter((it) => isAnswered(answers[it.id]))
  const ratio = items.length ? answered.length / items.length : 0
  const computable = answered.length > 0 && ratio >= (config.scoring.minAnsweredRatio ?? 1)
  if (!computable) return { score: null, answered: answered.length, total: items.length, computable: false }

  let got = 0
  let range = 0
  for (const it of answered) {
    const s = scaleOf(config, it)
    got += answers[it.id] - s.min
    range += s.max - s.min
  }
  return { score: round1((got / range) * 100), answered: answered.length, total: items.length, computable: true }
}

/** 驗證單題答案是否合法 */
export function isValidAnswer(config, item, value) {
  const s = scaleOf(config, item)
  if (value === NA) return Boolean(s.allowNA)
  return isAnswered(value) && Number.isInteger(value) && value >= s.min && value <= s.max
}

/**
 * 計分。回傳：
 *   { computable, total?: {score,...}, subscales: { [key]: {score, answered, total, computable} } }
 * 任何一個分量表無法計分，整份 computable 為 false（但仍回傳可計分的分量表）。
 */
export function scoreQuestionnaire(config, answers) {
  for (const [id, v] of Object.entries(answers)) {
    const item = config.items.find((it) => it.id === id)
    if (!item) throw new Error(`未知題目：${id}`)
    if (!isValidAnswer(config, item, v)) throw new Error(`答案不合法：${id}=${v}`)
  }

  if (config.scoring.method === 'single') {
    const item = config.items[0]
    const v = answers[item.id]
    return isAnswered(v)
      ? { computable: true, total: { score: v, answered: 1, total: 1, computable: true }, subscales: {} }
      : { computable: false, total: { score: null, answered: 0, total: 1, computable: false }, subscales: {} }
  }

  if (config.scoring.method !== 'percent_of_max') throw new Error(`不支援的計分方式：${config.scoring.method}`)

  const subscales = {}
  for (const sub of config.subscales ?? []) {
    subscales[sub.key] = percentScore(config, config.items.filter((it) => it.subscale === sub.key), answers)
  }
  const result = { subscales, computable: Object.values(subscales).every((s) => s.computable) }
  if (config.scoring.total) {
    result.total = percentScore(config, config.items, answers)
    result.computable = result.computable && result.total.computable
  }
  return result
}

/** 距離上次填寫是否該回測（預設 28 天） */
export function retestDue(lastSubmittedAt, now = new Date(), days = 28) {
  if (!lastSubmittedAt) return false
  return now - new Date(lastSubmittedAt) >= days * 24 * 60 * 60 * 1000
}
