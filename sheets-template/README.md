# YouCore 客戶儀錶板 — Google Sheets 設定說明

## 步驟一：建立 Google Sheets

1. 開啟 [Google Sheets](https://sheets.google.com) → 新增空白試算表
2. 將試算表命名為 **YouCore 客戶儀錶板資料庫**
3. 記下網址中的 Spreadsheet ID：
   ```
   https://docs.google.com/spreadsheets/d/【這裡就是 ID】/edit
   ```

---

## 步驟二：建立 5 個分頁並匯入範本資料

依序建立以下分頁（名稱**完全一致**，區分大小寫）：

| 分頁名稱 | 說明 |
|---------|------|
| `clients` | 客戶基本資料 |
| `body_composition` | 身體組成測量記錄 |
| `training_log` | 每次訓練動作記錄 |
| `observations` | 教練觀察與指標 |
| `media` | 體態照片 / 影片連結 |

每個分頁的匯入方式：
- 點選分頁 → 「檔案」→「匯入」→「上傳」→ 選擇對應的 CSV 檔
- 匯入位置選「**附加至目前工作表**」

---

## 步驟三：安裝 Apps Script

1. Sheets 選單 → **「擴充功能」→「Apps Script」**
2. 將 `apps-script.gs` 的全部內容貼入編輯器（覆蓋原有內容）
3. 第 16 行找到這行，填入你的 Spreadsheet ID：
   ```javascript
   const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
   ```
4. 按 **「儲存」**（Ctrl+S）

---

## 步驟四：部署 Apps Script

1. 右上角點 **「部署」→「新增部署作業」**
2. 選擇類型：**「網頁應用程式」**
3. 設定：
   - 執行身分：**我（你的 Gmail）**
   - 存取權：**所有人**（讓客戶可以讀取）
4. 按「部署」→ 授予 Google 權限
5. 複製部署後的 **網頁應用程式 URL**（格式如 `https://script.google.com/macros/s/xxxxx/exec`）

---

## 步驟五：填入儀錶板設定

1. 開啟 `dashboard.html`（在 GitHub repo 裡）
2. 找到第一行設定：
   ```javascript
   const APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL_HERE';
   ```
3. 替換為步驟四複製的 URL
4. 存檔後執行：
   ```bash
   cd youcore-health-repo
   git add dashboard.html
   git commit -m "設定 Apps Script URL"
   git push origin master
   ```

---

## 日常使用說明

### 新增客戶
在 `clients` 分頁新增一行：
```
陳大雄 | 陳大雄 | 減脂 | 2026-06-01 | 2026-07-13 | 1
```
傳送連結給客戶：`https://jameschen1234567.github.io/youcore-health/dashboard.html?client=陳大雄`

### 每週更新訓練記錄
在 `training_log` 分頁新增行，每個動作一行：
```
陳小明 | 2026-06-03 | 上半身推 | 槓鈴臥推 | 4 | 8 | 72.5
```

### 每次回測後更新
在 `body_composition` 新增一行測量數據。

### 上傳體態照片
1. 照片上傳至 Google Drive
2. 右鍵 → 「共用」→ 「知道連結的人」可以檢視
3. 複製連結貼入 `media` 分頁的 `drive_url` 欄

### 指標顏色對照
`indicator_color` 欄位可填入：
- `emerald`（綠）— 良好 / 進步
- `blue`（藍）— 持平
- `amber`（橙）— 待加強
- `rose`（紅）— 退步
- `indigo`（靛）— 一般指標

---

## 客戶連結格式
```
https://jameschen1234567.github.io/youcore-health/dashboard.html?client=客戶名稱
```
> ⚠️ client 名稱需與 Sheets 中的 `client` 欄位**完全一致**（包含中文字）
