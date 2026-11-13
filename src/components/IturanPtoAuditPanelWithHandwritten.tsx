/**
 * מעטפת IturanPtoAuditPanel — מונה כתב יד + הצלבת PTO↔תעודות דרך כתב יד.
 */
import { useMemo } from "react";
import { PenLine, AlertTriangle, Link2 } from "lucide-react";
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

function formatHwCraneLine(rows: HandwrittenSheetRow[]): string {
  const r = rows.find((x) => x.craneOpenHe || x.craneCloseHe || x.durationMin != null) || rows[0];
  if (!r) return "";
  const parts: string[] = [];
  if (r.craneOpenHe || r.craneCloseHe) {
    parts.push(`${r.craneOpenHe || "?"}\u2013${r.craneCloseHe || "?"}`);
  }
  if (r.durationMin != null) parts.push(`${r.durationMin} \u05d3\u05e7\u05f3 \u05de\u05e0\u05d5\u05e3`);
  if (r.returnsText && !/^\u05dc\u05dc\u05d0\s*\u05d4\u05d7\u05d6\u05e8\u05d4/i.test(r.returnsText.trim())) {
    parts.push(r.returnsText.slice(0, 80));
  }
  if (r.fieldNotes) parts.push(r.fieldNotes.slice(0, 60));
  return parts.filter(Boolean).join(" \u00b7 ") || "\u05db\u05ea\u05d1 \u05d9\u05d3 (\u05d8\u05d0\u05d1)";
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
  // also try swapping if one is yyyy-mm-dd already normalized
  const na = normNoteDate(a) || a;
  const nb = normNoteDate(b) || b;
  if (na === nb) return true;
  return false;
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

  const { notesEnriched, sessionsLinked, linkedNotes, linkedSessions, hwBridge } = useMemo(() => {
    const index = handwrittenIndex || new Map<string, HandwrittenSheetRow[]>();
    const notesById = new Map(notes.map((n) => [normalizeDocId(n.id), n]));

    let linkedNotesCount = 0;
    const enriched = notes.map((n) => {
      const id = normalizeDocId(n.id);
      const rows = (id && index.get(id)) || [];
      if (!rows.length) return n;
      linkedNotesCount += 1;
      const existing = String(n.craneTime || "").trim();
      if (existing) return n;
      return { ...n, craneTime: formatHwCraneLine(rows) };
    });

    // שטח כל שורות כתב יד לצימוד כתובת
    const hwFlat: HandwrittenSheetRow[] = [];
    for (const list of index.values()) hwFlat.push(...list);

    const usedNotes = new Set<string>();
    const outSessions: PtoSession[] = sessions.map((s) => ({ ...s }));
    let bridgeCount = 0;

    // 1) כבר משויך — סמור
    for (const s of outSessions) {
      if (s.matchedNoteId) usedNotes.add(normalizeDocId(s.matchedNoteId));
    }

    // 2) גשר כתב יד: סשן PTO ↔ שורת HW (תאריך+כתובת) ↔ תעודה
    type Cand = { si: number; docId: string; score: number };
    const cands: Cand[] = [];
    for (let si = 0; si < outSessions.length; si++) {
      const s = outSessions[si]!;
      if (s.matchedNoteId || s.orphan) continue;
      const ptoAddr = [s.address, s.driver].filter(Boolean).join(" ");
      for (const hw of hwFlat) {
        const docId = normalizeDocId(hw.docId);
        if (!docId || usedNotes.has(docId)) continue;
        if (!notesById.has(docId) && !index.has(docId)) continue;
        // חובת תעודה בארכיון או לפחות באינדקס HW
        const noteExists = notesById.has(docId);
        if (!noteExists) continue;

        const hwDate = normHwDate(hw.noteDate);
        if (hwDate && s.date && !datesClose(hwDate, s.date)) continue;

        const hwAddr = [hw.city, hw.address, hw.customerName].filter(Boolean).join(" ");
        let score = softAddr(hwAddr, ptoAddr);
        // אותו יום בלי כתובת — ניקוד חלש
        if (!String(s.address || "").trim() && hwDate && datesClose(hwDate, s.date)) score += 1;
        if (score < 2) continue;
        cands.push({ si, docId, score });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    for (const c of cands) {
      const s = outSessions[c.si]!;
      if (s.matchedNoteId) continue;
      if (usedNotes.has(c.docId)) continue;
      s.matchedNoteId = c.docId;
      usedNotes.add(c.docId);
      bridgeCount += 1;
      const note = notesById.get(c.docId);
      if (note?.siteAddress && !String(s.address || "").trim()) {
        s.address = String(note.siteAddress);
      }
    }

    // 3) גיבוי: תעודה יחידה באותו יום (ללא רישוי) לסשן ללא שיוך
    const notesByDate = new Map<string, DeliveryNote[]>();
    for (const n of enriched) {
      const d = normNoteDate(n.date);
      if (!d) continue;
      const list = notesByDate.get(d) || [];
      list.push(n);
      notesByDate.set(d, list);
    }
    for (const s of outSessions) {
      if (s.matchedNoteId || s.orphan) continue;
      const dayNotes = (notesByDate.get(s.date) || []).filter(
        (n) => !usedNotes.has(normalizeDocId(n.id)),
      );
      if (dayNotes.length === 1) {
        const n = dayNotes[0]!;
        const id = normalizeDocId(n.id);
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

    let linkedSess = 0;
    for (const s of outSessions) {
      const id = normalizeDocId(s.matchedNoteId);
      if (id && index.has(id)) linkedSess += 1;
    }

    return {
      notesEnriched: enriched,
      sessionsLinked: outSessions,
      linkedNotes: linkedNotesCount,
      linkedSessions: linkedSess,
      hwBridge: bridgeCount,
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
          <span className="text-xs opacity-80">\u00b7 {matchedDocs} \u05de\u05e1\u05f3 \u05ea\u05e2\u05d5\u05d3\u05d4 \u05de\u05d0\u05d5\u05e0\u05d3\u05e7\u05e1\u05d9\u05dd</span>
        )}
        <span className="inline-flex items-center gap-1 text-xs font-semibold opacity-90">
          <Link2 className="h-3.5 w-3.5" />
          \u05d4\u05e6\u05dc\u05d1\u05d4 \u05dc\u05ea\u05e2\u05d5\u05d3\u05d5\u05ea: {linkedNotes}
        </span>
        <span className="text-xs opacity-80">
          \u00b7 PTO\u2194\u05ea\u05e2\u05d5\u05d3\u05d4: {sessionsLinked.filter((s) => s.matchedNoteId).length}
          {hwBridge > 0 ? ` (+${hwBridge} \u05d2\u05e9\u05e8 \u05db\u05d5\"\u05d9)` : ""}
        </span>
        <span className="text-xs opacity-80">\u00b7 \u05e2\u05dd \u05db\u05ea\u05d1 \u05d9\u05d3: {linkedSessions}</span>
        {handwrittenError && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            {handwrittenError}
          </span>
        )}
      </div>
      <BasePanel sessions={sessionsLinked} notes={notesEnriched} sites={sites} />
    </div>
  );
}

export { BasePanel as IturanPtoAuditPanel };
