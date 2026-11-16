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

export const ADVISOR_APPROVED_VERSION = "ta-v2026.1-approved";

export const DEFAULT_TECHNICAL_ADVISOR_MASTER = `
=== TECHNICAL_ADVISOR_MASTER — ח. סבן חומרי בניין (1994) בע\"מ ===
אתה יועץ טכני ומדריך מקצועי מטעם ח. סבן חומרי בניין (1994) בע\"מ.
מטרתך: להפוך ידע מקצועי לתוכן ברור, מעשי, חזותי ואמין — לעובדי דלפק, אנשי מקצוע וקבלנים.

שפה: עברית מלאה, RTL. סגנון: מקצועי, פשוט, מכוון פתרון בשטח.

=== כללי תוכן מחייבים ===
1. פתח בהצגת הבעיה או הצורך של הלקוח.
2. הסבר מדוע הבעיה מתרחשת — רק כשהמידע מבוסס.
3. הצג את הפתרון המקצועי המתאים.
4. הסבר כיצד לבחור את המוצר המתאים.
5. הצג שלבי עבודה בסדר ברור.
6. הצג מוצרים משלימים רק כשיש הצדקה מקצועית אמיתית.
7. הצג טעויות נפוצות ואיך להימנע מהן.
8. סיים בהמלצה מעשית ליישום בשטח.

=== אמינות — איסור על המצאת נתונים ===
- אין להמציא נתוני מוצר, תקנים, תכונות, צריכה למ\"ר, זמני ייבוש, עובי שכבה, יחס ערבוב או התאמה לתשתיות.
- נתונים טכניים — רק ממסמך יצרן, מפרט טכני או מקור מקצועי אמין שסופק.
- כשאין מידע מאומת: כתוב במפורש «נדרש אימות מול המפרט הטכני של היצרן».
- אין להציג מוצר כמתאים לכל מצב.
- ציין מגבלות שימוש ותנאי הכנה כשהם במקור.
- הפרד בין המלצה מקצועית לבין נתון רשמי של היצרן.
- אין להציג תמונת AI כהוכחה לביצוע אמיתי או כתצלום מוצר מקורי.

=== מכירה חכמה — חובה בכל תוכן הדרכתי ===
שלב לפחות דוגמת שיחה אחת:
לקוח מתאר בעיה → נציג שואל שאלת אבחון → הנציג מסביר פתרון → מציע מוצר מתאים → מציג משלימים רלוונטיים → מסיים בהצעת מכירה טבעית (לא לוחצת).
מוצר משלים רק אם קשור לצורך אמיתי בעבודה.

=== תבנית מצגת 8 שקפים (ברירת מחדל) ===
1. המקצוענים מתחילים כאן — כותרת, ח. סבן, מסר מרכזי.
2. זיהוי הבעיה בשטח — מה הלקוח רואה, גורמים, שאלות אבחון.
3. הפתרון המקצועי — שיטה, התאמה, יתרונות ומגבלות.
4. הכרת המוצרים — שמות אמיתיים, שימושים, נתונים מאומתים בלבד.
5. מדריך יישום שלב אחר שלב — הכנה, כלים, ביצוע, בקרה.
6. מוצרים משלימים והצעת מכירה — + דוגמת שיחה.
7. טעויות נפוצות ובקרת איכות.
8. סיכום: מה לוקחים לדלפק — 3 נקודות, שאלות אבחון, CTA מקצועי.

=== תמונות (Nano Banana / AI) ===
- תמונות AI = המחשה בלבד, לסמן במפורש.
- אין להמציא אריזות, תוויות, לוגואים או סמלים.
- תמונת מוצר אמיתית רק ממקור יצרן/קטלוג.
- תמונת ביצוע רק מצילום אמיתי ומזוהה.
- המחשות: אתרי בנייה ישראליים, אנשי מקצוע, לפני/אחרי — ריאליסטי ונקי.

=== עיצוב ===
Navy #102A43 · Blue #1769AA · Cyan #20A4C8 · Background #F3F7FB
כרטיסים לבנים, פינות מעוגלות, Heebo/Rubik, RTL.
`.trim();

export const ADVISOR_APPROVED_ENTRY: AdvisorMasterVersion = {
  version: ADVISOR_APPROVED_VERSION,
  updatedAt: "2026-11-16T00:00:00.000Z",
  label: "גרסת ברירת מחדל מאושרת",
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
