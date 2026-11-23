/**
 * פורטל הזמנות לקוח קצה — היבריד: קבלן מהיר + Payload-First
 * (שחזור זמני מ-main לאחר PLACEHOLDER; העיצוב המלא ב-portal-wave1.zip)
 */
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  ClipboardPaste,
  Loader2,
  MessageCircle,
  Package,
  Phone,
  Send,
  Truck,
  Warehouse,
} from "lucide-react";
import { useInjectNewOrder, useOrderBootstrap } from "@/lib/new-order/hooks";
import type { CartLine, DictProduct, InjectNewOrderResult, OrderCustomer } from "@/lib/new-order/types";
import { cartWeightTons, recommendWarehouse, weightSafety } from "@/lib/new-order/weight";
import { computeAutoDeposits } from "@/lib/portal/deposits";
import { parseFreeTextList } from "@/lib/portal/parse-list";
import {
  UNLOAD_OPTIONS,
  driverForUnload,
  limitForUnload,
  remainingTons,
  utilizationPct,
  vehicleLabel,
  type UnloadMode,
} from "@/lib/portal/vehicle";
import { cn } from "@/lib/utils";

const QUICK_SKUS_HINTS = ["מלט", "סומסום", "חול", "דבק", "בלוק", "גבס"];

function onlyDigits(s: string): string {
  return String(s || "").replace(/\D/g, "");
}

function findByPhone(customers: OrderCustomer[], phone: string): OrderCustomer | null {
  const d = onlyDigits(phone);
  if (d.length < 9) return null;
  for (const c of customers) {
    for (const p of c.phones || []) {
      const pd = onlyDigits(p);
      if (pd && (pd.endsWith(d) || d.endsWith(pd) || pd.includes(d))) return c;
    }
  }
  return null;
}

function stepQty(p: DictProduct): number {
  const blob = `${p.officialName} ${p.unit} ${p.slangKeywords.join(" ")}`;
  if (/בלה|משטח/i.test(blob)) return 1;
  if (/שק|מלט|דבק/i.test(blob)) return 10;
  return 1;
}

