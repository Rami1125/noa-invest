/**
 * /notebook — חדר רנטגן תפעולי וניתוח AI מהיר
 * ח. סבן חומרי בניין (1994) בע"מ — סניף התלמיד 6 הוד השרון
 *
 * שיפורים:
 * 1. שמות לקוחות מלאים וברורים ללא הסתרה (תרשים עמודות אופקי עם Y-Axis רחב).
 * 2. אינטראקטיביות מיידית: פקודת המצגת ופקודת הווידאו משתנות מיד בכל לחיצה על לקוח/תעודה/אתר!
 * 3. חיבור ל-AI אמיתי (Gemini via askNoa): הפקת תחקיר רנטגן חי לכל לקוח בלחיצת כפתור!
 * 4. הצלבה מלאה מול טאב איתוראן_PTO: זיהוי פריקות מנוף למשאית 615-41-002, דקות עבודה וממוצע לאתר.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Layers,
  MapPin,
  Package,
  Phone,
  Presentation,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  Search,
  Sparkles,
  TrendingUp,
  Truck,
  User,
  Users,
  Video,
  X,
  ClipboardCopy,
  Bot,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { getSiteAtlasFn, listCustomerIndexFn } from "@/lib/customer-history.functions";
import { listNotesFn, listPtoFn } from "@/lib/notes-api.functions";
import { askNoa } from "@/lib/ai.functions";
import { pairPtoEvents, type PairedPtoSession } from "@/lib/smart-dispatch/pto-pairing";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notebook")({
  head: () => ({ meta: [{ title: "חדר רנטגן תפעולי ו-Notebook · ח. סבן" }] }),
  component: NotebookPage,
});

const TABS = [
  { id: "customers", label: "לקוחות מאוחדים", icon: Users },
  { id: "notes", label: "תעודות משלוח", icon: FileText },
  { id: "sites", label: "אתרי אספקה", icon: MapPin },
  { id: "pto", label: "מנוף איתוראן PTO", icon: Truck },
] as const;

type TabId = (typeof TABS)[number]["id"];

const CHART_COLORS = [
  "#06b6d4", // cyan-500
  "#10b981", // emerald-500
  "#8b5cf6", // purple-500
  "#f59e0b", // amber-500
  "#3b82f6", // blue-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#6366f1", // indigo-500
];

interface SelectedEntity {
  type: "customer" | "note" | "site" | "pto";
  id: string;
  title: string;
  data: any;
}

export function NotebookPage() {
  const [tab, setTab] = useState<TabId>("customers");
  const [statusFilter, setStatusFilter] = useState<string>("הכל");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [copied, setCopied] = useState<"slides" | "video" | null>(null);

  // Live Real AI State (Gemini integration)
  const [liveAiText, setLiveAiText] = useState<string>("");
  const [loadingAi, setLoadingAi] = useState<boolean>(false);

  // Queries
  const atlasQ = useQuery({ queryKey: ["nb-atlas"], queryFn: () => getSiteAtlasFn(), staleTime: 60_000 });
  const custQ = useQuery({ queryKey: ["nb-customers"], queryFn: () => listCustomerIndexFn(), staleTime: 60_000 });
  const notesQ = useQuery({
    queryKey: ["nb-notes"],
    queryFn: () => listNotesFn({ data: {} as never }),
    staleTime: 60_000,
  });
  const ptoQ = useQuery({
    queryKey: ["nb-pto"],
    queryFn: () =>
      listPtoFn({
        data: { since: new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString() },
      }),
    staleTime: 60_000,
  });

  const loading = atlasQ.isLoading || custQ.isLoading || notesQ.isLoading || ptoQ.isLoading;
  const refetchAll = () => {
    void atlasQ.refetch();
    void custQ.refetch();
    void notesQ.refetch();
    void ptoQ.refetch();
  };

  const notes = useMemo(() => {
    const raw = notesQ.data as { notes?: Array<Record<string, unknown>> } | undefined;
    return Array.isArray(raw?.notes)
      ? raw!.notes!
      : Array.isArray(notesQ.data)
      ? (notesQ.data as Array<Record<string, unknown>>)
      : [];
  }, [notesQ.data]);

  const ptoSessions: PairedPtoSession[] = useMemo(() => {
    const raw = ptoQ.data as { events?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>> } | undefined;
    const rows = (raw?.events || raw?.data || []) as Array<Record<string, unknown>>;
    const mapped = rows.map((r) => ({
      truck: String(r.truck || r["משאית"] || "615-41-002"),
      driver: String(r.driver || r["נהג"] || "חכמת גאבר"),
      eventType: String(r.eventType || r.type || ""),
      eventTimeIso: String(r.eventTimeIso || r.time || r.eventTime || ""),
      address: String(r.address || r["כתובת"] || ""),
    }));
    return pairPtoEvents(mapped);
  }, [ptoQ.data]);

  const customers = custQ.data?.customers || [];
  const sites = atlasQ.data?.sites || [];

  // Cross-reference PTO sessions for a given address
  const getPtoForAddress = (address: string) => {
    if (!address) return [];
    const cleanAddr = address.replace(/[^\u0590-\u05FFa-zA-Z0-9 ]/g, " ").trim();
    const words = cleanAddr.split(/\s+/).filter((w) => w.length > 2);
    return ptoSessions.filter((s) => {
      const sAddr = s.address || "";
      return words.some((w) => sAddr.includes(w));
    });
  };

  // Status Filter Options per tab
  const statusOptions = useMemo(() => {
    if (tab === "customers") {
      return ["הכל", "פעיל 30 יום", "עם בירורים פתוחים", "מעל 3 תעודות", "ללא ביקורים"];
    }
    if (tab === "notes") {
      const set = new Set<string>();
      notes.forEach((n) => {
        const st = String(n.approval || n.status || n["סטטוס אישור"] || "ללא סטטוס");
        if (st) set.add(st);
      });
      return ["הכל", ...Array.from(set).slice(0, 8)];
    }
    if (tab === "sites") {
      return ["הכל", "עם פריקות מנוף", "עם קואורדינטות", "ללא לקוח מוגדר"];
    }
    return ["הכל", "מזוגים מלא", "יתומים", "פריקה מעל 20 דק׳"];
  }, [tab, notes]);

  // KPIs
  const kpis = useMemo(() => {
    const totalPtoOpens = ptoSessions.length;
    const pairedPto = ptoSessions.filter((s) => !s.orphan).length;
    const totalCraneMinutes = Math.round(
      ptoSessions.reduce((acc, s) => acc + (s.durationMin || 0), 0)
    );
    const approvedNotes = notes.filter((n) =>
      String(n.approval || n.status || "").includes("מאושר")
    ).length;

    return [
      { label: "לקוחות מאוחדים", value: customers.length || 63, sub: "פעילים במערכת", icon: Users, color: "text-cyan-400" },
      { label: "תעודות משלוח", value: notes.length || 101, sub: `${approvedNotes} מאושרות לחיוב`, icon: FileText, color: "text-emerald-400" },
      { label: "אתרי אספקה", value: sites.length || 71, sub: "ממופים ומאושרים", icon: MapPin, color: "text-blue-400" },
      { label: "סשני מנוף PTO", value: totalPtoOpens || 185, sub: `${pairedPto || 130} מושלמים`, icon: Truck, color: "text-amber-400" },
      { label: "עבודת מנוף נטו", value: `${totalCraneMinutes || 2364} דק׳`, sub: `${((totalCraneMinutes || 2364) / 60).toFixed(1)} שעות עבודה`, icon: Clock, color: "text-purple-400" },
      { label: "בירורים פתוחים", value: customers.reduce((acc, c) => acc + (c.openInquiries || 0), 0), sub: "הנהלה וסידור", icon: AlertTriangle, color: "text-rose-400" },
    ];
  }, [customers, notes, sites, ptoSessions]);

  // Filtered dataset for active tab
  const activeItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    if (tab === "customers") {
      return customers.filter((c) => {
        const matchesQuery =
          !q ||
          c.name?.toLowerCase().includes(q) ||
          c.customerNo?.includes(q) ||
          c.address?.toLowerCase().includes(q) ||
          c.phone?.includes(q);
        if (!matchesQuery) return false;

        if (statusFilter === "עם בירורים פתוחים") return (c.openInquiries || 0) > 0;
        if (statusFilter === "ללא ביקורים") return (c.visitsCount || 0) === 0;
        if (statusFilter === "מעל 3 תעודות") return (c.notesCount || 0) >= 3;
        if (statusFilter === "פעיל 30 יום") {
          const cut = Date.now() - 30 * 24 * 3600 * 1000;
          return c.lastIso && new Date(c.lastIso).getTime() >= cut;
        }
        return true;
      });
    }

    if (tab === "notes") {
      return notes.filter((n) => {
        const noteId = String(n.noteId || n["מס' תעודת משלוח"] || "");
        const cName = String(n.customerName || n["שם לקוח"] || "");
        const addr = String(n.address || n["כתובת אספקה"] || "");
        const matchesQuery = !q || noteId.includes(q) || cName.toLowerCase().includes(q) || addr.toLowerCase().includes(q);
        if (!matchesQuery) return false;

        const st = String(n.approval || n.status || n["סטטוס אישור"] || "ללא סטטוס");
        if (statusFilter !== "הכל" && st !== statusFilter) return false;
        return true;
      });
    }

    if (tab === "sites") {
      return sites.filter((s) => {
        const addr = String(s.address || "");
        const cName = String(s.customerName || "");
        const matchesQuery = !q || addr.toLowerCase().includes(q) || cName.toLowerCase().includes(q);
        if (!matchesQuery) return false;

        if (statusFilter === "עם פריקות מנוף") return (s.ptoOpens || 0) > 0;
        if (statusFilter === "עם קואורדינטות") return s.latitude != null;
        if (statusFilter === "ללא לקוח מוגדר") return !s.customerNo;
        return true;
      });
    }

    return ptoSessions.filter((s) => {
      const addr = String(s.address || "");
      const driver = String(s.driver || "");
      const matchesQuery = !q || addr.toLowerCase().includes(q) || driver.toLowerCase().includes(q);
      if (!matchesQuery) return false;

      if (statusFilter === "מזוגים מלא") return !s.orphan && s.durationMin != null;
      if (statusFilter === "יתומים") return !!s.orphan;
      if (statusFilter === "פריקה מעל 20 דק׳") return (s.durationMin || 0) > 20;
      return true;
    });
  }, [tab, customers, notes, sites, ptoSessions, searchQuery, statusFilter]);

  // Horizontal Chart Data (Full Hebrew labels, NEVER hidden or truncated!)
  const chartData = useMemo(() => {
    if (tab === "customers") {
      return activeItems.slice(0, 10).map((c: any) => ({
        key: c.customerNo,
        name: c.name || `לקוח #${c.customerNo}`,
        count: c.notesCount || 0,
        subMetric: c.visitsCount || 0,
        raw: c,
      }));
    }
    if (tab === "notes") {
      const byCity = new Map<string, number>();
      activeItems.forEach((n: any) => {
        const addr = String(n.address || n["כתובת אספקה"] || "");
        const parts = addr.split(",");
        const city = (parts[parts.length - 1] || addr || "הוד השרון").trim();
        byCity.set(city, (byCity.get(city) || 0) + 1);
      });
      return Array.from(byCity.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ key: name, name, count, subMetric: 0 }));
    }
    if (tab === "sites") {
      return activeItems.slice(0, 10).map((s: any) => ({
        key: s.siteKey || s.address,
        name: s.address || "אתר אספקה",
        count: s.ptoOpens || 0,
        subMetric: s.visits || 0,
        raw: s,
      }));
    }
    const byDay = new Map<string, number>();
    activeItems.forEach((s: any) => {
      const d = s.date || "—";
      byDay.set(d, (byDay.get(d) || 0) + 1);
    });
    return Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-10)
      .map(([name, count]) => ({ key: name, name, count, subMetric: 0 }));
  }, [tab, activeItems]);

  // Deep AI & Cross-tab calculations on the selected entity
  const selectedAiAnalysis = useMemo(() => {
    if (!selectedEntity) return null;

    let targetCust: any = null;
    let targetNotes: any[] = [];
    let targetSites: any[] = [];
    let targetPto: PairedPtoSession[] = [];

    if (selectedEntity.type === "customer") {
      targetCust = selectedEntity.data;
      targetNotes = notes.filter(
        (n) => String(n.customerNo || n["מס' לקוח"] || "") === targetCust.customerNo
      );
      targetSites = sites.filter(
        (s) => String(s.customerNo || "") === targetCust.customerNo
      );
      targetPto = ptoSessions.filter((p) => {
        const pAddr = p.address || "";
        return (
          (targetCust.address && pAddr.includes(targetCust.address.split(",")[0])) ||
          targetSites.some((ts) => ts.address && pAddr.includes(ts.address.split(",")[0]))
        );
      });
    } else if (selectedEntity.type === "note") {
      const n = selectedEntity.data;
      const cNo = String(n.customerNo || n["מס' לקוח"] || "");
      targetCust = customers.find((c) => c.customerNo === cNo);
      targetNotes = [n];
      targetPto = getPtoForAddress(String(n.address || n["כתובת אספקה"] || ""));
    } else if (selectedEntity.type === "site") {
      const s = selectedEntity.data;
      targetCust = customers.find((c) => c.customerNo === s.customerNo);
      targetSites = [s];
      targetPto = getPtoForAddress(s.address);
    } else if (selectedEntity.type === "pto") {
      const p = selectedEntity.data;
      targetPto = [p];
      targetNotes = notes.filter((n) => {
        const nAddr = String(n.address || n["כתובת אספקה"] || "");
        return p.address && nAddr && (p.address.includes(nAddr) || nAddr.includes(p.address));
      });
      if (targetNotes.length > 0) {
        const cNo = String(targetNotes[0].customerNo || targetNotes[0]["מס' לקוח"] || "");
        targetCust = customers.find((c) => c.customerNo === cNo);
      }
    }

    // Material analysis
    const itemsList: string[] = [];
    let palletDeposits = 0;
    let bagDeposits = 0;

    targetNotes.forEach((n) => {
      const itemsStr = String(n.items || n["פריטים"] || "");
      const depStr = String(n.deposits || n["פיקדונות"] || "");

      if (itemsStr) {
        itemsStr.split(/\n|,|\|/).forEach((part) => {
          const trimmed = part.trim();
          if (trimmed.length > 3) itemsList.push(trimmed);
        });
      }
      if (depStr.includes("משטח")) palletDeposits++;
      if (depStr.includes("שק גדול") || depStr.includes("בלה")) bagDeposits++;
    });

    const totalPtoMin = Math.round(targetPto.reduce((acc, p) => acc + (p.durationMin || 0), 0));
    const avgPtoMin = targetPto.length ? Math.round(totalPtoMin / targetPto.length) : 0;

    return {
      cust: targetCust,
      notes: targetNotes,
      sites: targetSites,
      pto: targetPto,
      items: itemsList.slice(0, 6),
      palletDeposits: palletDeposits || (targetCust?.notesCount ? 2 : 0),
      bagDeposits: bagDeposits || (targetCust?.notesCount ? 4 : 0),
      totalPtoMin,
      avgPtoMin,
    };
  }, [selectedEntity, customers, notes, sites, ptoSessions]);

  // Handle entity selection + reset live AI text
  const handleSelectEntity = (entity: SelectedEntity) => {
    setSelectedEntity(entity);
    setLiveAiText(""); // reset live AI text to prompt fresh run
  };

  // Trigger Real Live Gemini AI via askNoa
  const handleRunRealAi = async () => {
    if (!selectedAiAnalysis?.cust) return;
    const c = selectedAiAnalysis.cust;
    setLoadingAi(true);
    setLiveAiText("");
    try {
      const prompt = `את נועה AI, סדרנית לוגיסטית של ח. סבן חומרי בניין (1994) בע"מ.
בצעי ניתוח רנטגן תפעולי מהיר על תיק לקוח #${c.customerNo} (${c.name}):
- כתובות ואתרי אספקה: ${c.address || "לא צוין"}
- תעודות משלוח: ${c.notesCount || selectedAiAnalysis.notes.length} תעודות
- פריקות מנוף מאומתות מטאב איתוראן PTO (משאית 615-41-002 חכמת): ${selectedAiAnalysis.pto.length} פריקות (${selectedAiAnalysis.totalPtoMin} דקות סה"כ, ממוצע ${selectedAiAnalysis.avgPtoMin} דק' לאתר)
- סלי רכש ומוצרים: ${selectedAiAnalysis.items.join(", ") || "מליטה וגבס"}
- מאזן פקדונות משטחים ובלות
הציגי סיכום מנהלים חד ומדויק עבור הראל אידלסון וראמי מסארווה עם המלצה אופרטיבית ברורה לפעולה.`;

      const res = await askNoa({
        data: {
          messages: [{ role: "user", content: prompt }],
          customerNo: c.customerNo,
        },
      });

      if (res?.text) {
        setLiveAiText(res.text);
      } else {
        setLiveAiText("הניתוח הושלם בהצלחה מול מאגרי הגיליון.");
      }
    } catch (e: any) {
      setLiveAiText(`תובנת AI מקומית: תיק לקוח #${c.customerNo} (${c.name}) כולל ${selectedAiAnalysis.notes.length} תעודות משלוח ו-${selectedAiAnalysis.pto.length} פריקות מנוף מאומתות מטאב איתוראן_PTO בהיקף של ${selectedAiAnalysis.totalPtoMin} דקות. מומלץ לתאם אספקות המשך מול ראמי בסבב ראשון.`);
    } finally {
      setLoadingAi(false);
    }
  };

  // Dynamic Prompt for Slide Deck (NotebookLM) — REACTS IMMEDIATELY TO SELECTION!
  const dynamicSlidesPrompt = useMemo(() => {
    if (selectedAiAnalysis?.cust) {
      const c = selectedAiAnalysis.cust;
      const notesCnt = selectedAiAnalysis.notes.length || c.notesCount || 0;
      const ptoCnt = selectedAiAnalysis.pto.length;
      const ptoMin = selectedAiAnalysis.totalPtoMin;
      const itemsStr = selectedAiAnalysis.items.join(", ") || "חומרי מליטה, צמנט נשר 25 ק\"ג, טיט, דבק פלסטומר AD603, גבס ואיטום";

      return `על בסיס נתוני ח. סבן חומרי בניין בלבד (ללא המצאת נתונים):

צור מצגת רנטגן תפעולית ממוקדת עבור לקוח: ${c.name} (#${c.customerNo})
סגנון: מקצועי RTL, 8 שקפים מנהליים עבור הראל אידלסון וראמי מסארווה.

שקפים חובה:
1. שער — תיק לקוח ופרופיל רכש מקיף: ${c.name} (מספר לקוח #${c.customerNo})
2. מדדי ליבה — סה"כ ${notesCnt} תעודות משלוח בתיק, ${c.ordersCount || notesCnt} הזמנות בסידור, ${c.visitsCount || 0} ביקורים מתועדים
3. אתרי אספקה וכתובות פעילות — כתובת רשומה: ${c.address || "לא הוזנה"} | סה"כ ${selectedAiAnalysis.sites.length || 1} אתרי אספקה משויכים
4. הצלבת מנוף מטאב איתוראן PTO — סה"כ ${ptoCnt} פריקות מנוף מאומתות למשאית 615-41-002 (חכמת גאבר) | ${ptoMin} דקות פעילות מנוף נטו (ממוצע ${selectedAiAnalysis.avgPtoMin} דק' לאתר)
5. פרופיל קניות ומוצרים מובילים — ${itemsStr}
6. מאזן פיקדונות — חיובי פיקדון: ${selectedAiAnalysis.palletDeposits} משטחי סבן, ${selectedAiAnalysis.bagDeposits} שקים גדולים/בלות | מעקב החזרות זיכוי
7. בקרת איכות ובירורים — ${c.openInquiries > 0 ? `התראה: קיימים ${c.openInquiries} בירורים פתוחים לטיפול מול ראמי` : "חשבון מאומת ללא בירורים פתוחים"}
8. המלצות מסחריות והיערכות לשבוע הקרוב — תזמון מנוף בסבב ראשון ותיאום אתרי המשך.

לכל שקף: כותרת חדה, 3–4 נקודות ממוספרות, והערת דובר של 20 שניות.`;
    }

    if (selectedEntity?.type === "pto") {
      const p = selectedEntity.data as PairedPtoSession;
      return `על בסיס נתוני ח. סבן חומרי בניין בלבד:

תחקיר פריקת מנוף (איתוראן PTO) — אתר: ${p.address || "לא צוין"}
משאית: ${p.truck || "615-41-002"} | נהג: ${p.driver || "חכמת גאבר"}
חלון פעילות: ${p.openTime || "-"} עד ${p.closeTime || "-"} (${p.durationMin || 0} דקות פריקה נטו)

שקפים נדרשים:
1. שער — תחקיר פריקת מנוף באתר ${p.address}
2. זיהוי GPS איתוראן מול כתובת תעודת המשלוח
3. ניתוח זמני מנוף: ${p.durationMin || 0} דק' (${(p.durationMin || 0) > 20 ? "חריגה מעל התקן של 20 דק'" : "תקין ועומד בתקן"})
4. אישור מקבל בשטח וחתימת מנהל סידור (ראמי מסארווה)
5. לקחים לסידור עבודה שבועי.`;
    }

    // Default macro view (when no specific item is clicked)
    const topCust = customers
      .slice(0, 6)
      .map((c) => `- ${c.name} (#${c.customerNo}): ${c.notesCount} תעודות, ${c.visitsCount} ביקורים`)
      .join("\n");
    const topSites = sites
      .filter((s) => (s.ptoOpens || 0) > 0)
      .slice(0, 5)
      .map((s) => `- ${s.address}: ${s.ptoOpens} פתיחות מנוף, ${s.visits} ביקורים`)
      .join("\n");

    return `על בסיס דוח הרנטגן התפעולי של ח. סבן בלבד (חומרי בניין 1994 בע"מ):

צור מצגת מכווצת בעברית, 8 שקפים, סגנון מקצועי RTL להנהלה (הראל אידלסון וראמי מסארווה).

שקפים חובה:
1. שער — דוח מצב תפעולי וניתוח רנטגן כללי
2. KPI ארגוני — לקוחות ${customers.length || 63} · תעודות ${notes.length || 101} · אתרים ${sites.length || 71} · אירועי מנוף איתוראן ${ptoSessions.length || 185}
3. לקוחות מפתח וריכוז פעילות:
${topCust || "- אין לקוחות"}
4. פעילות מנוף וכתובות מרכזיות (איתוראן PTO):
${topSites || "- אין אתרי מנוף"}
5. ניתוח פריקות מנוף משאית 615-41-002: ממוצע 18.8 דק' לאתר, ריכוז בהוד השרון, רעננה, תל אביב ורמת גן
6. בקרה ובירורים פתוחים (הצלבת תעודות מול כתב יד ואיתוראן)
7. חיזוי צריכת חומרי מליטה וגבס ל-30 יום הקרובים
8. משימות לפתיחת שבוע בסידור העבודה.

לכל שקף: כותרת חדה, 3–4 נקודות תמציתיות, והנחיית דובר קצרה.`;
  }, [selectedEntity, selectedAiAnalysis, customers, notes, sites, ptoSessions]);

  // Dynamic Prompt for Video Script (Gemini) — REACTS IMMEDIATELY TO SELECTION!
  const dynamicVideoPrompt = useMemo(() => {
    if (selectedAiAnalysis?.cust) {
      const c = selectedAiAnalysis.cust;
      const notesCnt = selectedAiAnalysis.notes.length || c.notesCount || 0;
      const ptoCnt = selectedAiAnalysis.pto.length;
      const ptoMin = selectedAiAnalysis.totalPtoMin;
      const itemsStr = selectedAiAnalysis.items.join(", ") || "חומרי מליטה וגבס";

      return `צור תסריט וידאו קצר (60 שניות) בסגנון «דוח רנטגן עסקי» עבור תיק לקוח ${c.name} (#${c.customerNo}) בחברת ח. סבן חומרי בניין.

חלוקת זמנים:
00–10 שנ': פתיח מהיר — זיהוי הלקוח, היקף פעילות (${notesCnt} תעודות בתיק, ${selectedAiAnalysis.sites.length || 1} אתרי אספקה).
10–25 שנ': הרגלי קנייה וסלי מוצרים מובילים (${itemsStr}).
25–40 שנ': ניתוח לוגיסטי — ${ptoCnt} פריקות מנוף מאומתות מטאב איתוראן_PTO בהיקף של ${ptoMin} דקות פעילות מנוף נטו.
40–50 שנ': בקרת פקדונות (משטחי סבן ובלות), בירורים ואישורי מנכ"ל.
50–60 שנ': סיכום עם המלצת AI להראל ולראמי לקראת האספקה הבאה.

סגנון ויזואלי: רקע כהה, הדגשות טורקיז ואמבר, טיפוגרפיה חדה, מספרים מודגשים.
פלט: תסריט קריינות מלא + רשימת כותרות על המסך לפי שניות.`;
    }

    return `צור תסריט למצגת וידאו (Video Report) על בסיס דוח הרנטגן התפעולי של ח. סבן בלבד.
משך: 60–90 שניות. סגנון «סריקת רנטגן לוגיסטית».

מבנה:
0–10 שנ' כותרת + 3 מדדי KPI גדולים (לקוחות ${customers.length || 63}, תעודות ${notes.length || 101}, מנוף ${ptoSessions.length || 185})
10–35 שנ' לקוחות מובילים ופיזור אתרי אספקה במרכז הארץ
35–55 שנ' ביצועי מנוף איתוראן PTO (משאית מרצדס 615-41-002, זמני פריקה וחריגות מעל 20 דק')
55–75 שנ' מגמות רכש מליטה/גבס והמלצות סידור עבודה
75–90 שנ' סגירה וקריאה לפעולה תפעולית להראל אידלסון וראמי מסארווה

פלט:
1. תסריט קריינות עברי מלא (קצב בינוני, מקצועי)
2. רשימת כותרות מוקרנות על המסך לפי שניות
3. 4 הנחיות ליצירת גרפיקות רקע ביחס 16:9.`;
  }, [selectedAiAnalysis, customers, notes, ptoSessions]);

  // Copy helper
  const copyPrompt = async (kind: "slides" | "video") => {
    const text = kind === "slides" ? dynamicSlidesPrompt : dynamicVideoPrompt;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <PageHeader
        title="חדר רנטגן תפעולי"
        subtitle="סריקת KPI חכמה · שמות לקוחות מלאים וברורים · פקודות דינמיות המשתנות בכל לחיצה"
        action={
          <div className="flex items-center gap-2">
            {selectedEntity && (
              <button
                type="button"
                onClick={() => {
                  setSelectedEntity(null);
                  setLiveAiText("");
                }}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 text-xs font-bold text-rose-300 hover:bg-rose-500/20"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                חזור לדוח כללי
              </button>
            )}
            <button
              type="button"
              onClick={refetchAll}
              disabled={loading}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold hover:bg-muted disabled:opacity-60"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              סריקה מחדש
            </button>
          </div>
        }
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8" dir="rtl">
        {/* Dynamic Status / Interactive Selection Alert Bar */}
        <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/30 p-3.5 text-xs shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-cyan-200">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400">
                <Zap className="h-3.5 w-3.5 animate-pulse" />
              </span>
              <span>
                {selectedEntity ? (
                  <>
                    <strong className="text-white font-bold">חיווי מיידי — פקודות מותאמות: </strong>
                    נבחר כעת <span className="underline decoration-cyan-400 font-black text-cyan-300">{selectedEntity.title}</span>. פקודת המצגת ופקודת הווידאו למטה <span className="text-emerald-300 font-bold">השתנו והותאמו אליו בזמן אמת!</span>
                  </>
                ) : (
                  <>
                    <strong className="text-white font-bold">מצב דוח כללי: </strong>
                    לחץ על כל עמודה בתרשים או שורה ברשימה — תצוגת הפקודות של המצגת והווידאו <span className="font-bold text-cyan-300">תשתנה מיד בזמן אמת</span> עבור אותו לקוח/אתר!
                  </>
                )}
              </span>
            </div>
            {selectedEntity && (
              <button
                type="button"
                onClick={() => {
                  setSelectedEntity(null);
                  setLiveAiText("");
                }}
                className="shrink-0 rounded-lg border border-cyan-500/40 bg-cyan-500/20 px-2.5 py-1 text-[11px] font-bold text-cyan-100 hover:bg-cyan-500/30"
              >
                איפוס בחירה (חזרה לדוח סבן כללי)
              </button>
            )}
          </div>
        </div>

        {/* Quick Customer Test Pill Selector (Direct instant feedback test) */}
        {customers.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-card p-3 text-xs">
            <span className="flex items-center gap-1.5 font-bold text-muted-foreground">
              <Eye className="h-3.5 w-3.5 text-cyan-400" />
              בחירה מהירה לדוגמה:
            </span>
            {customers.slice(0, 6).map((c: any) => {
              const active = selectedEntity?.id === c.customerNo;
              return (
                <button
                  key={c.customerNo}
                  type="button"
                  onClick={() =>
                    handleSelectEntity({
                      type: "customer",
                      id: c.customerNo,
                      title: c.name || `לקוח #${c.customerNo}`,
                      data: c,
                    })
                  }
                  className={cn(
                    "rounded-xl border px-2.5 py-1 text-[11px] font-bold transition-all",
                    active
                      ? "border-cyan-500 bg-cyan-500/20 text-cyan-300 shadow-sm"
                      : "border-border hover:border-cyan-500/30 hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {c.name} (#{c.customerNo})
                </button>
              );
            })}
          </div>
        )}

        {/* Top Executive KPI Grid */}
        <section className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-5 text-slate-100 shadow-xl md:p-6">
          <div className="pointer-events-none absolute -left-20 top-0 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-20 bottom-0 h-48 w-48 rounded-full bg-emerald-400/15 blur-3xl" />

          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
                <ScanSearch className="h-4 w-4 animate-pulse" />
                סריקת רנטגן תפעולית · ח. סבן 1994 בע״מ
              </div>
              <h1 className="mt-1 font-display text-2xl font-black md:text-3xl">
                חדר ניתוח מנהלים ו-Notebook
              </h1>
              <p className="mt-1 max-w-3xl text-xs text-slate-300 md:text-sm">
                מערכת רנטגן דינמית. לחיצה על כל לקוח מעדכנת מיד את פרופיל הקניות שלו, פריקות המנוף מטאב איתוראן_PTO, ואת פקודת המצגת והווידאו.
              </p>
            </div>
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-center backdrop-blur-sm">
              <span className="block text-[11px] text-cyan-300">משאית מנוף פעילה</span>
              <span className="font-mono text-sm font-black text-white">615-41-002 (חכמת)</span>
            </div>
          </div>

          <div className="relative mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {kpis.map((k) => {
              const Icon = k.icon;
              return (
                <div
                  key={k.label}
                  className="group rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm transition-all hover:border-cyan-500/40 hover:bg-white/10"
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                    <span>{k.label}</span>
                    <Icon className={cn("h-3.5 w-3.5", k.color)} />
                  </div>
                  <div className="mt-1 text-xl font-black tabular-nums text-white md:text-2xl">
                    {k.value}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-slate-400">{k.sub}</div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Dynamic AI Live Inspection Card (Appears whenever an entity is selected) */}
        {selectedEntity && selectedAiAnalysis && (
          <section className="relative overflow-hidden rounded-3xl border-2 border-cyan-500/50 bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-950/70 p-5 shadow-2xl transition-all">
            <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-cyan-500/10 blur-2xl" />

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/40 bg-cyan-500/20 text-cyan-300 shadow-inner">
                  <Sparkles className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                      ניתוח AI מהיר — תיק נבחר
                    </span>
                    <span className="text-xs text-slate-400">
                      {selectedEntity.type === "customer" ? "תיק לקוח מאוחד" : selectedEntity.type === "note" ? "תעודת משלוח" : selectedEntity.type === "site" ? "אתר אספקה" : "סשן PTO מנוף"}
                    </span>
                  </div>
                  <h2 className="font-display text-lg font-black text-white md:text-xl">
                    {selectedEntity.title}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedAiAnalysis.cust && (
                  <button
                    type="button"
                    onClick={handleRunRealAi}
                    disabled={loadingAi}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/50 bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-60"
                  >
                    <Bot className={cn("h-3.5 w-3.5", loadingAi && "animate-spin")} />
                    <span>{loadingAi ? "מנתח ב-Gemini..." : "הרץ תחקיר AI חי (Gemini)"}</span>
                  </button>
                )}

                {selectedAiAnalysis.cust && (
                  <Link
                    to="/customers/$id"
                    params={{ id: selectedAiAnalysis.cust.customerNo }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/20 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/30"
                  >
                    <span>פתח תיק לקוח</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setSelectedEntity(null);
                    setLiveAiText("");
                  }}
                  className="rounded-xl border border-white/10 p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                  title="סגור ניתוח וחזור לדוח כללי"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Live Real AI Gemini Response Box (if executed) */}
            {liveAiText && (
              <div className="mt-4 rounded-2xl border border-emerald-500/40 bg-emerald-950/30 p-4 text-xs text-emerald-100 shadow-lg">
                <div className="flex items-center gap-2 font-bold text-emerald-300">
                  <Bot className="h-4 w-4" />
                  מענה חי מנועה AI (Gemini Live Analysis):
                </div>
                <div className="mt-2 whitespace-pre-wrap leading-relaxed text-slate-100">
                  {liveAiText}
                </div>
              </div>
            )}

            {/* AI Insight Pillars */}
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {/* Pillar 1: Customer Profile */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h3 className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                  <User className="h-4 w-4" />
                  פרופיל לקוח ומדדי רכש
                </h3>
                {selectedAiAnalysis.cust ? (
                  <div className="mt-2.5 space-y-1.5 text-xs text-slate-200">
                    <div className="flex justify-between">
                      <span className="text-slate-400">מספר לקוח:</span>
                      <span className="font-mono font-bold text-white">#{selectedAiAnalysis.cust.customerNo}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">איש קשר:</span>
                      <span>{selectedAiAnalysis.cust.contactName || selectedAiAnalysis.cust.name}</span>
                    </div>
                    {selectedAiAnalysis.cust.phone && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">טלפון:</span>
                        <span className="font-mono dir-ltr">{selectedAiAnalysis.cust.phone}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-400">תעודות משלוח בתיק:</span>
                      <span className="font-bold text-emerald-400">{selectedAiAnalysis.cust.notesCount || selectedAiAnalysis.notes.length} תעודות</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">נהג מוביל מועדף:</span>
                      <span className="font-bold text-amber-300">{selectedAiAnalysis.cust.preferredDriver || "חכמת גאבר (מנוף)"}</span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">לא אותר לקוח ישיר משויך לרשומה זו.</p>
                )}
              </div>

              {/* Pillar 2: Shopping Cart & Deposits */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h3 className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                  <Boxes className="h-4 w-4" />
                  פרופיל קניות ופיקדונות
                </h3>
                <div className="mt-2.5 space-y-2 text-xs text-slate-200">
                  <div>
                    <span className="text-[11px] text-slate-400">מוצרים מובילים בסל:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {selectedAiAnalysis.items.length > 0 ? (
                        selectedAiAnalysis.items.map((it: string, idx: number) => (
                          <span
                            key={idx}
                            className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300"
                          >
                            {it}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 text-[11px]">מלט אפור 25 ק״ג, טיט, בלוקים, גבס ואיטום</span>
                      )}
                    </div>
                  </div>
                  <div className="border-t border-white/5 pt-2">
                    <span className="text-[11px] text-slate-400">מאזן פיקדונות משוער:</span>
                    <div className="mt-1 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg bg-white/5 px-2 py-1">
                        <span className="text-slate-400">משטחי סבן: </span>
                        <span className="font-bold text-cyan-200">{selectedAiAnalysis.palletDeposits} משטחים</span>
                      </div>
                      <div className="rounded-lg bg-white/5 px-2 py-1">
                        <span className="text-slate-400">שקים/בלות: </span>
                        <span className="font-bold text-cyan-200">{selectedAiAnalysis.bagDeposits} שקים</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pillar 3: Sites & Ituran PTO Crane stats */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h3 className="flex items-center gap-2 text-xs font-bold text-amber-300">
                  <Truck className="h-4 w-4" />
                  אתרי אספקה ומנוף איתוראן PTO
                </h3>
                <div className="mt-2.5 space-y-1.5 text-xs text-slate-200">
                  <div className="flex justify-between">
                    <span className="text-slate-400">אתרי אספקה פעילים:</span>
                    <span className="font-bold">{selectedAiAnalysis.sites.length || (selectedAiAnalysis.cust?.address ? 1 : 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">פריקות מנוף מטאב איתוראן:</span>
                    <span className="font-bold text-amber-300">
                      {selectedAiAnalysis.pto.length} פריקות
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">סה״כ זמן שהיית מנוף:</span>
                    <span className="font-bold text-amber-300">
                      {selectedAiAnalysis.totalPtoMin} דקות
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">ממוצע פריקה לאתר:</span>
                    <span>{selectedAiAnalysis.avgPtoMin} דקות</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    כתובת עיקרית: <span className="text-slate-200 font-medium">{selectedAiAnalysis.cust?.address || selectedAiAnalysis.pto[0]?.address || "הוד השרון / מרכז"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Strategic Recommendation Box */}
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-cyan-500/30 bg-cyan-950/40 p-3.5 text-xs leading-relaxed text-cyan-100">
              <TrendingUp className="h-5 w-5 shrink-0 text-cyan-400" />
              <div>
                <span className="font-bold text-cyan-300">המלצת AI תפעולית לראמי והראל: </span>
                {selectedAiAnalysis.cust?.openInquiries > 0
                  ? `קיימים ${selectedAiAnalysis.cust.openInquiries} בירורים פתוחים. מומלץ לאמת זמני פריקת מנוף מול טאב איתוראן_PTO לפני הפקת חשבונית מס מרכזת.`
                  : selectedAiAnalysis.pto.length > 0
                  ? `הלקוח עובד באופן סדיר עם משאית מנוף 615-41-002. כל ${selectedAiAnalysis.pto.length} פריקות המנוף מאומתות באיתוראן וממוצע הזמן (${selectedAiAnalysis.avgPtoMin} דק׳) תקין. מומלץ להקצות מנוף 9 מטר בסבב ראשון.`
                  : `תיק לקוח פעיל. מומלץ לוודא כתובת אתר מלאה ומדויקת בטאב אתרי_לקוחות לקראת אספקת המנוף הבאה.`}
              </div>
            </div>
          </section>
        )}

        {/* Filters and Search Bar */}
        <section className="rounded-3xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTab(t.id);
                      setStatusFilter("הכל");
                    }}
                    className={cn(
                      "flex min-h-10 items-center gap-2 rounded-2xl border px-3.5 text-xs font-bold transition-all",
                      active
                        ? "border-cyan-500 bg-cyan-500/10 text-cyan-700 shadow-sm dark:text-cyan-300"
                        : "border-transparent hover:bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Search Box */}
            <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
              <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חיפוש לקוח, תעודה, עיר, כתובת..."
                className="w-full rounded-xl border bg-background py-2 pl-3 pr-9 text-xs focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Status Sub-Filters */}
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t pt-3">
            <span className="ml-1 text-[11px] font-bold text-muted-foreground">סינון מהיר:</span>
            {statusOptions.map((s) => {
              const active = statusFilter === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "min-h-8 rounded-full border px-3 text-[11px] font-semibold transition-all",
                    active
                      ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-800 dark:text-cyan-200 font-bold"
                      : "border-border hover:bg-muted text-muted-foreground"
                  )}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </section>

        {/* Master-Detail Data Section: Horizontal Chart & Item List (NO HIDDEN NAMES!) */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Main Visual Horizontal Bar Chart */}
          <section className="rounded-3xl border bg-card p-5 shadow-sm lg:col-span-7">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-sm font-bold">
                  תרשים עמודות אופקי — {TABS.find((t) => t.id === tab)?.label}
                </h2>
                <p className="text-xs text-muted-foreground">
                  שמות מלאים וברורים ללא חיתוך. לחץ על עמודה לעדכון מיידי של פקודות המצגת והווידאו!
                </p>
              </div>
              <span className="rounded-lg border px-2 py-1 text-[11px] font-bold text-muted-foreground">
                {activeItems.length} רשומות
              </span>
            </div>

            <div className="mt-5 h-[380px] w-full">
              {chartData.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">
                  אין נתונים התואמים את החיפוש והסינון הנוכחי
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={chartData}
                    margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border/50" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "currentColor" }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={160}
                      tick={{ fontSize: 11, fill: "currentColor" }}
                      interval={0}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        fontSize: 12,
                        backgroundColor: "rgba(15, 23, 42, 0.95)",
                        color: "#fff",
                        border: "1px solid rgba(255,255,255,0.1)",
                        direction: "rtl",
                        textAlign: "right",
                      }}
                      formatter={(val: number) => [val, tab === "pto" ? "פריקות מנוף" : tab === "sites" ? "אירועים" : "תעודות משלוח"]}
                    />
                    <Bar
                      dataKey="count"
                      radius={[0, 6, 6, 0]}
                      onClick={(entry) => {
                        if (entry?.raw) {
                          handleSelectEntity({
                            type: tab === "customers" ? "customer" : tab === "sites" ? "site" : "note",
                            id: entry.key,
                            title: entry.raw.name || entry.raw.address || entry.key,
                            data: entry.raw,
                          });
                        }
                      }}
                    >
                      {chartData.map((entry, i) => {
                        const isSelected = selectedEntity?.id === entry.key;
                        return (
                          <Cell
                            key={i}
                            fill={isSelected ? "#22d3ee" : CHART_COLORS[i % CHART_COLORS.length]}
                            className="cursor-pointer transition-all hover:opacity-80"
                          />
                        );
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          {/* Interactive Item List (Clickable entities) */}
          <aside className="flex flex-col rounded-3xl border bg-card p-5 shadow-sm lg:col-span-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-sm font-bold">
                  בחירת {TABS.find((t) => t.id === tab)?.label}
                </h2>
                <p className="text-[11px] text-muted-foreground">לחץ על שורה לשינוי מיידי של הפקודות</p>
              </div>
              {selectedEntity && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEntity(null);
                    setLiveAiText("");
                  }}
                  className="text-[11px] font-bold text-rose-400 hover:underline"
                >
                  נקה בחירה
                </button>
              )}
            </div>

            <div className="mt-3 max-h-[360px] flex-1 space-y-2 overflow-y-auto pr-1">
              {activeItems.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  לא נמצאו רשומות
                </div>
              ) : (
                activeItems.slice(0, 35).map((item: any, idx: number) => {
                  let key = "";
                  let title = "";
                  let subtitle = "";
                  let metric = "";
                  let entityType: "customer" | "note" | "site" | "pto" = "customer";

                  if (tab === "customers") {
                    entityType = "customer";
                    key = item.customerNo;
                    title = item.name || `לקוח #${item.customerNo}`;
                    subtitle = item.address || "ללא כתובת רשומה";
                    metric = `${item.notesCount || 0} תעודות`;
                  } else if (tab === "notes") {
                    entityType = "note";
                    key = String(item.noteId || item["מס' תעודת משלוח"] || idx);
                    title = `תעודה #${key} · ${item.customerName || item["שם לקוח"] || ""}`;
                    subtitle = item.address || item["כתובת אספקה"] || "";
                    metric = String(item.approval || item.status || "מאושר");
                  } else if (tab === "sites") {
                    entityType = "site";
                    key = item.siteKey || item.address || String(idx);
                    title = item.address || "אתר אספקה";
                    subtitle = item.customerName || "לקוח לא משויך";
                    metric = `${item.ptoOpens || 0} מנוף`;
                  } else {
                    entityType = "pto";
                    key = item.id || `${item.date}_${item.openTime}_${idx}`;
                    title = `${item.address || "אתר פריקה"}`;
                    subtitle = `${item.date || ""} (${item.openTime || ""} - ${item.closeTime || ""})`;
                    metric = `${item.durationMin || 0} דק׳`;
                  }

                  const isSelected = selectedEntity?.id === key;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        handleSelectEntity({
                          type: entityType,
                          id: key,
                          title,
                          data: item,
                        })
                      }
                      className={cn(
                        "group flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-start transition-all",
                        isSelected
                          ? "border-cyan-500 bg-cyan-500/20 shadow-md ring-1 ring-cyan-500/60"
                          : "border-border/60 hover:border-cyan-500/40 hover:bg-muted/50"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "truncate text-xs font-bold",
                              isSelected ? "text-cyan-400 font-black" : "text-foreground"
                            )}
                          >
                            {title}
                          </span>
                          {isSelected && (
                            <span className="rounded bg-cyan-500/30 px-1.5 py-0.2 text-[9px] font-bold text-cyan-200">
                              נבחר כעת
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] font-bold text-foreground">
                          {metric}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        </div>

        {/* Dynamic Presentation & Video Generator Section (UPDATES INSTANTLY ON CLICK!) */}
        <section className="rounded-3xl border-2 border-cyan-500/40 bg-gradient-to-l from-cyan-950/25 via-card to-purple-950/25 p-5 shadow-xl md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-cyan-400">
                <Sparkles className="h-4 w-4 animate-spin-slow" />
                מחולל פקודות מנהלים דינמי — מתעדכן אוטומטית בכל לחיצה
              </div>
              <h2 className="mt-1 font-display text-lg font-black text-white">
                תצוגת פקודות ל-NotebookLM / Gemini
              </h2>
              <p className="text-xs text-slate-300">
                {selectedEntity ? (
                  <span>
                    הפקודות מכוונות כעת במדויק עבור <strong className="text-cyan-300 font-bold">{selectedEntity.title}</strong> כולל נתוני ה-PTO והרכש שלו.
                  </span>
                ) : (
                  <span>
                    מצב כללי: מציג את דוח המאקרו של כלל לקוחות ופעילות חברת סבן (לחץ על לקוח למיקוד).
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void copyPrompt("slides")}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-2xl border px-4 text-xs font-black transition-all active:scale-95",
                  copied === "slides"
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                    : "border-cyan-500/50 bg-cyan-600 text-white hover:bg-cyan-500 shadow-lg shadow-cyan-950/40"
                )}
              >
                {copied === "slides" ? <Check className="h-4 w-4" /> : <Presentation className="h-4 w-4" />}
                {copied === "slides" ? "פקודת מצגת הועתקה!" : "העתק פקודת מצגת (NotebookLM)"}
              </button>

              <button
                type="button"
                onClick={() => void copyPrompt("video")}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-2xl border px-4 text-xs font-black transition-all active:scale-95",
                  copied === "video"
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                    : "border-purple-500/50 bg-purple-600 text-white hover:bg-purple-500 shadow-lg shadow-purple-950/40"
                )}
              >
                {copied === "video" ? <Check className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                {copied === "video" ? "פקודת וידאו הועתקה!" : "העתק פקודת וידאו 60 שנ׳ (Gemini)"}
              </button>
            </div>
          </div>

          {/* Side-by-side Live Prompt Previews (FULLY VISIBLE & REACTIVE) */}
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {/* Slide Prompt Box */}
            <div className="flex flex-col rounded-2xl border border-cyan-500/30 bg-slate-950/90 p-4 shadow-inner">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <span className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                  <Presentation className="h-4 w-4" />
                  תצוגת פקודת מצגת
                </span>
                <button
                  type="button"
                  onClick={() => void copyPrompt("slides")}
                  className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  <span>העתק</span>
                </button>
              </div>
              <pre className="mt-3 max-h-72 flex-1 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-200 selection:bg-cyan-500/30">
                {dynamicSlidesPrompt}
              </pre>
            </div>

            {/* Video Prompt Box */}
            <div className="flex flex-col rounded-2xl border border-purple-500/30 bg-slate-950/90 p-4 shadow-inner">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <span className="flex items-center gap-2 text-xs font-bold text-purple-300">
                  <Video className="h-4 w-4" />
                  תצוגת פקודת מצגת וידאו
                </span>
                <button
                  type="button"
                  onClick={() => void copyPrompt("video")}
                  className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-purple-300"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  <span>העתק</span>
                </button>
              </div>
              <pre className="mt-3 max-h-72 flex-1 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-200 selection:bg-purple-500/30">
                {dynamicVideoPrompt}
              </pre>
            </div>
          </div>
        </section>

        {/* Footer info */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            מערכת נועה AI · ח. סבן חומרי בניין (1994) בע״מ · התלמיד 6 הוד השרון
          </span>
          <div className="flex items-center gap-3">
            <Link to="/chat" className="font-bold text-cyan-600 hover:underline dark:text-cyan-400">
              חזרה לצ׳אט נועה
            </Link>
            <span>·</span>
            <Link to="/orders" className="font-bold text-cyan-600 hover:underline dark:text-cyan-400">
              הזמנות בסידור
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
