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
    .map(mapNote)
    .filter((n) => n.customerNo === customerNo || (nameKey && n.customerName.toLowerCase().includes(nameKey)));
  const orders = raw.orders.map(mapOrder).filter((o) => o.customerNo === customerNo);
  const ituranVisits = raw.ituran
    .map(mapIturanVisit)
    .filter((v) => v.customerNo === customerNo || (nameKey && (v.customerName || "").toLowerCase().includes(nameKey)));
  const visits = raw.visits
    .map(mapVisit)
    .filter((v) => v.customerNos.includes(customerNo) || (nameKey && v.customerNames.some((n) => n.toLowerCase().includes(nameKey))));

  const sites: HSite[] = [];
  for (const row of raw.sites) {
    const nos = customerTokens(g(row, "לקוחות")).map((c) => c.no).filter(Boolean);
    if (!nos.includes(customerNo)) continue;
    sites.push({
      siteKey: g(row, "מפתח אתר"),
      address: g(row, "כתובת אספקה") || g(row, "כתובת"),
      city: g(row, "עיר"),
      customerNo,
      customerName: summary?.name || "",
      latitude: parseCoord(g(row, "lat")) ?? parseCoord(g(row, "latitude")),
      longitude: parseCoord(g(row, "lng")) ?? parseCoord(g(row, "longitude")),
      visits: num(g(row, "ביקורים")) ?? 0,
      lastVisitIso: toIso(g(row, "ביקור אחרון") || g(row, "תאריך אחרון")),
      p80Min: num(g(row, "P80") || g(row, "p80")),
      avgMin: num(g(row, "ממוצע דק") || g(row, "avg")),
    });
  }

  const inquiries: HInquiry[] = [];
  for (const row of raw.inquiries || []) {
    const no = (g(row, "מס' לקוח") || "").replace(/\.0+$/, "");
    if (no !== customerNo) continue;
    inquiries.push({
      id: g(row, "מזהה") || g(row, "id"),
      status: g(row, "סטטוס"),
      subject: g(row, "נושא") || g(row, "תיאור"),
      createdIso: toIso(g(row, "תאריך") || g(row, "נוצר")),
    });
  }

  const checks: HCheck[] = [];
  for (const row of raw.checks || []) {
    const no = (g(row, "מס' לקוח") || "").replace(/\.0+$/, "");
    if (no !== customerNo) continue;
    checks.push({
      id: g(row, "מזהה") || g(row, "id"),
      status: g(row, "סטטוס"),
      note: g(row, "הערה") || g(row, "תיאור"),
      createdIso: toIso(g(row, "תאריך")),
    });
  }

  const ptoSessions = collectCustomerPtoSessions(raw, customerNo, summary?.name || "");
  const siteMins = visits.map((v) => v.siteMin).filter((n): n is number => n != null && n > 0);
  const avgSiteMin = siteMins.length
    ? Math.round((siteMins.reduce((a, b) => a + b, 0) / siteMins.length) * 10) / 10
    : summary?.avgSiteMin ?? null;

  const customer: CustomerSummary = {
    ...(summary || empty),
    notesCount: notes.length,
    ordersCount: orders.length,
    visitsCount: visits.length,
    openInquiries: inquiries.filter((i) => !/סגור|closed|done|טופל/i.test(i.status || "")).length,
    avgSiteMin,
    addressesCount: new Set(sites.map((s) => s.address).filter(Boolean)).size || (summary?.addressesCount ?? 0),
  };

  return {
    customer,
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
      parseCoord(g(row, "longitude")) ??
      parseCoord(g(row, "קו אורך"));
    if (latitude != null && longitude != null && !isIsraelCoord(latitude, longitude)) {
      latitude = null;
      longitude = null;
    }
    const ptoHistory = history.filter((v) => (v.ptoMin ?? 0) > 0);
    const ptoTotalMin = ptoHistory.reduce((s, v) => s + (v.ptoMin || 0), 0);
    const cust = customersBySite.get(key);
    sites.push({
      siteKey: key,
      address,
      city,
      customerNo: cust?.no || "",
      customerName: cust?.name || g(row, "לקוח") || "",
      latitude,
      longitude,
      visits: history.length || num(g(row, "ביקורים")) || 0,
      lastVisitIso: history[0]?.dateIso || toIso(g(row, "ביקור אחרון")),
      p80Min: num(g(row, "P80") || g(row, "p80")),
      avgMin: num(g(row, "ממוצע דק") || g(row, "avg")),
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

/** אינדקס לקוחות מכל הטאבים — לרשימת /customers */
export async function loadCustomerIndex(): Promise<CustomerSummary[]> {
  const raw = await loadRaw();
  const index = buildIndex(raw);
  return [...index.values()].sort((a, b) => {
    const byLast = (b.lastIso || "").localeCompare(a.lastIso || "");
    if (byLast) return byLast;
    return (a.name || "").localeCompare(b.name || "", "he");
  });
}
