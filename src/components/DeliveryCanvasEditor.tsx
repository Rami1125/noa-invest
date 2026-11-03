import React, {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
  lazy,
  Suspense,
} from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Crown,
  Trash2,
  Edit3,
  Copy,
  RotateCcw,
  RotateCw,
  PenTool,
  FolderCheck,
  Download,
  ZoomIn,
  ZoomOut,
  Layers,
  Hand,
  MousePointerClick,
  Stamp,
  Loader2,
} from "lucide-react";
import type { DeliveryNote, DeliveryItem } from "@/lib/data";
import { approvals, playDispatchChime } from "@/lib/store";
import { saveSignedNoteStrict } from "@/lib/api";
import { saveCanvasDraft, loadCanvasDraft, clearCanvasDraft } from "@/lib/canvas-draft";
import { buildSignedNotePdf, downloadPdfBytes } from "@/lib/canvas-pdf";
import type {
  KonvaDeliveryStageHandle,
  DrawingPath,
  StampItem as KonvaStamp,
  StageTool,
} from "@/components/KonvaDeliveryStage";

/** Client-only — never import konva/react-konva at module top-level for SSR. */
const KonvaDeliveryStage = lazy(() => import("@/components/KonvaDeliveryStage"));

const HAREL_PHONE = "972506662300";
const DEFAULT_RAMI_STAMP = "/sing-rami.jpg";

interface StampItem {
  id: string;
  x: number;
  y: number;
  name: string;
  timeStr: string;
  kind: "rami" | "noa";
  w?: number;
  h?: number;
}
interface TextAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
}
type ToolMode = StageTool;

interface Props {
  note?: DeliveryNote;
  imageSrc?: string;
  stampSrc?: string;
  secondaryStampSrc?: string | { src: string };
}

