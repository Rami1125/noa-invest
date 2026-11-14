/**
 * גשר שרת ← Apps Script — איתוראן
 * מקורות גיליון:
 *   getIturanVisits → טאב ביקורים_איתוראן
 *   getIturanStops  → Properties (דוח אחרון שפורסר ממייל)
 * אין ברירות מחדל 08:00/08:30 לזמנים חסרים.
 */

import { createServerFn } from "@tanstack/react-start";
import type { GpsStop, IturanVisit, PlateSummary } from "./ituran";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbwi9M5HSO9E0sZrrZ8bdKLCf5mBYPaIk-j3ZY_Mram3qkSH8pU4i-bcG2XNeZ42o3c8Og/exec";

function resolveGasUrl(): string {
  const envUrl = (process.env["GAS_URL"] || "").trim();
  return envUrl || DEFAULT_GAS_URL;
}

function apiToken(): string {
  const t = process.env["API_TOKEN"];
  if (!t) throw new Error("API_TOKEN לא מוגדר בשרת");
  return t;
}

async function gasGet(params: Record<string, string>) {
  const u = new URL(resolveGasUrl());
  for (const [k, v] of Object.entries({ ...params, token: apiToken() })) {
    u.searchParams.set(k, v);
  }
  const res = await fetch(u.toString(), { method: "GET", redirect: "follow" });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`תשובה לא תקינה מ-Apps Script (HTTP ${res.status})`);
  }
  if (data.error) throw new Error(String(data.error));
  if (data.success === false) throw new Error("הפעולה נכשלה");
  return data;
}

export const listIturanVisitsFn = createServerFn({ method: "GET" }).handler(async () => {
  const data = await gasGet({ action: "getIturanVisits" });
  return data;
});

export const listIturanStopsFn = createServerFn({ method: "GET" }).handler(async () => {
  const data = await gasGet({ action: "getIturanStops" });
  return data;
});

export const listIturanPtoFn = createServerFn({ method: "GET" })
  .inputValidator((d?: { since?: string }) => d || {})
  .handler(async ({ data }) => {
    const params: Record<string, string> = { action: "getIturanPto", since: "90" };
    if (data?.since) params.since = String(data.since);
    return gasGet(params);
  });
