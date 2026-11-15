import { AlertTriangle, Loader2, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  orderId: string;
  oldCustomerNo: string;
  customerName: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (newCustomerNo: string) => void;
};

export function UpdateCustomerNumberModal({
  open,
  orderId,
  oldCustomerNo,
  customerName,
  busy,
  error,
  onClose,
  onConfirm,
}: Props) {
  const titleId = useId();
  const inputId = useId();
  const [next, setNext] = useState("");

  useEffect(() => {
    if (open) setNext("");
  }, [open]);

  if (!open) return null;

  const valid = next.trim().length > 0 && next.trim() !== oldCustomerNo;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#102A43]/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label="סגירה" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-[20px] border border-[#DCE6EF] bg-white p-6 shadow-[0_8px_24px_rgba(16,42,67,.12)]">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold text-[#102A43]">
            עדכון מס׳ לקוח קומקס
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl hover:bg-[#F3F7FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147D9C]"
            aria-label="סגירה"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2 text-sm text-[#52667A]">
          לקוח: <strong className="text-[#102A43]">{customerName}</strong>
          {orderId ? (
            <>
              {" "}
              · הזמנה{" "}
              <span className="tabular-nums" dir="ltr">
                #{orderId}
              </span>
            </>
          ) : null}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-[#DCE6EF] bg-[#F3F7FB] p-3">
            <div className="text-xs text-[#52667A]">לפני</div>
            <div className="mt-1 font-bold tabular-nums text-[#102A43]" dir="ltr">
              {oldCustomerNo}
            </div>
          </div>
          <div className="rounded-xl border border-[#147D9C]/40 bg-[#147D9C]/5 p-3">
            <div className="text-xs text-[#52667A]">אחרי</div>
            <div className="mt-1 font-bold tabular-nums text-[#102A43]" dir="ltr">
              {next.trim() || "—"}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <label htmlFor={inputId} className="block text-sm font-semibold text-[#102A43]">
            מס׳ לקוח קומקס החדש
          </label>
          <input
            id={inputId}
            value={next}
            onChange={(e) => setNext(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            dir="ltr"
            className="h-12 w-full rounded-[12px] border border-[#DCE6EF] px-3 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147D9C]"
            placeholder="הזינו מספר לקוח אמיתי"
          />
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#B45309]/30 bg-[#FEF3C7] p-3 text-xs text-[#B45309]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            הפעולה תעדכן את שורת ההזמנה ואת מאגר_לקוחות_מאוחד: המספר החדש יהיה{" "}
            <strong>comax_primary_no</strong>, והמספר הישן ({oldCustomerNo}) יישמר ב־
            <strong>comax_linked_ids</strong> ללא מחיקת ערכים קיימים.
          </p>
        </div>

        {error && (
          <p className="mt-3 text-sm font-semibold text-[#B91C1C]" role="alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#DCE6EF] px-4 text-sm font-bold text-[#102A43] hover:bg-[#F3F7FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147D9C]"
          >
            ביטול
          </button>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={() => onConfirm(next.trim())}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147D9C] focus-visible:ring-offset-2 disabled:opacity-50",
              "bg-[#164E78] hover:bg-[#102A43]",
            )}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            אישור עדכון
          </button>
        </div>
      </div>
    </div>
  );
}
