/**
 * Noa gateway server fns — Saban API contract +
 * upsert_product_media / delete_product_media (require GAS handlers).
 */
import { createServerFn } from "@tanstack/react-start";

const GATEWAY_URL = (
  process.env.SABAN_GATEWAY_URL ||
  process.env.VITE_SABAN_GATEWAY_URL ||
  "https://saban-proxy.hsaban2025.workers.dev/"
).replace(/\/?$/, "/");

const FALLBACK_KEY = "saban_noa_secret_key_2026_enterprise_99";
const SHEET_ID = "1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw";
const MANAGEMENT_PHONES = new Set(["972505227724", "972508860896"]);

type GatewayAction =
  | "health"
  | "lookup_catalog"
  | "preview_order"
  | "inject_order"
  | "get_delivery_note"
  | "get_media"
  | "get_inquiries_stats"
  | "upsert_product_media"
  | "delete_product_media";

function gatewayKey(): string {
  return (
    process.env.SABAN_GATEWAY_SECRET ||
    process.env.SABAN_GATEWAY_KEY ||
    process.env.SABAN_KEY ||
    process.env.VITE_SABAN_GATEWAY_KEY ||
    FALLBACK_KEY
  ).trim();
}

function extractCatalogRows(result: Record<string, unknown>): Record<string, unknown>[] {
  if (Array.isArray(result.results)) return result.results as Record<string, unknown>[];
  if (Array.isArray(result.items)) return result.items as Record<string, unknown>[];
  if (Array.isArray(result.products)) return result.products as Record<string, unknown>[];
  if (Array.isArray(result.data)) return result.data as Record<string, unknown>[];
  if (Array.isArray(result.rows)) return result.rows as Record<string, unknown>[];
  return [];
}

async function callGateway(
  action: GatewayAction,
  payload: Record<string, unknown> = {},
) {
  const key = gatewayKey();

  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined && v !== null && v !== "") clean[k] = v;
  }

  const body = {
    action,
    sheetId: SHEET_ID,
    ...clean,
    key,
  };

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Saban-Secret": key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });

  const raw = await response.text();
  let result: Record<string, unknown>;
  try {
    result = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Gateway החזיר תשובה שאינה JSON (HTTP ${response.status}): ${raw.slice(0, 140)}`,
    );
  }

  if (!response.ok || result.success === false || result.error) {
    throw new Error(
      String(result.error || result.message || `Gateway HTTP ${response.status}`),
    );
  }
  return result;
}

export const logisticsDictFn = createServerFn({ method: "POST" })
  .validator((data: { query?: string }) => data)
  .handler(async ({ data }) => {
    const q = String(data.query || "").trim();
    const result = await callGateway("lookup_catalog", { q });
    const rows = extractCatalogRows(result);
    return {
      items: rows,
      results: rows,
      count: Number(result.count || result.total || rows.length),
      query: q,
      fetchedAt: String(result.fetchedAt || new Date().toISOString()),
    };
  });

export const previewOrderFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      order?: Record<string, unknown>;
      itemsJson?: string;
      items?: unknown;
    }) => data,
  )
  .handler(async ({ data }) => {
    let itemsJson = data.itemsJson;
    if (!itemsJson && Array.isArray(data.items)) {
      itemsJson = JSON.stringify(data.items);
    }
    if (
      !itemsJson &&
      data.order &&
      Array.isArray((data.order as { items?: unknown }).items)
    ) {
      itemsJson = JSON.stringify((data.order as { items: unknown }).items);
    }
    if (!itemsJson && data.order) {
      const nested = (data.order as { itemsJson?: string }).itemsJson;
      if (nested) itemsJson = nested;
    }
    return callGateway("preview_order", {
      itemsJson: itemsJson || JSON.stringify([]),
      ...(data.order ? { order: data.order } : {}),
    });
  });

export const injectOrderFn = createServerFn({ method: "POST" })
  .validator(
    (data: { order?: Record<string, unknown> } & Record<string, unknown>) => data,
  )
  .handler(async ({ data }) => {
    const order = (data.order || data) as Record<string, unknown>;
    const items = order.items ?? data.items;
    const itemsJson =
      order.itemsJson ||
      data.itemsJson ||
      (Array.isArray(items) ? JSON.stringify(items) : undefined);

    return callGateway("inject_order", {
      customerName: order.customerName || order.customer,
      phone: order.phone,
      address: order.address,
      unloadingType: order.unloadingType || order.unloadType,
      requestedTime: order.requestedTime || order.requestedAt,
      contactName: order.contactName,
      notes: order.notes || order.driverNotes,
      itemsJson,
    });
  });

export const deliveryNoteFn = createServerFn({ method: "POST" })
  .validator(
    (data: { query?: string; noteNumber?: string; phone?: string }) => data,
  )
  .handler(async ({ data }) => {
    const noteNumber = String(data.noteNumber || data.query || "").trim();
    const phone = String(data.phone || "972508860896").replace(/\D/g, "");
    return callGateway("get_delivery_note", { noteNumber, phone });
  });

export const mediaFn = createServerFn({ method: "POST" })
  .validator((data: { sku?: string; mediaCode?: string }) => data)
  .handler(async ({ data }) => {
    const mediaCode = String(data.mediaCode || data.sku || "").trim();
    return callGateway("get_media", { mediaCode });
  });

/** Save / update image URL in מאגר_מדיה + link on מילון_לוגיסט */
export const upsertProductMediaFn = createServerFn({ method: "POST" })
  .validator(
    (data: { sku: string; url: string; mediaCode?: string; name?: string }) => data,
  )
  .handler(async ({ data }) => {
    const sku = String(data.sku || "").trim();
    const url = String(data.url || "").trim();
    const mediaCode = String(data.mediaCode || (sku ? `SKU_${sku}` : "")).trim();
    if (!sku) throw new Error("חסר מק\"ט");
    if (!url) throw new Error("חסר קישור תמונה");
    if (!mediaCode) throw new Error("חסר mediaCode");
    return callGateway("upsert_product_media", {
      sku,
      url,
      mediaCode,
      name: data.name,
      imageUrl: url,
    });
  });

/** Remove media link for product */
export const deleteProductMediaFn = createServerFn({ method: "POST" })
  .validator((data: { sku: string; mediaCode?: string }) => data)
  .handler(async ({ data }) => {
    const sku = String(data.sku || "").trim();
    const mediaCode = String(data.mediaCode || (sku ? `SKU_${sku}` : "")).trim();
    if (!sku) throw new Error("חסר מק\"ט");
    return callGateway("delete_product_media", { sku, mediaCode });
  });

export const inquiriesStatsFn = createServerFn({ method: "POST" })
  .validator((data: { managerPhone?: string; phone?: string }) => data)
  .handler(async ({ data }) => {
    let normalized = String(data.phone || data.managerPhone || "").replace(
      /\D/g,
      "",
    );
    if (normalized.startsWith("0")) normalized = `972${normalized.slice(1)}`;
    if (!MANAGEMENT_PHONES.has(normalized)) {
      throw new Error("המספר אינו מורשה ללוח ההנהלה.");
    }
    return callGateway("get_inquiries_stats", { phone: normalized });
  });
