/**
 * מחולל פקודת מצגת ניהולית ליום אספקה
 * מזריק DATA_FROM_SHEET מלא + ציר זמן ויזואלי + ממצאי רינטגן
 */

import type { DeliveryDayPayload, DeliveryNoteDayRow, XrayFinding } from "./delivery-day-data";
import { getSeedDeliveryDay } from "./delivery-day-data";

export type DeliveryDayPromptInput = {
  dateIso: string;
  dateLabel: string;
  truck?: string;
  driver?: string;
  slideCount?: number;
  extraNotes?: string;
  verifiedLines?: string[];
  /** נתוני יום מאומתים (ארכיון + רינטגן) — אם חסר, מנסה seed לפי dateIso */
  day?: DeliveryDayPayload | null;
};

export function formatHeDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function formatNoteBlock(n: DeliveryNoteDayRow, idx: number): string {
  const lines = [
    `${idx}) ${n.noteId} | ${n.noteTime || "—"} | ${n.customerName} | ${n.address}`,
  ];
  if (n.customerNo) lines.push(`   לקוח #${n.customerNo}${n.orderId ? ` · הזמנה ${n.orderId}` : ""}`);
  if (n.craneText) lines.push(`   מנוף: ${n.craneText}`);
  if (n.ituranArrive || n.ituranDepart || n.ituranStopMin != null) {
    lines.push(
      `   איתוראן: ${n.ituranArrive || "?"}–${n.ituranDepart || "?"}${n.ituranStopMin != null ? ` (${n.ituranStopMin} דק')` : ""}`,
    );
  }
  if (n.itemsRaw) lines.push(`   פריטים: ${n.itemsRaw}`);
  if (n.depositsRaw) lines.push(`   פקדונות: ${n.depositsRaw}`);
  if (n.signedBy) lines.push(`   חתימה: ${n.signedBy}`);
  if (n.status) lines.push(`   סטטוס: ${n.status}`);
  if (n.scanFile) lines.push(`   סריקה: ${n.scanFile}${n.scanPage != null ? ` עמ' ${n.scanPage}` : ""}`);
  if (n.driveUrl) lines.push(`   Drive: ${n.driveUrl}`);
  if (n.handwrittenNotes) lines.push(`   כתב יד: ${n.handwrittenNotes}`);
  if (n.gpsMatch) lines.push(`   GPS: ${n.gpsMatch}`);
  return lines.join("\n");
}

function formatTimeline(notes: DeliveryNoteDayRow[]): string {
  const sorted = [...notes].sort((a, b) => (a.noteTime || "").localeCompare(b.noteTime || ""));
  const rows = sorted.map((n) => {
    const crane =
      n.craneOpen && n.craneClose
        ? `${n.craneOpen}→${n.craneClose}${n.craneMin != null ? ` (${n.craneMin}')` : ""}`
        : n.craneText || "—";
    return `| ${n.noteTime || "—"} | ${n.noteId} | ${n.customerName.slice(0, 28)} | ${n.address.slice(0, 32)} | ${crane} |`;
  });
  return [
    "| שעת תעודה | מס' | לקוח | כתובת | חלון מנוף |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function formatXray(xray: XrayFinding[]): string {
  if (!xray.length) return "אין ממצאי רינטגן פתוחים ליום זה.";
  return xray
    .map(
      (x) =>
        `- [${x.severity}] ${x.noteId} · ${x.checkId}: ${x.finding}${x.suggestedFix ? ` → ${x.suggestedFix}` : ""} (${x.status || "פתוח"})`,
    )
    .join("\n");
}

export function buildDataFromSheetBlock(day: DeliveryDayPayload, dateLabel: string): string {
  const craneNote =
    day.craneMinSumCorrected != null && day.craneMinSumCorrected !== day.craneMinSum
      ? `דק' מנוף בגיליון: ${day.craneMinSum} · מתוקן מול סריקה/רינטגן: ${day.craneMinSumCorrected}`
      : `דק' מנוף: ${day.craneMinSum}`;

  const notesBlock = day.notes.map((n, i) => formatNoteBlock(n, i + 1)).join("\n\n");
  const stornoBlock =
    day.stornos.length === 0
      ? "אין"
      : day.stornos
          .map(
            (s) =>
              `- ${s.noteId} · ${s.customerName} · ${s.address}${s.stornoOf ? ` ↔ ${s.stornoOf}` : ""}${s.handwrittenNotes ? ` · ${s.handwrittenNotes}` : ""}`,
          )
          .join("\n");

  return `=== DATA_FROM_SHEET (ארכיון_תעודות_גליה · ${dateLabel}) ===
משאית: ${day.truck}
נהג: ${day.driver}
סריקה מקור: ${day.scanFile || "חסר במקור"}
טכוגרף / מד אוץ: חסר במקור
PTO עמודות גיליון: ${(day.missing || []).some((m) => /PTO/i.test(m)) ? "חסר במקור — יש זמני מנוף + איתוראן" : "לפי מקור"}

KPI:
- תעודות נטו: ${day.netNotes}
- סטורנו/בוטל: ${day.stornoNotes} (לא באספקה)
- לקוחות: ${day.customers}
- ${craneNote}
- פקדון 60002: ${day.dep60002} | 60060: ${day.dep60060} | 60006: ${day.dep60006}

ציר זמן (לפי שעת תעודה):
${formatTimeline(day.notes)}

תעודות נטו (פירוט מלא מארכיון):
${notesBlock}

סטורנו (לא אספקה):
${stornoBlock}

ממצאי רינטגן (מפקח):
${formatXray(day.xray)}

חסר במקור / להשלים:
${(day.missing || []).map((m) => `- ${m}`).join("\n") || "- אין"}
=== סוף נתונים ===`;
}

/**
 * פקודת 8 שקפים — NotebookLM / מנוע מצגות
 * כשיש day payload: מזריק נתונים אמיתיים; אחרת דורש חילוץ ממקורות שהועלו
 */
export function buildDeliveryDayPresentationPrompt(input: DeliveryDayPromptInput): string {
  const dateLabel = input.dateLabel || formatHeDate(input.dateIso);
  const slides = input.slideCount ?? 8;
  const day = input.day ?? getSeedDeliveryDay(input.dateIso);
  const truck = (input.truck || day?.truck || "").trim() || "(לחלץ מהגיליון)";
  const driver = (input.driver || day?.driver || "").trim() || "(לחלץ מהגיליון)";

  const dataBlock = day
    ? buildDataFromSheetBlock(day, dateLabel)
    : `=== DATA_FROM_SHEET ===
אין payload מאומת ליום ${dateLabel} במערכת.
חלץ אך ורק מסריקות PDF שהועלו + טאב ארכיון_תעודות_גליה שהועלה.
אסור להמציא מספרי תעודות, כמויות או זמני מנוף.
=== סוף ===`;

  const verified =
    input.verifiedLines && input.verifiedLines.length > 0
      ? input.verifiedLines.map((l, i) => `${i + 1}. ${l}`).join("\n")
      : day
        ? `נטען מארכיון/רינטגן: ${day.netNotes} נטו · ${day.customers} לקוחות · מנוף ${day.craneMinSumCorrected ?? day.craneMinSum} דק'`
        : "אין שורות מאומתות — הסתמך על מקורות שהועלו בלבד.";

  return `הפקת מצגת ניהולית — ${dateLabel}

צור כעת מצגת ניהולית-תפעולית בת ${slides} שקפים, בעברית מלאה ובכיווניות RTL.

כותרת ראשית קבועה:
ניתוח תעודות משלוח מגליון וממסמכי האספקה — ${dateLabel}

מקורות מחייבים: בלוק DATA_FROM_SHEET למטה + סריקות PDF ליום זה בלבד.
אסור להמציא נתונים. סטורנו לא נספר כאספקה. תמונות AI להמחשה בלבד ומסומנות.

עיצוב מקצועי (חובה):
- פלטה: #F3F7FB רקע · #102A43 כותרות · #1769AA הדגשות · #20A4C8 אקסנט · כרטיסים לבנים
- פונט Heebo / Rubik · RTL · שוליים נדיבים · היררכיה ברורה
- שקף 1: 4 כרטיסי KPI גדולים (מספר ענק + תווית קטנה)
- שקף 2 (מסלול): ציר זמן ויזואלי אופקי משמאל→ימין לפי שעת תעודה; כל תחנה = נקודה + כרטיס קטן (מס' תעודה, לקוח, חלון מנוף)
- צילומי סריקה מקוריים (אם הועלו) — לא AI; AI רק לרקע/אייקון וסמן «המחשה»
- טבלאות נקיות, מספרי תעודות מודגשים, אפס עומס טקסט

${dataBlock}

מבנה ${slides} שקפים:
1) יום במספרים — KPI: ${day ? `${day.netNotes} נטו · ${day.customers} לקוחות · ${day.craneMinSumCorrected ?? day.craneMinSum} דק' מנוף · ${day.dep60002}×60002` : "מהמקור בלבד"} | משאית ${truck} | נהג ${driver}
2) מסלול משאית — ציר זמן מדויק לפי טבלת «ציר זמן» למעלה (לא לסדר מחדש)
3) תעודות וחתימות — כרטיס לכל נטו + סטורנו בנפרד; קישורי Drive אם קיימים
4) מנוף / איתוראן — טבלת דק' מנוף מול שהיית איתוראן; ציין תיקון רינטגן אם יש (למשל 6716506: 23 לא 33)
5) מה סופק — מק\"ט וכמויות רק משורות הפריטים בבלוק
6) פקדונות — 60002 / 60060 / 60006 לפי לקוח + גרף
7) איכות + רינטגן — קריטי/אזהרה/מידע מבלוק הממצאים; אל תציג 100% תקין אם יש פתוחים
8) סיכום הנהלה — בוצע / אומת / להשלים (3 עמודות)

הוראות איכות:
- אל תספור סטורנו באספקה
- אל תמציא שעות מנוף/PTO/טכוגרף
- אם רינטגן תיקן משך מנוף — השתמש בערך המתוקן ב-KPI ובציר הזמן
- כל שקף = מסר אחד · ${slides} שקפים בדיוק
- הפק את השקפים עצמם, לא מדריך יצירה

--- אימות מערכת ---
${verified}

${input.extraNotes?.trim() ? `--- הערות משתמש ---\n${input.extraNotes.trim()}` : ""}
`.trim();
}
