/* Live Ituran source adapter — reads persisted Apps Script visit rows only. */
import type { IturanStop, PtoEvent } from "@/lib/smart-dispatch/types";

type AppsScriptVisit = Record<string, unknown>;
export type LiveIturanResult = { source: "live" | "none"; stops: IturanStop[]; error?: string };

function gasValue(row: AppsScriptVisit, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}
function gasDate(value: string): string {
  const s = value.trim();
  let m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return `${String(Number(m[1])).padStart(2, "0")}/${String(Number(m[2])).padStart(2, "0")}/${year}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
function gasDateTime(value: string, date: string): string {
  if (!value) return "";
  const full = value.match(/(\d{1,2}[/.]\d{1,2}[/.]\d{2,4})\s+(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (full) {
    const d = gasDate(full[1]!);
    const t = full[2]!.length === 5 ? `${full[2]}:00` : full[2]!;
    return d ? `${d} ${t}` : "";
  }
  const time = value.match(/^(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (!time || !date) return "";
  const t = time[1]!.length === 5 ? `${time[1]}:00` : time[1]!;
  return `${date} ${t}`;
}
function gasMinutesBetween(start: string, end: string): number {
  const parse = (value: string): number => {
    const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return NaN;
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] || 0)).getTime();
  };
  const a = parse(start), b = parse(end);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round((b - a) / 60000) : 0;
}
export function mapLiveIturanVisit(row: AppsScriptVisit): IturanStop | null {
  if (!/איתוראן|ituran/i.test(gasValue(row, ["מקור המדידה", "מקור מדידה", "measurementSource", "source"]))) return null;
  const truckRaw = gasValue(row, ["משאית", "רישוי / משאית", "truck", "plate"]);
  const digits = truckRaw.replace(/\D/g, "");
  if (digits.length !== 7 && digits.length !== 8) return null;
  const truck = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  const date = gasDate(gasValue(row, ["תאריך", "תאריך ביקור", "date"]));
  const address = gasValue(row, ["כתובת", "כתובת מלאה", "address", "fullAddress"]);
  const startTime = gasDateTime(gasValue(row, ["איתוראן: הגעה", "הגעה (איתוראן)", "ituranArriveTime", "itArrive"]), date);
  const endTime = gasDateTime(gasValue(row, ["איתוראן: יציאה", "יציאה (איתוראן)", "ituranDepartTime", "itDepart"]), date);
  if (!date || !address || !startTime || !endTime) return null;
  const rawDuration = Number(gasValue(row, ["איתוראן: משך עצירה (דק׳)", "משך באתר (דק׳)", "ituranDurationMin", "itStop"]));
  const durationMin = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : gasMinutesBetween(startTime, endTime);
  if (!durationMin) return null;
  const ptoOpen = gasDateTime(gasValue(row, ["PTO פתיחה", "PTO פתיחה (איתוראן)", "ptoOpenTime", "ptoOpen"]), date);
  const ptoClose = gasDateTime(gasValue(row, ["PTO סגירה", "PTO סגירה (איתוראן)", "ptoCloseTime", "ptoClose"]), date);
  const rawPtoDuration = Number(gasValue(row, ["PTO משך (דק׳)", "PTO דק׳", "ptoDurationMin", "ptoMin"]));
  const ptoEvents: PtoEvent[] = ptoOpen ? [{
    id: `pto-${truck}-${ptoOpen}`, truck, openTime: ptoOpen,
    ...(ptoClose ? { closeTime: ptoClose } : {}),
    ...(Number.isFinite(rawPtoDuration) && rawPtoDuration > 0 ? { durationMin: rawPtoDuration } : ptoClose ? { durationMin: gasMinutesBetween(ptoOpen, ptoClose) } : {}),
    isOrphan: !ptoClose, ...(!ptoClose ? { orphanReason: "missing_close" as const } : {}),
  }] : [];
  return {
    id: `gas-${truck}-${date}-${address}`, truck,
    driver: gasValue(row, ["נהג", "driver"]), date, startTime, endTime, durationMin,
    address, normalizedSiteKey: address.toLowerCase(), cumulativeKm: 0, ptoEvents,
  };
}
export async function loadLiveIturanFromGas({ gasUrl, token, fetcher = fetch }: {
  gasUrl?: string; token?: string; fetcher?: typeof fetch;
}): Promise<LiveIturanResult> {
  if (!gasUrl || !token) return { source: "none", stops: [], error: "GAS_URL או API_TOKEN חסר בשרת" };
  try {
    const url = new URL(gasUrl);
    url.searchParams.set("action", "bootstrap");
    url.searchParams.set("token", token);
    const response = await fetcher(url.toString(), { redirect: "follow", signal: AbortSignal.timeout(12000) });
    const text = await response.text();
    let payload: { ok?: boolean; success?: boolean; error?: unknown; data?: { visits?: unknown } };
    try { payload = JSON.parse(text) as typeof payload; }
    catch { throw new Error(`תשובת GAS אינה JSON תקין (HTTP ${response.status})`); }
    if (!response.ok || payload.ok === false || payload.success === false) throw new Error(String(payload.error || `GAS HTTP ${response.status}`));
    if (!Array.isArray(payload.data?.visits)) throw new Error("תשובת GAS אינה מכילה רשימת ביקורים");
    const stops = (payload.data.visits as AppsScriptVisit[]).map(mapLiveIturanVisit).filter((stop): stop is IturanStop => stop !== null);
    return stops.length ? { source: "live", stops } : { source: "none", stops: [], error: "אין ביקורים עם מקור איתוראן וזמני עצירה מאומתים" };
  } catch (error) {
    return { source: "none", stops: [], error: error instanceof Error ? error.message : String(error) };
  }
}
