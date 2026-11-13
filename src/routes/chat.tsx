/**
 * /chat — חמ״ל נועה (שכבת תצוגה מקצועית, ללא שינוי GAS)
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Send,
  Loader2,
  RefreshCw,
  History,
  Volume2,
  VolumeX,
  FileText,
  Gauge,
  Plug,
  AlertTriangle,
  Search,
  Copy,
} from "lucide-react";
import noa from "@/assets/noa.jpg";
import { NotePreviewCard, type NoteCardData } from "@/components/chat/NotePreviewCard";
import { NoaMessageBody } from "@/components/chat/NoaMessageBody";
import { ChatHistoryDrawer } from "@/components/chat/ChatHistoryDrawer";
import {
  loadChatSessions,
  saveChatSessions,
  upsertChatSession,
  sessionTitleFromMessages,
  type ChatSession,
} from "@/lib/chat-history";
import { playDispatchChime } from "@/lib/audio-alerts";
import { fetchLiveNotes } from "@/lib/api";
import { listPtoFn } from "@/lib/notes-api.functions";
import { askNoa } from "@/lib/ai.functions";
import { type DeliveryNote } from "@/lib/data";
import { pairPtoEvents, analyzePto } from "@/lib/smart-dispatch/pto-pairing";
import {
  evidenceFromMeta,
  EVIDENCE_LABEL_HE,
  formatPtoOpeningsSummary,
  type BackendMeta,
} from "@/lib/chat-grounding";

export const Route = createFileRoute("/chat")({
  validateSearch: (search: Record<string, unknown>) => ({
    customerNo:
      typeof search.customerNo === "string" && /^\d{3,10}$/.test(search.customerNo)
        ? search.customerNo
        : undefined,
    review:
      search.review === true ||
      search.review === "1" ||
      search.review === "true" ||
      search.review === "yes",
  }),
  head: () => ({
    meta: [
      { title: "נועה AI — חמ״ל לוגיסטי | ח. סבן" },
      { name: "description", content: "צ׳אט מקצועי: תעודות, PTO והצלבות מול גיליון חי." },
    ],
  }),
  component: ChatScreen,
});

type QuickAction = { id: string; label: string; query: string; icon?: "file" | "gauge" | "plug" | "alert" | "search" };

type ChatMessage = {
  id: string;
  sender: "noa" | "user";
  text: string;
  time: string;
  statusTag?: string;
  quickActions?: QuickAction[];
  noteCard?: NoteCardData;
};

const PTO_LOOKBACK_MS = 90 * 24 * 3600 * 1000;

function ChatScreen() {
  const { customerNo: customerNoFromSearch } = Route.useSearch();
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [activeCustomerNo, setActiveCustomerNo] = useState<string | undefined>(customerNoFromSearch);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState("s-init");
  const endRef = useRef<HTMLDivElement | null>(null);

  const now = () =>
    new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  const {
    data: liveNotes,
    isFetching: isFetchingNotes,
    error: notesError,
    refetch: refetchNotes,
  } = useQuery<DeliveryNote[]>({
    queryKey: ["live-notes-chat"],
    queryFn: fetchLiveNotes,
    staleTime: 30_000,
    retry: 1,
  });
  const notes = useMemo(() => liveNotes ?? [], [liveNotes]);

  const { data: ptoData, isFetching: isFetchingPto, refetch: refetchPto } = useQuery({
    queryKey: ["live-pto-chat"],
    queryFn: () =>
      listPtoFn({ data: { since: new Date(Date.now() - PTO_LOOKBACK_MS).toISOString() } }),
    staleTime: 60_000,
    retry: 1,
  });

  const sessions = useMemo(() => {
    const paired = pairPtoEvents(ptoData?.events ?? []);
    return analyzePto(paired, notes).sessions;
  }, [ptoData, notes]);

  const brainMeta: BackendMeta = useMemo(
    () => ({
      notesSource: notesError ? "unavailable" : "live",
      notesCount: notes.length,
      ituranSource: sessions.length > 0 ? "ituran_pto_sheet" : "none",
      matchedStops: sessions.filter((s) => s.matchedNoteId).length,
      unmatchedStops: sessions.filter((s) => !s.matchedNoteId).length,
      visitsCount: sessions.length,
      archiveGpsMatchedCount: notes.filter(
        (n) =>
          n.hasGpsMatch === true ||
          Boolean(n.gpsSource && n.gpsSource !== "" && n.gpsSource !== "sheet_partial"),
      ).length,
      warning: notesError
        ? notesError instanceof Error
          ? notesError.message
          : String(notesError)
        : undefined,
    }),
    [notes, notesError, sessions],
  );
  const evidenceLabel = EVIDENCE_LABEL_HE[evidenceFromMeta(brainMeta)];

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "m0",
      sender: "noa",
      time: "",
      statusTag: "מוכנה לעבודה",
      text:
        "שלום ראמי והראל.\n\n" +
        "נועה בחמ״ל — גישה לכל טאבי הגיליון: ארכיון תעודות, מילון_לוגיסט, איתוראן_PTO / סשנים_PTO, לקוחות, אתרים, הזמנות.\n\n" +
        "אפשר לשלוף כל נתון, לבקש פקודת מצגת/וידאו/דוח ל-NotebookLM Studio, ולסמן חריגי מנוף.",
      quickActions: [
        { id: "w1", label: "סיכום יומי", query: "תני סיכום יומי: תעודות + PTO + כמה עם GPS מארכיון וכמה חריגות", icon: "file" },
        { id: "w2", label: "חריגי מנוף", query: "הציגי חריגי מנוף: שהיות מעל 20 דק׳ / פער כתב יד / סשנים ללא תעודה", icon: "alert" },
        { id: "w3", label: "תעודות ללא GPS", query: "כמה תעודות ללא hasGpsMatch וללא sheet_AA_AB או sheet_AH_AJ? רשימה קצרה", icon: "search" },
        { id: "w4", label: "PTO פתוח", query: "כמה סשני PTO פתוחים (יתומים) ואיפה?", icon: "gauge" },
        { id: "w5", label: "פקודת מצגת", query: "כתבי פקודה מוכנה להעתקה ל-NotebookLM Studio ליצירת מצגת רנטגן תפעולית מהנתונים החיים", icon: "file" },
        { id: "w6", label: "דוח הנהלה", query: "כתבי פקודת דוח תפעולי עם הדגשת חריגים (PTO ארוך, ללא תעודה, בירורים) להנהלה", icon: "alert" },
      ],
    },
  ]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  useEffect(() => {
    setMessages((prev) => {
      if (!prev.length || prev[0]?.id !== "m0" || prev[0].time) return prev;
      const next = [...prev];
      next[0] = { ...next[0], time: now() };
      return next;
    });
    setSessionId((id) => (id === "s-init" ? `s-${Date.now()}` : id));
  }, []);

  useEffect(() => {
    setChatSessions(loadChatSessions());
  }, []);

  useEffect(() => {
    if (customerNoFromSearch) setActiveCustomerNo(customerNoFromSearch);
  }, [customerNoFromSearch]);

  useEffect(() => {
    if (messages.length <= 1) return;
    const stored = messages
      .filter((m) => m.id !== "m0")
      .map((m) => ({
        id: m.id,
        sender: m.sender,
        text: m.text,
        time: m.time,
        statusTag: m.statusTag,
      }));
    if (!stored.length) return;
    const session: ChatSession = {
      id: sessionId,
      title: sessionTitleFromMessages(stored),
      updatedAt: new Date().toISOString(),
      messages: stored,
      lastCustomer: activeCustomerNo,
    };
    setChatSessions((prev) => {
      const next = upsertChatSession(prev, session);
      saveChatSessions(next);
      return next;
    });
  }, [messages, sessionId, activeCustomerNo]);

  const pushNoa = useCallback((msg: Omit<ChatMessage, "id" | "sender" | "time">) => {
    setMessages((prev) => [
      ...prev,
      { id: `noa-${Date.now()}`, sender: "noa", time: now(), ...msg },
    ]);
  }, []);

  const handleSend = useCallback(
    async (textToSend?: string, customerNoOverride?: string) => {
      const text = (textToSend ?? input).trim();
      if (!text || isThinking) return;

      const idMatch = text.match(/\b(\d{5,10})\b/);
      const noteHit = idMatch
        ? notes.find((n) => n.id === idMatch[1] || n.comaxOrder === idMatch[1])
        : undefined;
      const named = notes.find(
        (n) => n.customer && n.customer.length > 2 && text.includes(String(n.customer)),
      );
      const detectedCustomerNo =
        customerNoOverride ||
        activeCustomerNo ||
        (named?.customerNo ? String(named.customerNo).trim() : undefined) ||
        (noteHit?.customerNo ? String(noteHit.customerNo).trim() : undefined);

      if (detectedCustomerNo) setActiveCustomerNo(detectedCustomerNo);

      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, sender: "user", text, time: now() },
      ]);
      if (!textToSend) setInput("");
      setIsThinking(true);
      if (isSoundEnabled) void playDispatchChime(0.35);

      try {
        if (noteHit) {
          pushNoa({
            text:
              `מצאתי את תעודת המשלוח ${noteHit.id}.\n\n` +
              `פרטי אספקה\n\n` +
              `לקוח: ${noteHit.customer || "לא צוין"}\n` +
              `כתובת: ${noteHit.siteAddress || "לא צוינה"}\n` +
              `תאריך: ${noteHit.date || "לא צוין"}\n` +
              `נהג: ${noteHit.driver || "לא צוין"}`,
            statusTag: "תעודה מהגיליון",
            noteCard: {
              noteId: noteHit.id,
              customer: noteHit.customer || "",
              address: noteHit.siteAddress,
              date: noteHit.date,
              driver: noteHit.driver,
              fileId: noteHit.fileId,
              driveUrl: noteHit.driveUrl || noteHit.signedUrl,
            },
          });
          setIsThinking(false);
          return;
        }

        const qLower = text.toLowerCase();
        const isPtoQuestion =
          /מנוף|pto|איתוראן.?pto|פתיח/.test(qLower) &&
          (/כמה|פעמים|סיכום|רשימה|פירוט|היום|שבוע|מיקום|כתובת/.test(qLower) || qLower.includes("pto"));
        if (isPtoQuestion && !/חריג|מצגת|וידאו|דוח/.test(qLower)) {
          if (sessions.length > 0) {
            pushNoa({
              text: formatPtoOpeningsSummary(
                sessions.map((s) => ({
                  truck: s.truck,
                  driver: s.driver,
                  address: s.address,
                  openIso: s.openIso,
                  closeIso: s.closeIso,
                  durationMin: s.durationMin,
                  matchedNoteId: s.matchedNoteId,
                  orphan: s.orphan,
                  date: s.date,
                })),
              ),
              statusTag: "מאומת · איתוראן_PTO",
            });
          } else {
            pushNoa({
              text:
                "לא נמצאו אירועי פתיחת מנוף בטאב איתוראן_PTO בטווח שנטען (90 ימים אחרונים).\n\n" +
                "אפשר לרענן או לבדוק קליטת מיילי איתוראן.",
              statusTag: "מאומת · אין נתונים",
            });
          }
          setIsThinking(false);
          return;
        }

        const history = [...messages, { id: "tmp", sender: "user" as const, text, time: now() }]
          .filter((m) => m.id !== "m0")
          .slice(-12)
          .map((m) => ({
            role: (m.sender === "user" ? "user" : "assistant") as "user" | "assistant",
            content: m.text,
          }));

        const res = await askNoa({
          data: { messages: history, customerNo: detectedCustomerNo },
        });

        const suggested: QuickAction[] = Array.isArray(res.suggestedQuestions)
          ? res.suggestedQuestions.map(
              (
                s: { id?: string; label: string; query: string; icon?: QuickAction["icon"] },
                i: number,
              ) => ({
                id: s.id || `sq-${i}`,
                label: s.label,
                query: s.query,
                icon:
                  s.icon === "alert" ||
                  s.icon === "gauge" ||
                  s.icon === "search" ||
                  s.icon === "file" ||
                  s.icon === "plug"
                    ? s.icon
                    : "file",
              }),
            )
          : [];

        pushNoa({
          text: res.text,
          statusTag: detectedCustomerNo
            ? `תיק לקוח ${detectedCustomerNo}`
            : `מאומת · ${evidenceLabel}`,
          quickActions: suggested.length ? suggested : undefined,
        });
      } catch (err) {
        pushNoa({
          text: `לא הצלחתי להשלים את המענה. ${err instanceof Error ? err.message : String(err)}`,
          statusTag: "שגיאה",
        });
      } finally {
        setIsThinking(false);
      }
    },
    [input, isThinking, notes, activeCustomerNo, sessions, messages, evidenceLabel, isSoundEnabled, pushNoa],
  );

  return (
    <div
      dir="rtl"
      className="flex h-[calc(100dvh-65px)] min-h-0 flex-col overflow-hidden bg-[#08111b] text-slate-100 max-lg:h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom,0px))]"
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#0c1722]/95 px-4 py-3 backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <img src={noa} alt="" className="h-11 w-11 rounded-2xl object-cover ring-2 ring-emerald-400/40" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-extrabold tracking-tight text-white sm:text-lg">נועה AI — חמ״ל לוגיסטי</h1>
            <p className="text-sm text-slate-400">
              {notesError ? "אין גיליון" : `${notes.length} תעודות`}
              {" · "}
              {sessions.length} PTO
              {" · "}
              {evidenceLabel}
              {activeCustomerNo ? ` · לקוח ${activeCustomerNo}` : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setHistoryOpen(true)} className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-200" title="היסטוריה">
            <History className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => { void refetchNotes(); void refetchPto(); }} className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-200" title="רענון">
            <RefreshCw className={`h-4 w-4 ${isFetchingNotes || isFetchingPto ? "animate-spin" : ""}`} />
          </button>
          <button type="button" onClick={() => setIsSoundEnabled((v) => !v)} className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-200">
            {isSoundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5">
        {messages.map((m) => (
          <div key={m.id} className={"flex " + (m.sender === "user" ? "justify-start" : "justify-end")}>
            <div className={"max-w-[min(100%,36rem)] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed " + (m.sender === "user" ? "bg-emerald-600/90 text-white" : "border border-white/10 bg-white/5 text-slate-100")}>
              <div className="mb-1 flex items-center justify-between gap-2">
                {m.statusTag ? (
                  <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-300/90">{m.statusTag}</div>
                ) : (
                  <span />
                )}
                {m.sender === "noa" && (
                  <button
                    type="button"
                    title="העתק לווטסאפ / הנהלה"
                    onClick={() => {
                      void navigator.clipboard.writeText(m.text);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300 hover:bg-white/10"
                  >
                    <Copy className="h-3 w-3" />
                    העתק
                  </button>
                )}
              </div>
              {m.sender === "noa" ? <NoaMessageBody text={m.text} /> : <div className="whitespace-pre-wrap">{m.text}</div>}
              {m.noteCard && (
                <div className="mt-2">
                  <NotePreviewCard note={m.noteCard} />
                </div>
              )}
              {m.quickActions && m.quickActions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.quickActions.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => void handleSend(a.query)}
                      className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-200 hover:bg-white/10"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-1 text-[10px] text-slate-500">{m.time}</div>
            </div>
          </div>
        ))}
        {isThinking && (
          <div className="flex justify-end">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> נועה חושבת…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-white/10 bg-[#0c1722] px-3 py-3 sm:px-5">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {[
            { label: "סיכום יומי", q: "תני סיכום יומי: תעודות + PTO + כמה עם GPS מארכיון וכמה חריגות" },
            { label: "PTO פתוח", q: "כמה סשני PTO פתוחים (יתומים) ואיפה?" },
            { label: "חריגי מנוף", q: "הציגי חריגי מנוף: שהיות מעל 20 דק׳ / פער כתב יד / סשנים ללא תעודה" },
            { label: "ללא GPS", q: "כמה תעודות ללא hasGpsMatch וללא sheet_AA_AB או sheet_AH_AJ?" },
            { label: "מצגת", q: "כתבי פקודה מוכנה להעתקה ל-NotebookLM Studio ליצירת מצגת רנטגן תפעולית מהנתונים החיים" },
            { label: "דוח הנהלה", q: "כתבי פקודת דוח תפעולי עם הדגשת חריגים (PTO ארוך, ללא תעודה, בירורים) להנהלה" },
          ].map((x) => (
            <button key={x.label} type="button" onClick={() => void handleSend(x.q)} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-200 hover:bg-white/10">
              {x.label}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            rows={2}
            placeholder="שאלה על תעודה, לקוח, מנוף, מצגת… (Enter לשליחה)"
            className="min-h-[44px] flex-1 resize-none rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
          <button type="submit" disabled={isThinking || !input.trim()} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white disabled:opacity-40">
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      <ChatHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        sessions={chatSessions}
        onSelect={(s) => {
          setSessionId(s.id);
          setActiveCustomerNo(s.lastCustomer);
          setMessages([
            messages[0]!,
            ...s.messages.map((m) => ({
              id: m.id,
              sender: m.sender,
              text: m.text,
              time: m.time,
              statusTag: m.statusTag,
            })),
          ]);
          setHistoryOpen(false);
        }}
        onDelete={(id) => {
          setChatSessions((prev) => {
            const next = prev.filter((x) => x.id !== id);
            saveChatSessions(next);
            return next;
          });
        }}
      />
    </div>
  );
}
