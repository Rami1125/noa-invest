/** NotebookPage — logic for /notebook */
import { useMemo, useState } from "react";
import { Users, FileText, MapPin, Truck, Clock, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getSiteAtlasFn, listCustomerIndexFn } from "@/lib/customer-history.functions";
import { listNotesFn, listPtoFn } from "@/lib/notes-api.functions";
import { pairPtoEvents, type PairedPtoSession } from "@/lib/smart-dispatch/pto-pairing";
import { NotebookXrayView } from "@/components/NotebookXrayView";
import {
  type TabId,
  PTO_ALERT_MIN,
  polishForTts,
} from "@/lib/notebook-xray";

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
  const [copied, setCopied] = useState<"slides" | "video" | "noa" | "whatsapp" | "pack" | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [audienceMode, setAudienceMode] = useState<"internal" | "customer">("internal");

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
      truck: String(r.truck || r["משאית"] || ""),
      driver: String(r.driver || r["נהג"] || ""),
      eventType: String(r.eventType || r.type || ""),
      eventTimeIso: String(r.eventTimeIso || r.time || r.eventTime || ""),
      address: String(r.address || r["כתובת"] || ""),
    }));
    return pairPtoEvents(mapped);
  }, [ptoQ.data]);

  const customers = custQ.data?.customers || [];
  const sites = atlasQ.data?.sites || [];

  const getPtoForAddress = (address: string) => {
    if (!address) return [];
    const cleanAddr = address.replace(/[^\u0590-\u05FFa-zA-Z0-9 ]/g, " ").trim();
    const words = cleanAddr.split(/\s+/).filter((w) => w.length > 2);
    return ptoSessions.filter((s) => {
      const sAddr = s.address || "";
      return words.some((w) => sAddr.includes(w));
    });
  };

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
      { label: "סה\"כ דק׳ מנוף", value: `${totalCraneMinutes} דק׳`, sub: `${(totalCraneMinutes / 60).toFixed(1)} שעות עבודה`, icon: Clock, color: "text-purple-400" },
      { label: "בירורים פתוחים", value: customers.reduce((acc, c) => acc + (c.openInquiries || 0), 0), sub: "דורשים מענה", icon: AlertTriangle, color: "text-rose-400" },
    ];
  }, [customers, notes, sites, ptoSessions]);

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
      targetSites = sites.filter((s) => String(s.customerNo || "") === targetCust.customerNo);
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
    const ptoAlerts = targetPto.filter((p) => (p.durationMin ?? 0) > PTO_ALERT_MIN);
    const maxPtoMin = targetPto.reduce((m, p) => Math.max(m, p.durationMin ?? 0), 0);

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
      ptoAlertCount: ptoAlerts.length,
      maxPtoMin,
      ptoAlertSessions: ptoAlerts.slice(0, 5),
    };
  }, [selectedEntity, customers, notes, sites, ptoSessions]);

  const dynamicNoaVoicePrompt = useMemo(() => {
    const a = selectedAiAnalysis;
    if (a?.cust) {
      const c = a.cust;
      const alert =
        a.ptoAlertCount > 0
          ? `חריגות מנוף מעל ${PTO_ALERT_MIN} דק׳: ${a.ptoAlertCount} (מקס׳ ${a.maxPtoMin}).`
          : `אין חריגות מנוף מעל ${PTO_ALERT_MIN} דק׳ בטווח הנתונים.`;
      const dep =
        a.palletDeposits > 0 || a.bagDeposits > 0
          ? `פקדונות בתעודות: ${a.palletDeposits} משטחים, ${a.bagDeposits} בלות.`
          : `לא זוהו פקדונות מפורשים בתעודות שבמסך.`;
      return `פקודה לנועה AI — הסבר וקריינות בגובה העיניים על הלקוח ${c.name} (#${c.customerNo}):
"אהלן ראמי והראל, כאן נועה. תיק ${c.name}: ${c.notesCount || a.notes.length} תעודות, ${a.pto.length} פריקות מנוף, סה״כ ${a.totalPtoMin} דק׳ (ממוצע ${a.avgPtoMin}).
${alert} ${dep}
המלצה 1: הזמנה מרוכזת לתחילת שבוע במקום השלמות קטנות.
המלצה 2: היערכות להפתעות מעובדים — וואטסאפ ערב לפני, איש קשר באתר, פתק פקדונות לנהג."`;
    }
    return `פקודה לנועה AI — רנטגן תפעולי:
"אהלן ראמי והראל, כאן נועה. במאגר ${customers.length} לקוחות, ${notes.length} תעודות, ${sites.length} אתרים, ${ptoSessions.length} סשני PTO.
המלצה: הזמנות מרוכזות + מרווח ביטחון 15–20 דק׳ להפתעות שטח."`;
  }, [selectedAiAnalysis, customers.length, notes.length, sites.length, ptoSessions.length]);

  const dynamicSlidesPrompt = useMemo(() => {
    const a = selectedAiAnalysis;
    if (a?.cust) {
      const c = a.cust;
      return `צור מצגת NotebookLM בעברית (RTL) על הלקוח ${c.name} (#${c.customerNo}).
שקפים: 1) כותרת תיק 2) KPI תעודות/PTO/דק׳ מנוף 3) חריגות מעל ${PTO_ALERT_MIN} דק׳: ${a.ptoAlertCount} 4) פקדונות 5) המלצת הזמנה מרוכזת 6) היערכות לשטח.
רק מספרים מהנתונים — בלי להמציא.`;
    }
    return `צור מצגת רנטגן תפעולי NotebookLM בעברית: לקוחות ${customers.length}, תעודות ${notes.length}, אתרים ${sites.length}, PTO ${ptoSessions.length}. שקף המלצות: הזמנה מרוכזת + הפתעות מעובדים.`;
  }, [selectedAiAnalysis, customers.length, notes.length, sites.length, ptoSessions.length]);

  const dynamicVideoPrompt = useMemo(() => {
    const a = selectedAiAnalysis;
    if (a?.cust) {
      const c = a.cust;
      return `תסריט וידאו 60 שנ׳ 9:16 — נועה מקריינת על ${c.name}: תעודות, פריקות מנוף, חריגות, המלצת ריכוז הזמנה. עברית פשוטה.`;
    }
    return `תסריט וידאו 60 שנ׳ — רנטגן סבן: מספרים חיים מהמערכת + שתי המלצות תפעול.`;
  }, [selectedAiAnalysis]);

  const audiencePrefix = useMemo(
    () =>
      audienceMode === "customer"
        ? "מצב לקוח: כתבי בשפה שירותית, בלי ז׳רגון פנימי. התמקדי בתיאום אספקה וחוויית לקוח. "
        : "מצב פנימי הנהלה: מותר ז׳רגון תפעולי (PTO, איתוראן, מק\"ט 60002/60060). ",
    [audienceMode],
  );

  const effectiveNoaPrompt = useMemo(
    () => audiencePrefix + "\n" + dynamicNoaVoicePrompt,
    [audiencePrefix, dynamicNoaVoicePrompt],
  );
  const effectiveSlidesPrompt = useMemo(
    () => audiencePrefix + "\n" + dynamicSlidesPrompt,
    [audiencePrefix, dynamicSlidesPrompt],
  );
  const effectiveVideoPrompt = useMemo(
    () => audiencePrefix + "\n" + dynamicVideoPrompt,
    [audiencePrefix, dynamicVideoPrompt],
  );

  const buildWhatsappMessage = () => {
    const a = selectedAiAnalysis;
    if (a?.cust) {
      const c = a.cust;
      const alertLine =
        a.ptoAlertCount > 0
          ? `· חריגות מנוף מעל ${PTO_ALERT_MIN} דק׳: ${a.ptoAlertCount} (מקס׳ ${a.maxPtoMin} דק׳)`
          : "· אין חריגות מנוף מעל 20 דק׳ בטווח הנתונים";
      const depLine =
        a.palletDeposits > 0 || a.bagDeposits > 0
          ? `· פקדונות שזוהו בתעודות: ${a.palletDeposits} משטחים · ${a.bagDeposits} בלות`
          : "· לא זוהו פקדונות מפורשים בתעודות שבמסך";
      if (audienceMode === "customer") {
        return `שלום ${c.contactName || c.name || ""}, כאן נועה מח. סבן.\nריכזנו עבורכם סיכום קצר: ${a.notes.length} תעודות · ${a.pto.length} פריקות מנוף מתועדות.\nנשמח לרכז הזמנה אחת מסודרת לתחילת השבוע.`;
      }
      return `*נועה · סיכום תיק ${c.name} (#${c.customerNo})*\n· תעודות: ${a.notes.length}\n· פריקות PTO: ${a.pto.length} · סה״כ ${a.totalPtoMin} דק׳\n${alertLine}\n${depLine}`;
    }
    return `*נועה · רנטגן תפעולי*\nלקוחות: ${customers.length} · תעודות: ${notes.length} · אתרים: ${sites.length} · PTO: ${ptoSessions.length}`;
  };

  const copyPrompt = async (kind: "slides" | "video" | "noa" | "whatsapp" | "pack") => {
    const whatsappText = buildWhatsappMessage();
    const text =
      kind === "slides"
        ? effectiveSlidesPrompt
        : kind === "video"
        ? effectiveVideoPrompt
        : kind === "whatsapp"
        ? whatsappText
        : kind === "pack"
        ? ["=== מצגת ===", effectiveSlidesPrompt, "", "=== וידאו ===", effectiveVideoPrompt, "", "=== וואטסאפ ===", whatsappText, "", "=== קריינות ===", effectiveNoaPrompt].join("\n")
        : effectiveNoaPrompt;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2200);
    } catch {
      setCopied(null);
    }
  };

  const toggleNoaNarration = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const cleanSpeechText = polishForTts(effectiveNoaPrompt);
    const utterance = new SpeechSynthesisUtterance(cleanSpeechText);
    utterance.lang = "he-IL";
    utterance.rate = 1.02;
    utterance.pitch = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const he = voices.find((v) => v.lang?.startsWith("he")) || voices.find((v) => /Hebrew|עברית/i.test(v.name));
    if (he) utterance.voice = he;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const vm = {
    tab, setTab, statusFilter, setStatusFilter, searchQuery, setSearchQuery,
    selectedEntity, setSelectedEntity, copied, isSpeaking, audienceMode, setAudienceMode,
    loading, refetchAll, notes, customers, sites, ptoSessions,
    kpis, statusOptions, activeItems, chartData, selectedAiAnalysis,
    effectiveNoaPrompt, effectiveSlidesPrompt, effectiveVideoPrompt,
    toggleNoaNarration, copyPrompt,
  };

  return <NotebookXrayView vm={vm} />;
}
