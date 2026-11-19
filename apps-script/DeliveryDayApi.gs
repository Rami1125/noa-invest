/**
 * DeliveryDayApi.gs — שליפת יום אספקה מארכיון_תעודות_גליה
 * GET ?action=getDeliveryDay&date=YYYY-MM-DD&token=...
 *
 * דורש: API_TOKEN ב-Script Properties (כמו שאר הפעולות)
 * חובה לרשום case "getDeliveryDay" ב-doGet (Code.gs)
 */

const TAB_XRAY = "רינטגן";

/**
 * @param {Object} params - e.parameter
 * @returns {TextOutput} JSON
 */
function handleGetDeliveryDay(params) {
  params = params || {};
  const dateIso = normalizeDateIso_(params.date || params.day || "");
  if (!dateIso) {
    return jsonResponse({
      success: false,
      error: "missing_date",
      message: "נדרש date=YYYY-MM-DD",
    });
  }

  const ss = SpreadsheetApp.openById(params.sheetId || MASTER_SHEET_ID);
  const sheet = ss.getSheetByName(TAB_GALYA);
  if (!sheet) {
    return jsonResponse({ success: false, error: "Sheet tab not found: " + TAB_GALYA });
  }

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return jsonResponse({
      success: true,
      date: dateIso,
      netNotes: 0,
      stornoNotes: 0,
      customers: 0,
      notes: [],
      stornos: [],
      kpi: {},
      xray: [],
      missing: ["אין שורות בארכיון"],
    });
  }

  const formulas = sheet.getDataRange().getFormulas();
  const richText = sheet.getDataRange().getRichTextValues();
  const headers = values[0].map(function (h) {
    return String(h || "").trim();
  });

  const idx = function (names) {
    return headerIndex_(headers, names);
  };

  const idxDateDoc = idx(["תאריך תעודה", "תאריך אספקה", "תאריך", "date", "deliveryDate"]);
  const idxTimeDoc = idx(["שעת תעודה", "שעת אספקה", "שעה", "time"]);
  const idxDocNum = idx([
    "מס' תעודת משלוח",
    "מס׳ תעודת משלוח",
    "מספר תעודת משלוח",
    "מספר ת.מ",
    "מספר תעודה",
    "מס׳ תעודה",
    "docNumber",
    "noteId",
    "id",
  ]);
  const idxOrderNum = idx(["מס' הזמנה", "מס׳ הזמנה", "מספר הזמנה", "בגין הזמנה", "comaxOrder", "orderId"]);
  const idxCustNum = idx(["מס' לקוח", "מס׳ לקוח", "מספר לקוח", "customerNo"]);
  const idxCustName = idx(["שם לקוח", "לקוח", "customer", "customerName"]);
  const idxAddress = idx(["כתובת אספקה", "כתובת יעד", "כתובת אתר", "כתובת", "address", "siteAddress"]);
  const idxDriver = idx(["נהג", "נהג משוייך", "נהג ורכב", "driver"]);
  const idxTruck = idx(["רישוי / משאית", "מספר רכב", "משאית", "רכב", "truck"]);
  const idxLink = idx([
    "כתובת הקובץ (URL)",
    "driveUrl",
    "driveLink",
    "fileUrl",
    "קישור לתעודה",
    "קישור סריקה",
    "קישור לקובץ",
  ]);
  const idxItems = idx(["פריטים", "פירוט מוצרים ומק״טים", "סחורה מפורטת", "items"]);
  const idxDeposits = idx(["פיקדונות", "פקדונות", "בלות פקדון (60002)", "משטחי סבן (60060)", "deposits"]);
  const idxCrane = idx(["זמני מנוף / המתנה", "זמני מנוף/פריקה", "זמן פריקה/מנוף", "craneNotes"]);
  const idxSourceFile = idx(["קובץ מקור", "sourceFile", "scanFile"]);
  const idxExtractStatus = idx(["סטטוס חילוץ", "extractStatus"]);
  const idxApproval = idx(["סטטוס אישור", "סטטוס", "approvalStatus"]);
  const idxSigned = idx(["קישור חתום", "signedUrl", "signedLink"]);
  const idxItArrive = idx(["הגעת איתוראן", "itArrive", "AH", "שעת הגעה איתוראן"]);
  const idxItDepart = idx(["עזיבת איתוראן", "itDepart", "AI", "שעת עזיבה איתוראן"]);
  const idxItStop = idx(["דק' שהייה איתוראן", "itStop", "AJ", "משך שהייה"]);
  const idxGps = idx(["התאמת GPS", "gpsMatch", "מקור GPS"]);

  const notes = [];
  const stornos = [];
  var truckMode = {};
  var driverMode = {};
  var dep60002 = 0;
  var dep60060 = 0;
  var dep60006 = 0;
  var craneSum = 0;
  var customers = {};
  var scanFile = "";

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var docNum = idxDocNum >= 0 ? String(row[idxDocNum] || "").trim() : "";
    if (!docNum || /^(ללא[-_ ]?מספר|לא[-_ ]?מספר|test)/i.test(docNum)) continue;

    var rowDate = idxDateDoc >= 0 ? normalizeDateIso_(row[idxDateDoc]) : "";
    if (rowDate !== dateIso) continue;

    var approval = idxApproval >= 0 ? String(row[idxApproval] || "") : "";
    var extract = idxExtractStatus >= 0 ? String(row[idxExtractStatus] || "") : "";
    var itemsRaw = idxItems >= 0 ? String(row[idxItems] || "") : "";
    var depositsRaw = idxDeposits >= 0 ? String(row[idxDeposits] || "") : "";
    var craneText = idxCrane >= 0 ? String(row[idxCrane] || "") : "";
    var isStorno =
      /סטורנו|בוטל|cancel/i.test(approval) ||
      /סטורנו|בוטל/i.test(extract) ||
      /סטורנו/i.test(itemsRaw) ||
      /סטורנו/i.test(craneText);

    var link = "";
    if (idxLink >= 0) {
      link = driveLinkFromCell_(row[idxLink], formulas[r][idxLink], richText[r][idxLink]);
    }
    var signedLink = "";
    if (idxSigned >= 0) {
      signedLink = driveLinkFromCell_(row[idxSigned], formulas[r][idxSigned], richText[r][idxSigned]);
    }

    var craneMin = parseCraneMin_(craneText);
    var deps = parseDepositQtys_(depositsRaw + " " + itemsRaw);
    var srcFile = idxSourceFile >= 0 ? String(row[idxSourceFile] || "").trim() : "";
    if (srcFile && !scanFile) scanFile = srcFile;

    var note = {
      noteId: docNum,
      deliveryDate: dateIso,
      noteTime: idxTimeDoc >= 0 ? formatTimeCell_(row[idxTimeDoc]) : "",
      orderId: idxOrderNum >= 0 ? String(row[idxOrderNum] || "").trim() : "",
      customerNo: idxCustNum >= 0 ? String(row[idxCustNum] || "").trim() : "",
      customerName: idxCustName >= 0 ? String(row[idxCustName] || "").trim() : "",
      address: idxAddress >= 0 ? String(row[idxAddress] || "").trim() : "",
      driver: idxDriver >= 0 ? String(row[idxDriver] || "").trim() : "",
      truck: idxTruck >= 0 ? String(row[idxTruck] || "").trim() : "",
      itemsRaw: itemsRaw,
      depositsRaw: depositsRaw,
      craneText: craneText,
      craneMin: craneMin,
      ituranArrive: idxItArrive >= 0 ? formatTimeCell_(row[idxItArrive]) : "",
      ituranDepart: idxItDepart >= 0 ? formatTimeCell_(row[idxItDepart]) : "",
      ituranStopMin: idxItStop >= 0 ? parseNumber_(row[idxItStop]) : null,
      status: approval || extract,
      scanFile: srcFile,
      driveUrl: link || signedLink,
      isStorno: isStorno,
      gpsMatch: idxGps >= 0 ? String(row[idxGps] || "").trim() : "",
      rowNumber: r + 1,
    };

    if (isStorno) {
      stornos.push(note);
    } else {
      notes.push(note);
      if (note.customerName) customers[note.customerName] = true;
      if (note.truck) truckMode[note.truck] = (truckMode[note.truck] || 0) + 1;
      if (note.driver) driverMode[note.driver] = (driverMode[note.driver] || 0) + 1;
      if (craneMin != null) craneSum += craneMin;
      dep60002 += deps.d60002;
      dep60060 += deps.d60060;
      dep60006 += deps.d60006;
    }
  }

  notes.sort(function (a, b) {
    return String(a.noteTime || "").localeCompare(String(b.noteTime || ""));
  });

  var xray = readXrayForDate_(ss, dateIso);

  return jsonResponse({
    success: true,
    date: dateIso,
    truck: modeKey_(truckMode) || "",
    driver: modeKey_(driverMode) || "",
    netNotes: notes.length,
    stornoNotes: stornos.length,
    customers: Object.keys(customers).length,
    notes: notes,
    stornos: stornos,
    kpi: {
      craneMinSum: craneSum,
      dep60002: dep60002,
      dep60060: dep60060,
      dep60006: dep60006,
    },
    xray: xray,
    scanFile: scanFile,
    missing: buildMissingHints_(notes, stornos),
    source: TAB_GALYA,
  });
}

