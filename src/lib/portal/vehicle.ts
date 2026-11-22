/** מגבלות העמסה לפי תנאי פריקה — מסונכרן עם WEIGHT_LIMITS */
import { WEIGHT_DISPLAY_THRESHOLDS, WEIGHT_LIMITS } from "@/lib/new-order/types";

export type UnloadMode = "manual" | "forklift" | "crane9" | "crane15";

export const UNLOAD_OPTIONS: {
  id: UnloadMode;
  label: string;
  desc: string;
  limitTons: number;
  limitKg: number;
  defaultDriver: "עלי" | "חכמת";
  assigned: "MANUAL" | "ALI_FLATBED" | "HIKMAT_CRANE";
}[] = [
  {
    id: "manual",
    label: "פריקה ידנית / גישה צרה",
    desc: `עד ${WEIGHT_LIMITS.manualTons} ט׳ (${WEIGHT_LIMITS.manualKg} ק״ג) · עד ${WEIGHT_LIMITS.manualMaxBags} שקים`,
    limitTons: WEIGHT_LIMITS.manualTons,
    limitKg: WEIGHT_LIMITS.manualKg,
    defaultDriver: "עלי",
    assigned: "MANUAL",
  },
  {
    id: "forklift",
    label: "מלגזה באתר",
    desc: `עד ${WEIGHT_LIMITS.aliTons} ט׳ (${WEIGHT_LIMITS.aliKg} ק״ג) · פלטה עלי · ללא בלות אגרגטים`,
    limitTons: WEIGHT_LIMITS.aliTons,
    limitKg: WEIGHT_LIMITS.aliKg,
    defaultDriver: "עלי",
    assigned: "ALI_FLATBED",
  },
  {
    id: "crane9",
    label: "מנוף סבן 9 מ׳",
    desc: `עד ${WEIGHT_LIMITS.hakhmatTons} ט׳ (${WEIGHT_LIMITS.hakhmatKg} ק״ג) · חכמת`,
    limitTons: WEIGHT_LIMITS.hakhmatTons,
    limitKg: WEIGHT_LIMITS.hakhmatKg,
    defaultDriver: "חכמת",
    assigned: "HIKMAT_CRANE",
  },
  {
    id: "crane15",
    label: "מנוף סבן 15 מ׳ (גג)",
    desc: `עד ${WEIGHT_LIMITS.hakhmatTons} ט׳ · רישיון עד ${WEIGHT_LIMITS.hakhmatLicenseKg} ק״ג`,
    limitTons: WEIGHT_LIMITS.hakhmatTons,
    limitKg: WEIGHT_LIMITS.hakhmatKg,
    defaultDriver: "חכמת",
    assigned: "HIKMAT_CRANE",
  },
];

export function limitForUnload(mode: UnloadMode): number {
  return UNLOAD_OPTIONS.find((o) => o.id === mode)?.limitTons ?? WEIGHT_LIMITS.aliTons;
}

export function driverForUnload(mode: UnloadMode): "עלי" | "חכמת" {
  return UNLOAD_OPTIONS.find((o) => o.id === mode)?.defaultDriver ?? "עלי";
}

export function vehicleLabel(mode: UnloadMode, tons: number): string {
  if (mode === "manual") return "פריקה ידנית / גישה צרה";
  if (mode === "forklift") {
    return tons > WEIGHT_LIMITS.aliTons
      ? "חריגת פלטה — שדרגו למנוף חכמת"
      : "משאית פלטה עלי (איסוזו)";
  }
  return "משאית מנוף חכמת (מרצדס ACTROS)";
}

export function remainingTons(tons: number, limit: number): number {
  return Math.max(0, Math.round((limit - tons) * 100) / 100);
}

export function utilizationPct(tons: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(999, Math.round((tons / limit) * 1000) / 10);
}

export const VEHICLE_UPSELL_PCT = WEIGHT_DISPLAY_THRESHOLDS.warnPct;
