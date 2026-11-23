/**
 * תבניות וואטסאפ מעוצבות — הזמנה חדשה / עדכון / שכפול
 */

import type { CartLine } from "@/lib/new-order/types";

export type WaLine = {
  sku: string;
  name: string;
  qty: number;
  unit?: string;
};

export type WaOrderPayload = {
  kind: "new" | "update" | "duplicate";
  orderId?: string;
  customerNo: string;
  customerName: string;
  projectName?: string;
  address: string;
  contactName: string;
  contactPhone: string;
  deliveryDate?: string;
  unloadLabel?: string;
  weightTons?: number;
  lines: WaLine[];
  deposit60002?: number;
  deposit60060?: number;
  notes?: string;
  changeSummary?: string;
};

function linesBlock(lines: WaLine[]): string {
  return lines
    .map((l, i) => {
      const unit = l.unit ? ` ${l.unit}` : "";
      return `${i + 1}. \`${l.sku}\` ${l.name} × *${l.qty}*${unit}`;
    })
    .join("\n");
}

function depositsBlock(d02?: number, d60?: number): string {
  const parts: string[] = [];
  if (d02 && d02 > 0) parts.push(`• פקדון שק גדול (60002) × ${d02}`);
  if (d60 && d60 > 0) parts.push(`• משטח סבן (60060) × ${d60}`);
  return parts.length ? `\n*פקדונות:*\n${parts.join("\n")}` : "";
}

function headerFor(kind: WaOrderPayload["kind"]): string {
  if (kind === "update") return "✏️ *עדכון הזמנה — ח. סבן חומרי בניין*";
  if (kind === "duplicate") return "🔁 *הזמנה משכפלת — ח. סבן חומרי בניין*";
  return "🏗️ *הזמנה חדשה — ח. סבן חומרי בניין*";
}

export function formatOrderWhatsApp(p: WaOrderPayload): string {
  const title = headerFor(p.kind);
  const orderLine = p.orderId ? `\n🔢 מס׳ הזמנה: *${p.orderId}*` : "";
  const project = p.projectName?.trim() ? `\n📁 פרויקט: ${p.projectName.trim()}` : "";
  const change = p.changeSummary?.trim() ? `\n\n📌 *פירוט שינוי:*\n${p.changeSummary.trim()}` : "";
  const weight =
    p.weightTons != null && p.weightTons > 0 ? `\n⚖️ משקל משוער: *${p.weightTons.toFixed(2)}* טון` : "";
  const unload = p.unloadLabel ? `\n🚚 פריקה: ${p.unloadLabel}` : "";
  const date = p.deliveryDate ? `\n📅 תאריך מבוקש: ${p.deliveryDate}` : "";
  const notes = p.notes?.trim() ? `\n📝 הערות: ${p.notes.trim()}` : "";

  const body = [
    title,
    orderLine,
    ``,
    `📋 לקוח: *${p.customerName}* (${p.customerNo || "500500"})`,
    project,
    `📍 כתובת אספקה: ${p.address || "—"}`,
    `👤 איש קשר: ${p.contactName || "—"}`,
    `📱 נייד: ${p.contactPhone || "—"}`,
    ``,
    `————————`,
    `*פריטים:*`,
    linesBlock(p.lines),
    depositsBlock(p.deposit60002, p.deposit60060),
    weight,
    unload,
    date,
    notes,
    change,
    ``,
    p.kind === "new"
      ? `תודה! ההזמנה התקבלה במערכת סבן ✅`
      : p.kind === "update"
        ? `העדכון נשלח לצוות הסידור — נא לאשר בקבוצת הזמנות ✅`
        : `הזמנה משכפלת נשלחה לצוות הסידור ✅`,
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return body;
}

export function cartLinesToWa(lines: CartLine[]): WaLine[] {
  return lines.map((l) => ({
    sku: l.product.sku,
    name: l.product.officialName,
    qty: l.qty,
    unit: l.product.unit,
  }));
}

export function waMeHref(text: string, phoneE164?: string): string {
  const base = phoneE164
    ? `https://wa.me/${phoneE164.replace(/\D/g, "")}`
    : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(text)}`;
}

/** האם סטטוס מאפשר עריכה (עדיין לא סופקה) */
export function isOrderEditable(status: string): boolean {
  const s = String(status || "").trim();
  if (!s) return true;
  if (/סופק|נמסר|נסגר|בוטל|closed|delivered|done|final/i.test(s)) return false;
  if (/תעודה|סופק חלקית/i.test(s) && /סופק/i.test(s)) return false;
  return true;
}
