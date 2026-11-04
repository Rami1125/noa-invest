import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowUpRight,
  BadgeCheck,
  Boxes,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  Package,
  Plus,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  Weight,
  X,
} from "lucide-react";
import { CatalogProductCard } from "@/components/CatalogProductCard";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  deliveryNoteFn,
  injectOrderFn,
  inquiriesStatsFn,
  logisticsDictFn,
  previewOrderFn,
} from "@/lib/noa-gateway.functions";

export const Route = createFileRoute("/noa-console")({
  head: () => ({
    meta: [{ title: "NOA AI Enterprise Console - Saban" }],
  }),
  component: NoaConsole,
});

type Tab = "orders" | "notes" | "catalog" | "management";
type Product = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  weightKg: number;
  warehouse: string;
  imageUrl?: string;
  mediaCode?: string;
};
type OrderLine = Product & { qty: number };
type OrderForm = {
  customer: string;
  phone: string;
  address: string;
  unloadType: string;
  requestedDate: string;
  requestedWindow: string;
  driverNotes: string;
};

const EMPTY_ORDER: OrderForm = {
  customer: "",
  phone: "",
  address: "",
  unloadType: "crane",
  requestedDate: "",
  requestedWindow: "",
  driverNotes: "",
};

const TABS: { id: Tab; label: string; hint: string; icon: typeof Package }[] = [
  { id: "orders", label: "New order", hint: "Create and send", icon: Package },
  { id: "notes", label: "Delivery notes", hint: "Search PDF", icon: FileText },
  { id: "catalog", label: "Catalog", hint: "Products and media", icon: Boxes },
  { id: "management", label: "Management", hint: "Open inquiries", icon: ShieldCheck },
];

const str = (value: unknown) => (value == null ? "" : String(value));
const num = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

function normalizeProduct(row: Record<string, unknown>): Product {
  return {
    sku: str(row.sku || row.SKU),
    name: str(row.name || row.productName),
    category: str(row.category),
    unit: str(row.unit),
    weightKg: num(row.weightKg),
    warehouse: str(row.warehouse),
    imageUrl: str(row.imageUrl || row.image || row.url) || undefined,
    mediaCode: str(row.mediaCode) || undefined,
  };
}

function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-xl font-extrabold">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="animate-pulse rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground"
    >
      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
      {label}
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
    >
      <span className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {message}
      </span>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

