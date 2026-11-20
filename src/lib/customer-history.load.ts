/** טעינת תיק לקוח + אתרים */
import { toIso } from "./he-date";
import {
  collectCustomerPtoSessions,
  buildAddrTokens,
} from "./customer-pto";
import {
  type CustomerHistory,
  type CustomerSummary,
  type HSite,
  type HInquiry,
  type HCheck,
  type AtlasSite,
  g,
  num,
  loadRaw,
  mapNote,
  mapOrder,
  mapIturanVisit,
  mapVisit,
  buildIndex,
  customerTokens,
  parseCoord,
  isIsraelCoord,
} from "./customer-history.base";

export async function loadCustomerHistory(customerNo: string): Promise<CustomerHistory> {
  const raw = await loadRaw();
  const summary = buildIndex(raw).get(customerNo);
  const empty: CustomerSummary = {
    customerNo,
    name: `לקוח ${customerNo}`,
    address: "",
    addressesCount: 0,
    phone: "",
    contactName: "",
    preferredDriver: "",
    notesCount: 0,
    ordersCount: 0,
    visitsCount: 0,
    firstIso: "",
    lastIso: "",
    avgSiteMin: null,
    openInquiries: 0,
  };
  const seen = new Set<string>();
  const nameKey = (summary?.name || "")
    .toLowerCase()
    .replace(/["'״׳.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const notes = raw.notes
    .filter((r) => {
      const no = (g(r, "מס' לקוח") || "").replace(/\.0+$/, "");
      if (no && no === customerNo) return true;
      if (nameKey) {
        const on = (g(r, "שם לקוח") || "")
          .toLowerCase()
          .replace(/["'״׳.,]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (on && (on === nameKey || on.includes(nameKey) || nameKey.includes(on))) return true;
      }
      return false;
    })
    .map(mapNote)
    .filter((n) => n.id && !seen.has(n.id) && !!seen.add(n.id))
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso));

  const ituranVisits = raw.ituranVisits
    .filter((r) => (g(r, "מס' לקוח") || "").replace(/\.0+$/, "") === customerNo)
    .map(mapIturanVisit)
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso));

  const orders = raw.orders
    .filter((r) => {
      const no = (g(r, "מס' לקוח") || g(r, "מספר לקוח") || "").replace(/\.0+$/, "");
      if (no && no === customerNo) return true;
      if (nameKey) {
        const on = (g(r, "שם לקוח") || g(r, "לקוח") || "")
          .toLowerCase()
          .replace(/["'״׳.,]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (on && (on === nameKey || on.includes(nameKey) || nameKey.includes(on))) return true;
      }
      return false;
    })
    .map(mapOrder)
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso));

  const visits = raw.visits
    .filter((r) => customerTokens(g(r, "לקוחות")).some((c) => c.no === customerNo))
    .map(mapVisit)
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso));

  const sites: HSite[] = raw.sites
    .filter((r) => (g(r, "מס' לקוח") || "").replace(/\.0+$/, "") === customerNo)
    .map((r) => ({
      siteKey: g(r, "מפתח אתר"),
      address: g(r, "כתובת"),
      visits: num(g(r, "כמות ביקורים")) ?? 0,
      lastIso: toIso(g(r, "תאריך ביקור אחרון")),
      samples: num(g(r, "מדידות")) ?? 0,
      medianMin: num(g(r, "P50 משך באתר")),
      p80Min: num(g(r, "P80 תכנון בטוח")),
      maxMin: num(g(r, "מקסימום דקות")),
      confidence: g(r, "רמת ביטחון"),
    }));

  const noteIds = new Set(notes.map((n) => n.id));
  const inquiries: HInquiry[] = raw.inquiries
    .filter(
      (r) =>
        (g(r, "מס' לקוח") || "").replace(/\.0+$/, "") === customerNo ||
        notes.some((n) => n.id === g(r, "מס' תעודה")),
    )
    .map((r) => ({
      noteId: g(r, "מס' תעודה"),
      reason: g(r, "סיבה"),
      reply: g(r, "תשובה"),
      status: g(r, "סטטוס"),
      updatedIso: toIso(g(r, "updatedAt") || g(r, "תאריך")),
      fileUrl: g(r, "כתובת הקובץ (URL)"),
    }));

  const checks: HCheck[] = raw.checks
    .filter((r) => noteIds.has(g(r, "מספר תעודה")))
    .map((r) => ({
      dateIso: toIso(g(r, "תאריך")),
      noteId: g(r, "מספר תעודה"),
      approver: g(r, "מאשר"),
      checkId: g(r, "מזהה בדיקה"),
      result: g(r, "אסמכתא / תוצאת בדיקה"),
    }));

  const stopSamples = notes.map((n) => n.itStop).filter((x): x is number => x != null && x > 0);
  for (const s of sites) {
    if (s.medianMin != null && s.medianMin > 0) stopSamples.push(s.medianMin);
  }
  const avgSiteMin = stopSamples.length
    ? Math.round(stopSamples.reduce((a, b) => a + b, 0) / stopSamples.length)
    : null;
  const openInquiries = inquiries.filter((i) => !/סגור|closed|done|הושלם/i.test(i.status)).length;
  const cust: CustomerSummary = {
    ...(summary ?? empty),
    notesCount: notes.length,
    ordersCount: orders.length,
    visitsCount: visits.length + ituranVisits.length,
    avgSiteMin,
    openInquiries,
  };

  const addrTokens = buildAddrTokens([
    ...notes.flatMap((n) => [n.address, n.customerName]),
    summary?.name || "",
    summary?.address || "",
    nameKey,
  ]);
  if (/ערוגת|בשם|616088/.test(nameKey + customerNo + notes.map((n) => n.customerName).join(""))) {
    for (const x of ["קדימה", "צורן", "כנרת", "רוטשילד", "ערוגת", "הבשם"]) addrTokens.add(x);
  }

  const ptoSessions = collectCustomerPtoSessions({
    customerNo,
    nameKey,
    noteIds,
    addrTokens,
    ptoRows: raw.pto || [],
    sessionRows: raw.ptoSheetSessions || [],
    notes,
    ituranVisits,
    visits,
  });

  return {
    customer: cust,
    notes,
    orders,
    ituranVisits,
    visits,
    sites,
    inquiries,
    checks,
    ptoSessions,
    generatedAt: new Date().toISOString(),
  };
}

