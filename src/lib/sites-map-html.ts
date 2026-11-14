/**
 * מחולל מפת Leaflet — סיכות צבעוניות, מחסן בסיס, ETA נסיעה+פריקה, postMessage לבחירה
 */
import type { AtlasSite } from "@/lib/customer-history.functions";

export const SLOW_UNLOAD_MIN = 20;

/** מחסן מוצא — החרש 10, הוד השרון */
export const WAREHOUSE = {
  lat: 32.1508,
  lng: 34.8926,
  label: "מחסן סבן · החרש 10, הוד השרון",
} as const;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** צפי נסיעה מהמחסן (דק׳) — Haversine × פקטור עירוני/בינעירוני */
export function estimateDriveMinFromWarehouse(lat: number, lng: number): number {
  const km = haversineKm(WAREHOUSE.lat, WAREHOUSE.lng, lat, lng);
  const urban = km < 22;
  const speedKmh = urban ? 28 : 52;
  const factor = urban ? 1.35 : 1.2;
  return Math.max(5, Math.round((km / speedKmh) * 60 * factor));
}

export function avgUnloadMin(site: AtlasSite): number {
  if (site.medianMin != null && site.medianMin > 0) return site.medianMin;
  if (site.p80Min != null && site.p80Min > 0) return Math.round(site.p80Min * 0.85);
  if (site.maxMin != null && site.maxMin > 0) return Math.round(site.maxMin * 0.6);
  return 15;
}

/** אדום: ממוצע >40 או מקס׳ >60 · כתום: 21–40 · ירוק: ≤20 */
export type PinSeverity = "green" | "orange" | "red";

export function pinSeverity(site: AtlasSite): PinSeverity {
  const avg = avgUnloadMin(site);
  const max = site.maxMin ?? 0;
  if (avg > 40 || max > 60) return "red";
  if (avg > 20 || (site.p80Min != null && site.p80Min > 20)) return "orange";
  return "green";
}

export function isSlowUnload(site: AtlasSite): boolean {
  return pinSeverity(site) !== "green";
}

export function isSiteDelayBottleneck(site: AtlasSite): boolean {
  return pinSeverity(site) === "red";
}

export function getExpectedUnloadingMinutes(site: AtlasSite): number {
  if (site.p80Min != null && site.p80Min > 0) return Math.round(site.p80Min);
  if (site.medianMin != null && site.medianMin > 0) return Math.round(site.medianMin * 1.15);
  return 20;
}

export type UnloadAdvice = {
  expectedMin: number;
  driveMin: number | null;
  totalMissionMin: number | null;
  level: "ok" | "watch" | "slow" | "severe";
  levelHe: string;
  opinionHe: string;
  aiRecommendHe: string;
  planBufferMin: number;
};

