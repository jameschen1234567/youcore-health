# YouCore LIFF 客戶 App｜足部初篩 × 衛教內容 × 量表 設計規格
**日期：** 2026-11-20
**版本：** v1.0
**狀態：** 設計已逐段核准，待 James 審閱規格

---

## 一、背景與範圍

宥芯要給客戶一個 App，整體分三個子專案：

| 子專案 | 內容 | 本規格 |
|---|---|---|
| Phase 1 | 預約、扣課、會員數據、課表 | ❌ 另立規格（同一個 LIFF 殼，之後接上） |
| Phase 2 | 衛教內容、短影音、品牌資訊、量表 | ✅ |
| Phase 3 | 足部初篩（線上）＋到店建模結果與訂單追蹤 | ✅ |

**平台決策：** 用 LINE LIFF（LINE 內開啟的網頁），不做原生 App。客戶不用下載、不用另外註冊。

**本規格不包含：** 預約與扣課、濕腳印足弓判斷（A2，第二版）、NDI／ODI／睡眠壓力量表、原生 App、LiDAR 3D 掃描。

---

## 二、整體架構

```
客戶 LINE ──► LIFF 前端（React + Vite，部署於 Vercel）
               │
               ├─► Supabase（唯一資料中心）
               │     ├ Auth：以 LINE 身份換發 Supabase session
               │     ├ Postgres：客戶、同意紀錄、量表、足部量測、訂單、內容快取
               │     ├ Storage：足部照片（私有）、內容圖片（公開）
               │     └ Edge Functions：LINE 登入驗證、Notion 同步（排程每小時）
               │
               └─► Python 量測 API（現有 Render 服務 youcore-motion-api 新增路由）
                     收照片 → 回傳足長／足寬 → 不落地任何資料

Notion 內容資料庫 ──（每小時＋手動）──► Supabase 內容快取
管理後台（LIFF 同一套前端，admin 角色才看得到的頁面）
```

**原則**
1. Supabase 是唯一資料中心；Python 後端是無狀態的計算服務。
2. 現有動作分析功能（SQLite、JWT 登入）本次不動；資料遷移另案評估。
3. 前端技術沿用 `frontend/` 的 React + Vite，新 App 放在新資料夾 `liff/`，不與現有動作分析前端混在一起。

---

## 三、身份與權限

**登入流程**
1. LIFF 初始化 → `liff.getIDToken()` 取得 LINE ID token。
2. 前端把 ID token 送到 Supabase Edge Function `line-auth`。
3. `line-auth` 呼叫 LINE 的 verify 端點驗證 token（檢查 channel ID、有效期限），取得 LINE userId。
4. 以 LINE userId 找到或建立 `profiles` 資料，簽發 Supabase session 回傳前端。
5. 前端之後所有請求都帶這個 session。

**角色：** `client`（預設）、`admin`（James，手動設定）。

**Row Level Security**
- 所有含個人資料的表：`client` 只能讀寫 `profile_id = 自己` 的列。
- `admin` 可讀寫全部。
- 內容快取表：所有已登入者可讀，只有 Edge Function（service role）可寫。

**Storage**
- `foot-photos`：私有 bucket，路徑 `{profile_id}/{measurement_id}/{left|right}.jpg`；讀取時產生 10 分鐘有效的 signed URL。
- `content-images`：公開 bucket，放 Notion 同步下來的圖片。

**密鑰**
- 一律用環境變數：LINE channel ID／secret、Supabase service key、Notion token、量測 API 驗證用的 Supabase JWT secret。
- 現有 `backend/auth.py` 寫死的 `SECRET_KEY` 一併改為環境變數並更換。

---

## 四、資料模型（Supabase Postgres）

| 表 | 主要欄位 | 說明 |
|---|---|---|
| `profiles` | id, line_user_id (unique), display_name, role, created_at | 一位客戶一列 |
| `consents` | id, profile_id, consent_version, agreed_at, revoked_at | 同意書紀錄，版本更新需重新同意 |
| `deletion_requests` | id, profile_id, requested_at, status | 申請刪除資料，由 James 後台處理 |
| `questionnaire_responses` | id, profile_id, questionnaire_key, questionnaire_version, answers (jsonb), scores (jsonb), computable (bool), submitted_at | 量表答案與計分結果 |
| `pain_maps` | id, profile_id, regions (jsonb：{region_key: 0–10}), submitted_at | 身體疼痛地圖 |
| `foot_measurements` | id, profile_id, side (left/right), length_mm, width_mm, width_class, photo_path, algo_version, quality_flags (jsonb), created_at | 線上 A1 量測結果 |
| `orders` | id, profile_id, product_type (insole/toe_shoe/slipper), status, note, created_at, updated_at | 到店後由 James 建立 |
| `order_events` | id, order_id, status, created_at | 狀態變更紀錄 |
| `sync_logs` | id, started_at, finished_at, ok (bool), items_synced, error | Notion 同步紀錄 |
| `content_items` | id, notion_page_id, type (article/video/brand), title, category, cover_url, video_url, body (jsonb：Notion blocks 轉存), related_service, published_at, synced_at | 內容快取 |

