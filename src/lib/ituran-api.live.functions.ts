/**
 * שירות לקוח לשליפת נתוני PTO ואיתוראן חיים מ-Apps Script
 */

export type PtoEvent = {
  plate: string;
  driver?: string;
  open: string;
  close: string;
  min: number;
};

export type IturanPtoResponse = {
  success: boolean;
  stops?: any[];
  pto?: PtoEvent[];
  plateSummary?: any[];
  at?: string;
  error?: string;
};

// כתובת ה-Deployment של ה-Apps Script שלך (GPS מארכיון + hasGpsMatch)
const GAS_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbx9d834wq3wm3z4XNHu7jIIhamopctR9dlHra6o4-PgYaflAhe3-VcYxNB4_abRkm_yyQ/exec";

/**
 * שליפת אירועי PTO (פתיחת מנוף) מהשרת לפי מספר משאית או נהג
 */
export async function fetchIturanPtoLive(token: string, truckOrDriver?: string): Promise<IturanPtoResponse> {
  try {
    let url = `${GAS_WEB_APP_URL}?action=getIturanStops&token=${encodeURIComponent(token)}`;
    if (truckOrDriver) {
      url += `&truck=${encodeURIComponent(truckOrDriver)}`;
    }

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`שגיאת תקשורת מול השרת: ${res.status}`);
    }

    const data = await res.json();
    return data as IturanPtoResponse;
  } catch (err: any) {
    console.error("fetchIturanPtoLive error:", err);
    return {
      success: false,
      error: err?.message || String(err),
      pto: [],
      stops: [],
    };
  }
}

/**
 * מעטפת מודיעין לנועה AI לשליפת תשובה מוסדרת על מנוף / PTO
 */
export async function getNoaCranePtoAnswer(token: string, queryText: string): Promise<string> {
  const result = await fetchIturanPtoLive(token);
  if (!result.success || !result.pto || result.pto.length === 0) {
    return "לא נמצאו במאגר אירועי פתיחת מנוף (PTO) מעודכנים כרגע.";
  }

  const isChakmatQuery = /חכמת|615|מנוף/i.test(queryText);
  const relevantEvents = isChakmatQuery
    ? result.pto.filter((p) => p.plate.includes("615") || /חכמת/i.test(p.driver || ""))
    : result.pto;

  if (relevantEvents.length === 0) {
    return "לא נמצאו אירועי מנוף התואמים את החיפוש המבוקש במאגר.";
  }

  let summary = "📊 **נתונים מתוך אירועי PTO באיתוראן (נמצא במאגר):**\n\n";
  relevantEvents.slice(0, 5).forEach((ev, idx) => {
    summary += `${idx + 1}. משאית **${ev.plate}** | פתיחה: *${ev.open}* | סגירה: *${ev.close}* (${Math.round(ev.min)} דק׳)\n`;
  });

  return summary;
}
