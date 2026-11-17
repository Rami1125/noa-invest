/**
 * באנר אבחון חיבור ל-Apps Script / גיליון
 * מציג שגיאות token / HTML / HTTP בלי לחשוף סודות.
 */
import { useQuery } from "@tanstack/react-query";
import { probeGasConnectivityFn } from "@/lib/gas-connectivity.functions";
import { cn } from "@/lib/utils";

export function GasConnectionBanner({
  extraErrors = [],
  className,
}: {
  extraErrors?: string[];
  className?: string;
}) {
  const probe = useQuery({
    queryKey: ["gas-connectivity-probe"],
    queryFn: () => probeGasConnectivityFn(),
    staleTime: 30_000,
    retry: 1,
  });

  const failed =
    probe.isError || (probe.data != null && !probe.data.ok) || extraErrors.length > 0;

  if (probe.isLoading && !failed) return null;
  if (!failed) {
    return (
      <div className={cn("mx-auto max-w-7xl px-4 pt-2 md:px-8", className)}>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-900 dark:text-emerald-100">
          חיבור GAS תקין
          {probe.data
            ? ` · ${probe.data.gasUrlHost}/${probe.data.gasUrlSuffix} · ${probe.data.latencyMs}ms`
            : ""}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("mx-auto max-w-7xl px-4 pt-3 md:px-8", className)} role="alert">
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
        <div className="font-extrabold">כשל תקשורת לגיליון / Apps Script</div>
        <ul className="mt-1 list-disc space-y-0.5 pe-5 text-xs font-medium opacity-90">
          {probe.isError && <li>בדיקת חיבור נכשלה: {String(probe.error)}</li>}
          {probe.data && !probe.data.ok && (
            <li>
              {probe.data.error || probe.data.gasError || "לא תקין"}
              {" · "}
              host={probe.data.gasUrlHost}/{probe.data.gasUrlSuffix}
              {" · "}
              token={probe.data.tokenConfigured ? "מוגדר" : "חסר"}
              {probe.data.httpStatus != null ? ` · HTTP ${probe.data.httpStatus}` : ""}
              {probe.data.bodyKind ? ` · ${probe.data.bodyKind}` : ""}
              {probe.data.latencyMs ? ` · ${probe.data.latencyMs}ms` : ""}
            </li>
          )}
          {extraErrors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] opacity-80">
          Vercel → Settings → Environment Variables:{" "}
          <code className="rounded bg-black/5 px-1">GAS_URL</code> +{" "}
          <code className="rounded bg-black/5 px-1">API_TOKEN</code> (Preview ו-Production). ב-GAS:
          Script Properties + פריסת Web App (Execute as: Me, Who has access: Anyone).
        </p>
      </div>
    </div>
  );
}
