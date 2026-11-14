/**
 * חיבור חי ל-GAS: getSites + getNotes + getIturanPto
 * להצלבה על מפת האתרים + חישוב ETA לסבב חכמת.
 */
import { createServerFn } from "@tanstack/react-start";
import { pairPtoEvents, analyzePto, type PtoRow } from "./smart-dispatch/pto-pairing";
import type { DeliveryNote } from "./data";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbx9d834wq3wm3z4XNHu7jIIhamopctR9dlHra6o4-PgYaflAhe3-VcYxNB4_abRkm_yyQ/exec";

function gasUrl(): string {
  return (process.env["GAS_URL"] || "").trim() || DEFAULT_GAS_URL;
}
function apiToken(): string {
  const t = process.env["API_TOKEN"];
  if (!t) throw new Error("API_TOKEN לא מוגדר בשרת");
  return t;
}

async function gasGet(action: string, extra: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const u = new URL(gasUrl());
  u.searchParams.set("action", action);
  u.searchParams.set("token", apiToken());
  u.searchParams.set("nocache", "1");
  u.searchParams.set("_t", String(Date.now()));
  for (const [k, v] of Object.entries(extra)) if (v) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), { redirect: "follow", signal: AbortSignal.timeout(45_000) });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`תשובת GAS לא תקינה (${action}, HTTP ${res.status})`);
  }
  if (data.error) throw new Error(String(data.error));
  if (data.success === false) throw new Error(String(data.error || "הפעולה נכשלה"));
  return data;
}

export type GasWarehouse = {
  id: string;
  key: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  short: string;
};

export type GasSite = {
  rowNumber?: number;
  siteKey: string;
  customerNo: string;
  customer: string;
  address: string;
  city: string;
  region?: string;
  visits: number;
  avgStopMin: number | null;
  maxStopMin: number | null;
  over20: number;
  severity: "normal" | "delayed" | "critical";
  lat: number | null;
  lng: number | null;
  hasCoords: boolean;
  distHarashKm?: number | null;
  driveHarashMin?: number | null;
  totalMissionHarashMin?: number | null;
  distTalmidKm?: number | null;
  driveTalmidMin?: number | null;
  totalMissionTalmidMin?: number | null;
};

export type SiteNoteLink = {
  id: string;
  date: string;
  customerNo: string;
  customer: string;
  address: string;
  driver: string;
  truck?: string;
  driveUrl?: string;
  fileId?: string;
  hasGpsMatch?: boolean;
  siteKey?: string;
};

export type SitePtoSession = {
  id: string;
  truck: string;
  driver: string;
  address: string;
  openIso: string;
  closeIso?: string;
  durationMin: number | null;
  date: string;
  orphan?: "missing_open" | "missing_close";
  matchedNoteId?: string;
  isHikmat?: boolean;
};

export type HikmatEtaBreakdown = {
  /** דקות שכבר חלפו מאז פתיחת ה-PTO הפתוח */
  elapsedUnloadMin: number;
  /** יתרת פריקה משוערת בתחנה הפתוחה */
  remainingUnloadMin: number;
  /** נסיעה חזרה למחסן הקרוב (דק׳) */
  driveBackMin: number;
  /** באפר תנועה / אי-ודאות (דק׳) */
  bufferMin: number;
  /** סה״כ דקות עד חזרה למחסן */
  totalMin: number;
  /** מקור הערכת הפריקה */
  unloadSource: "site_avg" | "site_max_capped" | "session_history" | "default";
  /** מקור הערכת הנסיעה */
  driveSource: "coords_haversine" | "site_drive_field" | "default";
  /** פקטור שעה (1.0–1.45) */
  hourFactor: number;
};

export type HikmatRound = {
  active: boolean;
  truck: string;
  completedStops: number;
  openStop: SitePtoSession | null;
  remainingUnloadMin: number;
  driveBackMin: number;
  bufferMin: number;
  totalEtaMin: number;
  etaBackIso: string | null;
  etaBackHe: string | null;
  warehouseId: "harash_10" | "hatalmid_6";
  warehouseName: string;
  progressPct: number;
  totalStopsToday: number;
  /** פירוט חישוב ETA לשקיפות בסדרן */
  eta: HikmatEtaBreakdown;
  matchedSiteKey?: string;
  matchedSiteAddress?: string;
};

