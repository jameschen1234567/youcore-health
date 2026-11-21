// 訂單狀態與產品（純函式）

export const PRODUCTS = {
  insole: '客製化鞋墊',
  toe_shoe: '五指鞋',
  slipper: '拖鞋',
}

export const STATUSES = [
  { key: 'assessed', label: '已評估', desc: '完成到店評估，準備開始設計' },
  { key: 'designing', label: '設計中', desc: '依你的足型與評估結果設計中' },
  { key: 'printing', label: '製作中', desc: '3D 列印／製作中' },
  { key: 'ready', label: '可取件', desc: '已完成，可以到店取件囉' },
  { key: 'picked_up', label: '已取件', desc: '已取件，穿著有任何問題隨時跟我們說' },
]

export const statusIndex = (key) => STATUSES.findIndex((s) => s.key === key)
export const statusLabel = (key) => STATUSES[statusIndex(key)]?.label ?? key

/** 下一個狀態；已是最後一個則回傳 null */
export function nextStatus(key) {
  const i = statusIndex(key)
  return i >= 0 && i < STATUSES.length - 1 ? STATUSES[i + 1].key : null
}

/** 每個狀態第一次到達的時間（依 order_events），給進度條用 */
export function statusTimes(events) {
  const t = {}
  for (const e of [...(events ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!t[e.status]) t[e.status] = e.created_at
  }
  return t
}

/** 未取件的訂單排前面，其餘依建立時間新到舊 */
export function sortOrders(orders) {
  return [...(orders ?? [])].sort((a, b) => {
    const da = a.status === 'picked_up' ? 1 : 0
    const db = b.status === 'picked_up' ? 1 : 0
    return da - db || b.created_at.localeCompare(a.created_at)
  })
}
