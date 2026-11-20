// notion-sync：把 Notion「發布」狀態的內容同步到 content_items
// 觸發：pg_cron 每小時（帶 x-cron-secret）或管理員在後台按「立即同步」（帶登入 token）
//
// 環境變數：
//   NOTION_TOKEN        Notion Internal Integration Secret
//   NOTION_DATABASE_ID  內容資料庫 ID
//   CRON_SECRET         排程呼叫用的共用密碼
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（平台自動提供）

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { Block, CHILD_TYPES, imageExt, pageToItem, simplifyBlock } from "./mapping.ts";

const NOTION = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const MAX_DEPTH = 3;
const BUCKET = "content-images";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
type Any = any;

async function notion(path: string, init: RequestInit = {}): Promise<Any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${NOTION}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${Deno.env.get("NOTION_TOKEN")}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
    });
    if (res.status === 429) { // Notion 限流：依 Retry-After 等待後重試
      await new Promise((r) => setTimeout(r, Number(res.headers.get("Retry-After") ?? 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Notion ${path} → ${res.status} ${await res.text()}`);
    return res.json();
  }
  throw new Error(`Notion ${path} → rate limited`);
}

async function queryPublished(dbId: string): Promise<Any[]> {
  const pages: Any[] = [];
  let cursor: string | undefined;
  do {
    const r = await notion(`/databases/${dbId}/query`, {
      method: "POST",
      body: JSON.stringify({
        filter: { property: "狀態", select: { equals: "發布" } },
        start_cursor: cursor,
        page_size: 100,
      }),
    });
    pages.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return pages;
}

async function fetchBlocks(blockId: string, depth = 0): Promise<Block[]> {
  const out: Block[] = [];
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({ page_size: "100", ...(cursor ? { start_cursor: cursor } : {}) });
    const r = await notion(`/blocks/${blockId}/children?${qs}`);
    for (const b of r.results) {
      const children = b.has_children && CHILD_TYPES.has(b.type) && depth < MAX_DEPTH
        ? await fetchBlocks(b.id, depth + 1)
        : undefined;
      const s = simplifyBlock(b, children);
      if (s) out.push(s);
    }
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

/** 把 Notion 暫時性圖片網址轉存到 Supabase Storage，回傳永久公開網址 */
async function persistImage(db: SupabaseClient, url: string, key: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下載圖片失敗 ${res.status}`);
  const type = res.headers.get("content-type");
  const path = `${key}.${imageExt(type, url)}`;
  const { error } = await db.storage.from(BUCKET).upload(path, await res.arrayBuffer(), {
    contentType: type ?? "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function persistBlockImages(db: SupabaseClient, pageId: string, blocks: Block[]): Promise<void> {
  for (const b of blocks) {
    if (b.type === "image" && b.notionHosted) {
      b.src = await persistImage(db, b.src, `${pageId}/${b.blockId}`);
      b.notionHosted = false;
    }
    if ("children" in b && b.children) await persistBlockImages(db, pageId, b.children);
  }
}

async function authorized(req: Request, db: SupabaseClient): Promise<boolean> {
  const cron = Deno.env.get("CRON_SECRET");
  if (cron && req.headers.get("x-cron-secret") === cron) return true;

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
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

  const { data: log } = await db.from("sync_logs").insert({}).select("id").single();
  const finish = (fields: Record<string, unknown>) =>
    db.from("sync_logs").update({ finished_at: new Date().toISOString(), ...fields }).eq("id", log!.id);

  try {
    const pages = await queryPublished(Deno.env.get("NOTION_DATABASE_ID")!);

    const { data: existing } = await db.from("content_items").select("notion_page_id, notion_edited_at");
    const editedAt = new Map((existing ?? []).map((r) => [r.notion_page_id, r.notion_edited_at]));

    const keep = new Set<string>();
    let synced = 0;
    for (const page of pages) {
      const item = pageToItem(page);
      if (!item) continue;
      keep.add(item.notion_page_id);

      // 沒改過的頁面跳過，避免每小時重抓內容和圖片
      if (editedAt.get(item.notion_page_id) === page.last_edited_time) continue;

      const body = await fetchBlocks(page.id);
      await persistBlockImages(db, page.id, body);
      const cover_url = item.cover
        ? item.cover.notionHosted ? await persistImage(db, item.cover.url, `${page.id}/cover`) : item.cover.url
        : null;

      const { cover: _c, ...row } = item;
      const { error } = await db.from("content_items").upsert({
        ...row,
        cover_url,
        body,
        notion_edited_at: page.last_edited_time,
        synced_at: new Date().toISOString(),
      }, { onConflict: "notion_page_id" });
      if (error) throw error;
      synced++;
    }

    // 已下架或刪除的頁面從快取移除
    const removed = (existing ?? []).map((r) => r.notion_page_id).filter((id) => !keep.has(id));
    if (removed.length) {
      const { error } = await db.from("content_items").delete().in("notion_page_id", removed);
      if (error) throw error;
      for (const id of removed) {
        const { data: files } = await db.storage.from(BUCKET).list(id);
        if (files?.length) await db.storage.from(BUCKET).remove(files.map((f) => `${id}/${f.name}`));
      }
    }

    await finish({ ok: true, items_synced: synced });
    return json({ ok: true, published: keep.size, updated: synced, removed: removed.length });
  } catch (e) {
    // 失敗時保留上一版快取，只記錄錯誤
    await finish({ ok: false, error: String(e).slice(0, 2000) });
    return json({ ok: false, error: "SYNC_FAILED" }, 500);
  }
});
