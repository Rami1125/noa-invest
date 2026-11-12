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
ח. סבן חומרי בניין (1994) בע"מ — מותג מקצועי, אמין, איכותי, ישראלי.
תפקיד: מנהל קריאייטיב, יועץ טכני, עורך תוכן ומפיק מדיה.

אמינות: רק נתונים מאומתים ממפרט יצרן / ארכיון. אין להמציא מק"טים, מחירים, מידות או תקנים.
הבדל: נתון מאומת · הערכה · המלצה. מידע חסר — ציין במפורש.

שפה חזותית PREMIUM ARCHITECTURAL EDITORIAL:
#FFFFFF #15324B #DCEAF3 #858B91 #E8E2D8 #1C2732 #0F766E
עברית RTL · טיפוגרפיה כבדה · קומפוזיציה אדריכלית · ללא גרדיאנטים צעקניים.

מדיניות תמונות: 1 יצרן 2 צילום אמיתי 3 אתר אמיתי 4 AI להמחשה בלבד (סמן במפורש).
מסכי דלפק: 16:9 · 1920×1080 · כותרות גדולות · מסר אחד.
`.trim();

export const APPROVED_MASTER_ENTRY: MasterVersionEntry = {
  version: APPROVED_MASTER_VERSION,
  updatedAt: "2026-11-12T00:00:00.000Z",
  label: "גרסה מאושרת",
  instructions: DEFAULT_MASTER_INSTRUCTIONS,
  isApprovedDefault: true,
};

export const INITIAL_MASTER_CONFIG: MasterConfigState = {
  activeVersion: APPROVED_MASTER_VERSION,
  updatedAt: APPROVED_MASTER_ENTRY.updatedAt,
  instructions: DEFAULT_MASTER_INSTRUCTIONS,
  history: [APPROVED_MASTER_ENTRY],
};

const STORAGE_KEY = "saban_master_creative_engine_v1";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadMasterConfig(): MasterConfigState {
  if (!canUseStorage()) return { ...INITIAL_MASTER_CONFIG, history: [...INITIAL_MASTER_CONFIG.history] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...INITIAL_MASTER_CONFIG, history: [...INITIAL_MASTER_CONFIG.history] };
    const parsed = JSON.parse(raw) as MasterConfigState;
    if (!parsed?.instructions || !parsed?.activeVersion) {
      return { ...INITIAL_MASTER_CONFIG, history: [...INITIAL_MASTER_CONFIG.history] };
    }
    if (!Array.isArray(parsed.history) || parsed.history.length === 0) {
      parsed.history = [APPROVED_MASTER_ENTRY];
    }
    return parsed;
  } catch {
    return { ...INITIAL_MASTER_CONFIG, history: [...INITIAL_MASTER_CONFIG.history] };
  }
}

export function persistMasterConfig(config: MasterConfigState): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function saveNewMasterVersion(
  current: MasterConfigState,
  instructions: string,
  label = "גרסה ידנית",
): MasterConfigState {
  const stamp = new Date().toISOString();
  const entry: MasterVersionEntry = {
    version: `v${stamp.slice(0, 19).replace(/[:T]/g, "")}`,
    updatedAt: stamp,
    label,
    instructions,
  };
  const next: MasterConfigState = {
    activeVersion: entry.version,
    updatedAt: stamp,
    instructions,
    history: [entry, ...current.history].slice(0, 12),
  };
  persistMasterConfig(next);
  return next;
}

export function restoreMasterVersion(
  current: MasterConfigState,
  version: string,
): MasterConfigState {
  const found = current.history.find((h) => h.version === version);
  if (!found) return current;
  const next: MasterConfigState = {
    activeVersion: found.version,
    updatedAt: new Date().toISOString(),
    instructions: found.instructions,
    history: current.history,
  };
  persistMasterConfig(next);
  return next;
}

export function resetToApprovedMaster(current: MasterConfigState): MasterConfigState {
  const next: MasterConfigState = {
    activeVersion: APPROVED_MASTER_VERSION,
    updatedAt: new Date().toISOString(),
    instructions: DEFAULT_MASTER_INSTRUCTIONS,
    history: [
      APPROVED_MASTER_ENTRY,
      ...current.history.filter((h) => h.version !== APPROVED_MASTER_VERSION),
    ].slice(0, 12),
  };
  persistMasterConfig(next);
  return next;
}
