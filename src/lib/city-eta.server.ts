/**
 * city-eta.server.ts
 * Feature 4 — מחשבון זמן הגעה ופריקה חכם מתוך טאב סיכום_ערים
 * מקור: איתוראן → buildCitiesSummary / TAB_NAMES.CITIES_SUMMARY
 */
import { readGoogleSheetBatch, MASTER_SHEET_ID, TAB_NAMES } from "./smart-dispatch/sheets-integration";

const CACHE_TTL_MS = 15 * 60 * 1000;

export type CityEta = {
  city: string;
  visitsCount: number;
  driveMinMedian: number | null;
  unloadMinMedian: number | null;
  unloadP80: number | null;
  sitesCount: number;
  craneHint: boolean;
};

export type CityEtaPayload = {
  cities: CityEta[];
  byName: Record<string, CityEta>;
  generatedAt: string;
  source: string;
  readVia: string;
};

type CacheEntry = { at: number; data: CityEtaPayload };
let memoryCache: CacheEntry | null = null;

const cell = (row: unknown[], i: number): string =>
  String(row[i] ?? "").replace(/\u00a0/g, " ").trim();

function parseNum(raw: string): number | null {
  const t = raw.replace(/[^\d.,\-]/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function normalizeCityName(name: string): string {
  return name.replace(/["'״׳]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function mapRow(headers: string[], row: unknown[]): CityEta | null {
  const idx = (name: string) => {
    const i = headers.findIndex((h) => h.replace(/\s+/g, " ").includes(name));
    return i >= 0 ? i : -1;
  };
  const city = cell(row, idx("עיר")) || cell(row, 0);
  if (!city) return null;
  const drive = parseNum(cell(row, idx("חציון נסיעה")) || cell(row, idx("נסיעה")));
  const unload = parseNum(cell(row, idx("חציון משך באתר")) || cell(row, idx("משך באתר")) || cell(row, idx("חציון")));
  const p80 = parseNum(cell(row, idx("P80")) || cell(row, idx("p80")));
  const visits = parseNum(cell(row, idx("כמות ביקורים")) || cell(row, idx("ביקורים"))) ?? 0;
  const sites = parseNum(cell(row, idx("אתרים")) || cell(row, idx("sites"))) ?? 0;
  const craneHint = (unload ?? 0) >= 25 || (p80 ?? 0) >= 35;
  return { city, visitsCount: visits, driveMinMedian: drive, unloadMinMedian: unload, unloadP80: p80, sitesCount: sites, craneHint };
}

async function readViaServiceAccount(): Promise<{ rows: unknown[][]; via: string } | null> {
  try {
    const range = `'${TAB_NAMES.CITIES_SUMMARY}'!A1:F100`;
    const raw = await readGoogleSheetBatch(MASTER_SHEET_ID, range);
    if (raw && raw.length >= 2) return { rows: raw, via: "service_account" };
  } catch (e) {
    console.warn("[city-eta] service_account:", e instanceof Error ? e.message : e);
  }
  return null;
}

async function readViaPublicCsv(): Promise<{ rows: unknown[][]; via: string }> {
  const url =
    `https://docs.google.com/spreadsheets/d/${MASTER_SHEET_ID}/gviz/tq` +
    `?tqx=out:csv&sheet=${encodeURIComponent(TAB_NAMES.CITIES_SUMMARY)}`;
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`public_csv_http_${res.status}`);
  const text = await res.text();
  if (!text.trim() || text.startsWith("<!")) throw new Error("public_csv_html");
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return { rows, via: "public_csv" };
}

function buildPayload(rows: unknown[][], via: string): CityEtaPayload {
  const headers = (rows[0] as unknown[]).map((h) => String(h ?? "").trim());
  const cities: CityEta[] = [];
  const byName: Record<string, CityEta> = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    const item = mapRow(headers, r as unknown[]);
    if (!item) continue;
    cities.push(item);
    byName[normalizeCityName(item.city)] = item;
  }
  cities.sort((a, b) => b.visitsCount - a.visitsCount || a.city.localeCompare(b.city, "he"));
  return {
    cities,
    byName,
    generatedAt: new Date().toISOString(),
    source: `גיליון · ${TAB_NAMES.CITIES_SUMMARY}`,
    readVia: via,
  };
}

export async function loadCityEta(force = false): Promise<CityEtaPayload> {
  if (!force && memoryCache && Date.now() - memoryCache.at < CACHE_TTL_MS) return memoryCache.data;
  try {
    const sa = await readViaServiceAccount();
    const { rows, via } = sa ?? (await readViaPublicCsv());
    const data = buildPayload(rows, via);
    if (data.cities.length > 0) memoryCache = { at: Date.now(), data };
    return data;
  } catch (e) {
    console.error("[city-eta] load failed:", e instanceof Error ? e.message : e);
    if (memoryCache?.data) return memoryCache.data;
    return { cities: [], byName: {}, generatedAt: new Date().toISOString(), source: "סיכום_ערים · שגיאת טעינה", readVia: "error" };
  }
}

export function findCityEta(payload: CityEtaPayload, cityQuery: string): CityEta | null {
  const q = normalizeCityName(cityQuery);
  if (!q) return null;
  if (payload.byName[q]) return payload.byName[q];
  for (const [key, val] of Object.entries(payload.byName)) {
    if (key.includes(q) || q.includes(key)) return val;
  }
  return null;
}

export function formatCityEtaLine(eta: CityEta): string {
  const parts: string[] = [eta.city];
  if (eta.driveMinMedian != null) parts.push(`נסיעה ~${eta.driveMinMedian} דק'`);
  if (eta.unloadMinMedian != null) parts.push(`פריקה חציון ${eta.unloadMinMedian} דק'`);
  if (eta.craneHint) parts.push("⚠️ ייתכן צורך במנוף");
  return parts.join(" · ");
}
