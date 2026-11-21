// 以 liff 的 vitest 執行：cd liff && npm test
import { describe, it, expect } from "vitest";
import { imageExt, pageToItem, simplifyBlock, simplifyRichText } from "./mapping";

const rt = (plain_text: string, annotations = {}, href: string | null = null) => ({ plain_text, annotations, href });

const page = (props: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id: "page-1",
  last_edited_time: "2026-11-20T01:00:00.000Z",
  cover: null,
  properties: {
    "標題": { title: [rt("滑鼠手"), rt("自救")] },
    "類型": { select: { name: "文章" } },
    "分類": { multi_select: [{ name: "肩頸" }, { name: "訓練" }] },
    "影片連結": { url: null },
    "相關服務": { select: { name: "運動按摩" } },
    "發布日期": { date: { start: "2026-11-18" } },
    ...props,
  },
  ...extra,
});

describe("pageToItem", () => {
  it("maps all fields", () => {
    expect(pageToItem(page({}))).toEqual({
      notion_page_id: "page-1",
      type: "article",
      title: "滑鼠手自救",
      category: ["肩頸", "訓練"],
      video_url: null,
      related_service: "運動按摩",
      published_at: "2026-11-18",
      cover: null,
    });
  });

  it("maps 短影音 and 品牌頁", () => {
    expect(pageToItem(page({ "類型": { select: { name: "短影音" } } }))!.type).toBe("video");
    expect(pageToItem(page({ "類型": { select: { name: "品牌頁" } } }))!.type).toBe("brand");
  });

  it("skips unknown type or empty title", () => {
    expect(pageToItem(page({ "類型": { select: null } }))).toBeNull();
    expect(pageToItem(page({ "類型": { select: { name: "其他" } } }))).toBeNull();
    expect(pageToItem(page({ "標題": { title: [rt("  ")] } }))).toBeNull();
  });

  it("tolerates missing optional properties", () => {
    const item = pageToItem(page({ "分類": undefined, "相關服務": undefined, "發布日期": { date: null } }))!;
    expect(item.category).toEqual([]);
    expect(item.related_service).toBeNull();
    expect(item.published_at).toBeNull();
  });

  it("detects notion-hosted vs external cover", () => {
    const hosted = pageToItem(page({}, { cover: { type: "file", file: { url: "https://s3/x.png?sig" } } }))!;
    expect(hosted.cover).toEqual({ url: "https://s3/x.png?sig", notionHosted: true });
    const ext = pageToItem(page({}, { cover: { type: "external", external: { url: "https://img/y.jpg" } } }))!;
    expect(ext.cover).toEqual({ url: "https://img/y.jpg", notionHosted: false });
  });
});

describe("simplifyRichText", () => {
  it("keeps only set annotations and links", () => {
    expect(simplifyRichText([rt("粗", { bold: true, italic: false }), rt("連結", {}, "https://a.b")])).toEqual([
      { text: "粗", bold: true },
      { text: "連結", href: "https://a.b" },
    ]);
  });
});

describe("simplifyBlock", () => {
  const blk = (type: string, value: Record<string, unknown>, id = "b1") => ({ id, type, [type]: value });

  it("text blocks keep rich text and children", () => {
    const child = { type: "paragraph" as const, text: [{ text: "內" }] };
    expect(simplifyBlock(blk("toggle", { rich_text: [rt("標")] }), [child])).toEqual({
      type: "toggle", text: [{ text: "標" }], children: [child],
    });
    expect(simplifyBlock(blk("heading_2", { rich_text: [rt("H")] }))).toEqual({ type: "heading_2", text: [{ text: "H" }] });
    expect(simplifyBlock(blk("heading_4", { rich_text: [rt("H4")] }))).toEqual({ type: "heading_3", text: [{ text: "H4" }] });
  });

  it("callout keeps emoji icon", () => {
    expect(simplifyBlock(blk("callout", { rich_text: [rt("注意")], icon: { type: "emoji", emoji: "💡" } })))
      .toEqual({ type: "callout", text: [{ text: "注意" }], icon: "💡" });
  });

  it("image records hosting and block id", () => {
    expect(simplifyBlock(blk("image", { type: "file", file: { url: "https://s3/a.png" }, caption: [] }, "img9"))).toEqual({
      type: "image", src: "https://s3/a.png", caption: [], notionHosted: true, blockId: "img9",
    });
  });

  it("video only for external links", () => {
    expect(simplifyBlock(blk("video", { type: "external", external: { url: "https://youtu.be/x" } })))
      .toEqual({ type: "video", url: "https://youtu.be/x" });
    expect(simplifyBlock(blk("video", { type: "file", file: { url: "https://s3/v.mp4" } }))).toBeNull();
  });

  it("unsupported types return null", () => {
    expect(simplifyBlock(blk("table", {}))).toBeNull();
    expect(simplifyBlock(blk("child_database", {}))).toBeNull();
    expect(simplifyBlock(blk("bookmark", {}))).toBeNull();
  });
});

describe("imageExt", () => {
  it("prefers content-type, falls back to url, defaults to jpg", () => {
    expect(imageExt("image/png", "https://x/a.jpg")).toBe("png");
    expect(imageExt("image/jpeg; charset=binary", "https://x/a")).toBe("jpg");
    expect(imageExt(null, "https://x/a.JPEG?sig=1")).toBe("jpg");
    expect(imageExt("application/octet-stream", "https://x/a.webp")).toBe("webp");
    expect(imageExt(null, "https://x/a")).toBe("jpg");
  });
});
