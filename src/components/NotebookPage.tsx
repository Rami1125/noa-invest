/**
 * /notebook — חדר רנטגן תפעולי וניתוח AI מהיר (נועה מסבירה ומקריינת בגובה העיניים)
 * ח. סבן חומרי בניין (1994) בע"מ — סניף התלמיד 6 הוד השרון
 * כולל: סריקת KPI, סינון לפי טאבים, ניתוח AI חי לכל לקוח/תעודה/אתר/PTO,
 * קריינות קולית חיה של נועה בעברית קלילה ובגובה העיניים,
 * והפקת פקודות דינמיות למצגת, וידאו והסבר קולי עם דגש על הזמנה מרוכזת והיערכות להפתעות מעובדים.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCopy,
  Clock,
  ExternalLink,
  FileText,
  Layers,
  MapPin,
  Package,
  Presentation,
  RefreshCw,
  ScanSearch,
  Search,
  Sparkles,
  TrendingUp,
  Truck,
  User,
  Users,
  Video,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { getSiteAtlasFn, listCustomerIndexFn } from "@/lib/customer-history.functions";
import { listNotesFn, listPtoFn } from "@/lib/notes-api.functions";
import { pairPtoEvents, type PairedPtoSession } from "@/lib/smart-dispatch/pto-pairing";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notebook")({
  head: () => ({ meta: [{ title: "חדר רנטגן תפעולי ו-Notebook · ח. סבן" }] }),
  component: NotebookPage,
});

const TABS = [
  { id: "customers", label: "לקוחות מאוחדים", icon: Users },
  { id: "notes", label: "תעודות משלוח", icon: FileText },
  { id: "sites", label: "אתרי אספקה", icon: MapPin },
  { id: "pto", label: "מנוף איתוראן PTO", icon: Truck },
] as const;

type TabId = (typeof TABS)[number]["id"];

const CHART_COLORS = [
  "#06b6d4", // cyan-500
  "#10b981", // emerald-500
  "#8b5cf6", // purple-500
  "#f59e0b", // amber-500
  "#3b82f6", // blue-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#6366f1", // indigo-500
];

interface SelectedEntity {
  type: "customer" | "note" | "site" | "pto";
  id: string;
  title: string;
  data: any;
}

// ───────────── עזרי עברית, פקדונות ומצב הפקה (בתוך הקובץ, בלי תלות חיצונית) ─────────────
type ReportMode = "internal" | "customer";

interface HeNoun {
  plural: string;
  singular: string;
  gender: "m" | "f";
}

// מילון שמות עצם שמופיעים בפקודות. סדר לא משנה — נמיין לפי אורך (הארוך קודם).
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
  { plural: "משטחי בלוקים", singular: "משטח בלוקים", gender: "m" },
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

/** מספר 0–999 במילים, לפי מין (m = זכר, f = נקבה). */
function hebNumber(n: number, g: "m" | "f"): string {
  if (n === 0) return "אפס";
  const ones = g === "f" ? ONES_F : ONES_M;
  const teens = g === "f" ? TEENS_F : TEENS_M;
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(HUNDREDS_W[h]);
  if (rest) {
    if (rest < 10) parts.push(ones[rest]);
    else if (rest < 20) parts.push(teens[rest - 10]);
    else {
      parts.push(TENS_W[Math.floor(rest / 10)]);
      if (rest % 10) parts.push(ones[rest % 10]);
    }
  }
  if (parts.length > 1) parts[parts.length - 1] = "ו" + parts[parts.length - 1];
  return parts.join(" ");
}

function hebCountPhrase(n: number, noun: HeNoun): string {
  if (n === 1) return `${noun.singular} ${noun.gender === "f" ? "אחת" : "אחד"}`;
  if (n === 2) return `${noun.gender === "f" ? "שתי" : "שני"} ${noun.plural}`;
  return `${hebNumber(n, noun.gender)} ${noun.plural}`;
}

/** לשימוש בתוך פקודות: 1 → "תעודה אחת", אחרת "5 תעודות" (בלי המצאת מספרים). */
function cnt(n: number, plural: string): string {
  const noun = HE_NOUN_BY_PLURAL.get(plural);
  if (!noun) return `${n} ${plural}`;
  return n === 1 ? hebCountPhrase(1, noun) : `${n} ${plural}`;
}

/** כמו cnt אבל עם "ו" מחברת: "ו-3 בלות" / "ובלה אחת". */
function cntAnd(n: number, plural: string): string {
  const s = cnt(n, plural);
  return /^\d/.test(s) ? `ו-${s}` : `ו${s}`;
}

/**
 * מילוי קריינות: מספרים צמודים לשם עצם מוכר → מילים בעברית עם יחיד/רבים ומין נכונים.
 * מספרים בלי שם עצם מוכר (מס' לקוח, שעות, קודי מק"ט, לוחיות) נשארים כספרות.
 */
