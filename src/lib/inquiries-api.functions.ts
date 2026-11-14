import { createServerFn } from "@tanstack/react-start";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbwi9M5HSO9E0sZrrZ8bdKLCf5mBYPaIk-j3ZY_Mram3qkSH8pU4i-bcG2XNeZ42o3c8Og/exec";

export type InquiryRound = {
  round: number;
  rami?: { text: string; at: string };
  harel?: { text: string; at: string };
};

export type RamiInquiry = {
  id: string;
  customer: string;
  address: string;
  driver: string;
  date: string;
  issue: string;
  aiAnalysis: string;
  fileId: string;
  driveUrl: string;
  status: string;
  rounds: InquiryRound[];
  receivedDate?: string;
  errorReason?: string;
  ramiReply?: string;
  harelApproval?: string;
};

function gasUrl(): string {
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

export const listRamiInquiriesFn = createServerFn({ method: "POST" }).handler(async () => {
  const u = new URL(gasUrl());
  u.searchParams.set("action", "getRamiInquiries");
  u.searchParams.set("token", apiToken());
  const res = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  const data = await parseGas(res);
  const list = Array.isArray(data.inquiries) ? data.inquiries : [];
  return { inquiries: list as RamiInquiry[] };
});

export const replyRamiInquiryFn = createServerFn({ method: "POST" })
  .inputValidator((d: { noteId: string; text: string }) => {
    const noteId = String(d?.noteId || "").trim();
    const text = String(d?.text || "").trim();
    if (!noteId) throw new Error("חסר מספר תעודה");
    if (text.length < 3) throw new Error("המענה קצר מדי");
    return { noteId, text: text.slice(0, 2000) };
  })
  .handler(async ({ data }) => {
    const res = await fetch(gasUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submitRamiReply",
        token: apiToken(),
        noteId: data.noteId,
        text: data.text,
      }),
      redirect: "follow",
    });
    return parseGas(res);
  });
