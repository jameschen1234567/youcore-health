# LINE 圖文選單設定（宥芯）

圖片由 `make_richmenu.py` 產生（`python make_richmenu.py`），改文字或顏色後重新執行即可。

| 版本 | 檔案 | 尺寸 | OA Manager 版型 |
|------|------|------|----------------|
| 大型 6 格（建議） | `richmenu-large-6.png` | 2500 × 1686 | 大型：上 3 格、下 3 格 |
| 小型 4 格 | `richmenu-compact-4.png` | 2500 × 843 | 小型：4 等分 |

## 按鈕動作

LIFF 深層連結格式：`https://liff.line.me/2012741090-FqGC9CH3/<路徑>`
（需搭配 `liff/vercel.json` 與 `liff/src/main.jsx` 的路徑轉換，才會直接開到該分頁）

| 位置（大型） | 按鈕 | 動作類型 | 內容 |
|------|------|---------|------|
| A 左上 | 我的訓練 | 連結 | `https://liff.line.me/2012741090-FqGC9CH3/training` |
| B 中上 | 初步篩檢 | 連結 | `https://liff.line.me/2012741090-FqGC9CH3/scales` |
| C 右上 | 健康文章 | 連結 | `https://liff.line.me/2012741090-FqGC9CH3` |
| D 左下 | 足部檢測 | 連結 | `https://liff.line.me/2012741090-FqGC9CH3/foot` |
| E 中下 | 會員資料 | 連結 | `https://liff.line.me/2012741090-FqGC9CH3/me` |
| F 右下 | 立即預約 | 文字 | `我想預約` |

小型 4 格依序為：我的訓練、初步篩檢、健康文章、立即預約（網址同上）。

### 預約按鈕
- 建議用「文字」動作送出 `我想預約`，再到 OA Manager → 自動回應訊息，設定關鍵字「我想預約」回覆：可預約項目、營業時間（週二至週日 10:00–20:30）、地址與電話。
- 如果想用「連結」：`https://line.me/R/oaMessage/%40374lyfap/?%E6%88%91%E6%83%B3%E9%A0%90%E7%B4%84`（會開啟聊天室並預填「我想預約」，客戶要自己按送出）。

## 前提
- LINE Developers → LIFF 的 Endpoint URL 要是 `https://youcore-health.vercel.app`（根目錄），深層連結的路徑才會接在後面。
- Login channel 還在 Developing 時，只有 Tester 能登入；正式開放前要改成 Published。
