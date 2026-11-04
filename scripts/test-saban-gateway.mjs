#!/usr/bin/env node
/**
 * Saban Gateway E2E test suite
 * Usage: node scripts/test-saban-gateway.mjs
 *
 * Tests:
 *  1. health
 *  2. get_inquiries_stats (Rami phone)
 *  3. get_delivery_note 6715848 (ערוגת הבשם)
 *  4. preview_order
 */

const BASE = process.env.SABAN_PROXY_URL || "https://saban-proxy.hsaban2025.workers.dev/";
const KEY = process.env.SABAN_KEY || "saban_noa_secret_key_2026_enterprise_99";
const RAMI_PHONE = "972508860896";
const NOTE = "6715848";

async function call(action, params = {}) {
  const body = { action, key: KEY, ...params };
  const t0 = Date.now();
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 400) };
  }
  return { status: res.status, ms: Date.now() - t0, data };
}

function ok(label, cond, detail) {
  const mark = cond ? "✅" : "❌";
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ""}`);
  return cond;
}

async function main() {
  console.log(`\nSaban Gateway tests → ${BASE}\n`);
  let passed = 0;
  let failed = 0;

  // 1. health
  {
    const r = await call("health");
    const good =
      r.status < 500 &&
      (r.data?.ok === true ||
        r.data?.status === "healthy" ||
        r.data?.status === "ok" ||
        !r.data?.error);
    if (ok("health", good, `HTTP ${r.status} ${r.ms}ms ${JSON.stringify(r.data).slice(0, 120)}`)) passed++;
    else failed++;
  }

  // 2. get_inquiries_stats
  {
    const r = await call("get_inquiries_stats", { phone: RAMI_PHONE });
    const good = r.status === 200 && !r.data?.error && r.data?.status !== "unauthorized";
    if (
      ok(
        "get_inquiries_stats",
        good,
        `HTTP ${r.status} ${r.ms}ms keys=${Object.keys(r.data || {}).join(",")}`,
      )
    )
      passed++;
    else failed++;
  }

  // 3. get_delivery_note 6715848
  {
    const r = await call("get_delivery_note", {
      noteNumber: NOTE,
      phone: RAMI_PHONE,
    });
    const good =
      r.status === 200 &&
      !r.data?.error &&
      (r.data?.driveLink ||
        r.data?.driveUrl ||
        r.data?.customerName ||
        r.data?.filename ||
        r.data?.noteNumber);
    if (
      ok(
        `get_delivery_note ${NOTE}`,
        good,
        `HTTP ${r.status} ${r.ms}ms customer=${r.data?.customerName || r.data?.customer || "?"} drive=${Boolean(r.data?.driveLink || r.data?.driveUrl)}`,
      )
    )
      passed++;
    else {
      console.log("   body:", JSON.stringify(r.data).slice(0, 300));
      failed++;
    }
  }

  // 4. preview_order
  {
    const itemsJson = JSON.stringify([{ sku: "10002", qty: 40 }]);
    const r = await call("preview_order", { itemsJson });
    const good = r.status === 200 && !r.data?.error && r.data?.status !== "unauthorized";
    if (
      ok(
        "preview_order",
        good,
        `HTTP ${r.status} ${r.ms}ms weight=${r.data?.totalWeightTons ?? r.data?.weightTons ?? r.data?.weightKg ?? "?"}`,
      )
    )
      passed++;
    else {
      console.log("   body:", JSON.stringify(r.data).slice(0, 300));
      failed++;
    }
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("Suite crashed:", e);
  process.exit(2);
});
