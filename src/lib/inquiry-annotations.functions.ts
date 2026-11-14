import { createServerFn } from "@tanstack/react-start";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbx008PcNLu8BfjNIudaTDa74a7rVmlPpImBK9QaLR9ITxLR1ahNQjzmgmY-39275eQXng/exec";

function gasUrl(): string {
  const envUrl = process.env["GAS_URL"];
  // Workflow endpoints added in v6 are not available in the older deployment.
  if (envUrl && envUrl.includes("AKfycbyv4x_fGMkWmjOLujRymJITBoGQpnbIbJnZp4S9nNs6sacQb1g7x8vyHjaCw6y_t7Pxiw")) {
    return DEFAULT_GAS_URL;
  }
  return envUrl || DEFAULT_GAS_URL;
}

function apiToken(): string {
  const token = process.env["API_TOKEN"];
  if (!token) throw new Error("API_TOKEN לא מוגדר בשרת");
  return token;
}

/** שומר שכבת סימון בנפרד מהתעודה החתומה, בלי לשנות סטטוס אישור. */
export const saveInquiryAnnotationsFn = createServerFn({ method: "POST" })
  .inputValidator((value: {
    noteId: string;
    pngDataUrl: string;
    compositeDataUrl: string;
    annotationJson: string;
  }) => {
    const noteId = String(value?.noteId || "").trim();
    const pngDataUrl = String(value?.pngDataUrl || "");
    const compositeDataUrl = String(value?.compositeDataUrl || "");
    const annotationJson = String(value?.annotationJson || "{}");
    if (!noteId) throw new Error("חסר מספר תעודה");
    if (!/^data:image\/png;base64,/.test(pngDataUrl)) {
      throw new Error("נדרשת תמונת PNG תקינה של שכבת הסימון");
    }
    if (!/^data:image\/png;base64,/.test(compositeDataUrl)) {
      throw new Error("נדרשת תמונת PNG משולבת");
    }
    if (pngDataUrl.length > 25_000_000 || compositeDataUrl.length > 25_000_000) throw new Error("התמונה גדולה מדי");
    if (annotationJson.length > 1_000_000) throw new Error("נתוני הסימון גדולים מדי");
    return { noteId, pngDataUrl, compositeDataUrl, annotationJson };
  })
  .handler(async ({ data }) => {
    const response = await fetch(gasUrl(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "saveInquiryAnnotations",
        ...data,
        token: apiToken(),
      }),
      redirect: "follow",
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text();
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`תשובה לא תקינה מ-Apps Script (HTTP ${response.status})`);
    }
    if (!response.ok || result.success === false || result.error) {
      throw new Error(String(result.error || "שמירת הסימונים נכשלה"));
    }
    return {
      success: true as const,
      driveUrl: String(result.driveUrl || ""),
    };
  });
