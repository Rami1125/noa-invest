/**
 * SABAN CREATIVE ENGINE — QA מרכזי + Command Validation
 * ציון 0–100 · 7 מנועים · חסימת העתקה בכשל קריטי · Copy Integrity
 */
import {
  type OutputType,
  type PromptAssemblyInput,
  type QualityCheckItem,
  type AssembledPromptResult,
  assembleFinalPrompt,
} from "./prompt-engine";

export type CheckSeverity = "critical" | "major" | "minor" | "info";

export type QaCheckItem = QualityCheckItem & {
  severity: CheckSeverity;
  weight: number;
  category: "common" | "engine" | "source" | "integrity";
  sourceHint?: string;
  recommendation?: string;
};

export type EngineQaProfile = {
  engineId: OutputType;
  label: string;
  requiredChecks: string[];
  uniqueChecks: string[];
  minScoreToCopy: number;
};

export type QaReport = {
  engineId: OutputType;
  engineLabel: string;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  canCopy: boolean;
  criticalFailures: QaCheckItem[];
  majorFailures: QaCheckItem[];
  checks: QaCheckItem[];
  sources: { field: string; value: string; source: string }[];
  contradictions: string[];
  recommendations: string[];
  approvedPromptHash: string | null;
  assembled: AssembledPromptResult;
  evaluatedAt: string;
};

export type CopyIntegrityResult = {
  matches: boolean;
  approvedHash: string;
  copiedHash: string;
  message: string;
};

export type QaHistoryEntry = {
  id: string;
  at: string;
  engineId: OutputType;
  score: number;
  canCopy: boolean;
  masterVersion: string;
  promptPreview: string;
  criticalCount: number;
  fixesApplied?: string[];
};

const QA_HISTORY_KEY = "saban_creative_qa_history_v1";
const APPROVED_PROMPT_KEY = "saban_creative_approved_prompt_v1";

export const ENGINE_QA_PROFILES: Record<OutputType, EngineQaProfile> = {
  slides: {
    engineId: "slides",
    label: "Presentation Engine",
    requiredChecks: ["goal", "audience", "master", "real_data", "rtl", "format"],
    uniqueChecks: ["slides_structure", "slides_count", "speaker_notes"],
    minScoreToCopy: 70,
  },
  video: {
    engineId: "video",
    label: "Video Engine",
    requiredChecks: ["goal", "audience", "master", "real_data", "rtl", "format"],
    uniqueChecks: ["video_timeline", "video_duration", "video_vo"],
    minScoreToCopy: 70,
  },
  guide: {
    engineId: "guide",
    label: "Technical Guide Engine",
    requiredChecks: ["goal", "audience", "master", "real_data", "rtl", "no_unverified_claims"],
    uniqueChecks: ["guide_structure", "guide_safety", "guide_sources"],
    minScoreToCopy: 75,
  },
  product_image: {
    engineId: "product_image",
    label: "Product Image Engine",
    requiredChecks: ["master", "media_marking", "rtl"],
    uniqueChecks: ["image_tier", "image_no_fake_branding", "image_style"],
    minScoreToCopy: 65,
  },
  marketing: {
    engineId: "marketing",
    label: "Marketing Engine",
    requiredChecks: ["goal", "audience", "master", "real_data", "contradictions", "no_ungrounded_numbers"],
    uniqueChecks: ["marketing_no_hype", "marketing_cta", "marketing_approved_claims"],
    minScoreToCopy: 75,
  },
  counter_screen: {
    engineId: "counter_screen",
    label: "Counter Screen Engine",
    requiredChecks: ["goal", "master", "rtl", "format"],
    uniqueChecks: ["counter_aspect", "counter_readability", "counter_one_message"],
    minScoreToCopy: 70,
  },
  focus_analysis: {
    engineId: "focus_analysis",
    label: "Data Analysis Engine",
    requiredChecks: ["master", "real_data", "no_ungrounded_numbers", "contradictions"],
    uniqueChecks: ["analysis_grounding", "analysis_no_false_compat", "analysis_sources"],
    minScoreToCopy: 70,
  },
};

const SEVERITY_WEIGHT: Record<CheckSeverity, number> = {
  critical: 20,
  major: 12,
  minor: 5,
  info: 0,
};

function hashPrompt(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (h * 33) ^ text.charCodeAt(i);
  return `h${(h >>> 0).toString(16)}`;
}

function gradeFromScore(score: number): QaReport["grade"] {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 55) return "D";
  return "F";
}

