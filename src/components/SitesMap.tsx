/**
 * מפת אתרים — CARTO Basemaps (כשיש מפתח) או OSM
 * טוען Leaflet מ־CDN כדי לא להוסיף תלות npm כבדה
 */
import { useEffect, useRef } from "react";
import type { AtlasSite } from "@/lib/customer-history.functions";

type Props = {
  sites: AtlasSite[];
  selected?: AtlasSite | null;
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
  const bg = active ? "#0ea5e9" : "#64748b";
  const scale = active ? 1.15 : 1;
  return L.divIcon({
    className: "",
    html: `<div style="width:${28 * scale}px;height:${28 * scale}px;border-radius:50% 50% 50% 0;background:${bg};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);transform:rotate(-45deg);margin-left:-${14 * scale}px;margin-top:-${28 * scale}px"></div>`,
    iconSize: [28 * scale, 28 * scale],
    iconAnchor: [14 * scale, 28 * scale],
  });
}

export function SitesMap({ sites, selected, cartoKey, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markersRef = useRef<Map<string, { setIcon: (i: unknown) => void }>>(new Map());

  const points = sites.filter((s) => s.latitude != null && s.longitude != null);

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

        const key = (cartoKey || "").trim();
        if (key) {
          L.tileLayer(
            `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(key)}`,
            {
              attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
              subdomains: "abcd",
              maxZoom: 20,
            },
          ).addTo(map);
        } else {
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19,
          }).addTo(map);
        }

        markersRef.current.clear();
        const latlngs: [number, number][] = [];
        for (const site of points) {
          const keyId = site.siteKey || `${site.city}|${site.address}`;
          const isActive =
            selected &&
            ((selected.siteKey && selected.siteKey === site.siteKey) ||
              selected.address === site.address);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const m: any = L.marker([site.latitude!, site.longitude!], {
            icon: pinIcon(L, !!isActive),
          });
          m.options.siteKey = keyId;
          m.bindPopup(
            `<strong>${site.address || "אתר"}</strong><br/>${site.city || ""} · ${site.visits ?? 0} ביקורים`,
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
  }, [cartoKey, points.length]);

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

  if (!points.length) {
    return (
      <div className={className}>
        <div className="grid min-h-72 place-items-center bg-muted/30 px-6 py-12 text-center md:min-h-[360px]">
          <div className="max-w-md">
            <p className="font-display font-bold">אין קואורדינטות להצגת סיכות</p>
            <p className="mt-1 text-sm text-muted-foreground">
              בגיליון «אתרי_לקוחות» חסרים קווי רוחב/אורך. כתובות לא נשלחות לשירות מיפוי חיצוני.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div ref={containerRef} className="h-72 w-full md:h-[360px]" dir="ltr" />
    </div>
  );
}