export type SitesLivePayload = {
  fetchedAt: string;
  warehouses: GasWarehouse[];
  sites: GasSite[];
  notes: SiteNoteLink[];
  ptoSessions: SitePtoSession[];
  hikmatRound: HikmatRound;
  warehouseLoadDelay: { harash_10: number; hatalmid_6: number };
};

const FALLBACK_WH: GasWarehouse[] = [
  {
    id: "harash_10",
    key: "harash_10",
    name: "מחסן החרש 10",
    address: "רחוב החרש 10, הוד השרון",
    lat: 32.1508,
    lng: 34.8926,
    short: "חרש",
  },
  {
    id: "hatalmid_6",
    key: "hatalmid_6",
    name: "מחסן התלמיד 6",
    address: "רחוב התלמיד 6, הוד השרון",
    lat: 32.1544,
    lng: 34.8886,
    short: "תלמיד",
  },
];

function normSite(raw: Record<string, unknown>): GasSite {
  const lat = raw.lat != null ? Number(raw.lat) : raw.latitude != null ? Number(raw.latitude) : null;
  const lng = raw.lng != null ? Number(raw.lng) : raw.longitude != null ? Number(raw.longitude) : null;
  const hasCoords =
    raw.hasCoords === true ||
    (lat != null &&
      lng != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      !(lat === 0 && lng === 0));
  const severityRaw = String(raw.severity || "normal");
  const severity: GasSite["severity"] =
    severityRaw === "critical" || severityRaw === "delayed" ? severityRaw : "normal";
  return {
    rowNumber: raw.rowNumber != null ? Number(raw.rowNumber) : undefined,
    siteKey: String(raw.siteKey || `${raw.city || ""}|${raw.address || ""}`),
    customerNo: String(raw.customerNo || ""),
    customer: String(raw.customer || raw.customerName || ""),
    address: String(raw.address || ""),
    city: String(raw.city || ""),
    region: raw.region != null ? String(raw.region) : undefined,
    visits: Number(raw.visits || 0),
    avgStopMin: raw.avgStopMin != null ? Number(raw.avgStopMin) : null,
    maxStopMin: raw.maxStopMin != null ? Number(raw.maxStopMin) : null,
    over20: Number(raw.over20 || 0),
    severity,
    lat: hasCoords ? lat : null,
    lng: hasCoords ? lng : null,
    hasCoords: Boolean(hasCoords),
    distHarashKm: raw.distHarashKm != null ? Number(raw.distHarashKm) : null,
    driveHarashMin: raw.driveHarashMin != null ? Number(raw.driveHarashMin) : null,
    totalMissionHarashMin: raw.totalMissionHarashMin != null ? Number(raw.totalMissionHarashMin) : null,
    distTalmidKm: raw.distTalmidKm != null ? Number(raw.distTalmidKm) : null,
    driveTalmidMin: raw.driveTalmidMin != null ? Number(raw.driveTalmidMin) : null,
    totalMissionTalmidMin: raw.totalMissionTalmidMin != null ? Number(raw.totalMissionTalmidMin) : null,
  };
}

function normWarehouse(raw: unknown, idx: number): GasWarehouse {
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const key = String(o.key || o.id || (idx === 0 ? "harash_10" : "hatalmid_6"));
    const fb = FALLBACK_WH.find((w) => w.key === key) || FALLBACK_WH[idx] || FALLBACK_WH[0]!;
    return {
      id: key,
      key,
      name: String(o.name || o.label || fb.name),
      address: String(o.address || fb.address),
      lat: Number(o.lat ?? fb.lat),
      lng: Number(o.lng ?? fb.lng),
      short: String(o.short || fb.short),
    };
  }
  return FALLBACK_WH[idx] || FALLBACK_WH[0]!;
}

