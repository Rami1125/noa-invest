/** --- GPS Archive Fallback (AA:AB primary, AH:AJ backup) ---
 * להעתיק ל-Code.gs (או לכלול בקובץ זה בפרויקט GAS).
 * ב-handleGetNotes: לפני notes.push להוסיף:
 *   const gps = extractArchiveGps_(row, headers);
 * ולאובייקט ה-note:
 *   itArrive, itDepart, itStop, itStatus, gpsSource, hasGpsMatch
 */
function isJunkGpsValue_(val) {
  if (val === null || val === undefined) return true;
  if (val instanceof Date && !isNaN(val.getTime())) return false;
  var s = String(val).trim();
  if (!s) return true;
  if (/^[,\s\[\]\|;.\-_/]+$/.test(s)) return true;
  if (s === '],[') return true;
  return false;
}

function formatArchiveTimeHe_(val) {
  if (isJunkGpsValue_(val)) return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, 'Asia/Jerusalem', 'HH:mm');
  }
  if (typeof val === 'number' && isFinite(val)) {
    if (val >= 0 && val < 1) {
      var totalMin = Math.round(val * 24 * 60);
      var hh = Math.floor(totalMin / 60) % 24;
      var mm = totalMin % 60;
      return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    }
    if (val > 1 && val < 100000) {
      var epoch = new Date(Date.UTC(1899, 11, 30));
      var ms = epoch.getTime() + Math.round(val * 86400000);
      return Utilities.formatDate(new Date(ms), 'Asia/Jerusalem', 'HH:mm');
    }
    if (val >= 1 && val < 24) {
      var dayFrac = val / 24;
      var tm = Math.round(dayFrac * 24 * 60);
      return (Math.floor(tm / 60) % 24 < 10 ? '0' : '') + (Math.floor(tm / 60) % 24) + ':' +
             ((tm % 60) < 10 ? '0' : '') + (tm % 60);
    }
    return '';
  }
  var s = String(val).trim();
  var hm = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (hm) return (hm[1].length === 1 ? '0' : '') + hm[1] + ':' + hm[2];
  if (/^0?\.\d+$/.test(s)) return formatArchiveTimeHe_(Number(s));
  if (/1899/.test(s)) return '';
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

function extractArchiveGps_(row, headers) {
  var col = function(names) { return headerIndex_(headers, names); };
  var iArrivePrimary = col(['הגעה (איתוראן)', 'איתוראן: הגעה', 'הגעה איתוראן (ראשי)', 'itArrive']);
  var iDepartPrimary = col(['יציאה (איתוראן)', 'איתוראן: יציאה', 'יציאה איתוראן (ראשי)', 'itDepart']);
  var iStopPrimary = col(['משך עצירה (דק׳)', "משך עצירה (דק')", 'איתוראן: משך עצירה (דק׳)', 'itStop']);
  var iArriveFb = col(['הגעה איתוראן']);
  var iDepartFb = col(['עזיבה איתוראן', 'יציאה איתוראן']);
  var iStopFb = col(["שהייה איתוראן דק'", 'שהייה איתוראן דק׳', 'שהייה איתוראן דק']);
  var iStatusFb = col(['סטטוס איתוראן', 'סטטוס GPS', 'itStatus']);

  var arriveP = iArrivePrimary >= 0 ? formatArchiveTimeHe_(row[iArrivePrimary]) : '';
  var departP = iDepartPrimary >= 0 ? formatArchiveTimeHe_(row[iDepartPrimary]) : '';
  if (arriveP && departP) {
    return {
      itArrive: arriveP,
      itDepart: departP,
      itStop: parseArchiveDurationMin_(iStopPrimary >= 0 ? row[iStopPrimary] : null, arriveP, departP),
      itStatus: '',
      gpsSource: 'sheet_AA_AB'
    };
  }

  var arriveF = iArriveFb >= 0 ? formatArchiveTimeHe_(row[iArriveFb]) : '';
  var departF = iDepartFb >= 0 ? formatArchiveTimeHe_(row[iDepartFb]) : '';
  if (arriveF && departF) {
    var st = iStatusFb >= 0 && !isJunkGpsValue_(row[iStatusFb]) ? String(row[iStatusFb]).trim() : '';
    return {
      itArrive: arriveF,
      itDepart: departF,
      itStop: parseArchiveDurationMin_(iStopFb >= 0 ? row[iStopFb] : null, arriveF, departF),
      itStatus: st,
      gpsSource: 'sheet_AH_AJ'
    };
  }

  if (arriveP || departP) {
    return {
      itArrive: arriveP, itDepart: departP,
      itStop: parseArchiveDurationMin_(iStopPrimary >= 0 ? row[iStopPrimary] : null, arriveP, departP),
      itStatus: '', gpsSource: 'sheet_partial'
    };
  }
  if (arriveF || departF) {
    return {
      itArrive: arriveF, itDepart: departF,
      itStop: parseArchiveDurationMin_(iStopFb >= 0 ? row[iStopFb] : null, arriveF, departF),
      itStatus: iStatusFb >= 0 && !isJunkGpsValue_(row[iStatusFb]) ? String(row[iStatusFb]).trim() : '',
      gpsSource: 'sheet_partial'
    };
  }
  return { itArrive: '', itDepart: '', itStop: null, itStatus: '', gpsSource: '' };
}
