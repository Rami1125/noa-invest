/**
 * הגדרות מפה — מפתח CARTO Basemaps מהשרת (לא חובה ב־VITE_)
 */
import { createServerFn } from "@tanstack/react-start";

export type MapConfig = {
  cartoKey: string;
  hasCarto: boolean;
};

export const getMapConfigFn = createServerFn({ method: "GET" }).handler(async (): Promise<MapConfig> => {
  const cartoKey = String(
    process.env.CARTO_BASEMAPS_API_KEY ||
      process.env.VITE_CARTO_BASEMAPS_API_KEY ||
      "",
  ).trim();
  return { cartoKey, hasCarto: cartoKey.length > 0 };
});
