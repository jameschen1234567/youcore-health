// 以 liff 的 vitest 執行：cd liff && npm test
import { describe, expect, it } from "vitest";
import { adminMessage, adminSeriesMessage, clientMessage, clientSeriesMessage, fmtWhen } from "./message.ts";

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

  it("固定預約彙整：列出每一堂", () => {
    const starts = ["2026-12-01T06:00:00Z", "2026-12-08T06:00:00Z"];
    const t = clientSeriesMessage("series", "肌力課", starts, "小明");
    expect(t).toContain("共 2 堂");
    expect(t).toContain("12/1（二）14:00");
    expect(t).toContain("12/8（二）14:00");
    expect(clientSeriesMessage("series_cancelled", "肌力課", starts)).toContain("2 堂「肌力課」固定預約已取消");
    expect(adminSeriesMessage("series", "肌力課", starts, "小明")).toContain("12/1（二）14:00 起");
  });
});
