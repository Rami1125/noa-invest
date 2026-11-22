/**
 * מנוע בקרת העמסה דטרמיניסטי — ח. סבן
 * מקור אמת יחיד: WEIGHT_LIMITS + WEIGHT_DISPLAY_THRESHOLDS
 */
import {
  AGGREGATE_BALE_SKUS,
  WEIGHT_DISPLAY_THRESHOLDS,
  WEIGHT_LIMITS,
  type AssignedVehicle,
  type CartLine,
  type RecommendedDriver,
  type ThresholdStatus,
  type WeightSafetyLevel,
} from "./types";

const AGG_SET = new Set<string>(AGGREGATE_BALE_SKUS.map(String));

export function isAggregateBaleSku(sku: string): boolean {
  const s = String(sku || "").trim();
  if (AGG_SET.has(s)) return true;
  const n = s.replace(/^0+/, "");
  return AGG_SET.has(n);
}

export function cartHasAggregateBales(lines: CartLine[]): boolean {
  return lines.some((l) => isAggregateBaleSku(l.product.sku));
}

export function cartHasCraneHint(lines: CartLine[]): boolean {
  return lines.some((l) => {
    const d = String(l.product.recommendedDriver || "");
    const name = String(l.product.officialName || "");
    return /מנוף|crane|הנפה/i.test(name) || /חכמת|hakhmat/i.test(d);
  });
}

export function limitKgForDriver(driver: RecommendedDriver): number {
  const d = String(driver || "").trim();
  if (/עלי|ali/i.test(d)) return WEIGHT_LIMITS.aliKg;
  if (/חכמת|hakhmat|חכמ|hikmat/i.test(d)) return WEIGHT_LIMITS.hakhmatKg;
  return WEIGHT_LIMITS.aliKg;
}

export function limitTonsForDriver(driver: RecommendedDriver): number {
  return limitKgForDriver(driver) / 1000;
}

export function assignVehicle(params: {
  lines: CartLine[];
  preferredDriver?: RecommendedDriver;
  unloadMode?: string;
}): {
  assigned_vehicle: AssignedVehicle;
  limit_kg: number;
  limit_tons: number;
  driver: RecommendedDriver;
  forceCrane: boolean;
  reasonHe: string;
} {
  const forceCrane =
    cartHasAggregateBales(params.lines) ||
    cartHasCraneHint(params.lines) ||
    params.unloadMode === "crane9" ||
    params.unloadMode === "crane15";

  if (forceCrane) {
    return {
      assigned_vehicle: "HIKMAT_CRANE",
      limit_kg: WEIGHT_LIMITS.hakhmatKg,
      limit_tons: WEIGHT_LIMITS.hakhmatTons,
      driver: "חכמת",
      forceCrane: true,
      reasonHe: cartHasAggregateBales(params.lines)
        ? "בלת אגרגטים — חובה מנוף חכמת (אסור פלטה)"
        : "הנפת מנוף / ניתוב לחכמת",
    };
  }

  if (params.unloadMode === "manual") {
    return {
      assigned_vehicle: "MANUAL",
      limit_kg: WEIGHT_LIMITS.manualKg,
      limit_tons: WEIGHT_LIMITS.manualTons,
      driver: "עלי",
      forceCrane: false,
      reasonHe: `פריקה ידנית — עד ${WEIGHT_LIMITS.manualTons} ט׳ / ${WEIGHT_LIMITS.manualMaxBags} שקים`,
    };
  }

  const driver = (params.preferredDriver || recommendDriver(params.lines) || "עלי") as RecommendedDriver;
  if (/חכמת|hakhmat|חכמ|hikmat/i.test(String(driver))) {
    return {
      assigned_vehicle: "HIKMAT_CRANE",
      limit_kg: WEIGHT_LIMITS.hakhmatKg,
      limit_tons: WEIGHT_LIMITS.hakhmatTons,
      driver: "חכמת",
      forceCrane: false,
      reasonHe: "נהג מומלץ: חכמת",
    };
  }

  return {
    assigned_vehicle: "ALI_FLATBED",
    limit_kg: WEIGHT_LIMITS.aliKg,
    limit_tons: WEIGHT_LIMITS.aliTons,
    driver: "עלי",
    forceCrane: false,
    reasonHe: "משאית פלטה עלי",
  };
}

