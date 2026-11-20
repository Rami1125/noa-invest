/**
 * שליפת יום אספקה מ-GAS: getDeliveryDay?date=YYYY-MM-DD&token=
 */
import { createServerFn } from "@tanstack/react-start";
import type { DeliveryDayPayload, DeliveryNoteDayRow, XrayFinding } from "@/lib/logistics-dict/delivery-day-data";
import { getSeedDeliveryDay } from "@/lib/logistics-dict/delivery-day-data";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbzGOG7GxiXkT-OtUw4obBvGkyw_wKRhv2Jjf4I8qbLATIIMKAN099UHJqqYjdfKV-WwWw/exec";

function gasUrl(): string {
  return (process.env["GAS_URL"] || "").trim() || DEFAULT_GAS_URL;
}

function apiToken(): string {
  const t = process.env["API_TOKEN"];
  if (!t) throw new Error("API_TOKEN לא מוגדר בשרת (Environment Variables)");
  return t;
}

async function gasGet(action: string, extra: Record<string, string> = {}) {
  const u = new URL(gasUrl());
  u.searchParams.set("action", action);
  u.searchParams.set("token", apiToken());
  for (const [k, v] of Object.entries(extra)) {
    if (v != null && v !== "") u.searchParams.set(k, v);
  }
  u.searchParams.set("nocache", "1");
  const res = await fetch(u.toString(), {
    redirect: "follow",
    signal: AbortSignal.timeout(90_000),
  });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`תשובה לא תקינה מ-Apps Script (HTTP ${res.status})`);
  }
  if (data.error) throw new Error(String(data.error));
  if (data.success === false) throw new Error(String(data.message || data.error || "הפעולה נכשלה"));
  return data;
}

function mapNote(raw: Record<string, unknown>): DeliveryNoteDayRow {
  return {
    noteId: String(raw.noteId || raw.docNumber || raw.id || ""),
    deliveryDate: String(raw.deliveryDate || raw.date || ""),
    noteTime: String(raw.noteTime || raw.time || ""),
    orderId: String(raw.orderId || raw.comaxOrder || ""),
    customerNo: String(raw.customerNo || ""),
    customerName: String(raw.customerName || raw.customer || ""),
    address: String(raw.address || ""),
    driver: String(raw.driver || ""),
    truck: String(raw.truck || ""),
    itemsRaw: String(raw.itemsRaw || raw.itemsText || ""),
    depositsRaw: String(raw.depositsRaw || raw.depositsText || ""),
    craneText: String(raw.craneText || raw.craneNotes || ""),
    craneMin: raw.craneMin == null || raw.craneMin === "" ? null : Number(raw.craneMin),
    ituranArrive: String(raw.ituranArrive || raw.itArrive || ""),
    ituranDepart: String(raw.ituranDepart || raw.itDepart || ""),
    ituranStopMin: raw.ituranStopMin == null && raw.itStop == null ? null : Number(raw.ituranStopMin ?? raw.itStop),
    status: String(raw.status || raw.approvalStatus || ""),
    scanFile: String(raw.scanFile || ""),
    driveUrl: String(raw.driveUrl || ""),
    isStorno: Boolean(raw.isStorno),
    gpsMatch: String(raw.gpsMatch || ""),
  };
}

function mapPayload(data: Record<string, unknown>, dateIso: string): DeliveryDayPayload {
  const kpi = (data.kpi as Record<string, unknown>) || {};
  const notes = Array.isArray(data.notes) ? (data.notes as Record<string, unknown>[]).map(mapNote) : [];
  const stornos = Array.isArray(data.stornos)
    ? (data.stornos as Record<string, unknown>[]).map(mapNote)
    : [];
  const xray = Array.isArray(data.xray)
    ? (data.xray as Record<string, unknown>[]).map(
        (x): XrayFinding => ({
          noteId: String(x.noteId || ""),
          checkId: String(x.checkId || ""),
          severity: (String(x.severity || "מידע") as XrayFinding["severity"]) || "מידע",
          finding: String(x.finding || ""),
          suggestedFix: String(x.suggestedFix || ""),
          status: String(x.status || ""),
        }),
      )
    : [];

  return {
    dateIso: String(data.date || dateIso),
    truck: String(data.truck || ""),
    driver: String(data.driver || ""),
    netNotes: Number(data.netNotes ?? notes.length) || 0,
    stornoNotes: Number(data.stornoNotes ?? stornos.length) || 0,
    customers: Number(data.customers) || 0,
    craneMinSum: Number(kpi.craneMinSum ?? data.craneMinSum) || 0,
    dep60002: Number(kpi.dep60002 ?? data.dep60002) || 0,
    dep60060: Number(kpi.dep60060 ?? data.dep60060) || 0,
    dep60006: Number(kpi.dep60006 ?? data.dep60006) || 0,
    notes,
    stornos,
    xray,
    missing: Array.isArray(data.missing) ? (data.missing as string[]) : [],
    scanFile: String(data.scanFile || ""),
  };
}

export const getDeliveryDayFn = createServerFn({ method: "POST" })
  .inputValidator((d: { date?: string } = {}) => d)
  .handler(async ({ data }) => {
    const dateIso = String(data?.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      throw new Error("נדרש date בפורמט YYYY-MM-DD");
    }
    try {
      const raw = await gasGet("getDeliveryDay", { date: dateIso });
      const payload = mapPayload(raw, dateIso);
      return { ok: true as const, source: "gas" as const, day: payload, gasUrl: gasUrl() };
    } catch (err) {
      const seed = getSeedDeliveryDay(dateIso);
      if (seed) {
        return {
          ok: true as const,
          source: "seed" as const,
          day: seed,
          gasUrl: gasUrl(),
          warning: err instanceof Error ? err.message : String(err),
        };
      }
      throw err;
    }
  });

export const getDeliveryDatesFn = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const raw = await gasGet("getDeliveryDates");
    const dates = Array.isArray(raw.dates) ? raw.dates : [];
    return { ok: true as const, source: "gas" as const, dates, gasUrl: gasUrl() };
  } catch (err) {
    return {
      ok: true as const,
      source: "seed" as const,
      dates: [{ date: "2026-11-17", rows: 11 }],
      warning: err instanceof Error ? err.message : String(err),
      gasUrl: gasUrl(),
    };
  }
});
