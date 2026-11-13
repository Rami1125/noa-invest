/**
 * GPS מארכיון תעודות_גליה — AA:AB ראשי, AH:AJ גיבוי
 *
 * התקנה:
 * 1. הדבק קובץ זה בפרויקט GAS (או העתק את הפונקציות ל-Code.gs).
 * 2. ב-handleGetNotes, אחרי בניית headers ולפני notes.push:
 *      const gps = extractArchiveGps_(row, headers);
 * 3. בתוך notes.push הוסף:
 *      itArrive: gps.itArrive || "",
 *      itDepart: gps.itDepart || "",
 *      itStop: gps.itStop,
 *      itStatus: gps.itStatus || "",
 *      gpsSource: gps.gpsSource || "",
 *      hasGpsMatch: !!(gps.itArrive && gps.itDepart),
 * 4. Deploy → New version (Anyone).
 *
 * אינדקסים 0-based (A=0):
 *   AA=26 הגעה ראשית | AB=27 יציאה ראשית
 *   AH=33 הגעה גיבוי | AI=34 עזיבה | AJ=35 שהייה דק' | AK=36 סטטוס
 */

function isJunkGpsValue_(val) {
  if (val === null || val === undefined) return true;
  if (val instanceof Date && !isNaN(val.getTime())) return false;
  var s = String(val).trim();
  if (!s) return true;
  if (/^[,\s\[\]\|;.\-_/]+$/.test(s)) return true;
  if (s === '],[') return true;
  if (s === '#N/A' || s === '#REF!' || s === '#VALUE!') return true;
  return false;
}

/** Time / Date / serial → "HH:mm" Asia/Jerusalem */
function formatArchiveTimeHe_(val) {
  if (isJunkGpsValue_(val)) return '';
  try {
    if (val instanceof Date && !isNaN(val.getTime())) {
      return Utilities.formatDate(val, 'Asia/Jerusalem', 'HH:mm');
    }
  } catch (e) {}
  if (typeof val === 'number' && isFinite(val)) {
    if (val >= 0 && val < 1) {
      var totalMin = Math.round(val * 24 * 60);
      var hh = Math.floor(totalMin / 60) % 24;
      var mm = totalMin % 60;
      return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    }
    if (val > 1 && val < 100000) {
      try {
        var epoch = new Date(Date.UTC(1899, 11, 30));
        var ms = epoch.getTime() + Math.round(val * 86400000);
        return Utilities.formatDate(new Date(ms), 'Asia/Jerusalem', 'HH:mm');
      } catch (e2) {}
    }
    if (val >= 1 && val < 24) {
      var tm = Math.round((val / 24) * 24 * 60);
      return (Math.floor(tm / 60) % 24 < 10 ? '0' : '') + (Math.floor(tm / 60) % 24) +
        ':' + ((tm % 60) < 10 ? '0' : '') + (tm % 60);
    }
    return '';
  }
  var s = String(val).trim();
  var hm = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (hm) return (hm[1].length === 1 ? '0' : '') + hm[1] + ':' + hm[2];
  if (/^0?\.\d+$/.test(s)) return formatArchiveTimeHe_(Number(s));
  if (/1899/.test(s)) return '';
  // "9.30" or "9,30"
  var dot = s.match(/^(\d{1,2})[.,](\d{2})$/);
  if (dot) return (dot[1].length === 1 ? '0' : '') + dot[1] + ':' + dot[2];
  return '';
}

function parseArchiveDurationMin_(val, arriveHe, departHe) {
  if (!isJunkGpsValue_(val)) {
    if (typeof val === 'number' && isFinite(val) && val >= 0 && val < 24 * 60) {
      return Math.round(val * 10) / 10;
    }
    var s = String(val).trim().replace(',', '.');
    var n = Number(s);
    if (isFinite(n) && n >= 0 && n < 24 * 60) return Math.round(n * 10) / 10;
  }
  if (arriveHe && departHe) {
    var a = arriveHe.split(':').map(Number);
    var b = departHe.split(':').map(Number);
    var amin = (a[0] || 0) * 60 + (a[1] || 0);
    var bmin = (b[0] || 0) * 60 + (b[1] || 0);
    if (bmin >= amin) return bmin - amin;
  }
  return null;
}

function headerIndexLoose_(headers, needles) {
  if (typeof headerIndex_ === 'function') {
    var i = headerIndex_(headers, needles);
    if (i >= 0) return i;
  }
  for (var n = 0; n < needles.length; n++) {
    var want = String(needles[n] || '').trim().toLowerCase();
    if (!want) continue;
    for (var h = 0; h < headers.length; h++) {
      var got = String(headers[h] || '').trim().toLowerCase();
      if (got === want) return h;
    }
  }
  // partial contains
  for (var n2 = 0; n2 < needles.length; n2++) {
    var w = String(needles[n2] || '').trim().toLowerCase();
    if (w.length < 4) continue;
    for (var h2 = 0; h2 < headers.length; h2++) {
      var g = String(headers[h2] || '').trim().toLowerCase();
      if (g.indexOf(w) >= 0 || w.indexOf(g) >= 0) return h2;
    }
  }
  return -1;
}

