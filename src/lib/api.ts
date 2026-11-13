import {
  BASE as DEFAULT_NOTES,
  type DeliveryNote,
  type DeliveryItem,
  type Order,
  type Yard,
} from "./data";
import { CUSTOMERS as DEFAULT_CUSTOMERS, type CustomerProfile } from "./customers-data";
import { SAMPLE_STOPS as DEFAULT_GPS_STOPS, type GpsStop } from "./ituran";
import { listNotesFn, approvalFn, saveSignedNoteFn, type SheetNote } from "./notes-api.functions";
import { fetchLiveOrdersFromSheet } from "./google-orders";

export const API_BASE =
  "https://script.google.com/macros/s/AKfycbw6EmTxp0buRjEl7JfKihm4xq2NP3kbGr46lEEYP3x3Vy_3eVkaOTVzChVjXJn5vaS8Ug/exec";

export const MASTER_SHEET_ID = "AKfycbw6EmTxp0buRjEl7JfKihm4xq2NP3kbGr46lEEYP3x3Vy_3eVkaOTVzChVjXJn5vaS8Ug";

const CACHE_KEY_NOTES = "saban-live-notes-v4";
const CACHE_KEY_GPS = "saban-live-gps-v4";
const CACHE_KEY_CUSTOMERS = "saban-live-customers-v4";
const CACHE_KEY_DASHBOARD = "saban-live-dashboard-v4";
const PENDING_APPROVALS_KEY = "saban-pending-approvals-v1";

export type ApprovalPayload = {
  action: "submitApproval";
  noteId: string;
  approver: "rami" | "harel";
  note?: string;
  timestamp: string;
};

export type DashboardSummary = {
  pendingHarelCount: number;
  pendingRamiCount: number;
  totalNotesValue?: number;
  totalTonsWeight: number;
  totalItemsCount: number;
  activeOrdersCount: number;
  fieldBales60002: number;
  fieldPallets60060: number;
  lastSyncAt: string;
};

function getFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function setToStorage<T>(key: string, val: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (err) {
    console.warn("[Storage] Failed to save key:", key, err);
  }
}

function extractDriveFileId(urlOrId?: string): string | null {
  if (!urlOrId) return null;
  const match = urlOrId.match(/\/d\/([a-zA-Z0-9_-]+)/) || urlOrId.match(/id=([a-zA-Z0-9_-]+)/);
  const id = match ? match[1] : urlOrId;
  return id && id.length > 15 ? id : null;
}

function parseItemsSummary(raw: unknown): DeliveryItem[] {
  if (Array.isArray(raw)) return raw as DeliveryItem[];
  const str = String(raw || "").trim();
  if (!str) {
    return [{ name: "חומרי בניין (כללי)", qty: 1, ordered: 1, weightKg: 1000, unit: "משלוח" }];
  }
  const parts = str.split(/[+\n,]/).map((p) => p.trim()).filter(Boolean);
  const parsed = parts.map((part) => {
    const qtyMatch = part.match(/^(\d+(?:\.\d+)?)/);
    const qty = qtyMatch ? parseFloat(qtyMatch[1]) : 1;
    const name = part.replace(/^(\d+(?:\.\d+)?)\s*/, "").trim() || part;
    const isBale = name.includes("בלה") || name.includes("חול") || name.includes("סומסום") || name.includes("חמרה");
    const isPallet = name.includes("משטח") || name.includes("פלטה") || name.includes("בלוק");
    const isCement = name.includes("מלט") || name.includes("טיח") || name.includes("ריצופית") || name.includes("דבק");
    return {
      name,
      qty,
      ordered: qty,
      weightKg: isBale ? 1000 : isPallet ? 1200 : isCement ? 25 : 50,
      unit: isBale ? "בלה" : isPallet ? "משטח" : isCement ? "שק" : "יח׳",
      deposit: isBale ? 45 : isPallet ? 60 : undefined,
    };
  });
  return parsed.length > 0 ? parsed : [{ name: str, qty: 1, ordered: 1, weightKg: 1000, unit: "יח׳" }];
}

