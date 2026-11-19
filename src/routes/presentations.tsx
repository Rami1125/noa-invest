/**
 * /presentations — מצגות יום אספקה (ארכיון + רינטגן → פקודת NotebookLM)
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Presentation } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { DeliveryDayStudio } from "@/components/logistics-dict/DeliveryDayStudio";
import { getPurchaseMatrixFn } from "@/lib/customer-history.functions";

export const Route = createFileRoute("/presentations")({
  head: () => ({
    meta: [{ title: "מצגות יום אספקה · ח. סבן" }],
  }),
  component: PresentationsPage,
});

function PresentationsPage() {
  const purchaseQ = useQuery({
    queryKey: ["dict-purchase-matrix-v2"],
    queryFn: () => getPurchaseMatrixFn(),
    staleTime: 60_000,
  });

  const analysisPoints = useMemo(() => {
    const matrix = purchaseQ.data;
    const lines = matrix?.lines || [];
    const pts: string[] = [];
    if (matrix?.noteCount) {
      pts.push(`ארכיון: ${matrix.notesWithProducts || 0}/${matrix.noteCount} תעודות עם פריטים`);
    }
    if (matrix?.dictRows) {
      pts.push(`מילון_לוגיסט: ${matrix.dictRows} שורות`);
    }
    if (lines.length) {
      pts.push(`שורות פריטים בארכיון: ${lines.length}`);
    }
    pts.push("רינטגן: ממצאים קריטיים מוזרקים לפקודה כשיש seed ליום");
    return pts;
  }, [purchaseQ.data]);

  const [applied, setApplied] = useState("");
  const [appliedMeta, setAppliedMeta] = useState<{ dateIso: string; dateLabel: string } | null>(null);

  return (
    <div className="min-h-screen bg-[#F3F7FB]" dir="rtl" lang="he">
      <PageHeader
        title="מצגות יום אספקה"
        subtitle="ארכיון_תעודות_גליה · רינטגן · ציר זמן · פקודת 8 שקפים ל-NotebookLM"
        action={
          <Link
            to="/logistics-dict"
            className="inline-flex items-center gap-1 rounded-xl border border-[#1769AA]/30 bg-white px-3 py-2 text-xs font-bold text-[#1769AA]"
          >
            מנוע יצירה מלא
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#5A6A7A]">
          <Presentation className="h-4 w-4 text-[#1769AA]" />
          <span>SABAN DELIVERY INTELLIGENCE</span>
          <span className="text-[#DCE6EF]">|</span>
          <span>בחר 17/11/2026 לראות נתוני ארכיון + ממצאי רינטגן בפקודה</span>
        </div>

        <DeliveryDayStudio
          verifiedLines={analysisPoints}
          onApplyPrompt={(prompt, meta) => {
            setApplied(prompt);
            setAppliedMeta(meta);
          }}
        />

        {applied ? (
          <section className="space-y-3 rounded-3xl border border-[#102A43]/15 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-extrabold text-[#102A43]">
              פקודה מוכנה להדבקה
              {appliedMeta ? ` · ${appliedMeta.dateLabel}` : ""}
            </h3>
            <p className="text-sm font-medium text-[#5A6A7A]">
              הדבק ב-NotebookLM יחד עם קובץ הסריקה של אותו יום. הבלוק DATA_FROM_SHEET כבר כולל תעודות,
              ציר זמן וממצאי רינטגן — אין צורך בגישה חיה לגיליון.
            </p>
            <pre
              dir="rtl"
              className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-2xl border border-[#DCE6EF] bg-[#F3F7FB] p-4 text-[12px] leading-relaxed text-[#1C2732]"
            >
              {applied}
            </pre>
            <button
              type="button"
              className="rounded-xl bg-[#102A43] px-4 py-2.5 text-sm font-bold text-white"
              onClick={async () => {
                await navigator.clipboard.writeText(applied);
              }}
            >
              העתק שוב
            </button>
          </section>
        ) : null}
      </main>
    </div>
  );
}
