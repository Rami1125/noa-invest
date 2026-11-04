import { createServerFn } from "@tanstack/react-start";

const GATEWAY_URL =
  process.env.SABAN_GATEWAY_URL || "https://saban-proxy.hsaban2025.workers.dev/";
const SHEET_ID = "1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw";
const MANAGEMENT_PHONES = new Set(["972505227724", "972508860896"]);

type GatewayAction =
  | "get_logistics_dict"
  | "preview_order"
  | "inject_order"
  | "get_delivery_note"
  | "get_media"
  | "get_inquiries_stats";

type GatewayInput = { action: GatewayAction; payload?: Record<string, unknown> };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

async function callGateway(action: GatewayAction, payload: Record<string, unknown> = {}) {
  const secret = process.env.SABAN_GATEWAY_SECRET;
  if (!secret) {
    throw new Error("מפתח Gateway חסר בשרת. יש להגדיר SABAN_GATEWAY_SECRET ב-Vercel Environment Variables.");
  }

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-saban-secret": secret,
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ action, sheetId: SHEET_ID, ...payload }),
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });

  const raw = await response.text();
  let result: Record<string, unknown>;
  try {
    result = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Gateway החזיר תשובה שאינה JSON (HTTP ${response.status}): ${raw.slice(0, 140)}`);
  }
  if (!response.ok || result.success === false || result.error) {
    throw new Error(String(result.error || result.message || `Gateway HTTP ${response.status}`));
  }
  return result;
}

export const logisticsDictFn = createServerFn({ method: "POST" })
  .validator((data: { query?: string }) => data)
  .handler(async ({ data }) => {
    const result = await callGateway("get_logistics_dict", { query: String(data.query || "").trim() });
    const rows = Array.isArray(result.items) ? result.items : Array.isArray(result.data) ? result.data : [];
    return { items: rows as Record<string, unknown>[], fetchedAt: String(result.fetchedAt || new Date().toISOString()) };
  });

export const previewOrderFn = createServerFn({ method: "POST" })
  .validator((data: { order: Record<string, unknown> }) => data)
  .handler(async ({ data }) => callGateway("preview_order", { order: data.order }));

export const injectOrderFn = createServerFn({ method: "POST" })
  .validator((data: { order: Record<string, unknown> }) => data)
  .handler(async ({ data }) => callGateway("inject_order", { order: data.order }));

export const deliveryNoteFn = createServerFn({ method: "POST" })
  .validator((data: { query: string }) => data)
  .handler(async ({ data }) => callGateway("get_delivery_note", { query: data.query.trim() }));

export const mediaFn = createServerFn({ method: "POST" })
  .validator((data: { sku: string }) => data)
  .handler(async ({ data }) => callGateway("get_media", { sku: data.sku }));

export const inquiriesStatsFn = createServerFn({ method: "POST" })
  .validator((data: { managerPhone: string }) => data)
  .handler(async ({ data }) => {
    const normalized = data.managerPhone.replace(/[^0-9]/g, "");
    if (!MANAGEMENT_PHONES.has(normalized)) throw new Error("המספר אינו מורשה ללוח ההנהלה.");
    const result = await callGateway("get_inquiries_stats", { managerPhone: normalized });
    if (result.authorized !== true) {
      throw new Error("ה-Gateway לא אישר הרשאת הנהלה. נדרשת אימות זהות בצד השרת.");
    }
    return result;
  });
