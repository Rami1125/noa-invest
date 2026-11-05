/**
 * P0 — עזרי grounding לצ׳אט נועה
 * סיוג שאלות, תוויות ראיה, בניית context מאומת בלבד
 */

export type EvidenceLevel =
  | "live_verified"
  | "from_store"
  | "historical"
  | "partial"
  | "unavailable";

export type BackendMeta = {
  notesSource?: "live" | "sample" | "unavailable";
  notesCount?: number;
  visitsCount?: number;
  ituranSource?: "sample" | "none" | string;
  matchedStops?: number;
  unmatchedStops?: number;
  date?: string | null;
  warning?: string;
  ituranError?: string;
  duplicateNotes?: number;
};

export const EVIDENCE_LABEL_HE: Record<EvidenceLevel, string> = {
  live_verified: "מאומת מהשרת",
  from_store: "נמצא במאגר",
  historical: "מידע היסטורי",
  partial: "מידע חלקי",
  unavailable: "לא זמין / נדרש אימות",
};

export function asksCurrentGps(q: string): boolean {
  return /(?:מיקום|איפה|היכן).{0,45}(?:משאית|רכב).{0,45}(?:כרגע|עכשיו|נוכחי|gps|איתוראן)?|(?:gps|איתוראן).{0,45}(?:מיקום|משאית|כרגע|עכשיו)|(?:משאית|רכב).{0,45}(?:מיקום|gps).{0,45}(?:כרגע|עכשיו)/i.test(
    q.trim(),
  );
}

export function asksSourceStatus(q: string): boolean {
  return /(?:אילו|איזה|מה).{0,45}(?:נתונים|מקורות).{0,45}(?:זמינים|מקור|מחובר|כרגע)?|(?:מה מקורם|אילו נתונים זמינים)|(?:האם).{0,20}(?:מחובר|מסונכרן)/i.test(
    q.trim(),
  );
}

export function asksLegacyDemoTopic(q: string): boolean {
  const t = q.toLowerCase();
  return (
    t.includes("חכמת") ||
    t.includes("615") ||
    t.includes("טכוגרף") ||
    t.includes("דיסקית") ||
    t.includes("רקפת") ||
    t.includes("עלי") ||
    t.includes("651") ||
    t.includes("חריג") ||
    t.includes("הצלבה") ||
    t.includes("פיצוח")
  );
}

export function gpsUnavailableMessage(): string {
  return "אין לי כרגע מיקום GPS חי ומאומת של המשאית. מסך הצ׳אט אינו מקבל נתוני מיקום חיים עם מזהה רכב וזמן עדכון, ולכן איני יכולה לקבוע היכן המשאית נמצאת או לאשר שאיתוראן מחובר.";
}

export function describeSources(meta: BackendMeta | null, fetchedAt: string | null): string {
  if (!meta) {
    return "אין עדיין דיווח מאומת מהשרת על מקורות הנתונים. הצגת מסך אינה מוכיחה חיבור למערכת חיצונית. בפרט, אין מיקום GPS חי מאומת.";
  }
  const lines = [
    "סטטוס מקורות לפי תשובת השרת האחרונה:",
    `• תעודות משלוח: ${meta.notesSource ?? "לא ידוע"}${typeof meta.notesCount === "number" ? ` (${meta.notesCount} רשומות בטווח)` : ""}`,
    `• איתוראן / עצירות GPS בצינור הצ׳אט: ${meta.ituranSource ?? "לא ידוע"}${typeof meta.matchedStops === "number" ? ` · הצלבות: ${meta.matchedStops}` : ""}`,
    `• ביקורים מחושבים: ${meta.visitsCount ?? "\u2014"}`,
  ];
  if (meta.warning) lines.push(`• אזהרה: ${meta.warning}`);
  if (meta.ituranError) lines.push(`• איתוראן: ${meta.ituranError}`);
  if (fetchedAt) lines.push(`• נמשך מהשרת ב: ${fetchedAt}`);
  lines.push("מיקום GPS חי (קואורדינות + מזהה רכב + זמן עדכון) אינו זמין במסלול זה.");
  return lines.join("\n");
}

export function evidenceFromMeta(meta: BackendMeta | null): EvidenceLevel {
  if (!meta) return "unavailable";
  if (meta.notesSource === "live" && (meta.notesCount ?? 0) > 0) {
    if (meta.ituranSource && meta.ituranSource !== "none") return "partial";
    return "from_store";
  }
  if (meta.notesSource === "sample") return "unavailable";
  return "unavailable";
}

