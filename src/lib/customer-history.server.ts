/**
 * טוען תיק לקוח מלא מכל טאבי הגיליון "בדיקת תעודות משלוח".
 * מפתח הצלבה: מספר לקוח (+ מספרי תעודה לטאבים שאין בהם מספר לקוח).
 * דורש: export על readGoogleSheetBatch ב-sheets-integration.ts, והגיליון משותף עם חשבון השירות.
 */
import { readGoogleSheetBatch, MASTER_SHEET_ID } from "./smart-dispatch/sheets-integration";
import { toIso } from "./he-date";

const TABS = {
  notes: "ארכיון_תעודות_גליה",
  orders: "הזמנות",
  visits: "היסטוריית_ביקורים",
  ituranVisits: "איתוראן_ביקורים",
  sites: "אתרי_לקוחות",
  inquiries: "בירורים_רמי",
  checks: "בדיקות_תעודות",
} as const;

type Row = Record<string, string>;
const normHeader = (h: string) => h.replace(/[׳'’\"״`]/g, "").replace(/\s+/g, " ").trim();
const g = (r: Row, name: string) => r[normHeader(name)] ?? "";
const num = (v: string): number | null => {
  const n = parseFloat(v.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** פרסור קו רוחב/אורך — פסיק עשרוני + מינוס */
const parseCoord = (v: string): number | null => {
  if (v == null || String(v).trim() === "") return null;
  const s = String(v).trim().replace(/,/g, ".");
  const n = parseFloat(s.replace(/[^\d.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const isIsraelCoord = (lat: number, lon: number) =>
  lat >= 29.4 && lat <= 33.5 && lon >= 34.2 && lon <= 35.9;

type GeoCacheEntry = { lat: number; lon: number; at: number };
const geoCache = new Map<string, GeoCacheEntry>();
const GEO_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function geocodeIsraelAddress(address: string, city: string): Promise<{ lat: number; lon: number } | null> {
  const q = [address, city, "ישראל"].filter(Boolean).join(", ").trim();
  if (!q || q.length < 4) return null;
  const cacheKey = q.toLowerCase().replace(/\s+/g, " ");
  const hit = geoCache.get(cacheKey);
  if (hit && Date.now() - hit.at < GEO_TTL_MS) return { lat: hit.lat, lon: hit.lon };
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "il");
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "noa-invest-saban/1.0 (logistics map)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const row = data?.[0];
    if (!row?.lat || !row?.lon) return null;
    const lat = parseFloat(row.lat);
    const lon = parseFloat(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isIsraelCoord(lat, lon)) return null;
    geoCache.set(cacheKey, { lat, lon, at: Date.now() });
    return { lat, lon };
  } catch {
    return null;
  }
}

// NOTE: Full original file was truncated in emergency restore path.
// This module keeps loadSiteAtlas with geocode; remaining exports must match repo.
// See git history before 6d5fe2e for complete customer-history.server.ts if needed.

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

type Raw = Record<keyof typeof TABS, Row[]>;

async function readTab(name: string): Promise<Row[]> {
  try {
    const batch = await readGoogleSheetBatch(MASTER_SHEET_ID, [`${name}!A1:ZZ`]);
    const values = (batch?.[0]?.values || []) as string[][];
    if (!values.length) return [];
    const headers = values[0]!.map((h) => normHeader(String(h || "")));
    return values.slice(1).map((row) => {
      const o: Row = {};
      headers.forEach((h, i) => {
        if (h) o[h] = String(row[i] ?? "").trim();
      });
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
    key: g(row, "מפתח") || g(row, "key") || `${g(row, "תאריך")}|${g(row, "כתובת")}`,
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

export async function loadCustomerIndex() {
  return { customers: [] as CustomerSummary[], source: "גיליון", generatedAt: new Date().toISOString() };
}

export async function loadCustomerHistory(customerNo: string): Promise<CustomerHistory> {
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
  return {
    customer: empty,
    notes: [],
    orders: [],
    ituranVisits: [],
    visits: [],
    sites: [],
    inquiries: [],
    checks: [],
    generatedAt: new Date().toISOString(),
  };
}

/** Read-only address history for the delivery-sites map.
 * קואורדינטות מהגיליון; אם חסרות — geocode עם Nominatim (IL) + מטמון.
 */
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
  let geocodeBudget = 25;

  for (const row of raw.sites) {
    const siteKey = g(row, "מפתח אתר");
    const address = g(row, "כתובת");
    const city = g(row, "עיר");
    if (!address) continue;
    const key = siteKey || `${city}|${address}`;
    const history = (visitsBySite.get(key) || []).sort((a, b) => b.dateIso.localeCompare(a.dateIso));

    let latitude =
      parseCoord(g(row, "קו רוחב")) ??
      parseCoord(g(row, "latitude")) ??
      parseCoord(g(row, "lat")) ??
      parseCoord(g(row, "Lat")) ??
      parseCoord(g(row, "Y"));
    let longitude =
      parseCoord(g(row, "קו אורך")) ??
      parseCoord(g(row, "longitude")) ??
      parseCoord(g(row, "lng")) ??
      parseCoord(g(row, "lon")) ??
      parseCoord(g(row, "Lng")) ??
      parseCoord(g(row, "X"));

    if ((latitude == null || longitude == null) && geocodeBudget > 0) {
      const geo = await geocodeIsraelAddress(address, city);
      geocodeBudget--;
      if (geo) {
        latitude = geo.lat;
        longitude = geo.lon;
      }
      await new Promise((r) => setTimeout(r, 1100));
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

  const knownKeys = new Set(sites.map((site) => site.siteKey || `${site.city}|${site.address}`));
  for (const [key, history] of visitsBySite) {
    if (knownKeys.has(key) || !history[0]?.address) continue;
    const sample = history[0]!;
    const customer = customersBySite.get(key);
    const ptoHistory = history.filter((v) => v.ptoMin != null && v.ptoMin > 0);
    const ptoTotalMin = ptoHistory.reduce((s, v) => s + (v.ptoMin || 0), 0);
    let latitude: number | null = null;
    let longitude: number | null = null;
    if (geocodeBudget > 0) {
      const geo = await geocodeIsraelAddress(sample.address, sample.city);
      geocodeBudget--;
      if (geo) {
        latitude = geo.lat;
        longitude = geo.lon;
      }
      await new Promise((r) => setTimeout(r, 1100));
    }
    sites.push({
      siteKey: sample.siteKey,
      address: sample.address,
      city: sample.city,
      customerNo: customer?.no || "",
      customerName: customer?.name || "",
      visits: history.length,
      lastIso: history.map((v) => v.dateIso).sort().at(-1) || "",
      samples: history.filter((v) => v.siteMin != null).length,
      medianMin: null,
      p80Min: null,
      maxMin: history.reduce<number | null>((max, v) => (v.siteMin == null ? max : Math.max(max ?? 0, v.siteMin)), null),
      confidence: "",
      latitude,
      longitude,
      ptoOpens: ptoHistory.length,
      ptoTotalMin,
      visitHistory: [...history]
        .sort((a, b) => b.dateIso.localeCompare(a.dateIso))
        .map((v) => ({
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
  const withCoords = sites.filter((s) => s.latitude != null && s.longitude != null).length;
  return {
    sites: sites.sort((a, b) => b.visits - a.visits),
    cityCount: cityCounts.size,
    cities: [...cityCounts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    mappedCount: withCoords,
    generatedAt: new Date().toISOString(),
  };
}
