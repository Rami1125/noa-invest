/**
 * ituran-live.ts — שכבת שרת נועה מול אירועי PTO / עצירות מאיתוראן
 * מקור כמעט-חי: GAS pollIturanAll → גיליון איתוראן_PTO + עצירות
 *
 * אין להציג כ"מיקום GPS חי רציף" — רק אירועי התראה / דוח עצירות עם זמן.
 */

export type IturanPtoEvent = {
  truck: string;
  driver: string;
  eventType: "pto_open" | "pto_close" | "pto_unknown" | string;
  eventTimeIso: string;
  address: string;
  ingestedAt?: string;
};

export type HandwrittenCraneWindow = {
  noteId?: string;
  truck?: string;
  address?: string;
  /** דקות מתחילת היום או ISO — מה שמגיע מהתעודה */
  openTime?: string;
  closeTime?: string;
  openIso?: string;
  closeIso?: string;
};

export type CraneMatchResult = {
  evidence: "from_store" | "partial" | "unavailable";
  evidenceLabelHe: string;
  summaryHe: string;
  ptoEvents: IturanPtoEvent[];
  handwritten?: HandwrittenCraneWindow;
  match?: {
    kind: "aligned" | "mismatch" | "pto_only" | "hand_only";
    deltaMinutes?: number;
    detailHe: string;
  };
  fetchedAt?: string;
  source?: string;
};

const LABEL = {
  from_store: "נמצא במאגר",
  partial: "מידע חלקי",
  unavailable: "לא זמין / נדרש אימות",
} as const;

/** נרמול לוחית: 615-41-002 */
export function normalizePlate(p: string): string {
  return String(p || "")
    .replace(/\s+/g, "")
    .replace(/[־–]/g, "-")
    .trim();
}

export function parseTimeToMinutes(raw?: string): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return +m[1] * 60 + +m[2];
}

export function isoToMinutesIL(iso: string): number | null {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    // המרה מדויקת לשעון ישראל (Asia/Jerusalem - UTC+2 חורף / UTC+3 קיץ) מול כתב היד
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(d);
    let h = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    if (h === 24) h = 0;
    const m = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
    return h * 60 + m;
  } catch {
    return null;
  }
}

/**
 * השוואת פתיחת מנוף (PTO) מול כתב יד
 * סף סבירות ברירת מחדל: ±15 דקות
 */
