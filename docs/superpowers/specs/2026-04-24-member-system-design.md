# YouCore 動作分析系統｜會員系統設計規格
**日期：** 2026-04-24
**版本：** v1.0
**狀態：** 已核准，待實作

---

## 一、背景與目標

現有系統為單人無驗證版本，所有分析資料為 in-memory 且不持久化。
本次升級目標：

1. 加入會員登入驗證（管理員 + 客戶兩種角色）
2. 客戶資料與分析結果持久化存入 SQLite 資料庫
3. 影片檔案存入本機 storage 資料夾
4. 客戶端唯讀儀表板（歷史紀錄、影片播放、PDF 下載）
5. 教學示範影片嵌入（YouTube embed）
6. 拍攝規範靜態頁面

---

## 二、使用者角色

| 角色 | 權限 |
|---|---|
| **管理員（admin）** | 完整分析功能、客戶管理、查看所有資料 |
| **客戶（client）** | 唯讀：查看自己的歷史分析、播放影片、下載 PDF |

---

## 三、技術選型

| 項目 | 技術 | 說明 |
|---|---|---|
| 資料庫 | **SQLite** | 單一 `.db` 檔，零設定，備份只需複製檔案 |
| 密碼加密 | **bcrypt** | 業界標準，明文不入庫 |
| 身份驗證 | **JWT（python-jose）** | 7 天有效期，存於 localStorage |
| 影片儲存 | **本機硬碟** | `backend/storage/videos/{client_id}/` |
| ORM | **SQLAlchemy（Core）** | 輕量 SQL 操作，不用 ORM 全功能 |

---

## 四、資料夾結構

```
motion-analysis/
├── backend/
│   ├── main.py              ← 加入 Auth middleware
│   ├── auth.py              ← 新增：JWT 產生/驗證、密碼 hash
│   ├── database.py          ← 新增：SQLite 連線、資料表建立
│   ├── models.py            ← 新增：Pydantic 請求/回應 schema
│   ├── routers/
│   │   ├── auth_router.py   ← 新增：/auth/* 端點
│   │   ├── admin_router.py  ← 新增：/admin/* 端點
│   │   └── client_router.py ← 新增：/client/* 端點
│   └── storage/
│       ├── videos/          ← 新增：{client_id}/{analysis_id}.mp4
│       ├── snapshots/       ← 現有
│       └── backups/         ← 新增：youcore_YYYYMMDD.db
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── LoginPage.jsx
│       │   ├── AdminDashboard.jsx
│       │   ├── ClientDashboard.jsx
│       │   └── GuidelinesPage.jsx
│       ├── components/
│       │   ├── ClientSidebar.jsx   ← 管理員用，左側客戶列表
│       │   ├── HistoryList.jsx     ← 分析歷史列表
│       │   └── VideoEmbed.jsx      ← YouTube embed 元件
│       └── utils/
│           └── auth.js             ← Token 存取、登入狀態管理
```

---

## 五、資料庫 Schema

### `users` 表
```sql
id            INTEGER PRIMARY KEY
username      TEXT UNIQUE NOT NULL
hashed_pw     TEXT NOT NULL
role          TEXT NOT NULL  -- 'admin' | 'client'
client_id     INTEGER        -- FK → clients.id（客戶角色才有）
created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
```

### `clients` 表
```sql
id            INTEGER PRIMARY KEY
name          TEXT NOT NULL
birthday      DATE
gender        TEXT           -- 'M' | 'F' | 'other'
weight        REAL
height        REAL
notes         TEXT
created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
```

### `analyses` 表
```sql
id            INTEGER PRIMARY KEY
client_id     INTEGER NOT NULL  -- FK → clients.id
mode          TEXT NOT NULL     -- 'balance' | 'jump'
video_path    TEXT              -- storage/videos/{client_id}/{id}.mp4
result_json   TEXT              -- 完整分析結果 JSON
duration      REAL
fps           REAL
total_frames  INTEGER
created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
```

---

## 六、API 端點

### Auth
| 方法 | 路徑 | 權限 | 說明 |
|---|---|---|---|
| POST | `/auth/login` | 公開 | 帳密登入，回傳 JWT |
| GET | `/auth/me` | 登入者 | 回傳當前使用者資訊 |

### 管理員
| 方法 | 路徑 | 權限 | 說明 |
|---|---|---|---|
| GET | `/admin/clients` | admin | 取得所有客戶列表 |
| POST | `/admin/clients` | admin | 新增客戶 |
| GET | `/admin/clients/{id}/analyses` | admin | 取得某客戶的分析歷史 |
| POST | `/admin/analyses` | admin | 上傳分析（指定歸屬客戶） |

