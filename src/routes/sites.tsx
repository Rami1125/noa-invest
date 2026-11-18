/**
 * /sites — מפת אתרים חיה (GAS getSites + Notes + PTO) עם Leaflet ישיר בדף
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
    site: typeof s.site === "string" ? s.site : undefined,
  }),
  component: SitesPage,
});

type Region = "all" | "sharon" | "center" | "north" | "south";

const DEFAULT_WAREHOUSES = [
  { id: "harash_10", name: "מחסן החרש 10", address: "החרש 10, הוד השרון", lat: 32.1508, lng: 34.8926 },
  { id: "hatalmid_6", name: "מחסן התלמיד 6", address: "התלמיד 6, הוד השרון", lat: 32.1544, lng: 34.8886 },
];

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
        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-400">פתיחה</span>
        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-400">סגירה</span>
      </div>
    );
  }
  const openActive = session.orphan === "missing_close" || (!session.closeIso && Boolean(session.openIso));
  const closed = Boolean(session.closeIso) && session.orphan !== "missing_close";
  const dur = session.durationMin;
  const closeTone =
    dur == null
      ? "bg-emerald-700 text-white"
      : dur > 40
        ? "bg-rose-600 text-white"
        : dur > 20
          ? "bg-amber-500 text-white"
          : "bg-emerald-600 text-white";
  return (
    <div className="flex flex-wrap gap-1.5">
      <span
        className={cn(
          "rounded-lg px-2 py-1 text-[10px] font-bold",
          openActive
            ? "animate-pulse bg-sky-500 text-white shadow"
            : closed
              ? "bg-slate-200 text-slate-700"
              : "border border-slate-200 bg-slate-50 text-slate-400",
        )}
        title={session.openIso || ""}
      >
        פתיחה {formatIsraelTime(session.openIso)}
      </span>
      <span
        className={cn(
          "rounded-lg px-2 py-1 text-[10px] font-bold",
          closed ? closeTone : "border border-slate-200 bg-slate-50 text-slate-400",
        )}
        title={session.closeIso || ""}
      >
        סגירה {closed ? `${formatIsraelTime(session.closeIso)} · ${dur ?? "—"}ד׳` : ""}
      </span>
    </div>
  );
}

function ensureLeafletLoaded(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.L) return resolve(w.L);

    if (!document.getElementById("leaflet-cdn-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-cdn-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const existing = document.getElementById("leaflet-cdn-js") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).L));
      return;
    }

    const script = document.createElement("script");
    script.id = "leaflet-cdn-js";
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => resolve((window as any).L);
    script.onerror = () => reject(new Error("כשל בטעינת ספריית Leaflet"));
    document.body.appendChild(script);
  });
}

function SitesPage() {
  const { q: qFromUrl, site: siteFromUrl } = Route.useSearch();
  const [search, setSearch] = useState(qFromUrl || "");
  useEffect(() => {
    if (qFromUrl) setSearch(qFromUrl);
  }, [qFromUrl]);

  const [selectedKey, setSelectedKey] = useState(siteFromUrl || "");
  const [drawerOpen, setDrawerOpen] = useState(Boolean(siteFromUrl));
  const [selectedRegion, setSelectedRegion] = useState<Region>("all");
  const [delayOnlyFilter, setDelayOnlyFilter] = useState(false);
  const [pinLayer, setPinLayer] = useState<MapPinLayer>("all");
  const [mapFitToken, setMapFitToken] = useState(0);
  const [leafletReady, setLeafletReady] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);

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

  const cartoKey =
    mapCfg.data?.cartoKey ||
    (typeof import.meta !== "undefined" ? (import.meta as any).env?.VITE_CARTO_API_KEY : "") ||
    "";
  const data = q.data;

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

  const mappedSites = useMemo(
    () =>
      filteredList.filter((s) => {
        const lat = Number(s.lat);
        const lng = Number(s.lng);
        return isValidMapCoord(lat, lng);
      }),
    [filteredList],
  );

  const mappedCount = mappedSites.length;
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

  // אתחול מפת Leaflet פעם אחת — עם Fallback אוטומטי ל-OpenStreetMap החינמי ללא תלות ב-API Key
  useEffect(() => {
    let cancelled = false;
    ensureLeafletLoaded()
      .then((L) => {
        if (cancelled || !mapContainerRef.current || mapInstanceRef.current) return;
        const map = L.map(mapContainerRef.current, { zoomControl: true }).setView([32.14, 34.88], 11);

        const tileUrl = cartoKey
          ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?api_key=${encodeURIComponent(cartoKey)}`
          : "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

        const tileLayer = L.tileLayer(tileUrl, {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        });

        // אם Carto נכשל מכל סיבה — עבור מיד ל-OSM רגיל
        tileLayer.on("tileerror", () => {
          if (tileLayer._url !== "https://tile.openstreetmap.org/{z}/{x}/{y}.png") {
            tileLayer.setUrl("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
          }
        });

        tileLayer.addTo(map);
        markersLayerRef.current = L.layerGroup().addTo(map);
        mapInstanceRef.current = map;
        setLeafletReady(true);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [cartoKey]);

  // ציור סיכות אתרים + מחסנים בכל עדכון סינון
  useEffect(() => {
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    if (!leafletReady || !L || !map || !layer) return;

    layer.clearLayers();
    const boundsPts: [number, number][] = [];

    // סיכות מחסנים קבועות (החרש 10 + התלמיד 6)
    const warehouses = (data?.warehouses?.length ? data.warehouses : DEFAULT_WAREHOUSES) as any[];
    warehouses.forEach((w) => {
      const lat = Number(w.lat);
      const lng = Number(w.lng);
      if (!isValidMapCoord(lat, lng)) return;
      boundsPts.push([lat, lng]);
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:#102A43;color:#fff;border:2px solid #20A4C8;border-radius:10px;padding:3px 7px;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.25)">🏭 ${w.short || w.name}</div>`,
        iconSize: [100, 26],
        iconAnchor: [50, 13],
      });
      L.marker([lat, lng], { icon })
        .bindPopup(`<div dir="rtl" style="font-family:Heebo,sans-serif"><b>${w.name}</b><br/>${w.address || ""}</div>`)
        .addTo(layer);
    });

    // סיכות אתרי לקוחות
    mappedSites.forEach((site) => {
      const lat = Number(site.lat);
      const lng = Number(site.lng);
      boundsPts.push([lat, lng]);
      const sev = pinSeverityFromSite(site);
      const isSelected = site.siteKey === selectedKey;
      const color = sev === "red" ? "#E11D48" : sev === "orange" ? "#F59E0B" : "#1769AA";

      const marker = L.circleMarker([lat, lng], {
        radius: isSelected ? 11 : 7,
        fillColor: color,
        color: isSelected ? "#102A43" : "#FFFFFF",
        weight: isSelected ? 3 : 2,
        opacity: 1,
        fillOpacity: 0.92,
      });

      marker.bindPopup(
        `<div dir="rtl" style="font-family:Heebo,sans-serif;min-width:170px">
          <div style="font-weight:800;color:#102A43">${site.customer || "אתר"}</div>
          <div style="font-size:12px;color:#475569">${site.address}${site.city ? ", " + site.city : ""}</div>
          <div style="font-size:11px;margin-top:4px">ביקורים: <b>${site.visits}</b> · שיא: <b>${site.maxStopMin ?? "—"} דק׳</b></div>
        </div>`,
      );

      marker.on("click", () => {
        setSelectedKey(site.siteKey);
        setDrawerOpen(true);
        const rowEl = document.getElementById(`site-row-${site.siteKey}`);
        if (rowEl) rowEl.scrollIntoView({ behavior: "smooth", block: "center" });
      });

      marker.addTo(layer);
    });

    if (boundsPts.length > 0 && !selectedKey) {
      map.fitBounds(boundsPts, { padding: [35, 35], maxZoom: 13 });
    }
  }, [leafletReady, mappedSites, selectedKey, data, mapFitToken]);

  // מיקוד אוטומטי בבחירת אתר מהרשימה
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!leafletReady || !map || !selectedSite) return;
    const lat = Number(selectedSite.lat);
    const lng = Number(selectedSite.lng);
    if (isValidMapCoord(lat, lng)) {
      map.flyTo([lat, lng], 14, { duration: 0.6 });
    }
  }, [leafletReady, selectedSite]);

  const advice = selectedSite ? buildUnloadAdvice(selectedSite) : null;
  const wazeUrl =
    selectedSite && isValidMapCoord(Number(selectedSite.lat), Number(selectedSite.lng))
      ? `https://waze.com/ul?ll=${selectedSite.lat},${selectedSite.lng}&navigate=yes`
      : selectedSite
        ? `https://waze.com/ul?q=${encodeURIComponent(`${selectedSite.address} ${selectedSite.city}`)}&navigate=yes`
        : "#";

  return (
    <div className="min-h-screen bg-[#F3F7FB] text-[#172B4D]">
      <PageHeader
        title="מודיעין אתרים · תכנון לסדרן"
        subtitle={
          data
            ? `${data.sites.length} אתרים · ${mappedCount} סיכות GPS · ${slowCount} מעכבים · ${redCount} קריטיים · ${q.isFetching ? "מסנכרן…" : "חי 30ש׳"}`
            : "טוען מ-GAS…"
        }
        action={
          <button
            type="button"
            onClick={() => void q.refetch()}
            disabled={q.isFetching}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#DCE6EF] bg-white px-3 text-xs font-bold text-[#102A43] hover:bg-sky-50 disabled:opacity-60"
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
            { label: "עם GPS על המפה", value: `${mappedCount}/${filteredList.length}`, icon: Building2 },
            { label: "מעל 20 דק׳", value: slowCount, icon: AlertTriangle },
            {
              label: "סבב חכמת",
              value: data ? `${data.hikmatRound.completedStops}/${data.hikmatRound.totalStopsToday}` : "—",
              icon: Clock,
            },
          ].map((m) => (
            <div key={m.label} className="rounded-2xl border border-[#DCE6EF] bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                <m.icon className="h-3.5 w-3.5 text-[#1769AA]" />
                {m.label}
              </div>
              <div className="mt-1 text-xl font-black text-[#102A43] tabular-nums">{m.value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לקוח / כתובת / מספר…"
              className="h-10 w-full rounded-xl border border-[#DCE6EF] bg-white pr-9 pl-3 text-sm text-[#172B4D]"
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
                "h-10 rounded-xl border px-3 text-xs font-bold transition",
                selectedRegion === id
                  ? "border-[#1769AA] bg-[#E5F2FB] text-[#075985]"
                  : "border-[#DCE6EF] bg-white text-slate-600 hover:bg-sky-50",
              )}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDelayOnlyFilter((v) => !v)}
            className={cn(
              "h-10 rounded-xl border px-3 text-xs font-bold transition",
              delayOnlyFilter
                ? "border-rose-500 bg-rose-50 text-rose-700"
                : "border-[#DCE6EF] bg-white text-slate-600 hover:bg-rose-50",
            )}
          >
            צווארי בקבוק
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedKey("");
              setMapFitToken((n) => n + 1);
            }}
            className="h-10 rounded-xl border border-[#DCE6EF] bg-white px-3 text-xs font-bold text-[#102A43] hover:bg-sky-50"
          >
            התאם מפה
          </button>
        </div>

        {/* Desktop 40% List | 60% Map */}
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="overflow-hidden rounded-2xl border border-[#DCE6EF] bg-white shadow-sm lg:order-2 lg:col-span-3">
            <div className="relative h-[520px] w-full bg-slate-100">
              {q.isError ? (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-rose-600">
                  {q.error instanceof Error ? q.error.message : "שגיאה בטעינת אתרים"}
                </div>
              ) : (
                <div ref={mapContainerRef} className="min-h-[520px] h-full w-full z-0" />
              )}
              <div className="pointer-events-none absolute left-3 top-3 z-[400] inline-flex items-center gap-2 rounded-full bg-[#102A43]/90 px-3 py-1 text-[10px] font-bold text-sky-200 shadow">
                <span className={cn("h-2 w-2 rounded-full bg-emerald-400", q.isFetching && "animate-pulse")} />
                {q.isFetching ? "מסנכרן…" : `${mappedCount} סיכות חיות`}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#DCE6EF] bg-white shadow-sm lg:order-1 lg:col-span-2">
            <div className="border-b border-[#DCE6EF] bg-[#F2F6FA] px-4 py-3 text-sm font-extrabold text-[#102A43]">
              אתרים ({filteredList.length})
            </div>
            <div className="max-h-[472px] divide-y divide-slate-100 overflow-y-auto">
              {filteredList.map((site) => {
                const sev = pinSeverityFromSite(site);
                const sessions = data ? matchSitePto(site, data.ptoSessions) : [];
                const live = sessions.find((s) => s.orphan === "missing_close") || sessions[0];
                const hasGps = isValidMapCoord(Number(site.lat), Number(site.lng));
                return (
                  <button
                    id={`site-row-${site.siteKey}`}
                    key={site.siteKey}
                    type="button"
                    onClick={() => {
                      setSelectedKey(site.siteKey);
                      setDrawerOpen(true);
                    }}
                    className={cn(
                      "flex w-full flex-col gap-2 px-4 py-3 text-right transition hover:bg-[#F3F9FD]",
                      selectedKey === site.siteKey && "bg-[#E5F2FB]/70",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-extrabold text-[#102A43]">
                          {site.customer || "לקוח"}{" "}
                          {site.customerNo ? <span className="text-[#1769AA]">#{site.customerNo}</span> : null}
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {site.address}
                          {site.city ? ` · ${site.city}` : ""}
                          {!hasGps ? " · (חסר GPS)" : ""}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold text-white",
                          sev === "red" ? "bg-rose-600" : sev === "orange" ? "bg-amber-500" : "bg-emerald-600",
                        )}
                      >
                        {sev === "red" ? "קריטי" : sev === "orange" ? "מעכב" : "תקין"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-500">
                        ביקורים {site.visits} · ממוצע {site.avgStopMin ?? "—"}ד׳ · שיא {site.maxStopMin ?? "—"}ד׳
                      </div>
                      <PtoStatusButtons session={live} />
                    </div>
                  </button>
                );
              })}
              {!filteredList.length && (
                <div className="px-4 py-8 text-center text-sm text-slate-400">אין אתרים להצגה</div>
              )}
            </div>
          </div>
        </div>

        {drawerOpen && selectedSite && (
          <section className="overflow-hidden rounded-2xl border border-[#DCE6EF] bg-white shadow-lg">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#DCE6EF] px-4 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold tracking-tight text-[#102A43]">
                  {selectedSite.customer || "אתר"}{" "}
                  {selectedSite.customerNo ? <span className="text-[#1769AA]">#{selectedSite.customerNo}</span> : null}
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  {selectedSite.address}
                  {selectedSite.city ? ` · ${selectedSite.city}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={wazeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#1769AA] px-3 text-xs font-bold text-white hover:bg-[#102A43]"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  Waze
                </a>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="min-h-10 rounded-xl border border-[#DCE6EF] px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
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
                <div key={k.label} className="rounded-xl border border-[#DCE6EF] bg-[#F3F7FB] p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                    <k.icon className="h-3.5 w-3.5 text-[#1769AA]" />
                    {k.label}
                  </div>
                  <div className="mt-1 text-base font-extrabold text-[#102A43] tabular-nums">{k.value}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 border-t border-[#DCE6EF] p-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-extrabold text-[#102A43]">תעודות משלוח</h3>
                <div className="overflow-hidden rounded-xl border border-[#DCE6EF]">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-[#F2F6FA] text-[10px] text-[#52677D]">
                      <tr>
                        <th className="px-2 py-2 font-bold">תאריך</th>
                        <th className="px-2 py-2 font-bold">תעודה</th>
                        <th className="px-2 py-2 font-bold">נהג</th>
                        <th className="px-2 py-2 font-bold">GPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedNotes.map((n) => (
                        <tr key={n.id} className="border-t border-slate-100">
                          <td className="px-2 py-2">{n.date || "—"}</td>
                          <td className="px-2 py-2">
                            {n.driveUrl ? (
                              <a
                                href={n.driveUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 font-bold text-[#1769AA]"
                              >
                                {n.id} <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <Link to="/notes/$id" params={{ id: n.id }} className="font-bold text-[#1769AA]">
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
                          <td colSpan={4} className="px-2 py-4 text-center text-slate-400">
                            אין תעודות מוצלבות בטווח
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-extrabold text-[#102A43]">סשני PTO</h3>
                <div className="space-y-2">
                  {selectedPto.map((s) => (
                    <div key={s.id} className="rounded-xl border border-[#DCE6EF] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-bold text-[#102A43]">
                          {s.truck || "משאית"} · {s.driver || "נהג"}
                        </div>
                        <PtoStatusButtons session={s} />
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">{s.address || "כתובת לא ידועה"}</div>
                      {s.matchedNoteId && (
                        <div className="mt-1 text-[11px]">
                          תעודה משויכת:{" "}
                          <Link to="/notes/$id" params={{ id: s.matchedNoteId }} className="font-bold text-[#1769AA]">
                            {s.matchedNoteId}
                          </Link>
                        </div>
                      )}
                    </div>
                  ))}
                  {!selectedPto.length && (
                    <div className="rounded-xl border border-[#DCE6EF] px-3 py-4 text-center text-xs text-slate-400">
                      אין סשני PTO מוצלבים
                    </div>
                  )}
                </div>
              </div>
            </div>

            {advice && (
              <div className="border-t border-[#DCE6EF] bg-[#F3F7FB] px-4 py-3 text-xs text-slate-600">
                סה״כ משימה (נסיעה+פריקה): <b className="text-[#102A43]">{advice.totalMissionMin ?? "—"} דק׳</b>
                {" · "}
                רמת אתר: <b className="text-[#102A43]">{advice.levelHe}</b>
                {" · "}
                {advice.aiRecommendHe}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
