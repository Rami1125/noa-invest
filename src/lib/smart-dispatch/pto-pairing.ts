// src/lib/smart-dispatch/pto-pairing.ts
// זיווג אירועי פתיחה/סגירה של PTO, הצלבה מול תעודות, וזיהוי חריגות

import type { DeliveryNote } from "@/lib/data";
import type {
  DriverTruckSummary,
  DiscrepancyItem,
} from "@/components/chat/CrossReferenceInspector";
import { scoreAddressMatch } from "./cross-matcher";
import { summarizeVisitHandwrittenTimes } from "./handwritten-crane";

export type PtoRow = {
  truck: string;
  driver: string;
  eventType: string; // pto_open | pto_close | pto_unknown
  eventTimeIso: string;
  address: string;
};

export type PtoSession = {
  id: string;
  truck: string;
  driver: string;
  address: string;
  openIso: string;
  closeIso?: string;
  durationMin: number | null;
  date: string; // dd/MM/yyyy (שעון ישראל)
  orphan?: "missing_open" | "missing_close";
  matchedNoteId?: string;
};

const TZ = "Asia/Jerusalem";
const OUTLIER_MIN = 240;
const GAP_MIN = 10;

export const israelDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-GB", { timeZone: TZ });

export const israelTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString("he-IL", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const ts = (iso: string) => new Date(iso).getTime();

/** זיווג פתיחה→סגירה לפי משאית. פתיחה בלי סגירה / סגירה בלי פתיחה = יתום. */
export function pairPtoEvents(rows: PtoRow[]): PtoSession[] {
  const valid = rows.filter(
    (r) => r.truck && !Number.isNaN(ts(r.eventTimeIso)) && r.eventType !== "pto_unknown",
  );
  const byTruck = new Map<string, PtoRow[]>();
  for (const r of valid) {
    const list = byTruck.get(r.truck) ?? [];
    list.push(r);
    byTruck.set(r.truck, list);
  }

  const sessions: PtoSession[] = [];

  for (const [truck, list] of byTruck) {
    const sorted = [...list].sort((a, b) => ts(a.eventTimeIso) - ts(b.eventTimeIso));
    let pending: PtoRow | null = null;

    const orphanOpen = (o: PtoRow) =>
      sessions.push({
        id: `pto-${truck}-${o.eventTimeIso}`,
        truck,
        driver: o.driver,
        address: o.address,
        openIso: o.eventTimeIso,
        durationMin: null,
        date: israelDate(o.eventTimeIso),
        orphan: "missing_close",
      });

    for (const r of sorted) {
      if (r.eventType === "pto_open") {
        if (pending) orphanOpen(pending);
        pending = r;
      } else if (r.eventType === "pto_close") {
        if (pending) {
          sessions.push({
            id: `pto-${truck}-${pending.eventTimeIso}`,
            truck,
            driver: pending.driver || r.driver,
            address: pending.address || r.address,
            openIso: pending.eventTimeIso,
            closeIso: r.eventTimeIso,
            durationMin: Math.max(0, Math.round((ts(r.eventTimeIso) - ts(pending.eventTimeIso)) / 60000)),
            date: israelDate(pending.eventTimeIso),
          });
          pending = null;
        } else {
          sessions.push({
            id: `pto-${truck}-${r.eventTimeIso}-c`,
            truck,
            driver: r.driver,
            address: r.address,
            openIso: r.eventTimeIso,
            durationMin: null,
            date: israelDate(r.eventTimeIso),
            orphan: "missing_open",
          });
        }
      }
    }
    if (pending) orphanOpen(pending);
  }

  return sessions.sort((a, b) => ts(b.openIso) - ts(a.openIso));
}

/** נרמול תאריך תעודה (dd/mm/yyyy או yyyy-mm-dd) ל-dd/MM/yyyy */
export function normNoteDate(raw?: string): string {
  const s = String(raw || "");
  const iso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[3]!.padStart(2, "0")}/${iso[2]!.padStart(2, "0")}/${iso[1]}`;
  const m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!m) return "";
  const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  return `${m[1]!.padStart(2, "0")}/${m[2]!.padStart(2, "0")}/${y}`;
}

/** אם בשדה הנהג מופיע רישוי - חייב להתאים למשאית. אם לא מופיע - לא מסננים. */
function truckCompatible(note: DeliveryNote, truck: string): boolean {
  const plate = (note.driver || "").match(/\d{3}-\d{2}-\d{3}/)?.[0];
  return !plate || plate === truck;
}

export type PtoAnalysis = {
  sessions: PtoSession[];
  issues: DiscrepancyItem[];
};

/** הצלבת סשני PTO מול תעודות + איתור חריגות */
export function analyzePto(rawSessions: PtoSession[], notes: DeliveryNote[]): PtoAnalysis {
  const issues: DiscrepancyItem[] = [];
  const sessions = rawSessions.map((s) => ({ ...s }));

  for (const s of sessions) {
    const base = { truck: s.truck, driver: s.driver, address: s.address || "כתובת לא ידועה" };

    if (s.orphan) {
      issues.push({
        ...base,
        id: `orphan-${s.id}`,
        type: "pto_missing",
        severity: "warning",
        title: s.orphan === "missing_close" ? "PTO נפתח ולא נסגר" : "PTO נסגר ללא פתיחה",
        description: `אירוע PTO ב-${s.date} ${israelTime(s.openIso)} חסר ${
          s.orphan === "missing_close" ? "סגירה" : "פתיחה"
        } במיילי איתוראן.`,
      });
      continue;
    }

    if ((s.durationMin ?? 0) > OUTLIER_MIN) {
      issues.push({
        ...base,
        id: `outlier-${s.id}`,
        type: "outlier_crane",
        severity: "warning",
        title: "משך PTO חריג",
        description: `PTO פתוח ${s.durationMin} דק׳ (מעל ${OUTLIER_MIN}) ב-${s.date}.`,
      });
    }

    const candidates = notes.filter(
      (n) => normNoteDate(n.date) === s.date && truckCompatible(n, s.truck),
    );
    let best: DeliveryNote | undefined;
    let bestScore = 0;
    const ptoAddr = String(s.address || "").trim();

    for (const n of candidates) {
      if (ptoAddr) {
        const m = scoreAddressMatch(n.siteAddress, ptoAddr);
        if (m.isMatch && m.score > bestScore) {
          best = n;
          bestScore = m.score;
        }
      }
    }

    // אם אין כתובת ב-PTO או לא נמצאה התאמה — נסה לפי תאריך+משאית בלבד
    if (!best && candidates.length === 1) {
      best = candidates[0];
    } else if (!best && candidates.length > 1 && !ptoAddr) {
      best = candidates[0];
    }

    if (best) {
      s.matchedNoteId = best.id;
      if (!ptoAddr && best.siteAddress) {
        s.address = String(best.siteAddress);
      }
    }

    if (!best) {
      issues.push({
        ...base,
        id: `nomatch-${s.id}`,
        type: "pto_missing",
        severity: "warning",
        title: "PTO ללא תעודה תואמת",
        description: `PTO ${israelTime(s.openIso)}–${s.closeIso ? israelTime(s.closeIso) : "?"} (${s.durationMin} דק׳) ב-${s.date}, לא נמצאה תעודה באותה כתובת ותאריך.`,
      });
      continue;
    }

    const hw = summarizeVisitHandwrittenTimes([best.craneTime]).unloadingMin;
    if (hw > 0 && s.durationMin !== null && Math.abs(hw - s.durationMin) > GAP_MIN) {
      issues.push({
        ...base,
        id: `gap-${s.id}`,
        type: "time_gap",
        severity: "warning",
        title: `פער ${Math.abs(hw - s.durationMin)} דק׳ בין PTO לכתב יד`,
        description: `ת.מ. ${best.id}: PTO ${s.durationMin} דק׳ מול ${hw} דק׳ בכתב יד.`,
      });
    }
  }

  return { sessions, issues };
}

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** סיכום לכל משאית לפי התאריך האחרון שיש בו אירועי PTO */
export function buildTruckSummaries(sessions: PtoSession[]): DriverTruckSummary[] {
  const byTruck = new Map<string, PtoSession[]>();
  for (const s of sessions) {
    const list = byTruck.get(s.truck) ?? [];
    list.push(s);
    byTruck.set(s.truck, list);
  }

  const out: DriverTruckSummary[] = [];
  for (const [truck, list] of byTruck) {
    const sorted = [...list].sort((a, b) => ts(b.openIso) - ts(a.openIso));
    const latestDate = sorted[0]?.date ?? "";
    const day = sorted.filter((s) => s.date === latestDate);
    const totalMin = day.reduce((acc, s) => acc + (s.durationMin ?? 0), 0);
    const driver = day.find((s) => s.driver)?.driver || sorted.find((s) => s.driver)?.driver || "";
    out.push({
      truck,
      driver,
      date: latestDate,
      sessions: day.length,
      totalUnloadMin: totalMin,
      totalUnloadLabel: hhmm(totalMin),
      sample: day.slice(0, 3).map((s) => ({
        open: israelTime(s.openIso),
        close: s.closeIso ? israelTime(s.closeIso) : "—",
        min: s.durationMin,
        address: s.address,
        label: s.matchedNoteId ? `ת.מ. ${s.matchedNoteId}` : "ללא תעודה תואמת",
      })),
    });
  }
  return out.sort((a, b) => a.truck.localeCompare(b.truck, "he"));
}
