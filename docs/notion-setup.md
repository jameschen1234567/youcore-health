# Notion 衛教內容後台｜設定步驟（James 用）

大約 10 分鐘。做完之後，你在 Notion 寫文章、把狀態改成「發布」，App 最慢 1 小時內就會更新（後台也可以按「立即同步」）。

## 1. 建立資料庫

在 Notion 新增一個頁面，命名「YouCore App 內容」，插入 **Database – Full page**，欄位**名稱要一字不差**：

| 欄位名稱 | 類型 | 選項／說明 |
|---|---|---|
| 標題 | Title（預設那欄改名） | — |
| 類型 | Select | `文章`、`短影音`、`品牌頁` |
| 分類 | Multi-select | 例：`足部`、`肩頸`、`下背`、`訓練`、`恢復`，可以自己加 |
| 影片連結 | URL | 短影音才填，貼 YouTube 或 IG 網址 |
| 相關服務 | Select | `足部評估`、`身體評估`、`肌力訓練`、`康復訓練`、`運動按摩`、`科技修復`、`頌缽療育` |
| 狀態 | Select | `草稿`、`發布` |
| 發布日期 | Date | App 依這個排序，新的在前 |

封面圖：用 Notion 頁面本身的「Add cover」就好。

## 2. 內文可以用的格式

標題（H1–H3）、段落、粗體／斜體／連結、項目符號、編號清單、引言、Callout、分隔線、圖片、Toggle、YouTube 影片、書籤連結。
其他格式（表格、資料庫、程式碼等）App 會先略過不顯示。

## 3. 建立 Integration，拿到金鑰

1. 打開 https://www.notion.so/profile/integrations → **New integration**
2. 名稱填 `YouCore App`，類型選 **Internal**，Capabilities 只勾 **Read content**
3. 建立後複製 **Internal Integration Secret**（`ntn_` 開頭）——**這是密碼，不要貼到聊天或 LINE**，之後我會教你直接貼進 Supabase 的 Secrets 設定

## 4. 讓 Integration 讀得到資料庫

回到「YouCore App 內容」頁面 → 右上角 `⋯` → **Connections** → 加入 `YouCore App`。

## 5. 拿到資料庫 ID

資料庫頁面網址長這樣：
`https://www.notion.so/xxxx/` **`1a2b3c4d5e6f...`**（32 碼）`?v=...`
中間那 32 碼就是資料庫 ID，這個不是密碼，可以直接給我。

## 6. 品牌頁建議

類型選「品牌頁」的內容會出現在 App 的「關於宥芯」，建議至少建三篇：
- 創辦人介紹
- 宥芯的創立故事
- 我們的服務流程（檢測 → 修復 → 訓練 → 音療 → 回測）
