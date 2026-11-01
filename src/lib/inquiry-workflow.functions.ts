/**
 * Server functions — workflow בירור (ראמי / הראל / משימות / שרשור)
 * מתחבר ל-GAS: action=... (ראה InquiryWorkflow.gs)
 */

import { createServerFn } from "@tanstack/react-start";
import type {
  InquiryMessage,
  InquiryStatus,
  InquiryTask,
  WorkroomInquiry,
} from "./inquiry-workflow";
import {
  appendMessage,
  defaultDueAt,
  newTaskId,
  nowIso,
  parseSheetStatus,
} from "./inquiry-workflow";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbyv4x_fGMkWmjOLujRymJITBoGQpnbIbJnZp4S9nNs6sacQb1g7x8vyHjaCw6y_t7Pxiw/exec";

// Per-warm-instance cache avoids repeating a full Apps Script + Sheets scan on
// concurrent page loads. Mutations invalidate it immediately after GAS confirms.
const WORKROOM_CACHE_TTL_MS = 45_000;
let workroomListCache: { inquiries: WorkroomInquiry[] } | null = null;
let workroomListCacheAt = 0;
let workroomListInFlight: Promise<{ inquiries: WorkroomInquiry[] }> | null = null;
let workroomCacheGeneration = 0;

function invalidateWorkroomListCache(): void {
  workroomCacheGeneration += 1;
  workroomListCache = null;
  workroomListCacheAt = 0;
  workroomListInFlight = null;
}

function gasUrl(): string {
  const envUrl = process.env["GAS_URL"];
  // Workflow endpoints added in v6 are not available in the older deployment.
  if (envUrl && (envUrl.includes("AKfycbyv4x_fGMkWmjOLujRymJITBoGQpnbIbJnZp4S9nNs6sacQb1g7x8vyHjaCw6y_t7Pxiw") || envUrl.includes("AKfycbyv4x_fGMkWmjOLujRymJITBoGQpnbIbJnZp4S9nNs6sacQb1g7x8vyHjaCw6y_t7Pxiw"))) {
    return DEFAULT_GAS_URL;
  }
  return envUrl || DEFAULT_GAS_URL;
}

function apiToken(): string {
  const t = process.env["API_TOKEN"];
  if (!t) throw new Error("API_TOKEN לא מוגדר בשרת");
  return t;
}

async function gasRequest(
  action: string,
  body?: Record<string, unknown>,
  method: "GET" | "POST" = "POST",
) {
  const u = new URL(gasUrl());
  u.searchParams.set("action", action);
  u.searchParams.set("token", apiToken());

  const res = await fetch(u.toString(), {
    method,
    redirect: "follow",
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify({ action, token: apiToken(), ...body }) : undefined,
  });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`GAS שגיאה (${res.status}): ${text.slice(0, 200)}`);
  }
  if (data.success === false) throw new Error(String(data.error || "נכשל"));
  return data;
}

export const listWorkroomInquiriesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ inquiries: WorkroomInquiry[] }> => {
    const now = Date.now();
    if (workroomListCache && now - workroomListCacheAt < WORKROOM_CACHE_TTL_MS) {
      return workroomListCache;
    }
    if (workroomListInFlight) return workroomListInFlight;

    const generation = workroomCacheGeneration;
    const request = (async (): Promise<{ inquiries: WorkroomInquiry[] }> => {
      const data = await gasRequest("getWorkroomInquiries", undefined, "GET");
      const raw = Array.isArray(data.inquiries) ? data.inquiries : [];
      return { inquiries: raw.map(normalizeInquiry) };
    })();
    workroomListInFlight = request;
    try {
      const result = await request;
      if (generation === workroomCacheGeneration) {
        workroomListCache = result;
        workroomListCacheAt = Date.now();
      }
      return result;
    } finally {
      if (workroomListInFlight === request) workroomListInFlight = null;
    }
  },
);

export const getWorkroomInquiryFn = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }): Promise<{ inquiry: WorkroomInquiry | null }> => {
    const res = await gasRequest("getWorkroomInquiry", { id: data.id });
    if (!res.inquiry) return { inquiry: null };
    return { inquiry: normalizeInquiry(res.inquiry) };
  });

export const openOrCreateWorkroomTaskFn = createServerFn({ method: "POST" })
  .validator((d: {
    noteId: string;
    customer?: string;
    customerNo?: string;
    address?: string;
    driver?: string;
    issue?: string;
    aiAnalysis?: string;
    fileId?: string;
    driveUrl?: string;
  }) => {
    if (!String(d.noteId || "").trim()) throw new Error("חסר מספר תעודה");
    return d;
  })
  .handler(async ({ data }) => {
    const result = await gasRequest("openOrCreateWorkroomTask", {
      ...data,
      noteId: String(data.noteId).trim(),
    });
    invalidateWorkroomListCache();
    return result;
  });

