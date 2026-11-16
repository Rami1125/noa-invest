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
        ? "\nשמור על טקסט קצר בכל שקף — כותרת + 3–5 נקודות."
        : "";
  return `
מבנה מצגת חובה (8 שקפים):
1. המקצוענים מתחילים כאן — כותרת הנושא, ח. סבן, מסר מרכזי, תמונת פתיחה רלוונטית.
2. זיהוי הבעיה בשטח — מה הלקוח רואה, גורמים אפשריים, שאלות אבחון לפני המלצה.
3. הפתרון המקצועי — שיטה, התאמה לתשתית, יתרונות ומגבלות.
4. הכרת המוצרים — שמות אמיתיים בלבד, שימושים, נתונים מאומתים ממקור.
5. מדריך יישום שלב אחר שלב — הכנת שטח, כלים, ביצוע, נקודות בקרה.
6. מוצרים משלימים והצעת מכירה — רק משלימים מוצדקים + דוגמת שיחת נציג-לקוח.
7. טעויות נפוצות ובקרת איכות.
8. סיכום לדלפק — 3 נקודות, שאלות אבחון, פתרון ומוצרים, CTA מקצועי.
${extra}`.trim();
}

function videoStructure(): string {
  return `
מבנה תסריט וידאו:
- פתיחה 5–8 שנ׳: הבעיה בשטח.
- אבחון 10–15 שנ׳: שאלות לנציג/לקוח.
- פתרון 20–30 שנ׳: שלבי עבודה.
- מוצרים 15–20 שנ׳: בחירה + משלימים מוצדקים.
- סגירה 8–12 שנ׳: סיכום + CTA.
קריינות עברית, כתוביות קצרות, ללא המצאת נתונים.`.trim();
}

function guideStructure(): string {
  return `
מבנה מדריך:
1. מתי משתמשים / מתי לא.
2. הכנת תשתית.
3. חומרים וכלים.
4. שלבי ביצוע ממוספרים.
5. בקרת איכות וטעויות נפוצות.
6. מוצרים משלימים (רק אם נחוצים).
7. דוגמת שיחת דלפק.`.trim();
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
      ? "הפק מצגת מלאה לפי המבנה. כל שקף = מסר אחד. הערות מרצה קצרות."
      : input.targetTool === "gemini"
        ? "בצע מחקר/ניתוח רק ממקורות שסופקו. אל תמציא מפרטים. סמן פערים."
        : input.targetTool === "google_vids"
          ? "הפק תסריט מחולק לזמנים + הנחיות ויזואל לכל מקטע."
          : "הפק רשימת הנחיות תמונה (prompts) להמחשה בלבד — ללא לוגו/אריזה בדויה. סמן AI illustration.";

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

מוצרים רלוונטיים (אם צוינו — השתמש בשמות אלה בלבד):
${input.products.trim() || "לא צוינו — אל תמציא שמות מוצר. השתמש בתיאור כללי או ציין שחסר מקור."}

מקורות מקצועיים להסתמכות:
${input.sources.trim() || "לא צורפו — כל נתון טכני יסומן «נדרש אימות מול המפרט הטכני של היצרן»."}

הערות מיוחדות:
${input.notes.trim() || "—"}

=== מבנה נדרש ===
${structure}

=== כלי יעד ===
${toolHint}

=== תמונות ===
- לכל שקף/מקטע: הגדר תמונה מומלצת או הנחיית יצירה (Nano Banana) — המחשה בלבד.
- הפרד: מוצר אמיתי / המחשה AI / צילום ביצוע אמיתי.
- אין AI כאילו תצלום מוצר יצרן.

=== בקרת אמינות ===
- אין נתונים מומצאים.
- אין 100% התאמה לכל מצב.
- יש דוגמת שיחת מכירה חכמה.
- יש סיכום מעשי לדלפק/שטח.

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
      hint: "הזן נושא הפקה (למשל: איטום לקראת החורף)",
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
      id: "images",
      label: "הנחיות תמונות / Nano Banana",
      ok: prompt.includes("Nano Banana") || prompt.includes("המחשה"),
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
