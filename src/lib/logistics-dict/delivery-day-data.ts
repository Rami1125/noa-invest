/**
 * נתוני יום אספקה מאומתים (ארכיון_תעודות_גליה + רינטגן)
 * משמשים את /presentations עד ש-getDeliveryDay GAS פעיל
 */

export type DeliveryNoteDayRow = {
  noteId: string;
  deliveryDate: string;
  noteTime?: string;
  orderId?: string;
  customerNo?: string;
  customerName: string;
  address: string;
  city?: string;
  driver?: string;
  truck?: string;
  itemsRaw?: string;
  depositsRaw?: string;
  craneText?: string;
  craneOpen?: string;
  craneClose?: string;
  craneMin?: number | null;
  ituranArrive?: string;
  ituranDepart?: string;
  ituranStopMin?: number | null;
  signedBy?: string;
  status?: string;
  scanFile?: string;
  scanPage?: number | string;
  driveUrl?: string;
  isStorno?: boolean;
  stornoOf?: string;
  handwrittenNotes?: string;
  gpsMatch?: string;
};

export type XrayFinding = {
  noteId: string;
  checkId: string;
  severity: "קריטי" | "אזהרה" | "מידע";
  finding: string;
  suggestedFix?: string;
  status?: string;
};

export type DeliveryDayPayload = {
  dateIso: string;
  truck: string;
  driver: string;
  netNotes: number;
  stornoNotes: number;
  customers: number;
  craneMinSum: number;
  craneMinSumCorrected?: number;
  dep60002: number;
  dep60060: number;
  dep60006: number;
  notes: DeliveryNoteDayRow[];
  stornos: DeliveryNoteDayRow[];
  xray: XrayFinding[];
  missing: string[];
  scanFile?: string;
};

