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
  "https://script.google.com/macros/s/AKfycbyv4x_fGMkWmjOLujRymJITBoGQpnbIbJnZp4S9nNs6sacQb1g7x8vyHjaCw6y_t7Pxiw/exec";

export const MASTER_SHEET_ID = "1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw";

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
  totalNotesValue?: number; // legacy alias
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

/**
 * חילוץ מזהה קובץ Google Drive מתוך קישור מלא
 */
function extractDriveFileId(urlOrId?: string): string | null {
  if (!urlOrId) return null;
  const match = urlOrId.match(/\/d\/([a-zA-Z0-9_-]+)/) || urlOrId.match(/id=([a-zA-Z0-9_-]+)/);
  const id = match ? match[1] : urlOrId;
  return id && id.length > 15 ? id : null;
}

/**
 * פיענוח טקסט פריטים חופשי מגיליון למבנה DeliveryItem מובנה ומדויק
 */
function parseItemsSummary(raw: unknown): DeliveryItem[] {
  if (Array.isArray(raw)) return raw as DeliveryItem[];
  const str = String(raw || "").trim();
  if (!str) {
    return [{ name: "חומרי בניין (כללי)", qty: 1, ordered: 1, weightKg: 1000, unit: "משלוח" }];
  }

  const parts = str
    .split(/[+\n,]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const parsed = parts.map((part) => {
    const qtyMatch = part.match(/^(\d+(?:\.\d+)?)/);
    const qty = qtyMatch ? parseFloat(qtyMatch[1]) : 1;
    const name = part.replace(/^(\d+(?:\.\d+)?)\s*/, "").trim() || part;
    const isBale =
      name.includes("בלה") ||
      name.includes("חול") ||
      name.includes("סומסום") ||
      name.includes("חמרה");
    const isPallet = name.includes("משטח") || name.includes("פלטה") || name.includes("בלוק");
    const isCement =
      name.includes("מלט") ||
      name.includes("טיח") ||
      name.includes("ריצופית") ||
      name.includes("דבק");

    return {
      name,
      qty,
      ordered: qty,
      weightKg: isBale ? 1000 : isPallet ? 1200 : isCement ? 25 : 50,
      unit: isBale ? "בלה" : isPallet ? "משטח" : isCement ? "שק" : "יח׳",
      deposit: isBale ? 45 : isPallet ? 60 : undefined,
    };
  });

  return parsed.length > 0
    ? parsed
    : [{ name: str, qty: 1, ordered: 1, weightKg: 1000, unit: "יח׳" }];
}

/**
 * נרמול שורה גולמית מ-Google Sheets (עמודות בעברית) למבנה DeliveryNote מלא
 */
export function normalizeDeliveryNote(r: Record<string, unknown>): DeliveryNote {
  const id = String(r["מספר ת.מ"] || r["מספר תעודה"] || r.noteId || r.id || "").trim();
  const comaxOrder = String(r["בגין הזמנה"] || r.orderId || r.comaxOrder || "").trim();
  const customer = String(r["שם לקוח"] || r.customerName || r.customer || "").trim();
  const customerNo = String(r["מספר לקוח"] || r.customerNo || "").trim();
  const date = String(r["תאריך אספקה"] || r.deliveryDate || r.date || "").trim();
  const siteAddress = String(
    r["כתובת אתר"] || r["כתובת יעד"] || r.siteAddress || r.address || "",
  ).trim();

  const yardRaw = String(r["מחסן מוצא"] || r.yard || "").trim();
  const yard: Yard =
    yardRaw.includes("התלמיד") || yardRaw.includes("1")
      ? "מחסן 1 התלמיד 6"
      : yardRaw.includes("החרש") || yardRaw.includes("4")
        ? "מחסן 4 החרש 10"
        : (yardRaw as Yard);

  const driver = String(r["נהג ורכב"] || r["נהג משוייך"] || r.driver || "").trim();

  const rawItems = r["פירוט מוצרים ומק״טים"] || r["סחורה מפורטת"] || r.itemsSummary || r.items;
  const items = parseItemsSummary(rawItems);

  // פיענוח פקדונות בלות ומשטחים
  const rawBales =
    r["בלות פקדון (60002)"] ?? r.bales60002 ?? r.deposits?.bales60002?.delivered ?? 0;
  const rawPallets =
    r["משטחי סבן (60060)"] ?? r.pallets60060 ?? r.deposits?.pallets60060?.delivered ?? 0;
  const rawBalesBilled = r["חיוב בלות (60002)"] ?? r["חיוב בלות"] ?? r.deposits?.bales60002?.billed;
  const rawPalletsBilled =
    r["חיוב משטחים (60060)"] ?? r["חיוב משטחים"] ?? r.deposits?.pallets60060?.billed;

  const balesQty =
    typeof rawBales === "number"
      ? rawBales
      : parseInt(String(rawBales).replace(/[^\d]/g, "") || "0", 10);
  const palletsQty =
    typeof rawPallets === "number"
      ? rawPallets
      : parseInt(String(rawPallets).replace(/[^\d]/g, "") || "0", 10);

  const balesBilledQty =
    typeof rawBalesBilled === "number"
      ? rawBalesBilled
      : rawBalesBilled
        ? parseInt(String(rawBalesBilled).replace(/[^\d]/g, "") || "0", 10)
        : 0;
  const palletsBilledQty =
    typeof rawPalletsBilled === "number"
      ? rawPalletsBilled
      : rawPalletsBilled
        ? parseInt(String(rawPalletsBilled).replace(/[^\d]/g, "") || "0", 10)
        : 0;

  const driveUrl = String(
    r["קישור קובץ Drive"] || r["קישור דרייב"] || r.driveUrl || r.fileUrl || "",
  ).trim();

  const signedBy = String(r["אימות חתימת שטח"] || r["חתימת לקוח"] || r.signedBy || "").trim();
  const craneTime = String(r["זמני מנוף/פריקה"] || r["זמן פריקה/מנוף"] || r.craneTime || "").trim();

  // יצירת קישור תמונה ישיר מ-Google Drive אם קיים קישור קובץ
  const fileId = extractDriveFileId(driveUrl);
  const thumbnail = fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600` : null;

  return {
    id,
    comaxOrder,
    customer,
    customerNo,
    date,
    siteAddress,
    yard,
    driver,
    items,
    deposits: {
      bales60002: { delivered: balesQty, billed: balesBilledQty },
      pallets60060: { delivered: palletsQty, billed: palletsBilledQty },
    },
    gps: craneTime
      ? { status: "ok", note: `${craneTime} — אומת באיתוראן` }
      : { status: "warn", note: "טרם הוצלב מול איתוראן" },
    signedBy,
    craneTime,
    driveUrl: driveUrl || undefined,
    scans: thumbnail ? [thumbnail] : [],
    scanImage: thumbnail || undefined,
    live: true,
  };
}

/**
 * שליפת תעודות משלוח חיות ישירות מגיליון Google Sheets ("📑_ארכיון_תעודות_משלוח")
 */
export async function fetchNotes(): Promise<DeliveryNote[]> {
  const cached = getFromStorage<DeliveryNote[]>(CACHE_KEY_NOTES, DEFAULT_NOTES);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${API_BASE}?action=getNotes&sheetId=${MASTER_SHEET_ID}`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      let rawList: Record<string, unknown>[] | null = null;
      if (Array.isArray(data)) rawList = data as Record<string, unknown>[];
      else if (
        data &&
        typeof data === "object" &&
        Array.isArray((data as Record<string, unknown>).data)
      ) {
        rawList = (data as Record<string, unknown>).data as Record<string, unknown>[];
      } else if (
        data &&
        typeof data === "object" &&
        Array.isArray((data as Record<string, unknown>).notes)
      ) {
        rawList = (data as Record<string, unknown>).notes as Record<string, unknown>[];
      }

      if (rawList && rawList.length > 0) {
        const cleanNotes = rawList.map(normalizeDeliveryNote);
        if (cleanNotes.length > 0) {
          setToStorage(CACHE_KEY_NOTES, cleanNotes);
          return cleanNotes;
        }
      }
    }
  } catch (err) {
    console.warn("[API] fetchNotes error, using cached notes:", err);
  }
  return cached && cached.length > 0 ? cached : DEFAULT_NOTES;
}

