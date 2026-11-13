import { createServerFn } from "@tanstack/react-start";
import { mapGasHandwrittenRow } from "@/lib/handwritten-sheet";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbyv4x_fGMkWmjOLujRymJITBoGQpnbIbJnZp4S9nNs6sacQb1g7x8vyHjaCw6y_t7Pxiw/exec";

let activeGasUrl: string | null = null;

function gasUrl(): string {
  if (activeGasUrl) return activeGasUrl;
  const envUrl = process.env["GAS_URL"];
  if (
    envUrl &&
    (envUrl.includes("TwXhw") ||
      envUrl.includes("AKfycbyv4x_fGMkWmjOLujRymJITBoGQpnbIbJnZp4S9nNs6sacQb1g7x8vyHjaCw6y_t7Pxiw"))
  ) {
    return DEFAULT_GAS_URL;
  }
  return envUrl || DEFAULT_GAS_URL;
}

function apiToken(): string {
  const t = process.env["API_TOKEN"];
  if (!t) throw new Error("API_TOKEN לא מוגדר בשרת (Environment Variables)");
  return t;
}

function extractDiagnosticFromText(text: string, host: string, status: number): string {
  let issue = "";
  if (text.includes("nicht gefunden: doGet") || text.includes("not found: doGet")) {
    issue = "פונקציית doGet לא נמצאה בקובץ הפריסה ב-Apps Script";
  } else if (text.includes("nicht gefunden: doPost") || text.includes("not found: doPost")) {
    issue = "פונקציית doPost לא נמצאה בקובץ הפריסה ב-Apps Script";
  } else if (
    text.includes("accounts.google.com") ||
    text.includes("ServiceLogin") ||
    text.includes("Sign in")
  ) {
    issue = "דף התחברות של Google — הרשאת הגישה אינה מוגדרת ל-Anyone";
  } else {
    issue = `התקבל תוכן HTML באורך ${text.length} תווים במקום JSON`;
  }
  const snippet = text.slice(0, 200).replace(/\s+/g, " ").trim();
  return `תשובה לא תקינה מ-Apps Script (HTTP ${status}) מאת ${host}. פירוט: ${issue}. [קטע: "${snippet}"]`;
}

async function parseGas(res: Response, attemptedUrl: string): Promise<Record<string, unknown>> {
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    const host = new URL(attemptedUrl).hostname;
    throw new Error(extractDiagnosticFromText(text, host, res.status));
  }
  if (data.error) throw new Error(String(data.error));
  if (data.success === false) throw new Error(String(data.error || "הפעולה נכשלה"));
  return data;
}

async function gasGet(params: Record<string, string>) {
  const primaryUrl = gasUrl();
  const buildUrl = (baseUrl: string) => {
    const u = new URL(baseUrl);
    for (const [k, v] of Object.entries({ ...params, token: apiToken() })) u.searchParams.set(k, v);
    return u;
  };
  try {
    const res = await fetch(buildUrl(primaryUrl), {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    return await parseGas(res, primaryUrl);
  } catch (err) {
    if (primaryUrl !== DEFAULT_GAS_URL) {
      const fallbackRes = await fetch(buildUrl(DEFAULT_GAS_URL), {
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
      const result = await parseGas(fallbackRes, DEFAULT_GAS_URL);
      activeGasUrl = DEFAULT_GAS_URL;
      return result;
    }
    throw err;
  }
}

async function gasPost(body: Record<string, unknown>) {
  const primaryUrl = gasUrl();
  const executePost = async (targetUrl: string) => {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...body, token: apiToken() }),
      redirect: "follow",
      signal: AbortSignal.timeout(60_000),
    });
    return await parseGas(res, targetUrl);
  };
  try {
    return await executePost(primaryUrl);
  } catch (err) {
    if (primaryUrl !== DEFAULT_GAS_URL) {
      const result = await executePost(DEFAULT_GAS_URL);
      activeGasUrl = DEFAULT_GAS_URL;
      return result;
    }
    throw err;
  }
}

export type SheetNote = {
  id: string;
  key: string;
  date: string;
  time: string;
  docNumber: string;
  comaxOrder: string;
  customerNo: string;
  customer: string;
  address: string;
  driver: string;
  truck: string;
  fileId: string;
  driveUrl: string;
  items: { sku: string; name: string; qty: number; unit: string }[];
  depositsText: string;
  craneNotes: string;
  extractStatus: string;
  approvalStatus: string;
  signedUrl: string;
  ramiApprovedAt: string;
  harelApprovedAt: string;
};

