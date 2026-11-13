/**
 * מעטפת IturanPtoAuditPanel — כתב יד + גשר PTO↔תעודה + הזרקת craneTime בפורמט שה-BasePanel מפענח.
 *
 * הפארסר ב-BasePanel (סיכום summarizeVisitHandwrittenTimes) מכיר רק:
 *   "HH:mm עד HH:mm"  → unloadingMin
 * לכן חובה להזריק בדיוק פורמט זה (לא קו מקף או en-dash).
 */
import { useMemo } from "react";
import { PenLine, AlertTriangle, Link2, CheckCircle2, XCircle } from "lucide-react";
import { IturanPtoAuditPanel as BasePanel } from "@/components/IturanPtoAuditPanel";
import {
  normalizeDocId,
  type HandwrittenSheetRow,
} from "@/lib/handwritten-sheet";
import {
  normNoteDate,
  type PtoSession,
} from "@/lib/smart-dispatch/pto-pairing";
import type { DeliveryNote } from "@/lib/data";
import type { AtlasSite } from "@/lib/customer-history.functions";
import { cn } from "@/lib/utils";

type Props = {
  sessions: PtoSession[];
  notes: DeliveryNote[];
  sites?: AtlasSite[];
  handwrittenIndex?: Map<string, HandwrittenSheetRow[]>;
  handwrittenCount?: number;
  handwrittenError?: string;
  className?: string;
};

/** המרת שעת Sheets: "07:45" | 0.4027 | "0.4027" → HH:mm */
function normalizeTimeHe(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "number" && Number.isFinite(raw)) {
    let dayFrac = raw;
    if (raw >= 1 && raw < 24) dayFrac = raw / 24;
    if (dayFrac >= 0 && dayFrac < 1.5) {
      const totalMin = Math.round((dayFrac % 1) * 24 * 60);
      const hh = Math.floor(totalMin / 60) % 24;
      const mm = totalMin % 60;
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
    return "";
  }
  const s = String(raw).trim();
  if (!s || s === "\u2014" || s === "-") return "";
  const hm = s.match(/^(\d{1,2}):(\d{2})/);
  if (hm) return `${hm[1]!.padStart(2, "0")}:${hm[2]}`;
  if (/^0?\.\d+$/.test(s)) return normalizeTimeHe(Number(s));
  if (s.includes("1899")) return "";
  return "";
}

function hwDurationMin(row: HandwrittenSheetRow): number | null {
  if (row.durationMin != null && Number.isFinite(row.durationMin)) {
    return Math.round(row.durationMin * 10) / 10;
  }
  const open = normalizeTimeHe(row.craneOpenHe);
  const close = normalizeTimeHe(row.craneCloseHe);
  if (open && close) {
    const [oh, om] = open.split(":").map(Number);
    const [ch, cm] = close.split(":").map(Number);
    const a = (oh || 0) * 60 + (om || 0);
    const b = (ch || 0) * 60 + (cm || 0);
    if (b > a) return b - a;
  }
  return null;
}

const RETURNS_OK = /^(\u05dc\u05dc\u05d0\s*\u05d4\u05d7\u05d6\u05e8\u05d4|\u05d0\u05d9\u05df\s*\u05d4\u05d7\u05d6\u05e8\u05d4|\u2014|-|)$/i;

function hasReturnsIssue(row: HandwrittenSheetRow): boolean {
  const t = String(row.returnsText || "").trim();
  return Boolean(t && !RETURNS_OK.test(t));
}

/**
 * פורמט ש-BasePanel.parseHandwrittenCraneWindows מפענח:
 * "07:45 עד 08:15" → unloadingMin=30
 */
