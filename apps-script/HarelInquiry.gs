/**
 * HarelInquiry.gs — בירור תעודת משלוח להראל: לינק מאובטח + העלאה מדף נחיתה
 * מתווסף לצד NoaGateway_v5.gs (משתמש ב-prop_, tab_, str_, intl_, sha_, kapsoSend_, isManagement_, NOA).
 *
 * הוספה ל-switch ב-handle_ של v5:
 *   case 'harel_inquiry_link': return json_(harelInquiryLink_(p));
 *   case 'landing_upload':     return json_(handleLandingUpload_(p));
 *
 * Script Properties נוספים:
 *   NOTE_LINK_SECRET (חובה, מחרוזת אקראית ארוכה) · LANDING_BASE_URL (ברירת מחדל https://noa-invest.vercel.app)
 *   HAREL_PHONE (972505227724) · RAMI_PHONE (972508860896) · HAREL_EMAIL · RAMI_EMAIL · RAMI_CALENDAR_ID
 *   INQUIRY_FOLDER_ID (אופציונלי; אחרת נוצרת/נמצאת תיקייה "בירור_תעודות_משלוח_ראמי")
 */

var INQ = {
  TAB: ['בירור_ראמי', 'בירור ראמי'],
  FOLDER_NAME: 'בירור_תעודות_משלוח_ראמי',
  MAX_BYTES: 3200000,
  LINK_TTL_HOURS: 72,
  STATUS: 'בטיפול ראמי',
  FREQ: { '1': 'שעתית', '2': 'יומית (08:00)', '3': 'שבועית (ראשון 08:00)' },
  HEADERS: ['תאריך', "מס' תעודה", 'סטטוס', 'סיבה / פירוט', 'קישור לקובץ', 'דף Invest', 'תדירות תזכורת', 'מזהה העלאה', 'הועלה ע\"י']
};

/* ---------- טוקן חתום (HMAC) ---------- */

function b64url_(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }
function b64urlDecodeToString_(s) {
  while (s.length % 4) s += '=';
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(s)).getDataAsString();
}
function sign_(payload) {
  var secret = prop_('NOTE_LINK_SECRET');
  if (!secret) throw new Error('NOTE_LINK_SECRET missing');
  return b64url_(Utilities.computeHmacSha256Signature(payload, secret));
}
function makeToken_(note) {
  var payload = note + '.' + (Date.now() + INQ.LINK_TTL_HOURS * 3600 * 1000);
  return b64url_(Utilities.newBlob(payload).getBytes()) + '.' + sign_(payload);
}
function verifyToken_(note, token) {
  var parts = String(token || '').split('.');
  if (parts.length !== 2) return false;
  var payload;
  try { payload = b64urlDecodeToString_(parts[0]); } catch (e) { return false; }
  var i = payload.lastIndexOf('.');
  if (i < 0 || payload.slice(0, i) !== note || Date.now() > parseInt(payload.slice(i + 1), 10)) return false;
  var expected = sign_(payload), got = parts[1], diff = expected.length ^ got.length;
  for (var k = 0; k < expected.length && k < got.length; k++) diff |= expected.charCodeAt(k) ^ got.charCodeAt(k);
  return diff === 0;
}
function validNote_(n) { return /^[0-9A-Za-z\-]{1,20}$/.test(n); }

/* ---------- הפקת לינק (הנהלה בלבד) + שליחה במייל ---------- */

function harelInquiryLink_(p) {
  if (!isManagement_(p.phone)) return denied_();
  var note = str_(p.noteNumber);
  if (!validNote_(note)) return { status: 'invalid', ok: false, message: 'מספר תעודה לא תקין' };
  var base = prop_('LANDING_BASE_URL') || 'https://noa-invest.vercel.app';
  var url = base + '/notes/' + encodeURIComponent(note) + '?t=' + makeToken_(note);
  var out = { status: 'ok', ok: true, noteNumber: note, url: url, expiresInHours: INQ.LINK_TTL_HOURS, emailSent: false };
  if (truthy_(p.sendEmail)) {
    var to = prop_('HAREL_EMAIL');
    if (!to) { out.emailError = 'HAREL_EMAIL לא מוגדר'; return out; }
    try {
      MailApp.sendEmail({
        to: to, subject: 'בירור תעודת משלוח ' + note + ' — ח. סבן',
        htmlBody: '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px">שלום הראל,<br><br>' +
          'להעלאת תעודה לבירור מס׳ <b>' + note + '</b>: <a href="' + url + '">לחץ כאן לדף ההעלאה</a><br>' +
          'הקישור תקף ל-' + INQ.LINK_TTL_HOURS + ' שעות.<br><br>נועה, ח. סבן חומרי בניין</div>'
      });
      out.emailSent = true;
    } catch (e) { out.emailError = 'שליחת המייל נכשלה'; }
  }
  return out;
}

