import { createServerFn } from "@tanstack/react-start";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbyv4x_fGMkWmjOLujRymJITBoGQpnbIbJnZp4S9nNs6sacQb1g7x8vyHjaCw6y_t7Pxiw/exec";

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
  const name = String(firstValue(row, "name", "catalogName", "שם מוצר", "מוצר", "פריט"));
  const qtyValue = Number(String(firstValue(row, "qty", "quantity", "כמות") || "1").replace(",", "."));
  const weightValue = Number(
    String(firstValue(row, "weightKg", "unitWeightKg", "משקל ליחידה") || "0").replace(",", "."),
  );
  return {
    sku: String(firstValue(row, "sku", "מק״ט", "מק''ט") || `item-${index + 1}`),
    name,
    catalogName: String(firstValue(row, "catalogName") || name),
    qty: Number.isFinite(qtyValue) ? qtyValue : 1,
    unit: String(firstValue(row, "unit", "יחידה") || "יח׳"),
    weightKg: Number.isFinite(weightValue) ? weightValue : 0,
    matched:
      firstValue(row, "matched") === true || String(firstValue(row, "matched")).toLowerCase() === "true",
  };
}

function normalizeOrder(value: unknown): SheetOrder {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawItems = firstValue(row, "items", "פריטים");
  let items: SheetOrderItem[] = [];
  if (Array.isArray(rawItems)) {
    items = rawItems.map(normalizeItem);
  } else if (typeof rawItems === "string" && rawItems.trim()) {
    try {
      const parsed: unknown = JSON.parse(rawItems);
      if (Array.isArray(parsed)) items = parsed.map(normalizeItem);
    } catch {
      /* free-text manifest */
    }
  }

  const itemsText = String(
    firstValue(row, "itemsText", "items_text", "פירוט מוצרים", "פירוט מוצרים ומק״טים", "פרטי הזמנה"),
  );
  if (items.length === 0 && itemsText) {
    items = itemsText
      .split(/[\n,;]+/)
      .map((part, itemIndex) => {
        const text = part.trim();
        const match = text.match(/^(\d+(?:[.,]\d+)?)\s*(יח׳?|יחידות|שק|שקים|בלות|לוח|דלי|מטר|משטח)?\s*(.+)$/);
        return normalizeItem(
          {
            name: match ? match[3].trim() : text,
            qty: match ? match[1].replace(",", ".") : "1",
            unit: match?.[2] || "יח׳",
          },
          itemIndex,
        );
      })
      .filter((item) => item.name);
  }

  const id = String(
    firstValue(row, "id", "orderId", "orderNumber", "מס׳ הזמנה", "מס' הזמנה", "מספר הזמנה"),
  );

  return {
    id: id.trim(),
    receivedDate: String(firstValue(row, "receivedDate", "תאריך קליטה")),
    customerNo: String(firstValue(row, "customerNo", "customerId", "מס' לקוח", "מס׳ לקוח", "מספר לקוח")).trim(),
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

export const listOrdersFn = createServerFn({ method: "POST" }).handler(async () => {
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
    orders: data.orders.map((row) => normalizeOrder(row)).filter((order) => order.id.length > 0 && !/^row-/i.test(order.id)),
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
      throw new Error(`תשובה לא תקינה בעדכון הזמנה (HTTP ${response.status})`);
    }
    if (!response.ok || result.success !== true || String(result.orderId || "") !== orderId || String(result.status || "") !== status) {
      throw new Error(String(result.error || "Apps Script לא אישר שמירת סטטוס להזמנה"));
    }
    const verifyUrl = new URL(gasUrl);
    verifyUrl.searchParams.set("action", "getOrders");
    verifyUrl.searchParams.set("token", token);
    const verifyResponse = await fetch(verifyUrl, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
    const verifyText = await verifyResponse.text();
    let verifyData: Record<string, unknown>;
    try {
      verifyData = JSON.parse(verifyText) as Record<string, unknown>;
    } catch {
      throw new Error("העדכון נשלח, אך קריאת האימות החוזרת החזירה תשובה לא תקינה");
    }
    if (!verifyResponse.ok || verifyData.success !== true || !Array.isArray(verifyData.orders)) {
      throw new Error(String(verifyData.error || "לא ניתן לאמת את העדכון מול הגיליון"));
    }
    const verified = verifyData.orders.map((row) => normalizeOrder(row)).filter((row) => row.id === orderId);
    if (verified.length !== 1 || verified[0].status !== status) throw new Error("העדכון נשלח אך לא אומת בגיליון");
    return {
      success: true as const,
      orderId,
      status,
      row: typeof result.row === "number" ? result.row : undefined,
      updatedAt: String(result.updatedAt || new Date().toISOString()),
    };
  });
