/**
 * ============================================================================
 * NOA AI — ENTERPRISE MASTER GATEWAY (v3.8 Product Media)
 * ארגון: ח. סבן חומרי בניין (1994) בע\"מ | סניף פעיל: התלמיד 6 הוד השרון
 * מזהה גיליון בלעדי: 1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw
 *
 * שינויים v3.8:
 *  - עמודות mediaCode + imageUrl במילון_לוגיסט
 *  - ensureProductMediaColumns()
 *  - actions: upsert_product_media | delete_product_media
 *  - lookup_catalog מחזיר mediaCode + imageUrl
 *  - get_media תומך גם ב-linkedSku / SKU_xxxx
 * ============================================================================
 */

var NOA_CONFIG = {
  SPREADSHEET_ID: '1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw',
  SECRET_KEY: 'saban_noa_secret_key_2026_enterprise_99',
  MANAGEMENT_PHONES: [
    '972505227724', // הראל אידלסון
    '972508860896', // ראמי מסארווה
    '972508861180'  // קו שירות פנימי
  ],
  TABS: {
    INQUIRY_RAMI: ['בירור_ראמי', 'בירור ראמי'],
    INQUIRY_HAREL: ['בירור_הראל_מנכל', 'בירור הראל מנכל', 'בירור_הראל'],
    ARCHIVE_GALIA: ['ארכיון_תעודות_גליה', 'ארכיון תעודות גליה'],
    ORDERS: ['הזמנות'],
    LOGISTICS_DICT: ['מילון_לוגיסט', 'מילון לוגיסטי'],
    MEDIA: ['מאגר_מדיה', 'מאגר מדיה']
  },
  COLUMNS: {
    ARCHIVE_GALIA: {
      DATE_INGEST: 0,
      DATE_NOTE: 1,
      TIME_NOTE: 2,
      NOTE_NUM: 3,
      ORDER_NUM: 4,
      CUSTOMER_NUM: 5,
      CUSTOMER_NAME: 6,
      ADDRESS: 7,
      DRIVER: 8,
      TRUCK_LICENSE: 9,
      NOTE_LINK: 10,
      ITEMS: 11,
      DEPOSITS: 12,
      CRANE_TIMES: 13,
      STATUS_NOTE: 18,
      SIGNED_LINK: 19
    },
    LOGISTICS_DICT: {
      SKU: 0,
      NAME: 1,
      CATEGORY: 2,
      UNIT: 3,
      SLANG: 4,
      PALLET_QTY: 5,
      DEPOSIT_SKU: 6,
      WEIGHT_KG: 7,
      WAREHOUSE: 8,
      MEDIA_CODE: 9,   // J — חדש
      IMAGE_URL: 10    // K — חדש
    },
    MEDIA: {
      MEDIA_CODE: 0,
      EVENT_TYPE: 1,
      LANGUAGE: 2,
      LINKED_SKU: 3,
      DIRECT_URL: 4,
      CAPTION: 5,
      FILENAME: 6,
      PRIORITY: 7,
      IS_ACTIVE: 8,
      UPDATED_AT: 9,
      TRIGGERS: 10
    }
  }
};

function doGet(e) { return handleRequest_(e); }
function doPost(e) { return handleRequest_(e); }

