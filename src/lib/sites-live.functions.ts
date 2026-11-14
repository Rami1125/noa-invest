/**
 * חיבור חי ל-GAS: getSites + getNotes + getIturanPto
 * להצלבה על מפת האתרים.
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

export type HikmatRound = {
  active: boolean;
  truck: string;
  completedStops: number;
  openStop: SitePtoSession | null;
  remainingUnloadMin: number;
  driveBackMin: number;
  etaBackIso: string | null;
  warehouseId: "harash_10" | "hatalmid_6";
  progressPct: number;
  totalStopsToday: number;
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

function buildHikmatRound(sessions: SitePtoSession[], _warehouses: GasWarehouse[]): HikmatRound {
  const today = new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Jerusalem" });
  const hikmat = sessions.filter((s) => s.isHikmat && (s.date === today || !s.date));
  const pool = hikmat.length ? hikmat : sessions.filter((s) => s.isHikmat);
  const completed = pool.filter((s) => s.closeIso && !s.orphan);
  const open = pool.find((s) => s.orphan === "missing_close") || null;
  const remainingUnload = open ? Math.max(15, 25) : 0;
  const driveBack = 18;
  const progressPct =
    pool.length === 0 ? 0 : Math.min(100, Math.round((completed.length / Math.max(pool.length, 1)) * 100));
  const etaMs = Date.now() + (remainingUnload + driveBack) * 60_000;
  return {
    active: Boolean(open) || completed.length > 0,
    truck: open?.truck || pool[0]?.truck || "חכמת מנוף",
    completedStops: completed.length,
    openStop: open,
    remainingUnloadMin: remainingUnload,
    driveBackMin: driveBack,
    etaBackIso: pool.length ? new Date(etaMs).toISOString() : null,
    warehouseId: "harash_10",
    progressPct,
    totalStopsToday: Math.max(pool.length, completed.length + (open ? 1 : 0)),
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

  const hikmatRound = buildHikmatRound(ptoSessions, warehouses);

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
