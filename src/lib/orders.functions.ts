import { createServerFn } from "@tanstack/react-start";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbzGOG7GxiXkT-OtUw4obBvGkyw_wKRhv2Jjf4I8qbLATIIMKAN099UHJqqYjdfKV-WwWw/exec";

export type SheetOrderItem = {
  sku: string;
  name: string;
  catalogName: string;
  qty: number;
  unit: string;
  weightKg: number;
  matched: boolean;
};

/** הזמנה מהגיליון — גל 1: שדות ממופים לכותרות האמיתיות */
export type SheetOrder = {
  id: string;
  receivedDate?: string;
  customerNo: string;
  customer: string;
  phone: string;
  address: string;
  date: string;
  window: string;
  yard: string;
  driver: string;
  status: string;
  itemsText: string;
  items: SheetOrderItem[];
  noteId?: string;
  weightTons?: string;
  notes?: string;
  waze?: string;
};

function firstValue(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function normalizeItem(value: unknown, index: number): SheetOrderItem {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const sku = String(firstValue(row, "sku", "מק\"ט", "מקט") || "");
  const name = String(firstValue(row, "name", "שם", "productName") || "");
  const catalogName = String(firstValue(row, "catalogName", "שם קטלוג") || name);
  const qty = Number(firstValue(row, "qty", "quantity", "כמות") || 0) || 0;
  const unit = String(firstValue(row, "unit", "יחידה") || "");
  const weightKg = Number(firstValue(row, "weightKg", "משקל") || 0) || 0;
  return {
    sku: sku || `item-${index + 1}`,
    name: name || catalogName || `פריט ${index + 1}`,
    catalogName: catalogName || name,
    qty,
    unit,
    weightKg,
    matched: Boolean(firstValue(row, "matched") ?? true),
  };
}

function normalizeOrder(row: Record<string, unknown>): SheetOrder {
  const itemsRaw = row.items ?? row["פריטים"] ?? [];
  const items = Array.isArray(itemsRaw)
    ? itemsRaw.map((item, index) => normalizeItem(item, index))
    : [];
  const itemsText = String(
    firstValue(row, "itemsText", "פריטים טקסט", "items") ||
      items.map((i) => `${i.qty} × ${i.name}`).join(", "),
  );
  const id = String(
    firstValue(row, "id", "orderId", "מס׳ הזמנה", "מס' הזמנה", "מספר הזמנה"),
  );

  return {
    id: id.trim(),
    receivedDate: String(firstValue(row, "receivedDate", "תאריך קליטה")),
    customerNo: String(
      firstValue(row, "customerNo", "customerId", "מס' לקוח", "מס׳ לקוח", "מספר לקוח"),
    ).trim(),
    customer: String(firstValue(row, "customer", "customerName", "שם לקוח", "לקוח") || "לקוח ללא שם"),
    phone: String(firstValue(row, "phone", "customerPhone", "איש קשר וטלפון", "טלפון")),
    address: String(firstValue(row, "address", "deliveryAddress", "כתובת אספקה", "כתובת")),
    date: String(firstValue(row, "date", "deliveryDate", "תאריך אספקה")),
    window: String(firstValue(row, "window", "time", "שעה", "סבב ושעה")),
    yard: String(firstValue(row, "yard", "warehouse", "מחסן מוצא", "מחסן")),
    driver: String(firstValue(row, "driver", "driverName", "נהג / משאית", "נהג")),
    status: String(firstValue(row, "status", "orderStatus", "סטטוס סידור", "סטטוס") || "פתוחה"),
    itemsText,
    items,
    noteId: String(firstValue(row, "noteId", "מס' תעודת משלוח", "מס׳ תעודת משלוח") || "") || undefined,
    weightTons: String(firstValue(row, "weightTons", "משקל (טון)", "משקל") || "") || undefined,
    notes: String(firstValue(row, "notes", "הערות") || "") || undefined,
    waze: String(firstValue(row, "waze", "קישור Waze", "Waze") || "") || undefined,
  };
}

function assertWritableOrderId(id: string) {
  const trimmed = String(id || "").trim();
  if (!trimmed) throw new Error("חסר מספר הזמנה");
  if (/^row-/i.test(trimmed)) {
    throw new Error("מזהה row- אינו מפתח עסקי — כתיבה לגיליון נחסמה");
  }
  return trimmed;
}

async function getServerConfig() {
  const token = process.env["API_TOKEN"];
  if (!token) throw new Error("API_TOKEN לא מוגדר בשרת (Vercel → Settings → Environment Variables)");
  const gasUrl = process.env["GAS_URL"] || DEFAULT_GAS_URL;
  return { token, gasUrl };
}

/** GET — תואם prefetch / קישורי _serverFn בלי 405 */
export const listOrdersFn = createServerFn({ method: "GET" }).handler(async () => {
  const { token, gasUrl } = await getServerConfig();
  const url = new URL(gasUrl);
  url.searchParams.set("action", "getOrders");
  url.searchParams.set("token", token);

  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  const text = await response.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      `תשובה לא תקינה מ-Apps Script (HTTP ${response.status}): ${text.slice(0, 160).replace(/\s+/g, " ")}`,
    );
  }

  if (!response.ok) throw new Error(`Apps Script החזיר HTTP ${response.status}`);
  if (data.success === false || data.error) {
    throw new Error(String(data.error || "getOrders נכשל"));
  }
  if (!Array.isArray(data.orders)) {
    throw new Error("Apps Script לא החזיר מערך orders. יש לבדוק שהפעולה getOrders מחוברת לטאב ההזמנות.");
  }

  return {
    tab: String(data.tab || "הזמנות"),
    fetchedAt: String(data.fetchedAt || new Date().toISOString()),
    orders: data.orders
      .map((row) => normalizeOrder(row as Record<string, unknown>))
      .filter((order) => order.id.length > 0 && !/^row-/i.test(order.id)),
  };
});

export const updateOrderStatusFn = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; status: string }) => input)
  .handler(async ({ data }) => {
    const orderId = assertWritableOrderId(data.id);
    const status = String(data.status || "").trim();
    const allowedStatuses = ["פתוחה", "בהעמסה", "בדרך", "סופק"];
    if (!allowedStatuses.includes(status)) throw new Error("סטטוס לא מוכר. העדכון נחסם");

    const { token, gasUrl } = await getServerConfig();
    const response = await fetch(gasUrl, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "updateOrderStatus",
        id: orderId,
        orderId,
        status,
        token,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`תשובה לא תקינה מ-Apps Script: ${text.slice(0, 120)}`);
    }
    if (!response.ok || result.success === false || result.error) {
      throw new Error(String(result.error || "updateOrderStatus נכשל"));
    }
    return { ok: true, orderId, status };
  });
