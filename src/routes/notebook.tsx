/**
 * /notebook — חדר רנטגן תפעולי וניתוח AI מהיר
 * ח. סבן חומרי בניין (1994) בע"מ — סניף התלמיד 6 הוד השרון
 * כולל: סריקת KPI, סינון לפי טאבים, ניתוח AI חי לכל לקוח/תעודה/אתר/PTO,
 * והפקת פקודות דינמיות למצגת ב-NotebookLM ולווידאו דוח מצב ב-Gemini.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Filter,
  Layers,
  MapPin,
  Package,
  Phone,
  Presentation,
  RefreshCw,
  ScanSearch,
  Search,
  Sparkles,
  TrendingUp,
  Truck,
  User,
  Users,
  Video,
  X,
  ClipboardCopy,
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { getSiteAtlasFn, listCustomerIndexFn } from "@/lib/customer-history.functions";
import { listNotesFn, listPtoFn } from "@/lib/notes-api.functions";
import { pairPtoEvents, type PairedPtoSession } from "@/lib/smart-dispatch/pto-pairing";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notebook")({
  head: () => ({ meta: [{ title: "חדר רנטגן תפעולי ו-Notebook · ח. סבן" }] }),
  component: NotebookPage,
});

const TABS = [
  { id: "customers", label: "לקוחות מאוחדים", icon: Users },
  { id: "notes", label: "תעודות משלוח", icon: FileText },
  { id: "sites", label: "אתרי אספקה", icon: MapPin },
  { id: "pto", label: "מנוף איתוראן PTO", icon: Truck },
] as const;

type TabId = (typeof TABS)[number]["id"];

const CHART_COLORS = [
  "#06b6d4",
  "#10b981",
  "#8b5cf6",
  "#f59e0b",
  "#3b82f6",
  "#ec4899",
  "#14b8a6",
  "#6366f1",
];

interface SelectedEntity {
  type: "customer" | "note" | "site" | "pto";
  id: string;
  title: string;
  data: any;
}

export function NotebookPage() {
  const [tab, setTab] = useState<TabId>("customers");
  const [statusFilter, setStatusFilter] = useState<string>("הכל");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [copied, setCopied] = useState<"slides" | "video" | null>(null);

  const atlasQ = useQuery({ queryKey: ["nb-atlas"], queryFn: () => getSiteAtlasFn(), staleTime: 60_000 });
  const custQ = useQuery({ queryKey: ["nb-customers"], queryFn: () => listCustomerIndexFn(), staleTime: 60_000 });
  const notesQ = useQuery({ queryKey: ["nb-notes"], queryFn: () => listNotesFn(), staleTime: 60_000 });
  const ptoQ = useQuery({ queryKey: ["nb-pto"], queryFn: () => listPtoFn(), staleTime: 60_000 });

  const isLoading = atlasQ.isLoading || custQ.isLoading || notesQ.isLoading || ptoQ.isLoading;

  const customers = custQ.data ?? [];
  const notes = notesQ.data ?? [];
  const sites = atlasQ.data?.sites ?? [];
  const ptoRaw = ptoQ.data ?? [];
  const ptoSessions = useMemo(() => pairPtoEvents(ptoRaw as any), [ptoRaw]);

  const filteredCustomers = useMemo(() => {
    let list = customers as any[];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          String(c.name || "").toLowerCase().includes(q) ||
          String(c.id || "").toLowerCase().includes(q) ||
          String(c.phone || "").toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "הכל") {
      list = list.filter((c) => String(c.status || "") === statusFilter);
    }
    return list;
  }, [customers, searchQuery, statusFilter]);

  const filteredNotes = useMemo(() => {
    let list = notes as any[];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (n) =>
          String(n.id || "").toLowerCase().includes(q) ||
          String(n.customerName || "").toLowerCase().includes(q) ||
          String(n.customerId || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [notes, searchQuery]);

  const filteredSites = useMemo(() => {
    let list = sites as any[];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          String(s.name || "").toLowerCase().includes(q) ||
          String(s.address || "").toLowerCase().includes(q) ||
          String(s.customerName || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [sites, searchQuery]);

  const filteredPto = useMemo(() => {
    let list = ptoSessions as PairedPtoSession[];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          String(p.vehicle || "").toLowerCase().includes(q) ||
          String(p.driver || "").toLowerCase().includes(q) ||
          String(p.siteHint || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [ptoSessions, searchQuery]);

  const kpis = useMemo(() => {
    return [
      { label: "לקוחות", value: customers.length, icon: Users, color: "#1769AA" },
      { label: "תעודות", value: notes.length, icon: FileText, color: "#0d9488" },
      { label: "אתרים", value: sites.length, icon: MapPin, color: "#7c3aed" },
      { label: "PTO מנוף", value: ptoSessions.length, icon: Truck, color: "#d97706" },
    ];
  }, [customers, notes, sites, ptoSessions]);

  function buildSlidesPrompt(entity: SelectedEntity | null): string {
    if (!entity) {
      return `הכן מצגת סטטוס תפעולי לח. סבן חומרי בניין — חדר רנטגן.\nכולל: מספר לקוחות, תעודות פתוחות, אתרי אספקה פעילים, וסיכום מנוף איתוראן.\nקהל: הנהלה ונציגי דלפק. שפה עברית, RTL, מקצועי וקצר.`;
    }
    return `הכן מצגת הדרכה/סטטוס על: ${entity.title} (${entity.type}).\nנתונים:\n${JSON.stringify(entity.data, null, 2).slice(0, 4000)}\nשפה עברית, RTL, מוכן ל-NotebookLM.`;
  }

  function buildVideoPrompt(entity: SelectedEntity | null): string {
    if (!entity) {
      return `כתוב תסריט וידאו דוח מצב יומי לח. סבן — 60–90 שניות.\nקריינות עברית מקצועית, מבנה: פתיחה, מספרים, נקודת תשומת לב, סגירה.`;
    }
    return `כתוב תסריט וידאו קצר על ${entity.title}.\nנתונים:\n${JSON.stringify(entity.data, null, 2).slice(0, 3000)}\nקריינות עברית, כתוביות, מבנה ברור.`;
  }

  async function copyPrompt(kind: "slides" | "video") {
    const text = kind === "slides" ? buildSlidesPrompt(selectedEntity) : buildVideoPrompt(selectedEntity);
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <>
      <PageHeader
        title="חדר רנטגן תפעולי"
        subtitle="ניתוח AI · לקוחות · תעודות · אתרים · מנוף · הפקה ל-NotebookLM"
        action={
          <Link
            to="/technical-advisor"
            className="rounded-xl border border-[#1769AA]/30 bg-white px-3 py-2 text-xs font-bold text-[#1769AA]"
          >
            יועץ טכני
          </Link>
        }
      />

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 md:px-6">
        {/* KPIs */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="rounded-2xl border border-[#102A43]/10 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#5A6A7A]">{k.label}</span>
                <k.icon className="h-4 w-4" style={{ color: k.color }} />
              </div>
              <div className="mt-2 text-2xl font-extrabold text-[#102A43]">
                {isLoading ? "…" : k.value.toLocaleString("he-IL")}
              </div>
            </div>
          ))}
        </section>

        {/* Tabs + search */}
        <section className="rounded-2xl border border-[#102A43]/10 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition",
                    active
                      ? "bg-[#1769AA] text-white"
                      : "bg-[#F3F7FB] text-[#102A43] hover:bg-[#E8F1F8]",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
            <div className="ms-auto flex items-center gap-2">
              <div className="relative">
                <Search className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5A6A7A]" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="חיפוש…"
                  className="w-40 rounded-xl border border-[#DCE6EF] bg-white py-2 pe-3 ps-8 text-xs font-medium md:w-56"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          {/* List panel */}
          <section className="rounded-2xl border border-[#102A43]/10 bg-white shadow-sm">
            <div className="border-b border-[#DCE6EF] px-4 py-3 text-sm font-extrabold text-[#102A43]">
              {TABS.find((t) => t.id === tab)?.label}
              <span className="ms-2 text-xs font-semibold text-[#5A6A7A]">
                (
                {tab === "customers"
                  ? filteredCustomers.length
                  : tab === "notes"
                    ? filteredNotes.length
                    : tab === "sites"
                      ? filteredSites.length
                      : filteredPto.length}
                )
              </span>
            </div>
            <div className="max-h-[520px] overflow-y-auto divide-y divide-[#F0F4F8]">
              {isLoading && (
                <div className="p-6 text-center text-sm text-[#5A6A7A]">טוען נתונים…</div>
              )}
              {!isLoading && tab === "customers" &&
                filteredCustomers.map((c: any) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setSelectedEntity({
                        type: "customer",
                        id: String(c.id),
                        title: c.name || c.id,
                        data: c,
                      })
                    }
                    className="flex w-full items-center gap-3 px-4 py-3 text-right hover:bg-[#F8FBFE]"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E8F1F8] text-[#1769AA]">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-[#102A43]">{c.name || c.id}</div>
                      <div className="truncate text-xs text-[#5A6A7A]">
                        {c.phone || "—"} · {c.id}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#A0AEC0]" />
                  </button>
                ))}
              {!isLoading && tab === "notes" &&
                filteredNotes.map((n: any) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() =>
                      setSelectedEntity({
                        type: "note",
                        id: String(n.id),
                        title: `תעודה ${n.id}`,
                        data: n,
                      })
                    }
                    className="flex w-full items-center gap-3 px-4 py-3 text-right hover:bg-[#F8FBFE]"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ECFDF5] text-[#059669]">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-[#102A43]">תעודה {n.id}</div>
                      <div className="truncate text-xs text-[#5A6A7A]">
                        {n.customerName || n.customerId || "—"}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#A0AEC0]" />
                  </button>
                ))}
              {!isLoading && tab === "sites" &&
                filteredSites.map((s: any, idx: number) => (
                  <button
                    key={s.id || idx}
                    type="button"
                    onClick={() =>
                      setSelectedEntity({
                        type: "site",
                        id: String(s.id || idx),
                        title: s.name || s.address || "אתר",
                        data: s,
                      })
                    }
                    className="flex w-full items-center gap-3 px-4 py-3 text-right hover:bg-[#F8FBFE]"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F3E8FF] text-[#7c3aed]">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-[#102A43]">
                        {s.name || s.address || "אתר"}
                      </div>
                      <div className="truncate text-xs text-[#5A6A7A]">
                        {s.customerName || s.address || "—"}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#A0AEC0]" />
                  </button>
                ))}
              {!isLoading && tab === "pto" &&
                filteredPto.map((p, idx) => (
                  <button
                    key={p.id || idx}
                    type="button"
                    onClick={() =>
                      setSelectedEntity({
                        type: "pto",
                        id: String(p.id || idx),
                        title: p.vehicle || "מנוף",
                        data: p,
                      })
                    }
                    className="flex w-full items-center gap-3 px-4 py-3 text-right hover:bg-[#F8FBFE]"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFFBEB] text-[#d97706]">
                      <Truck className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-[#102A43]">
                        {p.vehicle || "מנוף"} · {p.driver || "—"}
                      </div>
                      <div className="truncate text-xs text-[#5A6A7A]">
                        {p.siteHint || "—"}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#A0AEC0]" />
                  </button>
                ))}
              {!isLoading &&
                ((tab === "customers" && filteredCustomers.length === 0) ||
                  (tab === "notes" && filteredNotes.length === 0) ||
                  (tab === "sites" && filteredSites.length === 0) ||
                  (tab === "pto" && filteredPto.length === 0)) && (
                  <div className="p-8 text-center text-sm text-[#5A6A7A]">אין תוצאות</div>
                )}
            </div>
          </section>

          {/* Detail + AI prompts */}
          <aside className="space-y-3">
            <div className="rounded-2xl border border-[#102A43]/10 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-[#102A43]">
                <Sparkles className="h-4 w-4 text-[#1769AA]" />
                הפקה ל-Notebook / וידאו
              </div>
              {selectedEntity ? (
                <div className="mb-3 rounded-xl bg-[#F3F7FB] p-3 text-xs">
                  <div className="font-bold text-[#102A43]">{selectedEntity.title}</div>
                  <div className="text-[#5A6A7A]">{selectedEntity.type} · {selectedEntity.id}</div>
                </div>
              ) : (
                <p className="mb-3 text-xs text-[#5A6A7A]">
                  בחר לקוח / תעודה / אתר / PTO או הפק דוח כללי.
                </p>
              )}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => copyPrompt("slides")}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1769AA] px-3 py-2.5 text-xs font-bold text-white"
                >
                  {copied === "slides" ? <Check className="h-3.5 w-3.5" /> : <Presentation className="h-3.5 w-3.5" />}
                  {copied === "slides" ? "הועתק!" : "העתק פקודת מצגת"}
                </button>
                <button
                  type="button"
                  onClick={() => copyPrompt("video")}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#1769AA]/30 bg-white px-3 py-2.5 text-xs font-bold text-[#1769AA]"
                >
                  {copied === "video" ? <Check className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
                  {copied === "video" ? "הועתק!" : "העתק תסריט וידאו"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-[#102A43]/10 bg-white p-4 shadow-sm">
              <div className="mb-2 text-sm font-extrabold text-[#102A43]">קישורים מהירים</div>
              <div className="flex flex-col gap-1.5 text-xs font-bold">
                <Link to="/logistics-dict" className="text-[#1769AA] hover:underline">
                  מילון לוגיסטי
                </Link>
                <Link to="/technical-advisor" className="text-[#1769AA] hover:underline">
                  יועץ טכני (הדרכות דלפק)
                </Link>
                <Link to="/notes" className="text-[#1769AA] hover:underline">
                  תעודות משלוח
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