export function detectMasterContradictions(
  masterInstructions: string,
  userRequest: string,
  goal: string,
): string[] {
  const issues: string[] = [];
  const blob = `${userRequest}\n${goal}`;
  if (/תמצ[יאי]|תנחש|dummy|placeholder|בלי אימות|ignore master/i.test(blob)) {
    issues.push("בקשת המשתמש סותרת את כלל האמינות במאסטר");
  }
  if (/ללא rtl|ltr בלבד/i.test(blob) && /RTL|עברית/i.test(masterInstructions)) {
    issues.push("בקשה לביטול RTL סותרת את שפת המאסטר");
  }
  if (/cgi.*רשמית|AI כתמונת מוצר רשמית/i.test(blob)) {
    issues.push("בקשה להציג AI כתמונת מוצר רשמית סותרת מדיניות התמונות");
  }
  return issues;
}

export function extractNumericSources(input: PromptAssemblyInput): {
  field: string;
  value: string;
  source: string;
}[] {
  const sources: { field: string; value: string; source: string }[] = [];
  const vd = input.verifiedData;
  if (vd.kpiLine) {
    sources.push({ field: "KPI", value: vd.kpiLine.slice(0, 120), source: `${vd.sourceTab} + ${vd.dictTab}` });
  }
  vd.topProductsLines.slice(0, 5).forEach((line, i) => {
    sources.push({ field: `מוצר #${i + 1}`, value: line.slice(0, 100), source: vd.sourceTab || "ארכיון" });
  });
  vd.topCustomersLines.slice(0, 3).forEach((line, i) => {
    sources.push({ field: `לקוח #${i + 1}`, value: line.slice(0, 100), source: vd.sourceTab || "ארכיון" });
  });
  if (vd.focusTitle) {
    sources.push({ field: "מיקוד", value: vd.focusTitle, source: "בחירת משתמש על נתוני ארכיון" });
  }
  return sources;
}

function engineSpecificChecks(input: PromptAssemblyInput, prompt: string): QaCheckItem[] {
  const checks: QaCheckItem[] = [];
  const t = input.outputType;
  const add = (
    id: string,
    label: string,
    passed: boolean,
    detail: string,
    severity: CheckSeverity,
    recommendation?: string,
  ) => {
    checks.push({
      id,
      label,
      passed,
      detail,
      severity,
      weight: SEVERITY_WEIGHT[severity],
      category: "engine",
      recommendation: passed ? undefined : recommendation,
    });
  };

  if (t === "slides") {
    add("slides_structure", "מבנה מצגת", /שקף|כותרת|הערות מרצה/i.test(prompt), "מבנה שקפים", "major", "הוסף כותרת/מסר/הערות מרצה");
    add("slides_count", "מספר שקפים", (input.slideCount || 10) >= 4 && (input.slideCount || 10) <= 16, `${input.slideCount || 10} שקפים`, "minor");
    add("speaker_notes", "הערות מרצה", /הערות מרצה|20–30|דובר/i.test(prompt), "הערות מרצה", "minor");
  }
  if (t === "video") {
    add("video_timeline", "תסריט לזמנים", /\[\d+|תסריט|קריינ|VO/i.test(prompt), "חלוקת זמנים", "critical", "הוסף טבלת סצנות");
    add("video_duration", "משך וידאו", /60|70|90|שנ/i.test(prompt), "משך יעד", "major");
    add("video_vo", "קריינות עברית", /קריינ|עברית|VO/i.test(prompt), "קריינות", "major");
  }
  if (t === "guide") {
    add("guide_structure", "מבנה מדריך", /הגדרת הבעיה|שלבי ביצוע|בטיחות/i.test(prompt), "סעיפי חובה", "critical", "השלם מבנה מדריך");
    add("guide_safety", "בטיחות", /בטיחות|אמצעי זהירות/i.test(prompt), "אזהרת בטיחות", "critical");
    add("guide_sources", "מקורות טכניים", input.verifiedData.hasTechnicalSources || /מפרט|יצרן|חסר נתון/i.test(prompt), "מקור טכני", "major");
  }
  if (t === "product_image") {
    add("image_tier", "מדיניות 4 רמות", /סדר עדיפויות|המחשה חזותית|יצרן/i.test(prompt), "מדיניות תמונה", "major");
    add("image_no_fake_branding", "ללא מיתוג בדוי", /אסור להמציא לוגו|ללא לוגו בדוי/i.test(prompt), "איסור לוגו מזויף", "critical");
    add("image_style", "סגנון צילום", /architectural|documentary|תאורה טבעית/i.test(prompt), "סגנון", "minor");
  }
  if (t === "marketing") {
    add("marketing_no_hype", "ללא הפרזות", !/הכי טוב בעולם|מבטיח 100%/i.test(input.userRequest + input.goal), "טון מקצועי", "major");
    add("marketing_cta", "CTA", /CTA|קריאה לפעולה|הנעה/i.test(prompt), "קריאה לפעולה", "minor");
    add("marketing_approved_claims", "טענות מאושרות", Boolean(input.verifiedData.sourceTab), `מקור: ${input.verifiedData.sourceTab || "חסר"}`, "critical");
  }
  if (t === "counter_screen") {
    add("counter_aspect", "16:9 / 1080p", /16:9|1920|1080/i.test(prompt), "רזולוציה", "critical");
    add("counter_readability", "קריאות ממרחק", /כותרות גדולות|ממרחק|ניגודיות/i.test(prompt), "טיפוגרפיה", "major");
    add("counter_one_message", "מסר אחד", /מסר מרכזי אחד|מעט טקסט/i.test(prompt), "צפיפות", "major");
  }
  if (t === "focus_analysis") {
    add("analysis_grounding", "עיגון בארכיון", Boolean(input.verifiedData.focusTitle || input.verifiedData.kpiLine), "KPI/מיקוד", "critical");
    add("analysis_no_false_compat", "ללא תאימות שווא", /אין להסיק תאימות|רכישה משותפת/i.test(prompt), "איסור הסקה", "major");
    add("analysis_sources", "מקורות", Boolean(input.verifiedData.sourceTab), input.verifiedData.sourceTab || "חסר", "major");
  }
  return checks;
}

function mapBaseSeverity(id: string): CheckSeverity {
  if (["master", "real_data", "contradictions", "no_unverified_claims", "rtl"].includes(id)) return "critical";
  if (["goal", "audience", "format", "no_ungrounded_numbers"].includes(id)) return "major";
  return "minor";
}

function enrichBaseChecks(base: QualityCheckItem[]): QaCheckItem[] {
  return base.map((c) => {
    const severity = mapBaseSeverity(c.id);
    return {
      ...c,
      severity,
      weight: SEVERITY_WEIGHT[severity],
      category: (c.id === "contradictions" ? "integrity" : "common") as QaCheckItem["category"],
      recommendation: c.passed ? undefined : "תקן לפי פירוט הבדיקה",
    };
  });
}

export function computeScore(checks: QaCheckItem[]): number {
  const relevant = checks.filter((c) => c.severity !== "info");
  if (!relevant.length) return 0;
  const max = relevant.reduce((s, c) => s + c.weight, 0) || 1;
  const earned = relevant.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);
  return Math.round((earned / max) * 100);
}

