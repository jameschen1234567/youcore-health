/**
 * YouCore 客戶儀錶板 — 一鍵安裝腳本
 * ====================================
 * 使用方式：
 * 1. 開啟 https://script.google.com → 新增專案
 * 2. 將此檔案全部內容貼入（覆蓋原有內容）
 * 3. 點選頂端的 ▶ 執行（選 runSetup 函式）
 * 4. 授予 Google 權限
 * 5. 執行完畢後，Logger 會印出：
 *    - Google Sheets 網址
 *    - 部署用的 Spreadsheet ID
 * ====================================
 */

function runSetup() {
  // ① 建立試算表
  const ss = SpreadsheetApp.create('YouCore 客戶儀錶板資料庫');
  const ssId = ss.getId();
  const ssUrl = ss.getUrl();

  // ② 建立並填入各分頁
  setupClients(ss);
  setupBodyComposition(ss);
  setupTrainingLog(ss);
  setupObservations(ss);
  setupMedia(ss);

  // ③ 刪除預設的 Sheet1
  const defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('工作表1');
  if (defaultSheet) ss.deleteSheet(defaultSheet);

  // ④ 自動將 API 程式碼寫入此專案（同一個 Apps Script）
  setupApiCode(ssId);

  // ⑤ 輸出結果
  Logger.log('✅ 設定完成！');
  Logger.log('📊 Google Sheets 網址：' + ssUrl);
  Logger.log('🔑 Spreadsheet ID：' + ssId);
  Logger.log('');
  Logger.log('接下來請：');
  Logger.log('1. 點選「部署」→「新增部署作業」');
  Logger.log('2. 類型選「網頁應用程式」');
  Logger.log('3. 執行身分：我 ／ 存取權：所有人');
  Logger.log('4. 複製部署 URL 貼入 dashboard.html 的 APPS_SCRIPT_URL');

  // 彈出提示視窗
  SpreadsheetApp.openById(ssId); // 開啟試算表
  Browser.msgBox(
    '✅ YouCore 設定完成！',
    '試算表已建立：\\n' + ssUrl + '\\n\\n' +
    'Spreadsheet ID：\\n' + ssId + '\\n\\n' +
    '請複製上方 ID，填入此腳本的 SPREADSHEET_ID 欄位後，' +
    '再點選「部署」→「新增部署作業」',
    Browser.Buttons.OK
  );
}

/* ─── 分頁：clients ─── */
function setupClients(ss) {
  const sheet = ss.insertSheet('clients');
  const headers = ['client','display_name','goal','start_date','next_assessment','weeks'];
  const data = [
    ['陳小明','陳小明','增肌減脂','2025-12-01','2026-06-09',25],
    ['李小華','李小華','體重管理','2026-01-15','2026-06-16',18],
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, data.length, headers.length).setValues(data);
  styleHeader(sheet, headers.length);
}

/* ─── 分頁：body_composition ─── */
function setupBodyComposition(ss) {
  const sheet = ss.insertSheet('body_composition');
  const headers = ['client','date','weight','muscle_mass','body_fat_pct','bmi','waist_cm'];
  const data = [
    ['陳小明','2026-04-07',82.1,35.0,24.5,25.8,88],
    ['陳小明','2026-04-14',81.4,35.2,24.1,25.6,87],
    ['陳小明','2026-04-21',80.8,35.5,23.8,25.4,86],
    ['陳小明','2026-04-28',80.3,35.7,23.4,25.2,86],
    ['陳小明','2026-05-05',79.6,35.9,23.0,25.0,85],
    ['陳小明','2026-05-12',79.1,36.1,22.6,24.8,85],
    ['陳小明','2026-05-19',79.0,36.2,22.3,24.8,84],
    ['陳小明','2026-05-26',78.2,36.4,22.1,24.5,84],
    ['李小華','2026-04-07',68.5,27.0,28.0,25.1,82],
    ['李小華','2026-04-21',67.8,27.3,27.5,24.8,81],
    ['李小華','2026-05-05',67.2,27.6,27.0,24.6,80],
    ['李小華','2026-05-19',66.5,27.9,26.5,24.3,79],
    ['李小華','2026-05-26',66.0,28.1,26.2,24.2,79],
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, data.length, headers.length).setValues(data);
  styleHeader(sheet, headers.length);
}

