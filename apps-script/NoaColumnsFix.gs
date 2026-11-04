/**
 * תיקון מיפוי עמודות לפי הגיליון האמיתי (מיומן ensureProductMediaColumns)
 *
 * מילון_לוגיסט (כותרות בפועל):
 *  1 מק\"ט ראשי (SKU)
 *  2 שם מוצר רשמי (קומקס)
 *  3 קטגוריה לוגיסטית
 *  4 יחידת מידה
 *  5 סלנג ומילות מפתח לנרמול AI
 *  6 משקל יח' (ק\"ג)
 *  7 סטטוס משקל
 *  8 מחסן מקור ברירת מחדל
 *  9 שיוך נהג ומשאית ברירת מחדל
 * 10 מחיר מחירון (₪)
 * 11 אחוז הנחה (%)
 * + mediaCode / imageUrl יתווספו בסוף אם חסרים
 *
 * מאגר_מדיה (כבר מוכן):
 *  1 קוד_מדיה
 *  2 סוג_אירוע
 *  3 שפה
 *  4 מק\"ט_מקושר
 *  5 קישור_ישיר_לקובץ
 *  6–11 תאריכים / עדיפות / פעיל / עודכן / טריגרים
 */

/** החלף את NOA_CONFIG.COLUMNS בגרסה הזו (או מזגו) */
var NOA_COLUMNS_REAL = {
  LOGISTICS_DICT: {
    SKU: 0,
    NAME: 1,
    CATEGORY: 2,
    UNIT: 3,
    SLANG: 4,
    WEIGHT_KG: 5,
    WEIGHT_STATUS: 6,
    WAREHOUSE: 7,
    DRIVER_TRUCK: 8,
    PRICE: 9,
    DISCOUNT: 10
    // MEDIA_CODE / IMAGE_URL — יזוהו דינמית לפי כותרת
  },
  MEDIA: {
    MEDIA_CODE: 0,   // קוד_מדיה
    EVENT_TYPE: 1,   // סוג_אירוע
    LANGUAGE: 2,     // שפה
    LINKED_SKU: 3,   // מק\"ט_מקושר
    DIRECT_URL: 4,   // קישור_ישיר_לקובץ
    DATE_START: 5,
    DATE_END: 6,
    PRIORITY: 7,     // עדיפות
    IS_ACTIVE: 8,    // פעיל
    UPDATED_BY: 9,   // עודכן_על_ידי
    TRIGGERS: 10     // מילות_טריגר_ונרדפות
  }
};

/**
 * מוסיף עמודות mediaCode + imageUrl לסוף מילון_לוגיסט אם לא קיימות (לפי שם כותרת).
 * מאגר_מדיה כבר מכיל את כל הנדרש — רק מדווח.
 */
function ensureProductMediaColumnsByName() {
  var ss = SpreadsheetApp.openById(NOA_CONFIG.SPREADSHEET_ID);
  var report = {};

  var dict = getSheetByAliases_(ss, NOA_CONFIG.TABS.LOGISTICS_DICT);
  if (!dict) {
    report.logistics = 'sheet_missing';
  } else {
    report.logistics = {
      mediaCode: ensureColumnByHeader_(dict, ['mediaCode', 'קוד_מדיה', 'קוד מדיה', 'מדיה']),
      imageUrl: ensureColumnByHeader_(dict, ['imageUrl', 'קישור תמונה', 'קישור_תמונה', 'url תמונה'])
    };
  }

  var media = getSheetByAliases_(ss, NOA_CONFIG.TABS.MEDIA);
  if (!media) {
    report.media = 'sheet_missing';
  } else {
    report.media = {
      mediaCode: findHeaderCol_(media, ['קוד_מדיה', 'mediaCode']),
      linkedSku: findHeaderCol_(media, ['מק\"ט_מקושר', 'מק״ט_מקושר', 'linkedSku', 'sku']),
      directUrl: findHeaderCol_(media, ['קישור_ישיר_לקובץ', 'קישור ישיר', 'directUrl', 'url']),
      note: 'מאגר_מדיה מוכן — אין צורך בעמודות חדשות'
    };
  }

  Logger.log(JSON.stringify(report));
  return report;
}

/** מחזיר אינדקס 0-based של כותרת, או -1 */
function findHeaderCol_(sheet, names) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').trim().toLowerCase();
    for (var n = 0; n < names.length; n++) {
      if (h === String(names[n]).toLowerCase()) return i;
    }
  }
  return -1;
}

/** אם הכותרת חסרה — מוסיף עמודה בסוף. מחזיר { col: 0-based, created: bool } */
function ensureColumnByHeader_(sheet, names) {
  var existing = findHeaderCol_(sheet, names);
  if (existing >= 0) {
    return { col: existing, created: false, header: names[0] };
  }
  var newCol = sheet.getLastColumn() + 1;
  if (sheet.getMaxColumns() < newCol) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), newCol - sheet.getMaxColumns());
  }
  sheet.getRange(1, newCol).setValue(names[0]).setFontWeight('bold');
  return { col: newCol - 1, created: true, header: names[0] };
}

/** קריאת אינדקס דינמי מתוך שורת כותרות */
function headerMap_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').trim();
    if (h) map[h] = i;
  }
  return map;
}

function colFromMap_(map, candidates, fallback) {
  for (var i = 0; i < candidates.length; i++) {
    if (map[candidates[i]] != null) return map[candidates[i]];
  }
  return fallback;
}
