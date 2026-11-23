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
    throw new Error(`GAS ${action}: תשובה ריקה (HTTP ${status})`);
  }
  let json: LooseEnvelope<T>;
  try {
    json = JSON.parse(trimmed) as LooseEnvelope<T>;
  } catch {
    throw new Error(
      `GAS ${action}: תשובה לא JSON (HTTP ${status}): ${trimmed.slice(0, 160).replace(/\s+/g, " ")}`,
    );
  }
  if (json.ok === false || json.success === false) {
    throw new Error(String(json.error || `GAS ${action} נכשל`));
  }
  if (json.error && json.ok !== true && json.success !== true && json.data === undefined) {
    throw new Error(String(json.error));
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
  const head = text.trim().slice(0, 80).toLowerCase();
  if (head.startsWith("<!doctype") || head.startsWith("<html")) {
    throw new Error(
      `GAS ${action}: HTML במקום JSON — Deploy=Anyone, URL=/exec, token תואם. ` +
        text.slice(0, 100).replace(/\s+/g, " "),
    );
  }
  return parseGasResponse<T>(text, res.status, action);
}

/**
 * POST ל-GAS. Content-Type: text/plain — מומלץ מול Apps Script.
 * redirect: follow (אחרי 302 googleusercontent מקבלים את ה-JSON).
 */
async function postGas<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const token = apiToken();
  const payload = JSON.stringify({ ...body, action, token });
  const headers: Record<string, string> = {
    "Content-Type": "text/plain;charset=utf-8",
    Accept: "application/json, text/plain, */*",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url0 = gasUrl();
  if (!/\/exec\b/i.test(url0) || /\/dev\b/i.test(url0)) {
    throw new Error(
      `GAS_URL חייב להסתיים ב-/exec (לא /dev). ערך נוכחי: ${url0.slice(0, 80)}…`,
    );
  }

  const res = await fetch(url0, {
    method: "POST",
    redirect: "follow",
    headers,
    body: payload,
  });

  const text = await res.text();
  const head = text.trim().slice(0, 80).toLowerCase();
  if (head.startsWith("<!doctype") || head.startsWith("<html") || head.includes("<title>")) {
    throw new Error(
      `GAS החזיר HTML במקום JSON — בדקו: GAS_URL מסתיים ב-/exec (לא /dev), ` +
        `Deploy=Anyone, API_TOKEN זהה ב-Vercel וב-Script Properties, ` +
        `וש-doPost מנתב action=${action} (NewOrder.gs). ` +
        `תחילת תשובה: ${text.slice(0, 120).replace(/\s+/g, " ")}`,
    );
  }
  return parseGasResponse<T>(text, res.status, action);
}

/** Bootstrap: לקוחות + אתרים + מילון — GET */
export const getOrderBootstrapFn = createServerFn({ method: "GET" }).handler(
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
