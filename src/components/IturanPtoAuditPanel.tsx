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
import { israelTime, type PtoSession } from "@/lib/smart-dispatch/pto-pairing";
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
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = fmt.formatToParts(ref);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const mo = Number(parts.find((p) => p.type === "month")?.value);
  const da = Number(parts.find((p) => p.type === "day")?.value);
  const wd = parts.find((p) => p.type === "weekday")?.value || "Sun";
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayIdx = wdMap[wd] ?? 0;
  const base = new Date(Date.UTC(y, mo - 1, da, 0, 0, 0));
  const sunday = new Date(base);
  sunday.setUTCDate(base.getUTCDate() - dayIdx);
  if (which === "last") sunday.setUTCDate(sunday.getUTCDate() - 7);
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
      if (score > bestScore) { bestScore = score; best = s; }
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
      return { raw: "", unloadMin: 0, waitingMin: 0, flags: [], kind: "pto_only", deltaMin: null, labelHe: "איתוראן בלבד — אין כתב יד בתעודה" };
    }
    return { raw: "", unloadMin: 0, waitingMin: 0, flags: [], kind: "none", deltaMin: null, labelHe: "אין כתב יד" };
  }
  const sum = summarizeVisitHandwrittenTimes([raw]);
  const unload = sum.unloadingMin;
  if (unload <= 0 && ptoMin == null) {
    return { raw, unloadMin: 0, waitingMin: sum.waitingMin, flags: sum.flags, kind: "hand_only", deltaMin: null,
      labelHe: sum.flags.length ? `כתב יד עם דגלים: ${sum.flags.join(", ")}` : "כתב יד ללא משך פריקה תקף" };
  }
  if (unload > 0 && (ptoMin == null || orphan)) {
    return { raw, unloadMin: unload, waitingMin: sum.waitingMin, flags: sum.flags, kind: "hand_only", deltaMin: null,
      labelHe: `כתב יד ${unload} דק׳ — ללא PTO מצומד` };
  }
  if (unload <= 0 && ptoMin != null) {
    return { raw, unloadMin: 0, waitingMin: sum.waitingMin, flags: sum.flags, kind: "pto_only", deltaMin: null,
      labelHe: `יש טקסט כתב יד אך ללא משך פריקה — PTO ${ptoMin} דק׳` };
  }
  const delta = Math.round(Math.abs(unload - (ptoMin as number)) * 10) / 10;
  if (delta > HW_GAP_MIN) {
    return { raw, unloadMin: unload, waitingMin: sum.waitingMin, flags: sum.flags, kind: "mismatch", deltaMin: delta,
      labelHe: `הזרה: כתב יד ${unload} מול PTO ${ptoMin} (פער ${delta} דק׳)` };
  }
  return { raw, unloadMin: unload, waitingMin: sum.waitingMin, flags: sum.flags, kind: "aligned", deltaMin: delta,
    labelHe: `תואם: כתב יד ${unload} ≈ PTO ${ptoMin} דק׳` };
}

export function buildPtoAuditRows(sessions: PtoSession[], notes: DeliveryNote[], sites?: AtlasSite[]): PtoAuditRow[] {
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
    out.push({
      id: s.id, truck: s.truck || "", driver: s.driver || "", address,
      openIso: s.openIso, closeIso: s.closeIso, durationMin, dateHe: s.date || "",
      openTimeHe: s.orphan === "missing_open" ? "—" : israelTime(s.openIso),
      closeTimeHe: s.closeIso ? israelTime(s.closeIso) : s.orphan === "missing_close" ? "פתוח" : "—",
      orphan: s.orphan, pairStatus, matchedNoteId: s.matchedNoteId,
      customerName, customerNo, isAlert, addressKey: normAddr(address), hand,
    });
  }
  return out;
}

