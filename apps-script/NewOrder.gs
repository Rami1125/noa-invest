/**
 * NewOrder.gs — handlers for New Order Studio
 * Paste into the NEW Web App project and wire in Code.gs:
 *   if (action === "getOrderBootstrapData") return handleGetOrderBootstrapData_();
 *   if (action === "injectNewOrder") return handleInjectNewOrder_(body);
 *   if (action === "updateOrderCustomerNumber") return handleUpdateOrderCustomerNumber_(body);
 *
 * Deploy → Manage deployments → Edit → New version
 * Script Properties: API_TOKEN = same value as Vercel API_TOKEN
 */
var NEW_ORDER_SHEET_ID_ = "1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw";
var NEW_ORDER_CACHE_SEC_ = 300;

var TAB_CUSTOMERS_ = ["תיקי_לקוחות", "תיקי לקוחות", "לקוחות"];
var TAB_MASTER_ = ["מאגר_לקוחות_מאוחד", "מאגר לקוחות מאוחד"];
var TAB_SITES_ = ["אתרי_לקוחות", "אתרי לקוחות"];
var TAB_DICT_ = ["מילון_לוגיסט", "מילון לוגיסט"];
var TAB_ORDERS_ = ["הזמנות", "🚚_הזמנות_חיות_וסידור", "הזמנות_חיות_וסידור"];

