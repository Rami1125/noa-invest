/**
 * IturanPtoAuditPanel — מדד + כרטיסי סשני PTO
 * הצלבה: איתוראן_PTO · סשנים · ארכיון_תעודות_גליה · אתרי_לקוחות
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle, CalendarRange, ChevronDown, ChevronUp, Clock, FileText, Filter,
  Gauge, History, MapPin, Search, Timer, Truck, User, Link2,
} from "lucide-react";
import type { DeliveryNote } from "@/lib/data";
import type { AtlasSite } from "@/lib/customer-history.functions";
import { israelTime, type PtoSession } from "@/lib/smart-dispatch/pto-pairing";
import { cn } from "@/lib/utils";

export const PTO_ALERT_MIN = 20;
export type DatePreset = "today" | "this_week" | "last_week" | "custom" | "all";
export type StatusFilter = "all" | "alert" | "ok" | "orphan" | "matched";

export type PtoAuditRow = {
  id: string; truck: string; driver: string; address: string;
  openIso: string; closeIso?: string; durationMin: number | null;
  dateHe: string; openTimeHe: string; closeTimeHe: string;
  orphan?: "missing_open" | "missing_close";
  pairStatus: "paired" | "orphan_close" | "orphan_open";
  matchedNoteId?: string; customerName: string; customerNo: string;
  isAlert: boolean; addressKey: string;
};

type Props = { sessions: PtoSession[]; notes: DeliveryNote[]; sites?: AtlasSite[]; className?: string };

function normAddr(a: string): string {
  return String(a || "").toLowerCase().replace(/[.,"'׳״]/g, " ").replace(/\s+/g, " ").trim();
}

function startOfDayIL(d: Date): Date {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const probe = new Date(`${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+02:00`);
  return Number.isNaN(probe.getTime()) ? new Date(d.setHours(0, 0, 0, 0)) : probe;
}

function israelWeekBounds(ref: Date, which: "this" | "last"): { from: Date; to: Date } {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" });
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

export function buildPtoAuditRows(sessions: PtoSession[], notes: DeliveryNote[], sites?: AtlasSite[]): PtoAuditRow[] {
  const byId = new Map(notes.map((n) => [String(n.id), n]));
  return sessions.map((s) => {
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
    return {
      id: s.id, truck: s.truck || "", driver: s.driver || "", address,
      openIso: s.openIso, closeIso: s.closeIso, durationMin, dateHe: s.date || "",
      openTimeHe: s.orphan === "missing_open" ? "—" : israelTime(s.openIso),
      closeTimeHe: s.closeIso ? israelTime(s.closeIso) : s.orphan === "missing_close" ? "פתוח" : "—",
      orphan: s.orphan, pairStatus, matchedNoteId: s.matchedNoteId,
      customerName, customerNo, isAlert, addressKey: normAddr(address),
    };
  });
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
      if (historyAddress && r.addressKey !== normAddr(historyAddress)) return false;
      if (term) {
        const hay = [r.address, r.customerName, r.customerNo, r.matchedNoteId, r.truck, r.driver].filter(Boolean).join(" ").toLowerCase();
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
    };
  }, [filtered]);

  const addressHistory = useMemo(() => {
    if (!historyAddress) return [] as PtoAuditRow[];
    const key = normAddr(historyAddress);
    return allRows.filter((r) => r.addressKey === key).sort((a, b) => new Date(b.openIso).getTime() - new Date(a.openIso).getTime());
  }, [allRows, historyAddress]);

  const notesAtAddressDates = useMemo(() => {
    if (!historyAddress) return [] as DeliveryNote[];
    const key = normAddr(historyAddress);
    return notes.filter((n) => {
      const a = normAddr(n.siteAddress || "");
      return a && (a.includes(key) || key.includes(a));
    });
  }, [notes, historyAddress]);

  return (
    <div className={cn("space-y-4", className)} dir="rtl">
      <div className="flex flex-wrap gap-2 text-[11px]">
        {[
          { t: "איתוראן_PTO", d: "אירועי open/close" },
          { t: "סשנים_PTO", d: "צימוד לפי משאית" },
          { t: "ארכיון_תעודות_גליה", d: `${notes.length} תעודות` },
          { t: "אתרי_לקוחות", d: `${sites?.length ?? 0} אתרים` },
        ].map((s) => (
          <span key={s.t} className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-1 font-semibold shadow-sm">
            <Link2 className="h-3 w-3 text-teal-600" />
            <span>{s.t}</span>
            <span className="font-normal text-muted-foreground">· {s.d}</span>
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi icon={Timer} label="סשנים" value={kpis.total} />
        <Kpi icon={AlertTriangle} label={`חריגות >${PTO_ALERT_MIN}`} value={kpis.alertCount} danger={kpis.alertCount > 0} />
        <Kpi icon={Gauge} label="דק׳ מנוף" value={kpis.craneMins} />
        <Kpi icon={Clock} label="מקס׳ חריגה" value={kpis.maxAlert || "—"} danger={kpis.maxAlert > PTO_ALERT_MIN} />
        <Kpi icon={FileText} label="עם תעודה" value={kpis.matched} />
        <Kpi icon={AlertTriangle} label="יתומים" value={kpis.orphans} danger={kpis.orphans > 0} />
      </div>

      <div className="space-y-3 rounded-2xl border border-border/70 bg-card/80 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          {([["all", "הכל"], ["today", "היום"], ["this_week", "שבוע נוכחי"], ["last_week", "שבוע שעבר"], ["custom", "מותאם"]] as const).map(([id, label]) => (
            <Chip key={id} active={preset === id} onClick={() => setPreset(id)}>{label}</Chip>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex flex-wrap gap-2 text-xs">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="min-h-9 rounded-lg border bg-background px-2 tabular-nums" />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="min-h-9 rounded-lg border bg-background px-2 tabular-nums" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {([["all", "הכל"], ["alert", `חריגות >${PTO_ALERT_MIN}`], ["ok", `תקין ≤${PTO_ALERT_MIN}`], ["matched", "עם תעודה"], ["orphan", "יתומים"]] as const).map(([id, label]) => (
            <Chip key={id} active={statusFilter === id} danger={id === "alert"} onClick={() => setStatusFilter(id)}>{label}</Chip>
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
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש כתובת, לקוח, תעודה, משאית…" className="min-h-10 w-full rounded-xl border bg-background py-2 pe-10 ps-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
        {historyAddress && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-300/50 bg-violet-500/10 px-3 py-2 text-xs">
            <History className="h-3.5 w-3.5 text-violet-700" />
            <span className="font-bold">היסטוריית כתובת:</span>
            <span className="font-semibold">{historyAddress}</span>
            <button type="button" className="ms-auto rounded-lg border px-2 py-1 font-bold hover:bg-background" onClick={() => setHistoryAddress("")}>נקה סינון כתובת</button>
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((row) => {
          const over = row.durationMin != null && row.durationMin > PTO_ALERT_MIN;
          const open = expandedId === row.id;
          return (
            <article key={row.id} className={cn("group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:shadow-md",
              over && "border-red-400/60 bg-red-500/10",
              row.orphan === "missing_open" && !over && "border-amber-400/50 bg-amber-500/8",
              row.orphan === "missing_close" && !over && "border-sky-400/40 bg-sky-500/8",
              !over && !row.orphan && "border-border/70")}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-muted/60 px-2 py-0.5 text-[11px] font-bold tabular-nums"><Truck className="h-3 w-3" />{row.truck || "—"}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">{row.dateHe}</span>
                      {over && <span className="rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">חריגה</span>}
                      {row.orphan === "missing_open" && <span className="rounded-md bg-amber-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">סגירה ללא פתיחה</span>}
                      {row.orphan === "missing_close" && <span className="rounded-md bg-sky-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">פתוח</span>}
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="font-display text-lg font-extrabold tabular-nums tracking-tight">{row.openTimeHe}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-display text-lg font-extrabold tabular-nums tracking-tight">{row.closeTimeHe}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">פתיחת מנוף · סגירת מנוף</div>
                  </div>
                  <div className={cn("flex h-14 min-w-[3.5rem] flex-col items-center justify-center rounded-xl px-2 tabular-nums",
                    over ? "bg-red-600 text-white" : row.durationMin == null ? "bg-muted text-muted-foreground" : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200")}>
                    <span className="text-xl font-black leading-none">{formatDuration(row.durationMin, row.orphan)}</span>
                    <span className="text-[10px] font-bold opacity-80">דק׳</span>
                  </div>
                </div>

                <button type="button" onClick={() => setHistoryAddress((prev) => prev && normAddr(prev) === row.addressKey ? "" : row.address)}
                  className="mt-3 flex w-full items-start gap-2 rounded-xl border border-transparent bg-muted/30 px-2.5 py-2 text-start transition hover:border-primary/30 hover:bg-muted/50">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold leading-snug">{row.address || "כתובת לא ידועה"}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">לחיצה — היסטוריית פתיחות מנוף בכתובת</span>
                  </span>
                </button>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {(row.customerName || row.customerNo) && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-muted/50 px-2 py-1 font-semibold">
                      <User className="h-3 w-3" />{row.customerName || "לקוח"}
                      {row.customerNo ? (
                        <Link to="/customers/$id" params={{ id: String(row.customerNo) }} className="text-sky-700 hover:underline dark:text-sky-300" onClick={(e) => e.stopPropagation()}>#{row.customerNo}</Link>
                      ) : null}
                    </span>
                  )}
                  {row.driver && <span className="text-muted-foreground">{row.driver}</span>}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {row.matchedNoteId ? (
                    <Link to="/notes/$id" params={{ id: String(row.matchedNoteId) }}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-500/20 dark:text-emerald-200">
                      <FileText className="h-3.5 w-3.5" />ת.מ. {row.matchedNoteId}
                    </Link>
                  ) : (
                    <span className="inline-flex min-h-9 items-center rounded-xl border border-dashed px-3 text-xs text-muted-foreground">ללא תעודה משויכת</span>
                  )}
                  <button type="button" onClick={() => setExpandedId(open ? "" : row.id)} className="inline-flex min-h-9 items-center gap-1 rounded-xl border px-3 text-xs font-bold hover:bg-muted">
                    {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}פרטים
                  </button>
                </div>

                {open && (
                  <div className="mt-3 space-y-2 rounded-xl border bg-muted/20 p-3 text-xs">
                    <div className="flex justify-between tabular-nums"><span className="text-muted-foreground">ISO פתיחה</span><span className="font-mono text-[10px]">{row.openIso}</span></div>
                    {row.closeIso && <div className="flex justify-between tabular-nums"><span className="text-muted-foreground">ISO סגירה</span><span className="font-mono text-[10px]">{row.closeIso}</span></div>}
                    <button type="button" className="w-full rounded-lg border py-2 font-bold hover:bg-background" onClick={() => setHistoryAddress(row.address)}>הצג כל פתיחות המנוף בכתובת זו</button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {!filtered.length && (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">אין סשני PTO בטווח/סינון שנבחר (מבוסס נתוני גיליון בלבד).</div>
      )}

      {historyAddress && (
        <section className="overflow-hidden rounded-2xl border border-violet-300/40 bg-card shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-violet-500/10 px-4 py-3">
            <div className="flex items-center gap-2"><History className="h-4 w-4 text-violet-700" /><h3 className="font-display font-bold">היסטוריית פתיחות מנוף</h3></div>
            <span className="text-xs font-semibold text-muted-foreground">{historyAddress}</span>
          </div>
          <div className="grid gap-0 md:grid-cols-2">
            <div className="max-h-80 space-y-1 overflow-y-auto border-b p-3 md:border-b-0 md:border-e">
              <div className="mb-2 text-[11px] font-bold text-muted-foreground">סשני PTO בכתובת ({addressHistory.length})</div>
              {addressHistory.map((h) => {
                const over = h.durationMin != null && h.durationMin > PTO_ALERT_MIN;
                return (
                  <div key={h.id} className={cn("flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs", over && "border-red-400/50 bg-red-500/10")}>
                    <div>
                      <div className="font-bold tabular-nums">{h.dateHe} · {h.openTimeHe}–{h.closeTimeHe}</div>
                      <div className="text-muted-foreground">{h.truck}{h.driver ? ` · ${h.driver}` : ""}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("rounded-lg px-2 py-0.5 font-extrabold tabular-nums", over ? "bg-red-600 text-white" : "bg-muted")}>{formatDuration(h.durationMin, h.orphan)} דק׳</span>
                      {h.matchedNoteId && (
                        <Link to="/notes/$id" params={{ id: String(h.matchedNoteId) }} className="font-bold text-emerald-700 hover:underline dark:text-emerald-300">ת.מ. {h.matchedNoteId}</Link>
                      )}
                    </div>
                  </div>
                );
              })}
              {!addressHistory.length && <p className="text-sm text-muted-foreground">אין סשנים לכתובת זו במאגר.</p>}
            </div>
            <div className="max-h-80 space-y-1 overflow-y-auto p-3">
              <div className="mb-2 text-[11px] font-bold text-muted-foreground">תעודות קרובות לכתובת ({notesAtAddressDates.length})</div>
              {notesAtAddressDates.slice(0, 40).map((n) => (
                <Link key={n.id} to="/notes/$id" params={{ id: String(n.id) }} className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs transition hover:bg-muted/50">
                  <div><div className="font-bold">ת.מ. {n.id}</div><div className="text-muted-foreground">{n.date} · {n.customer || "—"}</div></div>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
              {!notesAtAddressDates.length && <p className="text-sm text-muted-foreground">לא נמצאו תעודות עם כתובת תואמת בארכיון.</p>}
            </div>
          </div>
        </section>
      )}

      <p className="text-center text-[11px] text-muted-foreground">מוצגים {filtered.length} / {allRows.length} סשנים · Asia/Jerusalem · חריגה = משך {">"} {PTO_ALERT_MIN} דק׳ · גיליון בלבד</p>
    </div>
  );
}

function Chip({ active, danger, onClick, children }: { active?: boolean; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-xl px-3 py-1.5 text-xs font-bold transition",
      active ? (danger ? "bg-red-600 text-white" : "bg-primary text-primary-foreground") : "bg-muted/50 hover:bg-muted")}>
      {children}
    </button>
  );
}

function Kpi({ icon: Icon, label, value, danger }: { icon: typeof Timer; label: string; value: string | number; danger?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-3 shadow-sm", danger ? "border-red-500/30 bg-red-500/10" : "border-border/70 bg-card")}>
      <div className={cn("flex items-center gap-1.5 text-[10px] font-semibold", danger ? "text-red-800 dark:text-red-200" : "text-muted-foreground")}>
        <Icon className="h-3 w-3" />{label}
      </div>
      <div className={cn("mt-0.5 font-display text-xl font-extrabold tabular-nums", danger && "text-red-700 dark:text-red-300")}>{value}</div>
    </div>
  );
}

export default IturanPtoAuditPanel;
