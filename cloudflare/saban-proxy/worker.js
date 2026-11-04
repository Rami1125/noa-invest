/**
 * Cloudflare Worker: Saban API Gateway proxy
 *
 * Configure GAS_URL as a Worker variable (or use the default below).
 * The API key is passed only in the JSON request body to Apps Script.
 */
const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbx1f8JmxEtfwfMUhd3b_3vCf9ygKV5S7Orm3p7CsyDhNce2obQLg331hZpjOetaqQvcHw/exec";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      if (request.method !== "GET" && request.method !== "POST") {
        return jsonResponse({ success: false, error: "Method not allowed" }, 405, {
          Allow: "GET, POST, OPTIONS",
        });
      }

      let payload;
      if (request.method === "POST") {
        const contentType = request.headers.get("content-type") || "";
        if (!contentType.toLowerCase().includes("application/json")) {
          return jsonResponse({ success: false, error: "Content-Type must be application/json" }, 415);
        }
        try {
          payload = await request.json();
        } catch {
          return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
        }
      } else {
        const incoming = new URL(request.url);
        payload = Object.fromEntries(incoming.searchParams.entries());
      }

      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return jsonResponse({ success: false, error: "JSON object required" }, 400);
      }
      if (!payload.action || typeof payload.action !== "string") {
        return jsonResponse({ success: false, error: "Missing action" }, 400);
      }
      if (!payload.key || typeof payload.key !== "string") {
        return jsonResponse({ success: false, error: "Missing key" }, 401);
      }

      const gasUrl = env.GAS_URL || DEFAULT_GAS_URL;
      const upstreamUrl = new URL(gasUrl);
      const upstreamInit = {
        method: request.method,
        redirect: "follow",
        headers: { Accept: "application/json" },
      };

      if (request.method === "POST") {
        upstreamInit.headers["Content-Type"] = "application/json";
        upstreamInit.body = JSON.stringify(payload);
      } else {
        for (const [name, value] of Object.entries(payload)) {
          upstreamUrl.searchParams.set(name, String(value));
        }
      }

      const upstream = await fetch(upstreamUrl.toString(), upstreamInit);
      const raw = await upstream.text();

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return jsonResponse({
          success: false,
          error: "Apps Script returned a non-JSON response",
          upstreamStatus: upstream.status,
          contentType: upstream.headers.get("content-type") || "",
          responsePreview: raw.slice(0, 240),
        }, 502);
      }

      return jsonResponse(parsed, upstream.ok ? 200 : upstream.status);
    } catch (error) {
      // Never let an exception escape the Worker as Cloudflare Error 1101.
      return jsonResponse({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected proxy failure",
      }, 502);
    }
  },
};
