/**
 * מילון_לוגיסט — טעינת קטלוג מלא (A1:P2620) עם cache בצד שרת
 */
import { readGoogleSheetBatch, MASTER_SHEET_ID } from "./smart-dispatch/sheets-integration";

const DICT_TAB = "מילון_לוגיסט";
const RANGE = `'${DICT_TAB}'!A1:P2620`;
const CACHE_TTL_MS = 10 * 60 * 1000;

export type LogisticsDictItem = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  keywords: string;
  techInfo: string;
  techUrl: string;
  deposit: string;
  weightKg: number | null;
  warehouse: string;
  driverTruck: string;
  listPrice: number | null;
  discountPct: number | null;
  netPrice: number | null;
  mediaCode: string;
  imageUrl: string;
};

export type LogisticsDictPayload = {
  items: LogisticsDictItem[];
  total: number;
  withPrice: number;
  withImage: number;
  categories: { name: string; count: number }[];
  warehouses: { name: string; count: number }[];
  drivers: { name: string; count: number }[];
  generatedAt: string;
  source: string;
  readVia: string;
};

type CacheEntry = { at: number; data: LogisticsDictPayload };
let memoryCache: CacheEntry | null = null;

const cell = (row: unknown[], i: number): string =>
  String(row[i] ?? "")
    .replace(/\u00a0/g, " ")
    .trim();

function parseNumber(raw: string): number | null {
  const t = raw.replace(/[₪,\s]/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseSlang(raw: string): { keywords: string; techInfo: string; techUrl: string } {
  const text = raw.trim();
  if (!text) return { keywords: "", techInfo: "", techUrl: "" };
  const splitRe = /\|\s*מידע\s*טכני\s*:/i;
  const parts = text.split(splitRe);
  const keywords = (parts[0] || "").trim();
  const techInfo = parts.length > 1 ? parts.slice(1).join(" | ").trim() : "";
  const urlMatch = text.match(/https?:\/\/[^\s|"']+/i);
  return {
    keywords,
    techInfo,
    techUrl: urlMatch ? urlMatch[0] : "",
  };
}

function mapRow(row: unknown[]): LogisticsDictItem | null {
  const sku = cell(row, 0);
  if (!sku) return null;
  const slang = parseSlang(cell(row, 4));
  const depositF = cell(row, 5);
  const depositN = cell(row, 13);
  const warehouseH = cell(row, 7);
  const warehouseM = cell(row, 12);

  return {
    sku,
    name: cell(row, 1) || sku,
    category: cell(row, 2),
    unit: cell(row, 3),
    keywords: slang.keywords,
    techInfo: slang.techInfo,
    techUrl: slang.techUrl,
    deposit: depositF || depositN,
    weightKg: parseNumber(cell(row, 6)),
    warehouse: warehouseH || warehouseM,
    driverTruck: cell(row, 8),
    listPrice: parseNumber(cell(row, 9)),
    discountPct: parseNumber(cell(row, 10)),
    netPrice: parseNumber(cell(row, 11)),
    mediaCode: cell(row, 14),
    imageUrl: cell(row, 15),
  };
}

async function readViaServiceAccount(): Promise<{ rows: unknown[][]; via: string } | null> {
  try {
    const raw = await readGoogleSheetBatch(MASTER_SHEET_ID, RANGE);
    if (raw && raw.length >= 2) return { rows: raw, via: "service_account" };
  } catch (e) {
    console.warn("[logistics-dict] service_account:", e instanceof Error ? e.message : e);
  }
  return null;
}

async function readViaPublicCsv(): Promise<{ rows: unknown[][]; via: string }> {
  const url =
    `https://docs.google.com/spreadsheets/d/${MASTER_SHEET_ID}/gviz/tq` +
    `?tqx=out:csv&sheet=${encodeURIComponent(DICT_TAB)}`;
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(45_000) });
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
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (ch !== "\r") cur += ch;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return { rows, via: "public_csv" };
}

function buildPayload(rows: unknown[][], via: string): LogisticsDictPayload {
  const dataRows = rows.slice(1);
  const items: LogisticsDictItem[] = [];
  for (const r of dataRows) {
    if (!Array.isArray(r)) continue;
    const item = mapRow(r as unknown[]);
    if (item) items.push(item);
  }

  const catMap = new Map<string, number>();
  const whMap = new Map<string, number>();
  const drvMap = new Map<string, number>();
  let withPrice = 0;
  let withImage = 0;

  for (const it of items) {
    if (it.category) catMap.set(it.category, (catMap.get(it.category) || 0) + 1);
    if (it.warehouse) whMap.set(it.warehouse, (whMap.get(it.warehouse) || 0) + 1);
    if (it.driverTruck) drvMap.set(it.driverTruck, (drvMap.get(it.driverTruck) || 0) + 1);
    if (it.listPrice != null || it.netPrice != null) withPrice += 1;
    if (it.imageUrl) withImage += 1;
  }

  const sortCount = (a: { count: number; name: string }, b: { count: number; name: string }) =>
    b.count - a.count || a.name.localeCompare(b.name, "he");

  return {
    items,
    total: items.length,
    withPrice,
    withImage,
    categories: [...catMap.entries()].map(([name, count]) => ({ name, count })).sort(sortCount),
    warehouses: [...whMap.entries()].map(([name, count]) => ({ name, count })).sort(sortCount),
    drivers: [...drvMap.entries()].map(([name, count]) => ({ name, count })).sort(sortCount),
    generatedAt: new Date().toISOString(),
    source: `גיליון · ${DICT_TAB} · A1:P2620`,
    readVia: via,
  };
}

export async function loadLogisticsDict(force = false): Promise<LogisticsDictPayload> {
  if (!force && memoryCache && Date.now() - memoryCache.at < CACHE_TTL_MS) {
    return memoryCache.data;
  }

  try {
    const sa = await readViaServiceAccount();
    const { rows, via } = sa ?? (await readViaPublicCsv());
    const data = buildPayload(rows, via);
    if (data.total > 0) {
      memoryCache = { at: Date.now(), data };
    }
    return data;
  } catch (e) {
    console.error("[logistics-dict] load failed:", e instanceof Error ? e.message : e);
    if (memoryCache?.data) return memoryCache.data;
    return {
      items: [],
      total: 0,
      withPrice: 0,
      withImage: 0,
      categories: [],
      warehouses: [],
      drivers: [],
      generatedAt: new Date().toISOString(),
      source: "מילון_לוגיסט · שגיאת טעינה",
      readVia: "error",
    };
  }
}
