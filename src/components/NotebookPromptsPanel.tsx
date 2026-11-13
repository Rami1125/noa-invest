/**
 * NotebookPromptsPanel — מחולל פקודות (מוצלב מ-notebook_1)
 */
import {
  Check, ClipboardCopy, Presentation, Video, Volume2, VolumeX,
  MessageCircle, Building2, PackageCheck, User, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function NotebookPromptsPanel({ vm }: { vm: Record<string, any> }) {
  const {
    selectedEntity, copied, isSpeaking, reportMode, setReportMode,
    effectiveNoaPrompt, effectiveSlidesPrompt, effectiveVideoPrompt,
    toggleNoaNarration, copyPrompt, customerBlocked, customerBlockedNotice,
  } = vm;

  return (
    <section className="rounded-3xl border border-cyan-500/30 bg-gradient-to-l from-cyan-950/20 via-card to-purple-950/20 p-5 shadow-card md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-cyan-400">
            <Sparkles className="h-4 w-4" />
            פקודת נועה תסביר ותקריין · הזמנה מרוכזת והיערכות להפתעות מעובדים
          </div>
          <h2 className="mt-1 font-display text-lg font-bold">
            מחולל קריינות ופקודות ל-NotebookLM / Gemini
          </h2>
          <p className="text-xs text-muted-foreground">
            {selectedEntity
              ? `מותאם עבור: ${selectedEntity.title}`
              : "דוח רנטגן ארגוני בעברית קלילה ובגובה העיניים."}
          </p>
          <div role="group" aria-label="מצב הפקה" className="mt-3 inline-flex rounded-2xl border bg-muted/40 p-1 text-xs font-black">
            <button type="button" aria-pressed={reportMode === "internal"} onClick={() => setReportMode("internal")}
              className={cn("min-h-9 rounded-xl px-3 transition-all", reportMode === "internal" ? "bg-slate-900 text-white shadow" : "text-muted-foreground hover:text-foreground")}>
              מצב פנימי (הנהלה)
            </button>
            <button type="button" aria-pressed={reportMode === "customer"} onClick={() => setReportMode("customer")}
              className={cn("min-h-9 rounded-xl px-3 transition-all", reportMode === "customer" ? "bg-emerald-600 text-white shadow" : "text-muted-foreground hover:text-foreground")}>
              מצב לקוח (לשליחה)
            </button>
          </div>
          {reportMode === "customer" && (
            <p className="mt-2 max-w-2xl text-xs font-bold text-amber-500">
              {customerBlocked
                ? "מצב לקוח: בחר/י לקוח, תעודה או אתר של לקוח כדי להפיק סקירה."
                : "מצב לקוח: ניסוח בגוף שני, בלי מזהים פנימיים. כדאי לעבור על הטקסט לפני שליחה."}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={toggleNoaNarration} disabled={customerBlocked}
            className={cn("flex min-h-11 items-center gap-2 rounded-2xl border px-4 text-xs font-black transition-all disabled:cursor-not-allowed disabled:opacity-50",
              isSpeaking ? "border-amber-500 bg-amber-500 text-slate-950" : "border-emerald-500/50 bg-emerald-600 text-white hover:bg-emerald-500")}>
            {isSpeaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            {isSpeaking ? "עצור הקראה" : "נועה תקרייני 🔊"}
          </button>
          <button type="button" onClick={() => void copyPrompt("noa")} disabled={customerBlocked}
            className={cn("flex min-h-11 items-center gap-2 rounded-2xl border px-4 text-xs font-black disabled:opacity-50",
              copied === "noa" ? "border-emerald-500 bg-emerald-500/20 text-emerald-300" : "border-teal-500/50 bg-teal-600 text-white")}>
            {copied === "noa" ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
            {copied === "noa" ? "הועתק" : "קריינות"}
          </button>
          <button type="button" onClick={() => void copyPrompt("slides")} disabled={customerBlocked}
            className={cn("flex min-h-11 items-center gap-2 rounded-2xl border px-4 text-xs font-black disabled:opacity-50",
              copied === "slides" ? "border-emerald-500 bg-emerald-500/20 text-emerald-300" : "border-cyan-500/50 bg-cyan-600 text-white")}>
            {copied === "slides" ? <Check className="h-4 w-4" /> : <Presentation className="h-4 w-4" />}
            {copied === "slides" ? "הועתק" : "מצגת"}
          </button>
          <button type="button" onClick={() => void copyPrompt("video")} disabled={customerBlocked}
            className={cn("flex min-h-11 items-center gap-2 rounded-2xl border px-4 text-xs font-black disabled:opacity-50",
              copied === "video" ? "border-emerald-500 bg-emerald-500/20 text-emerald-300" : "border-purple-500/50 bg-purple-600 text-white")}>
            {copied === "video" ? <Check className="h-4 w-4" /> : <Video className="h-4 w-4" />}
            {copied === "video" ? "הועתק" : "וידאו"}
          </button>
          <button type="button" onClick={() => void copyPrompt("whatsapp")} disabled={customerBlocked}
            className={cn("flex min-h-11 items-center gap-2 rounded-2xl border px-4 text-xs font-black disabled:opacity-50",
              copied === "whatsapp" ? "border-emerald-500 bg-emerald-500/20 text-emerald-300" : "border-green-500/50 bg-green-700 text-white")}>
            {copied === "whatsapp" ? <Check className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
            {copied === "whatsapp" ? "הועתק" : "וואטסאפ"}
          </button>
          <button type="button" onClick={() => void copyPrompt("pack")} disabled={customerBlocked}
            className={cn("flex min-h-11 items-center gap-2 rounded-2xl border px-4 text-xs font-black disabled:opacity-50",
              copied === "pack" ? "border-emerald-500 bg-emerald-500/20 text-emerald-300" : "border-amber-500/50 bg-amber-600 text-white")}>
            {copied === "pack" ? <Check className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
            {copied === "pack" ? "חבילה הועתקה" : "חבילת קמפיין"}
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-col rounded-2xl border border-emerald-500/30 bg-slate-950/90 p-4">
        <div className="flex items-center gap-2 border-b border-white/10 pb-2.5 text-xs font-bold text-emerald-300">
          <Volume2 className="h-4 w-4" />
          קריינות נועה (מצב {reportMode === "customer" ? "לקוח" : "פנימי"})
        </div>
        <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-emerald-100">
          {customerBlocked ? customerBlockedNotice : effectiveNoaPrompt}
        </pre>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="flex flex-col rounded-2xl border border-cyan-500/20 bg-slate-950/80 p-4">
          <div className="flex items-center gap-2 border-b border-white/10 pb-2.5 text-xs font-bold text-cyan-300">
            <Presentation className="h-4 w-4" /> פקודת מצגת
          </div>
          <pre className="mt-3 max-h-64 flex-1 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-slate-200">
            {customerBlocked ? customerBlockedNotice : effectiveSlidesPrompt}
          </pre>
        </div>
        <div className="flex flex-col rounded-2xl border border-purple-500/20 bg-slate-950/80 p-4">
          <div className="flex items-center gap-2 border-b border-white/10 pb-2.5 text-xs font-bold text-purple-300">
            <Video className="h-4 w-4" /> פקודת וידאו
          </div>
          <pre className="mt-3 max-h-64 flex-1 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-slate-200">
            {customerBlocked ? customerBlockedNotice : effectiveVideoPrompt}
          </pre>
        </div>
      </div>
    </section>
  );
}
