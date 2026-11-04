/**
 * Cloudflare Worker: saban-proxy
 * Deploy: wrangler deploy (or paste into CF Workers dashboard)
 *
 * - CORS full (OPTIONS → 204)
 * - Auth via JSON body `key` or query `key`
 * - Forwards to Google Apps Script with redirect: 'follow'
 * - Returns clean JSON to frontend (no 1101 on GAS 302)
 */

const GAS_EXEC =
  "https://script.google.com/macros/s/AKfycbx1f8JmxEtfwfMUhd3b_3vCf9ygKV5S7Orm3p7CsyDhNce2obQLg331hZpjOetaqQvcHw/exec";

const EXPECTED_KEY = "saban_noa_secret_key_2026_enterprise_99";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, X-Saban-Secret",
  "Access-Control-Max-Age": "86400",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

async function parseIncoming(request) {
  const url = new URL(request.url);
  const q = Object.fromEntries(url.searchParams.entries());

  if (request.method === "GET") {
    return q;
  }

  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      const body = await request.json();
      return { ...q, ...(body && typeof body === "object" ? body : {}) };
    } catch {
      return { ...q, _parseError: "invalid_json" };
    }
  }

  // form / text fallback
  try {
    const text = await request.text();
    if (!text) return q;
    try {
      return { ...q, ...JSON.parse(text) };
    } catch {
      return { ...q, raw: text };
    }
  } catch {
    return q;
  }
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== "GET" && request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    let payload;
    try {
      payload = await parseIncoming(request);
    } catch (e) {
      return json({ error: "bad_request", message: String(e) }, 400);
    }

    if (payload._parseError) {
      return json({ error: "invalid_json" }, 400);
    }

    const key = String(payload.key || payload.secret || "").trim();
    if (key !== EXPECTED_KEY) {
      return json({ status: "unauthorized", error: "Invalid key" }, 401);
    }

    const action = String(payload.action || "").trim();
    if (!action) {
      return json({ error: "missing_action" }, 400);
    }

    // Local health — no need to hit GAS
    if (action === "health") {
      return json({
        ok: true,
        status: "healthy",
        service: "saban-proxy",
        gas: GAS_EXEC,
        ts: new Date().toISOString(),
      });
    }

    // Forward full payload (including key + action) to GAS
    const forwardBody = { ...payload };
    delete forwardBody._parseError;
    delete forwardBody.raw;

    try {
      const gasRes = await fetch(GAS_EXEC, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(forwardBody),
        redirect: "follow",
      });

      const text = await gasRes.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        // GAS sometimes returns HTML on error
        return json(
          {
            error: "gas_non_json",
            status: gasRes.status,
            snippet: text.slice(0, 300),
          },
          502,
        );
      }

      return json(data, gasRes.ok ? 200 : gasRes.status >= 400 ? gasRes.status : 200);
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
