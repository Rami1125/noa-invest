export type Yard = "מחסן 4 החרש 10" | "מחסן 1 התלמיד 6";
export type AuditStatus = "ok" | "warn" | "fail";

export type Driver = {
  id: string;
  name: string;
  phone: string;
  truck: string;
};

export type DeliveryItem = {
  name: string;
  /** SKU from the source sheet, when supplied separately from the display name. */
  sku?: string;
  qty: number;
  ordered: number;
  price?: number;
  weightKg: number;
  unit: string;
  deposit?: number;
};

export type DeliveryNote = {
  id: string;
  customer: string;
  date: string;
  items: DeliveryItem[];
  deposits?: {
    bales60002?: { delivered: number; billed: number };
    pallets60060?: { delivered: number; billed: number };
  };
  gps?: { status: AuditStatus; note: string };
  comaxOrder?: string;
  customerNo?: string;
  siteAddress?: string;
  yard?: Yard;
  driver?: string;
  craneTime?: string;
  /** זמני GPS מארכיון תעודות (AA:AB או AH:AJ) */
  itArrive?: string;
  itDepart?: string;
  itStop?: number | null;
  itStatus?: string;
  gpsSource?: "ituran_live" | "sheet_AA_AB" | "sheet_AH_AJ" | "sheet_partial" | "";
  hasGpsMatch?: boolean;
  signedBy?: string;
  driveUrl?: string;
  billingStatus?: string;
  scans?: string[];
  scanImage?: string;
  /** מזהה קובץ ה-Drive של הסריקה (נתון חי מהגיליון) */
  fileId?: string;
  /** קישור ל-PDF החתום בתיקיית הלקוח, אם כבר נחתם */
  signedUrl?: string;
  noteStage?: "pending_rami" | "returned_to_rami" | "pending_harel" | "pending_harel_reply" | "final";
  /** true = נקרא מהגיליון החי; כמויות/פקדונות/איתוראן עדיין לא הוצלבו */
  live?: boolean;
};

export type Order = {
  id: string;
  receivedDate: string;
  date: string;
  window: string;
  orderId: string;
  noteId: string;
  customerNo: string;
  customer: string;
  phone: string;
  address: string;
  yard: Yard;
  driverId: string | null;
  driverName: string;
  status: "פתוחה" | "בהעמסה" | "בדרך" | "סופק" | "הועבר לתעודת משלוח";
  items: { name: string; qty: number; unit: string; weightKg: number; deposit?: boolean }[];
  notes: string;
  weightTons: number;
  wazeLink: string;
  depositBales: string;
  depositPallets: string;
};

export type GpsRecord = {
  id: string;
  driverId: string;
  lat: number;
  lng: number;
  speed: number;
  status: string;
  updatedAt: string;
};

export const DRIVERS: Driver[] = [
  { id: "hikmat", name: "חכמת מנוף", phone: "050-0000000", truck: "מנוף 18000 (מרצדס 615-41-002)" },
  { id: "ali", name: "עלי משאית", phone: "050-1111111", truck: "משאית שטוחה 818000" },
];

export const GPS_RECORDS: GpsRecord[] = [];

export const NOTES: DeliveryNote[] = [];

export function auditNote(n?: DeliveryNote): {
  status: AuditStatus;
  findings: { status: AuditStatus; text: string }[];
} {
  const findings: { status: AuditStatus; text: string }[] = [];
  if (!n) return { status: "ok", findings: [{ status: "ok", text: "תעודה בטעינה" }] };
  if (n.live) {
    findings.push({ status: "warn", text: "טרם הוצלב מול קומקס/איתוראן" });
    const b = n.deposits?.bales60002 || { delivered: 0, billed: 0 };
    const p = n.deposits?.pallets60060 || { delivered: 0, billed: 0 };
    if (b.delivered) findings.push({ status: "warn", text: `בלות פקדון 60002: ${b.delivered} (טרם הוצלבו מול חיוב)` });
    if (p.delivered) findings.push({ status: "warn", text: `משטחי עץ 60060: ${p.delivered} (טרם הוצלבו מול חיוב)` });
    return { status: "warn", findings };
  }
  (n.items || []).forEach((i) => {
    if (i.qty !== i.ordered)
      findings.push({ status: "warn", text: `${i.name}: סופק ${i.qty} מול ${i.ordered} בהזמנת קומקס` });
  });
  const b = n.deposits?.bales60002 || { delivered: 0, billed: 0 };
  const p = n.deposits?.pallets60060 || { delivered: 0, billed: 0 };
  if (b.delivered !== b.billed)
    findings.push({ status: "fail", text: `בלות פקדון 60002: ${b.delivered} סופקו, ${b.billed} חויבו` });
  else if (b.delivered) findings.push({ status: "ok", text: `בלות 60002 תואמות 1:1 (${b.delivered})` });
  if (p.delivered !== p.billed)
    findings.push({ status: "fail", text: `משטחי עץ 60060: ${p.delivered} סופקו, ${p.billed} חויבו` });
  else if (p.delivered) findings.push({ status: "ok", text: `משטחי 60060 תואמים 1:1 (${p.delivered})` });
  if (n.gps) findings.push({ status: n.gps.status, text: `איתוראן: ${n.gps.note}` });
  if (!findings.some((f) => f.status !== "ok"))
    findings.unshift({ status: "ok", text: "כמויות תואמות להזמנת קומקס" });
  const status: AuditStatus = findings.some((f) => f.status === "fail")
    ? "fail"
    : findings.some((f) => f.status === "warn")
      ? "warn"
      : "ok";
  return { status, findings };
}

export const ORDERS: Order[] = [];

export function fetchNotes(): DeliveryNote[] {
  return NOTES;
}

export function fetchLiveOrders(): Order[] {
  return ORDERS;
}

export function fetchGps(): GpsRecord[] {
  return GPS_RECORDS;
}

export const ils = (n: number) => "₪" + n.toLocaleString("he-IL", { maximumFractionDigits: 0 });
export const fmtDate = (d: string) => d.split("-").reverse().join("/");

/** ברירת המחדל שבה api.ts משתמש כשאין נתונים חיים מהגיליון */
export const BASE: DeliveryNote[] = NOTES;

/** alias for older imports that expect DEFAULT_NOTES */
export const DEFAULT_NOTES: DeliveryNote[] = NOTES;

type WeighableItem = { qty: number; weightKg: number };
type Weighable = { items?: WeighableItem[] | null };

/** משקל התעודה בק״ג: כמות × משקל ליחידה, מסוכם על כל הפריטים. */
export function noteWeightKg(n?: Weighable | null): number {
  return (n?.items || []).reduce((sum, i) => sum + (Number(i.qty) || 0) * (Number(i.weightKg) || 0), 0);
}

/** משקל התעודה בטון, מעוגל לשתי ספרות. */
export function noteWeightTons(n?: Weighable | null): number {
  return Math.round(noteWeightKg(n) / 10) / 100;
}

/** מספר שורות הפריטים בתעודה. */
export function noteItemsCount(n?: Weighable | null): number {
  return (n?.items || []).length;
}
