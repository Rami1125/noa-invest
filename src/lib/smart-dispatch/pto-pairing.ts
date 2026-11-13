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
  eventType: string;
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
  date: string;
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

export function normNoteDate(raw?: string): string {
  const s = String(raw || "");
  const iso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[3]!.padStart(2, "0")}/${iso[2]!.padStart(2, "0")}/${iso[1]}`;
  const m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!m) return "";
  const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  return `${m[1]!.padStart(2, "0")}/${m[2]!.padStart(2, "0")}/${y}`;
}

function truckCompatible(note: DeliveryNote, truck: string): boolean {
  const plate = (note.driver || "").match(/\d{3}-\d{2}-\d{3}/)?.[0];
  if (!plate) return true;
  const norm = (p: string) => p.replace(/[^\d]/g, "");
  return norm(plate) === norm(truck);
}

function addressTokens(raw?: string): string[] {
  return String(raw || "")
    .toLowerCase()
    .replace(/["'\u05f4\u05f3`.,;()]/g, " ")
    .replace(/\b(\u05e8\u05d7\u05d5\u05d1|\u05e8\u05d7|\u05e9\u05d3|\u05e9\u05d3\u05e8\u05d5\u05ea|\u05e7\u05e8\u05d9\u05d9\u05ea|\u05e7\u05e8\u05d9\u05ea|\u05d9\u05e9\u05e8\u05d0\u05dc)\b/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^\u05d4/, ""))
    .filter((t) => t.length >= 2);
}

function softAddressScore(noteAddr?: string, ptoAddr?: string): number {
  const strict = scoreAddressMatch(noteAddr, ptoAddr);
  let score = strict.score;
  if (strict.isMatch) score += 2;

  const a = addressTokens(noteAddr);
  const b = addressTokens(ptoAddr);
  if (!a.length || !b.length) return score;

  let overlap = 0;
  for (const t of a) {
    if (b.some((x) => x === t || x.includes(t) || t.includes(x))) overlap += 1;
  }
  score += Math.min(overlap, 4);

  const numA = String(noteAddr || "").match(/\b\d+[\u05d0-\u05ea]?\b/);
  const numB = String(ptoAddr || "").match(/\b\d+[\u05d0-\u05ea]?\b/);
  if (numA && numB && numA[0] === numB[0]) score += 2;

  return score;
}

function datesNear(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const parse = (d: string) => {
    const m = d.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return null;
    return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  };
  const ta = parse(a);
  const tb = parse(b);
  if (ta == null || tb == null) return false;
  return Math.abs(ta - tb) <= 24 * 3600 * 1000;
}

export type PtoAnalysis = {
  sessions: PtoSession[];
  issues: DiscrepancyItem[];
  matchStats: {
    total: number;
    matched: number;
    byAddress: number;
    byDateTruckOnly: number;
    unmatched: number;
  };
};

