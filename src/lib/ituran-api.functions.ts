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
  "https://script.google.com/macros/s/AKfycbyv4x_fGMkWmjOLujRymJITBoGQpnbIbJnZp4S9nNs6sacQb1g7x8vyHjaCw6y_t7Pxiw/exec";

const BROKEN_GAS_MARKERS = [
  "TwXhw",
  "AKfycbyv4x_fGMkWmjOLujRymJITBoGQpnbIbJnZp4S9nNs6sacQb1g7x8vyHjaCw6y_t7Pxiw",
];

function gasUrl(): string {
  const envUrl = process.env["GAS_URL"];
  if (envUrl && BROKEN_GAS_MARKERS.some((m) => envUrl.includes(m))) {
    return DEFAULT_GAS_URL;
  }
  return envUrl || DEFAULT_GAS_URL;
}

function apiToken(): string {
  const t = process.env["API_TOKEN"];
  if (!t) throw new Error("API_TOKEN לא מוגדר בשרת");
  return t;
}

async function gasGet(params: Record<string, string>) {
  const u = new URL(gasUrl());
  for (const [k, v] of Object.entries({ ...params, token: apiToken() })) {
    u.searchParams.set(k, v);
  }
  const res = await fetch(u.toString(), { method: "GET", redirect: "follow" });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `תשובה לא תקינה מ-Apps Script (HTTP ${res.status}): ${text.slice(0, 180)}`,
    );
  }
  if (data.success === false) {
    throw new Error(String(data.error || "הפעולה נכשלה"));
  }
  return data;
}

export const listIturanVisitsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ visits: IturanVisit[]; version?: string }> => {
    const data = await gasGet({ action: "getIturanVisits" });
    const visits = Array.isArray(data.visits) ? (data.visits as IturanVisit[]) : [];
    return { visits, version: data.version as string | undefined };
  },
);

export const listIturanStopsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    stops: GpsStop[];
    pto: unknown[];
    plateSummary: PlateSummary[];
    at: string | null;
    version?: string;
  }> => {
    const data = await gasGet({ action: "getIturanStops" });
    const rawStops = Array.isArray(data.stops) ? data.stops : [];
    const stops: GpsStop[] = rawStops.map((s: any) => {
      const start = String(s.start || s.arrive || "");
      const end = String(s.end || s.depart || "");
      const arrive =
        start.match(/\d{1,2}:\d{2}/)?.[0] ||
        (start.includes("T") ? start.slice(11, 16) : "") ||
        "";
      const depart =
        end.match(/\d{1,2}:\d{2}/)?.[0] ||
        (end.includes("T") ? end.slice(11, 16) : "") ||
        "";
      return {
        plate: String(s.plate || ""),
        address: String(s.addr || s.address || ""),
        arrive,
        depart,
        driver: String(s.driver || ""),
        durationMin: typeof s.min === "number" ? s.min : undefined,
      };
    });
    return {
      stops,
      pto: Array.isArray(data.pto) ? data.pto : [],
      plateSummary: Array.isArray(data.plateSummary)
        ? (data.plateSummary as PlateSummary[])
        : [],
      at: (data.at as string) || null,
      version: data.version as string | undefined,
    };
  },
);

export const pollIturanNowFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ success: boolean; imported?: boolean; message?: string }> => {
    const data = await gasGet({ action: "pollIturanNow" });
    return {
      success: Boolean(data.success),
      imported: Boolean(data.imported),
      message: String(data.message || ""),
    };
  },
);
