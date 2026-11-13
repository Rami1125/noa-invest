/**
 * GPS מארכיון תעודות: AA:AB ראשי, AH:AJ גיבוי.
 * משמש ב-/ituran לסימון hasGpsMatch והורדת "לא משויך".
 */
import type { DeliveryNote, AuditStatus } from "@/lib/data";
import type { GpsStop } from "@/lib/ituran";
import type { MatchTier } from "@/lib/logistics-intelligence";
import { normalizePlate, plateOfDriver, kindOfPlate } from "@/lib/ituran";

export type ArchiveGpsMatch = {
  note: DeliveryNote;
  plate: string;
  kind: "crane" | "flatbed";
  status: AuditStatus;
  dwell: number | null;
  label: string;
  stop?: GpsStop;
  fromSheet: boolean;
  tier: MatchTier;
  ptoMin: number | null;
  gpsSource: string;
};

/** ערכים פגומים כמו "," או "],[" אינם שעה תקינה */
export function isJunkTime(raw?: unknown): boolean {
  if (raw == null) return true;
  const s = String(raw).trim();
  if (!s) return true;
  if (/^[,\s\[\]\|;.\-_/]+$/.test(s)) return true;
  if (s === "],[") return true;
  return false;
}

/** נרמול ל-HH:mm מתוך מחרוזת / שבר יום */
export function normalizeTimeHe(raw?: unknown): string {
  if (isJunkTime(raw)) return "";
  if (typeof raw === "number" && Number.isFinite(raw)) {
    let dayFrac = raw;
    if (raw >= 1 && raw < 24) dayFrac = raw / 24;
    if (dayFrac >= 0 && dayFrac < 1.5) {
      const totalMin = Math.round((dayFrac % 1) * 24 * 60);
      const hh = Math.floor(totalMin / 60) % 24;
      const mm = totalMin % 60;
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
    return "";
  }
  const s = String(raw).trim();
  const hm = s.match(/(\d{1,2}):(\d{2})/);
  if (hm) return `${hm[1]!.padStart(2, "0")}:${hm[2]}`;
  if (/^0?\.\d+$/.test(s)) return normalizeTimeHe(Number(s));
  if (s.includes("1899")) return "";
  return "";
}

/**
 * אם לתעודה יש הגעה+יציאה תקינות (מ-API getNotes עם AA:AB או AH:AJ) —
 * מחזיר רשומת match verified; אחרת null.
 */
export function matchFromArchiveGps(note: DeliveryNote): ArchiveGpsMatch | null {
  const arrive = normalizeTimeHe(note.itArrive);
  const depart = normalizeTimeHe(note.itDepart);
  if (!arrive || !depart) return null;

  const src =
    note.gpsSource ||
    (note.hasGpsMatch ? "sheet_AH_AJ" : "sheet_AA_AB") ||
    "sheet_AH_AJ";
  const dwell =
    note.itStop != null && Number.isFinite(Number(note.itStop))
      ? Number(note.itStop)
      : (() => {
          const [ah, am] = arrive.split(":").map(Number);
          const [dh, dm] = depart.split(":").map(Number);
          const a = (ah || 0) * 60 + (am || 0);
          const d = (dh || 0) * 60 + (dm || 0);
          return d >= a ? d - a : null;
        })();

  const plate =
    normalizePlate(String((note as { truck?: string }).truck || "")) ||
    plateOfDriver(note.driver) ||
    "";
  const kind = kindOfPlate(plate);

  return {
    note,
    plate,
    kind,
    status: "ok",
    dwell,
    label:
      src === "sheet_AH_AJ"
        ? "GPS מארכיון (AH:AJ)"
        : src === "sheet_AA_AB"
          ? "GPS מארכיון (AA:AB)"
          : `GPS מארכיון (${src})`,
    stop: {
      plate,
      address: note.siteAddress || "",
      arrive,
      depart,
      driver: note.driver,
      durationMin: dwell ?? undefined,
    },
    fromSheet: true,
    tier: "verified",
    ptoMin: null,
    gpsSource: src,
  };
}