/* ---------- עזרים ---------- */

function safeCell_(v) {
  var s = str_(v).slice(0, 1000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function inquiryFolder_() {
  var id = prop_('INQUIRY_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var it = DriveApp.getFoldersByName(INQ.FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(INQ.FOLDER_NAME);
}

function ensureHeaders_(sh) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var h = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(str_);
  var empty = h.every(function (x) { return !x; });
  if (empty) h = [];
  INQ.HEADERS.forEach(function (name) {
    if (h.indexOf(name) < 0) { h.push(name); sh.getRange(1, h.length).setValue(name); }
  });
  var ix = {};
  INQ.HEADERS.forEach(function (name) { ix[name] = h.indexOf(name); });
  return { count: h.length, ix: ix };
}

function nextWorkday8_() {
  var d = new Date();
  for (var i = 0; i < 8; i++) {
    d = new Date(d.getTime() + 24 * 3600 * 1000);
    if (Utilities.formatDate(d, NOA.TZ, 'u') !== '6') break;
  }
  return Utilities.parseDate(Utilities.formatDate(d, NOA.TZ, 'yyyy-MM-dd') + ' 08:00', NOA.TZ, 'yyyy-MM-dd HH:mm');
}

function magicOk_(bytes, mime) {
  var b = bytes;
  if (mime === 'application/pdf') return b[0] === 37 && b[1] === 80 && b[2] === 68 && b[3] === 70;
  if (mime === 'image/jpeg') return (b[0] & 255) === 255 && (b[1] & 255) === 216;
  if (mime === 'image/png') return (b[0] & 255) === 137 && b[1] === 80;
  if (mime === 'image/webp') return b[0] === 82 && b[1] === 73 && b[8] === 87;
  return false;
}

function step_(steps, key, ok, detail) { steps.push({ key: key, ok: !!ok, detail: detail || '' }); return !!ok; }

/* ---------- העלאה מדף הנחיתה ---------- */

function handleLandingUpload_(p) {
  var steps = [];
  var note = str_(p.noteNumber);
  var freq = INQ.FREQ[str_(p.freq)] ? str_(p.freq) : '2';

  var tokenOk = false;
  try { tokenOk = validNote_(note) && verifyToken_(note, p.token); } catch (e) {}
  if (!step_(steps, 'auth', tokenOk, tokenOk ? '' : 'הקישור לא תקף או שפג תוקפו')) return finish_(steps, note);

  var mime = str_(p.mimeType).toLowerCase(), bytes = null;
  try { bytes = Utilities.base64Decode(str_(p.fileBase64)); } catch (e) {}
  var fileOk = bytes && bytes.length > 0 && bytes.length <= INQ.MAX_BYTES && magicOk_(bytes, mime);
  if (!step_(steps, 'file', fileOk, fileOk ? '' : 'קובץ לא תקין (PDF/JPG/PNG/WEBP עד 3MB)')) return finish_(steps, note);

  var md5 = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, bytes).map(function (b) {
    var x = (b < 0 ? b + 256 : b).toString(16); return x.length < 2 ? '0' + x : x;
  }).join('');
  var uploadId = 'UP-' + md5.slice(0, 10);
  var reason = safeCell_(p.reason);
  var ext = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
  var url = '';

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = tab_(INQ.TAB);
    if (!sh) { step_(steps, 'sheet', false, 'הטאב בירור_ראמי לא נמצא'); return finish_(steps, note); }
    var meta = ensureHeaders_(sh);
    var iUp = meta.ix['מזהה העלאה'];
    if (sh.getLastRow() >= 2) {
      var ids = sh.getRange(2, iUp + 1, sh.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) if (ids[i][0] === uploadId)
        return { status: 'ok', ok: true, duplicate: true, noteNumber: note, steps: [{ key: 'duplicate', ok: true, detail: 'הקובץ כבר הועלה' }],
          message: 'התעודה כבר הועלתה קודם ומשימת הבירור פתוחה. לא נפתחה משימה נוספת.' };
    }

    try {
      var file = inquiryFolder_().createFile(Utilities.newBlob(bytes, mime, 'תעודה_' + note + '_' + Utilities.formatDate(new Date(), NOA.TZ, 'yyyyMMdd_HHmm') + '.' + ext));
      [prop_('HAREL_EMAIL'), prop_('RAMI_EMAIL')].forEach(function (m) { if (m) try { file.addViewer(m); } catch (e) {} });
      url = file.getUrl();
      step_(steps, 'drive', true);
    } catch (e) { step_(steps, 'drive', false, 'שמירה ב-Drive נכשלה'); return finish_(steps, note); }

    try {
      var row = new Array(meta.count).fill('');
      var ix = meta.ix, base = prop_('LANDING_BASE_URL') || 'https://noa-invest.vercel.app';
      row[ix['תאריך']] = new Date();
      row[ix["מס' תעודה"]] = note;
      row[ix['סטטוס']] = INQ.STATUS;
      row[ix['סיבה / פירוט']] = reason;
      row[ix['קישור לקובץ']] = '=HYPERLINK("' + url + '","פתח תעודה")';
      row[ix['דף Invest']] = '=HYPERLINK("' + base + '/notes/' + encodeURIComponent(note) + '","דף בירור")';
      row[ix['תדירות תזכורת']] = INQ.FREQ[freq];
      row[ix['מזהה העלאה']] = uploadId;
      row[ix['הועלה ע\"י']] = 'הראל (דף נחיתה)';
      sh.appendRow(row);
      step_(steps, 'sheet', true);
    } catch (e) { step_(steps, 'sheet', false, 'רישום בגיליון נכשל'); return finish_(steps, note, url); }
  } finally { lock.releaseLock(); }

  try {
    var calId = prop_('RAMI_CALENDAR_ID') || 'rami.msarwa1@gmail.com';
    var cal = CalendarApp.getCalendarById(calId);
    if (!cal) throw new Error('no calendar');
    var start = nextWorkday8_();
    var ev = cal.createEvent('בירור תעודת משלוח ' + note, start, new Date(start.getTime() + 30 * 60 * 1000),
      { description: 'סיבה: ' + reason + '\nתעודה: ' + url + '\nתדירות תזכורת: ' + INQ.FREQ[freq] });
    ev.removeAllReminders();
    ev.addPopupReminder(15); ev.addEmailReminder(60); ev.addEmailReminder(1440);
    step_(steps, 'calendar', true);
  } catch (e) { step_(steps, 'calendar', false, 'יצירת אירוע ביומן נכשלה'); }

  try {
    var rami = prop_('RAMI_PHONE') || '972508860896';
    var r = kapsoSend_({ messaging_product: 'whatsapp', recipient_type: 'individual', to: rami, type: 'text',
      text: { body: '🔍 *תעודה חדשה לבירור*\n• תעודה: ' + note + '\n• סיבה: ' + (reason || 'לא צוינה') +
        '\n• תזכורות: ' + INQ.FREQ[freq] + '\n• קובץ: ' + url } });
    step_(steps, 'notifyRami', r.ok, r.ok ? '' : 'שליחה נכשלה (' + r.code + ')');
  } catch (e) { step_(steps, 'notifyRami', false, 'שליחה נכשלה'); }

  return finish_(steps, note, url, true);
}

