/**
 * YouCore 客戶儀錶板 — Google Apps Script
 * =========================================
 * 安裝方式：
 * 1. 開啟你的 Google Sheets
 * 2. 點選「擴充功能」→「Apps Script」
 * 3. 將此檔案全部內容貼入編輯器
 * 4. 點選「部署」→「新增部署作業」
 *    - 類型選「網頁應用程式」
 *    - 執行身分：我（James）
 *    - 存取權：所有人
 * 5. 複製部署後的網址，貼到 dashboard.html 的 APPS_SCRIPT_URL 變數
 */

// ── Google Sheets ID（從網址取得：.../spreadsheets/d/【這裡】/edit）
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

function doGet(e) {
  const client = (e.parameter.client || '').trim();

  // 允許跨來源請求（CORS）
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

/* ─── 分頁：clients ──────────────────────────────────────────────
   欄位：A=client  B=display_name  C=goal  D=start_date
         E=next_assessment  F=weeks
   ────────────────────────────────────────────────────────────── */
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

/* ─── 分頁：body_composition ────────────────────────────────────
   欄位：A=client  B=date  C=weight  D=muscle_mass  E=body_fat_pct
         F=bmi  G=waist_cm
   ────────────────────────────────────────────────────────────── */
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

/* ─── 分頁：training_log ────────────────────────────────────────
   欄位：A=client  B=date  C=day_type  D=exercise
         E=sets  F=reps  G=weight_kg
   ────────────────────────────────────────────────────────────── */
function getTrainingLog(ss, client) {
  const sheet = ss.getSheetByName('training_log');
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  const clientRows = rows.slice(1)
    .filter(r => String(r[0]).trim() === client && r[1]);

  // 依日期分組，只保留最近 7 天
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
  const grouped = {};
  clientRows.forEach(r => {
    const date = formatDate(r[1]);
    const d = new Date(r[1]);
    if (d < cutoff) return;
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

/* ─── 分頁：observations ────────────────────────────────────────
   欄位：A=client  B=date  C=indicator_label  D=indicator_value
         E=indicator_color  F=coach_note（只在第一列填，其餘空白）
   ────────────────────────────────────────────────────────────── */
function getObservations(ss, client) {
  const sheet = ss.getSheetByName('observations');
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  const clientRows = rows.slice(1).filter(r => String(r[0]).trim() === client && r[1]);
  if (!clientRows.length) return [];

  // 取最新日期那組
  const latestDate = clientRows.map(r => formatDate(r[1])).sort().pop();
  const latest = clientRows.filter(r => formatDate(r[1]) === latestDate);
  return [{
    date:       latestDate,
    indicators: latest.map(r => ({
      label: r[2] || '',
      value: r[3] || '',
      color: r[4] || 'blue',
    })),
    coach_note: latest[0][5] || '',
  }];
}

/* ─── 分頁：media ───────────────────────────────────────────────
   欄位：A=client  B=date  C=type(photo/video)
         D=drive_url  E=caption
   ────────────────────────────────────────────────────────────── */
function getMedia(ss, client) {
  const sheet = ss.getSheetByName('media');
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  return rows.slice(1)
    .filter(r => String(r[0]).trim() === client && r[1] && r[3])
    .sort((a, b) => new Date(b[1]) - new Date(a[1]))   // 最新在前
    .slice(0, 12)                                        // 最多顯示 12 筆
    .map(r => ({
      date:      formatDate(r[1]),
      type:      r[2] || 'photo',
      drive_url: r[3],
      caption:   r[4] || '',
    }));
}

/* ─── 工具 ─── */
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
