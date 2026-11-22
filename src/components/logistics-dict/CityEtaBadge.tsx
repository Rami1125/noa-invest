/**
 * CityEtaBadge — Feature 4
 * הצגת חלון זמן משוער + התראת מנוף ב-Checkout
 */
import { useQuery } from "@tanstack/react-query";
import { Clock, AlertTriangle, Loader2, Truck } from "lucide-react";
import { getCityEtaFn, type CityEta } from "@/lib/catalog-enrichment.functions";
import { cn } from "@/lib/utils";

type Props = {
  city: string;
  className?: string;
  compact?: boolean;
};

export function CityEtaBadge({ city, className, compact = false }: Props) {
  const q = useQuery({
    queryKey: ["city-eta", city],
    queryFn: () => getCityEtaFn({ data: { city } }),
    enabled: city.trim().length >= 2,
    staleTime: 15 * 60_000,
  });

  if (!city.trim()) return null;

  if (q.isLoading) {
    return (
      <div className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        מחשב זמני אספקה…
      </div>
    );
  }

  const eta = q.data?.eta;
  if (!eta) {
    return (
      <div className={cn("text-xs text-muted-foreground", className)}>
        {q.data?.line || `אין נתונים עבור ${city}`}
      </div>
    );
  }

  if (compact) {
    return (
      <div className={cn("inline-flex flex-wrap items-center gap-2 text-xs", className)}>
        <span className="inline-flex items-center gap-1 font-semibold">
          <Clock className="h-3.5 w-3.5 text-primary" />
          {eta.city}
        </span>
        {eta.driveMinMedian != null && (
          <span className="text-muted-foreground">נסיעה ~{eta.driveMinMedian} דק׳</span>
        )}
        {eta.unloadMinMedian != null && (
          <span className="text-muted-foreground">פריקה {eta.unloadMinMedian} דק׳</span>
        )}
        {eta.craneHint && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            <AlertTriangle className="h-3 w-3" />
            מנוף
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/70 bg-card p-3 text-sm shadow-sm",
        className,
      )}
      dir="rtl"
    >
      <div className="mb-2 flex items-center gap-2 font-bold">
        <Truck className="h-4 w-4 text-primary" />
        זמני אספקה משוערים · {eta.city}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="נסיעה (חציון)" value={eta.driveMinMedian != null ? `${eta.driveMinMedian} דק׳` : "—"} />
        <Stat label="פריקה (חציון)" value={eta.unloadMinMedian != null ? `${eta.unloadMinMedian} דק׳` : "—"} />
        <Stat label="P80 פריקה" value={eta.unloadP80 != null ? `${eta.unloadP80} דק׳` : "—"} />
        <Stat label="ביקורים מתועדים" value={String(eta.visitsCount)} />
      </div>
      {eta.craneHint && (
        <div className="mt-2 flex items-center gap-1.5 rounded-xl bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertTriangle className="h-3.5 w-3.5" />
          ייתכן צורך בגישת מנוף — וודא גישה לאתר
        </div>
      )}
      <div className="mt-1.5 text-[10px] text-muted-foreground">מבוסס על נתוני איתוראן אמיתיים</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-2.5 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-bold tabular-nums">{value}</div>
    </div>
  );
}

export function useCityEta(city: string) {
  return useQuery({
    queryKey: ["city-eta", city],
    queryFn: () => getCityEtaFn({ data: { city } }),
    enabled: city.trim().length >= 2,
    staleTime: 15 * 60_000,
  });
}
