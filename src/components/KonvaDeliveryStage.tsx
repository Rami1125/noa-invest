/**
 * Wave2 — Konva layered delivery-note stage.
 * Layers: background scan · pen/highlight paths · text · draggable stamps
 */
import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import { Stage, Layer, Image as KonvaImage, Line, Text, Group, Rect } from "react-konva";
import type Konva from "konva";

export interface PathPoint { x: number; y: number; }
export interface DrawingPath {
  points: PathPoint[];
  color: string;
  width: number;
  type: "pen" | "highlight";
}
export interface StampItem {
  id: string;
  x: number;
  y: number;
  name: string;
  timeStr: string;
  kind: "rami" | "noa";
  width?: number;
  height?: number;
}
export interface TextAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
}
export type StageTool = "pen" | "highlight" | "text" | "stamp" | "select" | "pan";
export interface KonvaDeliveryStageHandle {
  toDataURL: (opts?: { pixelRatio?: number }) => string;
  getStageSize: () => { width: number; height: number };
}

interface Props {
  width?: number;
  height?: number;
  imageSrc?: string | null;
  showVectorFallback?: boolean;
  drawnPaths: DrawingPath[];
  stampPlacements: StampItem[];
  textAnnotations: TextAnnotation[];
  toolMode: StageTool;
  penColor: string;
  activeStampKind: "rami" | "noa";
  ramiStampSrc?: string;
  noaStampSrc?: string;
  textInput?: string;
  zoom: number;
  layerVis?: { scan: boolean; paths: boolean; stamps: boolean; texts: boolean };
  onPathsChange: (paths: DrawingPath[]) => void;
  onStampsChange: (stamps: StampItem[]) => void;
  onTextsChange: (texts: TextAnnotation[]) => void;
  onPushHistory: () => void;
  onTextConsumed?: () => void;
  onStampPlaced?: () => void;
}

function useHtmlImage(src?: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) { setImg(null); return; }
    const el = new window.Image();
    if (!src.startsWith("data:") && !src.startsWith("/")) el.crossOrigin = "anonymous";
    el.onload = () => setImg(el);
    el.onerror = () => setImg(null);
    el.src = src;
  }, [src]);
  return img;
}