/** רשימת תאריכים שיש להם תעודות בארכיון (ליומן בדף מצגות) */
function handleGetDeliveryDates(params) {
  params = params || {};
  const ss = SpreadsheetApp.openById(params.sheetId || MASTER_SHEET_ID);
  const sheet = ss.getSheetByName(TAB_GALYA);
  if (!sheet) {
    return jsonResponse({ success: false, error: "Sheet tab not found: " + TAB_GALYA });
  }
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return jsonResponse({ success: true, dates: [] });

  const headers = values[0].map(function (h) {
    return String(h || "").trim();
  });
  const idxDateDoc = headerIndex_(headers, ["תאריך תעודה", "תאריך אספקה", "תאריך", "date", "deliveryDate"]);
  const idxDocNum = headerIndex_(headers, [
    "מס' תעודת משלוח",
    "מס׳ תעודת משלוח",
    "מספר תעודה",
    "docNumber",
    "noteId",
  ]);
  const set = {};
  for (var r = 1; r < values.length; r++) {
    var doc = idxDocNum >= 0 ? String(values[r][idxDocNum] || "").trim() : "";
    if (!doc) continue;
    var d = idxDateDoc >= 0 ? normalizeDateIso_(values[r][idxDateDoc]) : "";
    if (d) set[d] = (set[d] || 0) + 1;
  }
  const dates = Object.keys(set).sort().reverse().map(function (d) {
    return { date: d, rows: set[d] };
  });
  return jsonResponse({ success: true, dates: dates });
}

