/**
 * NotebookXrayView — UI for /notebook
 */
import { Link } from "@tanstack/react-router";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ChevronRight, RefreshCw, Search,
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { TABS, CHART_COLORS } from "@/lib/notebook-xray";
import { NotebookPromptsPanel } from "@/components/NotebookPromptsPanel";
import { cn } from "@/lib/utils";

export function NotebookXrayView({ vm }: { vm: Record<string, any> }) {
  const {
    tab, setTab, statusFilter, setStatusFilter, searchQuery, setSearchQuery,
    selectedEntity, setSelectedEntity,
    loading, refetchAll, kpis, statusOptions, activeItems, chartData,
  } = vm;

  return (
    <>
      <PageHeader
        title="חדר רנטגן תפעולי · נועה בגובה העיניים"
        subtitle="סריקת KPI · ניתוח AI · קריינות ופקודות NotebookLM"
        action={
          <button type="button" onClick={refetchAll}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold hover:bg-muted">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            רענון
          </button>
        }
      />

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-8" dir="rtl">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {kpis.map((k: any) => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
                <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                  {Icon ? <Icon className={cn("h-3.5 w-3.5", k.color)} /> : null}
                  {k.label}
                </div>
                <div className={cn("mt-0.5 font-display text-xl font-extrabold tabular-nums", k.color)}>
                  {loading && k.value === 0 ? "—" : k.value}
                </div>
                <div className="text-[10px] text-muted-foreground">{k.sub}</div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 border-b border-border pb-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} type="button" onClick={() => { setTab(t.id); setStatusFilter("הכל"); }}
                className={cn("inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition",
                  tab === t.id ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:bg-muted")}>
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש…"
              className="min-h-10 w-full rounded-2xl border bg-background py-2 pe-10 ps-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {statusOptions.map((s: string) => (
              <button key={s} type="button" onClick={() => setStatusFilter(s)}
                className={cn("min-h-8 rounded-full border px-3 text-[11px] font-semibold",
                  statusFilter === s ? "border-cyan-500/50 bg-cyan-500/15 font-bold text-cyan-800 dark:text-cyan-200" : "border-border text-muted-foreground hover:bg-muted")}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          <section className="rounded-3xl border bg-card p-5 shadow-sm lg:col-span-7">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold">תרשים — {TABS.find((t) => t.id === tab)?.label}</h2>
              <span className="rounded-lg border px-2 py-1 text-[11px] font-bold text-muted-foreground">{activeItems.length} רשומות</span>
            </div>
            <div className="mt-5 h-80 w-full">
              {chartData.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-muted-foreground">אין נתונים לסינון הנוכחי</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 12, right: 8, left: -10, bottom: 50 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Bar dataKey={tab === "pto" ? "פריקות" : tab === "sites" ? "ביקורים" : "תעודות"} radius={[6, 6, 0, 0]}
                      onClick={(entry: any) => {
                        if (entry?.raw) {
                          setSelectedEntity({
                            type: tab === "customers" ? "customer" : tab === "sites" ? "site" : tab === "pto" ? "pto" : "note",
                            id: entry.key,
                            title: entry.raw.name || entry.raw.address || entry.key,
                            data: entry.raw,
                          });
                        }
                      }}>
                      {chartData.map((_: any, i: number) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} className="cursor-pointer" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <aside className="flex flex-col rounded-3xl border bg-card p-5 shadow-sm lg:col-span-5">
            <h2 className="font-display text-sm font-bold">רשימת {TABS.find((t) => t.id === tab)?.label}</h2>
            <div className="mt-3 max-h-[380px] flex-1 space-y-2 overflow-y-auto">
              {activeItems.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">לא נמצאו רשומות</div>
              ) : (
                activeItems.slice(0, 40).map((item: any, idx: number) => {
                  let key = "";
                  let title = "";
                  let subtitle = "";
                  let metric = "";
                  let entityType: "customer" | "note" | "site" | "pto" = "customer";
                  if (tab === "customers") {
                    entityType = "customer"; key = item.customerNo; title = item.name || item.customerNo;
                    subtitle = item.address || "ללא כתובת"; metric = `${item.notesCount || 0} תעודות`;
                  } else if (tab === "notes") {
                    entityType = "note"; key = String(item.noteId || item["מס' תעודת משלוח"] || idx);
                    title = `תעודה #${key}`; subtitle = item.address || item["כתובת אספקה"] || "";
                    metric = String(item.approval || item.status || "—");
                  } else if (tab === "sites") {
                    entityType = "site"; key = item.siteKey || item.address || String(idx);
                    title = item.address || "אתר"; subtitle = item.customerName || "";
                    metric = `${item.ptoOpens || 0} מנוף`;
                  } else {
                    entityType = "pto"; key = item.id || `${item.date}_${idx}`;
                    title = item.address || "פריקה"; subtitle = `${item.date || ""} (${item.openTime || ""}–${item.closeTime || ""})`;
                    metric = `${item.durationMin || 0} דק׳`;
                  }
                  const isSelected = selectedEntity?.id === key;
                  return (
                    <button key={key} type="button"
                      onClick={() => setSelectedEntity({ type: entityType, id: key, title, data: item })}
                      className={cn("group flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-start transition",
                        isSelected ? "border-cyan-500 bg-cyan-500/15 ring-1 ring-cyan-500/50" : "border-border/60 hover:bg-muted/40")}>
                      <div className="min-w-0 flex-1">
                        <div className={cn("truncate text-xs font-bold", isSelected && "text-cyan-700 dark:text-cyan-300")}>{title}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] font-bold">{metric}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        </div>

        <NotebookPromptsPanel vm={vm} />

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>מערכת נועה AI · ח. סבן חומרי בניין</span>
          <div className="flex items-center gap-3">
            <Link to="/chat" className="font-bold text-cyan-600 hover:underline dark:text-cyan-400">צ׳אט נועה</Link>
            <Link to="/ituran" className="font-bold text-cyan-600 hover:underline dark:text-cyan-400">איתוראן</Link>
          </div>
        </div>
      </main>
    </>
  );
}
