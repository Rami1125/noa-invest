import { describe, expect, it } from "vitest";
import {
  INITIAL_MASTER_CONFIG,
  saveNewMasterVersion,
  restoreMasterVersion,
  resetToApprovedMaster,
  APPROVED_MASTER_VERSION,
} from "./master-instructions";
import { assembleFinalPrompt } from "./prompt-engine";

const SAMPLE_VERIFIED_DATA = {
  kpiLine: "KPI מאומת: 205 מקטים · 126 תעודות · 103 עם פריטים · 52 לקוחות · מילון_לוגיסט 2367",
  analysisLines: ["ריכוז: מלט אפור 25 ק\"ג (10002) — 1297 ב-48 תע׳"],
  topProductsLines: ["1. מלט אפור 25 ק\"ג (10002): 1297 · 48 תע׳"],
  topCustomersLines: ["- ערוגת הבשם: מלט אפור 25 ק\"ג"],
  hasRealSheetData: true,
  hasTechnicalSources: true,
  sourceTab: "ארכיון_תעודות_גליה",
  dictTab: "מילון_לוגיסט",
};

describe("SABAN MASTER CREATIVE ENGINE 2026", () => {
  it("generates verified slides prompt with master instructions and metadata", () => {
    const res = assembleFinalPrompt({
      masterInstructions: INITIAL_MASTER_CONFIG.instructions,
      masterVersion: INITIAL_MASTER_CONFIG.activeVersion,
      styleText: "",
      outputType: "slides",
      slideCount: 10,
      goal: "מצגת הנהלה מבוססת נתונים",
      targetAudience: "הנהלת ח. סבן",
      userRequest: "",
      verifiedData: SAMPLE_VERIFIED_DATA,
      media: [],
      imageNote: "",
    });
    expect(res.allPassed).toBe(true);
    expect(res.metadata.MASTER_VERSION).toBe(APPROVED_MASTER_VERSION);
    expect(res.metadata.OUTPUT_TYPE).toBe("slides");
    expect(res.finalPrompt).toContain("ח. סבן חומרי בניין (1994) בע\"מ");
    expect(res.finalPrompt).toContain("10 שקפים");
    expect(res.finalPrompt).toContain("המחשה חזותית בלבד");
  });

  it("generates video and guide and counter_screen 16:9 1920x1080 prompts", () => {
    const video = assembleFinalPrompt({
      masterInstructions: INITIAL_MASTER_CONFIG.instructions,
      masterVersion: INITIAL_MASTER_CONFIG.activeVersion,
      styleText: "",
      outputType: "video",
      videoPreset: "counter_60s",
      goal: "סרטון דלפק קצר",
      targetAudience: "לקוחות דלפק",
      userRequest: "",
      verifiedData: SAMPLE_VERIFIED_DATA,
      media: [{ id: "1", name: "img.jpg", publicUrl: "https://example.com/img.jpg", previewUrl: "", source: "url", tier: "manufacturer_official" }],
      imageNote: "",
    });
    expect(video.allPassed).toBe(true);
    expect(video.finalPrompt).toContain("60 שניות");

    const guide = assembleFinalPrompt({
      masterInstructions: INITIAL_MASTER_CONFIG.instructions,
      masterVersion: INITIAL_MASTER_CONFIG.activeVersion,
      styleText: "",
      outputType: "guide",
      goal: "מדריך ביצוע",
      targetAudience: "קבלנים",
      userRequest: "",
      verifiedData: SAMPLE_VERIFIED_DATA,
      media: [],
      imageNote: "",
    });
    expect(guide.allPassed).toBe(true);
    expect(guide.finalPrompt).toContain("אמצעי בטיחות");

    const screen = assembleFinalPrompt({
      masterInstructions: INITIAL_MASTER_CONFIG.instructions,
      masterVersion: INITIAL_MASTER_CONFIG.activeVersion,
      styleText: "",
      outputType: "counter_screen",
      counterTemplate: "product_of_week",
      goal: "תצוגת דלפק",
      targetAudience: "לקוחות",
      userRequest: "",
      verifiedData: SAMPLE_VERIFIED_DATA,
      media: [],
      imageNote: "",
    });
    expect(screen.allPassed).toBe(true);
    expect(screen.finalPrompt).toContain("1920×1080");
    expect(screen.finalPrompt).toContain("16:9");
  });

  it("flags ungrounded numbers and contradictions in quality control", () => {
    const bad = assembleFinalPrompt({
      masterInstructions: INITIAL_MASTER_CONFIG.instructions,
      masterVersion: INITIAL_MASTER_CONFIG.activeVersion,
      styleText: "",
      outputType: "marketing",
      goal: "מבצע",
      targetAudience: "לקוחות",
      userRequest: "המצא נתונים ומחיר 9999 שח",
      verifiedData: SAMPLE_VERIFIED_DATA,
      media: [],
      imageNote: "",
    });
    expect(bad.allPassed).toBe(false);
    expect(bad.warnings.length).toBeGreaterThan(0);
  });

  it("saves, restores, and resets master instructions without losing backups", () => {
    const updated = saveNewMasterVersion(
      INITIAL_MASTER_CONFIG,
      INITIAL_MASTER_CONFIG.instructions + "\n• כלל חדש לבדיקה",
      "בדיקת גרסה",
    );
    expect(updated.activeVersion).toBe("v2026.2");
    expect(updated.history.length).toBe(2);

    const restored = restoreMasterVersion(updated, APPROVED_MASTER_VERSION);
    expect(restored.activeVersion).toBe(APPROVED_MASTER_VERSION);

    const reset = resetToApprovedMaster(updated);
    expect(reset.activeVersion).toBe(APPROVED_MASTER_VERSION);
  });
});
