/**
 * New Order Studio — טיפוסים מלאים (בלי any)
 * מקורות: תיקי_לקוחות, מאגר_לקוחות_מאוחד, אתרי_לקוחות, מילון_לוגיסט, הזמנות
 */

export type WarehouseCode = "החרש 10" | "התלמיד 6" | string;
export type RecommendedDriver = "חכמת" | "עלי" | string;
export type DepositCode = "60002" | "60060" | "60006" | "";

/** לקוח מאוחד מחיפוש bootstrap */
export type OrderCustomer = {
  customerNo: string;
  name: string;
  aliases: string[];
  phones: string[];
  contactName: string;
  defaultSiteAddress: string;
  typicalUnloadType: string;
  recommendedTruck: string;
  masterId: string;
  comaxPrimaryNo: string;
  comaxLinkedIds: string[];
  driveFolderUrl: string;
  sites: CustomerSite[];
  isPendingComax: boolean;
};

export type CustomerSite = {
  address: string;
  city: string;
  p80StayMin: number | null;
  roadKmFromHarash: number | null;
  roadKmFromTalmid: number | null;
  defaultUnloadType: string;
};

export type DictProduct = {
  sku: string;
  officialName: string;
  unit: string;
  slangKeywords: string[];
  deposit: DepositCode;
  weightKgPerUnit: number;
  defaultWarehouse: WarehouseCode;
  recommendedDriver: RecommendedDriver;
};

export type CartLine = {
  key: string;
  product: DictProduct;
  qty: number;
};

export type OrderAttachment = {
  fileName: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  sizeBytes: number;
  base64: string;
};

export type NewOrderDraft = {
  customerNo: string;
  customerName: string;
  address: string;
  contactPhone: string;
  contactName: string;
  deliveryDate: string;
  deliveryWindow: string;
  warehouse: string;
  driver: string;
  notes: string;
  lines: CartLine[];
  attachment: OrderAttachment | null;
  isPendingComax: boolean;
};

export type WeightLimits = {
  /** 2.0 טון / 2,000 ק"ג — פריקה ידנית (עד 50 שקים) */
  manualTons: number;
  manualKg: number;
  manualMaxBags: number;
  /** 4.46 טון / 4,460 ק"ג — פלטה עלי (איסוזו FRR90) */
  aliTons: number;
  aliKg: number;
  /** 10.2 טון / 10,200 ק"ג — מנוף חכמת מבצעי */
  hakhmatTons: number;
  hakhmatKg: number;
  /** מגבלת רישיון קשיחה חכמת — 12,072 ק"ג */
  hakhmatLicenseKg: number;
};

/** ספי תצוגה לסרגל עומס (% מניצולת מול תקרת הרכב הפעיל) */
export const WEIGHT_DISPLAY_THRESHOLDS = {
  /** מתחת: OK (ירוק) · מ-75% כולל עד 100%: WARNING_UPSELL */
  warnPct: 75,
  /** מעל 100%: OVERLOAD */
  dangerPct: 100,
} as const;

export const WEIGHT_LIMITS: WeightLimits = {
  manualTons: 2.0,
  manualKg: 2000,
  manualMaxBags: 50,
  aliTons: 4.46,
  aliKg: 4460,
  hakhmatTons: 10.2,
  hakhmatKg: 10200,
  hakhmatLicenseKg: 12072,
};

/** מק"טי בלות אגרגטים — חובה מנוף חכמת, אסור על פלטה */
export const AGGREGATE_BALE_SKUS = [
  "11501",
  "11511",
  "11551",
  "11506",
  "11540",
  "11570",
] as const;

export type AssignedVehicle = "MANUAL" | "ALI_FLATBED" | "HIKMAT_CRANE";

export type ThresholdStatus = "OK" | "WARNING_UPSELL" | "OVERLOAD";

/** תואם UI קיים */
export type WeightSafetyLevel = "ok" | "warn" | "danger";

export type OrderBootstrapData = {
  customers: OrderCustomer[];
  products: DictProduct[];
  fetchedAt: string;
  sheetId: string;
  headerMaps: {
    customers: string[];
    master: string[];
    sites: string[];
    dict: string[];
    orders: string[];
  };
};

export type InjectNewOrderPayload = {
  customerNo: string;
  customerName: string;
  address: string;
  contactPhone: string;
  contactName: string;
  deliveryDate: string;
  deliveryWindow: string;
  warehouse: string;
  driver: string;
  notes: string;
  itemsJson: string;
  totalWeightTons: number;
  deposit60002: number;
  deposit60060: number;
  wazeUrl: string;
  isPendingComax: boolean;
  attachment: {
    fileName: string;
    mimeType: string;
    base64: string;
  } | null;
};

export type InjectNewOrderResult = {
  orderId: string;
  rowNumber: number;
  driveFolderUrl: string;
  fileUrl: string | null;
  whatsappMessage: string;
};

export type UpdateCustomerNumberPayload = {
  orderId: string;
  oldCustomerNo: string;
  newCustomerNo: string;
  customerName: string;
};

export type UpdateCustomerNumberResult = {
  orderId: string;
  oldCustomerNo: string;
  newCustomerNo: string;
  masterUpdated: boolean;
};

export type GasEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};