**訂單狀態：** `assessed`（已評估）→ `designing`（設計中）→ `printing`（列印中）→ `ready`（可取件）→ `picked_up`（已取件）。

---

## 五、足部初篩（A1：A4 紙量足長、足寬）

### 客戶流程
1. 拍照教學（圖解＋短片）。
2. 拍左腳 → 上傳量測 → 品質檢查不合格就提示重拍。
3. 拍右腳 → 同上。
4. 填 FFI-TC、疼痛 NRS、疼痛地圖。
5. 顯示「我的足型報告」→ 預約到店完整評估的按鈕（Phase 1 完成前先導到 LINE 官方帳號聊天）。

### 拍照規則
- A4 紙平放在深色地板，赤腳或薄襪，**站立承重**踩上去。
- 由他人從正上方拍攝，紙張四角完整入鏡。

### 量測 API（Python，加進 `backend/`）
- 路由：`POST /foot/measure`，multipart 上傳一張照片＋`side`。
- 驗證：Header 帶 Supabase access token，依專案設定以 Supabase JWKS 公鑰（或舊制 JWT secret）驗證，無效回 401。
- 限制：檔案 ≤ 10 MB，僅 jpg/png/heic 轉 jpg；同一使用者每分鐘最多 10 次。
- 演算法：
  1. 偵測 A4 紙輪廓與四角（OpenCV 邊緣＋四邊形近似）。
  2. 透視轉換成 210 × 297 mm 等比例俯視圖（例如 1 mm = 2 px）。
  3. 在紙張區域內分割足部（亮度／顏色閾值＋形態學處理，取最大輪廓）。
  4. 沿紙張長軸取足部最遠兩點 → 足長；垂直長軸方向的最大寬度（前掌區）→ 足寬。
- 回傳：`{length_mm, width_mm, width_class, quality_flags, algo_version}`；照片本身由前端另外上傳到 Supabase Storage，API 不保存。

### 品質檢查（任一不合格即回傳錯誤碼，前端顯示對應提示）
| 錯誤碼 | 條件 | 提示 |
|---|---|---|
| `PAPER_NOT_FOUND` | 找不到四邊形紙張 | 請讓紙的四個角都入鏡 |
| `TOO_OBLIQUE` | 偵測到的四邊形長寬比偏離 297:210 超過 15%，或對邊長度差超過 20% | 請從正上方拍攝 |
| `FOOT_OUT_OF_PAPER` | 足部輪廓碰到紙張邊界 | 腳超出紙張，足長超過約 28 cm 請改用 A3 紙 |
| `FOOT_NOT_FOUND` | 紙內找不到足夠大的足部輪廓 | 請確認腳完整踩在紙上、地板為深色 |

左右兩腳都完成後，若足長差 > 10 mm，前端提示「左右差距較大，建議重拍確認」（不阻擋送出）。

### 寬度分類與尺寸建議
- `width_class`：以 足寬／足長 比例分窄／標準／寬，**門檻值由 James 依手量資料訂定後寫入設定檔**，不在程式中寫死。
- 拖鞋／五指鞋尺寸：讀取尺寸對照設定檔（James 提供自家產品的尺寸表）。

### 準確度驗收
- 以 James、Nicole 雙腳各拍 3 次，與手量 SOP（站 7）比對。
- 驗收標準：足長、足寬平均絕對誤差 ≤ 5 mm。未達標不開放給客戶。

### 報告用語
- 一律使用「初步篩檢」、「建議」，不使用「診斷」、「治療」。

---

## 六、量表系統

### 設定檔格式
每份量表一個 JSON 設定檔（`liff/src/questionnaires/*.json`），內容：key、版本、標題、說明、題目（id、題目文字、所屬分量表、選項或數字範圍、是否允許「不適用」）、計分規則（分量表加總方式、換算百分比、可計分的最少作答題數）。計分程式為共用模組，讀設定檔運算。

### 第一版量表
| 量表 | 來源 | 狀態 |
|---|---|---|
| **FFI-TC**（台灣繁中版足部功能指數，21 題） | Wu SH, Liang HW, Hou WH. *J Formos Med Assoc* 2008;107(2):111–122. doi:10.1016/S0929-6646(08)60124-2 | **題目文字與計分規則須取自原文**；James 去信通訊作者取得商業使用同意與量表原文後才能上線 |
| **疼痛 NRS 0–10** | 公開通用 | 可直接實作 |
| **身體疼痛地圖** | 自行設計分區（正面／背面） | 分區清單由 James 確認 |

