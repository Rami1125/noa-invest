import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WeightSafetyLevel } from "@/lib/new-order/types";

type Props = {
  tons: number;
  limitTons: number;
  level: WeightSafetyLevel;
  labelHe: string;
  pct: number;
  className?: string;
};

export function WeightSafetyBar({ tons, limitTons, level, labelHe, pct, className }: Props) {
  const Icon =
    level === "danger" ? ShieldAlert : level === "warn" ? AlertTriangle : CheckCircle2;

  const barColor =
    level === "danger" ? "bg-[#B91C1C]" : level === "warn" ? "bg-[#B45309]" : "bg-[#15803D]";
  const textColor =
    level === "danger" ? "text-[#B91C1C]" : level === "warn" ? "text-[#B45309]" : "text-[#15803D]";
  const bgTint =
    level === "danger" ? "bg-[#FEE2E2]" : level === "warn" ? "bg-[#FEF3C7]" : "bg-emerald-50";

  const widthPct = Math.min(100, Math.max(0, pct));

  return (
    <div className={cn("space-y-2 rounded-[12px] border border-[#DCE6EF] p-3", bgTint, className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className={cn("inline-flex items-center gap-1.5 font-semibold", textColor)}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          <span>{labelHe}</span>
        </div>
        <div className="tabular-nums text-[#102A43]" dir="ltr">
          <strong>{tons.toFixed(2)}</strong>
          <span className="text-[#52667A]"> / {limitTons.toFixed(1)} טון</span>
          <span className="ms-2 text-xs text-[#52667A]">({pct.toFixed(0)}%)</span>
        </div>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(pct))}
        aria-valuetext={`${tons.toFixed(2)} טון מתוך ${limitTons.toFixed(1)}, ${labelHe}`}
        className="h-2.5 w-full overflow-hidden rounded-full bg-white/80 ring-1 ring-[#DCE6EF]"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-150 ease-out motion-reduce:transition-none",
            barColor,
          )}
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}
