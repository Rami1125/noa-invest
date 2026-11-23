/**
 * נעילת סשן לקוח בפורטל — אחרי זיהוי הלקוח "ננעל" בדפדפן
 * עד התנתקות יזומה. localStorage + TTL.
 */

import type { OrderCustomer } from "@/lib/new-order/types";

const STORAGE_KEY = "saban_portal_session_v1";
const TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 יום

export type PortalSession = {
  customerNo: string;
  name: string;
  phones: string[];
  contactName: string;
  defaultSiteAddress: string;
  isPendingComax: boolean;
  masterId: string;
  lockedAt: string;
  expiresAt: string;
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function savePortalSession(customer: OrderCustomer): PortalSession {
  const now = Date.now();
  const session: PortalSession = {
    customerNo: customer.customerNo,
    name: customer.name,
    phones: customer.phones || [],
    contactName: customer.contactName || customer.name,
    defaultSiteAddress: customer.defaultSiteAddress || "",
    isPendingComax: !!customer.isPendingComax,
    masterId: customer.masterId || "",
    lockedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MS).toISOString(),
  };
  if (isBrowser()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
  return session;
}

export function loadPortalSession(): PortalSession | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as PortalSession;
    if (!s?.customerNo) return null;
    if (s.expiresAt && Date.now() > new Date(s.expiresAt).getTime()) {
      clearPortalSession();
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function clearPortalSession(): void {
  if (isBrowser()) localStorage.removeItem(STORAGE_KEY);
}

export function sessionToCustomer(s: PortalSession): OrderCustomer {
  return {
    customerNo: s.customerNo,
    name: s.name,
    aliases: [],
    phones: s.phones || [],
    contactName: s.contactName || s.name,
    defaultSiteAddress: s.defaultSiteAddress || "",
    typicalUnloadType: "",
    recommendedTruck: "",
    masterId: s.masterId || "",
    comaxPrimaryNo: s.customerNo,
    comaxLinkedIds: [],
    driveFolderUrl: "",
    sites: s.defaultSiteAddress
      ? [
          {
            address: s.defaultSiteAddress,
            city: "",
            p80StayMin: null,
            roadKmFromHarash: null,
            roadKmFromTalmid: null,
            defaultUnloadType: "",
          },
        ]
      : [],
    isPendingComax: !!s.isPendingComax,
  };
}