export function cartWeightKg(lines: CartLine[]): number {
  return lines.reduce((sum, line) => {
    const w = Number(line.product.weightKgPerUnit) || 0;
    const q = Number(line.qty) || 0;
    return sum + w * q;
  }, 0);
}

export function cartWeightTons(lines: CartLine[]): number {
  return Math.round((cartWeightKg(lines) / 1000) * 1000) / 1000;
}

export function depositCounts(lines: CartLine[]): {
  d60002: number;
  d60060: number;
  d60006: number;
} {
  let d60002 = 0;
  let d60060 = 0;
  let d60006 = 0;
  for (const line of lines) {
    const q = Math.max(0, Math.floor(Number(line.qty) || 0));
    const dep = String(line.product.deposit || "").trim();
    if (dep === "60002") d60002 += q;
    else if (dep === "60060") d60060 += q;
    else if (dep === "60006") d60006 += q;
  }
  return { d60002, d60060, d60006 };
}

export function utilizationPct(totalWeightKg: number, limitKg: number): number {
  if (limitKg <= 0) return 0;
  return Math.round((totalWeightKg / limitKg) * 1000) / 10;
}

export function thresholdStatus(utilPct: number): ThresholdStatus {
  if (utilPct > WEIGHT_DISPLAY_THRESHOLDS.dangerPct) return "OVERLOAD";
  if (utilPct >= WEIGHT_DISPLAY_THRESHOLDS.warnPct) return "WARNING_UPSELL";
  return "OK";
}

export function thresholdToUiLevel(status: ThresholdStatus): WeightSafetyLevel {
  if (status === "OVERLOAD") return "danger";
  if (status === "WARNING_UPSELL") return "warn";
  return "ok";
}

export function weightSafety(
  tons: number,
  limitTons: number,
): { level: WeightSafetyLevel; pct: number; labelHe: string; status: ThresholdStatus } {
  if (limitTons <= 0) {
    return { level: "ok", pct: 0, labelHe: "אין מגבלה מוגדרת", status: "OK" };
  }
  const pct = utilizationPct(tons * 1000, limitTons * 1000);
  const status = thresholdStatus(pct);
  if (status === "OVERLOAD") {
    return {
      level: "danger",
      pct,
      labelHe: "חריגה — מעל תקרת ההעמסה · פצלו או שדרגו למנוף",
      status,
    };
  }
  if (status === "WARNING_UPSELL") {
    const remain = Math.max(0, limitTons - tons);
    return {
      level: "warn",
      pct,
      labelHe: `קרוב למגבלה — יתרה ~${remain.toFixed(2)} ט׳ למילוי ללא הובלה נוספת`,
      status,
    };
  }
  return { level: "ok", pct, labelHe: "בתוך המגבלה", status };
}

export type LoadControlReport = {
  total_weight_kg: number;
  total_weight_tons: number;
  assigned_vehicle: AssignedVehicle;
  limit_kg: number;
  limit_tons: number;
  license_limit_kg: number | null;
  utilization_pct: number;
  threshold_status: ThresholdStatus;
  ui_level: WeightSafetyLevel;
  label_he: string;
  driver: RecommendedDriver;
  force_crane: boolean;
  reason_he: string;
  remaining_kg: number;
  block_submit: boolean;
  deposits: {
    bales_60002: number;
    saban_pallets_60060: number;
    block_pallets_60006: number;
  };
  aggregate_bale_skus: string[];
};

