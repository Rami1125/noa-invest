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
  ituranVisits: "ביקורים_איתוראן",
  visits: "היסטוריית_ביקורים",
  sites: "אתרי_לקוחות",
  inquiries: "בירור_ראמי",
  checks: "בקרת_לוגיסטיקה",
} as const;

/* ------------------------------ טיפוסים ------------------------------ */

export type Line = { sku: string; name: string; qty: number; unit: string; kind: "product" | "deposit" | "delivery" };

export type HNote = {
  id: string; orderId: string; dateIso: string; time: string; address: string; driver: string; truck: string;
  items: Line[]; depositsText: string; craneText: string; approval: string; signedUrl: string;
  siteMin: number | null; ituranMin: number | null; source: string; ramiAt: string; harelAt: string;
};
export type HOrder = {
  id: string; dateIso: string; dateRaw: string; time: string; contact: string; phone: string; address: string;
  yard: string; driver: string; itemsText: string; weightTons: number | null; bales: string; pallets: string;
  noteId: string; status: string; wazeUrl: string; remarks: string;
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
  /** כמה פעמים נפתח מנוף בכתובת (מתוך היסטוריית_ביקורים / PTO משך) */
  ptoOpens: number;
  /** סה\"כ דקות PTO מצטברות בכתובת */
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

/* ------------------------------ קריאה ------------------------------ */

type Row = Record<string, string>;
const normHeader = (h: string) => h.replace(/[׳'’\"״`]/g, "").replace(/\s+/g, " ").trim();
const g = (r: Row, name: string) => r[normHeader(name)] ?? "";
const num = (v: string): number | null => {
  const n = parseFloat(v.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

async function readTab(tab: string): Promise<Row[]> {
  const raw = await readGoogleSheetBatch(MASTER_SHEET_ID, `'${tab}'!A1:AZ3000`);
  if (raw === null) throw new Error("חשבון שירות Google לא מוגדר בשרת (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY)");
  if (raw.length < 2) return [];
  const headers = (raw[0] as unknown[]).map((h) => normHeader(String(h ?? "")));
  return raw
    .slice(1)
    .map((cells) => {
      const o: Row = {};
      headers.forEach((h, i) => {
        if (h && !(h in o)) o[h] = String((cells as unknown[])[i] ?? "").trim();
      });
      return o;
    })
    .filter((o) => Object.values(o).some(Boolean));
}

type Raw = Record<keyof typeof TABS, Row[]>;
let cache: { at: number; raw: Raw } | null = null;

async function loadRaw(): Promise<Raw> {
  if (cache && Date.now() - cache.at < 60_000) return cache.raw;
  const keys = Object.keys(TABS) as (keyof typeof TABS)[];
  const rows = await Promise.all(keys.map((k) => readTab(TABS[k])));
  const raw = Object.fromEntries(keys.map((k, i) => [k, rows[i]])) as Raw;
  cache = { at: Date.now(), raw };
  return raw;
}

/* ------------------------------ פענוח ------------------------------ */

function parseItems(text: string): Line[] {
  return text
    .split("\n")
    .map((l) => l.split("|").map((x) => x.trim()))
    .filter((p) => p.length >= 3 && p[1])
    .map((p) => ({
      sku: p[0],
      name: p[1],
      qty: Number(p[2]) || 0,
      unit: p[3] || "",
      kind: p[0].startsWith("60") ? ("deposit" as const) : p[1].startsWith("הובלת") ? ("delivery" as const) : ("product" as const),
    }));
}

const customerTokens = (text: string) =>
  text
    .split(/[;\n]/)
    .map((t) => t.trim().match(/^(\d{4,})\s*(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ no: m[1], name: m[2] }));

const isOpenInquiry = (st: string) => !!st && !/approved|done|closed|resolved|אושר|נסגר/i.test(st);

function mapNote(r: Row): HNote {
  return {
    id: g(r, "מס' תעודת משלוח"), orderId: g(r, "מס' הזמנה"), dateIso: toIso(g(r, "תאריך תעודה")), time: g(r, "שעת תעודה"),
    address: g(r, "כתובת אספקה"), driver: g(r, "נהג"), truck: g(r, "רישוי / משאית"),
    items: parseItems(g(r, "פריטים")), depositsText: g(r, "פיקדונות"), craneText: g(r, "זמני מנוף / המתנה"),
    approval: g(r, "סטטוס אישור"), signedUrl: g(r, "קישור חתום"),
    siteMin: num(g(r, "משך באתר (דק׳)")), ituranMin: num(g(r, "שהייה איתוראן דק׳")), source: g(r, "מקור מדידה"),
    ramiAt: g(r, "אישור ראמי"), harelAt: g(r, "אישור הראל"),
  };
}

function mapOrder(r: Row): HOrder {
  const contactRaw = g(r, "איש קשר וטלפון");
  const phone = contactRaw.match(/0\d{1,2}[- ]?\d{7}/)?.[0] ?? "";
  return {
    id: g(r, "מס' הזמנה"), dateIso: toIso(g(r, "תאריך אספקה")), dateRaw: g(r, "תאריך אספקה"), time: g(r, "שעה"),
    contact: contactRaw.replace(phone, "").trim(), phone, address: g(r, "כתובת אספקה"), yard: g(r, "מחסן מוצא"),
    driver: g(r, "נהג / משאית"), itemsText: g(r, "פירוט מוצרים"), weightTons: num(g(r, "משקל (טון)")),
    bales: g(r, "פקדון בלות (60002)"), pallets: g(r, "פקדון משטחים (60060/60006)"), noteId: g(r, "מס' תעודת משלוח"),
    status: g(r, "סטטוס סידור"), wazeUrl: g(r, "קישור Waze"), remarks: g(r, "הערות"),
  };
}

function mapVisit(r: Row): HVisit {
  return {
    key: g(r, "מפתח ביקור"), dateIso: toIso(g(r, "תאריך")), truck: g(r, "משאית"), driver: g(r, "נהג"), city: g(r, "עיר"),
    address: g(r, "כתובת"), noteIds: g(r, "תעודות").split(/[,;\s]+/).filter(Boolean),
    orderIds: g(r, "הזמנות").split(/[,;\s]+/).filter(Boolean), craneRaw: g(r, "חלון מנוף בכתב יד"),
    unloadMin: num(g(r, "פריקה בכתב יד (דק׳)")), waitMin: num(g(r, "המתנה בכתב יד (דק׳)")),
    ituranMin: num(g(r, "איתוראן: משך עצירה (דק׳)")), ptoMin: num(g(r, "PTO משך (דק׳)")),
    driveMin: num(g(r, "נסיעה מהעצירה הקודמת (דק׳)")), siteMin: num(g(r, "משך באתר לסידור (דק׳)")),
    source: g(r, "מקור המדידה"), flags: g(r, "דגלי איכות"), siteKey: g(r, "מפתח אתר"),
  };
}

function mapIturanVisit(r: Row): HIturanVisit {
  return {
    id: g(r, "מפתח ביקור") || g(r, "key"), noteId: g(r, "מס' תעודה"), dateIso: toIso(g(r, "תאריך")),
    address: g(r, "כתובת") || g(r, "כתובת אספקה"), driver: g(r, "נהג"), truck: g(r, "משאית"),
    arrival: g(r, "הגעה איתוראן") || g(r, "הגעה"), departure: g(r, "עזיבה איתוראן") || g(r, "עזיבה"),
    stayMin: num(g(r, "שהייה דק׳") || g(r, "משך עצירה (דק׳)")), ptoMin: num(g(r, "PTO דק׳") || g(r, "PTO משך (דק׳)")),
  };
}

/* ------------------------------ אינדקס לקוחות ------------------------------ */

type Acc = {
  no: string; names: Map<string, number>; addrs: Map<string, number>; drivers: Map<string, number>;
  phone: string; contact: string; notes: number; orders: number; visits: number; dates: string[]; mins: number[]; noteMins: number[]; openInq: number;
};
const bump = (m: Map<string, number>, k: string) => k && m.set(k, (m.get(k) || 0) + 1);
const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

function buildIndex(raw: Raw): Map<string, CustomerSummary> {
  const acc = new Map<string, Acc>();
  const get = (no: string): Acc => {
    let a = acc.get(no);
    if (!a) {
      a = { no, names: new Map(), addrs: new Map(), drivers: new Map(), phone: "", contact: "", notes: 0, orders: 0, visits: 0, dates: [], mins: [], noteMins: [], openInq: 0 };
      acc.set(no, a);
    }
    return a;
  };
  const noteOwner = new Map<string, string>();

  const seen = new Set<string>();
  for (const r of raw.notes) {
    const no = g(r, "מס' לקוח");
    const id = g(r, "מס' תעודת משלוח");
    if (!no || !id || seen.has(id)) continue;
    seen.add(id);
    noteOwner.set(id, no);
    const a = get(no);
    a.notes++;
    bump(a.names, g(r, "שם לקוח"));
    bump(a.addrs, g(r, "כתובת אספקה"));
    bump(a.drivers, g(r, "נהג"));
    const d = toIso(g(r, "תאריך תעודה"));
    if (d) a.dates.push(d);
    const m = num(g(r, "משך באתר (דק׳)"));
    if (m && m <= 240) a.noteMins.push(m);
  }
  for (const r of raw.orders) {
    const no = g(r, "מס' לקוח");
    if (!no) continue;
    const o = mapOrder(r);
    if (o.noteId) noteOwner.set(o.noteId, no);
    const a = get(no);
    a.orders++;
    bump(a.names, g(r, "שם לקוח"));
    bump(a.addrs, o.address);
    bump(a.drivers, o.driver.split("-")[0].trim());
    if (o.phone) a.phone = o.phone;
    if (o.contact) a.contact = o.contact;
    if (o.dateIso) a.dates.push(o.dateIso);
  }
  for (const r of raw.visits) {
    const v = mapVisit(r);
    for (const t of customerTokens(g(r, "לקוחות"))) {
      const a = get(t.no);
      a.visits++;
      bump(a.names, t.name);
      bump(a.addrs, v.address);
      if (v.dateIso) a.dates.push(v.dateIso);
      if (v.siteMin && v.siteMin <= 240) a.mins.push(v.siteMin);
    }
  }
  for (const r of raw.inquiries) {
    const no = g(r, "מס' לקוח") || noteOwner.get(g(r, "מס' תעודה")) || "";
    if (no && isOpenInquiry(g(r, "workflowStatus") || g(r, "סטטוס בירור"))) get(no).openInq++;
  }

  const out = new Map<string, CustomerSummary>();
  for (const a of acc.values()) {
    const mins = a.mins.length ? a.mins : a.noteMins;
    const dates = [...a.dates].sort();
    out.set(a.no, {
      customerNo: a.no, name: top(a.names) || `לקוח ${a.no}`, address: top(a.addrs), addressesCount: a.addrs.size,
      phone: a.phone, contactName: a.contact, preferredDriver: top(a.drivers), notesCount: a.notes, ordersCount: a.orders,
      visitsCount: a.visits, firstIso: dates[0] ?? "", lastIso: dates[dates.length - 1] ?? "",
      avgSiteMin: mins.length ? Math.round(mins.reduce((s, x) => s + x, 0) / mins.length) : null, openInquiries: a.openInq,
    });
  }
  return out;
}

/* ------------------------------ API ------------------------------ */

export async function loadCustomerIndex() {
  const raw = await loadRaw();
  const customers = [...buildIndex(raw).values()].sort((a, b) => b.lastIso.localeCompare(a.lastIso));
  return { customers, source: "גיליון בדיקת תעודות משלוח · 6 טאבים", generatedAt: new Date().toISOString() };
}

export async function loadCustomerHistory(customerNo: string): Promise<CustomerHistory> {
  const raw = await loadRaw();
  const summary = buildIndex(raw).get(customerNo);
  const empty: CustomerSummary = {
    customerNo, name: `לקוח ${customerNo}`, address: "", addressesCount: 0, phone: "", contactName: "", preferredDriver: "",
    notesCount: 0, ordersCount: 0, visitsCount: 0, firstIso: "", lastIso: "", avgSiteMin: null, openInquiries: 0,
  };

  const seen = new Set<string>();
  const notes = raw.notes
    .filter((r) => g(r, "מס' לקוח") === customerNo)
    .map(mapNote)
    .filter((n) => n.id && !seen.has(n.id) && !!seen.add(n.id))
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso));
  const noteIds = new Set(notes.map((n) => n.id));

  const ituranVisits = raw.ituranVisits
    .filter((r) => g(r, "מס' לקוח") === customerNo)
    .map(mapIturanVisit)
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso));

  const orders = raw.orders
    .filter((r) => g(r, "מס' לקוח") === customerNo)
    .map(mapOrder)
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso));
  orders.forEach((o) => o.noteId && /^\d+$/.test(o.noteId) && noteIds.add(o.noteId));

  const visits = raw.visits
    .filter((r) => customerTokens(g(r, "לקוחות")).some((t) => t.no === customerNo))
    .map(mapVisit)
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso));
  const siteKeys = new Set(visits.map((v) => v.siteKey).filter(Boolean));

  const sites: HSite[] = raw.sites
    .filter((r) => siteKeys.has(g(r, "מפתח אתר")) || customerTokens(g(r, "לקוחות")).some((t) => t.no === customerNo))
    .map((r) => ({
      siteKey: g(r, "מפתח אתר"), address: g(r, "כתובת"), visits: num(g(r, "ביקורים")) ?? 0, lastIso: toIso(g(r, "ביקור אחרון")),
      samples: num(g(r, "מדידות")) ?? 0, medianMin: num(g(r, "באתר חציון (דק׳)")), p80Min: num(g(r, "באתר P80 (דק׳)")),
      maxMin: num(g(r, "באתר מקס׳ (דק׳)")), confidence: g(r, "ביטחון"),
    }));

  const inquiries: HInquiry[] = raw.inquiries
    .filter((r) => g(r, "מס' לקוח") === customerNo || noteIds.has(g(r, "מס' תעודה")))
    .map((r) => ({
      noteId: g(r, "מס' תעודה"), reason: g(r, "תיאור החריגה / הטעות שזוהתה"), reply: g(r, "הסבר ומענה מראמי"),
      status: g(r, "workflowStatus") || g(r, "סטטוס בירור"), updatedIso: toIso(g(r, "updatedAt") || g(r, "תאריך קליטה")),
      fileUrl: g(r, "כתובת הקובץ (URL)"),
    }))
    .sort((a, b) => b.updatedIso.localeCompare(a.updatedIso));

  const checks: HCheck[] = raw.checks
    .filter((r) => noteIds.has(g(r, "מספר תעודה")))
    .map((r) => ({
      dateIso: toIso(g(r, "תאריך")), noteId: g(r, "מספר תעודה"), approver: g(r, "מאשר"), checkId: g(r, "מזהה בדיקה"),
      result: g(r, "אסמכתא / תוצאת בדיקה"),
    }))
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso));

  return { customer: summary ?? empty, notes, orders, ituranVisits, visits, sites, inquiries, checks, generatedAt: new Date().toISOString() };
}

