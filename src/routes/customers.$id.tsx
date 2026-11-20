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

  const unloadBySite = useMemo(() => {
    const grouped = new Map<string, { address: string; values: number[] }>();
    for (const row of visitHistory) {
      const address = s(row.address);
      const minutes = Number(String(row.unloadMinutes || "").replace(",", "."));
      if (!address || !Number.isFinite(minutes) || minutes <= 0) continue;
      const entry = grouped.get(normAddr(address)) || { address, values: [] };
      entry.values.push(minutes);
      grouped.set(normAddr(address), entry);
    }
    return [...grouped.values()].map((site) => ({
      ...site,
      average: Math.round(site.values.reduce((sum, value) => sum + value, 0) / site.values.length),
      samples: site.values.length,
    }));
  }, [visitHistory]);

  const intel = useMemo(() => {
    const notes = [...rawNotes].sort(
      (a, b) => (parseDate(b.date)?.getTime() ?? 0) - (parseDate(a.date)?.getTime() ?? 0),
    );
    const byAddr = new Map<string, { label: string; dates: number[] }>();
    for (const n of notes) {
      const label = s(n.address);
      if (!label) continue;
      const key = normAddr(label);
      const entry = byAddr.get(key) || { label, dates: [] };
      entry.dates.push(parseDate(n.date)?.getTime() ?? 0);
      byAddr.set(key, entry);
    }
    const addresses = [...byAddr.values()].sort((a, b) => b.dates.length - a.dates.length);
    const priorAtAddress = new Map<string, number>();
    for (const n of notes) {
      const key = normAddr(s(n.address));
      const t = parseDate(n.date)?.getTime() ?? 0;
      const entry = key ? byAddr.get(key) : undefined;
      priorAtAddress.set(s(n.id), entry ? entry.dates.filter((x) => x < t).length : 0);
    }
    const products = new Map<string, { qty: number; unit: string; hits: number }>();
    for (const r of [...notes, ...orders]) {
      for (const it of itemsOf(r)) {
        const p = products.get(it.name) || { qty: 0, unit: it.unit, hits: 0 };
        p.qty += it.qty;
        p.hits += 1;
        products.set(it.name, p);
      }
    }
    const topProducts = [...products.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.hits - a.hits || b.qty - a.qty)
      .slice(0, 6);
    const drivers = new Map<string, number>();
    for (const n of notes) {
      const d = s(n.driver);
      if (d) drivers.set(d, (drivers.get(d) || 0) + 1);
    }
    const topDriver = [...drivers.entries()].sort((a, b) => b[1] - a[1])[0];
    let bales = 0;
    let pallets = 0;
    for (const n of notes) {
      const t = s(n.depositsText);
      bales += depositQty(t, "60002");
      pallets += depositQty(t, "60060");
    }
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: fmtMonth(d), count: 0 };
    });
    for (const n of notes) {
      const d = parseDate(n.date);
      if (!d) continue;
      const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (m) m.count += 1;
    }
    const firstDate = parseDate(notes[notes.length - 1]?.date);
    const lastDate = parseDate(notes[0]?.date);
    return { notes, addresses, priorAtAddress, topProducts, topDriver, bales, pallets, months, firstDate, lastDate };
  }, [rawNotes, orders]);

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
  const address = customer?.address || intel.addresses[0]?.label || "";
  const phone = customer?.phone || "";
  const phoneDigits = phone.replace(/[^0-9]/g, "");
  const wa = phoneDigits ? `972${phoneDigits.slice(-9)}` : "";
  const isReturning = intel.notes.length > 1;
  const maxMonth = Math.max(1, ...intel.months.map((m) => m.count));
  const maxProduct = Math.max(1, ...intel.topProducts.map((p) => p.hits));
  const term = search.trim().toLowerCase();
  const filteredNotes = term
    ? intel.notes.filter((n) =>
        [n.id, n.docNumber, n.comaxOrder, n.address, n.driver, n.craneNotes, n.craneTime]
          .map(s)
          .join(" ")
          .toLowerCase()
          .includes(term),
      )
    : intel.notes;

  const tabs: { key: Tab; label: string; icon: ReactNode; count?: number }[] = [
    { key: "overview", label: "סקירה", icon: <LayoutDashboard className="h-4 w-4" /> },
    { key: "notes", label: "תעודות", icon: <FileText className="h-4 w-4" />, count: intel.notes.length },
    { key: "orders", label: "הזמנות", icon: <Package className="h-4 w-4" />, count: orders.length },
    { key: "pto", label: "PTO / מנוף", icon: <Timer className="h-4 w-4" />, count: ptoSessions.length },
    { key: "sites", label: "אתרי אספקה", icon: <MapPin className="h-4 w-4" />, count: sites.length },
    { key: "inquiries", label: "בירורים", icon: <MessageCircleWarning className="h-4 w-4" />, count: openInquiries.length },
    { key: "documents", label: "מסמכים", icon: <FolderOpen className="h-4 w-4" />, count: documents.length },
    { key: "history", label: "ביקורים ואתרים", icon: <Layers className="h-4 w-4" />, count: visits.length },
  ];

  return (
    <>
      <PageHeader
        title={`תיק לקוח: ${name}`}
        subtitle={`מספר לקוח ${id} · נתונים חיים מכל טאבי הגיליון`}
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void q.refetch()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition hover:bg-muted"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", q.isFetching && "animate-spin")} />
              רענון
            </button>
            <Link
              to="/customers"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition hover:bg-muted"
            >
              <ArrowRight className="h-4 w-4" />
              כל הלקוחות
            </Link>
          </div>
        }
      />

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8" dir="rtl">
        <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-card">
          <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-muted-foreground">קומקס #{id}</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold",
                    isReturning
                      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700"
                      : "border-amber-500/30 bg-amber-500/15 text-amber-800",
                  )}
                >
                  <Repeat2 className="h-3 w-3" />
                  {isReturning ? `לקוח חוזר · ${intel.notes.length} אספקות` : "אספקה ראשונה"}
                </span>
              </div>
              <h1 className="mt-1 font-display text-2xl font-extrabold md:text-3xl">{name}</h1>
              {address && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 text-primary" />
                  {address}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {(customer?.preferredDriver || intel.topDriver?.[0]) && (
                  <span className="inline-flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5 text-primary" />
                    נהג עיקרי: <strong className="text-foreground">{customer?.preferredDriver || intel.topDriver?.[0]}</strong>
                  </span>
                )}
                {intel.lastDate && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    אספקה אחרונה: <strong className="text-foreground">{relativeFromNow(intel.lastDate)}</strong>
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <CustomerDocumentUpload customerNo={id} customerName={name} />
              {phone && (
                <a href={`tel:${phone}`} className="inline-flex items-center gap-2 rounded-2xl bg-muted/80 px-4 py-3 text-xs font-bold transition hover:bg-muted active:scale-95">
                  <Phone className="h-4 w-4 text-primary" /> חיוג
                </a>
              )}
              {wa && (
                <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-3 text-xs font-bold text-emerald-700 transition hover:bg-emerald-500/25 active:scale-95">
                  <MessageSquare className="h-4 w-4" /> וואטסאפ
                </a>
              )}
              {address && (
                <a href={wazeUrl(address)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl border border-blue-500/30 bg-blue-500/15 px-4 py-3 text-xs font-bold text-blue-700 transition hover:bg-blue-500/25 active:scale-95">
                  <Navigation className="h-4 w-4" /> נווט ל-Waze
                </a>
              )}
            </div>
          </div>
          <div className="relative mt-5 grid grid-cols-2 gap-3 border-t border-border/50 pt-4 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="תעודות משלוח" value={String(intel.notes.length)} icon={<FileText className="h-4 w-4 text-amber-500" />} />
            <Kpi label="הזמנות" value={String(orders.length)} icon={<Package className="h-4 w-4 text-blue-500" />} />
            <Kpi label="ממוצע פריקה" value={avgUnloadMin != null ? `${avgUnloadMin} דק׳` : "—"} icon={<Timer className="h-4 w-4 text-orange-500" />} />
            <Kpi label="בירורים פתוחים" value={String(openInquiries.length)} icon={<MessageCircleWarning className="h-4 w-4 text-red-500" />} />
            <Kpi label="כתובות אספקה" value={String(intel.addresses.length)} icon={<MapPin className="h-4 w-4 text-emerald-500" />} />
            <Kpi label="לקוח מאז" value={intel.firstDate ? fmtShort(intel.firstDate) : "—"} icon={<CalendarDays className="h-4 w-4 text-primary" />} small />
          </div>
        </section>

        <nav className="sticky top-[60px] z-20 -mx-1 flex gap-1 overflow-x-auto rounded-2xl border border-border/70 bg-card/90 p-1 shadow-sm backdrop-blur-md">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex min-h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 text-xs font-bold transition",
                tab === t.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {t.icon}
              {t.label}
              {t.count !== undefined && (
                <span className={cn("rounded-full px-1.5 text-[10px]", tab === t.key ? "bg-white/25" : "bg-muted")}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </nav>

        {tab === "pto" && (
          <Card title={`סשני PTO / מנוף (${ptoSessions.length})`} icon={<Timer className="h-5 w-5 text-orange-500" />}>
            {ptoSessions.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                אין סשני PTO משויכים לתעודות הלקוח (הצלבה לפי מס׳ תעודה / מס׳ לקוח).
              </p>
            ) : (
              <ul className="space-y-2">
                {ptoSessions.map((session, i) => {
                  const dur = session.durationMin ?? session.ptoMin ?? session.craneDurationMin;
                  const rawWhen = session.eventTimeIso || session.openTime || session.date || session.eventTime || "";
                  const when = formatJerusalemDateTime(rawWhen) || s(rawWhen || "—");
                  const doc = s(session.docId || session.docNumber || session.noteId || "");
                  return (
                    <li key={i} className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold">{when}</span>
                        <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums", Number(dur) > 20 ? "bg-red-500/15 text-red-700" : "bg-emerald-500/15 text-emerald-700")}>
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
          </Card>
        )}

        {tab === "overview" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="כתובות אספקה" icon={<MapPin className="h-5 w-5 text-emerald-500" />}>
              {intel.addresses.length === 0 ? (
                <p className="text-sm text-muted-foreground">אין כתובות</p>
              ) : (
                <ul className="space-y-2">
                  {intel.addresses.slice(0, 8).map((a) => (
                    <li key={a.label} className="flex items-center justify-between gap-2 rounded-xl border p-3 text-xs">
                      <span className="font-semibold">{a.label}</span>
                      <span className="text-muted-foreground">{a.dates.length} אספקות</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="מוצרים מובילים" icon={<Package className="h-5 w-5 text-blue-500" />}>
              {intel.topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">אין נתונים</p>
              ) : (
                <ul className="space-y-2">
                  {intel.topProducts.map((p) => (
                    <li key={p.name} className="rounded-xl border p-3 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold">{p.name}</span>
                        <span className="tabular-nums text-muted-foreground">{p.hits}× · {p.qty} {p.unit}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(p.hits / maxProduct) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="פעילות 6 חודשים" icon={<CalendarDays className="h-5 w-5 text-primary" />}>
              <div className="flex items-end gap-2 h-28">
                {intel.months.map((m) => (
                  <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                    <div className="w-full rounded-t bg-primary/80" style={{ height: `${(m.count / maxMonth) * 100}%`, minHeight: m.count ? 4 : 0 }} />
                    <span className="text-[10px] text-muted-foreground">{m.label}</span>
                    <span className="text-[10px] font-bold">{m.count}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="פקדונות (מסריקות)" icon={<Package className="h-5 w-5 text-amber-500" />}>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-muted-foreground">שקים גדולים 60002</div>
                  <div className="text-xl font-bold">{deposits?.bales60002 ?? intel.bales}</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-muted-foreground">משטחי סבן 60060</div>
                  <div className="text-xl font-bold">{deposits?.palletsSaban60060 ?? intel.pallets}</div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {tab === "notes" && (
          <Card title={`תעודות משלוח (${filteredNotes.length})`} icon={<FileText className="h-5 w-5 text-amber-500" />}>
            <div className="mb-3">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="חיפוש תעודה / כתובת / נהג…"
                  className="w-full rounded-xl border bg-background py-2 pr-10 pl-3 text-sm"
                />
              </div>
            </div>
            {filteredNotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין תעודות</p>
            ) : (
              <ul className="space-y-2">
                {filteredNotes.slice(0, 50).map((n) => {
                  const nid = s(n.id || n.docNumber);
                  return (
                    <li key={nid || s(n.date) + s(n.address)} className="rounded-2xl border p-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold">{fmtShort(n.date)}</span>
                        <span className="font-mono text-muted-foreground">{nid}</span>
                      </div>
                      <div className="mt-1 text-muted-foreground">{s(n.address)}</div>
                      <div className="mt-1">{[s(n.driver), s(n.truck)].filter(Boolean).join(" · ")}</div>
                      {nid && (
                        <Link to="/notes/$id" params={{ id: nid }} className="mt-2 inline-flex items-center gap-1 text-primary font-bold">
                          צפייה בתעודה <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {tab === "orders" && (
          <Card title={`הזמנות (${orders.length})`} icon={<Package className="h-5 w-5 text-blue-500" />}>
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין הזמנות</p>
            ) : (
              <ul className="space-y-2">
                {orders.slice(0, 40).map((o, i) => (
                  <li key={i} className="rounded-2xl border p-3 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="font-bold">{fmtShort(o.date || o.orderDate)}</span>
                      <span className="font-mono text-muted-foreground">{s(o.orderId || o.id)}</span>
                    </div>
                    <div className="mt-1 text-muted-foreground">{s(o.address || o.site)}</div>
                    <div className="mt-1">{itemsOf(o).map((it) => `${it.qty} ${it.unit} ${it.name}`).join(" · ")}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === "sites" && (
          <Card title={`אתרי אספקה (${sites.length})`} icon={<MapPin className="h-5 w-5 text-emerald-500" />}>
            {sites.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין אתרים משויכים</p>
            ) : (
              <ul className="space-y-2">
                {sites.map((site, i) => (
                  <li key={i} className="rounded-2xl border p-3 text-xs">
                    <div className="font-bold">{s(site.address || site.siteKey || "—")}</div>
                    <div className="mt-1 text-muted-foreground">{[s(site.city), site.p80Min != null ? `P80 ${site.p80Min} דק׳` : ""].filter(Boolean).join(" · ")}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === "inquiries" && (
          <Card title={`בירורים (${allInquiries.length || openInquiries.length})`} icon={<MessageCircleWarning className="h-5 w-5 text-red-500" />}>
            {(allInquiries.length || openInquiries.length) === 0 ? (
              <p className="text-sm text-muted-foreground">אין בירורים</p>
            ) : (
              <ul className="space-y-2">
                {(allInquiries.length ? allInquiries : openInquiries).map((inq, i) => (
                  <li key={i} className="rounded-2xl border p-3 text-xs">
                    <div className="font-bold">{s(inq.subject || inq.title || "בירור")}</div>
                    <div className="mt-1 text-muted-foreground">{s(inq.status)} · {fmtShort(inq.createdIso || inq.date)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === "documents" && (
          <Card title={`מסמכים (${documents.length})`} icon={<FolderOpen className="h-5 w-5 text-primary" />}>
            <CustomerDocumentUpload customerNo={id} customerName={name} />
            {documents.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">אין מסמכים שמורים</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {documents.map((doc, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded-xl border p-3 text-xs">
                    <span className="font-semibold">{s(doc.name || doc.fileName || "מסמך")}</span>
                    {s(doc.url) && (
                      <a href={s(doc.url)} target="_blank" rel="noreferrer" className="text-primary font-bold">
                        פתיחה
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === "history" && (
          <Card title={`ביקורים ואתרים (${visits.length || visitHistory.length})`} icon={<Layers className="h-5 w-5 text-primary" />}>
            {(visits.length || visitHistory.length) === 0 ? (
              <p className="text-sm text-muted-foreground">אין היסטוריית ביקורים</p>
            ) : (
              <ul className="space-y-2">
                {(visitHistory.length ? visitHistory : visits).slice(0, 40).map((v, i) => (
                  <li key={i} className="rounded-2xl border p-3 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="font-bold">{fmtShort(v.date || v.dateIso)}</span>
                      <span className="text-muted-foreground">{s(v.unloadMinutes) ? `${v.unloadMinutes} דק׳ פריקה` : ""}</span>
                    </div>
                    <div className="mt-1 text-muted-foreground">{s(v.address)}</div>
                  </li>
                ))}
              </ul>
            )}
            {unloadBySite.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-bold">ממוצע פריקה לפי אתר</h3>
                <ul className="space-y-1">
                  {unloadBySite.map((site) => (
                    <li key={site.address} className="flex justify-between text-xs">
                      <span>{site.address}</span>
                      <span className="tabular-nums font-bold">{site.average} דק׳ ({site.samples})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

function Card({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="font-display text-base font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Kpi({
  label,
  value,
  icon,
  small,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  small?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/60 p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn("mt-1 font-bold tabular-nums", small ? "text-sm" : "text-lg")}>{value}</div>
    </div>
  );
}

function CustomerDocumentUpload({ customerNo, customerName }: { customerNo: string; customerName: string }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<CustomerDocumentType>("delivery_note");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const buf = await file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buf));
      const result = await uploadCustomerDocumentFn({
        data: {
          customerNo,
          customerName,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          bytes,
          docType,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["customer-bundle", customerNo] });
      setMessage(`נשמר בתיקיית הלקוח · ${result.folderName || customerName}`);
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : "העלאת המסמך נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="סוג המסמך להעלאה"
          value={docType}
          onChange={(event) => setDocType(event.target.value as CustomerDocumentType)}
          disabled={busy}
          className="min-h-10 max-w-36 rounded-xl border border-border bg-background px-2 text-xs"
        >
          <option value="delivery_note">תעודת משלוח</option>
          <option value="order">הזמנה</option>
          <option value="other">מסמך אחר</option>
        </select>
        <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void onPick(e)} />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          העלאת מסמך
        </button>
      </div>
      {message ? (
        <p className={cn("text-[11px] font-semibold", error ? "text-destructive" : "text-emerald-700")}>
          {error ? <AlertCircle className="mr-1 inline h-3.5 w-3.5" /> : null}
          {message}
        </p>
      ) : null}
    </div>
  );
}
