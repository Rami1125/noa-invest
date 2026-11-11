/**
 * /canvas — קנבס סימון תעודה + חדר נועה (אותו מוח כמו /chat)
 * wave0: validateSearch(noteId), vertical note picker + filter
 * + סריקת כתב-יד × PTO, הדבקת מסקנות, החתם תעודה
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
import { analyzeHandwritingAgainstPto, filterPtoForNote } from "@/lib/handwriting-match";
import type { IturanPtoEvent } from "@/lib/ituran-live";
import { HandwritingMatchPanel } from "@/components/HandwritingMatchPanel";
import noaStamp from "@/assets/noa.jpg";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Bot, Sparkles, Send, AlertTriangle, RefreshCw, Loader2,
  MessageSquare, FileText, Plug, Gauge, Crown, ScanSearch, Stamp, ClipboardCheck,
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
            <AlertTriangle className="h-5 w-5" /> כשל בטעינת תעודות
          </div>
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : "שגיאת שרת"}
          </p>
          <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("ml-1 h-3.5 w-3.5", isFetching && "animate-spin")} /> נסה שוב
          </Button>
        </Card>
      </div>
    );
  }

  return <CanvasWorkspace notesList={notesList} searchNoteId={searchNoteId} onRefresh={() => void refetch()} isFetching={isFetching} />;
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
  searchNoteId,
  onRefresh,
  isFetching,
}: {
  notesList: DeliveryNote[];
  searchNoteId?: string;
  onRefresh: () => void;
  isFetching: boolean;
}) {
  const [selectedId, setSelectedId] = useState(
    () => searchNoteId || notesList[0]?.id || "",
  );
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (searchNoteId) setSelectedId(searchNoteId);
  }, [searchNoteId]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return notesList;
    return notesList.filter((n) =>
      [n.id, n.customer, n.customerNo, n.comaxOrder, n.driver, (n as { siteAddress?: string }).siteAddress]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [notesList, filter]);

  const currentNote = useMemo(() => {
    return notesList.find((n) => n.id === selectedId) || notesList[0]!;
  }, [notesList, selectedId]);

  const { data: scanSrc } = useQuery({
    queryKey: ["scan", currentNote.fileId],
    enabled: !!currentNote.fileId,
    staleTime: Infinity,
    queryFn: async () => {
      const f = await getScanFn({ data: { fileId: currentNote.fileId as string } });
      return scanToDataUrl(f.mimeType, f.base64);
    },
  });

  const { data: ptoData, error: ptoError } = useQuery({
    queryKey: ["live-pto-canvas"],
    queryFn: () =>
      listPtoFn({
        data: { since: new Date(Date.now() - PTO_LOOKBACK_MS).toISOString() },
      }),
    staleTime: 60_000,
    retry: 1,
  });

  const sessions = useMemo(() => {
    try {
      const ptoEvents = (ptoData as { events?: unknown[] })?.events ?? [];
      return pairPtoEvents(ptoEvents as never[]);
    } catch {
      return [];
    }
  }, [ptoData]);

  const analysis = useMemo(() => {
    try {
      return analyzePto(sessions as never[], notesList as never[]);
    } catch {
      return { issues: [] as { id: string; title: string; description: string }[] };
    }
  }, [sessions, notesList]);

  const brainMeta: BackendMeta = useMemo(
    () => ({
      notesSource: "live",
      notesCount: notesList.length,
      ituranSource: ptoError ? "none" : sessions.length > 0 ? "ituran_pto_sheet" : "none",
      matchedStops: sessions.filter((s: { matchedNoteId?: string }) => s.matchedNoteId).length,
      unmatchedStops: sessions.filter((s: { matchedNoteId?: string }) => !s.matchedNoteId).length,
      visitsCount: sessions.length,
    }),
    [notesList.length, ptoError, sessions],
  );
  const evidenceLabel = EVIDENCE_LABEL_HE[evidenceFromMeta(brainMeta)];
  const fetchedAtLabel = useMemo(
    () =>
      new Date().toLocaleString("he-IL", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      }),
    [notesList.length, sessions.length],
  );

  const [chatMessages, setChatMessages] = useState<ChatMsg[]>(() => [
    {
      id: "welcome",
      sender: "noa",
      text: "חדר נועה בקנבס — סרקו כתב-יד, הצליבו מול PTO, הדביקו מסקנות על התעודה והחתם אחרי אימות.",
      timestamp: "",
      statusTag: "מוח חי · canvas",
    },
  ]);
  const [userInput, setUserInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [handAnalysis, setHandAnalysis] = useState<ReturnType<typeof analyzeHandwritingAgainstPto> | null>(null);
  const [pendingNoaText, setPendingNoaText] = useState<string | null>(null);
  const [lastScanOk, setLastScanOk] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setHandAnalysis(null);
    setLastScanOk(false);
    setPendingNoaText(null);
  }, [currentNote.id]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isThinking]);

  const buildFullContext = useCallback(
    (question: string) => {
      const n = currentNote;
      const b = n.deposits?.bales60002 || { delivered: 0, billed: 0 };
      const p = n.deposits?.pallets60060 || { delivered: 0, billed: 0 };
      const noteBlock = [
        "=== תעודה פעילה בקנבס ===",
        `תעודה: ${n.id} comax=${n.comaxOrder || n.id}`,
        `לקוח: ${n.customer || "—"} (${n.customerNo || "—"})`,
        `כתובת: ${(n as { siteAddress?: string }).siteAddress || (n as { address?: string }).address || "—"}`,
        `נהג: ${n.driver || "—"}`,
        `פקדונות 60002: ${b.delivered}/${b.billed} | 60060: ${p.delivered}/${p.billed}`,
        `מנוף/פריקה: ${(n as { craneNotes?: string; craneTime?: string }).craneNotes || (n as { craneTime?: string }).craneTime || "—"}`,
      ].join("\n");

      const grounding = buildNoaContext({
        meta: brainMeta,
        fetchedAt: fetchedAtLabel,
        notes: notesList as unknown as Record<string, unknown>[],
        visits: sessions.map(
          (s: { truck?: string; driver?: string; address?: string; matchedNoteId?: string; openIso?: string; closeIso?: string }) => ({
            truck: s.truck,
            driver: s.driver,
            fullAddress: s.address,
            noteIds: s.matchedNoteId ? [s.matchedNoteId] : [],
            ituranArrive: s.openIso,
            ituranDepart: s.closeIso,
          }),
        ),
        discrepancies: [],
        question,
      });

      const ptoLines = sessions
        .slice(0, 40)
        .map(
          (s: { date?: string; openIso?: string; closeIso?: string; truck?: string; address?: string; matchedNoteId?: string }) =>
            `PTO ${s.date || ""} ${s.openIso ? israelTime(s.openIso) : "?"}–${s.closeIso ? israelTime(s.closeIso) : "?"} truck=${s.truck || ""} addr=${s.address || ""} note=${s.matchedNoteId || "none"}`,
        )
        .join("\n");

      return [
        "מסך: קנבס סימון תעודת משלוח (ראמי)",
        noteBlock,
        grounding,
        "--- ptoSessions ---",
        ptoLines || "(אין PTO בטווח)",
        "constraints.noLiveGps=true",
        "עני בעברית, קצר ומדויק. אל תמציאי נתונים שלא בקונטקסט.",
      ].join("\n");
    },
    [currentNote, brainMeta, fetchedAtLabel, notesList, sessions],
  );

  const pushNoa = (text: string, statusTag?: string) => {
    setChatMessages((prev) => [
      ...prev,
      {
        id: `noa-${Date.now()}`,
        sender: "noa",
        text,
        timestamp: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
        statusTag,
      },
    ]);
  };

  const craneRawFromNote = (n: DeliveryNote) => {
    const any = n as DeliveryNote & { craneNotes?: string; craneTime?: string; craneTimeRaw?: string };
    return String(any.craneNotes || any.craneTimeRaw || any.craneTime || "").trim();
  };

  const ptoEventsForNote = (): IturanPtoEvent[] => {
    const addr = String((currentNote as { siteAddress?: string }).siteAddress || (currentNote as { address?: string }).address || "");
    const mapped: IturanPtoEvent[] = sessions.flatMap(
      (s: { truck?: string; driver?: string; address?: string; openIso?: string; closeIso?: string }) => {
        const ev: IturanPtoEvent[] = [];
        if (s.openIso) {
          ev.push({
            truck: s.truck || "",
            driver: s.driver || "",
            eventType: "pto_open",
            eventTimeIso: s.openIso,
            address: s.address || "",
          });
        }
        if (s.closeIso) {
          ev.push({
            truck: s.truck || "",
            driver: s.driver || "",
            eventType: "pto_close",
            eventTimeIso: s.closeIso,
            address: s.address || "",
          });
        }
        return ev;
      },
    );
    return filterPtoForNote(mapped, {
      noteId: currentNote.id,
      address: addr,
      dateHint: currentNote.date,
    });
  };

  const runHandwritingScan = () => {
    const b = currentNote.deposits?.bales60002 || { delivered: 0, billed: 0 };
    const p = currentNote.deposits?.pallets60060 || { delivered: 0, billed: 0 };
    const result = analyzeHandwritingAgainstPto({
      handwrittenRaw: craneRawFromNote(currentNote),
      noteId: currentNote.id,
      ptoEvents: ptoEventsForNote(),
      bales: b,
      pallets: p,
    });
    setHandAnalysis(result);
    setLastScanOk(true);
    pushNoa(result.conclusionsHe, "מאומת · כתב-יד × PTO");
  };

  const pasteConclusionsOnNote = () => {
    if (!handAnalysis?.stampText) {
      pushNoa("אין מסקנות להדבקה — לחצו קודם «סרוק כתב יד».", "מערכת");
      return;
    }
    setPendingNoaText(handAnalysis.stampText);
    pushNoa("מסקנות נועה מוכנות להדבקה על התעודה (שכבת טקסט ירוקה).", "הדבקה");
  };

  const requestSignNote = () => {
    if (!lastScanOk || !handAnalysis) {
      pushNoa("לפני החתמה יש להריץ סריקת כתב-יד והצלבת PTO.", "מערכת");
      return;
    }
    const depositBad = handAnalysis.deposits.some((d) => !d.ok);
    const mismatch = handAnalysis.rows.some((r) => r.matchKind === "mismatch" || r.flags.length > 0);
    pushNoa(
      [
        "בקשת החתמת תעודה — סיכום נועה:",
        handAnalysis.stampText,
        depositBad
          ? "⚠ יש חריגת פקדונות — ראמי חייב לאשר ידנית לפני החתמה סופית."
          : "✓ פקדונות תקינים לפי המקור.",
        mismatch
          ? "⚠ יש פער/דגל בכתב-יד מול PTO — לסקירת ראמי."
          : "✓ אין דגלי מנוף חריגים בפוענח.",
        "השלימו החתמה בכפתור השמירה בקנבס (ראמי) ל-Drive.",
      ].join("\n"),
      "החתם תעודה",
    );
    if (handAnalysis.stampText) setPendingNoaText(handAnalysis.stampText);
  };

  const handleSend = async (override?: string) => {
    const query = (override ?? userInput).trim();
    if (!query || isThinking) return;

    if (/סרוק כתב|הצלב.*pto|כתב.?יד.*מנוף/i.test(query)) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `rami-${Date.now()}`,
          sender: "rami",
          text: query,
          timestamp: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      setUserInput("");
      runHandwritingScan();
      return;
    }

    const userMsg: ChatMsg = {
      id: `rami-${Date.now()}`,
      sender: "rami",
      text: query,
      timestamp: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setUserInput("");

    if (asksCurrentGps(query)) {
      pushNoa(gpsUnavailableMessage(), "מקורות");
      return;
    }
    if (asksSourceStatus(query)) {
      pushNoa(describeSources(brainMeta, fetchedAtLabel), evidenceLabel);
      return;
    }

    setIsThinking(true);
    try {
      const history = [...chatMessages, userMsg]
        .filter((m) => m.id !== "welcome")
        .slice(-12)
        .map((m) => ({
          role: (m.sender === "rami" ? "user" : "assistant") as "user" | "assistant",
          content: m.text,
        }));

      const res = await askNoa({
        data: {
          messages: history,
          context: buildFullContext(query),
        },
      });
      pushNoa(res.text, `מוח · ${evidenceLabel}`);
    } catch (err) {
      pushNoa(`שגיאה מהמוח: ${err instanceof Error ? err.message : String(err)}`, "שגיאה");
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="flex h-[calc(100dvh-65px)] min-h-0 flex-col bg-background" dir="rtl">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Crown className="h-4 w-4 text-amber-500" />
          קנבס + חדר נועה
          <span className="text-xs font-normal text-muted-foreground">
            ת.מ. #{currentNote.id} · {sessions.length} PTO · {evidenceLabel}
          </span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={isFetching}>
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          </Button>
          <Link to="/chat" className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold">
            <MessageSquare className="h-3.5 w-3.5" /> צ׳אט
          </Link>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[220px_1fr_340px]">
        <aside className="hidden min-h-0 flex-col border-l lg:flex">
          <div className="border-b p-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="סינון תעודות..."
              className="w-full rounded-xl border bg-background px-3 py-2 text-xs"
            />
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {filtered.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setSelectedId(n.id)}
                className={cn(
                  "w-full rounded-xl border px-2.5 py-2 text-right text-xs transition",
                  n.id === currentNote.id ? "border-emerald-500/40 bg-emerald-500/10 font-bold" : "hover:bg-muted",
                )}
              >
                <div className="font-mono">#{n.id}</div>
                <div className="truncate text-muted-foreground">{n.customer}</div>
              </button>
            ))}
          </div>
        </aside>

        <div className="min-h-0 overflow-auto p-2">
          <DeliveryCanvasEditor
            note={currentNote}
            imageSrc={scanSrc || currentNote.scans?.[0]}
            stampSrc="/sing-rami.jpg"
            secondaryStampSrc={noaStamp}
            pendingNoaText={pendingNoaText}
            onPendingNoaTextConsumed={() => setPendingNoaText(null)}
          />
        </div>

        <div className="flex min-h-0 flex-col border-r">
          <Card className="flex min-h-0 flex-1 flex-col rounded-none border-0 shadow-none">
            <div className="flex items-center gap-2 border-b px-3 py-2 text-sm font-bold">
              <Bot className="h-4 w-4 text-emerald-600" />
              נועה · הצלבה וחתימה
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            </div>

            <div className="flex flex-wrap gap-1.5 border-b border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
              <button
                type="button"
                disabled={isThinking}
                onClick={() => runHandwritingScan()}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-600 px-2.5 py-1 text-[10px] font-extrabold text-white disabled:opacity-50"
              >
                <ScanSearch className="h-3 w-3" /> סרוק כתב יד × PTO
              </button>
              <button
                type="button"
                disabled={!handAnalysis}
                onClick={() => pasteConclusionsOnNote()}
                className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card px-2.5 py-1 text-[10px] font-bold disabled:opacity-50"
              >
                <Stamp className="h-3 w-3" /> הדבק מסקנות על התעודה
              </button>
              <button
                type="button"
                disabled={!lastScanOk}
                onClick={() => requestSignNote()}
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[10px] font-extrabold text-amber-900 disabled:opacity-50"
              >
                <ClipboardCheck className="h-3 w-3" /> החתם תעודה
              </button>
            </div>

            {handAnalysis && (
              <div className="max-h-48 overflow-auto border-b px-3 py-2">
                <HandwritingMatchPanel analysis={handAnalysis} compact />
              </div>
            )}

            <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
              {chatMessages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    m.sender === "noa"
                      ? "me-auto border border-emerald-500/20 bg-emerald-500/10"
                      : "ms-auto bg-primary text-primary-foreground",
                  )}
                >
                  {m.statusTag && <div className="mb-1 text-[10px] font-bold opacity-70">{m.statusTag}</div>}
                  <div className="whitespace-pre-wrap">{m.text}</div>
                  <div className="mt-1 text-[10px] opacity-60">{m.timestamp}</div>
                </div>
              ))}
              {isThinking && (
                <div className="me-auto inline-flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> נועה חושבת...
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            <form
              className="flex gap-2 border-t p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
            >
              <input
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="שאלה / סרוק כתב יד..."
                className="min-h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-emerald-500/50"
                disabled={isThinking}
              />
              <Button type="submit" size="sm" disabled={isThinking || !userInput.trim()} className="min-h-10 gap-1">
                <Send className="h-3.5 w-3.5" /> שלח
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
