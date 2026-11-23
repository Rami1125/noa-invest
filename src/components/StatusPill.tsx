export function StatusPill({ s }: { s: "ok" | "warn" | "fail" }) {
  const m = {
    ok: ["bg-emerald-500/15 text-emerald-700 border border-emerald-500/30", "🟢 מאומת 100%"],
    warn: ["bg-amber-500/20 text-amber-800 border border-amber-500/40", "⚠️ חריגה"],
    fail: ["bg-destructive/15 text-destructive border border-destructive/30", "🔴 כשל"],
  } as const;
  const [cls, label] = m[s];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${cls}`}>
      {label}
    </span>
  );
}
