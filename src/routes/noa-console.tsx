import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle, ArrowUpRight, BadgeCheck, Boxes, CheckCircle2, Clock3, FileSearch,
  FileText, Image as ImageIcon, Loader2, Package, Plus, Search,
  Send, ShieldCheck, UserRound, Weight, X,
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  deliveryNoteFn, injectOrderFn, inquiriesStatsFn, logisticsDictFn,
  previewOrderFn,
} from "@/lib/noa-gateway.functions";

export const Route = createFileRoute("/noa-console")({
  head: () => ({ meta: [{ title: "NOA AI Enterprise Console — ח. סבן" }] }),
  component: NoaConsole,
});

type Tab = "orders" | "notes" | "catalog" | "management";
type Product = { sku: string; name: string; category: string; unit: string; weightKg: number; warehouse: string; imageUrl?: string };
type OrderLine = Product & { qty: number };
type OrderForm = { customer: string; phone: string; address: string; contactName: string; unloadType: string; requestedDate: string; requestedWindow: string; driverNotes: string };

const EMPTY_ORDER: OrderForm = { customer: "", phone: "", address: "", contactName: "", unloadType: "מנוף", requestedDate: "", requestedWindow: "", driverNotes: "" };
const TABS: { id: Tab; label: string; hint: string; icon: typeof Package }[] = [
  { id: "orders", label: "הזמנה חדשה", hint: "פתיחה, חישוב ושידור", icon: Package },
  { id: "notes", label: "ארכיון תעודות", hint: "חיפוש וצפייה ב-PDF", icon: FileText },
  { id: "catalog", label: "קטלוג לוגיסטי", hint: "מילון מוצרים ומדיה", icon: Boxes },
  { id: "management", label: "לוח הנהלה", hint: "בירורים פתוחים", icon: ShieldCheck },
];

const str = (value: unknown) => value == null ? "" : String(value);
const num = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};
function normalizeProduct(row: Record<string, unknown>): Product {
  return {
    sku: str(row.sku || row.SKU || row["מק״ט"] || row["מק''ט"] || row["קוד פריט"]),
    name: str(row.name || row.productName || row["שם מוצר"] || row["שם פריט"] || row["תיאור"]),
    category: str(row.category || row["קטגוריה"] || row["משפחה"]),
    unit: str(row.unit || row["יחידת מידה"] || row["יחידה"]),
    weightKg: num(row.weightKg || row["משקל"] || row["משקל יחידה"]),
    warehouse: str(row.warehouse || row["מחסן מקור"] || row["מחסן"]),
    imageUrl: str(row.imageUrl || row.image || row["קישור תמונה"]) || undefined,
  };
}
function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-display text-xl font-extrabold">{title}</h2>{subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}</div>{action}</div>;
}
function Metric({ label, value, icon: Icon, tone = "blue" }: { label: string; value: string | number; icon: typeof Package; tone?: "blue" | "green" | "amber" | "violet" }) {
  const tones = { blue: "bg-blue-500/10 text-blue-700", green: "bg-emerald-500/10 text-emerald-700", amber: "bg-amber-500/10 text-amber-700", violet: "bg-violet-500/10 text-violet-700" };
  return <Card className="rounded-2xl border-border/70 p-4 shadow-sm"><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-muted-foreground">{label}</span><span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-4 w-4" /></span></div><div className="mt-2 font-display text-2xl font-extrabold tabular-nums">{value}</div></Card>;
}
function LoadingPanel({ label }: { label: string }) {
  return <div role="status" className="animate-pulse rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />{label}</div>;
}
function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{message}</span>{onRetry && <Button variant="outline" size="sm" onClick={onRetry}>ניסיון חוזר</Button>}</div>;
}

