import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { getSiteAtlasFn, type AtlasSite } from "@/lib/customer-history.functions";
import { fmtShort } from "@/lib/he-date";
import { cn } from "@/lib/utils";
import { Building2, CalendarDays, ExternalLink, FileText, MapPin, Package, Search, Timer, Truck, Users, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/sites")({
  head: () => ({ meta: [{ title: "אתרי אספקה והיסטוריית ביקורים — ח. סבן" }] }),
  component: SitesPage,
});

function mapUrl(site: AtlasSite) {
  if (site.latitude == null || site.longitude == null) return "";
  const { latitude: lat, longitude: lon } = site;
  const delta = 0.025;
  const bbox = [lon - delta, lat - delta, lon + delta, lat + delta].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
}

function SitesPage() {
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [expandedKey, setExpandedKey] = useState("");
  const q = useQuery({ queryKey: ["site-atlas"], queryFn: () => getSiteAtlasFn(), staleTime: 60_000 });
  const data = q.data;
  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.sites || []).filter((site) => !term || [site.address, site.city, site.customerName, site.customerNo].some((v) => v.toLowerCase().includes(term)));
  }, [data, search]);
  const selected = list.find((s) => (s.siteKey || `${s.city}|${s.address}`) === selectedKey) || list[0];
  const mappedCount = (data?.sites || []).filter((s) => s.latitude != null && s.longitude != null).length;

  return <>
    <PageHeader title="אתרי אספקה" subtitle={data ? `${data.sites.length} כתובות · ${mappedCount} עם קואורדינטות גיליון` : "היסטוריית ביקורים מהגיליון"} action={<button type="button" onClick={() => void q.refetch()} disabled={q.isFetching} aria-label="רענון נתונים" className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"><RefreshCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} />רענון</button>} />
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8" dir="rtl">
      <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-primary/15 via-card to-emerald-500/10 p-5 shadow-card md:p-6">
        <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-bold text-primary">תמונת מצב היסטורית</p><h1 className="mt-1 font-display text-2xl font-extrabold md:text-3xl">כתובות, לקוחות וביקורים</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">נתונים מצטברים מטאבי אתרי הלקוחות והיסטוריית הביקורים. כולל ספירת פתיחות מנוף (PTO) לפי כתובת כשקיים בגיליון.</p></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric icon={MapPin} label="אתרים" value={data?.sites.length ?? "—"} />
            <Metric icon={Truck} label="ביקורים" value={data?.sites.reduce((n, s) => n + s.visits, 0) ?? "—"} />
            <Metric icon={Timer} label="פתיחות מנוף" value={data?.sites.reduce((n, s) => n + (s.ptoOpens || 0), 0) ?? "—"} />
            <Metric icon={MapPin} label="נקודות מפה" value={mappedCount} />
          </div>
        </div>
      </section>

      {q.isError && <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">לא ניתן לקרוא את נתוני האתרים: {(q.error as Error).message}</div>}
      {q.isLoading && <div role="status" className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">טוען כתובות והיסטוריית ביקורים…</div>}

      {data && <>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.8fr)]">
          <section className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-card" aria-label="מפת אתרי אספקה">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3"><div><h2 className="font-display font-bold">מפת כתובות</h2><p className="text-xs text-muted-foreground">OpenStreetMap · מפה חינמית</p></div>{selected?.latitude != null && <a className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" href={mapUrl(selected)} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />פתיחה במפה</a>}</div>
            {selected && selected.latitude != null && selected.longitude != null ? <iframe key={selected.siteKey} title={`מפת אתר ${selected.address}`} src={mapUrl(selected)} className="h-72 w-full border-0 md:h-[360px]" loading="lazy" referrerPolicy="no-referrer" /> : <div className="grid min-h-72 place-items-center bg-muted/30 px-6 py-12 text-center md:min-h-[360px]"><div className="max-w-md"><MapPin className="mx-auto h-9 w-9 text-muted-foreground/60"/><h3 className="mt-3 font-display font-bold">אין קואורדינטות להצגת סיכות</h3><p className="mt-1 text-sm text-muted-foreground">הטאב ״אתרי_לקוחות״ במקור מכיל עיר וכתובת, אך אין בו קווי רוחב ואורך. הכתובות אינן נשלחות לשירות מיפוי חיצוני, לכן לא נציג מיקום משוער.</p></div></div>}
            {selected && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 px-4 py-3 text-sm"><MapPin className="h-4 w-4 text-primary"/><strong>{selected.address}</strong>{selected.city && <span className="text-muted-foreground">{selected.city}</span>}<span className="text-muted-foreground">{selected.visits} ביקורים</span>{(selected.ptoOpens || 0) > 0 && <span className="text-muted-foreground">{selected.ptoOpens} פתיחות מנוף</span>}</div>}
          </section>
          <aside className="space-y-4">
            <RankPanel title="ערים מובילות לפי ביקורים" icon={MapPin} rows={data.cities.map((x) => ({ label: x.name, count: x.count }))} />
            <RankPanel title="לקוחות מובילים לפי ביקורים" icon={Users} rows={data.customers.map((x) => ({ label: x.name, count: x.count, customerNo: x.customerNo }))} />
          </aside>
        </div>

        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-display text-xl font-extrabold">ספר כתובות והיסטוריה</h2><p className="text-sm text-muted-foreground">בחירת אתר ממקדת את המפה; פתיחת שורה מציגה ביקורים, תעודות, ופתיחות מנוף.</p></div><label className="relative block w-full sm:max-w-sm"><span className="sr-only">חיפוש כתובת או לקוח</span><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש כתובת, עיר או לקוח…" className="min-h-11 w-full rounded-xl border bg-card py-2 pe-10 ps-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label></div>
          <div className="space-y-3">
            {list.map((site, i) => {
              const key = site.siteKey || `${site.city}|${site.address}`;
              const expanded = expandedKey === key;
              const isSelected = (selected?.siteKey || `${selected?.city}|${selected?.address}`) === key;
              return <article key={`${key}-${i}`} className={cn("overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md", isSelected && "border-primary/40")}>
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <button type="button" onClick={() => setSelectedKey(key)} aria-pressed={isSelected} className="flex min-h-12 min-w-0 flex-1 items-start gap-3 rounded-xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><MapPin className="h-5 w-5"/></span><span className="min-w-0"><span className="block truncate font-bold">{site.address}</span><span className="mt-0.5 block text-xs text-muted-foreground">{[site.city, site.customerName, site.customerNo && `#${site.customerNo}`].filter(Boolean).join(" · ") || "לקוח לא מקושר"}</span></span>
                  </button>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><SmallStat icon={Truck} label="ביקורים" value={site.visits}/><SmallStat icon={Timer} label="מנוף" value={(site.ptoOpens || 0) > 0 ? `${site.ptoOpens} · ${site.ptoTotalMin || 0} דק׳` : (site.medianMin != null ? `${site.medianMin} דק׳` : "—")}/><SmallStat icon={CalendarDays} label="ביקור אחרון" value={site.lastIso ? fmtShort(site.lastIso) : "—"}/><SmallStat icon={Users} label="ביטחון" value={site.confidence || "—"}/></div>
                  <button type="button" onClick={() => setExpandedKey(expanded ? "" : key)} aria-expanded={expanded} className="min-h-11 shrink-0 rounded-xl border px-4 text-xs font-bold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{expanded ? "סגירה" : "היסטוריה"}</button>
                </div>
                {expanded && <div className="border-t border-border/60 bg-muted/20 p-4">
                  {site.customerNo && <Link to="/customers/$id" params={{ id: site.customerNo }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border bg-card px-3 text-xs font-bold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Users className="h-4 w-4"/>פתיחת תיק הלקוח</Link>}
                  {(site.ptoOpens > 0 || site.ptoTotalMin > 0) && (
                    <p className="mb-3 mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                      מנוף בכתובת: {site.ptoOpens} פתיחות · סה״כ {site.ptoTotalMin} דק׳ PTO
                      {site.customerNo ? ` · לקוח ${site.customerNo}${site.customerName ? ` (${site.customerName})` : ""}` : ""}
                    </p>
                  )}
                  <h3 className="mb-2 mt-4 text-sm font-bold">ביקורים ומשלוחים</h3>
                  {site.visitHistory.length ? <ol className="space-y-2">{site.visitHistory.map((visit, index) => <li key={`${visit.dateIso}-${index}`} className="rounded-xl border bg-card p-3"><div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-bold">{visit.dateIso ? fmtShort(visit.dateIso) : "תאריך לא זמין"}</span><span className="text-muted-foreground">{visit.driver}{visit.truck ? ` · ${visit.truck}` : ""}{visit.durationMin != null ? ` · ${visit.durationMin} דק׳` : ""}{visit.ptoMin != null ? ` · PTO ${visit.ptoMin} דק׳` : ""}</span></div><div className="mt-2 flex flex-wrap gap-2">{visit.notes.map((id) => <a key={`n-${id}`} href={`/notes/${encodeURIComponent(id)}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><FileText className="h-3.5 w-3.5"/>תעודה {id}</a>)}{visit.orders.map((id) => <Link key={`o-${id}`} to="/orders" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Package className="h-3.5 w-3.5"/>הזמנה {id}</Link>)}{!visit.notes.length && !visit.orders.length && <span className="text-xs text-muted-foreground">לא קושרו תעודות או הזמנות לרשומת הביקור</span>}</div></li>)}</ol> : <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">לא נמצאו רשומות ביקור המשויכות למפתח האתר הזה.</p>}
                </div>}
              </article>;
            })}
            {!list.length && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">אין כתובות תואמות לחיפוש.</p>}
          </div>
        </section>
      </>}
    </main>
  </>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string | number }) {
  return <div className="min-w-[5.5rem] rounded-2xl border border-border/50 bg-card/70 px-3 py-2.5"><div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"><Icon className="h-3.5 w-3.5"/>{label}</div><div className="mt-1 text-xl font-extrabold tabular-nums">{value}</div></div>;
}

function SmallStat({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string | number }) {
  return <span className="flex items-center gap-1.5 rounded-lg bg-muted/70 px-2 py-2"><Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground"/><span className="text-muted-foreground">{label}:</span><strong className="truncate">{value}</strong></span>;
}

function RankPanel({ title, icon: Icon, rows }: { title: string; icon: typeof MapPin; rows: Array<{ label: string; count: number; customerNo?: string }> }) {
  return <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-card"><h2 className="flex items-center gap-2 font-display text-sm font-bold"><Icon className="h-4 w-4 text-primary"/>{title}</h2>{rows.length ? <ol className="mt-3 space-y-2">{rows.slice(0, 5).map((row, i) => <li key={`${row.label}-${i}`} className="flex items-center gap-2 text-sm"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{i + 1}</span>{row.customerNo ? <Link to="/customers/$id" params={{ id: row.customerNo }} className="min-w-0 flex-1 truncate font-semibold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{row.label}</Link> : <span className="min-w-0 flex-1 truncate font-semibold">{row.label}</span>}<span className="shrink-0 text-xs tabular-nums text-muted-foreground">{row.count} ביק׳</span></li>)}</ol> : <p className="mt-3 text-xs text-muted-foreground">אין נתונים מסוכמים עדיין.</p>}</section>;
}
