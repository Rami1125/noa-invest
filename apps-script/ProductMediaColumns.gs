/**
 * NOA AI — Product Media columns + handlers
 * מיועד להדבקה בפרויקט GAS לצד ה-Gateway v3.7
 *
 * 1) הריצו פעם אחת: ensureProductMediaColumns()
 * 2) הוסיפו ל-switch ב-handleRequest_:
 *      case 'upsert_product_media':
 *      case 'delete_product_media':
 * 3) עדכנו handleLookupCatalog_ / handleGetMedia_ (או השתמשו בגרסאות כאן)
 */

/** עמודות נוספות למילון_לוגיסט (אחרי WAREHOUSE=8) */
var NOA_MEDIA_EXTRA_COLS = {
  LOGISTICS_DICT: {
    MEDIA_CODE: 9,   // J: mediaCode / קוד_מדיה
    IMAGE_URL: 10    // K: imageUrl / קישור תמונה
  }
};

/**
 * יוצר/משלים כותרות עמודות נדרשות בטאבים מילון_לוגיסט ומאגר_מדיה.
 * בטוח להרצה חוזרת (לא מוחק נתונים).
 */
function ensureProductMediaColumns() {
  var ss = SpreadsheetApp.openById(NOA_CONFIG.SPREADSHEET_ID);
  var report = { logistics: null, media: null };

  // ── מילון_לוגיסט ──────────────────────────────────────────
  var dict = getSheetByAliases_(ss, NOA_CONFIG.TABS.LOGISTICS_DICT);
  if (!dict) {
    report.logistics = 'sheet_missing';
  } else {
    var needDict = [
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
    ];
    report.logistics = ensureHeaders_(dict, needDict);
  }

  // ── מאגר_מדיה ─────────────────────────────────────────────
  var media = getSheetByAliases_(ss, NOA_CONFIG.TABS.MEDIA);
  if (!media) {
    report.media = 'sheet_missing';
  } else {
    var needMedia = [
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
    ];
    report.media = ensureHeaders_(media, needMedia);
  }

  Logger.log(JSON.stringify(report));
  return report;
}

/**
 * מוודא כותרת בכל עמודה. אם התא ריק — ממלא. לא דורס כותרת קיימת.
 * מרחיב את מספר העמודות במידת הצורך.
 */
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
    var col = specs[j].idx + 1; // 1-based
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

// ─── Handlers: להוסיף ל-switch ב-handleRequest_ ─────────────
// case 'upsert_product_media':
// case 'set_product_media':
//   result = handleUpsertProductMedia_(p);
//   break;
// case 'delete_product_media':
// case 'remove_product_media':
//   result = handleDeleteProductMedia_(p);
//   break;

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
  var dExtra = NOA_MEDIA_EXTRA_COLS.LOGISTICS_DICT;

  // מאגר_מדיה — upsert לפי mediaCode או linkedSku
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
    var now = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd HH:mm:ss');
    if (foundRow > 0) {
      mediaSheet.getRange(foundRow, mCols.DIRECT_URL + 1).setValue(url);
      mediaSheet.getRange(foundRow, mCols.LINKED_SKU + 1).setValue(sku);
      mediaSheet.getRange(foundRow, mCols.MEDIA_CODE + 1).setValue(mediaCode);
      if (mCols.IS_ACTIVE != null) mediaSheet.getRange(foundRow, mCols.IS_ACTIVE + 1).setValue('TRUE');
      try { mediaSheet.getRange(foundRow, 10).setValue(now); } catch (e1) {}
    } else {
      var row = [];
      var width = Math.max(mediaSheet.getLastColumn(), 11);
      for (var c = 0; c < width; c++) row.push('');
      row[mCols.MEDIA_CODE] = mediaCode;
      row[mCols.EVENT_TYPE] = 'product';
      row[mCols.LANGUAGE] = 'he';
      row[mCols.LINKED_SKU] = sku;
      row[mCols.DIRECT_URL] = url;
      if (mCols.PRIORITY != null) row[mCols.PRIORITY] = 10;
      if (mCols.IS_ACTIVE != null) row[mCols.IS_ACTIVE] = 'TRUE';
      row[9] = now; // updatedAt
      mediaSheet.appendRow(row);
    }
  }

  // מילון_לוגיסט — mediaCode + imageUrl על שורת המוצר
  if (dictSheet) {
    var dData = dictSheet.getDataRange().getValues();
    for (var i = 1; i < dData.length; i++) {
      if (String(dData[i][dCols.SKU] || '').trim() === sku) {
        dictSheet.getRange(i + 1, dExtra.MEDIA_CODE + 1).setValue(mediaCode);
        dictSheet.getRange(i + 1, dExtra.IMAGE_URL + 1).setValue(url);
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
  var dExtra = NOA_MEDIA_EXTRA_COLS.LOGISTICS_DICT;

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
        dictSheet.getRange(i + 1, dExtra.MEDIA_CODE + 1).setValue('');
        dictSheet.getRange(i + 1, dExtra.IMAGE_URL + 1).setValue('');
        break;
      }
    }
  }

  return { status: 'ok', sku: sku, mediaCode: mediaCode, deleted: true, message: 'קישור תמונה נמחק למוצר ' + sku };
}

