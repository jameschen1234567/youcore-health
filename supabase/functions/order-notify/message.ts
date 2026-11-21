// 推播文字（純函式，方便測試）

export const PRODUCT_LABELS: Record<string, string> = {
  insole: "客製化鞋墊",
  toe_shoe: "五指鞋",
  slipper: "拖鞋",
};

export function readyMessage(productType: string, displayName?: string | null): string {
  const product = PRODUCT_LABELS[productType] ?? "訂製產品";
  const hi = displayName ? `${displayName} 您好，` : "您好，";
  return [
    `${hi}您的${product}已經完成，可以到店取件囉！`,
    "",
    "📍 宥芯健筋療育所｜台北市南港區成福路 51 之 3 號 1 樓（後山埤站）",
    "🕙 週二至週日 10:00–20:30（週一公休）",
    "",
    "取件時我們會幫您確認穿著感受，有任何不舒服都可以現場調整。",
  ].join("\n");
}
