/**
 * אזור מצגת יום אספקה — שליחה חיה מ-GAS getDeliveryDay + seed fallback
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ClipboardCopy,
  FileText,
  Loader2,
  Presentation,
  Sparkles,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildDeliveryDayPresentationPrompt,
  formatHeDate,
} from "@/lib/logistics-dict/delivery-day-prompt";
import { getSeedDeliveryDay, type DeliveryDayPayload } from "@/lib/logistics-dict/delivery-day-data";
import { getDeliveryDayFn, getDeliveryDatesFn } from "@/lib/delivery-day.functions";

type Props = {
  verifiedLines?: string[];
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

  const dayQ = useQuery({
    queryKey: ["delivery-day", dateIso],
    queryFn: () => getDeliveryDayFn({ data: { date: dateIso } }),
    enabled: !dayOverride && Boolean(dateIso),
    staleTime: 60_000,
    retry: 1,
  });

  const datesQ = useQuery({
    queryKey: ["delivery-dates"],
    queryFn: () => getDeliveryDatesFn(),
    staleTime: 120_000,
    retry: 1,
  });

  const day: DeliveryDayPayload | null =
    dayOverride ?? dayQ.data?.day ?? getSeedDeliveryDay(dateIso);

  const sourceLabel =
    dayOverride
      ? "override"
      : dayQ.data?.source === "gas"
        ? "GAS חי"
        : dayQ.data?.source === "seed"
          ? "seed (GAS נכשל)"
          : dayQ.isLoading
            ? "טוען…"
            : day
              ? "seed מקומי"
              : "אין נתונים";

  useEffect(() => {
    if (!day) return;
    setTruck((t) => t || day.truck.replace(/\s+משאית.*$/, "").trim() || day.truck);
    setDriver((d) => d || day.driver);
  }, [day?.dateIso, day?.truck, day?.driver]);

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

  const criticalXray = day?.xray?.filter((x) => x.severity === "קריטי") ?? [];
  const craneDisplay = day?.craneMinSumCorrected ?? day?.craneMinSum;
  const dateOptions = Array.isArray(datesQ.data?.dates) ? datesQ.data!.dates : [];

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
            getDeliveryDay · ארכיון_תעודות_גליה
          </p>
          <h2 className="mt-1 font-display text-xl font-extrabold text-[#102A43] md:text-2xl">
            מצגת ניהולית לפי תאריך
          </h2>
          <p className="mt-1 max-w-2xl text-sm font-medium text-[#5A6A7A]">
            שליפה חיה מהגיליון (טוקן שרת) — עם נפילה ל-seed אם GAS לא זמין. הפקודה כוללת
            DATA_FROM_SHEET מלא ל-NotebookLM.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2 rounded-2xl border border-[#20A4C8]/40 bg-[#20A4C8]/10 px-3 py-2 text-xs font-bold text-[#102A43]">
            <CalendarDays className="h-4 w-4 text-[#1769AA]" />
            {dateLabel}
            {dayQ.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          </div>
          <span className="text-[10px] font-bold text-[#5A6A7A]">{sourceLabel}</span>
        </div>
      </div>

      {dayQ.data?.warning ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">
          GAS: {dayQ.data.warning} — מוצג seed אם קיים ליום זה.
        </div>
      ) : null}

      {dayQ.isError && !day ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900">
          {dayQ.error instanceof Error ? dayQ.error.message : "שגיאת שליפה"}
        </div>
      ) : null}

      {day ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "תעודות נטו", value: String(day.netNotes), sub: `${day.stornoNotes} סטורנו` },
            { label: "לקוחות", value: String(day.customers), sub: day.driver || "—" },
            {
              label: "דק׳ מנוף",
              value: String(craneDisplay ?? "—"),
              sub: day.truck?.slice(0, 22) || "",
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
            רינטגן — קריטי פתוח
          </p>
          <ul className="space-y-1.5 text-sm text-red-950">
            {criticalXray.map((x) => (
              <li key={`${x.checkId}-${x.noteId}`}>
                <span className="font-bold">{x.noteId}</span> · {x.finding}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {day && day.notes.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-[#DCE6EF] bg-white">
          <div className="border-b border-[#DCE6EF] px-4 py-2 text-xs font-extrabold text-[#102A43]">
            ציר זמן · {dateLabel} · {day.notes.length} תעודות
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
                      {n.craneMin != null ? `${n.craneMin}׳` : n.craneText?.slice(0, 20) || "—"}
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
          {dateOptions.length > 0 ? (
            <select
              className="mt-1.5 w-full rounded-xl border border-[#DCE6EF] bg-[#F3F7FB] px-2 py-1.5 text-[11px] font-semibold text-[#102A43]"
              value={dateIso}
              onChange={(e) => setDateIso(e.target.value)}
            >
              {dateOptions.map((d: { date: string; rows?: number }) => (
                <option key={d.date} value={d.date}>
                  {d.date}
                  {d.rows != null ? ` (${d.rows} שורות)` : ""}
                </option>
              ))}
            </select>
          ) : null}
        </label>
        <label className="block text-xs font-bold text-[#102A43]">
          משאית
          <input
            type="text"
            value={truck}
            onChange={(e) => setTruck(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-[#DCE6EF] bg-white px-3 py-2.5 text-sm text-[#102A43] outline-none ring-[#1769AA] focus:ring-2"
          />
        </label>
        <label className="block text-xs font-bold text-[#102A43]">
          נהג
          <input
            type="text"
            value={driver}
            onChange={(e) => setDriver(e.target.value)}
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
        הערות ליום
        <textarea
          value={extraNotes}
          onChange={(e) => setExtraNotes(e.target.value)}
          rows={2}
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
          className="inline-flex items-center gap-2 rounded-xl border border-[#1769AA]/40 bg-white px-4 py-2.5 text-sm font-bold text-[#1769AA]"
        >
          {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
          {copied ? "הועתק" : "העתק ל-Notebook"}
        </button>
        <span className="inline-flex items-center gap-1.5 self-center text-xs font-semibold text-[#5A6A7A]">
          <Truck className="h-3.5 w-3.5" />
          {day ? `${day.netNotes} נטו בפקודה` : "—"}
        </span>
        {day?.scanFile ? (
          <span className="inline-flex items-center gap-1 self-center text-xs text-[#5A6A7A]">
            <FileText className="h-3.5 w-3.5" />
            {day.scanFile}
          </span>
        ) : null}
      </div>

      <details className="rounded-2xl border border-[#DCE6EF] bg-white/90">
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[#102A43]">
          תצוגה מקדימה · {prompt.length.toLocaleString("he-IL")} תווים
        </summary>
        <pre
          dir="rtl"
          className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-[#DCE6EF] px-4 py-3 text-[11px] leading-relaxed"
        >
          {prompt}
        </pre>
      </details>
    </section>
  );
}