function handleRequest_(e) {
  try {
    var p = {};
    if (e && e.parameter) for (var k in e.parameter) p[k] = e.parameter[k];
    if (e && e.postData && e.postData.contents) {
      try {
        var b = JSON.parse(e.postData.contents);
        for (var bk in b) p[bk] = b[bk];
      } catch (errJson) {}
    }

    var action = (p.action || '').trim().toLowerCase();
    var key = (p.key || '').trim();

    if (action === 'health' || action === 'ping') {
      return respondJson_({
        status: 'ok',
        version: '3.8_enterprise_media',
        timestamp: new Date().toISOString()
      });
    }

    if (key !== NOA_CONFIG.SECRET_KEY) {
      return respondJson_({ status: 'unauthorized', error: 'Invalid secret key' });
    }

    var result;
    switch (action) {
      case 'get_inquiries_stats':
      case 'inquiries_stats':
      case 'inquiries':
      case 'stats':
      case 'בירורים':
        result = handleGetInquiriesStats_(p);
        break;

      case 'get_delivery_note':
      case 'delivery_note':
      case 'note':
      case 'תעודה':
        result = handleGetDeliveryNote_(p);
        break;

      case 'inject_order':
      case 'create_order':
      case 'order':
      case 'הזמנה':
        result = handleInjectOrder_(p);
        break;

      case 'lookup_catalog':
      case 'catalog':
      case 'search_catalog':
      case 'חיפוש':
        result = handleLookupCatalog_(p);
        break;

      case 'preview_order':
      case 'preview':
      case 'תצוגה':
        result = handlePreviewOrder_(p);
        break;

      case 'get_media':
      case 'media':
      case 'תמונה':
        result = handleGetMedia_(p);
        break;

      case 'upsert_product_media':
      case 'set_product_media':
      case 'update_product_media':
        result = handleUpsertProductMedia_(p);
        break;

      case 'delete_product_media':
      case 'remove_product_media':
        result = handleDeleteProductMedia_(p);
        break;

      case 'ensure_media_columns':
        result = { status: 'ok', report: ensureProductMediaColumns() };
        break;

      default:
        result = {
          status: 'invalid_action',
          error: 'Unknown action: "' + action + '"',
          received_action: action
        };
    }

    return respondJson_(result);
  } catch (err) {
    return respondJson_({ status: 'error', error: err.toString() });
  }
}

function respondJson_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizePhone_(raw) {
  if (!raw) return '';
  var clean = String(raw).replace(/[^0-9]/g, '');
  if (clean.indexOf('05') === 0 && clean.length === 10) {
    clean = '972' + clean.substring(1);
  }
  return clean;
}

function isManagement_(phone) {
  return NOA_CONFIG.MANAGEMENT_PHONES.indexOf(normalizePhone_(phone)) !== -1;
}

function getSpreadsheet_() {
  try {
    return SpreadsheetApp.openById(NOA_CONFIG.SPREADSHEET_ID);
  } catch (e) {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

function getSheetByAliases_(ss, aliases) {
  if (!aliases || !aliases.length) return null;
  for (var i = 0; i < aliases.length; i++) {
    var s = ss.getSheetByName(aliases[i]);
    if (s) return s;
  }
  return null;
}

// ============================================================================
// עמודות מדיה — יצירה / השלמה
// ============================================================================

/**
 * הריצו פעם אחת מ-Apps Script: ensureProductMediaColumns()
 * או דרך API: { action: "ensure_media_columns", key: "..." }
 * לא מוחק נתונים — רק משלים כותרות ריקות.
 */
function ensureProductMediaColumns() {
  var ss = SpreadsheetApp.openById(NOA_CONFIG.SPREADSHEET_ID);
  var report = { logistics: null, media: null };

  var dict = getSheetByAliases_(ss, NOA_CONFIG.TABS.LOGISTICS_DICT);
  if (!dict) {
    report.logistics = 'sheet_missing';
  } else {
    report.logistics = ensureHeaders_(dict, [
      { idx: 0, header: 'sku' },
      { idx: 1, header: 'name' },
      { idx: 2, header: 'category' },
      { idx: 3, header: 'unit' },
      { idx: 4, header: 'slang' },
      { idx: 5, header: 'fullPalletQty' },
      { idx: 6, header: 'depositSku' },
      { idx: 7, header: 'weightKg' },
      { idx: 8, header: 'warehouse' },
      { idx: 9, header: 'mediaCode' },
      { idx: 10, header: 'imageUrl' }
    ]);
  }

  var media = getSheetByAliases_(ss, NOA_CONFIG.TABS.MEDIA);
  if (!media) {
    report.media = 'sheet_missing';
  } else {
    report.media = ensureHeaders_(media, [
      { idx: 0, header: 'mediaCode' },
      { idx: 1, header: 'eventType' },
      { idx: 2, header: 'language' },
      { idx: 3, header: 'linkedSku' },
      { idx: 4, header: 'directUrl' },
      { idx: 5, header: 'caption' },
      { idx: 6, header: 'filename' },
      { idx: 7, header: 'priority' },
      { idx: 8, header: 'isActive' },
      { idx: 9, header: 'updatedAt' },
      { idx: 10, header: 'triggers' }
    ]);
  }

  Logger.log(JSON.stringify(report));
  return report;
}

function ensureHeaders_(sheet, specs) {
  var maxIdx = 0;
  for (var i = 0; i < specs.length; i++) {
    if (specs[i].idx > maxIdx) maxIdx = specs[i].idx;
  }
  var lastCol = Math.max(sheet.getLastColumn(), maxIdx + 1);
  if (sheet.getMaxColumns() < lastCol) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), lastCol - sheet.getMaxColumns());
  }

  var created = [];
  var kept = [];
  for (var j = 0; j < specs.length; j++) {
    var col = specs[j].idx + 1;
    var cell = sheet.getRange(1, col);
    var current = String(cell.getValue() || '').trim();
    if (!current) {
      cell.setValue(specs[j].header);
      cell.setFontWeight('bold');
      created.push(specs[j].header + '@' + col);
    } else {
      kept.push(current + '@' + col);
    }
  }
  return { created: created, kept: kept, lastCol: lastCol };
}

