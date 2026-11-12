/**
 * /logistics-dict — SABAN MASTER CREATIVE ENGINE
 * מילון לוגיסטי · ארכיון · מחולל פקודות NotebookLM מקצועי
 * ח. סבן חומרי בניין (1994) בע״מ
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  BookOpen, Check, ImagePlus, Link2, Package, Palette, Presentation,
  RefreshCw, Search, Trash2, Upload, Users, Video, Warehouse, X,
  Monitor, FileText, Megaphone, Image as ImageIcon, Sparkles, ShieldCheck,
  AlertTriangle, History, Save, RotateCcw, Copy, CheckCircle2,
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { getPurchaseMatrixFn } from "@/lib/customer-history.functions";
import { cn } from "@/lib/utils";
import {
  type MediaItem,
  extractDriveFileId,
  drivePublicUrls,
  DEFAULT_STYLE,
} from "@/lib/logistics-dict/media";
import {
  MASTER_VERSION,
  MASTER_INSTRUCTIONS,
  getActiveMaster,
  saveMasterSnapshot,
  type MasterSnapshot,
} from "@/lib/logistics-dict/master";
import {
  buildFinalPrompt,
  OUTPUT_LABELS,
  type OutputType,
  type BuiltPrompt,
} from "@/lib/logistics-dict/prompt-engine";

export const Route = createFileRoute("/logistics-dict")({
  head: () => ({
    meta: [
      { title: "SABAN MASTER CREATIVE ENGINE · מילון לוגיסטי — ח. סבן" },
      { name: "description", content: "מחולל פקודות NotebookLM מקצועי — מצגות, וידאו, מדריכים ומסכי דלפק" },
    ],
  }),
  component: LogisticsDictPage,
});

const COLORS = ["#0f766e", "#0369a1", "#b45309", "#7c3aed", "#be123c", "#15803d", "#1d4ed8", "#a16207"];

type Focus =
  | { kind: "none" }
  | { kind: "product"; sku: string; name: string }
  | { kind: "customer"; customerNo: string; customerName: string };

const OUTPUT_OPTIONS: { id: OutputType; label: string; icon: typeof Presentation; desc: string }[] = [
  { id: "presentation", label: "מצגת", icon: Presentation, desc: "8–12 שקפים" },
  { id: "video", label: "וידאו", icon: Video, desc: "60–90 שנ׳" },
  { id: "guide", label: "מדריך טכני", icon: FileText, desc: "שלבי ביצוע" },
  { id: "product_image", label: "תמונת מוצר", icon: ImageIcon, desc: "המחשה / יצרן" },
  { id: "marketing", label: "תוכן שיווקי", icon: Megaphone, desc: "מסר + CTA" },
  { id: "counter_screen", label: "מסך דלפק", icon: Monitor, desc: "16:9 · 1080p" },
  { id: "focus", label: "מיקוד וניתוח", icon: Sparkles, desc: "מוצר / לקוח" },
];

function LogisticsDictPage() {
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus>({ kind: "none" });
  const [styleText, setStyleText] = useState(DEFAULT_STYLE);
  const [driveInput, setDriveInput] = useState("");
  const [imageNote, setImageNote] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [outputType, setOutputType] = useState<OutputType>("presentation");
  const [masterEdit, setMasterEdit] = useState(false);
  const [masterText, setMasterText] = useState(MASTER_INSTRUCTIONS);
  const [activeVersion, setActiveVersion] = useState(MASTER_VERSION);
  const [built, setBuilt] = useState<BuiltPrompt | null>(null);
  const [history, setHistory] = useState<{ at: string; type: OutputType; preview: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const active = getActiveMaster();
    setMasterText(active.instructions);
    setActiveVersion(active.version);
    if (active.styleOverride) setStyleText(active.styleOverride);
  }, []);

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
        row = {
          sku: line.sku || key,
          name: d?.name || line.name || line.sku,
          qty: 0,
          notes: 0,
          customers: new Set(),
          category: d?.category,
          unit: line.unit || d?.unit || "",
        };
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
    return products.filter(
      (p) =>
        p.sku.toLowerCase().includes(term) ||
        p.name.toLowerCase().includes(term) ||
        (p.category || "").toLowerCase().includes(term),
    );
  }, [products, q]);

  const chartRows = useMemo(() => {
    let list = products;
    if (focus.kind === "product") list = products.filter((p) => p.sku === focus.sku);
    if (focus.kind === "customer") {
      const c = byCustomer.find((x) => x.customerNo === focus.customerNo);
      if (c)
        list = c.productList.map((pr) => ({
          sku: pr.sku,
          name: pr.name,
          qty: pr.qty,
          notes: 0,
          customers: new Set<string>(),
          unit: pr.unit,
        }));
    }
    return list.slice(0, 12).map((p) => ({
      key: p.sku,
      name: (p.name || p.sku).slice(0, 18),
      value: Math.round(p.qty * 10) / 10,
    }));
  }, [products, byCustomer, focus]);

  const analysisPoints = useMemo(() => {
    const pts: string[] = [];
    const total = products.reduce((s, p) => s + p.qty, 0);
    if (products[0]) {
      const t = products[0];
      pts.push(
        `ריכוז: ${t.name} (${t.sku}) — ${Math.round(t.qty)} ב-${t.notes} תע׳ · ${t.customers.size} לקוחות (${total ? Math.round((t.qty / total) * 100) : 0}%).`,
      );
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
          return `- ${c.customerName} (#${c.customerNo}): ${Math.round(pr.qty)} ${pr.unit || ""}`;
        });
      return [
        `מוצר: ${focus.name} · מק״ט: ${focus.sku}`,
        p ? `כמות מצטברת: ${Math.round(p.qty)} · תעודות: ${p.notes} · לקוחות: ${p.customers.size}` : "",
        d?.category ? `קטגוריה (מילון): ${d.category}` : "",
        d?.unit ? `יחידה: ${d.unit}` : "",
        buyers.length ? "קונים בולטים:\n" + buyers.join("\n") : "אין נתוני קונים מפורטים",
      ]
        .filter(Boolean)
        .join("\n");
    }
    if (focus.kind === "customer") {
      const c = byCustomer.find((x) => x.customerNo === focus.customerNo);
      if (!c) return `לקוח #${focus.customerNo}`;
      const top = c.productList
        .slice(0, 10)
        .map((pr) => `- ${pr.name} (${pr.sku}): ${Math.round(pr.qty)} ${pr.unit || ""}`)
        .join("\n");
      return [
        `לקוח: ${c.customerName} (#${c.customerNo})`,
        `סה״כ כמות: ${Math.round(c.totalQty)} · מקטים: ${c.productList.length}`,
        "מוצרים מובילים:\n" + (top || "אין"),
      ].join("\n");
    }
    return "";
  }, [focus, products, byCustomer, dictBySku]);

  const kpiLine = useMemo(() => {
    return `KPI: מקטים ${products.length} · תעודות ${matrix?.noteCount || 0} · עם פריטים ${matrix?.notesWithProducts || 0} · לקוחות ${byCustomer.length} · מילון ${matrix?.dictRows || 0}`;
  }, [products, matrix, byCustomer]);

  const verifiedDataBlock = useMemo(() => {
    const parts = [kpiLine, focusDetail || "סקירה כללית — ללא מיקוד ספציפי"];
    if (analysisPoints.length) parts.push("ניתוח:\n" + analysisPoints.map((p, i) => `${i + 1}. ${p}`).join("\n"));
    return parts.filter(Boolean).join("\n\n");
  }, [kpiLine, focusDetail, analysisPoints]);

  useEffect(() => {
    const result = buildFinalPrompt({
      outputType,
      userRequest:
        focus.kind === "product"
          ? `הפק ${OUTPUT_LABELS[outputType]} מקצועי למוצר ${focus.name} (מק״ט ${focus.sku})`
          : focus.kind === "customer"
            ? `הפק ${OUTPUT_LABELS[outputType]} בהקשר לקוח ${focus.customerName} (#${focus.customerNo})`
            : `הפק ${OUTPUT_LABELS[outputType]} על בסיס נתוני הארכיון והמילון`,
      focusKind: focus.kind,
      productSku: focus.kind === "product" ? focus.sku : undefined,
      productName: focus.kind === "product" ? focus.name : undefined,
      customerNo: focus.kind === "customer" ? focus.customerNo : undefined,
      customerName: focus.kind === "customer" ? focus.customerName : undefined,
      verifiedDataBlock,
      analysisPoints,
      media,
      imageNote,
      styleOverride: styleText,
      kpiLine,
    });
    setBuilt(result);
  }, [outputType, focus, verifiedDataBlock, analysisPoints, media, imageNote, styleText, kpiLine]);

  const addDriveLink = () => {
    const id = extractDriveFileId(driveInput);
    if (!id) {
      setUploadError("קישור Drive לא תקין");
      return;
    }
    const urls = drivePublicUrls(id);
    setMedia((prev) => [
      ...prev,
      {
        id: `drive-${id}`,
        name: `Drive ${id.slice(0, 8)}…`,
        publicUrl: urls.view,
        previewUrl: urls.view,
        source: "drive",
      },
    ]);
    setDriveInput("");
    setUploadError(null);
  };

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next: MediaItem[] = [];
    Array.from(files).forEach((f, i) => {
      const url = URL.createObjectURL(f);
      next.push({
        id: `up-${Date.now()}-${i}`,
        name: f.name,
        publicUrl: "",
        previewUrl: url,
        source: "upload",
      });
    });
    setMedia((prev) => [...prev, ...next]);
    setUploadError(null);
  };

  const removeMedia = (id: string) => setMedia((prev) => prev.filter((m) => m.id !== id));

  const copyPrompt = async () => {
    if (!built?.prompt) return;
    try {
      await navigator.clipboard.writeText(built.prompt);
      setCopied(outputType);
      setHistory((h) =>
        [
          {
            at: new Date().toLocaleString("he-IL"),
            type: outputType,
            preview: built.prompt.slice(0, 120) + "…",
          },
          ...h,
        ].slice(0, 8),
      );
      setTimeout(() => setCopied(null), 2200);
    } catch {
      setUploadError("העתקה נכשלה — סמן והעתק ידנית");
    }
  };

  const saveMaster = () => {
    const snap: MasterSnapshot = {
      version: `custom-${Date.now()}`,
      updatedAt: new Date().toISOString(),
      instructions: masterText,
      styleOverride: styleText,
      label: "שמירה ידנית",
    };
    saveMasterSnapshot(snap);
    setActiveVersion(snap.version);
    setMasterEdit(false);
  };

  const resetMaster = () => {
    setMasterText(MASTER_INSTRUCTIONS);
    setStyleText(DEFAULT_STYLE);
    setActiveVersion(MASTER_VERSION);
    saveMasterSnapshot({
      version: MASTER_VERSION,
      updatedAt: new Date().toISOString(),
      instructions: MASTER_INSTRUCTIONS,
      styleOverride: DEFAULT_STYLE,
      label: "איפוס לגרסה מאושרת",
    });
    setMasterEdit(false);
  };

  const stats = [
    { label: "מקטים", value: products.length },
    { label: "תעודות", value: matrix?.noteCount || 0 },
    { label: "עם פריטים", value: matrix?.notesWithProducts || 0 },
    { label: "לקוחות", value: byCustomer.length },
    { label: "כמות", value: Math.round(products.reduce((s, p) => s + p.qty, 0)) },
    { label: "מילון", value: matrix?.dictRows || 0 },
  ];

  return (
    <>
      <PageHeader
        title="SABAN MASTER CREATIVE ENGINE"
        subtitle="מילון לוגיסטי · ארכיון · מחולל פקודות NotebookLM מקצועי"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => purchaseQ.refetch()}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              רענון
            </button>
            <span className="rounded-full bg-emerald-700/15 px-2.5 py-1 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
              מאסטר {activeVersion}
            </span>
          </div>
        }
      />

      <main id="main-content" className="mx-auto max-w-7xl space-y-5 px-3 pb-16 pt-2 md:px-6" dir="rtl">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border bg-card px-3 py-2 text-center shadow-sm">
              <div className="text-[10px] font-medium text-muted-foreground">{s.label}</div>
              <div className="font-display text-lg font-extrabold tabular-nums text-[#15324B] dark:text-foreground">
                {loading ? "…" : s.value}
              </div>
            </div>
          ))}
        </div>

        <section className="rounded-3xl border bg-card p-4 shadow-sm">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold">
            <Warehouse className="h-4 w-4 text-emerald-700" /> אזור א · נתונים
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">מוצרים · לקוחות · תעודות · מילון · ניתוח</p>

          {focus.kind !== "none" && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-sm">
              <span className="font-bold">
                מיקוד: {focus.kind === "product" ? focus.name : focus.customerName}
              </span>
              <button
                type="button"
                onClick={() => setFocus({ kind: "none" })}
                className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold"
              >
                <X className="h-3 w-3" /> נקה
              </button>
            </div>
          )}

          <div className="mt-3 grid gap-4 lg:grid-cols-[1.25fr_0.95fr]">
            <div>
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="חיפוש מקט / מוצר / קטגוריה…"
                  className="min-h-10 flex-1 rounded-xl border px-3 text-sm"
                />
              </div>
              <h3 className="mt-3 font-display text-sm font-bold">מוצרים (לחיץ)</h3>
              <div className="mt-2 h-56">
                {chartRows.length === 0 ? (
                  <div className="grid h-full place-items-center text-sm text-muted-foreground">
                    {loading ? "טוען…" : "אין פריטים"}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartRows} margin={{ bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {chartRows.map((row, i) => (
                          <Cell
                            key={row.key}
                            fill={COLORS[i % COLORS.length]}
                            cursor="pointer"
                            onClick={() => setFocus({ kind: "product", sku: row.key, name: row.name })}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            <aside>
              <h3 className="flex items-center gap-2 font-display text-sm font-bold">
                <Package className="h-4 w-4" /> מקטים
              </h3>
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                {filtered.slice(0, 50).map((p) => {
                  const active = focus.kind === "product" && focus.sku === p.sku;
                  return (
                    <button
                      key={p.sku}
                      type="button"
                      onClick={() => setFocus({ kind: "product", sku: p.sku, name: p.name })}
                      className={cn(
                        "flex w-full flex-col rounded-xl border px-3 py-2 text-start text-xs",
                        active ? "border-emerald-600/50 bg-emerald-500/15 font-bold" : "border-transparent hover:bg-muted/60",
                      )}
                    >
                      <span className="truncate font-semibold">{p.name}</span>
                      <span className="flex justify-between text-muted-foreground">
                        <span className="font-mono">{p.sku}</span>
                        <span>
                          {Math.round(p.qty)} · {p.notes} תע׳{p.category ? ` · ${p.category}` : ""}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
          </div>

          <div className="mt-4">
            <h3 className="flex items-center gap-2 font-display text-sm font-bold">
              <Users className="h-4 w-4" /> לקוחות (לחיץ)
            </h3>
            <div className="mt-2 grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
              {byCustomer.slice(0, 40).map((c) => {
                const active = focus.kind === "customer" && c.customerNo === focus.customerNo;
                return (
                  <button
                    key={c.customerNo}
                    type="button"
                    onClick={() =>
                      setFocus({ kind: "customer", customerNo: c.customerNo, customerName: c.customerName })
                    }
                    className={cn(
                      "rounded-2xl border px-3 py-2.5 text-start text-xs",
                      active ? "border-emerald-600/50 bg-emerald-500/15" : "border-stone-200/80 bg-stone-50/50 hover:bg-muted/50 dark:border-border dark:bg-muted/20",
                    )}
                  >
                    <div className="font-bold">{c.customerName}</div>
                    <div className="text-muted-foreground">
                      #{c.customerNo} · {Math.round(c.totalQty)} · {c.productList.length} מקטים
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {analysisPoints.length > 0 && (
            <div className="mt-4">
              <h3 className="font-display text-sm font-bold">נקודות ניתוח</h3>
              <ul className="mt-2 grid gap-2 md:grid-cols-2">
                {analysisPoints.map((p, i) => (
                  <li key={i} className="rounded-2xl border bg-stone-50/90 px-3 py-2 text-[13px] dark:bg-muted/30">
                    <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-700 text-[10px] font-bold text-white">
                      {i + 1}
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="rounded-3xl border bg-card p-4 shadow-sm">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold">
            <ImagePlus className="h-4 w-4 text-emerald-700" /> אזור ב · מדיה
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            העלאת תמונות · קישורי Drive · תמונות יצרן · הנחיות צילום
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold"
            >
              <Upload className="h-3.5 w-3.5" /> העלאת תמונות
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => onFiles(e.target.files)}
            />
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <input
                value={driveInput}
                onChange={(e) => setDriveInput(e.target.value)}
                placeholder="קישור Google Drive ציבורי…"
                className="min-h-9 min-w-[12rem] flex-1 rounded-xl border px-3 text-xs"
              />
              <button
                type="button"
                onClick={addDriveLink}
                className="inline-flex items-center gap-1 rounded-xl bg-[#15324B] px-3 py-2 text-xs font-bold text-white"
              >
                <Link2 className="h-3.5 w-3.5" /> הוסף קישור
              </button>
            </div>
          </div>
          {uploadError && <p className="mt-2 text-xs font-medium text-red-600">{uploadError}</p>}
          <input
            value={imageNote}
            onChange={(e) => setImageNote(e.target.value)}
            placeholder="הנחיית שימוש בתמונות (אופציונלי)…"
            className="mt-2 w-full rounded-xl border px-3 py-2 text-xs"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {media.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                אין תמונות — בפקודה תופיע הנחיה לצילום מקצועי טבעי (לא הדמיה).
              </p>
            ) : (
              media.map((m) => (
                <div key={m.id} className="relative rounded-xl border bg-muted/30 p-1">
                  {m.previewUrl ? (
                    <img src={m.previewUrl} alt={m.name} className="h-16 w-16 rounded-lg object-cover" />
                  ) : (
                    <div className="grid h-16 w-16 place-items-center text-[10px]">{m.name.slice(0, 8)}</div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeMedia(m.id)}
                    className="absolute -left-1 -top-1 rounded-full bg-red-600 p-0.5 text-white"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold">
              <Palette className="h-4 w-4 text-emerald-700" /> אזור ג · Creative Master
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMasterEdit((v) => !v)}
                className="inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-bold"
              >
                {masterEdit ? "סגור עריכה" : "ערוך מאסטר"}
              </button>
              <button
                type="button"
                onClick={saveMaster}
                className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-2.5 py-1.5 text-xs font-bold text-white"
              >
                <Save className="h-3.5 w-3.5" /> שמור גרסה
              </button>
              <button
                type="button"
                onClick={resetMaster}
                className="inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-bold"
              >
                <RotateCcw className="h-3.5 w-3.5" /> איפוס מאושר
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            גרסה פעילה: <strong>{activeVersion}</strong> · תאריך עדכון מערכת: {MASTER_VERSION}
          </p>
          {masterEdit ? (
            <textarea
              value={masterText}
              onChange={(e) => setMasterText(e.target.value)}
              rows={12}
              className="mt-3 w-full rounded-2xl border bg-stone-50 p-3 font-mono text-[11px] leading-relaxed dark:bg-muted/30"
              dir="rtl"
            />
          ) : (
            <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-2xl bg-stone-900/95 p-3 text-[10px] text-stone-100">
              {masterText.slice(0, 900)}
              {masterText.length > 900 ? "\n…" : ""}
            </pre>
          )}
          <div className="mt-3">
            <label className="text-xs font-bold">סגנון חזותי (Override)</label>
            <textarea
              value={styleText}
              onChange={(e) => setStyleText(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"
              dir="rtl"
            />
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-4 shadow-sm">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold">
            <Sparkles className="h-4 w-4 text-emerald-700" /> אזור ד · בחירת תוצר
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {OUTPUT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = outputType === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setOutputType(opt.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 text-center transition",
                    active
                      ? "border-emerald-600 bg-emerald-500/15 shadow-sm"
                      : "border-transparent bg-muted/40 hover:border-border",
                  )}
                >
                  <Icon className={cn("h-5 w-5", active ? "text-emerald-700" : "text-muted-foreground")} />
                  <span className="text-xs font-extrabold">{opt.label}</span>
                  <span className="text-[10px] text-muted-foreground">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border-2 border-emerald-700/25 bg-gradient-to-br from-emerald-500/10 via-card to-[#15324B]/5 p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold">
              <BookOpen className="h-4 w-4" /> אזור ה · הפקת פקודה
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full bg-white/80 px-2 py-0.5 font-bold dark:bg-muted">
                {OUTPUT_LABELS[outputType]}
              </span>
              <span className="rounded-full bg-white/80 px-2 py-0.5 dark:bg-muted">
                מדיה: {media.length ? `${media.length} פריטים` : "אין"}
              </span>
              {built?.verified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 font-bold text-white">
                  <ShieldCheck className="h-3 w-3" /> מאומת
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 font-bold text-white">
                  <AlertTriangle className="h-3 w-3" /> בדוק אזהרות
                </span>
              )}
            </div>
          </div>

          {built && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {built.checks.map((c) => (
                <span
                  key={c.id}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                    c.pass ? "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300" : "bg-red-500/15 text-red-700",
                  )}
                  title={c.label}
                >
                  {c.pass ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                  {c.label}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyPrompt()}
              disabled={!built?.prompt}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-extrabold text-white disabled:opacity-40",
                copied === outputType ? "bg-emerald-600" : "bg-[#15324B] hover:bg-[#0f2740]",
              )}
            >
              {copied === outputType ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied === outputType ? "הועתק!" : "העתק פקודה מלאה"}
            </button>
          </div>

          <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-2xl bg-stone-950 p-4 text-[11px] leading-relaxed text-stone-100">
            {built?.prompt || "בונה פקודה…"}
          </pre>

          {history.length > 0 && (
            <div className="mt-4">
              <h3 className="flex items-center gap-1.5 text-xs font-bold">
                <History className="h-3.5 w-3.5" /> היסטוריית פקודות (מקומית)
              </h3>
              <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                {history.map((h, i) => (
                  <li key={i} className="rounded-lg border px-2 py-1">
                    <span className="font-bold text-foreground">{OUTPUT_LABELS[h.type]}</span> · {h.at} · {h.preview}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <p className="pb-4 text-center text-xs text-muted-foreground">
          <Link to="/notebook" className="font-bold text-primary hover:underline">
            Notebook
          </Link>
          {" · "}
          <Link to="/catalog" className="font-bold text-primary hover:underline">
            קטלוג
          </Link>
          {" · "}
          SABAN MASTER CREATIVE ENGINE · אין פריסה ללא אישור
        </p>
      </main>
    </>
  );
}
