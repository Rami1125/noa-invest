/**
 * customers.functions.ts — תיק לקוח מאוחד מול GAS (LIP)
 */
import { createServerFn } from "@tanstack/react-start";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbwi9M5HSO9E0sZrrZ8bdKLCf5mBYPaIk-j3ZY_Mram3qkSH8pU4i-bcG2XNeZ42o3c8Og/exec";

const GAS_URL =
  (process.env.GAS_URL || process.env.VITE_SHEETS_ORDERS_URL || "").trim() || DEFAULT_GAS_URL;
const API_TOKEN = process.env.API_TOKEN || process.env.GAS_API_TOKEN || "";

async function gasGet(action: string, extra: Record<string, string> = {}) {
  if (!GAS_URL) throw new Error("GAS_URL לא מוגדר בשרת");
  const url = new URL(GAS_URL);
  url.searchParams.set("action", action);
  if (API_TOKEN) url.searchParams.set("token", API_TOKEN);
  Object.entries(extra).forEach(([k, v]) => {
    if (v) url.searchParams.set(k, v);
  });
  if (action === "getNotes" || action === "getIturanPto" || action === "getHandwritten") {
    url.searchParams.set("nocache", "1");
  }
  const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`GAS החזיר לא-JSON (${res.status}): ${text.slice(0, 120)}`);
  }
  if (!res.ok || json.success === false) {
    throw new Error(String(json.error || `GAS ${res.status}`));
  }
  return json;
}

