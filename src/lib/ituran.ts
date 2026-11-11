/**
 * Saban Flow — Ituran client library (v2.1)
 * הצלבת תעודות מול עצירות GPS · מקורות: גיליון / XLSX / SAMPLE
 * Stage A: אין ברירות מחדל 08:00/08:30 לזמנים חסרים.
 */

import type { AuditStatus, DeliveryNote } from "./data";

export type GpsStop = {
  plate: string;
  address: string;
  arrive: string;
  depart: string;
  driver?: string;
  durationMin?: number;
  dateKey?: string;
};

export type IturanVisit = {
  key: string;
  docNumber: string;
  date: string;
  customer: string;
  customerNo?: string;
  address: string;
  driver: string;
  truck: string;
  itArrive: string;
  itDepart: string;
  itStop: number;
  itKm?: number | string;
  travelMin?: number | string;
  itAddr?: string;
  matchScore?: number | string;
  ptoOpen?: string;
  ptoClose?: string;
  ptoMin?: number | string;
  crane?: string;
  status: AuditStatus;
};

export type PlateSummary = {
  plate: string;
  stops: number;
  totalMin: number;
  driver: string;
};

export type DriverId = "hikmat" | "ali";

export const DRIVER_FLEET: Record<
  DriverId,
  { name: string; plate: string; kind: "crane" | "flatbed"; label: string }
> = {
  hikmat: {
    name: "חכמת",
    plate: "615-41-002",
    kind: "crane",
    label: "חכמת · מנוף 615-41-002",
  },
  ali: {
    name: "עלי",
    plate: "651-51-701",
    kind: "flatbed",
    label: "עלי · פלטה 651-51-701",
  },
};

export const DWELL_RULES = {
  crane: [25, 45] as [number, number],
  flatbed: [15, 25] as [number, number],
};

const toMin = (t: string) => {
  const m = String(t || "")
    .trim()
    .match(/(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return (parseInt(m[1], 10) || 0) * 60 + (parseInt(m[2], 10) || 0);
};

export function normalizePlate(raw?: string): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length >= 7) {
    const d = digits.slice(0, 8);
    if (d.length === 8) {
      return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
    }
    return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  }
  return String(raw).trim();
}

export function plateDigits(raw?: string): string {
  return normalizePlate(raw).replace(/\D/g, "");
}

export function plateOfDriver(driverName?: string): string {
  const d = String(driverName || "");
  if (/עלי/i.test(d)) return DRIVER_FLEET.ali.plate;
  if (/חכמת|אנג.?ל/i.test(d)) return DRIVER_FLEET.hikmat.plate;
  return "";
}

export function kindOfPlate(plate: string): "crane" | "flatbed" {
  const p = plateDigits(plate);
  if (p.includes("651") || p === "65151701") return "flatbed";
  return "crane";
}

