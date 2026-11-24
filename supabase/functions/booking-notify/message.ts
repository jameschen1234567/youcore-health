// 預約通知文字（純函式，方便測試）

const TZ = "Asia/Taipei";
const WD = ["日", "一", "二", "三", "四", "五", "六"];

/** 2026-11-25T06:00:00Z → 11/25（三）14:00 */
export function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  const wd = WD[new Date(d.toLocaleString("en-US", { timeZone: TZ })).getDay()];
  return `${p.month}/${p.day}（${wd}）${p.hour}:${p.minute}`;
}

export type Event = "created" | "rescheduled" | "cancelled";

const FOOTER = [
  "",
  "📍 宥芯健筋療育所｜台北市南港區成福路 51 之 3 號 1 樓（後山埤站）",
  "⏰ 開始前 24 小時之前可在 App 取消（已開通預約的會員可自行改期）；24 小時內請直接傳訊息給我們。",
];

export function clientMessage(ev: Event, service: string, startsAt: string, name?: string | null, oldStartsAt?: string | null): string {
  const hi = name ? `${name} 您好，` : "您好，";
  if (ev === "created") {
    return [`${hi}您的預約已成立 ✅`, "", `📅 ${fmtWhen(startsAt)}`, `💪 ${service}`, ...FOOTER,
      "⚠️ 無故未到累計 3 次將暫停線上預約權限。"].join("\n");
  }
  if (ev === "rescheduled") {
    const old = oldStartsAt ? [`原時間：${fmtWhen(oldStartsAt)}`] : [];
    return [`${hi}您的預約已改期 🔄`, "", ...old, `新時間：${fmtWhen(startsAt)}`, `💪 ${service}`, ...FOOTER].join("\n");
  }
  return [`${hi}您 ${fmtWhen(startsAt)} 的「${service}」預約已取消。`, "", "想再預約，點選單的「立即預約」就可以囉。"].join("\n");
}

export function adminMessage(ev: Event, service: string, startsAt: string, client: string, oldStartsAt?: string | null): string {
  const label = { created: "🆕 新預約", rescheduled: "🔄 改期", cancelled: "❌ 取消" }[ev];
  const when = ev === "rescheduled" && oldStartsAt ? `${fmtWhen(oldStartsAt)} → ${fmtWhen(startsAt)}` : fmtWhen(startsAt);
  return `${label}｜${client}\n${when}\n${service}`;
}

export type SeriesEvent = "series" | "series_cancelled";

/** 每週固定預約：整批建立／整批取消的彙整訊息（客戶） */
export function clientSeriesMessage(ev: SeriesEvent, service: string, starts: string[], name?: string | null): string {
  const hi = name ? `${name} 您好，` : "您好，";
  const list = starts.map((s) => `• ${fmtWhen(s)}`);
  if (ev === "series") {
    return [`${hi}已為您排好每週固定預約 ✅`, "", `💪 ${service}｜共 ${starts.length} 堂`, ...list, ...FOOTER,
      "⚠️ 無故未到累計 3 次將暫停線上預約權限。"].join("\n");
  }
  return [`${hi}以下 ${starts.length} 堂「${service}」固定預約已取消：`, ...list, "", "有任何問題歡迎直接傳訊息給我們。"].join("\n");
}

/** 每週固定預約（管理員） */
export function adminSeriesMessage(ev: SeriesEvent, service: string, starts: string[], client: string): string {
  const label = ev === "series" ? "🔁 固定預約" : "❌ 取消固定預約";
  const range = starts.length ? `${fmtWhen(starts[0])} 起` : "";
  return `${label}｜${client}\n${service}｜共 ${starts.length} 堂\n${range}`;
}

/** 台北時間的足歲；沒填回傳 null */
export function ageOn(birthday: string | null | undefined, now = new Date()): number | null {
  if (!birthday) return null;
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now).split("-").map(Number);
  const [by, bm, bd] = birthday.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** 體驗課程申請（只通知管理員） */
export function adminRequestMessage(r: {
  client: string; phone?: string | null; gender?: string | null; birthday?: string | null;
  service: string; concern: string; preferred: string; source?: string | null;
}, now = new Date()): string {
  const g = ({ male: "男生", female: "女生" } as Record<string, string>)[r.gender ?? ""] ?? "生理性別未填";
  const age = ageOn(r.birthday, now);
  return [`📝 體驗申請｜${r.client}`, r.service, `${g}｜${age === null ? "年齡未填" : `${age} 歲`}`, `手機：${r.phone || "未填"}`, `困擾：${r.concern}`, `方便時段：${r.preferred}`,
    ...(r.source ? [`得知管道：${r.source}`] : []), "", "請到後台「體驗申請」確認後協助預約。"].join("\n");
}
