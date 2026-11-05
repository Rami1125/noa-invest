# איתוראן PTO — נתונים מוצלבים

מקור: דוח הודעות איתוראן (3777 שורות) · משאית `615-41-002` · 01/10/2026–05/11/2026

| קובץ | תוכן |
|------|------|
| `ituran_pto_fill_FULL.csv` | 250 אירועי open/close להדבקה בטאב **איתוראן_PTO** |
| `ituran_pto_table_FULL.csv` | 126 סשנים (פתיחה–סגירה–משך–כתובת) |
| `ituran_pto_sessions_FULL.csv` | אותו סיכום |

## טעינה לגיליון

1. העתק את `ImportPtoFromCsv.gs` לפרויקט Apps Script (או כבר ב-repo).
2. **אפשרות מהירה:** צור טאב `PTO_IMPORT_RAW`, הדבק את תוכן `ituran_pto_fill_FULL.csv`, הרץ `importPtoFromHelperTab()`.
3. **או:** העלה CSV ל-Drive → `importPtoFromDriveCsv_('FILE_ID')`.
4. ודא עמודת `eventTimeIso` בפורמט טקסט.
5. הצ׳אט מאזין אוטומטית דרך `listPtoFn` → `getIturanPto`.

## האזנה שוטפת

- `pollIturanAll` (טריגר 10 דק׳) ממשיך לקלוט מיילי PTO.
- מומלץ לייצא דוח הודעות מלא (כולל **פתיחת PTO** + **סגירת PTO**) לייבוא חוזר כשחסרים זוגות.
