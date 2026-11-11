/** מחולל HTML למפת Leaflet + CARTO Basemaps */
import type { AtlasSite } from "@/lib/customer-history.functions";

/**
 * קביעה האם אתר מוגדר כמעכב/בעייתי לסידור
 * אתר מעכב: P80 >= 35 דקות, או מקסימום >= 45 דקות, או חציון >= 30 דקות
 */
export function isSiteDelayBottleneck(site: AtlasSite): boolean {
  const p80 = site.p80Min ?? 0;
  const max = site.maxMin ?? 0;
  const med = site.medianMin ?? 0;
  return p80 >= 35 || max >= 45 || med >= 30;
}

/**
 * חישוב זמן פריקה צפוי משוקלל לסידור (בדקות)
 */
export function getExpectedUnloadingMinutes(site: AtlasSite): number {
  if (site.p80Min != null && site.p80Min > 0) {
    return Math.round(site.p80Min);
  }
  if (site.medianMin != null && site.medianMin > 0) {
    return Math.round(site.medianMin * 1.2);
  }
  return 30;
}

/**
 * יצירת קוד HTML עצמאי להצגת מפת Leaflet אינטראקטיבית עם הדגשת צבע לאתרים מעכבים
 */
export function generateInteractiveMapHtml(sites: AtlasSite[], selectedKey?: string, cartoKey?: string): string {
  const validSites = sites.filter((s) => s.latitude != null && s.longitude != null);
  const sitesJson = JSON.stringify(
    validSites.map((s) => {
      const isDelay = isSiteDelayBottleneck(s);
      const expectedMin = getExpectedUnloadingMinutes(s);
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
        ptoMin: s.ptoTotalMin || 0,
        medianMin: s.medianMin,
        p80Min: s.p80Min,
        maxMin: s.maxMin,
        isDelay,
        expectedMin,
        isSelected: (s.siteKey || `${s.city}|${s.address}`) === selectedKey,
      };
    }),
  );

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #0f172a; font-family: system-ui, sans-serif; }
    .map-controls-bar { position: absolute; top: 12px; right: 12px; z-index: 1000; display: flex; gap: 6px; background: rgba(255,255,255,0.95); padding: 5px; border-radius: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.25); }
    .layer-btn { border: none; background: transparent; padding: 6px 12px; border-radius: 10px; font-size: 12px; font-weight: 800; color: #475569; cursor: pointer; }
    .layer-btn.active { background: #047857; color: #fff; }
    .custom-pin { border: 2.5px solid #fff; color: white; font-weight: 900; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 11px; box-shadow: 0 3px 9px rgba(0,0,0,0.45); }
    .custom-pin.normal { background: #059669; }
    .custom-pin.delay { background: #dc2626 !important; }
    .custom-pin.selected { background: #7c3aed !important; transform: scale(1.35); }
    .leaflet-popup-content-wrapper { border-radius: 16px; direction: rtl; text-align: right; padding: 8px; }
    .popup-title { font-size: 15px; font-weight: 900; color: #0f172a; }
    .popup-sub { font-size: 11px; color: #64748b; font-weight: 700; }
    .popup-addr { font-size: 12px; font-weight: 700; color: #334155; margin: 6px 0; }
    .popup-badge { display: inline-flex; font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 8px; margin-bottom: 6px; }
    .popup-badge.delay { background: #fef2f2; color: #991b1b; }
    .popup-badge.normal { background: #ecfdf5; color: #065f46; }
    .popup-eta-box { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 6px 8px; margin-top: 6px; }
    .popup-eta-val { font-size: 14px; font-weight: 900; color: #0f172a; }
    .popup-gmaps-link { display: flex; justify-content: center; margin-top: 8px; background: #2563eb; color: #fff !important; text-decoration: none; font-size: 11px; font-weight: 800; padding: 6px 10px; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="map-controls-bar">
    <button id="btn-streets" class="layer-btn active" onclick="switchLayer('streets')">מפת רחובות</button>
    <button id="btn-satellite" class="layer-btn" onclick="switchLayer('satellite')">תצלום לוויין</button>
  </div>
  <div id="map"></div>
  <script>
    const sites = ${sitesJson};
    const cartoKey = ${JSON.stringify(cartoKey || "")};
    const map = L.map("map", { zoomControl: false }).setView([32.1583, 34.8911], 11);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    const cartoUrl = cartoKey
      ? "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=" + encodeURIComponent(cartoKey)
      : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
    const streetsLayer = L.tileLayer(cartoUrl, { maxZoom: 19, subdomains: "abcd", attribution: "© CARTO, OSM" }).addTo(map);
    const satImagery = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "© Esri" });
    const satLabels = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 });
    const satelliteGroup = L.layerGroup([satImagery, satLabels]);
    let currentLayer = "streets";
    function switchLayer(mode) {
      if (mode === currentLayer) return;
      if (mode === "satellite") {
        map.removeLayer(streetsLayer); map.addLayer(satelliteGroup);
        document.getElementById("btn-satellite").className = "layer-btn active";
        document.getElementById("btn-streets").className = "layer-btn";
        currentLayer = "satellite";
      } else {
        map.removeLayer(satelliteGroup); map.addLayer(streetsLayer);
        document.getElementById("btn-streets").className = "layer-btn active";
        document.getElementById("btn-satellite").className = "layer-btn";
        currentLayer = "streets";
      }
    }
    const bounds = L.latLngBounds();
    let selectedMarker = null;
    sites.forEach(function(s) {
      if (s.lat == null || s.lon == null) return;
      const latLng = [s.lat, s.lon];
      bounds.extend(latLng);
      const el = document.createElement("div");
      el.className = "custom-pin " + (s.isSelected ? "selected" : (s.isDelay ? "delay" : "normal"));
      el.innerHTML = s.isDelay ? "!" : (s.visits > 9 ? "9+" : (s.visits || "*"));
      const icon = L.divIcon({ className: "marker-wrap", html: el, iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16] });
      const badgeHtml = s.isDelay
        ? '<div class="popup-badge delay">אתר מעכב (P80: ' + (s.p80Min || s.medianMin || 35) + ' דק)</div>'
        : '<div class="popup-badge normal">אתר שגרתי (חציון: ' + (s.medianMin || 20) + ' דק)</div>';
      const gmapsUrl = "https://www.google.com/maps/@?api=1&map_action=map&center=" + s.lat + "," + s.lon + "&zoom=18&basemap=satellite";
      const popupHtml = "<div>" + badgeHtml +
        '<div class="popup-title">' + s.customerName + '</div>' +
        (s.customerNo ? '<div class="popup-sub">לקוח #' + s.customerNo + '</div>' : '') +
        '<div class="popup-addr">' + s.address + ' (' + s.city + ')</div>' +
        '<div class="popup-eta-box"><div class="popup-eta-val">זמן צפוי: ' + s.expectedMin + ' דק</div></div>' +
        '<div style="font-size:11px;color:#475569;margin-top:6px">' + s.visits + ' ביקורים</div>' +
        '<a href="' + gmapsUrl + '" target="_blank" class="popup-gmaps-link">Google Maps</a></div>';
      const marker = L.marker(latLng, { icon: icon }).addTo(map);
      marker.bindPopup(popupHtml);
      if (s.isSelected) selectedMarker = marker;
    });
    if (selectedMarker) { map.setView(selectedMarker.getLatLng(), 15); selectedMarker.openPopup(); }
    else if (sites.length > 0 && bounds.isValid()) { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 }); }
  </script>
</body>
</html>`;
}
