/**
 * /ituran — מרכז מודיעין לוגיסטי
 * שלבים א׳–ד׳: אמינות · חריגות · כרטיס אתר · השוואת שהייה/P80
 * + פאנל ביקורת סשני PTO (מדדים, חריגות >20 דק׳, הצלבת לקוח/תעודה)
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
import { IturanSiteCard } from "@/components/IturanSiteCard";
import { IturanPtoAuditPanel } from "@/components/IturanPtoAuditPanel";
import {
  buildBenchmark,
  compareDwell,
  verdictLabelHe,
} from "@/lib/dwell-intelligence";
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

function IturanIntelligencePage() {
  const [tab, setTab] = useState<MainTab>("overview");
  const [search, setSearch] = useState("");
  const [filterTruck, setFilterTruck] = useState("");
  const [filterDriver, setFilterDriver] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterTier, setFilterTier] = useState<MatchTier | "">("");
  const [uploadedStops, setUploadedStops] = useState<GpsStop[] | null>(null);
  const [selectedSiteKey, setSelectedSiteKey] = useState("");
  const [siteSearch, setSiteSearch] = useState("");

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
      .map((m) => {
        const address = m.note.siteAddress || m.stop?.address || "—";
        const bm = buildBenchmark({
          plate: m.plate,
          kind: m.kind,
          address,
          sites,
        });
        const cmp = compareDwell(m.dwell as number, bm);
        return {
          noteId: m.note.id,
          customer: m.note.customer || "—",
          customerNo: m.note.customerNo,
          address,
          driver: m.note.driver || m.stop?.driver || "—",
          plate: m.plate || "—",
          dwell: m.dwell as number,
          band: dwellBand(m.dwell),
          tier: m.tier,
          ptoMin: m.ptoMin,
          kindLabel: bm.kindLabelHe,
          fleetRangeLabel: `${bm.fleetMin}–${bm.fleetMax}`,
          siteP80: bm.siteP80,
          verdict: cmp.verdict,
          verdictLabel: verdictLabelHe(cmp.verdict),
          summaryHe: cmp.summaryHe,
          overFleetMin: cmp.overFleetMin,
          overSiteP80Min: cmp.overSiteP80Min,
        };
      })
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
      severeCount: longStays.filter((s) => s.verdict === "severe" || s.band === "severe").length,
      aboveFleetCount: longStays.filter((s) => (s.overFleetMin || 0) > 0).length,
      aboveSiteP80Count: longStays.filter((s) => (s.overSiteP80Min || 0) > 0).length,
    };
  }, [matched, ptoSessions, sites]);

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

  const filteredSites = useMemo(() => {
    const q = siteSearch.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter((s) =>
      [s.address, s.city, s.customerName, s.customerNo, s.siteKey]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [sites, siteSearch]);

  const selectedSite =
    sites.find((s) => (s.siteKey || `${s.city}|${s.address}`) === selectedSiteKey) ||
    filteredSites[0] ||
    sites[0];

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]!]);
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
          <IturanAnomaliesPanel
            anomalies={anomalies}
            onOpenSitesTab={(address) => {
              setTab("sites");
              if (address) {
                setSiteSearch(address);
                const hit = sites.find(
                  (s) =>
                    (s.address || "").includes(address) ||
                    address.includes(s.address || ""),
                );
                if (hit) setSelectedSiteKey(hit.siteKey || `${hit.city}|${hit.address}`);
              }
            }}
          />
        )}

        {tab === "overview" && (
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="space-y-3 rounded-2xl border-border p-4 shadow-sm lg:col-span-3">
              <h3 className="font-display text-base font-bold">PTO אחרונים</h3>
              <div className="space-y-2">
                {ptoSessions.slice(0, 25).map((s, i) => (
                  <div key={`${s.id}-${i}`} className="rounded-xl border bg-muted/20 px-3 py-2 text-xs">
                    <div className="font-bold">{s.truck} · {s.driver || "—"}</div>
                    <div className="text-muted-foreground tabular-nums">
                      {s.openIso ? israelTime(s.openIso) : "—"} – {s.closeIso ? israelTime(s.closeIso) : "פתוח"}
                      {s.durationMin != null ? ` · ${s.durationMin} דק׳` : ""}
                    </div>
                    <div>{s.address || "—"}</div>
                  </div>
                ))}
                {!ptoSessions.length && <p className="text-sm text-muted-foreground">אין אירועי PTO בטווח.</p>}
              </div>
            </Card>
            <Card className="space-y-2 rounded-2xl border-border p-4 shadow-sm lg:col-span-2">
              <h3 className="font-display text-base font-bold">סיכום הצלבה</h3>
              <ul className="space-y-1 text-sm">
                <li>מאומת: <strong>{stats.verified}</strong></li>
                <li>גבוה: <strong>{stats.high}</strong></li>
                <li>לבדיקה: <strong>{stats.review}</strong></li>
                <li>לא משויך: <strong>{stats.unmatched}</strong></li>
              </ul>
            </Card>
          </div>
        )}

        {tab === "match" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[12rem] flex-1">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש תעודה / לקוח / כתובת" className="pe-10" />
              </div>
            </div>
            <div className="space-y-2">
              {filtered.map((m) => (
                <Card key={m.note.id} className="rounded-2xl border-border/70 p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
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
          </div>
        )}

        {tab === "pto" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              מקור: איתוראן_PTO · צימוד open/close לפי משאית · הצלבה לתעודות · חריגה מעל 20 דק׳ מודגשת באדום.
            </p>
            <IturanPtoAuditPanel sessions={ptoSessions} notes={notes} />
          </div>
        )}

        {tab === "sites" && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-sky-200/70 bg-sky-50/40 px-4 py-2.5 text-xs text-sky-950 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
              <strong>שלב ג׳ — כרטיס אתר</strong> · P50/P80 מגיליון · היסטוריית ביקורים · זמני PTO מאומתים · ניווט לתעודה/לקוח.
            </div>
            <div className="relative max-w-md">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={siteSearch} onChange={(e) => setSiteSearch(e.target.value)} placeholder="חיפוש אתר / לקוח" className="pe-10" />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-2">
                {filteredSites.slice(0, 40).map((s, i) => {
                  const key = s.siteKey || `${s.city}|${s.address}`;
                  const active = (selectedSite?.siteKey || `${selectedSite?.city}|${selectedSite?.address}`) === key;
                  return (
                    <button
                      key={`${key}-${i}`}
                      type="button"
                      onClick={() => setSelectedSiteKey(key)}
                      className={cn(
                        "w-full rounded-2xl border p-3 text-start transition",
                        active ? "border-primary/50 bg-primary/5" : "bg-card hover:bg-muted/40",
                      )}
                    >
                      <div className="font-bold">{s.address}</div>
                      <div className="text-xs text-muted-foreground">
                        {[s.city, s.customerName, s.customerNo && `#${s.customerNo}`].filter(Boolean).join(" · ")}
                        {s.ptoOpens ? ` · PTO: ${s.ptoOpens}` : ""}
                      </div>
                    </button>
                  );
                })}
                {!filteredSites.length && <p className="text-sm text-muted-foreground">אין אתרים.</p>}
              </div>
              <div>{selectedSite && <IturanSiteCard site={selectedSite} />}</div>
            </div>
          </div>
        )}

        {tab === "fleet" && (
          <div className="space-y-3">
            {DRIVER_FLEET.map((d) => (
              <Card key={d.plate} className="rounded-2xl border-border/70 p-4 shadow-sm">
                <div className="font-bold">{d.name} · {d.plate}</div>
                <div className="text-xs text-muted-foreground">{d.kind === "crane" ? "מנוף" : "משטח"}</div>
              </Card>
            ))}
          </div>
        )}

        {tab === "sources" && (
          <Card className="space-y-2 rounded-2xl border-border p-4 text-sm shadow-sm">
            <h3 className="font-display font-bold">מקורות נתונים</h3>
            <ul className="list-disc space-y-1 pe-5 text-muted-foreground">
              <li><strong className="text-foreground">תעודות</strong> — גיליון חי / fetchLiveNotes</li>
              <li><strong className="text-foreground">עצירות / ביקורים</strong> — listIturanStopsFn / listIturanVisitsFn</li>
              <li><strong className="text-foreground">PTO</strong> — איתוראן_PTO (listPtoFn → pairPtoEvents)</li>
              <li><strong className="text-foreground">אתרים</strong> — getSiteAtlasFn</li>
            </ul>
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold hover:bg-muted">
              <Upload className="h-4 w-4" /> העלאת קובץ עצירות
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} />
            </label>
          </Card>
        )}
      </main>
    </>
  );
}
