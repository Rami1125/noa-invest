/**
 * בניית פקודה מלאה ליועץ הטכני + QA בסיסי
 */
import type {
  AdvisorAudience,
  AdvisorContentType,
  AdvisorDetailLevel,
  AdvisorTargetTool,
} from "./master";
import {
  AUDIENCE_LABELS,
  CONTENT_TYPE_LABELS,
  DETAIL_LABELS,
  TOOL_LABELS,
} from "./master";

export type BuildPromptInput = {
  topic: string;
  contentType: AdvisorContentType;
  audience: AdvisorAudience;
  detailLevel: AdvisorDetailLevel;
  products: string;
  sources: string;
  notes: string;
  masterVersion: string;
  masterInstructions: string;
  targetTool: AdvisorTargetTool;
};

export type QaItem = {
  id: string;
  label: string;
  ok: boolean;
  severity: "critical" | "major" | "minor";
  hint?: string;
};

export type BuildPromptResult = {
  prompt: string;
  qa: QaItem[];
  allCriticalPassed: boolean;
  canCopy: boolean;
};

function slidesStructure(detail: AdvisorDetailLevel): string {
  const extra =
    detail === "deep"
      ? "\nניתן להרחיב שקפים משניים אך אין לוותר על 8 שלבי הליבה."
      : detail === "brief"
        ? "\nשמור על טקסט קצר בכל שקף — כותרת + 3–5 נקודות. מוכן להעתקה לוואטסאפ."
        : "";
  return `
מבנה מצגת / מחברת חובה (8 חלקים) — מותאם לנציגי דלפק:
1. פתיחה מסקרנת — כותרת, ח. סבן, מסר מרכזי, למה עכשיו (למשל חורף/נובמבר).
2. זיהוי הבעיה בשטח — מה הלקוח רואה/מרגיש + שאלות אבחון (פתוחות + סגורות).
3. הפתרון המקצועי בקצרה — שיטה, יתרונות, מגבלות.
4. הכרת המוצרים — מק״ט + שם רשמי + סלנג מהמילון הלוגיסטי בלבד + שימוש.
5. מדריך יישום שלב אחר שלב — קצר וברור לדלפק.
6. מוצרים משלימים + דוגמת שיחה מלאה (לקוח → שאלה פתוחה → סגורה → פתרון → מוצר → משלים → CTA).
7. טעויות נפוצות ובקרת איכות.
8. סיכום לדלפק + טקסט מוכן לשליחה לקבוצת וואטסאפ.
${extra}`.trim();
}

function videoStructure(): string {
  return `
מבנה תסריט וידאו:
- פתיחה 5–8 שנ׳: הבעיה בשטח.
- אבחון 10–15 שנ׳: שאלות לנציג/לקוח (פתוחות + סגורות).
- פתרון 20–30 שנ׳: שלבי עבודה.
- מוצרים 15–20 שנ׳: מק״ט + שם מהמילון + משלימים מוצדקים.
- סגירה 8–12 שנ׳: סיכום + CTA.
קריינות עברית, כתוביות קצרות, ללא המצאת נתונים.`.trim();
}

function guideStructure(): string {
  return `
מבנה מדריך:
1. מתי משתמשים / מתי לא.
2. הכנת תשתית.
3. חומרים וכלים (מק״ט מהמילון).
4. שלבי ביצוע ממוספרים.
5. בקרת איכות וטעויות נפוצות.
6. מוצרים משלימים (רק אם נחוצים).
7. דוגמת שיחת דלפק עם שאלות פתוחות וסגורות.`.trim();
}

