/**
 * New Order Studio — Server Functions מול GAS
 * משתמש ב-GAS_URL / API_TOKEN מהסביבה (לא חושף סודות ללקוח)
 */
import { createServerFn } from "@tanstack/react-start";
import type {
  GasEnvelope,
  InjectNewOrderPayload,
  InjectNewOrderResult,
  OrderBootstrapData,
  UpdateCustomerNumberPayload,
  UpdateCustomerNumberResult,
} from "./types";

const DEFAULT_GAS_URL =
  process.env["GAS_URL"] ||
  process.env["VITE_SHEETS_ORDERS_URL"] ||
  "https://script.google.com/macros/s/AKfycbzGOG7GxiXkT-OtUw4obBvGkyw_wKRhv2Jjf4I8qbLATIIMKAN099UHJqqYjdfKV-WwWw/exec";

function gasUrl(): string {
  const url = process.env["GAS_URL"] || process.env["VITE_SHEETS_ORDERS_URL"] || DEFAULT_GAS_URL;
  if (!url) throw new Error("GAS_URL לא מוגדר בשרת");
  return url;
}

function apiToken(): string {
  return process.env["API_TOKEN"] || process.env["GAS_API_TOKEN"] || "";
}

/** GAS legacy uses {success,error}; NewOrder.gs uses {ok,data,error} */
type LooseEnvelope<T> = {
  ok?: boolean;
  success?: boolean;
  data?: T;
  error?: string;
  action?: string;
};

function parseGasResponse<T>(text: string, status: number, action: string): T {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`GAS ${action}: תשובה ריקה (${status})`);
  }
  if (trimmed.startsWith("<") || /<!DOCTYPE/i.test(trimmed) || /<html/i.test(trimmed)) {
    throw new Error(
      `GAS החזיר דף HTML במקום JSON — בדקו Deploy (Anyone) ו-API_TOKEN תואם ב-Vercel וב-Script Properties. action=${action}`,
    );
  }

  let json: LooseEnvelope<T>;
  try {
    json = JSON.parse(trimmed) as LooseEnvelope<T>;
  } catch {
    throw new Error(`GAS החזיר לא-JSON (${status}): ${trimmed.slice(0, 120)}`);
  }

  const failed =
    json.ok === false ||
    json.success === false ||
    (typeof json.ok === "undefined" && typeof json.success === "undefined" && !!json.error);

  if (failed) {
    const err = String(json.error || `GAS ${action} נכשל`);
    if (/unauthor/i.test(err)) {
      throw new Error(
        `GAS unauthorized — הגדירו API_TOKEN זהה ב-Vercel (API_TOKEN / GAS_API_TOKEN) וב-Apps Script → Project Settings → Script properties. action=${action}`,
      );
    }
    if (/unknown[_ ]action/i.test(err) || json.error === "unknown_action") {
      throw new Error(
        `GAS unknown_action: «${action}» לא מנותב ב-Code.gs. הוסיפו case ב-doGet/doPost, ודאו ש-NewOrder.gs בפרויקט, ופרסו Deploy → New version. ראו apps-script/WIRE_NewOrder_actions.md`,
      );
    }
    throw new Error(err);
  }

  if (json.data !== undefined) return json.data;
  const { ok: _o, success: _s, error: _e, action: _a, ...rest } = json as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return rest as T;
  throw new Error(`GAS ${action}: אין data בתשובה`);
}

async function getGas<T>(action: string): Promise<T> {
  const url = new URL(gasUrl());
  url.searchParams.set("action", action);
  const token = apiToken();
  if (token) url.searchParams.set("token", token);

  const res = await fetch(url.toString(), {
    method: "GET",
    redirect: "follow",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const text = await res.text();
  return parseGasResponse<T>(text, res.status, action);
}

async function postGas<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const token = apiToken();
  const res = await fetch(gasUrl(), {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ ...body, action, token }),
  });
  const text = await res.text();
  return parseGasResponse<T>(text, res.status, action);
}

/** Bootstrap: לקוחות + אתרים + מילון (cache בצד GAS ל-5 דק׳) */
export const getOrderBootstrapFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<OrderBootstrapData> => {
    try {
      return await getGas<OrderBootstrapData>("getOrderBootstrapData");
    } catch (first) {
      try {
        return await postGas<OrderBootstrapData>("getOrderBootstrapData", {});
      } catch {
        throw first instanceof Error ? first : new Error(String(first));
      }
    }
  },
);

export const injectNewOrderFn = createServerFn({ method: "POST" })
  .inputValidator((d: InjectNewOrderPayload) => d)
  .handler(async ({ data }): Promise<InjectNewOrderResult> => {
    return await postGas<InjectNewOrderResult>("injectNewOrder", {
      ...(data as unknown as Record<string, unknown>),
    });
  });

export const updateOrderCustomerNumberFn = createServerFn({ method: "POST" })
  .inputValidator((d: UpdateCustomerNumberPayload) => d)
  .handler(async ({ data }): Promise<UpdateCustomerNumberResult> => {
    return await postGas<UpdateCustomerNumberResult>("updateOrderCustomerNumber", {
      ...(data as unknown as Record<string, unknown>),
    });
  });

export type { GasEnvelope };