/** יום 17/11/2026 — מארכיון + סריקה + דוח רינטגן run_20261119_0337 */
export const DAY_2026_11_17: DeliveryDayPayload = {
  dateIso: "2026-11-17",
  truck: "615-41-002 משאית מרצדס מנוף",
  driver: "חכמת",
  netNotes: 7,
  stornoNotes: 4,
  customers: 6,
  craneMinSum: 122,
  craneMinSumCorrected: 112,
  dep60002: 48,
  dep60060: 2,
  dep60006: 3,
  scanFile: "scan12026-11-18-084906.pdf",
  missing: [
    "עמודות PTO פתיחה/סגירה בגיליון ריקות ליום זה",
    "טכוגרף / מד אוץ — חסר במקור",
    "סיבת סטורנו 6716557 — חסר במקור",
    "אישורי ראמי/הראל (U/V) ריקים למרות S=מאושר לחיוב",
  ],
  notes: [
    {
      noteId: "6716500",
      deliveryDate: "2026-11-17",
      noteTime: "05:33",
      customerName: "לירן/ביל\"ו",
      address: "ביל\"ו 53, רעננה",
      driver: "חכמת",
      truck: "615-41-002",
      craneText: "מנוף 07:36–08:00 (24 דק')",
      craneMin: 24,
      ituranArrive: "05:37",
      ituranDepart: "06:14",
      ituranStopMin: 37,
      signedBy: "מאיר + חותמת חצר 17.11.2026",
      status: "מאושר לחיוב",
      itemsRaw:
        "18×חמרה שק גדול (11570) + הובלת מנוף + 18×60002 + 4×צמדן | זיכוי: 5 בלה חמרה",
      depositsRaw: "60002×18 (זיכוי 5 בלות — ראה רינטגן C06)",
      scanFile: "scan12026-11-18-084906.pdf",
      scanPage: 2,
      handwrittenNotes: "החזרות/לזיכוי 5 בלה חמרה",
      gpsMatch: "מאומת",
    },
    {
      noteId: "6716504",
      deliveryDate: "2026-11-17",
      noteTime: "08:28",
      customerName: "יונתן ועידן הנדסה/מזל דגים",
      address: "מזל דגים 13, הוד השרון",
      craneText: "מנוף 09:20–09:40 (20 דק')",
      craneMin: 20,
      ituranArrive: "07:20",
      ituranDepart: "07:42",
      ituranStopMin: 23,
      signedBy: "חתום",
      status: "מאושר לחיוב",
      itemsRaw: "טיט×1, חול×2, סומסום×3, מלט 25ק\"ג×20 + מנוף",
      depositsRaw: "60002×6 + 60060×1",
      scanPage: 3,
      gpsMatch: "מאומת (כתובת GPS מזל דגים 12 ≈ 13)",
    },
    {
      noteId: "6716506",
      deliveryDate: "2026-11-17",
      noteTime: "09:47",
      orderId: "6216589",
      customerNo: "611085",
      customerName: "כיכר המושבה (איי.אי.די.סי.) בע\"מ",
      address: "ביער 35, גני עם",
      driver: "חכמת",
      truck: "615-41-002 משאית מרצדס מנוף",
      itemsRaw:
        "12010 | בלוק בטון 10/20/40 | 300 | יח' ; 12154 | בלוק 15/20/40 | 100 | יח' ; 10002 | מלט 25ק\"ג | 50 | שק ; 11551 | טיט שק גדול | 2 ; 11501 | חול | 3 ; 11511 | סומסום | 2 ; 18050 | הובלת מנוף | 1 ; 60002×7 ; 60006×3 ; 60060×1",
      depositsRaw: "60002×7 ; 60006×3 ; 60060×1",
      craneText: "10:42–11:15 (33 דק') | מנוף 9 מטר | חתום — רינטגן: בכתב יד 10:42–11:05 (23 דק')",
      craneOpen: "10:42",
      craneClose: "11:05",
      craneMin: 23,
      ituranArrive: "08:41:22",
      ituranDepart: "09:13:30",
      ituranStopMin: 32,
      signedBy: "חתום",
      status: "מאושר לחיוב",
      scanFile: "scan12026-11-18-084906.pdf",
      scanPage: 4,
      driveUrl: "https://drive.google.com/file/d/1geqYpcSCG3WS_IwUIK_x-jsWxP6ZbQVG/view",
      gpsMatch: "מאומת מלא",
    },
    {
      noteId: "6716511",
      deliveryDate: "2026-11-17",
      noteTime: "10:18",
      customerName: "בן ענבר-כללי",
      address: "יאיר שטרן 1, רעננה",
      craneText: "מנוף 12:00–12:10 (10 דק')",
      craneMin: 10,
      ituranArrive: "09:58",
      ituranDepart: "10:03",
      ituranStopMin: 5,
      signedBy: "אבו איסמאעיל",
      status: "מאושר לחיוב",
      itemsRaw: "גבס כחול 12.5×26 + הובלת מנוף",
      depositsRaw: "פטור פקדונות",
      handwrittenNotes: "מחליף את 6716509 לאחר סטורנו",
      gpsMatch: "מאומת",
    },
    {
      noteId: "6716513",
      deliveryDate: "2026-11-17",
      noteTime: "10:54",
      customerName: "ערוגת הבשם",
      address: "כנרת 21, קדימה",
      craneText: "מצורפת ל־6716523",
      craneMin: null,
      ituranStopMin: 19,
      signedBy: "יוסי",
      status: "מאושר לחיוב",
      itemsRaw: "שוחה 60 + מכסה",
      depositsRaw: "פטור פקדונות",
      handwrittenNotes: "מצורפת לתעודה מסניף החרש — AJ משותף עם 6716523",
      gpsMatch: "משותף",
    },
    {
      noteId: "6716516",
      deliveryDate: "2026-11-17",
      noteTime: "11:26",
      customerName: "רמותה יזמות",
      address: "בית העם 15, רמות השבים",
      craneText: "מנוף 13:25–13:45 (20 דק')",
      craneMin: 20,
      ituranArrive: "11:25",
      ituranDepart: "11:48",
      ituranStopMin: 23,
      signedBy: "ארז",
      status: "מאושר לחיוב",
      itemsRaw: "10×חצץ שק גדול + מנוף",
      depositsRaw: "60002×10",
      handwrittenNotes: "כתובת תוקנה בכתב יד מ-13 ל-15",
      gpsMatch: "מאומת",
    },
    {
      noteId: "6716523",
      deliveryDate: "2026-11-17",
      noteTime: "12:12",
      customerName: "ערוגת הבשם",
      address: "כנרת 21, קדימה",
      craneText: "מנוף 14:35–14:50 (15 דק')",
      craneMin: 15,
      ituranStopMin: 19,
      signedBy: "יוסי",
      status: "מאושר לחיוב",
      itemsRaw: "7×סומסום שק גדול + הובלת מנוף קדימה-צורן",
      depositsRaw: "60002×7",
      gpsMatch: "מאומת",
    },
  ],
  stornos: [
    {
      noteId: "6716509",
      deliveryDate: "2026-11-17",
      customerName: "בן ענבר",
      address: "יאיר שטרן 1, רעננה",
      isStorno: true,
      stornoOf: "6716510",
      handwrittenNotes: "בוטל ← סטורנו 6716510 (שינוי מק\"ט הובלה)",
    },
    {
      noteId: "6716515",
      deliveryDate: "2026-11-17",
      customerName: "מחאמיד חסן",
      address: "החרש 10, הוד השרון",
      isStorno: true,
      stornoOf: "6716557",
      handwrittenNotes: "בוטל ← סטורנו 6716557 · סיבת סטורנו חסרה במקור",
    },
  ],
  xray: [
    {
      noteId: "6716506",
      checkId: "C07",
      severity: "קריטי",
      finding: "זמן סיום פריקת מנוף שגוי בגיליון (33 דק' במקום 23)",
      suggestedFix: "לעדכן 10:42–11:05 (23 דק') בשורה 231 ובכתב יד",
      status: "פתוח",
    },
    {
      noteId: "6716500",
      checkId: "C06",
      severity: "קריטי",
      finding: "החזרת 5 בלות חמרה לזיכוי לא נרשמה; אושר לחיוב מלא 18",
      suggestedFix: "לעדכן זיכוי 5 בלות ולאמת חיוב מול קומקס",
      status: "פתוח",
    },
    {
      noteId: "KPI",
      checkId: "C14",
      severity: "קריטי",
      finding: "סכום דק' מנוף בגיליון 122 מול 112 בסריקה (+10 בגלל 6716506)",
      suggestedFix: "תיקון 6716506 → סכום יום 112",
      status: "פתוח",
    },
    {
      noteId: "ALL_17_11",
      checkId: "C08",
      severity: "אזהרה",
      finding: "חשד באג אזור זמן −2ש׳ (UTC מול Asia/Jerusalem) ב-PTO/AH:AI",
      suggestedFix: "המרה +02:00 בצנרת סשנים_PTO",
      status: "פתוח",
    },
  ],
};

const SEED: Record<string, DeliveryDayPayload> = {
  "2026-11-17": DAY_2026_11_17,
};

export function getSeedDeliveryDay(dateIso: string): DeliveryDayPayload | null {
  return SEED[dateIso] ?? null;
}
