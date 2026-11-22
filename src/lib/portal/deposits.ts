import type { CartLine, DictProduct } from "@/lib/new-order/types";
import { hebrewIncludes } from "@/lib/new-order/hebrew-normalize";

/** האם המוצר הוא בלת אגרגטים (חול/סומסום וכו׳) */
export function isAggregateBale(p: DictProduct): boolean {
  if (p.deposit === "60002") return true;
  const blob = `${p.officialName} ${p.slangKeywords.join(" ")}`;
  return (
    hebrewIncludes(blob, "בלה") ||
    hebrewIncludes(blob, "סומסום") ||
    hebrewIncludes(blob, "חול") ||
    hebrewIncludes(blob, "חצץ")
  );
}

/** שקים / מליטה — יחס 40 ליח׳ למשטח 60060 */
export function isBagProduct(p: DictProduct): boolean {
  if (p.deposit === "60060") return true;
  const blob = `${p.officialName} ${p.slangKeywords.join(" ")} ${p.unit}`;
  return (
    hebrewIncludes(blob, "שק") ||
    hebrewIncludes(blob, "מלט") ||
    hebrewIncludes(blob, "דבק") ||
    hebrewIncludes(blob, "טיט")
  );
}

export type AutoDepositResult = {
  d60002: number;
  d60060: number;
  notes: string[];
};

/**
 * מנוע פקדונות 1:1 + משטח לכל 40 שקים
 * לא מוסיף שורות לסל — מחשב כמויות פקדון להצגה ולהזרקה
 */
export function computeAutoDeposits(lines: CartLine[]): AutoDepositResult {
  let baleUnits = 0;
  let bagUnits = 0;
  for (const line of lines) {
    const q = Math.max(0, Math.floor(Number(line.qty) || 0));
    if (isAggregateBale(line.product)) baleUnits += q;
    else if (isBagProduct(line.product)) bagUnits += q;
  }
  const d60002 = baleUnits;
  const d60060 = Math.ceil(bagUnits / 40);
  const notes: string[] = [];
  if (d60002 > 0) notes.push(`${d60002}× פקדון שק גדול (60002) · 1:1 לבלות`);
  if (d60060 > 0) notes.push(`${d60060}× משטח סבן (60060) · כל 40 שקים`);
  return { d60002, d60060, notes };
}
