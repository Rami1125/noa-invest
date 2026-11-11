/**
 * מחולל מפת Leaflet מקצועית — סיכות, שכבות, המלצת זמני פריקה
 * סף ויזואלי: מעל 20 דק׳ שהייה/פריקה
 * שלב ה׳: סיכות בשכבת pinsPane (z-index 650) מעל basemap — תמיד גלויות
 */
import type { AtlasSite } from "@/lib/customer-history.functions";

/** סף משתמש: מעל 20 דק׳ = הדגשה ויזואלית */
export const SLOW_UNLOAD_MIN = 20;

export function isSlowUnload(site: AtlasSite): boolean {
  const med = site.medianMin ?? 0;
  const p80 = site.p80Min ?? 0;
  const max = site.maxMin ?? 0;
  return med >= SLOW_UNLOAD_MIN || p80 >= SLOW_UNLOAD_MIN || max >= 40;
}

/** צוואר בקבוק חמור יותר */
export function isSiteDelayBottleneck(site: AtlasSite): boolean {
  const p80 = site.p80Min ?? 0;
  const max = site.maxMin ?? 0;
  const med = site.medianMin ?? 0;
  return p80 >= 35 || max >= 45 || med >= 30;
}

export function getExpectedUnloadingMinutes(site: AtlasSite): number {
  if (site.p80Min != null && site.p80Min > 0) return Math.round(site.p80Min);
  if (site.medianMin != null && site.medianMin > 0) return Math.round(site.medianMin * 1.2);
  return 25;
}

export type UnloadAdvice = {
  expectedMin: number;
  level: "ok" | "watch" | "slow" | "severe";
  levelHe: string;
  opinionHe: string;
  aiRecommendHe: string;
  planBufferMin: number;
};

/** שיקול דעת + המלצת AI מבוססת נתוני האתר בלבד (לא המצאה) */
export function buildUnloadAdvice(site: AtlasSite): UnloadAdvice {
  const med = site.medianMin;
  const p80 = site.p80Min;
  const max = site.maxMin;
  const visits = site.visits ?? 0;
  const expectedMin = getExpectedUnloadingMinutes(site);
  const buffer = Math.max(5, Math.round(expectedMin * 0.15));

  let level: UnloadAdvice["level"] = "ok";
  if (isSiteDelayBottleneck(site) || (max != null && max >= 60) || expectedMin >= 45) {
    level = "severe";
  } else if (isSlowUnload(site) || expectedMin >= SLOW_UNLOAD_MIN) {
    level = "slow";
  } else if (expectedMin >= 15) {
    level = "watch";
  }

  const levelHe =
    level === "ok"
      ? "פריקה שגרתית"
      : level === "watch"
        ? "פריקה בינונית"
        : level === "slow"
          ? "פריקה ממושכת (מעל 20 דק׳)"
          : "צוואר בקבוק — תכנון זהיר";

  const parts: string[] = [];
  if (med != null) parts.push(`חציון ${med} דק׳`);
  if (p80 != null) parts.push(`P80 ${p80} דק׳`);
  if (max != null) parts.push(`מקסימום ${max} דק׳`);
  if (visits > 0) parts.push(`${visits} ביקורים בהיסטוריה`);
  const statsLine = parts.length ? parts.join(" · ") : "אין מספיק מדידות שהייה לאתר";

  let opinionHe = "";
  if (level === "ok") {
    opinionHe = `האתר נראה יציב לפריקה קצרה. ${statsLine}. מתאים לשיבוץ רגיל בלי תוספת זמן מיוחדת.`;
  } else if (level === "watch") {
    opinionHe = `זמן פריקה בינוני. ${statsLine}. כדאי לשריין מרווח קטן בין עצירות.`;
  } else if (level === "slow") {
    opinionHe = `מעל סף ${SLOW_UNLOAD_MIN} דק׳ — פריקה ממושכת יחסית. ${statsLine}. לא לשבץ צפוף אחרי האתר הזה.`;
  } else {
    opinionHe = `האתר מתנהג כצוואר בקבוק. ${statsLine}. עדיפות לתחילת יום או סוף מסלול, עם באפר גדול.`;
  }

  let aiRecommendHe = "";
  if (level === "ok") {
    aiRecommendHe = `המלצת תכנון: שיבצו ${expectedMin} דק׳ פריקה (+${buffer} דק׳ באפר). אין צורך במנוף ייעודי מעבר לרגיל אלא אם יש PTO בהיסטוריה.`;
  } else if (level === "watch") {
    aiRecommendHe = `המלצת תכנון: שיבצו ${expectedMin}–${expectedMin + buffer} דק׳. בדקו אם יש מנוף (PTO) בביקורים קודמים לפני דחיסת המסלול.`;
  } else if (level === "slow") {
    aiRecommendHe = `המלצת AI: אתר איטי — תכננו ${expectedMin + buffer} דק׳ לפחות ביומן. הימנעו משתי עצירות «כבדות» ברצף. אם יש פתיחות מנוף בהיסטוריה — שיבצו רכב מנוף.`;
  } else {
    aiRecommendHe = `המלצת AI: צוואר בקבוק — שריינו ${Math.max(expectedMin + 10, 50)} דק׳, העדיפו שיבוץ מוקדם בבוקר, ואל תשבצו לקוח רגיש־לזמן מיד אחרי. אשרו עם הנהג גישה וחניה לפני היציאה.`;
  }

  if ((site.ptoOpens ?? 0) > 0) {
    aiRecommendHe += ` נרשמו ${site.ptoOpens} פתיחות PTO בכתובת (סה״כ ~${Math.round(site.ptoTotalMin || 0)} דק׳ מנוף) — תכננו ציוד מנוף.`;
  }

  return {
    expectedMin,
    level,
    levelHe,
    opinionHe,
    aiRecommendHe,
    planBufferMin: buffer,
  };
}

