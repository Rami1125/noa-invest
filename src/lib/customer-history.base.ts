/**
 * תיק לקוח — טיפוסים, מיפוי שורות, קריאת טאבים
 */
import { readGoogleSheetBatch, MASTER_SHEET_ID } from "./smart-dispatch/sheets-integration";
import { toIso } from "./he-date";
export { toIso };

export const TABS = {
  customers: "לקוחות",
  notes: "ארכיון_תעודות_גליה",
  orders: "הזמנות_פתוחות",
  visits: "היסטוריית_ביקורים",
  ituranVisits: "איתוראן_ביקורים",
  pto: "איתוראן_PTO",
  ptoSheetSessions: "סשנים_PTO",
  sites: "אתרי_לקוחות",
  inquiries: "בירורים",
  checks: "בדיקות",
} as const;

export type HNote = {
  id: string;
  dateIso: string;
  customerNo: string;
  customerName: string;
  address: string;
  driver: string;
  truck: string;
  itemsText: string;
  status: string;
  driveUrl?: string;
  itStop?: number | null;
  depositsText?: string;
  craneNotes?: string;
  craneMin?: number | null;
  ptoOpen?: string;
  ptoClose?: string;
  ptoMin?: number | null;
  measureSource?: string;
};

export type HPtoSession = {
  eventTimeIso: string;
  openTime?: string;
  closeTime?: string;
  durationMin: number | null;
  truck: string;
  driver: string;
  address: string;
  noteId: string;
  eventType?: string;
  source: string;
};

export type HOrder = {
  id: string;
  dateIso: string;
  customerNo: string;
  address: string;
  status: string;
  noteId: string;
};

export type HVisit = {
  key: string;
  dateIso: string;
  truck: string;
  driver: string;
  city: string;
  address: string;
  noteIds: string[];
  orderIds: string[];
  craneRaw: string;
  unloadMin: number | null;
  waitMin: number | null;
  ituranMin: number | null;
  ptoMin: number | null;
  driveMin: number | null;
  siteMin: number | null;
  source: string;
  flags: string;
  siteKey: string;
};

export type HIturanVisit = {
  id: string;
  noteId: string;
  dateIso: string;
  address: string;
  driver: string;
  truck: string;
  arrival: string;
  departure: string;
  stayMin: number | null;
  ptoMin: number | null;
};

export type HSite = {
  siteKey: string;
  address: string;
  visits: number;
  lastIso: string;
  samples: number;
  medianMin: number | null;
  p80Min: number | null;
  maxMin: number | null;
  confidence: string;
};

export type AtlasSite = HSite & {
  city: string;
  customerNo: string;
  customerName: string;
  latitude: number | null;
  longitude: number | null;
  ptoOpens: number;
  ptoTotalMin: number;
  visitHistory: Array<{
    dateIso: string;
    truck: string;
    driver: string;
    notes: string[];
    orders: string[];
    durationMin: number | null;
    ptoMin: number | null;
  }>;
};

export type HInquiry = {
  noteId: string;
  reason: string;
  reply: string;
  status: string;
  updatedIso: string;
  fileUrl: string;
};
export type HCheck = {
  dateIso: string;
  noteId: string;
  approver: string;
  checkId: string;
  result: string;
};

export type CustomerSummary = {
  customerNo: string;
  name: string;
  address: string;
  addressesCount: number;
  phone: string;
  contactName: string;
  preferredDriver: string;
  notesCount: number;
  ordersCount: number;
  visitsCount: number;
  firstIso: string;
  lastIso: string;
  avgSiteMin: number | null;
  openInquiries: number;
};

export type CustomerHistory = {
  customer: CustomerSummary;
  notes: HNote[];
  orders: HOrder[];
  ituranVisits: HIturanVisit[];
  visits: HVisit[];
  sites: HSite[];
  inquiries: HInquiry[];
  checks: HCheck[];
  ptoSessions: HPtoSession[];
  generatedAt: string;
};

export type Row = Record<string, string>;

const normHeader = (h: string) => h.replace(/\u200f|\u200e/g, "").trim();

