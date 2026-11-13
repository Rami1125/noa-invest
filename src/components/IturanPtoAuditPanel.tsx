/**
 * IturanPtoAuditPanel — כרטיסי PTO + כתב יד + הצלבה + מפה
 * מקורות: איתוראן_PTO · סשנים · ארכיון_תעודות_גליה · אתרי_לקוחות · זמני מנוף בכתב יד
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle, CalendarRange, CheckCircle2, ChevronDown, ChevronUp, Clock,
  FileText, Filter, Gauge, History, Link2, MapPin, PenLine, Search, Timer,
  Truck, User, XCircle,
} from "lucide-react";
import type { DeliveryNote } from "@/lib/data";
import type { AtlasSite } from "@/lib/customer-history.functions";
import { type PtoSession } from "@/lib/smart-dispatch/pto-pairing";
import { summarizeVisitHandwrittenTimes } from "@/lib/smart-dispatch/handwritten-crane";
import { cn } from "@/lib/utils";

export const PTO_ALERT_MIN = 20;
export const HW_GAP_MIN = 10;

export type DatePreset = "today" | "this_week" | "last_week" | "custom" | "all";
export type StatusFilter =
  | "all" | "alert" | "ok" | "orphan" | "matched" | "hw_mismatch" | "hw_only" | "with_hw";

export type HandCompare = {
  raw: string;
  unloadMin: number;
  waitingMin: number;
  flags: string[];
  kind: "aligned" | "mismatch" | "pto_only" | "hand_only" | "none";
  deltaMin: number | null;
  labelHe: string;
};

export type PtoAuditRow = {
  id: string;
  truck: string;
  driver: string;
  address: string;
  openIso: string;
  closeIso?: string;
  durationMin: number | null;
  dateHe: string;
  openTimeHe: string;
  closeTimeHe: string;
  timeRangeHe: string;
  orphan?: "missing_open" | "missing_close";
  pairStatus: "paired" | "orphan_close" | "orphan_open";
  matchedNoteId?: string;
  customerName: string;
  customerNo: string;
  isAlert: boolean;
  addressKey: string;
  hand: HandCompare;
};

type Props = {
  sessions: PtoSession[];
  notes: DeliveryNote[];
  sites?: AtlasSite[];
  className?: string;
};

function normAddr(a: string): string {
  return String(a || "").toLowerCase().replace(/[.,"'׳״]/g, " ").replace(/\s+/g, " ").trim();
}

function startOfDayIL(d: Date): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const probe = new Date(`${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+02:00`);
  return Number.isNaN(probe.getTime()) ? new Date(d.setHours(0, 0, 0, 0)) : probe;
}

function israelWeekBounds(ref: Date, which: "this" | "last"): { from: Date; to: Date } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const wdFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", weekday: "short" });
  const ymd = fmt.format(ref);
  const [ys, ms, ds] = ymd.split("-").map(Number);
  const wd = wdFmt.format(ref);
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayIdx = wdMap[wd] ?? 0;
  const sundayUtc = Date.UTC(ys!, ms! - 1, ds! - dayIdx, 0, 0, 0);
  let fromMs = sundayUtc - 3 * 3600 * 1000;
  if (which === "last") fromMs -= 7 * 24 * 3600 * 1000;
  const toMs = fromMs + 8 * 24 * 3600 * 1000;
  return { from: new Date(fromMs), to: new Date(toMs) };
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

function formatDateHeFull(iso: string): string {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      timeZone: "Asia/Jerusalem",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatTimeHeFull(iso: string): string {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function formatTimeRangeHe(
  openIso: string,
  closeIso?: string,
  orphan?: PtoSession["orphan"],
): { open: string; close: string; range: string } {
  if (orphan === "missing_open") {
    return { open: "—", close: formatTimeHeFull(openIso), range: "סגירה ללא פתיחה מתועדת" };
  }
  const open = formatTimeHeFull(openIso);
  if (orphan === "missing_close" || !closeIso) {
    return { open, close: "פתוח", range: `נפתח ב־${open} · עדיין פתוח` };
  }
  const close = formatTimeHeFull(closeIso);
  return { open, close, range: `מ־${open} עד ${close}` };
}

function findSiteForAddress(sites: AtlasSite[] | undefined, address: string): AtlasSite | undefined {
  if (!sites?.length || !address) return undefined;
  const key = normAddr(address);
  if (!key) return undefined;
  let best: AtlasSite | undefined;
  let bestScore = 0;
  for (const s of sites) {
    const sa = normAddr(s.address || "");
    if (!sa) continue;
    if (sa === key) return s;
    if (key.includes(sa) || sa.includes(key)) {
      const score = Math.min(sa.length, key.length);
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
  }
  return bestScore >= 8 ? best : undefined;
}

function compareHand(
  craneTime: string | undefined,
  ptoMin: number | null,
  orphan?: PtoSession["orphan"],
): HandCompare {
  const raw = String(craneTime || "").trim();
  if (!raw) {
    if (ptoMin != null && !orphan) {
      return {
        raw: "",
        unloadMin: 0,
        waitingMin: 0,
        flags: [],
        kind: "pto_only",
        deltaMin: null,
        labelHe: "איתוראן בלבד — אין כתב יד בתעודה",
      };
    }
    return { raw: "", unloadMin: 0, waitingMin: 0, flags: [], kind: "none", deltaMin: null, labelHe: "אין כתב יד" };
  }
  const sum = summarizeVisitHandwrittenTimes([raw]);
  const unload = sum.unloadingMin;
  if (unload <= 0 && ptoMin == null) {
    return {
      raw,
      unloadMin: 0,
      waitingMin: sum.waitingMin,
      flags: sum.flags,
      kind: "hand_only",
      deltaMin: null,
      labelHe: sum.flags.length ? `כתב יד עם דגלים: ${sum.flags.join(", ")}` : "כתב יד ללא משך פריקה תקף",
    };
  }
  if (unload > 0 && (ptoMin == null || orphan)) {
    return {
      raw,
      unloadMin: unload,
      waitingMin: sum.waitingMin,
      flags: sum.flags,
      kind: "hand_only",
      deltaMin: null,
      labelHe: `כתב יד ${unload} דק׳ — ללא PTO מצומד`,
    };
  }
  if (unload <= 0 && ptoMin != null) {
    return {
      raw,
      unloadMin: 0,
      waitingMin: sum.waitingMin,
      flags: sum.flags,
      kind: "pto_only",
      deltaMin: null,
      labelHe: `יש טקסט כתב יד אך ללא משך פריקה — PTO ${ptoMin} דק׳`,
    };
  }
  const delta = Math.round(Math.abs(unload - (ptoMin as number)) * 10) / 10;
  if (delta > HW_GAP_MIN) {
    return {
      raw,
      unloadMin: unload,
      waitingMin: sum.waitingMin,
      flags: sum.flags,
      kind: "mismatch",
      deltaMin: delta,
      labelHe: `הזרה: כתב יד ${unload} מול PTO ${ptoMin} (פער ${delta} דק׳)`,
    };
  }
  return {
    raw,
    unloadMin: unload,
    waitingMin: sum.waitingMin,
    flags: sum.flags,
    kind: "aligned",
    deltaMin: delta,
    labelHe: `תואם: כתב יד ${unload} ≈ PTO ${ptoMin} דק׳`,
  };
}

export function buildPtoAuditRows(
  sessions: PtoSession[],
  notes: DeliveryNote[],
  sites?: AtlasSite[],
): PtoAuditRow[] {
  const byId = new Map(notes.map((n) => [String(n.id), n]));
  const seen = new Set<string>();
  const out: PtoAuditRow[] = [];
  for (const s of sessions) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const computed = calcDurationMin(s.openIso, s.closeIso);
    let durationMin: number | null = computed;
    if (s.durationMin != null && Number.isFinite(s.durationMin) && computed == null) durationMin = s.durationMin;
    else if (computed != null) durationMin = computed;
    const note = s.matchedNoteId ? byId.get(String(s.matchedNoteId)) : undefined;
    const site = !note ? findSiteForAddress(sites, s.address) : undefined;
    const customerName = note?.customer || site?.customerName || "";
    const customerNo = note?.customerNo || site?.customerNo || "";
    let pairStatus: PtoAuditRow["pairStatus"] = "paired";
    if (s.orphan === "missing_open") pairStatus = "orphan_close";
    else if (s.orphan === "missing_close") pairStatus = "orphan_open";
    const isAlert = (durationMin != null && durationMin > PTO_ALERT_MIN) || s.orphan === "missing_open";
    const address = s.address || note?.siteAddress || site?.address || "";
    const hand = compareHand(note?.craneTime, durationMin, s.orphan);
    const tr = formatTimeRangeHe(s.openIso, s.closeIso, s.orphan);
    out.push({
      id: s.id,
      truck: s.truck || "",
      driver: s.driver || "",
      address,
      openIso: s.openIso,
      closeIso: s.closeIso,
      durationMin,
      dateHe: s.openIso ? formatDateHeFull(s.openIso) : s.date || "",
      openTimeHe: tr.open,
      closeTimeHe: tr.close,
      timeRangeHe: tr.range,
      orphan: s.orphan,
      pairStatus,
      matchedNoteId: s.matchedNoteId,
      customerName,
      customerNo,
      isAlert,
      addressKey: normAddr(address),
      hand,
    });
  }
  return out;
}

function handBadge(kind: HandCompare["kind"]) {
  switch (kind) {
    case "aligned":
      return {
        text: "כתב יד תואם",
        className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/30",
        Icon: CheckCircle2,
      };
    case "mismatch":
      return {
        text: "הזרת כתב יד",
        className: "bg-red-500/15 text-red-800 dark:text-red-200 border-red-500/40",
        Icon: XCircle,
      };
    case "hand_only":
      return {
        text: "כתב יד בלבד",
        className: "bg-amber-500/15 text-amber-900 dark:text-amber-100 border-amber-500/30",
        Icon: PenLine,
      };
    case "pto_only":
      return {
        text: "PTO בלבד",
        className: "bg-sky-500/15 text-sky-900 dark:text-sky-100 border-sky-500/30",
        Icon: Gauge,
      };
    default:
      return {
        text: "אין כתב יד",
        className: "bg-muted text-muted-foreground border-border",
        Icon: PenLine,
      };
  }
}

function Chip({
  active,
  onClick,
  children,
  danger,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-bold transition",
        active
          ? danger
            ? "border-red-500 bg-red-600 text-white"
            : "border-teal-600 bg-teal-600 text-white"
          : "border-border/70 bg-background/80 text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  danger,
}: {
  icon: typeof Timer;
  label: string;
  value: number | string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-card/90 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-bold text-muted-foreground">{label}</span>
        <Icon className={cn("h-3.5 w-3.5", danger ? "text-red-500" : "text-muted-foreground")} />
      </div>
      <div className={cn("mt-1 font-display text-xl font-extrabold tabular-nums", danger && "text-red-700 dark:text-red-300")}>
        {value}
      </div>
    </div>
  );
}

export function IturanPtoAuditPanel({ sessions, notes, sites, className }: Props) {
  const [preset, setPreset] = useState<DatePreset>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [truckFilter, setTruckFilter] = useState("");
  const [search, setSearch] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [historyAddress, setHistoryAddress] = useState("");

  const allRows = useMemo(() => buildPtoAuditRows(sessions, notes, sites), [sessions, notes, sites]);
  const notesWithHw = useMemo(() => notes.filter((n) => String(n.craneTime || "").trim()).length, [notes]);
  const trucks = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) if (r.truck) set.add(r.truck);
    return [...set].sort();
  }, [allRows]);

  const range = useMemo(() => {
    const now = new Date();
    if (preset === "all") return { from: new Date(0), to: new Date(8640000000000000) };
    if (preset === "today") {
      const from = startOfDayIL(now);
      return { from, to: new Date(from.getTime() + 24 * 3600 * 1000 - 1) };
    }
    if (preset === "this_week") return israelWeekBounds(now, "this");
    if (preset === "last_week") return israelWeekBounds(now, "last");
    const from = customFrom ? new Date(customFrom + "T00:00:00+02:00") : new Date(0);
    const to = customTo ? new Date(customTo + "T23:59:59+02:00") : new Date(8640000000000000);
    return { from, to };
  }, [preset, customFrom, customTo]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRows.filter((r) => {
      const t = new Date(r.openIso).getTime();
      if (Number.isFinite(t) && (t < range.from.getTime() || t > range.to.getTime())) return false;
      if (truckFilter && r.truck !== truckFilter) return false;
      if (statusFilter === "alert" && !(r.durationMin != null && r.durationMin > PTO_ALERT_MIN)) return false;
      if (statusFilter === "ok" && (r.orphan || r.durationMin == null || r.durationMin > PTO_ALERT_MIN)) return false;
      if (statusFilter === "orphan" && !r.orphan) return false;
      if (statusFilter === "matched" && !r.matchedNoteId) return false;
      if (statusFilter === "hw_mismatch" && r.hand.kind !== "mismatch") return false;
      if (statusFilter === "hw_only" && r.hand.kind !== "hand_only") return false;
      if (statusFilter === "with_hw" && !r.hand.raw) return false;
      if (historyAddress && r.addressKey !== normAddr(historyAddress)) return false;
      if (term) {
        const hay = [r.address, r.customerName, r.customerNo, r.matchedNoteId, r.truck, r.driver, r.hand.raw]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [allRows, range, statusFilter, search, truckFilter, historyAddress]);

  const kpis = useMemo(() => {
    const alerts = filtered.filter((r) => r.durationMin != null && r.durationMin > PTO_ALERT_MIN);
    const craneMins = filtered.reduce((sum, r) => sum + (r.durationMin ?? 0), 0);
    const maxAlert = alerts.reduce((m, r) => Math.max(m, r.durationMin ?? 0), 0);
    return {
      total: filtered.length,
      alertCount: alerts.length,
      craneMins: Math.round(craneMins * 10) / 10,
      maxAlert: maxAlert > 0 ? Math.round(maxAlert * 10) / 10 : 0,
      matched: filtered.filter((r) => r.matchedNoteId).length,
      orphans: filtered.filter((r) => r.orphan).length,
      withHw: filtered.filter((r) => r.hand.raw).length,
      mismatch: filtered.filter((r) => r.hand.kind === "mismatch").length,
      aligned: filtered.filter((r) => r.hand.kind === "aligned").length,
      notesWithHw,
    };
  }, [filtered, notesWithHw]);

  return (
    <div className={cn("space-y-5", className)} dir="rtl">
      <div className="flex flex-wrap gap-2">
        {[
          { t: "איתוראן_PTO", d: "open/close" },
          { t: "סשנים", d: "צימוד משאית" },
          { t: "ארכיון_תעודות_גליה", d: `${notes.length} תעודות` },
          { t: "אתרי_לקוחות", d: `${sites?.length ?? 0}` },
          { t: "כתב יד מנוף", d: `${notesWithHw} תעודות עם זמן` },
        ].map((s) => (
          <span
            key={s.t}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-gradient-to-l from-slate-900/5 to-teal-500/10 px-3 py-1 text-xs font-semibold shadow-sm dark:from-white/5"
          >
            <Link2 className="h-3.5 w-3.5 text-teal-600" />
            {s.t}
            <span className="font-normal text-muted-foreground">· {s.d}</span>
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        <Kpi icon={Timer} label="סשנים" value={kpis.total} />
        <Kpi icon={AlertTriangle} label={`חריגות >${PTO_ALERT_MIN}`} value={kpis.alertCount} danger={kpis.alertCount > 0} />
        <Kpi icon={Gauge} label="דק׳ מנוף" value={kpis.craneMins} />
        <Kpi icon={Clock} label="מקס׳" value={kpis.maxAlert || "—"} danger={Number(kpis.maxAlert) > PTO_ALERT_MIN} />
        <Kpi icon={FileText} label="עם תעודה" value={kpis.matched} />
        <Kpi icon={PenLine} label="עם כתב יד" value={kpis.withHw} />
        <Kpi icon={CheckCircle2} label="תואם כ״י" value={kpis.aligned} />
        <Kpi icon={XCircle} label="הזרות כ״י" value={kpis.mismatch} danger={kpis.mismatch > 0} />
        <Kpi icon={AlertTriangle} label="יתומים" value={kpis.orphans} danger={kpis.orphans > 0} />
      </div>

      <div className="space-y-3 rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/20 p-4 shadow-lg shadow-black/5">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          {(
            [
              ["all", "הכל"],
              ["today", "היום"],
              ["this_week", "שבוע"],
              ["last_week", "שבוע שעבר"],
              ["custom", "מותאם"],
            ] as const
          ).map(([id, label]) => (
            <Chip key={id} active={preset === id} onClick={() => setPreset(id)}>
              {label}
            </Chip>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex flex-wrap gap-2 text-sm">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="min-h-10 rounded-xl border bg-background px-3 tabular-nums" />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="min-h-10 rounded-xl border bg-background px-3 tabular-nums" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {(
            [
              ["all", "הכל"],
              ["alert", `חריגות >${PTO_ALERT_MIN}`],
              ["ok", "תקין"],
              ["matched", "עם תעודה"],
              ["with_hw", "עם כתב יד"],
              ["hw_mismatch", "הזרות כ״י"],
              ["hw_only", "כתב יד בלבד"],
              ["orphan", "יתומים"],
            ] as const
          ).map(([id, label]) => (
            <Chip key={id} active={statusFilter === id} danger={id === "alert" || id === "hw_mismatch"} onClick={() => setStatusFilter(id)}>
              {label}
            </Chip>
          ))}
        </div>
        {trucks.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <Chip active={!truckFilter} onClick={() => setTruckFilter("")}>כל המשאיות</Chip>
            {trucks.map((tr) => (
              <Chip key={tr} active={truckFilter === tr} onClick={() => setTruckFilter(tr)}>
                {tr}
              </Chip>
            ))}
          </div>
        )}
        <div className="relative max-w-lg">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש כתובת, לקוח, תעודה, כתב יד…"
            className="min-h-12 w-full rounded-2xl border bg-background/80 py-2.5 pe-10 ps-3 text-base shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        {historyAddress && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-violet-400/40 bg-violet-500/10 px-3 py-2.5 text-sm">
            <History className="h-4 w-4 text-violet-700" />
            <span className="font-bold">סינון כתובת:</span>
            <span className="font-semibold">{historyAddress}</span>
            <button type="button" className="ms-auto rounded-xl border px-3 py-1.5 font-bold hover:bg-background" onClick={() => setHistoryAddress("")}>
              נקה
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" dir="rtl">
        {filtered.map((row) => {
          const over = row.durationMin != null && row.durationMin > PTO_ALERT_MIN;
          const open = expandedId === row.id;
          const hb = handBadge(row.hand.kind);
          const HandIcon = hb.Icon;
          return (
            <article
              key={row.id}
              role="button"
              tabIndex={0}
              onClick={() => setExpandedId(open ? "" : row.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpandedId(open ? "" : row.id);
                }
              }}
              className={cn(
                "group relative cursor-pointer overflow-hidden rounded-[1.75rem] border bg-card/95 text-start shadow-md shadow-black/5 outline-none transition-all duration-200",
                "hover:-translate-y-1 hover:shadow-2xl hover:shadow-teal-950/10",
                "focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2",
                "active:scale-[0.99]",
                over && "border-red-400/70 bg-gradient-to-br from-red-500/15 via-card to-card",
                row.hand.kind === "mismatch" && !over && "border-orange-400/50 bg-gradient-to-br from-orange-500/10 via-card to-card",
                row.orphan === "missing_open" && !over && "border-amber-400/50",
                row.orphan === "missing_close" && !over && "border-sky-400/50",
                !over && row.hand.kind !== "mismatch" && !row.orphan && "border-border/60 hover:border-teal-500/35",
              )}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l from-teal-500 via-cyan-400 to-violet-500 opacity-90" />
              <div className="p-5 pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-muted/80 px-2.5 py-1 text-xs font-bold tabular-nums">
                        <Truck className="h-3.5 w-3.5 opacity-80" />
                        {row.truck || "—"}
                      </span>
                      {over && <span className="rounded-lg bg-red-600 px-2 py-1 text-[11px] font-extrabold text-white">חריגת PTO</span>}
                      {row.orphan === "missing_open" && <span className="rounded-lg bg-amber-600 px-2 py-1 text-[11px] font-extrabold text-white">סגירה ללא פתיחה</span>}
                      {row.orphan === "missing_close" && <span className="rounded-lg bg-sky-600 px-2 py-1 text-[11px] font-extrabold text-white">עדיין פתוח</span>}
                    </div>
                    <div className="text-sm font-bold leading-snug text-foreground/90 sm:text-base">{row.dateHe}</div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="font-display text-2xl font-black tabular-nums tracking-tight sm:text-3xl">{row.openTimeHe}</span>
                        <span className="text-lg font-bold text-muted-foreground">עד</span>
                        <span className={cn("font-display text-2xl font-black tabular-nums tracking-tight sm:text-3xl", row.orphan === "missing_close" && "text-sky-600 dark:text-sky-400")}>
                          {row.closeTimeHe}
                        </span>
                      </div>
                      <div className="text-sm font-semibold leading-relaxed text-muted-foreground">{row.timeRangeHe}</div>
                      <div className="text-xs font-medium text-muted-foreground/80">שעון ישראל · פתיחת מנוף וסגירה</div>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "flex h-[4.75rem] min-w-[5rem] flex-col items-center justify-center rounded-2xl px-3 shadow-inner tabular-nums transition group-hover:scale-105",
                      over ? "bg-red-600 text-white" : row.durationMin == null ? "bg-muted text-muted-foreground" : "bg-emerald-500/15 text-emerald-950 dark:text-emerald-50",
                    )}
                  >
                    <span className="text-3xl font-black leading-none">{formatDuration(row.durationMin, row.orphan)}</span>
                    <span className="mt-1 text-[11px] font-extrabold opacity-90">דק׳ מנוף</span>
                  </div>
                </div>

                <div className={cn("mt-4 rounded-2xl border px-3.5 py-3", hb.className)}>
                  <div className="flex items-start gap-2.5">
                    <HandIcon className="mt-0.5 h-5 w-5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-extrabold sm:text-sm">{hb.text}</div>
                      <div className="mt-0.5 text-sm leading-relaxed opacity-90">{row.hand.labelHe}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setHistoryAddress((prev) => (prev && normAddr(prev) === row.addressKey ? "" : row.address))}
                    className="flex min-h-14 min-w-0 flex-1 items-start gap-2.5 rounded-2xl border border-border/50 bg-muted/50 px-3.5 py-3 text-start transition hover:border-primary/40 hover:bg-muted/80"
                  >
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block text-base font-bold leading-snug sm:text-lg">{row.address || "כתובת לא ידועה"}</span>
                      <span className="mt-1 block text-xs font-semibold text-muted-foreground">לחיצה · היסטוריית פתיחות בכתובת</span>
                    </span>
                  </button>
                  {row.address ? (
                    <Link to="/sites" search={{ q: row.address }} className="inline-flex min-h-14 shrink-0 items-center justify-center rounded-2xl border border-teal-500/40 bg-teal-500/15 px-4 text-sm font-bold text-teal-950 hover:bg-teal-500/25 dark:text-teal-50">
                      מפה
                    </Link>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" onClick={(e) => e.stopPropagation()}>
                  {(row.customerName || row.customerNo) && (
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-muted/60 px-2.5 py-1.5 font-semibold">
                      <User className="h-4 w-4" />
                      {row.customerName || "לקוח"}
                      {row.customerNo ? (
                        <Link to="/customers/$id" params={{ id: String(row.customerNo) }} className="font-bold text-sky-700 hover:underline dark:text-sky-300">
                          #{row.customerNo}
                        </Link>
                      ) : null}
                    </span>
                  )}
                  {row.driver && <span className="text-sm font-medium text-muted-foreground">{row.driver}</span>}
                </div>

                <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                  {row.matchedNoteId ? (
                    <Link to="/notes/$id" params={{ id: String(row.matchedNoteId) }} className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 text-sm font-bold text-emerald-950 hover:bg-emerald-500/25 dark:text-emerald-50">
                      <FileText className="h-4 w-4" />ת.מ. {row.matchedNoteId}
                    </Link>
                  ) : (
                    <span className="inline-flex min-h-11 items-center rounded-2xl border border-dashed px-3.5 text-sm text-muted-foreground">ללא תעודה</span>
                  )}
                  <button type="button" onClick={() => setExpandedId(open ? "" : row.id)} className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl border px-3.5 text-sm font-bold hover:bg-muted">
                    {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {open ? "סגור פרטים" : "פרטים נוספים"}
                  </button>
                </div>

                {open && (
                  <div className="mt-4 space-y-2.5 rounded-2xl border bg-muted/30 p-4 text-sm" onClick={(e) => e.stopPropagation()}>
                    <div className="text-sm font-semibold leading-relaxed">{row.timeRangeHe}</div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-semibold text-muted-foreground">פתיחה (ISO)</span>
                      <span className="font-mono text-xs tabular-nums">{row.openIso}</span>
                    </div>
                    {row.closeIso && (
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-semibold text-muted-foreground">סגירה (ISO)</span>
                        <span className="font-mono text-xs tabular-nums">{row.closeIso}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {!filtered.length && (
        <div className="space-y-3 rounded-3xl border border-dashed border-amber-400/40 bg-amber-500/5 p-8 text-center">
          <p className="text-base font-bold">אין סשנים בטווח/סינון — רק נתוני גיליון אמיתיים.</p>
          <p className="text-sm text-muted-foreground">שנו פילטר תאריך או סטטוס, או רעננו את מקור איתוראן_PTO.</p>
        </div>
      )}
    </div>
  );
}

export default IturanPtoAuditPanel;
