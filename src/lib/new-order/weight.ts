import {
  WEIGHT_LIMITS,
  type CartLine,
  type RecommendedDriver,
  type WeightSafetyLevel,
} from "./types";

export function limitTonsForDriver(driver: RecommendedDriver): number {
  const d = String(driver || "").trim();
  if (/עלי|ali/i.test(d)) return WEIGHT_LIMITS.aliTons;
  if (/חכמת|hakhmat|חכמ/i.test(d)) return WEIGHT_LIMITS.hakhmatTons;
  // ברירת מחדל שמרנית — פלטה
  return WEIGHT_LIMITS.aliTons;
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

export function depositCounts(lines: CartLine[]): { d60002: number; d60060: number } {
  let d60002 = 0;
  let d60060 = 0;
  for (const line of lines) {
    const q = Math.max(0, Math.floor(Number(line.qty) || 0));
    if (line.product.deposit === "60002") d60002 += q;
    if (line.product.deposit === "60060") d60060 += q;
  }
  return { d60002, d60060 };
}

export function weightSafety(
  tons: number,
  limitTons: number,
): { level: WeightSafetyLevel; pct: number; labelHe: string } {
  if (limitTons <= 0) {
    return { level: "ok", pct: 0, labelHe: "אין מגבלה מוגדרת" };
  }
  const pct = Math.round((tons / limitTons) * 1000) / 10;
  if (pct >= 100) {
    return { level: "danger", pct, labelHe: "חריגה" };
  }
  if (pct >= 80) {
    return { level: "warn", pct, labelHe: "קרוב למגבלה" };
  }
  return { level: "ok", pct, labelHe: "בתוך המגבלה" };
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
  if (params.notes) {
    parts.push("", `הערות: ${params.notes}`);
  }
  if (params.wazeUrl) {
    parts.push("", `Waze: ${params.wazeUrl}`);
  }
  return parts.join("\n");
}