function NoaConsole() {
  const [tab, setTab] = useState<Tab>("catalog");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogVisibleCount, setCatalogVisibleCount] = useState(90);
  const [managerPhone, setManagerPhone] = useState("");
  const [noteQuery, setNoteQuery] = useState("");
  const [order, setOrder] = useState<OrderForm>(EMPTY_ORDER);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [injectBusy, setInjectBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [injectError, setInjectError] = useState("");
  const [inquiries, setInquiries] = useState<Record<string, unknown> | null>(null);
  const [inquiriesBusy, setInquiriesBusy] = useState(false);
  const [inquiriesErrorState, setInquiriesErrorState] = useState("");

  const productsQuery = useQuery({
    queryKey: ["noa-logistics-dict", productSearch.trim()],
    queryFn: () => logisticsDictFn({ data: { query: productSearch.trim() } }),
    enabled: tab === "orders" && productSearch.trim().length >= 2,
    staleTime: 60_000,
  });

  const catalogQueryResult = useQuery({
    queryKey: ["noa-catalog", catalogQuery.trim()],
    queryFn: () => logisticsDictFn({ data: { query: catalogQuery.trim() } }),
    enabled: tab === "catalog",
    staleTime: 60_000,
  });

  const noteQueryResult = useQuery({
    queryKey: ["noa-delivery-note", noteQuery.trim()],
    queryFn: () => deliveryNoteFn({ data: { query: noteQuery.trim() } }),
    enabled: tab === "notes" && noteQuery.trim().length >= 2,
    staleTime: 30_000,
  });

  const products = useMemo(
    () =>
      (productsQuery.data?.items || [])
        .map(normalizeProduct)
        .filter((p) => p.sku || p.name),
    [productsQuery.data],
  );

  const catalogProducts = useMemo(
    () =>
      (catalogQueryResult.data?.items || [])
        .map(normalizeProduct)
        .filter((p) => p.sku || p.name),
    [catalogQueryResult.data],
  );

  const catalogCount = num(catalogQueryResult.data?.count || catalogQueryResult.data?.total);

  const noteResult = noteQueryResult.data || {};
  const note = (noteResult.note || noteResult.data || noteResult) as Record<
    string,
    unknown
  >;
  const noteFound = Boolean(
    note &&
      (note.noteNumber ||
        note.number ||
        note.customer ||
        note.customerName ||
        note.driveLink),
  );
  const notePdf = str(note.driveLink || note.driveUrl || note.pdfUrl);

  const updateOrder = (key: keyof OrderForm, value: string) => {
    setOrder((current) => ({ ...current, [key]: value }));
    setPreview(null);
    setReceipt(null);
  };

  const addProduct = (product: Product) => {
    setLines((current) => {
      const existing = current.find((line) => line.sku === product.sku);
      return existing
        ? current.map((line) =>
            line.sku === product.sku ? { ...line, qty: line.qty + 1 } : line,
          )
        : [...current, { ...product, qty: 1 }];
    });
    setProductSearch("");
    setPreview(null);
    setReceipt(null);
  };

  const updateQty = (sku: string, qty: number) => {
    setLines((current) =>
      current
        .map((line) => (line.sku === sku ? { ...line, qty: Math.max(0, qty) } : line))
        .filter((line) => line.qty > 0),
    );
    setPreview(null);
    setReceipt(null);
  };

  const runPreview = async () => {
    setPreviewBusy(true);
    setPreviewError("");
    try {
      if (!order.customer.trim() || !order.phone.trim() || !order.address.trim() || !lines.length) {
        return;
      }
      const result = await previewOrderFn({
        data: { order: { ...order, items: lines } },
      });
      setPreview(result as Record<string, unknown>);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Preview failed");
    } finally {
      setPreviewBusy(false);
    }
  };

  const runInject = async () => {
    if (!preview) return;
    setInjectBusy(true);
    setInjectError("");
    try {
      const result = await injectOrderFn({
        data: { order: { ...order, items: lines, preview } },
      });
      setReceipt(result as Record<string, unknown>);
    } catch (error) {
      setInjectError(error instanceof Error ? error.message : "Inject failed");
    } finally {
      setInjectBusy(false);
    }
  };

  const loadInquiries = async () => {
    setInquiriesBusy(true);
    setInquiriesErrorState("");
    setInquiries(null);
    try {
      setInquiries(
        (await inquiriesStatsFn({
          data: { managerPhone },
        })) as Record<string, unknown>,
      );
    } catch (error) {
      setInquiriesErrorState(
        error instanceof Error ? error.message : "Cannot load inquiries",
      );
    } finally {
      setInquiriesBusy(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-full">
      <PageHeader
        title="NOA AI - Control center"
        subtitle="H. Saban Building Materials"
      />
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 md:px-8 md:py-7">
        <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-5 text-white shadow-xl md:p-7">
          <div className="flex items-center gap-2 text-xs font-bold text-cyan-200">
            <BadgeCheck className="h-4 w-4" />
            NOA AI ENTERPRISE
          </div>
          <h1 className="mt-2 font-display text-2xl font-extrabold md:text-3xl">
            Noa control center
          </h1>
        </section>

        <nav aria-label="tabs" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TABS.map(({ id, label, hint, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex min-h-16 items-center gap-3 rounded-2xl border p-3 text-right transition ${
                tab === id
                  ? "border-primary bg-primary text-primary-foreground shadow-md"
                  : "border-border/70 bg-card hover:border-primary/40"
              }`}
            >
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                  tab === id ? "bg-white/15" : "bg-primary/10 text-primary"
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold">{label}</span>
                <span className="block truncate text-[11px] opacity-80">{hint}</span>
              </span>
            </button>
          ))}
        </nav>

        {tab === "orders" && (
          <section className="space-y-4">
            <SectionTitle title="New order" subtitle="Preview weight then inject to sheet" />
            <Card className="space-y-4 rounded-3xl p-4 md:p-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-bold">
                  Customer
                  <input
                    value={order.customer}
                    onChange={(e) => updateOrder("customer", e.target.value)}
                    className="mt-1 h-11 w-full rounded-xl border px-3 text-sm"
                  />
                </label>
                <label className="block text-xs font-bold">
                  Phone
                  <input
                    value={order.phone}
                    onChange={(e) => updateOrder("phone", e.target.value)}
                    className="mt-1 h-11 w-full rounded-xl border px-3 text-sm"
                  />
                </label>
                <label className="block text-xs font-bold sm:col-span-2">
                  Address
                  <input
                    value={order.address}
                    onChange={(e) => updateOrder("address", e.target.value)}
                    className="mt-1 h-11 w-full rounded-xl border px-3 text-sm"
                  />
                </label>
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold">Add products</label>
                <div className="relative">
                  <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  <input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="h-11 w-full rounded-xl border px-3 pr-10 text-sm"
                    placeholder="SKU or name..."
                  />
                </div>
                {productsQuery.isFetching && (
                  <p className="mt-2 text-xs text-muted-foreground">Searching...</p>
                )}
                {productsQuery.isError && (
                  <ErrorPanel message={(productsQuery.error as Error).message} />
                )}
                {products.length > 0 && (
                  <div className="mt-2 max-h-56 overflow-auto rounded-xl border">
                    {products.slice(0, 12).map((p) => (
                      <button
                        type="button"
                        key={p.sku || p.name}
                        onClick={() => addProduct(p)}
                        className="flex w-full items-center justify-between gap-3 border-b p-3 text-right last:border-0 hover:bg-muted/60"
                      >
                        <span className="min-w-0">
                          <strong className="block truncate text-sm">{p.name}</strong>
                          <small className="text-muted-foreground">
                            {p.sku} - {p.unit}
                          </small>
                        </span>
                        <Plus className="h-4 w-4 shrink-0 text-primary" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="font-bold">Cart - {lines.length}</h3>
                {lines.map((line) => (
                  <div
                    key={line.sku}
                    className="flex flex-wrap items-center gap-2 rounded-xl border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate text-sm">{line.name}</strong>
                      <small className="text-muted-foreground">{line.sku}</small>
                    </div>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={line.qty}
                      onChange={(e) => updateQty(line.sku, Number(e.target.value))}
                      className="w-20 rounded-lg border px-2 py-2 text-center text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => updateQty(line.sku, 0)}
                      className="grid h-9 w-9 place-items-center rounded-lg hover:bg-destructive/10"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 border-t pt-4">
                <Button onClick={() => void runPreview()} disabled={previewBusy}>
                  {previewBusy ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Weight className="ml-2 h-4 w-4" />
                  )}
                  Preview
                </Button>
                <Button variant="outline" onClick={() => void runInject()} disabled={injectBusy || !preview}>
                  {injectBusy ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="ml-2 h-4 w-4" />
                  )}
                  Inject order
                </Button>
              </div>
              {previewError && <ErrorPanel message={previewError} />}
              {injectError && <ErrorPanel message={injectError} />}
              {preview && (
                <pre className="overflow-auto rounded-xl bg-muted/50 p-3 text-[11px]">
                  {JSON.stringify(preview, null, 2)}
                </pre>
              )}
              {receipt && (
                <Card className="border-emerald-500/40 bg-emerald-500/5 p-4">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="h-5 w-5" />
                    <strong>Order injected</strong>
                  </div>
                  <pre className="mt-2 overflow-auto text-[11px]">
                    {JSON.stringify(receipt, null, 2)}
                  </pre>
                </Card>
              )}
            </Card>
          </section>
        )}

        {tab === "notes" && (
          <section className="space-y-4">
            <SectionTitle title="Delivery notes" subtitle="Search by note number or customer" />
            <Card className="p-4">
              <input
                value={noteQuery}
                onChange={(e) => setNoteQuery(e.target.value)}
                className="h-11 w-full rounded-xl border px-3 text-sm"
                placeholder="e.g. 6715848"
              />
            </Card>
            {noteQueryResult.isFetching && <LoadingPanel label="Loading note..." />}
            {noteQueryResult.isError && (
              <ErrorPanel message={(noteQueryResult.error as Error).message} />
            )}
            {noteFound && (
              <Card className="space-y-3 rounded-2xl p-5">
                <h3 className="text-lg font-extrabold">
                  {str(note.customerName || note.customer)} #{str(note.noteNumber || note.number || noteQuery)}
                </h3>
                {notePdf && (
                  <Button
                    onClick={() => window.open(notePdf, "_blank", "noopener,noreferrer")}
                  >
                    <ArrowUpRight className="ml-2 h-4 w-4" />
                    Open signed PDF
                  </Button>
                )}
              </Card>
            )}
          </section>
        )}

        {tab === "catalog" && (
          <section className="space-y-4">
            <SectionTitle
              title="Logistics catalog"
              subtitle="Search dictionary and edit image links"
              action={
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  {catalogCount || "-"} items
                </span>
              }
            />
            <Card className="p-4">
              <input
                value={catalogQuery}
                onChange={(e) => setCatalogQuery(e.target.value)}
                className="h-11 w-full rounded-xl border px-3 text-sm"
                placeholder="cement, sand, SKU..."
              />
            </Card>
            {catalogQueryResult.isFetching && (
              <LoadingPanel label="Loading catalog..." />
            )}
            {catalogQueryResult.isError && (
              <ErrorPanel message={(catalogQueryResult.error as Error).message} />
            )}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {catalogProducts.slice(0, catalogVisibleCount).map((p) => (
                <CatalogProductCard key={p.sku || p.name} product={p} />
              ))}
            </div>
            {catalogProducts.length > catalogVisibleCount && (
              <div className="text-center">
                <Button
                  variant="outline"
                  onClick={() => setCatalogVisibleCount((n) => n + 90)}
                >
                  Show more ({catalogProducts.length - catalogVisibleCount} left)
                </Button>
              </div>
            )}
            {catalogProducts.length === 0 &&
              !catalogQueryResult.isFetching &&
              !catalogQueryResult.isError && (
                <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Type a search term to load products from the server.
                </p>
              )}
          </section>
        )}

        {tab === "management" && (
          <section className="space-y-4">
            <SectionTitle title="Management board" subtitle="Open inquiries" />
            <Card className="space-y-3 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <input
                  value={managerPhone}
                  onChange={(e) => setManagerPhone(e.target.value)}
                  className="h-11 w-full rounded-xl border px-3 text-sm sm:max-w-sm"
                  placeholder="Manager phone"
                />
                <Button
                  onClick={() => void loadInquiries()}
                  disabled={inquiriesBusy || !managerPhone.trim()}
                >
                  {inquiriesBusy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                  Load inquiries
                </Button>
              </div>
            </Card>
            {inquiriesErrorState && <ErrorPanel message={inquiriesErrorState} />}
            {inquiries && (
              <Card className="p-4">
                <pre className="overflow-auto text-[11px]">
                  {JSON.stringify(inquiries, null, 2)}
                </pre>
              </Card>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
