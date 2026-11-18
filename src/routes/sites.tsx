import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowUpDown,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  ClipboardList,
  Clock3,
  Copy,
  Database,
  Download,
  ExternalLink,
  Filter as FilterIcon,
  LocateFixed,
  Map,
  MapPin,
  Navigation,
  Plus,
  Radio,
  RefreshCw,
  Route as RouteIcon,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSitesServerFn, type RawSiteRow } from "@/lib/sites-api.functions";
import {
  filterSites,
  severity,
  validCoordinates,
  validThresholds,
  warehouses,
  type Filter,
  type SiteRecord,
  type Sort,
} from "@/lib/sites-model";

const SiteMap = lazy(() => import("@/components/site-map"));
const tabs = [
  { id: "map", label: "מפת אתרים", icon: Map },
  { id: "analytics", label: "אנליטיקת אתרים", icon: Activity },
  { id: "warehouses", label: "השוואת מחסנים", icon: Warehouse },
  { id: "customers", label: "מודיעין לקוחות", icon: Users },
  { id: "planning", label: "תכנון אספקה", icon: RouteIcon },
] as const;
type Tab = (typeof tabs)[number]["id"];

const labels = { normal: "תקין", delayed: "מעכב", critical: "קריטי", unknown: "לא מסווג" };
const fmt = (n: number | null, unit = "") =>
  n === null ? "—" : `${n.toLocaleString("he-IL")}${unit}`;

function mapRawSiteToRecord(raw: RawSiteRow, index: number): SiteRecord {
  const fullCustomer = String(raw.customer || "לקוח ללא שם");
  const primaryCustomer = fullCustomer.split(";")[0]?.trim() || fullCustomer;
  const codeMatch = primaryCustomer.match(/^(\d{5,7})\s+(.+)$/);

  return {
    id: String(raw.rowNumber ?? raw.siteKey ?? `site-${index}`),
    customer: codeMatch ? codeMatch[2].trim() : primaryCustomer,
    customerCode: String(raw.customerNo || (codeMatch ? codeMatch[1] : "")),
    address: String(raw.address || ""),
    city: String(raw.city || ""),
    visits: raw.visits ?? null,
    avgStopMin: raw.avgStopMin ?? null,
    maxStopMin: raw.maxStopMin ?? null,
    p80Min: raw.p80Min ?? null,
    lat: raw.lat ?? null,
    lng: raw.lng ?? null,
    distHarashKm: raw.distHarashKm ?? null,
    driveHarashMin: raw.driveHarashMin ?? null,
    distTalmidKm: raw.distTalmidKm ?? null,
    driveTalmidMin: raw.driveTalmidMin ?? null,
  } as SiteRecord;
}

