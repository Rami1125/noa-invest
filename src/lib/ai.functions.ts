/**
 * Server-side Gemini + GAS context for Noa (emergency restored core).
 */
import { createServerFn } from "@tanstack/react-start";
import { loadCustomerHistory } from "./customer-history.server";
import type { DeliveryNote } from "./data";
import { pairPtoEvents, analyzePto, type PtoRow } from "./smart-dispatch/pto-pairing";

type Msg = { role: "user" | "assistant"; content: string };
type AskInput = { messages: Msg[]; customerNo?: string };
type SourceResult = { available: boolean; count: number; records?: unknown[]; error?: string };

const MASTER_SHEET_ID = "1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw";
const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbx9d834wq3wm3z4XNHu7jIIhamopctR9dlHra6o4-PgYaflAhe3-VcYxNB4_abRkm_yyQ/exec";

function gasConfig() {
  const token = process.env["API_TOKEN"];
  if (!token) throw new Error("API_TOKEN לא מוגדר בשרת");
  const envUrl = process.env["GAS_URL"] || "";
  const stale = [
    "TwXhw",
    "AKfycbyv4x_fGMkWmjOLujRymJITBoGQpnbIbJnZp4S9nNs6sacQb1g7x8vyHjaCw6y_t7Pxiw",
    "AKfycbw6EmTxp0buRjEl7JfKihm4xq2NP3kbGr46lEEYP3x3Vy_3eVkaOTVzChVjXJn5vaS8Ug",
    "AKfycbwKcoR9kEAAapY9MZIm5cS3MwCsNhqJZgs6ZQDSB99EVcQZ3it8RoLwfAIuzpZXpALTuw",
  ];
  const url =
    envUrl && !stale.some((m) => envUrl.includes(m))
      ? envUrl
      : DEFAULT_GAS_URL;
  return { token, url };
}

