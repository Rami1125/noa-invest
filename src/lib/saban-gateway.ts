/**
 * Saban Enterprise API Gateway client
 * Base: https://saban-proxy.hsaban2025.workers.dev/
 * Sheet: בדיקת תעודות משלוח- (1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw)
 *
 * Rules:
 * - POST for actions with body (never send body on GET)
 * - Secret via header X-Saban-Secret + body.secret fallback
 */

export const SABAN_GATEWAY = {
  baseUrl: "https://saban-proxy.hsaban2025.workers.dev/",
  secret: "saban_noa_secret_key_2026_enterprise_99",
  sheetId: "1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw",
  sheetTitle: "בדיקת תעודות משלוח-",
  managers: {
    harel: { name: "הראל אידלסון", phone: "972505227724" },
    rami: { name: "ראמי מסארווה", phone: "972508860896" },
  },
} as const;

export type GatewayAction =
  | "preview_order"
  | "inject_order"
  | "get_delivery_note"
  | "search_delivery_notes"
  | "get_catalog"
  | "search_catalog"
  | "get_media"
  | "get_inquiries_stats"
  | "health";

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
  customerName: string;
  phone?: string;
  address: string;
  unloadType: "crane" | "manual" | "forklift" | string;
  requestedAt?: string;
  driverNotes?: string;
  items: OrderLineInput[];
};

export type PreviewOrderResult = {
  ok?: boolean;
  totalWeightTons?: number;
  weightKg?: number;
  deposits?: {
    bales60002?: number;
    pallets60060?: number;
    thresholdBags?: 40 | 50 | number;
  };
  lines?: Array<{
    sku: string;
    name: string;
    qty: number;
    weightKg?: number;
  }>;
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
  noteId?: string;
  customer?: string;
  date?: string;
  address?: string;
  driver?: string;
  status?: string;
  driveLink?: string;
  driveUrl?: string;
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
  imageUrl?: string;
  [key: string]: unknown;
};

export type InquiriesStats = {
  harelOpen?: number;
  ramiOpen?: number;
  totalOpen?: number;
  harelTab?: string;
  ramiTab?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

async function gatewayCall<T>(
  action: GatewayAction,
  payload: Record<string, unknown> = {},
  init?: { signal?: AbortSignal },
): Promise<T> {
  const url = SABAN_GATEWAY.baseUrl.replace(/\/?$/, "/");
  const body = {
    action,
    secret: SABAN_GATEWAY.secret,
    sheetId: SABAN_GATEWAY.sheetId,
    ...payload,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Saban-Secret": SABAN_GATEWAY.secret,
        Authorization: `Bearer ${SABAN_GATEWAY.secret}`,
      },
      body: JSON.stringify(body),
      signal: init?.signal,
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Network error talking to Saban Gateway";
    throw new GatewayError(
      `שער ה-API לא זמין (${msg}). נסו שוב בעוד רגע.`,
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
      data = { raw: text };
    }
  }

  if (!res.ok) {
    const errMsg =
      (data &&
        typeof data === "object" &&
        ("error" in data || "message" in data) &&
        String(
          (data as { error?: string; message?: string }).error ||
            (data as { message?: string }).message,
        )) ||
      `HTTP ${res.status}`;
    throw new GatewayError(errMsg, res.status, data);
  }

  if (
    data &&
    typeof data === "object" &&
    ("status" in data) &&
    String((data as { status: string }).status).toLowerCase() === "unauthorized"
  ) {
    throw new GatewayError("מפתח סודי לא תקין ב-Gateway", 401, data);
  }

  return data as T;
}

export function previewOrder(payload: PreviewOrderPayload, signal?: AbortSignal) {
  return gatewayCall<PreviewOrderResult>("preview_order", { ...payload }, { signal });
}

export function injectOrder(payload: PreviewOrderPayload, signal?: AbortSignal) {
  return gatewayCall<InjectOrderResult>("inject_order", { ...payload }, { signal });
}

export function getDeliveryNote(query: string, signal?: AbortSignal) {
  return gatewayCall<DeliveryNoteResult>(
    "get_delivery_note",
    { query, noteId: query, customer: query },
    { signal },
  );
}

export function searchDeliveryNotes(query: string, signal?: AbortSignal) {
  return gatewayCall<{ notes?: DeliveryNoteResult[]; items?: DeliveryNoteResult[] }>(
    "search_delivery_notes",
    { query },
    { signal },
  );
}

export function searchCatalog(query: string, signal?: AbortSignal) {
  return gatewayCall<{ items?: CatalogItem[]; products?: CatalogItem[] }>(
    "search_catalog",
    { query, tab: "מילון_לוגיסט" },
    { signal },
  );
}

export function getCatalog(params?: { limit?: number; offset?: number }, signal?: AbortSignal) {
  return gatewayCall<{ items?: CatalogItem[]; total?: number }>(
    "get_catalog",
    { tab: "מילון_לוגיסט", limit: params?.limit ?? 80, offset: params?.offset ?? 0 },
    { signal },
  );
}

export function getMedia(mediaId: string, signal?: AbortSignal) {
  return gatewayCall<{ url?: string; imageUrl?: string; base64?: string }>(
    "get_media",
    { mediaId, tab: "מאגר_מדיה" },
    { signal },
  );
}

export function getInquiriesStats(signal?: AbortSignal) {
  return gatewayCall<InquiriesStats>("get_inquiries_stats", {}, { signal });
}

export function isManagerPhone(phone: string): "harel" | "rami" | null {
  const digits = phone.replace(/\D/g, "");
  const norm = digits.startsWith("0") ? `972${digits.slice(1)}` : digits;
  if (norm.endsWith(SABAN_GATEWAY.managers.harel.phone.slice(-9)) || norm === SABAN_GATEWAY.managers.harel.phone)
    return "harel";
  if (norm.endsWith(SABAN_GATEWAY.managers.rami.phone.slice(-9)) || norm === SABAN_GATEWAY.managers.rami.phone)
    return "rami";
  return null;
}

/** Deposit thresholds: every 40 or 50 bags → 1 bale / pallet unit (business rule). */
export function estimateDepositsLocal(items: OrderLineInput[], bagThreshold: 40 | 50 = 40) {
  const bags = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const units = Math.floor(bags / bagThreshold);
  return {
    bags,
    bales60002: units,
    pallets60060: units,
    thresholdBags: bagThreshold,
  };
}
