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

function noteHasArchiveGps(n: Record<string, unknown>): boolean {
  const src = String(n.gpsSource || "");
  return (
    n.hasGpsMatch === true ||
    n.hasGpsMatch === "true" ||
    Boolean(n.itArrive && n.itDepart) ||
    src === "sheet_AA_AB" ||
    src === "sheet_AH_AJ"
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
      hasGpsMatch: n.hasGpsMatch === true || n.hasGpsMatch === "true",
      gpsSource: (String(n.gpsSource || "") as DeliveryNote["gpsSource"]) || "",
      itArrive: n.itArrive != null ? String(n.itArrive) : undefined,
      itDepart: n.itDepart != null ? String(n.itDepart) : undefined,
      live: true,
    };
  });
}

/** liveSummary על המערך המלא (לפני compactSource) — מקור האמת לסיכומים */
function buildLiveSummary(
  allNotes: unknown[],
  allPto: unknown[],
  _allHandwritten: unknown[] = [],
): Record<string, unknown> {
  const notes = allNotes as Record<string, unknown>[];

  let notesWithArchiveGps = 0;
  let aaAb = 0;
  let ahAj = 0;
  const withoutGpsIds: string[] = [];
  for (const n of notes) {
    const src = String(n.gpsSource || "");
    if (noteHasArchiveGps(n)) {
      notesWithArchiveGps++;
      if (src === "sheet_AA_AB") aaAb++;
      if (src === "sheet_AH_AJ") ahAj++;
    } else {
      // hasGpsMatch === false / חסר — רק תעודות שבאמת ללא GPS
      if (n.hasGpsMatch === true || n.hasGpsMatch === "true") continue;
      const id = noteIdOf(n);
      if (id && withoutGpsIds.length < 15) withoutGpsIds.push(id);
    }
  }

  // סשני PTO אמיתיים דרך pairPtoEvents + analyzePto (כמו ב-/chat)
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
    if (s.orphan === "missing_close" || s.orphan === "missing_open") openPtoCount++;
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
    notesWithoutGps: Math.max(0, notes.length - notesWithArchiveGps),
    notesWithoutGpsIds: withoutGpsIds,
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
  // מערכים מלאים ל-liveSummary (לפני compact) + מקורות דחוסים להקשר
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

  // מקור אמת לסיכומים — על כל הרשומות, לא על הדגימה
  const liveSummary = buildLiveSummary(fullNotes, fullPto, fullHandwritten);

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

async function sleepMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(instructions: string, input: Msg[]): Promise<string> {
  const keys = (process.env["GEMINI_API_KEYS"] || process.env["GEMINI_API_KEY"] || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (!keys.length) throw new Error("שירות הבינה אינו מוגדר בשרת: חסר GEMINI_API_KEY");
  const models = (process.env["GEMINI_MODELS"] || "gemini-2.5-flash,gemini-2.5-flash-lite")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const contents = input.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));
  const maxAttempts = Math.max(4, keys.length + 1);
  let lastStatus = 0;
  let lastDetail = "";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const apiKey = keys[attempt % keys.length]!;
    const model = models[Math.min(attempt, models.length - 1)]!;
    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instructions }] },
            contents,
            generationConfig: {
              temperature: 0.15,
              maxOutputTokens: 2048,
              // gemini-2.5-flash: אל תשרוף תקציב output על thinking פנימי
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
          signal: AbortSignal.timeout(35_000),
        },
      );
    } catch (err) {
      lastDetail = err instanceof Error ? err.message.slice(0, 120) : "network";
      if (attempt < maxAttempts - 1) {
        await sleepMs(700 * Math.pow(2, attempt));
        continue;
      }
      throw new Error("שירות הבינה לא הגיב בזמן. נסו שוב בעוד רגע.");
    }
    if (response.ok) {
      const result = await response.json();
      const text = result?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || "")
        .join("");
      if (typeof text === "string" && text.trim()) return text.trim();
      throw new Error("שירות הבינה לא החזיר תשובה תקינה");
    }
    lastStatus = response.status;
    lastDetail = (await response.text()).slice(0, 180);
    if (response.status === 404) {
      if (attempt < maxAttempts - 1) continue;
      throw new Error("מודל הבינה לא נמצא (404). בדקו GEMINI_MODELS.");
    }
    if (response.status === 429 || response.status === 503) {
      if (attempt < maxAttempts - 1) {
        await sleepMs(900 * Math.pow(2, attempt));
        continue;
      }
      throw new Error("שירות הבינה עמוס או חרג ממכסה (429).");
    }
    throw new Error(`שירות הבינה החזיר שגיאה (${response.status}) · מודל: ${model}`);
  }
  throw new Error(lastStatus ? `שירות הבינה החזיר שגיאה (${lastStatus})` : `שירות הבינה נכשל: ${lastDetail || "לא ידוע"}`);
}

