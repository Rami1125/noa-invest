/**
 * טוען תיק לקוח מלא מכל טאבי הגיליון.
 * lat/lng מעמודות M/N באתרי_לקוחות.
 */
import { readGoogleSheetBatch, MASTER_SHEET_ID } from "./smart-dispatch/sheets-integration";
import { toIso } from "./he-date";

const TABS = {
  customers: "לקוחות",
  notes: "ארכיון_תעודות_גליה",
  orders: "הזמנות_פתוחות",
  visits: "היסטוריית_ביקורים",
  ituranVisits: "איתוראן_ביקורים",
  sites: "אתרי_לקוחות",
  inquiries: "בירורים",
  checks: "בדיקות",
} as const;

export type HNote = {
  id: string; dateIso: string; customerNo: string; customerName: string; address: string;
  driver: string; truck: string; itemsText: string; status: string;
};
export type HOrder = {
  id: string; dateIso: string; customerNo: string; address: string; status: string; noteId: string;
};
export type HVisit = {
  key: string; dateIso: string; truck: string; driver: string; city: string; address: string; noteIds: string[];
  orderIds: string[]; craneRaw: string; unloadMin: number | null; waitMin: number | null; ituranMin: number | null;
  ptoMin: number | null; driveMin: number | null; siteMin: number | null; source: string; flags: string; siteKey: string;
};
export type HIturanVisit = {
  id: string; noteId: string; dateIso: string; address: string; driver: string; truck: string;
  arrival: string; departure: string; stayMin: number | null; ptoMin: number | null;
};
export type HSite = {
  siteKey: string; address: string; visits: number; lastIso: string; samples: number;
  medianMin: number | null; p80Min: number | null; maxMin: number | null; confidence: string;
};
export type AtlasSite = HSite & {
  city: string; customerNo: string; customerName: string; latitude: number | null; longitude: number | null;
  ptoOpens: number;
  ptoTotalMin: number;
  visitHistory: Array<{
    dateIso: string; truck: string; driver: string; notes: string[]; orders: string[];
    durationMin: number | null; ptoMin: number | null;
  }>;
};
export type HInquiry = { noteId: string; reason: string; reply: string; status: string; updatedIso: string; fileUrl: string };
export type HCheck = { dateIso: string; noteId: string; approver: string; checkId: string; result: string };

export type CustomerSummary = {
  customerNo: string; name: string; address: string; addressesCount: number; phone: string; contactName: string;
  preferredDriver: string; notesCount: number; ordersCount: number; visitsCount: number;
  firstIso: string; lastIso: string; avgSiteMin: number | null; openInquiries: number;
};

export type CustomerHistory = {
  customer: CustomerSummary; notes: HNote[]; orders: HOrder[]; ituranVisits: HIturanVisit[]; visits: HVisit[];
  sites: HSite[]; inquiries: HInquiry[]; checks: HCheck[]; generatedAt: string;
};