export const ramiReplyFn = createServerFn({ method: "POST" })
  .validator((d: { inquiryId: string; text: string; noteId?: string; replyToId?: string; handoffToHarel?: boolean }) => {
    if (!d.inquiryId || !String(d.text || "").trim()) {
      throw new Error("חסר מזהה בירור או טקסט מענה");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const result = await gasRequest("ramiReply", {
      inquiryId: data.inquiryId,
      noteId: data.noteId,
      text: data.text.trim(),
      replyToId: data.replyToId || "",
      handoffToHarel: data.handoffToHarel === true,
    });
    invalidateWorkroomListCache();
    return result;
  });

export const harelReplyFn = createServerFn({ method: "POST" })
  .validator((d: { inquiryId: string; noteId?: string; text: string; replyToId?: string }) => {
    if (!d.inquiryId || !String(d.text || "").trim()) {
      throw new Error("חסר מזהה בירור או טקסט מענה");
    }
    if (String(d.text).trim().length < 3 || String(d.text).trim().length > 2000) {
      throw new Error("אורך המענה חייב להיות 3–2,000 תווים");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const result = await gasRequest("harelReply", {
      inquiryId: data.inquiryId,
      noteId: data.noteId,
      text: data.text.trim(),
      replyToId: data.replyToId || "",
    });
    invalidateWorkroomListCache();
    return result;
  });

export const harelDecideFn = createServerFn({ method: "POST" })
  .validator(
    (d: {
      inquiryId: string;
      decision: "approve" | "reject" | "return";
      text?: string;
      reason?: string;
      dueAt?: string;
      nudgeEveryMin?: number;
      noteId?: string;
      annotationUrl?: string;
      fileId?: string;
    }) => {
      if (!d.inquiryId || !d.decision) throw new Error("חסרים פרטי החלטה");
      if (d.decision === "return" && !String(d.reason || "").trim()) {
        throw new Error("חובה למלא «מה חסר» בהחזרה לראמי");
      }
      return d;
    },
  )
  .handler(async ({ data }) => {
    const result = await gasRequest("harelDecide", {
      inquiryId: data.inquiryId,
      noteId: data.noteId,
      decision: data.decision,
      text: data.text || "",
      reason: data.reason || "",
      dueAt: data.dueAt || defaultDueAt(4),
      nudgeEveryMin: data.nudgeEveryMin ?? 60,
      annotationUrl: data.annotationUrl || "",
      fileId: data.fileId || "",
    });
    invalidateWorkroomListCache();
    return result;
  });

export const harelUploadAndAssignFn = createServerFn({ method: "POST" })
  .validator(
    (d: {
      inquiryId: string;
      noteId: string;
      fileId: string;
      fileUrl: string;
      reason: string;
      dueAt?: string;
      annotationUrl?: string;
    }) => {
      if (!d.reason?.trim()) throw new Error("חובה «מה חסר»");
      if (!d.fileId) throw new Error("חסר קובץ");
      return d;
    },
  )
  .handler(async ({ data }) => {
    const result = await gasRequest("harelUploadAssign", {
      ...data,
      dueAt: data.dueAt || defaultDueAt(4),
      nudgeEveryMin: 60,
    });
    invalidateWorkroomListCache();
    return result;
  });

function normalizeInquiry(raw: any): WorkroomInquiry {
  const status = parseSheetStatus(String(raw.status || raw["סטטוס"] || ""));
  let thread: InquiryMessage[] = [];
  if (Array.isArray(raw.thread)) thread = raw.thread;
  else if (typeof raw.threadJson === "string" && raw.threadJson) {
    try {
      thread = JSON.parse(raw.threadJson);
    } catch {
      thread = [];
    }
  }

  let task: InquiryTask | null = null;
  if (raw.task && typeof raw.task === "object") task = raw.task as InquiryTask;
  else if (typeof raw.taskJson === "string" && raw.taskJson) {
    try {
      task = JSON.parse(raw.taskJson);
    } catch {
      task = null;
    }
  }

  return {
    id: String(raw.id || raw.key || raw.docNumber || ""),
    docNumber: String(raw.docNumber || raw["מס׳ תעודה"] || raw.id || ""),
    customer: String(raw.customer || raw["שם לקוח"] || ""),
    customerNo: String(raw.customerNo || raw["מס׳ לקוח"] || ""),
    address: String(raw.address || raw["כתובת אספקה"] || ""),
    driver: String(raw.driver || raw["נהג"] || ""),
    status,
    issue: String(raw.issue || raw["תיאור החריגה / הטעות שזוהתה"] || ""),
    aiAnalysis: String(raw.aiAnalysis || raw["ניתוח AI וכתב יד"] || ""),
    kind: raw.kind || "other",
    thread,
    task,
    scanFileId: raw.scanFileId || raw.fileId || raw["מזהה קובץ Drive"],
    driveUrl: raw.driveUrl || raw["כתובת הקובץ (URL)"],
    updatedAt: String(raw.updatedAt || nowIso()),
  };
}

export function buildReturnTask(opts: {
  inquiryId: string;
  noteId: string;
  reason: string;
  dueAt?: string;
  annotationUrl?: string;
  fileId?: string;
}): InquiryTask {
  return {
    id: newTaskId(),
    inquiryId: opts.inquiryId,
    noteId: opts.noteId,
    status: "open",
    assignedTo: "rami",
    createdBy: "harel",
    reason: opts.reason,
    dueAt: opts.dueAt || defaultDueAt(4),
    nudgeEveryMin: 60,
    nudgeCount: 0,
    canvasAnnotationUrl: opts.annotationUrl,
    sourceFileId: opts.fileId,
    createdAt: nowIso(),
  };
}

export function buildThreadAfterRamiReply(
  thread: InquiryMessage[],
  text: string,
): InquiryMessage[] {
  return appendMessage(thread, {
    role: "rami",
    text,
    action: "replied",
  });
}

export function buildThreadAfterHarelReturn(
  thread: InquiryMessage[],
  reason: string,
  dueAt: string,
): InquiryMessage[] {
  return appendMessage(thread, {
    role: "harel",
    text: `הוחזר לראמי. מה חסר: ${reason}\\nיעד: ${dueAt}`,
    action: "returned_to_rami",
  });
}

export type { InquiryStatus };
