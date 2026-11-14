import {
  BASE as DEFAULT_NOTES,
  type DeliveryNote,
  type DeliveryItem,
  type Order,
  type Yard,
} from "./data";
import { CUSTOMERS as DEFAULT_CUSTOMERS, type CustomerProfile } from "./customers-data";
import { SAMPLE_STOPS as DEFAULT_GPS_STOPS, type GpsStop } from "./ituran";
import { listNotesFn, approvalFn, saveSignedNoteFn, type SheetNote } from "./notes-api.functions";
import { fetchLiveOrdersFromSheet } from "./google-orders";

export const API_BASE =
  "https://script.google.com/macros/s/AKfycbwi9M5HSO9E0sZrrZ8bdKLCf5mBYPaIk-j3ZY_Mram3qkSH8pU4i-bcG2XNeZ42o3c8Og/exec";

export const MASTER_SHEET_ID = "1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw";

const CACHE_KEY_NOTES = "saban-live-notes-v4";
const PENDING_APPROVALS_KEY = "saban-pending-approvals-v1";

export type ApprovalPayload = {
  action: "submitApproval";
  noteId: string;
  approver: "rami" | "harel";
  note?: string;
  timestamp: string;
};

function readPending(): ApprovalPayload[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_APPROVALS_KEY);
    return raw ? (JSON.parse(raw) as ApprovalPayload[]) : [];
  } catch {
    return [];
  }
}

function writePending(list: ApprovalPayload[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PENDING_APPROVALS_KEY, JSON.stringify(list));
}

export async function flushPendingApprovals(): Promise<void> {
  if (typeof window === "undefined") return;
  const pending = readPending();
  if (!pending.length) return;
  const remaining: ApprovalPayload[] = [];
  for (const item of pending) {
    try {
      await approvalFn({ data: item as never });
    } catch {
      remaining.push(item);
    }
  }
  writePending(remaining);
}

export async function fetchLiveNotes(): Promise<DeliveryNote[]> {
  try {
    const res = await listNotesFn();
    const notes = (res as { notes?: DeliveryNote[] })?.notes;
    if (Array.isArray(notes) && notes.length) {
      try {
        localStorage.setItem(CACHE_KEY_NOTES, JSON.stringify(notes));
      } catch {
        /* ignore */
      }
      return notes;
    }
  } catch {
    /* fallback */
  }
  try {
    const cached = localStorage.getItem(CACHE_KEY_NOTES);
    if (cached) return JSON.parse(cached) as DeliveryNote[];
  } catch {
    /* ignore */
  }
  return DEFAULT_NOTES as DeliveryNote[];
}

export async function approveStrict(payload: ApprovalPayload) {
  try {
    return await approvalFn({ data: payload as never });
  } catch (err) {
    const pending = readPending();
    pending.push(payload);
    writePending(pending);
    throw err;
  }
}

export async function saveSignedNoteStrict(params: Record<string, unknown>) {
  return saveSignedNoteFn({ data: params as never });
}

export async function saveSignedNote(payload: Record<string, unknown>) {
  return saveSignedNoteStrict(payload);
}

export type { SheetNote, DeliveryNote, DeliveryItem, Order, Yard, CustomerProfile, GpsStop };