export function CustomerOrderPortal() {
  const bootstrap = useOrderBootstrap();
  const inject = useInjectNewOrder();

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [customer, setCustomer] = useState<OrderCustomer | null>(null);
  const [address, setAddress] = useState("");
  const [unload, setUnload] = useState<UnloadMode>("forklift");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [paste, setPaste] = useState("");
  const [notes, setNotes] = useState("");
  const [collectEmpty, setCollectEmpty] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<InjectNewOrderResult | null>(null);
  const [error, setError] = useState("");

  const customers = bootstrap.data?.customers ?? [];
  const products = bootstrap.data?.products ?? [];

  const quickProducts = useMemo(() => {
    const picks: DictProduct[] = [];
    for (const hint of QUICK_SKUS_HINTS) {
      const hit = products.find((p) =>
        [p.officialName, ...p.slangKeywords].some((t) => t.includes(hint)),
      );
      if (hit && !picks.some((x) => x.sku === hit.sku)) picks.push(hit);
      if (picks.length >= 8) break;
    }
    return picks.length ? picks : products.slice(0, 8);
  }, [products]);

  const tons = useMemo(() => cartWeightTons(lines), [lines]);
  const limit = limitForUnload(unload);
  const safety = weightSafety(tons, limit);
  const util = utilizationPct(tons, limit);
  const remain = remainingTons(tons, limit);
  const driver = driverForUnload(unload);
  const warehouse = useMemo(() => recommendWarehouse(lines), [lines]);
  const autoDep = useMemo(() => computeAutoDeposits(lines), [lines]);
  const siteHint = customer?.sites?.[0];

  const addQty = (p: DictProduct, delta: number) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.product.sku === p.sku);
      if (i < 0) {
        if (delta <= 0) return prev;
        return [...prev, { key: p.sku, product: p, qty: delta }];
      }
      const next = [...prev];
      const q = Math.max(0, next[i]!.qty + delta);
      if (q === 0) return next.filter((_, j) => j !== i);
      next[i] = { ...next[i]!, qty: q };
      return next;
    });
  };

  const applyPaste = () => {
    const parsed = parseFreeTextList(paste, products);
    if (!parsed.length) {
      setError("לא זוהו מוצרים מהטקסט — בדקו ניסוח או בחרו מהרשימה");
      return;
    }
    setError("");
    setLines((prev) => {
      const map = new Map(prev.map((l) => [l.product.sku, l]));
      for (const pl of parsed) {
        const ex = map.get(pl.product.sku);
        if (ex) map.set(pl.product.sku, { ...ex, qty: ex.qty + pl.qty });
        else map.set(pl.product.sku, { key: pl.product.sku, product: pl.product, qty: pl.qty });
      }
      return [...map.values()];
    });
  };

  const tryIdentify = () => {
    const c = findByPhone(customers, phone);
    if (!c) {
      setError("לא נמצא לקוח עם מספר זה במאגר. פנו לסידור או השתמשו בהזמנה פנימית.");
      return;
    }
    setError("");
    setOtpSent(true);
  };

  const verifyOtp = () => {
    if (otp.trim().length < 4) {
      setError("הזינו קוד בן 4 ספרות לפחות (בסביבת הדגמה כל קוד מתקבל)");
      return;
    }
    const c = findByPhone(customers, phone);
    if (!c) {
      setError("לקוח לא נמצא");
      return;
    }
    setCustomer(c);
    setAddress(c.defaultSiteAddress || c.sites?.[0]?.address || "");
    setVerified(true);
    setError("");
  };

  const canSubmit =
    verified &&
    customer &&
    address.trim().length > 2 &&
    lines.length > 0 &&
    !inject.isPending &&
    safety.level !== "danger";

  const submit = async () => {
    if (!customer || !canSubmit) return;
    setError("");
    setResult(null);
    const noteParts = [
      notes.trim(),
      `תנאי פריקה: ${UNLOAD_OPTIONS.find((o) => o.id === unload)?.label}`,
      collectEmpty.trim() ? `איסוף ריקים מהאתר: ${collectEmpty.trim()}` : "",
      ...autoDep.notes,
    ].filter(Boolean);

    try {
      const res = await inject.mutateAsync({
        customerNo: customer.customerNo,
        customerName: customer.name,
        address: address.trim(),
        contactPhone: phone.trim() || customer.phones[0] || "",
        contactName: customer.contactName || customer.name,
        deliveryDate,
        deliveryWindow: "",
        warehouse,
        driver,
        notes: noteParts.join(" · "),
        itemsJson: JSON.stringify(
          lines.map((l) => ({
            sku: l.product.sku,
            name: l.product.officialName,
            qty: l.qty,
            unit: l.product.unit,
            weightKg: l.product.weightKgPerUnit,
          })),
        ),
        totalWeightTons: tons,
        deposit60002: autoDep.d60002,
        deposit60060: autoDep.d60060,
        wazeUrl: `https://waze.com/ul?q=${encodeURIComponent(address.trim())}&navigate=yes`,
        isPendingComax: customer.isPendingComax,
        attachment: null,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (bootstrap.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-[#164E78]" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin" />
        טוען קטלוג ולקוחות…
      </div>
    );
  }

  if (bootstrap.isError) {
    return (
      <div className="mx-auto max-w-lg p-6" dir="rtl">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
          <div className="flex items-center gap-2 font-bold">
            <AlertCircle className="h-5 w-5" />
            לא ניתן לטעון נתונים
          </div>
          <p className="mt-1 text-sm">{(bootstrap.error as Error).message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#F3F7FB] pb-28 text-[#102A43]" dir="rtl">
      <header className="sticky top-0 z-30 border-b border-[#DCE6EF] bg-gradient-to-l from-[#102A43] via-[#164E78] to-[#147D9C] px-4 py-4 text-white shadow-md">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-semibold opacity-90">פורטל הזמנות · ח. סבן</p>
          <h1 className="text-lg font-extrabold">{customer?.name || "זיהוי לקוח"}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        {!verified ? (
          <section className="rounded-2xl border border-[#DCE6EF] bg-white p-4 shadow-sm">
            <h2 className="font-extrabold">כניסה עם נייד</h2>
            <div className="mt-3 flex gap-2">
              <input
                className="min-h-12 flex-1 rounded-xl border border-[#DCE6EF] px-3"
                inputMode="tel"
                placeholder="05X…"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <button type="button" className="min-h-12 rounded-xl bg-[#102A43] px-4 font-bold text-white" onClick={tryIdentify}>
                <Phone className="h-5 w-5" />
              </button>
            </div>
            {otpSent && (
              <div className="mt-3 flex gap-2">
                <input
                  className="min-h-12 flex-1 rounded-xl border border-[#DCE6EF] px-3"
                  inputMode="numeric"
                  placeholder="קוד"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
                <button type="button" className="min-h-12 rounded-xl bg-[#1769AA] px-4 font-bold text-white" onClick={verifyOtp}>
                  אישור
                </button>
              </div>
            )}
            {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            <p className="mt-3 text-xs text-[#5B6B7C]">
              צוות? <Link to="/new-order" className="font-bold text-[#1769AA] underline">סטודיו הזמנה</Link>
            </p>
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-[#DCE6EF] bg-white p-4">
              <p className="text-sm font-bold">{customer?.name} · {customer?.customerNo}</p>
              <input
                className="mt-2 min-h-12 w-full rounded-xl border border-[#DCE6EF] px-3"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="כתובת אספקה"
              />
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {UNLOAD_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setUnload(o.id)}
                    className={cn(
                      "min-h-14 rounded-2xl border px-3 py-3 text-right text-sm font-bold",
                      unload === o.id ? "border-[#1769AA] bg-[#E6F6FF]" : "border-[#DCE6EF]",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {quickProducts.map((p) => (
                  <button
                    key={p.sku}
                    type="button"
                    className="rounded-xl border border-[#DCE6EF] px-3 py-2 text-xs font-bold"
                    onClick={() => addQty(p, stepQty(p))}
                  >
                    +{stepQty(p)} {p.officialName}
                  </button>
                ))}
              </div>
              <textarea
                className="mt-3 min-h-[4rem] w-full rounded-xl border border-[#DCE6EF] px-3 py-2 text-sm"
                placeholder="הדבק רשימה מוואטסאפ"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
              <button type="button" className="mt-2 min-h-11 w-full rounded-xl border border-[#1769AA] font-bold text-[#1769AA]" onClick={applyPaste}>
                הוסף מהטקסט
              </button>
              <ul className="mt-3 space-y-1 text-sm">
                {lines.map((l) => (
                  <li key={l.key} className="flex justify-between gap-2">
                    <span>{l.product.officialName}</span>
                    <span className="font-bold">{l.qty}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs font-bold text-[#164E78]">
                <Truck className="inline h-4 w-4" /> {tons.toFixed(2)} ט׳ · {vehicleLabel(unload, tons)}
              </p>
              {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
              {result && (
                <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-emerald-900">
                  <Check className="inline h-4 w-4" /> הזמנה {result.orderId}
                  <a className="mt-2 flex min-h-11 items-center justify-center rounded-xl bg-[#25D366] font-bold text-white" href={`https://wa.me/?text=${encodeURIComponent(result.whatsappMessage || "")}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="ml-1 h-4 w-4" /> וואטסאפ
                  </a>
                </div>
              )}
            </section>
          </>
        )}
      </main>
      {verified && !result && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#102A43] font-extrabold text-white disabled:opacity-40"
          >
            {inject.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            שליחת הזמנה
          </button>
        </div>
      )}
    </div>
  );
}
