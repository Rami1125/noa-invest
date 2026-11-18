/**
 * SitesApi.gs — getSites מטאב אתרי_לקוחות
 * עמודות ידועות: M=lat N=lng O=roadHarashKm P=driveHarashMin Q=roadTalmidKm R=driveTalmidMin
 * מיפוי לפי כותרות (לא אינדקס קשיח). אם כותרת חסרה — מדלגים על השדה, לא מנחשים.
 */
var SITES_TAB = "אתרי_לקוחות";

function _sitesNormHeader_(h) {
  return String(h || "")
    .toLowerCase()
    .replace(/["'״׳]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function _sitesHeaderIndex_(headers, aliases) {
  var normed = headers.map(_sitesNormHeader_);
  for (var a = 0; a < aliases.length; a++) {
    var want = _sitesNormHeader_(aliases[a]);
    for (var i = 0; i < normed.length; i++) {
      if (normed[i] === want) return i;
    }
  }
  for (var b = 0; b < aliases.length; b++) {
    var w = _sitesNormHeader_(aliases[b]);
    if (!w) continue;
    for (var j = 0; j < normed.length; j++) {
      if (normed[j].indexOf(w) >= 0 || w.indexOf(normed[j]) >= 0) return j;
    }
  }
  return -1;
}

function _sitesNum_(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && isFinite(v)) return v;
  var s = String(v).replace(",", ".").replace(/[^\d.\-]/g, "");
  if (!s) return null;
  var n = Number(s);
  return isFinite(n) ? n : null;
}

function handleGetSites(params) {
  params = params || {};
  var ss = SpreadsheetApp.openById(params.sheetId || MASTER_SHEET_ID);
  var sheet = ss.getSheetByName(SITES_TAB);
  if (!sheet) {
    return { success: false, error: "missing_tab", message: "לא נמצא טאב " + SITES_TAB };
  }

  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) {
    return {
      success: true,
      sites: [],
      warehouses: _sitesDefaultWarehouses_(),
      fetchedAt: new Date().toISOString(),
      withGps: 0,
      total: 0,
    };
  }

  var headers = values[0].map(function (h) {
    return String(h || "").trim();
  });

  var needCustomer = _sitesHeaderIndex_(headers, ["שם לקוח", "לקוח", "customer", "customerName"]);
  var needAddr = _sitesHeaderIndex_(headers, ["כתובת", "address", "כתובת אספקה"]);
  if (needAddr < 0) {
    return {
      success: false,
      error: "missing_header",
      message: 'חסרה כותרת: כתובת (אפשרויות: כתובת / address)',
    };
  }

  var idx = {
    customerNo: _sitesHeaderIndex_(headers, ["מספר לקוח", "מס׳ לקוח", "מס' לקוח", "customerNo", "מס לקוח"]),
    customer: needCustomer,
    address: needAddr,
    city: _sitesHeaderIndex_(headers, ["עיר", "city"]),
    region: _sitesHeaderIndex_(headers, ["אזור", "region"]),
    visits: _sitesHeaderIndex_(headers, ["ביקורים", "מספר ביקורים", "visits"]),
    avgStop: _sitesHeaderIndex_(headers, ["ממוצע שהייה", "avgStopMin", "באתר ממוצע", "ממוצע דק"]),
    maxStop: _sitesHeaderIndex_(headers, ["מקס שהייה", "maxStopMin", "באתר מקס", "מקס׳"]),
    p80: _sitesHeaderIndex_(headers, ["P80", "באתר P80", "p80", "P80 דק"]),
    over20: _sitesHeaderIndex_(headers, ["מעל 20", "over20"]),
    severity: _sitesHeaderIndex_(headers, ["severity", "חומרה"]),
    lat: _sitesHeaderIndex_(headers, ["lat", "Latitude", "קו רוחב", "קו_רוחב", "LAT"]),
    lng: _sitesHeaderIndex_(headers, ["lng", "lon", "longitude", "Longitude", "קו אורך", "קו_אורך", "LNG"]),
    roadHarash: _sitesHeaderIndex_(headers, ["roadHarashKm", "distHarashKm", "כביש חרש", "מרחק חרש"]),
    driveHarash: _sitesHeaderIndex_(headers, ["driveHarashMin", "דק חרש", "נסיעה חרש"]),
    roadTalmid: _sitesHeaderIndex_(headers, ["roadTalmidKm", "distTalmidKm", "כביש תלמיד", "מרחק תלמיד"]),
    driveTalmid: _sitesHeaderIndex_(headers, ["driveTalmidMin", "דק תלמיד", "נסיעה תלמיד"]),
    siteKey: _sitesHeaderIndex_(headers, ["siteKey", "מפתח אתר", "key"]),
  };

  function colFallback(row, headerIdx, col0) {
    if (headerIdx >= 0) return row[headerIdx];
    if (col0 >= 0 && col0 < row.length) return row[col0];
    return "";
  }

  var sites = [];
  var withGps = 0;

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (!row || !row.some(function (c) { return String(c || "").trim(); })) continue;

    var address = String(idx.address >= 0 ? row[idx.address] : "").trim();
    if (!address) continue;

    var customer = String(idx.customer >= 0 ? row[idx.customer] : "").trim();
    var customerNo = String(idx.customerNo >= 0 ? row[idx.customerNo] : "").trim();
    var city = String(idx.city >= 0 ? row[idx.city] : "").trim();

    var lat = _sitesNum_(colFallback(row, idx.lat, 12));
    var lng = _sitesNum_(colFallback(row, idx.lng, 13));
    var hasCoords =
      lat != null &&
      lng != null &&
      isFinite(lat) &&
      isFinite(lng) &&
      !(lat === 0 && lng === 0) &&
      lat >= 29 &&
      lat <= 34 &&
      lng >= 34 &&
      lng <= 36;

    if (hasCoords) withGps++;

    var avgStop = _sitesNum_(idx.avgStop >= 0 ? row[idx.avgStop] : null);
    var p80 = _sitesNum_(idx.p80 >= 0 ? row[idx.p80] : null);
    var maxStop = _sitesNum_(idx.maxStop >= 0 ? row[idx.maxStop] : null);
    var visits = _sitesNum_(idx.visits >= 0 ? row[idx.visits] : null) || 0;
    var over20 = _sitesNum_(idx.over20 >= 0 ? row[idx.over20] : null) || 0;

    var severityRaw = String(idx.severity >= 0 ? row[idx.severity] : "").trim().toLowerCase();
    var severity = "normal";
    if (severityRaw.indexOf("crit") >= 0 || severityRaw.indexOf("קריט") >= 0) severity = "critical";
    else if (severityRaw.indexOf("delay") >= 0 || severityRaw.indexOf("מעכב") >= 0) severity = "delayed";
    else if ((p80 != null && p80 > 25) || (avgStop != null && avgStop > 25) || over20 >= 3) severity = "critical";
    else if ((p80 != null && p80 > 18) || (avgStop != null && avgStop > 18) || over20 >= 1) severity = "delayed";

    var siteKey =
      String(idx.siteKey >= 0 ? row[idx.siteKey] : "").trim() ||
      [customerNo, city, address].filter(Boolean).join("|");

    sites.push({
      rowNumber: r + 1,
      siteKey: siteKey,
      customerNo: customerNo,
      customer: customer,
      address: address,
      city: city,
      region: String(idx.region >= 0 ? row[idx.region] : "").trim(),
      visits: visits,
      avgStopMin: avgStop != null ? avgStop : p80,
      maxStopMin: maxStop,
      p80Min: p80,
      over20: over20,
      severity: severity,
      lat: hasCoords ? lat : null,
      lng: hasCoords ? lng : null,
      hasCoords: hasCoords,
      distHarashKm: _sitesNum_(colFallback(row, idx.roadHarash, 14)),
      driveHarashMin: _sitesNum_(colFallback(row, idx.driveHarash, 15)),
      distTalmidKm: _sitesNum_(colFallback(row, idx.roadTalmid, 16)),
      driveTalmidMin: _sitesNum_(colFallback(row, idx.driveTalmid, 17)),
    });
  }

  return {
    success: true,
    sites: sites,
    warehouses: _sitesDefaultWarehouses_(),
    fetchedAt: new Date().toISOString(),
    withGps: withGps,
    total: sites.length,
    headersMapped: { lat: idx.lat, lng: idx.lng, address: idx.address },
  };
}

