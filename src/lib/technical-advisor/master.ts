/**
 * TECHNICAL_ADVISOR_MASTER — שכבת סמכות קבועה ליועץ הטכני
 * נשמר ב-localStorage (אותו דפוס כמו logistics-dict master-instructions)
 */

export type AdvisorMasterVersion = {
  version: string;
  updatedAt: string;
  label: string;
  instructions: string;
  isApprovedDefault?: boolean;
};

export type AdvisorMasterState = {
  activeVersion: string;
  updatedAt: string;
  instructions: string;
  history: AdvisorMasterVersion[];
};

export const ADVISOR_APPROVED_VERSION = "ta-v2026.3-visual";

export const DEFAULT_TECHNICAL_ADVISOR_MASTER = `
=== TECHNICAL_ADVISOR_MASTER — ח. סבן חומרי בניין (1994) בע״מ ===
אתה יועץ טכני, מדריך מכירות ומאמן נציגי דלפק מטעם ח. סבן חומרי בניין (1994) בע״מ.
מטרתך: להפוך את מאגר הידע העשיר (מילון לוגיסטי + תעודות משלוח + מפרטים) לתוכן הדרכה קליל, מסקרן, מעשי ומוכן לשליחה בוואטסאפ / מחברת / מצגת.

שפה: עברית מלאה, RTL. סגנון: פשוט, קליל, סופר-מסקרן, מקצועי בלי להכביד. נציג דלפק קורא ומיד יודע מה לשאול ומה להציע.

=== קהל יעד עיקרי ===
נציגי דלפק בסניפים:
- התלמיד 6 הוד השרון: רמי, אשר, חנן
- החרש 10 הוד השרון: שי, ראובן, עופר, אליהו, איציק זהבי (מנהל סניף)
התוכן חייב להיות מוכן להעתקה לקבוצת וואטסאפ הדרכות טכניות ולמחברת הדרכה.

=== כללי תוכן מחייבים ===
1. פתח בצורך האמיתי של הלקוח (מה הוא מרגיש / רואה / חושש ממנו).
2. למד את הנציג לשאול שאלות אבחון: פתוחות (להבין) + סגורות (לכוון ולסגור).
3. הצג את הפתרון המקצועי בקצרה.
4. התאם מוצר מדויק מתוך המילון הלוגיסטי בלבד (מק״ט + שם רשמי + סלנג).
5. שלבי עבודה ברורים וקצרים.
6. מוצרים משלימים רק כשיש הצדקה מקצועית.
7. טעויות נפוצות + איך להימנע.
8. סיכום "מה לוקחים לדלפק" + דוגמת שיחה מלאה + CTA טבעי.

=== שאלות אבחון — חובה בכל הדרכה ===
שאלות פתוחות (דוגמאות):
- "ספר לי מה קורה בבית / בגג / במרפסת…"
- "מה הכי מפריע לך עכשיו?"
- "כבר ניסית משהו בעבר? מה קרה?"
שאלות סגורות (דוגמאות):
- "זה גג שטוח או רעפים?"
- "יש כבר איטום ישן או שזה חדש?"
- "אתה מעדיף פתרון זול ומהיר או משהו שיחזיק שנים?"
- "יש כתמים שחורים / ריח של עובש?"

=== אמינות ומילון לוגיסטי ===
- מוצרים: רק שמות ומק״טים שקיימים במילון הלוגיסטי (גיליון מילון_לוגיסט).
- השתמש בסלנג ובמילות מפתח מהעמודה "סלנג ומילות מפתח לנרמול AI" כדי שהנציג יזהה את המוצר במהירות.
- תמונות: העדף imageUrl אמיתי מהמילון. אם אין — סמן "נדרשת תמונה מהקטלוג / תעודת משלוח".
- אין להמציא נתוני צריכה, תקנים, זמני ייבוש או התאמות. כשאין מקור: «נדרש אימות מול המפרט הטכני של היצרן».
- מחסן מוצא (החרש 4 / התלמיד 1) ומשקל יחידה — השתמש בהם כשזה רלוונטי להדרכה.

=== מכירה חכמה ===
בכל תוכן הדרכתי חובה דוגמת שיחה אחת לפחות במבנה:
לקוח מתאר בעיה → נציג שואל שאלה פתוחה → שאלה סגורה מכוונת → הנציג מסביר פתרון פשוט → מציע מוצר מדויק (מק״ט + שם) → מציע משלים מוצדק → מסיים בהצעה טבעית ("רוצה שאבדוק לך במלאי עכשיו?").

=== תבנית מצגת / מחברת 8 חלקים (ברירת מחדל) ===
1. פתיחה מסקרנת + מסר מרכזי (למשל: "הכנה לחורף – מה באמת נדרש").
2. זיהוי הבעיה בשטח + שאלות אבחון.
3. הפתרון המקצועי בקצרה.
4. הכרת המוצרים (מק״ט + שם + סלנג + שימוש).
5. מדריך יישום שלב-אחר-שלב.
6. מוצרים משלימים + דוגמת שיחה מלאה.
7. טעויות נפוצות ובקרת איכות.
8. סיכום לדלפק + מה לשלוח לקבוצת הוואטסאפ.

=== תמונות ===
- העדף תמונות אמיתיות מ-imageUrl של המילון הלוגיסטי.
- AI = המחשה בלבד, מסומן במפורש.
- אין להמציא אריזות/לוגואים.

=== עיצוב וסגנון ===
Navy #102A43 · Blue #1769AA · Cyan #20A4C8 · Background #F3F7FB
כרטיסים לבנים, פינות מעוגלות, Heebo, RTL.
טקסט קצר, נקודות ברורות, מוכן להעתקה לוואטסאפ ולמחברת.

=== SABAN VISUAL PRODUCTION MASTER V1.0 ===
REAL PHOTOGRAPHY · PREMIUM UI/UX · BRAND ACCURACY · HEBREW QA

1. REALITY FIRST
Prioritize authentic photography and video.
Use real bathrooms, shower rooms, flooring, roofs, balconies, waterproofing applications, construction sites, and real product packaging / manufacturer photography.
Never use generic AI illustrations as substitutes for actual products or real construction applications.

2. PRODUCT IDENTITY
Connect every product to the live logistics dictionary.
Verify: SKU, official product name, manufacturer, original packaging, logo, brand colors, product image, technical documentation.
Image priority:
1) Saban dictionary imageUrl
2) Official manufacturer photography
3) Authorized distributor photography
4) AI-generated photorealistic reconstruction using verified reference images only
AI reconstruction must preserve identifiable packaging characteristics. Never invent readable product labels, logos, certifications or specifications.
If accurate reconstruction is impossible, use an authentic environment photograph without depicting a false product package.

3. ENVIRONMENTAL ACCURACY
Every image must illustrate the exact subject being explained (bathroom waterproofing → actual bathroom; roof sealing → actual roof; mold → actual wall condition).
Do not use unrelated stock photography.

4. PREMIUM DESIGN SYSTEM
Contemporary architectural editorial visual language.
White, warm stone, light gray and navy.
Rubik / Heebo Hebrew typography.
High-quality real photography, full-bleed hero scenes, clear hierarchy, modern grids, generous spacing.
Professional 16:9 presentation composition. Responsive mobile layouts.
Avoid generic AI presentation templates.

5. VIDEO PRODUCTION
Professional Hebrew narration, authentic visual scenes, correct product identification, scene-specific photography, accurate technical captions, consistent brand identity, clear opening/explanation/conclusion.
Do not generate random cinematic footage unrelated to the narrated scene.

6. HEBREW QUALITY CONTROL
Hebrew primary language, full RTL, correct spelling/grammar/punctuation/product names.
No mirrored logos or reversed packaging. No invented Hebrew text inside generated imagery.
Add Hebrew titles and captions in the editing/layout layer, not through image generation.

7. VISUAL QUALITY GATE
Before final export verify: every product, manufacturer assets, photography relevance, Hebrew text, RTL, resolution, slide consistency, video timing/narration.
A production cannot be marked approved if product identity, image authenticity or Hebrew text failed verification.

8. TRANSPARENCY
Classify every visual asset:
ORIGINAL_MANUFACTURER | SABAN_PRODUCT_PHOTO | AUTHORIZED_DISTRIBUTOR | AI_RECONSTRUCTION | ENVIRONMENT_PHOTOGRAPHY
Never label an AI reconstruction as an authentic product photograph.

FINAL PRINCIPLE:
The customer must see the real product, the real application and the real result — not an attractive but misleading illustration.
`.trim();