export function normalizeDeliveryNote(r: Record<string, unknown>): DeliveryNote {
  const id = String(r["מספר ת.מ"] || r["מספר תעודה"] || r.noteId || r.id || "").trim();
  const comaxOrder = String(r["בגין הזמנה"] || r.orderId || r.comaxOrder || "").trim();
  const customer = String(r["שם לקוח"] || r.customerName || r.customer || "").trim();
  const customerNo = String(r["מספר לקוח"] || r.customerNo || "").trim();
  const date = String(r["תאריך אספקה"] || r.deliveryDate || r.date || "").trim();
  const siteAddress = String(r["כתובת אתר"] || r["כתובת יעד"] || r.siteAddress || r.address || "").trim();
  const yardRaw = String(r["מחסן מוצא"] || r.yard || "").trim();
  const yard: Yard =
    yardRaw.includes("התלמיד") || yardRaw.includes("1")
      ? "מחסן 1 התלמיד 6"
      : yardRaw.includes("החרש") || yardRaw.includes("4")
        ? "מחסן 4 החרש 10"
        : (yardRaw as Yard);
  const driver = String(r["נהג ורכב"] || r["נהג משוייך"] || r.driver || "").trim();
  const rawItems = r["פירוט מוצרים ומק\"טים"] || r["סחורה מפורטת"] || r.itemsSummary || r.items;
  const items = parseItemsSummary(rawItems);
  const rawBales = r["בלות פקדון (60002)"] ?? r.bales60002 ?? (r.deposits as any)?.bales60002?.delivered ?? 0;
  const rawPallets = r["משטחי סבן (60060)"] ?? r.pallets60060 ?? (r.deposits as any)?.pallets60060?.delivered ?? 0;
  const rawBalesBilled = r["חיוב בלות (60002)"] ?? r["חיוב בלות"] ?? (r.deposits as any)?.bales60002?.billed;
  const rawPalletsBilled = r["חיוב משטחים (60060)"] ?? r["חיוב משטחים"] ?? (r.deposits as any)?.pallets60060?.billed;
  const balesQty = typeof rawBales === "number" ? rawBales : parseInt(String(rawBales).replace(/[^\d]/g, "") || "0", 10);
  const palletsQty = typeof rawPallets === "number" ? rawPallets : parseInt(String(rawPallets).replace(/[^\d]/g, "") || "0", 10);
  const balesBilledQty = typeof rawBalesBilled === "number" ? rawBalesBilled : rawBalesBilled ? parseInt(String(rawBalesBilled).replace(/[^\d]/g, "") || "0", 10) : 0;
  const palletsBilledQty = typeof rawPalletsBilled === "number" ? rawPalletsBilled : rawPalletsBilled ? parseInt(String(rawPalletsBilled).replace(/[^\d]/g, "") || "0", 10) : 0;
  const driveUrl = String(r["קישור קובץ Drive"] || r["קישור דרייב"] || r.driveUrl || r.fileUrl || "").trim();
  const signedBy = String(r["אימות חתימת שטח"] || r["חתימת לקוח"] || r.signedBy || "").trim();
  const craneTime = String(r["זמני מנוף/פריקה"] || r["זמן פריקה/מנוף"] || r.craneTime || "").trim();
  const fileId = extractDriveFileId(driveUrl);
  const thumbnail = fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600` : null;

  const itArrive = r.itArrive != null ? String(r.itArrive) : undefined;
  const itDepart = r.itDepart != null ? String(r.itDepart) : undefined;
  const itStopRaw = r.itStop;
  const itStop =
    itStopRaw == null || itStopRaw === ""
      ? null
      : Number.isFinite(Number(itStopRaw))
        ? Number(itStopRaw)
        : null;
  const itStatus = r.itStatus != null ? String(r.itStatus) : undefined;
  const gpsSourceRaw = String(r.gpsSource || "").trim();
  const gpsSource = (gpsSourceRaw || undefined) as DeliveryNote["gpsSource"];
  const hasGpsMatch =
    r.hasGpsMatch === true ||
    r.hasGpsMatch === "true" ||
    Boolean(itArrive && itDepart);

  return {
    id, comaxOrder, customer, customerNo, date, siteAddress, yard, driver, items,
    deposits: {
      bales60002: { delivered: balesQty, billed: balesBilledQty },
      pallets60060: { delivered: palletsQty, billed: palletsBilledQty },
    },
    gps: craneTime || hasGpsMatch
      ? { status: "ok", note: craneTime ? `${craneTime} — אומת באיתוראן` : `GPS מארכיון (${gpsSource || "sheet"})` }
      : { status: "warn", note: "טרם הוצלב מול איתוראן" },
    signedBy, craneTime, driveUrl: driveUrl || undefined,
    scans: thumbnail ? [thumbnail] : [], scanImage: thumbnail || undefined, live: true,
    itArrive, itDepart, itStop, itStatus, gpsSource, hasGpsMatch,
  };
}

export async function fetchNotes(): Promise<DeliveryNote[]> {
  const cached = getFromStorage<DeliveryNote[]>(CACHE_KEY_NOTES, DEFAULT_NOTES);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${API_BASE}?action=getNotes&sheetId=${MASTER_SHEET_ID}`, { method: "GET", signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      let rawList: Record<string, unknown>[] | null = null;
      if (Array.isArray(data)) rawList = data as Record<string, unknown>[];
      else if (data && typeof data === "object" && Array.isArray((data as any).data)) rawList = (data as any).data;
      else if (data && typeof data === "object" && Array.isArray((data as any).notes)) rawList = (data as any).notes;
      if (rawList && rawList.length > 0) {
        const cleanNotes = rawList.map(normalizeDeliveryNote);
        if (cleanNotes.length > 0) { setToStorage(CACHE_KEY_NOTES, cleanNotes); return cleanNotes; }
      }
    }
  } catch (err) {
    console.warn("[API] fetchNotes error, using cached notes:", err);
  }
  return cached && cached.length > 0 ? cached : DEFAULT_NOTES;
}