function containFit(imgW: number, imgH: number, boxW: number, boxH: number) {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

const KonvaDeliveryStage = forwardRef<KonvaDeliveryStageHandle, Props>(
  function KonvaDeliveryStage(
    {
      width = 800,
      height = 1080,
      imageSrc,
      showVectorFallback = true,
      drawnPaths,
      stampPlacements,
      textAnnotations,
      toolMode,
      penColor,
      activeStampKind,
      ramiStampSrc = "/sing-rami.jpg",
      noaStampSrc,
      textInput = "",
      zoom,
      layerVis = { scan: true, paths: true, stamps: true, texts: true },
      onPathsChange,
      onStampsChange,
      onTextsChange,
      onPushHistory,
      onTextConsumed,
      onStampPlaced,
    },
    ref,
  ) {
    const stageRef = useRef<Konva.Stage | null>(null);
    const isDrawing = useRef(false);
    const currentPoints = useRef<number[]>([]);
    const [liveLine, setLiveLine] = useState<number[] | null>(null);
    const lastPan = useRef<{ x: number; y: number } | null>(null);
    const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

    const scanImg = useHtmlImage(imageSrc);
    const ramiImg = useHtmlImage(ramiStampSrc);
    const noaImg = useHtmlImage(noaStampSrc);

    useImperativeHandle(ref, () => ({
      toDataURL: (opts) => {
        const stage = stageRef.current;
        if (!stage) return "";
        const prevScale = stage.scaleX();
        const prevPos = { x: stage.x(), y: stage.y() };
        stage.scale({ x: 1, y: 1 });
        stage.position({ x: 0, y: 0 });
        const url = stage.toDataURL({ pixelRatio: opts?.pixelRatio ?? 2, mimeType: "image/png" });
        stage.scale({ x: prevScale, y: prevScale });
        stage.position(prevPos);
        return url;
      },
      getStageSize: () => ({ width, height }),
    }));

    const bgFit =
      scanImg && scanImg.naturalWidth > 0
        ? containFit(scanImg.naturalWidth, scanImg.naturalHeight, width, height)
        : null;

    const pointerPos = useCallback(() => {
      const stage = stageRef.current;
      if (!stage) return null;
      const p = stage.getPointerPosition();
      if (!p) return null;
      return stage.getAbsoluteTransform().copy().invert().point(p);
    }, []);

    const handlePointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
      if (toolMode === "pan") {
        lastPan.current = { x: e.evt.clientX, y: e.evt.clientY };
        return;
      }
      if (toolMode === "select") return;
      const pos = pointerPos();
      if (!pos) return;

      if (toolMode === "pen" || toolMode === "highlight") {
        isDrawing.current = true;
        currentPoints.current = [pos.x, pos.y];
        setLiveLine([pos.x, pos.y]);
        return;
      }
      if (toolMode === "text" && textInput.trim()) {
        onPushHistory();
        onTextsChange([
          ...textAnnotations,
          {
            id: `t-${Date.now()}`,
            x: pos.x,
            y: pos.y,
            text: `✍️ ${textInput.trim()}`,
            color: penColor === "#1e3a8a" ? "#dc2626" : penColor,
          },
        ]);
        onTextConsumed?.();
        return;
      }
      if (toolMode === "stamp") {
        const stampW = activeStampKind === "rami" ? 160 : 140;
        const stampH = stampW;
        const now = new Date();
        const timeStr = `${now.toLocaleDateString("he-IL")} ${now.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
        onPushHistory();
        onStampsChange([
          ...stampPlacements,
          {
            id: `s-${Date.now()}`,
            x: Math.max(0, Math.min(width - stampW, pos.x - stampW / 2)),
            y: Math.max(0, Math.min(height - stampH, pos.y - stampH / 2)),
            name: activeStampKind === "rami" ? "ראמי מסארווה" : "נועה AI",
            timeStr,
            kind: activeStampKind,
            width: stampW,
            height: stampH,
          },
        ]);
        onStampPlaced?.();
      }
    };

    const handlePointerMove = (e: Konva.KonvaEventObject<PointerEvent>) => {
      if (toolMode === "pan" && lastPan.current) {
        const dx = e.evt.clientX - lastPan.current.x;
        const dy = e.evt.clientY - lastPan.current.y;
        lastPan.current = { x: e.evt.clientX, y: e.evt.clientY };
        setStagePos((p) => ({ x: p.x + dx, y: p.y + dy }));
        return;
      }
      if (!isDrawing.current) return;
      const pos = pointerPos();
      if (!pos) return;
      currentPoints.current = [...currentPoints.current, pos.x, pos.y];
      setLiveLine([...currentPoints.current]);
    };

    const handlePointerUp = () => {
      lastPan.current = null;
      if (!isDrawing.current) return;
      isDrawing.current = false;
      const pts = currentPoints.current;
      currentPoints.current = [];
      setLiveLine(null);
      if (pts.length < 4) return;
      const points: PathPoint[] = [];
      for (let i = 0; i < pts.length; i += 2) points.push({ x: pts[i]!, y: pts[i + 1]! });
      onPushHistory();
      onPathsChange([
        ...drawnPaths,
        {
          points,
          color: toolMode === "highlight" ? "rgba(255, 235, 59, 0.45)" : penColor,
          width: toolMode === "highlight" ? 24 : 3,
          type: toolMode === "highlight" ? "highlight" : "pen",
        },
      ]);
    };

    const onStampDragEnd = (id: string, x: number, y: number) => {
      onPushHistory();
      onStampsChange(stampPlacements.map((s) => (s.id === id ? { ...s, x, y } : s)));
    };

    const displayW = width * zoom;
    const displayH = height * zoom;
    const cursor =
      toolMode === "pan" ? "grab" : toolMode === "text" ? "text" : toolMode === "select" ? "default" : "crosshair";

    return (
      <div className="w-full overflow-auto bg-slate-100/80 dark:bg-slate-900/40 rounded-xl" style={{ maxHeight: "min(75vh, 900px)" }}>
        <div style={{ width: displayW, height: displayH, margin: "0 auto", cursor }}>
          <Stage
            ref={stageRef as React.RefObject<Konva.Stage>}
            width={width}
            height={height}
            scaleX={zoom}
            scaleY={zoom}
            x={stagePos.x}
            y={stagePos.y}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            style={{ width: displayW, height: displayH, touchAction: "none" }}
          >
            <Layer listening={false}>
              <Rect x={0} y={0} width={width} height={height} fill="#ffffff" />
              {bgFit && scanImg && layerVis.scan ? (
                <KonvaImage image={scanImg} x={bgFit.x} y={bgFit.y} width={bgFit.w} height={bgFit.h} />
              ) : showVectorFallback ? (
                <>
                  <Rect x={20} y={20} width={width - 40} height={height - 40} stroke="#cbd5e1" strokeWidth={1.5} />
                  <Text text="סריקה לא זמינה — מצב וקטורי" x={40} y={60} fontSize={18} fill="#64748b" fontFamily="Assistant, Arial, sans-serif" />
                </>
              ) : null}
            </Layer>
            <Layer listening={false} visible={layerVis.paths}>
              {drawnPaths.map((path, idx) => {
                const flat: number[] = [];
                path.points.forEach((p) => { flat.push(p.x, p.y); });
                return (
                  <Line key={`path-${idx}`} points={flat} stroke={path.color} strokeWidth={path.width} lineCap="round" lineJoin="round" opacity={path.type === "highlight" ? 0.85 : 1} />
                );
              })}
              {liveLine && liveLine.length >= 4 && (
                <Line points={liveLine} stroke={toolMode === "highlight" ? "rgba(255, 235, 59, 0.45)" : penColor} strokeWidth={toolMode === "highlight" ? 24 : 3} lineCap="round" lineJoin="round" />
              )}
            </Layer>
            <Layer listening={toolMode === "select"} visible={layerVis.texts}>
              {textAnnotations.map((anno) => (
                <Text
                  key={anno.id}
                  x={anno.x}
                  y={anno.y}
                  text={anno.text}
                  fontSize={18}
                  fill={anno.color}
                  fontStyle="bold"
                  fontFamily="Assistant, Arial, sans-serif"
                  draggable={toolMode === "select"}
                  onDragEnd={(e) => {
                    onPushHistory();
                    onTextsChange(textAnnotations.map((t) => (t.id === anno.id ? { ...t, x: e.target.x(), y: e.target.y() } : t)));
                  }}
                />
              ))}
            </Layer>
            <Layer visible={layerVis.stamps}>
              {stampPlacements.map((stamp) => {
                const img = stamp.kind === "rami" ? ramiImg : noaImg;
                const w = stamp.width ?? 160;
                const h = stamp.height ?? 160;
                return (
                  <Group
                    key={stamp.id}
                    x={stamp.x}
                    y={stamp.y}
                    draggable={toolMode === "select" || toolMode === "stamp"}
                    onDragEnd={(e) => onStampDragEnd(stamp.id, e.target.x(), e.target.y())}
                  >
                    {img ? (
                      <KonvaImage image={img} width={w} height={h} />
                    ) : (
                      <Group>
                        <Rect width={w} height={h} fill="rgba(59,130,246,0.12)" stroke="#3b82f6" strokeWidth={2} cornerRadius={12} />
                        <Text text={stamp.name} width={w} align="center" y={h / 2 - 10} fontSize={12} fill="#1e3a8a" fontStyle="bold" />
                      </Group>
                    )}
                    <Text text={stamp.timeStr} y={h + 2} width={w} align="center" fontSize={10} fill="#475569" />
                  </Group>
                );
              })}
            </Layer>
          </Stage>
        </div>
      </div>
    );
  },
);

export default KonvaDeliveryStage;