function _sitesDefaultWarehouses_() {
  return [
    {
      id: "harash_10",
      key: "harash_10",
      name: "מחסן החרש 10",
      short: "חרש 10",
      address: "החרש 10",
      lat: 32.1508,
      lng: 34.8926,
    },
    {
      id: "hatalmid_6",
      key: "hatalmid_6",
      name: "מחסן התלמיד 6",
      short: "תלמיד 6",
      address: "התלמיד 6",
      lat: 32.1544,
      lng: 34.8886,
    },
  ];
}

/**
 * העשרת GPS + מרחקים לטאב אתרי_לקוחות (הרצה ידנית חד-פעמית מ-Apps Script).
 * ממלא lat/lng חסרים (Maps Geocoder / Nominatim) ומחשב מרחק/זמן לחרש 10 ותלמיד 6.
 */
function enrichSitesDistanceAndGps() {
  var ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
  var sheet = ss.getSheetByName(SITES_TAB);
  if (!sheet) throw new Error("לא נמצא טאב " + SITES_TAB);

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return { updated: 0, geocoded: 0 };

  var headers = values[0].map(function (h) { return String(h || "").trim(); });
  var idxAddr = _sitesHeaderIndex_(headers, ["כתובת", "address", "כתובת אספקה"]);
  var idxCity = _sitesHeaderIndex_(headers, ["עיר", "city"]);
  var idxLat = _sitesHeaderIndex_(headers, ["lat", "Latitude", "קו רוחב", "LAT"]);
  var idxLng = _sitesHeaderIndex_(headers, ["lng", "lon", "longitude", "קו אורך", "LNG"]);
  var idxRH = _sitesHeaderIndex_(headers, ["roadHarashKm", "distHarashKm", "כביש חרש", "מרחק חרש"]);
  var idxDH = _sitesHeaderIndex_(headers, ["driveHarashMin", "דק חרש", "נסיעה חרש"]);
  var idxRT = _sitesHeaderIndex_(headers, ["roadTalmidKm", "distTalmidKm", "כביש תלמיד", "מרחק תלמיד"]);
  var idxDT = _sitesHeaderIndex_(headers, ["driveTalmidMin", "דק תלמיד", "נסיעה תלמיד"]);

  function col1(headerIdx, fallback0) {
    if (headerIdx >= 0) return headerIdx + 1;
    return fallback0 + 1;
  }
  var cLat = col1(idxLat, 12);
  var cLng = col1(idxLng, 13);
  var cRH = col1(idxRH, 14);
  var cDH = col1(idxDH, 15);
  var cRT = col1(idxRT, 16);
  var cDT = col1(idxDT, 17);

  var WH_H = { lat: 32.1508, lng: 34.8926 };
  var WH_T = { lat: 32.1544, lng: 34.8886 };
  var ROAD_FACTOR = 1.35;
  var SPEED_KMH = 28;

  function haversineKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var toRad = function (d) { return (d * Math.PI) / 180; };
    var dLat = toRad(lat2 - lat1);
    var dLon = toRad(lon2 - lon1);
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function geocode(address, city) {
    var q = [address, city, "ישראל"].filter(Boolean).join(", ");
    try {
      if (typeof Maps !== "undefined" && Maps.newGeocoder) {
        var res = Maps.newGeocoder().setLanguage("he").geocode(q);
        if (res && res.status === "OK" && res.results && res.results[0]) {
          var loc = res.results[0].geometry.location;
          return { lat: Number(loc.lat), lng: Number(loc.lng), source: "maps" };
        }
      }
    } catch (e1) {}
    try {
      var url =
        "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=il&q=" +
        encodeURIComponent(q);
      var resp = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        headers: { "User-Agent": "Saban-Noa-SitesEnrich/1.0" },
      });
      if (resp.getResponseCode() === 200) {
        var arr = JSON.parse(resp.getContentText());
        if (arr && arr[0]) {
          return { lat: Number(arr[0].lat), lng: Number(arr[0].lon), source: "nominatim" };
        }
      }
    } catch (e2) {}
    return null;
  }

  var updated = 0;
  var geocoded = 0;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      if (!row || !row.some(function (c) { return String(c || "").trim(); })) continue;

      var address = idxAddr >= 0 ? String(row[idxAddr] || "").trim() : "";
      if (!address) continue;
      var city = idxCity >= 0 ? String(row[idxCity] || "").trim() : "";

      var lat = _sitesNum_(idxLat >= 0 ? row[idxLat] : row[12]);
      var lng = _sitesNum_(idxLng >= 0 ? row[idxLng] : row[13]);
      var needGeo =
        lat == null ||
        lng == null ||
        !isFinite(lat) ||
        !isFinite(lng) ||
        (lat === 0 && lng === 0);

      if (needGeo) {
        Utilities.sleep(1100);
        var g = geocode(address, city);
        if (!g) continue;
        lat = g.lat;
        lng = g.lng;
        sheet.getRange(r + 1, cLat).setValue(lat);
        sheet.getRange(r + 1, cLng).setValue(lng);
        geocoded++;
      }

      if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) continue;

      var kmH = haversineKm(lat, lng, WH_H.lat, WH_H.lng) * ROAD_FACTOR;
      var kmT = haversineKm(lat, lng, WH_T.lat, WH_T.lng) * ROAD_FACTOR;
      var minH = Math.max(4, Math.round((kmH / SPEED_KMH) * 60));
      var minT = Math.max(4, Math.round((kmT / SPEED_KMH) * 60));

      sheet.getRange(r + 1, cRH).setValue(Math.round(kmH * 10) / 10);
      sheet.getRange(r + 1, cDH).setValue(minH);
      sheet.getRange(r + 1, cRT).setValue(Math.round(kmT * 10) / 10);
      sheet.getRange(r + 1, cDT).setValue(minT);
      updated++;
    }
  } finally {
    lock.releaseLock();
  }

  Logger.log(JSON.stringify({ updated: updated, geocoded: geocoded }));
  return { success: true, updated: updated, geocoded: geocoded };
}
