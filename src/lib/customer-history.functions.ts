import { createServerFn } from "@tanstack/react-start";
import {
  loadCustomerHistory,
  loadCustomerIndex,
  loadPurchaseMatrixFromArchive,
  loadSiteAtlas,
} from "./customer-history.server";

export type {
  CustomerSummary,
  CustomerHistory,
  HNote,
  HOrder,
  HVisit,
  HIturanVisit,
  HSite,
  HInquiry,
  HCheck,
  Line,
  AtlasSite,
  PurchaseLine,
  PurchaseMatrix,
} from "./customer-history.server";

/** רשימת כל הלקוחות עם סיכומים (מכל הטאבים) */
export const listCustomerIndexFn = createServerFn({ method: "GET" }).handler(async () => {
  return loadCustomerIndex();
});

/** היסטוריה מלאה של לקוח אחד מכל הטאבים */
export const getCustomerHistoryFn = createServerFn({ method: "POST" })
  .inputValidator((d: { customerNo: string }) => {
    const customerNo = String(d?.customerNo || "").trim();
    if (!/^\d{3,10}$/.test(customerNo)) throw new Error("מספר לקוח לא תקין");
    return { customerNo };
  })
  .handler(async ({ data }) => loadCustomerHistory(data.customerNo));

/** Read-only address and visit atlas from the existing site and visit tabs. */
export const getSiteAtlasFn = createServerFn({ method: "GET" }).handler(async () => loadSiteAtlas());

/** מוצרים שלקוחות רכשו — מארכיון_תעודות_גליה */
export const getPurchaseMatrixFn = createServerFn({ method: "GET" }).handler(async () => {
  return loadPurchaseMatrixFromArchive();
});
