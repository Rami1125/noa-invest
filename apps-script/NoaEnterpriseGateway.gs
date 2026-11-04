/**
 * NOA AI Enterprise Gateway v3.9 (Hardened)
 *
 * הקובץ המלא ארוך מדי לדחיפה יחידה דרך API.
 * העתיקו את הקוד המלא מתשובת הסוכן (NoaEnterpriseGateway.gs v3.9)
 * או הריצו את הקבצים:
 *   - apps-script/ProductMediaColumns.gs
 *   - apps-script/NoaColumnsFix.gs
 *
 * Actions חובה ב-switch:
 *   upsert_product_media | delete_product_media | ensure_media_columns
 *   + כל ה-actions הקיימים (health, lookup_catalog, get_media, ...)
 *
 * אחרי הדבקה: Deploy → New version
 * בדיקה: ensureProductMediaColumnsByName()
 *
 * גרסה: 3.9_hardened
 * גיליון: 1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw
 * מפתח: saban_noa_secret_key_2026_enterprise_99
 */

// Stub only — replace entire file with full v3.9 from agent response.
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    version: '3.9_stub',
    message: 'החליפו קובץ זה ב-NoaEnterpriseGateway.gs v3.9 המלא'
  })).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) { return doGet(e); }
