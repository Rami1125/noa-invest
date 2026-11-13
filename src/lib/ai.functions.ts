/**
 * Server-side data retrieval and Gemini integration for Noa.
 * The browser supplies conversation messages and an optional customer key; business data is fetched here.
 */
import { createServerFn } from "@tanstack/react-start";
import { loadCustomerHistory } from "./customer-history.server";

type Msg = { role: "user" | "assistant"; content: string };
type AskInput = { messages: Msg[]; customerNo?: string };
type SourceResult = { available: boolean; count: number; records?: unknown[]; error?: string };

const MASTER_SHEET_ID = "1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw";
const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbx9d834wq3wm3z4XNHu7jIIhamopctR9dlHra6o4-PgYaflAhe3-VcYxNB4_abRkm_yyQ/exec";

function gasConfig() {
  const token = process.env["API_TOKEN"];
  if (!token) throw new Error("API_TOKEN לא מוגדר בשרת");
  return { token, url: process.env["GAS_URL"] || DEFAULT_GAS_URL };
}

async function fetchGasAction(action: string): Promise<unknown> {
  const { token, url } = gasConfig();
  const endpoint = new URL(url);
  endpoint.searchParams.set("action", action);
  endpoint.searchParams.set("token", token);
  if (["getGps", "getCustomers", "getDashboard", "getRamiInquiries"].includes(action)) {
    endpoint.searchParams.set("sheetId", MASTER_SHEET_ID);
  }
  const response = await fetch(endpoint, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Apps Script HTTP ${response.status}`);
  const result: unknown = await response.json();
  if (!result || typeof result !== "object") throw new Error("תשובת שרת לא תקינה");
  const obj = result as Record<string, unknown>;
  if (obj.success === false || obj.error) throw new Error(String(obj.error || "הפעולה נכשלה"));
  return result;
}

function rowsFrom(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  for (const key of keys) if (Array.isArray(obj[key])) return obj[key] as unknown[];
  if (obj.data && typeof obj.data === "object") return rowsFrom(obj.data, keys);
  return [payload];
}

const PRIVATE_KEY =
  /phone|טלפון|contact|איש קשר|email|מייל|(^|_)hp($|_)|ח[.]?פ|עוסק|tax|drive|url|קישור|file.?id|base64|חתימה|signature|token|מפתח/i;

function safeRecord(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null || typeof value === "function") return undefined;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeRecord(item, depth + 1));
  if (typeof value !== "object") return typeof value === "string" ? value.slice(0, 500) : value;
  const safe: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (PRIVATE_KEY.test(key)) continue;
    const cleaned = safeRecord(item, depth + 1);
    if (cleaned !== undefined) safe[key] = cleaned;
  }
  return safe;
}

function compactSource(
  payload: unknown,
  keys: string[],
  question: string,
  limit = 10,
  includeUnmatched = true,
): SourceResult {
  const rows = rowsFrom(payload, keys);
  const terms = question.toLowerCase().match(/[a-z0-9א-ת-]{3,}/giu) ?? [];
  const ranked = rows.map((record, index) => {
    const raw = JSON.stringify(record).toLowerCase();
    const score = terms.reduce((sum, term) => sum + (raw.includes(term) ? 1 : 0), 0);
    return { record, index, score };
  });
  const matching = ranked
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const chosen = matching.length
    ? matching.slice(0, limit)
    : includeUnmatched
      ? ranked.slice(0, limit)
      : [];
  return {
    available: true,
    count: rows.length,
    records: chosen.map(({ record }) => safeRecord(record)),
  };
}

async function loadSource(
  action: string,
  keys: string[],
  question: string,
  limit = 10,
  includeUnmatched = true,
): Promise<SourceResult> {
  try {
    return compactSource(await fetchGasAction(action), keys, question, limit, includeUnmatched);
  } catch (error) {
    return {
      available: false,
      count: 0,
      error: error instanceof Error ? error.message.slice(0, 180) : "מקור לא זמין",
    };
  }
}

function buildLiveSummary(notesSrc: SourceResult, ptoSrc: SourceResult): Record<string, unknown> {
  const notes = (notesSrc.records || []) as Record<string, unknown>[];
  const events = (ptoSrc.records || []) as Record<string, unknown>[];
  let withGps = 0;
  let aaAb = 0;
  let ahAj = 0;
  for (const n of notes) {
    const src = String(n.gpsSource || "");
    const match =
      n.hasGpsMatch === true ||
      n.hasGpsMatch === "true" ||
      Boolean(n.itArrive && n.itDepart) ||
      src === "sheet_AA_AB" ||
      src === "sheet_AH_AJ";
    if (match) withGps++;
    if (src === "sheet_AA_AB") aaAb++;
    if (src === "sheet_AH_AJ") ahAj++;
  }
  let longDwell = 0;
  let openPto = 0;
  let orphanSessions = 0;
  for (const e of events) {
    const dur = Number(e.durationMin ?? e.itStop ?? e.dwell ?? 0);
    if (Number.isFinite(dur) && dur > 20) longDwell++;
    const orphan = String(e.orphan || e.status || "");
    if (orphan === "missing_close" || /open|פתוח/i.test(orphan)) openPto++;
    if (!e.matchedNoteId && !e.noteId && !e.docNumber) orphanSessions++;
  }
  return {
    totalNotes: notesSrc.count,
    notesInContext: notes.length,
    withGpsMatch: withGps,
    gpsSourceAA_AB: aaAb,
    gpsSourceAH_AJ: ahAj,
    withoutGps: Math.max(0, notes.length - withGps),
    craneAnomaliesOver20Min: longDwell,
    ptoOpen: openPto,
    ptoSessionsWithoutNote: orphanSessions,
    ptoEventsInContext: events.length,
    ptoTotal: ptoSrc.count,
  };
}

async function getServerContext(question: string): Promise<string> {
  const [notes, orders, pto, catalog, gps, customers, dashboard, inquiries, handwritten, customerSites] =
    await Promise.all([
      loadSource("getNotes", ["notes", "data"], question, 12, true),
      loadSource("getOrders", ["orders", "data"], question, 12, true),
      loadSource("getIturanPto", ["events", "data"], question, 12, true),
      loadSource("getCatalog", ["rows", "data"], question, 8, true),
      loadSource("getGps", ["data", "stops", "gps"], question, 8, true),
      loadSource("getCustomers", ["data", "customers"], question, 8, true),
      loadSource("getDashboard", ["data"], question, 1, true),
      loadSource("getRamiInquiries", ["data", "inquiries"], question, 8, true),
      loadSource("getHandwritten", ["rows", "handwritten", "data"], question, 10, true),
      loadSource("getCustomerSites", ["sites", "data", "rows"], question, 10, true),
    ]);
  const liveSummary = buildLiveSummary(notes, pto);
  return JSON.stringify({
    fetchedAt: new Date().toISOString(),
    liveSummary,
    sources: {
      notes,
      orders,
      pto,
      productCatalog: catalog,
      gpsStops: gps,
      customers,
      dashboard,
      ramiInquiries: inquiries,
      handwritten,
      customerSites,
    },
  });
}
