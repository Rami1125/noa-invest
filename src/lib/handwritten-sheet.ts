/**
 * טאב «כתב יד» (עם רווח) — נרמול, אינדקס והצלבה לתעודות ולסשני PTO.
 * מקור אמת בלבד; אין המצאת שעות או תעודות.
 */

export type HandwrittenSheetRow = {
  id: string;
  noteDate: string;
  docId: string;
  orderId: string;
  customerNo: string;
  customerName: string;
  city: string;
  address: string;
  driverTruck: string;
  craneOpenHe: string;
  craneCloseHe: string;
  durationMin: number | null;
  craneType: string;
  returnsText: string;
  fieldNotes: string;
  warehouseStamp: string;
  returnApprovalStatus: string;
  driveUrl: string;
  sourceLabel: "tab_handwritten";
};

export type HandwrittenSourceKind = "tab_handwritten" | "archive_galia" | "none";

export type HandwrittenMatch = {
  source: HandwrittenSourceKind;
  sourceLabelHe: string;
  rows: HandwrittenSheetRow[];
  durationMin: number | null;
  craneOpenHe: string;
  craneCloseHe: string;
  craneType: string;
  returnsText: string;
  fieldNotes: string;
  warehouseStamp: string;
  returnApprovalStatus: string;
  driveUrl: string;
  archiveFallbackRaw?: string;
  deltaMin: number | null;
  hasReturnsIssue: boolean;
  alert: boolean;
};

export function normalizeDocId(raw: unknown): string {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  s = s.replace(/\s+/g, "");
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
  return s;
}

export function extractDocIds(raw: unknown): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  const parts = s.split(/[,;|/\\\s]+/).map((p) => normalizeDocId(p)).filter(Boolean);
  return [...new Set(parts)];
}

export function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) {
    return Number.isInteger(v) ? String(v) : String(v);
  }
  return String(v).trim();
}

export function parseDurationMin(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.round(raw * 10) / 10;
  }
  const s = cellStr(raw).replace(",", ".");
  if (!s) return null;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

export function indexHandwrittenByDocId(rows: HandwrittenSheetRow[]): Map<string, HandwrittenSheetRow[]> {
  const map = new Map<string, HandwrittenSheetRow[]>();
  for (const row of rows) {
    const ids = extractDocIds(row.docId);
    if (!ids.length && row.docId) ids.push(normalizeDocId(row.docId));
    for (const id of ids) {
      if (!id) continue;
      const list = map.get(id) || [];
      list.push(row);
      map.set(id, list);
    }
  }
  return map;
}

const RETURNS_OK = /^(ללא\s*החזרה|אין\s*החזרה|—|-|)$/i;

export function matchHandwritten(opts: {
  docIds: unknown;
  index: Map<string, HandwrittenSheetRow[]>;
  archiveCraneRaw?: string;
  ptoDurationMin?: number | null;
}): HandwrittenMatch {
  const ids = extractDocIds(opts.docIds);
  const collected: HandwrittenSheetRow[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    for (const r of opts.index.get(id) || []) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      collected.push(r);
    }
  }
  if (collected.length) {
    const primary = collected.find((r) => r.durationMin != null) || collected[0]!;
    const hwMin = primary.durationMin;
    const pto = opts.ptoDurationMin;
    let deltaMin: number | null = null;
    if (hwMin != null && pto != null && Number.isFinite(pto)) {
      deltaMin = Math.round(Math.abs(pto - hwMin) * 10) / 10;
    }
    const returnsText = primary.returnsText;
    const hasReturnsIssue = Boolean(returnsText && !RETURNS_OK.test(returnsText.trim()));
    return {
      source: "tab_handwritten",
      sourceLabelHe: "מקור: טאב כתב יד",
      rows: collected,
      durationMin: hwMin,
      craneOpenHe: primary.craneOpenHe,
      craneCloseHe: primary.craneCloseHe,
      craneType: primary.craneType,
      returnsText,
      fieldNotes: primary.fieldNotes,
      warehouseStamp: primary.warehouseStamp,
      returnApprovalStatus: primary.returnApprovalStatus,
      driveUrl: primary.driveUrl || collected.find((r) => r.driveUrl)?.driveUrl || "",
      deltaMin,
      hasReturnsIssue,
      alert: (deltaMin != null && deltaMin > 10) || hasReturnsIssue,
    };
  }
  const archive = String(opts.archiveCraneRaw || "").trim();
  if (archive) {
    const hwMin = parseDurationMin(archive);
    const pto = opts.ptoDurationMin;
    let deltaMin: number | null = null;
    if (hwMin != null && pto != null && Number.isFinite(pto)) {
      deltaMin = Math.round(Math.abs(pto - hwMin) * 10) / 10;
    }
    return {
      source: "archive_galia",
      sourceLabelHe: "מקור: ארכיון גליה (ללא שורת כתב יד)",
      rows: [],
      durationMin: hwMin,
      craneOpenHe: "",
      craneCloseHe: "",
      craneType: "",
      returnsText: "",
      fieldNotes: archive,
      warehouseStamp: "",
      returnApprovalStatus: "",
      driveUrl: "",
      archiveFallbackRaw: archive,
      deltaMin,
      hasReturnsIssue: false,
      alert: deltaMin != null && deltaMin > 10,
    };
  }
  return {
    source: "none",
    sourceLabelHe: "אין כתב יד במקור",
    rows: [],
    durationMin: null,
    craneOpenHe: "",
    craneCloseHe: "",
    craneType: "",
    returnsText: "",
    fieldNotes: "",
    warehouseStamp: "",
    returnApprovalStatus: "",
    driveUrl: "",
    deltaMin: null,
    hasReturnsIssue: false,
    alert: false,
  };
}