// ============================================================================
// Handlers
// ============================================================================

function handleGetInquiriesStats_(p) {
  var phone = normalizePhone_(p.phone || '');
  if (!isManagement_(phone)) {
    return { status: 'error', authorized: false, message: 'מורשה להנהלה בלבד' };
  }

  var ss = getSpreadsheet_();
  var hSheet = getSheetByAliases_(ss, NOA_CONFIG.TABS.INQUIRY_HAREL);
  var rSheet = getSheetByAliases_(ss, NOA_CONFIG.TABS.INQUIRY_RAMI);
  var hCount = 0;
  var rCount = 0;

  if (hSheet && hSheet.getLastRow() > 1) {
    var hVals = hSheet.getRange(2, 2, hSheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < hVals.length; i++) {
      if (hVals[i][0] && String(hVals[i][0]).trim() !== '') hCount++;
    }
  }
  if (rSheet && rSheet.getLastRow() > 1) {
    var rVals = rSheet.getRange(2, 2, rSheet.getLastRow() - 1, 1).getValues();
    for (var j = 0; j < rVals.length; j++) {
      if (rVals[j][0] && String(rVals[j][0]).trim() !== '') rCount++;
    }
  }

  var total = hCount + rCount;
  return {
    status: 'ok',
    authorized: true,
    total_inquiries: total,
    harelOpen: hCount,
    ramiOpen: rCount,
    details: { harel_pending: hCount, rami_pending: rCount },
    message: 'נכון לעכשיו יש ' + total + ' תעודות בבירור (' + hCount + ' אצל הראל, ' + rCount + ' אצל ראמי).'
  };
}