export type MapPinLayer = "all" | "slow" | "normal";

export function generateInteractiveMapHtml(
  sites: AtlasSite[],
  selectedKey?: string,
  cartoKey?: string,
  layer: MapPinLayer = "all",
): string {
  const validSites = sites.filter((s) => s.latitude != null && s.longitude != null);
  const sitesJson = JSON.stringify(
    validSites.map((s) => {
      const advice = buildUnloadAdvice(s);
      const slow = isSlowUnload(s);
      const severe = isSiteDelayBottleneck(s);
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
        slow,
        severe,
        expectedMin: advice.expectedMin,
        level: advice.level,
        levelHe: advice.levelHe,
        opinionHe: advice.opinionHe,
        aiRecommendHe: advice.aiRecommendHe,
        isSelected: (s.siteKey || `${s.city}|${s.address}`) === selectedKey,
      };
    }),
  );

  const keyJson = JSON.stringify(cartoKey || "");
  const layerJson = JSON.stringify(layer || "all");

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
      box-shadow: 0 2px 12px rgba(0,0,0,0.15); line-height: 1.6;
    }
    .legend span { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-left: 6px; vertical-align: middle; }
    .pin-wrap { background: transparent; border: none; }
    .pin {
      width: 32px; height: 32px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
      border: 2.5px solid #fff; box-shadow: 0 3px 10px rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
    }
    .pin-inner { transform: rotate(45deg); color: #fff; font-size: 11px; font-weight: 900; line-height: 1; }
    .pin.ok { background: linear-gradient(145deg, #10b981, #059669); }
    .pin.watch { background: linear-gradient(145deg, #fbbf24, #d97706); }
    .pin.slow { background: linear-gradient(145deg, #fb923c, #ea580c); }
    .pin.severe {
      background: linear-gradient(145deg, #f87171, #dc2626);
      box-shadow: 0 0 0 3px rgba(220,38,38,0.35), 0 3px 10px rgba(0,0,0,0.45);
      animation: pulse 2.2s ease-out infinite;
    }
    .pin.selected {
      background: linear-gradient(145deg, #a78bfa, #7c3aed) !important;
      transform: rotate(-45deg) scale(1.25);
      z-index: 500;
      box-shadow: 0 0 0 4px rgba(124,58,237,0.4), 0 4px 14px rgba(0,0,0,0.5);
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(220,38,38,0.55); }
      70% { box-shadow: 0 0 0 12px rgba(220,38,38,0); }
      100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); }
    }
    .leaflet-popup-content-wrapper {
      border-radius: 16px; box-shadow: 0 12px 28px rgba(0,0,0,0.25);
      direction: rtl; text-align: right; padding: 4px 2px; max-width: 320px;
    }
    .leaflet-popup-content { margin: 10px 12px; min-width: 220px; }
    .p-title { font-size: 15px; font-weight: 900; color: #0f172a; margin: 0 0 2px; }
    .p-sub { font-size: 11px; color: #64748b; font-weight: 700; }
    .p-addr { font-size: 12px; font-weight: 700; color: #334155; margin: 8px 0; padding-top: 6px; border-top: 1px solid #f1f5f9; }
    .p-badge {
      display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 800;
      padding: 3px 9px; border-radius: 8px; margin-bottom: 6px;
    }
    .p-badge.ok { background: #ecfdf5; color: #065f46; }
    .p-badge.watch { background: #fffbeb; color: #92400e; }
    .p-badge.slow { background: #fff7ed; color: #9a3412; }
    .p-badge.severe { background: #fef2f2; color: #991b1b; }
    .p-box { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 8px; margin-top: 6px; }
    .p-box.ai { background: #f5f3ff; border-color: #ddd6fe; }
    .p-label { font-size: 10px; font-weight: 800; color: #64748b; margin-bottom: 2px; }
    .p-text { font-size: 12px; font-weight: 600; color: #1e293b; line-height: 1.45; }
    .p-eta { font-size: 16px; font-weight: 900; color: #0f172a; }
    .p-link {
      display: flex; align-items: center; justify-content: center; gap: 5px; margin-top: 8px;
      background: #2563eb; color: #fff !important; text-decoration: none; font-size: 11px;
      font-weight: 800; padding: 7px 10px; border-radius: 8px;
    }
  </style>
</head>
<body>
  <div class="map-controls-bar">
    <button type="button" id="btn-streets" class="layer-btn active" onclick="switchBase('streets')">מפת רחובות</button>
    <button type="button" id="btn-sat" class="layer-btn" onclick="switchBase('sat')">לוויין</button>
    <button type="button" id="btn-pins-all" class="layer-btn active" onclick="switchPins('all')">כל הסיכות</button>
    <button type="button" id="btn-pins-slow" class="layer-btn" onclick="switchPins('slow')">מעל 20 דק׳</button>
    <button type="button" id="btn-pins-normal" class="layer-btn" onclick="switchPins('normal')">שגרתיים</button>
  </div>
  <div class="legend">
    <div><span style="background:#059669"></span> שגרתי</div>
    <div><span style="background:#ea580c"></span> מעל 20 דק׳</div>
    <div><span style="background:#dc2626"></span> צוואר בקבוק</div>
    <div><span style="background:#7c3aed"></span> נבחר</div>
  </div>
  <div id="map"></div>
  <script>
    const sites = ${sitesJson};
    const cartoKey = ${keyJson};
    let pinFilter = ${layerJson};
    const map = L.map("map", {
      zoomControl: false,
      // שלב ה׳: סיכות תמיד בשכבה מעל אריחי הבסיס
    }).setView([32.1583, 34.8911], 11);
    L.control.zoom({ position: "bottomleft" }).addTo(map);

    // panes ייעודיים — z-index מעל tilePane (200) ו־overlayPane (400)
    map.createPane("pinsPane");
    map.getPane("pinsPane").style.zIndex = 650;
    map.getPane("pinsPane").style.pointerEvents = "auto";
    map.createPane("pinsShadowPane");
    map.getPane("pinsShadowPane").style.zIndex = 640;

    const cartoUrl = cartoKey
      ? "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=" + encodeURIComponent(cartoKey)
      : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
    const streets = L.tileLayer(cartoUrl, {
      maxZoom: 19, subdomains: "abcd",
      attribution: "© CARTO · © OpenStreetMap"
    }).addTo(map);
    const satImg = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "© Esri" }
    );
    const satLbl = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19 }
    );
    const sat = L.layerGroup([satImg, satLbl]);
    let base = "streets";
    function switchBase(mode) {
      if (mode === base) return;
      if (mode === "sat") { map.removeLayer(streets); map.addLayer(sat); }
      else { map.removeLayer(sat); map.addLayer(streets); }
      base = mode;
      document.getElementById("btn-streets").className = "layer-btn" + (mode === "streets" ? " active" : "");
      document.getElementById("btn-sat").className = "layer-btn" + (mode === "sat" ? " active" : "");
    }

    // שכבת סיכות ייעודית — תמיד מעל basemap
    const markerLayer = L.layerGroup([], { pane: "pinsPane" }).addTo(map);
    const markerByKey = {};

    function pinClass(s) {
      if (s.isSelected) return "selected";
      if (s.severe || s.level === "severe") return "severe";
      if (s.slow || s.level === "slow") return "slow";
      if (s.level === "watch") return "watch";
      return "ok";
    }
    function pinLabel(s) {
      if (s.severe) return "!";
      if (s.expectedMin) return String(Math.min(99, s.expectedMin));
      return String(s.visits > 9 ? "9+" : (s.visits || "•"));
    }
    function passesFilter(s) {
      if (pinFilter === "slow") return !!(s.slow || s.severe);
      if (pinFilter === "normal") return !(s.slow || s.severe);
      return true;
    }
    function popupHtml(s) {
      const badge = '<div class="p-badge ' + s.level + '">' + s.levelHe + '</div>';
      const cust = s.customerNo
        ? '<div class="p-sub">לקוח #' + s.customerNo + (s.customerName ? " · " + s.customerName : "") + '</div>'
        : (s.customerName ? '<div class="p-sub">' + s.customerName + '</div>' : '');
      const stats = [
        s.medianMin != null ? "חציון " + s.medianMin + " דק׳" : null,
        s.p80Min != null ? "P80 " + s.p80Min + " דק׳" : null,
        s.visits ? s.visits + " ביקורים" : null,
        s.ptoOpens ? s.ptoOpens + " PTO" : null
      ].filter(Boolean).join(" · ");
      const gmaps = "https://www.google.com/maps?q=" + s.lat + "," + s.lon + "&hl=he";
      return '<div>' + badge +
        '<div class="p-title">' + (s.customerName || "אתר") + '</div>' + cust +
        '<div class="p-addr">📍 ' + s.address + (s.city ? " · " + s.city : "") + '</div>' +
        '<div class="p-box"><div class="p-label">זמן פריקה מתוכנן</div>' +
        '<div class="p-eta">' + s.expectedMin + ' דק׳</div>' +
        (stats ? '<div class="p-text" style="margin-top:4px">' + stats + '</div>' : '') + '</div>' +
        '<div class="p-box"><div class="p-label">שיקול דעת מתי לפרוק</div>' +
        '<div class="p-text">' + s.opinionHe + '</div></div>' +
        '<div class="p-box ai"><div class="p-label">המלצת AI לזמני פריקה</div>' +
        '<div class="p-text">' + s.aiRecommendHe + '</div></div>' +
        '<a class="p-link" href="' + gmaps + '" target="_blank" rel="noopener">פתח ב-Google Maps</a></div>';
    }

    function rebuildMarkers() {
      markerLayer.clearLayers();
      const bounds = L.latLngBounds([]);
      let selectedMarker = null;
      let n = 0;
      sites.forEach(function(s) {
        if (s.lat == null || s.lon == null) return;
        if (!passesFilter(s)) return;
        n++;
        const ll = [s.lat, s.lon];
        bounds.extend(ll);
        const el = document.createElement("div");
        el.className = "pin " + pinClass(s);
        el.innerHTML = '<span class="pin-inner">' + pinLabel(s) + '</span>';
        const icon = L.divIcon({
          className: "pin-wrap",
          html: el,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
          popupAnchor: [0, -28]
        });
        const m = L.marker(ll, {
          icon: icon,
          title: s.address,
          pane: "pinsPane",
          shadowPane: "pinsShadowPane",
          zIndexOffset: 1000,
          riseOnHover: true,
        });
        m.bindPopup(popupHtml(s), { maxWidth: 340, autoPan: true });
        m.addTo(markerLayer);
        // הבטחה: הסיכה מעל שכבות הבסיס
        if (m.setZIndexOffset) m.setZIndexOffset(1000 + n);
        markerByKey[s.key] = m;
        if (s.isSelected) selectedMarker = m;
      });
      if (selectedMarker) {
        map.setView(selectedMarker.getLatLng(), 15);
        selectedMarker.openPopup();
      } else if (n > 0 && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
      }
    }

    function switchPins(mode) {
      pinFilter = mode;
      ["all","slow","normal"].forEach(function(m) {
        const el = document.getElementById("btn-pins-" + m);
        if (el) el.className = "layer-btn" + (m === mode ? " active" : "");
      });
      rebuildMarkers();
    }

    rebuildMarkers();
    // שלב ה׳ — ודאות: שכבת סיכות מעל tiles
    if (markerLayer && map.hasLayer(markerLayer)) {
      markerLayer.eachLayer(function(ly) {
        if (ly.setZIndexOffset) ly.setZIndexOffset(1000);
      });
    }
  </script>
</body>
</html>`;
}
