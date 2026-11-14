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
  it("applies morning peak factor", () => {
    // 07:00 Israel-ish — use explicit local Date hours
    const d = new Date(2026, 10, 14, 7, 30, 0);
    expect(getTrafficMultiplier(d)).toBeCloseTo(1.35, 2);
  });

  it("applies midday routine factor", () => {
    const d = new Date(2026, 10, 14, 11, 0, 0);
    expect(getTrafficMultiplier(d)).toBeCloseTo(1.05, 2);
  });

  it("applies afternoon peak factor", () => {
    const d = new Date(2026, 10, 14, 16, 30, 0);
    expect(getTrafficMultiplier(d)).toBeCloseTo(1.3, 2);
  });
});

describe("estimateSegmentDriveMin", () => {
  it("returns at least a few minutes for nearby sites", () => {
    const min = estimateSegmentDriveMin(harash, siteA, new Date(2026, 10, 14, 11, 0, 0), "crane");
    expect(min).toBeGreaterThanOrEqual(3);
    expect(Number.isFinite(min)).toBe(true);
  });

  it("crane is slower than flatbed on same segment/time", () => {
    const when = new Date(2026, 10, 14, 11, 0, 0);
    const crane = estimateSegmentDriveMin(harash, siteA, when, "crane");
    const flat = estimateSegmentDriveMin(harash, siteA, when, "flatbed");
    expect(crane).toBeGreaterThanOrEqual(flat);
  });
});

describe("estimateWarehouseLoadMin", () => {
  it("base load is around 15 minutes without delay", () => {
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

  it("defaults non-crane plates to flatbed", () => {
    expect(detectTruckType("651-51-701", "עלי")).toBe("flatbed");
  });
});

describe("calculateRoundEta", () => {
  it("builds a full A→B→return chain with ISO timestamps", () => {
    const now = new Date(2026, 10, 14, 10, 0, 0);
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

  it("uses remaining unload when a stop is already open (pto_open)", () => {
    const openedAt = new Date(2026, 10, 14, 9, 50, 0);
    const now = new Date(2026, 10, 14, 10, 0, 0); // 10 min already elapsed
    const summary = calculateRoundEta({
      warehouse: harash,
      stops: [
        {
          id: "open",
          label: "פתוח עכשיו",
          lat: siteA.lat,
          lng: siteA.lng,
          avgStopMin: 30,
          openedAtIso: openedAt.toISOString(),
          statusHint: "in_progress",
        },
      ],
      now,
      truckType: "crane",
    });

    const stop = summary.stops[0];
    expect(stop.status).toBe("in_progress");
    // remaining should be less than full 30 after 10 elapsed (min floor may apply)
    expect(stop.remainingUnloadMin).toBeLessThanOrEqual(30);
    expect(stop.remainingUnloadMin).toBeGreaterThanOrEqual(5);
  });
});
