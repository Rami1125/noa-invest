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
  "https://script.google.com/macros/s/AKfycbzDBD835D-1R6RRRZ6prbP3FOz1ChIg7HK5WiImHOhoBQ1Jstant4wZQWBQtnq4apYmEA/exec";

function gasUrl(): string {
  const url = (
    process.env["GAS_URL"] ||
    process.env["VITE_SHEETS_ORDERS_URL"] ||
    DEFAULT_GAS_URL
  ).trim();
  if (!url) throw new Error("GAS_URL לא מוגדר בשרת");
  return url;
}

function apiToken(): string {
  return (process.env["API_TOKEN"] || process.env["GAS_API_TOKEN"] || "").trim();
}

/** GAS legacy uses {success,error}; NewOrder.gs uses {ok,data,error} */
type LooseEnvelope<T> = {
  ok?: boolean;
  success?: boolean;
  data?: T;
  error?: string;
  action?: string;
};

function parseGasResponse<T>(
  text: string,
  status: number,
  action: string,
  debugUrl?: string,
): T {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`GAS ${action}: תשובה ריקה (${status}) URL=${debugUrl || ""}`);
  }
  if (trimmed.startsWith("<") || /<!DOCTYPE/i.test(trimmed) || /<html/i.test(trimmed)) {
    const titleMatch = trimmed.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "ללא כותרת";
    const looksLogin =
      /accounts\.google\.com/i.test(trimmed) ||
      /Sign in/i.test(trimmed) ||
      /היכנס/i.test(trimmed);

    throw new Error(
      looksLogin
        ? `GAS החזיר דף התחברות HTML (${pageTitle}). ב-Apps Script: Deploy → Manage deployments → Who has access: Anyone · Execute as: Me · New version. action=${action}`
        : `GAS החזיר HTML במקום JSON (status=${status}, title="${pageTitle}") | action=${action} | URL=${debugUrl || ""}`,
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
        `GAS unknown_action: «${action}» לא מנותב ב-Code.gs. הוסיפו case ב-doGet/doPost, ודאו ש-NewOrder.gs בפרויקט, ופרסו Deploy → New version.`,
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

  const targetUrl = url.toString();
  const res = await fetch(targetUrl, {
    method: "GET",
    redirect: "follow",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const text = await res.text();
  return parseGasResponse<T>(text, res.status, action, res.url || targetUrl);
}

/**
 * POST ל-GAS עם טיפול מדויק ב-302:
 * Google Apps Script מריץ את doPost ומחזיר 302 ל-script.googleusercontent.com/macros/echo.
 * חובה לשלוח GET נקי (ללא body וללא Content-Type) לכתובת ה-Location כדי לקבל את ה-JSON.
 */
async function postGas<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const token = apiToken();
  const payload = JSON.stringify({ ...body, action, token });
  const contentLength = Buffer.byteLength(payload, "utf8").toString();

  const postHeaders: Record<string, string> = {
    "Content-Type": "text/plain;charset=utf-8",
    "Content-Length": contentLength,
    Accept: "application/json",
  };
  if (token) postHeaders.Authorization = `Bearer ${token}`;

  const url0 = gasUrl();
  let res = await fetch(url0, {
    method: "POST",
    redirect: "manual",
    headers: postHeaders,
    body: payload,
  });

  let currentUrl = url0;
  let hops = 0;
  while (res.status >= 300 && res.status < 400 && hops < 5) {
    const loc = res.headers.get("location") || res.headers.get("Location");
    if (!loc) break;
    currentUrl = new URL(loc, currentUrl).toString();

    res = await fetch(currentUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        Accept: "application/json, text/plain, */*",
      },
    });
    hops += 1;
  }

  const text = await res.text();
  return parseGasResponse<T>(text, res.status, action, currentUrl);
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