- FAAM：未找到台灣驗證之繁中版，第一版不放。
- FFI-TC 注意：原論文指出活動受限分量表有地板效應，報告與回測時並列疼痛分量表與 NRS，不只看總分。
- 開發期 FFI-TC 設定檔以「佔位題目」測試流程，**正式題目未取得前不得部署給客戶**。

### 結果呈現
- 客戶：每次分數、歷次趨勢圖、4–6 週回測提醒（App 內提醒為主）、前後對比。
- 管理後台：每位客戶的量表歷史與疼痛地圖。

---

## 七、衛教內容（Notion）

### Notion 資料庫欄位
| 欄位 | 類型 | 說明 |
|---|---|---|
| 標題 | Title | — |
| 類型 | Select | 文章／短影音／品牌頁 |
| 分類 | Multi-select | 足部、肩頸、下背、訓練、恢復…可自行新增 |
| 封面 | Files | — |
| 影片連結 | URL | YouTube／IG 網址，短影音用 |
| 相關服務 | Select | 文末預約按鈕對應的服務 |
| 狀態 | Select | 草稿／發布；只有「發布」會同步 |
| 發布日期 | Date | 排序用 |

### 同步（Edge Function `notion-sync`）
- 排程每小時一次；管理後台有「立即同步」按鈕。
- 讀取狀態為「發布」的頁面與其內容區塊，存入 `content_items.body`。
- **圖片：** Notion 檔案網址約 1 小時失效，同步時下載並轉存到 `content-images`，內容中的圖片網址改寫為 Supabase 網址。
- 已從 Notion 取消發布或刪除的頁面，同步時從快取移除。
- 同步失敗：保留上一版快取，錯誤寫入 `sync_logs` 表，後台顯示最後成功時間。

### 前端呈現
- 首頁：最新內容＋分類篩選。
- 短影音：嵌入 YouTube／IG，不上傳影片檔。
- 「關於宥芯」分頁：類型為品牌頁的內容（創辦人、創立過程）。

---

## 八、個資保護

- 健康資料屬個資法第 6 條特種個資：首次使用須勾選電子同意書（蒐集目的、保存期限、查閱與刪除權利），存入 `consents`；同意書改版需重新同意。
- 同意書文字由 James 定稿（可請律師或個資顧問審閱）。
- 「申請刪除我的資料」→ 建立 `deletion_requests`，James 後台處理（連同 Storage 照片一併刪除）。
- 備份：開發期用 Supabase 免費方案；**正式上線前升級 Pro（約 US$25／月）** 取得每日自動備份。

---

## 九、LINE 推播

- 只在訂單狀態變成 `ready`（可取件）時推播，以節省官方帳號免費額度。
- 其他提醒（量表回測等）以 App 內顯示為主。

---

## 十、測試計畫

| 項目 | 方法 |
|---|---|
| 足部量測演算法 | pytest：以標記好實際尺寸的測試照片驗證誤差；各品質檢查錯誤碼各至少一張觸發照片 |
| 量測準確度驗收 | James、Nicole 雙腳 × 3 次 vs 手量 SOP，平均誤差 ≤ 5 mm |
| 量表計分 | 單元測試：以原文計分範例驗證；含「不適用」與缺題無法計分的情境 |
| 權限 | 自動測試：A 客戶讀不到 B 客戶的量表、量測、照片、訂單 |
| Notion 同步 | 以測試用 Notion 資料庫驗證新增、更新、取消發布、圖片轉存 |
| 實機 | iPhone 與 Android 的 LINE 內實際操作完整流程 |

---

## 十一、開發順序（里程碑）

1. **骨架**：`liff/` 專案、LINE 登入（`line-auth`）、同意書、Supabase 資料表與 RLS。
2. **衛教內容**：Notion 資料庫建立、`notion-sync`、內容列表與內頁。
3. **量表**：設定檔格式、計分模組、NRS、疼痛地圖、FFI-TC（佔位題目）、趨勢圖。
4. **足部 A1**：`POST /foot/measure`、拍照流程、品質檢查、報告頁、準確度驗收。
5. **訂單與後台**：訂單狀態、`ready` 推播、管理後台、足部數據匯出（給模板鞋墊 App）。
   - 匯出格式：CSV，每列一隻腳，欄位 `客戶名, 腳別, 足長_mm, 足寬_mm, 量測日期, algo_version`；檔名依鞋墊專案規則 `客戶名_腳別_量測日期.csv`。線上量測僅供參考，正式建模仍以到店手量為準。

---

## 十二、需要 James 準備的項目

- LINE Developers：建立 LINE Login channel 與 LIFF app（我會提供步驟）。
- 確認 LINE 官方帳號現況（是否已開通、方案）。
- Supabase、Vercel、Notion integration 帳號（皆有免費方案）。
- FFI-TC：去信通訊作者取得使用同意與量表原文。
- 疼痛地圖分區清單、寬度分類門檻、拖鞋／五指鞋尺寸表。
- 電子同意書文字定稿。
- 測量驗收用的手量資料（James、Nicole）。
