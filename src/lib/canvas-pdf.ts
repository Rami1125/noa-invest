/**
 * Build a signed delivery-note PDF from the canvas PNG using pdf-lib.
 * Supports multi-page by accepting an array of PNG data-URLs (one per page).
 */

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export interface SignedPdfMeta {
  noteId: string;
  customer: string;
  customerNo?: string;
  signedBy?: string;
  statusLabel?: string;
  /** ISO or display date */
  dateLabel?: string;
}

function dataUrlToUint8(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Embed one or more canvas page images into a single PDF.
 * A4 portrait; each image is fitted with contain-style margins.
 */
export async function buildSignedNotePdf(
  pageDataUrls: string[],
  meta: SignedPdfMeta,
): Promise<Uint8Array> {
  if (!pageDataUrls.length) throw new Error("אין עמודים לייצוא");

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (const dataUrl of pageDataUrls) {
    const pngBytes = dataUrlToUint8(dataUrl);
    const png = await pdf.embedPng(pngBytes);

    // A4 at 72 dpi
    const pageW = 595.28;
    const pageH = 841.89;
    const page = pdf.addPage([pageW, pageH]);

    const margin = 18;
    const footerH = 28;
    const availW = pageW - margin * 2;
    const availH = pageH - margin * 2 - footerH;

    const scale = Math.min(availW / png.width, availH / png.height);
    const drawW = png.width * scale;
    const drawH = png.height * scale;
    const x = margin + (availW - drawW) / 2;
    const y = margin + footerH + (availH - drawH) / 2;

    page.drawImage(png, { x, y, width: drawW, height: drawH });

    const footer = [
      `H. Saban · Note #${meta.noteId}`,
      meta.customer ? meta.customer.slice(0, 40) : "",
      meta.signedBy ? `Signed: ${meta.signedBy}` : "",
      meta.statusLabel || "",
      meta.dateLabel || new Date().toLocaleDateString("he-IL"),
    ]
      .filter(Boolean)
      .join(" · ");

    page.drawText(footer.slice(0, 120), {
      x: margin,
      y: 12,
      size: 8,
      font,
      color: rgb(0.35, 0.4, 0.45),
    });
  }

  return pdf.save();
}

/** Trigger browser download of the PDF bytes. */
export function downloadPdfBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