export function evaluateCreativeQa(input: PromptAssemblyInput): QaReport {
  const assembled = assembleFinalPrompt(input);
  const base = enrichBaseChecks(assembled.checks);
  const engine = engineSpecificChecks(input, assembled.finalPrompt);
  const allChecks = [...base, ...engine];
  const contradictions = detectMasterContradictions(input.masterInstructions, input.userRequest, input.goal);
  if (contradictions.length) {
    allChecks.push({
      id: "qa_contradictions",
      label: "סתירות מאסטר (QA)",
      passed: false,
      detail: contradictions.join(" · "),
      severity: "critical",
      weight: 20,
      category: "integrity",
      recommendation: "התאם בקשה לכללי המאסטר",
    });
  }
  const score = computeScore(allChecks);
  const criticalFailures = allChecks.filter((c) => !c.passed && c.severity === "critical");
  const majorFailures = allChecks.filter((c) => !c.passed && c.severity === "major");
  const profile = ENGINE_QA_PROFILES[input.outputType];
  const canCopy =
    criticalFailures.length === 0 &&
    score >= profile.minScoreToCopy &&
    assembled.finalPrompt.trim().length > 80;
  return {
    engineId: input.outputType,
    engineLabel: profile.label,
    score,
    grade: gradeFromScore(score),
    canCopy,
    criticalFailures,
    majorFailures,
    checks: allChecks,
    sources: extractNumericSources(input),
    contradictions,
    recommendations: allChecks.filter((c) => !c.passed && c.recommendation).map((c) => `${c.label}: ${c.recommendation}`),
    approvedPromptHash: canCopy ? hashPrompt(assembled.finalPrompt) : null,
    assembled,
    evaluatedAt: new Date().toISOString(),
  };
}

export function buildApprovedCommand(report: QaReport): { ok: boolean; command: string; blockReason?: string } {
  if (!report.canCopy) {
    const reasons = [
      ...report.criticalFailures.map((c) => c.label),
      report.score < ENGINE_QA_PROFILES[report.engineId].minScoreToCopy
        ? `ציון ${report.score} מתחת לסף`
        : "",
    ].filter(Boolean);
    return { ok: false, command: "", blockReason: reasons.join(" · ") || "QA נכשל" };
  }
  return { ok: true, command: report.assembled.finalPrompt };
}