function cellOrIndex_(row, headers, names, fixedIndex) {
  var idx = headerIndexLoose_(headers, names);
  if (idx >= 0 && idx < row.length) return row[idx];
  if (fixedIndex != null && fixedIndex >= 0 && fixedIndex < row.length) return row[fixedIndex];
  return null;
}

/**
 * @returns {{itArrive:string,itDepart:string,itStop:number|null,itStatus:string,gpsSource:string}}
 */
function extractArchiveGps_(row, headers) {
  // Primary AA:AB (0-based 26,27)
  var arriveP = formatArchiveTimeHe_(
    cellOrIndex_(row, headers,
      ['הגעה (איתוראן)', 'איתוראן: הגעה', 'הגעה איתוראן (ראשי)', 'itArrive', 'הגעה איתוראן AA'],
      26)
  );
  var departP = formatArchiveTimeHe_(
    cellOrIndex_(row, headers,
      ['יציאה (איתוראן)', 'איתוראן: יציאה', 'יציאה איתוראן (ראשי)', 'itDepart', 'יציאה איתוראן AB'],
      27)
  );
  var stopPraw = cellOrIndex_(row, headers,
    ['משך עצירה (דק׳)', "משך עצירה (דק')", 'איתוראן: משך עצירה (דק׳)', 'itStop'],
    null);

  if (arriveP && departP) {
    return {
      itArrive: arriveP,
      itDepart: departP,
      itStop: parseArchiveDurationMin_(stopPraw, arriveP, departP),
      itStatus: '',
      gpsSource: 'sheet_AA_AB'
    };
  }

  // Fallback AH:AJ (0-based 33,34,35) + AK status (36)
  var arriveF = formatArchiveTimeHe_(
    cellOrIndex_(row, headers,
      ['הגעה איתוראן', 'הגעה איתוראן AH', 'AH הגעה'],
      33)
  );
  var departF = formatArchiveTimeHe_(
    cellOrIndex_(row, headers,
      ['עזיבה איתוראן', 'יציאה איתוראן', 'עזיבה איתוראן AI', 'AI עזיבה'],
      34)
  );
  var stopFraw = cellOrIndex_(row, headers,
    ["שהייה איתוראן דק'", 'שהייה איתוראן דק׳', 'שהייה איתוראן דק', 'AJ שהייה'],
    35);
  var statusF = cellOrIndex_(row, headers,
    ['סטטוס איתוראן', 'סטטוס GPS', 'itStatus', 'AK סטטוס'],
    36);

  if (arriveF && departF) {
    var st = !isJunkGpsValue_(statusF) ? String(statusF).trim() : '';
    return {
      itArrive: arriveF,
      itDepart: departF,
      itStop: parseArchiveDurationMin_(stopFraw, arriveF, departF),
      itStatus: st,
      gpsSource: 'sheet_AH_AJ'
    };
  }

  // Partial — keep what we have for debugging
  if (arriveP || departP) {
    return {
      itArrive: arriveP,
      itDepart: departP,
      itStop: parseArchiveDurationMin_(stopPraw, arriveP, departP),
      itStatus: '',
      gpsSource: 'sheet_partial'
    };
  }
  if (arriveF || departF) {
    return {
      itArrive: arriveF,
      itDepart: departF,
      itStop: parseArchiveDurationMin_(stopFraw, arriveF, departF),
      itStatus: !isJunkGpsValue_(statusF) ? String(statusF).trim() : '',
      gpsSource: 'sheet_partial'
    };
  }

  return { itArrive: '', itDepart: '', itStop: null, itStatus: '', gpsSource: '' };
}

/**
 * דיבאג חד-פעמי: הרץ מ-Apps Script editor
 * מסכם כמה שורות עם GPS לפי מקור + מדפיס כותרות AA..AK
 */
function debugArchiveGpsColumns_() {
  var ss = SpreadsheetApp.openById(
    (typeof MASTER_SHEET_ID !== 'undefined' && MASTER_SHEET_ID) ||
    '1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw'
  );
  var sh = ss.getSheetByName('ארכיון_תעודות_גליה');
  if (!sh) {
    Logger.log('tab missing');
    return;
  }
  var values = sh.getDataRange().getValues();
  var headers = values[0].map(function (h) { return String(h || '').trim(); });
  Logger.log('headers length=' + headers.length);
  for (var c = 26; c <= 36; c++) {
    Logger.log('col ' + (c + 1) + ' / letter ~' + String.fromCharCode(65 + (c % 26)) + ' header="' + (headers[c] || '') + '"');
  }
  var counts = { AA_AB: 0, AH_AJ: 0, partial: 0, none: 0 };
  for (var r = 1; r < values.length; r++) {
    var g = extractArchiveGps_(values[r], headers);
    if (g.gpsSource === 'sheet_AA_AB') counts.AA_AB++;
    else if (g.gpsSource === 'sheet_AH_AJ') counts.AH_AJ++;
    else if (g.gpsSource === 'sheet_partial') counts.partial++;
    else counts.none++;
  }
  Logger.log(JSON.stringify(counts));
  return counts;
}