export const foldKey = (h: string) =>
  normHeader(h)
    .toLowerCase()
    .replace(/[\s`'׳״".,_\-\/\\:()\[\]]+/g, "")
    .replace(/מספר/g, "מס");

export const g = (row: Row, ...keys: string[]) => {
  for (const k of keys) {
    const nk = normHeader(k);
    const v = row[nk] ?? row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  const wanted = keys.map(foldKey).filter(Boolean);
  for (const [hk, hv] of Object.entries(row)) {
    if (hv == null || String(hv).trim() === "") continue;
    const fh = foldKey(hk);
    if (wanted.some((w) => fh === w || (w.length >= 4 && (fh.includes(w) || w.includes(fh))))) {
      return String(hv).trim();
    }
  }
  return "";
};

export const num = (v: string | number | null | undefined): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(/[^\d.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export const parseCoord = (v: string): number | null => {
  if (!v) return null;
  const n = parseFloat(String(v).replace(/[^\d.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export const isIsraelCoord = (lat: number, lon: number) =>
  lat >= 29.4 && lat <= 33.5 && lon >= 34.2 && lon <= 35.9;

export type Raw = Record<keyof typeof TABS, Row[]>;

export async function readTab(name: string): Promise<Row[]> {
  try {
    const values = (await readGoogleSheetBatch(
      MASTER_SHEET_ID,
      `${name}!A1:ZZ`,
    )) as (string | number | boolean | null)[][] | null;
    if (!values || values.length <= 1) return [];
    const headers = values[0]!.map((h) => normHeader(String(h ?? "")));
    return values.slice(1).map((row) => {
      const o: Row = {};
      headers.forEach((h, i) => {
        if (!h) return;
        const cell = row[i];
        o[h] = cell == null ? "" : String(cell).trim();
      });
      if (!o["lat"] && row[12] != null && String(row[12]).trim() !== "") o["lat"] = String(row[12]).trim();
      if (!o["lng"] && row[13] != null && String(row[13]).trim() !== "") o["lng"] = String(row[13]).trim();
      return o;
    });
  } catch {
    return [];
  }
}

export async function loadRaw(): Promise<Raw> {
  const keys = Object.keys(TABS) as (keyof typeof TABS)[];
  const rows = await Promise.all(keys.map((k) => readTab(TABS[k])));
  const out = {} as Raw;
  keys.forEach((k, i) => {
    out[k] = rows[i]!;
  });
  return out;
}

export function customerTokens(raw: string): Array<{ no: string; name: string }> {
  if (!raw) return [];
  const parts = raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  const out: Array<{ no: string; name: string }> = [];
  for (const p of parts) {
    const m = p.match(/(\d{4,})\s*[-–]?\s*(.*)/);
    if (m) out.push({ no: m[1]!, name: (m[2] || "").trim() });
    else out.push({ no: "", name: p });
  }
  return out;
}

export function parseCraneMin(text: string): number | null {
  const m = String(text || "").match(/\((\d+)\s*דק/) || String(text || "").match(/(\d+)\s*דק/);
  return m ? parseInt(m[1]!, 10) : null;
}

export function mapNote(row: Row): HNote {
  const stopRaw = g(row, "שהייה איתוראן דק'") || g(row, "itStop") || g(row, "שהייה דק'");
  const stop = num(stopRaw);
  const craneNotes =
    g(row, "זמני מנוף / המתנה") ||
    g(row, "זמני מנוף/פריקה") ||
    g(row, "זמן פריקה/מנוף") ||
    g(row, "מנוף") ||
    g(row, "craneNotes");
  return {
    id: (g(row, "מס' תעודה") || g(row, "מספר תעודה") || g(row, "מס' תעודת משלוח")).replace(/\.0+$/, ""),
    dateIso: toIso(g(row, "תאריך תעודה") || g(row, "תאריך") || g(row, "תאריך אספקה")),
    customerNo: (g(row, "מס' לקוח") || "").replace(/\.0+$/, ""),
    customerName: g(row, "שם לקוח"),
    address: g(row, "כתובת אספקה") || g(row, "כתובת"),
    driver: g(row, "נהג"),
    truck: g(row, "משאית") || g(row, "רישוי / משאית"),
    itemsText: g(row, "פריטים") || g(row, "פירוט"),
    status: g(row, "סטטוס") || g(row, "סטטוס אישור"),
    driveUrl: g(row, "כתובת הקובץ (URL)") || g(row, "driveUrl") || g(row, "קישור לתעודה"),
    itStop: stop != null && stop > 0 ? stop : null,
    depositsText: g(row, "פקדונות") || g(row, "depositsText") || g(row, "טקסט פקדונות"),
    craneNotes: craneNotes || undefined,
    craneMin: parseCraneMin(craneNotes),
    ptoOpen: g(row, "PTO פתיחה", "PTO פתיחה (איתוראן)", "ptoOpen", "ptoOpenTime") || undefined,
    ptoClose: g(row, "PTO סגירה", "PTO סגירה (איתוראן)", "ptoClose", "ptoCloseTime") || undefined,
    ptoMin: num(g(row, "PTO דק׳", "PTO דק", "PTO משך (דק׳)", "PTO משך", "ptoDurationMin", "ptoMin")),
    measureSource: g(row, "מקור מדידה", "gpsSource") || undefined,
  };
}

export function mapOrder(row: Row): HOrder {
  return {
    id: g(row, "מס' הזמנה") || g(row, "הזמנה"),
    dateIso: toIso(g(row, "תאריך")),
    customerNo: (g(row, "מס' לקוח") || g(row, "מספר לקוח") || "").replace(/\.0+$/, ""),
    address: g(row, "כתובת"),
    status: g(row, "סטטוס"),
    noteId: g(row, "מס' תעודה"),
  };
}

export function mapIturanVisit(row: Row): HIturanVisit {
  return {
    id: g(row, "id") || `${g(row, "תאריך")}|${g(row, "כתובת")}`,
    noteId: g(row, "מס' תעודה"),
    dateIso: toIso(g(row, "תאריך")),
    address: g(row, "כתובת"),
    driver: g(row, "נהג"),
    truck: g(row, "משאית"),
    arrival: g(row, "הגעה"),
    departure: g(row, "יציאה"),
    stayMin: num(g(row, "שהייה דק")),
    ptoMin: num(g(row, "PTO דק")),
  };
}

export function mapVisit(row: Row): HVisit {
  return {
    key: g(row, "key") || `${g(row, "תאריך")}|${g(row, "כתובת")}`,
    dateIso: toIso(g(row, "תאריך")),
    truck: g(row, "משאית"),
    driver: g(row, "נהג"),
    city: g(row, "עיר"),
    address: g(row, "כתובת"),
    noteIds: (g(row, "תעודות") || g(row, "מס' תעודה") || "")
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean),
    orderIds: (g(row, "הזמנות") || "")
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean),
    craneRaw: g(row, "מנוף"),
    unloadMin: num(g(row, "פריקה דק")),
    waitMin: num(g(row, "המתנה דק")),
    ituranMin: num(g(row, "איתוראן דק")),
    ptoMin: num(g(row, "PTO דק") || g(row, "משך PTO")),
    driveMin: num(g(row, "נסיעה דק")),
    siteMin: num(g(row, "באתר דק")),
    source: g(row, "מקור"),
    flags: g(row, "דגלים"),
    siteKey: g(row, "מפתח אתר"),
  };
}

export function buildIndex(raw: Raw): Map<string, CustomerSummary> {
  const out = new Map<string, CustomerSummary>();
  for (const row of raw.notes) {
    const no = (g(row, "מס' לקוח") || "").replace(/\.0+$/, "");
    if (!no) continue;
    const existing = out.get(no);
    const name = g(row, "שם לקוח");
    const address = g(row, "כתובת אספקה") || g(row, "כתובת");
    const dateIso = toIso(g(row, "תאריך תעודה") || g(row, "תאריך"));
    if (!existing) {
      out.set(no, {
        customerNo: no,
        name: name || `לקוח ${no}`,
        address,
        addressesCount: address ? 1 : 0,
        phone: "",
        contactName: "",
        preferredDriver: g(row, "נהג"),
        notesCount: 1,
        ordersCount: 0,
        visitsCount: 0,
        firstIso: dateIso,
        lastIso: dateIso,
        avgSiteMin: null,
        openInquiries: 0,
      });
    } else {
      existing.notesCount += 1;
      if (name) existing.name = name;
      if (address) existing.address = address;
      if (dateIso && (!existing.firstIso || dateIso < existing.firstIso)) existing.firstIso = dateIso;
      if (dateIso && dateIso > existing.lastIso) existing.lastIso = dateIso;
    }
  }
  for (const row of raw.customers) {
    const no = (g(row, "מס' לקוח") || g(row, "מספר לקוח") || "").replace(/\.0+$/, "");
    if (!no) continue;
    const existing = out.get(no) || {
      customerNo: no,
      name: `לקוח ${no}`,
      address: "",
      addressesCount: 0,
      phone: "",
      contactName: "",
      preferredDriver: "",
      notesCount: 0,
      ordersCount: 0,
      visitsCount: 0,
      firstIso: "",
      lastIso: "",
      avgSiteMin: null,
      openInquiries: 0,
    };
    existing.name = g(row, "שם לקוח") || g(row, "שם") || existing.name;
    existing.phone = g(row, "טלפון") || existing.phone;
    existing.contactName = g(row, "איש קשר") || existing.contactName;
    existing.address = g(row, "כתובת") || existing.address;
    out.set(no, existing);
  }
  return out;
}