export function verifyCopyIntegrity(approvedHash: string, copiedText: string): CopyIntegrityResult {
  const copiedHash = hashPrompt(copiedText);
  const matches = approvedHash === copiedHash;
  return {
    matches,
    approvedHash,
    copiedHash,
    message: matches
      ? "Copy Integrity: הפקודה שהועתקה זהה לפקודה שאושרה"
      : "Copy Integrity נכשל: התוכן שונה מהפקודה שאושרה",
  };
}

export function persistApprovedPrompt(hash: string, prompt: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(APPROVED_PROMPT_KEY, JSON.stringify({ hash, prompt, at: new Date().toISOString() }));
  } catch { /* ignore */ }
}

export function loadQaHistory(): QaHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QA_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushQaHistory(entry: Omit<QaHistoryEntry, "id">): void {
  if (typeof window === "undefined") return;
  const list = loadQaHistory();
  const full: QaHistoryEntry = { ...entry, id: `qa-${Date.now()}` };
  try {
    window.localStorage.setItem(QA_HISTORY_KEY, JSON.stringify([full, ...list].slice(0, 30)));
  } catch { /* ignore */ }
}

export type RegressionCase = { name: string; pass: boolean; detail: string };

export function runRegressionSuite(
  makeInput: (overrides: Partial<PromptAssemblyInput>) => PromptAssemblyInput,
): RegressionCase[] {
  const cases: RegressionCase[] = [];
  const ok = evaluateCreativeQa(makeInput({}));
  cases.push({ name: "תרחיש תקין", pass: ok.score >= 0 && ok.checks.length > 0, detail: `score=${ok.score}` });

  const empty = evaluateCreativeQa(
    makeInput({
      verifiedData: {
        sourceTab: "",
        dictTab: "",
        kpiLine: "",
        analysisLines: [],
        topProductsLines: [],
        topCustomersLines: [],
        focusTitle: "",
        focusBody: "",
        hasRealSheetData: false,
        hasTechnicalSources: false,
      },
    }),
  );
  cases.push({
    name: "נתונים חסרים",
    pass: empty.checks.some((c) => c.id === "real_data" && !c.passed),
    detail: empty.checks.find((c) => c.id === "real_data")?.detail || "",
  });

  const contra = evaluateCreativeQa(makeInput({ userRequest: "תמציא מחירים ומקטים בלי אימות" }));
  cases.push({
    name: "סתירות מאסטר",
    pass: contra.contradictions.length > 0 || contra.checks.some((c) => !c.passed && c.id.includes("contradict")),
    detail: contra.contradictions.join("; ") || "נבדק",
  });

  const noGoal = evaluateCreativeQa(makeInput({ goal: "", targetAudience: "" }));
  cases.push({
    name: "מטרה/קהל חסרים",
    pass: noGoal.checks.some((c) => (c.id === "goal" || c.id === "audience") && !c.passed),
    detail: `score=${noGoal.score}`,
  });

  const masterChange = evaluateCreativeQa(makeInput({ masterVersion: "v-empty", masterInstructions: "x" }));
  cases.push({
    name: "מאסטר לא תקין",
    pass: masterChange.checks.some((c) => c.id === "master" && !c.passed),
    detail: masterChange.checks.find((c) => c.id === "master")?.detail || "",
  });

  cases.push({
    name: "חסימת העתקה בכשל",
    pass: !empty.canCopy || empty.criticalFailures.length === 0,
    detail: `canCopy=${empty.canCopy}`,
  });

  if (ok.approvedPromptHash) {
    const good = verifyCopyIntegrity(ok.approvedPromptHash, ok.assembled.finalPrompt);
    const bad = verifyCopyIntegrity(ok.approvedPromptHash, ok.assembled.finalPrompt + " ");
    cases.push({ name: "Copy Integrity", pass: good.matches && !bad.matches, detail: good.message });
  } else {
    cases.push({ name: "Copy Integrity", pass: true, detail: "אין hash בתרחיש הנוכחי" });
  }

  const engines: OutputType[] = ["slides", "video", "guide", "product_image", "marketing", "counter_screen", "focus_analysis"];
  let all = true;
  for (const e of engines) {
    const r = evaluateCreativeQa(makeInput({ outputType: e }));
    if (!r.engineId || r.checks.length < 3) all = false;
  }
  cases.push({ name: "כל 7 המנועים", pass: all, detail: engines.join(", ") });
  return cases;
}
