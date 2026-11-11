import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { getSiteAtlasFn, type AtlasSite } from "@/lib/customer-history.functions";
import { fmtShort } from "@/lib/he-date";
import { cn } from "@/lib/utils";
import {
  Building2,
  CalendarDays,
  ExternalLink,
  FileText,
  MapPin,
  Package,
  Search,
  Timer,
  Truck,
  Users,
  RefreshCw,
  Compass,
  Layers,
  X,
  Filter,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/sites")({
  head: () => ({ meta: [{ title: "אתרי אספקה והיסטוריית ביקורים — ח. סבן" }] }),
  component: SitesPage,
});

type Region = "all" | "sharon" | "center" | "north" | "south";

const REGION_LABELS: Record<Region, string> = {
  all: "כל האזורים",
  sharon: "השרון",
  center: "מרכז / דן",
  north: "צפון",
  south: "דרום / שפלה",
};

function getSiteRegion(city: string): Region {
  const c = String(city || "").trim();
  const sharonCities = [
    "הוד השרון", "כפר סבא", "רעננה", "הרצליה", "רמת השרון",
    "אבן יהודה", "קדימה", "גני עם", "רמות השבים", "עין ורד",
    "בית ברל", "הדר עם", "נוה ירק", "אלישמע", "כפר שמריהו", "צופים",
  ];
  const centerCities = ["תל אביב", "רמת גן", "סביון", "בני ברק", "ראש העין", "פתח תקווה", "גבעתיים"];
  const northCities = ["אביחיל", "גנות הדר", "טייבה", "קרני שומרון", "נתניה", "עמק חפר"];
  const southCities = ["שוהם", "מודיעין", "ראשון לציון", "חולון", "בת ים", "ירושלים"];

  if (sharonCities.some((s) => c.includes(s))) return "sharon";
  if (centerCities.some((s) => c.includes(s))) return "center";
  if (northCities.some((s) => c.includes(s))) return "north";
  if (southCities.some((s) => c.includes(s))) return "south";
  return "sharon";
}

/**
 * יצירת קוד HTML עצמאי להצגת מפת Leaflet אינטראקטיבית עם סיכות מרובות ופופאפים
 */