function getActualCellUrl_(sheet, rowIdx, colIdx) {
  try {
    var range = sheet.getRange(rowIdx, colIdx);
    var rtv = range.getRichTextValue();
    if (rtv && rtv.getLinkUrl()) return rtv.getLinkUrl();
    var f = range.getFormula();
    if (f) {
      var m = f.match(/HYPERLINK\(\s*["']([^"']+)["']/i);
      if (m && m[1]) return m[1];
    }
    var v = String(range.getValue() || '').trim();
    if (v.indexOf('http') === 0) return v;
  } catch (e) {}
  return '';
}

function handleGetDeliveryNote_(p) {
  var noteNum = String(p.noteNumber || p.note || '').trim();
  var callerPhone = normalizePhone_(p.phone || '');
  if (!noteNum) return { status: 'error', message: 'חסר מספר תעודת משלוח' };

  var ss = getSpreadsheet_();
  var sheet = getSheetByAliases_(ss, NOA_CONFIG.TABS.ARCHIVE_GALIA);
  if (!sheet) return { status: 'error', message: 'טאב ארכיון_תעודות_גליה לא נמצא' };

  var cols = NOA_CONFIG.COLUMNS.ARCHIVE_GALIA;
  var data = sheet.getDataRange().getValues();
  var matchedRowIdx = -1;
  var matchedRow = null;

  for (var r = 1; r < data.length; r++) {
    if (String(data[r][cols.NOTE_NUM]).trim() === noteNum) {
      matchedRowIdx = r + 1;
      matchedRow = data[r];
      break;
    }
  }

  if (!matchedRow) {
    for (var r2 = 1; r2 < data.length; r2++) {
      for (var c2 = 0; c2 < data[r2].length; c2++) {
        if (String(data[r2][c2]).trim() === noteNum) {
          matchedRowIdx = r2 + 1;
          matchedRow = data[r2];
          break;
        }
      }
      if (matchedRow) break;
    }
  }

  var customerName = matchedRow ? (matchedRow[cols.CUSTOMER_NAME] || '') : '';
  var dateStr = matchedRow ? (matchedRow[cols.DATE_NOTE] || '') : '';
  var addressStr = matchedRow ? (matchedRow[cols.ADDRESS] || '') : '';
  var driverStr = matchedRow ? (matchedRow[cols.DRIVER] || '') : '';
  var statusStr = matchedRow ? (matchedRow[cols.STATUS_NOTE] || '') : '';

  if (matchedRow) {
    var notePhone = normalizePhone_(matchedRow[cols.CUSTOMER_NUM] || '');
    if (!isManagement_(callerPhone) && notePhone && callerPhone && notePhone !== callerPhone) {
      return {
        status: 'forbidden',
        authorized: false,
        message: 'מספר הטלפון שלך אינו תואם לתעודה זו. לבירור פנה לשירות הלקוחות.'
      };
    }
  }

  var driveUrl = '';
  if (matchedRowIdx !== -1) {
    driveUrl = getActualCellUrl_(sheet, matchedRowIdx, cols.SIGNED_LINK + 1);
    if (!driveUrl) driveUrl = getActualCellUrl_(sheet, matchedRowIdx, cols.NOTE_LINK + 1);
  }

  var isRealDrive = driveUrl.indexOf('drive.google.com') !== -1;

  if (!isRealDrive) {
    try {
      var files = DriveApp.searchFiles(
        "title contains '" + noteNum + "' and mimeType = 'application/pdf' and trashed = false"
      );
      if (files.hasNext()) {
        var file = files.next();
        driveUrl = 'https://drive.google.com/file/d/' + file.getId() + '/view?usp=drivesdk';
        isRealDrive = true;
        if (matchedRowIdx !== -1) {
          try {
            sheet.getRange(matchedRowIdx, cols.SIGNED_LINK + 1).setValue(driveUrl);
          } catch (eCache) {}
        }
      }
    } catch (eDrive) {}
  }

  if (!matchedRow && !isRealDrive) {
    return {
      status: 'not_found',
      message: 'תעודה מספר ' + noteNum + ' לא אותרה בארכיון או בדרייב'
    };
  }

  return {
    status: 'ok',
    authorized: true,
    noteNumber: noteNum,
    customerName: customerName || '',
    date: dateStr,
    address: addressStr,
    driver: driverStr,
    deliveryStatus: statusStr,
    status_note: statusStr,
    driveLink: driveUrl,
    pdfAvailable: isRealDrive,
    message: 'אותרה תעודת משלוח מספר ' + noteNum +
      (customerName ? ' עבור ' + customerName : '') +
      '. קובץ ה-PDF זמין לצפייה ישירה.'
  };
}

function handleInjectOrder_(p) {
  var phone = normalizePhone_(p.phone || '');
  var customerName = (p.customerName || p.name || '').trim();
  var address = (p.address || '').trim();
  var itemsJson = p.itemsJson || p.items || '[]';
  var unloadingType = (p.unloadingType || 'מנוף').trim();
  var requestedTime = (p.requestedTime || 'הקדם האפשרי').trim();
  var contactName = (p.contactName || customerName).trim();
  var notes = (p.notes || '').trim();

  if (!address || !itemsJson) {
    return { status: 'error', message: 'חסרים פרטי הזמנה' };
  }

  var items = [];
  try {
    items = (typeof itemsJson === 'string') ? JSON.parse(itemsJson) : itemsJson;
  } catch (e) {
    return { status: 'error', message: 'מבנה פריטים שגוי' };
  }

  var ss = getSpreadsheet_();
  var ordersSheet = getSheetByAliases_(ss, NOA_CONFIG.TABS.ORDERS);
  if (!ordersSheet) return { status: 'error', message: 'טאב הזמנות לא נמצא' };

  var newRow = ordersSheet.getLastRow() + 1;
  var timestamp = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd HH:mm:ss');
  var itemsDesc = items.map(function (it) {
    return (it.sku || '') + ' x ' + (it.qty || 1) + (it.name ? ' (' + it.name + ')' : '');
  }).join(', ');

  ordersSheet.appendRow([
    timestamp, requestedTime, '', '', '', customerName,
    contactName + ' · ' + phone, address, '4 החרש', '', itemsDesc,
    '', '', '', '', 'ממתין לשיבוץ', '', notes
  ]);

  return {
    status: 'ok',
    row: newRow,
    rowNumber: newRow,
    timestamp: timestamp,
    customerName: customerName,
    message: 'ההזמנה נקלטה בהצלחה במערכת וממתינה לאישור ראמי'
  };
}

function handleLookupCatalog_(p) {
  var q = String(p.q || p.query || '').trim().toLowerCase();
  if (!q) return { status: 'error', message: 'חסר מונח חיפוש' };

  var ss = getSpreadsheet_();
  var dictSheet = getSheetByAliases_(ss, NOA_CONFIG.TABS.LOGISTICS_DICT);
  if (!dictSheet) return { status: 'error', message: 'טאב מילון_לוגיסט לא נמצא' };

  var data = dictSheet.getDataRange().getValues();
  var cols = NOA_CONFIG.COLUMNS.LOGISTICS_DICT;
  var results = [];

  for (var r = 1; r < data.length; r++) {
    var rowText = (
      data[r][cols.SKU] + ' ' +
      data[r][cols.NAME] + ' ' +
      data[r][cols.SLANG]
    ).toLowerCase();

    if (rowText.indexOf(q) === -1) continue;

    var mediaCode = '';
    var imageUrl = '';
    try {
      if (data[r].length > cols.MEDIA_CODE) {
        mediaCode = String(data[r][cols.MEDIA_CODE] || '').trim();
      }
      if (data[r].length > cols.IMAGE_URL) {
        imageUrl = String(data[r][cols.IMAGE_URL] || '').trim();
      }
    } catch (eMed) {}

    results.push({
      sku: data[r][cols.SKU] || '',
      name: data[r][cols.NAME] || '',
      category: data[r][cols.CATEGORY] || '',
      unit: data[r][cols.UNIT] || '',
      fullPalletQty: data[r][cols.PALLET_QTY] || '',
      depositSku: data[r][cols.DEPOSIT_SKU] || '',
      weightKg: data[r][cols.WEIGHT_KG] || 0,
      warehouse: data[r][cols.WAREHOUSE] || '',
      mediaCode: mediaCode,
      imageUrl: imageUrl
    });

    if (results.length >= 10) break;
  }

  return { status: 'ok', query: q, count: results.length, results: results };
}

function handlePreviewOrder_(p) {
  var itemsJson = p.itemsJson || p.items || '[]';
  var items = [];
  try {
    items = (typeof itemsJson === 'string') ? JSON.parse(itemsJson) : itemsJson;
  } catch (e) {
    return { status: 'error', message: 'מבנה פריטים שגוי' };
  }

  var totalWeightKg = 0;
  var depositItems = [];
  var ss = getSpreadsheet_();
  var dictSheet = getSheetByAliases_(ss, NOA_CONFIG.TABS.LOGISTICS_DICT);
  var dictData = dictSheet ? dictSheet.getDataRange().getValues() : [];
  var cols = NOA_CONFIG.COLUMNS.LOGISTICS_DICT;
  var skuMap = {};

  for (var r = 1; r < dictData.length; r++) {
    var k = String(dictData[r][cols.SKU]).trim();
    if (k) {
      skuMap[k] = {
        name: dictData[r][cols.NAME] || '',
        unit: dictData[r][cols.UNIT] || '',
        fullPallet: Number(dictData[r][cols.PALLET_QTY]) || 0,
        depositSku: String(dictData[r][cols.DEPOSIT_SKU] || '').trim(),
        weight: Number(dictData[r][cols.WEIGHT_KG]) || 0
      };
    }
  }

  var processed = items.map(function (it) {
    var sku = String(it.sku || '').trim();
    var qty = Number(it.qty) || 0;
    var info = skuMap[sku] || { name: it.name || sku, unit: it.unit || 'יח', weight: 0, fullPallet: 0, depositSku: '' };
    var w = (info.weight || 0) * qty;
    totalWeightKg += w;

    if (info.fullPallet > 0 && info.depositSku && qty >= info.fullPallet) {
      depositItems.push({
        depositSku: info.depositSku,
        qty: Math.floor(qty / info.fullPallet),
        forProduct: info.name
      });
    }

    return {
      sku: sku,
      name: info.name,
      qty: qty,
      unit: info.unit,
      weightKg: w
    };
  });

  return {
    status: 'ok',
    items: processed,
    depositItems: depositItems,
    totalWeightTons: (totalWeightKg / 1000).toFixed(2),
    totalWeightKg: totalWeightKg
  };
}

function handleGetMedia_(p) {
  var code = String(p.mediaCode || p.code || p.sku || '').trim();
  if (!code) return { status: 'error', message: 'חסר קוד מדיה' };

  var ss = getSpreadsheet_();
  var mediaSheet = getSheetByAliases_(ss, NOA_CONFIG.TABS.MEDIA);
  if (!mediaSheet) return { status: 'error', message: 'טאב מאגר_מדיה לא נמצא' };

  var data = mediaSheet.getDataRange().getValues();
  var cols = NOA_CONFIG.COLUMNS.MEDIA;
  var codeUp = code.toUpperCase();
  var skuFromCode = (codeUp.indexOf('SKU_') === 0) ? code.substring(4) : code;

  for (var r = 1; r < data.length; r++) {
    var mc = String(data[r][cols.MEDIA_CODE] || '').trim().toUpperCase();
    var linked = String(data[r][cols.LINKED_SKU] || '').trim();
    if (mc === codeUp || linked === code || linked === skuFromCode) {
      var url = data[r][cols.DIRECT_URL] || '';
      return {
        status: 'ok',
        mediaCode: data[r][cols.MEDIA_CODE] || code,
        url: url,
        imageUrl: url,
        eventType: data[r][cols.EVENT_TYPE] || '',
        linkedSku: linked
      };
    }
  }

  return { status: 'not_found', message: 'מדיה ' + code + ' לא אותרה' };
}

function handleUpsertProductMedia_(p) {
  var sku = String(p.sku || '').trim();
  var url = String(p.url || p.imageUrl || p.directUrl || '').trim();
  var mediaCode = String(p.mediaCode || p.code || (sku ? 'SKU_' + sku : '')).trim();
  var name = String(p.name || '').trim();

  if (!sku) return { status: 'error', message: 'חסר sku' };
  if (!url) return { status: 'error', message: 'חסר url / imageUrl' };
  if (!mediaCode) return { status: 'error', message: 'חסר mediaCode' };

  ensureProductMediaColumns();

  var ss = getSpreadsheet_();
  var mediaSheet = getSheetByAliases_(ss, NOA_CONFIG.TABS.MEDIA);
  var dictSheet = getSheetByAliases_(ss, NOA_CONFIG.TABS.LOGISTICS_DICT);
  var mCols = NOA_CONFIG.COLUMNS.MEDIA;
  var dCols = NOA_CONFIG.COLUMNS.LOGISTICS_DICT;
  var now = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd HH:mm:ss');

  if (mediaSheet) {
    var mData = mediaSheet.getDataRange().getValues();
    var foundRow = -1;
    for (var r = 1; r < mData.length; r++) {
      var code = String(mData[r][mCols.MEDIA_CODE] || '').trim();
      var linked = String(mData[r][mCols.LINKED_SKU] || '').trim();
      if (code.toUpperCase() === mediaCode.toUpperCase() || linked === sku) {
        foundRow = r + 1;
        break;
      }
    }

    if (foundRow > 0) {
      mediaSheet.getRange(foundRow, mCols.DIRECT_URL + 1).setValue(url);
      mediaSheet.getRange(foundRow, mCols.LINKED_SKU + 1).setValue(sku);
      mediaSheet.getRange(foundRow, mCols.MEDIA_CODE + 1).setValue(mediaCode);
      mediaSheet.getRange(foundRow, mCols.IS_ACTIVE + 1).setValue('TRUE');
      mediaSheet.getRange(foundRow, mCols.UPDATED_AT + 1).setValue(now);
      if (name) mediaSheet.getRange(foundRow, mCols.CAPTION + 1).setValue(name);
    } else {
      var row = [];
      var width = Math.max(mediaSheet.getLastColumn(), 11);
      for (var c = 0; c < width; c++) row.push('');
      row[mCols.MEDIA_CODE] = mediaCode;
      row[mCols.EVENT_TYPE] = 'product';
      row[mCols.LANGUAGE] = 'he';
      row[mCols.LINKED_SKU] = sku;
      row[mCols.DIRECT_URL] = url;
      row[mCols.CAPTION] = name || sku;
      row[mCols.PRIORITY] = 10;
      row[mCols.IS_ACTIVE] = 'TRUE';
      row[mCols.UPDATED_AT] = now;
      mediaSheet.appendRow(row);
    }
  }

  if (dictSheet) {
    var dData = dictSheet.getDataRange().getValues();
    for (var i = 1; i < dData.length; i++) {
      if (String(dData[i][dCols.SKU] || '').trim() === sku) {
        dictSheet.getRange(i + 1, dCols.MEDIA_CODE + 1).setValue(mediaCode);
        dictSheet.getRange(i + 1, dCols.IMAGE_URL + 1).setValue(url);
        break;
      }
    }
  }

  return {
    status: 'ok',
    sku: sku,
    mediaCode: mediaCode,
    url: url,
    imageUrl: url,
    message: 'קישור תמונה נשמר למוצר ' + sku
  };
}

function handleDeleteProductMedia_(p) {
  var sku = String(p.sku || '').trim();
  var mediaCode = String(p.mediaCode || p.code || (sku ? 'SKU_' + sku : '')).trim();
  if (!sku) return { status: 'error', message: 'חסר sku' };

  ensureProductMediaColumns();

  var ss = getSpreadsheet_();
  var mediaSheet = getSheetByAliases_(ss, NOA_CONFIG.TABS.MEDIA);
  var dictSheet = getSheetByAliases_(ss, NOA_CONFIG.TABS.LOGISTICS_DICT);
  var mCols = NOA_CONFIG.COLUMNS.MEDIA;
  var dCols = NOA_CONFIG.COLUMNS.LOGISTICS_DICT;

  if (mediaSheet) {
    var mData = mediaSheet.getDataRange().getValues();
    for (var r = 1; r < mData.length; r++) {
      var code = String(mData[r][mCols.MEDIA_CODE] || '').trim();
      var linked = String(mData[r][mCols.LINKED_SKU] || '').trim();
      if (code.toUpperCase() === mediaCode.toUpperCase() || linked === sku) {
        mediaSheet.getRange(r + 1, mCols.DIRECT_URL + 1).setValue('');
        break;
      }
    }
  }

  if (dictSheet) {
    var dData = dictSheet.getDataRange().getValues();
    for (var i = 1; i < dData.length; i++) {
      if (String(dData[i][dCols.SKU] || '').trim() === sku) {
        dictSheet.getRange(i + 1, dCols.MEDIA_CODE + 1).setValue('');
        dictSheet.getRange(i + 1, dCols.IMAGE_URL + 1).setValue('');
        break;
      }
    }
  }

  return {
    status: 'ok',
    sku: sku,
    mediaCode: mediaCode,
    deleted: true,
    message: 'קישור תמונה נמחק למוצר ' + sku
  };
}
