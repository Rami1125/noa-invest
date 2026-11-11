/**
 * /logistics-dict — מילון לוגיסטי מתעודות משלוח
 * ניתוח מק״טים / מלאי תנועה / צפי רכישות + פקודות מצגת ווידאו ל-NotebookLM
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BookOpen,
  Check,
  ClipboardCopy,
  Package,
  Presentation,
  RefreshCw,
  Search,
  Video,
  Warehouse,
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { getCatalogFn, listNotesFn, type SheetNote } from "@/lib/notes-api.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/logistics-dict")({
  head: () => ({ meta: [{ title: "מילון לוגיסטי · מצגת/וידאו — ח. סבן" }] }),
  component: LogisticsDictPage,
});

const COLORS = ["#0f766e", "#0369a1", "#b45309", "#7c3aed", "#be123c", "#15803d", "#1d4ed8", "#a16207"];

type ProductAgg = {
  sku: string;
  name: string;
  qty: number;
  notes: number;
  customers: Set<string>;
  lastDate: string;
};

function LogisticsDictPage() {
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState<"slides" | "video" | null>(null);
  const [selectedSku, setSelectedSku] = useState<Set<string>>(new Set());

  const catalogQ = useQuery({
    queryKey: ["dict-catalog"],
    queryFn: () => getCatalogFn({ data: {} as never }),
    staleTime: 60_000,
  });
  const notesQ = useQuery({
    queryKey: ["dict-notes"],
    queryFn: () => listNotesFn({ data: {} as never }),
    staleTime: 60_000,
  });

  const loading = catalogQ.isLoading || notesQ.isLoading;
  const refetchAll = () => {
    void catalogQ.refetch();
    void notesQ.refetch();
  };

  const notes: SheetNote[] = useMemo(() => {
    const raw = notesQ.data as { notes?: SheetNote[] } | undefined;
    return Array.isArray(raw?.notes) ? raw!.notes! : [];
  }, [notesQ.data]);

  const catalogRows = useMemo(() => {
    const rows = (catalogQ.data?.rows || []) as Record<string, string>[];
    return rows;
  }, [catalogQ.data]);

  const products = useMemo(() => {
    const map = new Map<string, ProductAgg>();
    for (const n of notes) {
      const items = Array.isArray(n.items) ? n.items : [];
      const seenInNote = new Set<string>();
      for (const it of items) {
        const sku = String(it.sku || "").trim();
        const name = String(it.name || "").trim() || sku || "ללא שם";
        if (!sku && !name) continue;
        if (sku.startsWith("60") || name.startsWith("הובלת")) continue;
        const key = sku || name;
        let row = map.get(key);
        if (!row) {
          row = { sku: sku || key, name, qty: 0, notes: 0, customers: new Set(), lastDate: n.date || "" };
          map.set(key, row);
        }
        row.qty += Number(it.qty) || 0;
        if (!seenInNote.has(key)) {
          row.notes += 1;
          seenInNote.add(key);
        }
        if (n.customerNo) row.customers.add(n.customerNo);
        if (n.date && (!row.lastDate || n.date > row.lastDate)) row.lastDate = n.date;
        if (name && name.length > row.name.length) row.name = name;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty || b.notes - a.notes);
  }, [notes]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = products;
    if (term) {
      list = list.filter(
        (p) => p.sku.toLowerCase().includes(term) || p.name.toLowerCase().includes(term),
      );
    }
    if (selectedSku.size > 0) list = list.filter((p) => selectedSku.has(p.sku));
    return list;
  }, [products, q, selectedSku]);

  const chartRows = useMemo(
    () =>
      (selectedSku.size > 0 ? filtered : products)
        .slice(0, 12)
        .map((p) => ({
          key: p.sku,
          name: (p.name || p.sku).slice(0, 18),
          value: Math.round(p.qty * 10) / 10,
          notes: p.notes,
        })),
    [products, filtered, selectedSku],
  );

  const kpis = useMemo(
    () => [
      { label: "פריטים במילון", value: catalogRows.length || products.length },
      { label: "מק״טים בתעודות", value: products.length },
      { label: "תעודות", value: notes.length },
      {
        label: "לקוחות ייחודיים",
        value: new Set(notes.map((n) => n.customerNo).filter(Boolean)).size,
      },
      {
        label: "כמות מצטברת (יח׳)",
        value: Math.round(products.reduce((s, p) => s + p.qty, 0)),
      },
      { label: "Top פריט — תעודות", value: products[0]?.notes || 0 },
    ],
    [catalogRows, products, notes],
  );

  const forecast = useMemo(() => {
    return products
      .filter((p) => p.notes >= 2)
      .slice(0, 10)
      .map((p) => {
        const avgPerNote = p.notes ? p.qty / p.notes : 0;
        return {
          sku: p.sku,
          name: p.name,
          notes: p.notes,
          avgQty: Math.round(avgPerNote * 10) / 10,
          customers: p.customers.size,
          hint: p.notes >= 5 ? "ביקוש גבוה" : p.notes >= 3 ? "ביקוש בינוני" : "מעקב",
        };
      });
  }, [products]);

  const slidesCmd = useMemo(() => {
    const top = products
      .slice(0, 10)
      .map(
        (p, i) =>
          `${i + 1}. ${p.name} (${p.sku}): כמות ${Math.round(p.qty)} · ${p.notes} תעודות · ${p.customers.size} לקוחות`,
      )
      .join("\n");
    const fc = forecast
      .slice(0, 6)
      .map((f) => `- ${f.name}: ממוצע ${f.avgQty} ליחידת תעודה · ${f.hint}`)
      .join("\n");

    return `השתמש רק במקור שהועלה (מילון לוגיסטי + תעודות משלוח). אל תמציא מק״טים, כמויות או שמות.\n\nמשימה: מצגת מכווצת בעברית, RTL, 8–9 שקפים על מילון לוגיסטי, מלאי תנועה וצפי רכישות.\n\nKPI קשיחים (מהמערכת):\n- שורות מילון / פריטים: ${catalogRows.length || products.length}\n- מק״טים ייחודיים בתעודות: ${products.length}\n- תעודות משלוח: ${notes.length}\n- לקוחות ייחודיים: ${new Set(notes.map((n) => n.customerNo).filter(Boolean)).size}\n\nלכל שקף: כותרת עד 8 מילים · 3–5 נקודות עד 12 מילים · הערת דובר 20–30 שנ׳.\n\nשקפים:\n1. שער — מילון לוגיסטי וצפי רכישות · ח. סבן\n2. KPI תפעולי (המספרים למעלה בלבד)\n3. מוצרים מובילים לפי כמות/תעודות\n${top || "- אין נתונים במקור"}\n4. מילון לוגיסטי — מבנה מק״ט / קבוצות (רק אם במקור)\n5. מלאי ותנועה — פריטים חוזרים\n6. צפי רכישות 30–60 יום\n${fc || "- אין מספיק תדירות במקור"}\n7. סיכונים (פריט בודד, ירידה, חוסר במילון)\n8. המלצות לשבוע (שריון מלאי / מעקב לקוחות)\n9. סיכום מנהלים\n\nאם חסר במקור — כתוב "אין נתון במקור". אל תשער.\nבסוף: 6 prompts לתמונות רקע 16:9 (בלי טקסט בתמונה, סגנון מחסן/בטון/עץ נקי).`;
  }, [products, forecast, catalogRows.length, notes]);

  const videoCmd = useMemo(() => {
    const top3 = products
      .slice(0, 3)
      .map((p) => `${p.name}: ${Math.round(p.qty)} יח׳`)
      .join(" · ");
    return `צור מצגת וידאו (Video Report) על בסיס מילון לוגיסטי ותעודות משלוח של ח. סבן בלבד.\nמשך: 70–90 שניות. סגנון «מחסן חכם / רנטגן מלאי».\n\nKPI על המסך (אל תשנה):\nמק״טים ${products.length} · תעודות ${notes.length} · לקוחות ${new Set(notes.map((n) => n.customerNo).filter(Boolean)).size}\n\nמבנה:\n[00–12] כותרת + 3 KPI\n[12–35] מוצרים מובילים — ${top3 || "אין נתון"}\n[35–55] צפי רכישות / פריטים חוזרים\n[55–75] המלצות שריון מלאי\n[75–90] סגירה + CTA תפעולי\n\nפלט:\n1) תסריט קריינות מלא בעברית עסקית\n2) טקסט על המסך לפי שניות\n3) 5 prompts לתמונות ביניים 16:9 (בלי טקסט)\n\nאל תמציא מספרים. אם חסר — "אין נתון במקור".`;
  }, [products, notes]);

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

  const toggleSku = (sku: string) => {
    setSelectedSku((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  };

  return (
    <>
      <PageHeader
        title="מילון לוגיסטי"
        subtitle="תעודות משלוח · מלאי תנועה · צפי רכישות · פקודות מצגת/וידאו"
        action={
          <button
            type="button"
            onClick={refetchAll}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            רענון
          </button>
        }
      />

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8" dir="rtl">
        <section className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-slate-100 shadow-card md:p-6">
          <div className="pointer-events-none absolute -left-16 top-0 h-40 w-40 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                <Warehouse className="h-4 w-4" />
                מילון לוגיסטי · נגזר מתעודות משלוח
              </p>
              <h1 className="mt-1 font-display text-2xl font-extrabold md:text-3xl">ניתוח מלאי וצפי רכישות</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-300">
                מק״טים מהתעודות, דירוג תנועה, צפי לפי תדירות — והעתקת פקודה מוכנה למצגת או לווידאו ב־NotebookLM.
              </p>
            </div>
            <Package className="h-10 w-10 text-emerald-400/80" />
          </div>
          <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                <div className="text-[11px] font-semibold text-slate-400">{k.label}</div>
                <div className="mt-0.5 text-xl font-extrabold tabular-nums text-emerald-100">{k.value}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.85fr)]">
          <section className="rounded-3xl border bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="חיפוש מק״ט או שם מוצר…"
                className="min-h-10 flex-1 rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <h2 className="mt-4 font-display text-sm font-bold">מוצרים מובילים (מתעודות)</h2>
            <div className="mt-3 h-72 w-full">
              {chartRows.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">
                  {loading ? "טוען…" : "אין פריטים בתעודות"}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {chartRows.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <aside className="rounded-3xl border bg-card p-4 shadow-card">
            <h2 className="font-display text-sm font-bold">רשימת מק״טים</h2>
            <p className="mb-2 text-xs text-muted-foreground">לחיצה מסמנת לבחירה</p>
            <div className="max-h-80 space-y-1.5 overflow-y-auto">
              {(q ? filtered : products).slice(0, 40).map((p) => (
                <button
                  key={p.sku}
                  type="button"
                  onClick={() => toggleSku(p.sku)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2 text-start text-xs transition",
                    selectedSku.has(p.sku)
                      ? "border-primary/40 bg-primary/5 font-bold"
                      : "hover:bg-muted",
                  )}
                >
                  <span className="truncate font-semibold">{p.name}</span>
                  <span className="flex justify-between gap-2 text-muted-foreground">
                    <span className="font-mono">{p.sku}</span>
                    <span className="tabular-nums">
                      {Math.round(p.qty)} · {p.notes} תע׳
                    </span>
                  </span>
                </button>
              ))}
              {products.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {loading ? "טוען תעודות…" : "לא נמצאו פריטים בשדה items בתעודות"}
                </p>
              )}
            </div>
            {selectedSku.size > 0 && (
              <button
                type="button"
                className="mt-3 w-full rounded-xl border py-2 text-xs font-bold hover:bg-muted"
                onClick={() => setSelectedSku(new Set())}
              >
                נקה בחירה
              </button>
            )}
          </aside>
        </div>

        <section className="rounded-3xl border bg-card p-4 shadow-card">
          <h2 className="font-display text-sm font-bold">צפי רכישות (לפי תדירות תעודות)</h2>
          <p className="text-xs text-muted-foreground">ממוצע כמות לתעודה × תדירות</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-start text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 font-semibold">מק״ט</th>
                  <th className="py-2 font-semibold">שם</th>
                  <th className="py-2 font-semibold">תעודות</th>
                  <th className="py-2 font-semibold">ממוצע/תעודה</th>
                  <th className="py-2 font-semibold">לקוחות</th>
                  <th className="py-2 font-semibold">סיווג</th>
                </tr>
              </thead>
              <tbody>
                {forecast.map((f) => (
                  <tr key={f.sku} className="border-b border-border/50">
                    <td className="py-2 font-mono">{f.sku}</td>
                    <td className="py-2">{f.name}</td>
                    <td className="py-2 tabular-nums">{f.notes}</td>
                    <td className="py-2 tabular-nums">{f.avgQty}</td>
                    <td className="py-2 tabular-nums">{f.customers}</td>
                    <td className="py-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold",
                          f.hint === "ביקוש גבוה"
                            ? "bg-emerald-500/15 text-emerald-700"
                            : f.hint === "ביקוש בינוני"
                              ? "bg-amber-500/15 text-amber-800"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {f.hint}
                      </span>
                    </td>
                  </tr>
                ))}
                {forecast.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      אין מספיק חזרות לחיזוי
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-emerald-500/20 bg-gradient-to-l from-emerald-500/10 via-card to-violet-500/10 p-4 shadow-card md:p-5">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold">
            <BookOpen className="h-4 w-4" />
            יצירת פקודות ל־NotebookLM / Gemini
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            הפקודות כוללות KPI מהתעודות. העלו דוח כמקור ואז הדביקו.
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
              {copied === "slides" ? "פקודת מצגת הועתקה" : "יצירת פקודת מצגת"}
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
              {copied === "video" ? "פקודת וידאו הועתקה" : "יצירת פקודת וידאו"}
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
              <button type="button" onClick={() => void copy("slides")} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold hover:bg-muted">
                {copied === "slides" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                העתק
              </button>
            </div>
            <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl bg-muted/50 p-3 text-[11px] leading-relaxed">{slidesCmd}</pre>
          </div>
          <div className="rounded-3xl border bg-card p-4 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-sm font-bold">
                <Video className="h-4 w-4 text-violet-600" />
                תצוגת פקודת וידאו
              </h2>
              <button type="button" onClick={() => void copy("video")} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold hover:bg-muted">
                {copied === "video" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                העתק
              </button>
            </div>
            <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl bg-muted/50 p-3 text-[11px] leading-relaxed">{videoCmd}</pre>
          </div>
        </section>

        <p className="text-center text-xs text-muted-foreground">
          <Link to="/notebook" className="font-bold text-primary hover:underline">Notebook רנטגן</Link>
          {" · "}
          <Link to="/catalog" className="font-bold text-primary hover:underline">קטלוג לוגיסטי</Link>
          {" · "}
          <Link to="/chat" className="font-bold text-primary hover:underline">צ׳אט נועה</Link>
        </p>
      </main>
    </>
  );
}
