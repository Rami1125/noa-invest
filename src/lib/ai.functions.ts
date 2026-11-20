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

async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

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

function resolveGeminiModels(): string[] {
  const raw = [process.env["GEMINI_MODELS"], process.env["GEMINI_MODEL"]]
    .filter(Boolean)
    .join(",");
  const defaults = [
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of `${raw},${defaults.join(",")}`.split(/[\n,;|]+/)) {
    const m = part.trim();
    if (!m || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

function isTransientGeminiStatus(status: number, body: string): boolean {
  if (status === 503 || status === 502 || status === 504) return true;
  if (status === 429) return true;
  return /UNAVAILABLE|high demand|try again later|temporarily|overloaded/i.test(body);
}

function buildGeminiContents(messages: Msg[]): { role: "user" | "model"; parts: { text: string }[] }[] {
  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
    const text = String(m.content || "").trim();
    if (!text) continue;
    contents.push({ role, parts: [{ text }] });
  }
  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: "שלום" }] });
  }
  return contents;
}

async function callGemini(instructions: string, messages: Msg[]): Promise<string> {
  const keys = resolveGeminiApiKeys();
  if (keys.length === 0) {
    throw new Error(
      "GEMINI_API_KEY לא מוגדר או לא תקין (צפוי מפתח שמתחיל ב-AIza…; ברשימה — הפרד בפסיק או שורה)",
    );
  }
  const models = resolveGeminiModels();
  const systemPrompt = String(instructions || "").trim() || "את נועה — עוזרת חמ\"ל לוגיסטי.";
  const contents = buildGeminiContents(messages);

  let lastErr = "";
  let hitQuota = false;
  let hitUnavailable = false;

  for (const model of models) {
    const generationConfig: Record<string, unknown> = {
      temperature: 0.3,
      maxOutputTokens: 4096,
    };
    if (/^gemini-2\.5/i.test(model) || model.includes("2.5")) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }
    const body = {
      systemInstruction: { parts: [{ text: systemPrompt.slice(0, 30_000) }] },
      contents,
      generationConfig,
    };

    for (let ki = 0; ki < keys.length; ki++) {
      const key = keys[ki]!;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(60_000),
          });
          if (!res.ok) {
            const errText = await res.text();
            lastErr = `Gemini HTTP ${res.status}: ${errText.slice(0, 300)}`;
            const invalidKey =
              res.status === 400 &&
              (/API_KEY_INVALID/i.test(errText) || /API key not valid/i.test(errText));
            if (invalidKey) break;
            if (res.status === 404 || /not found|NOT_FOUND/i.test(errText)) break;
            if (res.status === 429 || /quota|rate.?limit/i.test(errText)) {
              hitQuota = true;
              await sleepMs(500 + attempt * 500);
              break;
            }
            if (isTransientGeminiStatus(res.status, errText)) {
              hitUnavailable = true;
              await sleepMs(900 * (attempt + 1) + Math.floor(Math.random() * 400));
              continue;
            }
            if (res.status >= 500) {
              hitUnavailable = true;
              await sleepMs(800 * (attempt + 1));
              continue;
            }
            throw new Error(lastErr);
          }
          const data = (await res.json()) as {
            candidates?: { content?: { parts?: { text?: string }[] } }[];
            error?: { message?: string; status?: string };
          };
          if (data.error?.message) {
            const msg = data.error.message;
            const st = data.error.status || "";
            if (/API key not valid|API_KEY_INVALID/i.test(msg)) {
              lastErr = `Gemini API: ${msg.slice(0, 200)}`;
              break;
            }
            if (/quota|rate.?limit|429/i.test(msg)) {
              hitQuota = true;
              lastErr = `Gemini: ${msg.slice(0, 200)}`;
              break;
            }
            if (/UNAVAILABLE|high demand|try again later/i.test(msg) || st === "UNAVAILABLE") {
              hitUnavailable = true;
              lastErr = `Gemini: ${msg.slice(0, 200)}`;
              await sleepMs(900 * (attempt + 1));
              continue;
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
          if (/HTTP 429|quota|rate.?limit/i.test(lastErr)) {
            hitQuota = true;
            break;
          }
          if (/HTTP 400|HTTP 404/.test(lastErr)) {
            if (/HTTP 404/.test(lastErr)) break;
            throw new Error(lastErr);
          }
          if (/HTTP 503|UNAVAILABLE|high demand/i.test(lastErr)) {
            hitUnavailable = true;
          }
          if (attempt < 3) await sleepMs(700 * (attempt + 1));
        }
      }
    }
  }

  if (hitQuota) {
    throw new Error(
      `חריגת מכסת Gemini (free tier, ~20 בקשות/דקה). נוסו ${keys.length} מפתחות × ${models.length} מודלים. ` +
        `המתן כדקה ונסה שוב, או הגדר מפתח עם Billing / העלה מכסה ב-Google AI Studio.`,
    );
  }
  if (hitUnavailable) {
    throw new Error(
      `שירות Gemini עמוס כרגע (HTTP 503 / UNAVAILABLE). ` +
        `נוסו ${models.length} מודלים ו-${keys.length} מפתחות עם ניסיונות חוזרים. ` +
        `זה בדרך כלל זמני — לחץ "נסה שוב" בעוד 20–60 שניות.`,
    );
  }
  throw new Error(
    lastErr || `Gemini נכשל — נוסו ${keys.length} מפתחות ו-${models.length} מודלים`,
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
];

export const askNoa = createServerFn({ method: "POST" })
  .inputValidator((d: AskInput) => {
    const messages = Array.isArray(d?.messages) ? d.messages : [];
    if (messages.length === 0) throw new Error("חסרות הודעות");
    return {
      messages: messages.map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: String(m.content || "").slice(0, 20_000),
      })),
      customerNo: d.customerNo ? String(d.customerNo).trim() : undefined,
    };
  })
  .handler(async ({ data }) => {
    const { messages, customerNo } = data;
    const instructions = `את נועה — עוזרת חמ\"ל לוגיסטי של ח. סבן. עברית מלאה, תמציתית ומדויקת. אל תמציאי נתונים.`;
    const withContext: Msg[] = messages;
    const text = await callGemini(instructions, withContext);
    return { text, suggestedQuestions: DEFAULT_SUGGESTIONS };
  });

/** alias תאימות לאחור */
export const askNoaFn = askNoa;
