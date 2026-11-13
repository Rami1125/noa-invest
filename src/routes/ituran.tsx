/**
 * /ituran — מרכז מודיעין לוגיסטי
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { type DeliveryNote } from "@/lib/data";
import { fetchLiveNotes } from "@/lib/api";
import {
  crossMatch, rowsToStops, visitsToStops, visitStatusLabel,
  normalizePlate, plateOfDriver, kindOfPlate,
  type GpsStop, type IturanVisit, type AuditStatus,
} from "@/lib/ituran";
import { listIturanVisitsFn, listIturanStopsFn } from "@/lib/ituran-api.functions";
import { listPtoFn, listHandwrittenFn } from "@/lib/notes-api.functions";
import {
  indexHandwrittenByDocId, mapGasHandwrittenRow, normalizeDocId, type HandwrittenSheetRow,
} from "@/lib/handwritten-sheet";
import { getSiteAtlasFn } from "@/lib/customer-history.functions";
import { pairPtoEvents, analyzePto, normNoteDate } from "@/lib/smart-dispatch/pto-pairing";
import { MATCH_TIER_HE, tierFromAudit, type MatchTier } from "@/lib/logistics-intelligence";
import {
  IturanAnomaliesPanel, STAY_ALERT_MIN, dwellBand, type AnomaliesData,
} from "@/components/IturanAnomaliesPanel";
import { IturanSiteCard } from "@/components/IturanSiteCard";
import { IturanPtoAuditPanelWithHandwritten as IturanPtoAuditPanel } from "@/components/IturanPtoAuditPanelWithHandwritten";
import { buildBenchmark, compareDwell, verdictLabelHe } from "@/lib/dwell-intelligence";
import { Card } from "@/components/ui/card";
import { Upload, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ituran")({
  head: () => ({ meta: [{ title: "מודיעין איתוראן — נועה | ח. סבן" }] }),
  component: IturanIntelligencePage,
});

type MainTab = "overview" | "anomalies" | "match" | "pto" | "sites" | "sources";
type StopsSource = "sheet-stops" | "sheet-visits" | "upload" | "none";
const PTO_LOOKBACK_MS = 90 * 24 * 3600 * 1000;

/** נרמול תאריך: Date JS / yyyy-MM-dd / dd/MM/yyyy → dd/MM/yyyy */
function normalizeAnyDate(raw?: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  const fromNorm = normNoteDate(s);
  if (fromNorm) return fromNorm;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    return new Date(t).toLocaleDateString("en-GB", { timeZone: "Asia/Jerusalem" });
  }
  return s;
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
  const [uploadedStops, setUploadedStops] = useState<GpsStop[] | null>(null);
  const [selectedSiteKey, setSelectedSiteKey] = useState("");
  const [siteSearch, setSiteSearch] = useState("");

  const notesQuery = useQuery<DeliveryNote[]>({
    queryKey: ["live-notes-ituran"], queryFn: fetchLiveNotes, staleTime: 30_000,
  });
  const visitsQuery = useQuery({
    queryKey: ["ituran-visits"], queryFn: () => listIturanVisitsFn(), staleTime: 60_000, retry: 1,
  });
  const stopsQuery = useQuery({
    queryKey: ["ituran-stops"], queryFn: () => listIturanStopsFn(), staleTime: 60_000, retry: 1,
  });
  const ptoQuery = useQuery({
    queryKey: ["ituran-pto-intel"],
    queryFn: () => listPtoFn({ data: { since: new Date(Date.now() - PTO_LOOKBACK_MS).toISOString() } }),
    staleTime: 60_000, retry: 1,
  });
  const sitesQuery = useQuery({
    queryKey: ["site-atlas-ituran"], queryFn: () => getSiteAtlasFn(), staleTime: 60_000, retry: 1,
  });
  const handwrittenQuery = useQuery({
    queryKey: ["handwritten-tab"], queryFn: () => listHandwrittenFn(), staleTime: 60_000, retry: 1,
  });

  const notesRaw = notesQuery.data || [];
  const notes = useMemo(
    () => notesRaw.map((n) => ({ ...n, date: normalizeAnyDate(n.date) || n.date })),
    [notesRaw],
  );
  const sheetVisits: IturanVisit[] = visitsQuery.data?.visits || [];
  const sites = sitesQuery.data?.sites || [];
  const handwrittenRows: HandwrittenSheetRow[] = useMemo(() => {
    const raw = handwrittenQuery.data?.rows || [];
    const out: HandwrittenSheetRow[] = [];
    raw.forEach((r, i) => {
      const mapped = mapGasHandwrittenRow(r as unknown as Record<string, unknown>, i);
      if (mapped) out.push(mapped);
    });
    return out;
  }, [handwrittenQuery.data]);
  const handwrittenIndex = useMemo(() => indexHandwrittenByDocId(handwrittenRows), [handwrittenRows]);

  const { activeStops, stopsSource } = useMemo(() => {
    if (uploadedStops?.length) return { activeStops: uploadedStops, stopsSource: "upload" as StopsSource };
    const fromProps = stopsQuery.data?.stops || [];
    if (fromProps.length) return { activeStops: fromProps, stopsSource: "sheet-stops" as StopsSource };
    const fromVisits = visitsToStops(sheetVisits);
    if (fromVisits.length) return { activeStops: fromVisits, stopsSource: "sheet-visits" as StopsSource };
    return { activeStops: [] as GpsStop[], stopsSource: "none" as StopsSource };
  }, [uploadedStops, stopsQuery.data, sheetVisits]);

  const ptoSessions = useMemo(() => {
    return analyzePto(pairPtoEvents(ptoQuery.data?.events ?? []), notes).sessions;
  }, [ptoQuery.data, notes]);

  const ptoByNoteId = useMemo(() => {
    const map = new Map<string, (typeof ptoSessions)[number]>();
    for (const s of ptoSessions) {
      const id = normalizeDocId(s.matchedNoteId);
      if (id && !map.has(id)) map.set(id, s);
    }
    return map;
  }, [ptoSessions]);

  const matched = useMemo(() => {
    return notes.map((note) => {
      const noteId = normalizeDocId(note.id);
      const pre = sheetVisits.find((v) => normalizeDocId(v.docNumber) === noteId);
      if (pre && pre.itArrive) {
        const status = (pre.status || "ok") as AuditStatus;
        const ptoNum = pre.ptoMin != null && pre.ptoMin !== "" ? Number(pre.ptoMin) : null;
        return {
          note,
          plate: normalizePlate(pre.truck) || plateOfDriver(note.driver),
          kind: kindOfPlate(pre.truck || plateOfDriver(note.driver)),
          status,
          dwell: pre.itStop ?? null,
          label: visitStatusLabel(status),
          stop: {
            plate: pre.truck, address: pre.itAddr || pre.address,
            arrive: pre.itArrive, depart: pre.itDepart, driver: pre.driver, durationMin: pre.itStop,
          } as GpsStop,
          fromSheet: true,
          tier: tierFromAudit(status, true),
          ptoMin: ptoNum != null && Number.isFinite(ptoNum) ? ptoNum : null,
        };
      }

      const plate = normalizePlate(String((note as { truck?: string }).truck || "")) || plateOfDriver(note.driver) || "";
      const kind = kindOfPlate(plate);
      const result = crossMatch(
        { ...note, siteAddress: note.siteAddress, date: note.date },
        kind,
        plate,
        activeStops,
      );

      if (result.status !== "fail" && (result as { status: string }).status !== "missing") {
        return {
          note, plate, kind, ...result,
          fromSheet: false,
          tier: tierFromAudit(result.status, false),
          ptoMin: null as number | null,
        };
      }

      const pto = noteId ? ptoByNoteId.get(noteId) : undefined;
      if (pto) {
        return {
          note,
          plate: normalizePlate(pto.truck) || plate,
          kind: kindOfPlate(pto.truck || plate),
          status: "ok" as AuditStatus,
          dwell: pto.durationMin,
          label: "שויך דרך PTO",
          stop: {
            plate: pto.truck,
            address: pto.address || note.siteAddress || "",
            arrive: pto.openIso,
            depart: pto.closeIso,
            driver: pto.driver,
            durationMin: pto.durationMin ?? undefined,
          } as GpsStop,
          fromSheet: false,
          tier: "high" as MatchTier,
          ptoMin: pto.durationMin,
        };
      }

      if (noteId && handwrittenIndex.has(noteId)) {
        const hw = handwrittenIndex.get(noteId)?.[0];
        return {
          note,
          plate,
          kind,
          status: "ok" as AuditStatus,
          dwell: hw?.durationMin ?? null,
          label: "שויך דרך כתב יד",
          stop: undefined as GpsStop | undefined,
          fromSheet: false,
          tier: "review" as MatchTier,
          ptoMin: hw?.durationMin ?? null,
        };
      }

      return {
        note, plate, kind, ...result,
        fromSheet: false,
        tier: tierFromAudit(result.status, false),
        ptoMin: null as number | null,
      };
    });
  }, [notes, activeStops, sheetVisits, ptoByNoteId, handwrittenIndex]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return matched;
    return matched.filter((m) =>
      [m.note.id, m.note.customer, m.note.customerNo, m.note.siteAddress, m.note.driver, m.plate]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [matched, search]);

  const stats = useMemo(() => {
    const tiers = { verified: 0, high: 0, review: 0, unmatched: 0 };
    for (const m of matched) tiers[m.tier]++;
    return {
      notes: notes.length,
      ptoOpens: ptoSessions.filter((s) => s.openIso && s.orphan !== "missing_open").length,
      ptoOpenNow: ptoSessions.filter((s) => s.orphan === "missing_close").length,
      ...tiers,
    };
  }, [matched, notes, ptoSessions]);

  const anomalies: AnomaliesData = useMemo(() => {
    const longStays = matched
      .filter((m) => m.dwell != null && Number.isFinite(m.dwell) && (m.dwell as number) > STAY_ALERT_MIN)
      .map((m) => {
        const address = m.note.siteAddress || m.stop?.address || "—";
        const bm = buildBenchmark({ plate: m.plate, kind: m.kind, address, sites });
        const cmp = compareDwell(m.dwell as number, bm);
        return {
          noteId: m.note.id, customer: m.note.customer || "—", customerNo: m.note.customerNo,
          address, driver: m.note.driver || m.stop?.driver || "—", plate: m.plate || "—",
          dwell: m.dwell as number, band: dwellBand(m.dwell), tier: m.tier, ptoMin: m.ptoMin,
          kindLabel: bm.kindLabelHe, fleetRangeLabel: `${bm.fleetMin}–${bm.fleetMax}`,
          siteP80: bm.siteP80, verdict: cmp.verdict, verdictLabel: verdictLabelHe(cmp.verdict),
          summaryHe: cmp.summaryHe, overFleetMin: cmp.overFleetMin, overSiteP80Min: cmp.overSiteP80Min,
        };
      })
      .sort((a, b) => b.dwell - a.dwell);
    return {
      longStays,
      craneOpens: [...ptoSessions].filter((s) => s.openIso && s.orphan !== "missing_open")
        .sort((a, b) => new Date(b.openIso).getTime() - new Date(a.openIso).getTime()),
      openPto: ptoSessions.filter((s) => s.orphan === "missing_close"),
      unmatchedNotes: matched.filter((m) => m.tier === "unmatched" || m.status === "fail"),
      longStayCount: longStays.length,
      severeCount: longStays.filter((s) => s.verdict === "severe" || s.band === "severe").length,
      aboveFleetCount: longStays.filter((s) => (s.overFleetMin || 0) > 0).length,
      aboveSiteP80Count: longStays.filter((s) => (s.overSiteP80Min || 0) > 0).length,
    };
  }, [matched, ptoSessions, sites]);

  const filteredSites = useMemo(() => {
    const q = siteSearch.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter((s) =>
      [s.address, s.city, s.customerName, s.customerNo].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [sites, siteSearch]);

  const selectedSite =
    sites.find((s) => (s.siteKey || `${s.city}|${s.address}`) === selectedSiteKey) ||
    filteredSites[0] || sites[0];

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]!]);
      const stops = rowsToStops(rows);
      if (!stops.length) { toast.error("לא נמצאו עצירות"); return; }
      setUploadedStops(stops);
      toast.success(`נטענו ${stops.length} עצירות`);
    } catch { toast.error("שגיאה בקריאת הקובץ"); }
  };

  const refreshAll = () => {
    void notesQuery.refetch();
    void visitsQuery.refetch();
    void stopsQuery.refetch();
    void ptoQuery.refetch();
    void sitesQuery.refetch();
    void handwrittenQuery.refetch();
  };

  return (
    <>
      <PageHeader
        title="מודיעין איתוראן"
        subtitle="GPS · PTO · כתב יד · הצלבת תעודות — מקורות גיליון בלבד"
        action={
          <button type="button" onClick={refreshAll}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold hover:bg-muted">
            <RefreshCw className={cn("h-4 w-4", notesQuery.isFetching && "animate-spin")} />
            רענון
          </button>
        }
      />
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-8" dir="rtl">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "תעודות", value: stats.notes },
            { label: `שהיות >${STAY_ALERT_MIN}`, value: anomalies.longStayCount },
            { label: "חריגות חמורות", value: anomalies.severeCount },
            { label: "פתיחות PTO", value: stats.ptoOpens },
            { label: "PTO פתוח", value: stats.ptoOpenNow },
            { label: "לא משויך", value: stats.unmatched },
          ].map((k) => (
            <Card key={k.label} className="rounded-2xl border-border/70 p-4 shadow-sm">
              <div className="text-[11px] font-semibold text-muted-foreground">{k.label}</div>
              <div className="mt-1 font-display text-2xl font-extrabold">{k.value}</div>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 border-b border-border pb-2">
          {([
            ["overview", "סקירה"], ["anomalies", "חריגות"], ["match", "הצלבת תעודות"],
            ["pto", "PTO ומנוף"], ["sites", "אתרי לקוחות"], ["sources", "מקורות"],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={cn("rounded-xl px-3 py-2 text-xs font-bold transition",
                tab === id ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted")}>
              {label}
            </button>
          ))}
        </div>

        {tab === "anomalies" && (
          <IturanAnomaliesPanel anomalies={anomalies}
            onOpenSitesTab={(address) => { setTab("sites"); if (address) setSiteSearch(address); }} />
        )}

        {tab === "pto" && (
          <IturanPtoAuditPanel
            sessions={ptoSessions}
            notes={notes}
            sites={sites}
            handwrittenIndex={handwrittenIndex}
            handwrittenCount={handwrittenRows.length}
            handwrittenError={handwrittenQuery.isError ? String(handwrittenQuery.error) : ""}
          />
        )}

        {tab === "match" && (
          <Card className="space-y-3 rounded-2xl border-border p-4">
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש תעודה / לקוח / כתובת…"
              className="min-h-11 w-full max-w-md rounded-2xl border bg-background px-3 text-sm" />
            <div className="max-h-[32rem] space-y-2 overflow-y-auto">
              {filtered.slice(0, 80).map((m) => (
                <div key={m.note.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm">
                  <div>
                    <Link to="/notes/$id" params={{ id: String(m.note.id) }} className="font-bold hover:underline">ת.מ. {m.note.id}</Link>
                    <div className="text-xs text-muted-foreground">{m.note.customer || "—"} · {m.note.siteAddress || "—"}</div>
                  </div>
                  {tierBadge(m.tier)}
                </div>
              ))}
            </div>
          </Card>
        )}

        {tab === "sites" && selectedSite && (
          <div className="space-y-3">
            <input value={siteSearch} onChange={(e) => setSiteSearch(e.target.value)}
              placeholder="חיפוש אתר…" className="min-h-11 w-full max-w-md rounded-2xl border bg-background px-3 text-sm" />
            <IturanSiteCard site={selectedSite} />
          </div>
        )}

        {tab === "overview" && (
          <Card className="rounded-2xl border-border p-4 text-sm text-muted-foreground">
            מקור עצירות: {stopsSource} · כתב יד: {handwrittenRows.length} שורות
            {handwrittenQuery.isError ? " · שגיאת טעינה" : ""}
          </Card>
        )}

        {tab === "sources" && (
          <Card className="space-y-2 rounded-2xl border-border p-4 text-sm">
            <h3 className="font-display font-bold">מקורות נתונים</h3>
            <ul className="list-disc space-y-1 pe-5 text-muted-foreground">
              <li><strong className="text-foreground">תעודות</strong> — fetchLiveNotes</li>
              <li><strong className="text-foreground">PTO</strong> — listPtoFn</li>
              <li><strong className="text-foreground">כתב יד</strong> — listHandwrittenFn · {handwrittenRows.length} שורות</li>
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
