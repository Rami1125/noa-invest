/**
 * NewOrderStudioPage — UI מלא ליצירת הזמנה חדשה
 * (תוכן מלא יועלה בהמשך אם ה-push נחתך)
 */
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { useInjectNewOrder, useOrderBootstrap, useUpdateOrderCustomerNumber } from "@/lib/new-order/hooks";
import type { CartLine, OrderAttachment, OrderCustomer, InjectNewOrderResult } from "@/lib/new-order/types";
import { CustomerCombobox } from "@/components/new-order/CustomerCombobox";
import { ProductSearch } from "@/components/new-order/ProductSearch";
import { QuantityStepper } from "@/components/new-order/QuantityStepper";
import { WeightSafetyBar } from "@/components/new-order/WeightSafetyBar";
import { FileDropzone } from "@/components/new-order/FileDropzone";
import { ConfirmationCard } from "@/components/new-order/ConfirmationCard";
import { UpdateCustomerNumberModal } from "@/components/new-order/UpdateCustomerNumberModal";
import {
  cartWeightTons,
  depositCounts,
  limitTonsForDriver,
  recommendDriver,
  recommendWarehouse,
  weightSafety,
  buildWazeUrl,
} from "@/lib/new-order/weight";

export function NewOrderStudioPage() {
  const bootstrap = useOrderBootstrap();
  const inject = useInjectNewOrder();
  const updateNo = useUpdateOrderCustomerNumber();

  const [customer, setCustomer] = useState<OrderCustomer | null>(null);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [contactName, setContactName] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deliveryWindow, setDeliveryWindow] = useState("");
  const [warehouse, setWarehouse] = useState("החרש 10");
  const [driver, setDriver] = useState("חכמת");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [attachment, setAttachment] = useState<OrderAttachment | null>(null);
  const [result, setResult] = useState<InjectNewOrderResult | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const customers = bootstrap.data?.customers ?? [];
  const products = bootstrap.data?.products ?? [];
  const tons = useMemo(() => cartWeightTons(lines), [lines]);
  const deposits = useMemo(() => depositCounts(lines), [lines]);
  const limit = limitTonsForDriver(driver);
  const safety = weightSafety(tons, limit);

  if (bootstrap.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-[#164E78]" dir="rtl">
        <Loader2 className="h-5 w-5 animate-spin" />
        טוען נתוני הזמנה...
      </div>
    );
  }

  if (bootstrap.isError) {
    return (
      <div className="mx-auto max-w-lg rounded-[20px] border border-red-200 bg-white p-6 text-center" dir="rtl">
        <AlertCircle className="mx-auto mb-2 h-8 w-8 text-red-500" />
        <p className="mb-4 text-red-700">{String(bootstrap.error?.message || "שגיאה בטעינה")}</p>
        <button
          type="button"
          onClick={() => bootstrap.refetch()}
          className="inline-flex items-center gap-2 rounded-xl bg-[#147D9C] px-4 py-2 text-white"
        >
          <RefreshCw className="h-4 w-4" /> נסה שוב
        </button>
      </div>
    );
  }

  if (result) {
    return (
      <div className="mx-auto max-w-2xl p-4" dir="rtl">
        <ConfirmationCard
          result={result}
          onUpdateCustomerNumber={() => setModalOpen(true)}
          onNewOrder={() => {
            setResult(null);
            setCustomer(null);
            setLines([]);
            setAttachment(null);
            setNotes("");
          }}
        />
        <UpdateCustomerNumberModal
          open={modalOpen}
          orderId={result.orderId}
          oldCustomerNo={result.customerNo}
          onClose={() => setModalOpen(false)}
          onSubmit={async (payload) => {
            await updateNo.mutateAsync(payload);
            setModalOpen(false);
          }}
        />
      </div>
    );
  }

  const canSubmit =
    !!customer &&
    address.trim().length > 0 &&
    lines.length > 0 &&
    !inject.isPending &&
    safety.level !== "blocked";

  return (
    <div className="min-h-screen bg-[#F3F7FB]" dir="rtl" lang="he">
      <header className="sticky top-0 z-30 bg-gradient-to-br from-[#102A43] via-[#164E78] to-[#147D9C] px-4 py-4 text-white shadow">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/" className="text-sm text-white/80 hover:underline">
              ← חזרה
            </Link>
            <h1 className="text-xl font-bold">הזמנה חדשה — New Order Studio</h1>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-white/15 px-3 py-1">משקל: {tons.toFixed(2)} ט׳</span>
            <span className="rounded-full bg-white/15 px-3 py-1">מחסן: {warehouse}</span>
            <span className="rounded-full bg-white/15 px-3 py-1">60002: {deposits.d60002}</span>
            <span className="rounded-full bg-white/15 px-3 py-1">60060: {deposits.d60060}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-2">
        <section className="rounded-[20px] border border-[#DCE6EF] bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-[#102A43]">לקוח ויעד</h2>
          <CustomerCombobox
            customers={customers}
            value={customer}
            onChange={(c) => {
              setCustomer(c);
              if (c) {
                setAddress(c.defaultSite || c.address || "");
                setPhone(c.phones?.[0] || "");
              }
            }}
          />
          <label className="mt-3 block text-sm text-[#164E78]">
            כתובת אספקה
            <input
              className="mt-1 w-full rounded-xl border border-[#DCE6EF] px-3 py-2"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-sm text-[#164E78]">
              טלפון
              <input
                className="mt-1 w-full rounded-xl border border-[#DCE6EF] px-3 py-2"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label className="text-sm text-[#164E78]">
              איש קשר
              <input
                className="mt-1 w-full rounded-xl border border-[#DCE6EF] px-3 py-2"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-sm text-[#164E78]">
              תאריך אספקה
              <input
                type="date"
                className="mt-1 w-full rounded-xl border border-[#DCE6EF] px-3 py-2"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </label>
            <label className="text-sm text-[#164E78]">
              חלון שעות
              <input
                className="mt-1 w-full rounded-xl border border-[#DCE6EF] px-3 py-2"
                value={deliveryWindow}
                onChange={(e) => setDeliveryWindow(e.target.value)}
                placeholder="08:00–12:00"
              />
            </label>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-sm text-[#164E78]">
              מחסן
              <select
                className="mt-1 w-full rounded-xl border border-[#DCE6EF] px-3 py-2"
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
              >
                <option value="החרש 10">החרש 10</option>
                <option value="התלמיד 6">התלמיד 6</option>
              </select>
            </label>
            <label className="text-sm text-[#164E78]">
              נהג
              <select
                className="mt-1 w-full rounded-xl border border-[#DCE6EF] px-3 py-2"
                value={driver}
                onChange={(e) => setDriver(e.target.value)}
              >
                <option value="חכמת">חכמת</option>
                <option value="עלי">עלי</option>
              </select>
            </label>
          </div>
          <label className="mt-2 block text-sm text-[#164E78]">
            הערות
            <textarea
              className="mt-1 w-full rounded-xl border border-[#DCE6EF] px-3 py-2"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="mt-3">
            <FileDropzone value={attachment} onChange={setAttachment} />
          </div>
        </section>

        <section className="rounded-[20px] border border-[#DCE6EF] bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-[#102A43]">סל מוצרים</h2>
          <ProductSearch
            products={products}
            onAdd={(p) => {
              setLines((prev) => {
                const i = prev.findIndex((l) => l.sku === p.sku);
                if (i >= 0) {
                  const next = [...prev];
                  next[i] = { ...next[i], qty: next[i].qty + 1 };
                  return next;
                }
                return [
                  ...prev,
                  {
                    sku: p.sku,
                    name: p.name,
                    unit: p.unit,
                    qty: 1,
                    weightPerUnit: p.weightPerUnit,
                    depositSku: p.depositSku,
                    defaultWarehouse: p.defaultWarehouse,
                    recommendedDriver: p.recommendedDriver,
                  },
                ];
              });
              const w = recommendWarehouse([
                ...lines,
                { sku: p.sku, name: p.name, unit: p.unit, qty: 1, weightPerUnit: p.weightPerUnit },
              ]);
              const d = recommendDriver([
                ...lines,
                { sku: p.sku, name: p.name, unit: p.unit, qty: 1, weightPerUnit: p.weightPerUnit },
              ]);
              if (w) setWarehouse(w);
              if (d) setDriver(d);
            }}
          />
          <ul className="mt-3 space-y-2">
            {lines.map((line) => (
              <li
                key={line.sku}
                className="flex items-center justify-between gap-2 rounded-xl border border-[#DCE6EF] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-[#102A43]">{line.name}</div>
                  <div className="text-xs text-[#164E78]">{line.sku}</div>
                </div>
                <QuantityStepper
                  value={line.qty}
                  onChange={(qty) =>
                    setLines((prev) =>
                      prev
                        .map((l) => (l.sku === line.sku ? { ...l, qty } : l))
                        .filter((l) => l.qty > 0),
                    )
                  }
                />
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <WeightSafetyBar tons={tons} limitTons={limit} safety={safety} />
          </div>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={async () => {
              if (!customer) return;
              const itemsJson = JSON.stringify(
                lines.map((l) => ({
                  sku: l.sku,
                  name: l.name,
                  unit: l.unit,
                  qty: l.qty,
                  weightPerUnit: l.weightPerUnit,
                })),
              );
              const res = await inject.mutateAsync({
                customerNo: customer.customerNo,
                customerName: customer.fullName || customer.name,
                address,
                phone,
                contactName,
                deliveryDate,
                deliveryWindow,
                warehouse,
                driver,
                notes,
                itemsJson,
                wazeUrl: buildWazeUrl(address),
                attachment: attachment || undefined,
              });
              setResult(res);
            }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#147D9C] px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {inject.isPending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> שולח...
              </>
            ) : (
              "שדר והזרק הזמנה"
            )}
          </button>
          {inject.isError && (
            <p className="mt-2 text-center text-sm text-red-600">{String(inject.error?.message)}</p>
          )}
        </section>
      </main>
    </div>
  );
}
