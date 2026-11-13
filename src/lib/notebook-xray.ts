/**
 * notebook-xray — עזרי עברית, פקדונות, TTS, קבועי Notebook
 * מוצלבים מ-notebook_1.tsx (גרסת נובמבר 2026)
 */
import { Users, FileText, MapPin, Truck } from "lucide-react";

export const TABS = [
  { id: "customers", label: "לקוחות מאוחדים", icon: Users },
  { id: "notes", label: "תעודות משלוח", icon: FileText },
  { id: "sites", label: "אתרי אספקה", icon: MapPin },
  { id: "pto", label: "מנוף איתוראן PTO", icon: Truck },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export const CHART_COLORS = [
  "#06b6d4", "#10b981", "#8b5cf6", "#f59e0b",
  "#3b82f6", "#ec4899", "#14b8a6", "#6366f1",
];

export const PTO_ALERT_MIN = 20;

export type ReportMode = "internal" | "customer";

export interface HeNoun {
  plural: string;
  singular: string;
  gender: "m" | "f";
}

const HE_NOUNS: HeNoun[] = [
  { plural: "תעודות משלוח", singular: "תעודת משלוח", gender: "f" },
  { plural: "פריקות מנוף מאומתות", singular: "פריקת מנוף מאומתת", gender: "f" },
  { plural: "פריקות מנוף", singular: "פריקת מנוף", gender: "f" },
  { plural: "אתרי אספקה", singular: "אתר אספקה", gender: "m" },
  { plural: "אתרי עבודה ממופים", singular: "אתר עבודה ממופה", gender: "m" },
  { plural: "אתרי עבודה", singular: "אתר עבודה", gender: "m" },
  { plural: "לקוחות פעילים", singular: "לקוח פעיל", gender: "m" },
  { plural: "אתרים פעילים", singular: "אתר פעיל", gender: "m" },
  { plural: "בירורים פתוחים", singular: "בירור פתוח", gender: "m" },
  { plural: "תעודות", singular: "תעודה", gender: "f" },
  { plural: "הזמנות", singular: "הזמנה", gender: "f" },
  { plural: "פריקות", singular: "פריקה", gender: "f" },
  { plural: "לקוחות", singular: "לקוח", gender: "m" },
  { plural: "אתרים", singular: "אתר", gender: "m" },
  { plural: "בירורים", singular: "בירור", gender: "m" },
  { plural: "ביקורים", singular: "ביקור", gender: "m" },
  { plural: "משטחי סבן", singular: "משטח סבן", gender: "m" },
  { plural: "משטחים", singular: "משטח", gender: "m" },
  { plural: "בלות", singular: "בלה", gender: "f" },
  { plural: "דקות", singular: "דקה", gender: "f" },
  { plural: "שעות", singular: "שעה", gender: "f" },
  { plural: "שניות", singular: "שנייה", gender: "f" },
  { plural: "שקים", singular: "שק", gender: "m" },
  { plural: "משאיות", singular: "משאית", gender: "f" },
  { plural: "נסיעות", singular: "נסיעה", gender: "f" },
  { plural: "שקפים", singular: "שקף", gender: "m" },
];

const HE_NOUN_BY_PLURAL = new Map(HE_NOUNS.map((n) => [n.plural, n]));
const HE_NOUN_PATTERN = [...HE_NOUNS]
  .sort((a, b) => b.plural.length - a.plural.length)
  .map((n) => n.plural.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const ONES_F = ["אפס", "אחת", "שתיים", "שלוש", "ארבע", "חמש", "שש", "שבע", "שמונה", "תשע"];
const ONES_M = ["אפס", "אחד", "שניים", "שלושה", "ארבעה", "חמישה", "שישה", "שבעה", "שמונה", "תשעה"];
const TEENS_F = ["עשר", "אחת עשרה", "שתים עשרה", "שלוש עשרה", "ארבע עשרה", "חמש עשרה", "שש עשרה", "שבע עשרה", "שמונה עשרה", "תשע עשרה"];
const TEENS_M = ["עשרה", "אחד עשר", "שנים עשר", "שלושה עשר", "ארבעה עשר", "חמישה עשר", "שישה עשר", "שבעה עשר", "שמונה עשר", "תשעה עשר"];
const TENS_W = ["", "עשר", "עשרים", "שלושים", "ארבעים", "חמישים", "שישים", "שבעים", "שמונים", "תשעים"];
const HUNDREDS_W = ["", "מאה", "מאתיים", "שלוש מאות", "ארבע מאות", "חמש מאות", "שש מאות", "שבע מאות", "שמונה מאות", "תשע מאות"];

export function hebNumber(n: number, g: "m" | "f"): string {
  if (n === 0) return "אפס";
  const ones = g === "f" ? ONES_F : ONES_M;
  const teens = g === "f" ? TEENS_F : TEENS_M;
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(HUNDREDS_W[h]!);
  if (rest) {
    if (rest < 10) parts.push(ones[rest]!);
    else if (rest < 20) parts.push(teens[rest - 10]!);
    else {
      parts.push(TENS_W[Math.floor(rest / 10)]!);
      if (rest % 10) parts.push(ones[rest % 10]!);
    }
  }
  if (parts.length > 1) parts[parts.length - 1] = "ו" + parts[parts.length - 1];
  return parts.join(" ");
}

export function hebCountPhrase(n: number, noun: HeNoun): string {
  if (n === 1) return `${noun.singular} ${noun.gender === "f" ? "אחת" : "אחד"}`;
  if (n === 2) return `${noun.gender === "f" ? "שתי" : "שני"} ${noun.plural}`;
  return `${hebNumber(n, noun.gender)} ${noun.plural}`;
}

export function cnt(n: number, plural: string): string {
  const noun = HE_NOUN_BY_PLURAL.get(plural);
  if (!noun) return `${n} ${plural}`;
  return n === 1 ? hebCountPhrase(1, noun) : `${n} ${plural}`;
}

export function cntAnd(n: number, plural: string): string {
  const s = cnt(n, plural);
  return /^\d/.test(s) ? `ו-${s}` : `ו${s}`;
}

export function numbersToHebrewWords(input: string): string {
  let text = input.replace(/דק['׳’]/g, "דקות").replace(/שנ['׳’]/g, "שניות");
  const prevOk = (whole: string, idx: number): boolean => {
    const prev = idx > 0 ? whole[idx - 1] : "";
    if (!prev) return true;
    if (/[\d#:.,/\-–]/.test(prev)) return false;
    const before = whole.slice(Math.max(0, idx - 6), idx);
    return !/מספר\s$/.test(before);
  };
  const rangeRe = new RegExp(`((?:[\\u0590-\\u05FF]-)?)(\\d{1,3})[–](\\d{1,3})(\\s+)(${HE_NOUN_PATTERN})(?![\\u0590-\\u05FF])`, "g");
  text = text.replace(rangeRe, (m, pre: string, a: string, b: string, sp: string, plural: string, offset: number, whole: string) => {
    if (!pre && !prevOk(whole, offset)) return m;
    const noun = HE_NOUN_BY_PLURAL.get(plural)!;
    return `${pre ? pre[0] : ""}${hebNumber(Number(a), noun.gender)} עד ${hebNumber(Number(b), noun.gender)}${sp}${plural}`;
  });
  const singleRe = new RegExp(`((?:[\\u0590-\\u05FF]-)?)(\\d{1,3})(\\s+)(${HE_NOUN_PATTERN})(?![\\u0590-\\u05FF])`, "g");
  text = text.replace(singleRe, (m, pre: string, num: string, _sp: string, plural: string, offset: number, whole: string) => {
    if (!pre && !prevOk(whole, offset)) return m;
    const noun = HE_NOUN_BY_PLURAL.get(plural)!;
    const phrase = hebCountPhrase(Number(num), noun);
    return pre ? `${pre[0]}${phrase}` : phrase;
  });
  return text;
}

export function polishHebrewForSpeech(input: string): string {
  return numbersToHebrewWords(input)
    .replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, "")
    .replace(/(\d)-(?=\d)/g, "$1 ")
    .replace(/[•#*_]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function splitNarration(prompt: string): { head: string; narration: string } {
  const idx = prompt.indexOf("🎙");
  if (idx < 0) return { head: "", narration: prompt };
  const nl = prompt.indexOf("\n", idx);
  if (nl < 0) return { head: prompt, narration: "" };
  return { head: prompt.slice(0, nl + 1), narration: prompt.slice(nl + 1) };
}

export function polishNarrationInPrompt(prompt: string): string {
  const { head, narration } = splitNarration(prompt);
  if (!head) return prompt;
  return head + numbersToHebrewWords(narration);
}

export interface DepositTotals {
  pallets: number;
  bags: number;
  hasData: boolean;
}

export function parseDepositQty(raw: string): { pallets: number; bags: number } {
  const text = raw.replace(/\d{4,}/g, " ");
  const re = /(?:(\d{1,3})\s*)?(משטח\w*|בלה|בלות|שק(?:ים)? גדול(?:ים)?)(?:\s*[:xX×]\s*(\d{1,3}))?/g;
  let pallets = 0;
  let bags = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const qty = Number(m[1] ?? m[3] ?? 1);
    if (m[2]!.startsWith("משטח")) pallets += qty;
    else bags += qty;
  }
  return { pallets, bags };
}

export function sumDeposits(notes: Array<Record<string, unknown>>): DepositTotals {
  let pallets = 0;
  let bags = 0;
  let hasData = false;
  for (const n of notes) {
    const dep = String(n.deposits || n["פיקדונות"] || n["פקדונות"] || "").trim();
    if (!dep) continue;
    hasData = true;
    const q = parseDepositQty(dep);
    pallets += q.pallets;
    bags += q.bags;
  }
  return { pallets, bags, hasData };
}

export function depositsPhrase(d: DepositTotals): string | null {
  if (!d.hasData) return null;
  return `${cnt(d.pallets, "משטחים")} ${cntAnd(d.bags, "בלות")}`;
}

export function stripInternalMarkers(text: string): string {
  return text
    .replace(/\s*\(?\s*\b\d{3}-\d{2}-\d{3}\b\s*\)?/g, " ")
    .replace(/\s*\(?\s*עד\s*\d+(?:\.\d+)?\s*טון(?:\s*נטו)?\s*\)?/g, " ")
    .replace(/איתוראן/g, "מערכת המעקב")
    .replace(/\bPTO\b/g, "מנוף")
    .replace(/\bLIFO\b/g, "")
    .replace(/[ \t]{2,}/g, " ");
}

export function polishForTts(raw: string): string {
  return polishHebrewForSpeech(splitNarration(raw).narration || raw);
}
