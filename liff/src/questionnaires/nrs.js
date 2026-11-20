// 疼痛數字評分量表（Numeric Rating Scale, NRS 0–10），公開通用
export default {
  key: 'nrs',
  version: '1',
  placeholder: false,
  title: '疼痛分數（NRS）',
  short: '疼痛分數',
  intro: '用 0 到 10 分描述你的疼痛程度。0 分是完全不痛，10 分是你能想像最痛的程度。',
  higherIsWorse: true,
  scale: { min: 0, max: 10, allowNA: false, minLabel: '完全不痛', maxLabel: '最痛' },
  subscales: [],
  items: [{ id: 'avg_7d', text: '過去 7 天，你的疼痛平均大約幾分？' }],
  scoring: { method: 'single' },
  retestDays: 28,
}
