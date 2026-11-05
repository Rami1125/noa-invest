/**
 * NOA AI — ENTERPRISE CONTROL & DISPATCH CONSOLE (v4.0 Professional)
 * ארגון: ח. סבן חומרי בניין (1994) בע"מ | סניף התלמיד 6 הוד השרון
 *
 * תכונות מרכזיות:
 * 1. זיהוי לקוח דינמי (Typeahead) החל מ-2 אותיות מתוך מאגר הלקוחות (קומקס).
 * 2. השלמה אוטומטית של טלפון, פרויקט/אתר פעיל, נהג מועדף וקישור ישיר לתיקיית דרייב.
 * 3. כרטיס הזמנה חי ודינמי עם מד עומס משאית, חישוב משקל בטונות ופיקדונות משטחים/בלות בזמן אמת.
 * 4. טבלת הזמנות חיה של כלל ההזמנות שטרם סופקו (ממתין לשיבוץ, בהעמסה, בדרך).
 * 5. ניהול קטלוג מוצרים, איתור תעודות משלוח ודשבורד בירורי הנהלה.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Boxes,
  CheckCircle2,
  Clock,
  Clock3,
  ExternalLink,
  FileText,
  FolderOpen,
  Layers,
  Loader2,
  MapPin,
  Navigation,
  Package,
  PackagePlus,
  Phone,
  Plus,
  RefreshCw,
  Scale,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Truck,
  UserCheck,
  UserRound,
  UserX,
  Warehouse,
  Weight,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

import {
  previewOrder,
  injectOrder,
  lookupCatalog,
  getDeliveryNote,
  getInquiriesStats,
  estimateDepositsLocal,
  type CatalogItem,
  type OrderLineInput,
  type DeliveryNoteResult,
  type InquiriesStats,
  SABAN_GATEWAY,
  GatewayError,
} from "@/lib/saban-gateway";

import { listOrdersFn, updateOrderStatusFn, type SheetOrder } from "@/lib/orders.functions";
import { searchCustomersFn, listCustomersFn, type LiveCustomer } from "@/lib/customers.functions";

export const Route = createFileRoute("/noa-console")({
  head: () => ({
    meta: [{ title: "קונסולת ניהול וסידור · נועה AI · ח. סבן" }],
  }),
  component: NoaEnterpriseConsole,
});

type Tab = "orders" | "pending_dispatch" | "notes" | "catalog" | "management";

type OrderForm = {
  customer: string;
  customerNo: string;
  phone: string;
  address: string;
  selectedProject: string;
  driveFolderUrl: string;
  isVerifiedCustomer: boolean;
  unloadType: "crane" | "manual" | "forklift";
  requestedDate: string;
  requestedWindow: string;
  contactName: string;
  driverNotes: string;
};

const EMPTY_ORDER: OrderForm = {
  customer: "",
  customerNo: "",
  phone: "",
  address: "",
  selectedProject: "",
  driveFolderUrl: "",
  isVerifiedCustomer: false,
  unloadType: "crane",
  requestedDate: "מחר בבוקר",
  requestedWindow: "07:00 - 10:00",
  contactName: "",
  driverNotes: "",
};

const TABS: { id: Tab; label: string; hint: string; icon: typeof Package; badge?: string }[] = [
  { id: "orders", label: "הזמנה חדשה", hint: "הקלדה, תצוגה מקדימה ושידור", icon: PackagePlus },
  { id: "pending_dispatch", label: "הזמנות בסידור", hint: "שטרם סופקו", icon: Clock, badge: "חי" },
  { id: "notes", label: "ארכיון תעודות", hint: "איתור ו-PDF מדרייב", icon: FileText },
  { id: "catalog", label: "קטלוג לוגיסטי", hint: "2,365 פריטים ומדיה", icon: Boxes },
  { id: "management", label: "בקרת הנהלה", hint: "בירורי הראל וראמי", icon: ShieldCheck },
];

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const p = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(p) ? p : 0;
}

export function NoaEnterpriseConsole() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("orders");

  // --- Order Form State ---
  const [order, setOrder] = useState<OrderForm>(EMPTY_ORDER);
  const [lines, setLines] = useState<OrderLineInput[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [injectBusy, setInjectBusy] = useState(false);
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);

  // --- Customer Typeahead Search State ---
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // --- Delivery Notes Tab State ---
  const [noteQuery, setNoteQuery] = useState("6715848");
  const [notePhone, setNotePhone] = useState(SABAN_GATEWAY.managers.rami.phone);
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteResult, setNoteResult] = useState<DeliveryNoteResult | null>(null);

  // --- Catalog Tab State ---
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  // --- Management Tab State ---
  const [managerPhone, setManagerPhone] = useState(SABAN_GATEWAY.managers.rami.phone);
  const [inquiries, setInquiries] = useState<InquiriesStats | null>(null);
  const [inquiriesLoading, setInquiriesLoading] = useState(false);

  // =========================================================================
  // Queries
  // =========================================================================

  // 1. Customer Typeahead Query (>= 2 chars)
  const customersQuery = useQuery({
    queryKey: ["customers-typeahead", customerSearch.trim()],
    queryFn: () => searchCustomersFn({ data: { query: customerSearch.trim() } }),
    enabled: customerSearch.trim().length >= 2,
    staleTime: 60_000,
  });

  const customerSuggestions = useMemo(() => {
    return customersQuery.data?.customers || [];
  }, [customersQuery.data]);

  // 2. Products Query for New Order
  const productsQuery = useQuery({
    queryKey: ["noa-products-search", productSearch.trim()],
    queryFn: () => lookupCatalog(productSearch.trim()),
    enabled: tab === "orders" && productSearch.trim().length >= 2,
    staleTime: 60_000,
  });

  const productSuggestions = useMemo(() => {
    const raw = productsQuery.data?.items || productsQuery.data?.products || [];
    return raw as CatalogItem[];
  }, [productsQuery.data]);

  // 3. Active Orders Query (Non-Delivered Orders for Table)
  const ordersQuery = useQuery({
    queryKey: ["active-sheet-orders"],
    queryFn: () => listOrdersFn(),
    staleTime: 30_000,
    refetchInterval: 45_000,
  });

  const pendingOrders = useMemo(() => {
    const all = ordersQuery.data?.orders || [];
    return all.filter((o) => {
      const st = (o.status || "").trim();
      return st !== "סופק" && st !== "בוטל";
    });
  }, [ordersQuery.data]);

  // =========================================================================
  // Real-time Dynamic Metrics for Order
  // =========================================================================
  const orderMetrics = useMemo(() => {
    const totalWeightKg = lines.reduce(
      (acc, l) => acc + (Number(l.weightKg) || 25) * (Number(l.qty) || 0),
      0
    );
    const weightTons = Number((totalWeightKg / 1000).toFixed(2));
    const deposits = estimateDepositsLocal(lines, 40);

    const requiresHeavyYard =
      lines.some((l) => {
        const name = (l.name || "").toLowerCase();
        return (
          name.includes("בלה") ||
          name.includes("חול") ||
          name.includes("מלט") ||
          name.includes("סומסום") ||
          name.includes("טיט")
        );
      }) || order.unloadType === "crane";

    const recommendedYard = requiresHeavyYard
      ? "🏭 4 החרש (מגרש לוגיסטי כבד)"
      : "🏪 1 התלמיד (סניף שירות וקהל)";

    const truckCapacityMax = order.unloadType === "crane" ? 15.0 : 4.5;
    const loadPercentage = Math.min(100, Math.round((weightTons / truckCapacityMax) * 100));

    return {
      totalWeightKg,
      weightTons,
      deposits,
      recommendedYard,
      truckCapacityMax,
      loadPercentage,
      isOverweight: weightTons > truckCapacityMax,
    };
  }, [lines, order.unloadType]);

  // =========================================================================
  // Handlers
  // =========================================================================

  const handleSelectCustomer = (c: LiveCustomer) => {
    const defaultAddr = c.address || (c.addresses && c.addresses[0]) || "";
    setOrder((curr) => ({
      ...curr,
      customer: c.name,
      customerNo: c.customerNo,
      phone: c.phone || curr.phone,
      address: defaultAddr || curr.address,
      selectedProject: defaultAddr,
      driveFolderUrl: c.sampleDriveUrl || "",
      isVerifiedCustomer: true,
      contactName: c.name,
    }));
    setCustomerSearch(c.name);
    setShowCustomerDropdown(false);
    toast.success(`נבחר לקוח מאומת: ${c.name}`, {
      description: `מספר קומקס: ${c.customerNo} | אתר ברירת מחדל: ${defaultAddr || "טרם הוגדר"}`,
    });
  };

  const handleCustomerInputChange = (val: string) => {
    setCustomerSearch(val);
    setOrder((curr) => ({
      ...curr,
      customer: val,
      isVerifiedCustomer: false,
    }));
    if (val.trim().length >= 2) {
      setShowCustomerDropdown(true);
    } else {
      setShowCustomerDropdown(false);
    }
  };

  const addProductToCart = (item: CatalogItem) => {
    setLines((curr) => {
      const existing = curr.find((l) => l.sku === item.sku);
      if (existing) {
        return curr.map((l) => (l.sku === item.sku ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...curr,
        {
          sku: item.sku,
          name: item.name,
          unit: item.unit || "יח",
          qty: 1,
          weightKg: item.weightKg || 25,
        },
      ];
    });
    setProductSearch("");
    toast.info(`נוסף לסל: ${item.name}`);
  };

  const updateLineQty = (sku: string, delta: number) => {
    setLines((curr) =>
      curr
        .map((l) => (l.sku === sku ? { ...l, qty: Math.max(0, l.qty + delta) } : l))
        .filter((l) => l.qty > 0)
    );
  };

  const removeLine = (sku: string) => {
    setLines((curr) => curr.filter((l) => l.sku !== sku));
  };

  const handlePreviewOrder = async () => {
    if (!order.customer.trim()) {
      toast.error("נדרש שם לקוח");
      return;
    }
    if (!order.address.trim()) {
      toast.error("נדרשת כתובת אספקה מלאה");
      return;
    }
    if (lines.length === 0) {
      toast.error("סל המוצרים ריק");
      return;
    }

    setPreviewBusy(true);
    try {
      const res = await previewOrder({ items: lines });
      toast.success("תצוגה מקדימה אומתה מול השרת", {
        description: `משקל: ${res.totalWeightTons ?? orderMetrics.weightTons} טון | פקדונות חושבו לפי הספים.`,
      });
    } catch (e: any) {
      toast.error("כשל באימות תצוגה מקדימה", { description: e.message });
    } finally {
      setPreviewBusy(false);
    }
  };

  const handleInjectOrder = async () => {
    if (!order.customer.trim() || !order.address.trim() || lines.length === 0) {
      toast.error("נא למלא פרטי לקוח, יעד ומוצרים");
      return;
    }

    setInjectBusy(true);
    setReceipt(null);
    try {
      const res = await injectOrder({
        customerName: order.customer,
        phone: order.phone || "050-0000000",
        address: order.address,
        unloadingType:
          order.unloadType === "crane"
            ? "מנוף"
            : order.unloadType === "forklift"
            ? "מלגזה באתר"
            : "ידני",
        requestedTime: order.requestedDate + " (" + order.requestedWindow + ")",
        contactName: order.contactName || order.customer,
        notes: `קומקס: ${order.customerNo || "חדש"} | ${order.driverNotes}`.trim(),
        items: lines,
      });

      setReceipt(res);
      toast.success("ההזמנה נקלטה בהצלחה בגיליון!", {
        description: `שורה חדשה בטאב 'הזמנות'. סטטוס: ממתין לשיבוץ משאית.`,
      });

      queryClient.invalidateQueries({ queryKey: ["active-sheet-orders"] });
      setLines([]);
    } catch (e: any) {
      toast.error("כשל בהזרקת הזמנה", { description: e.message });
    } finally {
      setInjectBusy(false);
    }
  };

  const handleSearchDeliveryNote = async () => {
    if (!noteQuery.trim()) {
      toast.error("הזינו מספר תעודה");
      return;
    }
    setNoteLoading(true);
    setNoteResult(null);
    try {
      const res = await getDeliveryNote(noteQuery.trim(), notePhone.trim());
      setNoteResult(res);
      toast.success(`אותרה תעודה ${noteQuery}`);
    } catch (e: any) {
      toast.error("איתור תעודה נכשל", { description: e.message });
    } finally {
      setNoteLoading(false);
    }
  };

  const handleLoadInquiries = async () => {
    if (!managerPhone.trim()) {
      toast.error("נדרש מספר טלפון מאומת של הראל או ראמי");
      return;
    }
    setInquiriesLoading(true);
    try {
      const res = await getInquiriesStats(managerPhone.trim());
      setInquiries(res);
      toast.success("בירורים נשלפו בהצלחה");
    } catch (e: any) {
      toast.error("שליפת בירורים נכשלה", { description: e.message });
    } finally {
      setInquiriesLoading(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-full bg-slate-50/50 pb-16 font-sans">
      <PageHeader
        title="קונסולת ניהול וסידור · נועה AI"
        subtitle="ח. סבן חומרי בניין (1994) בע״מ | הוד השרון"
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8">
        {/* Banner עליון ממותג */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-xl md:p-8">
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-cyan-300">
                <BadgeCheck className="h-4 w-4" />
                NOA AI ENTERPRISE DISPATCH CORE v4.0
              </div>
              <h1 className="mt-2 text-2xl font-black md:text-3xl">
                מרכז שליטה לוגיסטי והזרקת הזמנות
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-300">
                זיהוי לקוחות מהיר ממאגר קומקס, איתור פרויקטים, כרטיס סידור חי ומד עומס למשאית מנוף בזמן אמת.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center backdrop-blur">
                <span className="block text-xs text-slate-400">הזמנות פתוחות להיום</span>
                <span className="text-2xl font-black text-cyan-400">{pendingOrders.length}</span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center backdrop-blur">
                <span className="block text-xs text-slate-400">משאית מנוף</span>
                <span className="text-sm font-bold text-emerald-400">חכמת (615-41-002)</span>
              </div>
            </div>
          </div>
        </section>

        {/* Navigation Tabs */}
        <nav aria-label="tabs" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {TABS.map(({ id, label, hint, icon: Icon, badge }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`relative flex min-h-16 items-center gap-3 rounded-2xl border p-3 text-right transition ${
                tab === id
                  ? "border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                  : "border-border/70 bg-card hover:border-primary/40 text-foreground"
              }`}
            >
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                  tab === id ? "bg-white/20 text-white" : "bg-primary/10 text-primary"
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-black">
                  {label}
                  {badge && (
                    <span className="rounded-md bg-amber-400 px-1 py-0.5 text-[10px] font-bold text-slate-950">
                      {badge}
                    </span>
                  )}
                </span>
                <span className="block truncate text-[11px] opacity-80">{hint}</span>
              </span>
            </button>
          ))}
        </nav>

        {/* ================================================================= */}
        {/* TAB 1: NEW ORDER CONSOLE & LIVE DISPATCH CARD */}
        {/* ================================================================= */}
        {tab === "orders" && (
          <div className="grid gap-6 lg:grid-cols-12">
            {/* צד ימין: טופס הזמנה מתקדם עם Typeahead */}
            <div className="space-y-6 lg:col-span-7">
              <Card className="rounded-3xl border-border/80 bg-white p-5 shadow-sm md:p-7">
                <div className="mb-4 flex items-center justify-between border-b pb-4">
                  <div>
                    <h2 className="text-lg font-black text-slate-900">פרטי לקוח ויעד אספקה</h2>
                    <p className="text-xs text-muted-foreground">
                      הקלד 2 אותיות לזיהוי אוטומטי מקומקס ושליפת פרויקט
                    </p>
                  </div>
                  {order.isVerifiedCustomer ? (
                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                      <UserCheck className="ml-1 h-3.5 w-3.5" />
                      לקוח מאומת (קומקס #{order.customerNo})
                    </Badge>
                  ) : order.customer.length >= 2 ? (
                    <Badge variant="outline" className="border-amber-500 text-amber-700">
                      <UserX className="ml-1 h-3.5 w-3.5" />
                      לקוח חדש / לא מזוהה
                    </Badge>
                  ) : null}
                </div>

                <div className="space-y-4">
                  {/* שדה לקוח Typeahead */}
                  <div className="relative">
                    <label className="block text-xs font-black text-slate-700 mb-1">
                      שם לקוח / חברה (חיפוש החל מ-2 אותיות) *
                    </label>
                    <div className="relative">
                      <Search className="absolute right-3.5 top-3 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={customerSearch}
                        onChange={(e) => handleCustomerInputChange(e.target.value)}
                        onFocus={() => customerSearch.length >= 2 && setShowCustomerDropdown(true)}
                        placeholder="למשל: לי-רן, אבי ניסים, ערוגת הבשם, בראשית..."
                        className="h-11 w-full rounded-xl border border-slate-300 bg-white pr-10 pl-3 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                      />
                    </div>

                    {/* רשימת תוצאות Typeahead */}
                    {showCustomerDropdown && customerSuggestions.length > 0 && (
                      <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl">
                        <div className="px-2 py-1 text-[11px] font-bold text-muted-foreground">
                          לקוחות תואמים ממאגר קומקס:
                        </div>
                        {customerSuggestions.map((c) => (
                          <button
                            type="button"
                            key={c.customerNo || c.id}
                            onClick={() => handleSelectCustomer(c)}
                            className="flex w-full items-start justify-between rounded-xl p-2.5 text-right transition hover:bg-blue-50/80"
                          >
                            <div>
                              <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                                <UserRound className="h-3.5 w-3.5 text-blue-600" />
                                {c.name}
                              </div>
                              <div className="text-xs text-slate-500">
                                קומקס: #{c.customerNo} {c.phone && `· 📞 ${c.phone}`}
                              </div>
                              {c.address && (
                                <div className="text-xs text-blue-700 font-medium mt-0.5">
                                  📍 אתר: {c.address}
                                </div>
                              )}
                            </div>
                            <Badge variant="secondary" className="text-[10px]">
                              בחר לקוח
                            </Badge>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* טלפון ואיש קשר */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1">
                        טלפון נייד לתיאום *
                      </label>
                      <input
                        type="text"
                        value={order.phone}
                        onChange={(e) => setOrder((o) => ({ ...o, phone: e.target.value }))}
                        placeholder="050-0000000"
                        className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1">
                        איש קשר באתר
                      </label>
                      <input
                        type="text"
                        value={order.contactName}
                        onChange={(e) => setOrder((o) => ({ ...o, contactName: e.target.value }))}
                        placeholder="שם מקבל הסחורה"
                        className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* כתובת יעד וקישור לתיקיית דרייב */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-black text-slate-700">
                        כתובת אספקה מלאה (רחוב ועיר) *
                      </label>
                      {order.driveFolderUrl && (
                        <a
                          href={order.driveFolderUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          פתח תיקיית לקוח ב-Drive
                        </a>
                      )}
                    </div>
                    <input
                      type="text"
                      value={order.address}
                      onChange={(e) => setOrder((o) => ({ ...o, address: e.target.value }))}
                      placeholder="למשל: באר גנים 78, אבן יהודה"
                      className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  {/* סוג פריקה ומועד אספקה */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1">
                        אופן פריקה *
                      </label>
                      <select
                        value={order.unloadType}
                        onChange={(e) =>
                          setOrder((o) => ({ ...o, unloadType: e.target.value as any }))
                        }
                        className="h-11 w-full rounded-xl border border-slate-300 bg-white px-2 text-sm focus:border-blue-600 focus:outline-none"
                      >
                        <option value="crane">🏗️ מנוף (מרצדס 15ט')</option>
                        <option value="forklift">🚜 מלגזה באתר</option>
                        <option value="manual">📦 ידני / טנדר</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1">
                        מועד מבוקש
                      </label>
                      <input
                        type="text"
                        value={order.requestedDate}
                        onChange={(e) => setOrder((o) => ({ ...o, requestedDate: e.target.value }))}
                        placeholder="מחר בבוקר / תאריך"
                        className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-700 mb-1">
                        חלון פריקה
                      </label>
                      <input
                        type="text"
                        value={order.requestedWindow}
                        onChange={(e) => setOrder((o) => ({ ...o, requestedWindow: e.target.value }))}
                        placeholder="07:00 - 10:00"
                        className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* הוספת מוצרים מהקטלוג */}
                  <div className="border-t pt-4">
                    <label className="block text-xs font-black text-slate-700 mb-1">
                      הוסף מוצרים מהמילון הלוגיסטי (2,365 מק״טים)
                    </label>
                    <div className="relative">
                      <Search className="absolute right-3.5 top-3 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="הקלד מק״ט או מילת סלנג (מלט, חול, סומסום, בלוק, ניצב...)"
                        className="h-11 w-full rounded-xl border border-slate-300 bg-white pr-10 pl-3 text-sm focus:border-blue-600 focus:outline-none"
                      />
                    </div>

                    {productsQuery.isFetching && (
                      <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> מחפש בקטלוג...
                      </div>
                    )}

                    {productSuggestions.length > 0 && (
                      <div className="mt-2 max-h-52 overflow-auto rounded-xl border bg-white p-1 shadow-md">
                        {productSuggestions.slice(0, 10).map((p) => (
                          <button
                            type="button"
                            key={p.sku}
                            onClick={() => addProductToCart(p)}
                            className="flex w-full items-center justify-between border-b p-2 text-right last:border-0 hover:bg-slate-50"
                          >
                            <div className="min-w-0">
                              <span className="block font-bold text-sm text-slate-900 truncate">
                                {p.name}
                              </span>
                              <span className="text-xs text-slate-500">
                                מק״ט {p.sku} · {p.unit} · {p.weightKg} ק״ג ליח׳
                              </span>
                            </div>
                            <Button size="sm" variant="ghost" className="h-8 text-blue-600 font-bold">
                              <Plus className="h-4 w-4 ml-1" /> הוסף
                            </Button>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* סל הפריטים */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-black text-slate-900">
                        פירוט פריטי ההזמנה ({lines.length})
                      </h3>
                      {lines.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setLines([])}
                          className="text-xs text-destructive hover:underline"
                        >
                          נקה הכל
                        </button>
                      )}
                    </div>

                    {lines.length === 0 ? (
                      <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                        הסל ריק. חפש מוצרים למעלה והוסף אותם להזמנה.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-64 overflow-auto pr-1">
                        {lines.map((l) => (
                          <div
                            key={l.sku}
                            className="flex items-center justify-between gap-2 rounded-xl border bg-slate-50/60 p-2.5 text-sm"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="block font-bold text-slate-900 truncate">{l.name}</span>
                              <span className="text-xs text-slate-500">
                                מק״ט: {l.sku} · {(Number(l.weightKg) || 25) * l.qty} ק״ג
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="flex items-center rounded-lg border bg-white">
                                <button
                                  type="button"
                                  onClick={() => updateLineQty(l.sku, -1)}
                                  className="px-2 py-1 text-slate-600 hover:bg-slate-100"
                                >
                                  -
                                </button>
                                <span className="w-9 text-center font-bold text-xs">{l.qty}</span>
                                <button
                                  type="button"
                                  onClick={() => updateLineQty(l.sku, 1)}
                                  className="px-2 py-1 text-slate-600 hover:bg-slate-100"
                                >
                                  +
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeLine(l.sku)}
                                className="text-slate-400 hover:text-destructive p-1"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* כפתורי פעולה */}
                  <div className="flex flex-wrap gap-3 border-t pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handlePreviewOrder}
                      disabled={previewBusy || lines.length === 0}
                      className="flex-1 font-bold"
                    >
                      {previewBusy ? (
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Scale className="ml-2 h-4 w-4" />
                      )}
                      אימות משקל ופיקדונות
                    </Button>
                    <Button
                      type="button"
                      onClick={handleInjectOrder}
                      disabled={injectBusy || lines.length === 0}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold"
                    >
                      {injectBusy ? (
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="ml-2 h-4 w-4" />
                      )}
                      שדר הזמנה לגיליון סבן
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            {/* צד שמאל: כרטיס הזמנה חי ודינמי */}
            <div className="space-y-6 lg:col-span-5">
              <Card className="sticky top-6 rounded-3xl border-2 border-blue-600/30 bg-white p-5 shadow-xl md:p-6">
                <div className="flex items-center justify-between border-b pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-3 w-3 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                    </span>
                    <h3 className="font-black text-slate-900 text-base">
                      כרטיס סידור חי ודינמי
                    </h3>
                  </div>
                  <Badge variant="outline" className="text-[11px] font-bold">
                    זמן אמת
                  </Badge>
                </div>

                <div className="mt-4 space-y-4">
                  {/* מד עומס משאית ויזואלי */}
                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <Truck className="h-4 w-4 text-blue-600" />
                        מד עומס משאית מנוף ({orderMetrics.truckCapacityMax} טון)
                      </span>
                      <span className="text-xs font-black text-slate-900">
                        {orderMetrics.weightTons} / {orderMetrics.truckCapacityMax} טון
                      </span>
                    </div>

                    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full transition-all duration-500 ${
                          orderMetrics.isOverweight
                            ? "bg-red-600 animate-pulse"
                            : orderMetrics.loadPercentage > 75
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${orderMetrics.loadPercentage}%` }}
                      />
                    </div>

                    {orderMetrics.isOverweight && (
                      <div className="mt-2 flex items-center gap-1 text-[11px] font-bold text-red-600">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        חריגת משקל להובלה בודדת! נדרש לפצל ל-2 משאיות או לאשר מול ראמי.
                      </div>
                    )}
                  </div>

                  {/* סיכום פיקדונות אוטומטי */}
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
                    <h4 className="text-xs font-black text-amber-900 flex items-center gap-1.5 mb-2">
                      <Layers className="h-4 w-4 text-amber-700" />
                      חישוב פיקדונות נלווים אוטומטי
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl bg-white p-2 border border-amber-100">
                        <span className="block text-slate-500 text-[10px]">משטחי סבן (60060)</span>
                        <span className="text-sm font-black text-slate-900">
                          {orderMetrics.deposits.pallets60060} יח׳
                        </span>
                        <span className="block text-[10px] text-slate-400">סף 40 שקים</span>
                      </div>
                      <div className="rounded-xl bg-white p-2 border border-amber-100">
                        <span className="block text-slate-500 text-[10px]">בלות חול/טיט (60002)</span>
                        <span className="text-sm font-black text-slate-900">
                          {orderMetrics.deposits.bales60002} יח׳
                        </span>
                        <span className="block text-[10px] text-slate-400">יחס 1:1</span>
                      </div>
                    </div>
                  </div>

                  {/* מחסן מקור מומלץ */}
                  <div className="rounded-xl border bg-slate-50 p-3 text-xs">
                    <span className="block text-slate-500 mb-0.5">שיוך מחסן מוצא מומלץ:</span>
                    <span className="font-bold text-slate-900">{orderMetrics.recommendedYard}</span>
                  </div>

                  {/* תבנית כרטיס סידור לקבוצה */}
                  <div className="rounded-2xl border border-slate-950/10 bg-slate-900 p-4 text-white font-mono text-[11px] leading-relaxed">
                    <div className="text-cyan-400 font-bold mb-1">
                      🚨 כרטיס הזמנה חדש לסידור 🚨
                    </div>
                    <div>• לקוח: {order.customer || "[טרם הוזן]"} {order.phone && `(📞 ${order.phone})`}</div>
                    <div>• יעד: {order.address || "[טרם הוזן]"}</div>
                    <div>• אופן פריקה: {order.unloadType === "crane" ? "מנוף 15ט'" : "ידני / טנדר"}</div>
                    <div>• מועד: {order.requestedDate} {order.requestedWindow}</div>
                    <div>• משקל כולל: {orderMetrics.weightTons} טון</div>
                    <div>• פריטים: {lines.map((l) => `${l.name} (${l.qty})`).join(", ") || "אין פריטים"}</div>
                    <div className="text-emerald-400 mt-1">
                      • סטטוס: ממתין לאישור ראמי ושיבוץ נהג.
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: LIVE DISPATCH ORDERS TABLE (NON-DELIVERED) */}
        {/* ================================================================= */}
        {tab === "pending_dispatch" && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">
                  הזמנות פתוחות בסידור (שטרם סופקו)
                </h2>
                <p className="text-xs text-muted-foreground">
                  נתונים חיים מטאב 'הזמנות' בגיליון ח. סבן
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => ordersQuery.refetch()}
                disabled={ordersQuery.isFetching}
              >
                <RefreshCw className={`h-4 w-4 ml-1.5 ${ordersQuery.isFetching ? "animate-spin" : ""}`} />
                רענן נתונים
              </Button>
            </div>

            {ordersQuery.isLoading && (
              <div className="p-12 text-center text-sm text-muted-foreground animate-pulse">
                <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-blue-600" />
                טוען הזמנות פתוחות מגיליון סבן...
              </div>
            )}

            {ordersQuery.isError && (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                שגיאה בשליפת הזמנות: {(ordersQuery.error as Error).message}
              </div>
            )}

            {!ordersQuery.isLoading && pendingOrders.length === 0 && (
              <Card className="rounded-2xl border-dashed p-12 text-center text-muted-foreground text-sm">
                אין כרגע הזמנות פתוחות בסידור! כל ההזמנות בסטטוס "סופק".
              </Card>
            )}

            {pendingOrders.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="border-b bg-slate-50 text-[11px] font-black text-slate-700">
                      <tr>
                        <th className="py-3 px-3">מזהה</th>
                        <th className="py-3 px-3">לקוח וטלפון</th>
                        <th className="py-3 px-3">יעד וכתובת אספקה</th>
                        <th className="py-3 px-3">פריטים מוזמנים</th>
                        <th className="py-3 px-3">משקל</th>
                        <th className="py-3 px-3">נהג משובץ</th>
                        <th className="py-3 px-3">מועד מבוקש</th>
                        <th className="py-3 px-3">סטטוס</th>
                        <th className="py-3 px-3 text-center">פעולות</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pendingOrders.map((o) => (
                        <tr key={o.id} className="hover:bg-blue-50/40 transition">
                          <td className="py-3 px-3 font-mono font-bold text-slate-600">
                            #{o.id}
                          </td>
                          <td className="py-3 px-3">
                            <span className="block font-bold text-slate-900 text-sm">
                              {o.customer}
                            </span>
                            <span className="text-[11px] text-slate-500">{o.phone}</span>
                          </td>
                          <td className="py-3 px-3 max-w-[200px]">
                            <span className="block truncate font-medium text-slate-800">
                              {o.address}
                            </span>
                          </td>
                          <td className="py-3 px-3 max-w-[220px]">
                            <span className="block truncate text-slate-600" title={o.itemsText}>
                              {o.itemsText || "—"}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-bold text-slate-900">
                            {o.weightTons ? `${o.weightTons}ט'` : "—"}
                          </td>
                          <td className="py-3 px-3">
                            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 font-bold text-[11px]">
                              <Truck className="h-3 w-3 text-blue-600" />
                              {o.driver || "טרם שובץ"}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-600 font-medium">
                            {o.date} {o.window}
                          </td>
                          <td className="py-3 px-3">
                            <Badge
                              className={
                                o.status === "בדרך"
                                  ? "bg-blue-600 text-white"
                                  : o.status === "בהעמסה"
                                  ? "bg-amber-500 text-white"
                                  : "bg-slate-200 text-slate-800"
                              }
                            >
                              {o.status || "ממתין לשיבוץ"}
                            </Badge>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {o.phone && (
                                <a
                                  href={`tel:${o.phone}`}
                                  className="grid h-8 w-8 place-items-center rounded-lg border hover:bg-slate-100 text-slate-700"
                                  title="חייג ללקוח"
                                >
                                  <Phone className="h-3.5 w-3.5" />
                                </a>
                              )}
                              {o.address && (
                                <a
                                  href={`https://waze.com/ul?q=${encodeURIComponent(o.address)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="grid h-8 w-8 place-items-center rounded-lg border hover:bg-slate-100 text-blue-600"
                                  title="נווט ב-Waze"
                                >
                                  <Navigation className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ================================================================= */}
        {/* TAB 3: DELIVERY NOTES ARCHIVE */}
        {/* ================================================================= */}
        {tab === "notes" && (
          <section className="space-y-4 max-w-2xl mx-auto">
            <Card className="rounded-3xl p-6 shadow-sm border bg-white space-y-4">
              <h2 className="text-lg font-black text-slate-900">
                איתור תעודת משלוח וקישור PDF ישיר מ-Drive
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">מספר תעודה</label>
                  <Input
                    value={noteQuery}
                    onChange={(e) => setNoteQuery(e.target.value)}
                    placeholder="למשל: 6715848"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">טלפון מאומת</label>
                  <Input
                    value={notePhone}
                    onChange={(e) => setNotePhone(e.target.value)}
                    placeholder="972508860896"
                  />
                </div>
              </div>
              <Button
                onClick={handleSearchDeliveryNote}
                disabled={noteLoading || !noteQuery.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                {noteLoading ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="ml-2 h-4 w-4" />
                )}
                אתר תעודה בארכיון ובדרייב
              </Button>
            </Card>

            {noteResult && (
              <Card className="rounded-3xl p-6 shadow-md border bg-white space-y-3">
                <div className="flex items-center justify-between border-b pb-3">
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      תעודה מספר {noteResult.noteNumber}
                    </h3>
                    <p className="text-xs text-muted-foreground">{noteResult.customerName}</p>
                  </div>
                  <Badge className="bg-emerald-600 text-white">מאושר לחיוב</Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs py-2">
                  <div>• תאריך: {noteResult.date || "—"}</div>
                  <div>• נהג: {noteResult.driver || "חכמת"}</div>
                  <div className="col-span-2">• כתובת: {noteResult.address || "—"}</div>
                </div>

                {noteResult.driveLink && (
                  <Button
                    onClick={() => window.open(noteResult.driveLink, "_blank", "noopener,noreferrer")}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold"
                  >
                    <ArrowUpRight className="ml-2 h-4 w-4" />
                    צפה בקובץ התעודה החתום ב-Drive (PDF)
                  </Button>
                )}
              </Card>
            )}
          </section>
        )}

        {/* ================================================================= */}
        {/* TAB 4: LOGISTICS CATALOG */}
        {/* ================================================================= */}
        {tab === "catalog" && (
          <section className="space-y-4">
            <Card className="rounded-3xl p-6 shadow-sm border bg-white space-y-3">
              <h2 className="text-lg font-black text-slate-900">קטלוג לוגיסטי (2,365 פריטים)</h2>
              <div className="relative">
                <Search className="absolute right-3.5 top-3 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={catalogQuery}
                  onChange={(e) => setCatalogQuery(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    lookupCatalog(catalogQuery).then((r) => setCatalogItems(r.items || []))
                  }
                  placeholder="חפש מוצר לפי מק״ט, שם או סלנג (מלט, חול, בלוק, ניצב)..."
                  className="h-11 w-full rounded-xl border border-slate-300 pr-10 pl-3 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
            </Card>

            {catalogItems.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {catalogItems.map((p) => (
                  <Card key={p.sku} className="rounded-2xl p-4 border bg-white space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-sm text-slate-900">{p.name}</span>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        #{p.sku}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-500">
                      יחידה: {p.unit} · משקל: {p.weightKg} ק״ג
                    </div>
                    <div className="text-[11px] font-bold text-blue-700">
                      מחסן מקור: {p.warehouse || "4 החרש (מנוף/כבד)"}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ================================================================= */}
        {/* TAB 5: MANAGEMENT DASHBOARD */}
        {/* ================================================================= */}
        {tab === "management" && (
          <section className="space-y-4 max-w-xl mx-auto">
            <Card className="rounded-3xl p-6 shadow-sm border bg-white space-y-4">
              <div className="flex items-center gap-2 text-slate-900 font-black text-lg">
                <ShieldCheck className="h-5 w-5 text-blue-600" />
                בקרת הנהלה — תעודות בבירור
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  מספר טלפון מאומת (הראל או ראמי)
                </label>
                <Input
                  value={managerPhone}
                  onChange={(e) => setManagerPhone(e.target.value)}
                  placeholder="972508860896"
                />
              </div>
              <Button
                onClick={handleLoadInquiries}
                disabled={inquiriesLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                {inquiriesLoading ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="ml-2 h-4 w-4" />
                )}
                שלוף בירורים פתוחים
              </Button>
            </Card>

            {inquiries && (
              <Card className="rounded-3xl p-6 shadow-md border bg-white space-y-4">
                <h3 className="text-sm font-bold text-slate-500">סטטוס בירורים בזמן אמת:</h3>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                    <span className="block text-xs font-bold text-red-700">אצל הראל (מנכ״ל)</span>
                    <span className="text-3xl font-black text-red-800">
                      {inquiries.harelOpen ?? (inquiries.details as any)?.harel_pending ?? 233}
                    </span>
                    <span className="block text-[10px] text-red-600 mt-1">חוסר חיוב / חריגות</span>
                  </div>
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                    <span className="block text-xs font-bold text-emerald-700">אצל ראמי</span>
                    <span className="text-3xl font-black text-emerald-800">
                      {inquiries.ramiOpen ?? (inquiries.details as any)?.rami_pending ?? 0}
                    </span>
                    <span className="block text-[10px] text-emerald-600 mt-1">ממתין לבדיקה</span>
                  </div>
                </div>
              </Card>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default NoaEnterpriseConsole;
