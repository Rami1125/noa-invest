/**
 * Regression tests — Creative Engine QA & Command Validation
 */
import { describe, it, expect } from "vitest";
import {
  evaluateCreativeQa,
  buildApprovedCommand,
  verifyCopyIntegrity,
  detectMasterContradictions,
  extractNumericSources,
  runRegressionSuite,
  ENGINE_QA_PROFILES,
  computeScore,
  type QaCheckItem,
} from "./qa-engine";
import type { PromptAssemblyInput } from "./prompt-engine";
import { DEFAULT_MASTER_INSTRUCTIONS } from "./master-instructions";

function baseInput(overrides: Partial<PromptAssemblyInput> = {}): PromptAssemblyInput {
  return {
    masterInstructions: DEFAULT_MASTER_INSTRUCTIONS || "MASTER RTL עברית אמינות צילום אמיתי",
    masterVersion: "v2026.1-approved",
    styleText: "PREMIUM ARCHITECTURAL EDITORIAL RTL",
    outputType: "slides",
    slideCount: 10,
    goal: "הצגת ניתוח רכש מקצועי לצוות המכירות",
    targetAudience: "קבלנים ומנהלי פרויקטים",
    userRequest: "התמקד במוצרים מובילים מהארכיון",
    verifiedData: {
      kpiLine: "KPI: מקטים 12 · תעודות 40 · לקוחות 8",
      analysisLines: ["כיסוי: 32/40 (80%)"],
      topProductsLines: ["1. מלט (10001): 120"],
      topCustomersLines: ["- לקוח א: 50"],
      focusTitle: "",
      focusBody: "",
      hasRealSheetData: true,
      hasTechnicalSources: false,
      sourceTab: "ארכיון_תעודות_גליה",
      dictTab: "מילון_לוגיסט",
    },
    media: [],
    imageNote: "",
    ...overrides,
  };
}

describe("ENGINE_QA_PROFILES", () => {
  it("defines all 7 engines", () => {
    expect(Object.keys(ENGINE_QA_PROFILES)).toHaveLength(7);
  });
});

describe("evaluateCreativeQa", () => {
  it("returns score and checks", () => {
    const report = evaluateCreativeQa(baseInput());
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.checks.length).toBeGreaterThan(5);
  });

  it("blocks copy when master invalid", () => {
    const report = evaluateCreativeQa(baseInput({ masterInstructions: "x", masterVersion: "bad" }));
    expect(report.checks.some((c) => c.id === "master" && !c.passed)).toBe(true);
    expect(report.canCopy).toBe(false);
  });

  it("runs all seven engines", () => {
    for (const engineId of Object.keys(ENGINE_QA_PROFILES) as Array<keyof typeof ENGINE_QA_PROFILES>) {
      const report = evaluateCreativeQa(baseInput({ outputType: engineId }));
      expect(report.engineLabel).toBeTruthy();
      expect(report.checks.length).toBeGreaterThan(2);
    }
  });
});

describe("detectMasterContradictions", () => {
  it("detects invent-data requests", () => {
    const issues = detectMasterContradictions("אמינות", "תמציא מקטים", "מטרה");
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe("extractNumericSources", () => {
  it("lists KPI with source", () => {
    const sources = extractNumericSources(baseInput());
    expect(sources.some((s) => s.field === "KPI")).toBe(true);
  });
});

describe("Copy Integrity", () => {
  it("matches approved hash", () => {
    const report = evaluateCreativeQa(baseInput());
    if (report.approvedPromptHash) {
      expect(verifyCopyIntegrity(report.approvedPromptHash, report.assembled.finalPrompt).matches).toBe(true);
      expect(verifyCopyIntegrity(report.approvedPromptHash, "x").matches).toBe(false);
    }
  });
});

describe("computeScore", () => {
  it("100 when all pass", () => {
    const checks: QaCheckItem[] = [
      { id: "a", label: "a", passed: true, detail: "", severity: "critical", weight: 20, category: "common" },
      { id: "b", label: "b", passed: true, detail: "", severity: "major", weight: 12, category: "engine" },
    ];
    expect(computeScore(checks)).toBe(100);
  });
});

describe("runRegressionSuite", () => {
  it("covers required scenarios", () => {
    const results = runRegressionSuite((o) => baseInput(o));
    expect(results.length).toBeGreaterThanOrEqual(7);
    expect(results.map((r) => r.name).join(" ")).toMatch(/נתונים חסרים|7 המנועים/);
  });
});
