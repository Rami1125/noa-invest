/**
 * אזור מצגת יום אספקה — בורר תאריך + הפקת פקודת 8 שקפים
 */
import { useMemo, useState } from "react";
import {
  CalendarDays,
  ClipboardCopy,
  Check,
  Presentation,
  Sparkles,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildDeliveryDayPresentationPrompt,
  formatHeDate,
  todayIso,
} from "@/lib/logistics-dict/delivery-day-prompt";

type Props = {
  verifiedLines?: string[];
  onApplyPrompt: (prompt: string, meta: { dateIso: string; dateLabel: string }) => void;
  className?: string;
};

export function DeliveryDayStudio({ verifiedLines, onApplyPrompt, className }: Props) {
  const [dateIso, setDateIso] = useState(todayIso);
  const [truck, setTruck] = useState("");
  const [driver, setDriver] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [slideCount, setSlideCount] = useState(8);
  const [copied, setCopied] = useState(false);

  const dateLabel = useMemo(() => formatHeDate(dateIso), [dateIso]);

  const prompt = useMemo(
    () =>
      buildDeliveryDayPresentationPrompt({
        dateIso,
        dateLabel,
        truck: truck || undefined,
        driver: driver || undefined,
        slideCount,
        extraNotes: extraNotes || undefined,
        verifiedLines,
      }),
    [dateIso, dateLabel, truck, driver, slideCount, extraNotes, verifiedLines],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <section
      className={cn(
        "space-y-4 rounded-3xl border border-[#1769AA]/25 bg-gradient-to-br from-[#FFFFFF] via-[#F3F7FB] to-[#DCEAF3]/40 p-5 shadow-sm md:p-6",
        className,
      )}
      aria-label="מצגת יום אספקה"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#DCE6EF] pb-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold text-[#1769AA]">
            <Presentation className="h-4 w-4" />
            אזור מצגת · יום אספקה מהיומן
          </p>
          <h2 className="mt-1 font-display text-xl font-extrabold text-[#102A43] md:text-2xl">
            מצגת ניהולית לפי תאריך
          </h2>
          <p className="mt-1 max-w-2xl text-sm font-medium text-[#5A6A7A]">
            בחר יום מהיומן — המערכת מרכיבה פקודת {slideCount} שקפים מבוססת מקורות הגיליון והסריקות
            בלבד (ללא המצאת נתונים).
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-[#20A4C8]/40 bg-[#20A4C8]/10 px-3 py-2 text-xs font-bold text-[#102A43]">
          <CalendarDays className="h-4 w-4 text-[#1769AA]" />
          {dateLabel}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs font-bold text-[#102A43]">
          תאריך אספקה
          <input
            type="date"
            value={dateIso}
            onChange={(e) => setDateIso(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-[#DCE6EF] bg-white px-3 py-2.5 text-sm font-semibold text-[#102A43] outline-none ring-[#1769AA] focus:ring-2"
          />
        </label>
        <label className="block text-xs font-bold text-[#102A43]">
          משאית (אופציונלי)
          <input
            type="text"
            value={truck}
            onChange={(e) => setTruck(e.target.value)}
            placeholder="לדוגמה 615-41-002"
            className="mt-1.5 w-full rounded-xl border border-[#DCE6EF] bg-white px-3 py-2.5 text-sm text-[#102A43] outline-none ring-[#1769AA] focus:ring-2"
          />
        </label>
        <label className="block text-xs font-bold text-[#102A43]">
          נהג (אופציונלי)
          <input
            type="text"
            value={driver}
            onChange={(e) => setDriver(e.target.value)}
            placeholder="לדוגמה חכמת גאבר"
            className="mt-1.5 w-full rounded-xl border border-[#DCE6EF] bg-white px-3 py-2.5 text-sm text-[#102A43] outline-none ring-[#1769AA] focus:ring-2"
          />
        </label>
        <label className="block text-xs font-bold text-[#102A43]">
          מספר שקפים
          <select
            value={slideCount}
            onChange={(e) => setSlideCount(Number(e.target.value))}
            className="mt-1.5 w-full rounded-xl border border-[#DCE6EF] bg-white px-3 py-2.5 text-sm font-semibold text-[#102A43] outline-none ring-[#1769AA] focus:ring-2"
          >
            {[8, 10, 12].map((n) => (
              <option key={n} value={n}>
                {n} שקפים
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-xs font-bold text-[#102A43]">
        הערות ליום (אופציונלי)
        <textarea
          value={extraNotes}
          onChange={(e) => setExtraNotes(e.target.value)}
          rows={2}
          placeholder="למשל: להתמקד בסטורנו / PTO / תעודה ספציפית…"
          className="mt-1.5 w-full rounded-xl border border-[#DCE6EF] bg-white px-3 py-2.5 text-sm text-[#102A43] outline-none ring-[#1769AA] focus:ring-2"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onApplyPrompt(prompt, { dateIso, dateLabel })}
          className="inline-flex items-center gap-2 rounded-xl bg-[#102A43] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1769AA]"
        >
          <Sparkles className="h-4 w-4" />
          החל על פקודת המצגת
        </button>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-2 rounded-xl border border-[#1769AA]/40 bg-white px-4 py-2.5 text-sm font-bold text-[#1769AA] transition hover:bg-[#DCEAF3]/50"
        >
          {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
          {copied ? "הועתק" : "העתק פקודה"}
        </button>
        <span className="inline-flex items-center gap-1.5 self-center text-xs font-semibold text-[#5A6A7A]">
          <Truck className="h-3.5 w-3.5" />
          כותרת: ניתוח תעודות משלוח — {dateLabel}
        </span>
      </div>

      <details className="rounded-2xl border border-[#DCE6EF] bg-white/80 open:shadow-sm">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold text-[#102A43]">
          תצוגה מקדימה של הפקודה ({prompt.length.toLocaleString("he-IL")} תווים)
        </summary>
        <pre
          dir="rtl"
          className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-[#DCE6EF] px-4 py-3 text-[11px] leading-relaxed text-[#1C2732]"
        >
          {prompt}
        </pre>
      </details>
    </section>
  );
}
