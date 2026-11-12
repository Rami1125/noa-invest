/**
 * פאנל QA ויזואלי — PREMIUM ARCHITECTURAL EDITORIAL · RTL
 */
import { AlertTriangle, CheckCircle2, Copy, ShieldCheck, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type QaReport,
  buildApprovedCommand,
  persistApprovedPrompt,
  pushQaHistory,
  verifyCopyIntegrity,
} from "./qa-engine";

type Props = {
  report: QaReport | null;
  onCopied?: (ok: boolean, message: string) => void;
};

export function CreativeQaPanel({ report, onCopied }: Props) {
  if (!report) {
    return (
      <section className="rounded-3xl border border-[#15324B]/15 bg-white p-4 shadow-sm" dir="rtl">
        <p className="text-sm text-[#858B91]">ממתין להרכבת פקודה והרצת QA…</p>
      </section>
    );
  }

  const gradeColor =
    report.grade === "A" || report.grade === "B"
      ? "bg-emerald-600"
      : report.grade === "C"
        ? "bg-amber-500"
        : "bg-red-600";

  const handleCopy = async () => {
    const built = buildApprovedCommand(report);
    if (!built.ok) {
      onCopied?.(false, built.blockReason || "העתקה נחסמה");
      return;
    }
    try {
      await navigator.clipboard.writeText(built.command);
      if (report.approvedPromptHash) {
        persistApprovedPrompt(report.approvedPromptHash, built.command);
        const integrity = verifyCopyIntegrity(report.approvedPromptHash, built.command);
        pushQaHistory({
          at: new Date().toLocaleString("he-IL"),
          engineId: report.engineId,
          score: report.score,
          canCopy: true,
          masterVersion: report.assembled.metadata.MASTER_VERSION,
          promptPreview: built.command.slice(0, 140) + "…",
          criticalCount: 0,
        });
        onCopied?.(true, integrity.message);
      } else {
        onCopied?.(true, "הועתק");
      }
    } catch {
      onCopied?.(false, "העתקה נכשלה — סמן ידנית");
    }
  };

  return (
    <section
      className="space-y-4 rounded-3xl border-2 border-[#15324B]/20 bg-gradient-to-br from-white via-[#DCEAF3]/30 to-[#E8E2D8]/40 p-4 shadow-sm md:p-5"
      dir="rtl"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-extrabold text-[#15324B]">
            Creative Engine QA · {report.engineLabel}
          </h2>
          <p className="text-[11px] text-[#858B91]">
            נבדק: {new Date(report.evaluatedAt).toLocaleString("he-IL")} · MASTER:{" "}
            {report.assembled.metadata.MASTER_VERSION}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-black text-white",
              gradeColor,
            )}
          >
            {report.grade}
          </span>
          <div className="text-end">
            <div className="text-2xl font-black tabular-nums text-[#15324B]">{report.score}</div>
            <div className="text-[10px] font-bold text-[#858B91]">מתוך 100</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] font-bold">
        {report.canCopy ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/15 px-2.5 py-1 text-emerald-800">
            <ShieldCheck className="h-3.5 w-3.5" /> מאושר להעתקה
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-600/15 px-2.5 py-1 text-red-700">
            <XCircle className="h-3.5 w-3.5" /> העתקה חסומה — כשל קריטי / ציון נמוך
          </span>
        )}
        <span className="rounded-full bg-[#15324B]/10 px-2.5 py-1 text-[#15324B]">
          קריטי: {report.criticalFailures.length} · מהותי: {report.majorFailures.length}
        </span>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-extrabold text-[#15324B]">בדיקות חובה וייחודיות</h3>
        <ul className="grid max-h-56 gap-1.5 overflow-y-auto sm:grid-cols-2">
          {report.checks.map((c) => (
            <li
              key={c.id}
              className={cn(
                "rounded-xl border px-2.5 py-2 text-[11px]",
                c.passed ? "border-emerald-200 bg-emerald-50/80" : "border-red-200 bg-red-50/80",
              )}
            >
              <div className="flex items-start gap-1.5">
                {c.passed ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                )}
                <div>
                  <div className="font-bold text-[#1C2732]">
                    {c.label}{" "}
                    <span className="font-medium text-[#858B91]">({c.severity})</span>
                  </div>
                  <div className="text-[#858B91]">{c.detail}</div>
                  {!c.passed && c.recommendation && (
                    <div className="mt-0.5 font-medium text-[#15324B]">→ {c.recommendation}</div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {report.sources.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-extrabold text-[#15324B]">מקורות לנתונים מספריים/טכניים</h3>
          <ul className="space-y-1 text-[11px]">
            {report.sources.map((s, i) => (
              <li key={i} className="rounded-lg border border-[#DCEAF3] bg-white/80 px-2 py-1">
                <span className="font-bold">{s.field}:</span> {s.value}{" "}
                <span className="text-[#858B91]">· מקור: {s.source}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.contradictions.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-[11px] text-red-800">
          <strong>סתירות מול MASTER:</strong> {report.contradictions.join(" · ")}
        </div>
      )}

      <div>
        <h3 className="mb-1 text-xs font-extrabold text-[#15324B]">תצוגה מקדימה · Command Builder</h3>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-2xl bg-[#1C2732] p-3 text-[10px] leading-relaxed text-[#E8E2D8]">
          {report.assembled.finalPrompt.slice(0, 4000)}
          {report.assembled.finalPrompt.length > 4000 ? "\n…" : ""}
        </pre>
        <button
          type="button"
          onClick={() => void handleCopy()}
          disabled={!report.canCopy}
          className={cn(
            "mt-3 inline-flex min-h-11 items-center gap-2 rounded-2xl px-5 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40",
            report.canCopy ? "bg-[#15324B] hover:bg-[#0f2740]" : "bg-[#858B91]",
          )}
        >
          <Copy className="h-4 w-4" />
          {report.canCopy ? "העתק פקודה מאושרת" : "העתקה חסומה עד תיקון כשלים"}
        </button>
      </div>
    </section>
  );
}