function handBadge(kind: HandCompare["kind"]) {
  switch (kind) {
    case "aligned":
      return { text: "כתב יד תואם", className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/30", Icon: CheckCircle2 };
    case "mismatch":
      return { text: "הזרת כתב יד", className: "bg-red-500/15 text-red-800 dark:text-red-200 border-red-500/40", Icon: XCircle };
    case "hand_only":
      return { text: "כתב יד בלבד", className: "bg-amber-500/15 text-amber-900 dark:text-amber-100 border-amber-500/30", Icon: PenLine };
    case "pto_only":
      return { text: "PTO בלבד", className: "bg-sky-500/15 text-sky-900 dark:text-sky-100 border-sky-500/30", Icon: Gauge };
    default:
      return { text: "אין כתב יד", className: "bg-muted text-muted-foreground border-border", Icon: PenLine };
  }
}

export function IturanPtoAuditPanel({ sessions, notes, sites, className }: Props) {
  const [preset, setPreset] = useState<DatePreset>("this_week");
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
          .filter(Boolean).join(" ").toLowerCase();
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

  const addressHistory = useMemo(() => {
    if (!historyAddress) return [] as PtoAuditRow[];
    const key = normAddr(historyAddress);
    return allRows.filter((r) => r.addressKey === key)
      .sort((a, b) => new Date(b.openIso).getTime() - new Date(a.openIso).getTime());
  }, [allRows, historyAddress]);

  const notesAtAddress = useMemo(() => {
    if (!historyAddress) return [] as DeliveryNote[];
    const key = normAddr(historyAddress);
    const seen = new Set<string>();
    const list: DeliveryNote[] = [];
    for (const n of notes) {
      if (seen.has(n.id)) continue;
      const a = normAddr(n.siteAddress || "");
      if (a && (a.includes(key) || key.includes(a))) { seen.add(n.id); list.push(n); }
    }
    return list;
  }, [notes, historyAddress]);

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
          <span key={s.t} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-gradient-to-l from-slate-900/5 to-teal-500/10 px-3 py-1 text-[11px] font-semibold shadow-sm dark:from-white/5">
            <Link2 className="h-3 w-3 text-teal-600" />{s.t}
            <span className="font-normal text-muted-foreground">· {s.d}</span>
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        <Kpi icon={Timer} label="סשנים" value={kpis.total} />
        <Kpi icon={AlertTriangle} label={`חריגות >${PTO_ALERT_MIN}`} value={kpis.alertCount} danger={kpis.alertCount > 0} />
        <Kpi icon={Gauge} label="דק׳ מנוף" value={kpis.craneMins} />
        <Kpi icon={Clock} label="מקס׳" value={kpis.maxAlert || "—"} danger={kpis.maxAlert > PTO_ALERT_MIN} />
        <Kpi icon={FileText} label="עם תעודה" value={kpis.matched} />
        <Kpi icon={PenLine} label="עם כתב יד" value={kpis.withHw} />
        <Kpi icon={CheckCircle2} label="תואם כ״י" value={kpis.aligned} />
        <Kpi icon={XCircle} label="הזרות כ״י" value={kpis.mismatch} danger={kpis.mismatch > 0} />
        <Kpi icon={AlertTriangle} label="יתומים" value={kpis.orphans} danger={kpis.orphans > 0} />
      </div>

      <div className="space-y-3 rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/20 p-4 shadow-lg shadow-black/5">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          {([["all", "הכל"], ["today", "היום"], ["this_week", "שבוע"], ["last_week", "שבוע שעבר"], ["custom", "מותאם"]] as const).map(([id, label]) => (
            <Chip key={id} active={preset === id} onClick={() => setPreset(id)}>{label}</Chip>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex flex-wrap gap-2 text-xs">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="min-h-9 rounded-xl border bg-background px-2 tabular-nums" />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="min-h-9 rounded-xl border bg-background px-2 tabular-nums" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {([["all", "הכל"], ["alert", `חריגות >${PTO_ALERT_MIN}`], ["ok", "תקין"], ["matched", "עם תעודה"],
            ["with_hw", "עם כתב יד"], ["hw_mismatch", "הזרות כ״י"], ["hw_only", "כתב יד בלבד"], ["orphan", "יתומים"]] as const).map(([id, label]) => (
            <Chip key={id} active={statusFilter === id} danger={id === "alert" || id === "hw_mismatch"} onClick={() => setStatusFilter(id)}>{label}</Chip>
          ))}
        </div>
        {trucks.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <Chip active={!truckFilter} onClick={() => setTruckFilter("")}>כל המשאיות</Chip>
            {trucks.map((tr) => (
              <Chip key={tr} active={truckFilter === tr} onClick={() => setTruckFilter(tr)}>{tr}</Chip>
            ))}
          </div>
        )}
        <div className="relative max-w-lg">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש כתובת, לקוח, תעודה, כתב יד…"
            className="min-h-11 w-full rounded-2xl border bg-background/80 py-2 pe-10 ps-3 text-sm shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
        {historyAddress && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-violet-400/40 bg-violet-500/10 px-3 py-2 text-xs">
            <History className="h-3.5 w-3.5 text-violet-700" />
            <span className="font-bold">סינון כתובת:</span>
            <span className="font-semibold">{historyAddress}</span>
            <button type="button" className="ms-auto rounded-xl border px-2.5 py-1 font-bold hover:bg-background" onClick={() => setHistoryAddress("")}>נקה</button>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((row) => {
          const over = row.durationMin != null && row.durationMin > PTO_ALERT_MIN;
          const open = expandedId === row.id;
          const hb = handBadge(row.hand.kind);
          const HandIcon = hb.Icon;
          return (
            <article key={row.id} className={cn(
              "relative overflow-hidden rounded-3xl border bg-card/95 shadow-md shadow-black/5 transition hover:-translate-y-0.5 hover:shadow-xl",
              over && "border-red-400/70 bg-gradient-to-br from-red-500/15 to-card",
              row.hand.kind === "mismatch" && !over && "border-orange-400/50 bg-gradient-to-br from-orange-500/10 to-card",
              row.orphan === "missing_open" && !over && "border-amber-400/50",
              row.orphan === "missing_close" && !over && "border-sky-400/40",
              !over && row.hand.kind !== "mismatch" && !row.orphan && "border-border/60",
            )}>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-teal-500 via-violet-500 to-transparent opacity-80" />
              <div className="p-4 pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-muted/70 px-2 py-0.5 text-[11px] font-bold tabular-nums">
                        <Truck className="h-3 w-3" />{row.truck || "—"}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">{row.dateHe}</span>
                      {over && <span className="rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">חריגת PTO</span>}
                      {row.orphan === "missing_open" && <span className="rounded-md bg-amber-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">סגירה ללא פתיחה</span>}
                      {row.orphan === "missing_close" && <span className="rounded-md bg-sky-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">פתוח</span>}
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-xl font-black tabular-nums tracking-tight">{row.openTimeHe}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-display text-xl font-black tabular-nums tracking-tight">{row.closeTimeHe}</span>
                    </div>
                    <div className="text-[11px] font-medium text-muted-foreground">פתיחת מנוף · סגירת מנוף (ישראל)</div>
                  </div>
                  <div className={cn("flex h-16 min-w-[4rem] flex-col items-center justify-center rounded-2xl px-2 shadow-inner tabular-nums",
                    over ? "bg-red-600 text-white" : row.durationMin == null ? "bg-muted text-muted-foreground" : "bg-emerald-500/15 text-emerald-900 dark:text-emerald-100")}>
                    <span className="text-2xl font-black leading-none">{formatDuration(row.durationMin, row.orphan)}</span>
                    <span className="text-[10px] font-bold opacity-80">דק׳ PTO</span>
                  </div>
                </div>

                <div className={cn("mt-3 rounded-2xl border px-3 py-2.5", hb.className)}>
                  <div className="flex items-start gap-2">
                    <HandIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-extrabold">{hb.text}</div>
                      <div className="mt-0.5 text-xs leading-snug opacity-90">{row.hand.labelHe}</div>
                      {row.hand.raw ? <div className="mt-1 line-clamp-2 font-mono text-[10px] opacity-75" title={row.hand.raw}>{row.hand.raw}</div> : null}
                      {(row.hand.unloadMin > 0 || row.hand.waitingMin > 0) && (
                        <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-bold tabular-nums">
                          {row.hand.unloadMin > 0 && <span>פריקה כ״י: {row.hand.unloadMin} דק׳</span>}
                          {row.hand.waitingMin > 0 && <span>המתנה: {row.hand.waitingMin} דק׳</span>}
                          {row.hand.deltaMin != null && <span>פער: {row.hand.deltaMin} דק׳</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button type="button"
                    onClick={() => setHistoryAddress((prev) => prev && normAddr(prev) === row.addressKey ? "" : row.address)}
                    className="flex min-w-0 flex-1 items-start gap-2 rounded-2xl border border-transparent bg-muted/40 px-3 py-2.5 text-start transition hover:border-primary/30 hover:bg-muted/70">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold leading-snug">{row.address || "כתובת לא ידועה"}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">היסטוריית פתיחות בכתובת</span>
                    </span>
                  </button>
                  {row.address ? (
                    <Link to="/sites" search={{ q: row.address }}
                      className="inline-flex min-h-[3.25rem] shrink-0 items-center justify-center rounded-2xl border border-teal-500/30 bg-teal-500/10 px-3 text-xs font-bold text-teal-900 hover:bg-teal-500/20 dark:text-teal-100"
                      title="מפת אתרי אספקה">מפה</Link>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {(row.customerName || row.customerNo) && (
                    <span className="inline-flex items-center gap-1 rounded-xl bg-muted/50 px-2 py-1 font-semibold">
                      <User className="h-3 w-3" />{row.customerName || "לקוח"}
                      {row.customerNo ? (
                        <Link to="/customers/$id" params={{ id: String(row.customerNo) }} className="text-sky-700 hover:underline dark:text-sky-300">#{row.customerNo}</Link>
                      ) : null}
                    </span>
                  )}
                  {row.driver && <span className="text-muted-foreground">{row.driver}</span>}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {row.matchedNoteId ? (
                    <Link to="/notes/$id" params={{ id: String(row.matchedNoteId) }}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-900 hover:bg-emerald-500/20 dark:text-emerald-100">
                      <FileText className="h-3.5 w-3.5" />ת.מ. {row.matchedNoteId}
                    </Link>
                  ) : (
                    <span className="inline-flex min-h-10 items-center rounded-2xl border border-dashed px-3 text-xs text-muted-foreground">ללא תעודה</span>
                  )}
                  <button type="button" onClick={() => setExpandedId(open ? "" : row.id)}
                    className="inline-flex min-h-10 items-center gap-1 rounded-2xl border px-3 text-xs font-bold hover:bg-muted">
                    {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}פרטים
                  </button>
                </div>

                {open && (
                  <div className="mt-3 space-y-2 rounded-2xl border bg-muted/25 p-3 text-xs">
                    <div className="flex justify-between gap-2 tabular-nums">
                      <span className="text-muted-foreground">ISO פתיחה</span>
                      <span className="font-mono text-[10px]">{row.openIso}</span>
                    </div>
                    {row.closeIso && (
                      <div className="flex justify-between gap-2 tabular-nums">
                        <span className="text-muted-foreground">ISO סגירה</span>
                        <span className="font-mono text-[10px]">{row.closeIso}</span>
                      </div>
                    )}
                    {row.hand.flags.length > 0 && (
                      <div className="text-amber-800 dark:text-amber-200">דגלי כתב יד: {row.hand.flags.join(" · ")}</div>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {!filtered.length && (
        <div className="rounded-3xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          אין סשנים בטווח/סינון — רק נתוני גיליון אמיתיים.
        </div>
      )}

      {historyAddress && (
        <section className="overflow-hidden rounded-3xl border border-violet-400/30 bg-card shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gradient-to-l from-violet-500/15 to-transparent px-4 py-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-violet-700" />
              <h3 className="font-display font-bold">היסטוריה בכתובת</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">{historyAddress}</span>
              <Link to="/sites" search={{ q: historyAddress }}
                className="rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 text-xs font-bold hover:bg-teal-500/20">פתח במפה</Link>
            </div>
          </div>
          <div className="grid md:grid-cols-2">
            <div className="max-h-96 space-y-1.5 overflow-y-auto border-b p-3 md:border-b-0 md:border-e">
              <div className="mb-2 text-[11px] font-bold text-muted-foreground">סשני PTO ({addressHistory.length})</div>
              {addressHistory.map((h) => {
                const over = h.durationMin != null && h.durationMin > PTO_ALERT_MIN;
                return (
                  <div key={h.id} className={cn("flex items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-xs",
                    over && "border-red-400/50 bg-red-500/10", h.hand.kind === "mismatch" && "border-orange-400/40")}>
                    <div>
                      <div className="font-bold tabular-nums">{h.dateHe} · {h.openTimeHe}–{h.closeTimeHe}</div>
                      <div className="text-muted-foreground">{h.truck}{h.hand.kind !== "none" ? ` · ${handBadge(h.hand.kind).text}` : ""}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={cn("rounded-lg px-2 py-0.5 font-extrabold tabular-nums", over ? "bg-red-600 text-white" : "bg-muted")}>
                        {formatDuration(h.durationMin, h.orphan)} דק׳
                      </span>
                      {h.matchedNoteId && (
                        <Link to="/notes/$id" params={{ id: String(h.matchedNoteId) }} className="font-bold text-emerald-700 hover:underline dark:text-emerald-300">ת.מ. {h.matchedNoteId}</Link>
                      )}
                    </div>
                  </div>
                );
              })}
              {!addressHistory.length && <p className="text-sm text-muted-foreground">אין סשנים.</p>}
            </div>
            <div className="max-h-96 space-y-1.5 overflow-y-auto p-3">
              <div className="mb-2 text-[11px] font-bold text-muted-foreground">תעודות / כתב יד ({notesAtAddress.length})</div>
              {notesAtAddress.slice(0, 50).map((n) => (
                <Link key={n.id} to="/notes/$id" params={{ id: String(n.id) }}
                  className="flex items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-xs transition hover:bg-muted/50">
                  <div>
                    <div className="font-bold">ת.מ. {n.id}</div>
                    <div className="text-muted-foreground">{n.date} · {n.customer || "—"}{n.craneTime ? ` · כ״י: ${n.craneTime.slice(0, 40)}` : ""}</div>
                  </div>
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
              {!notesAtAddress.length && <p className="text-sm text-muted-foreground">אין תעודות עם כתובת תואמת בארכיון.</p>}
            </div>
          </div>
        </section>
      )}

      <p className="text-center text-[11px] text-muted-foreground">
        {filtered.length}/{allRows.length} סשנים ייחודיים · פער כתב־יד מעל {HW_GAP_MIN} דק׳ = הזרה · חריגת PTO מעל {PTO_ALERT_MIN} דק׳ · מקורות גיליון בלבד
      </p>
    </div>
  );
}

function Chip({ active, danger, onClick, children }: { active?: boolean; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("rounded-xl px-3 py-1.5 text-xs font-bold transition",
        active ? (danger ? "bg-red-600 text-white shadow-sm" : "bg-primary text-primary-foreground shadow-sm") : "bg-muted/50 hover:bg-muted")}>
      {children}
    </button>
  );
}

function Kpi({ icon: Icon, label, value, danger }: { icon: typeof Timer; label: string; value: string | number; danger?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-3 shadow-sm", danger ? "border-red-500/35 bg-red-500/10" : "border-border/60 bg-card")}>
      <div className={cn("flex items-center gap-1 text-[10px] font-semibold", danger ? "text-red-800 dark:text-red-200" : "text-muted-foreground")}>
        <Icon className="h-3 w-3" />{label}
      </div>
      <div className={cn("mt-0.5 font-display text-xl font-extrabold tabular-nums", danger && "text-red-700 dark:text-red-300")}>{value}</div>
    </div>
  );
}

export default IturanPtoAuditPanel;