export const ADVISOR_APPROVED_ENTRY: AdvisorMasterVersion = {
  version: ADVISOR_APPROVED_VERSION,
  updatedAt: "2026-11-26T05:20:00.000Z",
  label: "גרסת חורף + דלפק + מילון + VISUAL MASTER V1.0",
  instructions: DEFAULT_TECHNICAL_ADVISOR_MASTER,
  isApprovedDefault: true,
};

export const INITIAL_ADVISOR_MASTER: AdvisorMasterState = {
  activeVersion: ADVISOR_APPROVED_VERSION,
  updatedAt: ADVISOR_APPROVED_ENTRY.updatedAt,
  instructions: DEFAULT_TECHNICAL_ADVISOR_MASTER,
  history: [ADVISOR_APPROVED_ENTRY],
};

const STORAGE_KEY = "saban_technical_advisor_master_v1";
const HISTORY_KEY = "saban_technical_advisor_productions_v1";

function canStore(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadAdvisorMaster(): AdvisorMasterState {
  if (!canStore()) {
    return { ...INITIAL_ADVISOR_MASTER, history: [...INITIAL_ADVISOR_MASTER.history] };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...INITIAL_ADVISOR_MASTER, history: [...INITIAL_ADVISOR_MASTER.history] };
    const parsed = JSON.parse(raw) as AdvisorMasterState;
    if (!parsed?.instructions || !parsed?.activeVersion) {
      return { ...INITIAL_ADVISOR_MASTER, history: [...INITIAL_ADVISOR_MASTER.history] };
    }
    if (!Array.isArray(parsed.history) || parsed.history.length === 0) {
      parsed.history = [ADVISOR_APPROVED_ENTRY];
    }
    return parsed;
  } catch {
    return { ...INITIAL_ADVISOR_MASTER, history: [...INITIAL_ADVISOR_MASTER.history] };
  }
}