/**
 * גרסת lookup שמחזירה גם mediaCode + imageUrl (החלף או שלב ב-handleLookupCatalog_)
 */
function handleLookupCatalogWithMedia_(p) {
  var q = String(p.q || p.query || '').trim().toLowerCase();
  if (!q) return { status: 'error', message: 'חסר מונח חיפוש' };

  var ss = getSpreadsheet_();
  var dictSheet = getSheetByAliases_(ss, NOA_CONFIG.TABS.LOGISTICS_DICT);
  if (!dictSheet) return { status: 'error', message: 'טאב מילון_לוגיסט לא נמצא' };

  var data = dictSheet.getDataRange().getValues();
  var cols = NOA_CONFIG.COLUMNS.LOGISTICS_DICT;
  var extra = NOA_MEDIA_EXTRA_COLS.LOGISTICS_DICT;
  var results = [];

  for (var r = 1; r < data.length; r++) {
    var rowText = (data[r][cols.SKU] + ' ' + data[r][cols.NAME] + ' ' + data[r][cols.SLANG]).toLowerCase();
    if (rowText.indexOf(q) === -1) continue;

    var mediaCode = '';
    var imageUrl = '';
    try {
      mediaCode = String(data[r][extra.MEDIA_CODE] || '').trim();
      imageUrl = String(data[r][extra.IMAGE_URL] || '').trim();
    } catch (e) {}

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

/**
 * get_media מורחב: לפי mediaCode או לפי linkedSku / SKU_xxxx
 */
function handleGetMediaByCodeOrSku_(p) {
  var code = String(p.mediaCode || p.code || p.sku || '').trim();
  if (!code) return { status: 'error', message: 'חסר קוד מדיה' };

  var ss = getSpreadsheet_();
  var mediaSheet = getSheetByAliases_(ss, NOA_CONFIG.TABS.MEDIA);
  if (!mediaSheet) return { status: 'error', message: 'טאב מאגר_מדיה לא נמצא' };

  var data = mediaSheet.getDataRange().getValues();
  var cols = NOA_CONFIG.COLUMNS.MEDIA;
  var codeUp = code.toUpperCase();
  var skuFromCode = codeUp.indexOf('SKU_') === 0 ? code.substring(4) : code;

  for (var r = 1; r < data.length; r++) {
    var mc = String(data[r][cols.MEDIA_CODE] || '').trim().toUpperCase();
    var linked = String(data[r][cols.LINKED_SKU] || '').trim();
    if (mc === codeUp || linked === code || linked === skuFromCode) {
      return {
        status: 'ok',
        mediaCode: data[r][cols.MEDIA_CODE] || code,
        url: data[r][cols.DIRECT_URL] || '',
        imageUrl: data[r][cols.DIRECT_URL] || '',
        eventType: data[r][cols.EVENT_TYPE] || '',
        linkedSku: linked
      };
    }
  }

  return { status: 'not_found', message: 'מדיה ' + code + ' לא אותרה' };
}
