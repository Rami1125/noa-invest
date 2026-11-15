/**
 * נרמול עברית לחיפוש: ניקוד, גרשיים, אותיות סופיות, רווחים
 */

const NIKUD_RE = /[\u0591-\u05C7]/g;
const GERESH_RE = /['׳״"''`]/g;
const MULTI_SPACE = /\s+/g;

const FINAL_TO_REGULAR: Record<string, string> = {
  ך: "כ",
  ם: "מ",
  ן: "נ",
  ף: "פ",
  ץ: "צ",
};

export function normalizeHebrew(input: string): string {
  let s = String(input || "")
    .normalize("NFKC")
    .replace(NIKUD_RE, "")
    .replace(GERESH_RE, "")
    .toLowerCase()
    .trim();

  s = s
    .split("")
    .map((ch) => FINAL_TO_REGULAR[ch] || ch)
    .join("");

  return s.replace(MULTI_SPACE, " ").trim();
}

/** האם q (מנורמל) מופיע בתוך haystack (מנורמל) */
export function hebrewIncludes(haystack: string, query: string): boolean {
  const h = normalizeHebrew(haystack);
  const q = normalizeHebrew(query);
  if (!q) return true;
  return h.includes(q);
}

/**
 * מחזיר חלקי טקסט להדגשת התאמה (לפני, התאמה, אחרי) — לפי אינדקס במחרוזת המקורית
 * אם אין התאמה: [{ text, match: false }]
 */
export function splitHighlight(source: string, query: string): { text: string; match: boolean }[] {
  const q = normalizeHebrew(query);
  if (!q || q.length < 2) return [{ text: source, match: false }];

  const normSource = normalizeHebrew(source);
  const idx = normSource.indexOf(q);
  if (idx < 0) return [{ text: source, match: false }];

  // קירוב: חיתוך לפי יחס אורך (מספיק להדגשה ויזואלית)
  const ratio = source.length / Math.max(1, normSource.length);
  const start = Math.max(0, Math.floor(idx * ratio));
  const end = Math.min(source.length, Math.ceil((idx + q.length) * ratio));

  const parts: { text: string; match: boolean }[] = [];
  if (start > 0) parts.push({ text: source.slice(0, start), match: false });
  parts.push({ text: source.slice(start, end), match: true });
  if (end < source.length) parts.push({ text: source.slice(end), match: false });
  return parts.length ? parts : [{ text: source, match: false }];
}
