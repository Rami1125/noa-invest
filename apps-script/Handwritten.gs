/**
 * Tab handwriting A:Q
 * Requires case getHandwritten in doGet Code.gs
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
      error: "לא נמצא טאב כתב יד",
      tab: tabName
    });
  }
  var values = sheet.getRange("A:Q").getDisplayValues();
  var fetchedAt = new Date().toISOString();
  if (!values || values.length <= 1) {
    return jsonResponse({ success: true, tab: tabName, fetchedAt: fetchedAt, rows: [], totalRows: 0 });
  }
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    var empty = true;
    for (var c = 0; c < r.length; c++) {
      if (String(r[c] || "").trim()) { empty = false; break; }
    }
    if (empty) continue;
    var docRaw = String(r[1] || "").trim().replace(/\s+/g, "");
    var docId = docRaw.replace(/\.0+$/, "");
    var durStr = String(r[10] || "").trim().replace(",", ".");
    var durationMin = null;
    var dm = durStr.match(/(\d+(?:\.\d+)?)/);
    if (dm) durationMin = Math.round(Number(dm[1]) * 10) / 10;
    rows.push({
      noteDate: String(r[0] || "").trim(),
      docId: docId,
      orderId: String(r[2] || "").trim().replace(/\s+/g, "").replace(/\.0+$/, ""),
      customerNo: String(r[3] || "").trim().replace(/\s+/g, "").replace(/\.0+$/, ""),
      customerName: String(r[4] || "").trim(),
      city: String(r[5] || "").trim(),
      address: String(r[6] || "").trim(),
      driverTruck: String(r[7] || "").trim(),
      craneOpenHe: String(r[8] || "").trim(),
      craneCloseHe: String(r[9] || "").trim(),
      durationMin: durationMin,
      craneType: String(r[11] || "").trim(),
      returnsText: String(r[12] || "").trim(),
      fieldNotes: String(r[13] || "").trim(),
      warehouseStamp: String(r[14] || "").trim(),
      returnApprovalStatus: String(r[15] || "").trim(),
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
