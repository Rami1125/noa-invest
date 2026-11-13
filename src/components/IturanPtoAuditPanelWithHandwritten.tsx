/**
 * מעטפת ל-IturanPtoAuditPanel — מציגה מונה כתב יד מטאב «כתב יד».
 */
import { PenLine, AlertTriangle } from "lucide-react";
import { IturanPtoAuditPanel as BasePanel } from "@/components/IturanPtoAuditPanel";
import type { HandwrittenSheetRow } from "@/lib/handwritten-sheet";
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
        {handwrittenError && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            {handwrittenError}
          </span>
        )}
      </div>
      <BasePanel sessions={sessions} notes={notes} sites={sites} />
    </div>
  );
}

export { BasePanel as IturanPtoAuditPanel };
