import { describe, expect, it } from "vitest";
import {
  haversineKm,
  getTrafficMultiplier,
  estimateSegmentDriveMin,
  estimateWarehouseLoadMin,
  calculateRoundEta,
  detectTruckType,
  type EtaPoint,
} from "./eta";

const harash: EtaPoint = { lat: 32.1508, lng: 34.8926, isWarehouse: true };
const siteA: EtaPoint = { lat: 32.17, lng: 34.91, avgStopMin: 20 };
const siteB: EtaPoint = { lat: 32.12, lng: 34.85, avgStopMin: 25 };

/** בונה Date שמייצג שעה מקומית בישראל (חורף UTC+2) */
function atIsraelHour(hour: number, minute = 0): Date {
  // Nov 2026 → IST (UTC+2)
  const utcHour = hour - 2;
  const iso = `2026-11-14T${String(Math.max(0, utcHour)).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
  return new Date(iso);
}

describe("haversineKm", () => {
  it("returns 0 for identical points", () => {
    expect(haversineKm(harash, harash)).toBeCloseTo(0, 5);
  });

  it("returns positive finite distance between warehouse and site", () => {
    const km = haversineKm(harash, siteA);
    expect(km).toBeGreaterThan(0);
    expect(km).toBeLessThan(20);
  });
});

describe("getTrafficMultiplier", () => {
  it("applies morning peak factor (06:30–09:00 IL)", () => {
    expect(getTrafficMultiplier(atIsraelHour(7, 30))).toBeCloseTo(1.35, 2);
  });

  it("applies midday routine factor", () => {
    expect(getTrafficMultiplier(atIsraelHour(11, 0))).toBeCloseTo(1.05, 2);
  });

  it("applies afternoon peak factor (15:00–18:00 IL)", () => {
    expect(getTrafficMultiplier(atIsraelHour(16, 30))).toBeCloseTo(1.3, 2);
  });
});

describe("estimateSegmentDriveMin", () => {
  it("returns at least a few minutes for nearby sites", () => {
    const min = estimateSegmentDriveMin(harash, siteA, atIsraelHour(11), "crane");
    expect(min).toBeGreaterThanOrEqual(3);
    expect(Number.isFinite(min)).toBe(true);
  });

  it("crane is slower than or equal to flatbed on same segment/time", () => {
    const when = atIsraelHour(11);
    const crane = estimateSegmentDriveMin(harash, siteA, when, "crane");
    const flat = estimateSegmentDriveMin(harash, siteA, when, "flatbed");
    expect(crane).toBeGreaterThanOrEqual(flat);
  });
});

describe("estimateWarehouseLoadMin", () => {
  it("base load is at least 15 minutes without delay", () => {
    expect(estimateWarehouseLoadMin(0)).toBeGreaterThanOrEqual(15);
  });

  it("increases with warehouse delay percentage", () => {
    expect(estimateWarehouseLoadMin(50)).toBeGreaterThan(estimateWarehouseLoadMin(0));
  });
});

describe("detectTruckType", () => {
  it("detects hikmat / mercedes crane", () => {
    expect(detectTruckType("615-41-002", "חכמת")).toBe("crane");
  });

  it("detects isuzu flatbed", () => {
    expect(detectTruckType("651-51-701", "עלי")).toBe("flatbed");
  });
});

describe("calculateRoundEta", () => {
  it("builds a full A→B→return chain with ISO timestamps", () => {
    const now = atIsraelHour(10);
    const summary = calculateRoundEta({
      warehouse: harash,
      stops: [
        { id: "a", label: "אתר א", lat: siteA.lat, lng: siteA.lng, avgStopMin: 20 },
        { id: "b", label: "אתר ב", lat: siteB.lat, lng: siteB.lng, avgStopMin: 25 },
      ],
      now,
      truckType: "crane",
      warehouseDelayPct: 10,
    });

    expect(summary.stops.length).toBe(2);
    expect(summary.returnToWarehouseIso).toBeTruthy();
    expect(summary.totalRemainingMin).toBeGreaterThanOrEqual(0);
    expect(summary.returnDriveMin).toBeGreaterThan(0);

    for (const stop of summary.stops) {
      expect(stop.etaArrivalIso).toBeTruthy();
      expect(stop.etaFinishIso).toBeTruthy();
      expect(["pending", "in_progress", "completed"]).toContain(stop.status);
    }
  });

  it("uses remaining unload when a stop is already open (activePtoStartIso)", () => {
    const openedAt = atIsraelHour(9, 50);
    const now = atIsraelHour(10, 0); // ~10 דק׳ עברו
    const summary = calculateRoundEta({
      warehouse: harash,
      stops: [
        {
          id: "open",
          label: "פתוח עכשיו",
          lat: siteA.lat,
          lng: siteA.lng,
          avgStopMin: 30,
          activePtoStartIso: openedAt.toISOString(),
        },
      ],
      now,
      truckType: "crane",
    });

    const stop = summary.stops[0];
    expect(stop.status).toBe("in_progress");
    expect(stop.remainingUnloadMin).toBeLessThanOrEqual(30);
    expect(stop.remainingUnloadMin).toBeGreaterThanOrEqual(5);
  });
});
