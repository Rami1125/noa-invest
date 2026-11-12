/**
 * מנוע הרכבת פקודות מרכזי + בקרת איכות (SABAN MASTER CREATIVE ENGINE 2026)
 *
 * FINAL_PROMPT =
 *   MASTER_INSTRUCTIONS +
 *   OUTPUT_TYPE_INSTRUCTIONS +
 *   USER_REQUEST +
 *   VERIFIED_DATA +
 *   MEDIA_REFERENCES +
 *   OUTPUT_FORMAT +
 *   QUALITY_CONTROL
 */
import { type MediaItem, buildMediaBlock, DEFAULT_STYLE } from "./media";

export type OutputType =
  | "slides"
  | "video"
  | "guide"
  | "product_image"
  | "marketing"
  | "counter_screen"
  | "focus_analysis";

export type CounterScreenTemplate =
  | "product_of_week"
  | "site_problem_solution"
  | "short_execution_guide"
  | "product_comparison"
  | "complementary_product"
  | "work_safety"
  | "home_design_inspiration"
  | "approved_promo";

export type VideoFormatPreset = "explainer_pro" | "counter_60s";

export const OUTPUT_TYPE_META: Record<
  OutputType,
  { label: string; shortDesc: string; defaultTargetAudience: string; defaultGoal: string }
> = {
  slides: {
    label: "מצגת",
    shortDesc: "8–12 שקפים · הערות מרצה · מבנה סיפור מקצועי",
    defaultTargetAudience: "קבלנים, אדריכלים, מנהלי פרויקטים וצוות המכירות",
    defaultGoal: "הצגה מקצועית ומבוססת נתונים של מערכת/מוצר/ניתוח רכש עבור ח. סבן",
  },
  video: {
    label: "וידאו",
    shortDesc: "תסריט מחולק לזמנים · קריינות עברית · 60 / 70–90 שנ׳",
    defaultTargetAudience: "לקוחות בדלפק, קבלנים בשטח ומנהלי רכש",
    defaultGoal: "הסבר חזותי ממוקד ומעורר אמון עם קריינות וטקסט מסך",
  },
  guide: {
    label: "מדריך טכני",
    shortDesc: "תנאי תשתית · שלבי ביצוע · טעויות נפוצות · בטיחות",
    defaultTargetAudience: "קבלני ביצוע, רצפים, טייחים ומנהלי עבודה באתר",
    defaultGoal: "הדרכת ביצוע תקינה ובטיחותית המבוססת על מפרטים מאומתים בלבד",
  },
  product_image: {
    label: "תמונת מוצר",
    shortDesc: "צילום אדריכלי ישראלי · מדיניות 4 רמות · ללא לוגו בדוי",
    defaultTargetAudience: "קטלוג ח. סבן, דף מוצר ותצוגות דלפק",
    defaultGoal: "הפקת הנחיית צילום או המחשה חזותית מדויקת ואמינה",
  },
  marketing: {
    label: "תוכן שיווקי",
    shortDesc: "מסר מבוסס נתונים מאושרים בלבד · ללא הפרזות",
    defaultTargetAudience: "קבלנים, בונים פרטיים ולקוחות ח. סבן",
    defaultGoal: "הנגשת יתרונות מאומתים והנעה לפעולה על בסיס נתוני אמת",
  },
  counter_screen: {
    label: "מסך דלפק",
    shortDesc: "16:9 · 1920×1080 · כותרות גדולות · מסר מרכזי אחד",
    defaultTargetAudience: "לקוחות הממתינים בדלפק המכירות (מחסן החרש / התלמיד)",
    defaultGoal: "תצוגת מסך חדה, קריאה ממרחק ובעלת ניגודיות גבוהה",
  },
  focus_analysis: {
    label: "מיקוד וניתוח",
    shortDesc: "ניתוח עומק של מוצר/לקוח/KPI מאומתים מתוך הגיליון",
    defaultTargetAudience: "הנהלת ח. סבן, ראמי מסארווה ומנהלי רכש",
    defaultGoal: "זיהוי מגמות צריכה, ריכוזיות מלאי והמלצות רכש ותפעול",
  },
};