/* ─── 分頁：training_log ─── */
function setupTrainingLog(ss) {
  const sheet = ss.insertSheet('training_log');
  const headers = ['client','date','day_type','exercise','sets','reps','weight_kg'];
  const data = [
    ['陳小明','2026-05-20','上半身推','槓鈴臥推',4,8,70],
    ['陳小明','2026-05-20','上半身推','啞鈴肩推',3,10,20],
    ['陳小明','2026-05-20','上半身推','三頭下壓',3,12,25],
    ['陳小明','2026-05-22','下半身','背蹲舉',4,6,90],
    ['陳小明','2026-05-22','下半身','羅馬尼亞硬舉',3,8,60],
    ['陳小明','2026-05-22','下半身','腿推機',3,12,120],
    ['陳小明','2026-05-24','上半身拉','引體向上',4,6,0],
    ['陳小明','2026-05-24','上半身拉','槓鈴划船',3,8,60],
    ['陳小明','2026-05-24','上半身拉','二頭彎舉',3,12,16],
    ['李小華','2026-05-21','全身','深蹲',3,12,40],
    ['李小華','2026-05-21','全身','硬舉',3,10,50],
    ['李小華','2026-05-21','全身','啞鈴臥推',3,12,14],
    ['李小華','2026-05-23','核心訓練','棒式（秒）',3,60,0],
    ['李小華','2026-05-23','核心訓練','捲腹',3,15,0],
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, data.length, headers.length).setValues(data);
  styleHeader(sheet, headers.length);
}

/* ─── 分頁：observations ─── */
function setupObservations(ss) {
  const sheet = ss.insertSheet('observations');
  const headers = ['client','date','indicator_label','indicator_value','indicator_color','coach_note'];
  const data = [
    ['陳小明','2026-05-26','肩膀活動度','↑ 良好','emerald','本週整體表現穩定進步。臥推重量首次突破 70 kg，代表上肢推力已達新的里程碑。背蹲舉的深度與核心控制較上個月明顯改善，建議下週嘗試逐步增加到 95 kg。'],
    ['陳小明','2026-05-26','核心穩定性','↑ 進步','blue',''],
    ['陳小明','2026-05-26','睡眠品質','→ 持平','indigo',''],
    ['陳小明','2026-05-26','恢復狀態','↑ 改善','amber',''],
    ['李小華','2026-05-26','柔軟度','↑ 進步','emerald','本週核心訓練執行確實，棒式撐體時間從 45 秒進步到 60 秒。建議下週加入側棒式變化動作強化側腹。'],
    ['李小華','2026-05-26','體能狀態','→ 持平','blue',''],
    ['李小華','2026-05-26','飲食控制','↑ 良好','emerald',''],
    ['李小華','2026-05-26','恢復狀態','→ 持平','indigo',''],
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, data.length, headers.length).setValues(data);
  styleHeader(sheet, headers.length);
  // coach_note 欄加寬
  sheet.setColumnWidth(6, 400);
}

/* ─── 分頁：media ─── */
function setupMedia(ss) {
  const sheet = ss.insertSheet('media');
  const headers = ['client','date','type','drive_url','caption'];
  const data = [
    ['陳小明','2026-05-26','photo','（貼入 Google Drive 分享連結）','正面 05/26'],
    ['陳小明','2026-05-26','photo','（貼入 Google Drive 分享連結）','側面 05/26'],
    ['陳小明','2026-05-22','video','（貼入 Google Drive 影片分享連結）','深蹲動作 05/22'],
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, data.length, headers.length).setValues(data);
  styleHeader(sheet, headers.length);
  sheet.setColumnWidth(4, 350);
}

/* ─── 將 API 程式碼注入同一個 Apps Script 專案 ─── */
function setupApiCode(ssId) {
  // 取得目前腳本專案，新增一個檔案放 API 程式碼
  const files = DriveApp.getFilesByName('YouCore_API');
  // 直接在 Logger 印出提示，讓使用者知道要加入程式碼
  Logger.log('📝 請在此 Apps Script 專案中再新增一個檔案，');
  Logger.log('   將 apps-script.gs 的內容貼入，並填入 SPREADSHEET_ID = "' + ssId + '"');
}