type Row = Record<string, string>;
const normHeader = (h: string) => h.replace(/[׳'’\"״`]/g, "").replace(/\s+/g, " ").trim();
const g = (r: Row, name: string) => r[normHeader(name)] ?? "";
const num = (v: string): number | null => {
  const n = parseFloat(String(v || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const parseCoord = (v: string): number | null => {
  if (v == null || String(v).trim() === "") return null;
  const s = String(v).trim().replace(/,/g, ".");
  const n = parseFloat(s.replace(/[^\d.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const isIsraelCoord = (lat: number, lon: number) =>
  lat >= 29.4 && lat <= 33.5 && lon >= 34.2 && lon <= 35.9;

type Raw = Record<keyof typeof TABS, Row[]>;

async function readTab(name: string): Promise<Row[]> {
  try {
    // readGoogleSheetBatch מחזיר values[][] ישירות — לא { values }
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
      // גיבוי עמודות M/N (אינדקס 12/13) אם הכותרת לא lat/lng
      if (!o["lat"] && row[12] != null && String(row[12]).trim() !== "") {
        o["lat"] = String(row[12]).trim();
      }
      if (!o["lng"] && row[13] != null && String(row[13]).trim() !== "") {
        o["lng"] = String(row[13]).trim();
      }
      return o;
    });
  } catch {
    return [];
  }
}

async function loadRaw(): Promise<Raw> {
  const keys = Object.keys(TABS) as (keyof typeof TABS)[];
  const rows = await Promise.all(keys.map((k) => readTab(TABS[k])));
  const out = {} as Raw;
  keys.forEach((k, i) => {
    out[k] = rows[i]!;
  });
  return out;
}

function customerTokens(raw: string): Array<{ no: string; name: string }> {
  if (!raw) return [];
  const parts = raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  const out: Array<{ no: string; name: string }> = [];
  for (const p of parts) {
    const m = p.match(/(\d{4,})\s*[-–]?\s*(.*)/);
    if (m) out.push({ no: m[1]!, name: (m[2] || "").trim() });
  }
  return out;
}

function mapVisit(row: Row): HVisit {
  return {
    key: g(row, "מפתח") || `${g(row, "תאריך")}|${g(row, "כתובת")}`,
    dateIso: toIso(g(row, "תאריך")),
    truck: g(row, "משאית") || g(row, "מספר משאית"),
    driver: g(row, "נהג"),
    city: g(row, "עיר"),
    address: g(row, "כתובת"),
    noteIds: g(row, "תעודות").split(/[,;\s]+/).filter(Boolean),
    orderIds: g(row, "הזמנות").split(/[,;\s]+/).filter(Boolean),
    craneRaw: g(row, "מנוף"),
    unloadMin: num(g(row, "פריקה דק")),
    waitMin: num(g(row, "המתנה דק")),
    ituranMin: num(g(row, "איתוראן דק")),
    ptoMin: num(g(row, "PTO דק") || g(row, "משך PTO")),
    driveMin: num(g(row, "נסיעה דק")),
    siteMin: num(g(row, "באתר דק") || g(row, "משך באתר")),
    source: g(row, "מקור"),
    flags: g(row, "דגלים"),
    siteKey: g(row, "מפתח אתר"),
  };
}

function mapNote(row: Row): HNote {
  return {
    id: g(row, "מס' תעודה") || g(row, "מספר תעודה"),
    dateIso: toIso(g(row, "תאריך תעודה") || g(row, "תאריך")),
    customerNo: g(row, "מס' לקוח"),
    customerName: g(row, "שם לקוח"),
    address: g(row, "כתובת אספקה") || g(row, "כתובת"),
    driver: g(row, "נהג"),
    truck: g(row, "משאית"),
    itemsText: g(row, "פריטים") || g(row, "פירוט"),
    status: g(row, "סטטוס"),
  };
}

function mapOrder(row: Row): HOrder {
  return {
    id: g(row, "מס' הזמנה") || g(row, "הזמנה"),
    dateIso: toIso(g(row, "תאריך")),
    customerNo: g(row, "מס' לקוח"),
    address: g(row, "כתובת"),
    status: g(row, "סטטוס"),
    noteId: g(row, "מס' תעודה"),
  };
}

function mapIturanVisit(row: Row): HIturanVisit {
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

function buildIndex(raw: Raw): Map<string, CustomerSummary> {
  const out = new Map<string, CustomerSummary>();
  for (const row of raw.notes) {
    const no = g(row, "מס' לקוח");
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
      existing.notesCount++;
      if (dateIso && dateIso > existing.lastIso) existing.lastIso = dateIso;
      if (dateIso && (!existing.firstIso || dateIso < existing.firstIso)) existing.firstIso = dateIso;
      if (name) existing.name = name;
      if (address) existing.address = address;
    }
  }
  return out;
}

export async function loadCustomerIndex() {
  const raw = await loadRaw();
  const customers = [...buildIndex(raw).values()].sort((a, b) => b.lastIso.localeCompare(a.lastIso));
  return { customers, source: "גיליון", generatedAt: new Date().toISOString() };
}

export async function loadCustomerHistory(customerNo: string): Promise<CustomerHistory> {
  const raw = await loadRaw();
  const summary = buildIndex(raw).get(customerNo);
  const empty: CustomerSummary = {
    customerNo,
    name: `לקוח ${customerNo}`,
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
  const seen = new Set<string>();
  const notes = raw.notes
    .filter((r) => g(r, "מס' לקוח") === customerNo)
    .map(mapNote)
    .filter((n) => n.id && !seen.has(n.id) && !!seen.add(n.id))
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso));
  const ituranVisits = raw.ituranVisits
    .filter((r) => g(r, "מס' לקוח") === customerNo)
    .map(mapIturanVisit)
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso));
  const orders = raw.orders
    .filter((r) => g(r, "מס' לקוח") === customerNo)
    .map(mapOrder)
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso));
  const visits = raw.visits
    .filter((r) => customerTokens(g(r, "לקוחות")).some((c) => c.no === customerNo))
    .map(mapVisit)
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso));
  const sites: HSite[] = raw.sites
    .filter((r) => g(r, "מס' לקוח") === customerNo)
    .map((r) => ({
      siteKey: g(r, "מפתח אתר"),
      address: g(r, "כתובת"),
      visits: num(g(r, "כמות ביקורים")) ?? 0,
      lastIso: toIso(g(r, "תאריך ביקור אחרון")),
      samples: num(g(r, "מדידות")) ?? 0,
      medianMin: num(g(r, "P50 משך באתר")),
      p80Min: num(g(r, "P80 תכנון בטוח")),
      maxMin: num(g(r, "מקסימום דקות")),
      confidence: g(r, "רמת ביטחון"),
    }));
  const inquiries: HInquiry[] = raw.inquiries
    .filter((r) => g(r, "מס' לקוח") === customerNo || notes.some((n) => n.id === g(r, "מס' תעודה")))
    .map((r) => ({
      noteId: g(r, "מס' תעודה"),
      reason: g(r, "סיבה"),
      reply: g(r, "תשובה"),
      status: g(r, "סטטוס"),
      updatedIso: toIso(g(r, "updatedAt") || g(r, "תאריך")),
      fileUrl: g(r, "כתובת הקובץ (URL)"),
    }));
  const noteIds = new Set(notes.map((n) => n.id));
  const checks: HCheck[] = raw.checks
    .filter((r) => noteIds.has(g(r, "מספר תעודה")))
    .map((r) => ({
      dateIso: toIso(g(r, "תאריך")),
      noteId: g(r, "מספר תעודה"),
      approver: g(r, "מאשר"),
      checkId: g(r, "מזהה בדיקה"),
      result: g(r, "אסמכתא / תוצאת בדיקה"),
    }));
  return {
    customer: summary ?? empty,
    notes,
    orders,
    ituranVisits,
    visits,
    sites,
    inquiries,
    checks,
    generatedAt: new Date().toISOString(),
  };
}