export default function DeliveryCanvasEditor({
  note,
  imageSrc,
  stampSrc = DEFAULT_RAMI_STAMP,
  secondaryStampSrc,
}: Props) {
  const stageRef = useRef<KonvaDeliveryStageHandle | null>(null);
  const [mounted, setMounted] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerNo, setCustomerNo] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [signedBy, setSignedBy] = useState("");
  const [balesDelivered, setBalesDelivered] = useState(0);
  const [balesBilled, setBalesBilled] = useState(0);
  const [palletsDelivered, setPalletsDelivered] = useState(0);
  const [palletsBilled, setPalletsBilled] = useState(0);
  const [items, setItems] = useState<DeliveryItem[]>([]);
  const [toolMode, setToolMode] = useState<ToolMode>("pen");
  const [penColor] = useState("#1e3a8a");
  const [activeStampName, setActiveStampName] = useState("ראמי");
  const [textInput, setTextInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingToHarel, setIsSendingToHarel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [drawnPaths, setDrawnPaths] = useState<DrawingPath[]>([]);
  const [stampPlacements, setStampPlacements] = useState<StampItem[]>([]);
  const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([]);
  const [zoom, setZoom] = useState(1);
  const [layerVis, setLayerVis] = useState({
    scan: true,
    paths: true,
    stamps: true,
    texts: true,
  });
  const [draftLoaded, setDraftLoaded] = useState(false);
  type Snap = { paths: DrawingPath[]; stamps: StampItem[]; texts: TextAnnotation[] };
  const [past, setPast] = useState<Snap[]>([]);
  const [future, setFuture] = useState<Snap[]>([]);
  const skipHistoryRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const noaSrc =
    typeof secondaryStampSrc === "string"
      ? secondaryStampSrc
      : secondaryStampSrc?.src;

  const pushHistory = useCallback(() => {
    if (skipHistoryRef.current) return;
    setPast((p) => [
      ...p.slice(-39),
      { paths: drawnPaths, stamps: stampPlacements, texts: textAnnotations },
    ]);
    setFuture([]);
  }, [drawnPaths, stampPlacements, textAnnotations]);

  useEffect(() => {
    if (!note) return;
    setOrderId(note.id || "");
    setCustomerName(note.customer || "");
    setCustomerNo(note.customerNo || "");
    setDeliveryDate(note.date || new Date().toLocaleDateString("he-IL"));
    setSignedBy(note.signedBy || "ראמי מאסרווה בשטח ✅");
    setBalesDelivered(note.deposits?.bales60002?.delivered ?? 0);
    setBalesBilled(note.deposits?.bales60002?.billed ?? 0);
    setPalletsDelivered(note.deposits?.pallets60060?.delivered ?? 0);
    setPalletsBilled(note.deposits?.pallets60060?.billed ?? 0);
    setItems(Array.isArray(note.items) ? note.items : []);
    setPast([]);
    setFuture([]);
    setDraftLoaded(false);
    setDrawnPaths([]);
    setStampPlacements([]);
    setTextAnnotations([]);
    let cancelled = false;
    (async () => {
      const draft = await loadCanvasDraft(note.id);
      if (cancelled) return;
      if (draft) {
        skipHistoryRef.current = true;
        setDrawnPaths(draft.drawnPaths || []);
        setStampPlacements(
          (draft.stampPlacements || []).map((s, i) => ({
            id: s.id || `draft-s-${i}`,
            x: s.x,
            y: s.y,
            name: s.name,
            timeStr: s.timeStr,
            kind: (s.kind as "rami" | "noa") || "rami",
            w: s.w,
            h: s.h,
          })),
        );
        setTextAnnotations(
          (draft.textAnnotations || []).map((t, i) => ({
            ...t,
            id: t.id || `draft-t-${i}`,
          })),
        );
        if (draft.signedBy) setSignedBy(draft.signedBy);
        skipHistoryRef.current = false;
        toast.info("שוחזרה טיוטת עריכה מקומית");
      }
      setDraftLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [note?.id]);

  useEffect(() => {
    if (!orderId || !draftLoaded) return;
    const t = window.setTimeout(() => {
      void saveCanvasDraft(orderId, {
        drawnPaths,
        stampPlacements,
        textAnnotations,
        signedBy,
      });
    }, 600);
    return () => window.clearTimeout(t);
  }, [orderId, draftLoaded, drawnPaths, stampPlacements, textAnnotations, signedBy]);

  const totalItemsUnits = useMemo(
    () => items.reduce((s, i) => s + (Number(i.qty) || 0), 0),
    [items],
  );
  const totalEstimatedWeightKg = useMemo(
    () =>
      items.reduce(
        (s, i) => s + (Number(i.qty) || 0) * (Number(i.weightKg) || 0),
        0,
      ),
    [items],
  );
  const totalEstimatedWeightTons = (totalEstimatedWeightKg / 1000).toFixed(2);
  const auditSummary = useMemo(() => {
    if (note?.live) return { statusLabel: "טרם הוצלב מול קומקס/איתוראן" };
    const ok =
      balesDelivered === balesBilled &&
      palletsDelivered === palletsBilled &&
      items.every((i) => i.qty === i.ordered);
    return {
      statusLabel: ok ? "מאוזן 1:1 ומאומת ✅" : "קיימות אי-התאמות לבדיקה ⚠️",
    };
  }, [
    note?.live,
    items,
    balesDelivered,
    balesBilled,
    palletsDelivered,
    palletsBilled,
  ]);

  const getExportDataUrl = () =>
    stageRef.current?.toDataURL({ pixelRatio: 2 }) || "";

  const handleUndo = () => {
    if (!past.length) return;
    const prev = past[past.length - 1]!;
    setFuture((f) => [
      { paths: drawnPaths, stamps: stampPlacements, texts: textAnnotations },
      ...f,
    ]);
    setPast((p) => p.slice(0, -1));
    skipHistoryRef.current = true;
    setDrawnPaths(prev.paths);
    setStampPlacements(prev.stamps);
    setTextAnnotations(prev.texts);
    skipHistoryRef.current = false;
  };
  const handleRedo = () => {
    if (!future.length) return;
    const next = future[0]!;
    setPast((p) => [
      ...p,
      { paths: drawnPaths, stamps: stampPlacements, texts: textAnnotations },
    ]);
    setFuture((f) => f.slice(1));
    skipHistoryRef.current = true;
    setDrawnPaths(next.paths);
    setStampPlacements(next.stamps);
    setTextAnnotations(next.texts);
    skipHistoryRef.current = false;
  };
  const handleClear = () => {
    if (!drawnPaths.length && !stampPlacements.length && !textAnnotations.length)
      return;
    pushHistory();
    setDrawnPaths([]);
    setStampPlacements([]);
    setTextAnnotations([]);
  };

  const handleExportPdf = async () => {
    const dataUrl = getExportDataUrl();
    if (!dataUrl) {
      toast.error("הקנבס ריק");
      return;
    }
    setIsExportingPdf(true);
    try {
      const bytes = await buildSignedNotePdf([dataUrl], {
        noteId: orderId,
        customer: customerName,
        customerNo,
        signedBy,
        statusLabel: auditSummary.statusLabel,
        dateLabel: deliveryDate,
      });
      downloadPdfBytes(bytes, `teuda-${orderId}-signed.pdf`);
      toast.success("PDF חתום הורד");
    } catch (err) {
      toast.error("ייצוא PDF נכשל", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const dataUrl = getExportDataUrl();
      if (!dataUrl) throw new Error("הקנבס ריק");
      const res = await saveSignedNoteStrict({
        noteId: orderId,
        customer: customerName,
        signedBy,
        statusNote: `נבדק ונחתם ע\"י ראמי (${auditSummary.statusLabel})`,
        dataUrl,
      });
      playDispatchChime(0.7);
      await clearCanvasDraft(orderId);
      toast.success(`תעודה #${orderId} נשמרה ב-Drive`, {
        action: {
          label: "פתח",
          onClick: () => window.open(res.driveUrl, "_blank"),
        },
      });
    } catch (err) {
      toast.error("השמירה נכשלה", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendToHarel = async () => {
    setIsSendingToHarel(true);
    try {
      const dataUrl = getExportDataUrl();
      if (!dataUrl) throw new Error("הקנבס ריק");
      await saveSignedNoteStrict({
        noteId: orderId,
        customer: customerName,
        signedBy,
        statusNote: `אושר ע\"י ראמי והועבר להראל: ${totalItemsUnits} פריטים`,
        dataUrl,
      });
      playDispatchChime(0.9);
      approvals.rami(orderId, `אושר ע\"י ראמי: ${totalItemsUnits} פריטים`);
      await clearCanvasDraft(orderId);
      const text = encodeURIComponent(
        `👑 אישור תעודת משלוח #${orderId}\nלקוח: ${customerName}\nפריטים: ${totalItemsUnits} · משקל: ${totalEstimatedWeightTons} טון\n${auditSummary.statusLabel}`,
      );
      window.open(`https://wa.me/${HAREL_PHONE}?text=${text}`, "_blank");
      toast.success("נשלח להראל");
    } catch (err) {
      toast.error("שיגור נכשל", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSendingToHarel(false);
    }
  };

  return (
    <Card className="p-4 space-y-3 border-border rounded-2xl shadow-xs" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ["pen", "עט", PenTool],
              ["highlight", "מרקר", Stamp],
              ["text", "טקסט", Edit3],
              ["stamp", "חותמת", Stamp],
              ["select", "בחירה", MousePointerClick],
              ["pan", "הזזה", Hand],
            ] as const
          ).map(([mode, label, Icon]) => (
            <Button
              key={mode}
              size="sm"
              variant={toolMode === mode ? "default" : "outline"}
              className="h-8 text-xs rounded-xl gap-1"
              onClick={() => {
                setToolMode(mode);
                if (mode === "stamp") setActiveStampName("ראמי");
              }}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Button>
          ))}
          <div className="flex items-center gap-0.5 rounded-xl border p-0.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() =>
                setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))
              }
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <button
              type="button"
              className="min-w-[2.5rem] text-[11px] font-mono"
              onClick={() => setZoom(1)}
            >
              {Math.round(zoom * 100)}%
            </button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() =>
                setZoom((z) => Math.min(2.5, +(z + 0.1).toFixed(1)))
              }
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-1 text-[10px] border rounded-xl px-2 py-1">
            <Layers className="h-3 w-3" />
            {(["scan", "paths", "stamps", "texts"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`px-1 rounded ${
                  layerVis[k]
                    ? "bg-primary/15 text-primary"
                    : "opacity-40 line-through"
                }`}
                onClick={() => setLayerVis((v) => ({ ...v, [k]: !v[k] }))}
              >
                {k}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs gap-1"
            onClick={handleUndo}
            disabled={!past.length}
          >
            <RotateCcw className="h-3 w-3" />
            בטל
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs gap-1"
            onClick={handleRedo}
            disabled={!future.length}
          >
            <RotateCw className="h-3 w-3" />
            שחזר
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs gap-1"
            onClick={handleClear}
          >
            <Trash2 className="h-3 w-3" />
            נקה
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1"
            disabled={isExportingPdf}
            onClick={handleExportPdf}
          >
            <Download className="h-3.5 w-3.5" />
            {isExportingPdf ? "מייצא..." : "PDF"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1 font-bold"
            disabled={isSaving}
            onClick={handleSave}
          >
            <FolderCheck className="h-3.5 w-3.5 text-amber-600" />
            {isSaving ? "שומר..." : "שמור לגיליון"}
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1 font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={isSendingToHarel}
            onClick={handleSendToHarel}
          >
            <Crown className="h-3.5 w-3.5 text-amber-300" />
            {isSendingToHarel ? "משגר..." : "להראל 👑"}
          </Button>
        </div>
      </div>

      {toolMode === "stamp" && (
        <div className="flex gap-2 text-xs">
          <Button
            size="sm"
            variant={activeStampName === "ראמי" ? "default" : "outline"}
            onClick={() => setActiveStampName("ראמי")}
          >
            חותמת ראמי
          </Button>
          {noaSrc && (
            <Button
              size="sm"
              variant={activeStampName !== "ראמי" ? "default" : "outline"}
              onClick={() => setActiveStampName("נועה AI")}
            >
              חותמת נועה
            </Button>
          )}
          <span className="text-muted-foreground self-center">
            לחץ על התעודה להטבעה
          </span>
        </div>
      )}
      {toolMode === "text" && (
        <Input
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="הערת טקסט להטבעה..."
          className="text-sm"
        />
      )}

      <div className="flex items-center justify-between text-xs border-b pb-2">
        <span className="font-bold">
          תעודה #{orderId || "—"} · {customerName}
        </span>
        <Badge variant="outline" className="text-[10px]">
          {auditSummary.statusLabel}
        </Badge>
      </div>

      {!mounted ? (
        <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
          טוען עורך קנבס...
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="flex h-[320px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              טוען שכבות Konva...
            </div>
          }
        >
          <KonvaDeliveryStage
            ref={stageRef}
            width={800}
            height={1080}
            imageSrc={imageSrc || note?.scanImage || null}
            showVectorFallback
            drawnPaths={drawnPaths}
            stampPlacements={stampPlacements.map((s) => ({
              id: s.id,
              x: s.x,
              y: s.y,
              name: s.name,
              timeStr: s.timeStr,
              kind: s.kind,
              width: s.w ?? 160,
              height: s.h ?? 160,
            }))}
            textAnnotations={textAnnotations}
            toolMode={toolMode}
            penColor={penColor}
            activeStampKind={activeStampName === "ראמי" ? "rami" : "noa"}
            ramiStampSrc={stampSrc || DEFAULT_RAMI_STAMP}
            noaStampSrc={noaSrc}
            textInput={textInput}
            zoom={zoom}
            layerVis={layerVis}
            onPathsChange={setDrawnPaths}
            onStampsChange={(stamps: KonvaStamp[]) =>
              setStampPlacements(
                stamps.map((s) => ({
                  id: s.id,
                  x: s.x,
                  y: s.y,
                  name: s.name,
                  timeStr: s.timeStr,
                  kind: s.kind,
                  w: s.width,
                  h: s.height,
                })),
              )
            }
            onTextsChange={setTextAnnotations}
            onPushHistory={pushHistory}
            onTextConsumed={() => {
              setTextInput("");
              toast.success("הערת טקסט הוטבעה");
            }}
            onStampPlaced={() => {
              toast.success(`חותמת ${activeStampName} הוטבעה`);
              setToolMode("select");
            }}
          />
        </Suspense>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-muted/40 p-3 rounded-xl">
        <span>
          #{orderId}: {customerName} · {totalItemsUnits} פריטים ·{" "}
          {totalEstimatedWeightTons} טון
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs gap-1"
          onClick={() => {
            void navigator.clipboard.writeText(
              `תעודה #${orderId} · ${customerName} · ${totalItemsUnits} פריטים · ${totalEstimatedWeightTons} טון`,
            );
            toast.success("הועתק");
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          העתק סיכום
        </Button>
      </div>
    </Card>
  );
}
