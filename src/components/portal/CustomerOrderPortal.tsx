/**
 * פורטל הזמנות לקוח קצה — היבריד: קבלן מהיר + Payload-First
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

  const whatsappHref = () => {
    const text =
      result?.whatsappMessage ||
      [
        `הזמנה מפורטל לקוח — ${customer?.name || ""}`,
        `טלפון: ${phone}`,
        `כתובת: ${address}`,
        `פריקה: ${UNLOAD_OPTIONS.find((o) => o.id === unload)?.label}`,
        `משקל: ${tons} ט׳ · ${vehicleLabel(unload, tons)}`,
        ...lines.map((l) => `• ${l.qty} × ${l.product.officialName} (${l.product.sku})`),
        autoDep.d60002 ? `פקדון 60002: ${autoDep.d60002}` : "",
        autoDep.d60060 ? `פקדון 60060: ${autoDep.d60060}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
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
          <button
            type="button"
            className="mt-3 min-h-12 rounded-xl bg-[#102A43] px-4 font-bold text-white"
            onClick={() => void bootstrap.refetch()}
          >
            נסו שוב
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#F3F7FB] pb-28 text-[#102A43]" dir="rtl">
      <header className="sticky top-0 z-30 border-b border-[#DCE6EF] bg-gradient-to-l from-[#102A43] via-[#164E78] to-[#147D9C] text-white shadow-md">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <div className="text-xs font-bold opacity-90">פורטל הזמנות · ח. סבן</div>
            <div className="text-sm font-extrabold">{vehicleLabel(unload, tons)}</div>
          </div>
          <div className="text-left text-xs font-bold tabular-nums">
            {tons.toFixed(2)} / {limit} ט׳
          </div>
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-3">
          <div className="h-3 overflow-hidden rounded-full bg-white/20">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                safety.level === "danger"
                  ? "bg-red-400"
                  : safety.level === "warn"
                    ? "bg-amber-300"
                    : "bg-emerald-300",
              )}
              style={{ width: `${Math.min(100, util)}%` }}
            />
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-semibold opacity-95">
            <span>{util}% ניצולת</span>
            <span>· נותרו {remain} ט׳</span>
            <span>· נהג מומלץ: {driver}</span>
            <span>· מחסן: {warehouse}</span>
          </div>
          {util >= 75 && remain > 0.1 && (
            <p className="mt-2 rounded-xl bg-white/15 px-3 py-2 text-xs font-bold">
              נותרו עוד {remain} טון פנויים בהובלה זו — אפשר להוסיף שקים או בלות בלי תוספת הובלה מיותרת.
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        {!verified ? (
          <section className="rounded-[20px] border border-[#DCE6EF] bg-white p-4 shadow-sm">
            <h1 className="font-display text-xl font-extrabold">כניסה מהירה</h1>
            <p className="mt-1 text-sm text-[#5B6B7C]">
              הזינו מספר נייד לזיהוי מול מאגר הלקוחות. קוד OTP (בייצור — SMS/WhatsApp).
            </p>
            <label className="mt-4 block text-sm font-bold">
              נייד
              <div className="mt-1 flex gap-2">
                <input
                  inputMode="tel"
                  className="min-h-12 flex-1 rounded-xl border border-[#DCE6EF] px-3 text-base"
                  placeholder="05X…"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <button
                  type="button"
                  onClick={tryIdentify}
                  className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl bg-[#1769AA] px-4 font-bold text-white"
                >
                  <Phone className="h-5 w-5" />
                </button>
              </div>
            </label>
            {otpSent && (
              <label className="mt-3 block text-sm font-bold">
                קוד אימות
                <div className="mt-1 flex gap-2">
                  <input
                    inputMode="numeric"
                    className="min-h-12 flex-1 rounded-xl border border-[#DCE6EF] px-3 text-base tracking-widest"
                    placeholder="••••"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={verifyOtp}
                    className="min-h-12 rounded-xl bg-[#102A43] px-4 font-bold text-white"
                  >
                    אישור
                  </button>
                </div>
              </label>
            )}
            <p className="mt-3 text-xs text-[#5B6B7C]">
              צוות פנימי?{" "}
              <Link to="/new-order" className="font-bold text-[#1769AA] underline">
                סטודיו הזמנה פנימי
              </Link>
            </p>
          </section>
        ) : (
          <>
            <section className="rounded-[20px] border border-[#DCE6EF] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-[#5B6B7C]">לקוח מאומת</div>
                  <h2 className="text-lg font-extrabold">{customer?.name}</h2>
                  <div className="text-xs text-[#5B6B7C]">מס׳ {customer?.customerNo}</div>
                </div>
                <button
                  type="button"
                  className="text-xs font-bold text-[#1769AA]"
                  onClick={() => {
                    setVerified(false);
                    setCustomer(null);
                    setOtpSent(false);
                    setOtp("");
                  }}
                >
                  החלף
                </button>
              </div>
              <label className="mt-3 block text-sm font-bold">
                אתר אספקה
                <input
                  className="mt-1 min-h-12 w-full rounded-xl border border-[#DCE6EF] px-3 text-base"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="כתובת מלאה"
                />
              </label>
              {siteHint && (
                <p className="mt-2 rounded-xl bg-[#F3F7FB] px-3 py-2 text-xs font-semibold text-[#164E78]">
                  {siteHint.city || "יעד"}
                  {siteHint.p80StayMin != null ? ` · שהייה P80 ~${siteHint.p80StayMin} דק׳` : ""}
                  {siteHint.roadKmFromHarash != null
                    ? ` · ~${siteHint.roadKmFromHarash} ק\"מ מהחרש`
                    : ""}
                </p>
              )}
              <label className="mt-2 block text-sm font-bold">
                תאריך אספקה
                <input
                  type="date"
                  className="mt-1 min-h-12 w-full rounded-xl border border-[#DCE6EF] px-3 text-base"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </label>
            </section>

            <section className="rounded-[20px] border border-[#DCE6EF] bg-white p-4 shadow-sm">
              <h3 className="flex items-center gap-2 font-extrabold">
                <Truck className="h-5 w-5 text-[#1769AA]" />
                תנאי פריקה באתר
              </h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {UNLOAD_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setUnload(o.id)}
                    className={cn(
                      "min-h-14 rounded-2xl border px-3 py-3 text-right transition active:scale-[0.98]",
                      unload === o.id
                        ? "border-[#1769AA] bg-[#1769AA]/10 ring-2 ring-[#1769AA]/30"
                        : "border-[#DCE6EF] bg-white",
                    )}
                  >
                    <div className="text-sm font-extrabold">{o.label}</div>
                    <div className="text-[11px] text-[#5B6B7C]">{o.desc}</div>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-[20px] border border-[#DCE6EF] bg-white p-4 shadow-sm">
              <h3 className="font-extrabold">החומרים הנפוצים</h3>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {quickProducts.map((p) => (
                  <div
                    key={p.sku}
                    className="min-w-[9.5rem] shrink-0 rounded-2xl border border-[#DCE6EF] bg-[#F8FBFE] p-3"
                  >
                    <div className="line-clamp-2 text-xs font-bold leading-snug">{p.officialName}</div>
                    <div className="mt-1 font-mono text-[10px] text-[#5B6B7C]">{p.sku}</div>
                    <div className="mt-2 flex gap-1">
                      <button
                        type="button"
                        className="min-h-11 flex-1 rounded-xl bg-[#102A43] text-xs font-extrabold text-white"
                        onClick={() => addQty(p, stepQty(p))}
                      >
                        +{stepQty(p)}
                      </button>
                      <button
                        type="button"
                        className="min-h-11 rounded-xl border border-[#DCE6EF] px-2 text-xs font-bold"
                        onClick={() => addQty(p, 1)}
                      >
                        +1
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <label className="mt-4 block text-sm font-bold">
                <span className="inline-flex items-center gap-1">
                  <ClipboardPaste className="h-4 w-4" />
                  הדבק רשימה מוואטסאפ
                </span>
                <textarea
                  className="mt-1 min-h-[5.5rem] w-full rounded-xl border border-[#DCE6EF] px-3 py-2 text-base"
                  placeholder="לדוגמה: 10 בלות סומסום, 40 שק מלט, 5 דבק"
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={applyPaste}
                className="mt-2 min-h-12 w-full rounded-xl border border-[#1769AA] font-bold text-[#1769AA]"
              >
                הוסף לסל
              </button>
            </section>

            <section className="rounded-[20px] border border-[#DCE6EF] bg-white p-4 shadow-sm">
              <h3 className="flex items-center gap-2 font-extrabold">
                <Package className="h-5 w-5 text-[#1769AA]" />
                סל · {lines.length} פריטים
              </h3>
              {lines.length === 0 ? (
                <p className="mt-3 text-sm text-[#5B6B7C]">הוסיפו מוצרים מהרשימה או מהדבקה</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {lines.map((l) => (
                    <li
                      key={l.key}
                      className="flex items-center gap-2 rounded-2xl border border-[#DCE6EF] px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">{l.product.officialName}</div>
                        <div className="text-[11px] text-[#5B6B7C]">
                          {l.product.sku} · {l.product.weightKgPerUnit || 0} ק\"ג/יח׳
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="min-h-11 min-w-11 rounded-xl border font-bold"
                          onClick={() => addQty(l.product, -stepQty(l.product))}
                        >
                          −
                        </button>
                        <span className="w-10 text-center font-extrabold tabular-nums">{l.qty}</span>
                        <button
                          type="button"
                          className="min-h-11 min-w-11 rounded-xl bg-[#102A43] font-bold text-white"
                          onClick={() => addQty(l.product, stepQty(l.product))}
                        >
                          +
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 space-y-2 rounded-2xl bg-[#FFF8EB] p-3 text-sm">
                <div className="font-extrabold text-amber-900">פקדונות (זיכוי בהחזרה)</div>
                <div className="flex justify-between font-bold text-amber-950">
                  <span>60002 שק גדול</span>
                  <span>{autoDep.d60002}</span>
                </div>
                <div className="flex justify-between font-bold text-amber-950">
                  <span>60060 משטח סבן</span>
                  <span>{autoDep.d60060}</span>
                </div>
                <label className="mt-1 block text-xs font-bold text-amber-900">
                  יש לי ריקים באתר לאיסוף
                  <input
                    className="mt-1 min-h-11 w-full rounded-xl border border-amber-200 bg-white px-3 text-sm"
                    placeholder="למשל: 4 בלות + 2 משטחים"
                    value={collectEmpty}
                    onChange={(e) => setCollectEmpty(e.target.value)}
                  />
                </label>
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs font-bold text-[#164E78]">
                <Warehouse className="h-4 w-4" />
                מחסן מוצא משוער: {warehouse}
              </div>

              <label className="mt-2 block text-sm font-bold">
                הערות לסידור
                <textarea
                  className="mt-1 min-h-[3.5rem] w-full rounded-xl border border-[#DCE6EF] px-3 py-2 text-base"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </section>

            {result && (
              <section className="rounded-[20px] border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 font-extrabold text-emerald-900">
                  <Check className="h-5 w-5" />
                  ההזמנה נקלטה · {result.orderId}
                </div>
                <a
                  href={whatsappHref()}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] font-bold text-white"
                >
                  <MessageCircle className="h-5 w-5" />
                  שלח סיכום בוואטסאפ
                </a>
              </section>
            )}
          </>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
            {error}
          </div>
        )}
      </main>

      {verified && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#DCE6EF] bg-white/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto flex max-w-3xl gap-2">
            <a
              href={whatsappHref()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-[#25D366] text-[#128C7E]"
              aria-label="וואטסאפ"
            >
              <MessageCircle className="h-5 w-5" />
            </a>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void submit()}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#102A43] text-base font-extrabold text-white disabled:opacity-40"
            >
              {inject.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
              שגר להזמנה
            </button>
          </div>
          {safety.level === "danger" && (
            <p className="mx-auto mt-1 max-w-3xl text-center text-xs font-bold text-red-600">
              חריגת משקל — הפחיתו פריטים או שנו תנאי פריקה למנוף
            </p>
          )}
        </div>
      )}
    </div>
  );
}
