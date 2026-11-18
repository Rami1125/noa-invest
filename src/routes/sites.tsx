import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/sites')({
  component: SitesPage,
});

interface SiteRecord {
  id: string;
  siteKey: string;
  customerName: string;
  address: string;
  city: string;
  region: string;
  lat: number | null;
  lng: number | null;
  severity: 'normal' | 'delayed' | 'critical';
  visits: number;
  avgStopMin: number | null;
  maxStopMin: number | null;
  p80Min: number | null;
  distHarashKm: number | null;
  driveHarashMin: number | null;
  distTalmidKm: number | null;
  driveTalmidMin: number | null;
}

const GAS_SITES_URL =
  import.meta.env.VITE_GAS_WEBAPP_URL ||
  'https://script.google.com/macros/s/AKfycbwgtQOFDgLh6mMtTNvLvLaH8rLNrk9C3o13VdMMNAylF_SLp388GXG9NCsFdmEvm1xMGA/exec';

const GAS_TOKEN = import.meta.env.VITE_GAS_TOKEN || 'rami_1a084c2a6b9ed55a';

const WAREHOUSES = [
  { id: 'wh-haharash', name: 'מחסן החרש 10', lat: 32.1508, lng: 34.8926 },
  { id: 'wh-hatalmid', name: 'מחסן התלמיד 6', lat: 32.1544, lng: 34.8886 },
];

function loadLeafletFromCdn(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('SSR'));

    if (!document.getElementById('leaflet-cdn-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-cdn-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const win = window as any;
    if (win.L) {
      resolve(win.L);
      return;
    }

    const existingScript = document.getElementById('leaflet-cdn-js') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(win.L));
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Leaflet')));
      return;
    }

    const script = document.createElement('script');
    script.id = 'leaflet-cdn-js';
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => resolve(win.L);
    script.onerror = () => reject(new Error('Failed to load Leaflet'));
    document.head.appendChild(script);
  });
}

function isValidCoord(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) > 0.1 &&
    Math.abs(lng) > 0.1
  );
}

