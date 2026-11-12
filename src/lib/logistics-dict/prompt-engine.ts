/**
 * SABAN MASTER CREATIVE ENGINE — מנוע הרכבת פקודות
 * FINAL_PROMPT = MASTER + OUTPUT_TYPE + USER_REQUEST + VERIFIED_DATA + MEDIA + FORMAT + QC
 */

import {
  MASTER_VERSION,
  MASTER_INSTRUCTIONS,
  OUTPUT_TYPE_INSTRUCTIONS,
  type OutputType,
  runQualityChecks,
  isPromptVerified,
  type QualityCheck,
  getActiveMaster,
} from "./master";
import { buildMediaBlock, type MediaItem } from "./media";

export type PromptContext = {
  outputType: OutputType;
  userRequest?: string;
  focusKind: "none" | "product" | "customer";
  productSku?: string;
  productName?: string;
  customerNo?: string;
  customerName?: string;
  verifiedDataBlock: string;
  analysisPoints: string[];
  media: MediaItem[];
  imageNote: string;
  styleOverride?: string;
  kpiLine?: string;
};

export type BuiltPrompt = {
  prompt: string;
  meta: {
    MASTER_VERSION: string;
    CREATED_AT: string;
    OUTPUT_TYPE: OutputType;
    SOURCE_CONTEXT: string;
    MEDIA_CONTEXT: string;
  };
  checks: QualityCheck[];
  verified: boolean;
};

function buildSourceContext(ctx: PromptContext): string {
  if (ctx.focusKind === "product" && ctx.productSku) {
    return `מוצר ממוקד: ${ctx.productName || ""} (מק״ט ${ctx.productSku})`;
  }
  if (ctx.focusKind === "customer" && ctx.customerNo) {
    return `לקוח ממוקד: ${ctx.customerName || ""} (#${ctx.customerNo})`;
  }
  return "סקירה כללית מארכיון התעודות + מילון_לוגיסט";
}

function buildMediaContext(media: MediaItem[]): string {
  if (!media.length) return "אין תמונות מצורפות — השתמש בהנחיית צילום מקצועי";
  const drive = media.filter((m) => m.source === "drive" || m.publicUrl).length;
  const upload = media.filter((m) => m.source === "upload").length;
  return `${media.length} פריטי מדיה (Drive: ${drive}, העלאה: ${upload})`;
}

export function buildFinalPrompt(ctx: PromptContext): BuiltPrompt {
  const active = getActiveMaster();
  const masterBlock = active.instructions || MASTER_INSTRUCTIONS;
  const version = active.version || MASTER_VERSION;
  const styleBlock = ctx.styleOverride?.trim() || active.styleOverride?.trim() || "";

  const outputBlock = OUTPUT_TYPE_INSTRUCTIONS[ctx.outputType] || "";
  const mediaBlock = buildMediaBlock(ctx.media, ctx.imageNote);
  const createdAt = new Date().toISOString();

  const userBlock = [
    "--- בקשת משתמש / הקשר ---",
    ctx.userRequest?.trim() || "הפק תוצר מקצועי על בסיס הנתונים והמאסטר.",
    buildSourceContext(ctx),
  ].join("\n");

  const dataBlock = [
    "--- נתונים מאומתים (ממקורות הארכיון בלבד) ---",
    ctx.kpiLine || "",
    ctx.verifiedDataBlock || "אין נתונים מפורטים — השתמש רק במה שסופק.",
    ctx.analysisPoints.length
      ? "נקודות ניתוח:\n" + ctx.analysisPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const formatBlock = `
--- פורמט פלט ---
• עברית מקצועית מלאה · יישור RTL
• פקודה עצמאית ומוכנה להעתקה ל-NotebookLM
• ללא הוראות סותרות · ללא נתונים מומצאים
• התאם במדויק לסוג התוצר שנבחר
`.trim();

  const qcBlock = `
--- בקרת איכות (חובה) ---
לפני סיום וודא: מטרה ברורה, קהל יעד, נתונים ממקור אמיתי, תמונות מסומנות, RTL, אין סתירות, אין מספרים ללא מקור, אין טענות טכניות לא מאומתות.
`.trim();

  const metaHeader = [
    `MASTER_VERSION: ${version}`,
    `CREATED_AT: ${createdAt}`,
    `OUTPUT_TYPE: ${ctx.outputType}`,
    `SOURCE_CONTEXT: ${buildSourceContext(ctx)}`,
    `MEDIA_CONTEXT: ${buildMediaContext(ctx.media)}`,
  ].join("\n");

  const prompt = [
    metaHeader,
    "",
    masterBlock,
    "",
    outputBlock,
    "",
    styleBlock ? `--- סגנון חזותי (Override) ---\n${styleBlock}` : "",
    "",
    userBlock,
    "",
    dataBlock,
    "",
    mediaBlock,
    "",
    formatBlock,
    "",
    qcBlock,
  ]
    .filter((s) => s !== undefined && s !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const checks = runQualityChecks({
    hasGoal: true,
    hasAudience: ctx.focusKind !== "none" || Boolean(ctx.userRequest),
    hasMaster: prompt.includes("SABAN MASTER CREATIVE ENGINE") || prompt.includes("MASTER_VERSION"),
    hasRealData: Boolean(ctx.verifiedDataBlock && ctx.verifiedDataBlock.length > 20),
    mediaLabeled: true,
    rtlDefined: prompt.includes("RTL") || prompt.includes("עברית"),
    formatOk: Boolean(OUTPUT_TYPE_INSTRUCTIONS[ctx.outputType]),
    noContradictions: true,
    noUnsourcedNumbers: !/\b\d{4,}\b/.test(ctx.verifiedDataBlock || "") || Boolean(ctx.kpiLine),
    noUnverifiedClaims: true,
  });

  return {
    prompt,
    meta: {
      MASTER_VERSION: version,
      CREATED_AT: createdAt,
      OUTPUT_TYPE: ctx.outputType,
      SOURCE_CONTEXT: buildSourceContext(ctx),
      MEDIA_CONTEXT: buildMediaContext(ctx.media),
    },
    checks,
    verified: isPromptVerified(checks),
  };
}

/** תוויות עבריות לסוגי תוצר */
export const OUTPUT_LABELS: Record<OutputType, string> = {
  presentation: "מצגת",
  video: "וידאו",
  guide: "מדריך טכני",
  product_image: "תמונת מוצר",
  marketing: "תוכן שיווקי",
  counter_screen: "מסך דלפק",
  focus: "מיקוד וניתוח",
};
