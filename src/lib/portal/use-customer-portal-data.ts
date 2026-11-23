/**
 * נתוני פורטל לקוח — הזמנות ותעודות משלוח לפי מספר לקוח
 */
import { useQuery } from "@tanstack/react-query";
import { listOrdersFn, type SheetOrder } from "@/lib/orders.functions";
import {
  getCustomerHistoryFn,
  type CustomerHistory,
  type HNote,
} from "@/lib/customer-history.functions";

function normNo(s: string): string {
  return String(s || "").replace(/\D/g, "");
}

function matchCustomerNo(rowNo: string, want: string): boolean {
  const a = normNo(rowNo);
  const b = normNo(want);
  if (!a || !b) return false;
  return a === b || a.endsWith(b) || b.endsWith(a);
}

export function useCustomerOrders(customerNo: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["portal-orders", customerNo],
    enabled: enabled && !!customerNo,
    staleTime: 60_000,
    queryFn: async (): Promise<SheetOrder[]> => {
      const res = await listOrdersFn();
      const all = res?.orders || [];
      return all
        .filter((o) => matchCustomerNo(o.customerNo, customerNo || ""))
        .sort((a, b) =>
          String(b.date || b.receivedDate || "").localeCompare(String(a.date || a.receivedDate || "")),
        );
    },
  });
}

export function useCustomerDeliveryNotes(customerNo: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["portal-notes", customerNo],
    enabled: enabled && !!customerNo && /^\d{3,10}$/.test(normNo(customerNo || "")),
    staleTime: 60_000,
    queryFn: async (): Promise<HNote[]> => {
      try {
        const hist = (await getCustomerHistoryFn({
          data: { customerNo: normNo(customerNo || "") },
        })) as CustomerHistory;
        return Array.isArray(hist?.notes) ? hist.notes : [];
      } catch {
        return [];
      }
    },
  });
}

export type { SheetOrder, HNote, CustomerHistory };
