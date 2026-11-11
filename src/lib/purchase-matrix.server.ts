/**
 * מטריצת רכישות מארכיון_תעודות_גליה — מוצרים שלקוחות רכשו
 */
import { readGoogleSheetBatch, MASTER_SHEET_ID } from "./smart-dispatch/sheets-integration";
import { toIso } from "./he-date";

const TAB = "ארכיון_תעודות_גליה";

type Row = Record<string, string>;
const normHeader = (h: string) => h.replace(/[׳'’”\"`]/g, "").replace(/\s+/g, " ").trim();
const g = (r: Row, name: string) => r[normHeader(name)] ?? "";

export type PurchaseLine = {
  sku: string;
  name: string;
  qty: number;
  unit: string;
  customerNo: string;
  customerName: string;
  noteId: string;
  dateIso: string;
};

export type PurchaseMatrix = {
  lines: PurchaseLine[];
  noteCount: number;
  notesWithProducts: number;
  generatedAt: string;
  sourceTab: string;
};

type Line = { sku: string; name: string; qty: number; unit: string; kind: "product" | "deposit" | "delivery" };

function parseItems(text: string): Line[] {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const lines = raw.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
  const out: Line[] = [];
  for (const line of lines) {
    if (line.includes("|")) {
      const parts = line.split("|").map((x) => x.trim());
      if (parts.length >= 3 && parts[1]) {
        const sku = parts[0];
        const name = parts[1];
        out.push({
          sku,
          name,
          qty: Number(String(parts[2]).replace(",", ".")) || 0,
          unit: parts[3] || "",
          kind: sku.startsWith("60")
            ? "deposit"
            : name.startsWith("הובלת")
              ? "delivery"
              : "product",
        });
        continue;
      }
    }
    const m = line.match(/^(\d{4,})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*(\S+)?$/);
    if (m) {
      const sku = m[1];
      const name = m[2].trim();
      out.push({
        sku,
        name,
        qty: Number(m[3].replace(",", ".")) || 0,
        unit: m[4] || "",
        kind: sku.startsWith("60")
          ? "deposit"
          : name.startsWith("הובלת")
            ? "delivery"
            : "product",
      });
    }
  }
  return out;
}

async function readNotesTab(): Promise<Row[]> {
  const raw = await readGoogleSheetBatch(MASTER_SHEET_ID, `'${TAB}'!A1:AZ3000`);
  if (raw === null) {
    throw new Error(
      "חשבון שירות Google לא מוגדר בשרת (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY)",
    );
  }
  if (raw.length < 2) return [];
  const headers = (raw[0] as unknown[]).map((h) => normHeader(String(h ?? "")));
  return raw
    .slice(1)
    .map((cells) => {
      const o: Row = {};
      headers.forEach((h, i) => {
        if (h && !(h in o)) o[h] = String((cells as unknown[])[i] ?? "").trim();
      });
      return o;
    })
    .filter((o) => Object.values(o).some(Boolean));
}

/** שולף מוצרים שלקוחות רכשו מתוך ארכיון_תעודות_גליה */
export async function loadPurchaseMatrixFromArchive(): Promise<PurchaseMatrix> {
  const rows = await readNotesTab();
  const lines: PurchaseLine[] = [];
  const seenNotes = new Set<string>();
  let notesWithProducts = 0;

  for (const r of rows) {
    const id =
      g(r, "מס' תעודת משלוח") ||
      g(r, "מספר תעודה") ||
      g(r, "מספר ת.מ");
    if (!id || seenNotes.has(id)) continue;
    seenNotes.add(id);

    const customerNo = g(r, "מס' לקוח") || g(r, "מספר לקוח");
    const customerName = g(r, "שם לקוח");
    const dateIso = toIso(
      g(r, "תאריך תעודה") || g(r, "תאריך אספקה") || g(r, "תאריך"),
    );

    const itemsText =
      g(r, "פריטים") ||
      g(r, "פירוט מוצרים ומק\"טים") ||
      g(r, "סחורה מפורטת") ||
      g(r, "פירוט מוצרים") ||
      g(r, "items");

    const products = parseItems(itemsText).filter((i) => i.kind === "product");
    if (products.length) notesWithProducts++;

    for (const it of products) {
      lines.push({
        sku: it.sku,
        name: it.name,
        qty: it.qty,
        unit: it.unit,
        customerNo,
        customerName,
        noteId: id,
        dateIso,
      });
    }
  }

  return {
    lines,
    noteCount: seenNotes.size,
    notesWithProducts,
    generatedAt: new Date().toISOString(),
    sourceTab: TAB,
  };
}
