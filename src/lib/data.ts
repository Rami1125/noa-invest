export type Yard = "מחסן 4 החרש 10" | "מחסן 1 התלמיד 6";
export type AuditStatus = "ok" | "warn" | "fail";

export type Driver = {
  id: string;
  name: string;
  phone: string;
  truck: string;
};

export type Customer = {
  id: string;
  name: string;
  phone?: string;
  city?: string;
  address?: string;
  notes?: string;
};

export type DeliveryItem = {
  sku: string;
  name: string;
  qty: number;
  unit?: string;
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
};
