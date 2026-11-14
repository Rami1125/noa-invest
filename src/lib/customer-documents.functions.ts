import { createServerFn } from "@tanstack/react-start";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbwi9M5HSO9E0sZrrZ8bdKLCf5mBYPaIk-j3ZY_Mram3qkSH8pU4i-bcG2XNeZ42o3c8Og/exec";

export type CustomerDocumentType = "order" | "delivery_note" | "other";

export const uploadCustomerDocumentFn = createServerFn({ method: "POST" })
  .inputValidator((input: {
    customerNo: string;
    customerName: string;
    docType: CustomerDocumentType;
    fileName: string;
    mimeType: string;
    base64: string;
  }) => input)
  .handler(async ({ data }) => {
    const customerNo = String(data.customerNo || "").trim();
    const customerName = String(data.customerName || "").trim();
    const docType = data.docType;
    const fileName = String(data.fileName || "").trim();
    const mimeType = String(data.mimeType || "").toLowerCase();
    const base64 = String(data.base64 || "").trim();

    if (!customerNo || !customerName) throw new Error("חסר זיהוי לקוח");
    if (!["order", "delivery_note", "other"].includes(docType)) throw new Error("סוג מסמך לא תקין");
    if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      throw new Error("אפשר להעלות קובץ PDF או תמונה בלבד");
    }
    if (!fileName || !base64 || base64.length > 17_000_000) {
      throw new Error("הקובץ ריק או גדול מהמותר (12MB)");
    }

    const token = process.env.API_TOKEN || process.env.GAS_API_TOKEN;
    if (!token) throw new Error("API_TOKEN לא מוגדר בשרת");
    const gasUrl = process.env.GAS_URL || DEFAULT_GAS_URL;

    const response = await fetch(gasUrl, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "archiveCustomerDocument",
        token,
        customerNo,
        customerName,
        docType,
        fileName,
        mimeType,
        base64,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    const text = await response.text();
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`תשובה לא תקינה מ-Apps Script (HTTP ${response.status})`);
    }

    if (!response.ok || result.success !== true || !result.driveUrl) {
      throw new Error(String(result.error || "שמירת המסמך ב-Drive נכשלה"));
    }

    return {
      success: true as const,
      customerNo,
      customerName,
      docType,
      fileName: String(result.fileName || fileName),
      driveUrl: String(result.driveUrl),
      folderName: String(result.folderName || ""),
      uploadedAt: String(result.uploadedAt || new Date().toISOString()),
    };
  });
