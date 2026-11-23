/**
 * פורטל לקוח קצה — עיצוב מחודש מלא
 * נעילת סשן · היסטוריית הזמנות · תעודות משלוח · שכפול/עריכה · וואטסאפ מעוצב
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  ClipboardList,
  Copy,
  FileText,
  History,
  Loader2,
  Lock,
  LogOut,
  MessageCircle,
  Package,
  PackagePlus,
  Pencil,
  Phone,
  Search,
  Send,
  Truck,
  UserPlus,
  X,
} from "lucide-react";
import { useInjectNewOrder, useOrderBootstrap } from "@/lib/new-order/hooks";
import type {
  CartLine,
  DictProduct,
  InjectNewOrderResult,
  OrderCustomer,
} from "@/lib/new-order/types";
import { cartWeightTons, recommendWarehouse } from "@/lib/new-order/weight";
import { computeAutoDeposits } from "@/lib/portal/deposits";
import { parseFreeTextList } from "@/lib/portal/parse-list";
import {
  UNLOAD_OPTIONS,
  driverForUnload,
  type UnloadMode,
  vehicleLabel,
} from "@/lib/portal/vehicle";
import {
  clearPortalSession,
  loadPortalSession,
  savePortalSession,
  sessionToCustomer,
} from "@/lib/portal/session";
import {
  cartLinesToWa,
  formatOrderWhatsApp,
  isOrderEditable,
  waMeHref,
} from "@/lib/portal/whatsapp-format";
import {
  useCustomerDeliveryNotes,
  useCustomerOrders,
} from "@/lib/portal/use-customer-portal-data";
import type { SheetOrder } from "@/lib/orders.functions";
import { cn } from "@/lib/utils";

type PortalTab = "order" | "history" | "notes";
type OrderStep = 1 | 2 | 3 | 4;

const QUICK_HINTS = ["מלט", "סומסום", "חול", "דבק", "בלוק", "גבס", "טיח"];

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

function findByNamePrefix(customers: OrderCustomer[], q: string): OrderCustomer[] {
  const n = q.trim().toLowerCase();
  if (n.length < 3) return [];
  return customers
    .filter((c) => {
      const hay = [c.name, ...(c.aliases || []), c.customerNo].join(" ").toLowerCase();
      return hay.includes(n);
    })
    .slice(0, 8);
}

function stepQty(p: DictProduct): number {
  const blob = `${p.officialName} ${p.unit} ${p.slangKeywords.join(" ")}`;
  if (/בלה|משטח/i.test(blob)) return 1;
  if (/שק|מלט|דבק|טיט/i.test(blob)) return 10;
  return 1;
}

function statusBadgeClass(status: string): string {
  if (/סופק|delivered/i.test(status)) return "bg-emerald-100 text-emerald-800";
  if (/בדרך|בהעמסה/i.test(status)) return "bg-sky-100 text-sky-800";
  if (/בוטל/i.test(status)) return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-900";
}

export function CustomerOrderPortal() {
  const bootstrap = useOrderBootstrap();
  const inject = useInjectNewOrder();

  const [sessionReady, setSessionReady] = useState(false);
  const [customer, setCustomer] = useState<OrderCustomer | null>(null);
  const [locked, setLocked] = useState(false);

  const [phone, setPhone] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newContact, setNewContact] = useState("");

  const [tab, setTab] = useState<PortalTab>("order");
  const [step, setStep] = useState<OrderStep>(1);

  const [address, setAddress] = useState("");
  const [projectName, setProjectName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [unload, setUnload] = useState<UnloadMode>("forklift");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [paste, setPaste] = useState("");
  const [notes, setNotes] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [orderKind, setOrderKind] = useState<"new" | "update" | "duplicate">("new");
  const [result, setResult] = useState<InjectNewOrderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const s = loadPortalSession();
    if (s) {
      const c = sessionToCustomer(s);
      setCustomer(c);
      setLocked(true);
      setAddress(c.defaultSiteAddress || "");
      setContactName(c.contactName || c.name);
      setContactPhone(c.phones[0] || "");
      setPhone(c.phones[0] || "");
      setStep(2);
    }
    setSessionReady(true);
  }, []);

  const customers = bootstrap.data?.customers || [];
  const products = bootstrap.data?.products || [];

  const nameMatches = useMemo(
    () => findByNamePrefix(customers, nameQuery),
    [customers, nameQuery],
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 40);
    return products
      .filter((p) => {
        const hay = [p.sku, p.officialName, p.unit, ...(p.slangKeywords || [])]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 50);
  }, [products, search]);

  const autoDep = useMemo(() => computeAutoDeposits(lines), [lines]);
  const tons = useMemo(() => cartWeightTons(lines), [lines]);
  const warehouse = useMemo(() => recommendWarehouse(lines), [lines]);
  const driver = useMemo(() => driverForUnload(unload), [unload]);

  const ordersQ = useCustomerOrders(customer?.customerNo, locked);
  const notesQ = useCustomerDeliveryNotes(customer?.customerNo, locked);

  const lockCustomer = useCallback((c: OrderCustomer, phoneHint?: string) => {
    savePortalSession(c);
    setCustomer(c);
    setLocked(true);
    setAddress(c.defaultSiteAddress || "");
    setContactName(c.contactName || c.name);
    setContactPhone(phoneHint || c.phones[0] || "");
    setPhone(phoneHint || c.phones[0] || "");
    setStep(2);
    setTab("order");
    setError(null);
  }, []);

  const logout = () => {
    clearPortalSession();
    setCustomer(null);
    setLocked(false);
    setLines([]);
    setResult(null);
    setEditingOrderId(null);
    setOrderKind("new");
    setStep(1);
    setTab("order");
    setPhone("");
    setNameQuery("");
  };

  const addQty = (p: DictProduct, delta: number) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.product.sku === p.sku);
      if (i < 0) {
        if (delta <= 0) return prev;
        return [...prev, { key: p.sku, product: p, qty: delta }];
      }
      const next = [...prev];
      const q = next[i].qty + delta;
      if (q <= 0) return next.filter((_, idx) => idx !== i);
      next[i] = { ...next[i], qty: q };
      return next;
    });
  };

  const applyPaste = () => {
    const parsed = parseFreeTextList(paste, products);
    if (!parsed.length) {
      setError("לא זוהו מוצרים מהטקסט — נסו מק״ט או שם מהקטלוג");
      return;
    }
    setLines((prev) => {
      const map = new Map(prev.map((l) => [l.product.sku, l]));
      for (const row of parsed) {
        const existing = map.get(row.product.sku);
        if (existing) {
          map.set(row.product.sku, { ...existing, qty: existing.qty + row.qty });
        } else {
          map.set(row.product.sku, row);
        }
      }
      return Array.from(map.values());
    });
    setPaste("");
    setError(null);
  };

  const loadOrderIntoCart = (order: SheetOrder, mode: "duplicate" | "update") => {
    const built: CartLine[] = [];
    for (const it of order.items || []) {
      const p =
        products.find((x) => x.sku === it.sku) ||
        ({
          sku: it.sku || "—",
          officialName: it.name || it.catalogName || it.sku,
          unit: it.unit || "יח'",
          slangKeywords: [],
          deposit: "",
          weightKgPerUnit: it.weightKg || 0,
          defaultWarehouse: "החרש 10",
          recommendedDriver: "",
        } as DictProduct);
      built.push({ key: p.sku, product: p, qty: it.qty || 1 });
    }
    if (!built.length && order.itemsText) {
      const parsed = parseFreeTextList(order.itemsText, products);
      built.push(...parsed);
    }
    setLines(built);
    setAddress(order.address || customer?.defaultSiteAddress || "");
    setDeliveryDate(order.date?.slice?.(0, 10) || deliveryDate);
    setNotes(order.notes || "");
    setEditingOrderId(mode === "update" ? order.id : null);
    setOrderKind(mode === "update" ? "update" : "duplicate");
    setResult(null);
    setTab("order");
    setStep(2);
  };

  const buildWaText = (kind: "new" | "update" | "duplicate", orderId?: string) =>
    formatOrderWhatsApp({
      kind,
      orderId: orderId || editingOrderId || undefined,
      customerNo: customer?.customerNo || "500500",
      customerName: customer?.name || "",
      projectName,
      address,
      contactName: contactName || customer?.contactName || "",
      contactPhone: contactPhone || phone,
      deliveryDate,
      unloadLabel: UNLOAD_OPTIONS.find((o) => o.id === unload)?.label,
      weightTons: tons,
      lines: cartLinesToWa(lines),
      deposit60002: autoDep.d60002,
      deposit60060: autoDep.d60060,
      notes,
      changeSummary:
        kind === "update"
          ? `עריכת הזמנה ${editingOrderId || ""} — עדכון כמויות/פריטים טרם אספקה`
          : kind === "duplicate"
            ? `שכפול הזמנה קודמת${editingOrderId ? ` (${editingOrderId})` : ""}`
            : undefined,
    });

  const submitOrder = async () => {
    if (!customer) return;
    if (!lines.length) {
      setError("הוסיפו לפחות פריט אחד לסל");
      return;
    }
    if (!address.trim()) {
      setError("נא למלא כתובת אספקה");
      setStep(3);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const kind = orderKind;
      const noteParts = [
        notes.trim(),
        projectName.trim() ? `פרויקט: ${projectName.trim()}` : "",
        kind === "update" ? `עדכון הזמנה ${editingOrderId}` : "",
        kind === "duplicate" ? `שכפול הזמנה` : "",
        ...autoDep.notes,
      ].filter(Boolean);

      const res = await inject.mutateAsync({
        customerNo: customer.customerNo,
        customerName: customer.name,
        address: address.trim(),
        contactPhone: contactPhone.trim() || phone.trim() || customer.phones[0] || "",
        contactName: contactName.trim() || customer.contactName || customer.name,
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
      setResult({
        ...res,
        whatsappMessage: res.whatsappMessage || buildWaText(kind, res.orderId),
      });
      setStep(4);
      setOrderKind("new");
      setEditingOrderId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!sessionReady || bootstrap.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-[#164E78]" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin" />
        טוען פורטל לקוח…
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

  if (!locked || !customer) {
    return (
      <div className="min-h-dvh bg-[#F3F7FB] text-[#102A43]" dir="rtl">
        <header className="bg-gradient-to-l from-[#102A43] via-[#164E78] to-[#147D9C] px-4 py-6 text-white shadow-md">
          <div className="mx-auto max-w-lg">
            <p className="text-xs font-semibold opacity-80">ח. סבן חומרי בניין</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">פורטל הזמנות לקוח</h1>
            <p className="mt-1 text-sm opacity-90">זיהוי חד־פעמי · נעילה בדפדפן · הזמנה מאובטחת</p>
          </div>
        </header>

        <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
          <section className="rounded-2xl border border-[#DCE6EF] bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 font-extrabold">
              <Phone className="h-5 w-5 text-[#1769AA]" />
              כניסה עם נייד
            </h2>
            <p className="mt-1 text-xs text-[#486581]">הזינו מספר נייד הרשום במערכת</p>
            <div className="mt-3 flex gap-2">
              <input
                className="min-h-12 flex-1 rounded-xl border border-[#DCE6EF] px-3 text-base"
                inputMode="tel"
                placeholder="05X-XXX-XXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <button
                type="button"
                className="min-h-12 rounded-xl bg-[#102A43] px-4 font-bold text-white"
                onClick={() => {
                  const found = findByPhone(customers, phone);
                  if (!found) {
                    setError("לא נמצא לקוח עם מספר זה — נסו חיפוש לפי שם או לקוח חדש");
                    return;
                  }
                  lockCustomer(found, phone);
                }}
              >
                כניסה
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-[#DCE6EF] bg-white p-4 shadow-sm">
            <h2 className="flex items-center gap-2 font-extrabold">
              <Search className="h-5 w-5 text-[#1769AA]" />
              חיפוש לקוח קיים
            </h2>
            <p className="mt-1 text-xs text-[#486581]">הקלידו לפחות 3 אותיות משם הלקוח</p>
            <input
              className="mt-3 min-h-12 w-full rounded-xl border border-[#DCE6EF] px-3 text-base"
              placeholder="שם לקוח / מספר לקוח"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
            />
            {nameMatches.length > 0 && (
              <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                {nameMatches.map((c) => (
                  <li key={c.customerNo + c.name}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-xl border border-[#DCE6EF] px-3 py-3 text-right active:scale-[0.99]"
                      onClick={() => lockCustomer(c)}
                    >
                      <span>
                        <span className="block font-bold">{c.name}</span>
                        <span className="text-xs text-[#486581]">
                          {c.customerNo}
                          {c.phones[0] ? ` · ${c.phones[0]}` : ""}
                        </span>
                      </span>
                      <Lock className="h-4 w-4 text-[#1769AA]" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-dashed border-[#1769AA]/40 bg-white p-4">
            <button
              type="button"
              className="flex w-full items-center justify-between font-extrabold text-[#1769AA]"
              onClick={() => setShowNewCustomer((v) => !v)}
            >
              <span className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                לקוח חדש (קוד 500500)
              </span>
              <span className="text-sm">{showNewCustomer ? "סגור" : "פתח"}</span>
            </button>
            {showNewCustomer && (
              <div className="mt-3 space-y-2">
                <input
                  className="min-h-12 w-full rounded-xl border border-[#DCE6EF] px-3"
                  placeholder="שם לקוח / חברה *"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <input
                  className="min-h-12 w-full rounded-xl border border-[#DCE6EF] px-3"
                  placeholder="נייד איש קשר *"
                  inputMode="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
                <input
                  className="min-h-12 w-full rounded-xl border border-[#DCE6EF] px-3"
                  placeholder="כתובת אספקה"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                />
                <input
                  className="min-h-12 w-full rounded-xl border border-[#DCE6EF] px-3"
                  placeholder="שם איש קשר"
                  value={newContact}
                  onChange={(e) => setNewContact(e.target.value)}
                />
                <button
                  type="button"
                  className="min-h-12 w-full rounded-xl bg-[#147D9C] font-bold text-white"
                  onClick={() => {
                    if (!newName.trim() || onlyDigits(newPhone).length < 9) {
                      setError("שם ונייד חובה ללקוח חדש");
                      return;
                    }
                    const c: OrderCustomer = {
                      customerNo: "500500",
                      name: newName.trim(),
                      aliases: [],
                      phones: [newPhone.trim()],
                      contactName: newContact.trim() || newName.trim(),
                      defaultSiteAddress: newAddress.trim(),
                      typicalUnloadType: "",
                      recommendedTruck: "",
                      masterId: "",
                      comaxPrimaryNo: "500500",
                      comaxLinkedIds: [],
                      driveFolderUrl: "",
                      sites: [],
                      isPendingComax: true,
                    };
                    lockCustomer(c, newPhone.trim());
                  }}
                >
                  שמירת כרטיס ונעילה
                </button>
              </div>
            )}
          </section>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
              {error}
            </div>
          )}
        </main>
      </div>
    );
  }

  const stepLabels = ["לקוח", "מוצרים", "אספקה", "אישור"];
  const progressPct = (step / 4) * 100;

  return (
    <div className="min-h-dvh bg-[#F3F7FB] pb-28 text-[#102A43]" dir="rtl">
      <header className="sticky top-0 z-30 border-b border-[#DCE6EF] bg-gradient-to-l from-[#102A43] via-[#164E78] to-[#147D9C] text-white shadow-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold opacity-90">פורטל לקוח · נעול</p>
            <h1 className="truncate text-lg font-extrabold">{customer.name}</h1>
            <p className="text-[11px] opacity-80">
              {customer.customerNo}
              {customer.isPendingComax ? " · ממתין לקומקס" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-white/30 px-3 text-xs font-bold"
          >
            <LogOut className="h-4 w-4" />
            יציאה
          </button>
        </div>

        {tab === "order" && (
          <div className="mx-auto max-w-3xl px-4 pb-3">
            <div className="h-2 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-emerald-300 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] font-bold opacity-95">
              {stepLabels.map((label, i) => (
                <span key={label} className={cn(step === i + 1 && "text-emerald-200")}>
                  {i + 1}. {label}
                </span>
              ))}
            </div>
            {orderKind !== "new" && (
              <p className="mt-2 rounded-lg bg-white/15 px-2 py-1 text-[11px] font-bold">
                {orderKind === "update" ? `עריכת הזמנה ${editingOrderId}` : "מצב שכפול הזמנה"}
              </p>
            )}
          </div>
        )}

        <div className="mx-auto flex max-w-3xl gap-1 px-3 pb-2">
          {(
            [
              { id: "order" as const, label: "הזמנה", icon: PackagePlus },
              { id: "history" as const, label: "היסטוריה", icon: History },
              { id: "notes" as const, label: "תעודות", icon: FileText },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-t-xl px-2 py-2 text-xs font-bold",
                tab === t.id ? "bg-white text-[#102A43]" : "bg-white/10 text-white",
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        {tab === "history" && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-extrabold">
              <ClipboardList className="h-5 w-5 text-[#1769AA]" />
              היסטוריית הזמנות
            </h2>
            {ordersQ.isLoading && (
              <div className="flex items-center gap-2 text-sm text-[#486581]">
                <Loader2 className="h-4 w-4 animate-spin" /> טוען הזמנות…
              </div>
            )}
            {ordersQ.isError && <p className="text-sm text-red-700">לא ניתן לטעון הזמנות כרגע</p>}
            {!ordersQ.isLoading && (ordersQ.data?.length || 0) === 0 && (
              <p className="rounded-xl border border-[#DCE6EF] bg-white p-4 text-sm text-[#486581]">
                אין הזמנות שמורות תחת הלקוח הזה עדיין.
              </p>
            )}
            {(ordersQ.data || []).map((o) => {
              const editable = isOrderEditable(o.status);
              return (
                <article key={o.id} className="rounded-2xl border border-[#DCE6EF] bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-extrabold">#{o.id}</p>
                      <p className="text-xs text-[#486581]">
                        {o.date || o.receivedDate || "—"} · {o.address || "ללא כתובת"}
                      </p>
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", statusBadgeClass(o.status))}>
                      {o.status || "פתוחה"}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm">{o.itemsText || `${o.items?.length || 0} פריטים`}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-[#DCE6EF] px-3 text-xs font-bold"
                      onClick={() => loadOrderIntoCart(o, "duplicate")}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      שכפול
                    </button>
                    {editable && (
                      <button
                        type="button"
                        className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-[#102A43] px-3 text-xs font-bold text-white"
                        onClick={() => loadOrderIntoCart(o, "update")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        עריכה
                      </button>
                    )}
                    <a
                      className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-[#25D366] px-3 text-xs font-bold text-[#128C7E]"
                      href={waMeHref(
                        formatOrderWhatsApp({
                          kind: "update",
                          orderId: o.id,
                          customerNo: customer.customerNo,
                          customerName: customer.name,
                          address: o.address,
                          contactName: contactName,
                          contactPhone: contactPhone || phone,
                          deliveryDate: o.date,
                          lines: (o.items || []).map((it) => ({
                            sku: it.sku,
                            name: it.name || it.catalogName,
                            qty: it.qty,
                            unit: it.unit,
                          })),
                          notes: o.notes,
                          changeSummary: "בקשת עדכון / תזכורת מהפורטל",
                        }),
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      וואטסאפ
                    </a>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {tab === "notes" && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-extrabold">
              <FileText className="h-5 w-5 text-[#1769AA]" />
              תעודות משלוח (מגליה)
            </h2>
            <p className="text-xs text-[#486581]">
              מוצגות תעודות שנסרקו לארכיון_תעודות_גליה ומשויכות למספר הלקוח.
            </p>
            {notesQ.isLoading && (
              <div className="flex items-center gap-2 text-sm text-[#486581]">
                <Loader2 className="h-4 w-4 animate-spin" /> טוען תעודות…
              </div>
            )}
            {!notesQ.isLoading && (notesQ.data?.length || 0) === 0 && (
              <p className="rounded-xl border border-[#DCE6EF] bg-white p-4 text-sm text-[#486581]">
                אין עדיין תעודות משלוח בגיליון עבור הלקוח.
              </p>
            )}
            {(notesQ.data || []).map((n) => (
              <article key={n.id + n.dateIso} className="rounded-2xl border border-[#DCE6EF] bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-extrabold">תעודה {n.id || "—"}</p>
                    <p className="text-xs text-[#486581]">
                      {n.dateIso || "—"} · {n.driver || "נהג לא צוין"}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#F0F4F8] px-2 py-0.5 text-[11px] font-bold">
                    {n.status || "ארכיון"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[#243B53]">{n.address}</p>
                <p className="mt-1 line-clamp-3 text-xs text-[#486581]">{n.itemsText}</p>
                {n.depositsText && (
                  <p className="mt-1 text-xs font-semibold text-amber-800">פקדונות: {n.depositsText}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {n.driveUrl && (
                    <a
                      href={n.driveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center rounded-xl bg-[#102A43] px-3 text-xs font-bold text-white"
                    >
                      צפייה בתעודה
                    </a>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}

        {tab === "order" && (
          <>
            {step === 2 && (
              <section className="space-y-3">
                <div className="rounded-2xl border border-[#DCE6EF] bg-white p-3 shadow-sm">
                  <div className="relative">
                    <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9FB3C8]" />
                    <input
                      className="min-h-12 w-full rounded-xl border border-[#DCE6EF] pr-10 pl-3 text-base"
                      placeholder="חיפוש מק״ט / שם / סלנג…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
                    {QUICK_HINTS.map((h) => (
                      <button
                        key={h}
                        type="button"
                        className="shrink-0 rounded-full border border-[#DCE6EF] px-3 py-1 text-xs font-bold"
                        onClick={() => setSearch(h)}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  {filteredProducts.map((p) => (
                    <div
                      key={p.sku}
                      className="flex items-center gap-2 rounded-2xl border border-[#DCE6EF] bg-white px-3 py-2 shadow-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-extrabold">{p.officialName}</p>
                        <p className="text-[11px] text-[#486581]">
                          <span dir="ltr">{p.sku}</span> · {p.unit}
                          {p.weightKgPerUnit ? ` · ${p.weightKgPerUnit} ק״ג` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="min-h-11 rounded-xl bg-[#102A43] px-3 text-xs font-extrabold text-white"
                        onClick={() => addQty(p, stepQty(p))}
                      >
                        +{stepQty(p)}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-[#DCE6EF] bg-white p-3">
                  <p className="text-xs font-bold text-[#486581]">הדבקת רשימה חופשית</p>
                  <textarea
                    className="mt-1 min-h-[4.5rem] w-full rounded-xl border border-[#DCE6EF] px-3 py-2 text-sm"
                    placeholder={"לדוגמה:\n20 מלט\n10 בלוק 10"}
                    value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                  />
                  <button
                    type="button"
                    className="mt-2 min-h-11 w-full rounded-xl border border-[#1769AA] text-sm font-bold text-[#1769AA]"
                    onClick={applyPaste}
                  >
                    הוסף מהטקסט
                  </button>
                </div>

                <div className="rounded-2xl border border-[#DCE6EF] bg-white p-3 shadow-sm">
                  <h3 className="flex items-center gap-2 font-extrabold">
                    <Package className="h-4 w-4" />
                    סל ({lines.length})
                  </h3>
                  {lines.length === 0 && (
                    <p className="mt-2 text-sm text-[#486581]">הסל ריק — הוסיפו מוצרים</p>
                  )}
                  <ul className="mt-2 space-y-2">
                    {lines.map((l) => (
                      <li key={l.key} className="flex items-center gap-2 rounded-xl border border-[#F0F4F8] px-2 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{l.product.officialName}</p>
                          <p className="text-[11px] text-[#486581]" dir="ltr">
                            {l.product.sku}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="min-h-11 min-w-11 rounded-xl border font-bold"
                          onClick={() => addQty(l.product, -stepQty(l.product))}
                        >
                          −
                        </button>
                        <span className="min-w-[2rem] text-center font-extrabold">{l.qty}</span>
                        <button
                          type="button"
                          className="min-h-11 min-w-11 rounded-xl bg-[#102A43] font-bold text-white"
                          onClick={() => addQty(l.product, stepQty(l.product))}
                        >
                          +
                        </button>
                      </li>
                    ))}
                  </ul>
                  {(autoDep.d60002 > 0 || autoDep.d60060 > 0) && (
                    <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950">
                      {autoDep.notes.map((n) => (
                        <div key={n}>{n}</div>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between text-sm font-bold">
                    <span className="flex items-center gap-1 text-[#164E78]">
                      <Truck className="h-4 w-4" />
                      {vehicleLabel(unload, tons)}
                    </span>
                    <span>{tons.toFixed(2)} ט׳</span>
                  </div>
                </div>
              </section>
            )}

            {step === 3 && (
              <section className="space-y-3 rounded-2xl border border-[#DCE6EF] bg-white p-4 shadow-sm">
                <h2 className="font-extrabold">פרטי אספקה</h2>
                <label className="block text-xs font-bold text-[#486581]">
                  כתובת אספקה *
                  <input
                    className="mt-1 min-h-12 w-full rounded-xl border border-[#DCE6EF] px-3 text-base"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </label>
                <label className="block text-xs font-bold text-[#486581]">
                  שם פרויקט (אופציונלי)
                  <input
                    className="mt-1 min-h-12 w-full rounded-xl border border-[#DCE6EF] px-3 text-base"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                  />
                </label>
                <label className="block text-xs font-bold text-[#486581]">
                  איש קשר
                  <input
                    className="mt-1 min-h-12 w-full rounded-xl border border-[#DCE6EF] px-3 text-base"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                </label>
                <label className="block text-xs font-bold text-[#486581]">
                  נייד איש קשר
                  <input
                    className="mt-1 min-h-12 w-full rounded-xl border border-[#DCE6EF] px-3 text-base"
                    inputMode="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                  />
                </label>
                <label className="block text-xs font-bold text-[#486581]">
                  תאריך מבוקש
                  <input
                    type="date"
                    className="mt-1 min-h-12 w-full rounded-xl border border-[#DCE6EF] px-3 text-base"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                  />
                </label>
                <div>
                  <p className="text-xs font-bold text-[#486581]">סוג פריקה</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {UNLOAD_OPTIONS.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setUnload(o.id)}
                        className={cn(
                          "min-h-14 rounded-2xl border px-3 py-3 text-right text-sm font-bold transition active:scale-[0.98]",
                          unload === o.id
                            ? "border-[#1769AA] bg-[#E6F6FF] text-[#0B6E99]"
                            : "border-[#DCE6EF] bg-white",
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block text-xs font-bold text-[#486581]">
                  הערות
                  <textarea
                    className="mt-1 min-h-[3.5rem] w-full rounded-xl border border-[#DCE6EF] px-3 py-2 text-base"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
              </section>
            )}

            {step === 4 && (
              <section className="space-y-3">
                {result ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
                    <div className="flex items-center gap-2 font-extrabold">
                      <Check className="h-5 w-5" />
                      ההזמנה נשלחה בהצלחה
                    </div>
                    <p className="mt-1 text-sm">
                      מס׳ {result.orderId || "—"} · שורה {result.rowNumber}
                    </p>
                    <a
                      className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] font-bold text-white"
                      href={waMeHref(result.whatsappMessage || buildWaText("new", result.orderId))}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle className="h-5 w-5" />
                      שליחה לקבוצת הזמנות בוואטסאפ
                    </a>
                    <button
                      type="button"
                      className="mt-2 min-h-11 w-full rounded-xl border border-emerald-300 text-sm font-bold"
                      onClick={() => {
                        setResult(null);
                        setLines([]);
                        setStep(2);
                        setOrderKind("new");
                      }}
                    >
                      הזמנה נוספת
                    </button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[#DCE6EF] bg-white p-4 shadow-sm">
                    <h2 className="font-extrabold">אישור סופי</h2>
                    <pre
                      className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-[#F0F4F8] p-3 text-xs leading-relaxed"
                      dir="rtl"
                    >
                      {buildWaText(orderKind)}
                    </pre>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => void submitOrder()}
                      className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#102A43] font-extrabold text-white disabled:opacity-50"
                    >
                      {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                      שליחה סופית למערכת
                    </button>
                  </div>
                )}
              </section>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
                {error}
                <button type="button" className="mr-2 inline" onClick={() => setError(null)}>
                  <X className="inline h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {tab === "order" && step < 4 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#DCE6EF] bg-white/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto flex max-w-3xl gap-2">
            {step > 2 && (
              <button
                type="button"
                className="min-h-12 rounded-xl border border-[#DCE6EF] px-4 font-bold"
                onClick={() => setStep((s) => (s > 1 ? ((s - 1) as OrderStep) : s))}
              >
                חזרה
              </button>
            )}
            <div className="flex min-w-0 flex-1 flex-col justify-center text-[11px] font-bold text-[#486581]">
              <span>
                {lines.length} פריטים · {tons.toFixed(2)} ט׳
              </span>
              {(autoDep.d60002 > 0 || autoDep.d60060 > 0) && (
                <span className="truncate text-amber-800">
                  פקדונות: {autoDep.d60002 ? `${autoDep.d60002}×60002 ` : ""}
                  {autoDep.d60060 ? `${autoDep.d60060}×60060` : ""}
                </span>
              )}
            </div>
            <button
              type="button"
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#102A43] text-base font-extrabold text-white disabled:opacity-40"
              disabled={step === 2 && lines.length === 0}
              onClick={() => {
                if (step === 2) setStep(3);
                else if (step === 3) setStep(4);
              }}
            >
              {step === 2 ? "המשך לאספקה" : "לאישור"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
