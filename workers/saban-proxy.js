/**
 * Cloudflare Worker: saban-proxy
 * Paste into CF Dashboard → Save & Deploy
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
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
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

function extractKey(payload, request) {
  const fromBody = String(payload.key || payload.secret || "").trim();
  if (fromBody) return fromBody;

  const auth = request.headers.get("Authorization") || "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();

  const hdr = request.headers.get("X-Saban-Secret");
  if (hdr) return hdr.trim();

  return "";
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== "GET" && request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    const incomingUrl = new URL(request.url);
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
            /* non-json body */
          }
        }
      } catch (e) {
        return json({ error: "bad_request", message: String(e) }, 400);
      }
    }

    let key = extractKey(payload, request);

    // Reject only wrong keys; if missing — inject enterprise key so GAS gets it
    if (key && key !== EXPECTED_KEY) {
      return json({ status: "unauthorized", error: "Invalid key" }, 401);
    }
    if (!key) {
      key = EXPECTED_KEY;
    }
    payload.key = key;

    const action = String(payload.action || "").trim();

    if (action === "health") {
      return json({
        ok: true,
        status: "healthy",
        service: "saban-proxy",
        gas: GAS_EXEC,
        ts: new Date().toISOString(),
      });
    }

    try {
      let gasRes;

      if (request.method === "GET") {
        const u = new URL(GAS_EXEC);
        for (const [k, v] of Object.entries(payload)) {
          if (v !== undefined && v !== null && v !== "") {
            u.searchParams.set(k, String(v));
          }
        }
        if (!u.searchParams.has("key")) u.searchParams.set("key", key);
        gasRes = await fetch(u.toString(), {
          method: "GET",
          redirect: "follow",
        });
      } else {
        const forward = JSON.stringify({ ...payload, key, action: action || payload.action });
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