/**
 * שליפת סידור והזמנות חיות מתוך הגיליון ("🚚_הזמנות_חיות_וסידור")
 */
/** הזמנות חיות בלבד — מקור יחיד דרך orders.functions → GAS getOrders. */
export async function fetchOrders(): Promise<Order[]> {
  return fetchLiveOrdersFromSheet();
}

export const fetchLiveOrders = fetchOrders;

/**
 * שליפת נתוני איתוראן מתוך הגיליון ("🛰️_הצלבת_איתוראן_GPS")
 */
export async function fetchGps(): Promise<GpsStop[]> {
  const normalizeStops = (list: unknown[]): GpsStop[] => {
    if (!Array.isArray(list)) return DEFAULT_GPS_STOPS;
    const mapped = list
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const r = item as Record<string, unknown>;
        const plate = String(r.plate || r["מספר רישוי"] || r["רכב"] || "").trim();
        const address = String(r.address || r["כתובת לקוח מאותרת"] || r["כתובת"] || "").trim();
        const rawArrive = String(r.arrive || r["שעת כניסה לגדר"] || r["שעת כניסה"] || "08:00");
        const rawDepart = String(r.depart || r["שעת יציאה מגדר"] || r["שעת יציאה"] || "08:30");
        const arrive = (rawArrive.match(/\d{1,2}:\d{2}/)?.[0] ?? "08:00").padStart(5, "0");
        const depart = (rawDepart.match(/\d{1,2}:\d{2}/)?.[0] ?? "08:30").padStart(5, "0");
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

    const res = await fetch(`${API_BASE}?action=getGps&sheetId=${MASTER_SHEET_ID}`, {
      method: "GET",
      signal: controller.signal,
    });
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
    console.warn("[API] fetchGps fallback to normalized cache:", err);
  }
  return cached;
}