export function buildUnloadAdvice(site: AtlasSite): UnloadAdvice {
  const med = site.medianMin;
  const p80 = site.p80Min;
  const max = site.maxMin;
  const visits = site.visits ?? 0;
  const expectedMin = getExpectedUnloadingMinutes(site);
  const buffer = Math.max(5, Math.round(expectedMin * 0.15));
  const driveMin =
    site.latitude != null && site.longitude != null
      ? estimateDriveMinFromWarehouse(site.latitude, site.longitude)
      : null;
  const totalMissionMin = driveMin != null ? driveMin + expectedMin : null;

  const sev = pinSeverity(site);
  let level: UnloadAdvice["level"] = "ok";
  if (sev === "red") level = "severe";
  else if (sev === "orange") level = "slow";
  else if (expectedMin >= 15) level = "watch";

  const levelHe =
    level === "ok"
      ? "🟢 שגרתי ≤20 דק׳"
      : level === "watch"
        ? "פריקה בינונית"
        : level === "slow"
          ? "🟠 מעכב 21–40 דק׳"
          : "🔴 צוואר בקבוק חמור";

  const parts: string[] = [];
  if (med != null) parts.push(`ממוצע/חציון ${med} דק׳`);
  if (p80 != null) parts.push(`P80 ${p80} דק׳`);
  if (max != null) parts.push(`שיא ${max} דק׳`);
  if (visits > 0) parts.push(`${visits} ביקורים`);
  if (driveMin != null) parts.push(`נסיעה ~${driveMin} דק׳ מהחרש 10`);
  const statsLine = parts.length ? parts.join(" · ") : "אין מספיק מדידות";

  let opinionHe = "";
  if (level === "ok") {
    opinionHe = `אתר יציב. ${statsLine}. מתאים לשיבוץ רגיל.`;
  } else if (level === "watch") {
    opinionHe = `זמן פריקה בינוני. ${statsLine}. מרווח קטן בין עצירות.`;
  } else if (level === "slow") {
    opinionHe = `מעכב — מעל 20 דק׳. ${statsLine}. לא לשבץ צפוף אחרי האתר.`;
  } else {
    opinionHe = `צוואר בקבוק חמור. ${statsLine}. תחילת יום / סוף מסלול + באפר גדול.`;
  }

  let aiRecommendHe = "";
  if (level === "ok") {
    aiRecommendHe = `תכננו ${expectedMin} דק׳ פריקה (+${buffer} באפר)${driveMin != null ? ` · נסיעה ~${driveMin} · סה״כ משימה ~${totalMissionMin}` : ""}.`;
  } else if (level === "slow") {
    aiRecommendHe = `אתר איטי — ${expectedMin + buffer} דק׳ לפחות${driveMin != null ? ` · נסיעה ~${driveMin} · סה״כ ~${(totalMissionMin || 0) + buffer}` : ""}. הימנעו משתי עצירות כבדות ברצף.`;
  } else if (level === "severe") {
    aiRecommendHe = `צוואר בקבוק — שריינו ${Math.max(expectedMin + 10, 50)} דק׳${driveMin != null ? ` · נסיעה ~${driveMin}` : ""}. אשרו גישה/חניה עם הנהג לפני יציאה.`;
  } else {
    aiRecommendHe = `שיבצו ${expectedMin}–${expectedMin + buffer} דק׳${driveMin != null ? ` · נסיעה ~${driveMin}` : ""}.`;
  }
  if ((site.ptoOpens ?? 0) > 0) {
    aiRecommendHe += ` · ${site.ptoOpens} פתיחות PTO (~${Math.round(site.ptoTotalMin || 0)} דק׳ מנוף).`;
  }

  return {
    expectedMin,
    driveMin,
    totalMissionMin,
    level,
    levelHe,
    opinionHe,
    aiRecommendHe,
    planBufferMin: buffer,
  };
}

export function isValidMapCoord(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= 29.4 && lat <= 33.5 && lng >= 34.2 && lng <= 35.9;
}

export type MapPinLayer = "all" | "slow" | "normal";

