/**
 * Saban Enterprise API Gateway client
 * Proxy: https://saban-proxy.hsaban2025.workers.dev/
 * Auth: JSON body field `key` (NOT secret, NOT Authorization-only)
 * Method: POST application/json (preferred) or GET query params
 *
 * Contract actions:
 *   health | get_inquiries_stats | get_delivery_note | inject_order
 *   lookup_catalog | preview_order | get_media
 */

export const SABAN_GATEWAY = {
  baseUrl: "https://saban-proxy.hsaban2025.workers.dev/",
  /** Must be sent as JSON field `key` */
  key: "saban_noa_secret_key_2026_enterprise_99",
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

/**
 * Core transport — always POST JSON with `action` + `key` in body.
 * No reliance on Authorization headers for auth (Worker/GAS expect `key`).
 */
async function gatewayCall<T>(
  action: GatewayAction,
  params: Record<string, unknown> = {},
  init?: { signal?: AbortSignal },
): Promise<T> {
  const url = SABAN_GATEWAY.baseUrl.replace(/\/?$/, "/");

  // Strip undefined / null so GAS does not see empty noise
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") clean[k] = v;
  }

  const body = {
    action,
    key: SABAN_GATEWAY.key,
    ...clean,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: init?.signal,
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Network error talking to Saban Gateway";
    throw new GatewayError(
      `שער ה-API לא זמין (${msg}). בדקו את Cloudflare Worker.`,
      0,
      err,
    );
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // Worker/GAS sometimes returns HTML on crash
      if (/error code:\s*1101/i.test(text) || /Worker threw exception/i.test(text)) {
        throw new GatewayError(
          "Cloudflare Worker 1101 — יש לעדכן את ה-Worker (CORS + redirect:follow + key)",
          1101,
          text.slice(0, 400),
        );
      }
      data = { raw: text.slice(0, 500) };
    }
  }

  if (!res.ok) {
    const errMsg =
      (data &&
        typeof data === "object" &&
        String(
          (data as { error?: string; message?: string }).error ||
            (data as { message?: string }).message ||
            `HTTP ${res.status}`,
        )) ||
      `HTTP ${res.status}`;
    throw new GatewayError(errMsg, res.status, data);
  }

  if (data && typeof data === "object") {
    const st = String(
      (data as { status?: string; ok?: boolean }).status ?? "",
    ).toLowerCase();
    if (st === "unauthorized" || st === "forbidden") {
      throw new GatewayError(
        "מפתח לא תקין — ודאו ששדה key נשלח בגוף ה-JSON",
        401,
        data,
      );
    }
    if ((data as { error?: string }).error) {
      const e = String((data as { error: string }).error);
      if (/unauth|invalid.?key|forbidden/i.test(e)) {
        throw new GatewayError(e, 401, data);
      }
    }
  }

  return data as T;
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

/** Optional bulk list — falls back to empty if backend has no get_catalog */
export async function getCatalog(
  _params?: { limit?: number; offset?: number },
  signal?: AbortSignal,
): Promise<{ items?: CatalogItem[]; total?: number }> {
  // Backend contract exposes lookup_catalog; use empty-q or common seed terms
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