function asksCurrentGps(question: string): boolean {
  return /(?:מיקום|איפה|היכן).{0,45}(?:משאית|רכב)|(?:gps|איתוראן).{0,45}(?:מיקום|משאית|כרגע|עכשיו)/i.test(
    question,
  );
}

const DEFAULT_SUGGESTIONS = [
  {
    id: "daily-summary",
    label: "סיכום יומי",
    query: "תני סיכום יומי קצר: כמה תעודות, כמה עם GPS מארכיון, כמה PTO פתוח וחריגות מעל 20 דק׳",
    icon: "file" as const,
  },
  {
    id: "crane-anomalies",
    label: "חריגי מנוף",
    query: "הציגי חריגי מנוף: שהיות מעל 20 דקות, פער מול כתב יד, וסשנים ללא תעודה",
    icon: "alert" as const,
  },
  {
    id: "notes-no-gps",
    label: "תעודות ללא GPS",
    query: "כמה תעודות ללא hasGpsMatch / ללא sheet_AA_AB או sheet_AH_AJ? רשימה קצרה",
    icon: "search" as const,
  },
  {
    id: "pto-open",
    label: "PTO פתוח",
    query: "כמה סשני PTO פתוחים (יתומים / missing_close) ואיפה?",
    icon: "gauge" as const,
  },
];

export const askNoa = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("בקשה לא תקינה");
    const raw = input as { messages?: unknown; customerNo?: unknown };
    const messages = raw.messages;
    if (!Array.isArray(messages) || messages.length > 40) throw new Error("היסטוריית שיחה לא תקינה");
    const clean: Msg[] = messages.slice(-16).map((item) => {
      if (!item || typeof item !== "object") throw new Error("הודעה לא תקינה");
      const candidate = item as Record<string, unknown>;
      if (candidate.role !== "user" && candidate.role !== "assistant") throw new Error("תפקיד הודעה לא תקין");
      if (typeof candidate.content !== "string") throw new Error("תוכן הודעה לא תקין");
      return { role: candidate.role, content: candidate.content.slice(0, 2500) };
    });
    while (clean[0]?.role === "assistant") clean.shift();
    if (!clean.some((message) => message.role === "user")) throw new Error("חסרה שאלת משתמש");
    const customerNo = typeof raw.customerNo === "string" ? raw.customerNo.trim() : "";
    if (customerNo && !/^\d{3,10}$/.test(customerNo)) throw new Error("מספר לקוח לא תקין");
    return { messages: clean, customerNo: customerNo || undefined } satisfies AskInput;
  })
  .handler(async ({ data }) => {
    const { messages, customerNo } = data;
    const question = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
    if (asksCurrentGps(question)) {
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
        customerBlock =
          "\n\nתיק לקוח " +
          customerNo +
          ":\n" +
          JSON.stringify({
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
      } catch {
        customerBlock = "\n\nתיק לקוח לא זמין כרגע.";
      }
    }

    const instructions = `את נועה — עוזרת חמ״ל לוגיסטי של ח. סבן. עברית רגילה, חדה ותמציתית.
אורך: עד 150 מילים לשאלה רגילה; עד 250 לסיכום יומי או סקירת לקוח; עד 400 לפקודת NotebookLM.
מבנה רגיל: מסקנה קצרה -> בולטים או טבלת | -> שורת פעולה אחת. בלי markdown מיותר, בלי לנחש.

liveSummary הוא מקור האמת היחיד לסיכומים וספירות:
  totalNotes, notesWithArchiveGps, notesWithoutGps (+ notesWithoutGpsIds),
  totalPtoSessions, openPtoCount, over20MinCount, maxDurationMin,
  matchedToNoteCount, unmatchedSessionsCount.
השתמשי רק ב-liveSummary לספירות — אל תספרי מתוך sources.*.records (זו דגימה חלקית).

פקודת מצגת / דוח הנהלה / NotebookLM Studio:
  אסור להחזיר JSON גולמי, אסור שדות כמו "query" או "notebookinstructions".
  החזירי טקסט עברי נקי ומוכן להעתקה ל-NotebookLM Studio, שמשלב את המספרים האמיתיים מ-liveSummary
  (תעודות, התאמות GPS מארכיון, חריגות מעל 20 דק׳, PTO פתוח / לא משויך).

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