function toNumOrNull(val: unknown): number | null {
  if (val === '' || val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function normalizeSite(raw: Record<string, unknown>, idx: number): SiteRecord {
  const latNum = toNumOrNull(raw.lat);
  const lngNum = toNumOrNull(raw.lng);
  const p80 = toNumOrNull(raw.p80Min ?? raw.p80Minutes ?? raw.p80);
  const rawSev = String(raw.severity || '').toLowerCase();

  let severity: SiteRecord['severity'] = 'normal';
  if (rawSev === 'critical' || (p80 !== null && p80 >= 26)) severity = 'critical';
  else if (rawSev === 'delayed' || rawSev === 'warning' || (p80 !== null && p80 >= 19)) severity = 'delayed';

  return {
    id: String(raw.rowNumber ?? raw.id ?? raw.siteKey ?? `site-${idx}`),
    siteKey: String(raw.siteKey || ''),
    customerName: String(raw.customer || raw.customerName || raw.name || 'לקוח ללא שם'),
    address: String(raw.address || ''),
    city: String(raw.city || ''),
    region: String(raw.region || ''),
    lat: isValidCoord(latNum, lngNum) ? latNum : null,
    lng: isValidCoord(latNum, lngNum) ? lngNum : null,
    severity,
    visits: Number(raw.visits ?? raw.visitsCount ?? 0),
    avgStopMin: toNumOrNull(raw.avgStopMin),
    maxStopMin: toNumOrNull(raw.maxStopMin),
    p80Min: p80,
    distHarashKm: toNumOrNull(raw.distHarashKm),
    driveHarashMin: toNumOrNull(raw.driveHarashMin),
    distTalmidKm: toNumOrNull(raw.distTalmidKm),
    driveTalmidMin: toNumOrNull(raw.driveTalmidMin),
  };
}

function getSeverityColor(severity: SiteRecord['severity']): string {
  if (severity === 'critical') return '#DC2626';
  if (severity === 'delayed') return '#D97706';
  return '#1769AA';
}

function getSeverityLabel(severity: SiteRecord['severity']): string {
  if (severity === 'critical') return 'קריטי';
  if (severity === 'delayed') return 'מעכב';
  return 'תקין';
}

function SitesPage() {
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'delayed' | 'critical'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const fetchSites = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `${GAS_SITES_URL}?action=getSites&token=${encodeURIComponent(GAS_TOKEN)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const rows = Array.isArray(json)
        ? json
        : Array.isArray(json.sites)
          ? json.sites
          : Array.isArray(json.data)
            ? json.data
            : [];
      setSites(rows.map((r: Record<string, unknown>, i: number) => normalizeSite(r, i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת נתוני אתרים');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSites();
  }, []);

  const filteredSites = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sites.filter((s) => {
      if (severityFilter !== 'all' && s.severity !== severityFilter) return false;
      if (!q) return true;
      return (
        s.customerName.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q)
      );
    });
  }, [sites, search, severityFilter]);

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === selectedId) || null,
    [sites, selectedId]
  );

  const stats = useMemo(() => {
    const withCoords = sites.filter((s) => isValidCoord(s.lat, s.lng)).length;
    const delayed = sites.filter((s) => s.severity === 'delayed').length;
    const critical = sites.filter((s) => s.severity === 'critical').length;
    return { total: sites.length, withCoords, delayed, critical };
  }, [sites]);

  useEffect(() => {
    let cancelled = false;

    loadLeafletFromCdn()
      .then((L) => {
        if (cancelled || !mapContainerRef.current || mapRef.current) return;
        leafletRef.current = L;

        const map = L.map(mapContainerRef.current, {
          center: [32.1525, 34.8906],
          zoom: 12,
          zoomControl: true,
        });

        const cartoKey = import.meta.env.VITE_CARTO_API_KEY?.trim();
        const tileUrl = cartoKey
          ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?api_key=${encodeURIComponent(cartoKey)}`
          : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

        const attribution = cartoKey ? '&copy; OpenStreetMap &copy; CARTO' : '&copy; OpenStreetMap';

        L.tileLayer(tileUrl, { attribution, maxZoom: 19 }).addTo(map);
        markersLayerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setMapReady(true);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersLayerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!mapReady || !L || !map || !layer) return;

    layer.clearLayers();
    const bounds = L.latLngBounds([]);

    WAREHOUSES.forEach((wh) => {
      const icon = L.divIcon({
        className: 'saban-wh-pin',
        html: `<div style="background:#EA580C;color:#FFFFFF;font-family:Heebo,sans-serif;font-weight:700;font-size:11px;padding:4px 8px;border-radius:9999px;border:2px solid #FFFFFF;box-shadow:0 2px 8px rgba(0,0,0,0.28);white-space:nowrap;">${wh.name}</div>`,
        iconSize: [110, 26],
        iconAnchor: [55, 13],
      });
      L.marker([wh.lat, wh.lng], { icon })
        .bindPopup(`<div dir="rtl" style="font-family:Heebo,sans-serif;"><strong>${wh.name}</strong><br/>מחסן מוצא קבוע</div>`)
        .addTo(layer);
      bounds.extend([wh.lat, wh.lng]);
    });

    filteredSites.forEach((site) => {
      if (!isValidCoord(site.lat, site.lng)) return;
      const isSelected = site.id === selectedId;
      const marker = L.circleMarker([site.lat, site.lng], {
        radius: isSelected ? 10 : 7,
        fillColor: getSeverityColor(site.severity),
        color: '#FFFFFF',
        weight: isSelected ? 3 : 2,
        opacity: 1,
        fillOpacity: 0.92,
      });

      marker.bindPopup(
        `<div dir="rtl" style="font-family:Heebo,sans-serif;min-width:170px;">
          <div style="font-weight:700;color:#102A43;margin-bottom:4px;">${site.customerName}</div>
          <div style="font-size:12px;color:#334E68;">${site.address}</div>
          ${site.p80Min != null ? `<div style="font-size:12px;margin-top:4px;">P80: <strong>${site.p80Min} דק׳</strong></div>` : ''}
          <div style="font-size:12px;">ביקורים: <strong>${site.visits}</strong></div>
        </div>`
      );

      marker.on('click', () => {
        setSelectedId(site.id);
        cardRefs.current[site.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });

      marker.addTo(layer);
      bounds.extend([site.lat, site.lng]);

      if (isSelected) {
        map.flyTo([site.lat, site.lng], 14, { duration: 0.5 });
      }
    });

    if (bounds.isValid() && !selectedId) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [mapReady, filteredSites, selectedId]);

  const handleSelectCard = (site: SiteRecord) => {
    setSelectedId(site.id);
    if (mapRef.current && isValidCoord(site.lat, site.lng)) {
      mapRef.current.flyTo([site.lat, site.lng], 15, { duration: 0.5 });
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#F3F7FB] text-[#102A43] p-4 md:p-6 font-[Heebo,sans-serif]">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-[#102A43]">מודיעין אתרים · תכנון לסדרן</h1>
            <p className="text-sm text-slate-600 mt-1">
              {stats.total} אתרים · {stats.withCoords} סיכות במפה · {stats.delayed} מעכבים · {stats.critical} קריטיים
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לקוח, כתובת או עיר..."
              className="px-3 py-2 rounded-xl border border-slate-300 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#1769AA] min-w-[220px]"
            />
            {(['all', 'delayed', 'critical'] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setSeverityFilter(level)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition ${
                  severityFilter === level
                    ? 'bg-[#1769AA] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {level === 'all' ? 'הכל' : level === 'delayed' ? 'מעכבים' : 'קריטיים'}
              </button>
            ))}
            <button
              type="button"
              onClick={fetchSites}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#102A43] text-white hover:bg-[#1769AA] transition"
            >
              רענן נתונים
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
            שגיאה בטעינת אתרים: {error}
          </div>
        )}

        {selectedSite && (
          <div className="bg-white rounded-2xl border-2 border-[#1769AA] p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-semibold px-2.5 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: getSeverityColor(selectedSite.severity) }}
                >
                  {getSeverityLabel(selectedSite.severity)}
                </span>
                <h2 className="text-lg font-bold text-[#102A43]">{selectedSite.customerName}</h2>
              </div>
              <p className="text-sm text-slate-600">{selectedSite.address}</p>
              <div className="flex flex-wrap gap-4 text-xs text-slate-700 pt-1">
                <span>ביקורים: <strong>{selectedSite.visits}</strong></span>
                <span>ממוצע עצירה: <strong>{selectedSite.avgStopMin != null ? `${selectedSite.avgStopMin} דק׳` : 'לא נמדד'}</strong></span>
                <span>מקסימום: <strong>{selectedSite.maxStopMin != null ? `${selectedSite.maxStopMin} דק׳` : 'לא נמדד'}</strong></span>
                <span>P80: <strong>{selectedSite.p80Min != null ? `${selectedSite.p80Min} דק׳` : 'לא נמדד'}</strong></span>
                {selectedSite.distHarashKm != null && (
                  <span>מהחרש 10: <strong>{selectedSite.distHarashKm} ק״מ ({selectedSite.driveHarashMin ?? '—'} דק׳)</strong></span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  selectedSite.lat && selectedSite.lng ? `${selectedSite.lat},${selectedSite.lng}` : selectedSite.address
                )}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#1769AA] text-white hover:bg-[#102A43] transition"
              >
                פתח במפות Google
              </a>
              <a
                href={`https://waze.com/ul?q=${encodeURIComponent(selectedSite.address)}&navigate=yes`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#20A4C8] text-white hover:bg-[#1769AA] transition"
              >
                נווט ב־Waze
              </a>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                סגור
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-2 shadow-sm">
            <div ref={mapContainerRef} className="w-full min-h-[520px] rounded-xl overflow-hidden" />
          </div>

          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-3 shadow-sm max-h-[540px] overflow-y-auto space-y-2">
            <div className="flex items-center justify-between px-1 pb-2 border-b border-slate-100">
              <span className="font-bold text-sm text-[#102A43]">רשימת אתרים ({filteredSites.length})</span>
              {loading && <span className="text-xs text-[#20A4C8]">טוען...</span>}
            </div>

            {filteredSites.map((site) => {
              const hasGps = isValidCoord(site.lat, site.lng);
              const isSelected = site.id === selectedId;
              return (
                <div
                  key={site.id}
                  ref={(el) => {
                    cardRefs.current[site.id] = el;
                  }}
                  onClick={() => handleSelectCard(site)}
                  className={`p-3 rounded-xl border cursor-pointer transition ${
                    isSelected
                      ? 'border-[#1769AA] bg-blue-50/60'
                      : 'border-slate-200 hover:border-[#20A4C8] bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-sm text-[#102A43]">{site.customerName}</div>
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full text-white shrink-0"
                      style={{ backgroundColor: getSeverityColor(site.severity) }}
                    >
                      {getSeverityLabel(site.severity)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">{site.address}</div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
                    <span>
                      ביקורים: {site.visits}
                      {site.p80Min != null ? ` · P80: ${site.p80Min}ד׳` : ''}
                      {site.maxStopMin != null ? ` · מקס׳: ${site.maxStopMin}ד׳` : ''}
                    </span>
                    <span className={hasGps ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
                      {hasGps ? 'GPS תקין' : 'חסר GPS'}
                    </span>
                  </div>
                </div>
              );
            })}

            {!loading && filteredSites.length === 0 && (
              <div className="text-center text-sm text-slate-500 py-8">לא נמצאו אתרים תואמים.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
