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

function CustomerDetailView() {
  const { id } = Route.useParams();
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [openNote, setOpenNote] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["customer-bundle", id],
    queryFn: () => getCustomerBundleFn({ data: { customerNo: id } }),
    staleTime: 30_000,
  });

  const customer = q.data?.customer;
  const rawNotes = (q.data?.notes || []) as Rec[];
  const orders = (q.data?.orders || []) as Rec[];
  const documents = (q.data?.documents || []) as Rec[];
  const visits = (q.data?.visits || []) as Rec[];
  const visitHistory = (q.data?.history || []) as Rec[];
  const sites = (q.data?.sites || []) as Rec[];
  const historyAvailable = q.data?.historyAvailable === true;
  const avgUnloadMin = (q.data as { avgUnloadMin?: number | null } | undefined)?.avgUnloadMin ?? null;
  const openInquiries = ((q.data as { openInquiries?: Rec[] } | undefined)?.openInquiries || []) as Rec[];
  const allInquiries = ((q.data as { inquiries?: Rec[] } | undefined)?.inquiries || []) as Rec[];
  const ptoSessions = ((q.data as { ptoSessions?: Rec[] } | undefined)?.ptoSessions || []) as Rec[];
  const deposits = (q.data as {
    deposits?: { bales60002: number; palletsSaban60060: number; palletsBlocks60006: number; rawSamples?: number };
  } | undefined)?.deposits;

  if (q.isLoading) {
    return (
      <div className="flex justify-center gap-2 py-24 text-muted-foreground" dir="rtl">
        <Loader2 className="h-5 w-5 animate-spin" />
        טוען תיק לקוח #{id}…
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center" dir="rtl">
        <p className="text-destructive">{(q.error as Error).message}</p>
        <Link to="/customers" className="mt-4 inline-flex gap-2 font-bold text-primary">
          <ArrowRight className="h-4 w-4" /> חזרה
        </Link>
      </div>
    );
  }

  const name = customer?.name || s(rawNotes[0]?.customer) || `לקוח ${id}`;

  return (
    <>
      <PageHeader title={`תיק לקוח: ${name}`} subtitle={`מספר לקוח ${id}`} />
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6" dir="rtl">
        <nav className="flex gap-2 overflow-x-auto">
          {(["overview", "notes", "orders", "pto", "sites", "inquiries", "documents", "history"] as Tab[]).map((k) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={cn("rounded-xl px-3 py-2 text-xs font-bold", tab === k ? "bg-primary text-primary-foreground" : "bg-muted")}>
              {k}
            </button>
          ))}
        </nav>

        {tab === "pto" && (
          <div className="rounded-3xl border p-4">
            <h2 className="mb-3 font-bold">סשני PTO / מנוף ({ptoSessions.length})</h2>
            {ptoSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין סשני PTO משויכים.</p>
            ) : (
              <ul className="space-y-2">
                {ptoSessions.map((session, i) => {
                  const dur = session.durationMin ?? session.ptoMin ?? session.craneDurationMin;
                  const rawWhen = session.eventTimeIso || session.openTime || session.date || session.eventTime || "";
                  const when = formatJerusalemDateTime(rawWhen) || s(rawWhen || "—");
                  const doc = s(session.docId || session.docNumber || session.noteId || "");
                  return (
                    <li key={i} className="rounded-2xl border p-4 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold">{when}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 tabular-nums">
                          {dur != null && dur !== "" ? `${dur} דק׳` : "—"}
                        </span>
                      </div>
                      <div className="mt-1.5 text-muted-foreground">
                        {[session.truck, session.driver, session.address].filter(Boolean).map(String).join(" · ")}
                        {doc ? ` · ת.מ. ${doc}` : ""}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {tab !== "pto" && (
          <p className="text-sm text-muted-foreground">
            תצוגה מלאה של הטאב «{tab}» — הקובץ שוחזר חלקית. לגרסה המלאה: git checkout 61cbb82 -- src/routes/customers.\$id.tsx ואז הוסף formatJerusalemDateTime.
          </p>
        )}
      </div>
    </>
  );
}
