// order-notify：訂單變成「可取件」時，用 LINE 官方帳號推播給客戶
// 觸發：資料庫觸發器 orders_notify_ready（帶 x-cron-secret），
//       或管理員在後台按「重送推播」（帶登入 token）
//
// 環境變數：
//   LINE_MESSAGING_TOKEN  官方帳號 Messaging API channel 的 channel access token
//   CRON_SECRET           與 notion-sync 共用
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（平台自動提供）
//
// 注意：LINE Login channel 與 Messaging API channel 必須在同一個 Provider 底下，
//       LIFF 取得的 userId 才能用來推播。

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { readyMessage } from "./message.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function authorized(req: Request, db: SupabaseClient): Promise<boolean> {
  const cron = Deno.env.get("CRON_SECRET");
  if (cron && req.headers.get("x-cron-secret") === cron) return true;
  const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token) return false;
  const { data } = await db.auth.getUser(token);
  if (!data.user) return false;
  const { data: p } = await db.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  return p?.role === "admin";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  if (!(await authorized(req, db))) return json({ error: "UNAUTHORIZED" }, 401);

  let orderId: string | undefined;
  try {
    ({ order_id: orderId } = await req.json());
  } catch {
    return json({ error: "BAD_REQUEST" }, 400);
  }
  if (!orderId) return json({ error: "MISSING_ORDER_ID" }, 400);

  // 先「搶」notified_at，避免重複推播（同時兩次觸發只有一次成功）
  const { data: order, error } = await db
    .from("orders")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "ready")
    .is("notified_at", null)
    .select("id, product_type, profile:profiles(line_user_id, display_name)")
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!order) return json({ skipped: true }); // 已推播過或狀態已改

  // deno-lint-ignore no-explicit-any
  const profile = (order as any).profile;
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("LINE_MESSAGING_TOKEN")}`,
      "X-Line-Retry-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      to: profile.line_user_id,
      messages: [{ type: "text", text: readyMessage(order.product_type, profile.display_name) }],
    }),
  });

  if (!res.ok) {
    // 推播失敗：清掉 notified_at，後台會顯示「未推播」，James 可再按一次重送
    await db.from("orders").update({ notified_at: null }).eq("id", orderId);
    return json({ error: `LINE ${res.status} ${await res.text()}` }, 502);
  }
  return json({ ok: true });
});