export async function fetchOrders(): Promise<Order[]> {
  return fetchLiveOrdersFromSheet();
}
export const fetchLiveOrders = fetchOrders;

export async function fetchGps(): Promise<GpsStop[]> {
  const normalizeStops = (list: unknown[]): GpsStop[] => {
    if (!Array.isArray(list)) return DEFAULT_GPS_STOPS;
    const mapped = list
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const r = item as Record<string, unknown>;
        const plate = String(r.plate || r["מספר רישוי"] || r["רכב"] || "").trim();
        const address = String(r.address || r["כתובת לקוח מאותרת"] || r["כתובת"] || "").trim();
        const rawArrive = String(r.arrive || r["שעת כניסה לגדר"] || r["שעת כניסה"] || "");
        const rawDepart = String(r.depart || r["שעת יציאה מגדר"] || r["שעת יציאה"] || "");
        const arriveMatch = rawArrive.match(/\d{1,2}:\d{2}/)?.[0];
        const departMatch = rawDepart.match(/\d{1,2}:\d{2}/)?.[0];
        const arrive = arriveMatch ? arriveMatch.padStart(5, "0") : "";
        const depart = departMatch ? departMatch.padStart(5, "0") : "";
        return plate ? { plate, address, arrive, depart } : null;
      })
      .filter((s): s is GpsStop => Boolean(s && s.plate));
    return mapped.length > 0 ? mapped : DEFAULT_GPS_STOPS;
  };
  const rawCached = getFromStorage<unknown[]>(CACHE_KEY_GPS, DEFAULT_GPS_STOPS);
  const cached = normalizeStops(rawCached);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${API_BASE}?action=getGps&sheetId=${MASTER_SHEET_ID}`, { method: "GET", signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      const rawStops = Array.isArray(data) ? data : data?.data;
      if (Array.isArray(rawStops) && rawStops.length > 0) {
        const cleanStops = normalizeStops(rawStops);
        setToStorage(CACHE_KEY_GPS, cleanStops);
        return cleanStops;
      }
    }
  } catch (err) {
    console.warn("[API] fetchGps fallback:", err);
  }
  return cached;
}

export async function fetchCustomers(): Promise<CustomerProfile[]> {
  const cached = getFromStorage<CustomerProfile[]>(CACHE_KEY_CUSTOMERS, DEFAULT_CUSTOMERS);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`${API_BASE}?action=getCustomers&sheetId=${MASTER_SHEET_ID}`, { method: "GET", signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : data?.data;
      if (list && list.length > 0) { setToStorage(CACHE_KEY_CUSTOMERS, list); return list; }
    }
  } catch (err) {
    console.warn("[API] fetchCustomers error:", err);
  }
  return cached;
}

export async function fetchDashboard(): Promise<DashboardSummary> {
  const fallback: DashboardSummary = {
    pendingHarelCount: 0, pendingRamiCount: 0, totalNotesValue: 0, totalTonsWeight: 0, totalItemsCount: 0,
    activeOrdersCount: 0, fieldBales60002: 0, fieldPallets60060: 0,
    lastSyncAt: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
  };
  try {
    const res = await fetch(`${API_BASE}?action=getDashboard&sheetId=${MASTER_SHEET_ID}`);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === "object") return { ...fallback, ...data, lastSyncAt: new Date().toLocaleTimeString("he-IL") };
    }
  } catch (err) {
    console.warn("[API] fetchDashboard error:", err);
  }
  return fallback;
}

export async function submitApproval(noteId: string, approver: "rami" | "harel", note?: string): Promise<{ success: boolean; offlineQueued?: boolean; error?: string }> {
  try {
    await approvalFn({ data: { noteId, approver, note } });
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isServerRejection = msg.includes("נדחה") || msg.includes("לא מורשה") || msg.includes("אין תעודה חתומה");
    if (isServerRejection) return { success: false, offlineQueued: false, error: msg };
    const payload: ApprovalPayload = { action: "submitApproval", noteId, approver, note, timestamp: new Date().toISOString() };
    const pending = getFromStorage<ApprovalPayload[]>(PENDING_APPROVALS_KEY, []);
    pending.push(payload);
    setToStorage(PENDING_APPROVALS_KEY, pending);
    return { success: false, offlineQueued: true, error: msg };
  }
}

export async function flushPendingApprovals(): Promise<void> {
  if (typeof window === "undefined" || !navigator.onLine) return;
  const pending = getFromStorage<ApprovalPayload[]>(PENDING_APPROVALS_KEY, []);
  if (!pending || pending.length === 0) return;
  const remaining: ApprovalPayload[] = [];
  for (const item of pending) {
    try { await approvalFn({ data: { noteId: item.noteId, approver: item.approver, note: item.note } }); }
    catch { remaining.push(item); }
  }
  setToStorage(PENDING_APPROVALS_KEY, remaining);
}

export async function saveSignedNoteToSheet(params: {
  noteId: string; customer: string; driveUrl?: string; signedScanDataUrl?: string;
  itemsCount?: number; totalWeightKg?: number; signedBy?: string; statusNote?: string;
}): Promise<{ success: boolean; updatedDriveUrl?: string }> {
  try {
    const cached = getFromStorage<DeliveryNote[]>(CACHE_KEY_NOTES, []);
    setToStorage(CACHE_KEY_NOTES, cached.map((n) => n.id === params.noteId ? { ...n, signedBy: params.signedBy || n.signedBy, driveUrl: params.driveUrl || n.driveUrl, scanImage: params.signedScanDataUrl || n.scanImage } : n));
  } catch {}
  try {
    const res = await saveSignedNoteFn({ data: params as any });
    return { success: true, updatedDriveUrl: (res as any)?.driveUrl || params.driveUrl };
  } catch {
    return { success: true, updatedDriveUrl: params.driveUrl };
  }
}

function parseDepositQty(text: string | undefined, sku: string): number {
  if (!text) return 0;
  const re = new RegExp(sku + "[^\\d]*(\\d+)");
  const m = text.match(re);
  return m ? parseInt(m[1], 10) : 0;
}

function sheetNoteToDeliveryNote(n: SheetNote): DeliveryNote {
  const itArrive = n.itArrive != null ? String(n.itArrive) : undefined;
  const itDepart = n.itDepart != null ? String(n.itDepart) : undefined;
  const itStop =
    n.itStop == null || (n.itStop as any) === ""
      ? null
      : Number.isFinite(Number(n.itStop))
        ? Number(n.itStop)
        : null;
  const itStatus = n.itStatus != null ? String(n.itStatus) : undefined;
  const gpsSource = (n.gpsSource || undefined) as DeliveryNote["gpsSource"];
  const hasGpsMatch =
    n.hasGpsMatch === true || Boolean(itArrive && itDepart);

  return {
    id: n.id || n.noteId || "",
    comaxOrder: n.comaxOrder || n.orderId || "",
    customer: n.customer || n.customerName || "",
    customerNo: n.customerNo || "",
    date: n.date || n.deliveryDate || "",
    siteAddress: n.siteAddress || n.address || "",
    yard: (n.yard as Yard) || "מחסן 1 התלמיד 6",
    driver: n.driver || "",
    items: Array.isArray(n.items) ? (n.items as DeliveryItem[]) : [],
    deposits: {
      bales60002: { delivered: parseDepositQty(n.depositsText, "60002"), billed: 0 },
      pallets60060: { delivered: parseDepositQty(n.depositsText, "60060"), billed: 0 },
    },
    gps: hasGpsMatch
      ? { status: "ok", note: `GPS מארכיון (${gpsSource || "sheet"})` }
      : { status: "warn", note: "טרם הוצלב" },
    signedBy: n.signedBy || "",
    craneTime: n.craneTime || "",
    driveUrl: n.driveUrl || n.signedUrl || undefined,
    fileId: n.fileId || extractDriveFileId(n.signedUrl) || extractDriveFileId(n.driveUrl) || undefined,
    scans: [],
    live: true,
    itArrive,
    itDepart,
    itStop,
    itStatus,
    gpsSource,
    hasGpsMatch,
  };
}

export async function fetchLiveNotes(): Promise<DeliveryNote[]> {
  const { notes } = await listNotesFn();
  return notes.map(sheetNoteToDeliveryNote);
}

export async function saveSignedNoteStrict(params: {
  noteId: string; customer: string; signedBy?: string; statusNote?: string; dataUrl: string;
}): Promise<{ driveUrl: string; folder: string }> {
  if (!params.dataUrl) throw new Error("אין תמונת קנבס לשמירה");
  return saveSignedNoteFn({ data: params });
}

export async function approveStrict(
  noteId: string,
  approver: "rami" | "harel",
  note?: string,
  auditEvidence?: Record<string, string>,
): Promise<void> {
  await approvalFn({ data: { noteId, approver, note, auditEvidence } });
}
