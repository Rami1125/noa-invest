/**
 * /logistics-dict — מוצרים שלקוחות רכשו מארכיון_תעודות_גליה
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BookOpen, Check, ClipboardCopy, Package, Presentation, RefreshCw, Search, Video, Warehouse } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { getCatalogFn } from "@/lib/notes-api.functions";
import { getPurchaseMatrixFn } from "@/lib/customer-history.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/logistics-dict")({
  head: () => ({ meta: [{ title: "מילון לוגיסטי · ארכיון תעודות — ח. סבן" }] }),
  component: LogisticsDictPage,
});

const COLORS = ["#0f766e", "#0369a1", "#b45309", "#7c3aed", "#be123c", "#15803d", "#1d4ed8", "#a16207"];

type ProductAgg = { sku: string; name: string; qty: number; notes: number; customers: Set<string>; lastDate: string };

function LogisticsDictPage() {
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState<"slides" | "video" | null>(null);
  const [selectedSku, setSelectedSku] = useState<Set<string>>(new Set());

  const catalogQ = useQuery({ queryKey: ["dict-catalog"], queryFn: () => getCatalogFn({ data: {} as never }), staleTime: 60_000 });
  const purchaseQ = useQuery({ queryKey: ["dict-purchase-matrix"], queryFn: () => getPurchaseMatrixFn(), staleTime: 60_000 });

  const loading = catalogQ.isLoading || purchaseQ.isLoading;
  const refetchAll = () => { void catalogQ.refetch(); void purchaseQ.refetch(); };

  const catalogRows = (catalogQ.data?.rows || []) as Record<string, string>[];
  const matrix = purchaseQ.data;
  const purchaseLines = matrix?.lines || [];

  const products = useMemo(() => {
    const map = new Map<string, ProductAgg>();
    const noteSets = new Map<string, Set<string>>();
    for (const line of purchaseLines) {
      const key = line.sku || line.name;
      if (!key) continue;
      let row = map.get(key);
      if (!row) {
        row = { sku: line.sku || key, name: line.name || line.sku, qty: 0, notes: 0, customers: new Set(), lastDate: line.dateIso || "" };
        map.set(key, row);
      }
      row.qty += Number(line.qty) || 0;
      if (line.customerNo) row.customers.add(line.customerNo);
      if (line.dateIso && (!row.lastDate || line.dateIso > row.lastDate)) row.lastDate = line.dateIso;
      if (line.name && line.name.length > row.name.length) row.name = line.name;
      if (!noteSets.has(key)) noteSets.set(key, new Set());
      if (line.noteId) noteSets.get(key)!.add(line.noteId);
    }
    for (const [key, set] of noteSets) { const row = map.get(key); if (row) row.notes = set.size; }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty || b.notes - a.notes);
  }, [purchaseLines]);

  const byCustomer = useMemo(() => {
    const map = new Map<string, { customerNo: string; customerName: string; products: Map<string, { name: string; qty: number }> }>();
    for (const line of purchaseLines) {
      const cno = line.customerNo || "ללא";
      let row = map.get(cno);
      if (!row) { row = { customerNo: cno, customerName: line.customerName || cno, products: new Map() }; map.set(cno, row); }
      if (line.customerName) row.customerName = line.customerName;
      const pk = line.sku || line.name;
      if (!pk) continue;
      const prev = row.products.get(pk) || { name: line.name, qty: 0 };
      prev.qty += Number(line.qty) || 0;
      if (line.name) prev.name = line.name;
      row.products.set(pk, prev);
    }
    return Array.from(map.values())
      .map((c) => ({
        ...c,
        productList: Array.from(c.products.entries()).map(([sku, v]) => ({ sku, ...v })).sort((a, b) => b.qty - a.qty),
        totalQty: Array.from(c.products.values()).reduce((s, p) => s + p.qty, 0),
      }))
      .sort((a, b) => b.totalQty - a.totalQty);
  }, [purchaseLines]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = products;
    if (term) list = list.filter((p) => p.sku.toLowerCase().includes(term) || p.name.toLowerCase().includes(term));
    if (selectedSku.size > 0) list = list.filter((p) => selectedSku.has(p.sku));
    return list;
  }, [products, q, selectedSku]);

  const chartRows = useMemo(
    () => (selectedSku.size > 0 ? filtered : products).slice(0, 12).map((p) => ({ key: p.sku, name: (p.name || p.sku).slice(0, 18), value: Math.round(p.qty * 10) / 10 })),
    [products, filtered, selectedSku],
  );

  const kpis = [
    { label: "מק\"טים בארכיון", value: products.length },
    { label: "תעודות", value: matrix?.noteCount || 0 },
    { label: "עם פריטים", value: matrix?.notesWithProducts || 0 },
    { label: "לקוחות רוכשים", value: byCustomer.length },
    { label: "כמות מצטברת", value: Math.round(products.reduce((s, p) => s + p.qty, 0)) },
    { label: "מילון", value: catalogRows.length },
  ];

  const forecast = useMemo(
    () =>
      products.filter((p) => p.notes >= 2).slice(0, 10).map((p) => {
        const avg = p.notes ? p.qty / p.notes : 0;
        return { sku: p.sku, name: p.name, notes: p.notes, avgQty: Math.round(avg * 10) / 10, customers: p.customers.size, hint: p.notes >= 5 ? "ביקוש גבוה" : p.notes >= 3 ? "ביקוש בינוני" : "מעקב" };
      }),
    [products],
  );

  const slidesCmd = useMemo(() => {
    const top = products.slice(0, 8).map((p, i) => `${i + 1}. ${p.name} (${p.sku}): ${Math.round(p.qty)} · ${p.notes} תעודות · ${p.customers.size} לקוחות`).join("\n");
    const cust = byCustomer.slice(0, 6).map((c) => `- ${c.customerName} (#${c.customerNo}): ${c.productList.slice(0, 3).map((p) => p.name).join(", ")}`).join("\n");
    return `השתמש רק במקור ארכיון_תעודות_גליה. אל תמציא מק\"טים או כמויות.\n\nמשימה: מצגת מכווצת בעברית, RTL, 8 שקפים — מה לקוחות רוכשים.\n\nKPI: מק\"טים ${products.length} · תעודות ${matrix?.noteCount || 0} · עם פריטים ${matrix?.notesWithProducts || 0} · לקוחות ${byCustomer.length}\n\nשקפים:\n1. שער\n2. KPI\n3. מוצרים מובילים\n${top || "- אין נתון במקור"}\n4. לקוחות ומה הם קונים\n${cust || "- אין נתון במקור"}\n5. צפי רכישות\n6. סיכונים\n7. המלצות מלאי\n8. סיכום\n\nלכל שקף: כותרת, 3–5 נקודות, הערת דובר 20–30 שנ'. אם חסר — "אין נתון במקור".`;
  }, [products, byCustomer, matrix]);

  const videoCmd = useMemo(() => {
    const top3 = products.slice(0, 3).map((p) => `${p.name}: ${Math.round(p.qty)}`).join(" · ");
    return `מצגת וידאו 70–90 שנ' מארכיון תעודות ח. סבן בלבד.\nKPI: מק\"טים ${products.length} · תעודות ${matrix?.noteCount || 0} · לקוחות ${byCustomer.length}\n[00–12] כותרת + KPI\n[12–35] מובילים — ${top3 || "אין נתון"}\n[35–55] לקוחות ומוצרים\n[55–75] המלצות\n[75–90] סגירה\nפלט: תסריט + טקסט מסך + 5 prompts. אל תמציא מספרים.`;
  }, [products, matrix, byCustomer]);

  const copy = async (kind: "slides" | "video") => {
    try {
      await navigator.clipboard.writeText(kind === "slides" ? slidesCmd : videoCmd);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* ignore */ }
  };

  return (
    <>
      <PageHeader title="מילון לוגיסטי" subtitle="ארכיון_תעודות_גליה · מה לקוחות רוכשים · מצגת/וידאו" action={
        <button type="button" onClick={refetchAll} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold hover:bg-muted disabled:opacity-60">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> רענון
        </button>
      } />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8" dir="rtl">
        <section className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-5 text-slate-100 md:p-6">
          <p className="flex items-center gap-2 text-xs font-bold text-emerald-300"><Warehouse className="h-4 w-4" />מקור: {matrix?.sourceTab || "ארכיון_תעודות_גליה"}</p>
          <h1 className="mt-1 font-display text-2xl font-extrabold">מה לקוחות רוכשים</h1>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
                <div className="text-[11px] text-slate-400">{k.label}</div>
                <div className="text-xl font-extrabold tabular-nums text-emerald-100">{k.value}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
          <section className="rounded-3xl border bg-card p-4 shadow-card">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש מק\"ט / מוצר…" className="min-h-10 flex-1 rounded-xl border bg-background px-3 text-sm" />
            </div>
            <h2 className="mt-3 font-display text-sm font-bold">מוצרים מובילים</h2>
            <div className="mt-2 h-64">
              {chartRows.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">{loading ? "טוען ארכיון…" : "אין פריטים — עמודת פריטים בארכיון (מק\"ט|שם|כמות)"}</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartRows} margin={{ bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>{chartRows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
          <aside className="rounded-3xl border bg-card p-4 shadow-card">
            <h2 className="font-display text-sm font-bold">מק\"טים</h2>
            <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
              {(q ? filtered : products).slice(0, 40).map((p) => (
                <button key={p.sku} type="button" onClick={() => setSelectedSku((prev) => { const n = new Set(prev); if (n.has(p.sku)) n.delete(p.sku); else n.add(p.sku); return n; })}
                  className={cn("flex w-full flex-col rounded-xl border px-3 py-2 text-start text-xs", selectedSku.has(p.sku) ? "border-primary/40 bg-primary/5 font-bold" : "hover:bg-muted")}>
                  <span className="truncate font-semibold">{p.name}</span>
                  <span className="flex justify-between text-muted-foreground"><span className="font-mono">{p.sku}</span><span>{Math.round(p.qty)} · {p.notes} תע׳ · {p.customers.size} לקוח</span></span>
                </button>
              ))}
            </div>
          </aside>
        </div>

        <section className="rounded-3xl border bg-card p-4 shadow-card">
          <h2 className="font-display text-sm font-bold">לקוחות ומה הם קונים</h2>
          <p className="text-xs text-muted-foreground">{matrix?.notesWithProducts || 0}/{matrix?.noteCount || 0} תעודות עם פריטים</p>
          <div className="mt-3 max-h-96 space-y-2 overflow-y-auto">
            {byCustomer.slice(0, 30).map((c) => (
              <div key={c.customerNo} className="rounded-2xl border bg-muted/20 px-3 py-2">
                <div className="flex justify-between gap-2 text-sm font-bold">
                  <span>{c.customerName} <span className="font-mono text-xs font-normal text-muted-foreground">#{c.customerNo}</span></span>
                  <span className="text-xs font-normal text-muted-foreground">{Math.round(c.totalQty)} · {c.productList.length} מק\"טים</span>
                </div>
                <ul className="mt-1 text-xs text-muted-foreground">
                  {c.productList.slice(0, 5).map((pr) => (
                    <li key={pr.sku} className="flex justify-between gap-2"><span className="truncate"><span className="font-mono text-[10px]">{pr.sku}</span> {pr.name}</span><span className="tabular-nums">{Math.round(pr.qty)}</span></li>
                  ))}
                </ul>
              </div>
            ))}
            {byCustomer.length === 0 && !loading && <p className="py-6 text-center text-sm text-muted-foreground">אין שורות — עמודת פריטים בארכיון: מק\"ט|שם|כמות</p>}
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-4 shadow-card">
          <h2 className="font-display text-sm font-bold">צפי לפי תדירות</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-xs">
              <thead><tr className="border-b text-muted-foreground"><th className="py-2 text-start">מק\"ט</th><th className="py-2 text-start">שם</th><th className="py-2 text-start">תעודות</th><th className="py-2 text-start">ממוצע</th><th className="py-2 text-start">לקוחות</th><th className="py-2 text-start">סיווג</th></tr></thead>
              <tbody>
                {forecast.map((f) => (
                  <tr key={f.sku} className="border-b border-border/40">
                    <td className="py-1.5 font-mono">{f.sku}</td><td className="py-1.5">{f.name}</td><td className="py-1.5 tabular-nums">{f.notes}</td>
                    <td className="py-1.5 tabular-nums">{f.avgQty}</td><td className="py-1.5 tabular-nums">{f.customers}</td><td className="py-1.5">{f.hint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-emerald-500/20 bg-gradient-to-l from-emerald-500/10 via-card to-violet-500/10 p-4 md:p-5">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold"><BookOpen className="h-4 w-4" />פקודות NotebookLM</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => void copy("slides")} className={cn("flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 px-4 text-sm font-extrabold", copied === "slides" ? "border-emerald-500 bg-emerald-500/15 text-emerald-800" : "border-primary/40 bg-primary text-primary-foreground")}>
              {copied === "slides" ? <Check className="h-5 w-5" /> : <Presentation className="h-5 w-5" />}{copied === "slides" ? "הועתק" : "יצירת פקודת מצגת"}
            </button>
            <button type="button" onClick={() => void copy("video")} className={cn("flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 px-4 text-sm font-extrabold", copied === "video" ? "border-emerald-500 bg-emerald-500/15 text-emerald-800" : "border-violet-500/50 bg-violet-600 text-white")}>
              {copied === "video" ? <Check className="h-5 w-5" /> : <Video className="h-5 w-5" />}{copied === "video" ? "הועתק" : "יצירת פקודת וידאו"}
            </button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-2xl bg-muted/50 p-3 text-[11px]">{slidesCmd}</pre>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-2xl bg-muted/50 p-3 text-[11px]">{videoCmd}</pre>
          </div>
        </section>

        <p className="text-center text-xs text-muted-foreground">
          <Link to="/notebook" className="font-bold text-primary hover:underline">Notebook</Link>
          {" · "}
          <Link to="/catalog" className="font-bold text-primary hover:underline">קטלוג</Link>
          {" · "}
          <Package className="inline h-3 w-3" /> ארכיון_תעודות_גליה
        </p>
      </main>
    </>
  );
}
