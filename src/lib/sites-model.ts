export type Filter = "all" | "critical" | "delayed" | "normal" | "missing_gps";
export type Sort = "severity" | "p80" | "visits" | "distance";
export type SeverityLevel = "normal" | "delayed" | "critical" | "unknown";

export interface SiteRecord {
  id: string;
  customer: string;
  customerCode: string;
  address: string;
  city: string;
  visits: number | null;
  avgStopMin: number | null;
  maxStopMin: number | null;
  p80Min: number | null;
  lat: number | null;
  lng: number | null;
  distHarashKm: number | null;
  driveHarashMin: number | null;
  distTalmidKm: number | null;
  driveTalmidMin: number | null;
}

export const warehouses = [
  {
    id: "harash_10",
    name: "מחסן החרש 10",
    address: "החרש 10, הוד השרון",
    lat: 32.1508,
    lng: 34.8926,
  },
  {
    id: "hatalmid_6",
    name: "מחסן התלמיד 6",
    address: "התלמיד 6, הוד השרון",
    lat: 32.1544,
    lng: 34.8886,
  },
];

export function validCoordinates(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 29 &&
    lat <= 34 &&
    lng >= 33 &&
    lng <= 37
  );
}

export function validThresholds(delayed: number, critical: number): boolean {
  return (
    Number.isFinite(delayed) &&
    Number.isFinite(critical) &&
    delayed >= 1 &&
    critical > delayed &&
    critical <= 120
  );
}

export function severity(
  p80Min: number | null,
  delayed: number,
  critical: number,
): SeverityLevel {
  if (p80Min === null || !Number.isFinite(p80Min)) return "unknown";
  if (p80Min >= critical) return "critical";
  if (p80Min >= delayed) return "delayed";
  return "normal";
}

const SEVERITY_RANK: Record<SeverityLevel, number> = {
  critical: 3,
  delayed: 2,
  normal: 1,
  unknown: 0,
};

export function filterSites(
  sites: SiteRecord[],
  query: string,
  filter: Filter,
  sort: Sort,
  delayed: number,
  critical: number,
  origin: string,
): SiteRecord[] {
  const q = query.trim().toLowerCase();

  const filtered = sites.filter((s) => {
    const sev = severity(s.p80Min, delayed, critical);
    if (filter === "missing_gps" && validCoordinates(s.lat, s.lng)) return false;
    if (
      (filter === "critical" || filter === "delayed" || filter === "normal") &&
      sev !== filter
    ) {
      return false;
    }

    if (!q) return true;
    return (
      s.customer.toLowerCase().includes(q) ||
      s.customerCode.toLowerCase().includes(q) ||
      s.address.toLowerCase().includes(q) ||
      s.city.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
  });

  return [...filtered].sort((a, b) => {
    if (sort === "p80") return (b.p80Min ?? -1) - (a.p80Min ?? -1);
    if (sort === "visits") return (b.visits ?? 0) - (a.visits ?? 0);
    if (sort === "distance") {
      const distA = origin === "hatalmid_6" ? a.distTalmidKm : a.distHarashKm;
      const distB = origin === "hatalmid_6" ? b.distTalmidKm : b.distHarashKm;
      return (distA ?? 9999) - (distB ?? 9999);
    }

    const rankDiff =
      SEVERITY_RANK[severity(b.p80Min, delayed, critical)] -
      SEVERITY_RANK[severity(a.p80Min, delayed, critical)];
    if (rankDiff !== 0) return rankDiff;
    return (b.p80Min ?? -1) - (a.p80Min ?? -1);
  });
}
