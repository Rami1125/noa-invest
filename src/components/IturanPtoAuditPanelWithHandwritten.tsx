/**
 * מעטפת ל-IturanPtoAuditPanel — מונה טאב «כתב יד» + הזרקת זמנים לתעודות.
 * הפאנל הבסיסי קורא notes.craneTime; כאן ממלאים אותו מאינדקס הטאב החי.
 */
import { useMemo } from "react";
import { PenLine, AlertTriangle, Link2 } from "lucide-react";
import { IturanPtoAuditPanel as BasePanel } from "@/components/IturanPtoAuditPanel";
import {
  normalizeDocId,
  type HandwrittenSheetRow,
} from "@/lib/handwritten-sheet";
import type { PtoSession } from "@/lib/smart-dispatch/pto-pairing";
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
    parts.push(`${r.craneOpenHe || "?"}–${r.craneCloseHe || "?"}`);
  }
  if (r.durationMin != null) parts.push(`${r.durationMin} דק׳ מנוף`);
  if (r.returnsText && !/^ללא\s*החזרה/i.test(r.returnsText.trim())) {
    parts.push(r.returnsText.slice(0, 80));
  }
  if (r.fieldNotes) parts.push(r.fieldNotes.slice(0, 60));
  return parts.filter(Boolean).join(" · ") || "כתב יד (טאב)";
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

  const { notesEnriched, linkedNotes, linkedSessions } = useMemo(() => {
    const index = handwrittenIndex || new Map<string, HandwrittenSheetRow[]>();
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

    let linkedSess = 0;
    for (const s of sessions) {
      const ids = [
        normalizeDocId(s.matchedNoteId),
        // part of multi-doc fields if present on session as any
        normalizeDocId((s as { docId?: string }).docId),
      ].filter(Boolean);
      if (ids.some((id) => index.has(id!))) linkedSess += 1;
    }

    return {
      notesEnriched: enriched,
      linkedNotes: linkedNotesCount,
      linkedSessions: linkedSess,
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
        <span className="font-bold">כתב יד (טאב חי)</span>
        <span className="tabular-nums text-lg font-extrabold">{handwrittenCount}</span>
        <span className="text-xs opacity-80">שורות</span>
        {matchedDocs > 0 && (
          <span className="text-xs opacity-80">· {matchedDocs} מס׳ תעודה מאונדקסים</span>
        )}
        <span className="inline-flex items-center gap-1 text-xs font-semibold opacity-90">
          <Link2 className="h-3.5 w-3.5" />
          הצלבה לתעודות: {linkedNotes}
        </span>
        <span className="text-xs opacity-80">· סשני PTO מקושרים: {linkedSessions}</span>
        {handwrittenError && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            {handwrittenError}
          </span>
        )}
      </div>
      <BasePanel sessions={sessions} notes={notesEnriched} sites={sites} />
    </div>
  );
}

export { BasePanel as IturanPtoAuditPanel };