function numbersToHebrewWords(input: string): string {
  let text = input.replace(/דק['׳’]/g, "דקות").replace(/שנ['׳’]/g, "שניות");

  const prevOk = (whole: string, idx: number): boolean => {
    const prev = idx > 0 ? whole[idx - 1] : "";
    if (!prev) return true;
    if (/[\d#:.,/\-–]/.test(prev)) return false;
    const before = whole.slice(Math.max(0, idx - 6), idx);
    return !/מספר\s$/.test(before);
  };

  // טווחים: "15–20 דקות" → "חמש עשרה עד עשרים דקות"
  const rangeRe = new RegExp(`((?:[\\u0590-\\u05FF]-)?)(\\d{1,3})[–](\\d{1,3})(\\s+)(${HE_NOUN_PATTERN})(?![\\u0590-\\u05FF])`, "g");
  text = text.replace(rangeRe, (m, pre: string, a: string, b: string, sp: string, plural: string, offset: number, whole: string) => {
    if (!pre && !prevOk(whole, offset)) return m;
    const noun = HE_NOUN_BY_PLURAL.get(plural)!;
    return `${pre ? pre[0] : ""}${hebNumber(Number(a), noun.gender)} עד ${hebNumber(Number(b), noun.gender)}${sp}${plural}`;
  });

  // מספר + שם עצם: "1 אתרים פעילים" → "אתר פעיל אחד"; "ו-3 בלות" → "ושלוש בלות"
  const singleRe = new RegExp(`((?:[\\u0590-\\u05FF]-)?)(\\d{1,3})(\\s+)(${HE_NOUN_PATTERN})(?![\\u0590-\\u05FF])`, "g");
  text = text.replace(singleRe, (m, pre: string, num: string, _sp: string, plural: string, offset: number, whole: string) => {
    if (!pre && !prevOk(whole, offset)) return m;
    const noun = HE_NOUN_BY_PLURAL.get(plural)!;
    const phrase = hebCountPhrase(Number(num), noun);
    return pre ? `${pre[0]}${phrase}` : phrase;
  });
  return text;
}

/** ניקוי טקסט להקראה: אימוג'ים, סימני עיצוב, מקפים בין ספרות, ומספרים → מילים. */
function polishHebrewForSpeech(input: string): string {
  return numbersToHebrewWords(input)
    .replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, "")
    .replace(/(\d)-(?=\d)/g, "$1 ")
    .replace(/[•#*_]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** מוציא מהפקודה רק את בלוק הקריינות עצמו (אחרי שורת 🎙️), בלי הוראות ההפקה. */
function splitNarration(prompt: string): { head: string; narration: string } {
  const idx = prompt.indexOf("🎙");
  if (idx < 0) return { head: "", narration: prompt };
  const nl = prompt.indexOf("\n", idx);
  if (nl < 0) return { head: prompt, narration: "" };
  return { head: prompt.slice(0, nl + 1), narration: prompt.slice(nl + 1) };
}

/** בפקודת נועה: מלטש רק את בלוק הקריינות (ההוראות לפני כן נשארות כפי שהן). */
function polishNarrationInPrompt(prompt: string): string {
  const { head, narration } = splitNarration(prompt);
  if (!head) return prompt;
  return head + numbersToHebrewWords(narration);
}

// ───────────── פקדונות: פרסור מפורמטי האמת שבגיליון (סבן 60060 · בלות 60002 · בלוקים 60006 · חביות 60004) ─────────────
type DepKind = "bags" | "saban" | "blocks" | "drums";
interface DepositParse {
  net: Record<DepKind, number>;      // חיוב פחות זיכוי/החזרה
  credited: Record<DepKind, number>; // סך הזיכוי/ההחזרה (חיובי)
  unknownQty: boolean;               // נמצא סוג פקדון בלי כמות (למשל "60002 שק גדול פקדון")
  exempt: boolean;                   // פטור / ללא
}
const depKindOf = (s: string): DepKind | null =>
  /משטח(?:ים|י)?\s*(?:בלוקים|קוביו?ת?)|60006/.test(s) ? "blocks"
  : /משטח סבן|60060/.test(s) ? "saban"
  : /שק גדול|שק גד|בלה|בלות|60002/.test(s) ? "bags"
  : /חבית|60004/.test(s) ? "drums" : null;

function depQty(part: string): number | null {
  let m = part.match(/\((-?\d{1,3}(?:\.\d+)?)\)/);                      // 60002 שק גדול פקדון (15)
  if (m) return Number(m[1]);
  m = part.match(/פקדונות?\s*[:\-]?\s*(\d{1,3}(?:\.\d+)?)(-)?/);       // שק גדול פקדון: 15 | 6-
  if (m) return m[2] ? -Number(m[1]) : Number(m[1]);
  m = part.match(/:\s*(\d{1,3}(?:\.\d+)?)(-)?/);                       // חיוב: 3 שק גדול / (60002): 15
  if (m) return m[2] ? -Number(m[1]) : Number(m[1]);
  m = part.match(/(?:^|\s)(\d{1,3}(?:\.\d+)?)\s*(?:שק|משטח|בלה|בלות|חבית)/); // 3 משטח בלוקים פקדון
  return m ? Number(m[1]) : null;
}

function parseDeposits(raw: string): DepositParse {
  const out: DepositParse = {
    net: { bags: 0, saban: 0, blocks: 0, drums: 0 },
    credited: { bags: 0, saban: 0, blocks: 0, drums: 0 },
    unknownQty: false, exempt: false,
  };
  const text = String(raw || "").trim();
  if (!text || /^[—\-–]+$/.test(text)) return out;
  if (/^(פטור|ללא)/.test(text) && !/\d/.test(text)) { out.exempt = true; return out; }

  const add = (k: DepKind, q: number, isReturn: boolean) => {
    const signed = isReturn ? -Math.abs(q) : q;
    out.net[k] += signed;
    if (signed < 0) out.credited[k] += Math.abs(signed);
  };
  for (const line of text.split("\n")) {
    // שורת טבלה: "60002 | שק גדול פקדון | -5.00 | שק גד"
    const t = line.match(/^\s*(\d{5})\s*\|[^|]*\|\s*(-?\d+(?:\.\d+)?)\s*\|/);
    if (t) {
      const k = depKindOf(t[1]);
      if (k) add(k, Number(t[2]), false);
      continue;
    }
    for (const group of line.split(/\s*[|;]\s*/)) {
      const isReturn = /החזר|זיכוי|לזיכוי|סטורנו|פינוי/.test(group);
      for (const part of group.split(",")) {
        let k = depKindOf(part);
        if (!k && isReturn && /משטח\s*$/.test(part.trim())) k = "saban"; // "החזרות: 1 משטח"
        if (!k) continue;
        const q = depQty(part);
        if (q == null) { out.unknownQty = true; continue; }
        add(k, q, isReturn);
      }
    }
  }
  return out;
}

interface DepositTotals {
  pallets: number;      // משטחי סבן (60060), נטו אחרי זיכויים
  bags: number;         // בלות / שקים גדולים (60002), נטו
  blocks?: number;      // משטחי בלוקים (60006), נטו
  hasData: boolean;     // נמצא שדה פקדונות בלפחות תעודה אחת
  unknownNotes?: number; // תעודות עם סוג פקדון בלי כמות
}

function sumDeposits(notes: Array<Record<string, unknown>>): DepositTotals {
  const t: DepositTotals = { pallets: 0, bags: 0, blocks: 0, hasData: false, unknownNotes: 0 };
  for (const n of notes) {
    const dep = String(n.depositsText || n.deposits || n["פיקדונות"] || n["פקדונות"] || "").trim();
    if (!dep) continue;
    t.hasData = true;
    const p = parseDeposits(dep);
    t.pallets += p.net.saban;
    t.bags += p.net.bags;
    t.blocks = (t.blocks || 0) + p.net.blocks;
    if (p.unknownQty) t.unknownNotes = (t.unknownNotes || 0) + 1;
  }
  return t;
}

/** ניסוח פקדונות לפקודות. בלי נתון או בלי יתרה פתוחה — null (לא ממציאים מספרים). */
function depositsPhrase(d: DepositTotals): string | null {
  if (!d.hasData) return null;
  const items: Array<[number, string]> = [[d.pallets, "משטחים"], [d.bags, "בלות"], [d.blocks || 0, "משטחי בלוקים"]];
  const parts = items.filter(([n]) => n !== 0).map(([n, p]) => (n < 0 ? "זיכוי של " : "") + cnt(Math.abs(n), p));
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts.slice(0, -1).join(", ")} ${/^\d/.test(last) ? "ו-" : "ו"}${last}`;
}

/** מסיר מזהים פנימיים (לוחית רישוי, משקל, שמות מערכות) — רשת ביטחון למצב לקוח. */
function stripInternalMarkers(text: string): string {
  return text
    .replace(/\s*\(?\s*\b\d{3}-\d{2}-\d{3}\b\s*\)?/g, " ")
    .replace(/\s*\(?\s*עד\s*\d+(?:\.\d+)?\s*טון(?:\s*נטו)?\s*\)?/g, " ")
    .replace(/איתוראן/g, "מערכת המעקב")
    .replace(/\bPTO\b/g, "מנוף")
    .replace(/\bLIFO\b/g, "")
    .replace(/[ \t]{2,}/g, " ");
}

export function NotebookPage() {
  const [tab, setTab] = useState<TabId>("customers");
  const [statusFilter, setStatusFilter] = useState<string>("הכל");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [copied, setCopied] = useState<"slides" | "video" | "noa" | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [reportMode, setReportMode] = useState<ReportMode>("internal");

  // Queries
  const atlasQ = useQuery({ queryKey: ["nb-atlas"], queryFn: () => getSiteAtlasFn(), staleTime: 60_000 });
  const custQ = useQuery({ queryKey: ["nb-customers"], queryFn: () => listCustomerIndexFn(), staleTime: 60_000 });
  const notesQ = useQuery({
    queryKey: ["nb-notes"],
    queryFn: () => listNotesFn({ data: {} as never }),
    staleTime: 60_000,
  });
  const ptoQ = useQuery({
    queryKey: ["nb-pto"],
    queryFn: () =>
      listPtoFn({
        data: { since: new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString() },
      }),
    staleTime: 60_000,
  });

  const loading = atlasQ.isLoading || custQ.isLoading || notesQ.isLoading || ptoQ.isLoading;
  const refetchAll = () => {
    void atlasQ.refetch();
    void custQ.refetch();
    void notesQ.refetch();
    void ptoQ.refetch();
  };

  const notes = useMemo(() => {
    const raw = notesQ.data as { notes?: Array<Record<string, unknown>> } | undefined;
    return Array.isArray(raw?.notes)
      ? raw!.notes!
      : Array.isArray(notesQ.data)
      ? (notesQ.data as Array<Record<string, unknown>>)
      : [];
  }, [notesQ.data]);

  const ptoSessions: PairedPtoSession[] = useMemo(() => {
    const raw = ptoQ.data as { events?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>> } | undefined;
    const rows = (raw?.events || raw?.data || []) as Array<Record<string, unknown>>;
    const mapped = rows.map((r) => ({
      truck: String(r.truck || r["משאית"] || "615-41-002"),
      driver: String(r.driver || r["נהג"] || "חכמת גאבר"),
      eventType: String(r.eventType || r.type || ""),
      eventTimeIso: String(r.eventTimeIso || r.time || r.eventTime || ""),
      address: String(r.address || r["כתובת"] || ""),
    }));
    return pairPtoEvents(mapped);
  }, [ptoQ.data]);

  const customers = custQ.data?.customers || [];
  const sites = atlasQ.data?.sites || [];

  // Cross-reference helper: Find matching PTO sessions for a given address
  const getPtoForAddress = (address: string) => {
    if (!address) return [];
    const cleanAddr = address.replace(/[^\u0590-\u05FFa-zA-Z0-9 ]/g, " ").trim();
    const words = cleanAddr.split(/\s+/).filter((w) => w.length > 2);
    return ptoSessions.filter((s) => {
      const sAddr = s.address || "";
      return words.some((w) => sAddr.includes(w));
    });
  };

  // Status Filter Options per tab
  const statusOptions = useMemo(() => {
    if (tab === "customers") {
      return ["הכל", "פעיל 30 יום", "עם בירורים פתוחים", "מעל 5 תעודות", "ללא ביקורים"];
    }
    if (tab === "notes") {
      const set = new Set<string>();
      notes.forEach((n) => {
        const st = String(n.approval || n.status || n["סטטוס אישור"] || "ללא סטטוס");
        if (st) set.add(st);
      });
      return ["הכל", ...Array.from(set).slice(0, 8)];
    }
    if (tab === "sites") {
      return ["הכל", "עם פריקות מנוף", "עם קואורדינטות", "ללא לקוח מוגדר"];
    }
    return ["הכל", "מזוגים מלא", "יתומים (פתיחה/סגירה חסרה)", "פריקה מעל 30 דק׳"];
  }, [tab, notes]);

  // KPIs
  const kpis = useMemo(() => {
    const totalPtoOpens = ptoSessions.length;
    const pairedPto = ptoSessions.filter((s) => !s.orphan).length;
    const totalCraneMinutes = Math.round(
      ptoSessions.reduce((acc, s) => acc + (s.durationMin || 0), 0)
    );
    const approvedNotes = notes.filter((n) =>
      String(n.approval || n.status || "").includes("מאושר")
    ).length;

    return [
      { label: "לקוחות פעילים", value: customers.length, sub: "במאגר המאוחד", icon: Users, color: "text-cyan-400" },
      { label: "תעודות משלוח", value: notes.length, sub: `${approvedNotes} מאושרות לחיוב`, icon: FileText, color: "text-emerald-400" },
      { label: "אתרי אספקה", value: sites.length, sub: "מופו גיאוגרפית", icon: MapPin, color: "text-blue-400" },
      { label: "סשני מנוף PTO", value: totalPtoOpens, sub: `${pairedPto} מושלמים`, icon: Truck, color: "text-amber-400" },
      { label: "סה״כ דק׳ מנוף", value: `${totalCraneMinutes} דק׳`, sub: `${(totalCraneMinutes / 60).toFixed(1)} שעות עבודה`, icon: Clock, color: "text-purple-400" },
      { label: "בירורים פתוחים", value: customers.reduce((acc, c) => acc + (c.openInquiries || 0), 0), sub: "דורשים מענה", icon: AlertTriangle, color: "text-rose-400" },
    ];
  }, [customers, notes, sites, ptoSessions]);

  // Filtered dataset for active tab
  const activeItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    if (tab === "customers") {
      return customers.filter((c) => {
        const matchesQuery =
          !q ||
          c.name?.toLowerCase().includes(q) ||
          c.customerNo?.includes(q) ||
          c.address?.toLowerCase().includes(q) ||
          c.phone?.includes(q);
        if (!matchesQuery) return false;

        if (statusFilter === "עם בירורים פתוחים") return (c.openInquiries || 0) > 0;
        if (statusFilter === "ללא ביקורים") return (c.visitsCount || 0) === 0;
        if (statusFilter === "מעל 5 תעודות") return (c.notesCount || 0) >= 5;
        if (statusFilter === "פעיל 30 יום") {
          const cut = Date.now() - 30 * 24 * 3600 * 1000;
          return c.lastIso && new Date(c.lastIso).getTime() >= cut;
        }
        return true;
      });
    }

    if (tab === "notes") {
      return notes.filter((n) => {
        const noteId = String(n.noteId || n["מס' תעודת משלוח"] || "");
        const cName = String(n.customerName || n["שם לקוח"] || "");
        const addr = String(n.address || n["כתובת אספקה"] || "");
        const matchesQuery = !q || noteId.includes(q) || cName.toLowerCase().includes(q) || addr.toLowerCase().includes(q);
        if (!matchesQuery) return false;

        const st = String(n.approval || n.status || n["סטטוס אישור"] || "ללא סטטוס");
        if (statusFilter !== "הכל" && st !== statusFilter) return false;
        return true;
      });
    }

    if (tab === "sites") {
      return sites.filter((s) => {
        const addr = String(s.address || "");
        const cName = String(s.customerName || "");
        const matchesQuery = !q || addr.toLowerCase().includes(q) || cName.toLowerCase().includes(q);
        if (!matchesQuery) return false;

        if (statusFilter === "עם פריקות מנוף") return (s.ptoOpens || 0) > 0;
        if (statusFilter === "עם קואורדינטות") return s.latitude != null;
        if (statusFilter === "ללא לקוח מוגדר") return !s.customerNo;
        return true;
      });
    }

    return ptoSessions.filter((s) => {
      const addr = String(s.address || "");
      const driver = String(s.driver || "");
      const matchesQuery = !q || addr.toLowerCase().includes(q) || driver.toLowerCase().includes(q);
      if (!matchesQuery) return false;

      if (statusFilter === "מזוגים מלא") return !s.orphan && s.durationMin != null;
      if (statusFilter === "יתומים (פתיחה/סגירה חסרה)") return !!s.orphan;
      if (statusFilter === "פריקה מעל 30 דק׳") return (s.durationMin || 0) > 30;
      return true;
    });
  }, [tab, customers, notes, sites, ptoSessions, searchQuery, statusFilter]);

  // Chart Data preparation
  const chartData = useMemo(() => {
    if (tab === "customers") {
      return activeItems.slice(0, 10).map((c: any) => ({
        key: c.customerNo,
        name: c.name?.slice(0, 16) || c.customerNo,
        תעודות: c.notesCount || 0,
        ביקורים: c.visitsCount || 0,
        raw: c,
      }));
    }
    if (tab === "notes") {
      const byCity = new Map<string, number>();
      activeItems.forEach((n: any) => {
        const addr = String(n.address || n["כתובת אספקה"] || "");
        const parts = addr.split(",");
        const city = (parts[parts.length - 1] || addr || "לא צוין").trim();
        byCity.set(city, (byCity.get(city) || 0) + 1);
      });
      return Array.from(byCity.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ key: name, name, תעודות: count }));
    }
    if (tab === "sites") {
      return activeItems.slice(0, 10).map((s: any) => ({
        key: s.siteKey || s.address,
        name: (s.address || "").slice(0, 18),
        ביקורים: s.visits || 0,
        פריקות_מנוף: s.ptoOpens || 0,
        raw: s,
      }));
    }
    const byDay = new Map<string, number>();
    activeItems.forEach((s: any) => {
      const d = s.date || "—";
      byDay.set(d, (byDay.get(d) || 0) + 1);
    });
    return Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([name, count]) => ({ key: name, name, פריקות: count }));
  }, [tab, activeItems]);

  // AI Deep Intelligence Computation on currently selected item
  const selectedAiAnalysis = useMemo(() => {
    if (!selectedEntity) return null;

    let targetCust: any = null;
    let targetNotes: any[] = [];
    let targetSites: any[] = [];
    let targetPto: PairedPtoSession[] = [];

    if (selectedEntity.type === "customer") {
      targetCust = selectedEntity.data;
      targetNotes = notes.filter(
        (n) => String(n.customerNo || n["מס' לקוח"] || "") === targetCust.customerNo
      );
      targetSites = sites.filter(
        (s) => String(s.customerNo || "") === targetCust.customerNo
      );
      targetPto = ptoSessions.filter((p) => {
        const addr = p.address || "";
        return (
          (targetCust.address && addr.includes(targetCust.address.split(",")[0])) ||
          targetSites.some((ts) => ts.address && addr.includes(ts.address.split(",")[0]))
        );
      });
    } else if (selectedEntity.type === "note") {
      const n = selectedEntity.data;
      const cNo = String(n.customerNo || n["מס' לקוח"] || "");
      targetCust = customers.find((c) => c.customerNo === cNo);
      targetNotes = [n];
      targetPto = getPtoForAddress(String(n.address || n["כתובת אספקה"] || ""));
    } else if (selectedEntity.type === "site") {
      const s = selectedEntity.data;
      targetCust = customers.find((c) => c.customerNo === s.customerNo);
      targetSites = [s];
      targetPto = getPtoForAddress(s.address);
    } else if (selectedEntity.type === "pto") {
      const p = selectedEntity.data;
      targetPto = [p];
      targetNotes = notes.filter((n) => {
        const nAddr = String(n.address || n["כתובת אספקה"] || "");
        return p.address && nAddr && (p.address.includes(nAddr) || nAddr.includes(p.address));
      });
      if (targetNotes.length > 0) {
        const cNo = String(targetNotes[0].customerNo || targetNotes[0]["מס' לקוח"] || "");
        targetCust = customers.find((c) => c.customerNo === cNo);
      }
    }

    // Material analysis
    const itemsList: string[] = [];

    targetNotes.forEach((n) => {
      const itemsStr = String(n.items || n["פריטים"] || "");

      if (itemsStr) {
        itemsStr.split(/\n|,|\|/).forEach((part) => {
          const trimmed = part.trim();
          if (trimmed.length > 3) itemsList.push(trimmed);
        });
      }
    });

    // פקדונות אמיתיים מתוך שדה הפקדונות בתעודות של הישות הנבחרת (בלי ערכי ברירת מחדל)
    const deposits = sumDeposits(targetNotes);

    const totalPtoMin = targetPto.reduce((acc, p) => acc + (p.durationMin || 0), 0);
    const avgPtoMin = targetPto.length ? Math.round(totalPtoMin / targetPto.length) : 0;

    return {
      cust: targetCust,
      notes: targetNotes,
      sites: targetSites,
      pto: targetPto,
      items: itemsList.slice(0, 6),
      palletDeposits: deposits.pallets,
      bagDeposits: deposits.bags,
      hasDepositData: deposits.hasData,
      totalPtoMin,
      avgPtoMin,
    };
  }, [selectedEntity, customers, notes, sites, ptoSessions]);

  // ── מצב הפקה: פנימי (הנהלה) מול לקוח ──
  // במצב לקוח מפיקים סקירה רק ללקוח מזוהה. הסקירה הכללית וסקירת המנוף כוללות
  // שמות נהגים/עובדים ונתוני לקוחות אחרים, ולכן חסומות במצב לקוח.
  const isCustomerMode = reportMode === "customer";
  const customerBlocked = isCustomerMode && !selectedAiAnalysis?.cust;
  const customerBlockedNotice =
    "מצב לקוח פעיל — בחר/י לקוח (או תעודה / אתר של לקוח) כדי להפיק סקירה ללקוח.\nהסקירה הכללית וסקירת המנוף כוללות שמות נהגים ועובדים ונתוני לקוחות אחרים, ולכן אינן זמינות במצב לקוח.\nלהפקה פנימית להנהלה — עבור/י ל\"מצב פנימי\".";

  // 1. פקודת "נועה תסביר ותקריין" — עברית פשוטה, קלילה ובגובה העיניים + הזמנה מרוכזת + הפתעות מעובדים
  const noaPromptRaw = useMemo(() => {
    if (reportMode === "customer" && !selectedAiAnalysis?.cust) return "";
    if (selectedAiAnalysis?.cust) {
      const a = selectedAiAnalysis;
      const c = a.cust;
      const notesCnt = c.notesCount || a.notes.length || 0;
      const ptoCnt = a.pto.length;
      const ptoMin = a.totalPtoMin;
      const mainAddr = c.address || a.pto[0]?.address || "האתר המרכזי";
      const depLine = depositsPhrase({ pallets: a.palletDeposits, bags: a.bagDeposits, hasData: a.hasDepositData });
      const minutesTail = (verbPrefix: string) =>
        ptoMin > 0
          ? `${verbPrefix}${cnt(ptoMin, "דקות")}${ptoCnt > 1 ? ` — כלומר סביב ${cnt(a.avgPtoMin, "דקות")} בממוצע לפריקה` : ""}`
          : "";

      if (reportMode === "customer") {
        const greetName = c.contactName || c.name;
        const itemsLine = a.items.length ? `, ובסל הקבוע שלכם אנחנו רואים בעיקר: ${a.items.join(", ")}` : "";
        const craneLine =
          ptoCnt > 0
            ? `\nבאתר שלכם ביצענו ${cnt(ptoCnt, "פריקות מנוף")}${minutesTail(", בסך הכול ")}.`
            : "";
        const depItem = depLine
          ? `נכין לכם סיכום פקדונות ברור (${depLine} שנרשמו בתעודות), כדי שיהיה קל להחזיר אותם בזמן.`
          : "נבדוק איתכם אם נשארו באתר פקדונות — משטחי סבן ובלות — כדי שיהיה קל להחזיר אותם בזמן.";

        return `פקודה לנועה AI (הסבר וקריינות ללקוח, עברית פשוטה, חמה ובגובה העיניים):
דברי כנועה — הסדרנית של חברת ח. סבן חומרי בניין. את מדברת ישירות אל הלקוח ${c.name} (#${c.customerNo}) בעברית פשוטה, זורמת וקלילה, בלי להמציא מספרים, ובלי להזכיר שמות נהגים או עובדים, מספרי רישוי, משקלים או מידע פנימי של הסידור.

🎙️ טקסט קריינות והסבר של נועה ללקוח:
"שלום ${greetName}, כאן נועה מח. סבן חומרי בניין. רציתי לעשות לכם סדר קצר ופשוט בתיק שלכם אצלנו.
עד עכשיו הוצאנו לכם ${cnt(notesCnt, "תעודות משלוח")} לאזור ${mainAddr}${itemsLine}.${craneLine}

📦 המלצה 1 — להתארגן עם הזמנה מרוכזת כמה שניתן:
במקום להזמין השלמות קטנות באמצע השבוע, כדאי שנסגור יחד הזמנה מרוכזת אחת בתחילת השבוע — כל הבלוקים, הבלות והשקים במשלוח אחד.
• פחות משלוחים והמתנות באתר.
• פריקה אחת מסודרת במקום כמה פריקות קטנות.
• לכם יותר קל לתכנן את העבודה של הצוות באתר.

👷‍♂️ המלצה 2 — להיערך מראש לשינויים של הרגע האחרון באתר:
בכל אתר בנייה קורה שפתאום חסר חומר באמצע היום, או שהגישה לפריקה חסומה, או שאין מי שיחתום על תעודת המשלוח.
איך נערכים לזה מראש?
1. ערב לפני האספקה נשלח לכם הודעת וואטסאפ קצרה: 'בדקתם עם הצוות שלא חסר כלום למחר? טיט, דבק, פריימר, ברגים?'
2. כדאי שיהיה באתר איש קשר זמין שיפנה מקום לפריקה ויחתום על תעודת המשלוח.
3. ${depItem}"`;
      }

      const itemsLine = a.items.length ? `, כשבסל הקבוע שלו אנחנו רואים בעיקר: ${a.items.join(", ")}` : "";
      const craneLine =
        ptoCnt > 0
          ? `\nמבחינת המשאית מנוף של חכמת (615-41-002), ביצענו אצלו ${cnt(ptoCnt, "פריקות מנוף מאומתות")} באיתוראן${minutesTail(", בסך הכול ")}.`
          : "\nבאיתוראן אין כרגע פריקות מנוף מתועדות באתרים של הלקוח.";
      const depItem = depLine
        ? `מכינים לנהג פתק איסוף פקדונות ברור (${depLine} שנרשמו בתעודות) כדי שלא יישארו פקדונות זרוקים באתר.`
        : "בודקים מול איש הקשר באתר אם נשארו פקדונות (משטחי סבן 60060 ובלות 60002) — בתעודות שנבדקו אין פקדונות רשומים.";

      return `פקודה לנועה AI (הסבר וקריינות בשפה פשוטה, עברית קלילה ובגובה העיניים):
דברי כנועה — הסדרנית ויד ימינו של ראמי בחברת ח. סבן חומרי בניין. תסבירי ותקרייני בעברית פשוטה, זורמת, קלילה ובגובה העיניים (בלי מילים מסובכות ובלי להמציא מספרים) את תמונת המצב של הלקוח ${c.name} (#${c.customerNo}):

🎙️ טקסט קריינות והסבר של נועה בגובה העיניים:
"אהלן ראמי והראל, כאן נועה! בואו נעשה סדר קצר, פשוט ובגובה העיניים על התיק של ${c.name} (לקוח מספר ${c.customerNo}).
עד עכשיו הוצאנו לו ${cnt(notesCnt, "תעודות משלוח")} לאזור ${mainAddr}${itemsLine}.${craneLine}

📦 המלצה 1 — להתארגן עם הזמנה מרוכזת כמה שניתן:
במקום להוציא משאית על כל השלמה קטנה של כמה שקי מלט, דבק או גבס באמצע השבוע, הכי נכון לסגור מול ${c.contactName || c.name} הזמנה מרוכזת אחת בתחילת השבוע. כשמרכזים את כל הבלוקים, הבלות והשקים להובלה מרוכזת אחת:
• חוסכים נסיעות כפולות ודלק של חכמת ועלי.
• מנצלים עד הסוף את כושר ההעמסה של המשאית מנוף (עד 10.2 טון נטו) או הפלטה של עלי.
• מורידים לחץ מהחצר של אורן בהחרש ומתמיר בהתלמיד.

👷‍♂️ המלצה 2 — לשים לב ל'הפתעות מעובדים' בשטח ולהיערך מראש:
באתרים כאלה תמיד צצות הפתעות של הרגע האחרון מצד העובדים בשטח — פתאום פועל מתקשר ב-10 בבוקר שנגמר לו הדבק או הפריימר, או שחכמת מגיע לאתר והעובדים חסמו את הגישה למנוף ואין מי שיחתום על התעודה או יחזיר משטחי סבן (60060) ובלות (60002).
איך אנחנו נערכים לזה מראש?
1. ערב לפני האספקה שולחים הודעת וואטסאפ קצרה למנהל העבודה באתר: 'בדקתם עם הפועלים שלא חסר כלום למחר? טיט, דבק, פריימר, ברגים?' — ככה תופסים את ההשלמות לפני שהמשאית יוצאת.
2. מוודאים מראש שיש איש קשר זמין באתר שמפנה מקום למנוף של חכמת וחותם ברור על תעודת המשלוח.
3. ${depItem}"`;
    }

    return `פקודה לנועה AI (הסבר וקריינות בשפה פשוטה, עברית קלילה ובגובה העיניים):
דברי כנועה — הסדרנית ויד ימינו של ראמי בחברת ח. סבן חומרי בניין. תסבירי ותקרייני בעברית פשוטה, קלילה ובגובה העיניים את דוח הרנטגן התפעולי של החברה:

🎙️ טקסט קריינות והסבר של נועה בגובה העיניים:
"אהלן ראמי והראל, כאן נועה עם סיכום רנטגן קליל ובגובה העיניים על מה שקורה אצלנו בסידור!
יש לנו כרגע במאגר ${cnt(customers.length, "לקוחות פעילים")}, ${cnt(notes.length, "תעודות משלוח")} בבקרה, ${cnt(sites.length, "אתרי עבודה ממופים")}, ${cntAnd(ptoSessions.length, "פריקות מנוף")} של חכמת שתיעדנו באיתוראן.

📦 קודם כל — בואו נתארגן על הזמנות מרוכזות כמה שניתן:
הסוד לסידור שקט ורווחי הוא לאחד הזמנות! כשלקוח מזמין היום 10 שקים ומחר עוד בלה, זה שורף לנו זמן מנוף יקר ודלק. ההמלצה שלי: ליזום שיחה או הודעה ללקוחות הקבועים ולבקש מהם לרכז הזמנה אחת גדולה ומסודרת לבוקר (בלות + משטחי מלט/טיט מהחרש + השלמות גבס ואיטום מהתלמיד). ככה חכמת יוצא ב-07:00 בבוקר עם משאית מלאה בסדר העמסה LIFO חכם ומתקתק פריקות ברצף.

👷‍♂️ דבר שני — איך מתמודדים עם 'הפתעות מעובדים' ונערכים בהתאם:
כולנו מכירים את ההפתעות של עובדים באתרים ובחצר:
• עובדים באתר שנזכרים באמצע היום שנגמר להם החומר ומבקשים 'משלוח חירום מעכשיו לעכשיו'.
• אתרים שבהם העובדים לא פינו מקום למשאית או למלגזה, והנהג מתעכב מעל 30 דקות.
• תעודות משלוח שחוזרות בלי חתימה ברורה או פקדונות (משטחי סבן 60060 ובלות 60002) שהעובדים באתר שוכחים להחזיר.
התוכנית שלנו להיערך לזה מראש:
1. שאלת השלמת סל אוטומטית בכל הזמנה ('לקחת מלט ובלוקים — צריך גם חול, טיט או פריימר שלא יחסר לפועלים מחר?').
2. אימות טלפוני ומיקום Waze מול איש הקשר באתר לפני יציאת המשאית כדי לוודא שהשטח פנוי לפריקה.
3. שמירה על מרווח ביטחון של 15–20 דקות בסידור הצהריים של עלי וחכמת לספיגת בלת"מים בלי להפיל את שאר היום."`;
  }, [reportMode, selectedAiAnalysis, customers.length, notes.length, sites.length, ptoSessions.length]);

  // 2. Dynamic Prompt for Slide Deck (NotebookLM)
  const slidesPromptRaw = useMemo(() => {
    if (reportMode === "customer" && !selectedAiAnalysis?.cust) return "";
    if (selectedAiAnalysis?.cust) {
      const a = selectedAiAnalysis;
      const c = a.cust;
      const ptoCnt = a.pto.length;
      const ptoMin = a.totalPtoMin;
      const itemsStr = a.items.length ? a.items.join(", ") : "לא זוהו פריטים בתעודות — לבדוק מול הלקוח";
      const depLine = depositsPhrase({ pallets: a.palletDeposits, bags: a.bagDeposits, hasData: a.hasDepositData });
      const depSuffix = depLine ? ` (פקדונות שנרשמו בתעודות: ${depLine})` : "";
      const crane =
        ptoCnt > 0
          ? `${cnt(ptoCnt, "פריקות מנוף")}${ptoMin > 0 ? `, סה"כ ${cnt(ptoMin, "דקות")}${ptoCnt > 1 ? ` (ממוצע ${cnt(a.avgPtoMin, "דקות")} לפריקה)` : ""}` : ""}`
          : "אין כרגע פריקות מנוף מתועדות — לדלג על הנתון בשקף";
      const closing =
        c.openInquiries > 0
          ? `סגירת ${cnt(c.openInquiries, "בירורים פתוחים")} ותיאום הזמנה מרוכזת הבאה`
          : "תיק תקין ומאומת — מוכנים להזמנה מרוכזת הבאה!";
      const counts = `סה"כ ${cnt(c.notesCount || a.notes.length, "תעודות משלוח")}, ${cnt(c.ordersCount || 0, "הזמנות")}, ${cnt(c.addressesCount || a.sites.length, "אתרי אספקה")} (כתובת עיקרית: ${c.address || "לא הוזנה"})`;

      if (reportMode === "customer") {
        return `על בסיס נתוני ח. סבן חומרי בניין בלבד (ללא בדיון מספרים), וללא שמות נהגים או עובדים, מספרי רישוי, משקלים או מידע פנימי של הסידור:
הפק מצגת סקירה ללקוח שנועה AI מסבירה ומקריינת בשפה פשוטה, עברית קלילה ובגובה העיניים, בפנייה בגוף שני אל הלקוח: ${c.name} (לקוח מס' #${c.customerNo}).

שקפים נדרשים (8 שקפים, עברית קלילה וברורה בגובה העיניים RTL):
1. שער: תמונת מצב פשוטה וברורה של התיק שלכם אצל ח. סבן
2. המספרים בגובה העיניים: ${counts}
3. מה אתם קונים אצלנו: פרופיל סל קבוע (${itemsStr}) ומה כדאי להשלים מראש
4. פריקות מנוף באתר שלכם: ${crane}
5. 📦 המלצה מרכזית — להתארגן עם הזמנה מרוכזת כמה שניתן: איחוד הזמנות קטנות למשלוח בוקר מרוכז אחד, פחות משלוחים ופחות המתנה באתר
6. 👷‍♂️ היערכות לשינויים של הרגע האחרון באתר: חוסר חומר באמצע היום, גישה לפריקה, חתימה על תעודת המשלוח ואיסוף פקדונות${depSuffix}
7. 🛠️ צ'ק-ליסט פשוט לפני כל אספקה: הודעת וידוא חוסרים ערב קודם, איש קשר זמין באתר, ואישור שהשטח פנוי לפריקה
8. סיכום קליל של נועה לשבוע הקרוב: ${closing}

לכל שקף: כותרת קלילה וברורה, 3–4 נקודות קצרות בגובה העיניים, וטקסט "נועה מקריינת" (20 שניות בשפה פשוטה וחמה).`;
      }

      return `על בסיס נתוני ח. סבן חומרי בניין בלבד (ללא בדיון מספרים):
הפק מצגת רנטגן תפעולית שמציגה ומקריינת נועה AI בשפה פשוטה, עברית קלילה ובגובה העיניים עבור לקוח: ${c.name} (לקוח מס' #${c.customerNo}).

שקפים נדרשים (8 שקפים, עברית קלילה וברורה בגובה העיניים RTL):
1. שער: נועה עושה סדר בתיק של ${c.name} (#${c.customerNo}) — תמונת מצב פשוטה וברורה
2. המספרים בגובה העיניים: ${counts}
3. מה הלקוח קונה מאיתנו: פרופיל סל קבוע (${itemsStr}) ומה תמיד כדאי להזכיר לו להשלים מראש
4. איך עובד המנוף באתר (איתוראן PTO): ${ptoCnt > 0 ? `${cnt(ptoCnt, "פריקות מנוף")} של חכמת (615-41-002)${ptoMin > 0 ? `, סה"כ ${cnt(ptoMin, "דקות")} עבודה${ptoCnt > 1 ? ` (ממוצע ${cnt(a.avgPtoMin, "דקות")} לפריקה)` : ""}` : ""}` : "אין כרגע פריקות מנוף מתועדות — לדלג על הנתון בשקף"}
5. 📦 המלצה מרכזית — להתארגן עם הזמנה מרוכזת כמה שניתן: איחוד הזמנות קטנות למשלוח בוקר מרוכז אחד, חיסכון בדקות מנוף והובלות כפולות
6. 👷‍♂️ מניעת "הפתעות מעובדים" בשטח: התמודדות עם הזמנות פתע של פועלים באמצע היום, חסימות גישה למנוף, חתימות חסרות ואיסוף פקדונות${depSuffix}
7. 🛠️ איך נערכים בהתאם (צ'ק-ליסט מעשי לראמי והראל): הודעת וידוא חוסרים ערב קודם, בדיקת זמינות באתר לפני יציאה, ושריון חלון ביטחון בסידור
8. סיכום קליל של נועה לשבוע הקרוב: ${closing}

לכל שקף: כותרת קלילה וברורה, 3–4 נקודות קצרות בגובה העיניים, וטקסט "נועה מקריינת" (20 שניות בשפה פשוטה וחמה).`;
    }

    if (selectedEntity?.type === "pto") {
      const p = selectedEntity.data as PairedPtoSession;
      return `על בסיס נתוני ח. סבן חומרי בניין בלבד:
הפק מצגת תחקיר פריקת מנוף שנועה מסבירה ומקריינת בשפה פשוטה, עברית קלילה ובגובה העיניים:
משאית: ${p.truck || "615-41-002"} | נהג: ${p.driver || "חכמת גאבר"}
כתובת אתר: ${p.address} | זמן מנוף: ${p.openTime || "-"} עד ${p.closeTime || "-"} (${cnt(p.durationMin || 0, "דקות")})

שקפים (עברית קלילה בגובה העיניים):
1. מה קרה בפריקה הזו? סיכום פשוט וברור של נועה
2. זמני המנוף באיתוראן מול תעודת המשלוח בשטח
3. 📦 איך הזמנה מרוכזת מראש חוסכת הגעות כפולות לאותו אתר
4. 👷‍♂️ הפתעות מעובדים באתר (עיכוב בהכנת השטח למנוף / חתימה / פקדונות) ואיך נערכים אליהן מראש בפעם הבאה
5. שורה תחתונה לראמי ולחכמת לסידור מחר בבוקר.`;
    }

    const topCust = customers
      .slice(0, 6)
      .map((c) => `- ${c.name} (#${c.customerNo}): ${cnt(c.notesCount || 0, "תעודות")}, ${cnt(c.visitsCount || 0, "ביקורים")}`)
      .join("\n");
    const topSites = sites
      .filter((s) => (s.ptoOpens || 0) > 0)
      .slice(0, 5)
      .map((s) => `- ${s.address}: ${s.ptoOpens} פתיחות מנוף, ${cnt(s.visits || 0, "ביקורים")}`)
      .join("\n");

    return `על בסיס דוח הרנטגן התפעולי של ח. סבן בלבד (חומרי בניין 1994 בע"מ):
צור מצגת בת 8 שקפים שבה נועה AI מסבירה ומקריינת בשפה פשוטה, עברית קלילה ובגובה העיניים להראל אידלסון ולראמי מסארווה.

שקפים חובה:
1. שער — נועה עושה סדר בסידור: תמונת מצב בגובה העיניים
2. המספרים שלנו בשפה פשוטה — ${cnt(customers.length, "לקוחות")} · ${cnt(notes.length, "תעודות")} · ${cnt(sites.length, "אתרים")} · ${cnt(ptoSessions.length, "פריקות מנוף")}
3. הלקוחות המובילים ואיפה הכי נכון לרכז משלוחים:
${topCust}
4. איפה המנוף של חכמת עובד הכי חזק (איתוראן PTO):
${topSites}
5. 📦 המלצת זהב 1 — מתארגנים עם הזמנה מרוכזת כמה שניתן: איך מצמצמים השלמות קטנות ומאחדים בלות, מלט וגבס לסבב בוקר חכם אחד
6. 👷‍♂️ המלצת זהב 2 — מוכנות ל"הפתעות מעובדים" בשטח: הזמנות דחופות של פועלים ברגע האחרון, עיכובי פריקה באתר, תעודות בלי חתימה ופקדונות שנשארים בשטח
7. 🛠️ איך נערכים בהתאם: בדיקת חוסרים יזומה ערב קודם, השלמת סל אוטומטית (חול/טיט/פריימר), ושריון חלון ביטחון בסידור הצהריים
8. תוכנית פעולה פשוטה לפתיחת השבוע של ראמי, אורן, תמיר, חכמת ועלי.

לכל שקף: כותרת קלילה, 3–4 תבליטים פשוטים בגובה העיניים, וטקסט קריינות חי של נועה.`;
  }, [reportMode, selectedEntity, selectedAiAnalysis, customers, notes, sites, ptoSessions]);

  // 3. Dynamic Prompt for Video Script (Gemini / NotebookLM Audio)
  const videoPromptRaw = useMemo(() => {
    if (reportMode === "customer" && !selectedAiAnalysis?.cust) return "";
    if (selectedAiAnalysis?.cust) {
      const a = selectedAiAnalysis;
      const c = a.cust;
      const ptoCnt = a.pto.length;
      const ptoMin = a.totalPtoMin;
      const notesN = c.notesCount || 0;

      if (reportMode === "customer") {
        const greetName = c.contactName || c.name;
        const itemsV = a.items.length ? a.items.join(", ") : "הפריטים הקבועים שלכם";
        const craneV = ptoCnt > 0 ? `מה רואים אצלכם בפריקות המנוף (${cnt(ptoCnt, "פריקות מנוף")}${ptoMin > 0 ? `, ${cnt(ptoMin, "דקות")}` : ""})` : "מה חשוב לדעת על הפריקה באתר שלכם";
        return `צור תסריט וידאו וקריינות (60–75 שניות) שבו נועה AI פונה ישירות ללקוח ${c.name} (#${c.customerNo}) בשפה פשוטה, עברית קלילה ובגובה העיניים, על התיק שלו בחברת ח. סבן חומרי בניין. אין להזכיר שמות נהגים או עובדים, מספרי רישוי, משקלים או מידע פנימי של הסידור.

חלוקת זמנים וקריינות בגובה העיניים:
00–12 שנ': פתיחה חמה — "שלום ${greetName}, כאן נועה מח. סבן. בואו נסתכל רגע על התיק שלכם: ${cnt(notesN, "תעודות משלוח")} ${cntAnd(a.sites.length, "אתרי אספקה")}."
12–28 שנ': מה אתם מזמינים ואיך מתארגנים עם הזמנה מרוכזת כמה שניתן — סל קבוע (${itemsV}) והמלצה לאחד הזמנות קטנות למשלוח מרוכז אחד שחוסך משלוחים והמתנה באתר.
28–45 שנ': ${craneV}, ואיך נערכים לשינויים של הרגע האחרון באתר (חוסר חומר באמצע היום, פינוי שטח לפריקה, חתימה על התעודה).
45–65 שנ': איך נערכים בהתאם — הודעת וידוא חוסרים ערב קודם, איש קשר זמין באתר, איסוף פקדונות מסודר ותיאום ההזמנה המרוכזת הבאה.

פלט נדרש:
1. טקסט קריינות מלא של נועה בעברית פשוטה, קלילה ובגובה העיניים.
2. כותרות קצרות וברורות על המסך לפי שניות.`;
      }

      return `צור תסריט וידאו וקריינות (60–75 שניות) שבו נועה AI מסבירה ומקריינת בשפה פשוטה, עברית קלילה ובגובה העיניים על תיק הלקוח ${c.name} (#${c.customerNo}) בחברת ח. סבן חומרי בניין.

חלוקת זמנים וקריינות בגובה העיניים:
00–12 שנ': פתיחה חמה וקלילה של נועה — "אהלן ראמי והראל, בואו נסתכל רגע בגובה העיניים על התיק של ${c.name}: ${cnt(notesN, "תעודות משלוח")} ${cntAnd(a.sites.length, "אתרים פעילים")}."
12–28 שנ': מה הוא מזמין ואיך מתארגנים עם הזמנה מרוכזת כמה שניתן — סל קבוע (${a.items.length ? a.items.join(", ") : "הסל הקבוע שלו"}) והמלצה לאחד הזמנות קטנות למשלוח מרוכז אחד שחוסך הובלות וזמן מנוף.
28–45 שנ': מה רואים במנוף של חכמת (${cnt(ptoCnt, "פריקות")}${ptoMin > 0 ? `, ${cnt(ptoMin, "דקות")}` : ""}) ואיך מונעים "הפתעות מעובדים" באתר (פועלים שמזמינים חוסרים ברגע האחרון, עיכובים בפינוי שטח למנוף או שכחת חתימה על התעודה).
45–65 שנ': איך נערכים בהתאם — הודעת וידוא חוסרים למנהל העבודה ערב קודם, איסוף פקדונות משטחים/בלות מסודר, ותיאום סבב בוקר חלק.

פלט נדרש:
1. טקסט קריינות מלא של נועה בעברית פשוטה, קלילה ובגובה העיניים.
2. כותרות קצרות וברורות על המסך לפי שניות.`;
    }

    return `צור תסריט למצגת וידאו וקריינות (60–90 שניות) שבו נועה AI מסבירה ומקריינת בשפה פשוטה, עברית קלילה ובגובה העיניים את דוח הרנטגן התפעולי של ח. סבן חומרי בניין.

מבנה הסרטון והקריינות של נועה:
00–15 שנ': פתיחה קלילה בגובה העיניים — תמונת המצב שלנו היום (${cnt(customers.length, "לקוחות")}, ${cnt(notes.length, "תעודות")}, ${cnt(ptoSessions.length, "פריקות מנוף")}).
15–35 שנ': 📦 המלצה 1 — להתארגן עם הזמנה מרוכזת כמה שניתן: למה כדאי לאחד הזמנות מלט, בלות וגבס למשלוח מרוכז אחד בבוקר במקום לרוץ על השלמות קטנות.
35–60 שנ': 👷‍♂️ המלצה 2 — "הפתעות מעובדים" בשטח ואיך נערכים אליהן: פועלים שנזכרים ברגע האחרון שחסר חומר, אתרים לא פנויים למנוף של חכמת או למלגזה של עלי, וחתימות ופקדונות שמתפספסים.
60–85 שנ': 🛠️ תוכנית היערכות פשוטה לראמי ולהראל — בדיקת השלמת סל מראש, אימות גישה באתר לפני יציאה, ושמירת מרווח ביטחון בסידור היומי.

פלט נדרש:
1. תסריט קריינות מלא של נועה בעברית קלילה, חמה ובגובה העיניים.
2. שקופיות וכותרות ויזואליות נקיות לכל מקטע.`;
  }, [reportMode, selectedAiAnalysis, customers.length, notes.length, ptoSessions.length]);

  // הפלטים הסופיים (אלה שמוצגים, מועתקים ומוקראים):
  //  • נועה: מלטשים רק את בלוק הקריינות (מספרים → מילים, יחיד/רבים)
  //  • מצב לקוח: רשת ביטחון שמסירה לוחיות רישוי, משקלים ושמות מערכות פנימיות
  const dynamicNoaVoicePrompt = useMemo(() => {
    if (customerBlocked) return customerBlockedNotice;
    const t = polishNarrationInPrompt(noaPromptRaw);
    return isCustomerMode ? stripInternalMarkers(t) : t;
  }, [noaPromptRaw, customerBlocked, customerBlockedNotice, isCustomerMode]);

  const dynamicSlidesPrompt = useMemo(() => {
    if (customerBlocked) return customerBlockedNotice;
    return isCustomerMode ? stripInternalMarkers(slidesPromptRaw) : slidesPromptRaw;
  }, [slidesPromptRaw, customerBlocked, customerBlockedNotice, isCustomerMode]);

  const dynamicVideoPrompt = useMemo(() => {
    if (customerBlocked) return customerBlockedNotice;
    return isCustomerMode ? stripInternalMarkers(videoPromptRaw) : videoPromptRaw;
  }, [videoPromptRaw, customerBlocked, customerBlockedNotice, isCustomerMode]);

  // עוצרים הקראה בעת החלפת ישות / מצב הפקה ובעזיבת הדף
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [selectedEntity, reportMode]);

  // Voice Narration Handler (Web Speech API in Hebrew)
  const toggleNoaNarration = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (customerBlocked) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    // Clean emojis and markdown symbols for smooth Hebrew TTS reading
    // מקריאים רק את בלוק הקריינות עצמו (בלי הוראות ההפקה), אחרי ליטוש מספרים ודקדוק
    const cleanSpeechText = polishHebrewForSpeech(splitNarration(dynamicNoaVoicePrompt).narration)
      .replace(/^["“”]+|["“”]+$/g, "")
      .trim();
    if (!cleanSpeechText) return;

    const utterance = new SpeechSynthesisUtterance(cleanSpeechText);
    utterance.lang = "he-IL";
    utterance.rate = 1.02;
    utterance.pitch = 1.05;

    const voices = window.speechSynthesis.getVoices();
    const heVoice = voices.find((v) => v.lang.includes("he") || v.lang.includes("iw"));
    if (heVoice) utterance.voice = heVoice;

    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  // Copy helper
  const copyPrompt = async (kind: "slides" | "video" | "noa") => {
    if (customerBlocked) return;
    const text =
      kind === "slides"
        ? dynamicSlidesPrompt
        : kind === "video"
        ? dynamicVideoPrompt
        : dynamicNoaVoicePrompt;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <PageHeader
        title="חדר רנטגן תפעולי · נועה בגובה העיניים"
        subtitle="סריקת KPI חכמה · הקראה קולית בעברית קלילה · המלצות להזמנה מרוכזת והיערכות להפתעות מעובדים"
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleNoaNarration}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-all",
                isSpeaking
                  ? "border-amber-500 bg-amber-500/20 text-amber-300 animate-pulse"
                  : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
              )}
            >
              {isSpeaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              {isSpeaking ? "עצור קריינות נועה" : "נועה תקרייני לי 🔊"}
            </button>
            {selectedEntity && (
              <button
                type="button"
                onClick={() => setSelectedEntity(null)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 text-xs font-bold text-rose-300 hover:bg-rose-500/20"
              >
                <X className="h-3.5 w-3.5" />
                איפוס בחירה
              </button>
            )}
            <button
              type="button"
              onClick={refetchAll}
              disabled={loading}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold hover:bg-muted disabled:opacity-60"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              סריקה מחדש
            </button>
          </div>
        }
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8" dir="rtl">
        {/* Top Executive KPI Grid */}
        <section className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-5 text-slate-100 shadow-xl md:p-6">
          <div className="pointer-events-none absolute -left-20 top-0 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-20 bottom-0 h-48 w-48 rounded-full bg-emerald-400/15 blur-3xl" />

          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
                <ScanSearch className="h-4 w-4 animate-pulse" />
                סריקת רנטגן תפעולית בזמן אמת · ח. סבן 1994 בע״מ
              </div>
              <h1 className="mt-1 font-display text-2xl font-black md:text-3xl">
                חדר ניתוח מנהלים ו-Notebook בגובה העיניים
              </h1>
              <p className="mt-1 max-w-3xl text-xs text-slate-300 md:text-sm">
                לחץ על כל לקוח, תעודה, אתר או פריקת מנוף לקבלת <span className="font-bold text-cyan-300">הסבר וקריינות של נועה בעברית קלילה</span>, עם המלצות מעשיות ל<span className="font-bold text-emerald-300">הזמנה מרוכזת</span> ולהיערכות מראש ל<span className="font-bold text-amber-300">הפתעות מעובדים בשטח</span>.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-center backdrop-blur-sm">
                <span className="block text-[11px] text-cyan-300">משאית מנוף פעילה</span>
                <span className="font-mono text-sm font-black text-white">615-41-002 (מרצדס)</span>
              </div>
            </div>
          </div>

          <div className="relative mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {kpis.map((k) => {
              const Icon = k.icon;
              return (
                <div
                  key={k.label}
                  className="group rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm transition-all hover:border-cyan-500/40 hover:bg-white/10"
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                    <span>{k.label}</span>
                    <Icon className={cn("h-3.5 w-3.5", k.color)} />
                  </div>
                  <div className="mt-1 text-xl font-black tabular-nums text-white md:text-2xl">
                    {k.value}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-slate-400">{k.sub}</div>
                </div>
              );
            })}
          </div>

          {/* Strategic Action Banner: Consolidated Orders & Worker Surprises Readiness */}
          <div className="relative mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/35 p-3.5">
              <div className="flex items-center gap-2 text-xs font-black text-emerald-300">
                <Package className="h-4 w-4 shrink-0" />
                <span>המלצת נועה 1: להתארגן עם הזמנה מרוכזת כמה שניתן</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-200">
                איחוד שקי מלט, בלות חול/סומסום, גבס ואיטום להזמנה מרוכזת אחת בבוקר חוסך נסיעות השלמה כפולות, מקצר זמני PTO של חכמת ומאפשר העמסת LIFO מסודרת בחצר.
              </p>
            </div>

            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/35 p-3.5">
              <div className="flex items-center gap-2 text-xs font-black text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>המלצת נועה 2: מוכנות ל"הפתעות מעובדים" והיערכות מראש</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-200">
                מניעת הזמנות פתע של פועלים באמצע היום, חסימות גישה למנוף באתר, ותעודות בלי חתימה או החזרת פקדונות — באמצעות בדיקת חוסרים יזומה ערב קודם ושיבוץ מרווח ביטחון בסידור.
              </p>
            </div>
          </div>
        </section>

        {/* Dynamic AI Live Inspection Card (Appears whenever an entity is selected) */}
        {selectedEntity && selectedAiAnalysis && (
          <section className="relative overflow-hidden rounded-3xl border-2 border-cyan-500/40 bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-950/60 p-5 shadow-2xl transition-all">
            <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-cyan-500/10 blur-2xl" />

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/40 bg-cyan-500/20 text-cyan-300 shadow-inner">
                  <Sparkles className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                      נועה מסבירה בגובה העיניים
                    </span>
                    <span className="text-xs text-slate-400">
                      נבחר: {selectedEntity.type === "customer" ? "תיק לקוח" : selectedEntity.type === "note" ? "תעודת משלוח" : selectedEntity.type === "site" ? "אתר אספקה" : "סשן PTO מנוף"}
                    </span>
                  </div>
                  <h2 className="font-display text-lg font-black text-white md:text-xl">
                    {selectedEntity.title}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleNoaNarration}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all",
                    isSpeaking
                      ? "border-amber-400 bg-amber-500/20 text-amber-200"
                      : "border-emerald-400/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
                  )}
                >
                  {isSpeaking ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  <span>{isSpeaking ? "עצור קריינות" : "השמע הסבר של נועה"}</span>
                </button>
                {selectedAiAnalysis.cust && (
                  <Link
                    to="/customers/$id"
                    params={{ id: selectedAiAnalysis.cust.customerNo }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/20 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/30"
                  >
                    <span>פתח תיק לקוח</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedEntity(null)}
                  className="rounded-xl border border-white/10 p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                  title="סגור ניתוח"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* AI Insight Pillars */}
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {/* Pillar 1: Customer Profile */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h3 className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                  <User className="h-4 w-4" />
                  פרופיל לקוח ומדדי רכש
                </h3>
                {selectedAiAnalysis.cust ? (
                  <div className="mt-2.5 space-y-1.5 text-xs text-slate-200">
                    <div className="flex justify-between">
                      <span className="text-slate-400">מספר לקוח:</span>
                      <span className="font-mono font-bold">#{selectedAiAnalysis.cust.customerNo}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">איש קשר:</span>
                      <span>{selectedAiAnalysis.cust.contactName || selectedAiAnalysis.cust.name}</span>
                    </div>
                    {selectedAiAnalysis.cust.phone && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">טלפון:</span>
                        <span className="font-mono dir-ltr">{selectedAiAnalysis.cust.phone}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-400">תעודות משלוח:</span>
                      <span className="font-bold text-emerald-400">{selectedAiAnalysis.cust.notesCount || selectedAiAnalysis.notes.length} תעודות</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">נהג מוביל מועדף:</span>
                      <span className="font-bold text-amber-300">{selectedAiAnalysis.cust.preferredDriver || "חכמת גאבר (מנוף)"}</span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">לא אותר לקוח ישיר משויך לרשומה זו.</p>
                )}
              </div>

              {/* Pillar 2: Shopping Cart & Deposits */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h3 className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                  <Boxes className="h-4 w-4" />
                  פרופיל קניות וריכוז הזמנות
                </h3>
                <div className="mt-2.5 space-y-2 text-xs text-slate-200">
                  <div>
                    <span className="text-[11px] text-slate-400">מוצרים מובילים לאיחוד בהזמנה מרוכזת:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {selectedAiAnalysis.items.length > 0 ? (
                        selectedAiAnalysis.items.map((it: string, idx: number) => (
                          <span
                            key={idx}
                            className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300"
                          >
                            {it}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 text-[11px]">חומרי מליטה, צמנט נשר וטיט</span>
                      )}
                    </div>
                  </div>
                  <div className="border-t border-white/5 pt-2">
                    <span className="text-[11px] text-slate-400">פקדונות שנרשמו בתעודות:</span>
                    <div className="mt-1 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg bg-white/5 px-2 py-1">
                        <span className="text-slate-400">משטחי סבן: </span>
                        <span className="font-bold text-cyan-200">{selectedAiAnalysis.hasDepositData ? selectedAiAnalysis.palletDeposits : "אין נתון"}</span>
                      </div>
                      <div className="rounded-lg bg-white/5 px-2 py-1">
                        <span className="text-slate-400">שקים/בלות: </span>
                        <span className="font-bold text-cyan-200">{selectedAiAnalysis.hasDepositData ? selectedAiAnalysis.bagDeposits : "אין נתון"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pillar 3: Sites & Ituran PTO Crane stats */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h3 className="flex items-center gap-2 text-xs font-bold text-amber-300">
                  <Truck className="h-4 w-4" />
                  אתרי אספקה ומנוף איתוראן PTO
                </h3>
                <div className="mt-2.5 space-y-1.5 text-xs text-slate-200">
                  <div className="flex justify-between">
                    <span className="text-slate-400">אתרי אספקה פעילים:</span>
                    <span className="font-bold">{selectedAiAnalysis.sites.length || (selectedAiAnalysis.cust?.address ? 1 : 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">פריקות מנוף מאומתות (PTO):</span>
                    <span className="font-bold text-amber-300">
                      {selectedAiAnalysis.pto.length} פריקות
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">סה״כ זמן שהיית מנוף:</span>
                    <span className="font-bold text-amber-300">
                      {selectedAiAnalysis.totalPtoMin} דקות
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">ממוצע פריקה לאתר:</span>
                    <span>{selectedAiAnalysis.avgPtoMin} דקות</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    כתובת עיקרית: <span className="text-slate-200 font-medium">{selectedAiAnalysis.cust?.address || selectedAiAnalysis.pto[0]?.address || "הוד השרון / מרכז"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Strategic Recommendation Box — Simple Eye-Level Hebrew */}
            <div className="mt-4 space-y-2 rounded-2xl border border-cyan-500/30 bg-cyan-950/40 p-4 text-xs leading-relaxed text-cyan-100">
              <div className="flex items-center gap-2 font-bold text-cyan-300">
                <TrendingUp className="h-4 w-4 shrink-0 text-cyan-400" />
                <span>נועה מסבירה בגובה העיניים — איך מתארגנים נכון מול הלקוח והעובדים באתר:</span>
              </div>
              <p>
                • <span className="font-bold text-emerald-300">התארגנות עם הזמנה מרוכזת:</span> מומלץ לתאם מול {selectedAiAnalysis.cust?.contactName || selectedAiAnalysis.cust?.name || "הלקוח"} ריכוז של כל החומרים (בלות, מלט, דבקים וגבס) למשלוח אחד מלא בסבב הבוקר במקום פיצולי השלמות באמצע השבוע.
              </p>
              <p>
                • <span className="font-bold text-amber-300">היערכות להפתעות מעובדים באתר:</span> לבדוק ערב קודם מול מנהל העבודה שהפועלים לא שכחו חומרים משלימים (פריימר, טיט, ברגים), לוודא שגישת המנוף פנויה ושיש עובד אחראי שחותם על התעודה ומחזיר פקדונות משטחים ובלות.
              </p>
            </div>
          </section>
        )}

        {/* Filters and Search Bar */}
        <section className="rounded-3xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTab(t.id);
                      setStatusFilter("הכל");
                      setSelectedEntity(null);
                    }}
                    className={cn(
                      "flex min-h-10 items-center gap-2 rounded-2xl border px-3.5 text-xs font-bold transition-all",
                      active
                        ? "border-cyan-500 bg-cyan-500/10 text-cyan-700 shadow-sm dark:text-cyan-300"
                        : "border-transparent hover:bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Search Box */}
            <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
              <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חיפוש לפי שם, מספר, כתובת..."
                className="w-full rounded-xl border bg-background py-2 pl-3 pr-9 text-xs focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Status Sub-Filters */}
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t pt-3">
            <span className="ml-1 text-[11px] font-bold text-muted-foreground">סינון מהיר:</span>
            {statusOptions.map((s) => {
              const active = statusFilter === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "min-h-8 rounded-full border px-3 text-[11px] font-semibold transition-all",
                    active
                      ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-800 dark:text-cyan-200 font-bold"
                      : "border-border hover:bg-muted text-muted-foreground"
                  )}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </section>

        {/* Master-Detail Data Section: Interactive Chart & Item List */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Main Visual Chart */}
          <section className="rounded-3xl border bg-card p-5 shadow-sm lg:col-span-7">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-sm font-bold">
                  תרשים עמודות — {TABS.find((t) => t.id === tab)?.label}
                </h2>
                <p className="text-xs text-muted-foreground">
                  הצגת התפלגות פעילות. לחץ על פריט ברשימה מימין להסבר וקריינות של נועה
                </p>
              </div>
              <span className="rounded-lg border px-2 py-1 text-[11px] font-bold text-muted-foreground">
                {activeItems.length} רשומות
              </span>
            </div>

            <div className="mt-5 h-80 w-full">
              {chartData.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">
                  אין נתונים התואמים את החיפוש והסינון הנוכחי
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 12, right: 8, left: -10, bottom: 50 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: "currentColor" }}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "currentColor" }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        fontSize: 12,
                        backgroundColor: "rgba(15, 23, 42, 0.95)",
                        color: "#fff",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    />
                    <Bar
                      dataKey={tab === "pto" ? "פריקות" : "תעודות"}
                      radius={[6, 6, 0, 0]}
                      onClick={(entry) => {
                        if (entry?.raw) {
                          setSelectedEntity({
                            type: tab === "customers" ? "customer" : tab === "sites" ? "site" : "note",
                            id: entry.key,
                            title: entry.raw.name || entry.raw.address || entry.key,
                            data: entry.raw,
                          });
                        }
                      }}
                    >
                      {chartData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                          className="cursor-pointer transition-opacity hover:opacity-80"
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          {/* Interactive Item List (Clickable entities) */}
          <aside className="flex flex-col rounded-3xl border bg-card p-5 shadow-sm lg:col-span-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold">
                רשימת {TABS.find((t) => t.id === tab)?.label}
              </h2>
              <span className="text-xs text-muted-foreground">לחץ לבחירה וניתוח</span>
            </div>

            <div className="mt-3 max-h-[380px] flex-1 space-y-2 overflow-y-auto pr-1">
              {activeItems.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  לא נמצאו רשומות
                </div>
              ) : (
                activeItems.slice(0, 40).map((item: any, idx: number) => {
                  let key = "";
                  let title = "";
                  let subtitle = "";
                  let metric = "";
                  let entityType: "customer" | "note" | "site" | "pto" = "customer";

                  if (tab === "customers") {
                    entityType = "customer";
                    key = item.customerNo;
                    title = item.name || item.customerNo;
                    subtitle = item.address || "ללא כתובת";
                    metric = `${item.notesCount || 0} תעודות`;
                  } else if (tab === "notes") {
                    entityType = "note";
                    key = String(item.noteId || item["מס' תעודת משלוח"] || idx);
                    title = `תעודה #${key} · ${item.customerName || item["שם לקוח"] || ""}`;
                    subtitle = item.address || item["כתובת אספקה"] || "";
                    metric = String(item.approval || item.status || "מאושר");
                  } else if (tab === "sites") {
                    entityType = "site";
                    key = item.siteKey || item.address || String(idx);
                    title = item.address || "אתר אספקה";
                    subtitle = item.customerName || "לקוח לא משויך";
                    metric = `${item.ptoOpens || 0} מנוף`;
                  } else {
                    entityType = "pto";
                    key = item.id || `${item.date}_${item.openTime}_${idx}`;
                    title = `${item.address || "אתר פריקה"}`;
                    subtitle = `${item.date || ""} (${item.openTime || ""} - ${item.closeTime || ""})`;
                    metric = `${item.durationMin || 0} דק׳`;
                  }

                  const isSelected = selectedEntity?.id === key;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setSelectedEntity({
                          type: entityType,
                          id: key,
                          title,
                          data: item,
                        })
                      }
                      className={cn(
                        "group flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-start transition-all",
                        isSelected
                          ? "border-cyan-500 bg-cyan-500/15 shadow-sm ring-1 ring-cyan-500/50"
                          : "border-border/60 hover:border-cyan-500/30 hover:bg-muted/40"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "truncate text-xs font-bold",
                              isSelected ? "text-cyan-700 dark:text-cyan-300" : "text-foreground"
                            )}
                          >
                            {title}
                          </span>
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] font-bold text-foreground">
                          {metric}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        </div>

        {/* Dynamic Presentation, Voice Narration & Video Generator Section */}
        <section className="rounded-3xl border border-cyan-500/30 bg-gradient-to-l from-cyan-950/20 via-card to-purple-950/20 p-5 shadow-card md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-cyan-400">
                <Sparkles className="h-4 w-4" />
                פקודת נועה תסביר ותקריין בגובה העיניים · הזמנה מרוכזת והיערכות להפתעות מעובדים
              </div>
              <h2 className="mt-1 font-display text-lg font-bold">
                מחולל קריינות ופקודות ל-NotebookLM / Gemini
              </h2>
              <p className="text-xs text-muted-foreground">
                {selectedEntity
                  ? `הפקודות והקריינות מותאמות כעת בשפה פשוטה ובגובה העיניים עבור: ${selectedEntity.title}`
                  : "הפקודות והקריינות מכוונות כעת לדוח רנטגן ארגוני בעברית קלילה ובגובה העיניים."}
              </p>
              <div
                role="group"
                aria-label="מצב הפקה"
                className="mt-3 inline-flex rounded-2xl border bg-muted/40 p-1 text-xs font-black"
              >
                <button
                  type="button"
                  aria-pressed={reportMode === "internal"}
                  onClick={() => setReportMode("internal")}
                  className={cn(
                    "min-h-9 rounded-xl px-3 transition-all",
                    reportMode === "internal"
                      ? "bg-slate-900 text-white shadow"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  🏢 מצב פנימי (הנהלה)
                </button>
                <button
                  type="button"
                  aria-pressed={reportMode === "customer"}
                  onClick={() => setReportMode("customer")}
                  className={cn(
                    "min-h-9 rounded-xl px-3 transition-all",
                    reportMode === "customer"
                      ? "bg-emerald-600 text-white shadow"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  🤝 מצב לקוח (לשליחה)
                </button>
              </div>
              {isCustomerMode && (
                <p className="mt-2 max-w-2xl text-xs font-bold text-amber-500">
                  {customerBlocked
                    ? "מצב לקוח: בחר/י לקוח, תעודה או אתר של לקוח כדי להפיק סקירה. הסקירה הכללית כוללת נתוני לקוחות אחרים ושמות צוות ולכן חסומה."
                    : "מצב לקוח: הפקודות מנוסחות בגוף שני, בלי שמות נהגים/עובדים, לוחיות רישוי, משקלים ושמות מערכות פנימיות. כדאי לעבור על הטקסט לפני שליחה."}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleNoaNarration}
                disabled={customerBlocked}
                className={cn(
                  "flex min-h-11 disabled:cursor-not-allowed disabled:opacity-50 items-center gap-2 rounded-2xl border px-4 text-xs font-black transition-all active:scale-95",
                  isSpeaking
                    ? "border-amber-500 bg-amber-500 text-slate-950 shadow-md"
                    : "border-emerald-500/50 bg-emerald-600 text-white hover:bg-emerald-500 shadow-md shadow-emerald-950/30"
                )}
              >
                {isSpeaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                {isSpeaking ? "עצור הקראה קולית" : "נועה תקרייני לי בקול 🔊"}
              </button>

              <button
                type="button"
                onClick={() => void copyPrompt("noa")}
                disabled={customerBlocked}
                className={cn(
                  "flex min-h-11 disabled:cursor-not-allowed disabled:opacity-50 items-center gap-2 rounded-2xl border px-4 text-xs font-black transition-all active:scale-95",
                  copied === "noa"
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                    : "border-teal-500/50 bg-teal-600 text-white hover:bg-teal-500 shadow-md shadow-teal-950/30"
                )}
              >
                {copied === "noa" ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
                {copied === "noa" ? "פקודת נועה הועתקה!" : "העתק פקודת נועה תסביר ותקריין"}
              </button>

              <button
                type="button"
                onClick={() => void copyPrompt("slides")}
                disabled={customerBlocked}
                className={cn(
                  "flex min-h-11 disabled:cursor-not-allowed disabled:opacity-50 items-center gap-2 rounded-2xl border px-4 text-xs font-black transition-all active:scale-95",
                  copied === "slides"
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                    : "border-cyan-500/50 bg-cyan-600 text-white hover:bg-cyan-500 shadow-md shadow-cyan-950/30"
                )}
              >
                {copied === "slides" ? <Check className="h-4 w-4" /> : <Presentation className="h-4 w-4" />}
                {copied === "slides" ? "פקודת מצגת הועתקה!" : "העתק פקודת מצגת (NotebookLM)"}
              </button>

              <button
                type="button"
                onClick={() => void copyPrompt("video")}
                disabled={customerBlocked}
                className={cn(
                  "flex min-h-11 disabled:cursor-not-allowed disabled:opacity-50 items-center gap-2 rounded-2xl border px-4 text-xs font-black transition-all active:scale-95",
                  copied === "video"
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                    : "border-purple-500/50 bg-purple-600 text-white hover:bg-purple-500 shadow-md shadow-purple-950/30"
                )}
              >
                {copied === "video" ? <Check className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                {copied === "video" ? "פקודת וידאו הועתקה!" : "העתק פקודת וידאו 60 שנ׳ (Gemini)"}
              </button>
            </div>
          </div>

          {/* Highlighted Noa Voice Explanation Box */}
          <div className="mt-5 flex flex-col rounded-2xl border border-emerald-500/30 bg-slate-950/90 p-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <span className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                <Volume2 className="h-4 w-4" />
                פקודת "נועה תסביר ותקריין" — עברית פשוטה, קלילה ובגובה העיניים (הזמנה מרוכזת + הפתעות מעובדים)
              </span>
              <button
                type="button"
                onClick={() => void copyPrompt("noa")}
                className="text-xs text-slate-400 hover:text-emerald-300"
                title="העתק פקודת נועה"
              >
                <ClipboardCopy className="h-3.5 w-3.5" />
              </button>
            </div>
            <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-emerald-100">
              {dynamicNoaVoicePrompt}
            </pre>
          </div>

          {/* Side-by-side Live Prompt Previews */}
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {/* Slide Prompt Box */}
            <div className="flex flex-col rounded-2xl border border-cyan-500/20 bg-slate-950/80 p-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <span className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                  <Presentation className="h-4 w-4" />
                  תצוגת פקודת מצגת בגובה העיניים (NotebookLM / Slides)
                </span>
                <button
                  type="button"
                  onClick={() => void copyPrompt("slides")}
                  className="text-xs text-slate-400 hover:text-cyan-300"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                </button>
              </div>
              <pre className="mt-3 max-h-64 flex-1 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-200">
                {dynamicSlidesPrompt}
              </pre>
            </div>

            {/* Video Prompt Box */}
            <div className="flex flex-col rounded-2xl border border-purple-500/20 bg-slate-950/80 p-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <span className="flex items-center gap-2 text-xs font-bold text-purple-300">
                  <Video className="h-4 w-4" />
                  תצוגת פקודת וידאו וקריינות נועה (Gemini Video Prompt)
                </span>
                <button
                  type="button"
                  onClick={() => void copyPrompt("video")}
                  className="text-xs text-slate-400 hover:text-purple-300"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                </button>
              </div>
              <pre className="mt-3 max-h-64 flex-1 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-200">
                {dynamicVideoPrompt}
              </pre>
            </div>
          </div>
        </section>

        {/* Footer info */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            מערכת נועה AI · ח. סבן חומרי בניין (1994) בע״מ · התלמיד 6 הוד השרון
          </span>
          <div className="flex items-center gap-3">
            <Link to="/chat" className="font-bold text-cyan-600 hover:underline dark:text-cyan-400">
              צ׳אט נועה תפעולי
            </Link>
            <span>·</span>
            <Link to="/orders" className="font-bold text-cyan-600 hover:underline dark:text-cyan-400">
              לוח הזמנות בסידור
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