export function matchCranePto(
  events: IturanPtoEvent[],
  hand?: HandwrittenCraneWindow,
  opts?: { toleranceMin?: number },
): CraneMatchResult {
  const tolerance = opts?.toleranceMin ?? 15;
  const opens = events.filter((e) => e.eventType === "pto_open" || e.eventType === "pto_unknown");

  if (opens.length === 0 && !hand?.openTime && !hand?.openIso) {
    return {
      evidence: "unavailable",
      evidenceLabelHe: LABEL.unavailable,
      summaryHe:
        "אין בידי אירוע פתיחת PTO מאיתוראן ואין זמן כתב-יד להשוואה. לא ניתן לקבוע מתי נפתח המנוף.",
      ptoEvents: events,
    };
  }

  if (opens.length === 0 && (hand?.openTime || hand?.openIso)) {
    return {
      evidence: "partial",
      evidenceLabelHe: LABEL.partial,
      summaryHe:
        "יש רישום כתב-יד לפתיחת מנוף, אך אין אירוע PTO תואם במאגר איתוראן לטווח שנבדק. מידע חלקי בלבד.",
      ptoEvents: events,
      handwritten: hand,
      match: { kind: "hand_only", detailHe: "כתב-יד בלבד — ללא אימות איתוראן" },
    };
  }

  // יש PTO
  const handMin =
    (hand?.openIso ? isoToMinutesIL(hand.openIso) : null) ?? parseTimeToMinutes(hand?.openTime);

  // מציאת אירוע ה-PTO הקרוב ביותר לשעת כתב-היד (במקום לקחת שרירותית את האחרון)
  let bestPto = opens[0]!;
  if (handMin != null) {
    let minDelta = Infinity;
    for (const op of opens) {
      const pMin = isoToMinutesIL(op.eventTimeIso) ?? parseTimeToMinutes(op.eventTimeIso);
      if (pMin != null) {
        let d = Math.abs(pMin - handMin);
        if (d > 12 * 60) d = Math.abs(d - 24 * 60);
        if (d < minDelta) {
          minDelta = d;
          bestPto = op;
        }
      }
    }
  } else {
    bestPto = opens.slice().sort((a, b) => (a.eventTimeIso < b.eventTimeIso ? 1 : -1))[0]!;
  }
  const latest = bestPto;

  if (!hand?.openTime && !hand?.openIso) {
    const when = formatIl(latest.eventTimeIso);
    return {
      evidence: "from_store",
      evidenceLabelHe: LABEL.from_store,
      summaryHe: `לפי התראת איתוראן (פתיחת PTO): משאית ${latest.truck}, נהג ${latest.driver || "לא צוין"}, ב־${when}${latest.address ? `, מיקום: ${latest.address}` : ""}. אין כתב-יד להצלבה במקור שסופק.`,
      ptoEvents: opens,
      match: { kind: "pto_only", detailHe: "איתוראן בלבד" },
      source: "ituran_pto_sheet",
    };
  }

  const ptoMin =
    isoToMinutesIL(latest.eventTimeIso) ?? parseTimeToMinutes(latest.eventTimeIso);

  if (ptoMin == null || handMin == null) {
    return {
      evidence: "partial",
      evidenceLabelHe: LABEL.partial,
      summaryHe:
        "קיימים נתוני PTO וכתב-יד אך לא ניתן לחשב הפרש זמנים חד-משמעי (פורמט זמן חסר/לא אחיד).",
      ptoEvents: opens,
      handwritten: hand,
      match: { kind: "mismatch", detailHe: "פורמט זמן לא בר-השוואה" },
    };
  }

  let delta = Math.abs(ptoMin - handMin);
  // טיפול בחצות גס
  if (delta > 12 * 60) delta = Math.abs(delta - 24 * 60);

  if (delta <= tolerance) {
    return {
      evidence: "from_store",
      evidenceLabelHe: LABEL.from_store,
      summaryHe: `התאמה: פתיחת PTO באיתוראן (${formatIl(latest.eventTimeIso)}) וכתב-יד (${hand.openTime || hand.openIso}) בטווח ±${tolerance} דק' (הפרש ≈ ${delta} דק'). משאית ${latest.truck}${latest.address ? ` · ${latest.address}` : ""}.`,
      ptoEvents: opens,
      handwritten: hand,
      match: { kind: "aligned", deltaMinutes: delta, detailHe: "PTO מול כתב-יד — תואם" },
      source: "ituran_pto_sheet+handwritten",
    };
  }

  return {
    evidence: "partial",
    evidenceLabelHe: LABEL.partial,
    summaryHe: `אי-התאמה אפשרית: PTO איתוראן ${formatIl(latest.eventTimeIso)} מול כתב-יד ${hand.openTime || hand.openIso} (הפרש ≈ ${delta} דק', מעל סף ${tolerance}). לא מוצג כאימות מלא.`,
    ptoEvents: opens,
    handwritten: hand,
    match: { kind: "mismatch", deltaMinutes: delta, detailHe: "פער מעל הסף" },
    source: "ituran_pto_sheet+handwritten",
  };
}

function formatIl(iso: string): string {
  try {
    return new Date(iso).toLocaleString("he-IL", {
      timeZone: "Asia/Jerusalem",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** האם השאלה על פתיחת מנוף / PTO / חכמת */
export function asksCraneOrPto(q: string): boolean {
  return /מנוף|pto|פתיחת\s*pto|סגירת\s*pto|חכמת|615-41-002|מתי\s+נפתח/i.test(q);
}




export async function fetchIturanPtoLive(token: string, truck?: string) {
  const gasUrl =
    (typeof process !== "undefined" && process.env?.["ITURAN_GAS_URL"]) ||
    "https://script.google.com/macros/s/AKfycbwi9M5HSO9E0sZrrZ8bdKLCf5mBYPaIk-j3ZY_Mram3qkSH8pU4i-bcG2XNeZ42o3c8Og/exec";

  let url = `${gasUrl}?action=getIturanPto&token=${encodeURIComponent(token)}`;
  if (truck) {
    url += `&truck=${encodeURIComponent(truck)}`;
  }

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`שגיאת תקשורת מול שרת האיתוראן: ${res.status}`);
  }
  return await res.json();
}
