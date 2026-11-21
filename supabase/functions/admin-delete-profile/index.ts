// admin-delete-profile：處理「申請刪除我的資料」
// 刪除順序：Storage 足部照片 → auth user（profiles 與所有個資表以 on delete cascade 一併刪除）
// 只留下 deletion_audit（申請時間、處理時間、刪除照片數），不含可識別個人的資料。
//
// 呼叫者必須是 admin；不能刪除 admin 帳號。
// 環境變數：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（平台自動提供）

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const BUCKET = "foot-photos";

async function isAdmin(req: Request, db: SupabaseClient): Promise<boolean> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token) return false;
  const { data } = await db.auth.getUser(token);
  if (!data.user) return false;
  const { data: p } = await db.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  return p?.role === "admin";
}

/** 列出 {profileId}/ 底下所有檔案（路徑為 {profileId}/{measurementId}/{side}.jpg） */
async function listPhotos(db: SupabaseClient, profileId: string): Promise<string[]> {
  const paths: string[] = [];
  const { data: folders, error } = await db.storage.from(BUCKET).list(profileId, { limit: 1000 });
  if (error) throw error;
  for (const f of folders ?? []) {
    if (f.id) { // 直接在第一層的檔案
      paths.push(`${profileId}/${f.name}`);
      continue;
    }
    const { data: files, error: e2 } = await db.storage.from(BUCKET).list(`${profileId}/${f.name}`, { limit: 100 });
    if (e2) throw e2;
    for (const file of files ?? []) paths.push(`${profileId}/${f.name}/${file.name}`);
  }
  return paths;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  if (!(await isAdmin(req, db))) return json({ error: "UNAUTHORIZED" }, 401);

  let profileId: string | undefined;
  try {
    ({ profile_id: profileId } = await req.json());
  } catch {
    return json({ error: "BAD_REQUEST" }, 400);
  }
  if (!profileId) return json({ error: "MISSING_PROFILE_ID" }, 400);

  const { data: target } = await db.from("profiles").select("id, role").eq("id", profileId).maybeSingle();
  if (!target) return json({ error: "NOT_FOUND" }, 404);
  if (target.role === "admin") return json({ error: "CANNOT_DELETE_ADMIN" }, 400);

  const { data: reqs } = await db.from("deletion_requests").select("requested_at")
    .eq("profile_id", profileId).order("requested_at", { ascending: true }).limit(1);

  try {
    const photos = await listPhotos(db, profileId);
    for (let i = 0; i < photos.length; i += 100) {
      const { error } = await db.storage.from(BUCKET).remove(photos.slice(i, i + 100));
      if (error) throw error;
    }
    const { error: delErr } = await db.auth.admin.deleteUser(profileId);
    if (delErr) throw delErr;
    await db.from("deletion_audit").insert({
      requested_at: reqs?.[0]?.requested_at ?? null,
      photos_removed: photos.length,
    });
    return json({ ok: true, photos_removed: photos.length });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