export const Route = createFileRoute("/sites")({
  head: () => ({
    meta: [
      { title: "מודיעין אתרים | ח. סבן חומרי בניין" },
      {
        name: "description",
        content: "בקרת אתרים, זמני פריקה, השוואת מחסנים ותכנון אספקה בח. סבן חומרי בניין.",
      },
      { property: "og:title", content: "מודיעין אתרים | ח. סבן חומרי בניין" },
      {
        property: "og:description",
        content: "מפת אתרים ומרכז בקרה לוגיסטי למחסני החרש 10 והתלמיד 6.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SitesPage,
});

function EmptyState({
  icon: Icon = Database,
  title = "אין נתונים להצגה",
  text = "לא נמצאו רשומות מאומתות.",
}: {
  icon?: typeof Database;
  title?: string;
  text?: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={27} strokeWidth={1.5} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function SitesPage() {
  const [tab, setTab] = useState<Tab>("map");
  const [verifiedSites, setVerifiedSites] = useState<SiteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("severity");
  const [origin, setOrigin] = useState<string>("harash_10");
  const [delayed, setDelayed] = useState(19);
  const [critical, setCritical] = useState(26);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [draftDelayed, setDraftDelayed] = useState("19");
  const [draftCritical, setDraftCritical] = useState("26");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [plannedIds, setPlannedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  const loadSites = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const res = await getSitesServerFn();
      setVerifiedSites(res.sites.map(mapRawSiteToRecord));
      setFetchedAt(res.fetchedAt || new Date().toISOString());
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "שגיאה בטעינת נתוני האתרים");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSites();
  }, [loadSites]);

  const select = useCallback((id: string) => setSelectedId(id), []);

  const kpis = useMemo(() => {
    const total = verifiedSites.length;
    const criticalCount = verifiedSites.filter(
      (s) => severity(s.p80Min, delayed, critical) === "critical",
    ).length;
    const delayedCount = verifiedSites.filter(
      (s) => severity(s.p80Min, delayed, critical) === "delayed",
    ).length;
    const withGps = verifiedSites.filter((s) => validCoordinates(s.lat, s.lng)).length;
    const gpsPct = total > 0 ? Math.round((withGps / total) * 100) : 0;
    return { total, criticalCount, delayedCount, withGps, gpsPct };
  }, [verifiedSites, delayed, critical]);

  const sites = useMemo(
    () => filterSites(verifiedSites, query, filter, sort, delayed, critical, origin),
    [verifiedSites, query, filter, sort, delayed, critical, origin],
  );

  const selected = verifiedSites.find((s) => s.id === selectedId);
  const planned = plannedIds.flatMap((id) => {
    const site = verifiedSites.find((s) => s.id === id);
    return site ? [site] : [];
  });

  const togglePlan = (id: string) =>
    setPlannedIds((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));

  const resetFilters = () => {
    setQuery("");
    setFilter("all");
    setSort("severity");
  };

  const exportRows = () => {
    if (!sites.length) return;
    const quote = (value: unknown) =>
      `"${String(value ?? "")
        .replace(/"/g, '""')
        .replace(/^[=+@-]/, "'$&")}"`;
    const csv =
      "\uFEFF" +
      [
        ["אתר", "לקוח", "כתובת", "עיר", "ביקורים", "P80"],
        ...sites.map((s) => [s.id, s.customer, s.address, s.city, s.visits, s.p80Min]),
      ]
        .map((row) => row.map(quote).join(","))
        .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "saban-sites.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyPlan = async () => {
    try {
      await navigator.clipboard.writeText(
        `סבב אספקה · ${warehouses.find((w) => w.id === origin)?.name}\n${planned.map((s, i) => `${i + 1}. ${s.customer} — ${s.address}`).join("\n")}`,
      );
      setNotice("סבב האספקה הועתק");
    } catch {
      setNotice("לא ניתן להעתיק. יש לאפשר גישה ללוח ההעתקה.");
    }
  };

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        דלג לתוכן
      </a>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Building2 size={27} strokeWidth={1.7} />
          </div>
          <div>
            <strong>
              ח. סבן<span className="brand-dot">.</span>
            </strong>
            <span className="brand-sub">חומרי בניין · מאז 1994</span>
          </div>
        </div>
        <span className="topbar-divider" />
        <div className="workspace-name">
          מרכז תפעול<span>Site Intelligence</span>
        </div>
        <div className="topbar-actions">
          <span className="environment">
            <span />
            {loading ? "טוען..." : apiError ? "שגיאת חיבור" : "מחובר חי"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            title="מצב מקור הנתונים"
            aria-label="מצב מקור הנתונים"
            onClick={() => setSourceOpen(true)}
          >
            <CircleHelp size={20} />
          </Button>
          <div className="user-avatar" aria-label="ח. סבן">
            חס
          </div>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar" aria-label="סרגל עבודה">
          <div className="sidebar-label">סביבת תפעול</div>
          <Button variant="ghost" className="sidebar-current" onClick={() => setTab("map")}>
            <span>מודיעין אתרים</span>
            <ChevronLeft size={15} />
          </Button>
          <div className="sidebar-section">תצוגות עבודה</div>
          {tabs.slice(1).map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              data-active={tab === item.id}
              className="sidebar-link"
              onClick={() => setTab(item.id)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </Button>
          ))}
          <div className="sidebar-bottom">
            <div className="sidebar-label">מחסני מוצא</div>
            {warehouses.map((w) => (
              <div className="sidebar-warehouse" key={w.id}>
                <Warehouse size={17} />
                <span>{w.name}</span>
                <span className="warehouse-dot" />
              </div>
            ))}
            <div className="secure-note">
              <ShieldCheck size={15} />
              <span>נתונים מאומתים בלבד</span>
            </div>
            <span className="version">SABAN · SITE INTELLIGENCE</span>
          </div>
        </aside>
        <main id="main-content" className="main-content">
          <div className="breadcrumbs">
            <span>מרכז תפעול</span>
            <ChevronLeft size={13} />
            <span>מודיעין אתרים</span>
          </div>
          <div className="page-heading">
            <div>
              <div className="title-row">
                <h1>מודיעין אתרים</h1>
                <span className="page-badge">מרכז בקרה</span>
              </div>
              <p>תמונת מצב תפעולית · אתרים, זמני פריקה ותכנון אספקה</p>
            </div>
            <div className="heading-actions">
              <Button variant="outline" onClick={exportRows} disabled={!sites.length}>
                <Download />
                ייצוא נתונים
              </Button>
              <Button variant="outline" onClick={loadSites} disabled={loading}>
                <RefreshCw className={loading ? "animate-spin" : ""} />
                רענן
              </Button>
              <Button onClick={() => setSourceOpen(true)}>
                <Database />
                מקור נתונים
                <ArrowLeft />
              </Button>
            </div>
          </div>
          {(loading || apiError) && (
            <div className="source-banner">
              <div className="source-banner-icon">
                <Radio size={19} />
              </div>
              <div>
                <strong>
                  {loading ? "טוען נתוני אתרים חיים..." : "שגיאה בחיבור למקור הנתונים"}
                </strong>
                <span>
                  {loading
                    ? "מושך נתונים מאומתים מגיליון בדיקת תעודות משלוח."
                    : apiError}
                </span>
              </div>
              <Button variant="ghost" onClick={apiError ? loadSites : () => setSourceOpen(true)}>
                {apiError ? "נסה שוב" : "פרטי החיבור"}
                <ChevronLeft />
              </Button>
            </div>
          )}
          <section className="kpi-grid" aria-label="מדדי אתרים">
            {[
              {
                title: "סה״כ אתרים",
                icon: MapPin,
                mode: "all",
                tone: "blue",
                value: loading ? "—" : String(kpis.total),
                sub: "אתרים פעילים",
                note: "אתרים במערכת",
              },
              {
                title: "אתרים קריטיים",
                icon: TriangleAlert,
                mode: "critical",
                tone: "critical",
                value: loading ? "—" : String(kpis.criticalCount),
                sub: "ממתין לטיפול",
                note: `P80 ≥ ${critical} דקות`,
              },
              {
                title: "אתרים מעכבים",
                icon: Clock3,
                mode: "delayed",
                tone: "delayed",
                value: loading ? "—" : String(kpis.delayedCount),
                sub: "זמן פריקה בינוני",
                note: `${delayed} ≤ P80 < ${critical} דקות`,
              },
              {
                title: "כיסוי GPS",
                icon: LocateFixed,
                mode: "missing_gps",
                tone: "success",
                value: loading ? "—" : `${kpis.gpsPct}%`,
                sub: `${kpis.withGps}/${kpis.total}`,
                note: "אתרים עם מיקום תקין",
              },
            ].map((kpi) => (
              <Button
                variant="kpi"
                key={kpi.title}
                className="kpi-card"
                data-active={filter !== "all" && filter === kpi.mode}
                onClick={() => setFilter(filter === kpi.mode ? "all" : (kpi.mode as Filter))}
              >
                <div className="kpi-top">
                  <span>{kpi.title}</span>
                  <div className={`kpi-icon tone-${kpi.tone}`}>
                    <kpi.icon size={18} />
                  </div>
                </div>
                <div className="kpi-value">
                  {kpi.value}
                  <span>{kpi.sub}</span>
                </div>
                <div className="kpi-bottom">
                  <span>{kpi.note}</span>
                  {kpi.mode === "missing_gps" ? (
                    <span className="gps-track" />
                  ) : (
                    <ChevronLeft size={14} />
                  )}
                </div>
              </Button>
            ))}
          </section>
          <nav className="tabs" aria-label="תצוגות מודיעין אתרים" role="tablist">
            {tabs.map((item) => (
              <Button
                key={item.id}
                id={`tab-${item.id}`}
                role="tab"
                variant="tab"
                data-active={tab === item.id}
                aria-selected={tab === item.id}
                aria-controls={`panel-${tab}`}
                onClick={() => setTab(item.id)}
                onKeyDown={(event) => {
                  if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                    event.preventDefault();
                    const index = tabs.findIndex((t) => t.id === tab);
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : (index + (event.key === "ArrowLeft" ? 1 : -1) + tabs.length) %
                            tabs.length;
                    setTab(tabs[next].id);
                    document.getElementById(`tab-${tabs[next].id}`)?.focus();
                  }
                }}
              >
                <item.icon />
                <span>{item.label}</span>
                {item.id === "planning" && plannedIds.length > 0 && (
                  <span className="tab-count">{plannedIds.length}</span>
                )}
              </Button>
            ))}
          </nav>
          <section className="filter-toolbar" aria-label="חיפוש וסינון">
            <div className="search-field">
              <Search size={18} />
              <input
                type="search"
                aria-label="חיפוש אתרים"
                placeholder="חיפוש לקוח, כתובת, עיר או מספר אתר…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="נקה חיפוש"
                  onClick={() => setQuery("")}
                >
                  <X />
                </Button>
              )}
            </div>
            <div className="toolbar-select">
              <ArrowUpDown size={16} />
              <select
                aria-label="מיון אתרים"
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
              >
                <option value="severity">חומרה ו־P80</option>
                <option value="p80">P80 הגבוה ביותר</option>
                <option value="visits">מספר ביקורים</option>
                <option value="distance">מרחק ממחסן מוצא</option>
              </select>
              <ChevronDown size={14} />
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setDraftDelayed(String(delayed));
                setDraftCritical(String(critical));
                setSettingsOpen(true);
              }}
            >
              <SlidersHorizontal />
              ספי חומרה
            </Button>
          </section>
          <div className="filter-row">
            <div className="filter-chips">
              <span className="filter-label">
                <FilterIcon size={14} />
                סינון:
              </span>
              {[
                { id: "all", name: "כל האתרים" },
                { id: "critical", name: "קריטיים" },
                { id: "delayed", name: "מעכבים" },
                { id: "normal", name: "תקינים" },
                { id: "missing_gps", name: "ללא GPS" },
              ].map((item) => (
                <Button
                  key={item.id}
                  variant="filter"
                  size="sm"
                  data-active={filter === item.id}
                  onClick={() => setFilter(item.id as Filter)}
                >
                  {item.id !== "all" && <span className={`status-dot dot-${item.id}`} />}
                  {item.name}
                </Button>
              ))}
            </div>
            <label className="origin-selector">
              <Warehouse size={15} />
              <span>מחסן מוצא:</span>
              <select
                aria-label="מחסן מוצא"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
            className="tab-panel"
          >
            {tab === "map" && (
              <section className="map-workspace">
                <div className="map-section">
                  <div className="section-header">
                    <div>
                      <h2>מפת אתרים ומחסנים</h2>
                    </div>
                    <span className="section-subtitle">מחסני ח. סבן</span>
                  </div>
                  <Suspense fallback={<div className="map-frame map-loading">טוען מפה…</div>}>
                    <SiteMap
                      sites={sites}
                      selectedId={selectedId}
                      onSelect={select}
                      delayed={delayed}
                      critical={critical}
                      origin={origin}
                    />
                  </Suspense>
                  <div className="map-legend">
                    <span>
                      <span className="legend-warehouse">
                        <Warehouse size={13} />
                      </span>
                      מחסן
                    </span>
                    <span>
                      <i className="status-dot dot-normal" />
                      תקין
                    </span>
                    <span>
                      <i className="status-dot dot-delayed" />
                      מעכב
                    </span>
                    <span>
                      <i className="status-dot dot-critical" />
                      קריטי
                    </span>
                    <span className="map-provider">OpenStreetMap</span>
                  </div>
                </div>
                <div className="site-list">
                  <div className="section-header">
                    <div>
                      <ClipboardList size={17} />
                      <h2>רשימת אתרים</h2>
                    </div>
                    <span className="count-badge">{sites.length}</span>
                  </div>
                  <div className="list-status">
                    <span>
                      {filter === "all"
                        ? "כל האתרים"
                        : filter === "missing_gps"
                          ? "ללא GPS"
                          : labels[filter]}
                    </span>
                    <span>
                      {loading ? "טוען..." : apiError ? "שגיאת חיבור" : "מחובר בזמן אמת"}
                    </span>
                  </div>
                  {sites.length ? (
                    <div className="site-items">
                      {sites.map((site) => (
                        <Button
                          variant="kpi"
                          className="site-item"
                          key={site.id}
                          data-active={site.id === selectedId}
                          onClick={() => select(site.id)}
                        >
                          <div>
                            <strong>{site.customer}</strong>
                            <span>{site.address}</span>
                          </div>
                          <span
                            className={`severity-badge severity-${severity(site.p80Min, delayed, critical)}`}
                          >
                            {labels[severity(site.p80Min, delayed, critical)]}
                          </span>
                          <div className="site-item-meta">
                            {fmt(site.visits)} ביקורים · P80 {fmt(site.p80Min, " דק׳")}
                          </div>
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={MapPin}
                      title={loading ? "טוען אתרים..." : "אין אתרים להצגה"}
                      text={
                        loading
                          ? "מייבא נתונים מהגיליון."
                          : "נסה לשנות את מסנני החיפוש או לרענן את הנתונים."
                      }
                    />
                  )}
                  <div className="list-footer">
                    <Database size={14} />
                    <span>נתונים מאומתים מ־Google Sheets</span>
                  </div>
                </div>
              </section>
            )}
            {tab === "analytics" && (
              <section className="data-section">
                <div className="section-header">
                  <div>
                    <Activity size={18} />
                    <h2>ביצועי אתרים</h2>
                  </div>
                  <span className="section-subtitle">ביקורים וזמני פריקה</span>
                </div>
                {sites.length ? (
                  <SiteTable sites={sites} onSelect={select} />
                ) : (
                  <EmptyState
                    icon={Activity}
                    title="אין נתוני פריקה לניתוח"
                    text="לא נמצאו אתרים תואמים לסינון הנוכחי."
                  />
                )}
                <div className="data-footnote">
                  <Clock3 size={15} />
                  מגמות היסטוריות: אין רשומות מתוארכות מחוברות
                </div>
              </section>
            )}
            {tab === "warehouses" && (
              <section className="data-section">
                <div className="section-header">
                  <div>
                    <Warehouse size={18} />
                    <h2>השוואת מחסני מוצא</h2>
                  </div>
                  <span className="section-subtitle">החרש 10 מול התלמיד 6</span>
                </div>
                <div className="warehouse-comparison">
                  {warehouses.map((w) => (
                    <div className="warehouse-summary" key={w.id}>
                      <div className="warehouse-summary-icon">
                        <Warehouse size={24} />
                      </div>
                      <div>
                        <h3>{w.name}</h3>
                        <span>מחסן מוצא</span>
                      </div>
                      <Button
                        variant={origin === w.id ? "secondary" : "outline"}
                        onClick={() => setOrigin(w.id)}
                      >
                        {origin === w.id ? <Check /> : <Plus />}
                        {origin === w.id ? "מוצא נבחר" : "בחר כמוצא"}
                      </Button>
                      <div className="warehouse-metrics">
                        <span>
                          מרחק לאתרים
                          <strong>
                            — <small>ק״מ</small>
                          </strong>
                        </span>
                        <span>
                          זמן נסיעה
                          <strong>
                            — <small>דקות</small>
                          </strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {sites.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>אתר</th>
                          <th>החרש 10 · ק״מ / דק׳</th>
                          <th>התלמיד 6 · ק״מ / דק׳</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sites.map((s) => (
                          <tr key={s.id}>
                            <td>{s.customer}</td>
                            <td>
                              {fmt(s.distHarashKm)} / {fmt(s.driveHarashMin)}
                            </td>
                            <td>
                              {fmt(s.distTalmidKm)} / {fmt(s.driveTalmidMin)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    icon={RouteIcon}
                    title="אין נתוני מרחק ונסיעה להשוואה"
                    text="לא נמצאו אתרים תואמים לסינון הנוכחי."
                  />
                )}
              </section>
            )}
            {tab === "customers" && (
              <section className="data-section">
                <div className="section-header">
                  <div>
                    <Users size={18} />
                    <h2>לקוחות ואתרים משויכים</h2>
                  </div>
                  <span className="section-subtitle">פרופיל לקוח</span>
                </div>
                {sites.length ? (
                  <div className="customer-grid">
                    {Array.from(new Set(sites.map((s) => s.customerCode || s.customer))).map(
                      (key) => {
                        const group = sites.filter((s) => (s.customerCode || s.customer) === key);
                        return (
                          <article className="customer-item" key={key}>
                            <Users />
                            <h3>{group[0]?.customer}</h3>
                            <span>{group.length} אתרים</span>
                            {group.map((s) => (
                              <Button
                                key={s.id}
                                variant="ghost"
                                onClick={() => {
                                  select(s.id);
                                  setTab("map");
                                }}
                              >
                                {s.address}
                                <ChevronLeft />
                              </Button>
                            ))}
                          </article>
                        );
                      },
                    )}
                  </div>
                ) : (
                  <EmptyState
                    icon={Users}
                    title="אין לקוחות להצגה"
                    text="לא נמצאו לקוחות תואמים לסינון הנוכחי."
                  />
                )}
                <div className="data-footnote">
                  <ShieldCheck size={15} />
                  היסטוריית רכישות ואספקות אינה מחוברת
                </div>
              </section>
            )}
            {tab === "planning" && (
              <section className="data-section">
                <div className="section-header">
                  <div>
                    <RouteIcon size={18} />
                    <h2>סבב אספקה</h2>
                    <span className="count-badge">{planned.length}</span>
                  </div>
                  <Button variant="outline" disabled={!planned.length} onClick={copyPlan}>
                    <Copy />
                    העתק סבב
                  </Button>
                </div>
                <div className="planning-origin">
                  <Warehouse size={19} />
                  <span>מחסן מוצא</span>
                  <strong>{warehouses.find((w) => w.id === origin)?.name}</strong>
                </div>
                {planned.length ? (
                  <ol className="plan-list">
                    {planned.map((s, i) => (
                      <li key={s.id}>
                        <span className="plan-index">{i + 1}</span>
                        <div>
                          <strong>{s.customer}</strong>
                          <p>{s.address}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`הסר ${s.customer} מהסבב`}
                          onClick={() => togglePlan(s.id)}
                        >
                          <X />
                        </Button>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <EmptyState
                    icon={RouteIcon}
                    title="לא נבחרו אתרים לסבב"
                    text="בחר אתר מהמפה או מהרשימה ולחץ על 'הוסף לסבב'."
                  />
                )}
                <div className="data-footnote">
                  <ShieldCheck size={15} />
                  סדר תחנות ידני · ללא אופטימיזציה או זמני נסיעה משוערים
                </div>
              </section>
            )}
          </div>
          {selected && (
            <section className="selected-profile">
              <div className="section-header">
                <div>
                  <MapPin />
                  <h2>{selected.customer}</h2>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="סגור פרטי אתר"
                  onClick={() => setSelectedId(null)}
                >
                  <X />
                </Button>
              </div>
              <p>
                {selected.address} · {selected.city}
              </p>
              <div className="profile-stats">
                <span>
                  ביקורים <strong>{fmt(selected.visits)}</strong>
                </span>
                <span>
                  ממוצע <strong>{fmt(selected.avgStopMin, " דק׳")}</strong>
                </span>
                <span>
                  מקסימום <strong>{fmt(selected.maxStopMin, " דק׳")}</strong>
                </span>
                <span>
                  P80 <strong>{fmt(selected.p80Min, " דק׳")}</strong>
                </span>
                <span>
                  {validCoordinates(selected.lat, selected.lng) ? "GPS תקין" : "GPS חסר או לא תקין"}
                </span>
              </div>
              <div className="profile-actions">
                <Button onClick={() => togglePlan(selected.id)}>
                  {plannedIds.includes(selected.id) ? <Check /> : <Plus />}
                  {plannedIds.includes(selected.id) ? "הסר מהסבב" : "הוסף לסבב"}
                </Button>
                <Button variant="outline" asChild>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(validCoordinates(selected.lat, selected.lng) ? `${selected.lat},${selected.lng}` : `${selected.address} ${selected.city}`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink />
                    Google Maps
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a
                    href={`https://waze.com/ul?${validCoordinates(selected.lat, selected.lng) ? `ll=${selected.lat},${selected.lng}` : `q=${encodeURIComponent(`${selected.address} ${selected.city}`)}`}&navigate=yes`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Navigation />
                    Waze
                  </a>
                </Button>
              </div>
            </section>
          )}
          {(query || filter !== "all") && (
            <div className="reset-row">
              <span>מסננים פעילים</span>
              <Button variant="link" onClick={resetFilters}>
                נקה מסננים
                <X />
              </Button>
            </div>
          )}
          <footer className="page-footer">
            <span>ח. סבן חומרי בניין (1994) בע״מ</span>
            <span>
              <span className="offline-dot" />
              {apiError ? "שגיאת חיבור" : "מחובר ל־Google Apps Script"}
            </span>
          </footer>
        </main>
      </div>
      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSettingsOpen(false);
              if (e.key === "Tab") {
                const controls = e.currentTarget.querySelectorAll<HTMLElement>(
                  "button:not(:disabled), input",
                );
                const first = controls.item(0);
                const last = controls.item(controls.length - 1);
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <div className="section-header">
              <div>
                <Settings2 />
                <h2 id="settings-title">ספי חומרה</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                autoFocus
                aria-label="סגור הגדרות"
                onClick={() => setSettingsOpen(false)}
              >
                <X />
              </Button>
            </div>
            <div className="modal-body">
              <label>
                סף מעכב · דקות
                <input
                  type="number"
                  min="1"
                  max="119"
                  value={draftDelayed}
                  onChange={(e) => setDraftDelayed(e.target.value)}
                />
              </label>
              <label>
                סף קריטי · דקות
                <input
                  type="number"
                  min="2"
                  max="120"
                  value={draftCritical}
                  onChange={(e) => setDraftCritical(e.target.value)}
                />
              </label>
              <p>הסיווג מבוסס על P80. אתר ללא נתון P80 לא יסווג.</p>
              {!validThresholds(Number(draftDelayed), Number(draftCritical)) && (
                <p className="validation-error" role="alert">
                  הסף הקריטי חייב להיות גבוה מהסף המעכב, ועד 120 דקות.
                </p>
              )}
              <Button
                className="w-full"
                disabled={!validThresholds(Number(draftDelayed), Number(draftCritical))}
                onClick={() => {
                  setDelayed(Number(draftDelayed));
                  setCritical(Number(draftCritical));
                  setSettingsOpen(false);
                  setNotice("ספי החומרה עודכנו");
                }}
              >
                <Check />
                שמור ספים
              </Button>
            </div>
          </section>
        </div>
      )}
      {sourceOpen && (
        <div className="modal-backdrop" onClick={() => setSourceOpen(false)}>
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="source-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSourceOpen(false);
              if (e.key === "Tab") {
                e.preventDefault();
                e.currentTarget.querySelector<HTMLElement>("button")?.focus();
              }
            }}
          >
            <div className="section-header">
              <div>
                <Database />
                <h2 id="source-title">מצב מקור הנתונים</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                autoFocus
                aria-label="סגור פרטי חיבור"
                onClick={() => setSourceOpen(false)}
              >
                <X />
              </Button>
            </div>
            <div className="modal-body">
              <span className="connection-state">
                <span className="offline-dot" />
                {loading ? "טוען..." : apiError ? "שגיאה" : "מחובר"}
              </span>
              <h3>Google Apps Script (Server Proxy)</h3>
              <p>
                {apiError
                  ? apiError
                  : `טעונים ${kpis.total} אתרים (${kpis.withGps} עם GPS תקין). עדכון אחרון: ${fetchedAt ? new Date(fetchedAt).toLocaleString("he-IL") : "—"}`}
              </p>
              <div className="source-requirements">
                <ShieldCheck />
                <span>
                  הקריאה מתבצעת מצד השרת דרך getSitesServerFn ללא חשיפת מפתחות בדפדפן.
                </span>
              </div>
              <Button className="w-full" onClick={loadSites} disabled={loading}>
                <RefreshCw className={loading ? "animate-spin" : ""} />
                רענן נתונים עכשיו
              </Button>
            </div>
          </section>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          <Check size={18} />
          <span>{notice}</span>
          <Button variant="ghost" size="icon" aria-label="סגור הודעה" onClick={() => setNotice("")}>
            <X />
          </Button>
        </div>
      )}
    </div>
  );
}

function SiteTable({ sites, onSelect }: { sites: SiteRecord[]; onSelect: (id: string) => void }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>לקוח / אתר</th>
            <th>ביקורים</th>
            <th>ממוצע · דק׳</th>
            <th>מקסימום · דק׳</th>
            <th>P80 · דק׳</th>
          </tr>
        </thead>
        <tbody>
          {sites.map((s) => (
            <tr key={s.id}>
              <td>
                <Button variant="link" onClick={() => onSelect(s.id)}>
                  {s.customer}
                </Button>
                <p>{s.address}</p>
              </td>
              <td>{fmt(s.visits)}</td>
              <td>{fmt(s.avgStopMin)}</td>
              <td>{fmt(s.maxStopMin)}</td>
              <td>{fmt(s.p80Min)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
