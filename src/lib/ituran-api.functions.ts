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
  "https://script.google.com/macros/s/AKfycbzGOG7GxiXkT-OtUw4obBvGkyw_wKRhv2Jjf4I8qbLATIIMKAN099UHJqqYjdfKV-WwWw/exec";

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
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`תשובה ריקה מ-Apps Script (HTTP ${res.status})`);
  }
  if (/^<!DOCTYPE html/i.test(trimmed) || /^<html/i.test(trimmed)) {
    throw new Error(
      `Apps Script החזיר HTML במקום JSON (HTTP ${res.status}) — בדוק פריסת Web App / הרשאות`,
    );
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(trimmed);
  } catch {
    throw new Error(
      `תשובה לא תקינה מ-Apps Script (HTTP ${res.status}, תחילת גוף: ${trimmed.slice(0, 80)})`,
    );
  }
  if (data.error) throw new Error(String(data.error));
  if (data.success === false) {
    throw new Error(String(data.message || data.error || "הפעולה נכשלה"));
  }
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
