/**
 * Server-only transport for the Saban / Noa API Gateway.
 * Never import this module from browser components. Call it only inside
 * TanStack Start server-function handlers.
 */

const DEFAULT_GATEWAY_URL = "https://saban-proxy.hsaban2025.workers.dev/";

export type SabanAction =
  | "health"
  | "get_inquiries_stats"
  | "get_delivery_note"
  | "inject_order"
  | "lookup_catalog"
  | "preview_order"
  | "get_media";

export type SabanPayload = Record<string, string | number | boolean | null | undefined>;

export async function callSabanGateway(
  action: SabanAction,
  params: SabanPayload = {},
): Promise<Record<string, unknown>> {
  const key = process.env.SABAN_GATEWAY_KEY;
  if (!key) {
    throw new Error(
      "מפתח ה-Gateway חסר. יש להגדיר SABAN_GATEWAY_KEY ב-Vercel Environment Variables.",
    );
  }

  const endpoint = process.env.SABAN_GATEWAY_URL || DEFAULT_GATEWAY_URL;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      key,
      ...params,
    }),
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });

  const raw = await response.text();
  let result: unknown;
  try {
    result = JSON.parse(raw);
  } catch {
    throw new Error(
      `ה-Gateway החזיר תשובה שאינה JSON (HTTP ${response.status}): ${raw.slice(0, 180)}`,
    );
  }

  if (!response.ok) {
    const message =
      result && typeof result === "object" && "error" in result
        ? String((result as { error: unknown }).error)
        : `Gateway HTTP ${response.status}`;
    throw new Error(message);
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("ה-Gateway החזיר מבנה תשובה לא תקין.");
  }

  const data = result as Record<string, unknown>;
  if (data.success === false || data.error) {
    throw new Error(String(data.error || data.message || "הפעולה נכשלה בשרת."));
  }
  return data;
}
