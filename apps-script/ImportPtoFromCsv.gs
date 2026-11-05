/**
 * ייבוא חד-פעמי / חוזר של אירועי PTO לטאב איתוראן_PTO
 *
 * אופציה א: הדבק CSV בטאב עזר "PTO_IMPORT_RAW" (שורה 1 = כותרות)
 *            ואז הרץ: importPtoFromHelperTab()
 *
 * אופציה ב: העלה את ituran_pto_fill_FULL.csv ל-Drive, העתק fileId
 *            והרץ: importPtoFromDriveCsv_('FILE_ID')
 *
 * אחרי ייבוא: chat / listPtoFn קוראים אוטומטית מ-getIturanPto
 */

function importPtoFromHelperTab() {
  var ss = ituranSs_();
  var raw = ss.getSheetByName('PTO_IMPORT_RAW');
  if (!raw || raw.getLastRow() < 2) {
    throw new Error('צור טאב PTO_IMPORT_RAW עם כותרות מה-CSV');
  }
  var values = raw.getDataRange().getValues();
  return writePtoRows_(values);
}

function importPtoFromDriveCsv_(fileId) {
  var file = DriveApp.getFileById(fileId);
  var blob = file.getBlob().getDataAsString('UTF-8');
  if (blob.charCodeAt(0) === 0xfeff) blob = blob.slice(1);
  var lines = blob.split(/\r?\n/).filter(function (l) { return l.trim(); });
  var rows = lines.map(function (line) {
    return parseCsvLine_(line);
  });
  return writePtoRows_(rows);
}

function writePtoRows_(values) {
  ensurePtoSheet_();
  var sh = ituranSs_().getSheetByName(ITURAN_CFG.TAB_PTO);
  var head = values[0].map(String);
  var need = ['key', 'truck', 'driver', 'eventType', 'eventTimeIso', 'address'];
  need.forEach(function (h) {
    if (head.indexOf(h) < 0) throw new Error('חסרה עמודה ב-CSV: ' + h);
  });

  var existing = loadExistingPtoKeys_(sh);
  var added = 0;
  var skipped = 0;
  var now = new Date().toISOString();

  sh.getRange('A:A').setNumberFormat('@');
  sh.getRange('E:E').setNumberFormat('@');
  sh.getRange('I:I').setNumberFormat('@');

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var o = {};
    for (var c = 0; c < head.length; c++) o[head[c]] = row[c];

    var key = String(o.key || '').trim();
    var truck = String(o.truck || '').trim();
    var eventType = String(o.eventType || '').trim();
    var eventTimeIso = String(o.eventTimeIso || '').trim();
    if (!key) {
      key = truck + '|' + eventTimeIso + '|' + eventType;
    }
    if (!truck || !eventType || !eventTimeIso) {
      skipped++;
      continue;
    }
    if (existing[key]) {
      skipped++;
      continue;
    }

    if (o.eventTimeIso instanceof Date) {
      eventTimeIso = o.eventTimeIso.toISOString();
      key = truck + '|' + eventTimeIso + '|' + eventType;
      if (existing[key]) {
        skipped++;
        continue;
      }
    }

    sh.appendRow([
      key,
      truck,
      String(o.driver || ''),
      eventType,
      eventTimeIso,
      String(o.address || ''),
      String(o.subject || 'import CSV'),
      String(o.messageId || ''),
      String(o.ingestedAt || now),
      String(o.snippet || ''),
    ]);
    existing[key] = true;
    added++;
  }

  var report = {
    ok: true,
    added: added,
    skipped: skipped,
    tab: ITURAN_CFG.TAB_PTO,
    sheetId: ituranSs_().getId(),
  };
  Logger.log(JSON.stringify(report));
  return report;
}

function parseCsvLine_(line) {
  var out = [];
  var cur = '';
  var inQ = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line.charAt(i);
    if (ch === '"') {
      if (inQ && line.charAt(i + 1) === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === ',' && !inQ) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function countPtoSheetRows() {
  var sh = ituranSs_().getSheetByName(ITURAN_CFG.TAB_PTO);
  if (!sh) return { rows: 0 };
  var n = Math.max(0, sh.getLastRow() - 1);
  Logger.log('PTO rows: ' + n);
  return { rows: n, tab: ITURAN_CFG.TAB_PTO };
}
