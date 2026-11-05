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
  buildNoaContext,
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

const PTO_LOOKBACK_MS = 7 * 24 * 3600 * 1000;

function ChatScreen() {
  const { customerNo: customerNoFromSearch } = Route.useSearch();
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [activeCustomerNo, setActiveCustomerNo] = useState<string | undefined>(customerNoFromSearch);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState(() => `s-${Date.now()}`);
  const endRef = useRef<HTMLDivElement | null>(null);
  const autoStarted = useRef<string | null>(null);

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
      time: now(),
      statusTag: "מוכנה לעבודה",
      text:
        "שלום ראמי והראל.\n\n" +
        "נועה כאן בחמ״ל הלוגיסטי.\n\n" +
        "אפשר לשאול לפי מספר תעודה, לקוח, אתר או פתיחות מנוף. המענה יוצג בעברית מסודרת, עם כותרות ברורות וטבלאות כשצריך.",
      quickActions: [
        { id: "w1", label: "סיכום תעודות", query: "תני סיכום של התעודות האחרונות בגיליון", icon: "file" },
        { id: "w2", label: "פתיחות מנוף", query: "כמה פעמים נפתח מנוף לפי טאב איתוראן PTO?", icon: "gauge" },
        { id: "w3", label: "מקורות", query: "אילו מקורות נתונים מחוברים כרגע?", icon: "plug" },
      ],
    },
  ]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

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
            quickActions: [
              {
                id: `n-${noteHit.id}`,
                label: "פירוט מלא",
                query: `הציגי פירוט מלא על תעודת משלוח ${noteHit.id} כולל פריטים ופקדונות`,
                icon: "file",
              },
            ],
          });
          setIsThinking(false);
          return;
        }

        // מענה דטרמיניסטי לפתיחות מנוף / PTO — שעון ישראל + כתובת, בלי AI
        const qLower = text.toLowerCase();
        const isPtoQuestion =
          /מנוף|pto|איתוראן.?pto|פתיח/.test(qLower) &&
          (/כמה|פעמים|סיכום|רשימה|פירוט|היום|שבוע|מיקום|כתובת/.test(qLower) ||
            qLower.includes("pto"));
        if (isPtoQuestion) {
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
              quickActions: [
                {
                  id: "pto-refresh",
                  label: "רענון PTO",
                  query: "כמה פעמים נפתח מנוף לפי טאב איתוראן PTO?",
                  icon: "gauge",
                },
                {
                  id: "pto-unmatched",
                  label: "PTO ללא תעודה",
                  query: "הציגי פתיחות מנוף שלא שויכו לתעודת משלוח",
                  icon: "alert",
                },
              ],
            });
          } else {
            pushNoa({
              text:
                "לא נמצאו אירועי פתיחת מנוף בטאב איתוראן_PTO בטווח שנטען (7 ימים אחרונים).\n\n" +
                "אפשר לרענן את הנתונים או לבדוק שהמיילים מאיתוראן נקלטים לגיליון.",
              statusTag: "מאומת · אין נתונים",
              quickActions: [
                {
                  id: "pto-refresh",
                  label: "רענון PTO",
                  query: "כמה פעמים נפתח מנוף לפי טאב איתוראן PTO?",
                  icon: "gauge",
                },
              ],
            });
          }
          setIsThinking(false);
          return;
        }

        const context = buildNoaContext({
          meta: brainMeta,
          fetchedAt: new Date().toLocaleString("he-IL"),
          notes: notes as unknown as Record<string, unknown>[],
          visits: sessions.map((s) => ({
            truck: s.truck,
            driver: s.driver,
            fullAddress: s.address,
            address: s.address,
            noteIds: s.matchedNoteId ? [s.matchedNoteId] : [],
            ituranArrive: s.openIso,
            ituranDepart: s.closeIso,
            durationMin: s.durationMin,
            ptoOpenTime: s.openIso,
            ptoCloseTime: s.closeIso,
            ptoDurationMin: s.durationMin,
          })),
          ptoSessions: sessions.map((s) => ({
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
          discrepancies: [],
          question: text,
        });

        const history = [...messages, { id: "tmp", sender: "user" as const, text, time: now() }]
          .filter((m) => m.id !== "m0")
          .slice(-12)
          .map((m) => ({
            role: (m.sender === "user" ? "user" : "assistant") as "user" | "assistant",
            content: m.text,
          }));

        const res = await askNoa({
          data: {
            messages: history,
            context,
            customerNo: detectedCustomerNo,
          },
        });

        const fromAi = Array.isArray(res.suggestedQuestions) ? res.suggestedQuestions : [];
        const quickActions: QuickAction[] =
          fromAi.length > 0
            ? fromAi.map((q) => ({
                id: q.id,
                label: q.label,
                query: q.query,
                icon: "search",
              }))
            : detectedCustomerNo
              ? [
                  {
                    id: `c-${detectedCustomerNo}-notes`,
                    label: "תעודות הלקוח",
                    query: `הציגי את תעודות המשלוח של לקוח ${detectedCustomerNo} בלבד`,
                    icon: "file",
                  },
                ]
              : [
                  {
                    id: "f-summary",
                    label: "סיכום תעודות",
                    query: "תני סיכום של התעודות האחרונות בגיליון",
                    icon: "file",
                  },
                ];

        pushNoa({
          text: res.text,
          statusTag: detectedCustomerNo
            ? `תיק לקוח ${detectedCustomerNo}`
            : `מאומת · ${evidenceLabel}`,
          quickActions,
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
    [
      input,
      isThinking,
      notes,
      activeCustomerNo,
      brainMeta,
      sessions,
      messages,
      evidenceLabel,
      isSoundEnabled,
      pushNoa,
    ],
  );

  useEffect(() => {
    if (!customerNoFromSearch || isFetchingNotes) return;
    const key = `${customerNoFromSearch}:review`;
    if (autoStarted.current === key) return;
    autoStarted.current = key;
    void handleSend(
      `הכיני סקירת לקוח מקצועית ללקוח ${customerNoFromSearch} בלבד. כתבי בעברית מלאה, בלי סימני עיצוב טכניים, עם כותרות וטבלה כשצריך.`,
      customerNoFromSearch,
    );
  }, [customerNoFromSearch, isFetchingNotes, handleSend]);

  const keyQuestions: QuickAction[] = activeCustomerNo
    ? [
        {
          id: "k-review",
          label: `סקירת לקוח ${activeCustomerNo}`,
          query: `הכיני סקירת לקוח ללקוח ${activeCustomerNo} בלבד`,
          icon: "file",
        },
        {
          id: "k-notes",
          label: "תעודות הלקוח",
          query: `הציגי את תעודות המשלוח של לקוח ${activeCustomerNo}`,
          icon: "file",
        },
        {
          id: "k-pto",
          label: "מנוף / PTO",
          query: `PTO וכתובות אספקה ללקוח ${activeCustomerNo} בלבד`,
          icon: "gauge",
        },
      ]
    : [
        {
          id: "k-sum",
          label: `תעודות (${notes.length})`,
          query: "תני סיכום של התעודות האחרונות בגיליון",
          icon: "file",
        },
        {
          id: "k-pto",
          label: `PTO (${sessions.length})`,
          query: "כמה פעמים נפתח מנוף לפי טאב איתוראן PTO?",
          icon: "gauge",
        },
        {
          id: "k-src",
          label: "מקורות",
          query: "אילו מקורות נתונים מחוברים כרגע?",
          icon: "plug",
        },
      ];

  const ActionIcon = ({ name }: { name?: QuickAction["icon"] }) => {
    const cls = "h-4 w-4 shrink-0 opacity-90";
    if (name === "file") return <FileText className={cls} />;
    if (name === "gauge") return <Gauge className={cls} />;
    if (name === "plug") return <Plug className={cls} />;
    if (name === "alert") return <AlertTriangle className={cls} />;
    return <Search className={cls} />;
  };

  return (
    <div
      dir="rtl"
      className="flex h-[calc(100dvh-65px)] min-h-0 flex-col overflow-hidden bg-[#08111b] text-slate-100 max-lg:h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom,0px))]"
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#0c1722]/95 px-4 py-3 backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={noa}
            alt=""
            className="h-11 w-11 rounded-2xl object-cover ring-2 ring-emerald-400/40"
          />
          <div className="min-w-0">
            <h1 className="truncate text-base font-extrabold tracking-tight text-white sm:text-lg">
              נועה AI — חמ״ל לוגיסטי
            </h1>
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
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-200"
            title="היסטוריה"
          >
            <History className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              void refetchNotes();
              void refetchPto();
            }}
            className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-200"
            title="רענון"
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetchingNotes || isFetchingPto ? "animate-spin" : ""}`}
            />
          </button>
          <button
            type="button"
            onClick={() => setIsSoundEnabled((v) => !v)}
            className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-200"
          >
            {isSoundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-5">
        {messages.map((m) => {
          const isUser = m.sender === "user";
          return (
            <div key={m.id} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[min(100%,36rem)] rounded-2xl px-4 py-4 shadow-lg sm:px-5 ${
                  isUser
                    ? "rounded-tr-md bg-gradient-to-br from-emerald-600 to-emerald-800 text-white"
                    : "rounded-tl-md border border-white/10 bg-[#111d29] text-slate-100"
                }`}
              >
                {!isUser && (
                  <div className="mb-3 flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                    <span className="text-sm font-extrabold text-emerald-400">נועה AI</span>
                    {m.statusTag && (
                      <span className="rounded-md bg-white/5 px-2 py-0.5 text-xs font-semibold text-slate-300">
                        {m.statusTag}
                      </span>
                    )}
                  </div>
                )}
                {isUser ? (
                  <p className="whitespace-pre-line text-[15px] leading-7 sm:text-base">{m.text}</p>
                ) : (
                  <NoaMessageBody text={m.text} variant="dark" />
                )}
                {m.noteCard && (
                  <div className="mt-3">
                    <NotePreviewCard card={m.noteCard} />
                  </div>
                )}
                {!isUser && m.quickActions && m.quickActions.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {m.quickActions.map((qa) => (
                      <button
                        key={qa.id}
                        type="button"
                        disabled={isThinking}
                        onClick={() => void handleSend(qa.query, activeCustomerNo)}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-semibold text-slate-100 transition hover:border-emerald-400/40 hover:bg-emerald-500/15 disabled:opacity-40"
                      >
                        <ActionIcon name={qa.icon} />
                        {qa.label}
                      </button>
                    ))}
                  </div>
                )}
                <div
                  className={`mt-2 text-[11px] ${
                    isUser ? "text-emerald-100/70" : "text-slate-500"
                  }`}
                >
                  {m.time}
                </div>
              </div>
            </div>
          );
        })}

        {isThinking && (
          <div className="flex justify-end">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-[#111d29] px-4 py-3 text-sm text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
              נועה בודקת בגיליון…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex gap-2 overflow-x-auto border-t border-white/10 bg-[#0c1722] px-3 py-2 sm:px-5">
        {keyQuestions.map((qa) => (
          <button
            key={qa.id}
            type="button"
            disabled={isThinking}
            onClick={() => void handleSend(qa.query, activeCustomerNo)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-emerald-400/40 hover:bg-emerald-500/10 disabled:opacity-40"
          >
            <ActionIcon name={qa.icon} />
            {qa.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className="flex items-center gap-2 border-t border-white/10 bg-[#0c1722] px-3 py-3 sm:px-5"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            notes.length > 0
              ? `תעודה, לקוח או מנוף · ${notes.length} תעודות`
              : "ממתין לחיבור לגיליון…"
          }
          className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-[#08111b] px-4 py-3.5 text-base text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/15"
        />
        <button
          type="submit"
          disabled={!input.trim() || isThinking}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-[#04130d] shadow-lg transition hover:bg-emerald-400 disabled:opacity-40"
        >
          <Send className="h-5 w-5 rotate-180" />
        </button>
      </form>

      <ChatHistoryDrawer
        open={historyOpen}
        sessions={chatSessions}
        activeId={sessionId}
        onClose={() => setHistoryOpen(false)}
        onNew={() => {
          setSessionId(`s-${Date.now()}`);
          setMessages((prev) => {
            const welcome = prev.find((m) => m.id === "m0");
            return welcome ? [welcome] : prev.slice(0, 1);
          });
          setActiveCustomerNo(undefined);
          setHistoryOpen(false);
        }}
        onSelect={(s) => {
          setSessionId(s.id);
          setMessages([
            {
              id: "m0",
              sender: "noa",
              time: now(),
              statusTag: "שוחזר מהיסטוריה",
              text: `שוחזרה שיחה: ${s.title}`,
            },
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
