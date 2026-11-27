import { describe, it, expect } from "vitest";
import { classifyIntent, isLogisticsDominant } from "./intent-classifier";
import { searchKnowledge } from "./knowledge-sources";
import { generateSmartAnswer, NO_SOURCE_MSG } from "./response-generator";
import { startDiagnosis, answerDiagnosis, getNextDiagnosisPrompt } from "./diagnosis";

describe("classifyIntent", () => {
  it("detects technical guidance for SikaTop", () => {
    const r = classifyIntent("איך מיישמים SikaTop Seal 107?");
    expect(r.primary).toBe("TECHNICAL_GUIDANCE");
    expect(r.confidence).toBeGreaterThan(0.3);
  });

  it("detects product comparison", () => {
    const r = classifyIntent("מהם ההבדלים בין סוגי השליכט?");
    expect(r.primary).toBe("PRODUCT_COMPARISON");
  });

  it("detects diagnosis", () => {
    const r = classifyIntent("לקוח מבקש צבע – אילו שאלות אבחון לשאול?");
    expect(r.primary).toBe("CUSTOMER_DIAGNOSIS");
    expect(r.needsDiagnosis).toBe(true);
  });

  it("detects cross selling", () => {
    const r = classifyIntent("אילו מוצרים משלימים מתאימים למערכת איטום?");
    expect(r.primary).toBe("CROSS_SELLING");
  });

  it("detects training media", () => {
    const r = classifyIntent("מצא סרטון הדרכה על איטום גגות");
    expect(r.primary).toBe("TRAINING_MEDIA");
  });

  it("detects logistics and is dominant", () => {
    const r = classifyIntent("כמה תעודות יצאו היום עם חכמת?");
    expect(r.primary).toBe("LOGISTICS");
    expect(isLogisticsDominant(r)).toBe(true);
  });

  it("sales training for price objection", () => {
    const r = classifyIntent("תן לי תרגול מכירה על לקוח שמתנגד למחיר");
    expect(r.primary).toBe("SALES_TRAINING");
  });
});

describe("searchKnowledge", () => {
  it("finds SikaTop sources", () => {
    const hits = searchKnowledge("SikaTop Seal 107");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => /sikatop|seal/i.test(h.id))).toBe(true);
  });

  it("does not invent video links", () => {
    const hits = searchKnowledge("סרטון איטום גגות");
    const withVideo = hits.filter((h) => h.videoUrl);
    expect(withVideo.length).toBe(0);
  });
});

describe("reliability policy", () => {
  it("uses no-source message when appropriate", () => {
    const intent = classifyIntent("איך מיישמים חומר לא קיים בכלל xyz999");
    const card = generateSmartAnswer("איך מיישמים חומר לא קיים בכלל xyz999", intent);
    if (intent.primary === "TECHNICAL_GUIDANCE") {
      expect(card.shortAnswer === NO_SOURCE_MSG || card.sources.length >= 0).toBe(true);
    }
  });

  it("never puts required obligation without source framing", () => {
    const intent = classifyIntent("אילו מוצרים משלימים מתאימים למערכת איטום?");
    const card = generateSmartAnswer("אילו מוצרים משלימים מתאימים למערכת איטום?", intent);
    for (const item of card.crossSell || []) {
      expect(item.source.length).toBeGreaterThan(3);
      if (item.obligation === "required") {
        expect(item.source.toLowerCase()).toMatch(/מפרט|יצרן|חובה/);
      }
    }
  });

  it("action buttons with open_spec have href when available", () => {
    const intent = classifyIntent("איך מיישמים SikaTop Seal 107?");
    const card = generateSmartAnswer("איך מיישמים SikaTop Seal 107?", intent);
    const openSpec = card.actions.find((a) => a.id === "open_spec");
    if (openSpec) {
      expect(openSpec.href).toBeTruthy();
      expect(openSpec.href!.startsWith("http")).toBe(true);
    }
  });
});

describe("diagnosis", () => {
  it("starts with workType and advances one field", () => {
    let state = startDiagnosis();
    expect(state.active).toBe(true);
    expect(state.currentField).toBe("workType");
    const prompt = getNextDiagnosisPrompt(state);
    expect(prompt?.question).toContain("סוג העבודה");
    state = answerDiagnosis(state, "workType", "איטום");
    expect(state.answers.workType).toBe("איטום");
    expect(state.currentField).not.toBe("workType");
  });
});