function formatCraneTimeForBasePanel(row: HandwrittenSheetRow, ptoMin?: number | null): string {
  let open = normalizeTimeHe(row.craneOpenHe);
  let close = normalizeTimeHe(row.craneCloseHe);
  const dur = hwDurationMin(row);

  // אם חסרות שעות אבל יש משך — סנתי חלון 00:00→דקות כדי שהפארסר יחשב unloadingMin
  if ((!open || !close) && dur != null && dur > 0) {
    open = "00:00";
    const hh = Math.floor(dur / 60);
    const mm = Math.round(dur % 60);
    close = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  if (!open || !close) return "";

  // חובה: מילת "עד" (לא en-dash) — אחרת כך הפארסר ב-BasePanel
  let line = `${open} עד ${close}`;
  if (dur != null) line += ` (${dur} דק׳)`;
  if (hasReturnsIssue(row)) {
    // נשמר בטקסט; האזהרת KPI מחושבת למטה ב-bridge
    line += ` · ${row.returnsText.slice(0, 60)}`;
  }
  return line;
}

function tokens(raw?: string): string[] {
  return String(raw || "")
    .toLowerCase()
    .replace(/["'\u05f4\u05f3`.,;()]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^\u05d4/, ""))
    .filter((t) => t.length >= 2);
}

function softAddr(a?: string, b?: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  let score = 0;
  for (const t of ta) {
    if (tb.some((x) => x === t || x.includes(t) || t.includes(x))) score += 1;
  }
  const numA = String(a || "").match(/\b\d+/);
  const numB = String(b || "").match(/\b\d+/);
  if (numA && numB && numA[0] === numB[0]) score += 2;
  return score;
}

function normHwDate(raw?: string): string {
  return normNoteDate(raw) || String(raw || "").trim();
}

function datesClose(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const na = normNoteDate(a) || a;
  const nb = normNoteDate(b) || b;
  return na === nb;
}

export function IturanPtoAuditPanelWithHandwritten({
  sessions,
  notes,
  sites,
  handwrittenIndex,
  handwrittenCount = 0,
  handwrittenError = "",
  className,
}: Props) {
  const matchedDocs = handwrittenIndex?.size ?? 0;

  const computed = useMemo(() => {
    const index = handwrittenIndex || new Map<string, HandwrittenSheetRow[]>();
    const notesById = new Map(notes.map((n) => [normalizeDocId(n.id), n]));

    let linkedNotesCount = 0;
    const enrichedBase = notes.map((n) => {
      const id = normalizeDocId(n.id);
      const rows = (id && index.get(id)) || [];
      if (!rows.length) return n;
      linkedNotesCount += 1;
      return n;
    });

    const hwFlat: HandwrittenSheetRow[] = [];
    for (const list of index.values()) hwFlat.push(...list);

    const usedNotes = new Set<string>();
    const outSessions: PtoSession[] = sessions.map((s) => ({ ...s }));
    let bridgeCount = 0;

    for (const s of outSessions) {
      if (s.matchedNoteId) usedNotes.add(normalizeDocId(s.matchedNoteId));
    }

    type Cand = { si: number; docId: string; score: number };
    const cands: Cand[] = [];
    for (let si = 0; si < outSessions.length; si++) {
      const s = outSessions[si]!;
      if (s.matchedNoteId || s.orphan) continue;
      const ptoAddr = [s.address, s.driver].filter(Boolean).join(" ");
      for (const hw of hwFlat) {
        const docId = normalizeDocId(hw.docId);
        if (!docId || usedNotes.has(docId) || !notesById.has(docId)) continue;
        const hwDate = normHwDate(hw.noteDate);
        if (hwDate && s.date && !datesClose(hwDate, s.date)) continue;
        const hwAddr = [hw.city, hw.address, hw.customerName].filter(Boolean).join(" ");
        let score = softAddr(hwAddr, ptoAddr);
        if (!String(s.address || "").trim() && hwDate && datesClose(hwDate, s.date)) score += 1;
        if (score < 2) continue;
        cands.push({ si, docId, score });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    for (const c of cands) {
      const s = outSessions[c.si]!;
      if (s.matchedNoteId || usedNotes.has(c.docId)) continue;
      s.matchedNoteId = c.docId;
      usedNotes.add(c.docId);
      bridgeCount += 1;
      const note = notesById.get(c.docId);
      if (note?.siteAddress && !String(s.address || "").trim()) s.address = String(note.siteAddress);
    }

    const notesByDate = new Map<string, DeliveryNote[]>();
    for (const n of enrichedBase) {
      const d = normNoteDate(n.date);
      if (!d) continue;
      const list = notesByDate.get(d) || [];
      list.push(n);
      notesByDate.set(d, list);
    }
    for (const s of outSessions) {
      if (s.matchedNoteId || s.orphan) continue;
      const dayNotes = (notesByDate.get(s.date) || []).filter((n) => !usedNotes.has(normalizeDocId(n.id)));
      if (dayNotes.length === 1) {
        const id = normalizeDocId(dayNotes[0]!.id);
        s.matchedNoteId = id;
        usedNotes.add(id);
        bridgeCount += 1;
      } else if (dayNotes.length > 1 && String(s.address || "").trim()) {
        let best: DeliveryNote | undefined;
        let bestScore = 0;
        for (const n of dayNotes) {
          const sc = softAddr(n.siteAddress, s.address);
          if (sc > bestScore) {
            bestScore = sc;
            best = n;
          }
        }
        if (best && bestScore >= 2) {
          const id = normalizeDocId(best.id);
          s.matchedNoteId = id;
          usedNotes.add(id);
          bridgeCount += 1;
        }
      }
    }

    // הזרקת craneTime לתעודות + סטטיסטיקת תואם/הזרה
    let aligned = 0;
    let mismatch = 0;
    let withHw = 0;
    let linkedSessions = 0;

    const notesEnriched = enrichedBase.map((n) => {
      const id = normalizeDocId(n.id);
      const rows = (id && index.get(id)) || [];
      if (!rows.length) return n;
      const primary =
        rows.find((r) => r.craneOpenHe || r.craneCloseHe || r.durationMin != null) || rows[0]!;

      // מצא duration מסשן PTO שמקושר לתעודה זו
      const linkedSess = outSessions.find((s) => normalizeDocId(s.matchedNoteId) === id);
      const ptoMin = linkedSess?.durationMin ?? null;
      const line = formatCraneTimeForBasePanel(primary, ptoMin);
      if (!line) return n;

      const hwMin = hwDurationMin(primary);
      const returnsBad = hasReturnsIssue(primary);
      if (hwMin != null && ptoMin != null && Number.isFinite(ptoMin)) {
        const delta = Math.abs(ptoMin - hwMin);
        if (delta <= 10 && !returnsBad) aligned += 1;
        else if (delta > 10 || returnsBad) mismatch += 1;
      } else if (returnsBad) {
        mismatch += 1;
      }
      withHw += 1;

      return { ...n, craneTime: line };
    });

    for (const s of outSessions) {
      const id = normalizeDocId(s.matchedNoteId);
      if (id && index.has(id)) linkedSessions += 1;
    }

    return {
      notesEnriched,
      sessionsLinked: outSessions,
      linkedNotes: linkedNotesCount,
      linkedSessions,
      hwBridge: bridgeCount,
      aligned,
      mismatch,
      withHw,
      matchedPto: outSessions.filter((s) => s.matchedNoteId).length,
    };
  }, [notes, sessions, handwrittenIndex]);

  return (
    <div className={cn("space-y-3", className)} dir="rtl">
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-sm",
          handwrittenError
            ? "border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-100"
            : handwrittenCount > 0
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
              : "border-border/60 bg-muted/40 text-muted-foreground",
        )}
      >
        <PenLine className="h-4 w-4 shrink-0" />
        <span className="font-bold">\u05db\u05ea\u05d1 \u05d9\u05d3 (\u05d8\u05d0\u05d1 \u05d7\u05d9)</span>
        <span className="tabular-nums text-lg font-extrabold">{handwrittenCount}</span>
        <span className="text-xs opacity-80">\u05e9\u05d5\u05e8\u05d5\u05ea</span>
        {matchedDocs > 0 && (
          <span className="text-xs opacity-80">\u00b7 {matchedDocs} \u05de\u05e1\u05f3 \u05ea\u05e2\u05d5\u05d3\u05d4</span>
        )}
        <span className="inline-flex items-center gap-1 text-xs font-semibold opacity-90">
          <Link2 className="h-3.5 w-3.5" />
          PTO\u2194\u05ea\u05e2\u05d5\u05d3\u05d4: {computed.matchedPto}
          {computed.hwBridge > 0 ? ` (+${computed.hwBridge} \u05d2\u05e9\u05e8)` : ""}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5" />
          \u05ea\u05d5\u05d0\u05dd \u05db\u05f4\u05d9: {computed.aligned}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-semibold",
            computed.mismatch > 0 ? "text-red-700 dark:text-red-300" : "opacity-80",
          )}
        >
          <XCircle className="h-3.5 w-3.5" />
          \u05d0\u05d6\u05d4\u05e8\u05d5\u05ea \u05db\u05f4\u05d9: {computed.mismatch}
        </span>
        {handwrittenError && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            {handwrittenError}
          </span>
        )}
      </div>
      <BasePanel sessions={computed.sessionsLinked} notes={computed.notesEnriched} sites={sites} />
    </div>
  );
}

export { BasePanel as IturanPtoAuditPanel };