/**
 * שליפת תיקי לקוחות ומאזן מתוך הגיליון ("👥_תיקי_לקוחות_ומאזן")
 */
export async function fetchCustomers(): Promise<CustomerProfile[]> {
  const cached = getFromStorage<CustomerProfile[]>(CACHE_KEY_CUSTOMERS, DEFAULT_CUSTOMERS);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(`${API_BASE}?action=getCustomers&sheetId=${MASTER_SHEET_ID}`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : data?.data;
      if (list && list.length > 0) {
        setToStorage(CACHE_KEY_CUSTOMERS, list);
        return list;
      }
    }
  } catch (err) {
    console.warn("[API] fetchCustomers error:", err);
  }
  return cached;
}

/**
 * שליפת סיכום מנהלים לדשבורד מנכ"ל ("👑_דשבורד_מנכל_ובקרה")
 */
export async function fetchDashboard(): Promise<DashboardSummary> {
  const fallback: DashboardSummary = {
    pendingHarelCount: 3,
    pendingRamiCount: 1,
    totalNotesValue: 28450,
    activeOrdersCount: 8,
    fieldBales60002: 418,
    fieldPallets60060: 276,
    lastSyncAt: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
  };

  try {
    const res = await fetch(`${API_BASE}?action=getDashboard&sheetId=${MASTER_SHEET_ID}`);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === "object") {
        return { ...fallback, ...data, lastSyncAt: new Date().toLocaleTimeString("he-IL") };
      }
    }
  } catch (err) {
    console.warn("[API] fetchDashboard error:", err);
  }
  return fallback;
}

/**
 * שליחת אישור תעודה (שלב ראמי או אישור מנכ"ל סופי) ל-Google Apps Script
 */
