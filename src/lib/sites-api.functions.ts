import { createServerFn } from "@tanstack/react-start";

export interface RawSiteRow {
  rowNumber?: number;
  siteKey?: string;
  customerNo?: string;
  customer?: string;
  address?: string;
  city?: string;
  region?: string;
  visits?: number;
  avgStopMin?: number | null;
  maxStopMin?: number | null;
  p80Min?: number | null;
  over20?: number;
  severity?: string;
  lat?: number | null;
  lng?: number | null;
  hasCoords?: boolean;
  distHarashKm?: number | null;
  driveHarashMin?: number | null;
  distTalmidKm?: number | null;
  driveTalmidMin?: number | null;
}

export interface WarehouseOrigin {
  id: string;
  key: string;
  name: string;
  short: string;
  address: string;
  lat: number;
  lng: number;
}

export interface SitesApiResponse {
  success: boolean;
  sites: RawSiteRow[];
  warehouses: WarehouseOrigin[];
  fetchedAt: string;
  withGps: number;
  total: number;
}

/** תואם ל-notes-api ולשאר השרת: GAS_URL + API_TOKEN (עם נפילה לשמות ישנים) */
function resolveGasConfig(): { baseUrl: string; token: string } {
  const baseUrl = String(
    process.env.GAS_URL ||
      process.env.GAS_WEBAPP_URL ||
      process.env.VITE_GAS_URL ||
      "",
  ).trim();
  const token = String(
    process.env.API_TOKEN || process.env.GAS_TOKEN || process.env.VITE_API_TOKEN || "",
  ).trim();
  return { baseUrl, token };
}

function gasErrorMessage(data: Record<string, unknown> | null, httpStatus?: number): string {
  if (!data || typeof data !== "object") {
    return httpStatus
      ? `שגיאת שרת מרוחק: HTTP ${httpStatus}`
      : "תשובה ריקה מ־Apps Script";
  }
  const err = String(data.error || data.message || "").trim();
  const action = String(data.action || "").trim();
  if (err === "unauthorized" || err === "Unauthorized") {
    return "אימות נכשל מול Apps Script (API_TOKEN / Script Property). בדוק Vercel Environment Variables ו-Script Properties.";
  }
  if (err === "unknown_action") {
    return `פעולה לא מוכרת ב-GAS${action ? ` (${action})` : ""} — יש להוסיף case "getSites" ב-Code.gs ולפרוס גרסה חדשה.`;
  }
  if (err === "missing_handler") {
    return "חסר handler: ודא ש-SitesApi.gs קיים בפרויקט Apps Script ונפרס.";
  }
  if (err === "missing_tab" || err === "missing_header") {
    return String(data.message || err);
  }
  if (err) return err;
  return "מבנה נתונים לא תקין מ־Apps Script (חסר מערך sites)";
}

export const getSitesServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<SitesApiResponse> => {
    const { baseUrl, token } = resolveGasConfig();

    if (!baseUrl || !token) {
      throw new Error(
        "חסרים משתני סביבה בשרת: GAS_URL ו-API_TOKEN (Preview + Production ב-Vercel)",
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    try {
      const url = `${baseUrl}?action=getSites&token=${encodeURIComponent(token)}`;
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
        redirect: "follow",
      });

      const text = await res.text();
      let data: Record<string, unknown> | null = null;
      try {
        data = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      } catch {
        const preview = text.slice(0, 120).replace(/\s+/g, " ");
        throw new Error(
          `GAS החזיר לא-JSON (HTTP ${res.status}): ${preview || "(ריק)"}`,
        );
      }

      if (!res.ok) {
        throw new Error(gasErrorMessage(data, res.status));
      }

      if (data && data.success === false) {
        throw new Error(gasErrorMessage(data));
      }

      // תמיכה במעטפת { data: { sites } } אם תופיע
      const payload =
        data && Array.isArray(data.sites)
          ? data
          : data &&
              data.data &&
              typeof data.data === "object" &&
              Array.isArray((data.data as Record<string, unknown>).sites)
            ? (data.data as Record<string, unknown>)
            : null;

      if (!payload || !Array.isArray(payload.sites)) {
        throw new Error(gasErrorMessage(data));
      }

      const sites = payload.sites as RawSiteRow[];
      const warehouses = Array.isArray(payload.warehouses)
        ? (payload.warehouses as WarehouseOrigin[])
        : [];

      return {
        success: Boolean(payload.success ?? true),
        sites,
        warehouses,
        fetchedAt: String(payload.fetchedAt || new Date().toISOString()),
        withGps: Number(payload.withGps || 0),
        total: Number(payload.total || sites.length),
      };
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error("פג תום הזמן בחיבור ל-Apps Script (15 שניות)");
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  },
);