export function generateInteractiveMapHtml(
  sites: AtlasSite[],
  selectedKey?: string,
  cartoKey?: string,
  layer: MapPinLayer = "all",
): string {
  const validSites = sites.filter((s) => isValidMapCoord(s.latitude, s.longitude));
  const sitesJson = JSON.stringify(
    validSites.map((s) => {
      const advice = buildUnloadAdvice(s);
      const sev = pinSeverity(s);
      const driveMin = advice.driveMin ?? 0;
      const unloadMin = advice.expectedMin;
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
        ptoMin: Math.round(s.ptoTotalMin || 0),
        medianMin: s.medianMin,
        p80Min: s.p80Min,
        maxMin: s.maxMin,
        severity: sev,
        slow: sev !== "green",
        severe: sev === "red",
        expectedMin: unloadMin,
        driveMin,
        totalMin: driveMin + unloadMin,
        level: advice.level,
        levelHe: advice.levelHe,
        opinionHe: advice.opinionHe,
        aiRecommendHe: advice.aiRecommendHe,
        isSelected: (s.siteKey || `${s.city}|${s.address}`) === selectedKey,
        tip: `${s.customerName || "לקוח"}${s.customerNo ? " #" + s.customerNo : ""} · נסיעה ~${driveMin} + פריקה ~${unloadMin} = ${driveMin + unloadMin} דק׳`,
      };
    }),
  );

  const keyJson = JSON.stringify(cartoKey || "");
  const layerJson = JSON.stringify(layer || "all");
  const whJson = JSON.stringify(WAREHOUSE);

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #0f172a;
      font-family: "Segoe UI", Tahoma, Arial, sans-serif; }
    .map-controls-bar {
      position: absolute; top: 12px; right: 12px; z-index: 1000; display: flex; flex-wrap: wrap; gap: 6px;
      background: rgba(255,255,255,0.96); backdrop-filter: blur(8px); padding: 6px; border-radius: 14px;
      box-shadow: 0 4px 18px rgba(0,0,0,0.22); border: 1px solid #e2e8f0; max-width: calc(100% - 24px);
    }
    .layer-btn {
      border: none; background: transparent; padding: 7px 12px; border-radius: 10px;
      font-size: 12px; font-weight: 800; color: #475569; cursor: pointer; white-space: nowrap;
    }
    .layer-btn:hover { background: #f1f5f9; color: #0f172a; }
    .layer-btn.active { background: #0f766e; color: #fff; box-shadow: 0 2px 8px rgba(15,118,110,0.35); }
    .legend {
      position: absolute; bottom: 16px; right: 12px; z-index: 1000; background: rgba(255,255,255,0.95);
      border-radius: 12px; padding: 8px 12px; font-size: 11px; font-weight: 700; color: #334155;
      box-shadow: 0 2px 12px rgba(0,0,0,0.15); line-height: 1.7;
    }
    .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-left: 6px; vertical-align: middle; }
    .pin-wrap { background: transparent !important; border: none !important; }
    .pin {
      width: 32px; height: 32px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
      border: 2.5px solid #fff; box-shadow: 0 3px 10px rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
    }
    .pin-inner { transform: rotate(45deg); color: #fff; font-size: 10px; font-weight: 900; line-height: 1; }
    .pin.green { background: linear-gradient(145deg, #34d399, #059669); }
    .pin.orange { background: linear-gradient(145deg, #fb923c, #ea580c); }
    .pin.red {
      background: linear-gradient(145deg, #f87171, #dc2626);
      box-shadow: 0 0 0 3px rgba(220,38,38,0.4), 0 3px 10px rgba(0,0,0,0.45);
      animation: pulse 2s ease-out infinite;
    }
    .pin.selected {
      background: linear-gradient(145deg, #a78bfa, #7c3aed) !important;
      transform: rotate(-45deg) scale(1.28);
      box-shadow: 0 0 0 4px rgba(124,58,237,0.45), 0 4px 14px rgba(0,0,0,0.5);
    }
    .pin.warehouse {
      background: linear-gradient(145deg, #38bdf8, #0369a1);
      width: 36px; height: 36px;
      box-shadow: 0 0 0 3px rgba(3,105,161,0.35), 0 3px 12px rgba(0,0,0,0.4);
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(220,38,38,0.55); }
      70% { box-shadow: 0 0 0 14px rgba(220,38,38,0); }
      100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); }
    }
    .leaflet-popup-content-wrapper {
      border-radius: 16px; box-shadow: 0 12px 28px rgba(0,0,0,0.25);
      direction: rtl; text-align: right; max-width: 300px;
    }
    .leaflet-popup-content { margin: 10px 12px; min-width: 200px; }
    .p-title { font-size: 14px; font-weight: 900; color: #0f172a; margin: 0 0 2px; }
    .p-sub { font-size: 11px; color: #64748b; font-weight: 700; }
    .p-addr { font-size: 12px; font-weight: 700; color: #334155; margin: 6px 0; }
    .p-eta { font-size: 12px; font-weight: 800; color: #0f766e; margin-top: 6px; padding-top: 6px; border-top: 1px solid #e2e8f0; }
    .p-badge { display: inline-block; font-size: 11px; font-weight: 800; padding: 3px 9px; border-radius: 8px; margin-bottom: 4px; }
    .b-green { background: #d1fae5; color: #065f46; }
    .b-orange { background: #ffedd5; color: #9a3412; }
    .b-red { background: #fee2e2; color: #991b1b; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="map-controls-bar">
    <button type="button" class="layer-btn active" data-layer="all" id="btn-all">הכל</button>
    <button type="button" class="layer-btn" data-layer="slow" id="btn-slow">מעכבים</button>
    <button type="button" class="layer-btn" data-layer="normal" id="btn-normal">שגרתיים</button>
    <button type="button" class="layer-btn" id="btn-fit">התאם מפה לסיכות</button>
  </div>
  <div class="legend">
    <div><i style="background:#059669"></i> שגרתי ≤20 דק׳</div>
    <div><i style="background:#ea580c"></i> מעכב 21–40</div>
    <div><i style="background:#dc2626"></i> צוואר בקבוק >40 / שיא>60</div>
    <div><i style="background:#0369a1"></i> מחסן החרש 10</div>
  </div>
  <script>
    const SITES = ${sitesJson};
    const CARTO_KEY = ${keyJson};
    const INIT_LAYER = ${layerJson};
    const WH = ${whJson};
    let currentLayer = INIT_LAYER || 'all';
    const map = L.map('map', { zoomControl: true }).setView([WH.lat, WH.lng], 11);
    const tiles = CARTO_KEY
      ? L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=' + encodeURIComponent(CARTO_KEY), {
          attribution: '&copy; OSM &copy; CARTO', subdomains: 'abcd', maxZoom: 20
        })
      : L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; OSM &copy; CARTO', subdomains: 'abcd', maxZoom: 20
        });
    tiles.addTo(map);
    const pinsPane = map.createPane('pinsPane');
    pinsPane.style.zIndex = 650;
    const markers = [];
    function pinHtml(sev, selected, label) {
      const cls = 'pin ' + (sev || 'green') + (selected ? ' selected' : '');
      return '<div class="' + cls + '"><span class="pin-inner">' + (label || '') + '</span></div>';
    }
    function badgeClass(sev) {
      return sev === 'red' ? 'b-red' : sev === 'orange' ? 'b-orange' : 'b-green';
    }
    function makeIcon(sev, selected) {
      return L.divIcon({
        className: 'pin-wrap',
        html: pinHtml(sev, selected, sev === 'red' ? '!' : ''),
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -28]
      });
    }
    const whIcon = L.divIcon({
      className: 'pin-wrap',
      html: '<div class="pin warehouse"><span class="pin-inner">ס</span></div>',
      iconSize: [36, 36],
      iconAnchor: [18, 36]
    });
    L.marker([WH.lat, WH.lng], { icon: whIcon, pane: 'pinsPane', zIndexOffset: 900 })
      .addTo(map)
      .bindPopup('<div class="p-title">' + WH.label + '</div><div class="p-sub">נקודת מוצא לתכנון נסיעה</div>');
    function visible(s) {
      if (currentLayer === 'slow') return s.slow;
      if (currentLayer === 'normal') return !s.slow;
      return true;
    }
    function renderMarkers() {
      markers.forEach(function(m) { map.removeLayer(m); });
      markers.length = 0;
      const bounds = [];
      bounds.push([WH.lat, WH.lng]);
      SITES.forEach(function(s) {
        if (!visible(s) || s.lat == null || s.lon == null) return;
        if (!isFinite(s.lat) || !isFinite(s.lon) || (s.lat === 0 && s.lon === 0)) return;
        const icon = makeIcon(s.severity, s.isSelected);
        const m = L.marker([s.lat, s.lon], { icon: icon, pane: 'pinsPane', title: s.tip || s.customerName });
        const popup =
          '<div class="p-badge ' + badgeClass(s.severity) + '">' + (s.levelHe || '') + '</div>' +
          '<div class="p-title">' + (s.customerName || '') + '</div>' +
          '<div class="p-sub">' + (s.customerNo ? '#' + s.customerNo + ' · ' : '') + (s.city || '') + '</div>' +
          '<div class="p-addr">' + (s.address || '') + '</div>' +
          '<div class="p-eta">נסיעה ~' + s.driveMin + ' דק׳ + פריקה ~' + s.expectedMin + ' = <b>' + s.totalMin + ' דק׳</b></div>';
        m.bindPopup(popup);
        m.on('click', function() {
          try { parent.postMessage({ type: 'site-pin-click', key: s.key, site: s }, '*'); } catch (e) {}
        });
        m.addTo(map);
        markers.push(m);
        bounds.push([s.lat, s.lon]);
      });
      return bounds;
    }
    function fitAll() {
      const b = renderMarkers();
      if (b.length > 1) {
        try { map.fitBounds(b, { padding: [40, 40], maxZoom: 13 }); } catch (e) {}
      }
    }
    renderMarkers();
    fitAll();
    document.querySelectorAll('.layer-btn[data-layer]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        currentLayer = btn.getAttribute('data-layer');
        document.querySelectorAll('.layer-btn[data-layer]').forEach(function(b) {
          b.classList.toggle('active', b === btn);
        });
        renderMarkers();
      });
    });
    document.getElementById('btn-fit').addEventListener('click', fitAll);
    if (INIT_LAYER && INIT_LAYER !== 'all') {
      const btn = document.querySelector('.layer-btn[data-layer="' + INIT_LAYER + '"]');
      if (btn) btn.click();
    }
  </script>
</body>
</html>`;
}
