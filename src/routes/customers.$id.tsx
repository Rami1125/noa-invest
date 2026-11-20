/**
 * /customers/$id — תיק לקוח חי: תעודות + הזמנות + מסמכים + תובנות מכל הטאבים
 * מפתח: מספר לקוח (customerNo)
 * כולל: PTO/מנוף · אתרי אספקה · בירורים · ממוצע פריקה · פקדונות
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatJerusalemDateTime } from "@/lib/he-date";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { uploadCustomerDocumentFn, type CustomerDocumentType } from "@/lib/customer-documents.functions";
import { PageHeader } from "@/components/AppShell";
import { getCustomerBundleFn } from "@/lib/customers.functions";
import {
  Phone,
  MessageSquare,
  Navigation,
  FileText,
  ExternalLink,
  ArrowRight,
  Loader2,
  RefreshCw,
  Package,
  Truck,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Search,
  MapPin,
  CalendarDays,
  Repeat2,
  Sparkles,
  ChevronDown,
  Layers,
  Clock,
  FolderOpen,
  LayoutDashboard,
  MessageCircleWarning,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/customers/$id")({
  head: ({ params }) => ({
    meta: [{ title: `תיק לקוח ${params.id} — ח. סבן` }],
  }),
  component: CustomerDetailView,
});

/** כפתור "בירור" מוסתר כברירת מחדל. להחזרה: true */
const SHOW_INQUIRY_BUTTON = false;

type Rec = Record<string, unknown>;
type Line = { name: string; qty: number; unit: string };

const s = (v: unknown): string => (v == null ? "" : String(v).trim());

function parseDate(raw: unknown): Date | null {
  const str = s(raw);
  if (!str) return null;
  const m = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

const fmtLong = (raw: unknown): string => {
  const d = parseDate(raw);
  return d
    ? d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : s(raw);
};

const fmtShort = (raw: unknown): string => {
  const d = parseDate(raw);
  return d ? d.toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" }) : s(raw);
};

const fmtMonth = (d: Date): string => d.toLocaleDateString("he-IL", { month: "short" });

function relativeFromNow(d: Date | null): string {
  if (!d) return "—";
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "היום";
  if (days === 1) return "אתמול";
  if (days < 30) return `לפני ${days} ימים`;
  if (days < 365) return `לפני ${Math.round(days / 30)} חודשים`;
  return `לפני ${(days / 365).toFixed(1)} שנים`;
}

const normAddr = (a: string) =>
  a
    .toLowerCase()
    .replace(/["'״׳,.]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function itemsOf(r: Rec): Line[] {
  const raw = r.items;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i): i is Rec => !!i && typeof i === "object")
    .map((i) => ({ name: s(i.name), qty: Number(i.qty) || 0, unit: s(i.unit) }))
    .filter((i) => i.name);
}

function depositQty(text: string, code: string): number {
  const m = text.match(new RegExp(`${code}\\D{0,25}(\\d+)`));
  return m ? parseInt(m[1], 10) : 0;
}

const wazeUrl = (address: string) => `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;

type Tab = "overview" | "notes" | "orders" | "pto" | "sites" | "inquiries" | "documents" | "history";

// FILE CONTINUES - this push was truncated; use git checkout 1cf14e91 -- src/routes/customers.\$id.tsx locally
export default function _BrokenPlaceholder() { return null; }
function CustomerDetailView() { return null; }
