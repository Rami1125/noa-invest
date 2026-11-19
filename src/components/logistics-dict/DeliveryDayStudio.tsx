/**
 * אזור מצגת יום אספקה — בורר תאריך + KPI + ציר זמן + רינטגן + פקודת Notebook
 */
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ClipboardCopy,
  FileText,
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
import { getSeedDeliveryDay, type DeliveryDayPayload } from "@/lib/logistics-dict/delivery-day-data";

type Props = {
  verifiedLines?: string[];
  /** payload חי מ-API בעתיד */
  dayOverride?: DeliveryDayPayload | null;
  onApplyPrompt: (prompt: string, meta: { dateIso: string; dateLabel: string }) => void;
  className?: string;
};

export function DeliveryDayStudio({
  verifiedLines,
  dayOverride,
  onApplyPrompt,
  className,
}: Props) {
  const [dateIso, setDateIso] = useState("2026-11-17");
  const [truck, setTruck] = useState("");
  const [driver, setDriver] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [slideCount, setSlideCount] = useState(8);
  const [copied, setCopied] = useState(false);

  const dateLabel = useMemo(() => formatHeDate(dateIso), [dateIso]);
  const day = dayOverride ?? getSeedDeliveryDay(dateIso);

  useEffect(() => {
    if (!day) return;
    if (!truck) setTruck(day.truck.replace(/\s+משאית.*$/, "").trim() || day.truck);
    if (!driver) setDriver(day.driver);
  }, [day?.dateIso]); // eslint-disable-line react-hooks/exhaustive-deps

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
        day,
      }),
    [dateIso, dateLabel, truck, driver, slideCount, extraNotes, verifiedLines, day],
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

  const criticalXray = day?.xray.filter((x) => x.severity === "קריטי") ?? [];
  const craneDisplay = day?.craneMinSumCorrected ?? day?.craneMinSum;

  return (
    <section
      className={cn(
        "space-y-5 rounded-3xl border border-[#1769AA]/25 bg-gradient-to-br from-[#FFFFFF] via-[#F3F7FB] to-[#DCEAF3]/50 p-5 shadow-sm md:p-6",
        className,
      )}
      aria-label="מצגת יום אספקה"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#DCE6EF] pb-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold text-[#1769AA]">
            <Presentation className="h-4 w-4" />
            SABAN DELIVERY INTELLIGENCE · מצגת מארכיון + רינטגן
          </p>
          <h2 className="mt-1 font-display text-xl font-extrabold text-[#102A43] md:text-2xl">
            מצגת ניהולית לפי תאריך
          </h2>
          <p className="mt-1 max-w-2xl text-sm font-medium text-[#5A6A7A]">
            בחר יום — הפקודה מזריקה DATA_FROM_SHEET מלא (תעודות, ציר זמן, PTO/איתוראן, ממצאי
            רינטגן) להדבקה ב-NotebookLM.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-[#20A4C8]/40 bg-[#20A4C8]/10 px-3 py-2 text-xs font-bold text-[#102A43]">
          <CalendarDays className="h-4 w-4 text-[#1769AA]" />
          {dateLabel}
          {day ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-800">נתונים טעונים</span>
          ) : (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-900">ללא seed</span>
          )}
        </div>
      </div>

      {day ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "תעודות נטו", value: String(day.netNotes), sub: `${day.stornoNotes} סטורנו` },
            { label: "לקוחות", value: String(day.customers), sub: day.driver },
            {
              label: "דק׳ מנוף",
              value: String(craneDisplay ?? "—"),
              sub:
                day.craneMinSumCorrected != null && day.craneMinSumCorrected !== day.craneMinSum
                  ? `גיליון ${day.craneMinSum} → מתוקן`
                  : day.truck.slice(0, 18),
            },
            {
              label: "פקדון 60002",
              value: String(day.dep60002),
              sub: `60060×${day.dep60060} · 60006×${day.dep60006}`,
            },
          ].map((k) => (
            <div
              key={k.label}
              className="rounded-2xl border border-[#DCE6EF] bg-white px-4 py-3 shadow-sm"
            >
              <p className="text-[11px] font-bold text-[#5A6A7A]">{k.label}</p>
              <p className="mt-1 font-display text-3xl font-extrabold text-[#102A43]">{k.value}</p>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-[#1769AA]">{k.sub}</p>
            </div>
          ))}
        </div>
      ) : null}

      {criticalXray.length > 0 ? (
        <div className="space-y-2 rounded-2xl border border-red-200 bg-red-50/80 p-4">
          <p className="flex items-center gap-2 text-xs font-extrabold text-red-800">
            <AlertTriangle className="h-4 w-4" />
            רינטגן — ממצאים קריטיים פתוחים
          </p>
          <ul className="space-y-1.5 text-sm text-red-950">
            {criticalXray.map((x) => (
              <li key={`${x.checkId}-${x.noteId}`} className="leading-snug">
                <span className="font-bold">{x.noteId}</span> · {x.finding}
                {x.suggestedFix ? (
                  <span className="block text-xs font-medium text-red-700/90">תיקון: {x.suggestedFix}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {day && day.notes.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-[#DCE6EF] bg-white">
          <div className="border-b border-[#DCE6EF] px-4 py-2 text-xs font-extrabold text-[#102A43]">
            ציר זמן תעודות · {dateLabel}
          </div>
          <table className="w-full min-w-[640px] text-right text-xs">
            <thead className="bg-[#F3F7FB] text-[#5A6A7A]">
              <tr>
                <th className="px-3 py-2 font-bold">שעה</th>
                <th className="px-3 py-2 font-bold">תעודה</th>
                <th className="px-3 py-2 font-bold">לקוח</th>
                <th className="px-3 py-2 font-bold">כתובת</th>
                <th className="px-3 py-2 font-bold">מנוף</th>
                <th className="px-3 py-2 font-bold">איתוראן</th>
              </tr>
            </thead>
            <tbody>
              {[...day.notes]
                .sort((a, b) => (a.noteTime || "").localeCompare(b.noteTime || ""))
                .map((n) => (
                  <tr key={n.noteId} className="border-t border-[#E8EEF4]">
                    <td className="px-3 py-2 font-bold text-[#102A43]">{n.noteTime || "—"}</td>
                    <td className="px-3 py-2 font-mono font-bold text-[#1769AA]">{n.noteId}</td>
                    <td className="max-w-[140px] truncate px-3 py-2 font-semibold">{n.customerName}</td>
                    <td className="max-w-[160px] truncate px-3 py-2 text-[#5A6A7A]">{n.address}</td>
                    <td className="px-3 py-2">
                      {n.craneMin != null ? `${n.craneMin}׳` : n.craneText?.slice(0, 24) || "—"}
                    </td>
                    <td className="px-3 py-2 text-[#5A6A7A]">
                      {n.ituranStopMin != null ? `${n.ituranStopMin}׳` : "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}

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
          משאית
          <input
            type="text"
            value={truck}
            onChange={(e) => setTruck(e.target.value)}
            placeholder="615-41-002"
            className="mt-1.5 w-full rounded-xl border border-[#DCE6EF] bg-white px-3 py-2.5 text-sm text-[#102A43] outline-none ring-[#1769AA] focus:ring-2"
          />
        </label>
        <label className="block text-xs font-bold text-[#102A43]">
          נהג
          <input
            type="text"
            value={driver}
            onChange={(e) => setDriver(e.target.value)}
            placeholder="חכמת"
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
          placeholder="למשל: להדגיש תיקון מנוף 6716506 / זיכוי בלות…"
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
          {copied ? "הועתק" : "העתק פקודה ל-Notebook"}
        </button>
        <span className="inline-flex items-center gap-1.5 self-center text-xs font-semibold text-[#5A6A7A]">
          <Truck className="h-3.5 w-3.5" />
          {day ? `${day.netNotes} תעודות בפקודה` : "ללא נתוני יום"}
        </span>
        {day?.scanFile ? (
          <span className="inline-flex items-center gap-1.5 self-center text-xs font-semibold text-[#5A6A7A]">
            <FileText className="h-3.5 w-3.5" />
            {day.scanFile}
          </span>
        ) : null}
      </div>

      <details className="rounded-2xl border border-[#DCE6EF] bg-white/90 open:shadow-sm">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold text-[#102A43]">
          תצוגה מקדימה · {prompt.length.toLocaleString("he-IL")} תווים
          {day ? " · כולל DATA_FROM_SHEET" : ""}
        </summary>
        <pre
          dir="rtl"
          className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-[#DCE6EF] px-4 py-3 text-[11px] leading-relaxed text-[#1C2732]"
        >
          {prompt}
        </pre>
      </details>
    </section>
  );
}
