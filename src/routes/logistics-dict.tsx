/**
 * /logistics-dict — SABAN MASTER CREATIVE ENGINE
 * מילון לוגיסטי · ארכיון · מחולל פקודות NotebookLM מקצועי
 * ח. סבן חומרי בניין (1994) בע״מ
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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

  // Minimal render while full body is restored — avoids 404 / blank page
  return (
    <>
      <PageHeader
        title="SABAN MASTER CREATIVE ENGINE"
        subtitle="מילון לוגיסטי · ארכיון · מחולל פקודות NotebookLM"
        actions={
          <button type="button" onClick={() => purchaseQ.refetch()} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> רענון
          </button>
        }
      />
      <main className="mx-auto max-w-7xl space-y-4 px-4 py-6" dir="rtl">
        <p className="text-sm text-muted-foreground">
          מנוע המאסטר פעיל. מקטים: {products.length} · לקוחות: {byCustomer.length} · תעודות: {matrix?.noteCount ?? 0}
        </p>
        <p className="text-xs text-amber-700">
          גרסת ממשק מלאה (אזורים א–ה) בהשלמה — הקבצים master / prompt-engine / media כבר ב-main.
        </p>
        <pre className="max-h-64 overflow-auto rounded-xl bg-stone-950 p-3 text-[10px] text-stone-100">
          {built?.prompt?.slice(0, 800) || "בחר סוג תוצר לאחר השלמת הממשק…"}
        </pre>
        <p className="text-center text-xs">
          <Link to="/notebook" className="font-bold text-primary">Notebook</Link>
          {" · "}
          <Link to="/catalog" className="font-bold text-primary">קטלוג</Link>
        </p>
      </main>
    </>
  );
}
