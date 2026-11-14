/**
 * מחולל מפת Leaflet — סיכות עם שם לקוח + רחוב, לחיצה בלי בריחת זום
 */
export const SLOW_UNLOAD_MIN = 20;

export const WAREHOUSES = [
  { id: "harash_10", lat: 32.1508, lng: 34.8926, label: "מחסן החרש 10, הוד השרון", short: "חרש" },
  { id: "hatalmid_6", lat: 32.1544, lng: 34.8886, label: "מחסן התלמיד 6, הוד השרון", short: "תלמיד" },
] as const;
export const WAREHOUSE = WAREHOUSES[0];

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

export type MapSitePin = {
  siteKey: string;
  customer: string;
  customerNo: string;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  hasCoords?: boolean;
  avgStopMin?: number | null;
  maxStopMin?: number | null;
  over20?: number;
  severity?: "normal" | "delayed" | "critical" | string;
  driveHarashMin?: number | null;
  driveTalmidMin?: number | null;
  totalMissionHarashMin?: number | null;
  totalMissionTalmidMin?: number | null;
  visits?: number;
};

export type MapWarehouse = {
  id: string;
  key?: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  short: string;
  loadDelayPct?: number;
};

export type HikmatProgress = {
  active: boolean;
  completedStops: number;
  totalStopsToday: number;
  progressPct: number;
  openLabel?: string;
  etaBackHe?: string;
};

export type PinSeverity = "green" | "orange" | "red";
export type MapPinLayer = "all" | "slow" | "normal";

export function isValidMapCoord(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= 29.4 && lat <= 33.5 && lng >= 34.2 && lng <= 35.9;
}

export function pinSeverityFromSite(site: MapSitePin): PinSeverity {
  const sev = String(site.severity || "");
  if (sev === "critical") return "red";
  if (sev === "delayed") return "orange";
  const avg = Number(site.avgStopMin || 0);
  const max = Number(site.maxStopMin || 0);
  if (avg > 40 || max > 60 || (site.over20 || 0) >= 3) return "red";
  if (avg > 20 || (site.over20 || 0) >= 1) return "orange";
  return "green";
}

export function isSlowUnload(site: MapSitePin): boolean {
  return pinSeverityFromSite(site) !== "green";
}

export function isSiteDelayBottleneck(site: MapSitePin): boolean {
  return pinSeverityFromSite(site) === "red";
}

export function delayScorePct(site: MapSitePin): number {
  const avg = Number(site.avgStopMin || 0);
  if (avg <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((avg - 20) / 40) * 100)));
}

