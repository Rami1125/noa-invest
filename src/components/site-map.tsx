import { useEffect, useMemo, useRef, useState } from "react";
import { validCoordinates, warehouses as defaultWarehouses, type SiteRecord } from "@/lib/sites-model";

interface SiteMapProps {
  sites: SiteRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  delayed: number;
  critical: number;
  origin: string;
  warehouses?: { id: string; name: string; lat: number; lng: number }[];
}

function escapeHtml(val: unknown): string {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function loadLeaflet(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("SSR"));
    if (!document.getElementById("leaflet-cdn-css")) {
      const l = document.createElement("link");
      l.id = "leaflet-cdn-css";
      l.rel = "stylesheet";
      l.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(l);
    }
    const win = window as any;
    if (win.L) return resolve(win.L);

    const existing = document.getElementById("leaflet-cdn-js") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(win.L));
      return;
    }
    const s = document.createElement("script");
    s.id = "leaflet-cdn-js";
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.async = true;
    s.onload = () => resolve(win.L);
    s.onerror = () => reject(new Error("כשל בטעינת ספריית המפה"));
    document.head.appendChild(s);
  });
}

function pinColor(p80: number | null, delayed: number, critical: number): string {
  if (p80 === null) return "#64748B";
  if (p80 >= critical) return "#DC2626";
  if (p80 >= delayed) return "#D97706";
  return "#1769AA";
}

export default function SiteMap({
  sites,
  selectedId,
  onSelect,
  delayed,
  critical,
  origin,
  warehouses = defaultWarehouses,
}: SiteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const markersByIdRef = useRef<Record<string, any>>({});
  const [ready, setReady] = useState(false);

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === selectedId) || null,
    [sites, selectedId],
  );

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const map = L.map(containerRef.current, { zoomControl: true }).setView([32.12, 34.9], 11);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap",
        }).addTo(map);
        mapRef.current = map;
        layerRef.current = L.layerGroup().addTo(map);
        setReady(true);
        setTimeout(() => map.invalidateSize(), 80);
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;

    layer.clearLayers();
    markersByIdRef.current = {};
    const bounds = L.latLngBounds([]);

    warehouses.forEach((w) => {
      if (!validCoordinates(w.lat, w.lng)) return;
      const isOrigin = w.id === origin;
      L.circleMarker([w.lat, w.lng], {
        radius: isOrigin ? 12 : 9,
        fillColor: isOrigin ? "#102A43" : "#20A4C8",
        color: "#fff",
        weight: 2,
        fillOpacity: 1,
      })
        .bindPopup(
          `<div dir="rtl"><strong>${escapeHtml(w.name)}</strong><br/>${isOrigin ? "מחסן מוצא פעיל" : "מחסן סבן"}</div>`,
        )
        .addTo(layer);
      bounds.extend([w.lat, w.lng]);
    });

    sites.forEach((site) => {
      if (!validCoordinates(site.lat, site.lng)) return;
      const isSelected = site.id === selectedId;
      const marker = L.circleMarker([site.lat, site.lng], {
        radius: isSelected ? 11 : 7,
        fillColor: pinColor(site.p80Min, delayed, critical),
        color: "#FFFFFF",
        weight: isSelected ? 3 : 2,
        opacity: 1,
        fillOpacity: 0.94,
      });

      marker.bindPopup(
        `<div dir="rtl" style="font-family:Rubik,Heebo,sans-serif;min-width:170px;">
          <div style="font-weight:700;color:#102A43;">${escapeHtml(site.customer)}</div>
          <div style="font-size:12px;color:#475569;margin-top:2px;">${escapeHtml(site.address)}</div>
          <div style="font-size:12px;margin-top:5px;">ביקורים: <strong>${escapeHtml(site.visits ?? "—")}</strong> · P80: <strong>${escapeHtml(site.p80Min ?? "—")} דק׳</strong></div>
        </div>`,
      );

      marker.on("click", () => onSelect(site.id));
      marker.addTo(layer);
      markersByIdRef.current[site.id] = marker;
      bounds.extend([site.lat, site.lng]);
    });

    if (!selectedId && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [ready, sites, selectedId, delayed, critical, origin, warehouses, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !selectedSite) return;
    if (validCoordinates(selectedSite.lat, selectedSite.lng)) {
      map.flyTo([selectedSite.lat, selectedSite.lng], 16, { duration: 0.65 });
      const marker = markersByIdRef.current[selectedSite.id];
      if (marker) setTimeout(() => marker.openPopup(), 350);
    }
  }, [ready, selectedSite]);

  return (
    <div className="relative w-full">
      <div ref={containerRef} className="map-frame min-h-[520px] w-full rounded-xl overflow-hidden" />
      {selectedSite && !validCoordinates(selectedSite.lat, selectedSite.lng) && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          לאתר <strong>{selectedSite.customer}</strong> ({selectedSite.address}) עדיין אין קואורדינטות GPS שמורות — הרץ{" "}
          <code>enrichSitesDistanceAndGps()</code> בגיליון כדי למקם סיכה ולבצע Zoom.
        </div>
      )}
    </div>
  );
}
