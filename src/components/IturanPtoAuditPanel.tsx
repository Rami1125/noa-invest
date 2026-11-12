/**
 * IturanPtoAuditPanel — מדד ובקרת סשני PTO (מנוף)
 * משתלב בטאב «PTO ומנוף» בדף /ituran
 * מקור: אירועי איתוראן_PTO (לאחר pairPtoEvents + analyzePto) + הצלבה לתעודות
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarRange,
  Clock,
  FileText,
  Search,
  Timer,
  Truck,
  User,
  Gauge,
} from "lucide-react";
import type { DeliveryNote } from "@/lib/data";
import {
  israelTime,
  type PtoSession,
} from "@/lib/smart-dispatch/pto-pairing";
import { cn } from "@/lib/utils";

/** סף חריגת משך PTO (דקות) */
export const PTO_ALERT_MIN = 20;

export type DatePreset = "today" | "this_week" | "last_week" | "custom";
export type StatusFilter = "all" | "alert" | "ok";

export type PtoAuditRow = {
  id: string;
  truck: string;
  driver: string;
  address: string;
  openIso: string;
  closeIso?: string;
  /** משך בדקות (עשרוני אחד) — מחושב מ-ISO או null ליתום */
  durationMin: number | null;
  dateHe: string;
  openTimeHe: string;
  closeTimeHe: string;
  orphan?: "missing_open" | "missing_close";
  pairStatus: "paired" | "orphan_close" | "orphan_open";
  matchedNoteId?: string;
  customerName: string;
  customerNo: string;
  isAlert: boolean;
};

type Props = {
  sessions: PtoSession[];
  notes: DeliveryNote[];
  className?: string;
};

