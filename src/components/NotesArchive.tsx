import { Link } from "@tanstack/react-router";
import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { auditNote, fmtDate, noteItemsCount, noteWeightTons, type DeliveryNote } from "@/lib/data";
import { fetchLiveNotes, approveStrict } from "@/lib/api";
import { getScanFn } from "@/lib/notes-api.functions";
import { scanToDataUrl } from "@/lib/scan-render";
import { approvals, useApprovals } from "@/lib/store";
import { playDispatchChime, playUrgentSignatureAlarm } from "@/lib/audio-alerts";
import { PageHeader, StatusPill } from "@/components/AppShell";
import {
  Search, RefreshCw, Package, CheckCircle2, Crown, PenTool,
  AlertTriangle, Loader2, FileText, Filter, X,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function parseNoteDate(d: string): number {
  const s = String(d || "").trim();
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) return iso;
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(y, Number(m[2]) - 1, Number(m[1])).getTime();
  }
  return 0;
}

function NoteThumbnail({ fileId, fallbackSrc, title }: { fileId?: string; fallbackSrc?: string; title: string }) {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!fileId && !fallbackSrc) return;
    const el = containerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setIsVisible(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) { setIsVisible(true); observer.disconnect(); }
    }, { rootMargin: "150px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fileId, fallbackSrc]);
  const { data: scanSrc, isLoading } = useQuery({
    queryKey: ["archive-thumb", fileId],
    enabled: isVisible && !!fileId,
    staleTime: Infinity,
    queryFn: async () => {
      const f = await getScanFn({ data: { fileId: fileId! } });
      return scanToDataUrl(f.mimeType, f.base64);
    },
  });
  const displaySrc = scanSrc || fallbackSrc;
  return (
    <div ref={containerRef} className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/40 bg-muted/60 shadow-2xs transition group-hover:scale-102">
      {displaySrc ? <img src={displaySrc} alt={title} className="h-full w-full object-cover" />
        : isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        : <div className="flex flex-col items-center gap-1 text-[10px] text-muted-foreground"><FileText className="h-6 w-6 opacity-40" /><span>{fileId ? "בטעינה" : "אין סריקה"}</span></div>}
    </div>
  );
}

