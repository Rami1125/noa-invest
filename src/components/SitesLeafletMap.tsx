/**
 * Leaflet + OSM — ללא iframe
 */
import { useEffect, useRef } from "react";
import type { GasSite, GasWarehouse } from "@/lib/sites-live.functions";
import { isValidMapCoord, pinSeverityFromSite } from "@/lib/sites-map-html";

type Props = {
  sites: GasSite[];
  warehouses: GasWarehouse[];
  selectedKey: string | null;
  onSelectSite: (siteKey: string) => void;
  className?: string;
};

const WH: GasWarehouse[] = [
  { id: "harash_10", key: "harash_10", name: "מחסן החרש 10", short: "חרש 10", address: "החרש 10", lat: 32.1508, lng: 34.8926 },
  { id: "hatalmid_6", key: "hatalmid_6", name: "מחסן התלמיד 6", short: "תלמיד 6", address: "התלמיד 6", lat: 32.1544, lng: 34.8886 },
];

function loadL(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).L) return resolve((window as any).L);
    if (!document.getElementById("leaflet-css-cdn")) {
      const link = document.createElement("link");
      link.id = "leaflet-css-cdn";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.async = true;
    s.onload = () => ((window as any).L ? resolve((window as any).L) : reject(new Error("no L")));
    s.onerror = () => reject(new Error("cdn"));
    document.head.appendChild(s);
  });
}

function pinHtml(color: string, label: string, scale = 1) {
  return `<div style="transform:scale(${scale});background:${color};color:#fff;border:2px solid #fff;border-radius:999px;min-width:28px;height:28px;display:flex;align-items:center;justify-content:center;font:700 10px Heebo,sans-serif;box-shadow:0 2px 8px rgba(16,42,67,.35);padding:0 6px">${label}</div>`;
}

export function SitesLeafletMap({ sites, warehouses, selectedKey, onSelectSite, className }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markers = useRef<Map<string, any>>(new Map());
  const Lref = useRef<any>(null);
  const onSel = useRef(onSelectSite);
  onSel.current = onSelectSite;

  useEffect(() => {
    let dead = false;
    loadL()
      .then((L) => {
        if (dead || !host.current) return;
        Lref.current = L;
        const map = L.map(host.current, { zoomControl: true });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OSM",
        }).addTo(map);
        map.setView([32.1525, 34.8905], 12);
        mapRef.current = map;
      })
      .catch(console.error);
    return () => {
      dead = true;
      markers.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = Lref.current;
    const map = mapRef.current;
    if (!L || !map) return;
    markers.current.forEach((m) => {
      try {
        map.removeLayer(m);
      } catch {
        /* */
      }
    });
    markers.current.clear();
    const bounds: [number, number][] = [];
    const whs = warehouses.length ? warehouses : WH;
    for (const wh of whs) {
      if (!isValidMapCoord(wh.lat, wh.lng)) continue;
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:#102A43;color:#fff;border:2px solid #20A4C8;border-radius:10px;padding:4px 8px;font:800 11px Heebo,sans-serif;white-space:nowrap">${wh.short || wh.name}</div>`,
        iconSize: [72, 28],
        iconAnchor: [36, 14],
      });
      const m = L.marker([wh.lat, wh.lng], { icon })
        .addTo(map)
        .bindPopup(`<div dir="rtl"><b>${wh.name}</b></div>`);
      markers.current.set("wh:" + (wh.key || wh.id), m);
      bounds.push([wh.lat, wh.lng]);
    }
    for (const site of sites) {
      if (!site.hasCoords || !isValidMapCoord(site.lat, site.lng)) continue;
      const sev = pinSeverityFromSite(site);
      const selected = site.siteKey === selectedKey;
      const color =
        selected ? "#1769AA" : sev === "critical" ? "#DC2626" : sev === "delayed" ? "#D97706" : "#20A4C8";
      const label =
        sev === "critical" ? "!" : sev === "delayed" ? "…" : (site.customerNo || "").slice(-3) || "•";
      const icon = L.divIcon({
        className: "",
        html: pinHtml(color, label, selected ? 1.2 : 1),
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const m = L.marker([site.lat!, site.lng!], { icon }).addTo(map);
      const p80 = site.p80Min ?? site.avgStopMin;
      const waze = `https://waze.com/ul?ll=${site.lat},${site.lng}&navigate=yes`;
      m.bindPopup(
        `<div dir="rtl" style="font-family:Heebo,sans-serif;min-width:160px"><b>${site.customer || "לקוח"} ${site.customerNo ? "#" + site.customerNo : ""}</b><br/><span style="color:#64748b;font-size:12px">${site.address}${site.city ? " · " + site.city : ""}</span><br/>P80: <b>${p80 != null ? p80 + " דק'" : "—"}</b><br/><a href="${waze}" target="_blank" rel="noopener">Waze</a></div>`,
      );
      m.on("click", () => onSel.current(site.siteKey));
      markers.current.set(site.siteKey, m);
      bounds.push([site.lat!, site.lng!]);
    }
    if (bounds.length >= 2) {
      try {
        map.fitBounds(L.latLngBounds(bounds), { padding: [36, 36], maxZoom: 14 });
      } catch {
        /* */
      }
    } else if (bounds.length === 1) map.setView(bounds[0], 14);
  }, [sites, warehouses, selectedKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedKey) return;
    const m = markers.current.get(selectedKey);
    if (!m) return;
    const ll = m.getLatLng();
    map.flyTo([ll.lat, ll.lng], 14, { duration: 0.55 });
  }, [selectedKey]);

  return (
    <div
      ref={host}
      className={className}
      dir="ltr"
      style={{ width: "100%", height: "100%", minHeight: 280, borderRadius: 16 }}
    />
  );
}
