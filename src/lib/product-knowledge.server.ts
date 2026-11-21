/**
 * העשרת ידע טכני למוצר מילון לוגיסטי
 * מקורות: נתוני גיליון · techUrl · Gemini (מסומן כהעשרה)
 */
export type ProductKnowledgeInput = {
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
  listPrice: number | null;
  netPrice: number | null;
};

export type ProductKnowledge = {
  sku: string;
  summary: string;
  uses: string[];
  handling: string[];
  siteTips: string[];
  safety: string[];
  relatedTerms: string[];
  sources: string[];
  fromSheet: boolean;
  fromUrl: boolean;
  fromAi: boolean;
  generatedAt: string;
};

type CacheEntry = { at: number; data: ProductKnowledge };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000;

function resolveKeys(): string[] {
  const raw = [process.env["GEMINI_API_KEY"], process.env["GEMINI_API_KEYS"], process.env["GOOGLE_API_KEY"]]
    .filter(Boolean)
    .join("\n");
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\n,;|]+/)) {
    let k = part.trim().replace(/^["']|["']$/g, "");
    if (k.toLowerCase().startsWith("key=")) k = k.slice(4).trim();
    if (!/^AIza[0-9A-Za-z_-]{10,}$/.test(k)) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    keys.push(k);
  }
  return keys;
}

function resolveModels(): string[] {
  const raw = [process.env["GEMINI_MODELS"], process.env["GEMINI_MODEL"]].filter(Boolean).join(",");
  const defaults = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of `${raw},${defaults.join(",")}`.split(/[\n,;|]+/)) {
    const m = p.trim();
    if (!m || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

async function fetchUrlSnippet(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) return "";
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": "SabanLogisticsDict/1.0", Accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) return "";
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 4000);
  } catch {
    return "";
  }
}

function sheetBaseline(input: ProductKnowledgeInput): ProductKnowledge {
  const uses: string[] = [];
  const handling: string[] = [];
  const siteTips: string[] = [];
  const relatedTerms: string[] = [];

  if (input.category) uses.push(`קטגוריה לוגיסטית: ${input.category}`);
  if (input.unit) handling.push(`יחידת מידה: ${input.unit}`);
  if (input.weightKg != null) handling.push(`משקל יחידה: ${input.weightKg} ק\"ג`);
  if (input.deposit) siteTips.push(`פקדון/אריזה: ${input.deposit}`);
  if (input.warehouse) siteTips.push(`מחסן מקור: ${input.warehouse}`);
  if (input.keywords) {
    for (const t of input.keywords.split(/[,|؛;]/).map((x) => x.trim()).filter(Boolean).slice(0, 8)) {
      relatedTerms.push(t);
    }
  }
  if (input.techInfo) uses.push(input.techInfo.slice(0, 280));

  const summaryParts = [
    input.name,
    input.category ? `(${input.category})` : "",
    input.unit ? `· יח׳ ${input.unit}` : "",
    input.weightKg != null ? `· ${input.weightKg} ק\"ג` : "",
  ].filter(Boolean);

  return {
    sku: input.sku,
    summary: summaryParts.join(" ") || input.name,
    uses,
    handling,
    siteTips,
    safety: ["יש לפעול לפי הוראות היצרן ותנאי האתר."],
    relatedTerms,
    sources: ["מילון_לוגיסט (גיליון)"],
    fromSheet: true,
    fromUrl: false,
    fromAi: false,
    generatedAt: new Date().toISOString(),
  };
}

async function geminiEnrich(
  input: ProductKnowledgeInput,
  urlSnippet: string,
): Promise<Partial<ProductKnowledge> | null> {
  const keys = resolveKeys();
  if (!keys.length) return null;

  const prompt = `אתה יועץ טכני לחומרי בניין בח. סבן (ישראל). ענה בעברית תמציתית ומקצועית.
החזר JSON בלבד במבנה:
{"summary":"משפט אחד","uses":["..."],"handling":["..."],"siteTips":["..."],"safety":["..."],"relatedTerms":["..."]}
כל מערך: 2–5 פריטים קצרים.
אל תמציא מספרי תקן, מחירי שוק או נתונים מספריים שלא ניתנו.
אם אינך בטוח — כתוב ניסוח כללי לקטגוריה.
מוצר:
מק\"ט: ${input.sku}
שם: ${input.name}
קטגוריה: ${input.category || "לא צוין"}
יחידה: ${input.unit || "—"}
משקל: ${input.weightKg ?? "—"}
סלנג: ${input.keywords || "—"}
מידע מהגיליון: ${input.techInfo || "—"}
${urlSnippet ? `קטע מדף יצרן/טכני:\n${urlSnippet.slice(0, 2500)}` : "אין קטע URL"}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
  };

  for (const model of resolveModels()) {
    for (const key of keys) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(25_000),
        });
        if (!res.ok) continue;
        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        const arr = (v: unknown): string[] =>
          Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 6) : [];
        return {
          summary: String(parsed.summary || "").trim(),
          uses: arr(parsed.uses),
          handling: arr(parsed.handling),
          siteTips: arr(parsed.siteTips),
          safety: arr(parsed.safety),
          relatedTerms: arr(parsed.relatedTerms),
        };
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

function mergeKnowledge(
  base: ProductKnowledge,
  ai: Partial<ProductKnowledge> | null,
  fromUrl: boolean,
): ProductKnowledge {
  const uniq = (a: string[]) => [...new Set(a.map((x) => x.trim()).filter(Boolean))];
  const sources = [...base.sources];
  if (fromUrl) sources.push("דף טכני (URL מהגיליון)");
  if (ai) sources.push("העשרת ידע (Gemini · מסומן)");

  return {
    ...base,
    summary: (ai?.summary && ai.summary.length > 10 ? ai.summary : base.summary) || base.summary,
    uses: uniq([...(ai?.uses || []), ...base.uses]).slice(0, 8),
    handling: uniq([...(ai?.handling || []), ...base.handling]).slice(0, 8),
    siteTips: uniq([...(ai?.siteTips || []), ...base.siteTips]).slice(0, 8),
    safety: uniq([...(ai?.safety || []), ...base.safety]).slice(0, 6),
    relatedTerms: uniq([...(ai?.relatedTerms || []), ...base.relatedTerms]).slice(0, 10),
    sources,
    fromUrl,
    fromAi: Boolean(ai),
    generatedAt: new Date().toISOString(),
  };
}

export async function enrichProductKnowledge(input: ProductKnowledgeInput): Promise<ProductKnowledge> {
  const sku = String(input.sku || "").trim();
  if (!sku) throw new Error("חסר מק\"ט");

  const hit = cache.get(sku);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const base = sheetBaseline(input);
  let urlSnippet = "";
  let fromUrl = false;
  if (input.techUrl) {
    urlSnippet = await fetchUrlSnippet(input.techUrl);
    fromUrl = Boolean(urlSnippet);
  }

  const ai = await geminiEnrich(input, urlSnippet);
  const data = mergeKnowledge(base, ai, fromUrl);
  cache.set(sku, { at: Date.now(), data });
  return data;
}
