// Notion 資料 → App 資料的純函式（不碰網路，可單元測試）
// 欄位名稱對應 docs/notion-setup.md

export type RichText = {
  text: string;
  href?: string | null;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
};

export type Block =
  | { type: "paragraph" | "heading_1" | "heading_2" | "heading_3" | "quote"; text: RichText[]; children?: Block[] }
  | { type: "bulleted_list_item" | "numbered_list_item" | "toggle"; text: RichText[]; children?: Block[] }
  | { type: "callout"; text: RichText[]; icon?: string | null; children?: Block[] }
  | { type: "divider" }
  | { type: "image"; src: string; caption: RichText[]; notionHosted: boolean; blockId: string }
  | { type: "video" | "embed" | "bookmark"; url: string };

export type ContentItem = {
  notion_page_id: string;
  type: "article" | "video" | "brand";
  title: string;
  category: string[];
  video_url: string | null;
  related_service: string | null;
  published_at: string | null;
  cover: { url: string; notionHosted: boolean } | null;
};

const TYPE_MAP: Record<string, ContentItem["type"]> = {
  "文章": "article",
  "短影音": "video",
  "品牌頁": "brand",
};

// 有子區塊時要往下抓的類型
export const CHILD_TYPES = new Set([
  "toggle", "bulleted_list_item", "numbered_list_item", "callout", "quote", "paragraph",
]);

// deno-lint-ignore no-explicit-any
type Any = any;

export function simplifyRichText(rt: Any[] = []): RichText[] {
  return rt.map((r) => {
    const a = r.annotations ?? {};
    const out: RichText = { text: r.plain_text ?? "" };
    if (r.href) out.href = r.href;
    if (a.bold) out.bold = true;
    if (a.italic) out.italic = true;
    if (a.underline) out.underline = true;
    if (a.strikethrough) out.strikethrough = true;
    if (a.code) out.code = true;
    return out;
  });
}

const plain = (rt: Any[] = []) => rt.map((r) => r.plain_text ?? "").join("").trim();

function fileUrl(f: Any): { url: string; notionHosted: boolean } | null {
  if (!f) return null;
  if (f.type === "file" && f.file?.url) return { url: f.file.url, notionHosted: true };
  if (f.type === "external" && f.external?.url) return { url: f.external.url, notionHosted: false };
  return null;
}

/** 資料庫中的一頁 → ContentItem；類型不認得或沒有標題就回傳 null（略過） */
export function pageToItem(page: Any): ContentItem | null {
  const p = page.properties ?? {};
  const type = TYPE_MAP[p["類型"]?.select?.name ?? ""];
  const title = plain(p["標題"]?.title);
  if (!type || !title) return null;

  return {
    notion_page_id: page.id,
    type,
    title,
    category: (p["分類"]?.multi_select ?? []).map((o: Any) => o.name),
    video_url: p["影片連結"]?.url ?? null,
    related_service: p["相關服務"]?.select?.name ?? null,
    published_at: p["發布日期"]?.date?.start?.slice(0, 10) ?? null,
    cover: fileUrl(page.cover),
  };
}

/** Notion block（含已抓好的 children 陣列）→ App block；不支援的類型回傳 null */
export function simplifyBlock(b: Any, children?: Block[]): Block | null {
  const v = b[b.type] ?? {};
  const kids = children && children.length ? { children } : {};
  switch (b.type) {
    case "paragraph":
    case "heading_1":
    case "heading_2":
    case "heading_3":
    case "quote":
    case "bulleted_list_item":
    case "numbered_list_item":
    case "toggle":
      return { type: b.type, text: simplifyRichText(v.rich_text), ...kids };
    case "callout":
      return { type: "callout", text: simplifyRichText(v.rich_text), icon: v.icon?.emoji ?? null, ...kids };
    case "divider":
      return { type: "divider" };
    case "image": {
      const f = fileUrl(v);
      if (!f) return null;
      return { type: "image", src: f.url, caption: simplifyRichText(v.caption), notionHosted: f.notionHosted, blockId: b.id };
    }
    case "video": {
      const f = fileUrl(v);
      return f && !f.notionHosted ? { type: "video", url: f.url } : null; // 不支援上傳到 Notion 的影片檔
    }
    case "embed":
    case "bookmark":
      return v.url ? { type: b.type, url: v.url } : null;
    default:
      return null;
  }
}

/** 由 Content-Type 或網址推副檔名 */
export function imageExt(contentType: string | null, url: string): string {
  const fromType: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg",
  };
  if (contentType && fromType[contentType.split(";")[0].trim()]) return fromType[contentType.split(";")[0].trim()];
  const m = new URL(url).pathname.match(/\.(jpe?g|png|webp|gif|svg)$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}