export function NotesArchive() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ok" | "warn" | "fail" | "pending">("all");
  const [yardFilter, setYardFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const apState = useApprovals();

  const { data: notes, isLoading, isFetching, error, refetch } = useQuery<DeliveryNote[]>({
    queryKey: ["live-notes-archive"],
    queryFn: fetchLiveNotes,
    staleTime: 30000,
    retry: 1,
  });

  const handleRefresh = async () => {
    const res = await refetch();
    if (res.isSuccess) toast.success("תעודות המשלוח סונכרנו בהצלחה מ-Google Apps Script 🟢");
  };

  const handleRamiSign = async (e: React.MouseEvent, noteId: string) => {
    e.preventDefault(); e.stopPropagation();
    try {
      await approveStrict(noteId, "rami");
      approvals.rami(noteId);
      void playDispatchChime(0.85);
      toast.success(`ת.מ. ${noteId} נבדקה ואושרה אישית ע\"י ראמי מסארווה ✍️`);
    } catch (err) {
      toast.error("אישור ראמי נדחה ע\"י השרת", { description: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleHarelSign = async (e: React.MouseEvent, noteId: string) => {
    e.preventDefault(); e.stopPropagation();
    try {
      await approveStrict(noteId, "harel");
      approvals.harel(noteId);
      playUrgentSignatureAlarm();
      toast.success(`ת.מ. ${noteId} אושרה סופית לחיוב ע\"י הראל אידלסון 👑`);
    } catch (err) {
      toast.error("אישור מנכ\"ל נדחה ע\"י השרת", { description: err instanceof Error ? err.message : String(err) });
    }
  };

  const yards = useMemo(() => Array.from(new Set((notes || []).map((n) => n.yard).filter(Boolean) as string[])).sort(), [notes]);

  const list = useMemo(() => {
    if (!notes) return [];
    return notes
      .filter((n) => {
        const term = q.trim().toLowerCase();
        if (term) {
          const hay = [n.customer, n.id, n.comaxOrder, n.yard, n.date, n.customerNo, n.siteAddress, n.driver].join(" ").toLowerCase();
          if (!hay.includes(term)) return false;
        }
        if (yardFilter !== "all" && n.yard !== yardFilter) return false;
        const audit = auditNote(n);
        if (statusFilter === "ok" && audit.status !== "ok") return false;
        if (statusFilter === "warn" && audit.status !== "warn") return false;
        if (statusFilter === "fail" && audit.status !== "fail") return false;
        if (statusFilter === "pending") {
          const stage = n.noteStage || "";
          if (!stage.includes("pending") && stage !== "returned_to_rami") return false;
        }
        const ts = parseNoteDate(n.date);
        if (dateFrom) {
          const parts = dateFrom.split("-");
          if (parts.length === 3) {
            const from = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime();
            if (ts && ts < from) return false;
          }
        }
        if (dateTo) {
          const parts = dateTo.split("-");
          if (parts.length === 3) {
            const to = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 23, 59, 59).getTime();
            if (ts && ts > to) return false;
          }
        }
        return true;
      })
      .sort((a, b) => parseNoteDate(b.date) - parseNoteDate(a.date) || String(b.id).localeCompare(String(a.id)));
  }, [notes, q, statusFilter, yardFilter, dateFrom, dateTo]);

  if (isLoading) {
    return (
      <>
        <PageHeader title="ארכיון תעודות משלוח" subtitle="סנכרון חי מול גיליון ארכיון תעודות" />
        <div className="mx-auto max-w-4xl p-12 text-center text-sm text-muted-foreground" dir="rtl">טוען תעודות משלוח מהגיליון...</div>
      </>
    );
  }

  if (error || !notes) {
    return (
      <>
        <PageHeader title="ארכיון תעודות משלוח" subtitle="סנכרון חי מול גיליון ארכיון תעודות" />
        <div className="mx-auto max-w-xl p-6" dir="rtl">
          <Card className="space-y-3 border-red-500/40 bg-red-500/5 p-6 text-center">
            <div className="flex items-center justify-center gap-2 font-bold text-red-700"><AlertTriangle className="h-5 w-5" /> כשל בטעינת תעודות</div>
            <p className="text-xs text-muted-foreground">{error instanceof Error ? error.message : "שגיאת שרת"}</p>
            <Button size="sm" onClick={() => refetch()} disabled={isFetching} className="mt-2">
              <RefreshCw className={`ml-1 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> נסה שוב
            </Button>
          </Card>
        </div>
      </>
    );
  }

  const clearFilters = () => { setQ(""); setStatusFilter("all"); setYardFilter("all"); setDateFrom(""); setDateTo(""); };

  return (
    <>
      <PageHeader
        title="ארכיון תעודות משלוח"
        subtitle="פילטר בראש · תעודות חדשות ראשונות · סנכרון חי"
        action={
          <button onClick={handleRefresh} disabled={isFetching} className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50" title="סנכרן">
            <RefreshCw className={`h-3.5 w-3.5 text-primary ${isFetching ? "animate-spin" : ""}`} />
            <span>{isFetching ? "מסנכרן..." : "סנכרון ענן"}</span>
          </button>
        }
      />
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 md:px-8" dir="rtl">
        <div className="space-y-3 rounded-3xl border border-border/80 bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold">
              <Filter className="h-4 w-4 text-primary" />
              סינון תעודות
              <span className="font-normal text-muted-foreground">· חדשות בראש · {list.length}/{notes.length}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> סנכרון חי
            </div>
          </div>
          <div className="relative">
            <Search className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש: לקוח, ת.מ., קומקס, מחסן, כתובת, נהג..." className="w-full rounded-2xl border bg-background py-3 pr-11 pl-4 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <label className="block space-y-1">
              <span className="text-[10px] font-bold text-muted-foreground">סטטוס בקרה</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="min-h-10 w-full rounded-xl border bg-background px-2 text-xs">
                <option value="all">הכל</option>
                <option value="ok">תקין</option>
                <option value="warn">אזהרה</option>
                <option value="fail">חריג</option>
                <option value="pending">ממתין לחתימה</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold text-muted-foreground">מחסן</span>
              <select value={yardFilter} onChange={(e) => setYardFilter(e.target.value)} className="min-h-10 w-full rounded-xl border bg-background px-2 text-xs">
                <option value="all">כל המחסנים</option>
                {yards.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold text-muted-foreground">מתאריך</span>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="min-h-10 w-full rounded-xl border bg-background px-2 text-xs" />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold text-muted-foreground">עד תאריך</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="min-h-10 w-full rounded-xl border bg-background px-2 text-xs" />
            </label>
          </div>
          {(q || statusFilter !== "all" || yardFilter !== "all" || dateFrom || dateTo) && (
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold hover:bg-muted">
              <X className="h-3 w-3" /> נקה פילטרים
            </button>
          )}
        </div>

        <div className="space-y-3">
          {list.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">אין תעודות תואמות לפילטר</Card>
          )}
          {list.map((n) => {
            const audit = auditNote(n);
            const b = n.deposits?.bales60002 || { delivered: 0, billed: 0 };
            const p = n.deposits?.pallets60060 || { delivered: 0, billed: 0 };
            const ap = apState[n.id];
            return (
              <div key={n.id} className="group flex flex-col justify-between rounded-3xl border border-border/70 bg-card p-4.5 shadow-card transition hover:border-primary/40">
                <Link to="/notes/$id" params={{ id: n.id }} className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <NoteThumbnail fileId={n.fileId} fallbackSrc={n.scans?.[0]} title={`ת.מ. ${n.id}`} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono font-bold text-foreground">ת.מ. #{n.id}</span>
                      <span>·</span>
                      <span className="font-mono font-semibold text-primary">קומקס #{n.comaxOrder}</span>
                      <span>·</span>
                      <span>{fmtDate(n.date)}</span>
                      {n.yard && <><span>·</span><span>{n.yard}</span></>}
                    </div>
                    <div className="text-sm font-bold text-foreground">{n.customer}{n.customerNo ? ` · #${n.customerNo}` : ""}</div>
                    {n.siteAddress && <div className="text-xs text-muted-foreground">{n.siteAddress}</div>}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <Package className="h-3.5 w-3.5" />
                      <span>{noteItemsCount(n)} פריטים</span>
                      <span>·</span>
                      <span>{noteWeightTons(n).toFixed(1)} טון</span>
                      {(b.delivered > 0 || p.delivered > 0) && (
                        <span>· בלות {b.delivered}/{b.billed} · משטחים {p.delivered}/{p.billed}</span>
                      )}
                    </div>
                    <div className="pt-1"><StatusPill s={audit.status} /></div>
                  </div>
                </Link>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-3">
                  <button type="button" onClick={(e) => void handleRamiSign(e, n.id)} className="inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold hover:bg-muted">
                    <PenTool className="h-3.5 w-3.5" /> ראמי {ap?.rami ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : null}
                  </button>
                  <button type="button" onClick={(e) => void handleHarelSign(e, n.id)} className="inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold hover:bg-muted">
                    <Crown className="h-3.5 w-3.5" /> הראל {ap?.harel ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : null}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
