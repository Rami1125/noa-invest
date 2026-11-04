import { createServerFn } from "@tanstack/react-start";

const MANAGEMENT_PHONES = new Set(["972505227724", "972508860896"]);
type OrderInput = Record<string, unknown>;

async function gateway(
  action: import("./saban-gateway").SabanAction,
  params: import("./saban-gateway").SabanPayload = {},
) {
  // Dynamic import keeps the secret-bearing transport inside server handlers.
  const { callSabanGateway } = await import("./saban-gateway");
  return callSabanGateway(action, params);
}

function asText(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function asItemsJson(order: OrderInput): string {
  const rawItems = Array.isArray(order.items) ? order.items : [];
  const items = rawItems.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      sku: asText(row.sku || row.SKU),
      qty: Number(row.qty ?? row.quantity ?? 0),
    };
  }).filter((item) => item.sku && Number.isFinite(item.qty) && item.qty > 0);

  if (!items.length) throw new Error("יש להוסיף לפחות פריט אחד עם מק״ט וכמות תקינה.");
  return JSON.stringify(items);
}

function requestedTime(order: OrderInput): string {
  return [asText(order.requestedDate), asText(order.requestedWindow)]
    .filter(Boolean)
    .join(" ");
}

export const healthCheckFn = createServerFn({ method: "GET" })
  .handler(async () => gateway("health"));

export const logisticsDictFn = createServerFn({ method: "POST" })
  .validator((data: { query?: string }) => data)
  .handler(async ({ data }) => {
    const q = asText(data.query);
    const result = await gateway("lookup_catalog", { q });
    const rows = Array.isArray(result.items)
      ? result.items
      : Array.isArray(result.data) ? result.data : [];
    return {
      items: rows as Record<string, unknown>[],
      count: Number(result.count || result.total || rows.length),
      fetchedAt: String(result.fetchedAt || new Date().toISOString()),
    };
  });

export const catalogLookupFn = createServerFn({ method: "POST" })
  .validator((data: { q: string }) => data)
  .handler(async ({ data }) => gateway("lookup_catalog", { q: asText(data.q) }));

export const previewOrderFn = createServerFn({ method: "POST" })
  .validator((data: { order: OrderInput }) => data)
  .handler(async ({ data }) => {
    const itemsJson = asItemsJson(data.order);
    return gateway("preview_order", { itemsJson });
  });

export const injectOrderFn = createServerFn({ method: "POST" })
  .validator((data: { order: OrderInput }) => data)
  .handler(async ({ data }) => {
    const order = data.order;
    const itemsJson = asItemsJson(order);
    return gateway("inject_order", {
      customerName: asText(order.customerName || order.customer),
      phone: asText(order.phone),
      address: asText(order.address),
      unloadingType: asText(order.unloadingType || order.unloadType),
      requestedTime: asText(order.requestedTime) || requestedTime(order),
      contactName: asText(order.contactName || order.contact),
      notes: asText(order.notes || order.driverNotes),
      itemsJson,
    });
  });

export const deliveryNoteFn = createServerFn({ method: "POST" })
  .validator((data: { query: string; phone?: string }) => data)
  .handler(async ({ data }) => {
    const phone = asText(data.phone || process.env.SABAN_GATEWAY_PHONE);
    if (!phone) {
      throw new Error("חסר מספר טלפון מאומת לשליפת תעודת משלוח. יש להגדיר SABAN_GATEWAY_PHONE או להעביר phone מאומת.");
    }
    return gateway("get_delivery_note", {
      noteNumber: asText(data.query),
      phone,
    });
  });

export const mediaFn = createServerFn({ method: "POST" })
  .validator((data: { mediaCode: string }) => data)
  .handler(async ({ data }) => gateway("get_media", {
    mediaCode: asText(data.mediaCode),
  }));

export const inquiriesStatsFn = createServerFn({ method: "POST" })
  .validator((data: { managerPhone: string }) => data)
  .handler(async ({ data }) => {
    const phone = asText(data.managerPhone).replace(/[^0-9]/g, "");
    if (!MANAGEMENT_PHONES.has(phone)) {
      throw new Error("המספר אינו מורשה ללוח ההנהלה.");
    }
    // GAS remains the authority for the authenticated phone and access policy.
    return gateway("get_inquiries_stats", { phone });
  });
