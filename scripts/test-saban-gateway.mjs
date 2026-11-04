#!/usr/bin/env node
/**
 * End-to-end smoke tests for the Saban Gateway.
 *
 * Usage:
 *   SABAN_GATEWAY_KEY='...' node scripts/test-saban-gateway.mjs
 * Optional:
 *   SABAN_GATEWAY_URL='https://saban-proxy.../' SABAN_GATEWAY_PHONE='972...' node ...
 *
 * This script intentionally does not print the secret.
 */
const endpoint = process.env.SABAN_GATEWAY_URL || "https://saban-proxy.hsaban2025.workers.dev/";
const key = process.env.SABAN_GATEWAY_KEY;
const phone = process.env.SABAN_GATEWAY_PHONE || "972508860896";

if (!key) {
  console.error("FAIL: define SABAN_GATEWAY_KEY in the environment.");
  process.exit(2);
}

const checks = [
  ["health", { action: "health" }],
  ["get_inquiries_stats", { action: "get_inquiries_stats", phone }],
  ["get_delivery_note", { action: "get_delivery_note", noteNumber: "6715848", phone }],
  ["preview_order", {
    action: "preview_order",
    itemsJson: JSON.stringify([{ sku: "10002", qty: 40 }]),
  }],
];

async function runCheck(name, params) {
  const started = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, key }),
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`HTTP ${response.status}; non-JSON: ${raw.slice(0, 160)}`);
    }
    const ok = response.ok && data?.success !== false && !data?.error;
    console.log(`${ok ? "PASS" : "FAIL"} ${name} — HTTP ${response.status} — ${Date.now() - started}ms`);
    if (!ok) console.error("  ", data.error || data.message || JSON.stringify(data).slice(0, 300));
    return ok;
  } catch (error) {
    console.log(`FAIL ${name} — ${Date.now() - started}ms`);
    console.error("  ", error instanceof Error ? error.message : error);
    return false;
  }
}

const results = [];
for (const [name, params] of checks) results.push(await runCheck(name, params));

console.log(`\nResult: ${results.filter(Boolean).length}/${results.length} passed`);
if (results.some((ok) => !ok)) process.exitCode = 1;