function noOk_(data) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}
function noErr_(msg) {
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(msg || "שגיאה") }))
    .setMimeType(ContentService.MimeType.JSON);
}
function noSs_() { return SpreadsheetApp.openById(NEW_ORDER_SHEET_ID_); }
function noFindSheet_(ss, names) {
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (sh) return sh;
  }
  return null;
}
function noHeaderMap_(sheet) {
  var lastCol = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var map = {};
  for (var c = 0; c < headers.length; c++) {
    var h = String(headers[c] || "").trim();
    if (h) map[h] = c;
  }
  return map;
}
function noCol_(map, names) {
  for (var i = 0; i < names.length; i++) {
    if (map[names[i]] !== undefined) return map[names[i]];
  }
  return -1;
}
function noRequire_(map, names, label) {
  var idx = noCol_(map, names);
  if (idx < 0) throw new Error("חסרה כותרת: " + label + " (אפשרויות: " + names.join(" / ") + ")");
  return idx;
}
function noNorm_(s) {
  return String(s || "").replace(/[\u0591-\u05C7]/g, "").replace(/["'"׳״]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function handleGetOrderBootstrapData_() {
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get("orderBootstrapV1");
    if (cached) return noOk_(JSON.parse(cached));

    var ss = noSs_();
    var shCust = noFindSheet_(ss, TAB_CUSTOMERS_);
    var shMaster = noFindSheet_(ss, TAB_MASTER_);
    var shSites = noFindSheet_(ss, TAB_SITES_);
    var shDict = noFindSheet_(ss, TAB_DICT_);
    if (!shCust) throw new Error("לא נמצא טאב תיקי_לקוחות");
    if (!shDict) throw new Error("לא נמצא טאב מילון_לוגיסט");

    var hCust = noHeaderMap_(shCust);
    var hDict = noHeaderMap_(shDict);
    var hMaster = shMaster ? noHeaderMap_(shMaster) : {};
    var hSites = shSites ? noHeaderMap_(shSites) : {};

    var cNo = noRequire_(hCust, ["מספר לקוח", "מס_לקוח", "customer_no", "מספר"], "מספר לקוח");
    var cName = noRequire_(hCust, ["שם לקוח מלא", "שם לקוח", "שם", "name"], "שם לקוח");
    var cAlias = noCol_(hCust, ["כינויים וסלנג לזיהוי", "כינויים", "סלנג", "aliases"]);
    var cPhone = noCol_(hCust, ["טלפונים מאומתים", "טלפונים", "טלפון", "phones"]);
    var cSite = noCol_(hCust, ["אתר ברירת מחדל", "אתר", "default_site"]);
    var cUnload = noCol_(hCust, ["סוג פריקה טיפוסי", "סוג פריקה", "unload"]);

    var custRows = shCust.getDataRange().getDisplayValues();
    var customers = [];
    for (var r = 1; r < custRows.length; r++) {
      var row = custRows[r];
      var no = String(row[cNo] || "").trim();
      var name = String(row[cName] || "").trim();
      if (!no && !name) continue;
      customers.push({
        customerNo: no,
        name: name,
        aliases: cAlias >= 0 ? String(row[cAlias] || "").split(/[,;|]/).map(function (x) { return x.trim(); }).filter(Boolean) : [],
        phones: cPhone >= 0 ? String(row[cPhone] || "").split(/[,;|/\s]+/).map(function (x) { return x.trim(); }).filter(Boolean) : [],
        contactName: "",
        defaultSiteAddress: cSite >= 0 ? String(row[cSite] || "").trim() : "",
        typicalUnloadType: cUnload >= 0 ? String(row[cUnload] || "").trim() : "",
        recommendedTruck: "",
        masterId: "",
        comaxPrimaryNo: no,
        comaxLinkedIds: [],
        driveFolderUrl: "",
        sites: [],
        isPendingComax: no === "500500"
      });
    }

    if (shMaster) {
      var mId = noCol_(hMaster, ["customer_master_id", "master_id", "מזהה"]);
      var mPrimary = noCol_(hMaster, ["comax_primary_no", "מספר קומקס", "comax"]);
      var mLinked = noCol_(hMaster, ["comax_linked_ids", "מקושרים"]);
      var mDrive = noCol_(hMaster, ["drive_folder_url", "תיקיית drive", "drive"]);
      var masterRows = shMaster.getDataRange().getDisplayValues();
      var byPrimary = {};
      for (var mr = 1; mr < masterRows.length; mr++) {
        var mrow = masterRows[mr];
        var prim = mPrimary >= 0 ? String(mrow[mPrimary] || "").trim() : "";
        if (!prim) continue;
        byPrimary[prim] = {
          masterId: mId >= 0 ? String(mrow[mId] || "") : "",
          comaxLinkedIds: mLinked >= 0 ? String(mrow[mLinked] || "").split(/[,;|]/).map(function (x) { return x.trim(); }).filter(Boolean) : [],
          driveFolderUrl: mDrive >= 0 ? String(mrow[mDrive] || "") : ""
        };
      }
      for (var ci = 0; ci < customers.length; ci++) {
        var en = byPrimary[customers[ci].customerNo] || byPrimary[customers[ci].comaxPrimaryNo];
        if (en) {
          customers[ci].masterId = en.masterId;
          customers[ci].comaxLinkedIds = en.comaxLinkedIds;
          customers[ci].driveFolderUrl = en.driveFolderUrl;
        }
      }
    }

    if (shSites) {
      var sCust = noCol_(hSites, ["מספר לקוח", "customer_no", "לקוח"]);
      var sAddr = noCol_(hSites, ["כתובת", "address", "אתר"]);
      var sCity = noCol_(hSites, ["עיר", "city"]);
      var sP80 = noCol_(hSites, ["זמני שהייה P80", "P80", "שהייה"]);
      var sH = noCol_(hSites, ["מרחק מהחרש 10", "החרש", "km_harash"]);
      var sT = noCol_(hSites, ["מרחק מהתלמיד 6", "התלמיד", "km_talmid"]);
      var siteRows = shSites.getDataRange().getDisplayValues();
      var sitesByCust = {};
      for (var sr = 1; sr < siteRows.length; sr++) {
        var srow = siteRows[sr];
        var sc = sCust >= 0 ? String(srow[sCust] || "").trim() : "";
        if (!sc) continue;
        if (!sitesByCust[sc]) sitesByCust[sc] = [];
        sitesByCust[sc].push({
          address: sAddr >= 0 ? String(srow[sAddr] || "") : "",
          city: sCity >= 0 ? String(srow[sCity] || "") : "",
          p80StayMin: sP80 >= 0 ? parseFloat(srow[sP80]) || null : null,
          roadKmFromHarash: sH >= 0 ? parseFloat(srow[sH]) || null : null,
          roadKmFromTalmid: sT >= 0 ? parseFloat(srow[sT]) || null : null,
          defaultUnloadType: ""
        });
      }
      for (var cj = 0; cj < customers.length; cj++) {
        customers[cj].sites = sitesByCust[customers[cj].customerNo] || [];
        if (!customers[cj].defaultSiteAddress && customers[cj].sites[0]) {
          customers[cj].defaultSiteAddress = customers[cj].sites[0].address;
        }
      }
    }

    var dSku = noRequire_(hDict, ["מק\"ט ראשי", "מק\"ט", "מקט", "sku"], "מק\"ט");
    var dName = noRequire_(hDict, ["שם רשמי", "שם", "officialName"], "שם רשמי");
    var dUnit = noCol_(hDict, ["יחידת מידה", "יחידה", "unit"]);
    var dSlang = noCol_(hDict, ["סלנג ומילות מפתח לנרמול", "סלנג", "keywords"]);
    var dDep = noCol_(hDict, ["פקדון", "deposit"]);
    var dW = noCol_(hDict, ["משקל ליחידה", "משקל", "weight"]);
    var dWh = noCol_(hDict, ["מחסן מקור ברירת מחדל", "מחסן", "warehouse"]);
    var dDr = noCol_(hDict, ["נהג מומלץ", "נהג", "driver"]);

    var dictRows = shDict.getDataRange().getDisplayValues();
    var products = [];
    for (var dr = 1; dr < dictRows.length; dr++) {
      var drow = dictRows[dr];
      var sku = String(drow[dSku] || "").trim();
      if (!sku) continue;
      var depRaw = dDep >= 0 ? String(drow[dDep] || "").trim() : "";
      var deposit = depRaw.indexOf("60002") >= 0 ? "60002" : (depRaw.indexOf("60060") >= 0 ? "60060" : "");
      products.push({
        sku: sku,
        officialName: dName >= 0 ? String(drow[dName] || "").trim() : sku,
        unit: dUnit >= 0 ? String(drow[dUnit] || "").trim() : "יח'",
        slangKeywords: dSlang >= 0 ? String(drow[dSlang] || "").split(/[,;|]/).map(function (x) { return x.trim(); }).filter(Boolean) : [],
        deposit: deposit,
        weightKgPerUnit: dW >= 0 ? parseFloat(String(drow[dW]).replace(",", ".")) || 0 : 0,
        defaultWarehouse: dWh >= 0 ? String(drow[dWh] || "").trim() || "החרש 10" : "החרש 10",
        recommendedDriver: dDr >= 0 ? String(drow[dDr] || "").trim() || "חכמת" : "חכמת"
      });
    }

    var payload = {
      customers: customers,
      products: products,
      fetchedAt: new Date().toISOString(),
      sheetId: NEW_ORDER_SHEET_ID_,
      headerMaps: {
        customers: Object.keys(hCust),
        master: Object.keys(hMaster),
        sites: Object.keys(hSites),
        dict: Object.keys(hDict),
        orders: []
      }
    };
    try { cache.put("orderBootstrapV1", JSON.stringify(payload), NEW_ORDER_CACHE_SEC_); } catch (e) {}
    return noOk_(payload);
  } catch (err) {
    return noErr_(err.message || err);
  }
}

function handleInjectNewOrder_(body) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return noErr_("המערכת עסוקה, נסו שוב");
  try {
    body = body || {};
    var customerNo = String(body.customerNo || "").trim();
    var customerName = String(body.customerName || "").trim();
    var address = String(body.address || "").trim();
    var itemsJson = body.itemsJson || "[]";
    if (!customerNo) throw new Error("חסר מספר לקוח");
    if (!customerName) throw new Error("חסר שם לקוח");
    if (!address) throw new Error("חסרה כתובת");
    if (!itemsJson || itemsJson === "[]") throw new Error("סל ריק");

    var ss = noSs_();
    var shOrders = noFindSheet_(ss, TAB_ORDERS_);
    if (!shOrders) throw new Error("לא נמצא טאב הזמנות");
    var headers = shOrders.getRange(1, 1, 1, Math.max(1, shOrders.getLastColumn())).getDisplayValues()[0];

    var orderId = "NO-" + Utilities.formatDate(new Date(), "Asia/Jerusalem", "yyyyMMdd-HHmmss");
    var waze = String(body.wazeUrl || "");
    if (!waze && address) waze = "https://waze.com/ul?q=" + encodeURIComponent(address) + "&navigate=yes";

    var driveUrl = "";
    var fileUrl = "";
    try {
      var root = DriveApp.getRootFolder();
      var folderName = customerNo + " - " + customerName;
      var folders = DriveApp.getFoldersByName(folderName);
      var folder = folders.hasNext() ? folders.next() : root.createFolder(folderName);
      driveUrl = folder.getUrl();
      if (body.attachment && body.attachment.base64) {
        var bytes = Utilities.base64Decode(body.attachment.base64);
        var blob = Utilities.newBlob(bytes, body.attachment.mimeType || "application/pdf", body.attachment.fileName || (orderId + ".pdf"));
        var file = folder.createFile(blob);
        fileUrl = file.getUrl();
      }
    } catch (driveErr) {}

    var rowObj = {
      "מזהה הזמנה": orderId,
      "מספר לקוח": customerNo,
      "שם לקוח": customerName,
      "כתובת": address,
      "טלפון": String(body.contactPhone || body.phone || ""),
      "איש קשר": String(body.contactName || ""),
      "תאריך אספקה": String(body.deliveryDate || ""),
      "חלון שעות": String(body.deliveryWindow || ""),
      "מחסן": String(body.warehouse || ""),
      "נהג": String(body.driver || ""),
      "הערות": String(body.notes || ""),
      "פריטים": itemsJson,
      "Waze": waze,
      "Drive": driveUrl,
      "קובץ": fileUrl,
      "נוצר ב": new Date(),
      "סטטוס": "חדש"
    };

    var out = [];
    for (var i = 0; i < headers.length; i++) {
      var key = String(headers[i] || "").trim();
      out.push(rowObj[key] !== undefined ? rowObj[key] : "");
    }
    for (var j = 0; j < headers.length; j++) {
      if (out[j] !== "") continue;
      var hk = noNorm_(headers[j]);
      if (hk.indexOf("מזהה") >= 0 || hk.indexOf("order") >= 0) out[j] = orderId;
      else if (hk.indexOf("לקוח") >= 0 && hk.indexOf("שם") >= 0) out[j] = customerName;
      else if (hk.indexOf("מספר") >= 0 && hk.indexOf("לקוח") >= 0) out[j] = customerNo;
      else if (hk.indexOf("כתובת") >= 0 || hk.indexOf("אתר") >= 0) out[j] = address;
      else if (hk.indexOf("waze") >= 0) out[j] = waze;
      else if (hk.indexOf("drive") >= 0 || hk.indexOf("תיקי") >= 0) out[j] = driveUrl;
    }

    shOrders.appendRow(out);

    var items;
    try { items = JSON.parse(itemsJson); } catch (e) { items = []; }
    var linesTxt = (items || []).map(function (it) {
      return "• " + (it.name || it.sku) + " × " + (it.qty || 1) + " " + (it.unit || "");
    }).join("\n");
    var whatsappMessage = [
      "הזמנה חדשה #" + orderId,
      "לקוח: " + customerName + " (" + customerNo + ")",
      "כתובת: " + address,
      "מחסן: " + (body.warehouse || "") + " · נהג: " + (body.driver || ""),
      "",
      "פריטים:",
      linesTxt || "—",
      body.notes ? ("\nהערות: " + body.notes) : "",
      waze ? ("\nWaze: " + waze) : ""
    ].join("\n");

    return noOk_({
      orderId: orderId,
      customerNo: customerNo,
      driveFolderUrl: driveUrl,
      fileUrl: fileUrl,
      wazeUrl: waze,
      whatsappMessage: whatsappMessage,
      rowNumber: shOrders.getLastRow()
    });
  } catch (err) {
    return noErr_(err.message || err);
  } finally {
    lock.releaseLock();
  }
}