export function buildAdvisorPrompt(input: BuildPromptInput): BuildPromptResult {
  const topic = input.topic.trim();
  const structure =
    input.contentType === "slides" || input.contentType === "desk_training"
      ? slidesStructure(input.detailLevel)
      : input.contentType === "video"
        ? videoStructure()
        : guideStructure();

  const toolHint =
    input.targetTool === "notebooklm"
      ? "הפק מצגת מלאה לפי המבנה. כל שקף = מסר אחד. הערות מרצה קצרות. מוכן להעתקה למחברת ולוואטסאפ."
      : input.targetTool === "gemini"
        ? "בצע מחקר/ניתוח רק ממקורות שסופקו. אל תמציא מפרטים. סמן פערים. השתמש במילון הלוגיסטי כשמצוין."
        : input.targetTool === "google_vids"
          ? "הפק תסריט מחולק לזמנים + הנחיות ויזואל לכל מקטע."
          : "הפק רשימת הנחיות תמונה (prompts) להמחשה בלבד — ללא לוגו/אריזה בדויה. סמן AI illustration. העדף imageUrl אמיתי מהמילון.";

  const prompt = `
=== METADATA ===
MASTER_VERSION: ${input.masterVersion}
CREATED_AT: ${new Date().toISOString()}
OUTPUT: ${CONTENT_TYPE_LABELS[input.contentType]}
AUDIENCE: ${AUDIENCE_LABELS[input.audience]}
DETAIL: ${DETAIL_LABELS[input.detailLevel]}
TARGET_TOOL: ${TOOL_LABELS[input.targetTool]}
BRAND: ח. סבן חומרי בניין (1994) בע\"מ

=== TECHNICAL_ADVISOR_MASTER (חובה — אל תתעלם) ===
${input.masterInstructions}

=== בקשת הפקה ===
נושא: ${topic || "(חסר נושא)"}
סוג תוכן: ${CONTENT_TYPE_LABELS[input.contentType]}
קהל יעד: ${AUDIENCE_LABELS[input.audience]}
רמת פירוט: ${DETAIL_LABELS[input.detailLevel]}
סגנון עיצוב: Premium · #F3F7FB / #102A43 / #1769AA / #20A4C8 · RTL · Heebo

מוצרים רלוונטיים (אם צוינו — השתמש בשמות אלה בלבד, כולל מק״ט וסלנג מהמילון):
${input.products.trim() || "לא צוינו — אל תמציא שמות מוצר. השתמש בתיאור כללי או ציין שחסר מקור מהמילון הלוגיסטי."}

מקורות מקצועיים להסתמכות:
${input.sources.trim() || "לא צורפו — כל נתון טכני יסומן «נדרש אימות מול המפרט הטכני של היצרן»."}

הערות מיוחדות:
${input.notes.trim() || "—"}

=== מבנה נדרש ===
${structure}

=== כלי יעד ===
${toolHint}

=== תמונות ===
- לכל שקף/מקטע: הגדר תמונה מומלצת — העדף imageUrl אמיתי מהמילון הלוגיסטי.
- הפרד: מוצר אמיתי / המחשה AI / צילום ביצוע אמיתי.
- אין AI כאילו תצלום מוצר יצרן.

=== בקרת אמינות + מילון לוגיסטי ===
- אין נתונים מומצאים.
- מוצרים: רק מק״ט + שם + סלנג שקיימים במילון הלוגיסטי (או שצוינו בשדה מוצרים).
- תמונות: העדף imageUrl אמיתי מהמילון; אחרת סמן "נדרשת תמונה מהקטלוג".
- חובה: לפחות 2 שאלות פתוחות + 2 שאלות סגורות לדוגמה.
- חובה: דוגמת שיחת מכירה מלאה לנציג דלפק.
- יש סיכום מעשי + טקסט מוכן להעתקה לוואטסאפ/מחברת.

הפק את התוצר המלא לפי הכלי. אל תתאר רק איך ליצור — בנה את התוכן עצמו.
`.trim();

  const qa: QaItem[] = [
    {
      id: "master",
      label: "הנחיות MASTER הוחלו בפקודה",
      ok: input.masterInstructions.length > 100 && prompt.includes("TECHNICAL_ADVISOR_MASTER"),
      severity: "critical",
    },
    {
      id: "topic",
      label: "הנושא ברור",
      ok: topic.length >= 3,
      severity: "critical",
      hint: "הזן נושא הפקה (למשל: הכנה לחורף – איטום ובידוד)",
    },
    {
      id: "audience",
      label: "קהל יעד מוגדר",
      ok: Boolean(input.audience),
      severity: "critical",
    },
    {
      id: "structure",
      label: "קיים רצף מקצועי / מבנה 8 שקפים",
      ok: prompt.includes("מבנה") || prompt.includes("שקף"),
      severity: "major",
    },
    {
      id: "no_invent",
      label: "כללי איסור המצאת נתונים כלולים",
      ok: prompt.includes("אין להמציא") || prompt.includes("נדרש אימות"),
      severity: "critical",
    },
    {
      id: "sales",
      label: "מכירה חכמה / דוגמת שיחה",
      ok: prompt.includes("שיחה") || prompt.includes("מכירה"),
      severity: "major",
    },
    {
      id: "questions",
      label: "שאלות פתוחות וסגורות",
      ok: prompt.includes("פתוחות") || prompt.includes("סגורות") || prompt.includes("אבחון"),
      severity: "major",
    },
    {
      id: "images",
      label: "הנחיות תמונות / מילון",
      ok: prompt.includes("Nano Banana") || prompt.includes("המחשה") || prompt.includes("imageUrl"),
      severity: "minor",
    },
    {
      id: "tool",
      label: "הפקודה מותאמת לכלי היעד",
      ok: prompt.includes(input.targetTool) || prompt.includes(TOOL_LABELS[input.targetTool]),
      severity: "major",
    },
    {
      id: "sources",
      label: "מקורות / סימון חוסר מקור",
      ok: true,
      severity: "minor",
      hint: input.sources.trim() ? undefined : "לא צורפו מקורות — הנתונים יסומנו לאימות",
    },
  ];

  const allCriticalPassed = qa.filter((q) => q.severity === "critical").every((q) => q.ok);
  const canCopy = allCriticalPassed && topic.length >= 3;

  return { prompt, qa, allCriticalPassed, canCopy };
}
