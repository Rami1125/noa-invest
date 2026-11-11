/**
 * /logistics-dict — ארכיון + מילון_לוגיסט · לחיצה מרעננת פקודות NotebookLM
 * מיושר ל-notebooklm-py: slide-deck presenter · video heritage/classic
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BookOpen, Check, ImagePlus, Package, Palette, Presentation, RefreshCw, Search, Users, Video, Warehouse, X } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { getPurchaseMatrixFn } from "@/lib/customer-history.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/logistics-dict")({
  head: () => ({ meta: [{ title: "מילון לוגיסטי · ארכיון — ח. סבן" }] }),
  component: LogisticsDictPage,
});

const COLORS = ["#0f766e", "#0369a1", "#b45309", "#7c3aed", "#be123c", "#15803d", "#1d4ed8", "#a16207"];

const DEFAULT_STYLE = `סגנון Stone Industrial Hebrew (ח. סבן):
חומר: אבן חול #E8E2D8 + בטון עדין · טקסט #1C1917 · אמרלד #0F766E
תאורה רכה · RTL · כותרות כבדות
NotebookLM: slide-deck presenter · video style heritage/classic
תמונות אמיתיות יוקרתיות של אתר/חומרים/מנוף — ממחישות ומעבירות אמינות
אסור: סטוק גנרי, גרדיאנט צעקני, מספרים מומצאים`;

type Focus =
  | { kind: "none" }
  | { kind: "product"; sku: string; name: string }
  | { kind: "customer"; customerNo: string; customerName: string };

function LogisticsDictPage() {
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState<"slides" | "video" | "focus" | null>(null);
  const [focus, setFocus] = useState<Focus>({ kind: "none" });
  const [styleText, setStyleText] = useState(DEFAULT_STYLE);
  const [imageRef, setImageRef] = useState("");
  const [imageNote, setImageNote] = useState("");

  const purchaseQ = useQuery({
    queryKey: ["dict-purchase-matrix-v2"],
    queryFn: () => getPurchaseMatrixFn(),
    staleTime: 60_000,
  });
  const loading = purchaseQ.isLoading;
  const matrix = purchaseQ.data;
  const lines = matrix?.lines || [];
  const dictItems = matrix?.dictItems || [];
  const dictBySku = useMemo(() => {
    const m = new Map<string, (typeof dictItems)[0]>();
    for (const d of dictItems) if (d.sku) m.set(d.sku, d);
    return m;
  }, [dictItems]);

  const products = useMemo(() => {
    const map = new Map<string, { sku: string; name: string; qty: number; notes: number; customers: Set<string>; category?: string; unit: string }>();
    const noteSets = new Map<string, Set<string>>();
    for (const line of lines) {
      const key = line.sku || line.name;
      if (!key) continue;
      let row = map.get(key);
      if (!row) {
        const d = line.sku ? dictBySku.get(line.sku) : undefined;
        row = { sku: line.sku || key, name: d?.name || line.name || line.sku, qty: 0, notes: 0, customers: new Set(), category: d?.category, unit: line.unit || d?.unit || "" };
        map.set(key, row);
      }
      row.qty += Number(line.qty) || 0;
      if (line.customerNo) row.customers.add(line.customerNo);
      if (!noteSets.has(key)) noteSets.set(key, new Set());
      if (line.noteId) noteSets.get(key)!.add(line.noteId);
    }
    for (const [k, s] of noteSets) {
      const r = map.get(k);
      if (r) r.notes = s.size;
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty || b.notes - a.notes);
  }, [lines, dictBySku]);

  const byCustomer = useMemo(() => {
    const map = new Map<string, { customerNo: string; customerName: string; products: Map<string, { name: string; qty: number; unit: string }> }>();
    for (const line of lines) {
      const cno = line.customerNo || "ללא";
      let row = map.get(cno);
      if (!row) {
        row = { customerNo: cno, customerName: line.customerName || cno, products: new Map() };
        map.set(cno, row);
      }
      if (line.customerName) row.customerName = line.customerName;
      const pk = line.sku || line.name;
      if (!pk) continue;
      const prev = row.products.get(pk) || { name: line.name, qty: 0, unit: line.unit || "" };
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
  }, [lines]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) => p.sku.toLowerCase().includes(term) || p.name.toLowerCase().includes(term) || (p.category || "").toLowerCase().includes(term));
  }, [products, q]);

  const chartRows = useMemo(() => {
    let list = products;
    if (focus.kind === "product") list = products.filter((p) => p.sku === focus.sku);
    if (focus.kind === "customer") {
      const c = byCustomer.find((x) => x.customerNo === focus.customerNo);
      if (c) list = c.productList.map((pr) => ({ sku: pr.sku, name: pr.name, qty: pr.qty, notes: 0, customers: new Set<string>(), unit: pr.unit }));
    }
    return list.slice(0, 12).map((p) => ({ key: p.sku, name: (p.name || p.sku).slice(0, 18), value: Math.round(p.qty * 10) / 10 }));
  }, [products, byCustomer, focus]);

  const analysisPoints = useMemo(() => {
    const pts: string[] = [];
    const total = products.reduce((s, p) => s + p.qty, 0);
    if (products[0]) {
      const t = products[0];
      pts.push(`ריכוז: ${t.name} (${t.sku}) — ${Math.round(t.qty)} ב-${t.notes} תע׳ · ${t.customers.size} לקוחות (${total ? Math.round((t.qty / total) * 100) : 0}%).`);
    }
    if (byCustomer[0]) {
      const c = byCustomer[0];
      pts.push(`לקוח מוביל: ${c.customerName} (#${c.customerNo}) — ${Math.round(c.totalQty)} · ${c.productList.length} מקטים.`);
    }
    const multi = products.filter((p) => p.notes >= 3).length;
    if (multi) pts.push(`מלאי יציב: ${multi} מקטים ב-3+ תעודות.`);
    const cov = matrix?.noteCount ? Math.round(((matrix.notesWithProducts || 0) / matrix.noteCount) * 100) : 0;
    pts.push(`כיסוי: ${matrix?.notesWithProducts || 0}/${matrix?.noteCount || 0} (${cov}%) · מילון_לוגיסט: ${matrix?.dictRows || 0}`);
    return pts;
  }, [products, byCustomer, matrix]);

  const focusDetail = useMemo(() => {
    if (focus.kind === "product") {
      const p = products.find((x) => x.sku === focus.sku);
      const d = dictBySku.get(focus.sku);
      const buyers = byCustomer
        .filter((c) => c.productList.some((pr) => pr.sku === focus.sku))
        .slice(0, 8)
        .map((c) => {
          const pr = c.productList.find((x) => x.sku === focus.sku)!;
          return `- ${c.customerName} (#${c.customerNo}): ${Math.round(pr.qty)}`;
        });
      return {
        title: `מיקוד מוצר: ${focus.name} (${focus.sku})`,
        body: [p ? `כמות ${Math.round(p.qty)} · תעודות ${p.notes} · לקוחות ${p.customers.size}` : "", d ? `מילון: ${d.name} · ${d.category} · ${d.unit} · מחיר ${d.price || "—"}` : "לא במילון_לוגיסט", "רוכשים:", ...buyers].filter(Boolean).join("\n"),
      };
    }
    if (focus.kind === "customer") {
      const c = byCustomer.find((x) => x.customerNo === focus.customerNo);
      if (!c) return null;
      return {
        title: `מיקוד לקוח: ${c.customerName} (#${c.customerNo})`,
        body: [`סה\"כ ${Math.round(c.totalQty)} · ${c.productList.length} מקטים`, "מוצרים:", ...c.productList.slice(0, 12).map((pr) => `- ${pr.sku} ${pr.name}: ${Math.round(pr.qty)}`)].join("\n"),
      };
    }
    return null;
  }, [focus, products, byCustomer, dictBySku]);

  const styleBlock = useMemo(() => ["--- כאן מתארים סגנון חזותי ייחודי ---", styleText.trim() || DEFAULT_STYLE].join("\n"), [styleText]);
  const mediaBlock = useMemo(() => {
    const lines = ["--- מדיה NotebookLM ---", imageRef.trim() ? `תמונה/source: ${imageRef.trim()}` : "תמונה: העלה ל-NotebookLM או ציין URL"];
    if (imageNote.trim()) lines.push(`שימוש: ${imageNote.trim()}`);
    return lines.join("\n");
  }, [imageRef, imageNote]);

  const nlm = "יישור notebooklm-py: slide-deck presenter medium · video overview explainer/brief · style heritage/classic · grounding רק ממקורות שהועלו · עברית RTL";

  const slidesCmd = useMemo(() => {
    const top = products.slice(0, 8).map((p, i) => `${i + 1}. ${p.name} (${p.sku}): ${Math.round(p.qty)} · ${p.notes} תע׳`).join("\n");
    const cust = byCustomer.slice(0, 6).map((c) => `- ${c.customerName}: ${c.productList.slice(0, 3).map((p) => p.name).join(", ")}`).join("\n");
    const analysis = analysisPoints.map((p, i) => `${i + 1}. ${p}`).join("\n");
    const foc = focusDetail ? `\n--- מיקוד ---\n${focusDetail.title}\n${focusDetail.body}` : "";
    return [
      "רק מקורות שהועלו (ארכיון_תעודות_גליה + מילון_לוגיסט). אל תמציא מספרים.",
      nlm,
      "משימה: slide-deck presenter · 8 שקפים · השקע בתמונות אמיתיות יוקרתיות.",
      styleBlock,
      mediaBlock,
      foc,
      `KPI: מקטים ${products.length} · תעודות ${matrix?.noteCount || 0} · פריטים ${matrix?.notesWithProducts || 0} · לקוחות ${byCustomer.length} · מילון ${matrix?.dictRows || 0}`,
      "ניתוח:",
      analysis,
      "שקפים: 1.שער 2.KPI 3.מובילים 4.לקוחות 5.ריכוז 6.מלאי 7.המלצות 8.סיכום",
      top || "- אין נתון",
      cust || "- אין נתון",
      "לכל שקף: כותרת, 3–5 נקודות, דובר 20–30 שנ׳. חסר → אין נתון במקור.",
    ].join("\n");
  }, [products, byCustomer, matrix, analysisPoints, styleBlock, mediaBlock, focusDetail]);

  const videoCmd = useMemo(() => {
    const top3 = products.slice(0, 3).map((p) => `${p.name}: ${Math.round(p.qty)}`).join(" · ");
    const foc = focusDetail ? `\n--- מיקוד ---\n${focusDetail.title}\n${focusDetail.body}` : "";
    return [
      "video overview · explainer/brief · heritage/classic · 70–90 שנ׳ · עברית.",
      nlm,
      styleBlock,
      mediaBlock,
      foc,
      `KPI: ${products.length} מקטים · ${matrix?.noteCount || 0} תעודות · ${byCustomer.length} לקוחות`,
      "ניתוח:",
      analysisPoints.slice(0, 3).map((p, i) => `${i + 1}. ${p}`).join("\n"),
      `[00–12] כותרת+KPI  [12–35] מובילים ${top3 || "—"}  [35–55] לקוחות  [55–75] מלאי  [75–90] CTA`,
      "פלט: תסריט + טקסט מסך + 5 prompts ויזואל.",
    ].join("\n");
  }, [products, matrix, byCustomer, analysisPoints, styleBlock, mediaBlock, focusDetail]);

  const focusCmd = useMemo(() => {
    if (!focusDetail) return "";
    return ["פקודת מיקוד NotebookLM:", nlm, styleBlock, mediaBlock, focusDetail.title, focusDetail.body, "slide-deck presenter קצר 4–6 שקפים או video brief סביב המיקוד. אל תמציא."].join("\n");
  }, [focusDetail, styleBlock, mediaBlock]);

  const copy = async (kind: "slides" | "video" | "focus") => {
    const text = kind === "slides" ? slidesCmd : kind === "video" ? videoCmd : focusCmd;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* ignore */ }
  };

  return (
    <>
      <PageHeader
        title="מילון לוגיסטי"
        subtitle="ארכיון + מילון_לוגיסט · לחיצה = פקודת Notebook מוכנה"
        action={
          <button type="button" onClick={() => void purchaseQ.refetch()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold hover:bg-muted disabled:opacity-60">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> רענון
          </button>
        }
      />
      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8" dir="rtl">
        <section className="rounded-3xl border border-stone-200 bg-gradient-to-br from-stone-100 via-[#f5f1ea] to-emerald-50 p-5 shadow-sm dark:border-white/10 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950 md:p-6">
          <p className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
            <Warehouse className="h-3.5 w-3.5" />
            {matrix?.sourceTab || "ארכיון_תעודות_גליה"} · {matrix?.dictTab || "מילון_לוגיסט"}
            {matrix?.readVia ? ` · ${matrix.readVia}` : ""}
          </p>
          <h1 className="mt-1 font-display text-2xl font-extrabold text-stone-900 dark:text-white">מה לקוחות רוכשים</h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">לחצו על מוצר או לקוח — הפקודות מתעדכנות אוטומטית</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            {[
              ["מקטים", products.length],
              ["תעודות", matrix?.noteCount || 0],
              ["עם פריטים", matrix?.notesWithProducts || 0],
              ["לקוחות", byCustomer.length],
              ["כמות", Math.round(products.reduce((s, p) => s + p.qty, 0))],
              ["מילון", matrix?.dictRows || 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-stone-300/50 bg-white/90 px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-white/5">
                <div className="text-[10px] font-semibold text-stone-500">{label}</div>
                <div className="text-xl font-extrabold tabular-nums text-emerald-900 dark:text-emerald-100">{value}</div>
              </div>
            ))}
          </div>
        </section>

        {focus.kind !== "none" && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
            <span className="font-bold text-emerald-900 dark:text-emerald-200">
              מיקוד: {focus.kind === "product" ? focus.name : focus.customerName}
            </span>
            <button type="button" onClick={() => setFocus({ kind: "none" })} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold">
              <X className="h-3 w-3" /> נקה
            </button>
            <button type="button" onClick={() => void copy("focus")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-extrabold text-white">
              {copied === "focus" ? <Check className="h-3.5 w-3.5" /> : <BookOpen className="h-3.5 w-3.5" />}
              {copied === "focus" ? "הועתק" : "העתק פקודת מיקוד"}
            </button>
          </div>
        )}

        <section className="rounded-3xl border bg-card p-4 shadow-sm">
          <h2 className="font-display text-sm font-bold">נקודות ניתוח</h2>
          <ul className="mt-2 grid gap-2 md:grid-cols-2">
            {analysisPoints.map((p, i) => (
              <li key={i} className="rounded-2xl border bg-stone-50/90 px-3 py-2 text-[13px] dark:bg-muted/30">
                <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-700 text-[10px] font-bold text-white">{i + 1}</span>
                {p}
              </li>
            ))}
          </ul>
        </section>

        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.95fr]">
          <section className="rounded-3xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש מקט / מוצר / קטגוריה…" className="min-h-10 flex-1 rounded-xl border px-3 text-sm" />
            </div>
            <h2 className="mt-3 font-display text-sm font-bold">מוצרים (לחיץ)</h2>
            <div className="mt-2 h-64">
              {chartRows.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">{loading ? "טוען…" : "אין פריטים"}</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartRows} margin={{ bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {chartRows.map((row, i) => (
                        <Cell key={row.key} fill={COLORS[i % COLORS.length]} cursor="pointer" onClick={() => setFocus({ kind: "product", sku: row.key, name: row.name })} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
          <aside className="rounded-3xl border bg-card p-4 shadow-sm">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold"><Package className="h-4 w-4" /> מקטים</h2>
            <div className="mt-2 max-h-80 space-y-1 overflow-y-auto">
              {filtered.slice(0, 50).map((p) => {
                const active = focus.kind === "product" && focus.sku === p.sku;
                return (
                  <button key={p.sku} type="button" onClick={() => setFocus({ kind: "product", sku: p.sku, name: p.name })} className={cn("flex w-full flex-col rounded-xl border px-3 py-2 text-start text-xs", active ? "border-emerald-600/50 bg-emerald-500/15 font-bold" : "border-transparent hover:bg-muted/60")}>
                    <span className="truncate font-semibold">{p.name}</span>
                    <span className="flex justify-between text-muted-foreground"><span className="font-mono">{p.sku}</span><span>{Math.round(p.qty)} · {p.notes} תע׳{p.category ? ` · ${p.category}` : ""}</span></span>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>

        <section className="rounded-3xl border bg-card p-4 shadow-sm">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold"><Users className="h-4 w-4" /> לקוחות (לחיץ)</h2>
          <div className="mt-3 grid max-h-[28rem] gap-2 overflow-y-auto sm:grid-cols-2">
            {byCustomer.slice(0, 40).map((c) => {
              const active = focus.kind === "customer" && focus.customerNo === c.customerNo;
              return (
                <button key={c.customerNo} type="button" onClick={() => setFocus({ kind: "customer", customerNo: c.customerNo, customerName: c.customerName })} className={cn("rounded-2xl border px-3 py-2.5 text-start", active ? "border-emerald-600/50 bg-emerald-500/15" : "border-stone-200/80 bg-stone-50/50 hover:bg-muted/50 dark:border-border")}>
                  <div className="flex justify-between text-sm font-bold">
                    <span className="truncate">{c.customerName} <span className="font-mono text-[11px] font-normal text-muted-foreground">#{c.customerNo}</span></span>
                    <span className="text-xs font-normal text-muted-foreground">{Math.round(c.totalQty)} · {c.productList.length}</span>
                  </div>
                  <ul className="mt-1 text-[11px] text-muted-foreground">
                    {c.productList.slice(0, 3).map((pr) => (
                      <li key={pr.sku} className="flex justify-between gap-2"><span className="truncate"><span className="font-mono text-[10px]">{pr.sku}</span> {pr.name}</span><span>{Math.round(pr.qty)}</span></li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-amber-500/30 bg-gradient-to-l from-amber-500/10 via-card to-stone-100 p-4 md:p-5">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold"><Palette className="h-4 w-4 text-amber-700" /> כאן מתארים סגנון חזותי ייחודי</h2>
          <textarea value={styleText} onChange={(e) => setStyleText(e.target.value)} rows={6} dir="rtl" className="mt-2 w-full rounded-2xl border p-3 text-xs leading-relaxed" />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="block space-y-1">
              <span className="flex items-center gap-1 text-xs font-bold"><ImagePlus className="h-3.5 w-3.5" /> תמונה עם הפקודה</span>
              <input value={imageRef} onChange={(e) => setImageRef(e.target.value)} placeholder="URL או שם source ב-NotebookLM" className="min-h-10 w-full rounded-xl border px-3 text-sm" dir="ltr" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold">הנחיית שימוש</span>
              <input value={imageNote} onChange={(e) => setImageNote(e.target.value)} placeholder="רקע שער · בלי לכסות KPI" className="min-h-10 w-full rounded-xl border px-3 text-sm" />
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-emerald-600/25 bg-gradient-to-br from-emerald-500/10 via-card to-violet-500/10 p-4 md:p-5">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold"><BookOpen className="h-4 w-4" /> פקודות Notebook מוכנות</h2>
          <p className="mt-1 text-xs text-muted-foreground">מתחדשות עם כל לחיצה · מיושר ל-notebooklm-py</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => void copy("slides")} className={cn("flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 text-sm font-extrabold", copied === "slides" ? "border-emerald-500 bg-emerald-500/15" : "border-primary/40 bg-primary text-primary-foreground")}>
              {copied === "slides" ? <Check className="h-4 w-4" /> : <Presentation className="h-4 w-4" />} מצגת
            </button>
            <button type="button" onClick={() => void copy("video")} className={cn("flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 text-sm font-extrabold", copied === "video" ? "border-emerald-500 bg-emerald-500/15" : "border-violet-500/50 bg-violet-600 text-white")}>
              {copied === "video" ? <Check className="h-4 w-4" /> : <Video className="h-4 w-4" />} וידאו
            </button>
            <button type="button" disabled={!focusCmd} onClick={() => void copy("focus")} className={cn("flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 text-sm font-extrabold disabled:opacity-40", copied === "focus" ? "border-emerald-500 bg-emerald-500/15" : "border-stone-400 bg-stone-800 text-white")}>
              {copied === "focus" ? <Check className="h-4 w-4" /> : <Package className="h-4 w-4" />} מיקוד
            </button>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {[slidesCmd, videoCmd, focusCmd || "לחצו על מוצר או לקוח…"].map((txt, i) => (
              <pre key={i} className="max-h-44 overflow-auto whitespace-pre-wrap rounded-2xl bg-stone-900/95 p-3 text-[10px] text-stone-100">{txt.length > 1600 ? txt.slice(0, 1600) + "\n…" : txt}</pre>
            ))}
          </div>
        </section>

        <p className="pb-4 text-center text-xs text-muted-foreground">
          <Link to="/notebook" className="font-bold text-primary hover:underline">Notebook</Link>
          {" · "}
          <Link to="/catalog" className="font-bold text-primary hover:underline">קטלוג</Link>
          {" · "}notebooklm-py aligned
        </p>
      </main>
    </>
  );
}
