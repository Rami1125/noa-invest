import { createServerFn } from "@tanstack/react-start";
import { mapGasHandwrittenRow } from "@/lib/handwritten-sheet";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbwi9M5HSO9E0sZrrZ8bdKLCf5mBYPaIk-j3ZY_Mram3qkSH8pU4i-bcG2XNeZ42o3c8Og/exec";

let activeGasUrl: string | null = null;

function gasUrl(): string {
  if (activeGasUrl) return activeGasUrl;
  const envUrl = (process.env["GAS_URL"] || "").trim();
  return envUrl || DEFAULT_GAS_URL;
}

function apiToken(): string {
  const t = process.env["API_TOKEN"];
  if (!t) throw new Error("API_TOKEN לא מוגדר בשרת (Environment Variables)");
  return t;
}

async function parseGas(res: Response, host: string): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    if (data.error) throw new Error(String(data.error));
    return data;
  } catch (e) {
    if (e instanceof Error && !e.message.includes("JSON")) throw e;
    throw new Error(`תשובה לא תקינה מ-Apps Script (${host}, HTTP ${res.status})`);
  }
}

export type SheetNote = Record<string, unknown>;

export const listNotesFn = createServerFn({ method: "GET" }).handler(async () => {
  const primaryUrl = gasUrl();
  const buildUrl = (base: string) => {
    const u = new URL(base);
    u.searchParams.set("action", "getNotes");
    u.searchParams.set("token", apiToken());
    u.searchParams.set("nocache", "1");
    return u.toString();
  };
  try {
    const res = await fetch(buildUrl(primaryUrl), { redirect: "follow", signal: AbortSignal.timeout(60_000) });
    const data = await parseGas(res, primaryUrl);
    activeGasUrl = primaryUrl;
    return { notes: (data.notes as SheetNote[]) || [], gasUrl: primaryUrl };
  } catch (err) {
    if (primaryUrl !== DEFAULT_GAS_URL) {
      const fallbackRes = await fetch(buildUrl(DEFAULT_GAS_URL), {
        redirect: "follow",
        signal: AbortSignal.timeout(60_000),
      });
      const result = await parseGas(fallbackRes, DEFAULT_GAS_URL);
      activeGasUrl = DEFAULT_GAS_URL;
      return { notes: (result.notes as SheetNote[]) || [], gasUrl: DEFAULT_GAS_URL };
    }
    throw err;
  }
});

export const listHandwrittenFn = createServerFn({ method: "GET" }).handler(async () => {
  const u = new URL(gasUrl());
  u.searchParams.set("action", "getHandwritten");
  u.searchParams.set("token", apiToken());
  u.searchParams.set("nocache", "1");
  const res = await fetch(u.toString(), { redirect: "follow", signal: AbortSignal.timeout(45_000) });
  const data = await parseGas(res, u.toString());
  const rows = Array.isArray(data.rows) ? data.rows.map((r) => mapGasHandwrittenRow(r as never)) : [];
  return { rows, totalRows: data.totalRows ?? rows.length, fetchedAt: data.fetchedAt };
});

export const approvalFn = createServerFn({ method: "POST" })
  .inputValidator((d: Record<string, unknown>) => d)
  .handler(async ({ data }) => {
    const res = await fetch(gasUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, token: apiToken() }),
      redirect: "follow",
    });
    return parseGas(res, gasUrl());
  });

export const saveSignedNoteFn = createServerFn({ method: "POST" })
  .inputValidator((d: Record<string, unknown>) => d)
  .handler(async ({ data }) => {
    const res = await fetch(gasUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "saveSignedNote", token: apiToken(), ...data }),
      redirect: "follow",
    });
    return parseGas(res, gasUrl());
  });
