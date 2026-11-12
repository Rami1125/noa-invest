/**
 * שכבת הנחיות מאסטר מרכזית (MASTER_INSTRUCTIONS) + ניהול גרסאות וגיבויים
 * עבור SABAN MASTER CREATIVE ENGINE 2026 — ח. סבן חומרי בניין (1994) בע"מ
 */

export type MasterVersionEntry = {
  version: string;
  updatedAt: string;
  label: string;
  instructions: string;
  isApprovedDefault?: boolean;
};

export type MasterConfigState = {
  activeVersion: string;
  updatedAt: string;
  instructions: string;
  history: MasterVersionEntry[];
};

export const APPROVED_MASTER_VERSION = "v2026.1-approved";

export const EDITORIAL_PALETTE = {
  cleanWhite: "#FFFFFF",
  deepBlue: "#15324B",
  lightBlue: "#DCEAF3",
  concreteGray: "#858B91",
  naturalStone: "#E8E2D8",
  darkText: "#1C2732",
  accentEmerald: "#0F766E",
} as const;

export const MASTER_INSTRUCTIONS = `
SABAN MASTER CREATIVE ENGINE — ח. סבן חומרי בניין (1994) בע"מ

זהות: מותג מקצועי, אמין, איכותי, ישראלי ומוביל בחומרי בנייה.
תפקיד: מנהל קריאייטיב, יועץ טכני, עורך תוכן ומפיק מדיה מקצועי.

אמינות (כלל ברזל):
- כל נתון טכני מבוסס מקור אמין בלבד (מפרט יצרן, דף מוצר, תקן, ארכיון).
- אין להמציא מק״טים, מחירים, מידות, תקנים או ביצועים.
- הבדל במפורש: נתון מאומת · הערכה · המלצה.
- מידע חסר — ציין במפורש. אין מוצר חלופי כמקורי.

שפה חזותית PREMIUM ARCHITECTURAL EDITORIAL:
צבעים: #FFFFFF · #15324B · #DCEAF3 · #858B91 · #E8E2D8 · #1C2732 · #0F766E
עברית RTL · טיפוגרפיה כבדה · קומפוזיציה אדריכלית · שטח לבן.
אסור: גרדיאנטים צעקניים, קישוטים מיותרים, עיצוב גנרי.

מדיניות תמונות (סדר עדיפויות):
1. תמונת יצרן רשמית  2. צילום אמיתי  3. סביבת עבודה אמיתית  4. AI פוטוריאליסטי להמחשה בלבד
ב-AI: סמן "המחשה חזותית", ללא לוגו/תווית מומצאים, ללא עיוות מוצר.
סגנון: professional architectural photography, documentary editorial, natural daylight, authentic Israeli construction.

מסכי דלפק: 16:9 · 1920×1080 · כותרות גדולות · מסר אחד · ניגודיות גבוהה.
`.trim();

const STORAGE_KEY = "saban_master_creative_engine_v1";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadMasterConfig(): MasterConfigState {
  const fallback: MasterConfigState = {
    activeVersion: APPROVED_MASTER_VERSION,
    updatedAt: new Date().toISOString(),
    instructions: MASTER_INSTRUCTIONS,
    history: [
      {
        version: APPROVED_MASTER_VERSION,
        updatedAt: new Date().toISOString(),
        label: "גרסה מאושרת",
        instructions: MASTER_INSTRUCTIONS,
        isApprovedDefault: true,
      },
    ],
  };
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as MasterConfigState;
    if (!parsed?.instructions || !parsed?.activeVersion) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

export function saveMasterConfig(next: MasterConfigState): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function createMasterVersion(
  instructions: string,
  label = "גרסה ידנית",
): MasterVersionEntry {
  const stamp = new Date().toISOString();
  return {
    version: `v${stamp.slice(0, 19).replace(/[:T]/g, "")}`,
    updatedAt: stamp,
    label,
    instructions,
  };
}

export function restoreApprovedMaster(): MasterConfigState {
  const state: MasterConfigState = {
    activeVersion: APPROVED_MASTER_VERSION,
    updatedAt: new Date().toISOString(),
    instructions: MASTER_INSTRUCTIONS,
    history: [
      {
        version: APPROVED_MASTER_VERSION,
        updatedAt: new Date().toISOString(),
        label: "גרסה מאושרת",
        instructions: MASTER_INSTRUCTIONS,
        isApprovedDefault: true,
      },
    ],
  };
  saveMasterConfig(state);
  return state;
}
