/**
 * Server-only Saban Gateway transport.
 * Always injects key into JSON body (field `key`) and Authorization header.
 */
import { createServerFn } from "@tanstack/react-start";

const DEFAULT_PROXY = "https://saban-proxy.hsaban2025.workers.dev/";
const FALLBACK_KEY = "saban_noa_secret_key_2026_enterprise_99";

function gatewayKey(): string {
  const k =
    process.env["SABAN_GATEWAY_SECRET"] ||
    process.env["SABAN_GATEWAY_KEY"] ||
    process.env["SABAN_KEY"] ||
    process.env["VITE_SABAN_GATEWAY_KEY"] ||
    process.env["VITE_SABAN_GATEWAY_SECRET"] ||
    FALLBACK_KEY;
  return String(k).trim() || FALLBACK_KEY;
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

    // Explicit key last so it cannot be overwritten by params
    const body = {
      action: data.action,
      ...clean,
      key,
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${key}`,
          "X-Saban-Secret": key,
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
            "Cloudflare Worker 1101 — עדכנו את workers/saban-proxy.js ב-Cloudflare",
          );
        }
        throw new Error(`תשובה לא-JSON מה-Gateway (HTTP ${res.status}): ${text.slice(0, 200)}`);
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
        throw new Error("מפתח לא תקין מול Worker/GAS");
      }
      const e = (parsed as { error?: string }).error;
      if (e && /unauth|invalid.?key|missing.?key|forbidden/i.test(String(e))) {
        throw new Error(String(e));
      }
    }

    return parsed as Record<string, unknown>;
  });
