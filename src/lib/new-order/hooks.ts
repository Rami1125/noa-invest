import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getOrderBootstrapFn,
  injectNewOrderFn,
  updateOrderCustomerNumberFn,
} from "./api";
import type {
  InjectNewOrderPayload,
  UpdateCustomerNumberPayload,
} from "./types";

export const ORDER_BOOTSTRAP_KEY = ["order-bootstrap"] as const;

export function useOrderBootstrap() {
  return useQuery({
    queryKey: ORDER_BOOTSTRAP_KEY,
    queryFn: () => getOrderBootstrapFn(),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useInjectNewOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: InjectNewOrderPayload) =>
      injectNewOrderFn({ data: payload }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export function useUpdateOrderCustomerNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateCustomerNumberPayload) =>
      updateOrderCustomerNumberFn({ data: payload }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ORDER_BOOTSTRAP_KEY });
      void qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}
