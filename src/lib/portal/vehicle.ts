/** מגבלות העמסה לפי תנאי פריקה — פורטל לקוח */

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
    desc: "עד 2.0 טון · ללא בלות כבדות",
    limitTons: 2.0,
    defaultDriver: "עלי",
  },
  {
    id: "forklift",
    label: "מלגזה באתר",
    desc: "עד 4.46 טון · פלטה",
    limitTons: 4.46,
    defaultDriver: "עלי",
  },
  {
    id: "crane9",
    label: "מנוף סבן 9 מ׳",
    desc: "עד 10.2 טון · בלות אגרגטים",
    limitTons: 10.2,
    defaultDriver: "חכמת",
  },
  {
    id: "crane15",
    label: "מנוף סבן 15 מ׳ (גג)",
    desc: "עד 10.2 טון · הנפה לגג",
    limitTons: 10.2,
    defaultDriver: "חכמת",
  },
];

export function limitForUnload(mode: UnloadMode): number {
  return UNLOAD_OPTIONS.find((o) => o.id === mode)?.limitTons ?? 4.46;
}

export function driverForUnload(mode: UnloadMode): "עלי" | "חכמת" {
  return UNLOAD_OPTIONS.find((o) => o.id === mode)?.defaultDriver ?? "עלי";
}

export function vehicleLabel(mode: UnloadMode, tons: number): string {
  if (mode === "manual" || mode === "forklift") {
    return tons > 4.46 ? "משאית מנוף (חריגת פלטה)" : "משאית חלוקה / פלטה (עלי)";
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
