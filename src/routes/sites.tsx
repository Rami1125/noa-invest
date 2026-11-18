import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Map as MapIcon,
  MapPin,
  Navigation,
  RefreshCw,
  Route as RouteIcon,
  Search,
  Users,
  Warehouse,
} from 'lucide-react';
import { getSitesServerFn, type RawSiteRow, type WarehouseOrigin } from '../lib/sites-api.functions';

export const Route = createFileRoute('/sites')({
  component: SitesIntelligencePage,
});

type TabId = 'map' | 'analytics' | 'warehouses' | 'customers' | 'planning';
type Severity = 'normal' | 'delayed' | 'critical';
type SortKey = 'severity' | 'p80' | 'visits' | 'distance';

interface SiteRecord {
  id: string;
  siteKey: string;
  customerRaw: string;
  customerDisplay: string;
  customerCode: string;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  severity: Severity;
  visits: number;
  avgStopMin: number | null;
  maxStopMin: number | null;
  p80Min: number | null;
  cumulativeMin: number;
  distHarashKm: number | null;
  driveHarashMin: number | null;
  distTalmidKm: number | null;
  driveTalmidMin: number | null;
}

const DEFAULT_WAREHOUSES: WarehouseOrigin[] = [
  { id: 'harash_10', key: 'harash_10', name: 'מחסן החרש 10', short: 'חרש 10', address: 'החרש 10', lat: 32.1508, lng: 34.8926 },
  { id: 'hatalmid_6', key: 'hatalmid_6', name: 'מחסן התלמיד 6', short: 'תלמיד 6', address: 'התלמיד 6', lat: 32.1544, lng: 34.8886 },
];

function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidCoord(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 29 &&
    lat <= 34 &&
    lng >= 33 &&
    lng <= 37
  );
}

