/**
 * /customers — רשימת לקוחות חיה, מצטברת מכל טאבי הגיליון (תעודות, הזמנות, ביקורים, בירורים)
 */
import * as React from "react";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { listCustomerIndexFn, type CustomerSummary } from "@/lib/customer-history.functions";
import { fmtShort, relativeFromIso } from "@/lib/he-date";
import {
  Users,
  Search,
  Phone,
  MessageSquare,
  Navigation,
  FolderOpen,
  ChevronLeft,
  Truck,
  AlertCircle,
  Loader2,
  RefreshCw,
  FileText,
  Package,
  Timer,
  MapPin,
  MessageCircleWarning,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: "תיקי לקוחות — ח. סבן לוגיסטיקה" },
      { name: "description", content: "היסטוריית לקוחות מכל טאבי הגיליון · מספר לקוח כמפתח" },
    ],
  }),
  component: CustomersLayout,
});

function CustomersLayout() {
  const { pathname } = useLocation();
  const isList = pathname === "/customers" || pathname === "/customers/";
  return isList ? <CustomersList /> : <Outlet />;
}

type Sort = "recent" | "notes" | "name" | "site";
type Chip = "all" | "returning" | "inquiry" | "measured";

const SORTS: { key: Sort; label: string }[] = [
  { key: "recent", label: "אספקה אחרונה" },
  { key: "notes", label: "הכי הרבה תעודות" },
  { key: "site", label: "זמן פריקה ארוך" },
  { key: "name", label: "שם (א׳-ת׳)" },
];

const CHIPS: { key: Chip; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "returning", label: "לקוחות חוזרים" },
  { key: "inquiry", label: "בירור פתוח" },
  { key: "measured", label: "עם מדידת פריקה" },
];

function CustomersList() {
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<Sort>("recent");
  const [chip, setChip] = React.useState<Chip>("all");

  const q = useQuery({
    queryKey: ["customer-index"],
    queryFn: () => listCustomerIndexFn(),
    staleTime: 60_000,
  });

  const customers: CustomerSummary[] = Array.isArray(q.data)
    ? q.data
    : Array.isArray(q.data?.customers)
      ? q.data.customers
      : [];
  const sourceLabel =
    (!Array.isArray(q.data) && q.data?.source) || "גיליון SABAN";

  const totals = React.useMemo(() => {
    const mins = customers.map((c) => c.avgSiteMin).filter((m): m is number => m != null);
    return {
      notes: customers.reduce((a, c) => a + c.notesCount, 0),
      orders: customers.reduce((a, c) => a + c.ordersCount, 0),
      inquiries: customers.reduce((a, c) => a + c.openInquiries, 0),
      avgSite: mins.length ? Math.round(mins.reduce((a, m) => a + m, 0) / mins.length) : null,
    };
  }, [customers]);

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = customers.filter((c) => {
      if (chip === "returning" && c.notesCount + c.ordersCount < 2) return false;
      if (chip === "inquiry" && c.openInquiries === 0) return false;
      if (chip === "measured" && c.avgSiteMin == null) return false;
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        c.customerNo.includes(term) ||
        c.address.toLowerCase().includes(term) ||
        c.phone.includes(term) ||
        c.contactName.toLowerCase().includes(term)
      );
    });
    list = [...list].sort((a, b) => {
      if (sort === "notes") return b.notesCount - a.notesCount;
      if (sort === "site") return (b.avgSiteMin ?? -1) - (a.avgSiteMin ?? -1);
      if (sort === "name") return a.name.localeCompare(b.name, "he");
      return b.lastIso.localeCompare(a.lastIso);
    });
    return list;
  }, [customers, search, sort, chip]);

  return (
    <>
      <PageHeader
        title="תיקי לקוחות"
        subtitle={q.isLoading ? "נטען מהגיליון" : q.isError ? "שגיאה בטעינה" : `${sourceLabel} · ${customers.length} לקוחות`}
        action={
          <button
            type="button"
            onClick={() => void q.refetch()}
            disabled={q.isFetching}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition hover:bg-muted active:scale-95"
          >
            <RefreshCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} />
            רענון
          </button>
        }
      />

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8" dir="rtl">
        <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-primary/15 via-card to-emerald-500/10 p-6 shadow-card">
          <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative">
            <h1 className="font-display text-2xl font-extrabold md:text-3xl">היסטוריית לקוחות</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              כל תעודה, הזמנה, ביקור איתוראן ובירור — מקובצים לפי מספר לקוח
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
              <Kpi icon={Users} label="לקוחות" value={q.isLoading ? "…" : String(customers.length)} tone="blue" />
              <Kpi icon={FileText} label="תעודות" value={q.isLoading ? "…" : String(totals.notes)} tone="amber" />
              <Kpi icon={Package} label="הזמנות" value={q.isLoading ? "…" : String(totals.orders)} tone="indigo" />
              <Kpi
                icon={Timer}
                label="ממוצע פריקה באתר"
                value={q.isLoading ? "…" : totals.avgSite != null ? `${totals.avgSite} דק׳` : "—"}
                tone="emerald"
              />
              <Kpi
                icon={MessageCircleWarning}
                label="בירורים פתוחים"
                value={q.isLoading ? "…" : String(totals.inquiries)}
                tone="rose"
              />
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש שם / מספר לקוח / כתובת / טלפון…"
              className="w-full rounded-2xl border border-border/70 bg-card py-2.5 pr-10 pl-4 text-sm shadow-sm outline-none focus:border-primary"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="min-h-11 rounded-2xl border border-border/70 bg-card px-3 text-xs font-bold"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setChip(c.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-bold transition",
                chip === c.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/70 bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {q.isLoading && (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            טוען לקוחות מהגיליון…
          </div>
        )}

        {q.isError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <div className="flex items-center gap-2 font-bold">
              <AlertCircle className="h-4 w-4" />
              שגיאה בטעינת לקוחות
            </div>
            <p className="mt-1">{(q.error as Error).message}</p>
            <button
              type="button"
              onClick={() => void q.refetch()}
              className="mt-3 rounded-xl border px-3 py-1.5 text-xs font-bold"
            >
              נסה שוב
            </button>
          </div>
        )}

        {!q.isLoading && !q.isError && filtered.length === 0 && (
          <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            לא נמצאו לקוחות{search ? ` עבור «${search}»` : ""}.
          </p>
        )}

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CustomerCard key={c.customerNo} c={c} />
          ))}
        </ul>
      </div>
    </>
  );
}