export function extractStreet(siteStr: string): string {
  const part =
    String(siteStr || "")
      .split(/[,،]/)[0]
      ?.replace(/רח׳|רח'|שד׳|שד'/g, "")
      .replace(/"/g, "")
      .trim() || "";
  return part
    .replace(/\d+[א-ת]?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatNoteDate(d: unknown): string {
  if (!d) return "";
  if (d instanceof Date && !isNaN(+d)) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  }
  const s = String(d).trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) return s.split(/\s+/)[0] || s;
  const parsed = new Date(s);
  if (!isNaN(+parsed)) {
    const dd = String(parsed.getDate()).padStart(2, "0");
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${parsed.getFullYear()}`;
  }
  return s;
}

export function dateKeyFromNote(d: unknown): string {
  const formatted = formatNoteDate(d);
  const m = formatted.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return "";
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export function crossMatch(
  note: Pick<DeliveryNote, "siteAddress" | "signedBy" | "driver" | "date"> &
    Record<string, unknown>,
  kind: "crane" | "flatbed",
  plate: string,
  stops: GpsStop[],
): { status: AuditStatus; dwell: number | null; label: string; stop?: GpsStop } {
  const siteStr = String(
    note?.siteAddress ||
      note?.["כתובת אתר"] ||
      note?.["כתובת יעד"] ||
      note?.["כתובת אספקה"] ||
      note?.site ||
      "",
  );
  const street = extractStreet(siteStr);
  const streetTokens = street.split(/\s+/).filter((w) => w.length > 1);
  const targetPlate = plateDigits(plate);
  const noteDay = dateKeyFromNote(note?.date);

  const candidates = (Array.isArray(stops) ? stops : []).filter((s) => {
    const sPlate = plateDigits(s.plate);
    if (!sPlate || !targetPlate || sPlate !== targetPlate) return false;
    if (s.dateKey && noteDay && s.dateKey !== noteDay) return false;
    return true;
  });

  let best: GpsStop | undefined;
  let bestScore = 0;

  for (const s of candidates) {
    const sAddr = String(s.address || "");
    let sc = 0;
    if (street && sAddr.includes(street)) sc += 4;
    else {
      sc += streetTokens.filter((t) => sAddr.includes(t)).length;
    }
    if (sc > bestScore) {
      bestScore = sc;
      best = s;
    }
  }

  if (!best || bestScore < 1) {
    return { status: "fail", dwell: null, label: "🔴 רכב לא שהה בכתובת" };
  }

  const arriveStr = String(best.arrive || "").trim();
  const departStr = String(best.depart || "").trim();
  // אין ברירת מחדל 08:00/08:30 — בלי זמן אמיתי לא מחשבים חריגה
  let dwell: number | null =
    best.durationMin != null && Number.isFinite(Number(best.durationMin))
      ? Number(best.durationMin)
      : null;
  if (dwell == null && arriveStr && departStr) {
    const a = toMin(arriveStr);
    const d = toMin(departStr);
    if (a > 0 || d > 0) dwell = Math.max(0, d - a);
  }
  if (dwell == null) {
    return {
      status: "warn",
      dwell: null,
      stop: best,
      label: "⚠️ כתובת תואמת · חסר זמן הגעה/עזיבה מאיתוראן",
    };
  }
  const [min, max] = DWELL_RULES[kind] || DWELL_RULES.crane;

  if (dwell >= min - 5 && dwell <= max + 15) {
    return { status: "ok", dwell, stop: best, label: "🟢 אומת באיתוראן" };
  }
  return {
    status: "warn",
    dwell,
    stop: best,
    label: "⚠️ סטיית זמן חריגה",
  };
}

export function visitsToStops(visits: IturanVisit[]): GpsStop[] {
  return visits
    .filter((v) => v.itArrive && v.truck)
    .map((v) => ({
      plate: normalizePlate(v.truck),
      address: v.itAddr || v.address || "",
      arrive: v.itArrive,
      depart: v.itDepart || v.itArrive,
      driver: v.driver,
      durationMin: v.itStop || undefined,
      dateKey: dateKeyFromNote(v.date),
    }));
}

export function rowsToStops(rows: Record<string, unknown>[]): GpsStop[] {
  if (!Array.isArray(rows)) return [];
  const pick = (r: Record<string, unknown>, keys: string[]) => {
    if (!r || typeof r !== "object") return "";
    const k = Object.keys(r).find((h) => keys.some((x) => String(h).includes(x)));
    return k ? String(r[k] ?? "").trim() : "";
  };
  const time = (v: string) => {
    const m = v.match(/\d{1,2}:\d{2}/)?.[0];
    return m ? m.padStart(5, "0") : "";
  };

  return rows
    .map((r) => {
      const plate = normalizePlate(
        pick(r, ["תג זיהוי", "רכב", "רישוי", "plate", "Plate"]),
      );
      const endRaw = pick(r, ["זמן סיום עצירה", "סיום", "depart", "Departure"]);
      if (!plate || !endRaw) return null;
      const startRaw = pick(r, ["זמן הודעה", "כניסה", "הגעה", "arrive", "Arrival"]);
      const datePart = (startRaw || endRaw).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      let dateKey = "";
      if (datePart) {
        let y = parseInt(datePart[3], 10);
        if (y < 100) y += 2000;
        dateKey = `${y}-${datePart[2].padStart(2, "0")}-${datePart[1].padStart(2, "0")}`;
      }
      return {
        plate,
        address: pick(r, ["כתובת", "מיקום", "address"]),
        arrive: time(startRaw),
        depart: time(endRaw),
        driver: pick(r, ["שם נהג", "נהג", "driver"]),
        dateKey: dateKey || undefined,
      } as GpsStop;
    })
    .filter(Boolean) as GpsStop[];
}

export function visitStatusLabel(status: AuditStatus): string {
  if (status === "ok") return "🟢 אומת";
  if (status === "warn") return "⚠️ סטייה";
  return "🔴 לא הותאם";
}

export function groupStopsByDriver(stops: GpsStop[]): Record<DriverId, GpsStop[]> {
  const out: Record<DriverId, GpsStop[]> = { hikmat: [], ali: [] };
  for (const s of stops) {
    const p = plateDigits(s.plate);
    if (p.includes("651")) out.ali.push(s);
    else out.hikmat.push(s);
  }
  return out;
}

export const SAMPLE_STOPS: GpsStop[] = [
  {
    plate: "615-41-002",
    address: "ירמיהו 11 רמת גן",
    arrive: "07:50",
    depart: "08:22",
    driver: "חכמת",
  },
  {
    plate: "615-41-002",
    address: "נח 3 תל אביב",
    arrive: "06:10",
    depart: "06:45",
    driver: "חכמת",
  },
  {
    plate: "615-41-002",
    address: "הורדים 19 סביון",
    arrive: "08:28",
    depart: "08:58",
    driver: "חכמת",
  },
  {
    plate: "615-41-002",
    address: "ת.דלק פז חגור",
    arrive: "09:38",
    depart: "10:06",
    driver: "חכמת",
  },
  {
    plate: "651-51-701",
    address: "בורוכוב 28 תל אביב",
    arrive: "07:12",
    depart: "07:30",
    driver: "עלי",
  },
  {
    plate: "651-51-701",
    address: "העוגב 15 קרני שומרון",
    arrive: "11:20",
    depart: "12:45",
    driver: "עלי",
  },
];
