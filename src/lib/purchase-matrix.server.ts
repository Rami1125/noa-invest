/**
 * מטריצת רכישות מארכיון_תעודות_גליה + מילון_לוגיסט במקביל
 */
import { readGoogleSheetBatch, MASTER_SHEET_ID } from "./smart-dispatch/sheets-integration";
import { toIso } from "./he-date";

const TAB = "ארכיון_תעודות_גליה";
const DICT_TAB = "מילון_לוגיסט";

type Row = Record<string, string>;
const normHeader = (h: string) => h.replace(/[׳'’”\"`]/g, "").replace(/\s+/g, " ").trim();
const g = (r: Row, name: string) => r[normHeader(name)] ?? r[name] ?? "";

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

export type DictItem = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  price: string;
  weight: string;
  slang: string;
};

export type PurchaseMatrix = {
  lines: PurchaseLine[];
  noteCount: number;
  notesWithProducts: number;
  generatedAt: string;
  sourceTab: string;
  readVia: string;
  dictRows: number;
  dictItems: DictItem[];
  dictTab: string;
};

type Line = { sku: string; name: string; qty: number; unit: string; kind: "product" | "deposit" | "delivery" };

function parseItems(text: string): Line[] {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const lines = raw
    .replace(/\r/g, "")
    .split(/\n|;/)
    .map((l) => l.trim())
    .filter(Boolean);
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
          kind: sku.startsWith("60") ? "deposit" : name.startsWith("הובלת") ? "delivery" : "product",
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
        kind: sku.startsWith("60") ? "deposit" : name.startsWith("הובלת") ? "delivery" : "product",
      });
    }
  }
  return out;
}

function rowsFromMatrix(raw: unknown[][]): Row[] {
  if (!raw || raw.length < 2) return [];
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

async function readTabPublicCsv(sheetName: string): Promise<Row[]> {
  const url =
    `https://docs.google.com/spreadsheets/d/${MASTER_SHEET_ID}/gviz/tq` +
    `?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`public_csv_http_${res.status}`);
  const text = await res.text();
  if (!text.trim() || text.startsWith("<!")) throw new Error("public_csv_html");
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (ch !== "\r") cur += ch;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rowsFromMatrix(rows as unknown as unknown[][]);
}

async function readNotesTab(): Promise<{ rows: Row[]; via: string }> {
  try {
    const raw = await readGoogleSheetBatch(MASTER_SHEET_ID, `'${TAB}'!A1:AZ3000`);
    if (raw && raw.length >= 2) {
      const rows = rowsFromMatrix(raw as unknown as unknown[][]);
      if (rows.length > 0) return { rows, via: "service_account" };
    }
  } catch (e) {
    console.warn("[purchase-matrix] service_account failed:", e instanceof Error ? e.message : e);
  }
  const rows = await readTabPublicCsv(TAB);
  return { rows, via: "public_csv" };
}

function mapDictItems(dict: Row[]): DictItem[] {
  return dict
    .map((r) => {
      const sku =
        g(r, "מק\"ט ראשי (SKU)") ||
        g(r, "מקט ראשי (SKU)") ||
        g(r, "מק\"ט") ||
        g(r, "מקט") ||
        g(r, "SKU");
      const name =
        g(r, "שם מוצר רשמי (קומקס)") ||
        g(r, "שם מוצר") ||
        g(r, "שם");
      if (!sku && !name) return null;
      return {
        sku: sku || "",
        name: name || sku,
        category: g(r, "קטגוריה לוגיסטית") || g(r, "קטגוריה") || "",
        unit: g(r, "יחידת מידה") || "",
        price: g(r, "מחיר נטו לפני מע\"מ (₪)") || g(r, "מחיר מחירון (₪)") || "",
        weight: g(r, "משקל יח' (ק\"ג)") || g(r, "משקל יח (קג)") || "",
        slang: (g(r, "סלנג ומילות מפתח לנרמול AI") || "").slice(0, 120),
      } satisfies DictItem;
    })
    .filter((x): x is DictItem => Boolean(x));
}

export async function loadPurchaseMatrixFromArchive(): Promise<PurchaseMatrix> {
  const notesP = readNotesTab();
  const dictP = readTabPublicCsv(DICT_TAB).catch(() => [] as Row[]);
  const [{ rows, via }, dictRowsRaw] = await Promise.all([notesP, dictP]);

  const lines: PurchaseLine[] = [];
  const seenNotes = new Set<string>();
  let notesWithProducts = 0;

  for (const r of rows) {
    const id =
      g(r, "מס' תעודת משלוח") ||
      g(r, "מס תעודת משלוח") ||
      g(r, "מספר תעודה") ||
      g(r, "מספר ת.מ");
    if (!id || seenNotes.has(id)) continue;
    seenNotes.add(id);

    const customerNo = g(r, "מס' לקוח") || g(r, "מס לקוח") || g(r, "מספר לקוח");
    const customerName = g(r, "שם לקוח");
    const dateIso = toIso(g(r, "תאריך תעודה") || g(r, "תאריך אספקה") || g(r, "תאריך"));

    const itemsText =
      g(r, "פריטים") ||
      g(r, "פירוט מוצרים ומק\"טים") ||
      g(r, "פירוט מוצרים ומקטים") ||
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

  const dictItems = mapDictItems(dictRowsRaw);

  return {
    lines,
    noteCount: seenNotes.size,
    notesWithProducts,
    generatedAt: new Date().toISOString(),
    sourceTab: TAB,
    readVia: via,
    dictRows: dictItems.length,
    dictItems,
    dictTab: DICT_TAB,
  };
}
