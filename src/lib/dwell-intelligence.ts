/**
 * שלב ד׳ — מודיעין שהייה: השוואה לטווח צי (מנוף/פלטה) ול־P80 של האתר
 * צבעים = סף התראה תפעולי, לא האשמת נהג.
 */
import { DWELL_RULES, kindOfPlate } from "@/lib/ituran";

export type VehicleKind = "crane" | "flatbed";

export type DwellBenchmark = {
  kind: VehicleKind;
  kindLabelHe: string;
  fleetMin: number;
  fleetMax: number;
  siteP50: number | null;
  siteP80: number | null;
  siteMax: number | null;
  siteKey?: string;
  siteAddress?: string;
};

export type DwellVerdict =
  | "ok"
  | "watch"
  | "above_fleet"
  | "above_site_p80"
  | "severe"
  | "unknown";

export type DwellComparison = {
  dwell: number | null;
  benchmark: DwellBenchmark;
  verdict: DwellVerdict;
  /** דקות מעל סף הצי (fleetMax) — 0 אם מתחת */
  overFleetMin: number;
  /** דקות מעל P80 אתר — 0 אם אין P80 או מתחת */
  overSiteP80Min: number;
  summaryHe: string;
};

export const KIND_LABEL_HE: Record<VehicleKind, string> = {
  crane: "מנוף",
  flatbed: "פלטה",
};

export function resolveKind(plate?: string, explicit?: VehicleKind | string): VehicleKind {
  if (explicit === "crane" || explicit === "flatbed") return explicit;
  return kindOfPlate(String(plate || ""));
}

export function fleetRange(kind: VehicleKind): [number, number] {
  const r = DWELL_RULES[kind] || DWELL_RULES.crane;
  return [r[0], r[1]];
}

type SiteLike = {
  siteKey?: string;
  address?: string;
  city?: string;
  medianMin?: number | null;
  p80Min?: number | null;
  maxMin?: number | null;
};

/** התאמת אתר לפי כתובת / מפתח — התאמה רכה */
export function findSiteForAddress(
  sites: SiteLike[],
  address?: string,
  siteKey?: string,
): SiteLike | undefined {
  if (siteKey) {
    const byKey = sites.find((s) => s.siteKey && s.siteKey === siteKey);
    if (byKey) return byKey;
  }
  const addr = String(address || "").trim().toLowerCase();
  if (!addr) return undefined;
  const exact = sites.find((s) => String(s.address || "").trim().toLowerCase() === addr);
  if (exact) return exact;
  return sites.find((s) => {
    const a = String(s.address || "").trim().toLowerCase();
    if (!a) return false;
    return a.includes(addr) || addr.includes(a);
  });
}

export function buildBenchmark(opts: {
  plate?: string;
  kind?: VehicleKind | string;
  address?: string;
  siteKey?: string;
  sites?: SiteLike[];
}): DwellBenchmark {
  const kind = resolveKind(opts.plate, opts.kind);
  const [fleetMin, fleetMax] = fleetRange(kind);
  const site = findSiteForAddress(opts.sites || [], opts.address, opts.siteKey);
  return {
    kind,
    kindLabelHe: KIND_LABEL_HE[kind],
    fleetMin,
    fleetMax,
    siteP50: site?.medianMin ?? null,
    siteP80: site?.p80Min ?? null,
    siteMax: site?.maxMin ?? null,
    siteKey: site?.siteKey,
    siteAddress: site?.address,
  };
}

export function compareDwell(
  dwell: number | null | undefined,
  benchmark: DwellBenchmark,
): DwellComparison {
  if (dwell == null || !Number.isFinite(dwell) || dwell < 0) {
    return {
      dwell: null,
      benchmark,
      verdict: "unknown",
      overFleetMin: 0,
      overSiteP80Min: 0,
      summaryHe: "אין נתון שהייה",
    };
  }

  const d = Math.round(dwell);
  const overFleet = Math.max(0, d - benchmark.fleetMax);
  const overP80 =
    benchmark.siteP80 != null && Number.isFinite(benchmark.siteP80)
      ? Math.max(0, d - benchmark.siteP80)
      : 0;

  let verdict: DwellVerdict = "ok";
  if (d > 90 || overFleet >= 40 || overP80 >= 40) {
    verdict = "severe";
  } else if (overP80 > 0 && benchmark.siteP80 != null) {
    verdict = "above_site_p80";
  } else if (overFleet > 0) {
    verdict = "above_fleet";
  } else if (d > benchmark.fleetMin + (benchmark.fleetMax - benchmark.fleetMin) * 0.7) {
    verdict = "watch";
  }

  const parts: string[] = [];
  parts.push(`${benchmark.kindLabelHe} ${benchmark.fleetMin}–${benchmark.fleetMax} דק׳`);
  if (benchmark.siteP80 != null) {
    parts.push(`P80 אתר ${benchmark.siteP80} דק׳`);
  }
  if (verdict === "ok") {
    parts.unshift("בטווח");
  } else if (verdict === "watch") {
    parts.unshift("בקצה העליון של טווח הצי");
  } else if (verdict === "above_fleet") {
    parts.unshift(`+${overFleet} מעל טווח צי`);
  } else if (verdict === "above_site_p80") {
    parts.unshift(`+${overP80} מעל P80 אתר`);
  } else if (verdict === "severe") {
    parts.unshift("חריגה חמורה");
  }

  return {
    dwell: d,
    benchmark,
    verdict,
    overFleetMin: overFleet,
    overSiteP80Min: overP80,
    summaryHe: parts.join(" · "),
  };
}

export function verdictClass(v: DwellVerdict): string {
  switch (v) {
    case "ok":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "watch":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "above_fleet":
      return "border-orange-300 bg-orange-50 text-orange-950";
    case "above_site_p80":
      return "border-violet-300 bg-violet-50 text-violet-950";
    case "severe":
      return "border-red-300 bg-red-50 text-red-950";
    default:
      return "border-border/50 bg-muted/20 text-muted-foreground";
  }
}

export function verdictLabelHe(v: DwellVerdict): string {
  switch (v) {
    case "ok":
      return "בטווח";
    case "watch":
      return "בקצה טווח";
    case "above_fleet":
      return "מעל טווח צי";
    case "above_site_p80":
      return "מעל P80 אתר";
    case "severe":
      return "חריג חמור";
    default:
      return "אין נתון";
  }
}

/** סף ישן (שלב ב׳) — נשמר לתאימות; ההשוואה החכמה עדיפה */
export const STAY_ALERT_MIN = 20;
