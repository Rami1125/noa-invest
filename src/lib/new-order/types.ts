/**
 * New Order Studio — טיפוסים מלאים (בלי any)
 * מקורות: תיקי_לקוחות, מאגר_לקוחות_מאוחד, אתרי_לקוחות, מילון_לוגיסט, הזמנות
 */

export type WarehouseCode = "החרש 10" | "התלמיד 6" | string;
export type RecommendedDriver = "חכמת" | "עלי" | string;
export type DepositCode = "60002" | "60060" | "";

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
  /** קוד זמני 500500 או מספר שטרם הוחלף בקומקס */
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

/** שורת מילון_לוגיסט */
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
  /** 2.0 טון — פריקה ידנית / גישה צרה */
  manualTons: number;
  /** 4.46 טון — פלטה עלי / מלגזה באתר */
  aliTons: number;
  /** 10.2 טון — מנוף חכמת (תקרת בטיחות) */
  hakhmatTons: number;
};

/** ספי תצוגה לסרגל עומס (% מניצולת) */
export const WEIGHT_DISPLAY_THRESHOLDS = {
  /** אזהרה / upsell — צהוב */
  warnPct: 75,
  /** חריגה — אדום */
  dangerPct: 100,
} as const;

export const WEIGHT_LIMITS: WeightLimits = {
  manualTons: 2.0,
  aliTons: 4.46,
  hakhmatTons: 10.2,
};

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
