/** מגבלות העמסה לפי תנאי פריקה — פורטל לקוח (מסונכרן עם WEIGHT_LIMITS) */
import { WEIGHT_DISPLAY_THRESHOLDS, WEIGHT_LIMITS } from "@/lib/new-order/types";

export type UnloadMode = "manual" | "forklift" | "crane9" | "crane15";

export const UNLOAD_OPTIONS: {
  id: UnloadMode;
  label: string;
  desc: string;
  limitTons: number;
  defaultDriver: "עלי" | "חכמת";
}[] = [
  {
    id: "manual",
    label: "פריקה ידנית / גישה צרה",
    desc: `עד ${WEIGHT_LIMITS.manualTons} טון · ללא בלות כבדות`,
    limitTons: WEIGHT_LIMITS.manualTons,
    defaultDriver: "עלי",
  },
  {
    id: "forklift",
    label: "מלגזה באתר",
    desc: `עד ${WEIGHT_LIMITS.aliTons} טון · פלטה`,
    limitTons: WEIGHT_LIMITS.aliTons,
    defaultDriver: "עלי",
  },
  {
    id: "crane9",
    label: "מנוף סבן 9 מ׳",
    desc: `עד ${WEIGHT_LIMITS.hakhmatTons} טון · בלות אגרגטים`,
    limitTons: WEIGHT_LIMITS.hakhmatTons,
    defaultDriver: "חכמת",
  },
  {
    id: "crane15",
    label: "מנוף סבן 15 מ׳ (גג)",
    desc: `עד ${WEIGHT_LIMITS.hakhmatTons} טון · הנפה לגג`,
    limitTons: WEIGHT_LIMITS.hakhmatTons,
    defaultDriver: "חכמת",
  },
];

export function limitForUnload(mode: UnloadMode): number {
  return UNLOAD_OPTIONS.find((o) => o.id === mode)?.limitTons ?? WEIGHT_LIMITS.aliTons;
}

export function driverForUnload(mode: UnloadMode): "עלי" | "חכמת" {
  return UNLOAD_OPTIONS.find((o) => o.id === mode)?.defaultDriver ?? "עלי";
}

export function vehicleLabel(mode: UnloadMode, tons: number): string {
  if (mode === "manual" || mode === "forklift") {
    return tons > WEIGHT_LIMITS.aliTons
      ? "משאית מנוף (חריגת פלטה)"
      : "משאית חלוקה / פלטה (עלי)";
  }
  return "משאית מנוף כבדה (חכמת)";
}

export function remainingTons(tons: number, limit: number): number {
  return Math.max(0, Math.round((limit - tons) * 100) / 100);
}

export function utilizationPct(tons: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((tons / limit) * 1000) / 10);
}

/** סף להצעת upsell / אזהרת ניצולת */
export const VEHICLE_UPSELL_PCT = WEIGHT_DISPLAY_THRESHOLDS.warnPct;
