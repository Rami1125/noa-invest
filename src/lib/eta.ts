/**
 * מנוע ETA לסדרן — שרשרת סבב מלאה
 * נסיעה (כביש משוער + פקטור שעה + סוג משאית) → פריקה היסטורית / יתרת PTO → חזרה למחסן
 */

export interface EtaPoint {
  lat: number;
  lng: number;
  avgStopMin?: number;
  isWarehouse?: boolean;
}

export interface EtaStopInput extends EtaPoint {
  id: string;
  label: string;
  /** אם יש pto_open פעיל כרגע */
  activePtoStartIso?: string | null;
  /** אם כבר נסגר pto_close */
  completedAtIso?: string | null;
  /** תוספת בלות / ברזל / החזרות */
  extraLoadComplexityMin?: number;
}

export interface EtaStopResult {
  id: string;
  label: string;
  driveFromPrevMin: number;
  unloadEstMin: number;
  remainingUnloadMin: number;
  etaArrivalIso: string;
  etaFinishIso: string;
  status: "completed" | "in_progress" | "pending";
}

export interface RouteEtaSummary {
  stops: EtaStopResult[];
  returnDriveMin: number;
  returnToWarehouseIso: string;
  totalRemainingMin: number;
  /** באפר יציאה מהמחסן אם עוד לא יצאו והמחסן עמוס */
  warehouseExitBufferMin: number;
}

export type TruckType = "crane" | "flatbed";

export function haversineKm(a: EtaPoint, b: EtaPoint): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** פקטור עומס תנועה לפי שעה בישראל */
export function getTrafficMultiplier(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? date.getHours());
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? date.getMinutes());
  const minutes = hour * 60 + minute;
  if (minutes >= 390 && minutes <= 540) return 1.35; // 06:30–09:00
  if (minutes >= 900 && minutes <= 1080) return 1.3; // 15:00–18:00
  return 1.05; // שגרה
}

/**
 * נסיעה בין שתי נקודות:
 * airKm × 1.32 ≈ כביש · מהירות עירונית/בינעירונית · פקטור שעה · פקטור מנוף (+12%)
 * אם ידוע knownRoadMin מ-GAS — משתמשים בו כבסיס.
 */
export function estimateSegmentDriveMin(
  from: EtaPoint,
  to: EtaPoint,
  departAt: Date,
  truckType: TruckType = "crane",
  knownRoadMin?: number | null,
): number {
  if (knownRoadMin != null && Number.isFinite(knownRoadMin) && knownRoadMin > 0) {
    const traffic = getTrafficMultiplier(departAt);
    const truckFactor = truckType === "crane" ? 1.12 : 1.0;
    return Math.max(4, Math.round(Number(knownRoadMin) * traffic * truckFactor));
  }

  const airKm = haversineKm(from, to);
  if (airKm < 0.1) return 2;
  const roadKm = airKm * 1.32;
  const baseSpeedKmh = roadKm < 12 ? 32 : 48;
  const baseMin = (roadKm / baseSpeedKmh) * 60 + 4;
  const traffic = getTrafficMultiplier(departAt);
  const truckFactor = truckType === "crane" ? 1.12 : 1.0;
  return Math.max(4, Math.round(baseMin * traffic * truckFactor));
}

/** זמן העמסה במחסן: בסיס 15 + מדד עיכוב חי + מורכבות מטען */
export function estimateWarehouseLoadMin(
  warehouseDelayPct = 0,
  cargoComplexityMin = 0,
): number {
  const base = 15;
  const delayExtra = Math.round((Math.max(0, warehouseDelayPct) / 100) * 20);
  return Math.max(8, base + delayExtra + Math.max(0, cargoComplexityMin));
}

/**
 * שרשרת סבב מלאה: A → B → C → חזרה למחסן
 * כל תחנה מחושבת מסיום הקודמת + נסיעה ביניהן.
 */