function normName(v: unknown): string {
  return String(v || "")
    .toLowerCase()
    .replace(/["'״׳.,\-_/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normDocId(v: unknown): string {
  return String(v ?? "")
    .trim()
    .replace(/\.0+$/, "")
    .replace(/\s+/g, "");
}

function depositQty(text: string, code: string): number {
  if (!text) return 0;
  const m = text.match(new RegExp(`${code}\\D{0,30}(\\d+)`));
  return m ? parseInt(m[1]!, 10) : 0;
}

function isOpenInquiryStatus(status: string): boolean {
  const s = status.toLowerCase();
  if (!s) return true;
  if (/סגור|closed|done|הושלם|אושר|resolved/.test(s)) return false;
  return true;
}

export type LiveCustomer = {
  id: string;
  customerNo: string;
  name: string;
  address: string;
  phone: string;
  preferredDriver: string;
  notesCount: number;
  ordersCount: number;
  lastNoteId: string;
  lastNoteDate: string;
  sampleDriveUrl: string;
  addresses?: string[];
  lastActivity?: string;
  lastDeliveryDate?: string;
  totalWeightTons?: number;
  balesDepositQty?: number;
  palletsDepositQty?: number;
  recentOrders?: Array<Record<string, unknown>>;
};

export type CustomerDepositBalance = {
  bales60002: number;
  palletsSaban60060: number;
  palletsBlocks60006: number;
  rawSamples: number;
};

export type CustomerInquiryRow = {
  id: string;
  docNumber: string;
  customerNo: string;
  customer: string;
  status: string;
  issue: string;
  open: boolean;
  driveUrl: string;
};

export const listCustomersFn = createServerFn({ method: "GET" }).handler(async () => {
  const json = await gasGet("getCustomers");
  return {
    customers: (json.customers as LiveCustomer[]) || [],
    fetchedAt: new Date().toISOString(),
    gasUrl: GAS_URL,
  };
});

export const searchCustomersFn = createServerFn({ method: "POST" })
  .validator((d: { query: string }) => d)
  .handler(async ({ data }) => {
    const json = await gasGet("searchCustomers", { q: String(data.query || "").trim() });
    return {
      customers: (json.customers as LiveCustomer[]) || [],
      query: data.query,
      fetchedAt: new Date().toISOString(),
    };
  });

export const getCustomerFn = createServerFn({ method: "POST" })
  .validator((d: { customerNo: string }) => d)
  .handler(async ({ data }) => {
    const customerNo = String(data.customerNo || "").trim();
    if (!customerNo) throw new Error("חסר מספר לקוח");
    const json = await gasGet("getCustomer", { customerNo });
    return {
      customer: (json.customer as LiveCustomer) || null,
      fetchedAt: new Date().toISOString(),
    };
  });

export const getCustomerBundleFn = createServerFn({ method: "POST" })
  .validator((d: { customerNo: string }) => d)
  .handler(async ({ data }) => {
    const no = String(data.customerNo || "").trim();
    if (!no) throw new Error("חסר מספר לקוח");

    const [custJson, notesJson, ordersJson, documentsJson, historyJson, inquiriesJson, ptoJson, hwJson] =
      await Promise.all([
        gasGet("getCustomers").catch(() => ({ customers: [] as LiveCustomer[] })),
        gasGet("getNotes").catch(() => ({ notes: [] as unknown[] })),
        gasGet("getOrders").catch(() => ({ orders: [] as unknown[] })),
        gasGet("getCustomerDocuments", { customerNo: no }).catch(() => ({ documents: [] as unknown[] })),
        gasGet("getCustomerHistory", { customerNo: no }).catch(() => ({
          available: false,
          visits: [],
          history: [],
          sites: [],
        })),
        gasGet("getRamiInquiries").catch(() => ({ inquiries: [] as unknown[] })),
        gasGet("getIturanPto", { since: "180" }).catch(() => ({ sessions: [] as unknown[], rows: [] as unknown[] })),
        gasGet("getHandwritten").catch(() => ({ rows: [] as unknown[] })),
      ]);

    const customers = (custJson.customers as LiveCustomer[]) || [];
    const customer =
      customers.find((c) => String(c.customerNo) === no || String(c.id) === no) || null;
    const customerName = customer?.name || "";
    const nameKey = normName(customerName);

    const allNotes = (notesJson.notes as Record<string, unknown>[]) || [];
    const notesForCustomer = allNotes.filter((n) => {
      const nNo = String(n.customerNo || n["מס' לקוח"] || "").trim().replace(/\.0+$/, "");
      if (nNo && nNo === no) return true;
      if (nameKey) {
        const nName = normName(n.customerName || n.customer || n["שם לקוח"] || "");
        if (nName && (nName === nameKey || nName.includes(nameKey) || nameKey.includes(nName))) return true;
      }
      return false;
    });

    const noteByDoc = new Map<string, Record<string, unknown>>();
    for (const n of notesForCustomer) {
      const docId = normDocId(n.docNumber || n.id || n.noteId || "");
      if (!docId) continue;
      const prev = noteByDoc.get(docId);
      const score = [n.driveUrl || n.signedUrl || n.link, n.itArrive, n.itDepart, n.itStop, n.depositsText]
        .filter((v) => v != null && String(v).trim()).length;
      const prevScore = prev
        ? [prev.driveUrl || prev.signedUrl, prev.itArrive, prev.itStop].filter((v) => v != null && String(v).trim())
            .length
        : -1;
      if (!prev || score >= prevScore) noteByDoc.set(docId, n);
    }
    const notes = [...noteByDoc.values()].sort((a, b) =>
      String(b.date || b.dateIso || "").localeCompare(String(a.date || a.dateIso || "")),
    );
    const noteIds = new Set(notes.map((n) => normDocId(n.docNumber || n.id)));

    const allOrders = (ordersJson.orders as Record<string, unknown>[]) || [];
    const orders = allOrders.filter((o) => {
      const oNo = String(o.customerNo || o["מס' לקוח"] || o["מספר לקוח"] || "").trim().replace(/\.0+$/, "");
      if (oNo && oNo === no) return true;
      if (nameKey) {
        const oName = normName(o.customer || o.customerName || o["שם לקוח"] || o.name || "");
        if (oName && (oName === nameKey || oName.includes(nameKey) || nameKey.includes(oName))) return true;
      }
      return false;
    });

    const sites = (historyJson.sites as Record<string, unknown>[]) || [];
    const visits = (historyJson.visits as Record<string, unknown>[]) || [];
    const history = (historyJson.history as Record<string, unknown>[]) || [];
    const documents = (documentsJson.documents as Record<string, unknown>[]) || [];

    const unloadSamples: number[] = [];
    for (const n of notes) {
      const stop = Number(n.itStop ?? n.stopMin ?? n.stayMin);
      if (Number.isFinite(stop) && stop > 0 && stop < 480) unloadSamples.push(stop);
    }
    for (const h of history) {
      const m = Number(String(h.unloadMinutes || h.stayMinutes || h.durationMin || "").replace(",", "."));
      if (Number.isFinite(m) && m > 0 && m < 480) unloadSamples.push(m);
    }
    for (const s of sites) {
      const m = Number(s.avgStopMin ?? s.medianMin ?? s.average ?? s.p50);
      if (Number.isFinite(m) && m > 0 && m < 480) unloadSamples.push(m);
    }

    const addrTokens = new Set(
      notes
        .flatMap((n) => [String(n.address || ""), String(n.customerName || n.customer || "")])
        .join(" ")
        .toLowerCase()
        .replace(/[^\u0590-\u05FFa-z0-9\s]/gi, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3),
    );
    if (/ערוגת|בשם|616088/.test(nameKey + no + customerName)) {
      for (const x of ["קדימה", "צורן", "כנרת", "רוטשילד", "ערוגת", "הבשם"]) addrTokens.add(x);
    }

    const ptoField = (s: Record<string, unknown>, ...keys: string[]) => {
      for (const k of keys) {
        const v = s[k];
        if (v != null && String(v).trim() !== "") return String(v).trim();
      }
      const fold = (h: string) =>
        h.toLowerCase().replace(/[\s`'׳״".,_\-\/]/g, "").replace(/מספר/g, "מס");
      const wanted = keys.map(fold);
      for (const [hk, hv] of Object.entries(s)) {
        if (hv == null || String(hv).trim() === "") continue;
        const fh = fold(hk);
        if (wanted.some((w) => w && (fh === w || (w.length >= 4 && (fh.includes(w) || w.includes(fh)))))) {
          return String(hv).trim();
        }
      }
      return "";
    };

    const ptoRaw =
      (ptoJson.sessions as Record<string, unknown>[]) ||
      (ptoJson.rows as Record<string, unknown>[]) ||
      (ptoJson.events as Record<string, unknown>[]) ||
      [];

    const matchPtoRow = (s: Record<string, unknown>): boolean => {
      const doc = normDocId(
        ptoField(s, "docId", "docNumber", "noteId", "מס' תעודת משלוח", "מס׳ תעודת משלוח", "מס' תעודה", "מספר תעודה"),
      );
      if (doc && noteIds.has(doc)) return true;
      const multi = String(s.docIds || s.docs || "").split(/[,;|\s]+/);
      if (multi.some((d) => noteIds.has(normDocId(d)))) return true;
      const sNo = normDocId(ptoField(s, "customerNo", "מס' לקוח", "מס׳ לקוח", "מספר לקוח", "מס לקוח"));
      if (sNo && sNo === no) return true;
      const sName = normName(ptoField(s, "customerName", "customer", "שם לקוח", "לקוח"));
      if (nameKey && sName && (sName === nameKey || sName.includes(nameKey) || nameKey.includes(sName))) return true;
      const addr = ptoField(s, "address", "כתובת", "location", "אתר").toLowerCase();
      if (addr && addrTokens.size) {
        let hits = 0;
        for (const tok of addrTokens) if (addr.includes(tok)) hits++;
        if (hits >= 2) return true;
        if (hits >= 1 && /קדימה|צורן/.test(addr) && /קדימה|צורן|כנרת|רוטשילד/.test([...addrTokens].join(" "))) {
          return true;
        }
      }
      return false;
    };

    const fromGas = ptoRaw.filter(matchPtoRow).map((s) => {
      const open =
        ptoField(s, "openTime", "ptoOpen", "eventTimeIso", "eventTime", "PTO פתיחה", "openedAt") ||
        (/open|פתיח/i.test(ptoField(s, "eventType", "סוג")) ? ptoField(s, "eventTimeIso", "eventTime") : "");
      const close =
        ptoField(s, "closeTime", "ptoClose", "PTO סגירה", "closedAt") ||
        (/close|סגיר/i.test(ptoField(s, "eventType", "סוג")) ? ptoField(s, "eventTimeIso", "eventTime") : "");
      const durationMin = Number(
        s.durationMin ?? s.ptoMin ?? s.craneDurationMin ?? ptoField(s, "PTO דק׳", "PTO דק", "משך"),
      );
      return {
        ...s,
        eventTimeIso: open || close || String(s.eventTimeIso || s.date || ""),
        openTime: open || undefined,
        closeTime: close || undefined,
        durationMin: Number.isFinite(durationMin) && durationMin > 0 ? durationMin : (s.durationMin ?? null),
        truck: ptoField(s, "truck", "משאית", "רכב") || s.truck,
        driver: ptoField(s, "driver", "נהג") || s.driver,
        address: ptoField(s, "address", "כתובת") || s.address,
        docId: normDocId(ptoField(s, "docId", "docNumber", "noteId", "מס' תעודת משלוח", "מס' תעודה")) || s.docId,
        noteId: normDocId(ptoField(s, "noteId", "docId", "מס' תעודה")) || s.noteId,
        customerNo: normDocId(ptoField(s, "customerNo", "מס' לקוח")) || no,
        source: String(s.source || "getIturanPto"),
      };
    });

    const fromNotes: Record<string, unknown>[] = [];
    for (const n of notes) {
      const open = String(n.ptoOpen || n.ptoOpenTime || n["PTO פתיחה"] || "").trim();
      const close = String(n.ptoClose || n.ptoCloseTime || n["PTO סגירה"] || "").trim();
      let durationMin = Number(n.ptoMin ?? n.ptoDurationMin ?? n["PTO דק׳"] ?? n["PTO דק"]);
      const crane = String(n.craneNotes || n.craneTime || n["זמני מנוף / המתנה"] || n["מנוף"] || "");
      const craneMatch = crane.match(/(\d{1,2}:\d{2})\s*[–\-−]\s*(\d{1,2}:\d{2})/);
      const craneMinMatch = crane.match(/\((\d+)\s*דק/) || crane.match(/(\d+)\s*דק/);
      if (!Number.isFinite(durationMin) && craneMinMatch) durationMin = parseInt(craneMinMatch[1]!, 10);
      if (!open && !close && !craneMatch && !(Number.isFinite(durationMin) && durationMin > 0)) continue;
      const o = open || (craneMatch ? craneMatch[1] : "");
      const c = close || (craneMatch ? craneMatch[2] : "");
      const doc = normDocId(n.docNumber || n.id || n.noteId);
      fromNotes.push({
        eventTimeIso: o || String(n.date || n.dateIso || ""),
        openTime: o || undefined,
        closeTime: c || undefined,
        durationMin: Number.isFinite(durationMin) && durationMin > 0 ? durationMin : null,
        truck: n.truck || n.plate || "",
        driver: n.driver || "",
        address: n.address || "",
        docId: doc,
        noteId: doc,
        docNumber: doc,
        customerNo: no,
        source: "ארכיון_תעודות_גליה",
        eventType: "archive_pto",
      });
    }

    const seenPto = new Set<string>();
    const ptoSessions = [...fromGas, ...fromNotes].filter((s) => {
      const k = `${s.docId || s.noteId || ""}|${s.openTime || s.eventTimeIso || ""}|${s.closeTime || ""}|${s.durationMin ?? ""}|${s.source || ""}`;
      if (seenPto.has(k)) return false;
      seenPto.add(k);
      return true;
    });

    for (const s of ptoSessions) {
      const dur = Number(s.durationMin ?? s.ptoMin ?? s.craneDurationMin);
      if (Number.isFinite(dur) && dur > 0 && dur < 480) unloadSamples.push(dur);
    }

    const avgUnloadMin =
      unloadSamples.length > 0
        ? Math.round((unloadSamples.reduce((a, b) => a + b, 0) / unloadSamples.length) * 10) / 10
        : null;

    const allInquiries = (inquiriesJson.inquiries as Record<string, unknown>[]) || [];
    const inquiries: CustomerInquiryRow[] = allInquiries
      .map((inq) => {
        const docNumber = normDocId(inq.id || inq.docNumber || inq.noteId || "");
        const cNo = String(inq.customerNo || "").trim().replace(/\.0+$/, "");
        const cName = normName(inq.customer || inq.customerName || "");
        const matchNo = cNo === no;
        const matchDoc = docNumber && noteIds.has(docNumber);
        const matchName = nameKey && cName && (cName === nameKey || cName.includes(nameKey));
        if (!matchNo && !matchDoc && !matchName) return null;
        const status = String(inq.status || "");
        return {
          id: String(inq.id || docNumber),
          docNumber,
          customerNo: cNo || no,
          customer: String(inq.customer || customerName || ""),
          status,
          issue: String(inq.issue || inq.errorReason || inq.aiAnalysis || ""),
          open: isOpenInquiryStatus(status),
          driveUrl: String(inq.driveUrl || ""),
        } satisfies CustomerInquiryRow;
      })
      .filter((x): x is CustomerInquiryRow => !!x);

    const openInquiries = inquiries.filter((i) => i.open);

    let bales = 0;
    let palletsSaban = 0;
    let palletsBlocks = 0;
    let rawSamples = 0;
    for (const n of notes) {
      const t = String(n.depositsText || n.deposits || "");
      if (!t) continue;
      rawSamples++;
      bales += depositQty(t, "60002");
      palletsSaban += depositQty(t, "60060");
      palletsBlocks += depositQty(t, "60006");
    }
    const hwRows = (hwJson.rows as Record<string, unknown>[]) || [];
    for (const r of hwRows) {
      const doc = normDocId(r.docId || r.docNumber);
      const cNo = String(r.customerNo || "").trim().replace(/\.0+$/, "");
      if (cNo !== no && !(doc && noteIds.has(doc))) continue;
      const ret = String(r.returnsHandwritten || r.returns || "");
      if (/החזר/.test(ret) && !/ללא החזרה/.test(ret)) {
        const mB = ret.match(/(\d+)\s*משטח/);
        if (mB) palletsBlocks = Math.max(0, palletsBlocks - parseInt(mB[1]!, 10));
      }
    }

    const deposits: CustomerDepositBalance = {
      bales60002: bales,
      palletsSaban60060: palletsSaban,
      palletsBlocks60006: palletsBlocks,
      rawSamples,
    };

    return {
      customer: customer
        ? {
            ...customer,
            notesCount: notes.length,
            ordersCount: orders.length,
            balesDepositQty: deposits.bales60002,
            palletsDepositQty: deposits.palletsSaban60060,
          }
        : {
            id: no,
            customerNo: no,
            name: customerName || `לקוח ${no}`,
            address: "",
            phone: "",
            preferredDriver: "",
            notesCount: notes.length,
            ordersCount: orders.length,
            lastNoteId: String(notes[0]?.docNumber || notes[0]?.id || ""),
            lastNoteDate: String(notes[0]?.date || ""),
            sampleDriveUrl: String(notes[0]?.driveUrl || notes[0]?.signedUrl || ""),
          },
      notes,
      orders,
      documents,
      visits,
      history,
      sites,
      historyAvailable: historyJson.available === true,
      customerNo: no,
      avgUnloadMin,
      unloadSampleCount: unloadSamples.length,
      ptoSessions,
      inquiries,
      openInquiries,
      openInquiriesCount: openInquiries.length,
      deposits,
      fetchedAt: new Date().toISOString(),
      gasUrl: GAS_URL,
    };
  });