function NoaConsole() {
  const [tab, setTab] = useState<Tab>("orders");
  const [order, setOrder] = useState<OrderForm>(EMPTY_ORDER);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);
  const [noteQuery, setNoteQuery] = useState("");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogVisibleCount, setCatalogVisibleCount] = useState(90);
  const [managerPhone, setManagerPhone] = useState("");


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
  const products = useMemo(() => (productsQuery.data?.items || []).map(normalizeProduct).filter((p) => p.sku || p.name), [productsQuery.data]);
  const catalogProducts = useMemo(() => (catalogQueryResult.data?.items || []).map(normalizeProduct).filter((p) => p.sku || p.name), [catalogQueryResult.data]);

  const updateOrder = (key: keyof OrderForm, value: string) => {
    setOrder((current) => ({ ...current, [key]: value }));
    setPreview(null);
    setReceipt(null);
  };
  const addProduct = (product: Product) => {
    setLines((current) => {
      const existing = current.find((line) => line.sku === product.sku);
      return existing ? current.map((line) => line.sku === product.sku ? { ...line, qty: line.qty + 1 } : line) : [...current, { ...product, qty: 1 }];
    });
    setProductSearch("");
    setPreview(null);
    setReceipt(null);
  };
  const updateQty = (sku: string, qty: number) => {
    setLines((current) => current.map((line) => line.sku === sku ? { ...line, qty: Math.max(0, qty) } : line).filter((line) => line.qty > 0));
    setPreview(null);
    setReceipt(null);
  };

  const previewMutation = async () => {
    if (!order.customer.trim() || !order.phone.trim() || !order.address.trim() || !lines.length) return;
    setPreview(null);
    setReceipt(null);
    const result = await previewOrderFn({ data: { order: { ...order, items: lines } } });
    setPreview(result as Record<string, unknown>);
  };
  const injectMutation = async () => {
    if (!preview) return;
    const result = await injectOrderFn({ data: { order: { ...order, items: lines, preview } } });
    setReceipt(result as Record<string, unknown>);
  };

  const [previewBusy, setPreviewBusy] = useState(false);
  const [injectBusy, setInjectBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [injectError, setInjectError] = useState("");
  const runPreview = async () => {
    setPreviewBusy(true); setPreviewError("");
    try { await previewMutation(); } catch (error) { setPreviewError(error instanceof Error ? error.message : "שגיאה בחישוב ההזמנה"); }
    finally { setPreviewBusy(false); }
  };
  const runInject = async () => {
    setInjectBusy(true); setInjectError("");
    try { await injectMutation(); } catch (error) { setInjectError(error instanceof Error ? error.message : "שגיאה בשידור ההזמנה"); }
    finally { setInjectBusy(false); }
  };

  const noteResult = noteQueryResult.data || {};
  const note = (noteResult.note || noteResult.data || noteResult) as Record<string, unknown>;
  const noteFound = Boolean(note && (note.noteNumber || note.number || note.customer || note.customerName || note.driveLink));
  const notePdf = str(note.driveLink || note.driveUrl || note.pdfUrl);
  const noteRows = Array.isArray(noteResult.notes) ? noteResult.notes as Record<string, unknown>[] : Array.isArray(noteResult.data) ? noteResult.data as Record<string, unknown>[] : [];

  const catalogCount = num(catalogQueryResult.data?.count || catalogQueryResult.data?.total);
  const [inquiries, setInquiries] = useState<Record<string, unknown> | null>(null);
  const [inquiriesBusy, setInquiriesBusy] = useState(false);
  const [inquiriesErrorState, setInquiriesErrorState] = useState("");
  const loadInquiries = async () => {
    setInquiriesBusy(true); setInquiriesErrorState(""); setInquiries(null);
    try { setInquiries(await inquiriesStatsFn({ data: { managerPhone } }) as Record<string, unknown>); }
    catch (error) { setInquiriesErrorState(error instanceof Error ? error.message : "לא ניתן לטעון בירורים"); }
    finally { setInquiriesBusy(false); }
  };

  return <div dir="rtl" className="min-h-full">
    <PageHeader title="NOA AI · מרכז ניהול ושירות" subtitle="ח. סבן חומרי בניין (1994) בע״מ · הוד השרון" action={<span className="hidden rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-700 sm:inline-flex"><span className="ml-2 h-2 w-2 self-center rounded-full bg-emerald-500" />ממשק מאובטח</span>} />
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 md:px-8 md:py-7">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-5 text-white shadow-xl md:p-7">
        <div className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div><div className="flex items-center gap-2 text-xs font-bold text-cyan-200"><BadgeCheck className="h-4 w-4" />NOA AI ENTERPRISE</div><h1 className="mt-2 font-display text-2xl font-extrabold md:text-3xl">מרכז השליטה של נועה</h1><p className="mt-1 max-w-2xl text-sm text-slate-300">הזמנות · תעודות משלוח · קטלוג לוגיסטי · בקרת הנהלה</p></div>
          <div className="text-xs text-slate-300">ניהול: ראמי מסארווה והראל אידלסון</div>
        </div>
      </section>

      <nav aria-label="מסכי ניהול" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TABS.map(({ id, label, hint, icon: Icon }) => <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined} className={`flex min-h-16 items-center gap-3 rounded-2xl border p-3 text-right transition ${tab === id ? "border-primary bg-primary text-primary-foreground shadow-md" : "border-border/70 bg-card hover:border-primary/40 hover:bg-muted/50"}`}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tab === id ? "bg-white/15" : "bg-primary/10 text-primary"}`}><Icon className="h-5 w-5" /></span><span className="min-w-0"><span className="block text-sm font-extrabold">{label}</span><span className={`block truncate text-[11px] ${tab === id ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{hint}</span></span></button>)}
      </nav>

      {tab === "orders" && <section className="space-y-4">
        <SectionTitle title="מרכז הזמנות חדשות" subtitle="יצירת הזמנה, חישוב משקל ופקדונות לפני שידור לגיליון." />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)]">
          <Card className="space-y-4 rounded-3xl p-4 md:p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="שם לקוח"><input value={order.customer} onChange={e => updateOrder("customer", e.target.value)} className="w-full min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary" placeholder="שם הלקוח" /></Field>
              <Field label="טלפון"><input value={order.phone} onChange={e => updateOrder("phone", e.target.value)} className="w-full min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary" inputMode="tel" placeholder="05X-XXXXXXX" /></Field>
              <Field label="כתובת אספקה מלאה" wide><input value={order.address} onChange={e => updateOrder("address", e.target.value)} className="w-full min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary" placeholder="רחוב, מספר, עיר, פרטי גישה" /></Field>\n              <Field label="איש קשר באתר"><input value={order.contactName} onChange={e => updateOrder("contactName", e.target.value)} className="w-full min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary" placeholder="שם איש הקשר לקבלת הסחורה" /></Field>
              <Field label="סוג פריקה"><select value={order.unloadType} onChange={e => updateOrder("unloadType", e.target.value)} className="w-full min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary"><option>מנוף</option><option>ידני</option><option>מלגזה</option></select></Field>
              <Field label="תאריך מבוקש"><input type="date" value={order.requestedDate} onChange={e => updateOrder("requestedDate", e.target.value)} className="w-full min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary" /></Field>
              <Field label="חלון אספקה"><input value={order.requestedWindow} onChange={e => updateOrder("requestedWindow", e.target.value)} className="w-full min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary" placeholder="למשל 07:00–10:00" /></Field>
              <Field label="הערות לנהג"><input value={order.driverNotes} onChange={e => updateOrder("driverNotes", e.target.value)} className="w-full min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary" placeholder="גישה, קומה, איש קשר, ציוד" /></Field>
            </div>
            <div className="border-t pt-4">
              <label className="mb-2 block text-sm font-bold">הוספת מוצרים לפי מק״ט או שם</label>
              <div className="relative"><Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" /><input value={productSearch} onChange={e => setProductSearch(e.target.value)} className="w-full min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary pr-10" placeholder="הקלד מק״ט או שם מוצר…" /></div>
              {productsQuery.isFetching && <p className="mt-2 text-xs text-muted-foreground">מחפש במילון הלוגיסטי…</p>}
              {productsQuery.isError && <ErrorPanel message={(productsQuery.error as Error).message} />}
              {products.length > 0 && <div className="mt-2 max-h-56 overflow-auto rounded-xl border bg-card">{products.slice(0, 12).map(p => <button type="button" key={p.sku || p.name} onClick={() => addProduct(p)} className="flex w-full items-center justify-between gap-3 border-b p-3 text-right last:border-0 hover:bg-muted/60"><span className="min-w-0"><strong className="block truncate text-sm">{p.name}</strong><small className="text-muted-foreground">{p.sku} · {p.unit} · {p.weightKg || "משקל לא ידוע"} ק״ג</small></span><Plus className="h-4 w-4 shrink-0 text-primary" /></button>)}</div>}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><h3 className="font-bold">סל מוצרים</h3><span className="text-xs text-muted-foreground">{lines.length} פריטים</span></div>
              {lines.length === 0 ? <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">עדיין לא נוספו מוצרים להזמנה</p> : lines.map(line => <div key={line.sku} className="flex flex-wrap items-center gap-2 rounded-xl border p-3"><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{line.name}</strong><small className="text-muted-foreground">{line.sku} · {line.weightKg ? `${line.weightKg} ק״ג ליחידה` : "משקל לא הוגדר"}</small></div><input aria-label={`כמות ${line.name}`} type="number" min="0" step="0.1" value={line.qty} onChange={e => updateQty(line.sku, Number(e.target.value))} className="w-20 rounded-lg border bg-background px-2 py-2 text-center text-sm" /><button type="button" onClick={() => updateQty(line.sku, 0)} aria-label={`הסר ${line.name}`} className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="h-4 w-4" /></button></div>)}
            </div>
            <div className="flex flex-wrap gap-2 border-t pt-4"><Button onClick={() => void runPreview()} disabled={previewBusy || !order.customer || !order.phone || !order.address || !lines.length}>{previewBusy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Weight className="ml-2 h-4 w-4" />}תצוגה מקדימה</Button><Button variant="outline" onClick={() => void runInject()} disabled={injectBusy || !preview}>{injectBusy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Send className="ml-2 h-4 w-4" />}שדר הזמנה לגיליון</Button></div>
            {previewError && <ErrorPanel message={previewError} />}{injectError && <ErrorPanel message={injectError} />}
          </Card>
          <div className="space-y-3">
            <Card className="rounded-3xl p-5"><h3 className="font-display font-bold">תוצאות חישוב</h3>{preview ? <div className="mt-4 grid grid-cols-2 gap-3"><Metric label="משקל כולל" value={str(preview.totalTons ?? preview.weightTons ?? "—") + " טון"} icon={Weight} /><Metric label="בלות פיקדון 60002" value={num(preview.bales60002 ?? preview.bales)} icon={Package} tone="amber" /><Metric label="משטחי סבן 60060" value={num(preview.pallets60060 ?? preview.pallets)} icon={Boxes} tone="violet" /><Metric label="שקים" value={num(preview.bagCount ?? preview.totalBags)} icon={Package} tone="green" /></div> : <p className="mt-3 rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">לא בוצע חישוב. לאחר בחירת מוצרים ולחיצה על ״תצוגה מקדימה״ יוצגו נתוני המשקל והפיקדונות מהשרת.</p>}</Card>
            {receipt && <Card className="rounded-3xl border-emerald-500/30 bg-emerald-500/5 p-5"><div className="flex items-center gap-2 font-bold text-emerald-700"><CheckCircle2 className="h-5 w-5" />ההזמנה שודרה בהצלחה</div><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><small className="text-muted-foreground">מספר שורה</small><strong className="block">{str(receipt.rowNumber ?? receipt.row ?? "—")}</strong></div><div><small className="text-muted-foreground">חותמת זמן</small><strong className="block">{str(receipt.timestamp ?? receipt.createdAt ?? new Date().toLocaleString("he-IL"))}</strong></div></div></Card>}
          </div>
        </div>
      </section>}

      {tab === "notes" && <section className="space-y-4">
        <SectionTitle title="ארכיון תעודות משלוח" subtitle="חיפוש לפי מספר תעודת משלוח, עם פתיחת קובץ Drive המאומת." />
        <div className="relative"><Search className="absolute right-4 top-3.5 h-5 w-5 text-muted-foreground" /><input value={noteQuery} onChange={e => setNoteQuery(e.target.value)} className="w-full min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary pr-12" placeholder="מספר תעודת משלוח…" /></div>
        {noteQuery.length < 2 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">הקלד לפחות שתי אותיות או ספרות כדי להתחיל חיפוש.</p>}
        {noteQueryResult.isFetching && <LoadingPanel label="מחפש בארכיון התעודות…" />}
        {noteQueryResult.isError && <ErrorPanel message={(noteQueryResult.error as Error).message} />}
        {noteFound && <Card className="rounded-3xl p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-primary">תעודת משלוח</p><h3 className="mt-1 font-display text-xl font-extrabold">#{str(note.noteNumber || note.number || note.id)}</h3><p className="mt-1 font-bold">{str(note.customer || note.customerName)}</p></div><span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700">{str(note.approvalStatus || note.status || "סטטוס לא זמין")}</span></div><div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><Info label="תאריך אספקה" value={str(note.deliveryDate || note.date)} /><Info label="כתובת" value={str(note.address || note.siteAddress)} /><Info label="נהג" value={str(note.driver || note.driverName)} /><Info label="רכב" value={str(note.plate || note.vehicle)} /></div>{notePdf && <a href={notePdf} target="_blank" rel="noreferrer" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"><FileSearch className="h-4 w-4" />צפה בתעודה חתומה (PDF)<ArrowUpRight className="h-4 w-4" /></a>}</Card>}
        {noteRows.map((row, i) => <Card key={str(row.noteNumber || row.id || i)} className="rounded-2xl p-4"><strong>{str(row.customer || row.customerName)} · #{str(row.noteNumber || row.id)}</strong><p className="mt-1 text-xs text-muted-foreground">{str(row.deliveryDate || row.date)} · {str(row.address || row.siteAddress)}</p></Card>)}
        {noteQueryResult.data && !noteFound && !noteRows.length && !noteQueryResult.isFetching && <p className="rounded-xl bg-muted/40 p-5 text-sm text-muted-foreground">לא נמצאה תעודה מתאימה.</p>}
      </section>}

      {tab === "catalog" && <section className="space-y-4">
        <SectionTitle title="קטלוג מוצרים לוגיסטי" subtitle="חיפוש במילון_לוגיסט. נתוני הקטלוג מוצגים כפי שהוחזרו מהמקור." action={<span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{catalogCount || "—"} פריטים לפי תשובת המקור</span>} />
        <div className="relative"><Search className="absolute right-4 top-3.5 h-5 w-5 text-muted-foreground" /><input value={catalogQuery} onChange={e => setCatalogQuery(e.target.value)} className="w-full min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary pr-12" placeholder="חיפוש מק״ט, שם, קטגוריה או סלנג…" /></div>
        {catalogQueryResult.isFetching && <LoadingPanel label="טוען פריטי מילון לוגיסטי…" />}{catalogQueryResult.isError && <ErrorPanel message={(catalogQueryResult.error as Error).message} />}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{catalogProducts.slice(0, catalogVisibleCount).map(p => <CatalogCard key={p.sku || p.name} product={p} />)}</div>{catalogProducts.length > catalogVisibleCount && <div className="text-center"><Button variant="outline" onClick={() => setCatalogVisibleCount(n => n + 90)}>הצג עוד פריטים ({catalogProducts.length - catalogVisibleCount} נותרו)</Button></div>}
        {catalogProducts.length === 0 && !catalogQueryResult.isFetching && !catalogQueryResult.isError && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">הקלד מונח חיפוש כדי לטעון פריטים מהשרת.</p>}
      </section>}

      {tab === "management" && <section className="space-y-4">
        <SectionTitle title="לוח בקרת הנהלה ובירורים" subtitle="גישה מותנית באימות מספר הנהלה והרשאה חוזרת מה-Gateway." />
        <Card className="rounded-3xl p-5"><div className="flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5 text-primary" />אימות מנהל</div><p className="mt-1 text-sm text-muted-foreground">הזן מספר טלפון הנהלה. השרת וה-Gateway חייבים לאמת את ההרשאה; התאמת המספר לבדה אינה נחשבת אימות זהות.</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={managerPhone} onChange={e => { setManagerPhone(e.target.value); setInquiries(null); setInquiriesErrorState(""); }} className="w-full min-h-11 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-primary sm:max-w-sm" inputMode="tel" placeholder="מספר טלפון הנהלה" /><Button onClick={() => { void loadInquiries(); }} disabled={inquiriesBusy || !managerPhone.trim()}>{inquiriesBusy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}בדיקת הרשאה ושליפת בירורים</Button></div></Card>
        {inquiriesErrorState && <ErrorPanel message={inquiriesErrorState} />}{inquiries && <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><Metric label="בירורים אצל הראל" value={num(inquiries.harelCount ?? inquiries.harel)} icon={UserRound} tone="amber" /><Metric label="בירורים אצל ראמי" value={num(inquiries.ramiCount ?? inquiries.rami)} icon={Clock3} tone="violet" /></div><Card className="rounded-2xl p-4"><h3 className="font-bold">פירוט בירורים פתוחים</h3><InquiryList title="בירור הראל — מנכ״ל" rows={Array.isArray(inquiries.harelInquiries) ? inquiries.harelInquiries as Record<string, unknown>[] : []} /><InquiryList title="בירור ראמי" rows={Array.isArray(inquiries.ramiInquiries) ? inquiries.ramiInquiries as Record<string, unknown>[] : []} /></Card></div>}
      </section>}
    </main>
  </div>;
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={wide ? "block sm:col-span-2" : "block"}><span className="mb-1.5 block text-xs font-bold text-muted-foreground">{label}</span>{children}</label>;
}
function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-muted/40 p-3"><small className="block text-muted-foreground">{label}</small><strong className="mt-1 block break-words">{value || "—"}</strong></div>;
}
function CatalogCard({ product }: { product: Product }) {
  const imageUrl = product.imageUrl;
  return <Card className="overflow-hidden rounded-2xl p-4 transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex gap-3"><div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">{imageUrl ? <img src={imageUrl} alt={product.name} loading="lazy" className="h-full w-full object-contain" /> : <ImageIcon className="h-6 w-6 text-muted-foreground/50" />}</div><div className="min-w-0 flex-1"><p className="font-mono text-[11px] font-bold text-primary">{product.sku || "ללא מק״ט"}</p><h3 className="line-clamp-2 text-sm font-extrabold">{product.name || "פריט ללא שם"}</h3><p className="mt-1 text-xs text-muted-foreground">{product.category || "קטגוריה לא הוגדרה"}</p></div></div><div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-xs"><Info label="יחידה" value={product.unit} /><Info label="משקל" value={product.weightKg ? String(product.weightKg) + " ק״ג" : "—"} /><Info label="מחסן" value={product.warehouse || "—"} /></div></Card>;
}
function InquiryList({ title, rows }: { title: string; rows: Record<string, unknown>[] }) {
  return <div className="mt-4"><h4 className="text-sm font-bold">{title} · {rows.length}</h4>{rows.length ? <ul className="mt-2 space-y-2">{rows.map((row, i) => <li key={str(row.noteNumber || row.id || i)} className="rounded-xl border p-3 text-sm"><strong>{str(row.noteNumber || row.id || "תעודה")}</strong> · {str(row.customer || row.customerName)}<p className="text-xs text-muted-foreground">{str(row.status || row.reason || "ממתין לטיפול")}</p></li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">אין רשומות או שה-Gateway לא החזיר פירוט.</p>}</div>;
}