/** פורמט זמן ישראל מ-ISO */
export function formatIsraelDateTime(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString("he-IL", {
      timeZone: "Asia/Jerusalem",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return String(iso);
  }
}

export type PtoSessionFact = {
  truck?: string;
  driver?: string;
  address?: string;
  openIso?: string;
  closeIso?: string;
  durationMin?: number | null;
  matchedNoteId?: string;
  orphan?: string;
  date?: string;
};

/** סיכום PTO מאומת — שעון ישראל, כתובת, בלי | כדי לא לשבור טבלאות בממשק */
export function formatPtoOpeningsSummary(sessions: PtoSessionFact[]): string {
  const opens = sessions.filter((s) => !s.orphan || s.orphan === "missing_close");
  const complete = opens.filter(
    (s) => s.durationMin != null && Number.isFinite(Number(s.durationMin)) && Number(s.durationMin) > 0,
  );
  const matched = opens.filter((s) => s.matchedNoteId);
  const orphans = sessions.filter((s) => s.orphan);
  const lines: string[] = [];

  lines.push("פתיחות מנוף — טאב איתוראן_PTO");
  lines.push("");
  lines.push(`סה\"כ פתיחות במדגם: ${opens.length}`);
  lines.push(`עם משך מחושב (פתיחה+סגירה): ${complete.length}`);
  lines.push(`שויכו לתעודת משלוח: ${matched.length}`);
  lines.push(`יתומים או חלקיים: ${orphans.length}`);
  lines.push("");

  if (opens.length === 0) {
    lines.push("לא נמצאו אירועי פתיחת מנוף בטווח שנטען מהשרת.");
    return lines.join("\n");
  }

  lines.push("פירוט (שעון ישראל, מהחדש לישן)");
  lines.push("");

  opens.slice(0, 40).forEach((s, i) => {
    const when = formatIsraelDateTime(s.openIso) || s.date || "לא ידוע";
    const close =
      s.closeIso && formatIsraelDateTime(s.closeIso)
        ? formatIsraelDateTime(s.closeIso)
        : "";
    const truck = (s.truck || "").trim() || "לא צוין";
    const driver = (s.driver || "").trim();
    const addr = (s.address || "").replace(/\s+/g, " ").trim();
    const hasDur = s.durationMin != null && Number.isFinite(Number(s.durationMin));
    const dur = hasDur
      ? `${Number(s.durationMin)} דקות`
      : "לא חושב (חסרה סגירה או פתיחה)";
    const note = s.matchedNoteId
      ? `תעודת משלוח ${s.matchedNoteId}`
      : "לא נמצאה תעודה תואמת לפי תאריך ומשאית";
    const status = s.orphan
      ? s.orphan === "missing_close"
        ? "סטטוס: נפתח ולא נסגר"
        : "סטטוס: נסגר ללא פתיחה"
      : hasDur
        ? "סטטוס: סשן מלא"
        : "סטטוס: חלקי";

    lines.push(`${i + 1}. זמן פתיחה: ${when}`);
    if (close) lines.push(`   זמן סגירה: ${close}`);
    lines.push(`   משאית: ${truck}`);
    if (driver) lines.push(`   נהג: ${driver}`);
    lines.push(`   כתובת פריקה: ${addr || "לא הופיעה במייל איתוראן"}`);
    lines.push(`   משך פריקה: ${dur}`);
    lines.push(`   שיוך: ${note}`);
    lines.push(`   ${status}`);
    lines.push("");
  });

  if (opens.length > 40) {
    lines.push(`ועוד ${opens.length - 40} פתיחות שלא הוצגו במסך זה.`);
    lines.push("");
  }

  lines.push("הערה: הזמנים לפי שעון ישראל. כתובת מגיעה ממייל איתוראן או מתעודה משויכת.");
  return lines.join("\n").trim();
}

export function buildNoaContext(input: {
  meta: BackendMeta | null;
  fetchedAt: string | null;
  notes: Record<string, unknown>[];
  visits: Record<string, unknown>[];
  discrepancies: unknown[];
  question: string;
  ptoSessions?: PtoSessionFact[];
}): string {
  const { meta, fetchedAt, notes, visits, discrepancies, question, ptoSessions = [] } = input;
  const evidence = evidenceFromMeta(meta);

  const noteSlice = notes.slice(0, 25).map((n) => ({
    id: n.id ?? n.docNumber ?? n["מספר תעודה"] ?? n.noteId,
    customer: n.customer ?? n.customerName,
    address: n.siteAddress ?? n.fullAddress ?? n.address,
    driver: n.driver,
    truck: n.truck ?? n.plate,
    date: n.date ?? n.docDate,
  }));

  const visitSlice = visits.slice(0, 40).map((v) => ({
    truck: v.truck,
    driver: v.driver,
    address: v.fullAddress ?? v.streetAndNum ?? v.address,
    noteIds: v.noteIds,
    ituranArrive: v.ituranArriveTime ?? v.ituranArrive,
    ituranDepart: v.ituranDepartTime ?? v.ituranDepart,
    ituranArriveLocal: formatIsraelDateTime(String(v.ituranArriveTime ?? v.ituranArrive ?? "")),
    ituranDepartLocal: formatIsraelDateTime(String(v.ituranDepartTime ?? v.ituranDepart ?? "")),
    ituranDurationMin: v.ituranDurationMin ?? v.durationMin,
    ptoOpenTime: v.ptoOpenTime,
    ptoCloseTime: v.ptoCloseTime,
    ptoDurationMin: v.ptoDurationMin,
    handwrittenCraneRaw: v.handwrittenCraneRaw,
    handwrittenUnloadMin: v.handwrittenUnloadMin,
    handwrittenWaitingMin: v.handwrittenWaitingMin,
    measurementSource: v.measurementSource,
    qualityFlags: v.qualityFlags,
    customers: v.customers,
  }));

  const ptoSlice = (ptoSessions || []).slice(0, 40).map((s) => ({
    truck: s.truck || "",
    driver: s.driver || "",
    address: s.address || "כתובת לא ידועה",
    openLocal: formatIsraelDateTime(s.openIso),
    closeLocal: formatIsraelDateTime(s.closeIso),
    durationMin: s.durationMin ?? null,
    matchedNoteId: s.matchedNoteId || null,
    orphan: s.orphan || null,
    date: s.date || "",
  }));

  return JSON.stringify(
    {
      evidenceLevel: evidence,
      evidenceLabelHe: EVIDENCE_LABEL_HE[evidence],
      question,
      serverFetchedAt: fetchedAt,
      meta: meta ?? { notesSource: "unavailable", ituranSource: "none" },
      notesSample: noteSlice,
      visitsSample: visitSlice,
      ptoSource: "איתוראן_PTO",
      ptoOpeningsCount: ptoSlice.filter((s) => !s.orphan || s.orphan === "missing_close").length,
      ptoSessionsSample: ptoSlice,
      discrepanciesCount: Array.isArray(discrepancies) ? discrepancies.length : 0,
      discrepanciesSample: Array.isArray(discrepancies) ? discrepancies.slice(0, 10) : [],
      constraints: {
        noLiveGps: true,
        demoReportsForbidden: true,
        onlyUseFactsInThisJson: true,
        timesAreIsraelLocal: true,
        neverShowRawUtcToUser: true,
      },
    },
    null,
    0,
  );
}

export function formatNotesSummary(
  notes: Record<string, unknown>[],
  meta: BackendMeta | null,
  fetchedAt: string | null,
): string {
  if (!meta || meta.notesSource !== "live" || notes.length === 0) {
    return [
      "אין בידי רשימת תעודות חיה ומאומת מהשרת לשאלה הזו.",
      meta?.warning ? `פירוט: ${meta.warning}` : null,
      meta?.notesSource === "unavailable"
        ? "מקור התעודות: לא זמין."
        : meta?.notesSource
          ? `מקור התעודות לפי שרת: ${meta.notesSource}.`
          : null,
      "לא אציג דוח דוגמה או מספרי תעודה שאינם ברשימה שהתקבלה מהשרת.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const lines = [
    `נמצאו ${notes.length} תעודות בטווח שנטען מהשרת (מקור: live).`,
    fetchedAt ? `זמן משיכה: ${fetchedAt}` : null,
    "דוגמאות (עד 8):",
    ...notes.slice(0, 8).map((n, i) => {
      const id = String(n.id ?? n.docNumber ?? n["מספר תעודה"] ?? "\u2014");
      const cust = String(n.customer ?? n.customerName ?? "\u2014");
      const addr = String(n.siteAddress ?? n.address ?? "");
      return `${i + 1}. ת.מ. ${id} · ${cust}${addr ? ` · ${addr}` : ""}`;
    }),
  ];
  return lines.filter(Boolean).join("\n");
}