export type SheetPtoEvent = {
  truck: string;
  driver: string;
  eventType: string;
  eventTimeIso: string;
  address: string;
  ingestedAt: string;
};

export const listNotesFn = createServerFn({ method: "POST" }).handler(async () => {
  const data = await gasGet({ action: "getNotes", _t: String(Date.now()), nocache: "1" });
  return { notes: (Array.isArray(data.notes) ? data.notes : []) as SheetNote[] };
});

export const getManifestFn = createServerFn({ method: "POST" })
  .inputValidator((d: { orderId: string }) => {
    const orderId = String(d?.orderId || "").trim();
    if (!/^\d{4,20}$/.test(orderId)) throw new Error("מספר הזמנת קומקס לא תקין");
    return { orderId };
  })
  .handler(async ({ data }) => {
    const result = await gasGet({ action: "manifest", order: data.orderId });
    return {
      items: (Array.isArray(result.items) ? result.items : []).map((value) => {
        const row = value as Record<string, unknown>;
        return {
          sku: String(row.sku || ""),
          name: String(row.name || ""),
          qty: Number(row.qty || 0),
          unit: String(row.unit || "יח׳"),
          unitWeightKg: Number(row.unitWeightKg || 0),
        };
      }),
      source: String(result.source || ""),
      orderId: String(result.orderId || data.orderId),
      customerNo: String(result.customerNo || ""),
      customer: String(result.customer || ""),
      address: String(result.address || ""),
      date: String(result.date || ""),
    };
  });

export const listPtoFn = createServerFn({ method: "POST" })
  .inputValidator((d: { since?: string; truck?: string } | undefined) => {
    const since = String(d?.since || "");
    if (since && Number.isNaN(new Date(since).getTime())) throw new Error("since לא תקין");
    return { since, truck: String(d?.truck || "").slice(0, 20) };
  })
  .handler(async ({ data }) => {
    const params: Record<string, string> = { action: "getIturanPto", _t: String(Date.now()), nocache: "1" };
    if (data.since) params.since = data.since;
    if (data.truck) params.truck = data.truck;
    const r = await gasGet(params);
    return {
      events: (Array.isArray(r.events) ? r.events : []) as SheetPtoEvent[],
      fetchedAt: String((r.meta as { fetchedAt?: string } | undefined)?.fetchedAt || ""),
    };
  });

export const getCatalogFn = createServerFn({ method: "POST" }).handler(async () => {
  const r = await gasGet({ action: "getCatalog" });
  return {
    rows: (Array.isArray(r.rows) ? r.rows : []) as Record<string, string>[],
    totalRows: Number(r.totalRows || 0),
  };
});

export const getScanFn = createServerFn({ method: "POST" })
  .inputValidator((d: { fileId: string }) => {
    const id = String(d?.fileId || "");
    if (!/^[\w-]{10,}$/.test(id)) throw new Error("fileId לא תקין");
    return { fileId: id };
  })
  .handler(async ({ data }) => {
    const r = await gasGet({ action: "getFile", id: data.fileId });
    return { mimeType: String(r.mimeType || ""), base64: String(r.base64 || "") };
  });

export const saveSignedNoteFn = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      noteId: string;
      customer?: string;
      signedBy?: string;
      statusNote?: string;
      dataUrl: string;
    }) => {
      if (!String(d?.noteId || "")) throw new Error("חסר מספר תעודה");
      if (!/^data:image\/png;base64,/.test(String(d?.dataUrl || ""))) {
        throw new Error("נדרשת תמונת PNG של הקנבס");
      }
      if (d.dataUrl.length > 25_000_000) throw new Error("התמונה גדולה מדי");
      return {
        noteId: String(d.noteId),
        customer: String(d.customer || ""),
        signedBy: String(d.signedBy || ""),
        statusNote: String(d.statusNote || ""),
        dataUrl: d.dataUrl,
      };
    },
  )
  .handler(async ({ data }) => {
    const r = await gasPost({
      action: "saveSignedNote",
      noteId: data.noteId,
      customer: data.customer,
      signedBy: data.signedBy,
      statusNote: data.statusNote,
      signedScanDataUrl: data.dataUrl,
    });
    return { driveUrl: String(r.driveUrl || ""), folder: String(r.folder || "") };
  });

export type LogisticsAuditDecision = {
  status: "pending" | "resolved" | "accepted_exception" | "needs_fix";
  note?: string;
};

export type LogisticsAuditState = {
  evidence: Record<string, string>;
  decisions: Record<string, LogisticsAuditDecision>;
};

