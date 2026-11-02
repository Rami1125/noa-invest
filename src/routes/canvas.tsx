/**
 * /canvas — קנבס סימון תעודה + חדר נועה (אותו מוח כמו /chat)
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import DeliveryCanvasEditor from "@/components/DeliveryCanvasEditor";
import { type DeliveryNote } from "@/lib/data";
import { fetchLiveNotes } from "@/lib/api";
import { getScanFn, listPtoFn } from "@/lib/notes-api.functions";
import { scanToDataUrl } from "@/lib/scan-render";
import { askNoa } from "@/lib/ai.functions";
import {
  buildNoaContext,
  describeSources,
  evidenceFromMeta,
  EVIDENCE_LABEL_HE,
  asksSourceStatus,
  asksCurrentGps,
  gpsUnavailableMessage,
  type BackendMeta,
} from "@/lib/chat-grounding";
import { pairPtoEvents, analyzePto, israelTime } from "@/lib/smart-dispatch/pto-pairing";
import noaStamp from "@/assets/noa.jpg";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Bot, Sparkles, Send, AlertTriangle, RefreshCw, Loader2,
  MessageSquare, FileText, Plug, Gauge, Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/canvas")({
  head: () => ({ meta: [{ title: "קנבס + נועה — ח. סבן" }] }),
  validateSearch: (search: Record<string, unknown>) => {
    const raw = search.noteId ?? search.id ?? "";
    const noteId = typeof raw === "string" ? raw.trim() : String(raw || "").trim();
    return { noteId: noteId || undefined };
  },
  component: CanvasPageRoute,
});
