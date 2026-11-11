/**
 * הצלבת כתב-יד מנוף מול PTO + בדיקת פקדונות לפי מילון לוגיסטי.
 * מקורות בלבד — אין המצאת זמנים או כמויות.
 */
import { parseHandwrittenCraneWindows } from "@/lib/smart-dispatch/handwritten-crane";
import type { HandwrittenCraneWindow as ParsedWindow } from "@/lib/smart-dispatch/types";
import {
  matchCranePto,
  type IturanPtoEvent,
  type CraneMatchResult,
  type HandwrittenCraneWindow as MatchHand,
} from "@/lib/ituran-live";

export type DepositPair = { delivered: number; billed: number };

export type HandwritingRow = {
  id: string;
  rawText: string;
  type: "unloading" | "waiting" | "unknown";
  typeHe: string;
  startStr: string;
  endStr: string;
  durationMin: number | null;
  flags: string[];
  matchKind: "aligned" | "mismatch" | "pto_only" | "hand_only" | "unavailable";
  matchDetailHe: string;
  deltaMinutes?: number;
  summaryHe: string;
};

export type DepositFinding = {
  sku: string;
  labelHe: string;
  delivered: number;
  billed: number;
  ok: boolean;
  messageHe: string;
};

export type HandwritingAnalysis = {
  sourceRaw: string;
  rows: HandwritingRow[];
  overall: CraneMatchResult | null;
  deposits: DepositFinding[];
  conclusionsHe: string;
  stampText: string;
};

const TYPE_HE: Record<string, string> = {
  unloading: "פריקה / מנוף",
  waiting: "המתנה",
  unknown: "לא מסווג",
};

function windowToMatchHand(w: ParsedWindow, noteId?: string): MatchHand {
  return {
    noteId,
    openTime: w.startStr,
    closeTime: w.endStr,
  };
}

/** בדיקת פקדונות: נמסר מול חויב — לפי כללי סבן (60002 בלות, 60060 משטחים) */
export function auditDeposits(opts: {
  bales?: DepositPair;
  pallets?: DepositPair;
}): DepositFinding[] {
  const out: DepositFinding[] = [];
  if (opts.bales) {
    const { delivered, billed } = opts.bales;
    const ok = delivered === billed;
    out.push({
      sku: "60002",
      labelHe: "בלות (60002)",
      delivered,
      billed,
      ok,
      messageHe: ok
        ? `בלות תקינות: נמסר ${delivered} = חויב ${billed}`
        : `חריגת פקדון בלות: נמסר ${delivered} ≠ חויב ${billed} — לטיפול ראמי לפי מילון לוגיסטי`,
    });
  }
  if (opts.pallets) {
    const { delivered, billed } = opts.pallets;
    const ok = delivered === billed;
    out.push({
      sku: "60060",
      labelHe: "משטחי סבן (60060)",
      delivered,
      billed,
      ok,
      messageHe: ok
        ? `משטחים תקינים: נמסר ${delivered} = חויב ${billed}`
        : `חריגת פקדון משטחים: נמסר ${delivered} ≠ חויב ${billed} — לטיפול ראמי לפי מילון לוגיסטי`,
    });
  }
  return out;
}

/**
 * ניתוח מלא: פענוח כתב-יד + הצלבת כל חלון מול אירועי PTO + פקדונות.
 */
