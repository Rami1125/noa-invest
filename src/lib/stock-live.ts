/**
 * מלאי תפעולי בזמן אמת — אגרגציה ממקורות מחוברים (הזמנות + תעודות + מילון)
 * אין יתרת מחסן פיזית אלא אם קיים טאב מלאי_יתרות בעתיד.
 */

export type StockSkuRow = {
  sku: string;
  name: string;
  unit: string;
  category: string;
  /** כמות בהזמנות פתוחות (ביקוש) */
  openDemandQty: number;
  openOrderCount: number;
  /** כמות שסופקה בתעודות (היסטוריית אספקה) */
  shippedQty: number;
  shippedNoteCount: number;
  shippedCustomerCount: number;
  /** פילוח מחסן מתוך הזמנות פתוחות */
  byYard: Record<string, number>;
  kind: "product" | "deposit" | "delivery" | "unknown";
};

export type StockDepositTotals = {
  balesOpen: number;
  palletsOpen: number;
  customersWithBales: number;
  customersWithPallets: number;
};

export type StockSnapshot = {
  generatedAt: string;
  skus: StockSkuRow[];
  openOrders: number;
  openOrderLines: number;
  shippedLines: number;
  deposits: StockDepositTotals;
  yards: { yard: string; openLines: number; openQty: number }[];
  sourceNote: string;
};

function classifySku(sku: string, name: string): StockSkuRow["kind"] {
  if (sku === "60002" || sku === "60060" || sku.startsWith("60")) return "deposit";
  if (name.startsWith("הובלת") || sku.startsWith("18")) return "delivery";
  if (sku) return "product";
  return "unknown";
}

function normYard(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "ללא מחסן";
  if (s.includes("התלמיד") || s.includes("1")) return "מחסן 1 התלמיד 6";
  if (s.includes("החרש") || s.includes("4")) return "מחסן 4 החרש 10";
  return s;
}

type OrderLike = {
  status?: string;
  yard?: string;
  items?: Array<{ sku?: string; name?: string; catalogName?: string; qty?: number; unit?: string }>;
};

type PurchaseLineLike = {
  sku: string;
  name: string;
  qty: number;
  unit: string;
  customerNo: string;
  noteId: string;
};

type DictLike = { sku: string; name: string; category: string; unit: string };

const OPEN_STATUS_RE = /ממתין|בסידור|פתוח|חדש|לסידור|open|pending/i;
const CLOSED_STATUS_RE = /סופק|בוטל|סגור|closed|delivered|cancelled/i;

export function isOpenOrderStatus(status: string): boolean {
  const s = String(status || "").trim();
  if (!s) return true;
  if (CLOSED_STATUS_RE.test(s)) return false;
  if (OPEN_STATUS_RE.test(s)) return true;
  return true;
}

export function buildStockSnapshot(input: {
  orders: OrderLike[];
  purchaseLines: PurchaseLineLike[];
  dictItems: DictLike[];
}): StockSnapshot {
  const dictBySku = new Map<string, DictLike>();
  for (const d of input.dictItems) {
    if (d.sku) dictBySku.set(d.sku, d);
  }

  const map = new Map<string, StockSkuRow>();
  const ensure = (sku: string, name: string, unit: string): StockSkuRow => {
    const key = sku || name || "—";
    let row = map.get(key);
    if (!row) {
      const d = sku ? dictBySku.get(sku) : undefined;
      row = {
        sku: sku || key,
        name: d?.name || name || sku || "ללא שם",
        unit: unit || d?.unit || "",
        category: d?.category || "",
        openDemandQty: 0,
        openOrderCount: 0,
        shippedQty: 0,
        shippedNoteCount: 0,
        shippedCustomerCount: 0,
        byYard: {},
        kind: classifySku(sku, d?.name || name),
      };
      map.set(key, row);
    }
    return row;
  };

  let openOrders = 0;
  let openOrderLines = 0;
  const yardAgg = new Map<string, { openLines: number; openQty: number }>();

  for (const order of input.orders) {
    if (!isOpenOrderStatus(String(order.status || ""))) continue;
    openOrders += 1;
    const yard = normYard(String(order.yard || ""));
    const items = Array.isArray(order.items) ? order.items : [];
    const seenSku = new Set<string>();
    for (const it of items) {
      const sku = String(it.sku || "").trim();
      const name = String(it.catalogName || it.name || "").trim();
      const qty = Number(it.qty) || 0;
      if (!sku && !name) continue;
      const row = ensure(sku, name, String(it.unit || ""));
      row.openDemandQty += qty;
      openOrderLines += 1;
      const k = sku || name;
      if (!seenSku.has(k)) {
        seenSku.add(k);
        row.openOrderCount += 1;
      }
      row.byYard[yard] = (row.byYard[yard] || 0) + qty;
      const ya = yardAgg.get(yard) || { openLines: 0, openQty: 0 };
      ya.openLines += 1;
      ya.openQty += qty;
      yardAgg.set(yard, ya);
    }
  }

  const noteSets = new Map<string, Set<string>>();
  const custSets = new Map<string, Set<string>>();
  for (const line of input.purchaseLines) {
    const sku = String(line.sku || "").trim();
    const name = String(line.name || "").trim();
    if (!sku && !name) continue;
    const key = sku || name;
    const row = ensure(sku, name, String(line.unit || ""));
    row.shippedQty += Number(line.qty) || 0;
    if (!noteSets.has(key)) noteSets.set(key, new Set());
    if (line.noteId) noteSets.get(key)!.add(line.noteId);
    if (!custSets.has(key)) custSets.set(key, new Set());
    if (line.customerNo) custSets.get(key)!.add(line.customerNo);
  }
  for (const [k, s] of noteSets) {
    const r = map.get(k);
    if (r) r.shippedNoteCount = s.size;
  }
  for (const [k, s] of custSets) {
    const r = map.get(k);
    if (r) r.shippedCustomerCount = s.size;
  }

  const bales = map.get("60002");
  const pallets = map.get("60060");
  const deposits: StockDepositTotals = {
    balesOpen: bales?.openDemandQty || 0,
    palletsOpen: pallets?.openDemandQty || 0,
    customersWithBales: bales?.shippedCustomerCount || 0,
    customersWithPallets: pallets?.shippedCustomerCount || 0,
  };

  const skus = Array.from(map.values()).sort((a, b) => {
    const score = (r: StockSkuRow) => r.openDemandQty * 1000 + r.shippedQty;
    return score(b) - score(a);
  });

  return {
    generatedAt: new Date().toISOString(),
    skus,
    openOrders,
    openOrderLines,
    shippedLines: input.purchaseLines.length,
    deposits,
    yards: Array.from(yardAgg.entries())
      .map(([yard, v]) => ({ yard, ...v }))
      .sort((a, b) => b.openQty - a.openQty),
    sourceNote:
      "מקורות חיים: הזמנות בסידור (ביקוש פתוח) · ארכיון תעודות + מילון_לוגיסט (כמויות שסופקו). אין יתרת מדף מחסן — רק תזרים תפעולי.",
  };
}
