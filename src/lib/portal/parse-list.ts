import type { DictProduct } from "@/lib/new-order/types";
import { hebrewIncludes, normalizeHebrew } from "@/lib/new-order/hebrew-normalize";

export type ParsedLine = { product: DictProduct; qty: number; raw: string };

/**
 * מפרסר טקסט חופשי (וואטסאפ) לשורות מוצר לפי מילון
 * דוגמה: "10 בלות סומסום, 2 משטחי מלט, 5 דבק"
 */
export function parseFreeTextList(text: string, products: DictProduct[]): ParsedLine[] {
  const chunks = String(text || "")
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const out: ParsedLine[] = [];
  for (const raw of chunks) {
    const qtyMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*/);
    const qty = qtyMatch ? Number(String(qtyMatch[1]).replace(",", ".")) : 1;
    const rest = qtyMatch ? raw.slice(qtyMatch.index! + qtyMatch[0].length) : raw;
    const qNorm = normalizeHebrew(rest);

    let best: DictProduct | null = null;
    let bestScore = 0;
    for (const p of products) {
      const blob = normalizeHebrew(
        `${p.sku} ${p.officialName} ${p.slangKeywords.join(" ")}`,
      );
      if (!qNorm) continue;
      if (blob.includes(qNorm) || hebrewIncludes(blob, rest)) {
        const score =
          qNorm.length + (p.slangKeywords.some((k) => hebrewIncludes(k, rest)) ? 5 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      } else {
        for (const k of p.slangKeywords) {
          if (
            k.length >= 2 &&
            (qNorm.includes(normalizeHebrew(k)) || normalizeHebrew(k).includes(qNorm))
          ) {
            const score = normalizeHebrew(k).length;
            if (score > bestScore) {
              bestScore = score;
              best = p;
            }
          }
        }
        if (hebrewIncludes(p.officialName, rest) && 3 > bestScore) {
          bestScore = 3;
          best = p;
        }
      }
    }
    if (best && qty > 0) out.push({ product: best, qty, raw });
  }
  return out;
}
