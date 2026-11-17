/**
 * בדיקת חיבור ל-Google Apps Script / גיליון
 * מחזיר אבחון מפורט בלי לחשוף את ערך ה-token.
 */
import { createServerFn } from "@tanstack/react-start";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbwi9M5HSO9E0sZrrZ8bdKLCf5mBYPaIk-j3ZY_Mram3qkSH8pU4i-bcG2XNeZ42o3c8Og/exec";

export type GasProbeResult = {
  ok: boolean;
  at: string;
  gasUrlConfigured: boolean;
  gasUrlHost: string;
  gasUrlSuffix: string;
  tokenConfigured: boolean;
  httpStatus: number | null;
  contentType: string | null;
  bodyKind: "json" | "html" | "empty" | "other";
  action: string;
  latencyMs: number;
  error: string | null;
  gasError: string | null;
  gasSuccess: boolean | null;
  sampleKeys: string[];
};

function resolveGasUrl(): string {
  return (process.env["GAS_URL"] || "").trim() || DEFAULT_GAS_URL;
}

function maskUrl(url: string): { host: string; suffix: string } {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "";
    const suffix = last.length > 12 ? `…${last.slice(-10)}` : last;
    return { host: u.host, suffix };
  } catch {
    return { host: "(invalid)", suffix: "" };
  }
}

function classifyBody(text: string): GasProbeResult["bodyKind"] {
  const t = text.trim();
  if (!t) return "empty";
  if (t.startsWith("{") || t.startsWith("[")) return "json";
  if (/<!DOCTYPE html|<html/i.test(t)) return "html";
  return "other";
}

export const probeGasConnectivityFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<GasProbeResult> => {
    const at = new Date().toISOString();
    const gasUrl = resolveGasUrl();
    const { host, suffix } = maskUrl(gasUrl);
    const token = (process.env["API_TOKEN"] || "").trim();
    const tokenConfigured = token.length > 0;

    if (!tokenConfigured) {
      return {
        ok: false,
        at,
        gasUrlConfigured: Boolean((process.env["GAS_URL"] || "").trim()),
        gasUrlHost: host,
        gasUrlSuffix: suffix,
        tokenConfigured: false,
        httpStatus: null,
        contentType: null,
        bodyKind: "empty",
        action: "ping",
        latencyMs: 0,
        error: "API_TOKEN לא מוגדר במשתני הסביבה של Vercel (Preview/Production)",
        gasError: null,
        gasSuccess: null,
        sampleKeys: [],
      };
    }

    const action = "ping";
    const started = Date.now();
    try {
      const u = new URL(gasUrl);
      u.searchParams.set("action", action);
      u.searchParams.set("token", token);
      const res = await fetch(u.toString(), {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      const latencyMs = Date.now() - started;
      const text = await res.text();
      const bodyKind = classifyBody(text);
      const contentType = res.headers.get("content-type");

      if (bodyKind !== "json") {
        const hint =
          bodyKind === "html"
            ? "השרת החזיר HTML (לרוב דף התחברות Google או שגיאת פריסה) — בדוק Deployment של ה-Web App"
            : "תשובה אינה JSON";
        return {
          ok: false,
          at,
          gasUrlConfigured: Boolean((process.env["GAS_URL"] || "").trim()),
          gasUrlHost: host,
          gasUrlSuffix: suffix,
          tokenConfigured: true,
          httpStatus: res.status,
          contentType,
          bodyKind,
          action,
          latencyMs,
          error: `${hint} (HTTP ${res.status})`,
          gasError: null,
          gasSuccess: null,
          sampleKeys: [],
        };
      }

      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return {
          ok: false,
          at,
          gasUrlConfigured: Boolean((process.env["GAS_URL"] || "").trim()),
          gasUrlHost: host,
          gasUrlSuffix: suffix,
          tokenConfigured: true,
          httpStatus: res.status,
          contentType,
          bodyKind: "other",
          action,
          latencyMs,
          error: `JSON לא תקין (HTTP ${res.status})`,
          gasError: null,
          gasSuccess: null,
          sampleKeys: [],
        };
      }

      const gasError =
        payload.error != null
          ? String(payload.error)
          : payload.message != null
            ? String(payload.message)
            : null;
      const gasSuccess =
        typeof payload.success === "boolean"
          ? payload.success
          : typeof payload.ok === "boolean"
            ? payload.ok
            : null;

      const unauthorized =
        gasError === "unauthorized" ||
        /unauthorized|לא מורשה/i.test(String(gasError || ""));

      // ping תקין, או unknown_action (החיבור עובד אבל action חסר ב-GAS)
      const connected =
        res.ok &&
        bodyKind === "json" &&
        !unauthorized &&
        (gasSuccess === true ||
          gasError == null ||
          gasError === "unknown_action");

      return {
        ok: connected,
        at,
        gasUrlConfigured: Boolean((process.env["GAS_URL"] || "").trim()),
        gasUrlHost: host,
        gasUrlSuffix: suffix,
        tokenConfigured: true,
        httpStatus: res.status,
        contentType,
        bodyKind,
        action,
        latencyMs,
        error: unauthorized
          ? "token נדחה (unauthorized) — השווה API_TOKEN ב-Vercel ל-Script Properties ב-GAS"
          : !connected
            ? gasError || `HTTP ${res.status}`
            : gasError === "unknown_action"
              ? null
              : null,
        gasError,
        gasSuccess,
        sampleKeys: Object.keys(payload).slice(0, 12),
      };
    } catch (e) {
      return {
        ok: false,
        at,
        gasUrlConfigured: Boolean((process.env["GAS_URL"] || "").trim()),
        gasUrlHost: host,
        gasUrlSuffix: suffix,
        tokenConfigured: true,
        httpStatus: null,
        contentType: null,
        bodyKind: "empty",
        action,
        latencyMs: Date.now() - started,
        error: e instanceof Error ? e.message : String(e),
        gasError: null,
        gasSuccess: null,
        sampleKeys: [],
      };
    }
  },
);
