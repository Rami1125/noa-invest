/**
 * catalog-enrichment.functions.ts
 * Server functions ל-Features 3 / 4 / 5
 * ייבוא ב-logistics-dict וב-Checkout
 */
import { createServerFn } from "@tanstack/react-start";
import {
  loadCityEta,
  findCityEta,
  formatCityEtaLine,
  type CityEta,
  type CityEtaPayload,
} from "./city-eta.server";
import {
  loadMediaAssets,
  getMediaByCode,
  type MediaAsset,
  type MediaAssetsPayload,
} from "./media-assets.server";
import {
  getContractorQuickProfile,
  type ContractorQuickProfile,
  type FavoriteSku,
} from "./contractor-profile.server";

export type { CityEta, CityEtaPayload, MediaAsset, MediaAssetsPayload, ContractorQuickProfile, FavoriteSku };
export { findCityEta, formatCityEtaLine, getMediaByCode };

// ─────────────────────────────────────────────
// Feature 4 — City ETA
// ─────────────────────────────────────────────

/** כל סיכום הערים (cache 15 דק') */
export const getCityEtaListFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<CityEtaPayload> => loadCityEta(false),
);

/** חיפוש עיר ספציפית */
export const getCityEtaFn = createServerFn({ method: "POST" })
  .inputValidator((d: { city: string }) => {
    const city = String(d?.city || "").trim();
    if (!city) throw new Error("חסרה עיר");
    return { city };
  })
  .handler(async ({ data }): Promise<{ eta: CityEta | null; line: string }> => {
    const payload = await loadCityEta(false);
    const eta = findCityEta(payload, data.city);
    return {
      eta,
      line: eta ? formatCityEtaLine(eta) : `אין נתוני איתוראן עבור «${data.city}»`,
    };
  });

// ─────────────────────────────────────────────
// Feature 5 — Media Assets
// ─────────────────────────────────────────────

export const getMediaAssetsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<MediaAssetsPayload> => loadMediaAssets(false),
);

export const refreshMediaAssetsFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<MediaAssetsPayload> => loadMediaAssets(true),
);

// ─────────────────────────────────────────────
// Feature 3 — Contractor Quick Profile
// ─────────────────────────────────────────────

export const getContractorProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: { phone?: string; customerNo?: string }) => {
    const phone = String(d?.phone || "").trim();
    const customerNo = String(d?.customerNo || "").trim();
    if (!phone && !customerNo) throw new Error("יש לספק טלפון או מספר לקוח");
    return { phone: phone || undefined, customerNo: customerNo || undefined };
  })
  .handler(async ({ data }): Promise<ContractorQuickProfile> => {
    return getContractorQuickProfile(data);
  });
