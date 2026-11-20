/** עזרי תאריך: ממיר כל פורמט ל-ISO (yyyy-mm-dd) ומציג בעברית */

const pad = (n: number) => String(n).padStart(2, "0");

/** מקבל: 2026-10-18 | 18/10/2026 | "שבוע שעבר (19/10/2026)" | "Sun Oct 13 2024 ..." | ISO timestamp */
export function toIso(raw: unknown): string {
  const str = raw == null ? "" : String(raw).trim();
  if (!str) return "";
  let m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = str.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isoToDate(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return isNaN(dt.getTime()) ? null : dt;
}

/** "יום ראשון, 13 באוקטובר 2024" */
export function fmtLong(raw: unknown): string {
  const iso = toIso(raw);
  const d = isoToDate(iso);
  return d
    ? d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : String(raw ?? "");
}

/** "13 באוק׳ 2024" */
export function fmtShort(raw: unknown): string {
  const d = isoToDate(toIso(raw));
  return d ? d.toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" }) : String(raw ?? "");
}

/** "אוקטובר 2026" */
export function fmtMonthYear(iso: string): string {
  const d = isoToDate(iso);
  return d ? d.toLocaleDateString("he-IL", { month: "long", year: "numeric" }) : "ללא תאריך";
}

export function relativeFromIso(iso: string): string {
  const d = isoToDate(iso);
  if (!d) return "—";
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "היום";
  if (days === 1) return "אתמול";
  if (days < 30) return `לפני ${days} ימים`;
  if (days < 365) return `לפני ${Math.round(days / 30)} חודשים`;
  return `לפני ${(days / 365).toFixed(1)} שנים`;
}

const JERUSALEM_DT: Intl.DateTimeFormatOptions = {
  timeZone: "Asia/Jerusalem",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

/**
 * מציג ISO/תאריך בשעון ישראל (חורף/קיץ אוטומטי).
 * דוגמה: 2026-11-18T13:17:00.000Z → "18.11.2026, 15:17"
 * ערכים שאינם תאריך תקף מוחזרים כמחרוזת מקורית.
 */
export function formatJerusalemDateTime(raw: unknown): string {
  if (raw == null || raw === "") return "";
  const str = String(raw).trim();
  if (!str || str === "—") return str;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return new Intl.DateTimeFormat("he-IL", JERUSALEM_DT).format(d);
}
