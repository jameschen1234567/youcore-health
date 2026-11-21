// line-auth：驗證 LINE ID token，換發 Supabase session
// 流程：前端送 { idToken } → 向 LINE 驗證 → 找/建 auth user 與 profile
//      → 產生 magic link 的 token_hash 回傳 → 前端 supabase.auth.verifyOtp() 取得 session
//
// 環境變數（supabase secrets set）：
//   LINE_CHANNEL_ID            LINE Login channel ID
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（Supabase 平台自動提供）

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// LINE userId 對應的內部 email（不會寄信，只當作帳號鍵值）
const emailFor = (lineUserId: string) => `${lineUserId.toLowerCase()}@line.youcore.invalid`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  let idToken: string | undefined;
  try {
    ({ idToken } = await req.json());
  } catch {
    return json({ error: "BAD_REQUEST" }, 400);
  }
  if (!idToken) return json({ error: "MISSING_ID_TOKEN" }, 400);

  // 1. 向 LINE 驗證 ID token（會檢查簽章、有效期限、channel ID）
  const verify = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: Deno.env.get("LINE_CHANNEL_ID")! }),
  });
  if (!verify.ok) return json({ error: "INVALID_LINE_TOKEN" }, 401);
  const claims = await verify.json() as { sub: string; name?: string };

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const email = emailFor(claims.sub);

  // 2. 找 profile；沒有就建立 auth user + profile
  const { data: existing } = await admin
    .from("profiles").select("id").eq("line_user_id", claims.sub).maybeSingle();

  if (!existing) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { line_user_id: claims.sub, display_name: claims.name ?? null },
    });
    if (error || !created.user) return json({ error: "CREATE_USER_FAILED" }, 500);

    const { error: pErr } = await admin.from("profiles").insert({
      id: created.user.id,
      line_user_id: claims.sub,
      display_name: claims.name ?? null,
    });
    if (pErr) {
      // 回滾剛建立的帳號，避免留下沒有 profile 的孤兒帳號導致下次登入卡住
      await admin.auth.admin.deleteUser(created.user.id);
      console.error("CREATE_PROFILE_FAILED", pErr.message);
      return json({ error: "CREATE_PROFILE_FAILED" }, 500);
    }
  } else if (claims.name) {
    await admin.from("profiles").update({ display_name: claims.name }).eq("id", existing.id);
  }

  // 3. 產生一次性登入 token，交給前端換 session
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !link.properties?.hashed_token) return json({ error: "LINK_FAILED" }, 500);

  return json({ tokenHash: link.properties.hashed_token });
});