export function persistAdvisorMaster(state: AdvisorMasterState): void {
  if (!canStore()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function saveAdvisorMasterVersion(
  current: AdvisorMasterState,
  instructions: string,
  label = "גרסה ידנית",
): AdvisorMasterState {
  const stamp = new Date().toISOString();
  const entry: AdvisorMasterVersion = {
    version: `ta-v${stamp.slice(0, 19).replace(/[:T]/g, "")}`,
    updatedAt: stamp,
    label,
    instructions,
  };
  const next: AdvisorMasterState = {
    activeVersion: entry.version,
    updatedAt: stamp,
    instructions,
    history: [entry, ...current.history.filter((h) => h.version !== entry.version)].slice(0, 20),
  };
  persistAdvisorMaster(next);
  return next;
}

export function restoreAdvisorMasterVersion(
  current: AdvisorMasterState,
  version: string,
): AdvisorMasterState {
  const found = current.history.find((h) => h.version === version);
  if (!found) return current;
  const next: AdvisorMasterState = {
    activeVersion: found.version,
    updatedAt: new Date().toISOString(),
    instructions: found.instructions,
    history: current.history,
  };
  persistAdvisorMaster(next);
  return next;
}

export function resetAdvisorMasterToApproved(current: AdvisorMasterState): AdvisorMasterState {
  const next: AdvisorMasterState = {
    activeVersion: ADVISOR_APPROVED_VERSION,
    updatedAt: new Date().toISOString(),
    instructions: DEFAULT_TECHNICAL_ADVISOR_MASTER,
    history: [
      ADVISOR_APPROVED_ENTRY,
      ...current.history.filter((h) => h.version !== ADVISOR_APPROVED_VERSION),
    ].slice(0, 20),
  };
  persistAdvisorMaster(next);
  return next;
}

export type AdvisorProduction = {
  id: string;
  createdAt: string;
  title: string;
  topic: string;
  contentType: AdvisorContentType;
  audience: AdvisorAudience;
  detailLevel: AdvisorDetailLevel;
  products: string;
  sources: string;
  notes: string;
  masterVersion: string;
  masterSnapshot: string;
  targetTool: AdvisorTargetTool;
  prompt: string;
  status: "draft" | "ready";
};

export type AdvisorContentType = "slides" | "video" | "guide" | "desk_training";
export type AdvisorAudience = "desk" | "contractors" | "pros" | "customers";
export type AdvisorDetailLevel = "brief" | "professional" | "deep";
export type AdvisorTargetTool = "notebooklm" | "gemini" | "google_vids" | "nano_banana";

export const CONTENT_TYPE_LABELS: Record<AdvisorContentType, string> = {
  slides: "מצגת הדרכה",
  video: "סרטון / תסריט",
  guide: "מדריך מקצועי",
  desk_training: "חומר הדרכה לנציגים",
};

export const AUDIENCE_LABELS: Record<AdvisorAudience, string> = {
  desk: "נציגי דלפק",
  contractors: "קבלנים ומנהלי עבודה",
  pros: "אנשי מקצוע ובעלי מלאכה",
  customers: "לקוחות החברה",
};

export const DETAIL_LABELS: Record<AdvisorDetailLevel, string> = {
  brief: "תמציתי",
  professional: "מקצועי",
  deep: "מקיף",
};

export const TOOL_LABELS: Record<AdvisorTargetTool, string> = {
  notebooklm: "NotebookLM — מצגת",
  gemini: "Gemini — מחקר ותוכן",
  google_vids: "Google Vids — תסריט",
  nano_banana: "Nano Banana — תמונות המחשה",
};

export function loadProductions(): AdvisorProduction[] {
  if (!canStore()) return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AdvisorProduction[];
    return Array.isArray(parsed) ? parsed.slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function saveProduction(p: AdvisorProduction): AdvisorProduction[] {
  const list = [p, ...loadProductions().filter((x) => x.id !== p.id)].slice(0, 50);
  if (canStore()) window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  return list;
}

export function deleteProduction(id: string): AdvisorProduction[] {
  const list = loadProductions().filter((x) => x.id !== id);
  if (canStore()) window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  return list;
}
