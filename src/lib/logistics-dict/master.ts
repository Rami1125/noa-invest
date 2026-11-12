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

export const DEFAULT_MASTER_INSTRUCTIONS = `=== שכבת מאסטר מרכזית — SABAN MASTER CREATIVE ENGINE ===
[A. זהות המותג]
• ח. סבן חומרי בניין (1994) בע"מ — מותג מקצועי, אמין, איכותי, ישראלי ומוביל בתחום חומרי הבנייה, השלד, הגבס, האגרגטים והלוגיסטיקה.
• שפה וכיווניות: עברית מלאה, מקצועית ותקנית · יישור RTL מוחלט.

[B. תפקיד המערכת]
• פעל כמנהל קריאייטיב בכיר, יועץ טכני לענף הבנייה, עורך תוכן ומפיק מדיה מקצועי עבור מחברת NotebookLM "יועץ טכני" של ח. סבן.

[C. אמינות ובקרת עובדות מחייבת]
• כל נתון טכני חייב להיות מבוסס אך ורק על מקורות אמינים שהועלו (ארכיון תעודות גליה, מילון לוגיסטי, מפרטי יצרן, דפי מוצר רשמיים, תקנים ומדריכי ביצוע).
• אין להמציא מק"טים, מחירים, מידות, תקנים, ביצועים, כמויות או נתוני שימוש.
• יש להבדיל במפורש בין נתון מאומת מהמערכת, הערכה הנדסית והמלצה תפעולית.
• כאשר מידע חסר או לא אומת — יש לציין זאת במפורש ("חסר נתון מאומת במקור").
• אין להציג מוצר חלופי כאילו הוא המוצר המקורי, ואין להסיק תאימות טכנית רק מכך ששני מוצרים נרכשו יחד.
• אין להמציא תכונות למוצר על בסיס תמונה בלבד.

[D. שפה חזותית — PREMIUM ARCHITECTURAL EDITORIAL]
• פלטת צבעים מחייבת: לבן נקי (#FFFFFF) · כחול עמוק (#15324B) · תכלת בהיר (#DCEAF3) · אפור בטון (#858B91) · אבן טבעית (#E8E2D8) · טקסט כהה (#1C2732) · הדגשה אמרלד (#0F766E).
• עיצוב אדריכלי מוקפד, היררכיה ברורה, טיפוגרפיה עברית כבדה וקריאה, שטח לבן נדיב. תמונה איכותית אחת עדיפה על עומס תמונות.
• אסור: גרדיאנטים צעקניים, קישוטים מיותרים, סטוק גנרי אמריקאי או עיצוב פלסטי/CGI.`;

export const APPROVED_MASTER_ENTRY: MasterVersionEntry = {
  version: APPROVED_MASTER_VERSION,
  updatedAt: "2026-11-12T00:00:00.000Z",
  label: "גרסת מאסטר מאושרת (ברירת מחדל)",
  instructions: DEFAULT_MASTER_INSTRUCTIONS,
  isApprovedDefault: true,
};

export const INITIAL_MASTER_CONFIG: MasterConfigState = {
  activeVersion: APPROVED_MASTER_VERSION,
  updatedAt: APPROVED_MASTER_ENTRY.updatedAt,
  instructions: DEFAULT_MASTER_INSTRUCTIONS,
  history: [APPROVED_MASTER_ENTRY],
};

const STORAGE_KEY = "saban_master_creative_engine_config_v1";

export function loadMasterConfig(): MasterConfigState {
  if (typeof window === "undefined") return INITIAL_MASTER_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_MASTER_CONFIG;
    const parsed = JSON.parse(raw) as Partial<MasterConfigState>;
    if (!parsed.instructions || !parsed.activeVersion) return INITIAL_MASTER_CONFIG;
    const history = Array.isArray(parsed.history) && parsed.history.length
      ? parsed.history
      : [APPROVED_MASTER_ENTRY];
    return {
      activeVersion: parsed.activeVersion,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      instructions: parsed.instructions,
      history,
    };
  } catch {
    return INITIAL_MASTER_CONFIG;
  }
}

export function persistMasterConfig(config: MasterConfigState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage quota errors gracefully
  }
}

/**
 * שמירת גרסה חדשה של הנחיות המאסטר עם גיבוי אוטומטי של הגרסה הקודמת
 */
export function saveNewMasterVersion(
  current: MasterConfigState,
  nextInstructions: string,
  label?: string,
): MasterConfigState {
  const clean = nextInstructions.trim();
  if (!clean) return current;
  const now = new Date().toISOString();
  const nextNum = current.history.length + 1;
  const nextVersion = `v2026.${nextNum}`;
  const newEntry: MasterVersionEntry = {
    version: nextVersion,
    updatedAt: now,
    label: label?.trim() || `עדכון מאסטר ${nextNum}`,
    instructions: clean,
  };
  // שמירת גיבוי: הגרסה הקודמת נשמרת בהיסטוריה ולעולם אינה נדרסת
  const nextState: MasterConfigState = {
    activeVersion: nextVersion,
    updatedAt: now,
    instructions: clean,
    history: [newEntry, ...current.history].slice(0, 20),
  };
  persistMasterConfig(nextState);
  return nextState;
}

/**
 * שחזור גרסה קודמת מתוך היסטוריית הגרסאות
 */
export function restoreMasterVersion(
  current: MasterConfigState,
  versionToRestore: string,
): MasterConfigState {
  const found = current.history.find((h) => h.version === versionToRestore);
  if (!found) return current;
  const nextState: MasterConfigState = {
    ...current,
    activeVersion: found.version,
    updatedAt: new Date().toISOString(),
    instructions: found.instructions,
  };
  persistMasterConfig(nextState);
  return nextState;
}

/**
 * איפוס לגרסה המאושרת הראשונית תוך שמירת הגיבויים בהיסטוריה
 */
export function resetToApprovedMaster(current: MasterConfigState): MasterConfigState {
  const hasApproved = current.history.some((h) => h.version === APPROVED_MASTER_VERSION);
  const history = hasApproved ? current.history : [...current.history, APPROVED_MASTER_ENTRY];
  const nextState: MasterConfigState = {
    activeVersion: APPROVED_MASTER_VERSION,
    updatedAt: new Date().toISOString(),
    instructions: DEFAULT_MASTER_INSTRUCTIONS,
    history,
  };
  persistMasterConfig(nextState);
  return nextState;
}