function generateInteractiveMapHtml(sites: AtlasSite[], selectedKey?: string): string {
  const validSites = sites.filter((s) => s.latitude != null && s.longitude != null);
  const sitesJson = JSON.stringify(
    validSites.map((s) => ({
      key: s.siteKey || `${s.city}|${s.address}`,
      lat: s.latitude,
      lon: s.longitude,
      customerName: s.customerName || "אתר אספקה",
      customerNo: s.customerNo || "",
      address: s.address || "",
      city: s.city || "",
      visits: s.visits || 0,
      ptoOpens: s.ptoOpens || 0,
      ptoMin: s.ptoTotalMin || 0,
      isSelected: (s.siteKey || `${s.city}|${s.address}`) === selectedKey,
    })),
  );

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .custom-pin {
      background: #047857;
      border: 2px solid #ffffff;
      color: white;
      font-weight: bold;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      cursor: pointer;
      transition: transform 0.2s, background 0.2s;
    }
    .custom-pin.selected {
      background: #dc2626 !important;
      transform: scale(1.35);
      z-index: 1000 !important;
      box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.4), 0 4px 10px rgba(0,0,0,0.4);
    }
    .custom-pin:hover {
      transform: scale(1.25);
      background: #065f46;
    }
    .leaflet-popup-content-wrapper {
      border-radius: 14px;
      box-shadow: 0 6px 18px rgba(0,0,0,0.18);
      direction: rtl;
      text-align: right;
      padding: 4px;
    }
    .popup-title {
      font-size: 14px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 2px;
    }
    .popup-sub {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
    }
    .popup-addr {
      font-size: 12px;
      font-weight: 600;
      color: #334155;
      margin: 4px 0;
      border-top: 1px solid #e2e8f0;
      padding-top: 4px;
    }
    .popup-stats {
      font-size: 11px;
      color: #047857;
      font-weight: 700;
      background: #ecfdf5;
      padding: 3px 6px;
      border-radius: 6px;
      display: inline-block;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const sites = ${sitesJson};
    const defaultCenter = [32.1583, 34.8911]; // הוד השרון
    const map = L.map('map', { zoomControl: true }).setView(defaultCenter, 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    const markers = [];
    const bounds = L.latLngBounds();
    let selectedMarker = null;

    sites.forEach((s) => {
      if (s.lat == null || s.lon == null) return;
      const latLng = [s.lat, s.lon];
      bounds.extend(latLng);

      const el = document.createElement('div');
      el.className = 'custom-pin' + (s.isSelected ? ' selected' : '');
      el.innerHTML = s.visits > 9 ? '9+' : (s.visits || '📍');

      const icon = L.divIcon({
        className: 'marker-wrap',
        html: el,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -14],
      });

      const popupHtml = \`
        <div>
          <div class="popup-title">\${s.customerName}</div>
          \${s.customerNo ? \`<div class="popup-sub">מספר לקוח: #\${s.customerNo}</div>\` : ''}
          <div class="popup-addr">📍 \${s.address} (\${s.city})</div>
          <div class="popup-stats">🚚 \${s.visits} ביקורים \${s.ptoOpens ? \`· 🏗️ \${s.ptoOpens} מנוף (\${s.ptoMin} דק')\` : ''}</div>
        </div>
      \`;

      const marker = L.marker(latLng, { icon: icon }).addTo(map);
      marker.bindPopup(popupHtml);

      if (s.isSelected) {
        selectedMarker = marker;
      }

      markers.push({ key: s.key, marker: marker });
    });

    if (selectedMarker) {
      map.setView(selectedMarker.getLatLng(), 14, { animate: true });
      selectedMarker.openPopup();
    } else if (sites.length > 0 && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  </script>
</body>
</html>`;
}

function SitesPage() {
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [expandedKey, setExpandedKey] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<Region>("all");
  const [activeCityFilter, setActiveCityFilter] = useState<string | null>(null);
  const [activeCustomerFilter, setActiveCustomerFilter] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["site-atlas"],
    queryFn: () => getSiteAtlasFn(),
    staleTime: 5_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const data = q.data;

  // סינון דינמי לפי אזור, עיר, לקוח ומילות חיפוש
  const filteredList = useMemo(() => {
    if (!data?.sites) return [];
    let list = data.sites;

    // 1. סינון אזורי (צפון / השרון / דרום / מרכז)
    if (selectedRegion !== "all") {
      list = list.filter((s) => getSiteRegion(s.city) === selectedRegion);
    }

    // 2. סינון לפי עיר נבחרת בלחיצה על כפתור עיר
    if (activeCityFilter) {
      list = list.filter((s) => s.city.trim() === activeCityFilter.trim());
    }

    // 3. סינון לפי לקוח נבחר בלחיצה על כפתור לקוח
    if (activeCustomerFilter) {
      list = list.filter(
        (s) =>
          s.customerName.includes(activeCustomerFilter) ||
          s.customerNo === activeCustomerFilter,
      );
    }

    // 4. חיפוש חופשי
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter((site) =>
        [site.address, site.city, site.customerName, site.customerNo]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(term)),
      );
    }

    return list;
  }, [data, selectedRegion, activeCityFilter, activeCustomerFilter, search]);

  const selectedSite = useMemo(() => {
    return (
      filteredList.find(
        (s) => (s.siteKey || `${s.city}|${s.address}`) === selectedKey,
      ) || filteredList[0]
    );
  }, [filteredList, selectedKey]);

  const mappedCount = (filteredList || []).filter(
    (s) => s.latitude != null && s.longitude != null,
  ).length;

  const resetAllFilters = useCallback(() => {
    setSelectedRegion("all");
    setActiveCityFilter(null);
    setActiveCustomerFilter(null);
    setSearch("");
  }, []);

  const selectCity = (cityName: string) => {
    setActiveCityFilter((prev) => (prev === cityName ? null : cityName));
    setActiveCustomerFilter(null);
  };

  const selectCustomer = (custName: string) => {
    setActiveCustomerFilter((prev) => (prev === custName ? null : custName));
    setActiveCityFilter(null);
  };

  const mapHtml = useMemo(() => {
    return generateInteractiveMapHtml(
      filteredList,
      selectedSite?.siteKey || (selectedSite ? `${selectedSite.city}|${selectedSite.address}` : undefined),
    );
  }, [filteredList, selectedSite]);

  return (
    <>
      <PageHeader
        title="אתרי אספקה"
        subtitle={
          data
            ? `${data.sites.length} כתובות · ${mappedCount} סיכות מוצגות על המפה`
            : "היסטוריית ביקורים מהגיליון"
        }
        action={
          <button
            type="button"
            onClick={() => void q.refetch()}
            disabled={q.isFetching}
            aria-label="רענון נתונים"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} />
            רענון
          </button>
        }
      />

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8" dir="rtl">
        {/* כרטיס תמונת מצב היסטורית עליון */}
        <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-primary/15 via-card to-emerald-500/10 p-5 shadow-card md:p-6">
          <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-primary">תמונת מצב היסטורית</p>
              <h1 className="mt-1 font-display text-2xl font-extrabold md:text-3xl">
                כתובות, לקוחות וביקורים
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                נתונים מצטברים מטאבי אתרי הלקוחות והיסטוריית הביקורים. כולל ספירת פתיחות מנוף (PTO) לפי כתובת כשקיים בגיליון.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric icon={MapPin} label="אתרים" value={data?.sites.length ?? "—"} />
              <Metric
                icon={Truck}
                label="ביקורים"
                value={data?.sites.reduce((n, s) => n + s.visits, 0) ?? "—"}
              />
              <Metric
                icon={Timer}
                label="פתיחות מנוף"
                value={data?.sites.reduce((n, s) => n + (s.ptoOpens || 0), 0) ?? "—"}
              />
              <Metric icon={Layers} label="נקודות מפה" value={mappedCount} />
            </div>
          </div>

          {/* כפתורי סינון אזורים דינמיים: כל האזורים / השרון / מרכז / צפון / דרום */}
          <div className="relative mt-5 border-t border-border/60 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <Compass className="h-4 w-4 text-emerald-600" /> סנן לפי אזור גיאוגרפי:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(["all", "sharon", "center", "north", "south"] as Region[]).map((reg) => {
                  const isActive = selectedRegion === reg;
                  const countInRegion =
                    reg === "all"
                      ? data?.sites.length ?? 0
                      : (data?.sites || []).filter((s) => getSiteRegion(s.city) === reg).length;

                  return (
                    <button
                      key={reg}
                      type="button"
                      onClick={() => {
                        setSelectedRegion(reg);
                        setActiveCityFilter(null);
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition shadow-sm",
                        isActive
                          ? "border-emerald-500 bg-emerald-600 text-white shadow-emerald-500/20"
                          : "border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {REGION_LABELS[reg]}
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] tabular-nums font-mono",
                          isActive ? "bg-emerald-700/80 text-white" : "bg-muted text-foreground",
                        )}
                      >
                        {countInRegion}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {q.isError && (
          <div
            role="alert"
            className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            לא ניתן לקרוא את נתוני האתרים: {(q.error as Error).message}
          </div>
        )}

        {q.isLoading && (
          <div
            role="status"
            className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground"
          >
            טוען כתובות, לקוחות והיסטוריית ביקורים…
          </div>
        )}

        {data && (
          <>
            {/* סרגל סינון פעיל ואיפוס */}
            {(selectedRegion !== "all" || activeCityFilter || activeCustomerFilter || search) && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-900 dark:text-emerald-100">
                <div className="flex flex-wrap items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <span>סינון פעיל:</span>
                  {selectedRegion !== "all" && (
                    <span className="rounded-lg bg-emerald-500/20 px-2 py-0.5">
                      אזור: {REGION_LABELS[selectedRegion]}
                    </span>
                  )}
                  {activeCityFilter && (
                    <span className="rounded-lg bg-emerald-500/20 px-2 py-0.5">
                      עיר: {activeCityFilter}
                    </span>
                  )}
                  {activeCustomerFilter && (
                    <span className="rounded-lg bg-emerald-500/20 px-2 py-0.5">
                      לקוח: {activeCustomerFilter}
                    </span>
                  )}
                  {search && (
                    <span className="rounded-lg bg-emerald-500/20 px-2 py-0.5">
                      חיפוש: "{search}"
                    </span>
                  )}
                  <span className="font-bold text-emerald-700 dark:text-emerald-300">
                    ({filteredList.length} אתרים וסיכות מוצגים)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-card px-2.5 py-1 text-xs font-bold text-foreground hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" /> אפס הכל
                </button>
              </div>
            )}

            {/* גריד ראשי: מפת סיכות מרובות משמאל + פאנלים לחיצים מימין */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.85fr)]">
              {/* סקשן המפה האינטראקטיבית */}
              <section
                className="flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-card"
                aria-label="מפת אתרי אספקה וסיכות לקוחות"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                  <div>
                    <h2 className="flex items-center gap-2 font-display font-bold">
                      <MapPin className="h-4 w-4 text-emerald-600" />
                      מפת סיכות לקוחות ואתרים
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        {mappedCount} סיכות פעילות
                      </span>
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      לחיצה על סיכה מציגה שם לקוח, מספר לקוח, כתובת, ביקורים וזמני מנוף
                    </p>
                  </div>
                  {selectedSite && selectedSite.latitude != null && (
                    <a
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      href={`https://www.openstreetmap.org/?mlat=${selectedSite.latitude}&mlon=${selectedSite.longitude}#map=15/${selectedSite.latitude}/${selectedSite.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      פתיחה מורחבת
                    </a>
                  )}
                </div>

                {/* iframe המפה האינטראקטיבית עם Leaflet ו-OpenStreetMap */}
                <div className="relative min-h-[380px] flex-1 bg-muted/20">
                  <iframe
                    key={`${selectedRegion}-${activeCityFilter}-${activeCustomerFilter}-${filteredList.length}-${selectedSite?.siteKey}`}
                    title="מפת אתרי אספקה וסיכות לקוחות"
                    srcDoc={mapHtml}
                    className="h-full min-h-[380px] w-full border-0 lg:min-h-[440px]"
                    loading="lazy"
                    sandbox="allow-scripts allow-popups allow-same-origin"
                  />
                </div>

                {/* סרגל האתר הנבחר בתחתית המפה */}
                {selectedSite && (
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-border/60 bg-muted/30 px-4 py-3 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold">
                        📍
                      </span>
                      <div>
                        <span className="font-bold text-foreground">
                          {selectedSite.customerName || "אתר אספקה"}
                        </span>
                        {selectedSite.customerNo && (
                          <span className="text-muted-foreground"> (#{selectedSite.customerNo})</span>
                        )}
                        <span className="mx-1.5 text-muted-foreground">·</span>
                        <span className="font-semibold text-muted-foreground">
                          {selectedSite.address} ({selectedSite.city})
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 font-semibold text-muted-foreground">
                      <span>🚚 {selectedSite.visits} ביקורים</span>
                      {(selectedSite.ptoOpens || 0) > 0 && (
                        <span className="text-emerald-700 dark:text-emerald-300">
                          🏗️ {selectedSite.ptoOpens} פתיחות מנוף ({selectedSite.ptoTotalMin || 0} דק')
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* סרגל צדדי: ערים מובילות ולקוחות מובילים עם כפתורים לחיצים דינמיים */}
              <aside className="space-y-4">
                <RankPanelClickable
                  title="ערים מובילות לפי ביקורים"
                  subtitle="לחץ לסינון מהיר והצגת כל סיכות העיר"
                  icon={MapPin}
                  activeItem={activeCityFilter}
                  onItemClick={selectCity}
                  rows={data.cities.map((x) => ({ label: x.name, count: x.count }))}
                />

                <RankPanelClickable
                  title="לקוחות מובילים לפי ביקורים"
                  subtitle="לחץ להצגת כל אתרי וסיכות הלקוח"
                  icon={Users}
                  activeItem={activeCustomerFilter}
                  onItemClick={selectCustomer}
                  rows={data.customers.map((x) => ({
                    label: x.name,
                    count: x.count,
                    customerNo: x.customerNo,
                  }))}
                />
              </aside>
            </div>

            {/* ספר הכתובות וההיסטוריה המלאה */}
            <section className="space-y-3 pt-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-display text-xl font-extrabold">
                    ספר כתובות והיסטוריית אתרים
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    בחירת אתר ממקדת את הסיכה על המפה; פתיחת שורה מציגה ביקורים, תעודות ופתיחות מנוף.
                  </p>
                </div>
                <label className="relative block w-full sm:max-w-sm">
                  <span className="sr-only">חיפוש כתובת או לקוח</span>
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="חיפוש כתובת, עיר או לקוח…"
                    className="min-h-11 w-full rounded-xl border bg-card py-2 pe-10 ps-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </label>
              </div>

              <div className="space-y-3">
                {filteredList.map((site, i) => {
                  const key = site.siteKey || `${site.city}|${site.address}`;
                  const expanded = expandedKey === key;
                  const isSelected =
                    (selectedSite?.siteKey || `${selectedSite?.city}|${selectedSite?.address}`) === key;

                  return (
                    <article
                      key={`${key}-${i}`}
                      className={cn(
                        "overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:shadow-md",
                        isSelected && "border-emerald-500/60 ring-1 ring-emerald-500/30",
                      )}
                    >
                      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedKey(key);
                            // גלילה חלקה למפה במובייל
                            if (window.innerWidth < 1024) {
                              window.scrollTo({ top: 120, behavior: "smooth" });
                            }
                          }}
                          aria-pressed={isSelected}
                          className="flex min-h-12 min-w-0 flex-1 items-start gap-3 rounded-xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <span
                            className={cn(
                              "grid h-10 w-10 shrink-0 place-items-center rounded-xl font-bold transition",
                              isSelected
                                ? "bg-emerald-600 text-white shadow-sm"
                                : "bg-primary/10 text-primary",
                            )}
                          >
                            <MapPin className="h-5 w-5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-bold text-foreground">
                              {site.customerName || "אתר אספקה"}
                              {site.customerNo && (
                                <span className="text-xs font-normal text-muted-foreground">
                                  {" "}
                                  (#{site.customerNo})
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {site.address} · {site.city}
                            </span>
                          </span>
                        </button>

                        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                          <SmallStat icon={Truck} label="ביקורים" value={site.visits} />
                          <SmallStat
                            icon={Timer}
                            label="מנוף"
                            value={
                              (site.ptoOpens || 0) > 0
                                ? `${site.ptoOpens} · ${site.ptoTotalMin || 0} דק׳`
                                : site.medianMin != null
                                ? `${site.medianMin} דק׳`
                                : "—"
                            }
                          />
                          <SmallStat
                            icon={CalendarDays}
                            label="ביקור אחרון"
                            value={site.lastIso ? fmtShort(site.lastIso) : "—"}
                          />
                          <SmallStat
                            icon={Users}
                            label="אזור"
                            value={REGION_LABELS[getSiteRegion(site.city)]}
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => setExpandedKey(expanded ? "" : key)}
                          aria-expanded={expanded}
                          className="min-h-11 shrink-0 rounded-xl border px-4 text-xs font-bold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {expanded ? "סגירה" : "היסטוריה"}
                        </button>
                      </div>

                      {expanded && (
                        <div className="border-t border-border/60 bg-muted/20 p-4">
                          {site.customerNo && (
                            <Link
                              to="/customers/$id"
                              params={{ id: site.customerNo }}
                              className="inline-flex min-h-10 items-center gap-2 rounded-xl border bg-card px-3 text-xs font-bold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <Users className="h-4 w-4" />
                              פתיחת תיק הלקוח במערכת
                            </Link>
                          )}

                          {(site.ptoOpens > 0 || site.ptoTotalMin > 0) && (
                            <p className="mb-3 mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                              מנוף בכתובת: {site.ptoOpens} פתיחות מנוף · סה״כ {site.ptoTotalMin} דק׳ עבודת PTO
                              {site.customerNo
                                ? ` · לקוח #${site.customerNo}${site.customerName ? ` (${site.customerName})` : ""}`
                                : ""}
                            </p>
                          )}

                          <h3 className="mb-2 mt-4 text-sm font-bold">היסטוריית ביקורים ותעודות</h3>
                          {site.visitHistory.length ? (
                            <ol className="space-y-2">
                              {site.visitHistory.map((visit, index) => (
                                <li
                                  key={`${visit.dateIso}-${index}`}
                                  className="rounded-xl border bg-card p-3 shadow-sm"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                    <span className="font-bold">
                                      {visit.dateIso ? fmtShort(visit.dateIso) : "תאריך לא זמין"}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {visit.driver}
                                      {visit.truck ? ` · ${visit.truck}` : ""}
                                      {visit.durationMin != null ? ` · ${visit.durationMin} דק׳` : ""}
                                      {visit.ptoMin != null ? ` · 🏗️ מנוף ${visit.ptoMin} דק׳` : ""}
                                    </span>
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {visit.notes.map((id) => (
                                      <a
                                        key={`n-${id}`}
                                        href={`/notes/${encodeURIComponent(id)}`}
                                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                      >
                                        <FileText className="h-3.5 w-3.5" />
                                        תעודה {id}
                                      </a>
                                    ))}
                                    {visit.orders.map((id) => (
                                      <Link
                                        key={`o-${id}`}
                                        to="/orders"
                                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                      >
                                        <Package className="h-3.5 w-3.5" />
                                        הזמנה {id}
                                      </Link>
                                    ))}
                                    {!visit.notes.length && !visit.orders.length && (
                                      <span className="text-xs text-muted-foreground">
                                        רשומת ביקור ללא שיוך תעודה
                                      </span>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                              לא נמצאו רשומות ביקור מפורטות המשויכות לאתר זה.
                            </p>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}

                {!filteredList.length && (
                  <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    אין כתובות או סיכות תואמות לסינון הנוכחי. לחץ על "אפס הכל" להצגת כל האתרים.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string | number;
}) {
  return (
    <div className="min-w-[5.5rem] rounded-2xl border border-border/50 bg-card/70 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-xl font-extrabold tabular-nums">{value}</div>
    </div>
  );
}

function SmallStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string | number;
}) {
  return (
    <span className="flex items-center gap-1.5 rounded-lg bg-muted/70 px-2 py-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <strong className="truncate">{value}</strong>
    </span>
  );
}

/**
 * פאנל דירוג אינטראקטיבי: שורות לחיצות עם אפקט בחירה וסינון מיידי של המפה
 */
function RankPanelClickable({
  title,
  subtitle,
  icon: Icon,
  rows,
  activeItem,
  onItemClick,
}: {
  title: string;
  subtitle: string;
  icon: typeof MapPin;
  rows: Array<{ label: string; count: number; customerNo?: string }>;
  activeItem: string | null;
  onItemClick: (item: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card">
      <div className="mb-2">
        <h2 className="flex items-center gap-2 font-display text-sm font-bold">
          <Icon className="h-4 w-4 text-emerald-600" />
          {title}
        </h2>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </div>

      {rows.length ? (
        <ol className="mt-3 space-y-1.5">
          {rows.slice(0, 5).map((row, i) => {
            const isSelected = activeItem === row.label || (row.customerNo && activeItem === row.customerNo);
            return (
              <li key={`${row.label}-${i}`}>
                <button
                  type="button"
                  onClick={() => onItemClick(row.customerNo || row.label)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-right text-xs font-semibold transition-all",
                    isSelected
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-950 dark:text-emerald-100 font-bold shadow-sm"
                      : "border-border/60 bg-muted/40 hover:bg-muted text-foreground",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                        isSelected
                          ? "bg-emerald-600 text-white"
                          : "bg-muted-foreground/20 text-muted-foreground",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="truncate">{row.label}</span>
                    {row.customerNo && (
                      <span className="text-[10px] text-muted-foreground">
                        (#{row.customerNo})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] tabular-nums font-mono">
                      {row.count} ביק׳
                    </span>
                    {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">אין נתונים מסוכמים עדיין.</p>
      )}
    </section>
  );
}