export const COUNTER_TEMPLATE_LABELS: Record<CounterScreenTemplate, string> = {
  product_of_week: "מוצר השבוע",
  site_problem_solution: "פתרון מקצועי לבעיה באתר",
  short_execution_guide: "מדריך ביצוע קצר",
  product_comparison: "השוואת מוצרים",
  complementary_product: "מוצר משלים",
  work_safety: "בטיחות בעבודה",
  home_design_inspiration: "השראה לעיצוב הבית",
  approved_promo: "מבצע / תוכן שיווקי (מאושר בלבד)",
};

export type VerifiedDataContext = {
  kpiLine: string;
  analysisLines: string[];
  topProductsLines: string[];
  topCustomersLines: string[];
  focusTitle?: string;
  focusBody?: string;
  hasRealSheetData: boolean;
  hasTechnicalSources: boolean;
  sourceTab: string;
  dictTab: string;
};

export type PromptAssemblyInput = {
  masterInstructions: string;
  masterVersion: string;
  styleText: string;
  outputType: OutputType;
  slideCount?: number;
  videoPreset?: VideoFormatPreset;
  counterTemplate?: CounterScreenTemplate;
  goal: string;
  targetAudience: string;
  userRequest: string;
  verifiedData: VerifiedDataContext;
  media: MediaItem[];
  imageNote: string;
};

export type PromptMetadata = {
  MASTER_VERSION: string;
  CREATED_AT: string;
  OUTPUT_TYPE: OutputType;
  SOURCE_CONTEXT: string;
  MEDIA_CONTEXT: string;
};

export type QualityCheckItem = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type AssembledPromptResult = {
  finalPrompt: string;
  metadata: PromptMetadata;
  checks: QualityCheckItem[];
  allPassed: boolean;
  warnings: string[];
};

