/**
 * /logistics-dict — קטלוג מילון לוגיסטי מלא + העשרת ידע טכני
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ImageOff,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Truck,
  Warehouse,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import {
  getLogisticsDictFn,
  refreshLogisticsDictFn,
  enrichProductKnowledgeFn,
  type LogisticsDictItem,
  type ProductKnowledge,
} from "@/lib/logistics-dict.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/logistics-dict")({
  head: () => ({
    meta: [
      { title: "מילון לוגיסטי — ח. סבן" },
      { name: "description", content: "קטלוג מלא מטאב מילון_לוגיסט · מק״ט, מחיר, מחסן, ידע טכני" },
    ],
  }),
  component: LogisticsDictPage,
});

const PAGE_SIZE = 100;
type PriceFilter = "all" | "with_price" | "no_price" | "no_image";

function useDebounced(value: string, ms: number): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function formatPrice(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(n);
}

function LogisticsDictPage() {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 180);
  const [category, setCategory] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [driver, setDriver] = useState("");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<LogisticsDictItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const q = useQuery({
    queryKey: ["logistics-dict-full"],
    queryFn: () => getLogisticsDictFn(),
    staleTime: 10 * 60_000,
  });

  const items = q.data?.items ?? [];

  const filtered = useMemo(() => {
    const term = debounced.trim().toLowerCase();
    return items.filter((it) => {
      if (category && it.category !== category) return false;
      if (warehouse && it.warehouse !== warehouse) return false;
      if (driver && it.driverTruck !== driver) return false;
      if (priceFilter === "with_price" && it.listPrice == null && it.netPrice == null) return false;
      if (priceFilter === "no_price" && (it.listPrice != null || it.netPrice != null)) return false;
      if (priceFilter === "no_image" && it.imageUrl) return false;
      if (!term) return true;
      return (
        it.sku.toLowerCase().includes(term) ||
        it.name.toLowerCase().includes(term) ||
        it.keywords.toLowerCase().includes(term) ||
        it.category.toLowerCase().includes(term)
      );
    });
  }, [items, debounced, category, warehouse, driver, priceFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [debounced, category, warehouse, driver, priceFilter]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refreshLogisticsDictFn();
      await q.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <PageHeader
        title="מילון לוגיסטי"
        subtitle={
          q.isLoading
            ? "טוען מילון_לוגיסט…"
            : q.isError
              ? "שגיאה בטעינה"
              : `${q.data?.source ?? "מילון_לוגיסט"} · ${q.data?.total ?? 0} מוצרים · ${q.data?.readVia ?? ""}`
        }
        action={
          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={q.isFetching || refreshing}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition hover:bg-muted"
          >
            <RefreshCw className={cn("h-4 w-4", (q.isFetching || refreshing) && "animate-spin")} />
            רענון
          </button>
        }
      />

      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 md:px-8" dir="rtl">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="סה״כ מוצרים" value={q.isLoading ? "…" : String(q.data?.total ?? 0)} />
          <Kpi label="תוצאות מסוננות" value={q.isLoading ? "…" : String(filtered.length)} />
          <Kpi label="עם מחיר" value={q.isLoading ? "…" : String(q.data?.withPrice ?? 0)} />
          <Kpi label="עם תמונה" value={q.isLoading ? "…" : String(q.data?.withImage ?? 0)} />
        </section>

        <section className="space-y-3 rounded-3xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש מק״ט, שם, סלנג (בלות, שק מלט, מקדח…)"
              className="w-full rounded-2xl border border-border/70 bg-background py-2.5 pr-10 pl-4 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="min-h-10 rounded-xl border bg-background px-3 text-xs font-bold">
              <option value="">כל הקטגוריות</option>
              {(q.data?.categories ?? []).map((c) => (
                <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
              ))}
            </select>
            <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className="min-h-10 rounded-xl border bg-background px-3 text-xs font-bold">
              <option value="">כל המחסנים</option>
              {(q.data?.warehouses ?? []).map((c) => (
                <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
              ))}
            </select>
            <select value={driver} onChange={(e) => setDriver(e.target.value)} className="min-h-10 rounded-xl border bg-background px-3 text-xs font-bold">
              <option value="">כל הנהגים</option>
              {(q.data?.drivers ?? []).map((c) => (
                <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {([["all", "הכל"], ["with_price", "עם מחיר"], ["no_price", "חסר מחיר"], ["no_image", "חסר תמונה"]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setPriceFilter(k)} className={cn("rounded-full border px-3 py-1.5 text-xs font-bold transition", priceFilter === k ? "border-primary bg-primary text-primary-foreground" : "border-border/70 bg-background text-muted-foreground hover:bg-muted")}>
                {label}
              </button>
            ))}
          </div>
        </section>

        {q.isLoading && (
          <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            טוען קטלוג מלא ממילון_לוגיסט…
          </div>
        )}

        {q.isError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <div className="flex items-center gap-2 font-bold"><AlertCircle className="h-4 w-4" />שגיאה בטעינת המילון</div>
            <p className="mt-1">{(q.error as Error).message}</p>
            <button type="button" onClick={() => void q.refetch()} className="mt-3 rounded-xl border px-3 py-1.5 text-xs font-bold">נסה שוב</button>
          </div>
        )}

        {!q.isLoading && !q.isError && filtered.length === 0 && (
          <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">לא נמצאו מוצרים{search ? ` עבור «${search}»` : ""}.</p>
        )}

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pageItems.map((it) => (
            <li key={it.sku}>
              <button type="button" onClick={() => setSelected(it)} className="flex h-full w-full flex-col overflow-hidden rounded-3xl border border-border/70 bg-card text-right shadow-sm transition hover:border-primary/40 hover:shadow-md">
                <div className="relative aspect-[16/10] w-full bg-muted/40">
                  {it.imageUrl ? (
                    <img src={it.imageUrl} alt={it.name} loading="lazy" className="h-full w-full object-contain p-2" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground"><ImageOff className="h-8 w-8 opacity-40" /></div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <div className="font-mono text-[11px] font-bold text-muted-foreground">{it.sku}</div>
                  <h3 className="line-clamp-2 font-display text-sm font-bold leading-snug">{it.name}</h3>
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    {it.category && <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">{it.category}</span>}
                    {it.unit && <span className="rounded-full border px-2 py-0.5">{it.unit}</span>}
                    {it.weightKg != null && <span className="rounded-full border px-2 py-0.5">{it.weightKg} ק״ג</span>}
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-semibold text-primary">ידע טכני</span>
                  </div>
                  {it.deposit && <div className="text-[11px] text-amber-700"><Tag className="ml-1 inline h-3 w-3" />{it.deposit}</div>}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs">
                    <span className="font-bold tabular-nums">{it.netPrice != null || it.listPrice != null ? formatPrice(it.netPrice ?? it.listPrice) : "חסר מחיר"}</span>
                    {it.warehouse && <span className="truncate text-[11px] text-muted-foreground"><Warehouse className="ml-0.5 inline h-3 w-3" />{it.warehouse}</span>}
                  </div>
                  {it.keywords && <p className="line-clamp-1 text-[10px] text-muted-foreground">{it.keywords}</p>}
                </div>
              </button>
            </li>
          ))}
        </ul>

        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-xs">
            <span className="text-muted-foreground">עמוד {safePage + 1} מתוך {pageCount} · מציג {pageItems.length} מתוך {filtered.length}</span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={safePage <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="inline-flex min-h-9 items-center gap-1 rounded-xl border px-3 font-bold disabled:opacity-40"><ChevronRight className="h-4 w-4" />הקודם</button>
              <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} className="inline-flex min-h-9 items-center gap-1 rounded-xl border px-3 font-bold disabled:opacity-40">הבא<ChevronLeft className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>

      {selected && <ProductDrawer item={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function ProductDrawer({ item, onClose }: { item: LogisticsDictItem; onClose: () => void }) {
  const [knowledge, setKnowledge] = useState<ProductKnowledge | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");
    setKnowledge(null);
    void (async () => {
      try {
        const data = await enrichProductKnowledgeFn({
          data: {
            sku: item.sku,
            name: item.name,
            category: item.category,
            unit: item.unit,
            keywords: item.keywords,
            techInfo: item.techInfo,
            techUrl: item.techUrl,
            deposit: item.deposit,
            weightKg: item.weightKg,
            warehouse: item.warehouse,
            listPrice: item.listPrice,
            netPrice: item.netPrice,
          },
        });
        if (!cancelled) setKnowledge(data);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item]);

  return (
    <div className="fixed inset-0 z-50 flex justify-start" dir="rtl">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="סגור" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto border-l bg-card shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card/95 px-4 py-3 backdrop-blur">
          <h2 className="font-display text-base font-bold">פרטי מוצר · ידע טכני</h2>
          <button type="button" onClick={onClose} className="rounded-xl border p-2 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-4">
          <div className="aspect-video overflow-hidden rounded-2xl border bg-muted/30">
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain p-3" />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground"><Package className="h-12 w-12 opacity-30" /></div>
            )}
          </div>
          <div>
            <div className="font-mono text-xs font-bold text-muted-foreground">{item.sku}</div>
            <h3 className="mt-1 font-display text-xl font-extrabold">{item.name}</h3>
            {knowledge?.summary && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{knowledge.summary}</p>}
          </div>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <Field label="קטגוריה" value={item.category || "—"} />
            <Field label="יחידה" value={item.unit || "—"} />
            <Field label="משקל" value={item.weightKg != null ? `${item.weightKg} ק״ג` : "—"} />
            <Field label="פקדון" value={item.deposit || "—"} />
            <Field label="מחירון" value={formatPrice(item.listPrice)} />
            <Field label="הנחה %" value={item.discountPct != null ? String(item.discountPct) : "—"} />
            <Field label="נטו" value={formatPrice(item.netPrice)} />
            <Field label="mediaCode" value={item.mediaCode || "—"} />
          </dl>
          <div className="space-y-2 rounded-2xl border p-3 text-xs">
            <div className="flex items-center gap-2 font-bold"><Warehouse className="h-4 w-4 text-primary" />מחסן: {item.warehouse || "—"}</div>
            <div className="flex items-center gap-2 font-bold"><Truck className="h-4 w-4 text-primary" />נהג/משאית: {item.driverTruck || "—"}</div>
          </div>

          <section className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center gap-2 text-sm font-bold text-primary"><Sparkles className="h-4 w-4" />ידע טכני מועשר</div>
            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                אוסף מידע מהגיליון{item.techUrl ? " ומהרשת" : ""}…
              </div>
            )}
            {err && <p className="text-xs text-destructive">{err}</p>}
            {knowledge && !loading && (
              <div className="space-y-3 text-xs">
                <KnowledgeBlock title="שימושים" icon={<BookOpen className="h-3.5 w-3.5" />} items={knowledge.uses} />
                <KnowledgeBlock title="טיפול ולוגיסטיקה" items={knowledge.handling} />
                <KnowledgeBlock title="טיפים לשטח" items={knowledge.siteTips} />
                <KnowledgeBlock title="בטיחות" items={knowledge.safety} />
                {knowledge.relatedTerms.length > 0 && (
                  <div>
                    <div className="mb-1 font-bold text-muted-foreground">מונחים קשורים</div>
                    <div className="flex flex-wrap gap-1">
                      {knowledge.relatedTerms.map((t) => (
                        <span key={t} className="rounded-full bg-muted px-2 py-0.5 font-semibold">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="border-t pt-2 text-[10px] text-muted-foreground">
                  מקורות: {knowledge.sources.join(" · ")}
                  {knowledge.fromAi ? " · תוכן AI — לא מחליף מפרט יצרן" : ""}
                </div>
              </div>
            )}
          </section>

          {item.keywords && (
            <div>
              <div className="mb-1 text-xs font-bold text-muted-foreground">סלנג / מילות מפתח (גיליון)</div>
              <p className="rounded-xl bg-muted/50 p-3 text-sm">{item.keywords}</p>
            </div>
          )}
          {item.techInfo && (
            <div>
              <div className="mb-1 text-xs font-bold text-muted-foreground">מידע טכני מהגיליון</div>
              <p className="whitespace-pre-wrap rounded-xl border p-3 text-sm leading-relaxed">{item.techInfo}</p>
            </div>
          )}
          {item.techUrl && (
            <a href={item.techUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-primary">
              <ExternalLink className="h-4 w-4" />קישור טכני מקור
            </a>
          )}
        </div>
      </aside>
    </div>
  );
}

function KnowledgeBlock({ title, items, icon }: { title: string; items: string[]; icon?: ReactNode }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 font-bold text-muted-foreground">{icon}{title}</div>
      <ul className="list-inside list-disc space-y-0.5 leading-relaxed">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