/* ─── 工具：設定標題列樣式 ─── */
function styleHeader(sheet, numCols) {
  const headerRange = sheet.getRange(1, 1, 1, numCols);
  headerRange.setBackground('#1a4ed8');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(11);
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, numCols, 140);
}

/* ================================================================
   以下為 API 程式碼（執行完 runSetup 後，請新增檔案貼入此段）
   或直接在同一個檔案中，把 SPREADSHEET_ID 換成你的實際 ID
   ================================================================ */

// ── 填入 runSetup 執行後得到的 Spreadsheet ID ──
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

function doGet(e) {
  const client = (e.parameter.client || '').trim();
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  if (!client) {
    output.setContent(JSON.stringify({ error: '請提供 client 參數' }));
    return output;
  }
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const data = buildClientData(ss, client);
    output.setContent(JSON.stringify(data));
  } catch (err) {
    output.setContent(JSON.stringify({ error: err.message }));
  }
  return output;
}

function buildClientData(ss, client) {
  return {
    info:             getClientInfo(ss, client),
    body_composition: getBodyComposition(ss, client),
    training_log:     getTrainingLog(ss, client),
    observations:     getObservations(ss, client),
    media:            getMedia(ss, client),
  };
}

function getClientInfo(ss, client) {
  const sheet = ss.getSheetByName('clients');
  if (!sheet) return {};
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === client) {
      return {
        name:            rows[i][1] || rows[i][0],
        goal:            rows[i][2] || '',
        start_date:      formatDate(rows[i][3]),
        next_assessment: formatDate(rows[i][4]),
        weeks:           rows[i][5] || '',
      };
    }
  }
  return { name: client };
}

function getBodyComposition(ss, client) {
  const sheet = ss.getSheetByName('body_composition');
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  return rows.slice(1)
    .filter(r => String(r[0]).trim() === client && r[1])
    .sort((a, b) => new Date(a[1]) - new Date(b[1]))
    .map(r => ({
      date:         formatDate(r[1]),
      weight:       toNum(r[2]),
      muscle_mass:  toNum(r[3]),
      body_fat_pct: toNum(r[4]),
      bmi:          toNum(r[5]),
      waist_cm:     toNum(r[6]),
    }));
}

function getTrainingLog(ss, client) {
  const sheet = ss.getSheetByName('training_log');
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
  const grouped = {};
  rows.slice(1)
    .filter(r => String(r[0]).trim() === client && r[1])
    .forEach(r => {
      const date = formatDate(r[1]);
      if (new Date(r[1]) < cutoff) return;
      if (!grouped[date]) grouped[date] = { date, day_type: r[2] || '', exercises: [] };
      grouped[date].exercises.push({
        exercise:  r[3] || '',
        sets:      toNum(r[4]),
        reps:      toNum(r[5]),
        weight_kg: toNum(r[6]),
      });
    });
  return Object.values(grouped).sort((a, b) => new Date(a.date) - new Date(b.date));
}

function getObservations(ss, client) {
  const sheet = ss.getSheetByName('observations');
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  const clientRows = rows.slice(1).filter(r => String(r[0]).trim() === client && r[1]);
  if (!clientRows.length) return [];
  const latestDate = clientRows.map(r => formatDate(r[1])).sort().pop();
  const latest = clientRows.filter(r => formatDate(r[1]) === latestDate);
  return [{
    date:       latestDate,
    indicators: latest.map(r => ({ label: r[2]||'', value: r[3]||'', color: r[4]||'blue' })),
    coach_note: latest[0][5] || '',
  }];
}

function getMedia(ss, client) {
  const sheet = ss.getSheetByName('media');
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  return rows.slice(1)
    .filter(r => String(r[0]).trim() === client && r[1] && r[3] && !String(r[3]).includes('貼入'))
    .sort((a, b) => new Date(b[1]) - new Date(a[1]))
    .slice(0, 12)
    .map(r => ({
      date:      formatDate(r[1]),
      type:      r[2] || 'photo',
      drive_url: r[3],
      caption:   r[4] || '',
    }));
}

function formatDate(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d)) return String(val);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}
function toNum(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}