### 客戶
| 方法 | 路徑 | 權限 | 說明 |
|---|---|---|---|
| GET | `/client/analyses` | client | 取得自己的分析歷史 |
| GET | `/client/analyses/{id}` | client | 取得單筆分析結果 |
| GET | `/client/videos/{id}` | client | 串流播放分析影片（Token 驗證） |

### 現有端點調整
- `/analyze`、`/upload/*`、`/poll/*` 全部加上 JWT 驗證 middleware
- 管理員身份才能發起分析

---

## 七、前端路由設計

```
/login               → LoginPage（未登入預設跳這裡）
/                    → 依角色跳轉
  ├─ admin → /admin  → AdminDashboard（現有分析介面 + 客戶側欄）
  └─ client → /me    → ClientDashboard（唯讀儀表板）
/guidelines          → GuidelinesPage（拍攝規範，登入後可看）
```

### 路由守衛
- 未帶有效 Token → 強制跳轉 `/login`
- 客戶角色存取 `/admin` → 403 拒絕

---

## 八、客戶儀表板（唯讀）

```
ClientDashboard
  ├─ 頂部：歡迎訊息、登出按鈕
  ├─ 分析歷史列表
  │   └─ 每筆：日期、模式、縮圖、[查看] 按鈕
  ├─ 詳細分析頁（點進去）
  │   ├─ 影片播放 + 骨架疊加（SkeletonCanvas 複用）
  │   ├─ 關節角度圖表（JointAngleChart 複用）
  │   ├─ 統計摘要（StatsTable 複用）
  │   └─ [下載 PDF] 按鈕
  └─ 教學影片頁
      └─ YouTube embed 分類列表
```

---

## 九、拍攝規範頁面內容

| 項目 | 規範 |
|---|---|
| 📐 拍攝距離 | 全身入鏡，鏡頭距離 2–3 公尺 |
| 📍 鏡頭高度 | 與腰部同高，避免仰角或俯角 |
| 💡 光線建議 | 正面光源，避免逆光 |
| 🎽 服裝建議 | 貼身運動服，避免寬鬆衣物遮蓋關節 |
| 📱 拍攝方向 | 手機直拍（portrait），固定不晃動 |
| 🕐 影片時長 | 站立平衡：10–15 秒 / 跳躍分析：15–30 秒 |
| 📁 格式支援 | MP4、MOV（iPhone 預設格式即可） |

---

## 十、備份機制

- 每天凌晨 **02:00** 自動備份 `youcore.db` → `storage/backups/youcore_YYYYMMDD.db`
- 保留最近 **30 天**，超過自動刪除
- 影片檔不自動備份（體積大），手動複製 `storage/videos/` 資料夾即可
- 備份由 Python `schedule` 套件在後端背景執行，不需額外工具

---

## 十一、初始帳號

系統首次啟動自動建立管理員帳號：
- 帳號：`james`
- 密碼：`youcore2025`
- 首次登入後建議至設定頁修改密碼

---

## 十二、開發階段與順序

### Phase 1：登入系統（~1–2 天）
- [ ] `database.py`：建立 SQLite 連線、初始化三張表、建立預設管理員帳號
- [ ] `auth.py`：bcrypt 密碼 hash、JWT 產生與驗證
- [ ] `auth_router.py`：`/auth/login`、`/auth/me`
- [ ] 現有 API 加上 JWT middleware
- [ ] 前端：`LoginPage.jsx`、`auth.js` Token 管理、路由守衛

### Phase 2：客戶資料庫（~2–3 天）
- [ ] `admin_router.py`：客戶 CRUD、分析上傳（指定客戶）
- [ ] `client_router.py`：個人歷史、影片串流
- [ ] 分析完成後自動存 `analyses` 表 + 影片檔
- [ ] 前端：`AdminDashboard.jsx`（加入客戶側欄）、`ClientDashboard.jsx`
- [ ] 自動備份排程

### Phase 3：影片嵌入 + 規範頁面（~1 天）
- [ ] `VideoEmbed.jsx`：YouTube URL → embed 播放器
- [ ] 管理員後台：新增/刪除教學影片連結
- [ ] `GuidelinesPage.jsx`：拍攝規範靜態頁面

---

## 十三、不在本次範疇

- 忘記密碼 / Email 重設（未來版本）
- 客戶自行上傳影片（維持管理員代操作）
- 雲端儲存（本次全部本機）
- 付費方案 / 訂閱機制