function buildOutputTypeInstructions(input: PromptAssemblyInput): string {
  const slidesN = Math.min(16, Math.max(4, input.slideCount || 10));
  switch (input.outputType) {
    case "slides":
      return `=== הנחיות תוצר: מנוע יצירת מצגות (NotebookLM Slide-Deck Presenter) ===
• היקף ברירת מחדל: ${slidesN} שקפים (טווח מומלץ 8–12 שקפים).
• מבנה חובה לכל פקודת מצגת:
  1. מטרת המצגת וקהל היעד המוגדר.
  2. מבנה סיפור מקצועי (Narrative Arc) מותאם לענף הבנייה.
  3. לכל שקף בנפרד: כותרת חדה, מסר מרכזי אחד, תוכן טכני מאומת (3–5 נקודות תמציתיות), הצעת תמונה/צילום מתאימה, הנחיות קומפוזיציה (RTL, לבן נקי #FFFFFF / אבן #E8E2D8 / כחול #15324B / אמרלד #0F766E), והערות מרצה (20–30 שניות דיבור).
  4. מוצרים משלימים רלוונטיים — אך ורק כאשר קיימת התאמה מקצועית מאומתת (לא על סמך רכישה משותפת בלבד).
  5. שקף סיכום וקריאה ברורה לפעולה (CTA).`;

    case "video": {
      const duration = input.videoPreset === "counter_60s" ? "60 שניות (מסך דלפק)" : "70–90 שניות (סרטון הסבר מקצועי)";
      return `=== הנחיות תוצר: מנוע יצירת סרטונים (NotebookLM Video Overview / Explainer) ===
• משך יעד: ${duration} · סגנון: heritage/classic · עברית RTL.
• מבנה חובה לתוצר:
  1. פתיחה חזקה (Hook ב-8 השניות הראשונות).
  2. תסריט מלא מחולק לחלונות זמן מדויקים (למשל [00–08], [08–25], [25–45]...).
  3. קריינות מלאה בעברית מקצועית (VO) בכל קטע.
  4. טקסט קצר וחד שיופיע על המסך (On-Screen Text, ללא עומס).
  5. תיאור סצנה מפורט לכל קטע + הנחיות צילום/תמונה ריאליסטית (לא CGI).
  6. מעברים (Transitions) וקצב עריכה מתאים.
  7. סיום ברור וקריאה לפעולה (CTA).`;
    }

    case "guide":
      return `=== הנחיות תוצר: מנוע מדריכים טכניים מקצועיים ===
• מבנה חובה למדריך טכני (ללא השמטת סעיפים):
  1. הגדרת הבעיה והאתגר באתר הבנייה.
  2. תנאי השטח והתשתית הנדרשים לפני תחילת עבודה.
  3. בחירת המערכת והחומר המתאימים (רק לפי מפרט מאומת).
  4. רשימת חומרים וכלים נדרשים.
  5. שלבי ביצוע מדורגים וברורים.
  6. זמני המתנה, אשפרה וייבוש — לציין מספרים אך ורק אם אומתו במקור רשמי (אחרת לציין במפורש: "יש לבדוק בדף הטכני של היצרן").
  7. טעויות נפוצות בשטח ואיך להימנע מהן.
  8. אמצעי בטיחות מחייבים בעבודה.
  9. מוצרים משלימים בעלי תאימות מקצועית מאומתת.
  10. רשימת מקורות מקצועיים.
• אזהרת בטיחות: אין לתת הוראות ביצוע מסוכנות או לקבוע התאמה הנדסית ללא בסיס מקצועי.`;

    case "product_image":
      return `=== הנחיות תוצר: מנוע תמונות מוצר והמחשה אדריכלית ===
• כבד את סדר העדיפויות של מנוע התמונות: תמונת יצרן ← צילום מוצר אמיתי ← צילום אתר עבודה ← המחשה חזותית AI בלבד.
• אם אין תמונה רשמית של המוצר: הפק הנחיית צילום/המחשה ריאליסטית המציינת במפורש "המחשה חזותית בלבד — לא תמונת מוצר רשמית".
• איסור מוחלט: אין להמציא לוגו, תווית, אריזה או טקסט מסחרי על גבי המוצר, ואין לעוות את מראה המוצר.
• סגנון: Professional architectural photography, documentary editorial, natural daylight, realistic material textures, authentic Israeli construction environments, controlled depth of field.`;

    case "marketing":
      return `=== הנחיות תוצר: תוכן שיווקי אמין ומבוסס נתונים ===
• הפק מסרים שיווקיים אך ורק על בסיס נתונים, מפרטים ומחירים שסופקו ואושרו במערכת.
• הדגש את ערכי ח. סבן (אמינות מאז 1994, מקצועיות, מלאי זמין בהוד השרון, שירות לקבלנים).
• אסור להשתמש בהפרזות חסרות בסיס או להבטיח תכונות שלא אומתו במפרט יצרן.
• כלול כותרת מרכזית, 3 יתרונות מאומתים, והנעה ברורה לפעולה.`;

    case "counter_screen": {
      const tpl = COUNTER_TEMPLATE_LABELS[input.counterTemplate || "product_of_week"];
      return `=== הנחיות תוצר: מנוע התאמה למסכי דלפק (16:9 · 1920×1080) ===
• תבנית נבחרת: ${tpl}.
• מפרט טכני ועיצובי קשיח למסך דלפק:
  - יחס תצוגה: 16:9 · רזולוציית יעד: 1920×1080.
  - כיווניות: עברית RTL מלאה.
  - טיפוגרפיה: כותרות גדולות, כבדות וקריאות ממרחק של 3–5 מטרים.
  - צפיפות תוכן: מעט טקסט בכל שקופית · מסר מרכזי אחד בלבד בכל מסך · ללא טקסט קטן או צפוף.
  - ניגודיות גבוהה (טקסט #1C2732 / #FFFFFF על רקע #FFFFFF / #15324B / #E8E2D8 · הדגשה #0F766E).
  - תמונה איכותית אחת מרכזית (צילום אמיתי או מוצר רשמי).
  - עבור מבצע/תוכן שיווקי: אך ורק על בסיס נתונים שסופקו ואושרו במפורש.`;
    }

    case "focus_analysis":
      return `=== הנחיות תוצר: מיקוד וניתוח נתונים מאומת ===
• נתח את הנתונים האמיתיים שנבחרו (מוצר/מק"ט, לקוח או סיכום ארכיון) מתוך טאבי ארכיון תעודות גליה ומילון לוגיסט.
• הפרד בבירור בין עובדות מאומתות מהטבלה לבין תובנות והמלצות תפעוליות (כגון היקפי צריכה, סבבי מנוף או תכנון מלאי).
• אין להסיק תאימות טכנית בין שני מוצרים רק מכך שנרכשו באותה תעודה.`;
  }
}

