import { describe, expect, it } from "vitest";
import { readyMessage } from "./message.ts";

describe("readyMessage", () => {
  it("帶入產品與稱呼", () => {
    const m = readyMessage("insole", "小明");
    expect(m).toContain("小明 您好");
    expect(m).toContain("客製化鞋墊");
    expect(m).toContain("可以到店取件");
  });

  it("沒有名字、未知產品也不會壞", () => {
    const m = readyMessage("unknown", null);
    expect(m.startsWith("您好，")).toBe(true);
    expect(m).toContain("訂製產品");
  });

  it("不超過 LINE 單則 5000 字上限", () => {
    expect(readyMessage("slipper", "x".repeat(100)).length).toBeLessThan(5000);
  });
});
