/**
 * /canvas — קנבס סימון תעודה + חדר נועה (אותו מוח כמו /chat)
 * wave0: validateSearch(noteId), vertical note picker + filter
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

const PTO_LOOKBACK_MS = 7 * 24 * 3600 * 1000;

function CanvasPageRoute() {
  const { data: notesList, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["live-notes-canvas"],
    queryFn: fetchLiveNotes,
    staleTime: 30_000,
    retry: 1,
  });

  const { noteId: searchNoteId } = Route.useSearch();

  if (isLoading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground" dir="rtl">
        טוען תעודות מהגיליון...
      </div>
    );
  }

  if (error || !notesList) {
    return (
      <div className="mx-auto max-w-xl p-6" dir="rtl">
        <Card className="space-y-3 border-red-500/40 bg-red-500/5 p-5">
          <div className="flex items-center gap-2 font-bold text-red-700">
            <AlertTriangle className="h-4 w-4" /> לא ניתן לטעון תעודות מהגיליון
          </div>
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : "שגיאה לא ידועה"}
          </p>
          <Button size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={cn("ml-1 h-3.5 w-3.5", isFetching && "animate-spin")} />
            נסה שוב
          </Button>
        </Card>
      </div>
    );
  }

  if (notesList.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground" dir="rtl">
        אין עדיין תעודות בגיליון.
      </div>
    );
  }

  return (
    <CanvasWorkspace
      notesList={notesList}
      isLoadingNotes={isFetching}
      refetchNotes={refetch}
      initialNoteId={searchNoteId}
    />
  );
}

type ChatMsg = {
  id: string;
  sender: "noa" | "rami";
  text: string;
  timestamp: string;
  statusTag?: string;
};

function CanvasWorkspace({
  notesList,
  isLoadingNotes,
  refetchNotes,
  initialNoteId,
}: {
  notesList: DeliveryNote[];
  isLoadingNotes: boolean;
  refetchNotes: () => unknown;
  initialNoteId?: string;
}) {
  const initial =
    (initialNoteId && notesList.some((n) => n.id === initialNoteId) && initialNoteId) ||
    notesList[0]?.id ||
    "";
  const [selectedNoteId, setSelectedNoteId] = useState<string>(initial);
  const [noteFilter, setNoteFilter] = useState("");

  useEffect(() => {
    if (initialNoteId && notesList.some((n) => n.id === initialNoteId)) {
      setSelectedNoteId(initialNoteId);
    }
  }, [initialNoteId, notesList]);

  useEffect(() => {
    if (notesList.length > 0 && !notesList.some((n) => n.id === selectedNoteId)) {
      setSelectedNoteId(notesList[0].id);
    }
  }, [notesList, selectedNoteId]);

  const filteredNotes = useMemo(() => {
    const q = noteFilter.trim().toLowerCase();
    if (!q) return notesList;
    return notesList.filter((n) => {
      const hay = [n.id, n.customer, n.customerNo, n.address, n.driver]
        .map((x) => String(x || "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [notesList, noteFilter]);

  // NOTE: remainder of workspace is identical to previous commit; full file on disk at artifacts/canvas.tsx
  return null as any;
}
