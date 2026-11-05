/**
 * /notebook — חדר ניתוח מוסתר מאחורי כפתור Notebook
 * תרשימים דינמיים לפי טאב/סטטוס + פקודת מצגת/וידאו ל-NotebookLM
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
  BookOpen,
  Check,
  ClipboardCopy,
  Filter,
  Layers,
  Presentation,
  RefreshCw,
  ScanSearch,
  Video,
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { getSiteAtlasFn, listCustomerIndexFn } from "@/lib/customer-history.functions";
import { listNotesFn, listPtoFn } from "@/lib/notes-api.functions";
import { pairPtoEvents } from "@/lib/smart-dispatch/pto-pairing";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notebook")({
  head: () => ({ meta: [{ title: "Notebook · סריקת רנטגן — ח. סבן" }] }),
  component: NotebookPage,
});

const TABS = [
  { id: "customers", label: "לקוחות" },
  { id: "notes", label: "תעודות" },
  { id: "sites", label: "אתרים" },
  { id: "pto", label: "מנוף PTO" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const CHART_COLORS = ["#0f766e", "#0369a1", "#b45309", "#7c3aed", "#be123c", "#15803d", "#1d4ed8", "#a16207"];

function NotebookPage() {
  const [tab, setTab] = useState<TabId>("customers");
  const [statusFilter, setStatusFilter] = useState<string>("הכל");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<"slides" | "video" | null>(null);

  const atlasQ = useQuery({ queryKey: ["nb-atlas"], queryFn: () => getSiteAtlasFn(), staleTime: 60_000 });
  const custQ = useQuery({ queryKey: ["nb-customers"], queryFn: () => listCustomerIndexFn(), staleTime: 60_000 });
  const notesQ = useQuery({
    queryKey: ["nb-notes"],
    queryFn: () => listNotesFn({ data: {} as never }),
    staleTime: 60_000,
  });
  const ptoQ = useQuery({
    queryKey: ["nb-pto"],
    queryFn: () =>
      listPtoFn({
        data: { since: new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString() },
      }),
    staleTime: 60_000,
  });

  const loading = atlasQ.isLoading || custQ.isLoading || notesQ.isLoading || ptoQ.isLoading;
  const refetchAll = () => {
    void atlasQ.refetch();
    void custQ.refetch();
    void notesQ.refetch();
    void ptoQ.refetch();
  };

  const notes = useMemo(() => {
    const raw = notesQ.data as { notes?: Array<Record<string, unknown>> } | undefined;
    return Array.isArray(raw?.notes) ? raw!.notes! : Array.isArray(notesQ.data) ? (notesQ.data as Array<Record<string, unknown>>) : [];
  }, [notesQ.data]);

  const ptoSessions = useMemo(() => {
    const raw = ptoQ.data as { events?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>> } | undefined;
    const rows = (raw?.events || raw?.data || []) as Array<Record<string, unknown>>;
    const mapped = rows.map((r) => ({
      truck: String(r.truck || r["משאית"] || ""),
      driver: String(r.driver || r["נהג"] || ""),
      eventType: String(r.eventType || r.type || ""),
      eventTimeIso: String(r.eventTimeIso || r.time || r.eventTime || ""),
      address: String(r.address || r["כתובת"] || ""),
    }));
    return pairPtoEvents(mapped);
  }, [ptoQ.data]);

  const customers = custQ.data?.customers || [];
  const sites = atlasQ.data?.sites || [];

  const statusOptions = useMemo(() => {
    if (tab === "customers") {
      return ["הכל", "פעיל 30 יום", "עם בירורים", "ללא ביקורים"];
    }
    if (tab === "notes") {
      const set = new Set<string>();
      notes.forEach((n) => {
        const st = String(n.approval || n.status || n["סטטוס אישור"] || "ללא סטטוס");
        if (st) set.add(st);
      });
      return ["הכל", ...Array.from(set).slice(0, 12)];
    }
    if (tab === "sites") {
      return ["הכל", "עם PTO", "עם קואורדינטות", "ללא לקוח"];
    }
    return ["הכל", "מזוגים", "יתומים", "מעל 30 דק׳"];
  }, [tab, notes]);

  const chartRows = useMemo(() => {
    if (tab === "customers") {
      let list = [...customers];
      if (statusFilter === "עם בירורים") list = list.filter((c) => (c.openInquiries || 0) > 0);
      if (statusFilter === "ללא ביקורים") list = list.filter((c) => (c.visitsCount || 0) === 0);
      if (statusFilter === "פעיל 30 יום") {
        const cut = Date.now() - 30 * 24 * 3600 * 1000;
        list = list.filter((c) => c.lastIso && new Date(c.lastIso).getTime() >= cut);
      }
      return list
        .slice(0, 15)
        .map((c) => ({
          key: c.customerNo,
          name: c.name?.slice(0, 18) || c.customerNo,
          value: c.notesCount || 0,
          secondary: c.visitsCount || 0,
        }));
    }
    if (tab === "notes") {
      const byStatus = new Map<string, number>();
      notes.forEach((n) => {
        const st = String(n.approval || n.status || n["סטטוס אישור"] || "ללא סטטוס");
        if (statusFilter !== "הכל" && st !== statusFilter) return;
        byStatus.set(st, (byStatus.get(st) || 0) + 1);
      });
      return Array.from(byStatus.entries()).map(([name, value]) => ({ key: name, name, value, secondary: 0 }));
    }
    if (tab === "sites") {
      let list = [...sites];
      if (statusFilter === "עם PTO") list = list.filter((s) => (s.ptoOpens || 0) > 0);
      if (statusFilter === "עם קואורדינטות") list = list.filter((s) => s.latitude != null);
      if (statusFilter === "ללא לקוח") list = list.filter((s) => !s.customerNo);
      return list
        .slice(0, 15)
        .map((s) => ({
          key: s.siteKey || s.address,
          name: (s.address || "").slice(0, 22),
          value: s.visits || 0,
          secondary: s.ptoOpens || 0,
        }));
    }
    let list = [...ptoSessions];
    if (statusFilter === "מזוגים") list = list.filter((s) => !s.orphan && s.durationMin != null);
    if (statusFilter === "יתומים") list = list.filter((s) => !!s.orphan);
    if (statusFilter === "מעל 30 דק׳") list = list.filter((s) => (s.durationMin || 0) > 30);
    const byDay = new Map<string, number>();
    list.forEach((s) => {
      const d = s.date || "—";
      byDay.set(d, (byDay.get(d) || 0) + 1);
    });
    return Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-20)
      .map(([name, value]) => ({ key: name, name, value, secondary: 0 }));
  }, [tab, statusFilter, customers, notes, sites, ptoSessions]);

  const visibleRows = useMemo(() => {
    if (selectedKeys.size === 0) return chartRows;
    return chartRows.filter((r) => selectedKeys.has(r.key));
  }, [chartRows, selectedKeys]);

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const kpis = useMemo(
    () => [
      { label: "לקוחות", value: customers.length },
      { label: "תעודות", value: notes.length },
      { label: "אתרים", value: sites.length },
      { label: "סשני PTO", value: ptoSessions.length },
      { label: "PTO מזוגים", value: ptoSessions.filter((s) => !s.orphan).length },
      {
        label: "פתיחות מנוף",
        value: sites.reduce((n, s) => n + (s.ptoOpens || 0), 0),
      },
    ],
    [customers, notes, sites, ptoSessions],
  );

  const slidesCmd = useMemo(() => {
    const topCust = customers
      .slice(0, 8)
      .map((c) => `- ${c.name} (#${c.customerNo}): ${c.notesCount} תעודות, ${c.visitsCount} ביקורים`)
      .join("\n");
    const topSites = sites
      .filter((s) => (s.ptoOpens || 0) > 0)
      .slice(0, 6)
      .map((s) => `- ${s.address}: ${s.ptoOpens} פתיחות מנוף, ${s.visits} ביקורים`)
      .join("\n");
    const ptoOk = ptoSessions.filter((s) => !s.orphan).length;
    return `על בסיס דוח הרנטגן התפעולי של ח. סבן בלבד (אל תמציא מספרים):\n\nצור מצגת מכווצת בעברית, 8–10 שקפים, סגנון מקצועי RTL.\n\nשקפים חובה:\n1. שער — דוח מצב תפעולי\n2. KPI — לקוחות ${customers.length} · תעודות ${notes.length} · אתרים ${sites.length} · PTO ${ptoSessions.length} (מזוגים ${ptoOk})\n3. לקוחות מובילים\n${topCust || "- אין נתונים"}\n4. אתרים ופתיחות מנוף\n${topSites || "- אין נתוני PTO באתרים"}\n5. מלאי / תנועת מוצרים (אם יש במקור; אחרת ציין חסר)\n6. חיזוי רכישה 30–60 יום לפי תדירות ביקורים\n7. סיכונים (יתומי PTO, לקוחות ללא ביקורים, בירורים פתוחים)\n8. המלצות לשבוע הקרוב\n\nלכל שקף: כותרת, 3–5 נקודות, הערת דובר 20–30 שנ'.\nבסוף: רשימת prompts לתמונות רקע 16:9 (בלי טקסט בתמונה).`;
  }, [customers, notes, sites, ptoSessions]);

  const videoCmd = useMemo(() => {
    return `צור מצגת וידאו (Video Report) על בסיס דוח הרנטגן התפעולי של ח. סבן בלבד.\nמשך: 60–90 שניות. סגנון «סריקת רנטגן מקצועית».\n\nתחילה בנה מתווה מצגת מכווצת (8 שקפים), ואז המר לווידאו לפי המבנה הבא:\n\nמבנה:\n0–10 שנ'  כותרת + 3 KPI גדולים\n10–35 שנ' לקוחות ואתרים (מספרים על המסך)\n35–55 שנ' מנוף PTO + חריגות\n55–75 שנ' חיזוי רכישה / המלצות\n75–90 שנ' סגירה + CTA תפעולי\n\nסגנון ויזואלי:\n- רקע כהה, הדגשות טורקיז/כחול\n- מספרים גדולים, מעט טקסט\n- מעברים חדים, ללא אנימציות ארוכות\n- קריינות עברית עסקית, קצב בינוני\n\nפלט:\n1) תסריט קריינות מלא\n2) רשימת כותרות על המסך לפי שניות\n3) 5 prompts לתמונות/ביניים`;
  }, []);

  const copy = async (kind: "slides" | "video") => {
    const text = kind === "slides" ? slidesCmd : videoCmd;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <PageHeader
        title="Notebook"
        subtitle="סריקת רנטגן · תרשימים לפי טאב · פקודת מצגת/וידאו"
        action={
          <button
            type="button"
            onClick={refetchAll}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            סריקה מחדש
          </button>
        }
      />

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8" dir="rtl">
        <section className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-5 text-slate-100 shadow-card md:p-6">
          <div className="pointer-events-none absolute -left-16 top-0 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                <ScanSearch className="h-4 w-4" />
                סריקת רנטגן תפעולית · מוסתר מאחורי Notebook
              </p>
              <h1 className="mt-1 font-display text-2xl font-extrabold md:text-3xl">חדר ניתוח נועה</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-300">
                סינון לפי טאב וסטטוס, סימון עמודות בתרשים, והפקת פקודה מוכנה למצגת מכווצת או לווידאו ב־NotebookLM /
                Gemini.
              </p>
            </div>
            <BookOpen className="h-10 w-10 text-cyan-400/80" />
          </div>
          <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                <div className="text-[11px] font-semibold text-slate-400">{k.label}</div>
                <div className="mt-0.5 text-xl font-extrabold tabular-nums text-cyan-100">{k.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-4 shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-bold text-muted-foreground">טאב</span>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  setStatusFilter("הכל");
                  setSelectedKeys(new Set());
                }}
                className={cn(
                  "min-h-9 rounded-xl border px-3 text-xs font-bold transition",
                  tab === t.id ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-bold text-muted-foreground">סטטוס / מצב</span>
            {statusOptions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-xs font-semibold transition",
                  statusFilter === s
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                    : "hover:bg-muted",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)]">
          <section className="rounded-3xl border bg-card p-4 shadow-card">
            <h2 className="font-display text-sm font-bold">תרשים — {TABS.find((t) => t.id === tab)?.label}</h2>
            <p className="text-xs text-muted-foreground">לחץ על פריט ברשימה מימין כדי להציג/להסתיר בעמודה</p>
            <div className="mt-4 h-72 w-full">
              {visibleRows.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">אין נתונים לסינון הנוכחי</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={visibleRows} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, fontSize: 12 }}
                      formatter={(v: number, name: string) => [v, name === "value" ? "כמות" : name]}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {visibleRows.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            {tab === "notes" && visibleRows.length > 0 && (
              <div className="mt-4 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={visibleRows} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                      {visibleRows.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <aside className="rounded-3xl border bg-card p-4 shadow-card">
            <h2 className="font-display text-sm font-bold">סימון לבחירה</h2>
            <p className="mb-2 text-xs text-muted-foreground">ריק = הכל מוצג</p>
            <div className="max-h-80 space-y-1.5 overflow-y-auto">
              {chartRows.map((r) => {
                const on = selectedKeys.size === 0 || selectedKeys.has(r.key);
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => toggleKey(r.key)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-start text-xs transition",
                      on ? "border-primary/40 bg-primary/5 font-bold" : "opacity-50 hover:opacity-80",
                    )}
                  >
                    <span className="truncate">{r.name}</span>
                    <span className="tabular-nums text-muted-foreground">{r.value}</span>
                  </button>
                );
              })}
              {chartRows.length === 0 && <p className="text-xs text-muted-foreground">אין שורות</p>}
            </div>
            {selectedKeys.size > 0 && (
              <button
                type="button"
                className="mt-3 w-full rounded-xl border py-2 text-xs font-bold hover:bg-muted"
                onClick={() => setSelectedKeys(new Set())}
              >
                נקה בחירה
              </button>
            )}
          </aside>
        </div>

        <section className="rounded-3xl border border-cyan-500/20 bg-gradient-to-l from-cyan-500/10 via-card to-violet-500/10 p-4 shadow-card md:p-5">
          <h2 className="font-display text-sm font-bold">יצירה ל־NotebookLM / Gemini</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            הכפתורים מעתיקים פקודה מוכנה עם מספרי KPI מהסריקה. הדבק ב־NotebookLM או ב־Gemini אחרי העלאת הדוח כמקור.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void copy("slides")}
              className={cn(
                "flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 px-4 text-sm font-extrabold transition active:scale-[0.98]",
                copied === "slides"
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                  : "border-primary/40 bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {copied === "slides" ? <Check className="h-5 w-5" /> : <Presentation className="h-5 w-5" />}
              {copied === "slides" ? "פקודת מצגת הועתקה" : "יצירת מצגת"}
            </button>
            <button
              type="button"
              onClick={() => void copy("video")}
              className={cn(
                "flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 px-4 text-sm font-extrabold transition active:scale-[0.98]",
                copied === "video"
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                  : "border-violet-500/50 bg-violet-600 text-white hover:bg-violet-600/90",
              )}
            >
              {copied === "video" ? <Check className="h-5 w-5" /> : <Video className="h-5 w-5" />}
              {copied === "video" ? "פקודת וידאו הועתקה" : "יצירת מצגת וידאו"}
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border bg-card p-4 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-sm font-bold">
                <Presentation className="h-4 w-4 text-primary" />
                תצוגת פקודת מצגת
              </h2>
              <button
                type="button"
                onClick={() => void copy("slides")}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold hover:bg-muted"
              >
                {copied === "slides" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                {copied === "slides" ? "הועתק" : "העתק"}
              </button>
            </div>
            <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl bg-muted/50 p-3 text-[11px] leading-relaxed">
              {slidesCmd}
            </pre>
          </div>
          <div className="rounded-3xl border bg-card p-4 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-sm font-bold">
                <Video className="h-4 w-4 text-violet-600" />
                תצוגת פקודת מצגת וידאו
              </h2>
              <button
                type="button"
                onClick={() => void copy("video")}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold hover:bg-muted"
              >
                {copied === "video" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                {copied === "video" ? "הועתק" : "העתק"}
              </button>
            </div>
            <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl bg-muted/50 p-3 text-[11px] leading-relaxed">
              {videoCmd}
            </pre>
          </div>
        </section>

        <p className="text-center text-xs text-muted-foreground">
          חזרה ל־
          <Link to="/chat" className="mx-1 font-bold text-primary hover:underline">
            צ׳אט נועה
          </Link>
          · הדבק את הפקודה ב־NotebookLM אחרי העלאת הדוח כמקור
        </p>
      </main>
    </>
  );
}