export function analyzeHandwritingAgainstPto(opts: {
  handwrittenRaw?: string;
  noteId?: string;
  ptoEvents: IturanPtoEvent[];
  bales?: DepositPair;
  pallets?: DepositPair;
}): HandwritingAnalysis {
  const sourceRaw = String(opts.handwrittenRaw || "").trim();
  const parsed = parseHandwrittenCraneWindows(sourceRaw || undefined);
  const deposits = auditDeposits({ bales: opts.bales, pallets: opts.pallets });

  const rows: HandwritingRow[] = parsed.map((w, i) => {
    const hand = windowToMatchHand(w, opts.noteId);
    const res = matchCranePto(opts.ptoEvents, hand, { toleranceMin: 15 });
    const kind = res.match?.kind || (opts.ptoEvents.length ? "mismatch" : "hand_only");
    return {
      id: `hw-${i}-${w.startStr}-${w.endStr}`,
      rawText: w.rawText,
      type: w.type || "unknown",
      typeHe: TYPE_HE[w.type || "unknown"] || TYPE_HE.unknown,
      startStr: w.startStr,
      endStr: w.endStr,
      durationMin: w.isReversed || w.isOutlier ? null : w.durationMin,
      flags: w.flags || [],
      matchKind: kind,
      matchDetailHe: res.match?.detailHe || res.summaryHe,
      deltaMinutes: res.match?.deltaMinutes,
      summaryHe: res.summaryHe,
    };
  });

  let overall: CraneMatchResult | null = null;
  if (parsed.length > 0) {
    const primary = parsed.find((p) => p.type === "unloading") || parsed[0]!;
    overall = matchCranePto(opts.ptoEvents, windowToMatchHand(primary, opts.noteId), {
      toleranceMin: 15,
    });
  } else if (sourceRaw) {
    overall = matchCranePto(
      opts.ptoEvents,
      { noteId: opts.noteId, openTime: sourceRaw },
      { toleranceMin: 15 },
    );
  } else if (opts.ptoEvents.length > 0) {
    overall = matchCranePto(opts.ptoEvents, undefined, { toleranceMin: 15 });
  }

  const lines: string[] = [];
  lines.push(`תעודה ${opts.noteId || "—"} · ניתוח כתב-יד ומנוף`);
  if (!sourceRaw) {
    lines.push("כתב-יד: אין נתון במקור (שדה חלון מנוף ריק).");
  } else {
    lines.push(`גולמי: ${sourceRaw}`);
    lines.push(`חלונות שפוענחו: ${rows.length}`);
    for (const r of rows) {
      const dur = r.durationMin != null ? `${r.durationMin} דק׳` : "—";
      const flags = r.flags.length ? ` [${r.flags.join(", ")}]` : "";
      lines.push(
        `• ${r.typeHe} ${r.startStr}–${r.endStr} (${dur})${flags} → ${r.matchKind}: ${r.matchDetailHe}`,
      );
    }
  }
  if (overall) {
    lines.push(`סיכום הצלבה: ${overall.match?.kind || overall.evidence} — ${overall.summaryHe}`);
  }
  for (const d of deposits) {
    lines.push(`${d.ok ? "✓" : "⚠"} ${d.messageHe}`);
  }
  if (rows.length === 0 && !sourceRaw && deposits.every((d) => d.ok)) {
    lines.push("אין חריגים לדיווח ממקורות זמינים.");
  }

  const conclusionsHe = lines.join("\n");
  const stampText = [
    "נועה · מסקנות הצלבה",
    opts.noteId ? `ת.מ. #${opts.noteId}` : "",
    overall?.match?.kind ? `מנוף: ${overall.match.kind}` : "מנוף: אין הצלבה",
    ...deposits.filter((d) => !d.ok).map((d) => d.messageHe),
    ...rows
      .filter((r) => r.flags.length || r.matchKind === "mismatch")
      .map((r) => `${r.startStr}-${r.endStr}: ${r.flags.join("/") || r.matchKind}`),
  ]
    .filter(Boolean)
    .join("\n");

  return { sourceRaw, rows, overall, deposits, conclusionsHe, stampText };
}

/** סינון אירועי PTO רלוונטיים לתעודה (כתובת גס) */
function parseDateParts_(dStr?: string): { y: number; m: number; d: number } | null {
  if (!dStr) return null;
  const s = String(dStr).trim();
  const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    return { y: parseInt(isoMatch[1]!, 10), m: parseInt(isoMatch[2]!, 10), d: parseInt(isoMatch[3]!, 10) };
  }
  const heMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (heMatch) {
    return { d: parseInt(heMatch[1]!, 10), m: parseInt(heMatch[2]!, 10), y: parseInt(heMatch[3]!, 10) };
  }
  return null;
}

function getIsraelDateStr_(iso: string): string {
  try {
    const d = new Date(iso);
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    return `${y}-${m}-${day}`;
  } catch {
    return iso.slice(0, 10);
  }
}

/** סינון אירועי PTO רלוונטיים לתעודה (תאריך ישראלי + כתובת) ללא חסמים */
export function filterPtoForNote(
  events: IturanPtoEvent[],
  opts: { noteId?: string; address?: string; dateHint?: string },
): IturanPtoEvent[] {
  if (!events.length) return [];
  let list = events;

  // 1. סינון ראשוני מחייב לפי תאריך התעודה (בישראל UTC+2)
  if (opts.dateHint) {
    const parts = parseDateParts_(opts.dateHint);
    if (parts) {
      const targetDateStr = `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;
      const dateFiltered = events.filter((e) => {
        const evDate = getIsraelDateStr_(e.eventTimeIso);
        return evDate === targetDateStr;
      });
      if (dateFiltered.length > 0) {
        list = dateFiltered;
      }
    }
  }

  // 2. סינון משני לפי כתובת (אם קיימת התאמה בתוך אותו יום)
  const addrWords = String(opts.address || "")
    .replace(/[^\u0590-\u05FFa-zA-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (addrWords.length) {
    const matched = list.filter((e) => addrWords.some((w) => (e.address || "").includes(w)));
    if (matched.length) list = matched;
  }

  return list;
}