function CustomerCard({ c }: { c: CustomerSummary }) {
  const phoneDigits = (c.phone || "").replace(/[^0-9]/g, "");
  const wa = phoneDigits ? `972${phoneDigits.slice(-9)}` : "";
  return (
    <li className="group relative overflow-hidden rounded-3xl border border-border/70 bg-card p-4 shadow-card transition hover:border-primary/40 hover:shadow-md">
      <Link
        to="/customers/$id"
        params={{ id: c.customerNo }}
        className="absolute inset-0 z-0"
        aria-label={`תיק לקוח ${c.name}`}
      />
      <div className="relative z-10 pointer-events-none">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-[11px] font-bold text-muted-foreground">#{c.customerNo}</div>
            <h3 className="truncate font-display text-base font-bold">{c.name}</h3>
            {c.address && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                {c.address}
              </p>
            )}
          </div>
          <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          <Badge icon={FileText} text={`${c.notesCount} תעודות`} />
          <Badge icon={Package} text={`${c.ordersCount} הזמנות`} />
          {c.avgSiteMin != null && <Badge icon={Timer} text={`${c.avgSiteMin} דק׳`} />}
          {c.openInquiries > 0 && <Badge icon={MessageCircleWarning} text={`${c.openInquiries} בירור`} danger />}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          {c.preferredDriver && (
            <span className="inline-flex items-center gap-1">
              <Truck className="h-3 w-3" />
              {c.preferredDriver}
            </span>
          )}
          {c.lastIso && <span>{relativeFromIso(c.lastIso) || fmtShort(c.lastIso)}</span>}
        </div>
      </div>
      <div className="relative z-10 mt-3 flex flex-wrap gap-2 pointer-events-auto">
        {c.phone && (
          <a
            href={`tel:${c.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-xl bg-muted/80 px-2.5 py-1.5 text-[11px] font-bold hover:bg-muted"
          >
            <Phone className="h-3 w-3" /> חיוג
          </a>
        )}
        {wa && (
          <a
            href={`https://wa.me/${wa}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700"
          >
            <MessageSquare className="h-3 w-3" /> וואטסאפ
          </a>
        )}
        {c.address && (
          <a
            href={`https://waze.com/ul?q=${encodeURIComponent(c.address)}&navigate=yes`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-xl border border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5 text-[11px] font-bold text-blue-700"
          >
            <Navigation className="h-3 w-3" /> Waze
          </a>
        )}
        <Link
          to="/customers/$id"
          params={{ id: c.customerNo }}
          className="inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold hover:bg-muted"
        >
          <FolderOpen className="h-3 w-3" /> תיק
        </Link>
      </div>
    </li>
  );
}

function Badge({
  icon: Icon,
  text,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  danger?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold",
        danger
          ? "border-red-500/30 bg-red-500/10 text-red-700"
          : "border-border/60 bg-muted/40 text-muted-foreground",
      )}
    >
      <Icon className="h-3 w-3" />
      {text}
    </span>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "blue" | "amber" | "indigo" | "emerald" | "rose";
}) {
  const tones: Record<string, string> = {
    blue: "text-blue-600",
    amber: "text-amber-600",
    indigo: "text-indigo-600",
    emerald: "text-emerald-600",
    rose: "text-rose-600",
  };
  return (
    <div className="rounded-2xl border border-border/50 bg-background/70 p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className={cn("h-3.5 w-3.5", tones[tone])} />
        {label}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