function startOfDayIL(d: Date): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const isoGuess = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00`;
  const probe = new Date(isoGuess + "+02:00");
  return Number.isNaN(probe.getTime()) ? new Date(d.setHours(0, 0, 0, 0)) : probe;
}

function israelWeekBounds(ref: Date, which: "this" | "last"): { from: Date; to: Date } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(ref);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const mo = Number(parts.find((p) => p.type === "month")?.value);
  const da = Number(parts.find((p) => p.type === "day")?.value);
  const wd = parts.find((p) => p.type === "weekday")?.value || "Sun";
  const wdMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayIdx = wdMap[wd] ?? 0;
  const base = new Date(Date.UTC(y, mo - 1, da, 0, 0, 0));
  const sunday = new Date(base);
  sunday.setUTCDate(base.getUTCDate() - dayIdx);
  if (which === "last") {
    sunday.setUTCDate(sunday.getUTCDate() - 7);
  }
  const saturday = new Date(sunday);
  saturday.setUTCDate(sunday.getUTCDate() + 6);
  saturday.setUTCHours(23, 59, 59, 999);
  return { from: sunday, to: saturday };
}

function calcDurationMin(openIso: string, closeIso?: string): number | null {
  if (!closeIso) return null;
  const openMs = new Date(openIso).getTime();
  const closeMs = new Date(closeIso).getTime();
  if (!Number.isFinite(openMs) || !Number.isFinite(closeMs) || closeMs < openMs) return null;
  return Math.round(((closeMs - openMs) / 60000) * 10) / 10;
}

function formatDuration(d: number | null, orphan?: PtoSession["orphan"]): string {
  if (orphan === "missing_open") return "לא זמין";
  if (d == null) return orphan === "missing_close" ? "פתוח" : "—";
  return Number.isInteger(d) ? String(d) : d.toFixed(1);
}

/**
 * בניית שורות ביקורת: משך מדויק + הצלבת לקוח/תעודה מהערות
 */
export function buildPtoAuditRows(
  sessions: PtoSession[],
  notes: DeliveryNote[],
): PtoAuditRow[] {
  const byId = new Map(notes.map((n) => [String(n.id), n]));

  return sessions.map((s) => {
    const computed = calcDurationMin(s.openIso, s.closeIso);
    let durationMin: number | null = computed;
    if (s.durationMin != null && Number.isFinite(s.durationMin)) {
      durationMin = computed != null ? computed : s.durationMin;
    }

    const note = s.matchedNoteId ? byId.get(String(s.matchedNoteId)) : undefined;
    const customerName = note?.customer || "";
    const customerNo = note?.customerNo || "";

    let pairStatus: PtoAuditRow["pairStatus"] = "paired";
    if (s.orphan === "missing_open") pairStatus = "orphan_close";
    else if (s.orphan === "missing_close") pairStatus = "orphan_open";

    const isAlert =
      (durationMin != null && durationMin > PTO_ALERT_MIN) ||
      s.orphan === "missing_open";

    return {
      id: s.id,
      truck: s.truck || "",
      driver: s.driver || "",
      address: s.address || note?.siteAddress || "",
      openIso: s.openIso,
      closeIso: s.closeIso,
      durationMin,
      dateHe: s.date || "",
      openTimeHe: s.orphan === "missing_open" ? "—" : israelTime(s.openIso),
      closeTimeHe: s.closeIso
        ? israelTime(s.closeIso)
        : s.orphan === "missing_close"
          ? "פתוח"
          : "—",
      orphan: s.orphan,
      pairStatus,
      matchedNoteId: s.matchedNoteId,
      customerName,
      customerNo,
      isAlert,
    };
  });
}

function pairStatusLabel(row: PtoAuditRow): { text: string; className: string } {
  if (row.pairStatus === "orphan_close") {
    return {
      text: "סגירה ללא פתיחה — להשלמה ידנית",
      className: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
    };
  }
  if (row.pairStatus === "orphan_open") {
    return {
      text: "פתוח (חסרה סגירה)",
      className: "bg-sky-500/15 text-sky-800 dark:text-sky-200",
    };
  }
  if (row.matchedNoteId) {
    return {
      text: `משויך לת.מ. ${row.matchedNoteId}`,
      className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
    };
  }
  return {
    text: "מצומד · ללא תעודה",
    className: "bg-muted text-muted-foreground",
  };
}

export function IturanPtoAuditPanel({ sessions, notes, className }: Props) {
  const [preset, setPreset] = useState<DatePreset>("this_week");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const allRows = useMemo(() => buildPtoAuditRows(sessions, notes), [sessions, notes]);

  const range = useMemo(() => {
    const now = new Date();
    if (preset === "today") {
      const from = startOfDayIL(now);
      const to = new Date(from.getTime() + 24 * 3600 * 1000 - 1);
      return { from, to };
    }
    if (preset === "this_week") return israelWeekBounds(now, "this");
    if (preset === "last_week") return israelWeekBounds(now, "last");
    const from = customFrom ? new Date(customFrom + "T00:00:00+02:00") : new Date(0);
    const to = customTo
      ? new Date(customTo + "T23:59:59+02:00")
      : new Date(8640000000000000);
    return { from, to };
  }, [preset, customFrom, customTo]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRows.filter((r) => {
      const t = new Date(r.openIso).getTime();
      if (Number.isFinite(t) && (t < range.from.getTime() || t > range.to.getTime())) {
        return false;
      }
      if (statusFilter === "alert" && !r.isAlert) return false;
      if (statusFilter === "ok" && (r.isAlert || r.durationMin == null)) return false;
      if (statusFilter === "ok" && r.durationMin != null && r.durationMin > PTO_ALERT_MIN) {
        return false;
      }
      if (term) {
        const hay = [
          r.address,
          r.customerName,
          r.customerNo,
          r.matchedNoteId,
          r.truck,
          r.driver,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [allRows, range, statusFilter, search]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const alerts = filtered.filter(
      (r) => r.durationMin != null && r.durationMin > PTO_ALERT_MIN,
    );
    const craneMins = filtered.reduce((sum, r) => sum + (r.durationMin ?? 0), 0);
    const maxAlert = alerts.reduce((m, r) => Math.max(m, r.durationMin ?? 0), 0);
    return {
      total,
      alertCount: alerts.length,
      craneMins: Math.round(craneMins * 10) / 10,
      maxAlert: maxAlert > 0 ? Math.round(maxAlert * 10) / 10 : 0,
    };
  }, [filtered]);

  return (
    <div className={cn("space-y-4", className)} dir="rtl">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={Timer} label='סה״כ סשנים בטווח' value={kpis.total} tone="neutral" />
        <KpiCard
          icon={AlertTriangle}
          label={`חריגות מעל ${PTO_ALERT_MIN} דק׳`}
          value={kpis.alertCount}
          tone="danger"
        />
        <KpiCard icon={Gauge} label='סה״כ דקות עבודת מנוף' value={kpis.craneMins} tone="neutral" />
        <KpiCard
          icon={Clock}
          label="חריגה מקסימלית (דק׳)"
          value={kpis.maxAlert || "—"}
          tone={kpis.maxAlert > PTO_ALERT_MIN ? "danger" : "neutral"}
        />
      </div>

      <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          {(
            [
              ["today", "היום"],
              ["this_week", "שבוע נוכחי"],
              ["last_week", "שבוע שעבר (א׳–ש׳)"],
              ["custom", "טווח מותאם"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPreset(id)}
              className={cn(
                "rounded-xl px-3 py-1.5 text-xs font-bold transition",
                preset === id ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5 font-semibold">
              מ־
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="min-h-9 rounded-lg border bg-background px-2 tabular-nums"
              />
            </label>
            <label className="flex items-center gap-1.5 font-semibold">
              עד
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="min-h-9 rounded-lg border bg-background px-2 tabular-nums"
              />
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold text-muted-foreground">סטטוס:</span>
          {(
            [
              ["all", "הכל"],
              ["alert", `חריגות > ${PTO_ALERT_MIN} דק׳`],
              ["ok", `תקין ≤ ${PTO_ALERT_MIN} דק׳`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatusFilter(id)}
              className={cn(
                "rounded-xl px-3 py-1.5 text-xs font-bold transition",
                statusFilter === id
                  ? id === "alert"
                    ? "bg-red-600 text-white"
                    : "bg-teal-700 text-white"
                  : "bg-muted/50 hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש כתובת, לקוח או מספר תעודה…"
            className="min-h-10 w-full rounded-xl border bg-background py-2 pe-10 ps-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs font-bold text-muted-foreground">
                <th className="px-3 py-2.5 text-start">תאריך</th>
                <th className="px-3 py-2.5 text-start">פתיחה – סגירה (ישראל)</th>
                <th className="px-3 py-2.5 text-start">משך (דק׳)</th>
                <th className="px-3 py-2.5 text-start">כתובת (איתוראן)</th>
                <th className="px-3 py-2.5 text-start">לקוח</th>
                <th className="px-3 py-2.5 text-start">מס׳ תעודה</th>
                <th className="px-3 py-2.5 text-start">סטטוס הצלבה</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const status = pairStatusLabel(row);
                const over = row.durationMin != null && row.durationMin > PTO_ALERT_MIN;
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-border/50 transition-colors",
                      over && "bg-red-500/18 hover:bg-red-500/25",
                      !over && row.orphan === "missing_open" && "bg-amber-500/10",
                      !over && !row.orphan && "hover:bg-muted/30",
                    )}
                  >
                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                      <div className="font-semibold">{row.dateHe || "—"}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Truck className="h-3 w-3" />
                        {row.truck || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                      <span className="font-semibold">
                        {row.openTimeHe} – {row.closeTimeHe}
                      </span>
                      {row.driver ? (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{row.driver}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex min-w-[3rem] items-center justify-center rounded-lg px-2 py-0.5 text-xs font-extrabold tabular-nums",
                          over
                            ? "bg-red-600 text-white"
                            : row.durationMin == null
                              ? "bg-muted text-muted-foreground"
                              : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
                        )}
                      >
                        {formatDuration(row.durationMin, row.orphan)}
                      </span>
                    </td>
                    <td className="max-w-[220px] px-3 py-2.5">
                      <span className="line-clamp-2 text-xs font-medium">{row.address || "—"}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {row.customerName || row.customerNo ? (
                        <div className="text-xs">
                          <div className="flex items-center gap-1 font-bold">
                            <User className="h-3 w-3 shrink-0" />
                            {row.customerName || "—"}
                          </div>
                          {row.customerNo ? (
                            <Link
                              to="/customers/$id"
                              params={{ id: String(row.customerNo) }}
                              className="mt-0.5 inline-block text-[11px] font-semibold text-sky-700 hover:underline dark:text-sky-300"
                            >
                              לקוח #{row.customerNo}
                            </Link>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {row.matchedNoteId ? (
                        <Link
                          to="/notes/$id"
                          params={{ id: String(row.matchedNoteId) }}
                          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline dark:text-emerald-300"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          {row.matchedNoteId}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex max-w-[12rem] rounded-lg px-2 py-1 text-[11px] font-bold leading-snug",
                          status.className,
                        )}
                      >
                        {status.text}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    אין סשני PTO בטווח/סינון שנבחר.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t px-4 py-2 text-[11px] text-muted-foreground">
          מוצגים {filtered.length} מתוך {allRows.length} סשנים · זמנים ב־Asia/Jerusalem · חריגה = משך{" "}
          {">"} {PTO_ALERT_MIN} דק׳
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Timer;
  label: string;
  value: string | number;
  tone: "neutral" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 shadow-sm",
        tone === "danger" ? "border-red-500/30 bg-red-500/10" : "border-border/70 bg-card",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 text-[11px] font-semibold",
          tone === "danger" ? "text-red-800 dark:text-red-200" : "text-muted-foreground",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-display text-2xl font-extrabold tabular-nums",
          tone === "danger" && "text-red-700 dark:text-red-300",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export default IturanPtoAuditPanel;
