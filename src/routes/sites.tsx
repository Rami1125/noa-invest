/**
 * /sites — מפת אתרים חיה (GAS getSites + Notes + PTO)
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { getMapConfigFn } from "@/lib/map-config.functions";
import {
  getSitesLiveFn,
  type GasSite,
  type SiteNoteLink,
  type SitePtoSession,
} from "@/lib/sites-live.functions";
import {
  generateInteractiveMapHtml,
  isSiteDelayBottleneck,
  isSlowUnload,
  isValidMapCoord,
  buildUnloadAdvice,
  pinSeverityFromSite,
  type MapPinLayer,
} from "@/lib/sites-map-html";
import { cn } from "@/lib/utils";
import {
  Building2,
  ExternalLink,
  MapPin,
  Search,
  RefreshCw,
  AlertTriangle,
  Navigation,
  Warehouse,
  Clock,
} from "lucide-react";

export const Route = createFileRoute("/sites")({
  head: () => ({ meta: [{ title: "מודיעין אתרים ותכנון לסדרן — ח. סבן" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  component: SitesPage,
});

type Region = "all" | "sharon" | "center" | "north" | "south";

function getSiteRegion(city: string): Region {
  const c = String(city || "").trim();
  if (["הוד השרון", "כפר סבא", "רעננה", "הרצליה", "רמת השרון"].some((s) => c.includes(s))) return "sharon";
  if (["תל אביב", "רמת גן", "פתח תקווה", "בני ברק"].some((s) => c.includes(s))) return "center";
  if (["נתניה", "טייבה", "עמק חפר"].some((s) => c.includes(s))) return "north";
  if (["ראשון לציון", "חולון", "בת ים", "מודיעין"].some((s) => c.includes(s))) return "south";
  return "sharon";
}

function formatIsraelTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("he-IL", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

function matchSiteNotes(site: GasSite, notes: SiteNoteLink[]): SiteNoteLink[] {
  const no = site.customerNo.trim();
  const addr = site.address.trim().toLowerCase();
  return notes
    .filter((n) => {
      if (no && n.customerNo && n.customerNo === no) return true;
      if (addr && n.address && n.address.toLowerCase().includes(addr.slice(0, 12))) return true;
      return false;
    })
    .slice(0, 12);
}

function matchSitePto(site: GasSite, sessions: SitePtoSession[]): SitePtoSession[] {
  const addr = site.address.trim().toLowerCase();
  const no = site.customerNo.trim();
  return sessions
    .filter((s) => {
      if (addr && s.address && s.address.toLowerCase().includes(addr.slice(0, 10))) return true;
      if (no && s.matchedNoteId && s.matchedNoteId.includes(no)) return true;
      return false;
    })
    .slice(0, 12);
}

function PtoStatusButtons({ session }: { session?: SitePtoSession | null }) {
  if (!session) {
    return (
      <div className="flex gap-1.5">
        <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-slate-500">פתיחה</span>
        <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-slate-500">סגירה</span>
      </div>
    );
  }
  const openActive = session.orphan === "missing_close" || (!session.closeIso && Boolean(session.openIso));
  const closed = Boolean(session.closeIso) && session.orphan !== "missing_close";
  const dur = session.durationMin;
  const closeTone =
    dur == null
      ? "bg-emerald-700/80 text-white"
      : dur > 40
        ? "bg-red-600 text-white"
        : dur > 20
          ? "bg-amber-600 text-white"
          : "bg-emerald-600 text-white";
  return (
    <div className="flex flex-wrap gap-1.5">
      <span
        className={cn(
          "rounded-lg px-2 py-1 text-[10px] font-bold",
          openActive
            ? "animate-pulse bg-sky-500 text-white shadow"
            : closed
              ? "bg-slate-700/80 text-slate-300"
              : "border border-white/10 bg-white/5 text-slate-500",
        )}
        title={session.openIso || ""}
      >
        פתיחה {formatIsraelTime(session.openIso)}
      </span>
      <span
        className={cn(
          "rounded-lg px-2 py-1 text-[10px] font-bold",
          closed ? closeTone : "border border-white/10 bg-white/5 text-slate-500",
        )}
        title={session.closeIso || ""}
      >
        סגירה {closed ? `${formatIsraelTime(session.closeIso)}${dur != null ? ` · ${dur}ד׳` : ""}` : ""}
      </span>
    </div>
  );
}

function SitesPage() {
  const { q: qFromUrl } = Route.useSearch();
  const [search, setSearch] = useState(qFromUrl || "");
  useEffect(() => {
    if (qFromUrl) setSearch(qFromUrl);
  }, [qFromUrl]);
  const [selectedKey, setSelectedKey] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<Region>("all");
  const [delayOnlyFilter, setDelayOnlyFilter] = useState(false);
  const [pinLayer, setPinLayer] = useState<MapPinLayer>("all");
  const [mapFitToken, setMapFitToken] = useState(0);

  const q = useQuery({
    queryKey: ["sites-live"],
    queryFn: () => getSitesLiveFn(),
    staleTime: 5_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const mapCfg = useQuery({
    queryKey: ["map-config"],
    queryFn: () => getMapConfigFn(),
    staleTime: 300_000,
  });
  const cartoKey = mapCfg.data?.cartoKey || "";
  const data = q.data;

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "site-pin-click" && typeof d.key === "string") {
        setSelectedKey(d.key);
        setDrawerOpen(true);
      }
      if (d.type === "warehouse-click") setDrawerOpen(false);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const filteredList = useMemo(() => {
    if (!data?.sites) return [] as GasSite[];
    let list = data.sites;
    if (delayOnlyFilter) list = list.filter(isSiteDelayBottleneck);
    if (selectedRegion !== "all") list = list.filter((s) => getSiteRegion(s.city) === selectedRegion);
    if (pinLayer === "slow") list = list.filter(isSlowUnload);
    if (pinLayer === "normal") list = list.filter((s) => !isSlowUnload(s));
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter((site) =>
        [site.address, site.city, site.customer, site.customerNo]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(term)),
      );
    }
    return list;
  }, [data, delayOnlyFilter, selectedRegion, search, pinLayer]);

  const selectedSite = useMemo(() => {
    if (!selectedKey) return null;
    return (
      filteredList.find((s) => s.siteKey === selectedKey) ||
      data?.sites?.find((s) => s.siteKey === selectedKey) ||
      null
    );
  }, [filteredList, selectedKey, data]);

  const mappedCount = filteredList.filter((s) => s.hasCoords && isValidMapCoord(s.lat, s.lng)).length;
  const slowCount = useMemo(() => filteredList.filter(isSlowUnload).length, [filteredList]);
  const redCount = useMemo(() => filteredList.filter(isSiteDelayBottleneck).length, [filteredList]);

  const selectedNotes = useMemo(
    () => (selectedSite && data ? matchSiteNotes(selectedSite, data.notes) : []),
    [selectedSite, data],
  );
  const selectedPto = useMemo(
    () => (selectedSite && data ? matchSitePto(selectedSite, data.ptoSessions) : []),
    [selectedSite, data],
  );

  const hikmatProgress = useMemo(() => {
    if (!data?.hikmatRound) return null;
    const h = data.hikmatRound;
    const parts: string[] = [];
    if (h.openStop) {
      parts.push(h.matchedSiteAddress || h.openStop.address || "תחנה פתוחה");
      if ((h.remainingUnloadMin ?? 0) > 0) parts.push(`יתרת פריקה ~${h.remainingUnloadMin}ד׳`);
    }
    if ((h.driveBackMin ?? 0) > 0) {
      parts.push(`נסיעה חזרה ~${h.driveBackMin}ד׳ → ${h.warehouseName || h.warehouseId}`);
    }
    if ((h.bufferMin ?? 0) > 0) parts.push(`באפר ${h.bufferMin}ד׳`);
    return {
      active: h.active || h.totalStopsToday > 0,
      completedStops: h.completedStops,
      totalStopsToday: h.totalStopsToday,
      progressPct: h.progressPct,
      openLabel: parts.join(" · ") || h.openStop?.driver || "",
      etaBackHe: h.etaBackHe || (h.etaBackIso ? formatIsraelTime(h.etaBackIso) : ""),
    };
  }, [data]);

  // אל תכלול selectedKey ב-deps — רענון iframe בלחיצה "בורח" ומאבד זום/מיקום
  const mapHtml = useMemo(() => {
    return generateInteractiveMapHtml(
      filteredList.map((s) => ({
        siteKey: s.siteKey,
        customer: s.customer,
        customerNo: s.customerNo,
        address: s.address,
        city: s.city,
        lat: s.lat,
        lng: s.lng,
        hasCoords: s.hasCoords,
        avgStopMin: s.avgStopMin,
        maxStopMin: s.maxStopMin,
        over20: s.over20,
        severity: s.severity,
        driveHarashMin: s.driveHarashMin,
        driveTalmidMin: s.driveTalmidMin,
        totalMissionHarashMin: s.totalMissionHarashMin,
        totalMissionTalmidMin: s.totalMissionTalmidMin,
        visits: s.visits,
      })),
      undefined,
      cartoKey,
      pinLayer,
      (data?.warehouses || []).map((w) => ({
        id: w.id,
        key: w.key,
        name: w.name,
        address: w.address,
        lat: w.lat,
        lng: w.lng,
        short: w.short,
        loadDelayPct: data?.warehouseLoadDelay?.[w.id as "harash_10" | "hatalmid_6"],
      })),
      hikmatProgress,
      data?.warehouseLoadDelay as Record<string, number> | undefined,
    );
  }, [filteredList, cartoKey, pinLayer, data?.warehouses, data?.warehouseLoadDelay, hikmatProgress, mapFitToken]);

  const advice = selectedSite ? buildUnloadAdvice(selectedSite) : null;

  const wazeUrl =
    selectedSite && isValidMapCoord(selectedSite.lat, selectedSite.lng)
      ? `https://waze.com/ul?ll=${selectedSite.lat},${selectedSite.lng}&navigate=yes`
      : selectedSite
        ? `https://waze.com/ul?q=${encodeURIComponent(`${selectedSite.address} ${selectedSite.city}`)}`
        : "#";

  return (
    <>
      <PageHeader
        title="מודיעין אתרים · תכנון לסדרן"
        subtitle={
          data
            ? `${data.sites.length} אתרים · ${mappedCount} סיכות · ${slowCount} מעכבים · ${redCount} קריטיים · ${q.isFetching ? "מסנכרן…" : "חי 30ש׳"}`
            : "טוען מ-GAS…"
        }
        action={
          <button
            type="button"
            onClick={() => void q.refetch()}
            disabled={q.isFetching}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} />
            רענון
          </button>
        }
      />

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5 md:px-8" dir="rtl">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "אתרים", value: data?.sites.length ?? "—", icon: MapPin },
            { label: "על המפה", value: mappedCount, icon: Building2 },
            { label: "מעל 20 דק׳", value: slowCount, icon: AlertTriangle },
            {
              label: "סבב חכמת",
              value: data ? `${data.hikmatRound.completedStops}/${data.hikmatRound.totalStopsToday}` : "—",
              icon: Clock,
            },
          ].map((m) => (
            <div key={m.label} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                <m.icon className="h-3.5 w-3.5" />
                {m.label}
              </div>
              <div className="mt-1 font-display text-xl font-extrabold tabular-nums">{m.value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לקוח / כתובת / מספר…"
              className="h-10 w-full rounded-xl border bg-background pr-9 pl-3 text-sm"
            />
          </div>
          {(
            [
              ["all", "כל האזורים"],
              ["sharon", "שרון"],
              ["center", "מרכז"],
              ["north", "צפון"],
              ["south", "דרום"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSelectedRegion(id)}
              className={cn(
                "h-10 rounded-xl border px-3 text-xs font-bold",
                selectedRegion === id ? "border-emerald-500 bg-emerald-500/10 text-emerald-700" : "hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDelayOnlyFilter((v) => !v)}
            className={cn(
              "h-10 rounded-xl border px-3 text-xs font-bold",
              delayOnlyFilter ? "border-red-500 bg-red-500/10 text-red-700" : "hover:bg-muted",
            )}
          >
            צווארי בקבוק
          </button>
          <button
            type="button"
            onClick={() => setMapFitToken((n) => n + 1)}
            className="h-10 rounded-xl border px-3 text-xs font-bold hover:bg-muted"
          >
            התאם מפה
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="relative h-[min(62vh,560px)] w-full bg-slate-950">
            {q.isError ? (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-300">
                {q.error instanceof Error ? q.error.message : "שגיאה בטעינת אתרים"}
              </div>
            ) : (
              <iframe
                key={`map-${pinLayer}-${mapFitToken}-${mappedCount}`}
                title="מפת אתרים"
                className="h-full w-full border-0"
                srcDoc={mapHtml}
                sandbox="allow-scripts allow-same-origin allow-popups"
              />
            )}
            <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-slate-950/85 px-2.5 py-1 text-[10px] font-bold text-emerald-300">
              <span className={cn("h-2 w-2 rounded-full bg-emerald-400", q.isFetching ? "animate-pulse" : "")} />
              {q.isFetching ? "מסנכרן…" : "חי"}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="border-b px-4 py-3 text-sm font-extrabold">אתרים ({filteredList.length})</div>
          <div className="max-h-[28rem] divide-y overflow-y-auto">
            {filteredList.map((site) => {
              const sev = pinSeverityFromSite(site);
              const sessions = data ? matchSitePto(site, data.ptoSessions) : [];
              const live = sessions.find((s) => s.orphan === "missing_close") || sessions[0];
              return (
                <button
                  key={site.siteKey}
                  type="button"
                  onClick={() => {
                    setSelectedKey(site.siteKey);
                    setDrawerOpen(true);
                  }}
                  className={cn(
                    "flex w-full flex-col gap-2 px-4 py-3 text-right transition hover:bg-muted/60",
                    selectedKey === site.siteKey && "bg-emerald-500/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold">
                        {site.customer || "לקוח"}{" "}
                        {site.customerNo ? <span className="text-emerald-600">#{site.customerNo}</span> : null}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {site.address}
                        {site.city ? ` · ${site.city}` : ""}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold text-white",
                        sev === "red" ? "bg-red-600" : sev === "orange" ? "bg-amber-600" : "bg-emerald-600",
                      )}
                    >
                      {sev === "red" ? "קריטי" : sev === "orange" ? "מעכב" : "תקין"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] text-muted-foreground">
                      ביקורים {site.visits} · ממוצע {site.avgStopMin ?? "—"}ד׳ · שיא {site.maxStopMin ?? "—"}ד׳
                    </div>
                    <PtoStatusButtons session={live} />
                  </div>
                </button>
              );
            })}
            {!filteredList.length && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">אין אתרים להצגה</div>
            )}
          </div>
        </div>

        {drawerOpen && selectedSite && (
          <section className="overflow-hidden rounded-2xl border bg-card shadow-lg">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold tracking-tight">
                  {selectedSite.customer || "אתר"}{" "}
                  {selectedSite.customerNo ? <span className="text-emerald-600">#{selectedSite.customerNo}</span> : null}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {selectedSite.address}
                  {selectedSite.city ? ` · ${selectedSite.city}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={wazeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-sky-600 px-3 text-xs font-bold text-white"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  Waze
                </a>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="min-h-10 rounded-xl border px-3 text-xs font-bold hover:bg-muted"
                >
                  סגור
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
              {[
                {
                  label: "נסיעה מהחרש 10",
                  value:
                    selectedSite.driveHarashMin != null
                      ? `${Math.round(selectedSite.driveHarashMin)} דק׳`
                      : advice?.driveMin != null
                        ? `${advice.driveMin} דק׳`
                        : "—",
                  icon: Warehouse,
                },
                {
                  label: "נסיעה מהתלמיד 6",
                  value:
                    selectedSite.driveTalmidMin != null ? `${Math.round(selectedSite.driveTalmidMin)} דק׳` : "—",
                  icon: Warehouse,
                },
                {
                  label: "ממוצע פריקה",
                  value: selectedSite.avgStopMin != null ? `${Math.round(selectedSite.avgStopMin)} דק׳` : "—",
                  icon: Clock,
                },
                {
                  label: "שיא שהייה",
                  value: selectedSite.maxStopMin != null ? `${Math.round(selectedSite.maxStopMin)} דק׳` : "—",
                  icon: AlertTriangle,
                },
              ].map((k) => (
                <div key={k.label} className="rounded-xl border bg-muted/30 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                    <k.icon className="h-3.5 w-3.5" />
                    {k.label}
                  </div>
                  <div className="mt-1 text-base font-extrabold tabular-nums">{k.value}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 border-t p-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-extrabold">תעודות משלוח</h3>
                <div className="overflow-hidden rounded-xl border">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-muted/50 text-[10px] text-muted-foreground">
                      <tr>
                        <th className="px-2 py-2 font-bold">תאריך</th>
                        <th className="px-2 py-2 font-bold">תעודה</th>
                        <th className="px-2 py-2 font-bold">נהג</th>
                        <th className="px-2 py-2 font-bold">GPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedNotes.map((n) => (
                        <tr key={n.id} className="border-t">
                          <td className="px-2 py-2">{n.date || "—"}</td>
                          <td className="px-2 py-2">
                            {n.driveUrl ? (
                              <a
                                href={n.driveUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 font-bold text-emerald-700"
                              >
                                {n.id} <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <Link to="/notes/$id" params={{ id: n.id }} className="font-bold text-emerald-700">
                                {n.id}
                              </Link>
                            )}
                          </td>
                          <td className="px-2 py-2">{n.driver || "—"}</td>
                          <td className="px-2 py-2">{n.hasGpsMatch ? "✓" : "—"}</td>
                        </tr>
                      ))}
                      {!selectedNotes.length && (
                        <tr>
                          <td colSpan={4} className="px-2 py-4 text-center text-muted-foreground">
                            אין תעודות מוצלבות בטווח
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-extrabold">סשני PTO</h3>
                <div className="space-y-2">
                  {selectedPto.map((s) => (
                    <div key={s.id} className="rounded-xl border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-bold">
                          {s.truck || "משאית"} · {s.driver || "נהג"}
                        </div>
                        <PtoStatusButtons session={s} />
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{s.address || "כתובת לא ידועה"}</div>
                      {s.matchedNoteId && (
                        <div className="mt-1 text-[11px]">
                          תעודה משויכת:{" "}
                          <Link to="/notes/$id" params={{ id: s.matchedNoteId }} className="font-bold text-emerald-700">
                            {s.matchedNoteId}
                          </Link>
                        </div>
                      )}
                    </div>
                  ))}
                  {!selectedPto.length && (
                    <div className="rounded-xl border px-3 py-4 text-center text-xs text-muted-foreground">
                      אין סשני PTO מוצלבים
                    </div>
                  )}
                </div>
              </div>
            </div>

            {advice && (
              <div className="border-t px-4 py-3 text-xs text-muted-foreground">
                סה״כ משימה (נסיעה+פריקה): <b className="text-foreground">{advice.totalMissionMin ?? "—"} דק׳</b>
                {" · "}
                רמת אתר: <b className="text-foreground">{advice.levelHe}</b>
                {" · "}
                {advice.aiRecommendHe}
              </div>
            )}
          </section>
        )}
      </main>
    </>
  );
}
