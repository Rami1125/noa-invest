import { Minus, Plus } from "lucide-react";
import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label?: string;
  className?: string;
};

export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  label = "כמות",
  className,
}: Props) {
  const holdRef = useRef<number | null>(null);
  const delayRef = useRef<number | null>(null);

  const clamp = useCallback(
    (n: number) => Math.min(max, Math.max(min, Math.round(n))),
    [min, max],
  );

  const step = useCallback(
    (delta: number) => {
      onChange(clamp(value + delta));
    },
    [clamp, onChange, value],
  );

  const stopHold = useCallback(() => {
    if (holdRef.current != null) {
      window.clearInterval(holdRef.current);
      holdRef.current = null;
    }
    if (delayRef.current != null) {
      window.clearTimeout(delayRef.current);
      delayRef.current = null;
    }
  }, []);

  const startHold = useCallback(
    (delta: number) => {
      step(delta);
      stopHold();
      delayRef.current = window.setTimeout(() => {
        holdRef.current = window.setInterval(() => step(delta), 80);
      }, 400);
    },
    [step, stopHold],
  );

  return (
    <div className={cn("inline-flex items-center gap-1", className)} role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`הקטן ${label}`}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#DCE6EF] bg-white text-[#102A43] transition hover:bg-[#F3F7FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147D9C] disabled:opacity-40"
        disabled={value <= min}
        onPointerDown={(e) => {
          e.preventDefault();
          startHold(-1);
        }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
      >
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          onChange(clamp(n));
        }}
        className="h-11 w-14 rounded-xl border border-[#DCE6EF] bg-white text-center text-sm font-bold tabular-nums text-[#102A43] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147D9C]"
        dir="ltr"
      />
      <button
        type="button"
        aria-label={`הגדל ${label}`}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#DCE6EF] bg-white text-[#102A43] transition hover:bg-[#F3F7FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147D9C] disabled:opacity-40"
        disabled={value >= max}
        onPointerDown={(e) => {
          e.preventDefault();
          startHold(1);
        }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
      <span className="sr-only" aria-live="polite">
        {label}: {value}
      </span>
    </div>
  );
}