async function fetchGasAction(action: string): Promise<unknown> {
  const { token, url } = gasConfig();
  const endpoint = new URL(url);
  endpoint.searchParams.set("action", action);
  endpoint.searchParams.set("token", token);
  if (action === "getNotes" || action === "getHandwritten" || action === "getIturanPto") {
    endpoint.searchParams.set("nocache", "1");
    endpoint.searchParams.set("_t", String(Date.now()));
  }
  if (action === "getIturanPto") {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 90);
    endpoint.searchParams.set("since", d.toISOString());
  }
  if (["getGps", "getCustomers", "getDashboard", "getRamiInquiries"].includes(action)) {
    endpoint.searchParams.set("sheetId", MASTER_SHEET_ID);
  }
  const response = await fetch(endpoint, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Apps Script HTTP ${response.status}`);
  const result: unknown = await response.json();
  if (!result || typeof result !== "object") throw new Error("תשובת GAS לא תקינה");
  const obj = result as Record<string, unknown>;
  if (obj.success === false) throw new Error(String(obj.error || "הפעולה נכשלה"));
  return result;
}

function rowsFrom(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
  }
  if (Array.isArray(obj.data)) return obj.data;
  return [];
}

function safeRecord(record: unknown): Record<string, unknown> {
  if (!record || typeof record !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record as Record<string, unknown>)) {
    if (v == null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 8);
    else out[k] = String(v).slice(0, 200);
  }
  return out;
}

function scoreRecord(record: Record<string, unknown>, question: string): number {
  const q = question.toLowerCase();
  let score = 0;
  for (const v of Object.values(record)) {
    const s = String(v || "").toLowerCase();
    if (!s) continue;
    if (q.includes(s) || s.includes(q.slice(0, 12))) score += 3;
    for (const token of q.split(/\s+/).filter((t) => t.length > 2)) {
      if (s.includes(token)) score += 1;
    }
  }
  return score;
}

function compactSource(
  payload: unknown,
  keys: string[],
  question: string,
  limit = 10,
  includeUnmatched = true,
): SourceResult {
  const rows = rowsFrom(payload, keys);
  if (!rows.length) return { available: true, count: 0, records: [] };
  const ranked = rows
    .map((record, index) => ({
      record: safeRecord(record),
      score: scoreRecord(safeRecord(record), question),
      index,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const chosen =
    includeUnmatched || ranked.some((r) => r.score > 0)
      ? ranked.slice(0, limit)
      : ranked.filter((r) => r.score > 0).slice(0, limit);
  return {
    available: true,
    count: rows.length,
    records: chosen.map(({ record }) => record),
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

function noteHasArchiveGps(n: Record<string, unknown>): boolean {
  const src = String(n.gpsSource || "").trim();
  const arrive = n.itArrive != null ? String(n.itArrive).trim() : "";
  const depart = n.itDepart != null ? String(n.itDepart).trim() : "";
  return (
    n.hasGpsMatch === true ||
    n.hasGpsMatch === "true" ||
    n.hasGpsMatch === 1 ||
    (Boolean(arrive) && Boolean(depart)) ||
    src === "sheet_AA_AB" ||
    src === "sheet_AH_AJ" ||
    src === "sheet_partial" ||
    src === "ituran_live"
  );
}

function noteHasGpsFields(n: Record<string, unknown>): boolean {
  return (
    "hasGpsMatch" in n ||
    "itArrive" in n ||
    "itDepart" in n ||
    "gpsSource" in n
  );
}

function noteIdOf(n: Record<string, unknown>): string {
  return String(n.id ?? n.docNumber ?? n["מספר תעודה"] ?? n.noteId ?? "").trim();
}

function toPtoRows(raw: unknown[]): PtoRow[] {
  return raw
    .map((item) => {
      const e = (item || {}) as Record<string, unknown>;
      return {
        truck: String(e.truck || e.plate || "").trim(),
        driver: String(e.driver || "").trim(),
        eventType: String(e.eventType || e.type || "").trim(),
        eventTimeIso: String(e.eventTimeIso || e.timeIso || e.openIso || e.eventTime || "").trim(),
        address: String(e.address || e.siteAddress || "").trim(),
      } satisfies PtoRow;
    })
    .filter((r) => r.truck && r.eventTimeIso && r.eventType);
}

function toDeliveryNotes(raw: unknown[]): DeliveryNote[] {
  return raw.map((item) => {
    const n = (item || {}) as Record<string, unknown>;
    return {
      id: noteIdOf(n) || "unknown",
      customer: String(n.customer || n.customerName || ""),
      date: String(n.date || n.docDate || n.deliveryDate || ""),
      items: Array.isArray(n.items) ? (n.items as DeliveryNote["items"]) : [],
      driver: String(n.driver || ""),
      siteAddress: String(n.siteAddress || n.address || n.fullAddress || ""),
      customerNo: n.customerNo != null ? String(n.customerNo) : undefined,
      hasGpsMatch:
        n.hasGpsMatch === true ||
        n.hasGpsMatch === "true" ||
        n.hasGpsMatch === 1 ||
        Boolean(String(n.itArrive || "").trim() && String(n.itDepart || "").trim()),
      gpsSource: (String(n.gpsSource || "") as DeliveryNote["gpsSource"]) || "",
      itArrive: n.itArrive != null ? String(n.itArrive) : undefined,
      itDepart: n.itDepart != null ? String(n.itDepart) : undefined,
      live: true,
    };
  });
}

function buildLiveSummary(
  allNotes: unknown[],
  allPto: unknown[],
  _allHandwritten: unknown[] = [],
): Record<string, unknown> {
  const notes = allNotes as Record<string, unknown>[];

  let notesWithArchiveGps = 0;
  let aaAb = 0;
  let ahAj = 0;
  let notesGpsFieldsMissing = 0;
  const withoutGpsIds: string[] = [];
  for (const n of notes) {
    const src = String(n.gpsSource || "").trim();
    if (!noteHasGpsFields(n)) {
      notesGpsFieldsMissing++;
      continue;
    }
    if (noteHasArchiveGps(n)) {
      notesWithArchiveGps++;
      if (src === "sheet_AA_AB") aaAb++;
      if (src === "sheet_AH_AJ") ahAj++;
    } else {
      const id = noteIdOf(n);
      if (id && withoutGpsIds.length < 15) withoutGpsIds.push(id);
    }
  }
  const gpsApiReady = notesGpsFieldsMissing < notes.length;
  const notesWithoutGps = gpsApiReady
    ? Math.max(0, notes.length - notesWithArchiveGps - notesGpsFieldsMissing)
    : 0;

  const ptoRows = toPtoRows(allPto);
  const deliveryNotes = toDeliveryNotes(allNotes);
  const paired = pairPtoEvents(ptoRows);
  const analysis = analyzePto(paired, deliveryNotes);
  const sessions = analysis.sessions;

  let openPtoCount = 0;
  let over20MinCount = 0;
  let maxDurationMin = 0;
  let matchedToNoteCount = 0;
  let unmatchedSessionsCount = 0;
  for (const s of sessions) {
    if (s.orphan === "missing_close") openPtoCount++;
    const dur = s.durationMin;
    if (dur != null && Number.isFinite(dur)) {
      if (dur > 20) over20MinCount++;
      if (dur > maxDurationMin) maxDurationMin = dur;
    }
    if (s.matchedNoteId) matchedToNoteCount++;
    else unmatchedSessionsCount++;
  }

  return {
    totalNotes: notes.length,
    notesWithArchiveGps,
    notesWithoutGps,
    notesWithoutGpsIds: withoutGpsIds,
    gpsApiReady,
    notesGpsFieldsMissing,
    gpsSourceAA_AB: aaAb,
    gpsSourceAH_AJ: ahAj,
    totalPtoEvents: ptoRows.length,
    totalPtoSessions: sessions.length,
    openPtoCount,
    over20MinCount,
    maxDurationMin,
    matchedToNoteCount,
    unmatchedSessionsCount,
    matchStats: analysis.matchStats,
  };
}

async function fetchFullRows(action: string, keys: string[]): Promise<unknown[]> {
  try {
    return rowsFrom(await fetchGasAction(action), keys);
  } catch {
    return [];
  }
}

async function getServerContext(question: string): Promise<string> {
  const [fullNotes, fullPto, fullHandwritten, notes, orders, pto, catalog, gps, customers, dashboard, inquiries, handwritten, customerSites] =
    await Promise.all([
      fetchFullRows("getNotes", ["notes", "data"]),
      fetchFullRows("getIturanPto", ["events", "data"]),
      fetchFullRows("getHandwritten", ["rows", "handwritten", "data"]),
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

  const liveSummary = buildLiveSummary(fullNotes, fullPto, fullHandwritten);

  const payload = {
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
  };
  let json = JSON.stringify(payload);
  if (json.length > 100_000) {
    json = JSON.stringify({
      fetchedAt: payload.fetchedAt,
      liveSummary,
      sources: {
        notes: { available: notes.available, count: notes.count, records: (notes.records || []).slice(0, 5) },
        pto: { available: pto.available, count: pto.count, records: (pto.records || []).slice(0, 5) },
        handwritten: { available: handwritten.available, count: handwritten.count },
        ramiInquiries: { available: inquiries.available, count: inquiries.count },
      },
      note: "sources קוצצו — השתמשי רק ב-liveSummary לספירות",
    });
  }
  return json;
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

function buildGeminiContents(messages: Msg[]): { role: "user" | "model"; parts: { text: string }[] }[] {
  const raw: { role: "user" | "model"; text: string }[] = [];
  for (const m of messages) {
    const text = String(m.content || "").trim();
    if (!text) continue;
    const role: "user" | "model" = m.role === "assistant" ? "model" : "user";
    if (raw.length > 0 && raw[raw.length - 1]!.role === role) {
      raw[raw.length - 1]!.text += "\n\n" + text;
    } else {
      raw.push({ role, text });
    }
  }
  if (raw.length > 0 && raw[0]!.role !== "user") {
    raw.unshift({ role: "user", text: "(הקשר מערכת)" });
  }
  if (raw.length === 0) {
    raw.push({ role: "user", text: "שלום" });
  }
  return raw.map((r) => ({
    role: r.role,
    parts: [{ text: r.text.slice(0, 120_000) }],
  }));
}

/** פירוק מפתחות מ-env: תומך במפתח בודד או ברשימה (פסיק / שורה חדשה / ;) */
function resolveGeminiApiKeys(): string[] {
  const raw = [
    process.env["GEMINI_API_KEY"],
    process.env["GEMINI_API_KEYS"],
    process.env["GOOGLE_API_KEY"],
  ]
    .filter(Boolean)
    .join("\n");
  if (!raw.trim()) return [];
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const part of raw.split(/[\n,;|]+/)) {
    let k = part.trim().replace(/^["']|["']$/g, "").trim();
    if (k.toLowerCase().startsWith("key=")) k = k.slice(4).trim();
    if (!k) continue;
    if (!/^AIza[0-9A-Za-z_-]{10,}$/.test(k)) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    keys.push(k);
  }
  return keys;
}

async function callGemini(instructions: string, messages: Msg[]): Promise<string> {
  const keys = resolveGeminiApiKeys();
  if (keys.length === 0) {
    throw new Error(
      "GEMINI_API_KEY לא מוגדר או לא תקין (צפוי מפתח שמתחיל ב-AIza…; ברשימה — הפרד בפסיק או שורה)",
    );
  }
  // gemini-2.0-flash הוצא משירות — ברירת מחדל gemini-3.8-flash
  const model = (process.env["GEMINI_MODEL"] || "gemini-3.8-flash").trim();

  const systemPrompt = String(instructions || "").trim() || "את נועה — עוזרת חמ״ל לוגיסטי.";
  const contents = buildGeminiContents(messages);

  const generationConfig: Record<string, unknown> = {
    temperature: 0.3,
    maxOutputTokens: 4096,
  };
  // thinkingConfig רק ל-gemini-2.5-* (במודלים אחרים עלול להחזיר 400)
  if (/^gemini-2\.5/i.test(model) || model.includes("2.5")) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt.slice(0, 30_000) }] },
    contents,
    generationConfig,
  };

  let lastErr = "";
  for (let ki = 0; ki < keys.length; ki++) {
    const key = keys[ki]!;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) {
          const errText = await res.text();
          lastErr = `Gemini HTTP ${res.status}: ${errText.slice(0, 400)}`;
          const invalidKey =
            res.status === 400 &&
            (/API_KEY_INVALID/i.test(errText) || /API key not valid/i.test(errText));
          if (invalidKey) break;
          if (res.status === 429 || res.status >= 500) {
            await sleepMs(800 * (attempt + 1));
            continue;
          }
          throw new Error(lastErr);
        }
        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
          error?: { message?: string };
        };
        if (data.error?.message) {
          const msg = data.error.message;
          if (/API key not valid|API_KEY_INVALID/i.test(msg)) {
            lastErr = `Gemini API: ${msg.slice(0, 200)}`;
            break;
          }
          throw new Error(`Gemini API: ${msg.slice(0, 400)}`);
        }
        const text =
          data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
        if (!text.trim()) throw new Error("תשובת Gemini ריקה");
        return text.trim();
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        if (/API_KEY_INVALID|API key not valid/i.test(lastErr)) break;
        if (/HTTP 400|HTTP 404/.test(lastErr)) throw new Error(lastErr);
        if (attempt < 1) await sleepMs(600 * (attempt + 1));
      }
    }
  }
  throw new Error(
    lastErr || `Gemini נכשל — נוסו ${keys.length} מפתחות (כולם נדחו או נכשלו)`,
  );
}

const DEFAULT_SUGGESTIONS = [
  {
    label: "סיכום יומי",
    query: "תני סיכום יומי קצר: כמה תעודות, כמה עם GPS מארכיון, כמה PTO פתוח וחריגות מעל 20 דק׳",
  },
  {
    label: "חריגי מנוף",
    query: "כמה סשני PTO מעל 20 דקות? משך מקסימלי וכמה לא משויכים לתעודה",
  },
  {
    label: "תעודות ללא GPS",
    query: "כמה תעודות ללא hasGpsMatch / ללא sheet_AA_AB או sheet_AH_AJ? רשימה קצרה",
  },
  {
    label: "PTO פתוח",
    query: "כמה סשני PTO פתוחים (orphan) כרגע?",
  },
];

export const askNoa = createServerFn({ method: "POST" })
  .inputValidator((d: AskInput) => {
    if (!d || !Array.isArray(d.messages) || d.messages.length === 0) {
      throw new Error("חסרות הודעות");
    }
    return {
      messages: d.messages.slice(-12).map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: String(m.content || "").slice(0, 8000),
      })),
      customerNo: d.customerNo ? String(d.customerNo).slice(0, 20) : undefined,
    };
  })
  .handler(async ({ data }) => {
    const { messages, customerNo } = data;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const question = lastUser?.content || "";

    if (/איפה.*(משאית|רכב|נהג)|מיקום חי|live location/i.test(question)) {
      return {
        text: "אין לי כרגע מיקום GPS חי ומאומת. אפשר לבדוק עצירות GPS היסטוריות או תעודות עם hasGpsMatch מארכיון.",
        suggestedQuestions: DEFAULT_SUGGESTIONS,
      };
    }

    const serverContext = await getServerContext(question);

    let customerBlock = "";
    if (customerNo) {
      try {
        const history = await loadCustomerHistory(customerNo);
        if (history?.customer) {
          customerBlock =
            "\n\nתיק לקוח:\n" +
            JSON.stringify({
              customerNo: history.customer.customerNo || customerNo,
              name: history.customer.name,
              notes: history.notes.slice(0, 12).map((n) => ({
                id: n.id,
                date: n.dateIso,
                address: n.address,
                driver: n.driver,
              })),
              orders: history.orders.slice(0, 8).map((o) => ({
                id: o.id,
                date: o.dateIso,
                status: o.status,
                address: o.address,
              })),
            });
        }
      } catch {
        customerBlock = "\n\nתיק לקוח לא זמין כרגע.";
      }
    }

    const instructions = `את נועה — עוזרת חמ״ל לוגיסטי של ח. סבן. עברית רגילה, חדה ותמציתית.
אורך: עד 150 מילים לשאלה רגילה; עד 250 לסיכום יומי או סקירת לקוח; עד 400 לפקודת NotebookLM.
מבנה רגיל: מסקנה קצרה -> בולטים או טבלת | -> שורת פעולה אחת. בלי markdown מיותר, בלי לנחש.

liveSummary הוא מקור האמת היחיד לסיכומים וספירות:
  totalNotes, notesWithArchiveGps, notesWithoutGps (+ notesWithoutGpsIds),
  gpsApiReady, notesGpsFieldsMissing,
  totalPtoSessions, openPtoCount, over20MinCount, maxDurationMin,
  matchedToNoteCount, unmatchedSessionsCount.
השתמשי רק ב-liveSummary לספירות — אל תספרי מתוך sources.*.records (זו דגימה חלקית).

GPS מארכיון — חוק קריטי:
  אם gpsApiReady === false או notesGpsFieldsMissing === totalNotes:
    כתבי במפורש "שדות GPS מארכיון לא זמינים כרגע מ-API (נדרש Deploy של extractArchiveGps ב-GAS)".
    אסור לכתוב "163 תעודות ללא GPS" או "כל התעודות ללא התאמה" או "חריגה משמעותית" על בסיס זה.
    notesWithoutGps במצב זה הוא 0 (לא ידוע) — לא להפוך לאירוע תפעולי.
  רק כש-gpsApiReady === true: דווחי notesWithArchiveGps ו-notesWithoutGps כמספרים אמיתיים.

פקודת מצגת / דוח הנהלה / NotebookLM Studio:
  אסור להחזיר JSON גולמי, אסור שדות כמו "query" או "notebookinstructions".
  החזירי טקסט עברי נקי ומוכן להעתקה ל-NotebookLM Studio, שמשלב את המספרים האמיתיים מ-liveSummary
  (תעודות, התאמות GPS מארכיון רק אם gpsApiReady, חריגות מעל 20 דק׳, PTO פתוח / לא משויך).

אל תציגי טלפונים, ח.פ או קישורי Drive.`;

    const withContext: Msg[] = [
      {
        role: "user",
        content: `נתוני מערכת (JSON):\n${serverContext}${customerBlock}`,
      },
      ...messages,
    ];

    const text = await callGemini(instructions, withContext);
    return { text, suggestedQuestions: DEFAULT_SUGGESTIONS };
  });

/** alias תאימות לאחור */
export const askNoaFn = askNoa;
