/**
 * דף ד': לוח בקרת הנהלה ובירורים (הראל / ראמי בלבד)
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, ShieldCheck, AlertTriangle, RefreshCw, Crown } from "lucide-react";
import {
  getInquiriesStats,
  isManagerPhone,
  SABAN_GATEWAY,
  type InquiriesStats,
  GatewayError,
} from "@/lib/saban-gateway";

export const Route = createFileRoute("/mgmt")({
  head: () => ({ meta: [{ title: "בקרת הנהלה · נועה · ח. סבן" }] }),
  component: MgmtPage,
});

function MgmtPage() {
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"harel" | "rami" | null>(null);
  const [stats, setStats] = useState<InquiriesStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlock = () => {
    const who = isManagerPhone(phone);
    if (!who) {
      toast.error("מספר לא מאומת", {
        description: "גישה להראל אידלסון או ראמי מסארווה בלבד",
      });
      setRole(null);
      return;
    }
    setRole(who);
    toast.success(`שלום ${SABAN_GATEWAY.managers[who].name}`);
    void loadStats();
  };

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getInquiriesStats();
      setStats(res);
    } catch (e) {
      const msg =
        e instanceof GatewayError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      setError(msg);
      toast.error("שליפת סטטיסטיקת בירורים נכשלה", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const harelOpen = stats?.harelOpen ?? 0;
  const ramiOpen = stats?.ramiOpen ?? 0;
  const total = stats?.totalOpen ?? harelOpen + ramiOpen;

  return (
    <div dir="rtl">
      <PageHeader
        title="לוח בקרת הנהלה"
        subtitle="בירור_הראל_מנכל · בירור_ראמי · גישה מאומתת בטלפון"
      />
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-5 md:px-8">
        {!role ? (
          <Card className="space-y-4 rounded-2xl p-5">
            <div className="flex items-center gap-2 font-extrabold">
              <ShieldCheck className="h-5 w-5 text-primary" />
              אימות טלפוני
            </div>
            <p className="text-sm text-muted-foreground">
              הזינו את מספר הנייד של הראל או ראמי (כולל קידומת 972 או 0).
            </p>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") unlock();
              }}
              placeholder="97250… או 05…"
              className="h-11"
              inputMode="tel"
            />
            <Button className="min-h-11 w-full font-bold" onClick={unlock}>
              כניסה להנהלה
            </Button>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge className="gap-1 bg-amber-600 text-white">
                <Crown className="h-3.5 w-3.5" />
                {SABAN_GATEWAY.managers[role].name}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                disabled={loading}
                onClick={() => void loadStats()}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                רענון
              </Button>
            </div>

            {loading && !stats && (
              <div className="grid gap-3 sm:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/60" />
                ))}
              </div>
            )}

            {error && (
              <Card className="flex items-start gap-2 border-destructive/40 bg-destructive/5 p-4 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div>
                  <div className="font-bold">שגיאת Gateway</div>
                  <p className="text-muted-foreground">{error}</p>
                </div>
              </Card>
            )}

            {stats && (
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard
                  title="סה״כ פתוחים"
                  value={total}
                  alert={total > 0}
                />
                <StatCard
                  title="בירור הראל מנכ״ל"
                  value={harelOpen}
                  sub={stats.harelTab || "בירור_הראל_מנכל"}
                  alert={harelOpen > 0}
                />
                <StatCard
                  title="בירור ראמי"
                  value={ramiOpen}
                  sub={stats.ramiTab || "בירור_ראמי"}
                  alert={ramiOpen > 0}
                />
              </div>
            )}

            {total > 0 && (
              <Card className="rounded-2xl border-amber-500/40 bg-amber-500/10 p-4">
                <div className="flex items-center gap-2 font-extrabold text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4" />
                  יש {total} תעודות ממתינות לבירור
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  עודכן:{" "}
                  {stats?.updatedAt ||
                    new Date().toLocaleString("he-IL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                </p>
              </Card>
            )}

            {stats && total === 0 && !error && (
              <Card className="rounded-2xl border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-800 dark:text-emerald-200">
                אין בירורים פתוחים כרגע ✅
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  sub,
  alert,
}: {
  title: string;
  value: number;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <Card
      className={`rounded-2xl p-4 ${
        alert ? "border-amber-500/40 bg-amber-500/5" : ""
      }`}
    >
      <div className="text-[10px] font-bold text-muted-foreground">{title}</div>
      <div className="mt-1 text-3xl font-black tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-[10px] text-muted-foreground">{sub}</div>}
    </Card>
  );
}