function normalizeDateIso_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, "Asia/Jerusalem", "yyyy-MM-dd");
  }
  var s = String(v || "").trim();
  if (!s) return "";
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  m = s.match(/^(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{4})/);
  if (m) {
    var dd = ("0" + m[1]).slice(-2);
    var mm = ("0" + m[2]).slice(-2);
    return m[3] + "-" + mm + "-" + dd;
  }
  // serial number from Sheets
  var n = Number(s);
  if (n > 30000 && n < 60000) {
    var epoch = new Date(Date.UTC(1899, 11, 30));
    var dt = new Date(epoch.getTime() + n * 86400000);
    return Utilities.formatDate(dt, "Asia/Jerusalem", "yyyy-MM-dd");
  }
  return "";
}

function formatTimeCell_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, "Asia/Jerusalem", "HH:mm");
  }
  var s = String(v || "").trim();
  var m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return ("0" + m[1]).slice(-2) + ":" + m[2];
  return s;
}

function parseNumber_(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && isFinite(v)) return Math.round(v);
  var m = String(v).match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  return Math.round(parseFloat(m[1].replace(",", ".")));
}

function parseCraneMin_(text) {
  var s = String(text || "");
  var m = s.match(/\((\d+)\s*דק/);
  if (m) return parseInt(m[1], 10);
  m = s.match(/(\d+)\s*דק['׳']?/);
  if (m) return parseInt(m[1], 10);
  return null;
}

function parseDepositQtys_(text) {
  var s = String(text || "");
  function grab(sku) {
    var re = new RegExp(sku + "[^0-9]{0,20}(\d+)");
    var m = s.match(re);
    if (m) return parseInt(m[1], 10);
    re = new RegExp("(\d+)[^0-9]{0,8}" + sku);
    m = s.match(re);
    return m ? parseInt(m[1], 10) : 0;
  }
  return { d60002: grab("60002"), d60060: grab("60060"), d60006: grab("60006") };
}

function modeKey_(map) {
  var best = "";
  var n = 0;
  Object.keys(map).forEach(function (k) {
    if (map[k] > n) {
      n = map[k];
      best = k;
    }
  });
  return best;
}

function buildMissingHints_(notes, stornos) {
  var missing = [];
  var anyCrane = notes.some(function (n) {
    return n.craneMin != null || (n.craneText && n.craneText.trim());
  });
  if (!anyCrane && notes.length) missing.push("זמני מנוף חסרים ברוב השורות");
  var anyIt = notes.some(function (n) {
    return n.ituranArrive || n.ituranDepart;
  });
  if (!anyIt && notes.length) missing.push("עמודות איתוראן ריקות או לא ממופות");
  return missing;
}

function readXrayForDate_(ss, dateIso) {
  var sheet = ss.getSheetByName(TAB_XRAY);
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  var headers = values[0].map(function (h) {
    return String(h || "").toLowerCase().trim();
  });
  function col() {
    var names = Array.prototype.slice.call(arguments);
    for (var i = 0; i < names.length; i++) {
      var j = headers.indexOf(String(names[i]).toLowerCase());
      if (j >= 0) return j;
    }
    return -1;
  }
  var iDate = col("date", "תאריך");
  var iNote = col("note_id", "noteid", "תעודה");
  var iSev = col("severity", "חומרה");
  var iFind = col("finding", "ממצא");
  var iFix = col("suggested_fix", "תיקון");
  var iStatus = col("status", "סטטוס");
  var iCheck = col("check_id", "checkid");
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var d = iDate >= 0 ? normalizeDateIso_(values[r][iDate]) : "";
    if (d && d !== dateIso) continue;
    out.push({
      noteId: iNote >= 0 ? String(values[r][iNote] || "") : "",
      checkId: iCheck >= 0 ? String(values[r][iCheck] || "") : "",
      severity: iSev >= 0 ? String(values[r][iSev] || "") : "",
      finding: iFind >= 0 ? String(values[r][iFind] || "") : "",
      suggestedFix: iFix >= 0 ? String(values[r][iFix] || "") : "",
      status: iStatus >= 0 ? String(values[r][iStatus] || "") : "",
    });
  }
  return out;
}
