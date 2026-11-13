/**
 * /stock — מלאי תפעולי בזמן אמת
 * ביקוש פתוח מהזמנות + כמויות שסופקו מתעודות + מילון לוגיסטי
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  Clock,
  Package,
  RefreshCw,
  Search,
  Truck,
  Warehouse,
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { listOrdersFn } from "@/lib/orders.functions";
import { getPurchaseMatrixFn } from "@/lib/customer-history.functions";
import { buildStockSnapshot, type StockSkuRow } from "@/lib/stock-live";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/stock")({
  head: () => ({ meta: [{ title: "מלאי תפעולי חי · ח. סבן" }] }),
  component: StockPage,
});

type KindFilter = "הכל" | "product" | "deposit" | "delivery";

function StockPage() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<KindFilter>("הכל");
  const [onlyOpen, setOnlyOpen] = useState(false);

  const ordersQ = useQuery({
    queryKey: ["stock-orders"],
    queryFn: () => listOrdersFn(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const matrixQ = useQuery({
    queryKey: ["stock-purchase-matrix"],
    queryFn: () => getPurchaseMatrixFn(),
    staleTime: 60_000,
    refetchInterval: 90_000,
  });

  const loading = ordersQ.isLoading || matrixQ.isLoading;
  const refetchAll = () => {
    void ordersQ.refetch();
    void matrixQ.refetch();
  };

  const orders = useMemo(() => {
    const raw = ordersQ.data as { orders?: unknown[] } | unknown[] | undefined;
    if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
    if (raw && typeof raw === "object" && Array.isArray((raw as { orders?: unknown[] }).orders)) {
      return (raw as { orders: Array<Record<string, unknown>> }).orders;
    }
    return [] as Array<Record<string, unknown>>;
  }, [ordersQ.data]);

  const snapshot = useMemo(() => {
    const matrix = matrixQ.data;
    return buildStockSnapshot({
      orders: orders as any,
      purchaseLines: (matrix?.lines || []) as any,
      dictItems: (matrix?.dictItems || []) as any,
    });
  }, [orders, matrixQ.data]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return snapshot.skus.filter((r) => {
      if (kind !== "הכל" && r.kind !== kind) return false;
      if (onlyOpen && r.openDemandQty <= 0) return false;
      if (!qq) return true;
      return (
        r.sku.toLowerCase().includes(qq) ||
        r.name.toLowerCase().includes(qq) ||
        r.category.toLowerCase().includes(qq)
      );
    });
  }, [snapshot.skus, q, kind, onlyOpen]);

  const kpis = [
    {
      label: "הזמנות פתוחות",
      value: snapshot.openOrders,
      sub: `${snapshot.openOrderLines} שורות מק״ט`,
      icon: Package,
      color: "text-cyan-400",
    },
    {
      label: "מק״טים עם ביקוש",
      value: snapshot.skus.filter((s) => s.openDemandQty > 0).length,
      sub: "ממתינים לסידור/אספקה",
      icon: Boxes,
      color: "text-amber-400",
    },
    {
      label: "שורות אספקה בארכיון",
      value: snapshot.shippedLines,
      sub: matrixQ.data?.sourceTab || "ארכיון_תעודות_גליה",
      icon: Truck,
      color: "text-emerald-400",
    },
    {
      label: "פקדון בביקוש",
      value: `${snapshot.deposits.balesOpen + snapshot.deposits.palletsOpen}`,
      sub: `בלות ${snapshot.deposits.balesOpen} · משטחים ${snapshot.deposits.palletsOpen}`,
      icon: Warehouse,
      color: "text-purple-400",
    },
  ];

  return (
    <>
      <PageHeader
        title="מלאי תפעולי · זמן אמת"
        subtitle="ביקוש מהזמנות פתוחות + תזרים אספקה מהארכיון · בלי יתרת מדף מומצאת"
        actions={
          <button
            type="button"
            onClick={refetchAll}
            className="inline-flex min-h-10 items-center gap-2 rounded-2xl border bg-card px-3 text-xs font-bold hover:bg-muted"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            רענון
          </button>
        }
      />

      <main className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 md:px-6">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-900 dark:text-amber-100">
          <div className="flex items-start gap-2 font-bold">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            חשוב לדעת
          </div>
          <p className="mt-1 opacity-90">{snapshot.sourceNote}</p>
          <p className="mt-1 text-[11px] opacity-80">
            לעדכון יתרת מדף אמיתית נדרש טאב <span className="font-mono">מלאי_יתרות</span> או API קומקס
            יתרות. עד אז — המסך מציג לחץ תפעולי חי בלבד.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-muted-foreground">{k.label}</span>
                <k.icon className={cn("h-4 w-4", k.color)} />
              </div>
              <div className="mt-2 font-display text-2xl font-black tabular-nums">{k.value}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{k.sub}</div>
            </div>
          ))}
        </div>

        {snapshot.yards.length > 0 && (
          <section className="rounded-2xl border bg-card p-4">
            <h2 className="text-sm font-bold">לחץ לפי מחסן (הזמנות פתוחות)</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {snapshot.yards.map((y) => (
                <div
                  key={y.yard}
                  className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs"
                >
                  <div className="font-bold">{y.yard}</div>
                  <div className="tabular-nums text-muted-foreground">
                    {y.openQty} יח׳ · {y.openLines} שורות
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-2xl border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="חיפוש מק״ט / שם / קטגוריה"
                className="h-10 w-full rounded-xl border bg-background pr-9 pl-3 text-sm"
              />
            </div>
            <div className="inline-flex rounded-xl border bg-muted/40 p-1 text-[11px] font-bold">
              {(["הכל", "product", "deposit", "delivery"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 transition-colors",
                    kind === k ? "bg-cyan-600 text-white" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {k === "הכל" ? "הכל" : k === "product" ? "מוצרים" : k === "deposit" ? "פקדונות" : "הובלות"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setOnlyOpen((v) => !v)}
              className={cn(
                "rounded-xl border px-3 py-2 text-[11px] font-bold",
                onlyOpen
                  ? "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : "bg-background",
              )}
            >
              {onlyOpen ? "מציג ביקוש פתוח בלבד" : "כל המק״טים"}
            </button>
          </div>

          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            עודכן:{" "}
            {snapshot.generatedAt
              ? new Date(snapshot.generatedAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })
              : "—"}
            {" · "}
            {filtered.length} מק״טים בתצוגה
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-start text-sm">
              <thead>
                <tr className="border-b text-[11px] text-muted-foreground">
                  <th className="px-2 py-2 font-bold">מק״ט</th>
                  <th className="px-2 py-2 font-bold">שם</th>
                  <th className="px-2 py-2 font-bold">סוג</th>
                  <th className="px-2 py-2 font-bold tabular-nums">ביקוש פתוח</th>
                  <th className="px-2 py-2 font-bold tabular-nums">הזמנות</th>
                  <th className="px-2 py-2 font-bold tabular-nums">סופק (ארכיון)</th>
                  <th className="px-2 py-2 font-bold tabular-nums">תעודות</th>
                  <th className="px-2 py-2 font-bold">מחסנים</th>
                </tr>
              </thead>
              <tbody>
                {loading && filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-2 py-10 text-center text-muted-foreground">
                      טוען נתונים חיים…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-2 py-10 text-center text-muted-foreground">
                      אין שורות תואמות — בדוק הזמנות פתוחות או הסר סינון
                    </td>
                  </tr>
                ) : (
                  filtered.slice(0, 120).map((row) => <SkuRow key={row.sku + row.name} row={row} />)
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <Link to="/orders" className="font-bold text-cyan-600 hover:underline dark:text-cyan-400">
            הזמנות בסידור
          </Link>
          <span>·</span>
          <Link to="/logistics-dict" className="font-bold text-cyan-600 hover:underline dark:text-cyan-400">
            מילון לוגיסטי
          </Link>
          <span>·</span>
          <Link to="/notes" className="font-bold text-cyan-600 hover:underline dark:text-cyan-400">
            תעודות משלוח
          </Link>
        </div>
      </main>
    </>
  );
}

function SkuRow({ row }: { row: StockSkuRow }) {
  const kindLabel =
    row.kind === "deposit"
      ? "פקדון"
      : row.kind === "delivery"
        ? "הובלה"
        : row.kind === "product"
          ? "מוצר"
          : "—";
  const hot = row.openDemandQty > 0;
  const yards = Object.entries(row.byYard)
    .map(([y, qty]) => `${y.replace("מחסן ", "")}: ${qty}`)
    .join(" · ");

  return (
    <tr
      className={cn(
        "border-b border-border/50 transition-colors hover:bg-muted/40",
        hot && "bg-amber-500/10 hover:bg-amber-500/15",
      )}
    >
      <td className="px-2 py-2 font-mono text-xs font-bold tabular-nums">{row.sku}</td>
      <td className="px-2 py-2">
        <div className="font-bold">{row.name}</div>
        {row.category ? <div className="text-[11px] text-muted-foreground">{row.category}</div> : null}
      </td>
      <td className="px-2 py-2 text-xs">{kindLabel}</td>
      <td
        className={cn(
          "px-2 py-2 font-mono text-sm font-black tabular-nums",
          hot && "text-amber-700 dark:text-amber-300",
        )}
      >
        {row.openDemandQty || "—"}
        {row.unit ? <span className="ms-1 text-[10px] font-normal text-muted-foreground">{row.unit}</span> : null}
      </td>
      <td className="px-2 py-2 font-mono text-xs tabular-nums">{row.openOrderCount || "—"}</td>
      <td className="px-2 py-2 font-mono text-xs tabular-nums">
        {row.shippedQty || "—"}
        {row.unit ? <span className="ms-1 text-[10px] text-muted-foreground">{row.unit}</span> : null}
      </td>
      <td className="px-2 py-2 font-mono text-xs tabular-nums">{row.shippedNoteCount || "—"}</td>
      <td className="max-w-[180px] truncate px-2 py-2 text-[11px] text-muted-foreground" title={yards}>
        {yards || "—"}
      </td>
    </tr>
  );
}