export function computeLoadControl(params: {
  lines: CartLine[];
  preferredDriver?: RecommendedDriver;
  unloadMode?: string;
}): LoadControlReport {
  const total_weight_kg = Math.round(cartWeightKg(params.lines) * 100) / 100;
  const total_weight_tons = Math.round((total_weight_kg / 1000) * 1000) / 1000;
  const assigned = assignVehicle({
    lines: params.lines,
    preferredDriver: params.preferredDriver,
    unloadMode: params.unloadMode,
  });
  const utilization_pct = utilizationPct(total_weight_kg, assigned.limit_kg);
  const threshold_status = thresholdStatus(utilization_pct);
  const safety = weightSafety(total_weight_tons, assigned.limit_tons);
  const deps = depositCounts(params.lines);
  const aggSkus = params.lines
    .filter((l) => isAggregateBaleSku(l.product.sku))
    .map((l) => String(l.product.sku));

  return {
    total_weight_kg,
    total_weight_tons,
    assigned_vehicle: assigned.assigned_vehicle,
    limit_kg: assigned.limit_kg,
    limit_tons: assigned.limit_tons,
    license_limit_kg:
      assigned.assigned_vehicle === "HIKMAT_CRANE" ? WEIGHT_LIMITS.hakhmatLicenseKg : null,
    utilization_pct,
    threshold_status,
    ui_level: safety.level,
    label_he: safety.labelHe,
    driver: assigned.driver,
    force_crane: assigned.forceCrane,
    reason_he: assigned.reasonHe,
    remaining_kg: Math.max(0, Math.round((assigned.limit_kg - total_weight_kg) * 100) / 100),
    block_submit: threshold_status === "OVERLOAD",
    deposits: {
      bales_60002: deps.d60002,
      saban_pallets_60060: deps.d60060,
      block_pallets_60006: deps.d60006,
    },
    aggregate_bale_skus: [...new Set(aggSkus)],
  };
}

export function recommendWarehouse(lines: CartLine[]): string {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const w = String(line.product.defaultWarehouse || "").trim();
    if (!w) continue;
    counts.set(w, (counts.get(w) || 0) + (line.qty || 1));
  }
  let best = "";
  let bestN = 0;
  for (const [w, n] of counts) {
    if (n > bestN) {
      best = w;
      bestN = n;
    }
  }
  return best || "החרש 10";
}

export function recommendDriver(lines: CartLine[]): RecommendedDriver {
  if (cartHasAggregateBales(lines) || cartHasCraneHint(lines)) return "חכמת";
  const counts = new Map<string, number>();
  for (const line of lines) {
    const d = String(line.product.recommendedDriver || "").trim();
    if (!d) continue;
    counts.set(d, (counts.get(d) || 0) + (line.qty || 1));
  }
  let best = "חכמת";
  let bestN = 0;
  for (const [d, n] of counts) {
    if (n > bestN) {
      best = d;
      bestN = n;
    }
  }
  return best;
}

export function buildWazeUrl(address: string): string {
  const a = String(address || "").trim();
  if (!a) return "";
  return `https://waze.com/ul?q=${encodeURIComponent(a)}&navigate=yes`;
}

export function buildWhatsappDispatchMessage(params: {
  orderId: string;
  customerName: string;
  customerNo: string;
  address: string;
  driver: string;
  warehouse: string;
  tons: number;
  lines: { name: string; qty: number; unit: string }[];
  notes: string;
  wazeUrl: string;
}): string {
  const items = params.lines
    .map((l) => `• ${l.name} × ${l.qty} ${l.unit}`)
    .join("\n");
  const parts = [
    `הזמנה חדשה #${params.orderId}`,
    `לקוח: ${params.customerName} (${params.customerNo})`,
    `כתובת: ${params.address}`,
    `מחסן: ${params.warehouse} · נהג: ${params.driver}`,
    `משקל: ${params.tons.toFixed(2)} טון`,
    "",
    "פריטים:",
    items || "—",
  ];
  if (params.notes) parts.push("", `הערות: ${params.notes}`);
  if (params.wazeUrl) parts.push("", `Waze: ${params.wazeUrl}`);
  return parts.join("\n");
}
