import { createServerFn } from '@tanstack/react-start';

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

export const getSitesServerFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SitesApiResponse> => {
    const baseUrl = process.env.GAS_WEBAPP_URL;
    const token = process.env.GAS_TOKEN;

    if (!baseUrl || !token) {
      throw new Error('חסרים משתני סביבה בשרת: GAS_WEBAPP_URL או GAS_TOKEN');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    try {
      const url = `${baseUrl}?action=getSites&token=${encodeURIComponent(token)}`;
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`שגיאת שרת מרוחק: HTTP ${res.status}`);
      }

      const data = (await res.json()) as Partial<SitesApiResponse>;
      if (!data || !Array.isArray(data.sites)) {
        throw new Error('מבנה נתונים לא תקין מ־Apps Script');
      }

      return {
        success: Boolean(data.success ?? true),
        sites: data.sites,
        warehouses: Array.isArray(data.warehouses) ? data.warehouses : [],
        fetchedAt: String(data.fetchedAt || new Date().toISOString()),
        withGps: Number(data.withGps || 0),
        total: Number(data.total || data.sites.length),
      };
    } finally {
      clearTimeout(timer);
    }
  }
);
