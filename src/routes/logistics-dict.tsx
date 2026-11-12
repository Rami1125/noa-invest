/**
 * /logistics-dict — SABAN MASTER CREATIVE ENGINE 2026
 * מחולל פקודות מרכזי למחברת NotebookLM "יועץ טכני" של ח. סבן חומרי בניין (1994) בע"מ
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCopy,
  FileText,
  History,
  ImagePlus,
  Layers,
  Link2,
  Monitor,
  Package,
  Palette,
  Presentation,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Video,
  Warehouse,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { getPurchaseMatrixFn } from "@/lib/customer-history.functions";
import { cn } from "@/lib/utils";
import {
  type MediaItem,
  type MediaPriorityTier,
  MEDIA_TIER_LABELS,
  extractDriveFileId,
  drivePublicUrls,
  DEFAULT_STYLE,
} from "@/lib/logistics-dict/media";
import {
  type MasterConfigState,
  INITIAL_MASTER_CONFIG,
  loadMasterConfig,
  saveNewMasterVersion,
  restoreMasterVersion,
  resetToApprovedMaster,
} from "@/lib/logistics-dict/master-instructions";
import {
  type OutputType,
  type CounterScreenTemplate,
  type VideoFormatPreset,
  OUTPUT_TYPE_META,
  COUNTER_TEMPLATE_LABELS,
  assembleFinalPrompt,
} from "@/lib/logistics-dict/prompt-engine";

export const Route = createFileRoute("/logistics-dict")({
  head: () => ({ meta: [{ title: "SABAN MASTER CREATIVE ENGINE · מילון לוגיסטי — ח. סבן" }] }),
  component: LogisticsDictPage,
});

const CHART_COLORS = ["#15324B", "#0F766E", "#3B6E8C", "#52796F", "#858B91", "#2B5B84", "#0D9488", "#475569"];
const PROMPT_HISTORY_KEY = "saban_creative_prompt_history_v1";

type Focus =
  | { kind: "none" }
  | { kind: "product"; sku: string; name: string }
  | { kind: "customer"; customerNo: string; customerName: string };

type PromptHistoryEntry = {
  id: string;
  createdAt: string;
  outputType: OutputType;
  masterVersion: string;
  focusLabel: string;
  verified: boolean;
  prompt: string;
};

const OUTPUT_TYPE_ORDER: OutputType[] = [
  "slides",
  "video",
  "guide",
  "product_image",
  "marketing",
  "counter_screen",
  "focus_analysis",
];

function outputTypeIcon(type: OutputType) {
  switch (type) {
    case "slides":
      return Presentation;
    case "video":
      return Video;
    case "guide":
      return FileText;
    case "product_image":
      return Camera;
    case "marketing":
      return Sparkles;
    case "counter_screen":
      return Monitor;
    case "focus_analysis":
      return Layers;
  }
}

function LogisticsDictPage() {
  // --- אזור א: חיפוש ומיקוד בנתוני אמת ---
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<Focus>({ kind: "none" });

  // --- אזור ב: מנוע תמונות ומדיה ---
  const [driveInput, setDriveInput] = useState("");
  const [selectedMediaTier, setSelectedMediaTier] = useState<MediaPriorityTier>("manufacturer_official");
  const [imageNote, setImageNote] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // --- אזור ג: שכבת Creative Master ---
  const [masterConfig, setMasterConfig] = useState<MasterConfigState>(INITIAL_MASTER_CONFIG);
  const [masterDraft, setMasterDraft] = useState(INITIAL_MASTER_CONFIG.instructions);
  const [masterLabelDraft, setMasterLabelDraft] = useState("");
  const [masterSavedFeedback, setMasterSavedFeedback] = useState<string | null>(null);
  const [styleText, setStyleText] = useState(DEFAULT_STYLE);

  // --- אזור ד: בחירת תוצר והגדרות ---
  const [outputType, setOutputType] = useState<OutputType>("slides");
  const [slideCount, setSlideCount] = useState<number>(10);
  const [videoPreset, setVideoPreset] = useState<VideoFormatPreset>("explainer_pro");
  const [counterTemplate, setCounterTemplate] = useState<CounterScreenTemplate>("product_of_week");
  const [goal, setGoal] = useState(OUTPUT_TYPE_META.slides.defaultGoal);
  const [targetAudience, setTargetAudience] = useState(OUTPUT_TYPE_META.slides.defaultTargetAudience);
  const [userRequest, setUserRequest] = useState("");

  // --- אזור ה: פקודה, בקרת איכות והיסטוריה ---
  const [copied, setCopied] = useState(false);
  const [promptHistory, setPromptHistory] = useState<PromptHistoryEntry[]>([]);

  useEffect(() => {
    const loaded = loadMasterConfig();
    setMasterConfig(loaded);
    setMasterDraft(loaded.instructions);
    try {
      const rawHist = window.localStorage.getItem(PROMPT_HISTORY_KEY);
      if (rawHist) {
        const parsed = JSON.parse(rawHist) as PromptHistoryEntry[];
        if (Array.isArray(parsed)) setPromptHistory(parsed.slice(0, 15));
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  // עדכון ברירות מחדל של מטרה וקהל יעד רק אם לא הוזן טקסט מותאם אישית
  const handleSelectOutputType = (nextType: OutputType) => {
    const prevMeta = OUTPUT_TYPE_META[outputType];
    const nextMeta = OUTPUT_TYPE_META[nextType];
    if (!goal.trim() || goal === prevMeta.defaultGoal) {
      setGoal(nextMeta.defaultGoal);
    }
    if (!targetAudience.trim() || targetAudience === prevMeta.defaultTargetAudience) {
      setTargetAudience(nextMeta.defaultTargetAudience);
    }
    setOutputType(nextType);
  };

  // --- טעינת נתונים אמיתיים מהשרת (ללא שינוי API קיים) ---
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
    const map = new Map<
      string,
      { sku: string; name: string; qty: number; notes: number; customers: Set<string>; category?: string; unit: string }
    >();
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
    const map = new Map<
      string,
      { customerNo: string; customerName: string; products: Map<string, { name: string; qty: number; unit: string }> }
    >();
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
        productList: Array.from(c.products.entries())
          .map(([sku, v]) => ({ sku, ...v }))
          .sort((a, b) => b.qty - a.qty),
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
      if (c) {
        list = c.productList.map((pr) => ({
          sku: pr.sku,
          name: pr.name,
          qty: pr.qty,
          notes: 0,
          customers: new Set<string>(),
          unit: pr.unit,
        }));
      }
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
          return `- ${c.customerName} (#${c.customerNo}): ${Math.round(pr.qty)}`;
        });
      return {
        title: `מיקוד מוצר: ${focus.name} (מק"ט ${focus.sku})`,
        body: [
          p ? `כמות מצטברת בארכיון: ${Math.round(p.qty)} · תעודות: ${p.notes} · לקוחות: ${p.customers.size}` : "",
          d
            ? `נתוני מילון_לוגיסט: ${d.name} · קטגוריה: ${d.category || "—"} · יחידה: ${d.unit || "—"} · מחיר מחירון/מערכת: ${d.price || "לא צוין"}`
            : "סטטוס קטלוג: לא אותר במילון_לוגיסט",
          buyers.length ? "רוכשים מאומתים (פרטיות נשמרת — ללא מידע אישי מיותר):" : "",
          ...buyers,
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }
    if (focus.kind === "customer") {
      const c = byCustomer.find((x) => x.customerNo === focus.customerNo);
      if (!c) return null;
      return {
        title: `מיקוד לקוח: ${c.customerName} (#${c.customerNo})`,
        body: [
          `סה"כ פריטים בארכיון: ${Math.round(c.totalQty)} · ${c.productList.length} מק"טים (לצורך התוצר המבוקש בלבד, ללא חשיפת מידע מסחרי מיותר)`,
          "מוצרים שנרכשו:",
          ...c.productList.slice(0, 12).map((pr) => `- ${pr.sku} ${pr.name}: ${Math.round(pr.qty)}`),
        ].join("\n"),
      };
    }
    return null;
  }, [focus, products, byCustomer, dictBySku]);

  // --- פעולות מדיה ---
  const addDriveLink = useCallback(() => {
    setUploadError(null);
    const raw = driveInput.trim();
    if (!raw) return;
    const id = extractDriveFileId(raw);
    if (id) {
      const urls = drivePublicUrls(id);
      setMedia((prev) => [
        ...prev,
        {
          id: `drive-${id}-${Date.now()}`,
          name: `Drive ${id.slice(0, 8)}…`,
          publicUrl: urls.view,
          previewUrl: urls.view,
          source: "drive",
          tier: selectedMediaTier,
        },
      ]);
      setDriveInput("");
      return;
    }
    if (/^https?:\/\//i.test(raw)) {
      setMedia((prev) => [
        ...prev,
        {
          id: `url-${Date.now()}`,
          name: raw.split("/").pop()?.slice(0, 40) || "תמונה",
          publicUrl: raw,
          previewUrl: raw,
          source: "url",
          tier: selectedMediaTier,
        },
      ]);
      setDriveInput("");
      return;
    }
    setUploadError("הדביקו קישור Google Drive מלא או URL ציבורי לתמונה");
  }, [driveInput, selectedMediaTier]);

  const onFilePick = useCallback(
    async (files: FileList | null) => {
      setUploadError(null);
      if (!files?.length) return;
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      for (const file of Array.from(files)) {
        if (!allowed.includes(file.type)) {
          setUploadError("רק תמונות: JPG, PNG, WEBP, GIF");
          continue;
        }
        if (file.size > 8_000_000) {
          setUploadError("קובץ גדול מ-8MB — העלו ל-Drive ושתפו קישור");
          continue;
        }
        const previewUrl = URL.createObjectURL(file);
        setMedia((prev) => [
          ...prev,
          {
            id: `up-${Date.now()}-${file.name}`,
            name: file.name,
            publicUrl: "",
            previewUrl,
            source: "upload",
            tier: selectedMediaTier,
          },
        ]);
      }
    },
    [selectedMediaTier],
  );

  const removeMedia = (id: string) => {
    setMedia((prev) => {
      const item = prev.find((m) => m.id === id);
      if (item?.source === "upload" && item.previewUrl.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((m) => m.id !== id);
    });
  };

  // --- פעולות Creative Master ---
  const handleSaveMaster = () => {
    if (!masterDraft.trim()) return;
    const next = saveNewMasterVersion(masterConfig, masterDraft, masterLabelDraft);
    setMasterConfig(next);
    setMasterLabelDraft("");
    setMasterSavedFeedback(`נשמרה גרסה ${next.activeVersion} (הגרסה הקודמת גובתה בהיסטוריה)`);
    setTimeout(() => setMasterSavedFeedback(null), 3500);
  };

  const handleRestoreMaster = (ver: string) => {
    const next = restoreMasterVersion(masterConfig, ver);
    setMasterConfig(next);
    setMasterDraft(next.instructions);
    setMasterSavedFeedback(`שוחזרה גרסה ${ver}`);
    setTimeout(() => setMasterSavedFeedback(null), 3000);
  };

  const handleResetApprovedMaster = () => {
    const next = resetToApprovedMaster(masterConfig);
    setMasterConfig(next);
    setMasterDraft(next.instructions);
    setMasterSavedFeedback(`אופס לגרסה המאושרת (${next.activeVersion})`);
    setTimeout(() => setMasterSavedFeedback(null), 3000);
  };

  // --- הרכבת פקודה מרכזית ובקרת איכות ---
  const assembled = useMemo(() => {
    const kpiLine = `KPI מאומת: ${products.length} מקטים · ${matrix?.noteCount || 0} תעודות · ${matrix?.notesWithProducts || 0} עם פריטים · ${byCustomer.length} לקוחות · מילון_לוגיסט ${matrix?.dictRows || 0}`;
    const topProductsLines = products
      .slice(0, 8)
      .map((p, i) => `${i + 1}. ${p.name} (${p.sku}): ${Math.round(p.qty)} · ${p.notes} תע׳`);
    const topCustomersLines = byCustomer
      .slice(0, 6)
      .map((c) => `- ${c.customerName}: ${c.productList.slice(0, 3).map((p) => p.name).join(", ")}`);

    return assembleFinalPrompt({
      masterInstructions: masterConfig.instructions,
      masterVersion: masterConfig.activeVersion,
      styleText,
      outputType,
      slideCount,
      videoPreset,
      counterTemplate,
      goal,
      targetAudience,
      userRequest,
      verifiedData: {
        kpiLine,
        analysisLines: analysisPoints,
        topProductsLines,
        topCustomersLines,
        focusTitle: focusDetail?.title,
        focusBody: focusDetail?.body,
        hasRealSheetData: products.length > 0 || (matrix?.dictRows || 0) > 0,
        hasTechnicalSources: (matrix?.dictRows || 0) > 0,
        sourceTab: matrix?.sourceTab || "ארכיון_תעודות_גליה",
        dictTab: matrix?.dictTab || "מילון_לוגיסט",
      },
      media,
      imageNote,
    });
  }, [
    masterConfig,
    styleText,
    outputType,
    slideCount,
    videoPreset,
    counterTemplate,
    goal,
    targetAudience,
    userRequest,
    products,
    byCustomer,
    matrix,
    analysisPoints,
    focusDetail,
    media,
    imageNote,
  ]);

  const copyFinalPrompt = async () => {
    try {
      await navigator.clipboard.writeText(assembled.finalPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      const entry: PromptHistoryEntry = {
        id: `prm-${Date.now()}`,
        createdAt: assembled.metadata.CREATED_AT,
        outputType,
        masterVersion: assembled.metadata.MASTER_VERSION,
        focusLabel: focusDetail?.title || "כללי (כלל הארכיון)",
        verified: assembled.allPassed,
        prompt: assembled.finalPrompt,
      };
      setPromptHistory((prev) => {
        const next = [entry, ...prev].slice(0, 15);
        try {
          window.localStorage.setItem(PROMPT_HISTORY_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    } catch {
      // ignore clipboard errors
    }
  };

  const hasUnsavedMasterChanges = masterDraft.trim() !== masterConfig.instructions.trim();

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#1C2732]" dir="rtl">
      <PageHeader
        title="SABAN MASTER CREATIVE ENGINE"
        subtitle="מחולל פקודות NotebookLM «יועץ טכני» · ח. סבן חומרי בניין (1994) בע״מ"
        action={
          <button
            type="button"
            onClick={() => void purchaseQ.refetch()}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#15324B]/20 bg-[#FFFFFF] px-3.5 text-xs font-bold text-[#15324B] transition hover:bg-[#DCEAF3]/50 disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            רענון נתונים חיים
          </button>
        }
      />

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
        {/* סרגל חיוויים עליון (Status Indicators) */}
        <section
          aria-label="חיוויי מערכת פעילים"
          className="grid grid-cols-2 gap-2.5 rounded-2xl border border-[#15324B]/15 bg-[#E8E2D8]/55 p-3.5 sm:grid-cols-3 lg:grid-cols-6"
        >
          <StatusPill label="גרסת מאסטר פעילה" value={masterConfig.activeVersion} accent="navy" />
          <StatusPill
            label="תאריך עדכון"
            value={new Date(masterConfig.updatedAt).toLocaleDateString("he-IL")}
            accent="stone"
          />
          <StatusPill label="סוג תוצר" value={OUTPUT_TYPE_META[outputType].label} accent="emerald" />
          <StatusPill
            label="תמונות ומדיה"
            value={media.length > 0 ? `קיימות (${media.length})` : "אין (AI המחשה בלבד)"}
            accent={media.length > 0 ? "emerald" : "stone"}
          />
          <StatusPill
            label="מקורות מקצועיים"
            value={products.length > 0 ? "מאומתים מהגיליון" : "בטעינה / חסר"}
            accent={products.length > 0 ? "emerald" : "warn"}
          />
          <StatusPill
            label="מוכנות להעתקה"
            value={assembled.allPassed ? "מאומת ומוכן ✓" : `דורש תיקון (${assembled.warnings.length})`}
            accent={assembled.allPassed ? "emerald" : "warn"}
          />
        </section>

        {/* אזור א – נתונים אמיתיים (KPIs, ניתוח, מוצרים ולקוחות) */}
        <section className="space-y-4 rounded-3xl border border-[#15324B]/15 bg-[#FFFFFF] p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E8E2D8] pb-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold text-[#0F766E]">
                <Warehouse className="h-4 w-4" />
                אזור א׳ · נתונים חיים מאומתים ({matrix?.sourceTab || "ארכיון_תעודות_גליה"} ·{" "}
                {matrix?.dictTab || "מילון_לוגיסט"})
              </p>
              <h1 className="mt-1 font-display text-2xl font-extrabold text-[#15324B]">
                נתוני רכש, מק״טים ולקוחות אמת
              </h1>
            </div>
            {focus.kind !== "none" && (
              <div className="flex items-center gap-2 rounded-xl border border-[#0F766E]/30 bg-[#DCEAF3]/50 px-3 py-2 text-xs font-bold text-[#15324B]">
                <span>מיקוד פעיל: {focus.kind === "product" ? focus.name : focus.customerName}</span>
                <button
                  type="button"
                  onClick={() => setFocus({ kind: "none" })}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#15324B]/20 bg-[#FFFFFF] px-2 py-1 text-[11px] hover:bg-[#E8E2D8]"
                >
                  <X className="h-3 w-3" /> נקה מיקוד
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-6">
            {[
              ["מקטים פעילים", products.length],
              ["תעודות בארכיון", matrix?.noteCount || 0],
              ["תעודות עם פריטים", matrix?.notesWithProducts || 0],
              ["לקוחות", byCustomer.length],
              ["כמות מצטברת", Math.round(products.reduce((s, p) => s + p.qty, 0))],
              ["מילון_לוגיסט", matrix?.dictRows || 0],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-2xl border border-[#E8E2D8] bg-[#E8E2D8]/35 px-3.5 py-2.5"
              >
                <div className="text-[11px] font-semibold text-[#858B91]">{label}</div>
                <div className="mt-0.5 text-xl font-extrabold tabular-nums text-[#15324B]">{value}</div>
              </div>
            ))}
          </div>

          <ul className="grid gap-2 md:grid-cols-2">
            {analysisPoints.map((p, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 rounded-2xl border border-[#DCEAF3] bg-[#DCEAF3]/30 px-3.5 py-2.5 text-xs font-medium text-[#1C2732]"
              >
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#15324B] text-[10px] font-bold text-[#FFFFFF]">
                  {i + 1}
                </span>
                <span>{p}</span>
              </li>
            ))}
          </ul>

          <div className="grid gap-4 lg:grid-cols-[1.25fr_0.95fr]">
            <div className="rounded-2xl border border-[#E8E2D8] bg-[#FFFFFF] p-4">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-[#858B91]" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="חיפוש מקט / שם מוצר / קטגוריה…"
                  className="min-h-10 flex-1 rounded-xl border border-[#858B91]/30 px-3 text-sm text-[#1C2732] outline-none focus:border-[#0F766E]"
                />
              </div>
              <h2 className="mt-3 text-xs font-bold text-[#15324B]">מוצרים מובילים (לחיצה למיקוד פקודה)</h2>
              <div className="mt-2 h-60">
                {chartRows.length === 0 ? (
                  <div className="grid h-full place-items-center text-sm text-[#858B91]">
                    {loading ? "טוען נתונים מהגיליון…" : "אין פריטים להצגה"}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartRows} margin={{ bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E8E2D8" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#1C2732" }} interval={0} angle={-25} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 11, fill: "#1C2732" }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {chartRows.map((row, i) => (
                          <Cell
                            key={row.key}
                            fill={CHART_COLORS[i % CHART_COLORS.length]}
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

            <aside className="rounded-2xl border border-[#E8E2D8] bg-[#FFFFFF] p-4">
              <h2 className="flex items-center gap-2 text-xs font-bold text-[#15324B]">
                <Package className="h-4 w-4 text-[#0F766E]" /> רשימת מק״טים ({filtered.length})
              </h2>
              <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
                {filtered.slice(0, 60).map((p) => {
                  const active = focus.kind === "product" && focus.sku === p.sku;
                  return (
                    <button
                      key={p.sku}
                      type="button"
                      onClick={() => setFocus({ kind: "product", sku: p.sku, name: p.name })}
                      className={cn(
                        "flex w-full flex-col rounded-xl border px-3 py-2 text-start text-xs transition",
                        active
                          ? "border-[#0F766E] bg-[#DCEAF3]/60 font-bold text-[#15324B]"
                          : "border-transparent hover:bg-[#E8E2D8]/40",
                      )}
                    >
                      <span className="truncate font-semibold">{p.name}</span>
                      <span className="flex justify-between text-[#858B91]">
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

          <div className="rounded-2xl border border-[#E8E2D8] bg-[#FFFFFF] p-4">
            <h2 className="flex items-center gap-2 text-xs font-bold text-[#15324B]">
              <Users className="h-4 w-4 text-[#0F766E]" /> לקוחות בארכיון ({byCustomer.length}) — לחיצה למיקוד
            </h2>
            <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {byCustomer.slice(0, 45).map((c) => {
                const active = focus.kind === "customer" && focus.customerNo === c.customerNo;
                return (
                  <button
                    key={c.customerNo}
                    type="button"
                    onClick={() =>
                      setFocus({ kind: "customer", customerNo: c.customerNo, customerName: c.customerName })
                    }
                    className={cn(
                      "rounded-2xl border px-3 py-2.5 text-start transition",
                      active
                        ? "border-[#0F766E] bg-[#DCEAF3]/70"
                        : "border-[#E8E2D8] bg-[#E8E2D8]/20 hover:bg-[#E8E2D8]/45",
                    )}
                  >
                    <div className="flex justify-between text-xs font-bold text-[#15324B]">
                      <span className="truncate">
                        {c.customerName}{" "}
                        <span className="font-mono text-[10px] font-normal text-[#858B91]">#{c.customerNo}</span>
                      </span>
                      <span className="text-[11px] font-normal text-[#858B91]">
                        {Math.round(c.totalQty)} · {c.productList.length}
                      </span>
                    </div>
                    <ul className="mt-1 text-[11px] text-[#858B91]">
                      {c.productList.slice(0, 3).map((pr) => (
                        <li key={pr.sku} className="flex justify-between gap-2">
                          <span className="truncate">
                            <span className="font-mono text-[10px]">{pr.sku}</span> {pr.name}
                          </span>
                          <span>{Math.round(pr.qty)}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* אזור ב – מנוע תמונות ומדיה */}
        <section className="space-y-4 rounded-3xl border border-[#15324B]/15 bg-[#FFFFFF] p-5 shadow-sm md:p-6">
          <div className="border-b border-[#E8E2D8] pb-3">
            <p className="text-xs font-bold text-[#0F766E]">אזור ב׳ · מדיניות תמונות מקצועית (4 רמות עדיפות)</p>
            <h2 className="mt-0.5 flex items-center gap-2 font-display text-lg font-extrabold text-[#15324B]">
              <ImagePlus className="h-5 w-5 text-[#0F766E]" /> מדיה, תמונות יצרן וקישורי Drive
            </h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-bold text-[#15324B]">סיווג מקור התמונה (לפי סדר עדיפויות מחייב)</span>
              <select
                value={selectedMediaTier}
                onChange={(e) => setSelectedMediaTier(e.target.value as MediaPriorityTier)}
                className="min-h-11 w-full rounded-xl border border-[#858B91]/40 bg-[#FFFFFF] px-3 text-sm text-[#1C2732]"
              >
                {Object.entries(MEDIA_TIER_LABELS).map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-bold text-[#15324B]">הנחיית שימוש במדיה</span>
              <input
                value={imageNote}
                onChange={(e) => setImageNote(e.target.value)}
                placeholder="לדוגמה: תמונת שער · תאורת יום טבעית · ללא הסתרת טקסט"
                className="min-h-11 w-full rounded-xl border border-[#858B91]/40 px-3 text-sm text-[#1C2732]"
              />
            </label>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(e) => void onFilePick(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#15324B] px-4 text-sm font-bold text-[#FFFFFF] transition hover:bg-[#1C2732]"
            >
              <Upload className="h-4 w-4" /> העלאת צילום / תמונת יצרן
            </button>
            <div className="relative flex-1">
              <Link2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#858B91]" />
              <input
                value={driveInput}
                onChange={(e) => setDriveInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addDriveLink()}
                placeholder="הדבק קישור Google Drive ציבורי או URL ישיר לתמונת יצרן"
                className="min-h-11 w-full rounded-xl border border-[#858B91]/40 bg-[#FFFFFF] pr-10 pl-3 text-sm"
                dir="ltr"
              />
            </div>
            <button
              type="button"
              onClick={addDriveLink}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#15324B] px-4 text-sm font-bold text-[#15324B] hover:bg-[#DCEAF3]/50"
            >
              הוסף קישור
            </button>
          </div>

          {uploadError && <p className="text-xs font-bold text-red-700">{uploadError}</p>}

          {media.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {media.map((m) => (
                <div key={m.id} className="overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FFFFFF]">
                  <img src={m.previewUrl} alt={m.name} className="aspect-video w-full object-cover" />
                  <div className="space-y-1 p-2.5 text-[11px]">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate font-bold text-[#15324B]">{m.name}</span>
                      <button
                        type="button"
                        onClick={() => removeMedia(m.id)}
                        className="rounded p-1 text-red-600 hover:bg-red-50"
                        aria-label="הסר תמונה"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {m.tier && <div className="truncate text-[10px] text-[#0F766E]">{MEDIA_TIER_LABELS[m.tier]}</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-[#858B91]/50 bg-[#E8E2D8]/25 px-4 py-3 text-xs text-[#1C2732]">
              אין תמונות מצורפות — הפקודה תכלול אוטומטית את מדיניות <strong>המחשה חזותית AI בלבד</strong> (איסור לוגו בדוי, איסור הצגה כתמונת מוצר רשמית, וסגנון צילום אדריכלי ישראלי).
            </p>
          )}
        </section>

        {/* אזור ג – Creative Master & ניהול גרסאות */}
        <section className="space-y-4 rounded-3xl border border-[#15324B]/20 bg-[#E8E2D8]/30 p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#858B91]/25 pb-3">
            <div>
              <p className="text-xs font-bold text-[#0F766E]">אזור ג׳ · מקור האמת המרכזי (MASTER_INSTRUCTIONS)</p>
              <h2 className="mt-0.5 flex items-center gap-2 font-display text-lg font-extrabold text-[#15324B]">
                <ShieldCheck className="h-5 w-5 text-[#0F766E]" /> Creative Master · גרסה פעילה:{" "}
                <span className="font-mono text-[#0F766E]">{masterConfig.activeVersion}</span>
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveMaster}
                disabled={!hasUnsavedMasterChanges}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#0F766E] px-3.5 text-xs font-bold text-[#FFFFFF] transition hover:bg-[#0d645d] disabled:opacity-45"
              >
                <Save className="h-3.5 w-3.5" /> שמור גרסת מאסטר חדשה
              </button>
              <button
                type="button"
                onClick={handleResetApprovedMaster}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#15324B]/30 bg-[#FFFFFF] px-3 text-xs font-bold text-[#15324B] hover:bg-[#DCEAF3]/50"
              >
                <RotateCcw className="h-3.5 w-3.5" /> איפוס לגרסה מאושרת
              </button>
            </div>
          </div>

          {masterSavedFeedback && (
            <div className="rounded-xl border border-[#0F766E]/40 bg-[#FFFFFF] px-3.5 py-2 text-xs font-bold text-[#0F766E]">
              ✓ {masterSavedFeedback}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
            <div className="space-y-2">
              <label className="block space-y-1">
                <span className="text-xs font-bold text-[#15324B]">הנחיות מאסטר קבועות (מוזרקות לכל פקודה)</span>
                <textarea
                  value={masterDraft}
                  onChange={(e) => setMasterDraft(e.target.value)}
                  rows={8}
                  className="w-full rounded-2xl border border-[#858B91]/40 bg-[#FFFFFF] p-3 text-xs leading-relaxed text-[#1C2732] outline-none focus:border-[#0F766E]"
                />
              </label>
              <input
                value={masterLabelDraft}
                onChange={(e) => setMasterLabelDraft(e.target.value)}
                placeholder="תיאור קצר לגרסה החדשה (אופציונלי, לשמירה עם גיבוי)"
                className="min-h-10 w-full rounded-xl border border-[#858B91]/40 bg-[#FFFFFF] px-3 text-xs"
              />
            </div>

            <div className="space-y-3">
              <div className="rounded-2xl border border-[#858B91]/30 bg-[#FFFFFF] p-3.5">
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-[#15324B]">
                  <History className="h-3.5 w-3.5 text-[#0F766E]" /> היסטוריית גרסאות וגיבויים ({masterConfig.history.length})
                </h3>
                <div className="mt-2 max-h-36 space-y-1.5 overflow-y-auto">
                  {masterConfig.history.map((h) => {
                    const isCurrent = h.version === masterConfig.activeVersion;
                    return (
                      <div
                        key={h.version}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 text-[11px]",
                          isCurrent ? "border-[#0F766E] bg-[#DCEAF3]/50 font-bold" : "border-[#E8E2D8]",
                        )}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-mono text-[#15324B]">{h.version}</div>
                          <div className="truncate text-[10px] text-[#858B91]">{h.label}</div>
                        </div>
                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => handleRestoreMaster(h.version)}
                            className="shrink-0 rounded-lg border border-[#15324B]/30 px-2 py-1 text-[10px] font-bold text-[#15324B] hover:bg-[#DCEAF3]"
                          >
                            שחזר
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <label className="block space-y-1">
                <span className="flex items-center gap-1.5 text-xs font-bold text-[#15324B]">
                  <Palette className="h-3.5 w-3.5 text-[#0F766E]" /> שפה חזותית (Editorial Palette)
                </span>
                <textarea
                  value={styleText}
                  onChange={(e) => setStyleText(e.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-[#858B91]/40 bg-[#FFFFFF] p-2.5 text-[11px] leading-relaxed text-[#1C2732]"
                />
              </label>
            </div>
          </div>
        </section>

        {/* אזור ד – בחירת תוצר והגדרות הפקה */}
        <section className="space-y-4 rounded-3xl border border-[#15324B]/15 bg-[#FFFFFF] p-5 shadow-sm md:p-6">
          <div className="border-b border-[#E8E2D8] pb-3">
            <p className="text-xs font-bold text-[#0F766E]">אזור ד׳ · מנועי יצירה ייעודיים</p>
            <h2 className="mt-0.5 font-display text-lg font-extrabold text-[#15324B]">
              בחירת סוג תוצר, קהל יעד ומטרה
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
            {OUTPUT_TYPE_ORDER.map((type) => {
              const Icon = outputTypeIcon(type);
              const meta = OUTPUT_TYPE_META[type];
              const active = outputType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleSelectOutputType(type)}
                  className={cn(
                    "flex flex-col items-start gap-1.5 rounded-2xl border p-3 text-start transition",
                    active
                      ? "border-[#15324B] bg-[#15324B] text-[#FFFFFF] shadow-sm"
                      : "border-[#E8E2D8] bg-[#FFFFFF] text-[#1C2732] hover:border-[#15324B]/40 hover:bg-[#DCEAF3]/35",
                  )}
                >
                  <Icon className={cn("h-4 w-4", active ? "text-[#DCEAF3]" : "text-[#0F766E]")} />
                  <span className="text-xs font-extrabold">{meta.label}</span>
                  <span className={cn("text-[10px] leading-tight", active ? "text-[#DCEAF3]" : "text-[#858B91]")}>
                    {meta.shortDesc}
                  </span>
                </button>
              );
            })}
          </div>

          {/* תת-אפשרויות מותאמות לתוצר */}
          {outputType === "slides" && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#DCEAF3] bg-[#DCEAF3]/35 px-4 py-3 text-xs">
              <span className="font-bold text-[#15324B]">מספר שקפים (ברירת מחדל 8–12):</span>
              {[8, 10, 12].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSlideCount(n)}
                  className={cn(
                    "rounded-lg border px-3 py-1 font-bold",
                    slideCount === n
                      ? "border-[#15324B] bg-[#15324B] text-[#FFFFFF]"
                      : "border-[#858B91]/40 bg-[#FFFFFF] text-[#1C2732]",
                  )}
                >
                  {n} שקפים
                </button>
              ))}
            </div>
          )}

          {outputType === "video" && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#DCEAF3] bg-[#DCEAF3]/35 px-4 py-3 text-xs">
              <span className="font-bold text-[#15324B]">אורך סרטון יעד:</span>
              <button
                type="button"
                onClick={() => setVideoPreset("explainer_pro")}
                className={cn(
                  "rounded-lg border px-3 py-1.5 font-bold",
                  videoPreset === "explainer_pro"
                    ? "border-[#15324B] bg-[#15324B] text-[#FFFFFF]"
                    : "border-[#858B91]/40 bg-[#FFFFFF]",
                )}
              >
                סרטון הסבר מקצועי (70–90 שניות)
              </button>
              <button
                type="button"
                onClick={() => setVideoPreset("counter_60s")}
                className={cn(
                  "rounded-lg border px-3 py-1.5 font-bold",
                  videoPreset === "counter_60s"
                    ? "border-[#15324B] bg-[#15324B] text-[#FFFFFF]"
                    : "border-[#858B91]/40 bg-[#FFFFFF]",
                )}
              >
                סרטון מסכי דלפק (60 שניות)
              </button>
            </div>
          )}

          {outputType === "counter_screen" && (
            <div className="space-y-2 rounded-2xl border border-[#DCEAF3] bg-[#DCEAF3]/35 p-4 text-xs">
              <div className="font-bold text-[#15324B]">
                תבנית מסך דלפק (16:9 · 1920×1080 · RTL · כותרות גדולות):
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.entries(COUNTER_TEMPLATE_LABELS) as [CounterScreenTemplate, string][]).map(([k, lbl]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setCounterTemplate(k)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-start text-[11px] font-bold transition",
                      counterTemplate === k
                        ? "border-[#0F766E] bg-[#0F766E] text-[#FFFFFF]"
                        : "border-[#858B91]/30 bg-[#FFFFFF] text-[#1C2732] hover:bg-[#E8E2D8]/40",
                    )}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-bold text-[#15324B]">מטרת התוצר (חובה לבקרת איכות)</span>
              <input
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="הגדירו מטרה מדויקת..."
                className="min-h-10 w-full rounded-xl border border-[#858B91]/40 px-3 text-sm text-[#1C2732]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-bold text-[#15324B]">קהל יעד (חובה לבקרת איכות)</span>
              <input
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="קבלנים / לקוחות דלפק / צוות מכירות..."
                className="min-h-10 w-full rounded-xl border border-[#858B91]/40 px-3 text-sm text-[#1C2732]"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-bold text-[#15324B]">דגשים נוספים ובקשה מותאמת (אופציונלי)</span>
            <textarea
              value={userRequest}
              onChange={(e) => setUserRequest(e.target.value)}
              rows={2}
              placeholder="לדוגמה: להדגיש זמינות במחסן החרש 10 והתאמה לעבודת חוץ..."
              className="w-full rounded-xl border border-[#858B91]/40 p-3 text-sm text-[#1C2732]"
            />
          </label>
        </section>

        {/* אזור ה – הפקת פקודה, בקרת איכות והיסטוריה */}
        <section className="space-y-4 rounded-3xl border border-[#15324B]/25 bg-[#FFFFFF] p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8E2D8] pb-3">
            <div>
              <p className="text-xs font-bold text-[#0F766E]">אזור ה׳ · בקרת איכות והרכבת פקודת NotebookLM</p>
              <h2 className="mt-0.5 flex items-center gap-2 font-display text-lg font-extrabold text-[#15324B]">
                <BookOpen className="h-5 w-5 text-[#15324B]" /> פקודה סופית מאוחדת + מטא-נתונים
              </h2>
            </div>
            <button
              type="button"
              onClick={() => void copyFinalPrompt()}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-extrabold transition",
                copied
                  ? "bg-[#0F766E] text-[#FFFFFF]"
                  : assembled.allPassed
                  ? "bg-[#15324B] text-[#FFFFFF] hover:bg-[#1C2732]"
                  : "border-2 border-amber-600 bg-amber-50 text-amber-950 hover:bg-amber-100",
              )}
            >
              {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
              {copied
                ? "הפקודה הועתקה ונשמרה בהיסטוריה"
                : assembled.allPassed
                ? "העתק פקודה מאומתת ל-NotebookLM"
                : "העתק עם אזהרות בקרת איכות"}
            </button>
          </div>

          {/* בקרת איכות לפני העתקה (10 בדיקות) */}
          <div
            className={cn(
              "rounded-2xl border p-4",
              assembled.allPassed ? "border-[#0F766E]/30 bg-[#DCEAF3]/25" : "border-red-300 bg-red-50/70",
            )}
          >
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-extrabold text-[#15324B]">
                {assembled.allPassed ? (
                  <CheckCircle2 className="h-4 w-4 text-[#0F766E]" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-red-700" />
                )}
                בקרת איכות אוטומטית לפני העתקה ({assembled.checks.filter((c) => c.passed).length}/
                {assembled.checks.length} עברו)
              </span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                  assembled.allPassed ? "bg-[#0F766E] text-[#FFFFFF]" : "bg-red-700 text-[#FFFFFF]",
                )}
              >
                {assembled.allPassed ? "מאומת" : "לא מאומת — יש אזהרות"}
              </span>
            </div>

            {!assembled.allPassed && (
              <ul className="mb-3 space-y-1 rounded-xl border border-red-200 bg-[#FFFFFF] p-2.5 text-xs font-bold text-red-800">
                {assembled.warnings.map((w, idx) => (
                  <li key={idx}>⚠ {w}</li>
                ))}
              </ul>
            )}

            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
              {assembled.checks.map((c) => (
                <div
                  key={c.id}
                  title={c.detail}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px]",
                    c.passed
                      ? "border-[#E8E2D8] bg-[#FFFFFF] text-[#1C2732]"
                      : "border-red-300 bg-red-100/70 font-bold text-red-900",
                  )}
                >
                  <span>{c.passed ? "✓" : "✕"}</span>
                  <span className="truncate">{c.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* תצוגה מקדימה של הפקודה המלאה */}
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl border border-[#15324B]/20 bg-[#15324B] p-4 text-xs leading-relaxed text-[#FFFFFF]">
            {assembled.finalPrompt}
          </pre>

          {/* היסטוריית פקודות */}
          {promptHistory.length > 0 && (
            <div className="rounded-2xl border border-[#E8E2D8] bg-[#E8E2D8]/20 p-4">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-[#15324B]">
                <History className="h-3.5 w-3.5 text-[#0F766E]" /> היסטוריית פקודות שהופקו ({promptHistory.length})
              </h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {promptHistory.slice(0, 6).map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(h.prompt)}
                    className="rounded-xl border border-[#E8E2D8] bg-[#FFFFFF] p-2.5 text-start text-[11px] hover:border-[#0F766E]"
                  >
                    <div className="flex items-center justify-between font-bold text-[#15324B]">
                      <span>{OUTPUT_TYPE_META[h.outputType].label}</span>
                      <span className="font-mono text-[10px] text-[#0F766E]">{h.masterVersion}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[#858B91]">{h.focusLabel}</div>
                    <div className="mt-1 flex justify-between text-[10px] text-[#858B91]">
                      <span>{new Date(h.createdAt).toLocaleString("he-IL")}</span>
                      <span>{h.verified ? "מאומת ✓" : "עם אזהרות"}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <p className="pb-4 text-center text-xs text-[#858B91]">
          <Link to="/notebook" className="font-bold text-[#15324B] hover:underline">
            Notebook
          </Link>
          {" · "}
          <Link to="/catalog" className="font-bold text-[#15324B] hover:underline">
            קטלוג
          </Link>
          {" · "}SABAN MASTER CREATIVE ENGINE 2026
        </p>
      </main>
    </div>
  );
}

function StatusPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "navy" | "emerald" | "stone" | "warn";
}) {
  const styles = {
    navy: "border-[#15324B]/25 bg-[#FFFFFF] text-[#15324B]",
    emerald: "border-[#0F766E]/35 bg-[#FFFFFF] text-[#0F766E]",
    stone: "border-[#858B91]/30 bg-[#FFFFFF] text-[#1C2732]",
    warn: "border-amber-500/50 bg-amber-50 text-amber-900",
  }[accent];

  return (
    <div className={cn("rounded-xl border px-3 py-2", styles)}>
      <div className="text-[10px] font-semibold text-[#858B91]">{label}</div>
      <div className="mt-0.5 truncate text-xs font-extrabold">{value}</div>
    </div>
  );
}