export function calculateRoundEta(params: {
  warehouse: EtaPoint;
  stops: EtaStopInput[];
  now?: Date;
  truckType?: TruckType;
  warehouseDelayPct?: number;
}): RouteEtaSummary {
  const now = params.now ?? new Date();
  const truckType = params.truckType ?? "crane";
  let cursorTime = new Date(now.getTime());
  let prevPoint: EtaPoint = params.warehouse;

  let warehouseExitBufferMin = 0;
  const hasAnyStarted = params.stops.some((s) => s.completedAtIso || s.activePtoStartIso);
  if (!hasAnyStarted && (params.warehouseDelayPct ?? 0) > 25) {
    warehouseExitBufferMin = Math.round(((params.warehouseDelayPct ?? 0) / 100) * 20);
    cursorTime = new Date(cursorTime.getTime() + warehouseExitBufferMin * 60_000);
  }

  const results: EtaStopResult[] = [];

  for (const stop of params.stops) {
    if (stop.completedAtIso) {
      const doneAt = new Date(stop.completedAtIso);
      results.push({
        id: stop.id,
        label: stop.label,
        driveFromPrevMin: 0,
        unloadEstMin: stop.avgStopMin ?? 20,
        remainingUnloadMin: 0,
        etaArrivalIso: doneAt.toISOString(),
        etaFinishIso: doneAt.toISOString(),
        status: "completed",
      });
      prevPoint = stop;
      if (doneAt > cursorTime) cursorTime = doneAt;
      continue;
    }

    const baseUnload = Math.max(
      10,
      Math.round((stop.avgStopMin ?? 22) + (stop.extraLoadComplexityMin ?? 0)),
    );

    if (stop.activePtoStartIso) {
      const openedAt = new Date(stop.activePtoStartIso);
      const elapsedMin = Math.max(0, (now.getTime() - openedAt.getTime()) / 60_000);
      const remainingMin = Math.max(5, Math.round(baseUnload - elapsedMin));
      const finishAt = new Date(now.getTime() + remainingMin * 60_000);

      results.push({
        id: stop.id,
        label: stop.label,
        driveFromPrevMin: 0,
        unloadEstMin: baseUnload,
        remainingUnloadMin: remainingMin,
        etaArrivalIso: openedAt.toISOString(),
        etaFinishIso: finishAt.toISOString(),
        status: "in_progress",
      });
      prevPoint = stop;
      cursorTime = finishAt;
      continue;
    }

    const driveMin = estimateSegmentDriveMin(prevPoint, stop, cursorTime, truckType);
    const arriveAt = new Date(cursorTime.getTime() + driveMin * 60_000);
    const finishAt = new Date(arriveAt.getTime() + baseUnload * 60_000);

    results.push({
      id: stop.id,
      label: stop.label,
      driveFromPrevMin: driveMin,
      unloadEstMin: baseUnload,
      remainingUnloadMin: baseUnload,
      etaArrivalIso: arriveAt.toISOString(),
      etaFinishIso: finishAt.toISOString(),
      status: "pending",
    });
    prevPoint = stop;
    cursorTime = finishAt;
  }

  const returnDriveMin = estimateSegmentDriveMin(prevPoint, params.warehouse, cursorTime, truckType);
  const returnAt = new Date(cursorTime.getTime() + returnDriveMin * 60_000);
  const totalRemainingMin = Math.max(0, Math.round((returnAt.getTime() - now.getTime()) / 60_000));

  return {
    stops: results,
    returnDriveMin,
    returnToWarehouseIso: returnAt.toISOString(),
    totalRemainingMin,
    warehouseExitBufferMin,
  };
}

/** זיהוי סוג משאית לפי מספר/שם */
export function detectTruckType(truck: string, driver = ""): TruckType {
  const t = `${truck} ${driver}`.toLowerCase();
  if (/חכמת|מנוף|crane|615|18000/.test(t)) return "crane";
  if (/עלי|איסוזו|isuzu|flat|651/.test(t)) return "flatbed";
  return "crane";
}
