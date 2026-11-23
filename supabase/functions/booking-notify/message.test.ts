// 以 liff 的 vitest 執行：cd liff && npm test
import { describe, expect, it } from "vitest";
import { adminMessage, clientMessage, fmtWhen } from "./message.ts";

describe("booking-notify 訊息", () => {
  it("fmtWhen 用台北時間", () => {
    expect(fmtWhen("2026-11-25T06:00:00Z")).toBe("11/25（三）14:00");
  });

  it("客戶新增預約訊息含時間、服務、規則", () => {
    const t = clientMessage("created", "科技結合運動按摩", "2026-11-25T06:00:00Z", "小明");
    expect(t).toContain("小明 您好");
    expect(t).toContain("11/25（三）14:00");
    expect(t).toContain("24 小時");
    expect(t).toContain("3 次");
  });

  it("管理員改期訊息顯示新舊時間", () => {
    const t = adminMessage("rescheduled", "康復訓練", "2026-11-26T02:00:00Z", "小明", "2026-11-25T06:00:00Z");
    expect(t).toContain("11/25（三）14:00 → 11/26（四）10:00");
  });
});
