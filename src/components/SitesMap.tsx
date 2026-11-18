/**
 * מפת אתרים — Leaflet
 * אם קיים VITE_CARTO_API_KEY (או prop cartoKey) → CARTO Voyager עם מפתח.
 * אחרת → Carto Voyager חינמי / OpenStreetMap — בלי חסימה על API key.
 */
import { useEffect, useRef } from "react";
import type { AtlasSite } from "@/lib/customer-history.functions";

type Props = {
  sites: AtlasSite[];
  selected?: AtlasSite | null;
  /** מפתח CARTO אופציונלי; אם חסר נטען basemap חינמי */
  cartoKey?: string;
  className?: string;
};

type LMap = {
  remove: () => void;
  setView: (latlng: [number, number], zoom?: number) => void;
  fitBounds: (b: unknown, o?: object) => void;
  eachLayer: (fn: (layer: { options?: { siteKey?: string }; setIcon?: (i: unknown) => void }) => void) => void;
};

declare global {
  interface Window {
    L?: {
      map: (el: HTMLElement, opts?: object) => LMap & {
        addLayer: (l: unknown) => void;
      };
      tileLayer: (url: string, opts?: object) => { addTo: (m: unknown) => unknown };
      marker: (latlng: [number, number], opts?: object) => {
        addTo: (m: unknown) => unknown;
        bindPopup: (html: string) => unknown;
        on: (ev: string, fn: () => void) => unknown;
        setIcon: (i: unknown) => void;
        options: { siteKey?: string };
      };
      divIcon: (opts: object) => unknown;
      latLngBounds: (pts: [number, number][]) => unknown;
      Icon: { Default: { prototype: Record<string, unknown>; mergeOptions: (o: object) => void } };
    };
  }
}

/** קריאת מפתח CARTO מהסביבה — אופציונלי בלבד, לא חוסם */
function resolveCartoKey(propKey?: string): string {
  const fromProp = String(propKey || "").trim();
  if (fromProp) return fromProp;
  try {
    const env = (import.meta as unknown as { env?: Record<string, string> }).env;
    return String(env?.["VITE_CARTO_API_KEY"] || "").trim();
  } catch {
    return "";
  }
}

function loadLeaflet(): Promise<NonNullable<typeof window.L>> {
  return new Promise((resolve, reject) => {
    if (window.L) {
      resolve(window.L);
      return;
    }
    const cssId = "leaflet-css-cdn";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    const existing = document.querySelector("script[data-leaflet]");
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.L) resolve(window.L);
        else reject(new Error("Leaflet failed"));
      });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.dataset.leaflet = "1";
    script.onload = () => {
      if (window.L) resolve(window.L);
      else reject(new Error("Leaflet failed"));
    };
    script.onerror = () => reject(new Error("Leaflet CDN error"));
    document.head.appendChild(script);
  });
}

function pinIcon(L: NonNullable<typeof window.L>, active: boolean) {
  const bg = active ? "#1769AA" : "#20A4C8";
  const scale = active ? 1.15 : 1;
  return L.divIcon({
    className: "saban-sites-pin",
    html: `<div style="
      transform:scale(${scale});
      width:18px;height:18px;border-radius:50%;
      background:${bg};border:2px solid #fff;
      box-shadow:0 2px 6px rgba(16,42,67,.35);
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/** שכבת basemap — לעולם לא נחסמת על היעדר API key */
function addBasemap(
  L: NonNullable<typeof window.L>,
  map: { addLayer: (l: unknown) => void },
  cartoKey: string,
) {
  if (cartoKey) {
    L.tileLayer(
      `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`,
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
      },
    ).addTo(map);
    return;
  }
  // חינמי ללא מפתח
  try {
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
    }).addTo(map);
  } catch {
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
  }
}

export function SitesMap({ sites, selected, cartoKey, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markersRef = useRef<Map<string, { setIcon: (i: unknown) => void }>>(new Map());

  const points = sites.filter((s) => s.latitude != null && s.longitude != null);
  const resolvedKey = resolveCartoKey(cartoKey);

  useEffect(() => {
    let cancelled = false;
    const el = containerRef.current;
    if (!el) return;

    void (async () => {
      try {
        const L = await loadLeaflet();
        if (cancelled || !containerRef.current) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
          iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
          shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        });

        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }

        const center: [number, number] =
          selected?.latitude != null && selected?.longitude != null
            ? [selected.latitude, selected.longitude]
            : points[0]
              ? [points[0].latitude!, points[0].longitude!]
              : [32.0853, 34.7818];

        const map = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true,
        }).setView(center, selected ? 14 : 11);

        addBasemap(L, map, resolvedKey);

        markersRef.current.clear();
        const latlngs: [number, number][] = [];
        for (const site of points) {
          const keyId = site.siteKey || `${site.city}|${site.address}`;
          const isActive =
            selected &&
            ((selected.siteKey && selected.siteKey === site.siteKey) || selected.address === site.address);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const m: any = L.marker([site.latitude!, site.longitude!], {
            icon: pinIcon(L, !!isActive),
          });
          m.options.siteKey = keyId;
          m.bindPopup(
            `<div dir="rtl"><strong>${site.address || "אתר"}</strong><br/>${site.city || ""} · ${site.visits ?? 0} ביקורים</div>`,
          );
          m.addTo(map);
          markersRef.current.set(keyId, m as unknown as { setIcon: (i: unknown) => void });
          latlngs.push([site.latitude!, site.longitude!]);
        }

        if (!selected && latlngs.length > 1) {
          map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom: 13 });
        }

        mapRef.current = map as unknown as LMap;
      } catch (e) {
        console.error("SitesMap init failed", e);
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedKey, points.length]);

  useEffect(() => {
    const map = mapRef.current;
    const L = window.L;
    if (!map || !L || !selected?.latitude || !selected?.longitude) return;
    map.setView([selected.latitude, selected.longitude], 14);
    const activeKey = selected.siteKey || `${selected.city}|${selected.address}`;
    markersRef.current.forEach((m, k) => {
      m.setIcon?.(pinIcon(L, k === activeKey));
    });
  }, [selected]);

  // תמיד מציגים את מסגרת המפה — גם בלי סיכות GPS
  return (
    <div className={className}>
      <div
        ref={containerRef}
        className="min-h-[520px] w-full rounded-xl overflow-hidden bg-slate-100"
        dir="ltr"
        aria-label="מפת אתרים"
      />
      {!points.length && (
        <p className="mt-2 text-center text-xs font-medium text-muted-foreground">
          אין עדיין קואורדינטות לסיכות לקוחות בגיליון «אתרי_לקוחות». המפה מוצגת; הרץ{" "}
          <code className="rounded bg-muted px-1">enrichSitesDistanceAndGps()</code> ב-Apps Script.
        </p>
      )}
    </div>
  );
}

export default SitesMap;
