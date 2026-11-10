/**
 * Saban Noa Proxy — Cloudflare Worker (NEW)
 * מפנה ל-Google Apps Script Web App החדש (Standalone v7.1)
 *
 * הגדרה ב-Cloudflare:
 * 1. Workers → Create → הדבק קובץ זה
 * 2. Settings → Variables:
 *    GAS_EXEC_URL = https://script.google.com/macros/s/XXXX/exec
 *    API_KEY      = saban_secret_token_2026
 * 3. Routes / workers.dev subdomain
 */

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const gasUrl = env.GAS_EXEC_URL;
    const apiKey = env.API_KEY || 'saban_secret_token_2026';

    if (!gasUrl) {
      return json({ ok: false, error: 'GAS_EXEC_URL not configured' }, 500);
    }

    let body = {};
    try {
      if (request.method === 'POST' || request.method === 'PUT') {
        const text = await request.text();
        body = text ? JSON.parse(text) : {};
      }
    } catch {
      return json({ ok: false, error: 'Invalid JSON body' }, 400);
    }

    // שליפת query גם מ-GET
    const url = new URL(request.url);
    url.searchParams.forEach((v, k) => {
      if (body[k] === undefined) body[k] = v;
    });

    // הזרקת מפתח אם חסר (הגשר יכול לשלוח; Worker משלים)
    if (!body.key && !body.token) {
      body.key = apiKey;
      body.token = apiKey;
    }

    // תמיכה ב-Kapso: body כמחרוזת
    if (typeof body.body === 'string') {
      try {
        const inner = JSON.parse(body.body);
        body = { ...inner, ...body };
      } catch {
        /* ignore */
      }
    }

    try {
      const gasRes = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'follow'
      });

      const raw = await gasRes.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return json(
          {
            ok: false,
            error: 'invalid response from Apps Script',
            status: gasRes.status,
            raw: raw.slice(0, 500)
          },
          502
        );
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() }
      });
    } catch (err) {
      return json({ ok: false, error: String(err) }, 502);
    }
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}
