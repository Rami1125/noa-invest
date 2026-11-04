/**
 * Cloudflare Worker: saban-proxy
 * הדביקו בקוד Worker ב-Cloudflare Dashboard → Save & Deploy
 *
 * שיפורים מול הגרסה הפשוטה:
 * - OPTIONS 204 (CORS Preflight) — חובה ל-POST מ-Vercel
 * - לא מעבירים request.headers גולמיים (שובר Host / CF)
 * - body נקרא כטקסט ומועבר מחדש (לא stream שבור)
 * - redirect: 'follow' בולע 302 של Google Apps Script
 * - key + action ב-JSON body (חוזה Frontend / GAS)
 */

const GAS_EXEC =
  "https://script.google.com/macros/s/AKfycbwx7Vwrlrx_gKpPn5gFpHXsiBsV8TImeSWG5S1wpVDMAZkNCiOQGkNhFuaVD6AAVTv6SA/exec";

const EXPECTED_KEY = "saban_noa_secret_key_2026_enterprise_99";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, X-Saban-Secret",
  "Access-Control-Max-Age": "86400",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS,
    },
  });
}

function textResponse(body, status = 200, contentType = "application/json") {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": contentType.includes("json")
        ? "application/json; charset=utf-8"
        : contentType,
      ...CORS,
    },
  });
}

export default {
  async fetch(request) {
    // ── CORS preflight ──────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== "GET" && request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const incomingUrl = new URL(request.url);

    // ── Parse body / query ──────────────────────────────────
    let payload = Object.fromEntries(incomingUrl.searchParams.entries());
    let rawBody = "";

    if (request.method === "POST") {
      try {
        rawBody = await request.text();
        if (rawBody) {
          try {
            const parsed = JSON.parse(rawBody);
            if (parsed && typeof parsed === "object") {
              payload = { ...payload, ...parsed };
            }
          } catch {
            // keep query-only; forward raw below if needed
          }
        }
      } catch (e) {
        return json({ error: "bad_request", message: String(e) }, 400);
      }
    }

    const key = String(payload.key || payload.secret || "").trim();
    const action = String(payload.action || "").trim();

    // Auth (body key preferred — matches Frontend server fn)
    if (key && key !== EXPECTED_KEY) {
      return json({ status: "unauthorized", error: "Invalid key" }, 401);
    }
    // If key missing entirely on POST with action — reject
    if (request.method === "POST" && action && !key) {
      return json(
        {
          status: "unauthorized",
          error: "Missing key — send JSON field key",
        },
        401,
      );
    }

    // Local health (no GAS round-trip)
    if (action === "health") {
      return json({
        ok: true,
        status: "healthy",
        service: "saban-proxy",
        gas: GAS_EXEC,
        ts: new Date().toISOString(),
      });
    }

    // ── Forward to Google Apps Script ───────────────────────
    // Prefer POST JSON body (Frontend contract). GET keeps query string.
    try {
      let gasRes;

      if (request.method === "GET") {
        const target = GAS_EXEC + incomingUrl.search;
        gasRes = await fetch(target, {
          method: "GET",
          redirect: "follow",
        });
      } else {
        // Rebuild clean JSON for GAS (action + key + params)
        const forward =
          rawBody && payload.action
            ? JSON.stringify(payload)
            : rawBody || JSON.stringify(payload);

        gasRes = await fetch(GAS_EXEC, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: forward,
          redirect: "follow",
        });
      }

      const data = await gasRes.text();
      const ct = gasRes.headers.get("content-type") || "application/json";

      // Always expose CORS; prefer JSON content-type when body looks like JSON
      const looksJson =
        data.trim().startsWith("{") || data.trim().startsWith("[");
      return textResponse(
        data,
        gasRes.status,
        looksJson ? "application/json; charset=utf-8" : ct,
      );
    } catch (e) {
      return json(
        {
          error: "upstream_failed",
          message: e instanceof Error ? e.message : String(e),
        },
        502,
      );
    }
  },
};