export function analyzePto(rawSessions: PtoSession[], notes: DeliveryNote[]): PtoAnalysis {
  const issues: DiscrepancyItem[] = [];
  const sessions = rawSessions.map((s) => ({ ...s }));
  const usedNoteIds = new Set<string>();

  type Cand = { sessionIdx: number; note: DeliveryNote; score: number; tier: number };
  const candidates: Cand[] = [];

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i]!;
    const base = { truck: s.truck, driver: s.driver, address: s.address || "\u05db\u05ea\u05d5\u05d1\u05ea \u05dc\u05d0 \u05d9\u05d3\u05d5\u05e2\u05d4" };

    if (s.orphan) {
      issues.push({
        ...base,
        id: `orphan-${s.id}`,
        type: "pto_missing",
        severity: "warning",
        title: s.orphan === "missing_close" ? "PTO \u05e0\u05e4\u05ea\u05d7 \u05d5\u05dc\u05d0 \u05e0\u05e1\u05d2\u05e8" : "PTO \u05e0\u05e1\u05d2\u05e8 \u05dc\u05dc\u05d0 \u05e4\u05ea\u05d9\u05d7\u05d4",
        description: `\u05d0\u05d9\u05e8\u05d5\u05e2 PTO \u05d1-${s.date} ${israelTime(s.openIso)} \u05d7\u05e1\u05e8 ${
          s.orphan === "missing_close" ? "\u05e1\u05d2\u05d9\u05e8\u05d4" : "\u05e4\u05ea\u05d9\u05d7\u05d4"
        } \u05d1\u05de\u05d9\u05d9\u05dc\u05d9 \u05d0\u05d9\u05ea\u05d5\u05e8\u05d0\u05df.`,
      });
      continue;
    }

    if ((s.durationMin ?? 0) > OUTLIER_MIN) {
      issues.push({
        ...base,
        id: `outlier-${s.id}`,
        type: "outlier_crane",
        severity: "warning",
        title: "\u05de\u05e9\u05da PTO \u05d7\u05e8\u05d9\u05d2",
        description: `PTO \u05e4\u05ea\u05d5\u05d7 ${s.durationMin} \u05d3\u05e7\u05f3 (\u05de\u05e2\u05dc ${OUTLIER_MIN}) \u05d1-${s.date}.`,
      });
    }

    const ptoAddr = String(s.address || "").trim();
    const sameDay = notes.filter(
      (n) => datesNear(normNoteDate(n.date), s.date) && truckCompatible(n, s.truck),
    );

    for (const n of sameDay) {
      let score = 0;
      let tier = 0;
      if (ptoAddr && n.siteAddress) {
        score = softAddressScore(n.siteAddress, ptoAddr);
        if (score >= 5) tier = 3;
        else if (score >= 3) tier = 2;
        else if (score >= 1) tier = 1;
      }
      const cust = String(n.customer || "").trim();
      if (cust.length >= 3 && ptoAddr.includes(cust.slice(0, Math.min(cust.length, 12)))) {
        score += 3;
        tier = Math.max(tier, 2);
      }
      if (tier > 0 || (sameDay.length === 1 && !ptoAddr)) {
        candidates.push({ sessionIdx: i, note: n, score: score + (tier === 0 ? 0.5 : 0), tier: tier || 1 });
      }
    }

    if (sameDay.length === 1) {
      const n = sameDay[0]!;
      if (!candidates.some((c) => c.sessionIdx === i && c.note.id === n.id)) {
        candidates.push({ sessionIdx: i, note: n, score: 1, tier: 1 });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.tier - a.tier);
  let byAddress = 0;
  let byDateTruckOnly = 0;

  for (const c of candidates) {
    const s = sessions[c.sessionIdx]!;
    if (s.matchedNoteId) continue;
    if (usedNoteIds.has(String(c.note.id))) continue;
    s.matchedNoteId = String(c.note.id);
    usedNoteIds.add(String(c.note.id));
    if (!String(s.address || "").trim() && c.note.siteAddress) {
      s.address = String(c.note.siteAddress);
    }
    if (c.tier >= 2) byAddress += 1;
    else byDateTruckOnly += 1;

    const hw = summarizeVisitHandwrittenTimes([c.note.craneTime]).unloadingMin;
    if (hw > 0 && s.durationMin !== null && Math.abs(hw - s.durationMin) > GAP_MIN) {
      issues.push({
        truck: s.truck,
        driver: s.driver,
        address: s.address || "\u05db\u05ea\u05d5\u05d1\u05ea \u05dc\u05d0 \u05d9\u05d3\u05d5\u05e2\u05d4",
        id: `gap-${s.id}`,
        type: "time_gap",
        severity: "warning",
        title: `\u05e4\u05e2\u05e8 ${Math.abs(hw - s.durationMin)} \u05d3\u05e7\u05f3 \u05d1\u05d9\u05df PTO \u05dc\u05db\u05ea\u05d1 \u05d9\u05d3`,
        description: `\u05ea.\u05de. ${c.note.id}: PTO ${s.durationMin} \u05d3\u05e7\u05f3 \u05de\u05d5\u05dc ${hw} \u05d3\u05e7\u05f3 \u05d1\u05db\u05ea\u05d1 \u05d9\u05d3.`,
      });
    }
  }

  let unmatched = 0;
  for (const s of sessions) {
    if (s.orphan || s.matchedNoteId) continue;
    unmatched += 1;
    issues.push({
      truck: s.truck,
      driver: s.driver,
      address: s.address || "\u05db\u05ea\u05d5\u05d1\u05ea \u05dc\u05d0 \u05d9\u05d3\u05d5\u05e2\u05d4",
      id: `nomatch-${s.id}`,
      type: "pto_missing",
      severity: "warning",
      title: "PTO \u05dc\u05dc\u05d0 \u05ea\u05e2\u05d5\u05d3\u05d4 \u05ea\u05d5\u05d0\u05de\u05ea",
      description: `PTO ${israelTime(s.openIso)}\u2013${s.closeIso ? israelTime(s.closeIso) : "?"} (${s.durationMin} \u05d3\u05e7\u05f3) \u05d1-${s.date}, \u05dc\u05d0 \u05e0\u05de\u05e6\u05d0\u05d4 \u05ea\u05e2\u05d5\u05d3\u05d4 \u05d1\u05d0\u05d5\u05ea\u05d4 \u05db\u05ea\u05d5\u05d1\u05ea \u05d5\u05ea\u05d0\u05e8\u05d9\u05da.`,
    });
  }

  const matched = sessions.filter((s) => s.matchedNoteId).length;
  return {
    sessions,
    issues,
    matchStats: {
      total: sessions.length,
      matched,
      byAddress,
      byDateTruckOnly,
      unmatched,
    },
  };
}

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function buildTruckSummaries(sessions: PtoSession[]): DriverTruckSummary[] {
  const byTruck = new Map<string, PtoSession[]>();
  for (const s of sessions) {
    const list = byTruck.get(s.truck) ?? [];
    list.push(s);
    byTruck.set(s.truck, list);
  }

  const out: DriverTruckSummary[] = [];
  for (const [truck, list] of byTruck) {
    const latest = list[0]!;
    const day = list
      .filter((s) => s.date === latest.date)
      .sort((a, b) => ts(a.openIso) - ts(b.openIso));
    const totalPto = day.reduce((sum, s) => sum + (s.durationMin ?? 0), 0);
    const paired = day.filter((s) => !s.orphan).length;

    out.push({
      driver: day.find((s) => s.driver)?.driver || "\u05dc\u05d0 \u05d9\u05d3\u05d5\u05e2",
      truck,
      truckType: truck.startsWith("615") ? "\u05de\u05e9\u05d0\u05d9\u05ea \u05de\u05e0\u05d5\u05e3" : "\u05de\u05e9\u05d0\u05d9\u05ea",
      date: latest.date,
      kmTotal: "\u2014",
      driveTime: "\u2014",
      workTime: "\u2014",
      ptoTime: hhmm(totalPto),
      idleTime: "\u2014",
      verifiedStatus: `${paired}/${day.length} \u05d0\u05d9\u05e8\u05d5\u05e2\u05d9 PTO \u05de\u05d6\u05d5\u05d5\u05d2\u05d9\u05dd`,
      stops: day.map((s) => ({
        id: s.id,
        label: s.matchedNoteId ? `\u05ea.\u05de. ${s.matchedNoteId}` : "\u05dc\u05dc\u05d0 \u05ea\u05e2\u05d5\u05d3\u05d4 \u05ea\u05d5\u05d0\u05de\u05ea",
        address: s.address || "\u05db\u05ea\u05d5\u05d1\u05ea \u05dc\u05d0 \u05d9\u05d3\u05d5\u05e2\u05d4",
        arriveTime: israelTime(s.openIso),
        departTime: s.closeIso ? israelTime(s.closeIso) : undefined,
        ptoOpen: israelTime(s.openIso),
        ptoClose: s.closeIso ? israelTime(s.closeIso) : undefined,
        ptoMin: s.durationMin ?? undefined,
      })),
    });
  }
  return out;
}
