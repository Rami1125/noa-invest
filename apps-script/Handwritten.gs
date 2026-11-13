/**
 * טאב «כתב יד» (שם עם רווח) — עמודות A:Q
 * case "getHandwritten": return handleGetHandwritten_(p);
 *
 * getDisplayValues() + formatHandwrittenTime_ (HH:mm) — בלי 1899 / שבר יום.
 */
function handleGetHandwritten_(params) {
  params = params || {};
  var MASTER = typeof MASTER_SHEET_ID !== "undefined"
    ? MASTER_SHEET_ID
    : "1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw";
  var ss = SpreadsheetApp.openById(params.sheetId || MASTER);
  var tabName = "כתב יד";
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    return jsonResponse({
      success: false,
      error: "לא נמצא טאב 'כתב יד' (עם רווח בשם)",
      tab: tabName
    });
  }

  var lastRow = Math.max(sheet.getLastRow(), 1);
  var range = sheet.getRange(1, 1, lastRow, 17);
  var display = range.getDisplayValues();
  var rawValues = range.getValues();
  var tz = Session.getScriptTimeZone() || "Asia/Jerusalem";
  var fetchedAt = new Date().toISOString();

  if (!display || display.length <= 1) {
    return jsonResponse({ success: true, tab: tabName, fetchedAt: fetchedAt, rows: [], totalRows: 0 });
  }

  function formatDateCell(displayVal, rawVal) {
    var d = String(displayVal || "").trim();
    if (d && d.indexOf("1899") < 0) return d;
    if (Object.prototype.toString.call(rawVal) === "[object Date]" && !isNaN(rawVal.getTime())) {
      if (rawVal.getFullYear() < 1950) return "";
      return Utilities.formatDate(rawVal, tz, "yyyy-MM-dd");
    }
    return d;
  }

  /** HH:mm — תומך בתצוגה, Date, ושבר יום (0.40277) */
  function formatHandwrittenTime_(displayVal, rawVal) {
    var d = String(displayVal || "").trim();
    if (/^\d{1,2}:\d{2}/.test(d)) {
      var parts = d.match(/^(\d{1,2}):(\d{2})/);
      if (parts) {
        var hh = parts[1].length === 1 ? "0" + parts[1] : parts[1];
        return hh + ":" + parts[2];
      }
      return d;
    }
    // שבר יום כמחרוזת או מספר
    var frac = null;
    if (/^0?\.\d+$/.test(d)) frac = Number(d);
    else if (typeof rawVal === "number" && isFinite(rawVal) && rawVal >= 0 && rawVal < 1.5) frac = rawVal;
    if (frac != null) {
      var totalMin = Math.round((frac % 1) * 24 * 60);
      var h = Math.floor(totalMin / 60) % 24;
      var m = totalMin % 60;
      return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
    }
    if (Object.prototype.toString.call(rawVal) === "[object Date]" && !isNaN(rawVal.getTime())) {
      return Utilities.formatDate(rawVal, tz, "HH:mm");
    }
    if (d.indexOf("1899") >= 0) return "";
    return d;
  }

  function formatDurationCell(displayVal, rawVal) {
    var s = String(displayVal || "").trim().replace(",", ".");
    if (s) {
      var m = s.match(/(\d+(?:\.\d+)?)/);
      if (m) return Math.round(Number(m[1]) * 10) / 10;
    }
    if (typeof rawVal === "number" && isFinite(rawVal) && rawVal > 0 && rawVal < 24 * 60) {
      return Math.round(rawVal * 10) / 10;
    }
    return null;
  }

  var rows = [];
  for (var i = 1; i < display.length; i++) {
    var r = display[i];
    var raw = rawValues[i] || [];
    var empty = true;
    for (var c = 0; c < r.length; c++) {
      if (String(r[c] || "").trim()) { empty = false; break; }
    }
    if (empty) continue;
    var docRaw = String(r[1] || "").trim().replace(/\s+/g, "");
    var docId = docRaw.replace(/\.0+$/, "");
    rows.push({
      noteDate: formatDateCell(r[0], raw[0]),
      docDate: formatDateCell(r[0], raw[0]),
      docId: docId,
      orderId: String(r[2] || "").trim().replace(/\s+/g, "").replace(/\.0+$/, ""),
      customerNo: String(r[3] || "").trim().replace(/\s+/g, "").replace(/\.0+$/, ""),
      customerName: String(r[4] || "").trim(),
      city: String(r[5] || "").trim(),
      address: String(r[6] || "").trim(),
      driver: String(r[7] || "").trim(),
      driverTruck: String(r[7] || "").trim(),
      craneOpenHe: formatHandwrittenTime_(r[8], raw[8]),
      craneCloseHe: formatHandwrittenTime_(r[9], raw[9]),
      durationMin: formatDurationCell(r[10], raw[10]),
      craneDurationMin: formatDurationCell(r[10], raw[10]),
      craneType: String(r[11] || "").trim(),
      returnsText: String(r[12] || "").trim(),
      returnsHandwritten: String(r[12] || "").trim(),
      fieldNotes: String(r[13] || "").trim(),
      notesHandwritten: String(r[13] || "").trim(),
      warehouseStamp: String(r[14] || "").trim(),
      warehouseApproval: String(r[14] || "").trim(),
      returnApprovalStatus: String(r[15] || "").trim(),
      returnStatus: String(r[15] || "").trim(),
      driveUrl: String(r[16] || "").trim()
    });
  }

  return jsonResponse({
    success: true,
    tab: tabName,
    fetchedAt: fetchedAt,
    totalRows: rows.length,
    rows: rows
  });
}