function handleUpdateOrderCustomerNumber_(body) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return noErr_("המערכת עסוקה");
  try {
    body = body || {};
    var orderId = String(body.orderId || "").trim();
    var newNo = String(body.newCustomerNo || "").trim();
    var oldNo = String(body.oldCustomerNo || "").trim();
    if (!orderId) throw new Error("חסר orderId");
    if (!newNo) throw new Error("חסר מספר לקוח חדש");

    var ss = noSs_();
    var shOrders = noFindSheet_(ss, TAB_ORDERS_);
    if (!shOrders) throw new Error("לא נמצא טאב הזמנות");
    var h = noHeaderMap_(shOrders);
    var idCol = noCol_(h, ["מזהה הזמנה", "מזהה", "order_id", "orderId"]);
    var noColIdx = noCol_(h, ["מספר לקוח", "מס_לקוח", "customer_no"]);
    if (idCol < 0 || noColIdx < 0) throw new Error("חסרות כותרות מזהה/מספר לקוח בטאב הזמנות");

    var data = shOrders.getDataRange().getDisplayValues();
    var found = -1;
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][idCol] || "").trim() === orderId) { found = r; break; }
    }
    if (found < 0) throw new Error("הזמנה לא נמצאה: " + orderId);
    shOrders.getRange(found + 1, noColIdx + 1).setValue(newNo);
    return noOk_({ orderId: orderId, oldCustomerNo: oldNo, newCustomerNo: newNo, rowNumber: found + 1 });
  } catch (err) {
    return noErr_(err.message || err);
  } finally {
    lock.releaseLock();
  }
}
