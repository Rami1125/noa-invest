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
const CACHE_KEY_GPS = "saban-live-gps-v4";
const CACHE_KEY_CUSTOMERS = "saban-live-customers-v4";
const CACHE_KEY_DASHBOARD = "saban-live-dashboard-v4";
const PENDING_APPROVALS_KEY = "saban-pending-approvals-v1";

export type ApprovalPayload = {
  action: "submitApproval";
  noteId: string;
  approver: "rami" | "harel";
  note?: string;
  timestamp: string;
};

/** Client-side notes fetch via server fn */
export async function fetchLiveNotes(): Promise<DeliveryNote[]> {
  try {
    const res = await listNotesFn();
    return (res as { notes?: DeliveryNote[] })?.notes || [];
  } catch {
    return DEFAULT_NOTES as DeliveryNote[];
  }
}

export async function approveStrict(payload: ApprovalPayload) {
  return approvalFn({ data: payload });
}

export async function saveSignedNote(payload: Record<string, unknown>) {
  return saveSignedNoteFn({ data: payload as never });
}

export type { SheetNote, DeliveryNote, DeliveryItem, Order, Yard, CustomerProfile, GpsStop };
