/**
 * טבלת «כתב יד מזוהה» + סטטוס הצלבה לכל חלון
 */
import type { HandwritingAnalysis, HandwritingRow } from "@/lib/handwriting-match";
import { AlertTriangle, CheckCircle2, Clock, HelpCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

function kindStyle(kind: HandwritingRow["matchKind"]) {
  switch (kind) {
    case "aligned":
      return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
    case "mismatch":
      return "bg-amber-500/15 text-amber-800 border-amber-500/30";
    case "hand_only":
      return "bg-blue-500/15 text-blue-800 border-blue-500/30";
    case "pto_only":
      return "bg-slate-500/15 text-slate-700 border-slate-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function KindIcon({ kind }: { kind: HandwritingRow["matchKind"] }) {
  if (kind === "aligned") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (kind === "mismatch") return <AlertTriangle className="h-3.5 w-3.5" />;
  if (kind === "unavailable") return <XCircle className="h-3.5 w-3.5" />;
  return <HelpCircle className="h-3.5 w-3.5" />;
}

const KIND_HE: Record<HandwritingRow["matchKind"], string> = {
  aligned: "תואם",
  mismatch: "פער",
  pto_only: "PTO בלבד",
  hand_only: "כתב-יד בלבד",
  unavailable: "אין נתון",
};

export function HandwritingMatchPanel({
  analysis,
  compact,
}: {
  analysis: HandwritingAnalysis;
  compact?: boolean;
}) {
  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Clock className="h-4 w-4 text-primary" />
          כתב יד מזוהה · הצלבת PTO
        </h3>
        {analysis.overall && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold",
              kindStyle(analysis.overall.match?.kind || "unavailable"),
            )}
          >
            <KindIcon kind={analysis.overall.match?.kind || "unavailable"} />
            {KIND_HE[analysis.overall.match?.kind || "unavailable"]}
          </span>
        )}
      </div>

      {analysis.sourceRaw ? (
        <p className="rounded-xl bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="font-bold text-foreground">גולמי מהמקור: </span>
          {analysis.sourceRaw}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">אין שדה חלון מנוף בכתב יד במקור לתעודה זו.</p>
      )}

      {analysis.rows.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-border/70">
          <table className="w-full min-w-[520px] text-right text-xs">
            <thead className="bg-muted/60 text-[10px] font-bold text-muted-foreground">
              <tr>
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">גולמי</th>
                <th className="px-2 py-2">סוג</th>
                <th className="px-2 py-2">פתיחה</th>
                <th className="px-2 py-2">סגירה</th>
                <th className="px-2 py-2">משך</th>
                <th className="px-2 py-2">דגלים</th>
                <th className="px-2 py-2">הצלבה</th>
              </tr>
            </thead>
            <tbody>
              {analysis.rows.map((r, i) => (
                <tr key={r.id} className="border-t border-border/50">
                  <td className="px-2 py-2 font-mono text-muted-foreground">{i + 1}</td>
                  <td className="max-w-[140px] truncate px-2 py-2 font-medium" title={r.rawText}>
                    {r.rawText}
                  </td>
                  <td className="px-2 py-2">{r.typeHe}</td>
                  <td className="px-2 py-2 font-mono">{r.startStr}</td>
                  <td className="px-2 py-2 font-mono">{r.endStr}</td>
                  <td className="px-2 py-2">
                    {r.durationMin != null ? `${r.durationMin} דק׳` : "—"}
                  </td>
                  <td className="px-2 py-2 text-[10px] text-amber-700">
                    {r.flags.length ? r.flags.join(", ") : "—"}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[10px] font-bold",
                        kindStyle(r.matchKind),
                      )}
                      title={r.matchDetailHe}
                    >
                      <KindIcon kind={r.matchKind} />
                      {KIND_HE[r.matchKind]}
                      {r.deltaMinutes != null ? ` · ${r.deltaMinutes}ד׳` : ""}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {analysis.deposits.length > 0 && !compact && (
        <ul className="space-y-1.5 text-xs">
          {analysis.deposits.map((d) => (
            <li
              key={d.sku}
              className={cn(
                "rounded-xl border px-3 py-2",
                d.ok ? "border-emerald-500/25 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/10",
              )}
            >
              {d.messageHe}
            </li>
          ))}
        </ul>
      )}

      {!compact && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-2xl border border-border/60 bg-card p-3 text-[11px] leading-relaxed text-foreground">
          {analysis.conclusionsHe}
        </pre>
      )}
    </div>
  );
}
