/**
 * טוען תיק לקוח מלא מכל טאבי הגיליון.
 * lat/lng מעמודות M/N באתרי_לקוחות.
 * PTO/מנוף: איתוראן_PTO + סשנים_PTO + ארכיון (זמני מנוף).
 */
import { readGoogleSheetBatch, MASTER_SHEET_ID } from "./smart-dispatch/sheets-integration";
import { toIso } from "./he-date";

const TABS = {
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

type Row = Record<string, string>;

const normHeader = (h: string) => h.replace(/\u200f|\u200e/g, "").trim();

const g = (row: Row, ...keys: string[]) => {
  for (const k of keys) {
    const v = row[normHeader(k)] ?? row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  // fuzzy
  const lowerKeys = keys.map((k) => normHeader(k).toLowerCase());
  for (const [hk, hv] of Object.entries(row)) {
    if (lowerKeys.includes(hk.toLowerCase()) && hv) return String(hv).trim();
  }
  return "";
};

const num = (v: string | number | null | undefined): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(/[^\d.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const parseCoord = (v: string): number | null => {
  if (!v) return null;
  const n = parseFloat(String(v).replace(/[^\d.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const isIsraelCoord = (lat: number, lon: number) =>
  lat >= 29.4 && lat <= 33.5 && lon >= 34.2 && lon <= 35.9;

type Raw = Record<keyof typeof TABS, Row[]>;

async function readTab(name: string): Promise<Row[]> {
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
    else out.push({ no: "", name: p });
  }
  return out;
}

function parseCraneMin(text: string): number | null {
  const m = String(text || "").match(/\((\d+)\s*דק/) || String(text || "").match(/(\d+)\s*דק/);
  return m ? parseInt(m[1]!, 10) : null;
}

function mapNote(row: Row): HNote {
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
  };
}

function mapOrder(row: Row): HOrder {
  return {
    id: g(row, "מס' הזמנה") || g(row, "הזמנה"),
    dateIso: toIso(g(row, "תאריך")),
    customerNo: (g(row, "מס' לקוח") || g(row, "מספר לקוח") || "").replace(/\.0+$/, ""),
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

function mapVisit(row: Row): HVisit {
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

function buildIndex(raw: Raw): Map<string, CustomerSummary> {
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
  const nameKey = (summary?.name || "")
    .toLowerCase()
    .replace(/["'״׳.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const notes = raw.notes
    .filter((r) => {
      const no = (g(r, "מס' לקוח") || "").replace(/\.0+$/, "");
      if (no && no === customerNo) return true;
      if (nameKey) {
        const on = (g(r, "שם לקוח") || "")
          .toLowerCase()
          .replace(/["'״׳.,]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (on && (on === nameKey || on.includes(nameKey) || nameKey.includes(on))) return true;
      }
      return false;
    })
    .map(mapNote)
    .filter((n) => n.id && !seen.has(n.id) && !!seen.add(n.id))
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso));

  const ituranVisits = raw.ituranVisits
    .filter((r) => (g(r, "מס' לקוח") || "").replace(/\.0+$/, "") === customerNo)
    .map(mapIturanVisit)
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso));

  const orders = raw.orders
    .filter((r) => {
      const no = (g(r, "מס' לקוח") || g(r, "מספר לקוח") || "").replace(/\.0+$/, "");
      if (no && no === customerNo) return true;
      if (nameKey) {
        const on = (g(r, "שם לקוח") || g(r, "לקוח") || "")
          .toLowerCase()
          .replace(/["'״׳.,]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (on && (on === nameKey || on.includes(nameKey) || nameKey.includes(on))) return true;
      }
      return false;
    })
    .map(mapOrder)
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso));

  const visits = raw.visits
    .filter((r) => customerTokens(g(r, "לקוחות")).some((c) => c.no === customerNo))
    .map(mapVisit)
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso));

  const sites: HSite[] = raw.sites
    .filter((r) => (g(r, "מס' לקוח") || "").replace(/\.0+$/, "") === customerNo)
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

  const noteIds = new Set(notes.map((n) => n.id));
  const inquiries: HInquiry[] = raw.inquiries
    .filter(
      (r) =>
        (g(r, "מס' לקוח") || "").replace(/\.0+$/, "") === customerNo ||
        notes.some((n) => n.id === g(r, "מס' תעודה")),
    )
    .map((r) => ({
      noteId: g(r, "מס' תעודה"),
      reason: g(r, "סיבה"),
      reply: g(r, "תשובה"),
      status: g(r, "סטטוס"),
      updatedIso: toIso(g(r, "updatedAt") || g(r, "תאריך")),
      fileUrl: g(r, "כתובת הקובץ (URL)"),
    }));

  const checks: HCheck[] = raw.checks
    .filter((r) => noteIds.has(g(r, "מספר תעודה")))
    .map((r) => ({
      dateIso: toIso(g(r, "תאריך")),
      noteId: g(r, "מספר תעודה"),
      approver: g(r, "מאשר"),
      checkId: g(r, "מזהה בדיקה"),
      result: g(r, "אסמכתא / תוצאת בדיקה"),
    }));

  const stopSamples = notes.map((n) => n.itStop).filter((x): x is number => x != null && x > 0);
  for (const s of sites) {
    if (s.medianMin != null && s.medianMin > 0) stopSamples.push(s.medianMin);
  }
  const avgSiteMin = stopSamples.length
    ? Math.round(stopSamples.reduce((a, b) => a + b, 0) / stopSamples.length)
    : null;
  const openInquiries = inquiries.filter((i) => !/סגור|closed|done|הושלם/i.test(i.status)).length;
  const cust: CustomerSummary = {
    ...(summary ?? empty),
    notesCount: notes.length,
    ordersCount: orders.length,
    visitsCount: visits.length + ituranVisits.length,
    avgSiteMin,
    openInquiries,
  };

  const addrTokens = new Set(
    notes
      .flatMap((n) => [n.address, n.customerName])
      .join(" ")
      .toLowerCase()
      .replace(/[^\u0590-\u05FFa-z0-9\s]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3),
  );

  function rowMatchesCustomer(r: Row): boolean {
    const no = (g(r, "מס' לקוח") || g(r, "מספר לקוח") || g(r, "customerNo") || "").replace(/\.0+$/, "");
    if (no && no === customerNo) return true;
    const doc = (g(r, "מס' תעודה") || g(r, "docId") || g(r, "docNumber") || g(r, "noteId") || "").replace(
      /\.0+$/,
      "",
    );
    if (doc && noteIds.has(doc)) return true;
    const addr = (g(r, "כתובת") || g(r, "address") || "").toLowerCase();
    if (addr && [...addrTokens].some((tok) => addr.includes(tok))) return true;
    return false;
  }

  function mapPtoRow(r: Row, source: string): HPtoSession | null {
    const open =
      g(r, "eventTimeIso") ||
      g(r, "PTO פתיחה") ||
      g(r, "ptoOpen") ||
      g(r, "openTime") ||
      g(r, "שעת פתיחה") ||
      g(r, "eventTime");
    const close = g(r, "PTO סגירה") || g(r, "ptoClose") || g(r, "closeTime") || g(r, "שעת סגירה");
    const duration = num(
      g(r, "PTO משך (דק׳)") || g(r, "PTO דק׳") || g(r, "ptoDurationMin") || g(r, "ptoMin") || g(r, "durationMin"),
    );
    const eventType = g(r, "eventType") || g(r, "סוג") || "";
    if (!open && !close && duration == null) return null;
    return {
      eventTimeIso: open || close || "",
      openTime: open || undefined,
      closeTime: close || undefined,
      durationMin: duration,
      truck: g(r, "truck") || g(r, "משאית") || g(r, "רכב") || "",
      driver: g(r, "driver") || g(r, "נהג") || "",
      address: g(r, "address") || g(r, "כתובת") || "",
      noteId: (g(r, "docId") || g(r, "מס' תעודה") || g(r, "noteId") || "").replace(/\.0+$/, ""),
      eventType: eventType || undefined,
      source,
    };
  }

  const collected: HPtoSession[] = [];
  for (const r of raw.pto || []) {
    if (!rowMatchesCustomer(r)) continue;
    const s = mapPtoRow(r, "איתוראן_PTO");
    if (s) collected.push(s);
  }
  for (const r of raw.ptoSheetSessions || []) {
    if (!rowMatchesCustomer(r)) continue;
    const s = mapPtoRow(r, "סשנים_PTO");
    if (s) collected.push(s);
  }
  for (const v of ituranVisits) {
    if (v.ptoMin != null && v.ptoMin > 0) {
      collected.push({
        eventTimeIso: v.arrival || v.dateIso,
        openTime: v.arrival,
        closeTime: v.departure,
        durationMin: v.ptoMin,
        truck: v.truck,
        driver: v.driver,
        address: v.address,
        noteId: v.noteId,
        source: "איתוראן_ביקורים",
      });
    }
  }
  for (const v of visits) {
    if (v.ptoMin != null && v.ptoMin > 0) {
      collected.push({
        eventTimeIso: v.dateIso,
        durationMin: v.ptoMin,
        truck: v.truck,
        driver: v.driver,
        address: v.address,
        noteId: (v.noteIds && v.noteIds[0]) || "",
        source: "היסטוריית_ביקורים",
      });
    }
  }
  for (const n of notes) {
    if (!n.craneNotes && n.craneMin == null) continue;
    const m = String(n.craneNotes || "").match(/(\d{1,2}:\d{2})\s*[–\-−]\s*(\d{1,2}:\d{2})/);
    collected.push({
      eventTimeIso: m ? `${n.dateIso}T${m[1]}` : n.dateIso,
      openTime: m ? m[1] : undefined,
      closeTime: m ? m[2] : undefined,
      durationMin: n.craneMin ?? null,
      truck: n.truck,
      driver: n.driver,
      address: n.address,
      noteId: n.id,
      eventType: "crane_from_note",
      source: "ארכיון_תעודות_גליה",
    });
  }

  const ptoSeen = new Set<string>();
  const ptoSessions = collected
    .filter((s) => {
      const k = `${s.noteId}|${s.openTime || s.eventTimeIso}|${s.durationMin ?? ""}`;
      if (ptoSeen.has(k)) return false;
      ptoSeen.add(k);
      return true;
    })
    .sort((a, b) => String(b.eventTimeIso).localeCompare(String(a.eventTimeIso)));

  return {
    customer: cust,
    notes,
    orders,
    ituranVisits,
    visits,
    sites,
    inquiries,
    checks,
    ptoSessions,
    generatedAt: new Date().toISOString(),
  };
}

export async function loadSiteAtlas() {
  const raw = await loadRaw();
  const visitsBySite = new Map<string, HVisit[]>();
  const customersBySite = new Map<string, { no: string; name: string }>();
  for (const row of raw.visits) {
    const visit = mapVisit(row);
    const key = visit.siteKey || `${visit.city}|${visit.address}`;
    if (!visit.address || !key) continue;
    if (!visitsBySite.has(key)) visitsBySite.set(key, []);
    visitsBySite.get(key)!.push(visit);
    for (const c of customerTokens(g(row, "לקוחות"))) {
      if (c.no) customersBySite.set(key, { no: c.no, name: c.name });
    }
  }

  const sites: AtlasSite[] = [];
  for (const row of raw.sites) {
    const siteKey = g(row, "מפתח אתר");
    const address = g(row, "כתובת אספקה") || g(row, "כתובת");
    const city = g(row, "עיר");
    if (!address) continue;
    const key = siteKey || `${city}|${address}`;
    const history = (visitsBySite.get(key) || []).sort((a, b) => b.dateIso.localeCompare(a.dateIso));
    let latitude =
      parseCoord(g(row, "lat")) ??
      parseCoord(g(row, "Lat")) ??
      parseCoord(g(row, "latitude")) ??
      parseCoord(g(row, "קו רוחב"));
    let longitude =
      parseCoord(g(row, "lng")) ??
      parseCoord(g(row, "Lng")) ??
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
    cities: [...cityCounts]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    mappedCount: sites.filter((s) => s.latitude != null && s.longitude != null).length,
    generatedAt: new Date().toISOString(),
  };
}