function buildOutputFormatSection(input: PromptAssemblyInput): string {
  if (input.outputType === "counter_screen") {
    return `=== פורמט פלט נדרש ===
• עברית RTL · פריסת מסך 16:9 (1920×1080) · כותרת ראשית (עד 6 מילים) · תת-כותרת (עד 10 מילים) · 1–3 נתונים מאומתים גדולים · תיאור תמונה מרכזית · קריאה קצרה לפעולה בדלפק.`;
  }
  if (input.outputType === "video") {
    return `=== פורמט פלט נדרש ===
• עברית RTL · טבלת סצנות לפי חותמות זמן (זמן | קריינות עברית | טקסט על המסך | הנחיית צילום/ויזואל | מעבר וקצב) · יחס 16:9.`;
  }
  return `=== פורמט פלט נדרש ===
• עברית תקנית וברורה · כיווניות RTL מוחלטת · סעיפים ממוספרים · הדגשת מקורות מאומתים וסימון מפורש של כל פרט שחסר במקור.`;
}

export function runQualityChecks(
  input: PromptAssemblyInput,
  finalPrompt: string,
): QualityCheckItem[] {
  const hasGoal = input.goal.trim().length >= 5;
  const hasAudience = input.targetAudience.trim().length >= 3;
  const hasMaster =
    input.masterInstructions.trim().length > 40 &&
    finalPrompt.includes(input.masterInstructions.trim().slice(0, 30));
  const hasRealSource = input.verifiedData.hasRealSheetData || Boolean(input.verifiedData.focusBody);
  const hasMediaLabel =
    finalPrompt.includes("מנוע תמונות ומדיה") &&
    (input.media.length > 0 || finalPrompt.includes("המחשה חזותית בלבד"));
  const hasRtl = /RTL/i.test(finalPrompt);
  const hasProperFormat =
    finalPrompt.includes("פורמט פלט נדרש") &&
    (input.outputType !== "counter_screen" || finalPrompt.includes("1920×1080"));

  // בדיקת סתירות: למשל מצב בו המשתמש ביקש במפורש להמציא נתון או לבטל אימות או לשים לוגו בדוי
  const reqLower = input.userRequest.trim();
  const hasContradictions =
    /המצא נתונים|תמציא מחיר|אל תבדוק|התעלם מהמאסטר|תכתוב באנגלית בלבד/i.test(reqLower);

  // בדיקה שהנחיות המאסטר אינן חסרות אמינות ושלא הוכנסו מספרים חופשיים לא מאומתים בהנחיית משתמש
  const userNumbers = reqLower.match(/\b\d{2,}\b/g) || [];
  const dataBlob = [
    input.verifiedData.kpiLine,
    ...input.verifiedData.analysisLines,
    ...input.verifiedData.topProductsLines,
    ...input.verifiedData.topCustomersLines,
    input.verifiedData.focusTitle || "",
    input.verifiedData.focusBody || "",
    String(input.slideCount || ""),
    "16",
    "9",
    "1920",
    "1080",
    "60",
    "70",
    "90",
    "10",
    "20",
    "30",
  ].join(" ");
  const ungroundedNumbers = userNumbers.filter((n) => !dataBlob.includes(n));
  const noUngroundedNumbers = ungroundedNumbers.length === 0;

  // בדיקה נגד טענות טכניות לא מאומתות (כגון קביעת תקן או זמן ייבוש מומצא בהנחיית המשתמש ללא מקור)
  const hasUnverifiedClaims =
    /ייבוש\s+\d+|עומס\s+של\s+\d+\s+טון|תקן\s+ישראלי\s+\d+/i.test(reqLower) &&
    !input.verifiedData.hasTechnicalSources;

  return [
    {
      id: "goal",
      label: "מטרה ברורה",
      passed: hasGoal,
      detail: hasGoal ? "הוגדרה מטרה ברורה לתוצר" : "חסרה מטרת תוצר מפורטת (לפחות 5 תווים)",
    },
    {
      id: "audience",
      label: "קהל יעד מוגדר",
      passed: hasAudience,
      detail: hasAudience ? `קהל היעד: ${input.targetAudience}` : "יש להגדיר קהל יעד",
    },
    {
      id: "master",
      label: "הכללת הנחיות מאסטר",
      passed: hasMaster,
      detail: hasMaster ? `הוזרקה שכבת מאסטר (${input.masterVersion})` : "חסרות הנחיות מאסטר תקינות",
    },
    {
      id: "real_data",
      label: "נתונים ממקור אמיתי",
      passed: hasRealSource,
      detail: hasRealSource
        ? `מחובר למקור: ${input.verifiedData.sourceTab} + ${input.verifiedData.dictTab}`
        : "לא נטענו נתוני אמת מהמערכת",
    },
    {
      id: "media_marking",
      label: "סימון תמונות תקין",
      passed: hasMediaLabel,
      detail:
        input.media.length > 0
          ? `${input.media.length} פריטי מדיה מסומנים לפי עדיפות`
          : "אין תמונה — סומנה אזהרת המחשה חזותית בלבד",
    },
    {
      id: "rtl",
      label: "הגדרת עברית RTL",
      passed: hasRtl,
      detail: hasRtl ? "הוגדר RTL מלא בעברית" : "חסרה הגדרת RTL",
    },
    {
      id: "format",
      label: "פורמט מתאים לתוצר",
      passed: hasProperFormat,
      detail: hasProperFormat ? `פורמט ${OUTPUT_TYPE_META[input.outputType].label} תקין` : "פורמט חסר",
    },
    {
      id: "contradictions",
      label: "ללא סתירות בין הוראות",
      passed: !hasContradictions,
      detail: !hasContradictions
        ? "אין סתירות מול הנחיות המאסטר"
        : "זוהתה סתירה בבקשת המשתמש מול כללי המאסטר (בקשה להמצאת נתונים/ביטול אימות)",
    },
    {
      id: "no_ungrounded_numbers",
      label: "ללא מספרים ללא מקור",
      passed: noUngroundedNumbers,
      detail: noUngroundedNumbers
        ? "כל המספרים מעוגנים בנתוני המערכת"
        : `מספרים בבקשה ללא מקור מאומת במערכת: ${ungroundedNumbers.join(", ")}`,
    },
    {
      id: "no_unverified_claims",
      label: "ללא טענות טכניות לא מאומתות",
      passed: !hasUnverifiedClaims,
      detail: !hasUnverifiedClaims
        ? "לא זוהו טענות תקן/ייבוש לא מאומתות"
        : "זוהתה טענת תקן/ייבוש בבקשה ללא מקור מפרט יצרן",
    },
  ];
}

