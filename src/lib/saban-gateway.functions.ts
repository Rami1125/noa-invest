/**
 * Server-only Saban Gateway transport.
 * Env (any one is enough), checked in order:
 *   SABAN_GATEWAY_SECRET | SABAN_GATEWAY_KEY | SABAN_KEY | VITE_SABAN_GATEWAY_KEY
 * Fallback: enterprise key (same as Worker EXPECTED_KEY) so prod works if env not set yet.
 */
import { createServerFn } from "@tanstack/react-start";

const DEFAULT_PROXY = "https://saban-proxy.hsaban2025.workers.dev/";

/** Same value as workers/saban-proxy.js EXPECTED_KEY */
const FALLBACK_KEY = "saban_noa_secret_key_2026_enterprise_99";

function gatewayKey(): string {
  const k =
    process.env["SABAN_GATEWAY_SECRET"] ||
    process.env["SABAN_GATEWAY_KEY"] ||
    process.env["SABAN_KEY"] ||
    process.env["VITE_SABAN_GATEWAY_KEY"] ||
    process.env["VITE_SABAN_GATEWAY_SECRET"] ||
    FALLBACK_KEY;

  const trimmed = String(k).trim();
  if (!trimmed) {
    throw new Error(
      "מפתח Gateway חסר בשרת. יש להגדיר SABAN_GATEWAY_SECRET (או SABAN_GATEWAY_KEY) ב-Vercel Environment Variables.",
    );
  }
  return trimmed;
}

function gatewayUrl(): string {
  const u =
    process.env["SABAN_GATEWAY_URL"] ||
    process.env["VITE_SABAN_GATEWAY_URL"] ||
    DEFAULT_PROXY;
  return String(u).replace(/\/?$/, "/");
}

export type SabanGatewayRequest = {
  action: string;
  params?: Record<string, unknown>;
};

export const sabanGatewayFn = createServerFn({ method: "POST" })
  .inputValidator((d: SabanGatewayRequest) => {
    const action = String(d?.action || "").trim();
    if (!action) throw new Error("חסר action");
    const params =
      d?.params && typeof d.params === "object" && !Array.isArray(d.params)
        ? d.params
        : {};
    return { action, params };
  })
  .handler(async ({ data }) => {
    const key = gatewayKey();
    const url = gatewayUrl();

    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data.params)) {
      if (v !== undefined && v !== null && v !== "") clean[k] = v;
    }

    const body = {
      action: data.action,
      key,
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
        redirect: "follow",
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`שער ה-API לא זמין (${msg}). בדקו את Cloudflare Worker.`);
    }

    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        if (/error code:\s*1101/i.test(text) || /Worker threw exception/i.test(text)) {
          throw new Error(
            "Cloudflare Worker 1101 — עדכנו את workers/saban-proxy.js (CORS + redirect:follow + key)",
          );
        }
        throw new Error(`תשובה לא-JSON מה-Gateway (HTTP ${res.status})`);
      }
    }

    if (!res.ok) {
      const errMsg =
        parsed &&
        typeof parsed === "object" &&
        String(
          (parsed as { error?: string; message?: string }).error ||
            (parsed as { message?: string }).message ||
            `HTTP ${res.status}`,
        );
      throw new Error(errMsg || `HTTP ${res.status}`);
    }

    if (parsed && typeof parsed === "object") {
      const st = String((parsed as { status?: string }).status || "").toLowerCase();
      if (st === "unauthorized" || st === "forbidden") {
        throw new Error(
          "מפתח לא תקין — ודאו ש-SABAN_GATEWAY_SECRET ב-Vercel תואם ל-Worker/GAS",
        );
      }
      const e = (parsed as { error?: string }).error;
      if (e && /unauth|invalid.?key|forbidden/i.test(String(e))) {
        throw new Error(String(e));
      }
    }

    return parsed as Record<string, unknown>;
  });
}
