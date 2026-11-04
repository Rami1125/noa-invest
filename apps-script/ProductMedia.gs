/**
 * GAS handlers for product media (paste into Apps Script project).
 * Actions: upsert_product_media | delete_product_media
 *
 * Tabs:
 *  - מאגר_מדיה: mediaCode | url | name (optional)
 *  - מילון_לוגיסט: מק״ט / sku | mediaCode | imageUrl / קישור תמונה
 */

function handleUpsertProductMedia_(body) {
  var sku = String(body.sku || '').trim();
  var url = String(body.url || body.imageUrl || '').trim();
  var mediaCode = String(body.mediaCode || (sku ? 'SKU_' + sku : '')).trim();
  var name = String(body.name || '').trim();
  if (!sku) return { status: 'error', error: 'חסר sku' };
  if (!url) return { status: 'error', error: 'חסר url' };
  if (!mediaCode) return { status: 'error', error: 'חסר mediaCode' };

  var ss = SpreadsheetApp.openById(body.sheetId || SpreadsheetApp.getActive().getId());

  // מאגר_מדיה upsert by mediaCode
  var mediaSheet = ss.getSheetByName('מאגר_מדיה');
  if (mediaSheet) {
    var mData = mediaSheet.getDataRange().getValues();
    var mHeaders = mData[0].map(String);
    var codeCol = mHeaders.indexOf('mediaCode');
    if (codeCol < 0) codeCol = mHeaders.indexOf('קוד');
    if (codeCol < 0) codeCol = 0;
    var urlCol = mHeaders.indexOf('url');
    if (urlCol < 0) urlCol = mHeaders.indexOf('קישור');
    if (urlCol < 0) urlCol = 1;
    var nameCol = mHeaders.indexOf('name');
    if (nameCol < 0) nameCol = mHeaders.indexOf('שם');
    var found = false;
    for (var i = 1; i < mData.length; i++) {
      if (String(mData[i][codeCol]).trim() === mediaCode) {
        mediaSheet.getRange(i + 1, urlCol + 1).setValue(url);
        if (nameCol >= 0 && name) mediaSheet.getRange(i + 1, nameCol + 1).setValue(name);
        found = true;
        break;
      }
    }
    if (!found) {
      var row = [];
      for (var c = 0; c < mHeaders.length; c++) row.push('');
      row[codeCol] = mediaCode;
      row[urlCol] = url;
      if (nameCol >= 0) row[nameCol] = name || sku;
      mediaSheet.appendRow(row);
    }
  }

  // מילון_לוגיסט — set mediaCode + imageUrl on product row
  var dict = ss.getSheetByName('מילון_לוגיסט');
  if (dict) {
    var dData = dict.getDataRange().getValues();
    var dHeaders = dData[0].map(String);
    var skuCol = dHeaders.indexOf('sku');
    if (skuCol < 0) skuCol = dHeaders.indexOf('מק\"ט');
    if (skuCol < 0) skuCol = dHeaders.indexOf('מק"ט');
    if (skuCol < 0) skuCol = 0;
    var mcCol = dHeaders.indexOf('mediaCode');
    if (mcCol < 0) mcCol = dHeaders.indexOf('קוד_מדיה');
    var imgCol = dHeaders.indexOf('imageUrl');
    if (imgCol < 0) imgCol = dHeaders.indexOf('קישור תמונה');
    for (var j = 1; j < dData.length; j++) {
      if (String(dData[j][skuCol]).trim() === sku) {
        if (mcCol >= 0) dict.getRange(j + 1, mcCol + 1).setValue(mediaCode);
        if (imgCol >= 0) dict.getRange(j + 1, imgCol + 1).setValue(url);
        break;
      }
    }
  }

  return { status: 'ok', sku: sku, mediaCode: mediaCode, url: url };
}

function handleDeleteProductMedia_(body) {
  var sku = String(body.sku || '').trim();
  var mediaCode = String(body.mediaCode || (sku ? 'SKU_' + sku : '')).trim();
  if (!sku) return { status: 'error', error: 'חסר sku' };

  var ss = SpreadsheetApp.openById(body.sheetId || SpreadsheetApp.getActive().getId());

  var mediaSheet = ss.getSheetByName('מאגר_מדיה');
  if (mediaSheet) {
    var mData = mediaSheet.getDataRange().getValues();
    var mHeaders = mData[0].map(String);
    var codeCol = mHeaders.indexOf('mediaCode');
    if (codeCol < 0) codeCol = 0;
    var urlCol = mHeaders.indexOf('url');
    if (urlCol < 0) urlCol = 1;
    for (var i = 1; i < mData.length; i++) {
      if (String(mData[i][codeCol]).trim() === mediaCode) {
        mediaSheet.getRange(i + 1, urlCol + 1).setValue('');
        break;
      }
    }
  }

  var dict = ss.getSheetByName('מילון_לוגיסט');
  if (dict) {
    var dData = dict.getDataRange().getValues();
    var dHeaders = dData[0].map(String);
    var skuCol = dHeaders.indexOf('sku');
    if (skuCol < 0) skuCol = 0;
    var imgCol = dHeaders.indexOf('imageUrl');
    if (imgCol < 0) imgCol = dHeaders.indexOf('קישור תמונה');
    var mcCol = dHeaders.indexOf('mediaCode');
    for (var j = 1; j < dData.length; j++) {
      if (String(dData[j][skuCol]).trim() === sku) {
        if (imgCol >= 0) dict.getRange(j + 1, imgCol + 1).setValue('');
        if (mcCol >= 0) dict.getRange(j + 1, mcCol + 1).setValue('');
        break;
      }
    }
  }

  return { status: 'ok', sku: sku, mediaCode: mediaCode, deleted: true };
}

// Wire in doPost switch:
// case 'upsert_product_media': return handleUpsertProductMedia_(body);
// case 'delete_product_media': return handleDeleteProductMedia_(body);
