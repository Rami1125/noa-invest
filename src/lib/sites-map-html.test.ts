import { describe, expect, it } from "vitest";
import {
  isValidMapCoord,
  pinSeverityFromSite,
  isSlowUnload,
  isSiteDelayBottleneck,
  delayScorePct,
  generateInteractiveMapHtml,
  buildUnloadAdvice,
  getExpectedUnloadingMinutes,
  estimateDriveMinFromWarehouse,
  haversineKm,
  WAREHOUSES,
  type MapSitePin,
} from "./sites-map-html";

function site(partial: Partial<MapSitePin> & Pick<MapSitePin, "siteKey">): MapSitePin {
  return {
    customer: "לקוח בדיקה",
    customerNo: "1234",
    address: "הרצל 10",
    city: "הוד השרון",
    lat: 32.15,
    lng: 34.89,
    hasCoords: true,
    avgStopMin: 15,
    maxStopMin: 20,
    over20: 0,
    severity: "normal",
    visits: 3,
    ...partial,
  };
}

describe("isValidMapCoord", () => {
  it("accepts coordinates inside Israel bounds", () => {
    expect(isValidMapCoord(32.15, 34.89)).toBe(true);
    expect(isValidMapCoord(31.78, 35.22)).toBe(true);
  });

  it("rejects null, zero-zero, non-finite and out-of-bounds", () => {
    expect(isValidMapCoord(null, 34.89)).toBe(false);
    expect(isValidMapCoord(32.15, undefined)).toBe(false);
    expect(isValidMapCoord(0, 0)).toBe(false);
    expect(isValidMapCoord(Number.NaN, 34.89)).toBe(false);
    expect(isValidMapCoord(40, 34.89)).toBe(false); // too north
    expect(isValidMapCoord(32.15, 30)).toBe(false); // too west
  });
});

describe("pin severity helpers", () => {
  it("maps explicit severity strings", () => {
    expect(pinSeverityFromSite(site({ severity: "critical" }))).toBe("red");
    expect(pinSeverityFromSite(site({ severity: "delayed" }))).toBe("orange");
    expect(pinSeverityFromSite(site({ severity: "normal" }))).toBe("green");
  });

  it("derives severity from avg/max/over20 when severity is empty", () => {
    expect(pinSeverityFromSite(site({ severity: "", avgStopMin: 45, maxStopMin: 70 }))).toBe("red");
    expect(pinSeverityFromSite(site({ severity: "", avgStopMin: 25, over20: 1 }))).toBe("orange");
    expect(pinSeverityFromSite(site({ severity: "", avgStopMin: 12, over20: 0 }))).toBe("green");
  });

  it("isSlowUnload / bottleneck align with severity", () => {
    const slow = site({ severity: "delayed" });
    const critical = site({ severity: "critical" });
    const ok = site({ severity: "normal" });
    expect(isSlowUnload(slow)).toBe(true);
    expect(isSlowUnload(ok)).toBe(false);
    expect(isSiteDelayBottleneck(critical)).toBe(true);
    expect(isSiteDelayBottleneck(slow)).toBe(false);
  });

  it("delayScorePct is clamped 0–100", () => {
    expect(delayScorePct(site({ avgStopMin: 0 }))).toBe(0);
    expect(delayScorePct(site({ avgStopMin: 20 }))).toBe(0);
    expect(delayScorePct(site({ avgStopMin: 40 }))).toBe(50);
    expect(delayScorePct(site({ avgStopMin: 100 }))).toBe(100);
  });
});

describe("drive / unload estimates", () => {
  it("haversine between warehouses is small positive distance", () => {
    const [a, b] = WAREHOUSES;
    const km = haversineKm(a.lat, a.lng, b.lat, b.lng);
    expect(km).toBeGreaterThan(0);
    expect(km).toBeLessThan(5);
  });

  it("estimateDriveMinFromWarehouse returns at least 5 minutes", () => {
    const min = estimateDriveMinFromWarehouse(32.08, 34.78);
    expect(min).toBeGreaterThanOrEqual(5);
    expect(Number.isFinite(min)).toBe(true);
  });

  it("getExpectedUnloadingMinutes prefers p80 then avg", () => {
    expect(getExpectedUnloadingMinutes({ p80Min: 30, avgStopMin: 20 })).toBe(30);
    expect(getExpectedUnloadingMinutes({ avgStopMin: 18 })).toBe(18);
    expect(getExpectedUnloadingMinutes({})).toBe(20);
  });

  it("buildUnloadAdvice returns mission totals and Hebrew level", () => {
    const advice = buildUnloadAdvice(
      site({ lat: 32.16, lng: 34.9, avgStopMin: 22, severity: "delayed" }),
    );
    expect(advice.levelHe).toBeTruthy();
    expect(advice.expectedMin).toBeGreaterThan(0);
    expect(advice.driveMin == null || advice.driveMin >= 5).toBe(true);
  });
});

describe("generateInteractiveMapHtml — dispatcher UX contracts", () => {
  const pins: MapSitePin[] = [
    site({
      siteKey: "s1",
      customer: "חברת בנייה אלון",
      customerNo: "9001",
      address: "התלמיד 6",
      city: "הוד השרון",
      lat: 32.1544,
      lng: 34.8886,
    }),
    site({
      siteKey: "s2",
      customer: "שיפוצי הצפון",
      customerNo: "9002",
      address: "הרצל 22",
      city: "כפר סבא",
      lat: 32.17,
      lng: 34.91,
      severity: "delayed",
      avgStopMin: 28,
    }),
  ];

  const html = generateInteractiveMapHtml(pins, undefined, "", "all", [], null, undefined);

  it("embeds customer names on pin labels (not only tooltips)", () => {
    expect(html).toContain("pin-name");
    expect(html).toContain("חברת בנייה אלון");
    expect(html).toContain("שיפוצי הצפון");
  });

  it("embeds street / city context for dispatcher identification", () => {
    expect(html).toMatch(/התלמיד 6|הרצל 22/);
    expect(html).toMatch(/הוד השרון|כפר סבא/);
  });

  it("does not enable popup autoPan (prevents zoom jump on click)", () => {
    expect(html).toContain("autoPan:false");
    expect(html).not.toMatch(/autoPan:\s*true/);
  });

  it("does not use marker clustering (click must open site, not zoom cluster)", () => {
    expect(html.toLowerCase()).not.toContain("markercluster");
    expect(html).not.toContain("zoomToBoundsOnClick");
  });

  it("posts site-pin-click to parent with site key", () => {
    expect(html).toContain("site-pin-click");
    expect(html).toContain("parent.postMessage");
  });

  it("filters invalid coordinates out of the sites payload", () => {
    const mixed = generateInteractiveMapHtml(
      [
        ...pins,
        site({ siteKey: "bad", lat: 0, lng: 0, customer: "לא אמור להופיע" }),
        site({ siteKey: "bad2", lat: null, lng: null, customer: "גם לא" }),
      ],
      undefined,
      "",
      "all",
    );
    expect(mixed).not.toContain("לא אמור להופיע");
    expect(mixed).not.toContain("גם לא");
    expect(mixed).toContain("חברת בנייה אלון");
  });

  it("fitBounds only on explicit fit / first render path (renderMarkers(true))", () => {
    // layer switch must call renderMarkers(false) — no forced zoom reset
    expect(html).toContain("renderMarkers(false)");
    expect(html).toContain("renderMarkers(true)");
  });

  it("includes live indicator and layer controls", () => {
    expect(html).toContain("חי · 30ש׳");
    expect(html).toContain('data-layer="slow"');
    expect(html).toContain('id="btn-fit"');
  });
});