function toNum(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseCustomerDisplay(raw: string): { display: string; code: string } {
  const first = raw.split(';')[0]?.trim() || 'לקוח ללא שם';
  const match = first.match(/^(\d{5,7})\s+(.+)$/);
  if (match) return { code: match[1], display: match[2].trim() };
  return { code: '', display: first };
}

function normalizeSite(raw: RawSiteRow, idx: number, criticalThreshold: number, delayedThreshold: number): SiteRecord {
  const lat = toNum(raw.lat);
  const lng = toNum(raw.lng);
  const p80 = toNum(raw.p80Min);
  const avg = toNum(raw.avgStopMin);
  const visits = Number(raw.visits ?? 0);
  const rawSev = String(raw.severity || '').toLowerCase();

  let severity: Severity = 'normal';
  if (p80 !== null) {
    if (p80 >= criticalThreshold) severity = 'critical';
    else if (p80 >= delayedThreshold) severity = 'delayed';
  } else if (rawSev === 'critical') {
    severity = 'critical';
  } else if (rawSev === 'delayed') {
    severity = 'delayed';
  }

  const customerRaw = String(raw.customer || 'לקוח ללא שם');
  const { display, code } = parseCustomerDisplay(customerRaw);

  return {
    id: String(raw.rowNumber ?? raw.siteKey ?? `site-${idx}`),
    siteKey: String(raw.siteKey || ''),
    customerRaw,
    customerDisplay: display,
    customerCode: String(raw.customerNo || code),
    address: String(raw.address || ''),
    city: String(raw.city || ''),
    lat: isValidCoord(lat, lng) ? lat : null,
    lng: isValidCoord(lat, lng) ? lng : null,
    severity,
    visits,
    avgStopMin: avg,
    maxStopMin: toNum(raw.maxStopMin),
    p80Min: p80,
    cumulativeMin: Math.round((avg ?? 0) * visits),
    distHarashKm: toNum(raw.distHarashKm),
    driveHarashMin: toNum(raw.driveHarashMin),
    distTalmidKm: toNum(raw.distTalmidKm),
    driveTalmidMin: toNum(raw.driveTalmidMin),
  };
}

function loadLeafletAssets(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('SSR'));
    const ensureCss = (id: string, href: string) => {
      if (!document.getElementById(id)) {
        const l = document.createElement('link');
        l.id = id;
        l.rel = 'stylesheet';
        l.href = href;
        document.head.appendChild(l);
      }
    };
    ensureCss('leaflet-css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
    ensureCss('mc-css', 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css');
    ensureCss('mc-def-css', 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css');

    const loadScript = (id: string, src: string) =>
      new Promise<void>((res, rej) => {
        const existing = document.getElementById(id) as HTMLScriptElement | null;
        if (existing) {
          res();
          return;
        }
        const s = document.createElement('script');
        s.id = id;
        s.src = src;
        s.async = false;
        s.onload = () => res();
        s.onerror = () => rej(new Error(`כשל בטעינת ${src}`));
        document.head.appendChild(s);
      });

    const win = window as any;
    if (win.L && win.L.markerClusterGroup) {
      resolve(win.L);
      return;
    }

    loadScript('leaflet-js', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js')
      .then(() => loadScript('mc-js', 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js'))
      .then(() => resolve((window as any).L))
      .catch(reject);
  });
}

function getSeverityMeta(sev: Severity) {
  if (sev === 'critical') return { label: 'קריטי', color: '#DC2626', bg: 'bg-red-50 text-red-700 border-red-200', rank: 3 };
  if (sev === 'delayed') return { label: 'מעכב', color: '#D97706', bg: 'bg-amber-50 text-amber-800 border-amber-200', rank: 2 };
  return { label: 'תקין', color: '#1769AA', bg: 'bg-blue-50 text-[#1769AA] border-blue-200', rank: 1 };
}

function SitesIntelligencePage() {
  const [activeTab, setActiveTab] = useState<TabId>('map');
  const [rawSites, setRawSites] = useState<RawSiteRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOrigin[]>(DEFAULT_WAREHOUSES);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | Severity | 'missing_gps'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('severity');
  const [criticalThreshold, setCriticalThreshold] = useState(26);
  const [delayedThreshold, setDelayedThreshold] = useState(19);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [plannedIds, setPlannedIds] = useState<string[]>([]);
  const [copiedMsg, setCopiedMsg] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const clusterRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const data = await getSitesServerFn();
      setRawSites(data.sites);
      if (data.warehouses.length > 0) setWarehouses(data.warehouses);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'שגיאה בטעינת נתוני אתרים מהשרת');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sites = useMemo(
    () => rawSites.map((r, i) => normalizeSite(r, i, criticalThreshold, delayedThreshold)),
    [rawSites, criticalThreshold, delayedThreshold]
  );

  const kpis = useMemo(() => {
    const total = sites.length;
    const withGps = sites.filter((s) => s.lat !== null && s.lng !== null).length;
    const critical = sites.filter((s) => s.severity === 'critical').length;
    const delayed = sites.filter((s) => s.severity === 'delayed').length;
    const gpsPct = total > 0 ? Math.round((withGps / total) * 100) : 0;
    return { total, withGps, gpsPct, critical, delayed };
  }, [sites]);

  const filteredSites = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = sites.filter((s) => {
      if (filterMode === 'missing_gps' && s.lat !== null) return false;
      if ((filterMode === 'critical' || filterMode === 'delayed' || filterMode === 'normal') && s.severity !== filterMode) return false;
      if (!q) return true;
      return (
        s.customerDisplay.toLowerCase().includes(q) ||
        s.customerCode.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q) ||
        s.siteKey.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortKey === 'p80') return (b.p80Min ?? -1) - (a.p80Min ?? -1);
      if (sortKey === 'visits') return b.visits - a.visits;
      if (sortKey === 'distance') return (a.distHarashKm ?? 9999) - (b.distHarashKm ?? 9999);
      return getSeverityMeta(b.severity).rank - getSeverityMeta(a.severity).rank || (b.p80Min ?? 0) - (a.p80Min ?? 0);
    });
  }, [sites, search, filterMode, sortKey]);

  const selectedSite = useMemo(() => sites.find((s) => s.id === selectedId) || null, [sites, selectedId]);

  const customerGroups = useMemo(() => {
    const map = new Map<string, { name: string; code: string; sites: SiteRecord[]; totalVisits: number; maxP80: number }>();
    sites.forEach((s) => {
      const key = s.customerCode || s.customerDisplay;
      const cur = map.get(key) || { name: s.customerDisplay, code: s.customerCode, sites: [], totalVisits: 0, maxP80: 0 };
      cur.sites.push(s);
      cur.totalVisits += s.visits;
      cur.maxP80 = Math.max(cur.maxP80, s.p80Min ?? 0);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.totalVisits - a.totalVisits);
  }, [sites]);

  const plannedSites = useMemo(() => sites.filter((s) => plannedIds.includes(s.id)), [sites, plannedIds]);

  useEffect(() => {
    if (activeTab !== 'map') return;
    let cancelled = false;
    loadLeafletAssets()
      .then((L) => {
        if (cancelled || !mapContainerRef.current || mapRef.current) return;
        leafletRef.current = L;
        const map = L.map(mapContainerRef.current, { center: [32.1525, 34.8906], zoom: 12 });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
          maxZoom: 19,
        }).addTo(map);
        clusterRef.current = L.markerClusterGroup({ maxClusterRadius: 45 }).addTo(map);
        mapRef.current = map;
        setMapReady(true);
      })
      .catch((err) => {
        if (!cancelled) setMapError(err instanceof Error ? err.message : 'שגיאה בטעינת רכיב המפה');
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        clusterRef.current = null;
        setMapReady(false);
      }
    };
  }, [activeTab]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const cluster = clusterRef.current;
    if (!mapReady || !L || !map || !cluster) return;

    cluster.clearLayers();
    const bounds = L.latLngBounds([]);

    warehouses.forEach((wh) => {
      if (!isValidCoord(wh.lat, wh.lng)) return;
      const icon = L.divIcon({
        className: 'saban-wh-marker',
        html: `<div style="background:#102A43;color:#FFFFFF;font-family:Rubik,Heebo,sans-serif;font-weight:700;font-size:11px;padding:4px 10px;border-radius:9999px;border:2px solid #FFFFFF;box-shadow:0 2px 8px rgba(0,0,0,0.3);white-space:nowrap;">${escapeHtml(wh.name)}</div>`,
        iconSize: [120, 26],
        iconAnchor: [60, 13],
      });
      L.marker([wh.lat, wh.lng], { icon })
        .bindPopup(`<div dir="rtl" style="font-family:Rubik,Heebo,sans-serif;"><strong>${escapeHtml(wh.name)}</strong><br/>מחסן מוצא</div>`)
        .addTo(map);
      bounds.extend([wh.lat, wh.lng]);
    });

    filteredSites.forEach((site) => {
      if (!isValidCoord(site.lat, site.lng)) return;
      const meta = getSeverityMeta(site.severity);
      const isSelected = site.id === selectedId;
      const marker = L.circleMarker([site.lat, site.lng], {
        radius: isSelected ? 11 : 7,
        fillColor: meta.color,
        color: '#FFFFFF',
        weight: isSelected ? 3 : 2,
        opacity: 1,
        fillOpacity: 0.94,
      });

      marker.bindPopup(
        `<div dir="rtl" style="font-family:Rubik,Heebo,sans-serif;min-width:180px;">
          <div style="font-weight:700;color:#102A43;">${escapeHtml(site.customerDisplay)}</div>
          <div style="font-size:12px;color:#475569;margin-top:2px;">${escapeHtml(site.address)}</div>
          <div style="font-size:12px;margin-top:6px;">ביקורים: <strong>${escapeHtml(site.visits)}</strong>${site.p80Min !== null ? ` · P80: <strong>${escapeHtml(site.p80Min)} דק׳</strong>` : ''}</div>
        </div>`
      );

      marker.on('click', () => {
        setSelectedId(site.id);
        cardRefs.current[site.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });

      cluster.addLayer(marker);
      bounds.extend([site.lat, site.lng]);
      if (isSelected) map.flyTo([site.lat, site.lng], 14, { duration: 0.45 });
    });

    if (bounds.isValid() && !selectedId) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [mapReady, filteredSites, warehouses, selectedId]);

  const togglePlanSite = (id: string) => {
    setPlannedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const copyPlanSummary = async () => {
    const lines = plannedSites.map(
      (s, i) => `${i + 1}. ${s.customerDisplay} — ${s.address} (P80: ${s.p80Min ?? '—'} דק׳)`
    );
    const text = `תכנון סבב אספקה (${plannedSites.length} תחנות):\n${lines.join('\n')}`;
    await navigator.clipboard.writeText(text);
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 2000);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#F3F7FB] text-[#102A43] p-4 md:p-6 font-['Rubik','Heebo',sans-serif]">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* כותרת וכפתור רענון */}
        <header className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="w-6 h-6 text-[#1769AA]" />
              <h1 className="text-xl md:text-2xl font-bold text-[#102A43]">מודיעין אתרים · ח. סבן</h1>
            </div>
            <p className="text-sm text-slate-600 mt-1">בקרת זמני פריקה, כיסוי GPS ותכנון סבבים — החרש 10 והתלמיד 6</p>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#102A43] text-white text-sm font-semibold hover:bg-[#1769AA] transition inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            רענן נתונים
          </button>
        </header>

        {/* כרטיסי KPI לחיצים */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'סה״כ אתרים', val: kpis.total, icon: MapPin, mode: 'all' as const, accent: 'text-[#102A43]' },
            { label: `קריטיים (≥${criticalThreshold}ד׳)`, val: kpis.critical, icon: AlertTriangle, mode: 'critical' as const, accent: 'text-red-600' },
            { label: `מעכבים (${delayedThreshold}–${criticalThreshold - 1}ד׳)`, val: kpis.delayed, icon: Clock, mode: 'delayed' as const, accent: 'text-amber-600' },
            { label: `כיסוי GPS (${kpis.gpsPct}%)`, val: `${kpis.withGps}/${kpis.total}`, icon: Navigation, mode: 'missing_gps' as const, accent: 'text-[#1769AA]' },
          ].map((item) => {
            const Icon = item.icon;
            const active = filterMode === item.mode;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => setFilterMode(active ? 'all' : item.mode)}
                className={`min-h-[76px] text-right bg-white rounded-2xl border p-4 shadow-sm transition flex items-center justify-between ${
                  active ? 'border-[#1769AA] ring-2 ring-[#1769AA]/20' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="text-xs text-slate-500 font-medium">{item.label}</div>
                  <div className={`text-2xl font-bold mt-1 ${item.accent}`}>{loading ? '—' : item.val}</div>
                </div>
                <Icon className={`w-6 h-6 ${item.accent} opacity-80`} />
              </button>
            );
          })}
        </section>

        {/* סרגל 5 טאבים */}
        <nav aria-label="ניווט מודיעין אתרים" className="bg-white rounded-2xl border border-slate-200 p-1.5 shadow-sm flex overflow-x-auto gap-1">
          {[
            { id: 'map' as const, label: 'מפת אתרים', icon: MapIcon },
            { id: 'analytics' as const, label: 'אנליטיקת אתרים', icon: Activity },
            { id: 'warehouses' as const, label: 'השוואת מחסנים', icon: Warehouse },
            { id: 'customers' as const, label: 'מודיעין לקוחות', icon: Users },
            { id: 'planning' as const, label: `תכנון אספקה (${plannedIds.length})`, icon: RouteIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap inline-flex items-center gap-2 transition ${
                  active ? 'bg-[#1769AA] text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* הודעת שגיאת API */}
        {apiError && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 flex items-center justify-between gap-4">
            <span className="text-sm font-medium">{apiError}</span>
            <button type="button" onClick={loadData} className="min-h-[44px] px-4 rounded-xl bg-red-600 text-white text-xs font-semibold">
              נסה שוב
            </button>
          </div>
        )}

        {/* פילטרים וחיפוש */}
        <section className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לקוח, מספר לקוח, כתובת או עיר..."
              aria-label="חיפוש אתרים"
              className="w-full min-h-[44px] pr-10 pl-3 rounded-xl border border-slate-300 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#1769AA]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="מיון אתרים"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="min-h-[44px] px-3 rounded-xl border border-slate-300 text-sm bg-white"
            >
              <option value="severity">מיון: חומרה ו־P80</option>
              <option value="p80">מיון: P80 הגבוה ביותר</option>
              <option value="visits">מיון: כמות ביקורים</option>
              <option value="distance">מיון: קרבה להחרש 10</option>
            </select>
            <label className="text-xs text-slate-600 flex items-center gap-1 bg-slate-50 px-2.5 py-2 rounded-xl border border-slate-200">
              סף קריטי (דק׳):
              <input
                type="number"
                min={10}
                max={120}
                value={criticalThreshold}
                onChange={(e) => setCriticalThreshold(Number(e.target.value) || 26)}
                className="w-12 text-center font-bold bg-white border border-slate-300 rounded px-1 py-0.5"
              />
            </label>
          </div>
        </section>

        {/* כרטיס פרטים לאתר נבחר */}
        {selectedSite && (
          <section className="bg-white rounded-2xl border-2 border-[#1769AA] p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${getSeverityMeta(selectedSite.severity).bg}`}>
                  {getSeverityMeta(selectedSite.severity).label}
                </span>
                <h2 className="text-lg font-bold text-[#102A43]">{selectedSite.customerDisplay}</h2>
                {selectedSite.customerCode && <span className="text-xs text-slate-500">#{selectedSite.customerCode}</span>}
              </div>
              <p className="text-sm text-slate-600">{selectedSite.address}</p>
              <div className="flex flex-wrap gap-4 text-xs text-slate-700 pt-1">
                <span>ביקורים: <strong>{selectedSite.visits}</strong></span>
                <span>ממוצע: <strong>{selectedSite.avgStopMin ?? '—'} דק׳</strong></span>
                <span>מקסימום: <strong>{selectedSite.maxStopMin ?? '—'} דק׳</strong></span>
                <span>P80: <strong>{selectedSite.p80Min ?? '—'} דק׳</strong></span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => togglePlanSite(selectedSite.id)}
                className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold transition ${
                  plannedIds.includes(selectedSite.id) ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-[#102A43] hover:bg-slate-200'
                }`}
              >
                {plannedIds.includes(selectedSite.id) ? 'בסבב המתוכנן' : '+ הוסף לסבב'}
              </button>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  selectedSite.lat && selectedSite.lng ? `${selectedSite.lat},${selectedSite.lng}` : selectedSite.address
                )}`}
                target="_blank"
                rel="noreferrer"
                className="min-h-[44px] px-3 rounded-xl text-xs font-semibold bg-[#1769AA] text-white inline-flex items-center gap-1"
              >
                Google Maps <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a
                href={`https://waze.com/ul?q=${encodeURIComponent(selectedSite.address)}&navigate=yes`}
                target="_blank"
                rel="noreferrer"
                className="min-h-[44px] px-3 rounded-xl text-xs font-semibold bg-[#20A4C8] text-white inline-flex items-center"
              >
                Waze
              </a>
            </div>
          </section>
        )}

        {/* תוכן טאבים */}
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-8 h-[520px] bg-white rounded-2xl border border-slate-200 animate-pulse" />
            <div className="lg:col-span-4 h-[520px] bg-white rounded-2xl border border-slate-200 animate-pulse" />
          </div>
        ) : activeTab === 'map' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-2 shadow-sm">
              {mapError ? (
                <div className="min-h-[520px] flex items-center justify-center text-sm text-red-700 bg-red-50 rounded-xl p-4">
                  שגיאה בטעינת המפה: {mapError}
                </div>
              ) : (
                <div ref={mapContainerRef} className="w-full min-h-[520px] rounded-xl overflow-hidden" />
              )}
            </div>
            <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-3 shadow-sm max-h-[540px] overflow-y-auto space-y-2">
              <div className="text-sm font-bold text-[#102A43] pb-2 border-b border-slate-100">
                אתרים מסוננים ({filteredSites.length})
              </div>
              {filteredSites.map((site) => {
                const meta = getSeverityMeta(site.severity);
                return (
                  <div
                    key={site.id}
                    ref={(el) => {
                      cardRefs.current[site.id] = el;
                    }}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(site.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId(site.id);
                      }
                    }}
                    className={`min-h-[44px] p-3 rounded-xl border cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-[#1769AA] ${
                      selectedId === site.id ? 'border-[#1769AA] bg-blue-50/60' : 'border-slate-200 hover:border-[#20A4C8]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-sm text-[#102A43]">{site.customerDisplay}</span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${meta.bg}`}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">{site.address}</div>
                    <div className="flex justify-between text-[11px] text-slate-500 mt-2">
                      <span>ביקורים: {site.visits} · P80: {site.p80Min ?? '—'}ד׳</span>
                      <span className={site.lat ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                        {site.lat ? 'GPS תקין' : 'חסר GPS'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : activeTab === 'analytics' ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3">לקוח</th>
                  <th className="py-2 px-3">כתובת</th>
                  <th className="py-2 px-3">ביקורים</th>
                  <th className="py-2 px-3">ממוצע (דק׳)</th>
                  <th className="py-2 px-3">מקסימום</th>
                  <th className="py-2 px-3">P80</th>
                  <th className="py-2 px-3">זמן מצטבר</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSites.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-semibold">{s.customerDisplay}</td>
                    <td className="py-2.5 px-3 text-slate-600">{s.address}</td>
                    <td className="py-2.5 px-3">{s.visits}</td>
                    <td className="py-2.5 px-3">{s.avgStopMin ?? '—'}</td>
                    <td className="py-2.5 px-3">{s.maxStopMin ?? '—'}</td>
                    <td className="py-2.5 px-3 font-bold">{s.p80Min ?? '—'}</td>
                    <td className="py-2.5 px-3">{s.cumulativeMin} דק׳</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'warehouses' ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3">אתר</th>
                  <th className="py-2 px-3">מהחרש 10 (ק״מ / דק׳)</th>
                  <th className="py-2 px-3">מהתלמיד 6 (ק״מ / דק׳)</th>
                  <th className="py-2 px-3">מוצא עדיף</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSites.map((s) => {
                  const hasBoth = s.distHarashKm !== null && s.distTalmidKm !== null;
                  const best = hasBoth ? ((s.distHarashKm ?? 0) <= (s.distTalmidKm ?? 0) ? 'החרש 10' : 'התלמיד 6') : 'חסר חישוב GPS';
                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold">{s.customerDisplay} · <span className="text-slate-500 font-normal">{s.address}</span></td>
                      <td className="py-2.5 px-3">{s.distHarashKm !== null ? `${s.distHarashKm} ק״מ (${s.driveHarashMin ?? '—'} דק׳)` : 'לא זמין'}</td>
                      <td className="py-2.5 px-3">{s.distTalmidKm !== null ? `${s.distTalmidKm} ק״מ (${s.driveTalmidMin ?? '—'} דק׳)` : 'לא זמין'}</td>
                      <td className="py-2.5 px-3 font-medium text-[#1769AA]">{best}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'customers' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {customerGroups.map((g) => (
              <div key={g.code + g.name} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-[#102A43]">{g.name}</div>
                  {g.code && <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-lg">#{g.code}</span>}
                </div>
                <div className="text-xs text-slate-600">אתרים: <strong>{g.sites.length}</strong> · סה״כ ביקורים: <strong>{g.totalVisits}</strong> · P80 מקס׳: <strong>{g.maxP80 || '—'} דק׳</strong></div>
                <ul className="text-xs text-slate-600 space-y-1 pt-1 border-t border-slate-100">
                  {g.sites.map((s) => (
                    <li key={s.id}>• {s.address}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold text-[#102A43]">סבב אספקה מתוכנן ({plannedSites.length} תחנות)</div>
              {plannedSites.length > 0 && (
                <button
                  type="button"
                  onClick={copyPlanSummary}
                  className="min-h-[44px] px-4 rounded-xl bg-[#1769AA] text-white text-xs font-semibold inline-flex items-center gap-2"
                >
                  {copiedMsg ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedMsg ? 'הועתק!' : 'העתק סבב ל־WhatsApp'}
                </button>
              )}
            </div>
            {plannedSites.length === 0 ? (
              <div className="text-sm text-slate-500 py-6 text-center">בחר אתרים מטאב המפה ולחץ על "+ הוסף לסבב".</div>
            ) : (
              <div className="space-y-2">
                {plannedSites.map((s, idx) => (
                  <div key={s.id} className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{idx + 1}. {s.customerDisplay} — {s.address}</span>
                    <button type="button" onClick={() => togglePlanSite(s.id)} className="text-xs text-red-600 font-semibold px-2 py-1">
                      הסר
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
