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
    throw new Error(err);
  }

  // Some legacy endpoints put the payload at the root (no data wrapper)
  if (json.data !== undefined) return json.data;
  const { ok: _o, success: _s, error: _e, action: _a, ...rest } = json as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return rest as T;
  throw new Error(`GAS ${action} לא החזיר data`);
}

async function postGas<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const url = new URL(gasUrl());
  url.searchParams.set("action", action);
  const token = apiToken();
  if (token) url.searchParams.set("token", token);

  const res = await fetch(url.toString(), {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, token, ...body }),
  });

  const text = await res.text();
  return parseGasResponse<T>(text, res.status, action);
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

/** Bootstrap: לקוחות + אתרים + מילון (cache בצד GAS ל-5 דק׳) */
export const getOrderBootstrapFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<OrderBootstrapData> => {
    try {
      return await getGas<OrderBootstrapData>("getOrderBootstrapData");
    } catch (first) {
      try {
        return await postGas<OrderBootstrapData>("getOrderBootstrapData", {});
      } catch {
        throw first;
      }
    }
  },
);

export const injectNewOrderFn = createServerFn({ method: "POST" })
  .validator((data: InjectNewOrderPayload) => data)
  .handler(async ({ data }): Promise<InjectNewOrderResult> => {
    if (!data.customerNo?.trim()) throw new Error("חסר מספר לקוח");
    if (!data.customerName?.trim()) throw new Error("חסר שם לקוח");
    if (!data.address?.trim()) throw new Error("חסרה כתובת אספקה");
    if (!data.itemsJson || data.itemsJson === "[]") throw new Error("סל המוצרים ריק");

    if (data.attachment) {
      const allowed = ["application/pdf", "image/jpeg", "image/png"];
      if (!allowed.includes(data.attachment.mimeType)) {
        throw new Error("סוג קובץ לא נתמך (PDF / JPG / PNG בלבד)");
      }
      const approxBytes = Math.floor((data.attachment.base64.length * 3) / 4);
      if (approxBytes > 10 * 1024 * 1024) {
        throw new Error("הקובץ גדול מ-10MB");
      }
    }

    return await postGas<InjectNewOrderResult>("injectNewOrder", {
      ...data,
    });
  });

export const updateOrderCustomerNumberFn = createServerFn({ method: "POST" })
  .validator((data: UpdateCustomerNumberPayload) => data)
  .handler(async ({ data }): Promise<UpdateCustomerNumberResult> => {
    if (!data.orderId?.trim()) throw new Error("חסר מזהה הזמנה");
    if (!data.newCustomerNo?.trim()) throw new Error("חסר מספר לקוח חדש");
    if (data.oldCustomerNo === data.newCustomerNo) {
      throw new Error("המספר החדש זהה לישן");
    }
    return await postGas<UpdateCustomerNumberResult>("updateOrderCustomerNumber", {
      ...data,
    });
  });

// silence unused type import if only used in comments
void (0 as unknown as GasEnvelope<unknown>);
