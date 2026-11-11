/**
 * Ituran GAS API — עצירות GPS / סיכום לוחיות
 * אין ברירות מחדל 08:00/08:30 לזמנים חסרים.
 */
import { createServerFn } from "@tanstack/react-start";
import { gasGet } from "./gas-client";
import type { GpsStop, PlateSummary } from "./ituran";

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
      at: data.at ? String(data.at) : null,
      version: data.version ? String(data.version) : undefined,
    };
  },
);

export const listIturanVisitsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ visits: import("./ituran").IturanVisit[]; at?: string }> => {
    const data = await gasGet({ action: "getIturanVisits" });
    const visits = Array.isArray(data.visits) ? data.visits : [];
    return {
      visits: visits as import("./ituran").IturanVisit[],
      at: data.at ? String(data.at) : undefined,
    };
  },
);