/**
 * הפונקציה המרכזית להרכבת הפקודה הסופית
 */
export function assembleFinalPrompt(input: PromptAssemblyInput): AssembledPromptResult {
  const nowIso = new Date().toISOString();
  const hasMedia = input.media.length > 0;
  const mediaSummary = hasMedia
    ? `${input.media.length} items (${input.media.map((m) => m.source).join(", ")})`
    : "fallback_ai_illustration_policy";

  const sourceSummary = input.verifiedData.focusTitle
    ? `${input.verifiedData.sourceTab}+${input.verifiedData.dictTab} | ${input.verifiedData.focusTitle}`
    : `${input.verifiedData.sourceTab}+${input.verifiedData.dictTab}`;

  const metadata: PromptMetadata = {
    MASTER_VERSION: input.masterVersion,
    CREATED_AT: nowIso,
    OUTPUT_TYPE: input.outputType,
    SOURCE_CONTEXT: sourceSummary,
    MEDIA_CONTEXT: mediaSummary,
  };

  const metadataBlock = [
    "=== METADATA ===",
    `MASTER_VERSION: ${metadata.MASTER_VERSION}`,
    `CREATED_AT: ${metadata.CREATED_AT}`,
    `OUTPUT_TYPE: ${metadata.OUTPUT_TYPE}`,
    `SOURCE_CONTEXT: ${metadata.SOURCE_CONTEXT}`,
    `MEDIA_CONTEXT: ${metadata.MEDIA_CONTEXT}`,
  ].join("\n");

  const outputTypeInstructions = buildOutputTypeInstructions(input);

  const userRequestSection = [
    "=== בקשת המשתמש והגדרות התוצר (USER_REQUEST) ===",
    `• סוג תוצר: ${OUTPUT_TYPE_META[input.outputType].label}`,
    `• מטרה: ${input.goal.trim() || OUTPUT_TYPE_META[input.outputType].defaultGoal}`,
    `• קהל יעד: ${input.targetAudience.trim() || OUTPUT_TYPE_META[input.outputType].defaultTargetAudience}`,
    input.userRequest.trim() ? `• דגשים והנחיות נוספות: ${input.userRequest.trim()}` : "• דגשים: היצמד אך ורק לנתונים המאומתים להלן.",
  ].join("\n");

  const verifiedDataSection = [
    "=== נתונים אמיתיים ומאומתים מהמערכת (VERIFIED_DATA) ===",
    `מקור ראשי: ${input.verifiedData.sourceTab} | קטלוג: ${input.verifiedData.dictTab}`,
    input.verifiedData.kpiLine,
    input.verifiedData.focusTitle ? `\n--- מיקוד נבחר ---\n${input.verifiedData.focusTitle}\n${input.verifiedData.focusBody || ""}` : "",
    input.verifiedData.analysisLines.length
      ? `\n--- תובנות מערכת ---\n${input.verifiedData.analysisLines.map((l, i) => `${i + 1}. ${l}`).join("\n")}`
      : "",
    input.verifiedData.topProductsLines.length
      ? `\n--- מוצרים מובילים מהארכיון ---\n${input.verifiedData.topProductsLines.join("\n")}`
      : "",
    input.verifiedData.topCustomersLines.length
      ? `\n--- לקוחות מובילים מהארכיון ---\n${input.verifiedData.topCustomersLines.join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const styleSection = [
    "=== שפה חזותית ועיצובית ===",
    input.styleText.trim() || DEFAULT_STYLE,
  ].join("\n");

  const mediaSection = buildMediaBlock(input.media, input.imageNote);
  const outputFormatSection = buildOutputFormatSection(input);

  const qualityControlFooter = `=== בקרת איכות סופית (QUALITY_CONTROL) ===
• יישור notebooklm-py: grounding אך ורק מהמקורות שהועלו והנתונים המאומתים למעלה · עברית RTL.
• אם נתון חסר במקור (כגון זמן ייבוש, מפרט תקן או מחיר שלא סופק) — ציין "חסר נתון מאומת במקור" ואל תנחש.`;

  const finalPrompt = [
    metadataBlock,
    input.masterInstructions.trim(),
    outputTypeInstructions,
    styleSection,
    userRequestSection,
    verifiedDataSection,
    mediaSection,
    outputFormatSection,
    qualityControlFooter,
  ].join("\n\n");

  const checks = runQualityChecks(input, finalPrompt);
  const warnings = checks.filter((c) => !c.passed).map((c) => `${c.label}: ${c.detail}`);

  return {
    finalPrompt,
    metadata,
    checks,
    allPassed: warnings.length === 0,
    warnings,
  };
}
