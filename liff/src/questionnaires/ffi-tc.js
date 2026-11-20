// FFI-TC 台灣繁中版足部功能指數 —— ⚠ 佔位版本 ⚠
//
// 來源：Wu SH, Liang HW, Hou WH. Reliability and validity of the Taiwan Chinese version of the
//       foot function index. J Formos Med Assoc. 2008;107(2):111-122. doi:10.1016/S0929-6646(08)60124-2
//
// 目前的題目文字、各分量表題數（暫定 疼痛 7／失能 9／活動受限 5，合計 21）、作答量尺與
// minAnsweredRatio 都是「佔位」，用來開發與測試流程。
// 取得作者同意與原文後：逐題替換 text、依原文確認分量表／量尺／計分規則，
// 再把 placeholder 改成 false（scoring.test.js 有一個測試會提醒你刪掉）。
// placeholder 為 true 時，正式模式不會顯示這份量表。

const SUBSCALES = [
  { key: 'pain', label: '疼痛', count: 7 },
  { key: 'disability', label: '失能', count: 9 },
  { key: 'activity', label: '活動受限', count: 5 },
]

export default {
  key: 'ffi-tc',
  version: 'placeholder-0',
  placeholder: true,
  title: '足部功能指數（FFI-TC）',
  short: '足部功能',
  intro: '請依照過去一週的狀況，評估你的足部疼痛與活動情形。0 分代表完全沒有，10 分代表最嚴重。如果某題的情境你沒有遇到，請選「不適用」。',
  higherIsWorse: true,
  scale: { min: 0, max: 10, allowNA: true, minLabel: '完全沒有', maxLabel: '最嚴重' },
  subscales: SUBSCALES.map(({ key, label }) => ({ key, label })),
  items: SUBSCALES.flatMap(({ key, label, count }) =>
    Array.from({ length: count }, (_, i) => ({
      id: `${key}_${i + 1}`,
      subscale: key,
      text: `【佔位題目】${label} 第 ${i + 1} 題（待依 FFI-TC 原文替換）`,
    })),
  ),
  scoring: { method: 'percent_of_max', minAnsweredRatio: 0.5, total: true },
  retestDays: 28,
}
