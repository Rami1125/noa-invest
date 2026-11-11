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
  AlertTriangle,
  Hourglass,
  Gauge,
  Info,
  Flame,
} from "lucide-react";

export const Route = createFileRoute("/sites")({
  head: () => ({ meta: [{ title: "אתרי אספקה, זמני פריקה וצווארי בקבוק — ח. סבן" }] }),
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
 * קביעה האם אתר מוגדר כמעכב/בעייתי לסידור
 * אתר מעכב: P80 >= 35 דקות, או מקסימום >= 45 דקות, או חציון >= 30 דקות
 */
function isSiteDelayBottleneck(site: AtlasSite): boolean {
  const p80 = site.p80Min ?? 0;
  const max = site.maxMin ?? 0;
  const med = site.medianMin ?? 0;
  return p80 >= 35 || max >= 45 || med >= 30;
}

/**
 * חישוב זמן פריקה צפוי משוקלל לסידור (בדקות)
 */
function getExpectedUnloadingMinutes(site: AtlasSite): number {
  if (site.p80Min != null && site.p80Min > 0) {
    return Math.round(site.p80Min);
  }
  if (site.medianMin != null && site.medianMin > 0) {
    return Math.round(site.medianMin * 1.2);
  }
  return 30; // ברירת מחדל בטוחה לפריקת מנוף
}

/**
 * יצירת קוד HTML עצמאי להצגת מפת Leaflet אינטראקטיבית עם הדגשת צבע לאתרים מעכבים
 */
function generateInteractiveMapHtml(sites: AtlasSite[], selectedKey?: string): string {
  const validSites = sites.filter((s) => s.latitude != null && s.longitude != null);
  const sitesJson = JSON.stringify(
    validSites.map((s) => {
      const isDelay = isSiteDelayBottleneck(s);
      const expectedMin = getExpectedUnloadingMinutes(s);
      return {
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
        medianMin: s.medianMin,
        p80Min: s.p80Min,
        maxMin: s.maxMin,
        isDelay,
        expectedMin,
        isSelected: (s.siteKey || `${s.city}|${s.address}`) === selectedKey,
      };
    }),
  );

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .custom-pin {
      border: 2px solid #ffffff;
      color: white;
      font-weight: 800;
      border-radius: 50%;
      width: 26px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      box-shadow: 0 2px 7px rgba(0,0,0,0.35);
      cursor: pointer;
      transition: transform 0.25s, box-shadow 0.25s;
    }
    .custom-pin.normal {
      background: #059669;
    }
    .custom-pin.delay {
      background: #dc2626 !important;
      box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.4), 0 3px 8px rgba(0,0,0,0.4);
      animation: pulse-ring 2.5s infinite;
    }
    @keyframes pulse-ring {
      0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.6); }
      70% { box-shadow: 0 0 0 9px rgba(220, 38, 38, 0); }
      100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
    }
    .custom-pin.selected {
      background: #7c3aed !important;
      transform: scale(1.45);
      z-index: 1000 !important;
      box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.5), 0 5px 12px rgba(0,0,0,0.45);
    }
    .custom-pin:hover {
      transform: scale(1.3);
    }
    .leaflet-popup-content-wrapper {
      border-radius: 16px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.22);
      direction: rtl;
      text-align: right;
      padding: 6px;
    }
    .popup-title {
      font-size: 15px;
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
      margin: 6px 0;
      border-top: 1px solid #f1f5f9;
      padding-top: 4px;
    }
    .popup-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 8px;
      margin-bottom: 6px;
    }
    .popup-badge.delay {
      background: #fef2f2;
      color: #991b1b;
      border: 1px solid #fecaca;
    }
    .popup-badge.normal {
      background: #ecfdf5;
      color: #065f46;
      border: 1px solid #a7f3d0;
    }
    .popup-eta-box {
      background: #f8fafc;
      border: 1px dashed #cbd5e1;
      border-radius: 10px;
      padding: 6px 8px;
      margin-top: 6px;
    }
    .popup-eta-label {
      font-size: 11px;
      color: #475569;
      font-weight: bold;
    }
    .popup-eta-val {
      font-size: 14px;
      font-weight: 900;
      color: #0f172a;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const sites = ${sitesJson};
    const defaultCenter = [32.1583, 34.8911];
    const map = L.map("map", { zoomControl: true }).setView(defaultCenter, 11);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "© OpenStreetMap"
    }).addTo(map);

    const markers = [];
    const bounds = L.latLngBounds();
    let selectedMarker = null;

    sites.forEach(function(s) {
      if (s.lat == null || s.lon == null) return;
      const latLng = [s.lat, s.lon];
      bounds.extend(latLng);

      const el = document.createElement("div");
      const pinClass = s.isSelected ? "selected" : (s.isDelay ? "delay" : "normal");
      el.className = "custom-pin " + pinClass;
      el.innerHTML = s.isDelay ? "⚠️" : (s.visits > 9 ? "9+" : (s.visits || "📍"));
      el.title = s.customerName + " — זמן צפוי: " + s.expectedMin + " דקות";

      const icon = L.divIcon({
        className: "marker-wrap",
        html: el,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -14],
      });

      const badgeHtml = s.isDelay
        ? '<div class="popup-badge delay">⚠️ אתר מעכב / צוואר בקבוק (P80: ' + (s.p80Min || s.medianMin || 35) + ' דקות)</div>'
        : '<div class="popup-badge normal">✓ אתר שגרתי ותקין (חציון: ' + (s.medianMin || 20) + ' דקות)</div>';

      const ptoText = s.ptoOpens ? " · 🏗️ " + s.ptoOpens + " סשנים של מנוף PTO (" + s.ptoMin + " דקות)" : "";
      const p80Text = s.p80Min ? " (תכנון P80: " + s.p80Min + " דקות)" : "";
      const subCust = s.customerNo ? '<div class="popup-sub">מספר לקוח: #' + s.customerNo + '</div>' : "";

      const popupHtml = "<div>" +
        badgeHtml +
        '<div class="popup-title">' + s.customerName + '</div>' +
        subCust +
        '<div class="popup-addr">📍 ' + s.address + ' (' + s.city + ')</div>' +
        '<div class="popup-eta-box">' +
          '<div class="popup-eta-label">⏱️ זמן פריקה צפוי לסידור:</div>' +
          '<div class="popup-eta-val">' + s.expectedMin + ' דקות' + p80Text + '</div>' +
        '</div>' +
        '<div style="font-size: 11px; color: #475569; margin-top: 6px;">' +
          "🚚 " + s.visits + " ביקורים בהיסטוריה" + ptoText +
        "</div>" +
      "</div>";

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
  const [delayOnlyFilter, setDelayOnlyFilter] = useState(false);

  const q = useQuery({
    queryKey: ["site-atlas"],
    queryFn: () => getSiteAtlasFn(),
    staleTime: 5_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const data = q.data;

  // ספירת אתרים מעכבים
  const delayCountTotal = useMemo(() => {
    return (data?.sites || []).filter(isSiteDelayBottleneck).length;
  }, [data]);

  // סינון דינמי לפי אזור, עיר, לקוח, חריגי זמן, ומילות חיפוש
  const filteredList = useMemo(() => {
    if (!data?.sites) return [];
    let list = data.sites;

    // 1. סינון אתרים מעכבים בלבד
    if (delayOnlyFilter) {
      list = list.filter(isSiteDelayBottleneck);
    }

    // 2. סינון אזורי (צפון / השרון / דרום / מרכז)
    if (selectedRegion !== "all") {
      list = list.filter((s) => getSiteRegion(s.city) === selectedRegion);
    }

    // 3. סינון לפי עיר נבחרת
    if (activeCityFilter) {
      list = list.filter((s) => s.city.trim() === activeCityFilter.trim());
    }

    // 4. סינון לפי לקוח נבחר
    if (activeCustomerFilter) {
      list = list.filter(
        (s) =>
          s.customerName.includes(activeCustomerFilter) ||
          s.customerNo === activeCustomerFilter,
      );
    }

    // 5. חיפוש חופשי
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter((site) =>
        [site.address, site.city, site.customerName, site.customerNo]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(term)),
      );
    }

    return list;
  }, [data, delayOnlyFilter, selectedRegion, activeCityFilter, activeCustomerFilter, search]);

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
    setDelayOnlyFilter(false);
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

  // נתוני זמן צפוי וצוואר בקבוק לאתר הנבחר
  const selectedExpectedMin = selectedSite ? getExpectedUnloadingMinutes(selectedSite) : 30;
  const selectedIsDelay = selectedSite ? isSiteDelayBottleneck(selectedSite) : false;

  return (
    <>
      <PageHeader
        title="אתרי אספקה וצווארי בקבוק"
        subtitle={
          data
            ? `${data.sites.length} כתובות · ${mappedCount} סיכות מפה · ${delayCountTotal} אתרים מעכבים`
            : "היסטוריית ביקורים וסשנים PTO מהגיליון"
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
              <p className="text-xs font-bold text-primary">תמונת מצב היסטורית מוצלבת</p>
              <h1 className="mt-1 font-display text-2xl font-extrabold md:text-3xl">
                כתובות, לקוחות וזמני פריקה
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                הצלבת נתונים מטאבי 'אתרי_לקוחות', 'היסטוריית_ביקורים' ו-'סשנים_PTO'. אתרים בעלי שהייה ממושכת מודגשים באדום כצווארי בקבוק לסידור העבודה.
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
                label="סשנים PTO"
                value={data?.sites.reduce((n, s) => n + (s.ptoOpens || 0), 0) ?? "—"}
              />
              <Metric
                icon={AlertTriangle}
                label="אתרים מעכבים"
                value={delayCountTotal}
                highlight={delayCountTotal > 0}
              />
            </div>
          </div>

          {/* כפתורי סינון אזורים + כפתור מיוחד לאתרים מעכבים */}
          <div className="relative mt-5 border-t border-border/60 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 text-xs font-bold text-foreground ml-2">
                  <Compass className="h-4 w-4 text-emerald-600" /> סנן אזור:
                </span>
                {(["all", "sharon", "center", "north", "south"] as Region[]).map((reg) => {
                  const isActive = selectedRegion === reg && !delayOnlyFilter;
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
                        setDelayOnlyFilter(false);
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

              {/* כפתור פילטר ייעודי לאתרים מעכבים בלבד */}
              <button
                type="button"
                onClick={() => setDelayOnlyFilter((prev) => !prev)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-extrabold transition shadow-sm",
                  delayOnlyFilter
                    ? "border-red-600 bg-red-600 text-white shadow-red-600/30 ring-2 ring-red-400"
                    : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-500/20",
                )}
              >
                <Flame className="h-4 w-4 text-red-600 dark:text-red-400" />
                <span>⚠️ אתרים מעכבים בלבד</span>
                <span className="rounded-md bg-red-700/20 px-1.5 py-0.5 text-[10px] tabular-nums font-mono">
                  {delayCountTotal}
                </span>
              </button>
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
            טוען כתובות, זמני פריקה וסשנים של מנוף PTO…
          </div>
        )}

        {data && (
          <>
            {/* סרגל סינון פעיל ואיפוס */}
            {(selectedRegion !== "all" || activeCityFilter || activeCustomerFilter || delayOnlyFilter || search) && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-950 dark:text-amber-100">
                <div className="flex flex-wrap items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <span>סינון פעיל:</span>
                  {delayOnlyFilter && (
                    <span className="rounded-lg bg-red-600 text-white px-2 py-0.5 font-bold">
                      ⚠️ אתרים מעכבים בלבד
                    </span>
                  )}
                  {selectedRegion !== "all" && (
                    <span className="rounded-lg bg-amber-500/20 px-2 py-0.5">
                      אזור: {REGION_LABELS[selectedRegion]}
                    </span>
                  )}
                  {activeCityFilter && (
                    <span className="rounded-lg bg-amber-500/20 px-2 py-0.5">
                      עיר: {activeCityFilter}
                    </span>
                  )}
                  {activeCustomerFilter && (
                    <span className="rounded-lg bg-amber-500/20 px-2 py-0.5">
                      לקוח: {activeCustomerFilter}
                    </span>
                  )}
                  {search && (
                    <span className="rounded-lg bg-amber-500/20 px-2 py-0.5">
                      חיפוש: "{search}"
                    </span>
                  )}
                  <span className="font-bold text-amber-800 dark:text-amber-200">
                    ({filteredList.length} אתרים מוצגים)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-card px-2.5 py-1 text-xs font-bold text-foreground hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" /> אפס סינון
                </button>
              </div>
            )}

            {/* כרטיס זמן צפוי לפריקה של האתר הנבחר (מודגש ומרכזי) */}
            {selectedSite && (
              <section
                className={cn(
                  "relative overflow-hidden rounded-2xl border p-4 shadow-sm transition-all",
                  selectedIsDelay
                    ? "border-red-500/50 bg-gradient-to-r from-red-500/15 via-card to-amber-500/10 ring-1 ring-red-500/30"
                    : "border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 via-card to-primary/5",
                )}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold",
                          selectedIsDelay
                            ? "bg-red-600 text-white shadow-sm"
                            : "bg-emerald-600 text-white",
                        )}
                      >
                        {selectedIsDelay ? (
                          <>
                            <AlertTriangle className="h-3.5 w-3.5" /> אתר מעכב / צוואר בקבוק
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" /> אתר פריקה שגרתי
                          </>
                        )}
                      </span>
                      <h3 className="font-display text-base font-extrabold text-foreground">
                        {selectedSite.customerName || "אתר אספקה"}
                        {selectedSite.customerNo && (
                          <span className="font-mono text-xs font-semibold text-muted-foreground">
                            {" "}
                            (#{selectedSite.customerNo})
                          </span>
                        )}
                      </h3>
                      <span className="text-xs text-muted-foreground font-semibold">
                        📍 {selectedSite.address} · {selectedSite.city}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {selectedIsDelay
                        ? "⚠️ אתר זה מתאפיין בזמני פריקה והנפה ממושכים. מומלץ לתזמן מרווח ביטחון מתאים בסידור העבודה של ראמי."
                        : "✓ אתר בעל זמני פריקה יציבים וסדירים לפי נתוני היסטוריית הביקורים."}
                    </p>
                  </div>

                  {/* מדדי זמנים מוצלבים: חציון, P80, מקסימום, וזמן צפוי מומלץ */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div
                      className={cn(
                        "rounded-xl border px-3 py-2 text-center shadow-sm",
                        selectedIsDelay
                          ? "border-red-500/40 bg-red-500/10 text-red-950 dark:text-red-100"
                          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100",
                      )}
                    >
                      <div className="text-[10px] font-bold text-muted-foreground">
                        ⏱️ זמן צפוי לסידור
                      </div>
                      <div className="font-display text-lg font-black tabular-nums">
                        {selectedExpectedMin} דק׳
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card/80 px-2.5 py-2 text-center">
                      <div className="text-[10px] text-muted-foreground">חציון (P50)</div>
                      <div className="font-bold tabular-nums">
                        {selectedSite.medianMin != null ? `${selectedSite.medianMin} דק׳` : "—"}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card/80 px-2.5 py-2 text-center">
                      <div className="text-[10px] text-muted-foreground">תכנון בטוח (P80)</div>
                      <div className="font-bold tabular-nums text-amber-700 dark:text-amber-300">
                        {selectedSite.p80Min != null ? `${selectedSite.p80Min} דק׳` : "—"}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card/80 px-2.5 py-2 text-center">
                      <div className="text-[10px] text-muted-foreground">מקסימום היסטורי</div>
                      <div className="font-bold tabular-nums text-red-700 dark:text-red-300">
                        {selectedSite.maxMin != null ? `${selectedSite.maxMin} דק׳` : "—"}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-card/80 px-2.5 py-2 text-center">
                      <div className="text-[10px] text-muted-foreground">סשנים מנוף PTO</div>
                      <div className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                        {selectedSite.ptoOpens || 0} ({selectedSite.ptoTotalMin || 0} דק׳)
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* גריד ראשי: מפת סיכות מרובות משמאל + פאנלים לחיצים מימין */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.85fr)]">
              {/* סקשן המפה האינטראקטיבית עם הדגשת סיכות אדומות לאתרים מעכבים */}
              <section
                className="flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-card"
                aria-label="מפת אתרי אספקה וסיכות לקוחות"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                  <div>
                    <h2 className="flex items-center gap-2 font-display font-bold">
                      <MapPin className="h-4 w-4 text-emerald-600" />
                      מפת אתרים וסיכות לקוחות
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        {mappedCount} סיכות מוצגות
                      </span>
                    </h2>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-600 inline-block" />
                        אתר מעכב (P80 גבוה)
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 inline-block" />
                        אתר תקין
                      </span>
                    </div>
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
                    key={`${selectedRegion}-${activeCityFilter}-${activeCustomerFilter}-${delayOnlyFilter}-${filteredList.length}-${selectedSite?.siteKey}`}
                    title="מפת אתרי אספקה וסיכות לקוחות"
                    srcDoc={mapHtml}
                    className="h-full min-h-[380px] w-full border-0 lg:min-h-[440px]"
                    loading="lazy"
                    sandbox="allow-scripts allow-popups"
                  />
                </div>
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

            {/* ספר הכתובות וההיסטוריה המלאה עם חיווי צבע מובלט */}
            <section className="space-y-3 pt-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-display text-xl font-extrabold">
                    ספר כתובות והיסטוריית אתרים
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    אתרים מעכבים מודגשים ברקע אדום. לחיצה מציגה חלון פריקה צפוי וסשנים של מנוף PTO.
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
                  const isDelay = isSiteDelayBottleneck(site);
                  const expectedMin = getExpectedUnloadingMinutes(site);

                  return (
                    <article
                      key={`${key}-${i}`}
                      className={cn(
                        "overflow-hidden rounded-2xl border transition-all hover:shadow-md",
                        isDelay
                          ? "border-red-500/40 bg-red-500/5 dark:bg-red-950/10"
                          : "border-border bg-card",
                        isSelected && "border-primary ring-2 ring-primary/30 shadow-md",
                      )}
                    >
                      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedKey(key);
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
                              isDelay
                                ? "bg-red-600 text-white shadow-sm"
                                : "bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
                            )}
                          >
                            {isDelay ? <AlertTriangle className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="block truncate font-bold text-foreground">
                                {site.customerName || "אתר אספקה"}
                                {site.customerNo && (
                                  <span className="text-xs font-normal text-muted-foreground">
                                    {" "}
                                    (#{site.customerNo})
                                  </span>
                                )}
                              </span>
                              {isDelay && (
                                <span className="rounded-md bg-red-600/15 px-1.5 py-0.5 text-[10px] font-black text-red-700 dark:text-red-300">
                                  מעכב
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {site.address} · {site.city}
                            </span>
                          </span>
                        </button>

                        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                          <SmallStat
                            icon={Gauge}
                            label="זמן צפוי"
                            value={`${expectedMin} דק׳`}
                            highlight={isDelay}
                          />
                          <SmallStat
                            icon={Timer}
                            label="P80 בטוח"
                            value={site.p80Min != null ? `${site.p80Min} דק׳` : "—"}
                          />
                          <SmallStat icon={Truck} label="ביקורים" value={site.visits} />
                          <SmallStat
                            icon={CalendarDays}
                            label="ביקור אחרון"
                            value={site.lastIso ? fmtShort(site.lastIso) : "—"}
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
                          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
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

                            {/* פירוט נתוני זמנים מוצלבים */}
                            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                              <span>חציון: {site.medianMin ?? "—"} דק׳</span>
                              <span>P80: {site.p80Min ?? "—"} דק׳</span>
                              <span>מקסימום: {site.maxMin ?? "—"} דק׳</span>
                              <span className="text-emerald-700 dark:text-emerald-300">
                                סה״כ מנוף PTO: {site.ptoTotalMin || 0} דק׳ ({site.ptoOpens || 0} סשנים)
                              </span>
                            </div>
                          </div>

                          {isDelay && (
                            <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-950 dark:text-red-200">
                              <strong>⚠️ התרעת עיכוב לסידור:</strong> אתר זה דורש בממוצע מעל{" "}
                              {expectedMin} דקות פריקה. מומלץ לא לשבץ אותו כעצירה ראשונה בנגלות בוקר צפופות.
                            </div>
                          )}

                          <h3 className="mb-2 mt-4 text-sm font-bold">היסטוריית ביקורים מוצלבת מול PTO</h3>
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
                                      נהג: {visit.driver}
                                      {visit.truck ? ` · משאית ${visit.truck}` : ""}
                                      {visit.durationMin != null ? ` · משך שהייה: ${visit.durationMin} דק׳` : ""}
                                      {visit.ptoMin != null ? ` · 🏗️ מנוף נטו: ${visit.ptoMin} דק׳` : ""}
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
                    אין כתובות או סיכות תואמות לסינון הנוכחי. לחץ על "אפס סינון" להצגת כל האתרים.
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
  highlight,
}: {
  icon: typeof MapPin;
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-[5.5rem] rounded-2xl border px-3 py-2.5 transition",
        highlight
          ? "border-red-500/50 bg-red-500/10 text-red-950 dark:text-red-100 font-extrabold"
          : "border-border/50 bg-card/70",
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-foreground" />
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
  highlight,
}: {
  icon: typeof MapPin;
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2 py-2 transition",
        highlight
          ? "bg-red-500/15 text-red-950 dark:text-red-200 font-extrabold"
          : "bg-muted/70 text-muted-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-foreground" />
      <span>{label}:</span>
      <strong className="truncate text-foreground">{value}</strong>
    </span>
  );
}

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
