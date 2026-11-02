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
      setsetSelectedNoteId(notesList[0].id);
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

  const currentNote = useMemo(() => {
    const raw = notesList.find((n) => n.id === selectedNoteId) || notesList[0];
    return {
      ...raw,
      items: Array.isArray(raw.items) ? raw.items : [],
      deposits: {
        bales60002: raw.deposits?.bales60002 || { delivered: 0, billed: 0 },
        pallets60060: raw.deposits?.pallets60060 || { delivered: 0, billed: 0 },
      },
    };
  }, [notesList, selectedNoteId]);

  const {
    data: scanImageSrc,
    isLoading: isLoadingScan,
    error: scanError,
    refetch: refetchScan,
  } = useQuery({
    queryKey: ["scan", currentNote.fileId],
    enabled: !!currentNote.fileId,
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const f = await getScanFn({ data: { fileId: currentNote.fileId as string } });
      return scanToDataUrl(f.mimeType, f.base64);
    },
  });

  const { data: ptoData, error: ptoError } = useQuery({
    queryKey: ["pto-canvas"],
    queryFn: () =>
      listPtoFn({
        data: { since: new Date(Date.now() - PTO_LOOKBACK_MS).toISOString() },
      }),
    staleTime: 60_000,
    retry: 1,
  });

  const ptoEvents = useMemo(() => {
    const ev = (ptoData as { events?: unknown[] } | undefined)?.events;
    return Array.isArray(ev) ? ev : [];
  }, [ptoData]);

  const sessions = useMemo(() => {
    try {
      return pairPtoEvents(ptoEvents as never[]);
    } catch {
      return [];
    }
  }, [ptoEvents]);

  const analysis = useMemo(() => {
    try {
      return analyzePto(sessions as never[], notesList as never[]);
    } catch {
      return { issues: [] as { id: string }[] };
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
      warning: ptoError
        ? ptoError instanceof Error
          ? ptoError.message
          : String(ptoError)
        : undefined,
    }),
    [notesList.length, ptoError, sessions],
  );

  const evidence = evidenceFromMeta(brainMeta);
  const evidenceLabel = EVIDENCE_LABEL_HE[evidence];
  const fetchedAtLabel = useMemo(
    () =>
      new Date().toLocaleString("he-IL", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notesList.length, sessions.length],
  );

  const [chatMessages, setChatMessages] = useState<ChatMsg[]>(() => [
    {
      id: "welcome",
      sender: "noa",
      text: "חדר נועה בקנבס מחובר לאותו מוח כמו הצ׳אט — תעודות + איתוראן PTO. סמן על התעודה ושאל אותי על פקדונות, מנוף או הצלבה.",
      timestamp: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
      statusTag: "מוח חי · canvas",
    },
  ]);
  const [userInput, setUserInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

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
        `כתובת: ${(n as { siteAddress?: string }).siteAddress || n.address || "—"}`,
        `נהג: ${n.driver || "—"}`,
        `פקדונות 60002: ${b.delivered}/${b.billed} | 60060: ${p.delivered}/${p.billed}`,
        `מנוף/פריקה: ${(n as { craneNotes?: string; craneTime?: string }).craneNotes || (n as { craneTime?: string }).craneTime || "—"}`,
        `driveUrl: ${n.driveUrl || "—"} fileId: ${n.fileId || "—"}`,
      ].join("\n");

      const grounding = buildNoaContext({
        meta: brainMeta,
        fetchedAt: fetchedAtLabel,
        notes: notesList as unknown as Record<string, unknown>[],
        visits: sessions.map(
          (s: {
            truck?: string;
            driver?: string;
            address?: string;
            matchedNoteId?: string;
            openIso?: string;
            closeIso?: string;
          }) => ({
            truck: s.truck,
            driver: s.driver,
            fullAddress: s.address,
            noteIds: s.matchedNoteId ? [s.matchedNoteId] : [],
            ituranArrive: s.openIso,
            ituranDepart: s.closeIso,
          }),
        ),
        discrepancies: analysis.issues || [],
        question,
      });

      const ptoLines = sessions
        .slice(0, 15)
        .map(
          (s: {
            date?: string;
            openIso?: string;
            closeIso?: string;
            truck?: string;
            address?: string;
            matchedNoteId?: string;
          }) =>
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
    [currentNote, brainMeta, fetchedAtLabel, notesList, sessions, analysis.issues],
  );

  const pushNoa = (text: string, statusTag?: string) => {
    setChatMessages((prev) => [
      ...prev,
      {
        id: `noa-${Date.now()}`,
        sender: "noa",
        text,
        timestamp: new Date().toLocaleTimeString("he-IL", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        statusTag,
      },
    ]);
  };

  const handleSend = async (override?: string) => {
    const query = (override ?? userInput).trim();
    if (!query || isThinking) return;

    const userMsg: ChatMsg = {
      id: `rami-${Date.now()}`,
      sender: "rami",
      text: query,
      timestamp: new Date().toLocaleTimeString("he-IL", {
        hour: "2-digit",
        minute: "2-digit",
      }),
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
      pushNoa(
        `שגיאה מהמוח: ${err instanceof Error ? err.message : String(err)}`,
        "שגיאה",
      );
    } finally {
      setIsThinking(false);
    }
  };

  const quickActions = [
    {
      id: "src",
      label: "מקורות",
      query: "אילו מקורות נתונים מחוברים כרגע?",
      icon: Plug,
    },
    {
      id: "note",
      label: "על התעודה",
      query: `סכמי את תעודה ${currentNote.id} ללקוח ${currentNote.customer || ""} — פקדונות, מנוף וחריגות`,
      icon: FileText,
    },
    {
      id: "pto",
      label: "מנוף PTO",
      query: `כמה פתיחות מנוף יש לאתר של ${currentNote.customer || currentNote.address || "התעודה"} לפי איתוראן?`,
      icon: Gauge,
    },
    {
      id: "inq",
      label: "שלח לבירור",
      query: `מה לבדוק בבירור על ת.מ. ${currentNote.id}?`,
      icon: MessageSquare,
    },
  ];

  return (
    <div className="relative min-h-[calc(100dvh-4rem)]" dir="rtl">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_rgba(16,185,129,0.12),_transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(59,130,246,0.1),_transparent_45%)]"
      />

      <div className="mx-auto max-w-[1400px] space-y-4 px-3 py-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-extrabold md:text-2xl">
              קנבס תעודה · חדר נועה
            </h1>
            <p className="text-xs text-muted-foreground">
              יד ימינו של ראמי · grounding זהה לצ׳אט · {evidenceLabel} ·{" "}
              {notesList.length} תעודות · {sessions.length} ביקורי PTO
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/chat"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              צ׳אט מלא
            </Link>
            <Link
              to="/inquiry"
              search={{ task: currentNote.id }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 text-xs font-bold text-orange-900"
            >
              בירור ראמי
            </Link>
            <Link
              to="/harel"
              search={{ task: currentNote.id }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-bold"
            >
              <Crown className="h-3.5 w-3.5" />
              הראל
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/80 p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <input
              value={noteFilter}
              onChange={(e) => setNoteFilter(e.target.value)}
              placeholder="חיפוש תעודה, לקוח, כתובת, נהג…"
              className="min-h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-emerald-500/50"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void refetchNotes()}
              disabled={isLoadingNotes}
              className="min-h-10 shrink-0"
              title="רענון תעודות"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isLoadingNotes && "animate-spin")} />
            </Button>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto pe-1 sm:max-h-48">
            {filteredNotes.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">לא נמצאו תעודות לסינון</p>
            ) : (
              filteredNotes.map((note) => {
                const active = selectedNoteId === note.id;
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => setSelectedNoteId(note.id)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-start transition",
                      active
                        ? "border-emerald-500/40 bg-emerald-500/10 shadow-sm"
                        : "border-transparent bg-muted/40 hover:border-border hover:bg-muted/70",
                    )}
                  >
                    <span className="text-xs font-extrabold">
                      ת.מ. {note.id}
                      {note.comaxOrder ? (
                        <span className="ms-1 font-semibold text-muted-foreground">· הזמנה {note.comaxOrder}</span>
                      ) : null}
                    </span>
                    <span className="line-clamp-1 text-[11px] text-muted-foreground">
                      {note.customer || "ללא שם"}
                      {note.address ? ` · ${note.address}` : ""}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {filteredNotes.length} מתוך {notesList.length} תעודות
            {selectedNoteId ? ` · נבחרה ${selectedNoteId}` : ""}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7 lg:order-2">
            <Card className="space-y-3 rounded-2xl p-4">
              <div className="flex items-center justify-between border-b pb-2 text-xs">
                <span className="font-bold">
                  תעודה #{currentNote.comaxOrder || currentNote.id} ·{" "}
                  {currentNote.customer}
                </span>
                {currentNote.driveUrl && (
                  <a
                    href={currentNote.driveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-primary hover:underline"
                  >
                    PDF מקורי
                  </a>
                )}
              </div>
              {!currentNote.fileId ? (
                <p className="p-6 text-center text-sm text-red-700">אין קובץ סריקה מקושר</p>
              ) : isLoadingScan ? (
                <p className="p-10 text-center text-sm text-muted-foreground">
                  <RefreshCw className="ml-2 inline h-4 w-4 animate-spin" /> טוען סריקה...
                </p>
              ) : scanError || !scanImageSrc ? (
                <div className="space-y-2 p-6 text-center">
                  <p className="text-sm font-bold text-red-700">לא ניתן לטעון סריקה</p>
                  <Button size="sm" onClick={() => void refetchScan()}>
                    נסה שוב
                  </Button>
                </div>
              ) : (
                <DeliveryCanvasEditor
                  key={currentNote.id}
                  note={currentNote}
                  imageSrc={scanImageSrc}
                  stampSrc="/sing-rami.jpg"
                  secondaryStampSrc={noaStamp}
                />
              )}
            </Card>
          </div>

          <div className="lg:col-span-5 lg:order-1">
            <Card className="flex h-[min(720px,calc(100dvh-12rem))] flex-col overflow-hidden rounded-2xl border-emerald-500/20 shadow-lg">
              <div className="flex items-center gap-3 border-b border-emerald-500/20 bg-gradient-to-l from-emerald-500/15 to-sky-500/10 px-4 py-3">
                <div className="relative">
                  <img
                    src={noaStamp}
                    alt="נועה"
                    className="h-11 w-11 rounded-full border-2 border-emerald-500/40 object-cover"
                  />
                  <span className="absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-extrabold">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                    חדר נועה
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    יד ימינו של ראמי · {evidenceLabel} · ת.מ. {currentNote.id}
                  </div>
                </div>
                <Bot className="h-4 w-4 text-emerald-600" />
              </div>

              <div className="flex flex-wrap gap-1.5 border-b bg-muted/20 px-3 py-2">
                {quickActions.map((qa) => {
                  const Icon = qa.icon;
                  return (
                    <button
                      key={qa.id}
                      type="button"
                      disabled={isThinking}
                      onClick={() => void handleSend(qa.query)}
                      className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card px-2.5 py-1 text-[10px] font-bold transition hover:border-emerald-500/40 disabled:opacity-50"
                    >
                      <Icon className="h-3 w-3" />
                      {qa.label}
                    </button>
                  );
                })}
              </div>

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
                    {m.statusTag && (
                      <div className="mb-1 text-[10px] font-bold opacity-70">{m.statusTag}</div>
                    )}
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
                  placeholder="שאלה על התעודה, פקדונות, מנוף..."
                  className="min-h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-emerald-500/50"
                  disabled={isThinking}
                />
                <Button type="submit" size="sm" disabled={isThinking || !userInput.trim()} className="min-h-10 gap-1">
                  <Send className="h-3.5 w-3.5" />
                  שלח
                </Button>
              </form>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
