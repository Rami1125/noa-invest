/**
 * Unit tests — SABAN MASTER CREATIVE ENGINE prompt builder
 */
import { describe, it, expect } from "vitest";
import { buildFinalPrompt } from "./prompt-engine";
import { MASTER_VERSION, runQualityChecks, isPromptVerified } from "./master";

describe("buildFinalPrompt", () => {
  it("includes MASTER_VERSION and output type", () => {
    const result = buildFinalPrompt({
      outputType: "presentation",
      focusKind: "none",
      verifiedDataBlock: "KPI: מקטים 5 · תעודות 10",
      analysisPoints: ["כיסוי: 8/10 (80%)"],
      media: [],
      imageNote: "",
      kpiLine: "KPI: מקטים 5",
    });
    expect(result.prompt).toContain("MASTER_VERSION");
    expect(result.prompt).toContain("presentation");
    expect(result.prompt).toContain("SABAN MASTER CREATIVE ENGINE");
    expect(result.meta.OUTPUT_TYPE).toBe("presentation");
    expect(result.meta.MASTER_VERSION).toBeTruthy();
  });

  it("injects product focus data", () => {
    const result = buildFinalPrompt({
      outputType: "guide",
      focusKind: "product",
      productSku: "60002",
      productName: "בלה פקדון",
      verifiedDataBlock: "מוצר: בלה פקדון · מק״ט: 60002",
      analysisPoints: [],
      media: [],
      imageNote: "",
    });
    expect(result.prompt).toContain("60002");
    expect(result.prompt).toContain("בלה פקדון");
    expect(result.prompt).toContain("מדריך מקצועי");
  });

  it("marks media context when empty", () => {
    const result = buildFinalPrompt({
      outputType: "video",
      focusKind: "none",
      verifiedDataBlock: "data",
      analysisPoints: [],
      media: [],
      imageNote: "",
    });
    expect(result.meta.MEDIA_CONTEXT).toMatch(/אין תמונות|אין/);
  });
});

describe("quality checks", () => {
  it("fails when master missing", () => {
    const checks = runQualityChecks({
      hasGoal: true,
      hasAudience: true,
      hasMaster: false,
      hasRealData: true,
      mediaLabeled: true,
      rtlDefined: true,
      formatOk: true,
      noContradictions: true,
      noUnsourcedNumbers: true,
      noUnverifiedClaims: true,
    });
    expect(isPromptVerified(checks)).toBe(false);
    expect(checks.find((c) => c.id === "master")?.pass).toBe(false);
  });

  it("passes full clean set", () => {
    const checks = runQualityChecks({
      hasGoal: true,
      hasAudience: true,
      hasMaster: true,
      hasRealData: true,
      mediaLabeled: true,
      rtlDefined: true,
      formatOk: true,
      noContradictions: true,
      noUnsourcedNumbers: true,
      noUnverifiedClaims: true,
    });
    expect(isPromptVerified(checks)).toBe(true);
  });
});
