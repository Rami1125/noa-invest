/**
 * דף א': מרכז הזמנות חדשות (New Order Console)
 * Gateway: preview_order(itemsJson) · inject_order(...) · lookup_catalog(q)
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  PackagePlus,
  Eye,
  Send,
  Trash2,
  CheckCircle2,
  Scale,
} from "lucide-react";
import {
  previewOrder,
  injectOrder,
  lookupCatalog,
  estimateDepositsLocal,
  type CatalogItem,
  type OrderLineInput,
  type PreviewOrderResult,
  type InjectOrderResult,
  GatewayError,
} from "@/lib/saban-gateway";

export const Route = createFileRoute("/order-console")({
  head: () => ({ meta: [{ title: "מרכז הזמנות · נועה · ח. סבן" }] }),
  component: OrderConsolePage,
});

type Unload = "crane" | "manual" | "forklift";

function OrderConsolePage() {
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [unloadingType, setUnloadingType] = useState<Unload>("crane");
  const [requestedTime, setRequestedTime] = useState("");
  const [contactName, setContactName] = useState("");
  const [notes, setNotes] = useState("");
  const [skuQuery, setSkuQuery] = useState("");
  const [suggestions, setSuggestions] = useState<CatalogItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState<(OrderLineInput & { name: string })[]>([]);
  const [preview, setPreview] = useState<PreviewOrderResult | null>(null);
  const [injectResult, setInjectResult] = useState<InjectOrderResult | null>(null);
  const [busy, setBusy] = useState<"preview" | "inject" | null>(null);

  const localDep = useMemo(() => estimateDepositsLocal(lines, 40), [lines]);

  const searchProducts = async (q: string) => {
    setSkuQuery(q);
    if (q.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    try {
      const res = await lookupCatalog(q.trim());
      const items = res.items || res.products || [];
      setSuggestions(items.slice(0, 12));
    } catch (err) {
      setSuggestions([]);
      if (err instanceof GatewayError) {
        toast.error("חיפוש מוצרים נכשל", { description: err.message });
      }
    } finally {
      setSearching(false);
    }
  };

  const addLine = (item: CatalogItem) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.sku === item.sku);
      if (existing) {
        return prev.map((l) =>
          l.sku === item.sku ? { ...l, qty: l.qty + 1 } : l,
        );
      }
      return [
        ...prev,
        { sku: item.sku, name: item.name, qty: 1, unit: item.unit },
      ];
    });
    setSkuQuery("");
    setSuggestions([]);
  };

  const setQty = (sku: string, qty: number) => {
    setLines((prev) =>
      prev
        .map((l) => (l.sku === sku ? { ...l, qty: Math.max(0, qty) } : l))
        .filter((l) => l.qty > 0),
    );
  };

  const itemsPayload = () =>
    lines.map(({ sku, name, qty, unit }) => ({ sku, name, qty, unit }));

  const validate = () => {
    if (!customerName.trim()) return "חסר שם לקוח";
    if (!address.trim()) return "חסרה כתובת אספקה";
    if (!lines.length) return "הוסיפו לפחות פריט אחד";
    return null;
  };

  const onPreview = async () => {
    if (!lines.length) {
      toast.error("הוסיפו פריטים לתצוגה מקדימה");
      return;
    }
    setBusy("preview");
    setInjectResult(null);
    try {
      const res = await previewOrder({ items: itemsPayload() });
      setPreview(res);
      toast.success("תצוגה מקדימה מוכנה");
    } catch (e) {
      setPreview(null);
      toast.error("תצוגה מקדימה נכשלה", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  };

  const onInject = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setBusy("inject");
    try {
      const res = await injectOrder({
        customerName: customerName.trim(),
        phone: phone.trim() || undefined,
        address: address.trim(),
        unloadingType,
        requestedTime: requestedTime || undefined,
        contactName: contactName.trim() || undefined,
        notes: notes.trim() || undefined,
        items: itemsPayload(),
      });
      setInjectResult(res);
      toast.success("ההזמנה שודרה לגיליון");
    } catch (e) {
      toast.error("שידור נכשל", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  };

  const weightTons =
    preview?.totalWeightTons ??
    preview?.weightTons ??
    (preview?.weightKg != null ? Number(preview.weightKg) / 1000 : null);

  return (
    <div dir="rtl">
      <PageHeader
        title="מרכז הזמנות חדשות"
        subtitle="preview_order · inject_order · lookup_catalog"
      />
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-5 md:px-8">
        <Card className="space-y-4 rounded-2xl p-4 md:p-5">
          <h2 className="text-sm font-extrabold">פרטי לקוח ואספקה</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-bold">
              שם לקוח *
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="שם לקוח / חברה" className="h-10" />
            </label>
            <label className="space-y-1 text-xs font-bold">
              טלפון
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05... / 972..." className="h-10" inputMode="tel" />
            </label>
            <label className="space-y-1 text-xs font-bold sm:col-span-2">
              כתובת אספקה מלאה *
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="רחוב, מספר, עיר / אתר" className="h-10" />
            </label>
            <label className="space-y-1 text-xs font-bold">
              סוג פריקה (unloadingType)
              <select
                value={unloadingType}
                onChange={(e) => setUnloadingType(e.target.value as Unload)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="crane">מנוף</option>
                <option value="manual">ידני</option>
                <option value="forklift">מלגזה</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-bold">
              מועד מבוקש (requestedTime)
              <Input type="datetime-local" value={requestedTime} onChange={(e) => setRequestedTime(e.target.value)} className="h-10" />
            </label>
            <label className="space-y-1 text-xs font-bold">
              איש קשר באתר (contactName)
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} className="h-10" />
            </label>
            <label className="space-y-1 text-xs font-bold">
              הערות (notes)
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="גישה, שעות…" className="h-10" />
            </label>
          </div>
        </Card>

        <Card className="space-y-3 rounded-2xl p-4 md:p-5">
          <h2 className="flex items-center gap-2 text-sm font-extrabold">
            <PackagePlus className="h-4 w-4" /> בחירת מוצרים (lookup_catalog)
          </h2>
          <div className="relative">
            <Input
              value={skuQuery}
              onChange={(e) => void searchProducts(e.target.value)}
              placeholder='מק"ט / סלנג: מלט, בלה חול, סומסום…'
              className="h-11"
            />
            {searching && (
              <Loader2 className="absolute left-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {suggestions.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border bg-card shadow-lg">
                {suggestions.map((s) => (
                  <li key={s.sku}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-start text-sm hover:bg-muted"
                      onClick={() => addLine(s)}
                    >
                      <span className="font-bold">{s.sku} · {s.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {[s.category, s.unit, s.warehouse].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="text-xs text-muted-foreground">עדיין אין פריטים בסל</p>
          ) : (
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.sku} className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{l.sku} · {l.name}</div>
                  </div>
                  <Input type="number" min={1} value={l.qty} onChange={(e) => setQty(l.sku, Number(e.target.value) || 0)} className="h-9 w-20" />
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={() => setQty(l.sku, 0)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                אומדן מקומי: {localDep.bags} יח׳ · פיקדון ≈ {localDep.bales60002} (סף {localDep.thresholdBags})
              </p>
            </div>
          )}
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11 gap-2 font-bold" variant="outline" disabled={busy !== null} onClick={() => void onPreview()}>
            {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            תצוגה מקדימה
          </Button>
          <Button className="min-h-11 gap-2 font-bold bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy !== null} onClick={() => void onInject()}>
            {busy === "inject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            שדר הזמנה לגיליון
          </Button>
        </div>

        {preview && (
          <Card className="space-y-3 rounded-2xl border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 font-extrabold text-emerald-800 dark:text-emerald-300">
              <Scale className="h-4 w-4" /> תצוגה מקדימה · preview_order
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Metric label="משקל כולל" value={weightTons != null && !Number.isNaN(weightTons) ? `${Number(weightTons).toFixed(2)} טון` : "—"} />
              <Metric label="בלות 60002" value={String(preview.deposits?.bales60002 ?? localDep.bales60002)} />
              <Metric label="משטחי סבן 60060" value={String(preview.deposits?.pallets60060 ?? localDep.pallets60060)} />
            </div>
            {preview.message && <p className="text-xs text-muted-foreground">{preview.message}</p>}
          </Card>
        )}

        {injectResult && (
          <Card className="space-y-2 rounded-2xl border-2 border-emerald-500/50 bg-emerald-600/10 p-5">
            <div className="flex items-center gap-2 text-lg font-extrabold text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="h-6 w-6" /> הזמנה שודרה לגיליון
            </div>
            <div className="flex flex-wrap gap-2">
              {injectResult.rowNumber != null && <Badge className="bg-emerald-600 text-white">שורה #{injectResult.rowNumber}</Badge>}
              {injectResult.orderId && <Badge variant="outline">מס׳ {injectResult.orderId}</Badge>}
              <Badge variant="outline">{injectResult.timestamp || new Date().toLocaleString("he-IL")}</Badge>
            </div>
            {injectResult.message && <p className="text-sm">{injectResult.message}</p>}
          </Card>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background/80 px-3 py-2">
      <div className="text-[10px] font-bold text-muted-foreground">{label}</div>
      <div className="text-base font-extrabold">{value}</div>
    </div>
  );
}
