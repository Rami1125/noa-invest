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
  "https://script.google.com/macros/s/AKfycbxev7mGClDZ6ERLZtLaApjIn8BfBdpRGdHkjFLKbdrsqY1E0n6kC3U1fsbfBGD-Si17RA/exec";

function gasUrl(): string {
  const url = process.env["GAS_URL"] || process.env["VITE_SHEETS_ORDERS_URL"] || DEFAULT_GAS_URL;
  if (!url) throw new Error("GAS_URL לא מוגדר בשרת");
  return url;
}

function apiToken(): string {
  return process.env["API_TOKEN"] || process.env["GAS_API_TOKEN"] || "";
}

async function postGas<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const url = new URL(gasUrl());
  url.searchParams.set("action", action);
  const token = apiToken();
  if (token) url.searchParams.set("token", token);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, token, ...body }),
  });

  const text = await res.text();
  let json: GasEnvelope<T>;
  try {
    json = JSON.parse(text) as GasEnvelope<T>;
  } catch {
    throw new Error(`GAS החזיר לא-JSON (${res.status}): ${text.slice(0, 160)}`);
  }

  if (!res.ok || json.ok === false) {
    throw new Error(String(json.error || `GAS ${action} נכשל (${res.status})`));
  }
  if (json.data === undefined) {
    throw new Error(`GAS ${action} לא החזיר data`);
  }
  return json.data;
}

async function getGas<T>(action: string): Promise<T> {
  const url = new URL(gasUrl());
  url.searchParams.set("action", action);
  const token = apiToken();
  if (token) url.searchParams.set("token", token);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const text = await res.text();
  let json: GasEnvelope<T>;
  try {
    json = JSON.parse(text) as GasEnvelope<T>;
  } catch {
    throw new Error(`GAS החזיר לא-JSON (${res.status}): ${text.slice(0, 160)}`);
  }

  if (!res.ok || json.ok === false) {
    throw new Error(String(json.error || `GAS ${action} נכשל (${res.status})`));
  }
  if (json.data === undefined) {
    throw new Error(`GAS ${action} לא החזיר data`);
  }
  return json.data;
}

/** Bootstrap: לקוחות + אתרים + מילון (cache בצד GAS ל-5 דק׳) */
export const getOrderBootstrapFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<OrderBootstrapData> => {
    try {
      return await getGas<OrderBootstrapData>("getOrderBootstrapData");
    } catch {
      return await postGas<OrderBootstrapData>("getOrderBootstrapData", {});
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
