/**
 * Customer Diagnosis Engine — one question at a time
 */
import type { DiagnosisField, DiagnosisState } from "./types";

export const DIAGNOSIS_QUESTIONS: Record<
  DiagnosisField,
  { question: string; options?: string[]; freeText?: boolean }
> = {
  workType: {
    question: "מה סוג העבודה שהלקוח מתכנן?",
    options: ["איטום", "ריצוף / הדבקת אריחים", "צביעה / גמר", "גבס", "טיח", "שיקום בטון", "אחר"],
  },
  substrateType: {
    question: "על איזו תשתית עובדים?",
    options: ["בטון", "טיח", "גבס", "ריצוף קיים", "בלוקים", "עץ / OSB", "לא ידוע"],
  },
  substrateCondition: {
    question: "מה מצב התשתית?",
    options: ["חדשה / נקייה", "ישנה אבל יציבה", "סדוקה / מתקלפת", "רטובה / עם עובש", "לא ידוע"],
  },
  indoorOutdoor: {
    question: "פנים או חוץ?",
    options: ["פנים", "חוץ", "שניהם / מעבר"],
  },
  exposure: {
    question: "יש חשיפה מיוחדת לשמש, מים או כימיקלים?",
    options: ["רגיל", "רטיבות גבוהה (מקלחת / גג)", "שמש ישירה חזקה", "כימיקלים / תעשייה", "לא ידוע"],
  },
  dimensions: {
    question: "מה בערך המידות או גודל האריח / השטח?",
    freeText: true,
    options: ["עד 60×60", "60–80", "מעל 80 / פורצלן גדול", "שטח קטן (תיקון)", "שטח גדול"],
  },
  requestedProduct: {
    question: "הלקוח ביקש מוצר ספציפי, או רק תיאור כללי?",
    freeText: true,
    options: ["ביקש מוצר בשם", "תיאר בעיה בלבד", "השווה מחירים", "לא בטוח"],
  },
  problemToSolve: {
    question: "מה הבעיה העיקרית שהלקוח רוצה לפתור?",
    freeText: true,
    options: ["רטיבות / נזילה", "התקלפות צבע / שליכט", "סדקים", "גשר קור / עובש", "הדבקה חדשה", "אחר"],
  },
  budgetConstraint: {
    question: "יש מגבלה תקציבית או דרישה לפתרון מהיר בלבד?",
    options: ["תקציב מוגבל", "איכות לטווח ארוך", "מהירות ביצוע", "לא צוין"],
  },
};

const FIELD_ORDER: DiagnosisField[] = [
  "workType",
  "problemToSolve",
  "substrateType",
  "substrateCondition",
  "indoorOutdoor",
  "exposure",
  "dimensions",
  "requestedProduct",
  "budgetConstraint",
];

export function createEmptyDiagnosis(): DiagnosisState {
  return { active: false, answers: {}, completed: false };
}

export function startDiagnosis(
  partial?: Partial<Record<DiagnosisField, string>>,
): DiagnosisState {
  const answers = { ...(partial || {}) };
  const next = FIELD_ORDER.find((f) => !answers[f]);
  return {
    active: true,
    currentField: next,
    answers,
    completed: !next,
  };
}

export function answerDiagnosis(
  state: DiagnosisState,
  field: DiagnosisField,
  value: string,
): DiagnosisState {
  const answers = { ...state.answers, [field]: value };
  const next = FIELD_ORDER.find((f) => !answers[f]);
  const essential: DiagnosisField[] = ["workType", "problemToSolve", "substrateType"];
  const essentialsFilled = essential.every((f) => !!answers[f]);
  const completed = !next || (essentialsFilled && field === "exposure");

  return {
    active: !completed,
    currentField: completed ? undefined : next,
    answers,
    completed,
  };
}

export function getNextDiagnosisPrompt(state: DiagnosisState): {
  field: DiagnosisField;
  question: string;
  options?: string[];
  freeText?: boolean;
} | null {
  if (!state.active || !state.currentField) return null;
  const def = DIAGNOSIS_QUESTIONS[state.currentField];
  return {
    field: state.currentField,
    question: def.question,
    options: def.options,
    freeText: def.freeText,
  };
}

export function relevantFieldsForWork(workType?: string): DiagnosisField[] {
  const base: DiagnosisField[] = ["workType", "problemToSolve", "substrateType", "indoorOutdoor"];
  if (!workType) return FIELD_ORDER;
  if (/איטום/i.test(workType)) return [...base, "exposure", "substrateCondition", "dimensions"];
  if (/ריצוף|דבק|אריח/i.test(workType))
    return [...base, "dimensions", "substrateCondition", "exposure"];
  if (/צבע|שליכט|גמר/i.test(workType)) return [...base, "substrateCondition", "exposure"];
  return base;
}