/** Read-only address history for the delivery-sites map. Coordinates are used only when already present in the sheet. */
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

  const sites: AtlasSite[] = raw.sites.map((row) => {
    const siteKey = g(row, "מפתח אתר");
    const address = g(row, "כתובת");
    const city = g(row, "עיר");
    const key = siteKey || `${city}|${address}`;
    const history = (visitsBySite.get(key) || []).sort((a, b) => b.dateIso.localeCompare(a.dateIso));
    const latitude = num(g(row, "קו רוחב") || g(row, "latitude") || g(row, "lat"));
    const longitude = num(g(row, "קו אורך") || g(row, "longitude") || g(row, "lng") || g(row, "lon"));
    const ptoHistory = history.filter((v) => v.ptoMin != null && v.ptoMin > 0);
    const ptoTotalMin = ptoHistory.reduce((s, v) => s + (v.ptoMin || 0), 0);
    return {
      siteKey, address, city,
      customerNo: g(row, "מס' לקוח") || customersBySite.get(key)?.no || "",
      customerName: g(row, "שם לקוח") || customersBySite.get(key)?.name || "",
      visits: num(g(row, "כמות ביקורים") || g(row, "ביקורים")) ?? history.length,
      lastIso: toIso(g(row, "תאריך ביקור אחרון") || g(row, "ביקור אחרון")),
      samples: num(g(row, "מדידות")) ?? history.filter((v) => v.siteMin != null).length,
      medianMin: num(g(row, "P50 משך באתר") || g(row, "באתר חציון (דק׳)")),
      p80Min: num(g(row, "P80 תכנון בטוח") || g(row, "באתר P80 (דק׳)")),
      maxMin: num(g(row, "מקסימום דקות") || g(row, "באתר מקס׳ (דק׳)")),
      confidence: g(row, "רמת ביטחון") || g(row, "ביטחון"),
      latitude, longitude,
      ptoOpens: ptoHistory.length,
      ptoTotalMin,
      visitHistory: history.map((v) => ({
        dateIso: v.dateIso, truck: v.truck, driver: v.driver, notes: v.noteIds, orders: v.orderIds,
        durationMin: v.siteMin ?? v.ituranMin, ptoMin: v.ptoMin,
      })),
    };
  }).filter((site) => site.address);

  const knownKeys = new Set(sites.map((site) => site.siteKey || `${site.city}|${site.address}`));
  for (const [key, history] of visitsBySite) {
    if (knownKeys.has(key) || !history[0]?.address) continue;
    const sample = history[0];
    const customer = customersBySite.get(key);
    const ptoHistory = history.filter((v) => v.ptoMin != null && v.ptoMin > 0);
    const ptoTotalMin = ptoHistory.reduce((s, v) => s + (v.ptoMin || 0), 0);
    sites.push({
      siteKey: sample.siteKey, address: sample.address, city: sample.city,
      customerNo: customer?.no || "", customerName: customer?.name || "",
      visits: history.length, lastIso: history.map((v) => v.dateIso).sort().at(-1) || "",
      samples: history.filter((v) => v.siteMin != null).length, medianMin: null, p80Min: null,
      maxMin: history.reduce<number | null>((max, v) => v.siteMin == null ? max : Math.max(max ?? 0, v.siteMin), null),
      confidence: "", latitude: null, longitude: null,
      ptoOpens: ptoHistory.length,
      ptoTotalMin,
      visitHistory: [...history].sort((a, b) => b.dateIso.localeCompare(a.dateIso)).map((v) => ({
        dateIso: v.dateIso, truck: v.truck, driver: v.driver, notes: v.noteIds, orders: v.orderIds,
        durationMin: v.siteMin ?? v.ituranMin, ptoMin: v.ptoMin,
      })),
    });
  }

  const cityCounts = new Map<string, number>();
  const customerCounts = new Map<string, { name: string; count: number }>();
  for (const site of sites) {
    if (site.city) cityCounts.set(site.city, (cityCounts.get(site.city) || 0) + site.visits);
  }
  for (const row of raw.visits) {
    for (const customer of customerTokens(g(row, "לקוחות"))) {
      const existing = customerCounts.get(customer.no) || { name: customer.name || `לקוח ${customer.no}`, count: 0 };
      existing.count++;
      customerCounts.set(customer.no, existing);
    }
  }
  return {
    sites: sites.sort((a, b) => b.visits - a.visits),
    cityCount: cityCounts.size,
    cities: [...cityCounts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    customers: [...customerCounts].map(([customerNo, v]) => ({ customerNo, ...v })).sort((a, b) => b.count - a.count).slice(0, 8),
    generatedAt: new Date().toISOString(),
  };
}