/** אטלס אתרים למפה — lat/lng מעמודות M/N */
export async function loadSiteAtlas() {
  const raw = await loadRaw();
  const visitsBySite = new Map<string, HVisit[]>();
  const customersBySite = new Map<string, { no: string; name: string }>();
  for (const row of raw.visits) {
    const visit = mapVisit(row);
    const key = visit.siteKey || `${visit.city}|${visit.address}`;
    if (!visit.address || !key) continue;
    visitsBySite.set(key, [...(visitsBySite.get(key) || []), visit]);
    const firstCustomer = customerTokens(g(row, "לקוחות"))[0];
    if (firstCustomer && !customersBySite.has(key)) customersBySite.set(key, firstCustomer);
  }

  const sites: AtlasSite[] = [];
  for (const row of raw.sites) {
    const siteKey = g(row, "מפתח אתר");
    const address = g(row, "כתובת");
    const city = g(row, "עיר");
    if (!address) continue;
    const key = siteKey || `${city}|${address}`;
    const history = (visitsBySite.get(key) || []).sort((a, b) => b.dateIso.localeCompare(a.dateIso));
    let latitude =
      parseCoord(g(row, "lat")) ??
      parseCoord(g(row, "Lat")) ??
      parseCoord(g(row, "LAT")) ??
      parseCoord(g(row, "latitude")) ??
      parseCoord(g(row, "קו רוחב"));
    let longitude =
      parseCoord(g(row, "lng")) ??
      parseCoord(g(row, "Lng")) ??
      parseCoord(g(row, "LNG")) ??
      parseCoord(g(row, "lon")) ??
      parseCoord(g(row, "longitude")) ??
      parseCoord(g(row, "קו אורך"));
    if (latitude != null && longitude != null) {
      if ((latitude === 0 && longitude === 0) || !isIsraelCoord(latitude, longitude)) {
        latitude = null;
        longitude = null;
      }
    }
    const ptoHistory = history.filter((v) => v.ptoMin != null && v.ptoMin > 0);
    const ptoTotalMin = ptoHistory.reduce((s, v) => s + (v.ptoMin || 0), 0);
    sites.push({
      siteKey,
      address,
      city,
      customerNo: g(row, "מס' לקוח") || customersBySite.get(key)?.no || "",
      customerName: g(row, "שם לקוח") || customersBySite.get(key)?.name || "",
      visits: num(g(row, "כמות ביקורים") || g(row, "ביקורים")) ?? history.length,
      lastIso: toIso(g(row, "תאריך ביקור אחרון") || g(row, "ביקור אחרון")),
      samples: num(g(row, "מדידות")) ?? history.filter((v) => v.siteMin != null).length,
      medianMin: num(g(row, "P50 משך באתר") || g(row, "באתר חציון (דק׳)")),
      p80Min: num(g(row, "P80 תכנון בטוח") || g(row, "באתר P80 (דק׳)")),
      maxMin: num(g(row, "מקסימום דקות") || g(row, "באתר מקס׳ (דק׳)")),
      confidence: g(row, "רמת ביטחון") || g(row, "ביטחון"),
      latitude,
      longitude,
      ptoOpens: ptoHistory.length,
      ptoTotalMin,
      visitHistory: history.map((v) => ({
        dateIso: v.dateIso,
        truck: v.truck,
        driver: v.driver,
        notes: v.noteIds,
        orders: v.orderIds,
        durationMin: v.siteMin ?? v.ituranMin,
        ptoMin: v.ptoMin,
      })),
    });
  }

  const cityCounts = new Map<string, number>();
  for (const site of sites) {
    if (site.city) cityCounts.set(site.city, (cityCounts.get(site.city) || 0) + site.visits);
  }
  return {
    sites: sites.sort((a, b) => b.visits - a.visits),
    cityCount: cityCounts.size,
    cities: [...cityCounts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    mappedCount: sites.filter((s) => s.latitude != null && s.longitude != null).length,
    generatedAt: new Date().toISOString(),
  };
}
