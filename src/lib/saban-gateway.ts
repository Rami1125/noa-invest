/**
 * Saban Enterprise API Gateway — client API
 * Transport: server fn (src/lib/saban-gateway.functions.ts)
 * Auth: SABAN_GATEWAY_KEY in Vercel Environment Variables (server only)
 *
 * Contract actions:
 *   health | get_inquiries_stats | get_delivery_note | inject_order
 *   lookup_catalog | preview_order | get_media
 */

import { sabanGatewayFn } from "@/lib/saban-gateway.functions";

export const SABAN_GATEWAY = {
  baseUrl: "https://saban-proxy.hsaban2025.workers.dev/",
  sheetId: "1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw",
  sheetTitle: "בדיקת תעודות משלוח-",
  managers: {
    harel: { name: "הראל אידלסון", phone: "972505227724" },
    rami: { name: "ראמי מסארווה", phone: "972508860896" },
  },
} as const;

export type GatewayAction =
  | "health"
  | "get_inquiries_stats"
  | "get_delivery_note"
  | "inject_order"
  | "lookup_catalog"
  | "preview_order"
  | "get_media";

export class GatewayError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status = 0, body?: unknown) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
    this.body = body;
  }
}

export type OrderLineInput = {
  sku: string;
  name?: string;
  qty: number;
  unit?: string;
};

export type PreviewOrderPayload = {
  items: OrderLineInput[];
};

export type InjectOrderPayload = {
  customerName: string;
  phone?: string;
  address: string;
  unloadingType: "crane" | "manual" | "forklift" | string;
  requestedTime?: string;
  contactName?: string;
  notes?: string;
  items: OrderLineInput[];
};

export type PreviewOrderResult = {
  ok?: boolean;
  totalWeightTons?: number;
  weightKg?: number;
  weightTons?: number;
  deposits?: {
    bales60002?: number;
    pallets60060?: number;
    thresholdBags?: number;
  };
  lines?: Array<{ sku: string; name?: string; qty: number; weightKg?: number }>;
  message?: string;
  [key: string]: unknown;
};

export type InjectOrderResult = {
  ok?: boolean;
  rowNumber?: number;
  orderId?: string;
  timestamp?: string;
  message?: string;
  [key: string]: unknown;
};

export type DeliveryNoteResult = {
  noteNumber?: string;
  noteId?: string;
  customerName?: string;
  customer?: string;
  date?: string;
  address?: string;
  driver?: string;
  status?: string;
  driveLink?: string;
  driveUrl?: string;
  filename?: string;
  caption?: string;
  [key: string]: unknown;
};

export type CatalogItem = {
  sku: string;
  name: string;
  category?: string;
  unit?: string;
  weightKg?: number;
  warehouse?: string;
  slang?: string[];
  mediaId?: string;
  mediaCode?: string;
  imageUrl?: string;
  [key: string]: unknown;
};

export type InquiriesStats = {
  harelOpen?: number;
  ramiOpen?: number;
  totalOpen?: number;
  open?: number;
  harelTab?: string;
  ramiTab?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

function toItemsJson(items: OrderLineInput[]): string {
  return JSON.stringify(
    items.map((i) => ({
      sku: String(i.sku),
      qty: Number(i.qty) || 0,
      ...(i.name ? { name: i.name } : {}),
      ...(i.unit ? { unit: i.unit } : {}),
    })),
  );
}

async function gatewayCall<T>(
  action: GatewayAction,
  params: Record<string, unknown> = {},
  _init?: { signal?: AbortSignal },
): Promise<T> {
  try {
    const data = await sabanGatewayFn({
      data: { action, params },
    });
    return data as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = /חסר|SABAN_GATEWAY_KEY/i.test(msg)
      ? 0
      : /unauth|מפתח לא תקין/i.test(msg)
        ? 401
        : /1101/.test(msg)
          ? 1101
          : 500;
    throw new GatewayError(msg, status, err);
  }
}

// ─── Public API ───────────────────────────────────────────────

export function health(signal?: AbortSignal) {
  return gatewayCall<{ ok?: boolean; status?: string; version?: string }>(
    "health",
    {},
    { signal },
  );
}

export function getInquiriesStats(phone: string, signal?: AbortSignal) {
  return gatewayCall<InquiriesStats>(
    "get_inquiries_stats",
    { phone },
    { signal },
  );
}

export function getDeliveryNote(
  noteNumber: string,
  phone: string,
  signal?: AbortSignal,
) {
  return gatewayCall<DeliveryNoteResult>(
    "get_delivery_note",
    { noteNumber, phone },
    { signal },
  );
}

export function injectOrder(payload: InjectOrderPayload, signal?: AbortSignal) {
  return gatewayCall<InjectOrderResult>(
    "inject_order",
    {
      customerName: payload.customerName,
      phone: payload.phone,
      address: payload.address,
      unloadingType: payload.unloadingType,
      requestedTime: payload.requestedTime,
      contactName: payload.contactName,
      notes: payload.notes,
      itemsJson: toItemsJson(payload.items),
    },
    { signal },
  );
}

export function lookupCatalog(q: string, signal?: AbortSignal) {
  return gatewayCall<{ items?: CatalogItem[]; products?: CatalogItem[] }>(
    "lookup_catalog",
    { q },
    { signal },
  );
}

/** @deprecated alias — prefer lookupCatalog */
export function searchCatalog(q: string, signal?: AbortSignal) {
  return lookupCatalog(q, signal);
}

export function previewOrder(payload: PreviewOrderPayload, signal?: AbortSignal) {
  return gatewayCall<PreviewOrderResult>(
    "preview_order",
    { itemsJson: toItemsJson(payload.items) },
    { signal },
  );
}

export function getMedia(mediaCode: string, signal?: AbortSignal) {
  return gatewayCall<{ url?: string; imageUrl?: string; mediaCode?: string }>(
    "get_media",
    { mediaCode },
    { signal },
  );
}

export async function getCatalog(
  _params?: { limit?: number; offset?: number },
  signal?: AbortSignal,
): Promise<{ items?: CatalogItem[]; total?: number }> {
  try {
    const res = await lookupCatalog("", signal);
    const items = res.items || res.products || [];
    return { items, total: items.length };
  } catch {
    return { items: [], total: 0 };
  }
}

export function isManagerPhone(phone: string): "harel" | "rami" | null {
  const digits = phone.replace(/\D/g, "");
  const norm = digits.startsWith("0") ? `972${digits.slice(1)}` : digits;
  const h = SABAN_GATEWAY.managers.harel.phone;
  const r = SABAN_GATEWAY.managers.rami.phone;
  if (norm === h || norm.endsWith(h.slice(-9))) return "harel";
  if (norm === r || norm.endsWith(r.slice(-9))) return "rami";
  return null;
}

export function estimateDepositsLocal(
  items: OrderLineInput[],
  bagThreshold: 40 | 50 = 40,
) {
  const bags = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const units = Math.floor(bags / bagThreshold);
  return {
    bags,
    bales60002: units,
    pallets60060: units,
    thresholdBags: bagThreshold,
  };
}
