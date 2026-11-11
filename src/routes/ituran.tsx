/**
 * /ituran — מרכז מודיעין לוגיסטי
 * שלב א׳: אמינות נתונים · שלב ב׳: מרכז חריגות
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { type DeliveryNote } from "@/lib/data";
import { fetchLiveNotes } from "@/lib/api";
import {
  crossMatch, rowsToStops, DRIVER_FLEET, groupStopsByDriver, visitStatusLabel,
  normalizePlate, plateOfDriver, kindOfPlate, visitsToStops,
  type GpsStop, type IturanVisit, type AuditStatus,
} from "@/lib/ituran";
import { listIturanVisitsFn, listIturanStopsFn } from "@/lib/ituran-api.functions";
import { listPtoFn } from "@/lib/notes-api.functions";
import { getSiteAtlasFn } from "@/lib/customer-history.functions";
import { pairPtoEvents, analyzePto, israelTime } from "@/lib/smart-dispatch/pto-pairing";
import {
  YARDS, MATCH_TIER_HE, tierFromAudit, formatKm, formatMinutes, distanceToYardKm, type MatchTier,
} from "@/lib/logistics-intelligence";
import {
  IturanAnomaliesPanel, STAY_ALERT_MIN, dwellBand, type AnomaliesData,
} from "@/components/IturanAnomaliesPanel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Satellite, MapPin, CheckCircle2, AlertTriangle, XCircle, Truck, Upload,
  RefreshCw, Search, User, Gauge, Building2, Filter, ExternalLink, Clock,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ituran")({
  head: () => ({ meta: [{ title: "מודיעין איתוראן — נועה | ח. סבן" }] }),
  component: IturanIntelligencePage,
});

type MainTab = "overview" | "anomalies" | "match" | "pto" | "sites" | "fleet" | "sources";
type StopsSource = "sheet-stops" | "sheet-visits" | "upload" | "none";
const PTO_LOOKBACK_MS = 14 * 24 * 3600 * 1000;

function statusIcon(s: AuditStatus) {
  if (s === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (s === "warn") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <XCircle className="h-4 w-4 text-red-600" />;
}

function tierBadge(tier: MatchTier) {
  const styles: Record<MatchTier, string> = {
    verified: "bg-emerald-100 text-emerald-800 border-emerald-200",
    high: "bg-sky-100 text-sky-800 border-sky-200",
    review: "bg-amber-100 text-amber-900 border-amber-200",
    unmatched: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span className={cn("rounded-lg border px-2 py-0.5 text-[11px] font-bold", styles[tier])}>
      {MATCH_TIER_HE[tier]}
    </span>
  );
}

function osmEmbed(lat: number, lng: number) {
  const d = 0.03;
  const bbox = [lng - d, lat - d, lng + d, lat + d].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

function IturanIntelligencePage() {
  const [tab, setTab] = useState<MainTab>("overview");
  const [search, setSearch] = useState("");
  const [filterTruck, setFilterTruck] = useState("");
  const [filterDriver, setFilterDriver] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterTier, setFilterTier] = useState<MatchTier | "">("");
  const [uploadedStops, setUploadedStops] = useState<GpsStop[] | null>(null);
  const [selectedSiteKey, setSelectedSiteKey] = useState("");

  const notesQuery = useQuery<DeliveryNote[]>({
    queryKey: ["live-notes-ituran"],
    queryFn: fetchLiveNotes,
    staleTime: 30_000,
  });
  const visitsQuery = useQuery({
    queryKey: ["ituran-visits"],
    queryFn: () => listIturanVisitsFn(),
    staleTime: 60_000,
    retry: 1,
  });
  const stopsQuery = useQuery({
    queryKey: ["ituran-stops"],
    queryFn: () => listIturanStopsFn(),
    staleTime: 60_000,
    retry: 1,
  });
  const ptoQuery = useQuery({
    queryKey: ["ituran-pto-intel"],
    queryFn: () =>
      listPtoFn({ data: { since: new Date(Date.now() - PTO_LOOKBACK_MS).toISOString() } }),
    staleTime: 60_000,
    retry: 1,
  });
  const sitesQuery = useQuery({
    queryKey: ["site-atlas-ituran"],
    queryFn: () => getSiteAtlasFn(),
    staleTime: 60_000,
    retry: 1,
  });

  const notes = notesQuery.data || [];
  const sheetVisits: IturanVisit[] = visitsQuery.data?.visits || [];
  const sites = sitesQuery.data?.sites || [];

  const { activeStops, stopsSource } = useMemo(() => {
    if (uploadedStops?.length)
      return { activeStops: uploadedStops, stopsSource: "upload" as StopsSource };
    const fromProps = stopsQuery.data?.stops || [];
    if (fromProps.length)
      return { activeStops: fromProps, stopsSource: "sheet-stops" as StopsSource };
    const fromVisits = visitsToStops(sheetVisits);
    if (fromVisits.length)
      return { activeStops: fromVisits, stopsSource: "sheet-visits" as StopsSource };
    return { activeStops: [] as GpsStop[], stopsSource: "none" as StopsSource };
  }, [uploadedStops, stopsQuery.data, sheetVisits]);

  const ptoSessions = useMemo(() => {
    const paired = pairPtoEvents(ptoQuery.data?.events ?? []);
    return analyzePto(paired, notes).sessions;
  }, [ptoQuery.data, notes]);

  const matched = useMemo(
    () =>
      notes.map((note) => {
        const pre = sheetVisits.find((v) => String(v.docNumber) === String(note.id));
        if (pre && pre.itArrive) {
          const status = (pre.status || "ok") as AuditStatus;
          const ptoNum =
            pre.ptoMin != null && pre.ptoMin !== "" ? Number(pre.ptoMin) : null;
          return {
            note,
            plate: normalizePlate(pre.truck) || plateOfDriver(note.driver),
            kind: kindOfPlate(pre.truck || plateOfDriver(note.driver)),
            status,
            dwell: pre.itStop ?? null,
            label: visitStatusLabel(status),
            stop: {
              plate: pre.truck,
              address: pre.itAddr || pre.address,
              arrive: pre.itArrive,
              depart: pre.itDepart,
              driver: pre.driver,
              durationMin: pre.itStop,
            } as GpsStop,
            fromSheet: true,
            tier: tierFromAudit(status, true),
            ptoMin: ptoNum != null && Number.isFinite(ptoNum) ? ptoNum : null,
          };
        }
        const plate =
          normalizePlate(String((note as { truck?: string }).truck || "")) ||
          plateOfDriver(note.driver) ||
          "";
        const kind = kindOfPlate(plate);
        const result = crossMatch(
          { ...note, siteAddress: note.siteAddress, date: note.date },
          kind,
          plate,
          activeStops,
        );
        return {
          note,
          plate,
          kind,
          ...result,
          fromSheet: false,
          tier: tierFromAudit(result.status, false),
          ptoMin: null as number | null,
        };
      }),
    [notes, activeStops, sheetVisits],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return matched.filter((m) => {
      if (filterTier && m.tier !== filterTier) return false;
      if (filterTruck && !String(m.plate || "").includes(filterTruck)) return false;
      if (filterDriver && !(m.note.driver || "").includes(filterDriver)) return false;
      if (filterCustomer) {
        const c = filterCustomer.toLowerCase();
        if (
          !(
            String(m.note.customerNo || "").includes(filterCustomer) ||
            (m.note.customer || "").toLowerCase().includes(c)
          )
        )
          return false;
      }
      if (!q) return true;
      return [
        m.note.id, m.note.customer, m.note.customerNo, m.note.siteAddress,
        m.note.driver, m.plate, m.stop?.address,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [matched, search, filterTruck, filterDriver, filterCustomer, filterTier]);

  const stats = useMemo(() => {
    const tiers = { verified: 0, high: 0, review: 0, unmatched: 0 };
    for (const m of matched) tiers[m.tier]++;
    const ptoOpens = ptoSessions.filter((s) => s.openIso && s.orphan !== "missing_open").length;
    const ptoOpenNow = ptoSessions.filter((s) => s.orphan === "missing_close").length;
    const stopsMissingTime = activeStops.filter((s) => !s.arrive || !s.depart).length;
    return {
      notes: notes.length,
      stops: activeStops.length,
      visits: sheetVisits.length,
      pto: ptoSessions.length,
      ptoOpens,
      ptoOpenNow,
      stopsMissingTime,
      sites: sites.length,
      mappedSites: sites.filter((s) => s.latitude != null && s.longitude != null).length,
      ...tiers,
    };
  }, [matched, notes, activeStops, sheetVisits, ptoSessions, sites]);

  const anomalies: AnomaliesData = useMemo(() => {
    const longStays = matched
      .filter((m) => m.dwell != null && Number.isFinite(m.dwell) && (m.dwell as number) > STAY_ALERT_MIN)
      .map((m) => ({
        noteId: m.note.id,
        customer: m.note.customer || "—",
        customerNo: m.note.customerNo,
        address: m.note.siteAddress || m.stop?.address || "—",
        driver: m.note.driver || m.stop?.driver || "—",
        plate: m.plate || "—",
        dwell: m.dwell as number,
        band: dwellBand(m.dwell),
        tier: m.tier,
        ptoMin: m.ptoMin,
      }))
      .sort((a, b) => b.dwell - a.dwell);
    const craneOpens = [...ptoSessions]
      .filter((s) => s.openIso && s.orphan !== "missing_open")
      .sort((a, b) => new Date(b.openIso).getTime() - new Date(a.openIso).getTime());
    const openPto = ptoSessions.filter((s) => s.orphan === "missing_close");
    const unmatchedNotes = matched.filter((m) => m.tier === "unmatched" || m.status === "fail");
    return {
      longStays,
      craneOpens,
      openPto,
      unmatchedNotes,
      longStayCount: longStays.length,
      severeCount: longStays.filter((s) => s.band === "severe").length,
    };
  }, [matched, ptoSessions]);

  const dataHealth = useMemo(() => {
    const errs: string[] = [];
    if (notesQuery.isError) errs.push("תעודות");
    if (visitsQuery.isError) errs.push("ביקורים");
    if (stopsQuery.isError) errs.push("עצירות");
    if (ptoQuery.isError) errs.push("PTO");
    if (sitesQuery.isError) errs.push("אתרים");
    const fetching =
      notesQuery.isFetching || visitsQuery.isFetching || stopsQuery.isFetching ||
      ptoQuery.isFetching || sitesQuery.isFetching;
    const updatedAt = [
      notesQuery.dataUpdatedAt, visitsQuery.dataUpdatedAt, stopsQuery.dataUpdatedAt,
      ptoQuery.dataUpdatedAt, sitesQuery.dataUpdatedAt,
    ].filter(Boolean);
    const lastMs = updatedAt.length ? Math.max(...updatedAt) : 0;
    const lastLabel = lastMs
      ? new Date(lastMs).toLocaleString("he-IL", {
          hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit",
        })
      : "—";
    return { errs, fetching, lastLabel };
  }, [
    notesQuery.isError, notesQuery.isFetching, notesQuery.dataUpdatedAt,
    visitsQuery.isError, visitsQuery.isFetching, visitsQuery.dataUpdatedAt,
    stopsQuery.isError, stopsQuery.isFetching, stopsQuery.dataUpdatedAt,
    ptoQuery.isError, ptoQuery.isFetching, ptoQuery.dataUpdatedAt,
    sitesQuery.isError, sitesQuery.isFetching, sitesQuery.dataUpdatedAt,
  ]);

  const byDriver = useMemo(() => groupStopsByDriver(activeStops), [activeStops]);
  const selectedSite =
    sites.find((s) => (s.siteKey || `${s.city}|${s.address}`) === selectedSiteKey) || sites[0];

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
      const stops = rowsToStops(rows);
      if (!stops.length) { toast.error("לא נמצאו עצירות בקובץ"); return; }
      setUploadedStops(stops);
      toast.success(`נטענו ${stops.length} עצירות מהקובץ`);
    } catch {
      toast.error("שגיאה בקריאת הקובץ");
    }
  };

  const refreshAll = () => {
    void notesQuery.refetch();
    void visitsQuery.refetch();
    void stopsQuery.refetch();
    void ptoQuery.refetch();
    void sitesQuery.refetch();
  };

  const sourceLabel: Record<StopsSource, string> = {
    "sheet-stops": "getIturanStops",
    "sheet-visits": "ביקורים_איתוראן",
    upload: "קובץ שהועלה",
    none: "אין מקור עצירות חי",
  };

  return (
    <>
      <PageHeader
        title="מודיעין איתוראן"
        subtitle="GPS · PTO · אתרי לקוחות · הצלבת תעודות — מקורות גיליון בלבד"
        action={
          <button type="button" onClick={refreshAll}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold hover:bg-muted">
            <RefreshCw className={cn("h-4 w-4", notesQuery.isFetching && "animate-spin")} />
            רענון
          </button>
        }
      />

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-8" dir="rtl">
        <div className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border px-3 py-2 text-[11px]",
          dataHealth.errs.length ? "border-red-500/40 bg-red-500/5 text-red-800"
            : stopsSource === "none" ? "border-amber-500/40 bg-amber-500/5 text-amber-900"
            : "border-border/60 bg-muted/30 text-muted-foreground",
        )}>
          <span>עדכון אחרון: <strong className="text-foreground">{dataHealth.lastLabel}</strong></span>
          <span>·</span>
          <span>מקור עצירות: <strong className="text-foreground">{sourceLabel[stopsSource]}</strong></span>
          {dataHealth.fetching && (
            <span className="inline-flex items-center gap-1 text-sky-700">
              <RefreshCw className="h-3 w-3 animate-spin" /> טוען…
            </span>
          )}
          {dataHealth.errs.length > 0 && (
            <span className="font-bold">שגיאה: {dataHealth.errs.join(", ")}</span>
          )}
          {stats.stopsMissingTime > 0 && (
            <span className="text-amber-800">
              · {stats.stopsMissingTime} עצירות ללא שעת הגעה/עזיבה (לא חושבה חריגה)
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "תעודות", value: stats.notes, color: "text-slate-800" },
            { label: `שהיות >${STAY_ALERT_MIN} דק׳`, value: anomalies.longStayCount, color: "text-amber-800" },
            { label: "חריגות חמורות", value: anomalies.severeCount, color: "text-red-700" },
            { label: "פתיחות PTO", value: stats.ptoOpens, color: "text-violet-700" },
            { label: "PTO פתוח כעת", value: stats.ptoOpenNow, color: "text-amber-700" },
            { label: "לא משויך", value: stats.unmatched, color: "text-red-700" },
          ].map((k) => (
            <Card key={k.label} className="rounded-2xl border-border/70 p-4 shadow-sm">
              <div className="text-[11px] font-semibold text-muted-foreground">{k.label}</div>
              <div className={cn("mt-1 font-display text-2xl font-extrabold", k.color)}>
                {dataHealth.fetching && k.value === 0 ? "—" : k.value}
              </div>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 border-b border-border pb-2">
          {(
            [
              ["overview", "סקירה"],
              ["anomalies", "חריגות"],
              ["match", "הצלבת תעודות"],
              ["pto", "PTO ומנוף"],
              ["sites", "אתרי לקוחות"],
              ["fleet", "צי ונהגים"],
              ["sources", "מקורות"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={cn("rounded-xl px-3 py-2 text-xs font-bold transition",
                tab === id ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted")}>
              {label}
            </button>
          ))}
        </div>

        {tab === "anomalies" && (
          <IturanAnomaliesPanel anomalies={anomalies} onOpenSitesTab={() => setTab("sites")} />
        )}

        {tab === "overview" && (
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="space-y-3 rounded-2xl border-border p-4 shadow-sm lg:col-span-3">
              <h3 className="font-display text-base font-bold">הצלבות אחרונות</h3>
              <div className="max-h-[28rem] space-y-2 overflow-y-auto">
                {filtered.slice(0, 40).map((m) => (
                  <div key={m.note.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="font-bold">
                        <Link to="/notes/$id" params={{ id: String(m.note.id) }} className="hover:underline">
                          ת.מ. {m.note.id}
                        </Link>
                        {m.note.customerNo ? (
                          <Link to="/customers/$id" params={{ id: String(m.note.customerNo) }}
                            className="mr-2 text-xs font-semibold text-sky-700 hover:underline">
                            לקוח {m.note.customerNo}
                          </Link>
                        ) : null}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {m.note.customer} · {m.note.siteAddress || "ללא כתובת"}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {tierBadge(m.tier)}
                      <span className="text-xs text-muted-foreground">שהייה: {formatMinutes(m.dwell)}</span>
                    </div>
                  </div>
                ))}
                {!filtered.length && <p className="text-sm text-muted-foreground">אין רשומות בסינון הנוכחי.</p>}
              </div>
            </Card>
            <Card className="space-y-3 rounded-2xl border-border p-4 shadow-sm lg:col-span-2">
              <h3 className="font-display text-base font-bold">PTO אחרונים</h3>
              <div className="max-h-[28rem] space-y-2 overflow-y-auto">
                {ptoSessions.slice(0, 25).map((s, i) => (
                  <div key={`${s.truck}-${s.openIso}-${i}`} className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 font-bold">
                      <Gauge className="h-3.5 w-3.5 text-violet-600" />
                      {s.truck || "—"}
                      {s.matchedNoteId ? (
                        <Link to="/notes/$id" params={{ id: String(s.matchedNoteId) }}
                          className="text-xs font-semibold text-emerald-700 hover:underline">
                          ת.מ. {s.matchedNoteId}
                        </Link>
                      ) : (
                        <span className="text-xs text-amber-700">ללא תעודה</span>
                      )}
                      {s.orphan === "missing_close" && (
                        <span className="rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-900">פתוח</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {s.openIso ? israelTime(s.openIso) : "אין נתון"} –{" "}
                      {s.closeIso ? israelTime(s.closeIso) : "פתוח / אין נתון"}
                      {s.durationMin != null ? ` · ${s.durationMin} דק׳` : ""}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{s.address || "כתובת לא ידועה"}</div>
                  </div>
                ))}
                {!ptoSessions.length && <p className="text-sm text-muted-foreground">אין אירועי PTO בטווח.</p>}
              </div>
            </Card>
          </div>
        )}

        {tab === "match" && (
          <div className="space-y-3">
            {(tab === "match") && (
              <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border/60 bg-card p-3">
                <Filter className="mb-2 h-4 w-4 text-muted-foreground" />
                <div className="relative min-w-[12rem] flex-1">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="חיפוש תעודה, לקוח, כתובת…" className="pr-9" />
                </div>
              </div>
            )}
            {filtered.map((m) => (
              <Card key={m.note.id} className="rounded-2xl border-border/70 p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {statusIcon(m.status)}
                      <Link to="/notes/$id" params={{ id: String(m.note.id) }} className="font-bold hover:underline">
                        ת.מ. {m.note.id}
                      </Link>
                      {tierBadge(m.tier)}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {m.note.customer} · {m.note.siteAddress || "—"}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Truck className="h-3 w-3" />{m.plate || "אין רישוי"}</span>
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />שהייה: {formatMinutes(m.dwell)}</span>
                    </div>
                  </div>
                  {m.note.customerNo && (
                    <Link to="/customers/$id" params={{ id: String(m.note.customerNo) }}
                      className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl border px-3 text-xs font-bold hover:bg-muted">
                      תיק לקוח <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </Card>
            ))}
            {!filtered.length && <p className="text-center text-sm text-muted-foreground">אין תוצאות להצגה.</p>}
          </div>
        )}

        {tab === "pto" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">מקור: איתוראן_PTO · משך PTO נפרד מזמן שהייה. חסר = «אין נתון».</p>
            {ptoSessions.map((s, i) => (
              <Card key={`${s.id}-${i}`} className="rounded-2xl border-border/70 p-4 shadow-sm">
                <div className="font-bold">{s.truck || "—"} · {s.driver || "—"}</div>
                <div className="text-sm text-muted-foreground">
                  {s.openIso ? israelTime(s.openIso) : "—"} – {s.closeIso ? israelTime(s.closeIso) : "פתוח"}
                  {s.durationMin != null ? ` · ${s.durationMin} דק׳` : ""}
                </div>
                <div className="text-xs">{s.address || "—"}</div>
                {s.matchedNoteId ? (
                  <Link to="/notes/$id" params={{ id: String(s.matchedNoteId) }}
                    className="mt-1 inline-flex text-xs font-bold text-emerald-700 hover:underline">
                    משויך לת.מ. {s.matchedNoteId}
                  </Link>
                ) : (
                  <span className="mt-1 text-xs text-amber-700">ללא תעודה</span>
                )}
              </Card>
            ))}
            {!ptoSessions.length && <p className="text-sm text-muted-foreground">אין אירועי PTO בטווח של 14 הימים האחרונים.</p>}
          </div>
        )}

        {tab === "sites" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">אתרי לקוחות מהאטלס · לחיצה לבחירה</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sites.slice(0, 80).map((s) => {
                const key = s.siteKey || `${s.city}|${s.address}`;
                return (
                  <button key={key} type="button" onClick={() => setSelectedSiteKey(key)}
                    className={cn("rounded-xl border p-3 text-right text-sm transition",
                      selectedSiteKey === key ? "border-emerald-400 bg-emerald-50" : "hover:bg-muted")}>
                    <div className="font-bold truncate">{s.address || "—"}</div>
                    <div className="text-xs text-muted-foreground">{s.city} · {s.visits} ביקורים</div>
                  </button>
                );
              })}
            </div>
            {selectedSite && (
              <Card className="rounded-2xl border-border p-4">
                <h3 className="font-bold">{selectedSite.address}</h3>
                <div className="mt-2 text-xs text-muted-foreground space-y-1">
                  <div>שהייה חציון: {formatMinutes(selectedSite.medianMin)}</div>
                  <div>P80: {formatMinutes(selectedSite.p80Min)} · מקס: {formatMinutes(selectedSite.maxMin)}</div>
                  {selectedSite.customerNo && (
                    <Link to="/customers/$id" params={{ id: String(selectedSite.customerNo) }}
                      className="inline-flex text-sky-700 font-bold hover:underline">
                      תיק לקוח {selectedSite.customerNo}
                    </Link>
                  )}
                </div>
              </Card>
            )}
          </div>
        )}

        {tab === "fleet" && (
          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.keys(DRIVER_FLEET) as Array<keyof typeof DRIVER_FLEET>).map((id) => {
              const d = DRIVER_FLEET[id];
              const stops = byDriver[id] || [];
              return (
                <Card key={id} className="rounded-2xl border-border p-4">
                  <div className="font-bold">{d.label}</div>
                  <div className="text-xs text-muted-foreground">{stops.length} עצירות במקור הפעיל</div>
                </Card>
              );
            })}
          </div>
        )}

        {tab === "sources" && (
          <Card className="space-y-3 rounded-2xl border-border p-4">
            <h3 className="font-display text-base font-bold">מקורות נתונים</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><strong className="text-foreground">תעודות</strong> — ארכיון תעודות משלוח</li>
              <li><strong className="text-foreground">ביקורים</strong> — ביקורים_איתוראן</li>
              <li><strong className="text-foreground">עצירות</strong> — {sourceLabel[stopsSource]}</li>
              <li><strong className="text-foreground">PTO</strong> — איתוראן_PTO</li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold hover:bg-muted">
                <Upload className="h-3.5 w-3.5" /> העלאת XLSX עצירות
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} />
              </label>
              {uploadedStops && (
                <Button size="sm" variant="outline" onClick={() => setUploadedStops(null)}>חזרה לגיליון</Button>
              )}
            </div>
          </Card>
        )}
      </main>
    </>
  );
}