export async function submitApproval(
  noteId: string,
  approver: "rami" | "harel",
  note?: string,
): Promise<{ success: boolean; offlineQueued?: boolean; error?: string }> {
  try {
    await approvalFn({ data: { noteId, approver, note } });
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isServerRejection =
      msg.includes("נדחה") || msg.includes("לא מורשה") || msg.includes("אין תעודה חתומה");

    if (isServerRejection) {
      return {
        success: false,
        offlineQueued: false,
        error: msg,
      };
    }

    const payload: ApprovalPayload = {
      action: "submitApproval",
      noteId,
      approver,
      note,
      timestamp: new Date().toISOString(),
    };
    const pending = getFromStorage<ApprovalPayload[]>(PENDING_APPROVALS_KEY, []);
    pending.push(payload);
    setToStorage(PENDING_APPROVALS_KEY, pending);
    return {
      success: false,
      offlineQueued: true,
      error: msg,
    };
  }
}

/**
 * סנכרון אישורים שנשמרו ב-Offline ברגע שהחיבור מתחדש
 */
export async function flushPendingApprovals(): Promise<void> {
  if (typeof window === "undefined" || !navigator.onLine) return;
  const pending = getFromStorage<ApprovalPayload[]>(PENDING_APPROVALS_KEY, []);
  if (!pending || pending.length === 0) return;

  const remaining: ApprovalPayload[] = [];
  for (const item of pending) {
    try {
      await approvalFn({
        data: { noteId: item.noteId, approver: item.approver, note: item.note },
      });
    } catch {
      remaining.push(item);
    }
  }
  setToStorage(PENDING_APPROVALS_KEY, remaining);
}

/**
 * שמירת תעודת משלוח חתומה חזרה לתיקיית לקוח והזרקת קישור מעודכן לגיליון Google Sheets
 */
export async function saveSignedNoteToSheet(params: {
  noteId: string;
  customer: string;
  driveUrl?: string;
  signedScanDataUrl?: string;
  itemsCount?: number;
  totalWeightKg?: number;
  signedBy?: string;
  statusNote?: string;
}): Promise<{ success: boolean; updatedDriveUrl?: string }> {
  const payload = {
    action: "saveSignedNote",
    noteId: params.noteId,
    customer: params.customer,
    driveUrl: params.driveUrl,
    signedScanDataUrl: params.signedScanDataUrl,
    itemsCount: params.itemsCount,
    totalWeightKg: params.totalWeightKg,
    signedBy: params.signedBy,
    statusNote: params.statusNote || "נבדק ונחתם בקנבס סבן",
    timestamp: new Date().toISOString(),
  };

  // עדכון מקומי מיידי במטמון
  try {
    const cached = getFromStorage<DeliveryNote[]>(CACHE_KEY_NOTES, []);
    const updatedNotes = cached.map((n) => {
      if (n.id === params.noteId) {
        return {
          ...n,
          signedBy: params.signedBy || n.signedBy,
          driveUrl: params.driveUrl || n.driveUrl,
          scanImage: params.signedScanDataUrl || n.scanImage,
        };
      }
      return n;
    });
    setToStorage(CACHE_KEY_NOTES, updatedNotes);
  } catch (err) {
    console.warn("[API] Failed to update local cached note:", err);
  }

  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      return { success: true, updatedDriveUrl: data?.driveUrl || params.driveUrl };
    }
  } catch (err) {
    console.warn("[API] saveSignedNoteToSheet network fallback:", err);
  }

  return { success: true, updatedDriveUrl: params.driveUrl };
}

export type RamiInquiryItem = {
  rowIndex: number;
  receivedDate: string;
  docNumber: string;
  customer: string;
  address: string;
  driver: string;
  errorReason: string;
  aiAnalysis: string;
  ramiReply: string;
  status: string;
  harelApproval: string;
  driveLink: string;
};

/**
 * שליפת תעודות בירור ראמי בזמן אמת מתוך הגיליון
 */