/**
 * המרת ערך זמן מ-GAS/Sheets ל-HH:mm.
 * תומך ב: "07:45", "7:45", שבר יום (0.40277…).
 */
export function normalizeTimeHe(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "number" && Number.isFinite(raw)) {
    let dayFrac = raw;
    if (raw >= 1 && raw < 24) dayFrac = raw / 24;
    if (dayFrac >= 0 && dayFrac < 1.5) {
      const totalMin = Math.round((dayFrac % 1) * 24 * 60);
      const hh = Math.floor(totalMin / 60) % 24;
      const mm = totalMin % 60;
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
    return "";
  }
  const s = String(raw).trim();
  if (!s || s === "—" || s === "-") return "";
  const hm = s.match(/^(\d{1,2}):(\d{2})/);
  if (hm) return `${hm[1]!.padStart(2, "0")}:${hm[2]}`;
  if (/^0?\.\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n) && n >= 0 && n < 1.5) return normalizeTimeHe(n);
  }
  if (s.includes("1899")) return "";
  return s;
}

/** מיפוי שורה גולמית מ-GAS — סכמה חיה: docDate, craneDurationMin, returnsHandwritten… */
export function mapGasHandwrittenRow(raw: Record<string, unknown>, idx: number): HandwrittenSheetRow | null {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      if (raw[k] != null && String(raw[k]).trim() !== "") return raw[k];
    }
    return "";
  };
  const docId = normalizeDocId(get("docId", "מס' תעודת משלוח", "מס׳ תעודת משלוח", "מספר תעודה", "B"));
  const noteDate = cellStr(get("docDate", "noteDate", "תאריך תעודה", "A"));
  const orderId = normalizeDocId(get("orderId", "מס' הזמנה", "מס׳ הזמנה", "C"));
  const customerNo = normalizeDocId(get("customerNo", "מס' לקוח", "מס׳ לקוח", "D"));
  const customerName = cellStr(get("customerName", "שם לקוח", "E"));
  const city = cellStr(get("city", "עיר", "F"));
  const address = cellStr(get("address", "כתובת אספקה", "G"));
  const driverTruck = cellStr(get("driver", "driverTruck", "נהג / משאית", "נהג", "H"));
  const craneOpenHe = normalizeTimeHe(get("craneOpenHe", "שעת פתיחת מנוף (כתב יד)", "שעת פתיחת מנוף", "I"));
  const craneCloseHe = normalizeTimeHe(get("craneCloseHe", "שעת סגירת מנוף (כתב יד)", "שעת סגירת מנוף", "J"));
  const durationMin = parseDurationMin(get("craneDurationMin", "durationMin", "משך מנוף (דקות)", "משך מנוף", "K"));
  const craneType = cellStr(get("craneType", "סוג מנוף", "L"));
  const returnsText = cellStr(get("returnsHandwritten", "returnsText", "החזרות / זיכויים בכתב יד", "החזרות", "M"));
  const fieldNotes = cellStr(get("notesHandwritten", "fieldNotes", "הערות שטח בכתב יד", "הערות שטח", "N"));
  const warehouseStamp = cellStr(get("warehouseApproval", "warehouseStamp", "חתימת אישור / חותמת מחסן", "חתימת אישור", "O"));
  const returnApprovalStatus = cellStr(get("returnStatus", "returnApprovalStatus", "סטטוס אישור החזרה", "P"));
  const driveUrl = cellStr(get("driveUrl", "קישור לתעודה ב-Drive", "קישור לתעודה", "Q"));

  if (!docId && !customerName && !craneOpenHe && !fieldNotes && durationMin == null) return null;

  return {
    id: `hw-${docId || "x"}-${idx}`,
    noteDate,
    docId,
    orderId,
    customerNo,
    customerName,
    city,
    address,
    driverTruck,
    craneOpenHe,
    craneCloseHe,
    durationMin,
    craneType,
    returnsText,
    fieldNotes,
    warehouseStamp,
    returnApprovalStatus,
    driveUrl,
    sourceLabel: "tab_handwritten",
  };
}
