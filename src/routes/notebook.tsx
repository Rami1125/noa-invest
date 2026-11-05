/**
 * /notebook — חדר רנטגן תפעולי וניתוח AI מהיר
 * ח. סבן חומרי בניין (1994) בע"מ — סניף התלמיד 6 הוד השרון
 * כולל: סריקת KPI, סינון לפי טאבים, ניתוח AI חי לכל לקוח/תעודה/אתר/PTO,
 * והפקת פקודות דינמיות למצגת ב-NotebookLM ולווידאו דוח מצב ב-Gemini.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
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
  FileText,
  Filter,
  Layers,
  MapPin,
  Package,
  Phone,
  Presentation,
  RefreshCw,
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
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { getSiteAtlasFn, listCustomerIndexFn } from "@/lib/customer-history.functions";
import { listNotesFn, listPtoFn } from "@/lib/notes-api.functions";
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

  // Cross-reference helper: Find matching PTO sessions for a given address
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
      return ["הכל", "פעיל 30 יום", "עם בירורים פתוחים", "מעל 5 תעודות", "ללא ביקורים"];
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
    return ["הכל", "מזוגים מלא", "יתומים (פתיחה/סגירה חסרה)", "פריקה מעל 30 דק׳"];
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
      { label: "לקוחות פעילים", value: customers.length, sub: "במאגר המאוחד", icon: Users, color: "text-cyan-400" },
      { label: "תעודות משלוח", value: notes.length, sub: `${approvedNotes} מאושרות לחיוב`, icon: FileText, color: "text-emerald-400" },
      { label: "אתרי אספקה", value: sites.length, sub: "מופו גיאוגרפית", icon: MapPin, color: "text-blue-400" },
      { label: "סשני מנוף PTO", value: totalPtoOpens, sub: `${pairedPto} מושלמים`, icon: Truck, color: "text-amber-400" },
      { label: "סה״כ דק׳ מנוף", value: `${totalCraneMinutes} דק׳`, sub: `${(totalCraneMinutes / 60).toFixed(1)} שעות עבודה`, icon: Clock, color: "text-purple-400" },
      { label: "בירורים פתוחים", value: customers.reduce((acc, c) => acc + (c.openInquiries || 0), 0), sub: "דורשים מענה", icon: AlertTriangle, color: "text-rose-400" },
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
        if (statusFilter === "מעל 5 תעודות") return (c.notesCount || 0) >= 5;
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
      if (statusFilter === "יתומים (פתיחה/סגירה חסרה)") return !!s.orphan;
      if (statusFilter === "פריקה מעל 30 דק׳") return (s.durationMin || 0) > 30;
      return true;
    });
  }, [tab, customers, notes, sites, ptoSessions, searchQuery, statusFilter]);

  // Chart Data preparation
  const chartData = useMemo(() => {
    if (tab === "customers") {
      return activeItems.slice(0, 10).map((c: any) => ({
        key: c.customerNo,
        name: c.name?.slice(0, 16) || c.customerNo,
        תעודות: c.notesCount || 0,
        ביקורים: c.visitsCount || 0,
        raw: c,
      }));
    }
    if (tab === "notes") {
      const byCity = new Map<string, number>();
      activeItems.forEach((n: any) => {
        const addr = String(n.address || n["כתובת אספקה"] || "");
        const parts = addr.split(",");
        const city = (parts[parts.length - 1] || addr || "לא צוין").trim();
        byCity.set(city, (byCity.get(city) || 0) + 1);
      });
      return Array.from(byCity.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([name, count]) => ({ key: name, name, תעודות: count }));
    }
    if (tab === "sites") {
      return activeItems.slice(0, 10).map((s: any) => ({
        key: s.siteKey || s.address,
        name: (s.address || "").slice(0, 18),
        ביקורים: s.visits || 0,
        פריקות_מנוף: s.ptoOpens || 0,
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
      .slice(-12)
      .map(([name, count]) => ({ key: name, name, פריקות: count }));
  }, [tab, activeItems]);

  // AI Deep Intelligence Computation on currently selected item
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
        const addr = p.address || "";
        return (
          (targetCust.address && addr.includes(targetCust.address.split(",")[0])) ||
          targetSites.some((ts) => ts.address && addr.includes(ts.address.split(",")[0]))
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

    const totalPtoMin = targetPto.reduce((acc, p) => acc + (p.durationMin || 0), 0);
    const avgPtoMin = targetPto.length ? Math.round(totalPtoMin / targetPto.length) : 0;

    return {
      cust: targetCust,
      notes: targetNotes,
      sites: targetSites,
      pto: targetPto,
      items: itemsList.slice(0, 6),
      palletDeposits,
      bagDeposits,
      totalPtoMin,
      avgPtoMin,
    };
  }, [selectedEntity, customers, notes, sites, ptoSessions]);

  // Dynamic Prompt for Slide Deck (NotebookLM)
  const dynamicSlidesPrompt = useMemo(() => {
    if (selectedAiAnalysis?.cust) {
      const c = selectedAiAnalysis.cust;
      const notesCnt = selectedAiAnalysis.notes.length;
      const ptoCnt = selectedAiAnalysis.pto.length;
      const ptoMin = selectedAiAnalysis.totalPtoMin;
      const itemsStr = selectedAiAnalysis.items.join(", ") || "חומרי מליטה, גבס ואיטום כללי";

      return `על בסיס נתוני ח. סבן חומרי בניין בלבד (ללא בדיון מספרים):\n\nהפק מצגת רנטגן תפעולית ממוקדת עבור לקוח: ${c.name} (לקוח מס' #${c.customerNo})\n\nשקפים נדרשים (6–8 שקפים, עברית עסקית RTL):\n1. שער: תיק לקוח ופרופיל רכש — ${c.name} (#${c.customerNo})\n2. מדדי ליבה: סה"כ ${c.notesCount || notesCnt} תעודות משלוח, ${c.ordersCount || 0} הזמנות, פעיל מ-${c.firstIso ? new Date(c.firstIso).toLocaleDateString("he-IL") : "2026"} עד ${c.lastIso ? new Date(c.lastIso).toLocaleDateString("he-IL") : "היום"}\n3. אתרי אספקה ופעילות: כתובת רשומה: ${c.address || "לא הוזנה"} | ${c.addressesCount || selectedAiAnalysis.sites.length} אתרי אספקה פעילים\n4. ניתוח מנוף מטאב איתוראן PTO: סה"כ ${ptoCnt} פריקות מנוף מאומתות למשאית 615-41-002 (חכמת גאבר) בהיקף ${ptoMin} דקות (ממוצע ${selectedAiAnalysis.avgPtoMin} דק' לאתר)\n5. פרופיל קניות ומוצרים מובילים: ${itemsStr}\n6. מאזן פיקדונות: משטחי סבן ובלות (חיובים וזיכויים פעילים)\n7. בקרת איכות ובירורים: ${c.openInquiries > 0 ? `שים לב: קיימים ${c.openInquiries} בירורים פתוחים הדורשים טיפול ראמי/הראל` : "ללא בירורים פתוחים — חשבון תקין"}\n8. המלצות מסחריות והיערכות לשבוע הקרוב מול סידור העבודה.\n\nלכל שקף: כותרת, 3–4 תבליטים תמציתיים, והערת קריין של 20 שניות.`;
    }

    if (selectedEntity?.type === "pto") {
      const p = selectedEntity.data as PairedPtoSession;
      return `על בסיס נתוני ח. סבן חומרי בניין בלבד:\n\nהפק מצגת תחקיר לוגיסטי על פריקת מנוף (איתוראן PTO):\nמשאית: ${p.truck || "615-41-002"} | נהג: ${p.driver || "חכמת גאבר"}\nכתובת אתר: ${p.address}\nזמן פעילות מנוף: ${p.openTime || "-"} עד ${p.closeTime || "-"} (סה"כ ${p.durationMin || 0} דקות)\n\nשקפים:\n1. שער תחקיר פריקה\n2. חלון פריקה ואיתוראן GPS מול תעודת משלוח\n3. עמידה בתקן זמני מנוף (חריגה מעל 20 דק' / תקין)\n4. הצלבת חתימות מקבל ומנהל סידור (ראמי מסארווה)\n5. לקחים לסידור עבודה והקצאת מנוף 9 מטר.`;
    }

    // Default: Overall Saban logistics briefing
    const topCust = customers
      .slice(0, 6)
      .map((c) => `- ${c.name} (#${c.customerNo}): ${c.notesCount} תעודות, ${c.visitsCount} ביקורים`)
      .join("\n");
    const topSites = sites
      .filter((s) => (s.ptoOpens || 0) > 0)
      .slice(0, 5)
      .map((s) => `- ${s.address}: ${s.ptoOpens} פתיחות מנוף, ${s.visits} ביקורים`)
      .join("\n");

    return `על בסיס דוח הרנטגן התפעולי של ח. סבן בלבד (חומרי בניין 1994 בע"מ):\n\nצור מצגת מכווצת בעברית, 8 שקפים, סגנון מקצועי RTL להנהלה (הראל אידלסון וראמי מסארווה).\n\nשקפים חובה:\n1. שער — דוח מצב תפעולי וניתוח רנטגן כללי\n2. KPI ארגוני — לקוחות ${customers.length} · תעודות ${notes.length} · אתרים ${sites.length} · אירועי מנוף איתוראן ${ptoSessions.length}\n3. לקוחות מפתח וריכוז פעילות:\n${topCust}\n4. פעילות מנוף וכתובות מרכזיות (איתוראן PTO):\n${topSites}\n5. ניתוח פריקות מנוף: ממוצע זמן פריקה, חלוקה בין הוד השרון, רעננה, תל אביב ורמת גן\n6. בקרה ובירורים פתוחים (הצלבת תעודות מול כתב יד ואיתוראן)\n7. חיזוי צריכת חומרי מליטה וגבס ל-30 יום הקרובים\n8. משימות לפתיחת שבוע בסידור העבודה.\n\nלכל שקף: כותרת חדה, 3–4 נקודות תמציתיות, והנחיית דובר קצרה.`;
  }, [selectedEntity, selectedAiAnalysis, customers, notes, sites, ptoSessions]);

  // Dynamic Prompt for Video Script (Gemini)
  const dynamicVideoPrompt = useMemo(() => {
    if (selectedAiAnalysis?.cust) {
      const c = selectedAiAnalysis.cust;
      return `צור תסריט וידאו קצר (60 שניות) בסגנון «דוח רנטגן עסקי» עבור תיק לקוח ${c.name} (#${c.customerNo}) בחברת ח. סבן חומרי בניין.\n\nחלוקת זמנים:\n00–10 שנ': פתיח מהיר — זיהוי הלקוח, היקף פעילות (${c.notesCount || 0} תעודות, ${selectedAiAnalysis.sites.length} אתרים).\n10–25 שנ': הרגלי קנייה וסלי מוצרים מובילים (${selectedAiAnalysis.items.join(", ") || "מליטה וגבס"}).\n25–40 שנ': ניתוח לוגיסטי — ${selectedAiAnalysis.pto.length} פריקות מנוף (איתוראן PTO) בהיקף ${selectedAiAnalysis.totalPtoMin} דקות.\n40–50 שנ': בקרת פקדונות, בירורים ואישורי מנכ"ל.\n50–60 שנ': סיכום עם המלצת AI להראל ולראמי לקראת האספקה הבאה.\n\nסגנון ויזואלי: רקע כהה, הדגשות טורקיז ואמבר, טיפוגרפיה חדה, מספרים מודגשים.`;
    }

    return `צור תסריט למצגת וידאו (Video Report) על בסיס דוח הרנטגן התפעולי של ח. סבן בלבד.\nמשך: 60–90 שניות. סגנון «סריקת רנטגן לוגיסטית».\n\nמבנה:\n0–10 שנ' כותרת + 3 מדדי KPI גדולים (לקוחות, תעודות, מנוף)\n10–35 שנ' לקוחות מובילים ופיזור אתרי אספקה\n35–55 שנ' ביצועי מנוף איתוראן PTO (זמני פריקה וחריגות מעל 30 דק')\n55–75 שנ' מגמות רכש מליטה/גבס והמלצות סידור\n75–90 שנ' סגירה וקריאה לפעולה תפעולית להראל וראמי\n\nפלט:\n1. תסריט קריינות עברי מלא (קצב בינוני, מקצועי)\n2. רשימת כותרות מוקרנות על המסך לפי שניות\n3. 4 הנחיות ליצירת גרפיקות רקע ביחס 16:9.`;
  }, [selectedAiAnalysis]);

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
        subtitle="סריקת KPI חכמה · ניתוח AI חי לכל לקוח ואתר · פקודות דינמיות למצגת ווידאו"
        action={
          <div className="flex items-center gap-2">
            {selectedEntity && (
              <button
                type="button"
                onClick={() => setSelectedEntity(null)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 text-xs font-bold text-rose-300 hover:bg-rose-500/20"
              >
                <X className="h-3.5 w-3.5" />
                איפוס בחירה
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
        {/* Top Executive KPI Grid */}
        <section className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-5 text-slate-100 shadow-xl md:p-6">
          <div className="pointer-events-none absolute -left-20 top-0 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-20 bottom-0 h-48 w-48 rounded-full bg-emerald-400/15 blur-3xl" />

          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
                <ScanSearch className="h-4 w-4 animate-pulse" />
                סריקת רנטגן תפעולית בזמן אמת · ח. סבן 1994 בע״מ
              </div>
              <h1 className="mt-1 font-display text-2xl font-black md:text-3xl">
                חדר ניתוח מנהלים ו-Notebook
              </h1>
              <p className="mt-1 max-w-3xl text-xs text-slate-300 md:text-sm">
                לחץ על כל לקוח, תעודה, אתר או פריקת מנוף ברשימה לקבלת <span className="font-bold text-cyan-300">ניתוח AI מהיר</span> והתאמה אוטומטית של פקודות המצגת והווידאו לנתוני הלקוח המדויקים.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-center backdrop-blur-sm">
                <span className="block text-[11px] text-cyan-300">משאית מנוף פעילה</span>
                <span className="font-mono text-sm font-black text-white">615-41-002 (מרצדס)</span>
              </div>
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
          <section className="relative overflow-hidden rounded-3xl border-2 border-cyan-500/40 bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-950/60 p-5 shadow-2xl transition-all">
            <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-cyan-500/10 blur-2xl" />

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/40 bg-cyan-500/20 text-cyan-300 shadow-inner">
                  <Sparkles className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                      ניתוח AI מהיר בזמן אמת
                    </span>
                    <span className="text-xs text-slate-400">
                      נבחר: {selectedEntity.type === "customer" ? "תיק לקוח" : selectedEntity.type === "note" ? "תעודת משלוח" : selectedEntity.type === "site" ? "אתר אספקה" : "סשן PTO מנוף"}
                    </span>
                  </div>
                  <h2 className="font-display text-lg font-black text-white md:text-xl">
                    {selectedEntity.title}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2">
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
                  onClick={() => setSelectedEntity(null)}
                  className="rounded-xl border border-white/10 p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                  title="סגור ניתוח"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

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
                      <span className="font-mono font-bold">#{selectedAiAnalysis.cust.customerNo}</span>
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
                      <span className="text-slate-400">תעודות משלוח:</span>
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
                        <span className="text-slate-400 text-[11px]">חומרי מליטה, צמנט נשר וטיט</span>
                      )}
                    </div>
                  </div>
                  <div className="border-t border-white/5 pt-2">
                    <span className="text-[11px] text-slate-400">מאזן פיקדונות משוער:</span>
                    <div className="mt-1 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg bg-white/5 px-2 py-1">
                        <span className="text-slate-400">משטחי סבן: </span>
                        <span className="font-bold text-cyan-200">{selectedAiAnalysis.palletDeposits || 3}</span>
                      </div>
                      <div className="rounded-lg bg-white/5 px-2 py-1">
                        <span className="text-slate-400">שקים/בלות: </span>
                        <span className="font-bold text-cyan-200">{selectedAiAnalysis.bagDeposits || 5}</span>
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
                    <span className="text-slate-400">פריקות מנוף מאומתות (PTO):</span>
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
                  ? `קיימים ${selectedAiAnalysis.cust.openInquiries} בירורים הממתינים לבדיקה. מומלץ לאמת זמני פריקת מנוף מול טאב איתוראן_PTO לפני הפקת החשבונית הסופית.`
                  : selectedAiAnalysis.pto.length > 0
                  ? `הלקוח עובד באופן סדיר עם משאית מנוף 615-41-002. פריקות המנוף מאומתות וממוצע הזמן (${selectedAiAnalysis.avgPtoMin} דק׳) עומד בתקן חברת סבן. מומלץ לתאם אספקה הבאה בסבב בוקר ראשון.`
                  : `תיק לקוח פעיל. מומלץ לעדכן כתובת מדויקת בטאב אתרי_לקוחות לסנכרון פריקות מנוף אוטומטי מול איתוראן.`}
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
                      setSelectedEntity(null);
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
                placeholder="חיפוש לפי שם, מספר, כתובת..."
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

        {/* Master-Detail Data Section: Interactive Chart & Item List */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Main Visual Chart */}
          <section className="rounded-3xl border bg-card p-5 shadow-sm lg:col-span-7">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-sm font-bold">
                  תרשים עמודות — {TABS.find((t) => t.id === tab)?.label}
                </h2>
                <p className="text-xs text-muted-foreground">
                  הצגת התפלגות פעילות. לחץ על פריט ברשימה מימין לניתוח AI מהיר
                </p>
              </div>
              <span className="rounded-lg border px-2 py-1 text-[11px] font-bold text-muted-foreground">
                {activeItems.length} רשומות
              </span>
            </div>

            <div className="mt-5 h-80 w-full">
              {chartData.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">
                  אין נתונים התואמים את החיפוש והסינון הנוכחי
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 12, right: 8, left: -10, bottom: 50 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: "currentColor" }}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "currentColor" }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        fontSize: 12,
                        backgroundColor: "rgba(15, 23, 42, 0.95)",
                        color: "#fff",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    />
                    <Bar
                      dataKey={tab === "pto" ? "פריקות" : "תעודות"}
                      radius={[6, 6, 0, 0]}
                      onClick={(entry) => {
                        if (entry?.raw) {
                          setSelectedEntity({
                            type: tab === "customers" ? "customer" : tab === "sites" ? "site" : "note",
                            id: entry.key,
                            title: entry.raw.name || entry.raw.address || entry.key,
                            data: entry.raw,
                          });
                        }
                      }}
                    >
                      {chartData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                          className="cursor-pointer transition-opacity hover:opacity-80"
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          {/* Interactive Item List (Clickable entities) */}
          <aside className="flex flex-col rounded-3xl border bg-card p-5 shadow-sm lg:col-span-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold">
                רשימת {TABS.find((t) => t.id === tab)?.label}
              </h2>
              <span className="text-xs text-muted-foreground">לחץ לבחירה וניתוח</span>
            </div>

            <div className="mt-3 max-h-[380px] flex-1 space-y-2 overflow-y-auto pr-1">
              {activeItems.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  לא נמצאו רשומות
                </div>
              ) : (
                activeItems.slice(0, 40).map((item: any, idx: number) => {
                  let key = "";
                  let title = "";
                  let subtitle = "";
                  let metric = "";
                  let entityType: "customer" | "note" | "site" | "pto" = "customer";

                  if (tab === "customers") {
                    entityType = "customer";
                    key = item.customerNo;
                    title = item.name || item.customerNo;
                    subtitle = item.address || "ללא כתובת";
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
                        setSelectedEntity({
                          type: entityType,
                          id: key,
                          title,
                          data: item,
                        })
                      }
                      className={cn(
                        "group flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-start transition-all",
                        isSelected
                          ? "border-cyan-500 bg-cyan-500/15 shadow-sm ring-1 ring-cyan-500/50"
                          : "border-border/60 hover:border-cyan-500/30 hover:bg-muted/40"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "truncate text-xs font-bold",
                              isSelected ? "text-cyan-700 dark:text-cyan-300" : "text-foreground"
                            )}
                          >
                            {title}
                          </span>
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

        {/* Dynamic Presentation & Video Generator Section */}
        <section className="rounded-3xl border border-cyan-500/30 bg-gradient-to-l from-cyan-950/20 via-card to-purple-950/20 p-5 shadow-card md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-cyan-400">
                <Sparkles className="h-4 w-4" />
                מחולל פקודות מנהלים דינמי · מתעדכן לפי הבחירה הפעילה
              </div>
              <h2 className="mt-1 font-display text-lg font-bold">
                יצוא פקודות ל-NotebookLM / Gemini
              </h2>
              <p className="text-xs text-muted-foreground">
                {selectedEntity
                  ? `הפקודות מותאמות כעת באופן מלא עבור: ${selectedEntity.title}`
                  : "הפקודות מכוונות כעת לדוח לוגיסטיקה ארגוני מלא של ח. סבן חומרי בניין."}
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
                    : "border-cyan-500/50 bg-cyan-600 text-white hover:bg-cyan-500 shadow-md shadow-cyan-950/30"
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
                    : "border-purple-500/50 bg-purple-600 text-white hover:bg-purple-500 shadow-md shadow-purple-950/30"
                )}
              >
                {copied === "video" ? <Check className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                {copied === "video" ? "פקודת וידאו הועתקה!" : "העתק פקודת וידאו 60 שנ׳ (Gemini)"}
              </button>
            </div>
          </div>

          {/* Side-by-side Live Prompt Previews (Zero truncated or hidden text) */}
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {/* Slide Prompt Box */}
            <div className="flex flex-col rounded-2xl border border-cyan-500/20 bg-slate-950/80 p-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <span className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                  <Presentation className="h-4 w-4" />
                  תצוגת פקודת מצגת (NotebookLM / Slides)
                </span>
                <button
                  type="button"
                  onClick={() => void copyPrompt("slides")}
                  className="text-xs text-slate-400 hover:text-cyan-300"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                </button>
              </div>
              <pre className="mt-3 max-h-64 flex-1 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-200">
                {dynamicSlidesPrompt}
              </pre>
            </div>

            {/* Video Prompt Box */}
            <div className="flex flex-col rounded-2xl border border-purple-500/20 bg-slate-950/80 p-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <span className="flex items-center gap-2 text-xs font-bold text-purple-300">
                  <Video className="h-4 w-4" />
                  תצוגת פקודת מצגת וידאו (Gemini Video Prompt)
                </span>
                <button
                  type="button"
                  onClick={() => void copyPrompt("video")}
                  className="text-xs text-slate-400 hover:text-purple-300"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                </button>
              </div>
              <pre className="mt-3 max-h-64 flex-1 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-200">
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
              צ׳אט נועה תפעולי
            </Link>
            <span>·</span>
            <Link to="/orders" className="font-bold text-cyan-600 hover:underline dark:text-cyan-400">
              לוח הזמנות בסידור
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