export async function fetchRamiInquiries(): Promise<RamiInquiryItem[]> {
  try {
    const res = await fetch(`${API_BASE}?action=getRamiInquiries&sheetId=${MASTER_SHEET_ID}`);
    if (res.ok) {
      const data = await res.json();
      const rawList = Array.isArray(data) ? data : data?.data || data?.inquiries;
      if (Array.isArray(rawList)) {
        return rawList.map((r: any, i: number) => ({
          rowIndex: r.rowIndex || i + 2,
          receivedDate: r.receivedDate || r["תאריך קליטה"] || "",
          docNumber: r.docNumber || r["מס׳ תעודה"] || "",
          customer: r.customer || r["שם לקוח"] || "",
          address: r.address || r["כתובת אספקה"] || "",
          driver: r.driver || r["נהג"] || "",
          errorReason: r.errorReason || r["תיאור החריגה / הטעות שזוהתה"] || "",
          aiAnalysis: r.aiAnalysis || r["ניתוח AI וכתב יד"] || "",
          ramiReply: r.ramiReply || r["הסבר ומענה מראמי"] || "",
          status: r.status || r["סטטוס בירור"] || "ממתין למענה ראמי ⏳",
          harelApproval: r.harelApproval || r["אושר ע״י הראל"] || "",
          driveLink: r.driveLink || r["קישור לתעודה"] || r["מזהה קובץ Drive"] || "",
        }));
      }
    }
  } catch (err) {
    console.warn("[API] fetchRamiInquiries error:", err);
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* נתונים חיים בלבד (ללא נפילה לדמה): משמשים את מסך הקנבס               */
/* ------------------------------------------------------------------ */

function parseDepositQty(text: string, code: string): number | null {
  const m = text.match(new RegExp(`${code}\\D{0,25}(\\d+)`));
  return m ? parseInt(m[1], 10) : null;
}

function sheetNoteToDeliveryNote(n: SheetNote): DeliveryNote {
  const bales = parseDepositQty(n.depositsText, "60002");
  const pallets = parseDepositQty(n.depositsText, "60060");
  return {
    id: n.id,
    comaxOrder: n.comaxOrder || undefined,
    customer: n.customer || "לא זוהה שם לקוח",
    customerNo: n.customerNo || undefined,
    date: n.date,
    siteAddress: n.address || undefined,
    driver: [n.driver, n.truck].filter(Boolean).join(" · ") || undefined,
    craneTime: n.craneNotes || undefined,
    items: n.items.map((i) => ({
      name: i.name,
      sku: i.sku || undefined,
      qty: i.qty,
      ordered: i.qty, // הזמנת קומקס עדיין לא מוצלבת (ראו live)
      weightKg: 0,
      unit: i.unit || "יח׳",
    })),
    // Missing deposit text must remain unknown; never silently convert it to 0:0.
    deposits: {
      ...(bales !== null ? { bales60002: { delivered: bales, billed: bales } } : {}),
      ...(pallets !== null ? { pallets60060: { delivered: pallets, billed: pallets } } : {}),
    },
    driveUrl: n.driveUrl || undefined,
    // אם Apps Script לא סיפק fileId, חילוץ מזהה מהקישור המקורי (למשל עמודה L) לפני הצגת "אין סריקה".
    fileId: n.fileId || extractDriveFileId(n.signedUrl) || extractDriveFileId(n.driveUrl) || undefined,
    billingStatus: n.approvalStatus || undefined,
    noteStage: (n.approvalStatus || "pending_rami") as any,
    signedUrl: n.signedUrl || undefined,
    live: true,
  };
}

/** שליפה מהגיליון דרך השרת. זורק שגיאה אם אין חיבור. אין מטמון ואין נתוני דוגמה. */
export async function fetchLiveNotes(): Promise<DeliveryNote[]> {
  const { notes } = await listNotesFn();
  return notes.map(sheetNoteToDeliveryNote);
}

/** שמירה לתיקיית הלקוח. זורק שגיאה אמיתית אם נכשל. */
export async function saveSignedNoteStrict(params: {
  noteId: string;
  customer: string;
  signedBy?: string;
  statusNote?: string;
  dataUrl: string;
}): Promise<{ driveUrl: string; folder: string }> {
  if (!params.dataUrl) throw new Error("אין תמונת קנבס לשמירה");
  return saveSignedNoteFn({ data: params });
}

/** אישור (ראמי/הראל). זורק שגיאה אם נכשל, בלי תור שקט. */
export async function approveStrict(
  noteId: string,
  approver: "rami" | "harel",
  note?: string,
  auditEvidence?: Record<string, string>,
): Promise<void> {
  await approvalFn({ data: { noteId, approver, note, auditEvidence } });
}