function finish_(steps, note, url, sendConfirm) {
  var allOk = steps.length > 0 && steps.every(function (s) { return s.ok; });
  var required = ['auth', 'file', 'drive', 'sheet'].every(function (k) {
    return steps.some(function (s) { return s.key === k && s.ok; });
  });
  var failed = steps.filter(function (s) { return !s.ok; }).map(function (s) { return s.detail || s.key; });
  var message = allOk
    ? '✔️ התעודה עלתה לדף בירור ראמי ונפתחה משימת בירור לראמי.'
    : (required ? '⚠️ התעודה נשמרה ונרשמה בבירור ראמי, אך חלק מהשלבים נכשלו: ' + failed.join('; ')
                : '❌ ההעלאה לא הושלמה: ' + failed.join('; '));
  if (sendConfirm) {
    try {
      var r = kapsoSend_({ messaging_product: 'whatsapp', recipient_type: 'individual', to: prop_('HAREL_PHONE') || '972505227724',
        type: 'text', text: { body: message + '\nתעודה: ' + note } });
      steps.push({ key: 'confirmHarel', ok: r.ok, detail: r.ok ? '' : 'אישור להראל נכשל (' + r.code + ')' });
    } catch (e) { steps.push({ key: 'confirmHarel', ok: false, detail: 'אישור להראל נכשל' }); }
  }
  return { status: 'ok', ok: allOk, partial: !allOk && required, noteNumber: note, steps: steps, message: message };
}