function isHikmatTruck(truck: string): boolean {
  const t = truck.toLowerCase();
  return /חכמת|hikmat|615|18000|מנוף/.test(t);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** נסיעה דקות בין שתי נקודות — מהירות עירונית/בינעירונית + פקטור שעה */
function estimateDriveMin(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  hourFactor = 1,
): number {
  const km = haversineKm(lat1, lng1, lat2, lng2);
  const urban = km < 22;
  const speedKmh = urban ? 26 : 50;
  const baseFactor = urban ? 1.4 : 1.22;
  return Math.max(6, Math.round((km / speedKmh) * 60 * baseFactor * hourFactor));
}

/** פקטור עומס לפי שעת ישראל (בוקר/צהריים/אחה״צ) */
function israelHourTrafficFactor(now = new Date()): number {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  if (hour >= 7 && hour < 10) return 1.35;
  if (hour >= 12 && hour < 14) return 1.2;
  if (hour >= 15 && hour < 19) return 1.4;
  if (hour >= 19 && hour < 21) return 1.15;
  return 1.0;
}

function normalizeAddr(a: string): string {
  return String(a || "")
    .toLowerCase()
    .replace(/[״"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchSessionToSite(session: SitePtoSession | null, sites: GasSite[]): GasSite | null {
  if (!session) return null;
  const addr = normalizeAddr(session.address);
  if (!addr) return null;
  let best: GasSite | null = null;
  let bestScore = 0;
  for (const s of sites) {
    const sa = normalizeAddr(s.address);
    if (!sa) continue;
    let score = 0;
    if (sa === addr) score = 100;
    else if (sa.includes(addr.slice(0, 14)) || addr.includes(sa.slice(0, 14))) score = 70;
    else {
      const tokens = addr.split(" ").filter((t) => t.length > 2);
      const hits = tokens.filter((t) => sa.includes(t)).length;
      score = hits * 12;
    }
    if (s.city && session.address.includes(s.city)) score += 8;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return bestScore >= 24 ? best : null;
}

function median(nums: number[]): number | null {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid]! : Math.round((a[mid - 1]! + a[mid]!) / 2);
}

function formatIsraelTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("he-IL", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

function pickNearestWarehouse(
  lat: number,
  lng: number,
  warehouses: GasWarehouse[],
): { wh: GasWarehouse; driveMin: number } {
  const list = warehouses.length ? warehouses : FALLBACK_WH;
  let best = list[0]!;
  let bestMin = estimateDriveMin(lat, lng, best.lat, best.lng, 1);
  for (const wh of list) {
    const m = estimateDriveMin(lat, lng, wh.lat, wh.lng, 1);
    if (m < bestMin) {
      best = wh;
      bestMin = m;
    }
  }
  return { wh: best, driveMin: bestMin };
}

/**
 * ETA חזרה למחסן לסבב הבא:
 * יתרת פריקה בתחנה הפתוחה + נסיעה חזרה למחסן הקרוב + באפר תנועה.
 */
function buildHikmatRound(
  sessions: SitePtoSession[],
  warehouses: GasWarehouse[],
  sites: GasSite[] = [],
): HikmatRound {
  const now = new Date();
  const today = now.toLocaleDateString("en-GB", { timeZone: "Asia/Jerusalem" });
  const hourFactor = israelHourTrafficFactor(now);

  const hikmat = sessions.filter((s) => s.isHikmat && (s.date === today || !s.date));
  const pool = hikmat.length ? hikmat : sessions.filter((s) => s.isHikmat);
  const completed = pool.filter((s) => s.closeIso && !s.orphan);
  const open = pool.find((s) => s.orphan === "missing_close") || null;

  const matchedSite = matchSessionToSite(open, sites);

  let expectedUnload = 22;
  let unloadSource: HikmatEtaBreakdown["unloadSource"] = "default";

  if (matchedSite?.avgStopMin != null && matchedSite.avgStopMin > 0) {
    expectedUnload = Math.round(matchedSite.avgStopMin);
    unloadSource = "site_avg";
    if (matchedSite.maxStopMin != null && matchedSite.maxStopMin > expectedUnload) {
      expectedUnload = Math.round(expectedUnload * 0.7 + Math.min(matchedSite.maxStopMin, 55) * 0.3);
      unloadSource = "site_max_capped";
    }
  } else {
    const hist = completed
      .map((s) => s.durationMin)
      .filter((d): d is number => d != null && Number.isFinite(d) && d > 0 && d < 180);
    const med = median(hist);
    if (med != null) {
      expectedUnload = med;
      unloadSource = "session_history";
    }
  }

  let elapsedUnloadMin = 0;
  if (open?.openIso) {
    const opened = new Date(open.openIso).getTime();
    if (Number.isFinite(opened)) {
      elapsedUnloadMin = Math.max(0, Math.round((now.getTime() - opened) / 60_000));
    }
  }

  let remainingUnloadMin = Math.max(0, expectedUnload - elapsedUnloadMin);
  if (open && remainingUnloadMin < 3 && elapsedUnloadMin > 0) {
    remainingUnloadMin = Math.min(8, Math.max(3, Math.round(expectedUnload * 0.15)));
  }
  if (!open) remainingUnloadMin = 0;

  let driveBackMin = 18;
  let driveSource: HikmatEtaBreakdown["driveSource"] = "default";
  let warehouse = warehouses[0] || FALLBACK_WH[0]!;
  let warehouseId: "harash_10" | "hatalmid_6" =
    warehouse.id === "hatalmid_6" ? "hatalmid_6" : "harash_10";

  const siteLat = matchedSite?.lat;
  const siteLng = matchedSite?.lng;

  if (siteLat != null && siteLng != null && Number.isFinite(siteLat) && Number.isFinite(siteLng)) {
    const fromFields: Array<{ id: "harash_10" | "hatalmid_6"; min: number | null | undefined }> = [
      { id: "harash_10", min: matchedSite?.driveHarashMin },
      { id: "hatalmid_6", min: matchedSite?.driveTalmidMin },
    ];
    const fieldBest = fromFields
      .filter((x) => x.min != null && Number(x.min) > 0)
      .sort((a, b) => Number(a.min) - Number(b.min))[0];

    if (fieldBest) {
      driveBackMin = Math.max(6, Math.round(Number(fieldBest.min) * hourFactor));
      driveSource = "site_drive_field";
      warehouseId = fieldBest.id;
      warehouse =
        warehouses.find((w) => w.id === warehouseId || w.key === warehouseId) ||
        FALLBACK_WH.find((w) => w.id === warehouseId) ||
        warehouse;
    } else {
      const nearest = pickNearestWarehouse(siteLat, siteLng, warehouses);
      driveBackMin = Math.max(6, Math.round(nearest.driveMin * hourFactor));
      driveSource = "coords_haversine";
      warehouse = nearest.wh;
      warehouseId = nearest.wh.id === "hatalmid_6" ? "hatalmid_6" : "harash_10";
    }
  } else if (open) {
    driveBackMin = Math.round(18 * hourFactor);
    driveSource = "default";
  }

  const baseSum = remainingUnloadMin + driveBackMin;
  let bufferMin = Math.min(15, Math.max(4, Math.round(baseSum * 0.12)));
  if ((matchedSite?.over20 || 0) >= 2) bufferMin = Math.min(15, bufferMin + 3);
  if (hourFactor >= 1.3) bufferMin = Math.min(15, bufferMin + 2);

  const totalMin = remainingUnloadMin + driveBackMin + (open ? bufferMin : 0);
  const etaBackIso =
    open || completed.length ? new Date(now.getTime() + totalMin * 60_000).toISOString() : null;

  const progressPct =
    pool.length === 0 ? 0 : Math.min(100, Math.round((completed.length / Math.max(pool.length, 1)) * 100));

  const eta: HikmatEtaBreakdown = {
    elapsedUnloadMin,
    remainingUnloadMin,
    driveBackMin,
    bufferMin: open ? bufferMin : 0,
    totalMin,
    unloadSource,
    driveSource,
    hourFactor,
  };

  return {
    active: Boolean(open) || completed.length > 0,
    truck: open?.truck || pool[0]?.truck || "חכמת מנוף",
    completedStops: completed.length,
    openStop: open,
    remainingUnloadMin,
    driveBackMin,
    bufferMin: open ? bufferMin : 0,
    totalEtaMin: totalMin,
    etaBackIso,
    etaBackHe: etaBackIso ? formatIsraelTime(etaBackIso) : null,
    warehouseId,
    warehouseName: warehouse.name || warehouse.short || warehouseId,
    progressPct,
    totalStopsToday: Math.max(pool.length, completed.length + (open ? 1 : 0)),
    eta,
    matchedSiteKey: matchedSite?.siteKey,
    matchedSiteAddress: matchedSite?.address || open?.address,
  };
}

export const getSitesLiveFn = createServerFn({ method: "GET" }).handler(async (): Promise<SitesLivePayload> => {
  const [sitesRes, notesRes, ptoRes] = await Promise.all([
    gasGet("getSites").catch((e) => ({ __error: String((e as Error)?.message || e) })),
    gasGet("getNotes").catch(() => ({ notes: [] })),
    gasGet("getIturanPto").catch(() => ({ events: [] })),
  ]);

  if ("__error" in sitesRes) throw new Error(String(sitesRes.__error));

  let warehouses: GasWarehouse[] = FALLBACK_WH;
  const whRaw = sitesRes.warehouses;
  if (Array.isArray(whRaw) && whRaw.length) {
    warehouses = whRaw.map((w, i) => normWarehouse(w, i));
  } else if (whRaw && typeof whRaw === "object") {
    warehouses = Object.entries(whRaw as Record<string, unknown>).map(([key, val], i) => {
      const o = (val && typeof val === "object" ? val : {}) as Record<string, unknown>;
      return normWarehouse({ ...o, key: o.key || key }, i);
    });
  }

  const sitesRaw = Array.isArray(sitesRes.sites) ? sitesRes.sites : [];
  const sites = sitesRaw.map((s) => normSite((s || {}) as Record<string, unknown>));

  const notesRaw = Array.isArray((notesRes as { notes?: unknown[] }).notes)
    ? ((notesRes as { notes: unknown[] }).notes as Record<string, unknown>[])
    : [];
  const notes: SiteNoteLink[] = notesRaw.map((n) => ({
    id: String(n.id || n.docNumber || ""),
    date: String(n.date || n.docDate || ""),
    customerNo: String(n.customerNo || ""),
    customer: String(n.customer || n.customerName || ""),
    address: String(n.siteAddress || n.address || ""),
    driver: String(n.driver || ""),
    truck: n.truck != null ? String(n.truck) : undefined,
    driveUrl: n.driveUrl != null ? String(n.driveUrl) : n.signedUrl != null ? String(n.signedUrl) : undefined,
    fileId: n.fileId != null ? String(n.fileId) : undefined,
    hasGpsMatch: n.hasGpsMatch === true || n.hasGpsMatch === "true",
  }));

  const eventsRaw = Array.isArray((ptoRes as { events?: unknown[] }).events)
    ? ((ptoRes as { events: unknown[] }).events as Record<string, unknown>[])
    : [];
  const ptoRows: PtoRow[] = eventsRaw
    .map((e) => ({
      truck: String(e.truck || "").trim(),
      driver: String(e.driver || "").trim(),
      eventType: String(e.eventType || "").trim(),
      eventTimeIso: String(e.eventTimeIso || "").trim(),
      address: String(e.address || "").trim(),
    }))
    .filter((r) => r.truck && r.eventTimeIso && r.eventType);

  const deliveryNotes: DeliveryNote[] = notes.map((n) => ({
    id: n.id || "x",
    customer: n.customer,
    date: n.date,
    items: [],
    customerNo: n.customerNo,
    siteAddress: n.address,
    driver: n.driver,
    live: true,
  }));

  const analysis = analyzePto(pairPtoEvents(ptoRows), deliveryNotes);
  const ptoSessions: SitePtoSession[] = analysis.sessions.map((s) => ({
    id: s.id,
    truck: s.truck,
    driver: s.driver,
    address: s.address,
    openIso: s.openIso,
    closeIso: s.closeIso,
    durationMin: s.durationMin,
    date: s.date,
    orphan: s.orphan,
    matchedNoteId: s.matchedNoteId,
    isHikmat: isHikmatTruck(s.truck) || isHikmatTruck(s.driver),
  }));

  const hikmatRound = buildHikmatRound(ptoSessions, warehouses, sites);

  const closed = ptoSessions.filter((s) => s.durationMin != null);
  const delayed = closed.filter((s) => (s.durationMin || 0) > 20).length;
  const loadPct = closed.length ? Math.round((delayed / closed.length) * 100) : 0;

  return {
    fetchedAt: new Date().toISOString(),
    warehouses,
    sites,
    notes,
    ptoSessions,
    hikmatRound,
    warehouseLoadDelay: { harash_10: loadPct, hatalmid_6: Math.max(0, loadPct - 5) },
  };
});
