// booking-notify：預約新增／改期／取消時，用 LINE 官方帳號推播給客戶與所有管理員
// 觸發：資料庫觸發器 bookings_notify（帶 x-cron-secret）
// 環境變數：LINE_MESSAGING_TOKEN、CRON_SECRET、SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { adminMessage, adminRequestMessage, adminSeriesMessage, clientMessage, clientSeriesMessage, type Event, type SeriesEvent } from "./message.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function push(to: string, text: string): Promise<string | null> {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("LINE_MESSAGING_TOKEN")}`,
      "X-Line-Retry-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  return res.ok ? null : `LINE ${res.status} ${await res.text()}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const cron = Deno.env.get("CRON_SECRET");
  if (!cron || req.headers.get("x-cron-secret") !== cron) return json({ error: "UNAUTHORIZED" }, 401);

  let body: {
    booking_id?: string; event?: Event | SeriesEvent | "request"; request_id?: string; old_starts_at?: string | null;
    series_id?: string; booking_ids?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "BAD_REQUEST" }, 400);
  }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  if (body.event === "request") return await requestNotify(db, body.request_id);
  if (body.event === "series" || body.event === "series_cancelled") return await seriesNotify(db, body);
  if (!body.booking_id || !["created", "rescheduled", "cancelled"].includes(body.event ?? "")) {
    return json({ error: "BAD_REQUEST" }, 400);
  }
  const { data: b, error } = await db.from("bookings")
    .select("id, starts_at, cancelled_by, service:services(name), profile:profiles(line_user_id, display_name, full_name)")
    .eq("id", body.booking_id).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!b) return json({ skipped: true });

  // deno-lint-ignore no-explicit-any
  const x = b as any;
  const ev = body.event as Event;
  const service = x.service?.name ?? "預約";
  const name = x.profile?.full_name || x.profile?.display_name || "客戶";
  const errors: string[] = [];

  if (x.profile?.line_user_id) {
    const e = await push(x.profile.line_user_id, clientMessage(ev, service, x.starts_at, x.profile.full_name || x.profile.display_name, body.old_starts_at));
    if (e) errors.push(e);
  }
  const { data: admins } = await db.from("profiles").select("line_user_id").eq("role", "admin");
  for (const a of admins ?? []) {
    if (!a.line_user_id || a.line_user_id === x.profile?.line_user_id) continue;
    const who = ev === "cancelled" && x.cancelled_by === "admin" ? `${name}（後台取消）` : name;
    const e = await push(a.line_user_id, adminMessage(ev, service, x.starts_at, who, body.old_starts_at));
    if (e) errors.push(e);
  }
  return errors.length ? json({ error: errors.join("; ") }, 502) : json({ ok: true });
});

// 每週固定預約：整批建立（series_id）或整批取消（booking_ids）只發一則彙整
// deno-lint-ignore no-explicit-any
async function seriesNotify(db: any, body: { event?: string; series_id?: string; booking_ids?: string[] }): Promise<Response> {
  const ev = body.event as SeriesEvent;
  let q = db.from("bookings")
    .select("id, starts_at, status, service:services(name), profile:profiles(line_user_id, display_name, full_name)")
    .order("starts_at");
  if (ev === "series") {
    if (!body.series_id) return json({ error: "BAD_REQUEST" }, 400);
    q = q.eq("series_id", body.series_id).eq("status", "booked");
  } else {
    if (!Array.isArray(body.booking_ids) || body.booking_ids.length === 0) return json({ error: "BAD_REQUEST" }, 400);
    q = q.in("id", body.booking_ids.slice(0, 60));
  }
  const { data: rows, error } = await q;
  if (error) return json({ error: error.message }, 500);
  if (!rows?.length) return json({ skipped: true });

  // deno-lint-ignore no-explicit-any
  const first = rows[0] as any;
  const service = first.service?.name ?? "預約";
  const p = first.profile;
  const name = p?.full_name || p?.display_name || "客戶";
  // deno-lint-ignore no-explicit-any
  const starts = rows.map((r: any) => r.starts_at as string);
  const errors: string[] = [];

  if (p?.line_user_id) {
    const e = await push(p.line_user_id, clientSeriesMessage(ev, service, starts, p.full_name || p.display_name));
    if (e) errors.push(e);
  }
  const { data: admins } = await db.from("profiles").select("line_user_id").eq("role", "admin");
  for (const a of admins ?? []) {
    if (!a.line_user_id || a.line_user_id === p?.line_user_id) continue;
    const e = await push(a.line_user_id, adminSeriesMessage(ev, service, starts, name));
    if (e) errors.push(e);
  }
  return errors.length ? json({ error: errors.join("; ") }, 502) : json({ ok: true });
}

// 體驗課程申請：只通知管理員（客戶在畫面上已看到送出成功，不另外耗用訊息額度）
// deno-lint-ignore no-explicit-any
async function requestNotify(db: any, id?: string): Promise<Response> {
  if (!id) return json({ error: "BAD_REQUEST" }, 400);
  const { data: r, error } = await db.from("booking_requests")
    .select("concern, preferred, source, service:services(name), profile:profiles(display_name, full_name, phone, gender, birthday)")
    .eq("id", id).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!r) return json({ skipped: true });
  const text = adminRequestMessage({
    client: r.profile?.full_name || r.profile?.display_name || "客戶", phone: r.profile?.phone,
    gender: r.profile?.gender, birthday: r.profile?.birthday,
    service: r.service?.name ?? "體驗課程", concern: r.concern, preferred: r.preferred, source: r.source,
  });
  const { data: admins } = await db.from("profiles").select("line_user_id").eq("role", "admin");
  const errors: string[] = [];
  for (const a of admins ?? []) {
    if (!a.line_user_id) continue;
    const e = await push(a.line_user_id, text);
    if (e) errors.push(e);
  }
  return errors.length ? json({ error: errors.join("; ") }, 502) : json({ ok: true });
}
