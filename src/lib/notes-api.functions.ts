import { createServerFn } from "@tanstack/react-start";
import { mapGasHandwrittenRow } from "@/lib/handwritten-sheet";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbwi9M5HSO9E0sZrrZ8bdKLCf5mBYPaIk-j3ZY_Mram3qkSH8pU4i-bcG2XNeZ42o3c8Og/exec";

let activeGasUrl: string | null = null;

function gasUrl(): string {
  if (activeGasUrl) return activeGasUrl;
  return (process.env["GAS_URL"] || "").trim() || DEFAULT_GAS_URL;
}

function apiToken(): string {
  const t = process.env["API_TOKEN"];
  if (!t) throw new Error("API_TOKEN לא מוגדר בשרת (Environment Variables)");
  return t;
}

async function parseGas(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`תשובה לא תקינה מ-Apps Script (HTTP ${res.status})`);
  }
  if (data.error) throw new Error(String(data.error));
  if (data.success === false) throw new Error("הפעולה נכשלה");
  return data;
}

async function gasGet(action: string, extra: Record<string, string> = {}) {
  const u = new URL(gasUrl());
  u.searchParams.set("action", action);
  u.searchParams.set("token", apiToken());
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  if (["getNotes", "getIturanPto", "getHandwritten"].includes(action)) u.searchParams.set("nocache", "1");
  const res = await fetch(u.toString(), { redirect: "follow", signal: AbortSignal.timeout(60_000) });
  const data = await parseGas(res);
  activeGasUrl = gasUrl();
  return data;
}

async function gasPost(body: Record<string, unknown>) {
  const res = await fetch(gasUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, token: apiToken() }),
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  return parseGas(res);
}

export type SheetNote = {
  id?: string;
  docNumber?: string;
  date?: string;
  customerNo?: string;
  customerName?: string;
  address?: string;
  driver?: string;
  items?: unknown;
  itemsText?: string;
  driveUrl?: string;
  signedUrl?: string;
  depositsText?: string;
  itArrive?: string;
  itDepart?: string;
  itStop?: number | null;
  hasGpsMatch?: boolean;
  gpsSource?: string;
  [key: string]: unknown;
};

export type SheetPtoEvent = {
  truck?: string;
  driver?: string;
  eventType?: string;
  eventTimeIso?: string;
  address?: string;
  durationMin?: number;
  docId?: string;
  customerNo?: string;
  [key: string]: unknown;
};

export const listNotesFn = createServerFn({ method: "POST" }).handler(async () => {
  const data = await gasGet("getNotes");
  return { notes: (data.notes as SheetNote[]) || [], gasUrl: gasUrl() };
});

export const getManifestFn = createServerFn({ method: "POST" })
  .inputValidator((d: { noteId?: string } = {}) => d)
  .handler(async ({ data }) => {
    return gasGet("manifest", data?.noteId ? { noteId: String(data.noteId) } : {});
  });

export const listPtoFn = createServerFn({ method: "POST" })
  .inputValidator((d: { since?: string } = {}) => d)
  .handler(async ({ data }) => {
    const since = String(data?.since || "90");
    const result = await gasGet("getIturanPto", { since });
    return {
      sessions: result.sessions || result.rows || result.events || [],
      rows: result.rows || result.sessions || [],
      ...result,
    };
  });

export const getCatalogFn = createServerFn({ method: "POST" }).handler(async () => {
  return gasGet("getCatalog");
});

export const getScanFn = createServerFn({ method: "POST" })
  .inputValidator((d: { noteId?: string; id?: string }) => d)
  .handler(async ({ data }) => {
    const id = String(data?.noteId || data?.id || "").trim();
    if (!id) throw new Error("חסר מספר תעודה");
    return gasGet("getFile", { id });
  });

export const saveSignedNoteFn = createServerFn({ method: "POST" })
  .inputValidator((d: Record<string, unknown>) => d)
  .handler(async ({ data }) => gasPost({ action: "saveSignedNote", ...data }));

export type LogisticsAuditDecision = "ok" | "issue" | "pending" | string;
export type LogisticsAuditState = {
  noteId?: string;
  decisions?: Record<string, LogisticsAuditDecision>;
  [key: string]: unknown;
};

export const getLogisticsAuditFn = createServerFn({ method: "POST" })
  .inputValidator((d: { noteId: string }) => d)
  .handler(async ({ data }) => {
    return gasGet("getLogisticsAuditEvidence", { noteId: String(data.noteId) });
  });

export const saveLogisticsAuditFn = createServerFn({ method: "POST" })
  .inputValidator((d: Record<string, unknown>) => d)
  .handler(async ({ data }) => gasPost({ action: "saveLogisticsAuditEvidence", ...data }));

export const approvalFn = createServerFn({ method: "POST" })
  .inputValidator((d: Record<string, unknown>) => d)
  .handler(async ({ data }) => gasPost({ action: "submitApproval", ...data }));

export const pingFn = createServerFn({ method: "GET" }).handler(async () => {
  return gasGet("ping");
});

export type SheetHandwrittenRow = Record<string, unknown>;

export const listHandwrittenFn = createServerFn({ method: "POST" }).handler(async () => {
  const data = await gasGet("getHandwritten");
  const rows = Array.isArray(data.rows)
    ? data.rows.map((r) => mapGasHandwrittenRow(r as never))
    : [];
  return {
    rows,
    totalRows: Number(data.totalRows || rows.length),
    fetchedAt: String(data.fetchedAt || new Date().toISOString()),
  };
});