export async function loadSiteAtlas() {
  const raw = await loadRaw();
  const visitsBySite = new Map<string, ReturnType<typeof mapVisit>[]>();
  const customersBySite = new Map<string, { no: string; name: string }>();
  for (const row of raw.visits) {
    const visit = mapVisit(row);
    const key = visit.siteKey || `${visit.city}|${visit.address}`;
    if (!visit.address || !key) continue;
    if (!visitsBySite.has(key)) visitsBySite.set(key, []);
    visitsBySite.get(key)!.push(visit);
    for (const c of customerTokens(g(row, "לקוחות"))) {
      if (c.no) customersBySite.set(key, { no: c.no, name: c.name });
    }
  }

  const sites: AtlasSite[] = [];
  for (const row of raw.sites) {
    const siteKey = g(row, "מפתח אתר");
    const address = g(row, "כתובת אספקה") || g(row, "כתובת");
    const city = g(row, "עיר");
    if (!address) continue;
    const key = siteKey || `${city}|${address}`;
    const history = (visitsBySite.get(key) || []).sort((a, b) => b.dateIso.localeCompare(a.dateIso));
    let latitude =
      parseCoord(g(row, "lat")) ??
      parseCoord(g(row, "Lat")) ??
      parseCoord(g(row, "latitude")) ??
      parseCoord(g(row, "קו רוחב"));
    let longitude =
      parseCoord(g(row, "lng")) ??
      parseCoord(g(row, "Lng")) ??
      parseCoord(g(row, "lon")) ??
      parseCoord(g(row, "longitude")) ??
      parseCoord(g(row, "קו אורך"));
    if (latitude != null && longitude != null) {
      if ((latitude === 0 && longitude === 0) || !isIsraelCoord(latitude, longitude)) {
        latitude = null;
        longitude = null;
      }
    }
    const ptoHistory = history.filter((v) => v.ptoMin != null && v.ptoMin > 0);
    const ptoTotalMin = ptoHistory.reduce((s, v) => s + (v.ptoMin || 0), 0);
    sites.push({
      siteKey,
      address,
      city,
      customerNo: g(row, "מס' לקוח") || customersBySite.get(key)?.no || "",
      customerName: g(row, "שם לקוח") || customersBySite.get(key)?.name || "",
      visits: num(g(row, "כמות ביקורים") || g(row, "ביקורים")) ?? history.length,
      lastIso: toIso(g(row, "תאריך ביקור אחרון") || g(row, "ביקור אחרון")),
      samples: num(g(row, "מדידות")) ?? history.filter((v) => v.siteMin != null).length,
      medianMin: num(g(row, "P50 משך באתר") || g(row, "באתר חציון (דק׳)")),
      p80Min: num(g(row, "P80 תכנון בטוח") || g(row, "באתר P80 (דק׳)")),
      maxMin: num(g(row, "מקסימום דקות") || g(row, "באתר מקס׳ (דק׳)")),
      confidence: g(row, "רמת ביטחון") || g(row, "ביטחון"),
      latitude,
      longitude,
      ptoOpens: ptoHistory.length,
      ptoTotalMin,
      visitHistory: history.map((v) => ({
        dateIso: v.dateIso,
        truck: v.truck,
        driver: v.driver,
        notes: v.noteIds,
        orders: v.orderIds,
        durationMin: v.siteMin ?? v.ituranMin,
        ptoMin: v.ptoMin,
      })),
    });
  }

  const cityCounts = new Map<string, number>();
  for (const site of sites) {
    if (site.city) cityCounts.set(site.city, (cityCounts.get(site.city) || 0) + site.visits);
  }
  return {
    sites: sites.sort((a, b) => b.visits - a.visits),
    cityCount: cityCounts.size,
    cities: [...cityCounts]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    mappedCount: sites.filter((s) => s.latitude != null && s.longitude != null).length,
    generatedAt: new Date().toISOString(),
  };
}
