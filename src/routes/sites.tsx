import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface SiteMapItem {
  id: string;
  customerName: string;
  address: string;
  city?: string;
  lat?: number | null;
  lng?: number | null;
  severity?: 'normal' | 'warning' | 'critical';
  p80Minutes?: number | null;
  visitsCount?: number;
  ptoCount?: number;
}

interface SitesMapProps {
  sites: SiteMapItem[];
  selectedSiteId?: string | null;
  onSelectSite?: (site: SiteMapItem) => void;
}

const WAREHOUSES = [
  {
    id: 'wh-haharash',
    name: 'מחסן החרש 10',
    lat: 32.1508,
    lng: 34.8926,
  },
  {
    id: 'wh-hatalmid',
    name: 'מחסן התלמיד 6',
    lat: 32.1544,
    lng: 34.8886,
  },
];

function isValidCoord(lat?: number | null, lng?: number | null): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) > 0.1 &&
    Math.abs(lng) > 0.1
  );
}

function getSeverityColor(severity?: SiteMapItem['severity']): string {
  if (severity === 'critical') return '#DC2626';
  if (severity === 'warning') return '#D97706';
  return '#1769AA';
}

export const SitesMap: React.FC<SitesMapProps> = ({
  sites,
  selectedSiteId,
  onSelectSite,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [32.1525, 34.8906],
      zoom: 12,
      zoomControl: true,
    });

    const cartoKey = import.meta.env.VITE_CARTO_API_KEY?.trim();
    const tileUrl = cartoKey
      ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?api_key=${encodeURIComponent(cartoKey)}`
      : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

    const tileAttribution = cartoKey
      ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO'
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

    L.tileLayer(tileUrl, {
      attribution: tileAttribution,
      maxZoom: 19,
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const bounds = L.latLngBounds([]);

    // מחסני ח. סבן קבועים
    WAREHOUSES.forEach((wh) => {
      const icon = L.divIcon({
        className: 'saban-warehouse-pin',
        html: `<div style="background:#EA580C;color:#FFFFFF;font-family:Heebo,sans-serif;font-weight:700;font-size:11px;padding:4px 8px;border-radius:9999px;border:2px solid #FFFFFF;box-shadow:0 2px 8px rgba(0,0,0,0.28);white-space:nowrap;">${wh.name}</div>`,
        iconSize: [110, 26],
        iconAnchor: [55, 13],
      });

      L.marker([wh.lat, wh.lng], { icon })
        .bindPopup(`<div dir="rtl" style="font-family:Heebo,sans-serif;"><strong>${wh.name}</strong><br/>נקודת מוצא קבועה</div>`)
        .addTo(layer);

      bounds.extend([wh.lat, wh.lng]);
    });

    // סיכות אתרי לקוחות עם קואורדינטות תקינות
    const validSites = sites.filter((s) => isValidCoord(s.lat, s.lng));

    validSites.forEach((site) => {
      const lat = site.lat as number;
      const lng = site.lng as number;
      const isSelected = site.id === selectedSiteId;
      const color = getSeverityColor(site.severity);

      const marker = L.circleMarker([lat, lng], {
        radius: isSelected ? 10 : 7,
        fillColor: color,
        color: '#FFFFFF',
        weight: isSelected ? 3 : 2,
        opacity: 1,
        fillOpacity: 0.92,
      });

      marker.bindPopup(
        `<div dir="rtl" style="font-family:Heebo,sans-serif;min-width:170px;">
          <div style="font-weight:700;color:#102A43;margin-bottom:4px;">${site.customerName}</div>
          <div style="font-size:12px;color:#334E68;">${site.address}${site.city ? `, ${site.city}` : ''}</div>
          ${site.p80Minutes != null ? `<div style="font-size:12px;margin-top:4px;">P80 שהייה: <strong>${site.p80Minutes} דק׳</strong></div>` : ''}
          ${site.visitsCount != null ? `<div style="font-size:12px;">ביקורים: <strong>${site.visitsCount}</strong></div>` : ''}
        </div>`
      );

      marker.on('click', () => {
        onSelectSite?.(site);
      });

      marker.addTo(layer);
      bounds.extend([lat, lng]);

      if (isSelected) {
        map.flyTo([lat, lng], 14, { duration: 0.5 });
      }
    });

    if (bounds.isValid() && !selectedSiteId) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [sites, selectedSiteId, onSelectSite]);

  return (
    <div className="relative w-full min-h-[520px] rounded-xl overflow-hidden border border-slate-200 bg-[#F3F7FB]">
      <div ref={containerRef} className="w-full h-full min-h-[520px]" />
    </div>
  );
};

export default SitesMap;
