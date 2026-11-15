import { Check, CheckCircle2, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { InjectNewOrderResult } from "@/lib/new-order/types";

type Props = {
  result: InjectNewOrderResult;
  customerName: string;
  customerNo: string;
  address: string;
  tons: number;
  onReset: () => void;
  className?: string;
};

export function ConfirmationCard({
  result,
  customerName,
  customerNo,
  address,
  tons,
  onReset,
  className,
}: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.whatsappMessage);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = result.whatsappMessage;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <section
      className={cn(
        "rounded-[20px] border border-[#DCE6EF] bg-white p-6 shadow-[0_1px_2px_rgba(16,42,67,.05),0_8px_24px_rgba(16,42,67,.06)]",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-[#15803D]">
          <CheckCircle2 className="h-7 w-7" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-[#102A43]">ההזמנה נקלטה בהצלחה</h2>
          <p className="mt-1 text-sm text-[#52667A]">
            מספר הזמנה{" "}
            <span className="font-bold tabular-nums text-[#102A43]" dir="ltr">
              #{result.orderId}
            </span>
            {result.rowNumber ? ` · שורה ${result.rowNumber}` : ""}
          </p>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[#52667A]">לקוח</dt>
          <dd className="font-semibold text-[#102A43]">
            {customerName}{" "}
            <span className="tabular-nums text-[#52667A]" dir="ltr">
              ({customerNo})
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-[#52667A]">כתובת</dt>
          <dd className="font-semibold text-[#102A43]">{address}</dd>
        </div>
        <div>
          <dt className="text-[#52667A]">משקל</dt>
          <dd className="font-semibold tabular-nums text-[#102A43]" dir="ltr">
            {tons.toFixed(2)} טון
          </dd>
        </div>
        {result.driveFolderUrl && (
          <div>
            <dt className="text-[#52667A]">תיקיית Drive</dt>
            <dd>
              <a
                href={result.driveFolderUrl}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-[#147D9C] underline-offset-2 hover:underline"
                dir="ltr"
              >
                פתיחת תיקייה
              </a>
            </dd>
          </div>
        )}
        {result.fileUrl && (
          <div>
            <dt className="text-[#52667A]">קובץ שצורף</dt>
            <dd>
              <a
                href={result.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-[#147D9C] underline-offset-2 hover:underline"
                dir="ltr"
              >
                פתיחת קובץ
              </a>
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#164E78] px-4 text-sm font-bold text-white transition hover:bg-[#102A43] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147D9C] focus-visible:ring-offset-2"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" aria-hidden /> הועתק
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden /> העתק הודעת סידור לוואטסאפ
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#DCE6EF] bg-white px-4 text-sm font-bold text-[#102A43] transition hover:bg-[#F3F7FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147D9C]"
        >
          הזמנה חדשה
        </button>
      </div>
    </section>
  );
}