export const getLogisticsAuditFn = createServerFn({ method: "POST" })
  .inputValidator((d: { noteId: string }) => {
    const noteId = String(d?.noteId || "").trim();
    if (!noteId) throw new Error("חסר מספר תעודה");
    return { noteId };
  })
  .handler(async ({ data }): Promise<LogisticsAuditState> => {
    const result = await gasGet({ action: "getLogisticsAuditEvidence", noteId: data.noteId });
    return {
      evidence: (result.evidence && typeof result.evidence === "object" ? result.evidence : {}) as Record<
        string,
        string
      >,
      decisions: (result.decisions && typeof result.decisions === "object" ? result.decisions : {}) as Record<
        string,
        LogisticsAuditDecision
      >,
    };
  });

export const saveLogisticsAuditFn = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      noteId: string;
      evidence: Record<string, string>;
      decisions: Record<string, LogisticsAuditDecision>;
    }) => {
      const noteId = String(d?.noteId || "").trim();
      if (
        !noteId ||
        !d.evidence ||
        typeof d.evidence !== "object" ||
        Array.isArray(d.evidence) ||
        !d.decisions ||
        typeof d.decisions !== "object" ||
        Array.isArray(d.decisions)
      ) {
        throw new Error("חסרים פרטי שמירת בקרת לוגיסטיקה");
      }
      return { noteId, evidence: d.evidence, decisions: d.decisions };
    },
  )
  .handler(async ({ data }) => {
    const result = await gasPost({
      action: "saveLogisticsAuditEvidence",
      noteId: data.noteId,
      evidence: data.evidence,
      decisions: data.decisions,
    });
    return {
      success: result.success === true,
      savedAt: String(result.savedAt || ""),
      count: Number(result.count || 0),
    };
  });

export const approvalFn = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      noteId: string;
      approver: "rami" | "harel";
      note?: string;
      auditEvidence?: Record<string, string>;
    }) => {
      if (!String(d?.noteId || "")) throw new Error("חסר מספר תעודה");
      if (d.approver !== "rami" && d.approver !== "harel") throw new Error("approver לא תקין");
      return {
        noteId: String(d.noteId),
        customer: String(d.customer || ""),
        signedBy: String(d.signedBy || ""),
        statusNote: String(d.statusNote || ""),
        dataUrl: d.dataUrl,
      };
    },
  )
  .handler(async ({ data }) => {
    await gasPost({ action: "submitApproval", ...data });
    return { success: true as const };
  });

export const pingFn = createServerFn({ method: "GET" }).handler(async () => {
  const data = await gasGet({ action: "ping" });
  return { version: String(data.version || "unknown"), success: true as const };
});

/** טאב «כתב יד» — action=getHandwritten */
export type SheetHandwrittenRow = {
  noteDate: string;
  docId: string;
  orderId: string;
  customerNo: string;
  customerName: string;
  city: string;
  address: string;
  driverTruck: string;
  craneOpenHe: string;
  craneCloseHe: string;
  durationMin: number | null;
  craneType: string;
  returnsText: string;
  fieldNotes: string;
  warehouseStamp: string;
  returnApprovalStatus: string;
  driveUrl: string;
};

export const listHandwrittenFn = createServerFn({ method: "POST" }).handler(async () => {
  const r = await gasGet({ action: "getHandwritten" });
  const raw = Array.isArray(r.rows) ? r.rows : Array.isArray(r.handwritten) ? r.handwritten : [];
  const rows: SheetHandwrittenRow[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object") continue;
    const mapped = mapGasHandwrittenRow(item as Record<string, unknown>, i);
    if (!mapped) continue;
    rows.push({
      noteDate: mapped.noteDate,
      docId: mapped.docId,
      orderId: mapped.orderId,
      customerNo: mapped.customerNo,
      customerName: mapped.customerName,
      city: mapped.city,
      address: mapped.address,
      driverTruck: mapped.driverTruck,
      craneOpenHe: mapped.craneOpenHe,
      craneCloseHe: mapped.craneCloseHe,
      durationMin: mapped.durationMin,
      craneType: mapped.craneType,
      returnsText: mapped.returnsText,
      fieldNotes: mapped.fieldNotes,
      warehouseStamp: mapped.warehouseStamp,
      returnApprovalStatus: mapped.returnApprovalStatus,
      driveUrl: mapped.driveUrl,
    });
  }
  return {
    rows,
    tab: String(r.tab || "כתב יד"),
    fetchedAt: String((r.meta as { fetchedAt?: string } | undefined)?.fetchedAt || r.fetchedAt || ""),
    totalRows: Number(r.totalRows || rows.length),
  };
});