export function generateInteractiveMapHtml(
  sites: MapSitePin[],
  selectedKey: string | undefined,
  cartoKey: string,
  pinLayer: MapPinLayer = "all",
  warehouses: MapWarehouse[] = [],
  hikmat?: HikmatProgress | null,
  warehouseLoadDelay?: Record<string, number>,
): string {
  const pins = sites
    .filter((s) => isValidMapCoord(s.lat, s.lng))
    .map((s) => {
      const severity = pinSeverityFromSite(s);
      const driveMin = s.driveHarashMin ?? s.driveTalmidMin ?? 15;
      const expectedMin = Math.round(Number(s.avgStopMin || 20));
      const street = String(s.address || "").trim();
      const city = String(s.city || "").trim();
      const cust = String(s.customer || "").trim();
      const no = String(s.customerNo || "").trim();
      const streetLabel = street ? (street.length > 28 ? street.slice(0, 26) + "…" : street) : city || cust || "אתר";
      const locLine = [street, city].filter(Boolean).join(", ");
      return {
        key: s.siteKey,
        customerName: cust,
        customerNo: no,
        city,
        address: street,
        streetLabel,
        locLine,
        lat: s.lat,
        lon: s.lng,
        severity,
        slow: severity !== "green",
        delayPct: delayScorePct(s),
        driveMin,
        expectedMin,
        totalMin: Math.round(Number(s.totalMissionHarashMin || driveMin + expectedMin)),
        levelHe: severity === "red" ? "צוואר בקבוק" : severity === "orange" ? "מעכב" : "תקין",
        isSelected: selectedKey === s.siteKey,
        tip: [cust && (no ? `${cust} #${no}` : cust), locLine].filter(Boolean).join(" · "),
      };
    });

  const whList = (warehouses.length ? warehouses : WAREHOUSES.map((w) => ({ ...w, name: w.label }))).map((w) => {
    const id = String((w as MapWarehouse).id || (w as MapWarehouse).key || "");
    const pct =
      warehouseLoadDelay?.[id] ??
      warehouseLoadDelay?.[(w as MapWarehouse).key || ""] ??
      (w as MapWarehouse).loadDelayPct ??
      0;
    return {
      id,
      lat: w.lat,
      lng: w.lng,
      label: (w as MapWarehouse).name || (w as { label?: string }).label || id,
      short: w.short || "מ",
      loadPct: Number(pct) || 0,
    };
  });

  const progress = hikmat || {
    active: false,
    completedStops: 0,
    totalStopsToday: 0,
    progressPct: 0,
    openLabel: "",
    etaBackHe: "",
  };

  const sitesJson = JSON.stringify(pins).replace(/</g, "\\u003c");
  const whJson = JSON.stringify(whList).replace(/</g, "\\u003c");
  const progressJson = JSON.stringify(progress).replace(/</g, "\\u003c");
  const tileUrl = cartoKey
    ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?apikey=${cartoKey}`
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png";

  return `<!DOCTYPE html>
<html lang="he" dir="rtl"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
html,body,#map{margin:0;height:100%;width:100%;background:#0b1220;font-family:system-ui,sans-serif}
.leaflet-container{background:#0b1220;touch-action:manipulation}
.pin-wrap,.leaflet-div-icon{background:transparent!important;border:0!important}
.pin{width:44px;height:44px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.pin-inner{width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}
.pin-inner span{transform:rotate(45deg);font-size:10px;font-weight:800;color:#fff}
.pin.warehouse .pin-inner{background:#1d4ed8;border-radius:8px;transform:none;width:34px;height:34px}
.pin.warehouse .pin-inner span{transform:none;font-size:11px}
.pin.wh-green .pin-inner{background:#047857}.pin.wh-orange .pin-inner{background:#c2410c}.pin.wh-red .pin-inner{background:#b91c1c;animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.72}}
.pin-dot{width:18px;height:18px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);margin:0 auto}
.pin-dot.green{background:#059669}.pin-dot.orange{background:#d97706}.pin-dot.red{background:#dc2626}
.pin-dot.selected{box-shadow:0 0 0 3px #34d399,0 1px 4px rgba(0,0,0,.45)}
.pin-label-box{display:flex;flex-direction:column;align-items:center;pointer-events:none;transform:translateY(-2px)}
.pin-name{margin-top:3px;max-width:110px;padding:2px 6px;border-radius:6px;background:rgba(255,255,255,.96);border:1px solid rgba(15,23,42,.12);color:#0f172a;font-size:10px;font-weight:800;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 6px rgba(0,0,0,.25);text-align:center}
.pin-street{max-width:110px;padding:0 4px;margin-top:1px;color:#334155;font-size:9px;font-weight:700;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:rgba(255,255,255,.88);border-radius:4px;text-align:center}
.leaflet-tooltip.pin-tip{background:rgba(255,255,255,.97);border:1px solid #e2e8f0;border-radius:8px;padding:4px 8px;font-size:11px;font-weight:800;color:#0f172a;box-shadow:0 2px 8px rgba(0,0,0,.2);direction:rtl;text-align:right}
.leaflet-tooltip.pin-tip .sub{font-size:10px;font-weight:700;color:#64748b}
.leaflet-marker-icon{cursor:pointer!important}
.ctrl{position:absolute;z-index:1000;top:10px;right:10px;display:flex;gap:6px;flex-wrap:wrap}
.layer-btn,.fit-btn{border:0;border-radius:999px;padding:8px 12px;font-size:11px;font-weight:800;background:rgba(15,23,42,.92);color:#e2e8f0;cursor:pointer;min-height:36px;touch-action:manipulation;box-shadow:0 2px 8px rgba(0,0,0,.35)}
.layer-btn.active{background:#059669;color:#fff}
.live{position:absolute;z-index:1000;top:10px;left:10px;display:flex;align-items:center;gap:6px;background:rgba(15,23,42,.92);color:#a7f3d0;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:800;box-shadow:0 2px 8px rgba(0,0,0,.35)}
.live i{width:8px;height:8px;border-radius:50%;background:#34d399;display:inline-block;animation:pulse 1.4s infinite}
.progress{position:absolute;z-index:1000;bottom:14px;left:12px;right:12px;background:rgba(8,17,27,.94);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:10px 12px;color:#e2e8f0;box-shadow:0 8px 24px rgba(0,0,0,.4)}
.progress .title{font-size:11px;font-weight:800;margin-bottom:6px;display:flex;justify-content:space-between;gap:8px}
.progress .bar{height:8px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden}
.progress .fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#10b981,#34d399)}
.progress .meta{margin-top:6px;font-size:10px;color:#94a3b8}
.leaflet-popup-content-wrapper{border-radius:12px;font-size:12px}
.p-title{font-weight:800;margin-top:4px}.p-sub,.p-addr,.p-eta{color:#64748b;margin-top:2px}
.p-badge{display:inline-block;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:800;color:#fff}
.b-green{background:#059669}.b-orange{background:#d97706}.b-red{background:#dc2626}
</style>
</head><body>
<div id="map"></div>
<div class="live"><i></i> חי · 30ש׳</div>
<div class="ctrl">
  <button class="layer-btn active" data-layer="all" type="button">הכל</button>
  <button class="layer-btn" data-layer="slow" type="button">מעכבים</button>
  <button class="layer-btn" data-layer="normal" type="button">תקינים</button>
  <button class="fit-btn" id="btn-fit" type="button">התאם</button>
</div>
<div class="progress" id="hikmat-progress" style="display:none">
  <div class="title"><span>סבב חכמת</span><span id="hp-pct">0%</span></div>
  <div class="bar"><div class="fill" id="hp-fill" style="width:0%"></div></div>
  <div class="meta" id="hp-meta"></div>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<script>
const SITES=${sitesJson};
const WH_LIST=${whJson};
const PROGRESS=${progressJson};
const INIT_LAYER=${JSON.stringify(pinLayer)};
const TILE=${JSON.stringify(tileUrl)};
let currentLayer=INIT_LAYER||'all';

const map=L.map('map',{
  zoomControl:false,
  tap:true,
  preferCanvas:false,
  fadeAnimation:false,
  markerZoomAnimation:false,
  zoomSnap:0.25
}).setView([32.15,34.89],11);
L.control.zoom({position:'bottomright'}).addTo(map);
L.tileLayer(TILE,{maxZoom:19,attribution:'© CARTO · OSM',updateWhenIdle:true}).addTo(map);
map.createPane('pinsPane');
map.getPane('pinsPane').style.zIndex=650;

const markersLayer=L.layerGroup().addTo(map);

function badgeClass(sev){return sev==='red'?'b-red':sev==='orange'?'b-orange':'b-green'}
function esc(t){return String(t||'').replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/"/g,'"')}
function shortName(s){
  const n=(s.customerName||'').trim();
  if(n) return n.length>16?n.slice(0,15)+'…':n;
  const a=(s.streetLabel||s.address||'').trim();
  return a? (a.length>16?a.slice(0,15)+'…':a) : 'אתר';
}
function shortStreet(s){
  const a=(s.streetLabel||s.address||'').trim();
  if(!a) return (s.city||'');
  return a.length>18?a.slice(0,17)+'…':a;
}

function labeledIcon(sev,selected,s){
  const name=esc(shortName(s));
  const street=esc(shortStreet(s));
  const city=esc((s.city||'').trim());
  const showStreet=street && street!==name;
  const html=
    '<div class="pin-label-box">'
    +'<div class="pin-dot '+sev+(selected?' selected':'')+'"></div>'
    +'<div class="pin-name">'+name+'</div>'
    +(showStreet?'<div class="pin-street">'+street+(city?' · '+city:'')+'</div>':'')
    +'</div>';
  return L.divIcon({
    className:'pin-wrap',
    html:html,
    iconSize:[120,52],
    iconAnchor:[60,10],
    popupAnchor:[0,-12]
  });
}

function tipHtml(s){
  const line1=esc(s.customerName||s.streetLabel||'אתר')+(s.customerNo?' #'+esc(s.customerNo):'');
  const line2=[s.address,s.city].filter(Boolean).map(esc).join(' · ');
  return line1+(line2?'<div class="sub">'+line2+'</div>':'');
}

function whClass(pct){if(pct>60)return 'wh-red';if(pct>25)return 'wh-orange';return 'wh-green'}
WH_LIST.forEach(function(wh){
  const pct=wh.loadPct||0;
  const icon=L.divIcon({
    className:'pin-wrap',
    html:'<div class="pin warehouse '+whClass(pct)+'" style="width:36px;height:36px"><div class="pin-inner"><span>'+esc(wh.short||'מ')+'</span></div></div>',
    iconSize:[36,36],iconAnchor:[18,36]
  });
  const m=L.marker([wh.lat,wh.lng],{icon:icon,zIndexOffset:900,interactive:true,keyboard:false});
  m.bindPopup('<div class="p-title">'+esc(wh.label)+'</div><div class="p-sub">מחסן · עיכוב העמסה '+pct+'%</div>',{maxWidth:220,autoPan:false});
  m.on('click',function(e){
    if(e.originalEvent){try{L.DomEvent.stop(e.originalEvent)}catch(err){}}
    try{parent.postMessage({type:'warehouse-click',id:wh.id},'*')}catch(err){}
  });
  m.addTo(map);
});

function visible(s){
  if(currentLayer==='slow')return s.slow;
  if(currentLayer==='normal')return !s.slow;
  return true;
}

function openSite(s,e){
  if(e){
    try{L.DomEvent.stop(e)}catch(err){}
    if(e.originalEvent){try{L.DomEvent.stop(e.originalEvent)}catch(err2){}}
  }
  try{
    parent.postMessage({
      type:'site-pin-click',
      key:s.key,
      site:{key:s.key,customerName:s.customerName,customerNo:s.customerNo,address:s.address,city:s.city}
    },'*');
  }catch(err){}
}

function buildMarker(s){
  const m=L.marker([s.lat,s.lon],{
    icon:labeledIcon(s.severity,!!s.isSelected,s),
    title:(s.customerName||'')+(s.customerNo?' #'+s.customerNo:'')+' · '+(s.address||'')+' '+(s.city||''),
    keyboard:false,
    riseOnHover:true,
    pane:'pinsPane'
  });
  const popup='<div class="p-badge '+badgeClass(s.severity)+'">'+(s.levelHe||'')+'</div>'
    +'<div class="p-title">'+(esc(s.customerName)||'לקוח')+(s.customerNo?' <b>#'+esc(s.customerNo)+'</b>':'')+'</div>'
    +'<div class="p-addr">'+(esc(s.address)||'')+'</div>'
    +'<div class="p-sub">'+(esc(s.city)||'')+'</div>'
    +'<div class="p-eta">נסיעה ~'+s.driveMin+' + פריקה ~'+s.expectedMin+' = <b>'+s.totalMin+' דק\u2019</b></div>';
  m.bindPopup(popup,{maxWidth:260,autoPan:false,closeButton:true,closeOnClick:false});
  m.bindTooltip(tipHtml(s),{direction:'top',offset:[0,-8],opacity:1,className:'pin-tip',sticky:false});
  m.on('click',function(e){openSite(s,e)});
  return m;
}

function renderMarkers(doFit){
  markersLayer.clearLayers();
  const bounds=[];
  WH_LIST.forEach(function(wh){bounds.push([wh.lat,wh.lng])});
  for(let i=0;i<SITES.length;i++){
    const s=SITES[i];
    if(!visible(s)||s.lat==null||s.lon==null)continue;
    if(!isFinite(s.lat)||!isFinite(s.lon)||(s.lat===0&&s.lon===0))continue;
    markersLayer.addLayer(buildMarker(s));
    bounds.push([s.lat,s.lon]);
  }
  if(doFit && bounds.length>1){
    try{map.fitBounds(bounds,{padding:[36,36],maxZoom:13})}catch(e){}
  }
  return bounds;
}

renderMarkers(true);
map.doubleClickZoom.disable();

document.querySelectorAll('.layer-btn[data-layer]').forEach(function(btn){
  btn.addEventListener('click',function(){
    currentLayer=btn.getAttribute('data-layer');
    document.querySelectorAll('.layer-btn[data-layer]').forEach(function(b){b.classList.toggle('active',b===btn)});
    renderMarkers(false);
  });
});
document.getElementById('btn-fit').addEventListener('click',function(){renderMarkers(true)});
if(INIT_LAYER&&INIT_LAYER!=='all'){
  const btn=document.querySelector('.layer-btn[data-layer="'+INIT_LAYER+'"]');
  if(btn)btn.click();
}

(function renderProgress(){
  const box=document.getElementById('hikmat-progress');
  if(!PROGRESS||(!PROGRESS.active&&!(PROGRESS.totalStopsToday>0))){box.style.display='none';return}
  box.style.display='block';
  const pct=Math.max(0,Math.min(100,PROGRESS.progressPct||0));
  document.getElementById('hp-pct').textContent=pct+'%';
  document.getElementById('hp-fill').style.width=pct+'%';
  const parts=[];
  parts.push((PROGRESS.completedStops||0)+'/'+(PROGRESS.totalStopsToday||0)+' תחנות');
  if(PROGRESS.openLabel)parts.push('פתוח: '+PROGRESS.openLabel);
  if(PROGRESS.etaBackHe)parts.push('חזרה ~ '+PROGRESS.etaBackHe);
  document.getElementById('hp-meta').textContent=parts.join(' · ');
})();
<\/script>
</body></html>`;
}

export function pinSeverity(site: {
  severity?: string;
  avgStopMin?: number | null;
  maxStopMin?: number | null;
  over20?: number;
  medianMin?: number | null;
  p80Min?: number | null;
  maxMin?: number | null;
}): PinSeverity {
  return pinSeverityFromSite({
    siteKey: "",
    customer: "",
    customerNo: "",
    address: "",
    city: "",
    lat: null,
    lng: null,
    severity: site.severity,
    avgStopMin: site.avgStopMin ?? site.medianMin,
    maxStopMin: site.maxStopMin ?? site.maxMin,
    over20: site.over20,
  });
}

export function avgUnloadMin(site: {
  avgStopMin?: number | null;
  medianMin?: number | null;
  p80Min?: number | null;
  maxMin?: number | null;
}): number {
  if (site.avgStopMin != null && site.avgStopMin > 0) return site.avgStopMin;
  if (site.medianMin != null && site.medianMin > 0) return site.medianMin;
  if (site.p80Min != null && site.p80Min > 0) return Math.round(site.p80Min * 0.85);
  return 15;
}

export function getExpectedUnloadingMinutes(site: {
  avgStopMin?: number | null;
  p80Min?: number | null;
  medianMin?: number | null;
}): number {
  if (site.p80Min != null && site.p80Min > 0) return Math.round(site.p80Min);
  if (site.avgStopMin != null && site.avgStopMin > 0) return Math.round(site.avgStopMin);
  if (site.medianMin != null && site.medianMin > 0) return Math.round(site.medianMin * 1.15);
  return 20;
}

export function estimateDriveMinFromWarehouse(lat: number, lng: number): number {
  let bestKm = Infinity;
  for (const wh of WAREHOUSES) {
    const km = haversineKm(wh.lat, wh.lng, lat, lng);
    if (km < bestKm) bestKm = km;
  }
  const urban = bestKm < 22;
  const speedKmh = urban ? 28 : 52;
  const factor = urban ? 1.35 : 1.2;
  return Math.max(5, Math.round((bestKm / speedKmh) * 60 * factor));
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

export function buildUnloadAdvice(site: MapSitePin): UnloadAdvice {
  const expectedMin = getExpectedUnloadingMinutes(site);
  const buffer = Math.max(5, Math.round(expectedMin * 0.15));
  const driveMin =
    site.lat != null && site.lng != null
      ? estimateDriveMinFromWarehouse(site.lat, site.lng)
      : site.driveHarashMin ?? null;
  const totalMissionMin =
    site.totalMissionHarashMin ?? (driveMin != null ? driveMin + expectedMin : null);
  const sev = pinSeverityFromSite(site);
  const level = sev === "red" ? "severe" : sev === "orange" ? "slow" : "ok";
  const levelHe = sev === "red" ? "צוואר בקבוק" : sev === "orange" ? "מעכב" : "תקין";
  return {
    expectedMin,
    driveMin: driveMin != null ? Math.round(driveMin) : null,
    totalMissionMin: totalMissionMin != null ? Math.round(totalMissionMin) : null,
    level,
    levelHe,
    opinionHe: levelHe,
    aiRecommendHe:
      level === "severe"
        ? "שיבוץ זהיר · תכנן באפר מוגדל"
        : level === "slow"
          ? "עקוב אחרי זמן פריקה"
          : "שיבוץ רגיל",
    planBufferMin: buffer,
  };
}
