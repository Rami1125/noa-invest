/**
 * שלב ג׳+ד׳ — כרטיס אתר: היסטוריה, P50/P80, טווחי צי, סימון מעל P80
 */
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import {
  Building2,
  Clock,
  ExternalLink,
  Gauge,
  MapPin,
  Truck,
  User,
} from "lucide-react";
import { formatKm, formatMinutes, distanceToYardKm } from "@/lib/logistics-intelligence";
import type { AtlasSite } from "@/lib/customer-history.functions";
import { cn } from "@/lib/utils";
import { DWELL_RULES } from "@/lib/ituran";
import { KIND_LABEL_HE } from "@/lib/dwell-intelligence";

function osmEmbed(lat: number, lng: number) {
  const d = 0.03;
  const bbox = [lng - d, lat - d, lng + d, lat + d].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

type Props = {
  site: AtlasSite;
  className?: string;
};

export function IturanSiteCard({ site, className }: Props) {
  const history = site.visitHistory || [];
  const ptoRows = history.filter((v) => v.ptoMin != null && (v.ptoMin as number) > 0);
  const hasCoords = site.latitude != null && site.longitude != null;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-extrabold leading-snug">
            {site.address || "אתר ללא כתובת"}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {site.city ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {site.city}
              </span>
            ) : null}
            {site.customerName || site.customerNo ? (
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                {site.customerName || "לקוח"}
                {site.customerNo ? ` · ${site.customerNo}` : ""}
              </span>
            ) : null}
          </div>
        </div>
        {site.customerNo ? (
          <Link
            to="/customers/$id"
            params={{ id: String(site.customerNo) }}
            className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            תיק לקוח <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "ביקורים", value: site.visits ?? "—", icon: Building2 },
          { label: "P50 שהייה", value: formatMinutes(site.medianMin), icon: Clock },
          { label: "P80 תכנון", value: formatMinutes(site.p80Min), icon: Clock },
          { label: "מקס׳ שהייה", value: formatMinutes(site.maxMin), icon: Clock },
          { label: "פתיחות PTO", value: site.ptoOpens ?? 0, icon: Gauge },
          {
            label: "סה\"כ דק׳ PTO",
            value: site.ptoTotalMin != null ? `${Math.round(site.ptoTotalMin)}` : "—",
            icon: Gauge,
          },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
          >
            <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
              <k.icon className="h-3 w-3" />
              {k.label}
            </div>
            <div className="mt-0.5 font-display text-base font-extrabold">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border/50 bg-muted/15 px-3 py-2 text-xs">
        <div className="font-semibold text-muted-foreground mb-1">טווחי צי (שלב ד׳) — סף תפעולי</div>
        <div className="flex flex-wrap gap-3">
          <span>
            {KIND_LABEL_HE.crane}:{" "}
            <strong className="text-foreground">
              {DWELL_RULES.crane[0]}–{DWELL_RULES.crane[1]} דק׳
            </strong>
          </span>
          <span>
            {KIND_LABEL_HE.flatbed}:{" "}
            <strong className="text-foreground">
              {DWELL_RULES.flatbed[0]}–{DWELL_RULES.flatbed[1]} דק׳
            </strong>
          </span>
          {site.p80Min != null ? (
            <span>
              P80 אתר זה: <strong className="text-foreground">{site.p80Min} דק׳</strong>
              {site.medianMin != null ? ` · P50 ${site.medianMin}` : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">אין P80 מחושב לאתר — ההשוואה לפי טווח צי בלבד</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>
          מדידות: <strong className="text-foreground">{site.samples ?? "—"}</strong>
        </span>
        <span>
          ביטחון: <strong className="text-foreground">{site.confidence || "—"}</strong>
        </span>
        <span>
          ביקור אחרון: <strong className="text-foreground">{fmtDate(site.lastIso)}</strong>
        </span>
        <span>
          מרחק ממחסן החרש:{" "}
          <strong className="text-foreground">
            {formatKm(
              distanceToYardKm(
                hasCoords ? { lat: site.latitude!, lng: site.longitude! } : null,
                "harash",
              ),
            )}
          </strong>
        </span>
      </div>

      {hasCoords ? (
        <div className="overflow-hidden rounded-2xl border border-border/60">
          <iframe
            title="מפת אתר"
            className="h-48 w-full"
            src={osmEmbed(site.latitude!, site.longitude!)}
            loading="lazy"
          />
        </div>
      ) : (
        <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
          אין קואורדינטות בגיליון לאתר זה — המפה והמרחק האווירי לא זמינים.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-2 rounded-2xl border-border/70 p-3 shadow-sm">
          <h4 className="font-bold text-sm">היסטוריית ביקורים בכתובת</h4>
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {history.slice(0, 40).map((v, i) => (
              <div
                key={`${v.dateIso}-${i}`}
                className="rounded-xl border border-border/40 bg-muted/15 px-2.5 py-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-bold">{fmtDate(v.dateIso)}</span>
                  <span className="text-muted-foreground">
                    {v.durationMin != null ? `${v.durationMin} דק׳ שהייה` : "אין משך"}
                    {v.durationMin != null && site.p80Min != null && v.durationMin > site.p80Min ? (
                      <span className="mr-1 font-bold text-violet-800"> · מעל P80</span>
                    ) : null}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-2 text-muted-foreground">
                  {v.driver ? (
                    <span className="inline-flex items-center gap-0.5">
                      <User className="h-3 w-3" />
                      {v.driver}
                    </span>
                  ) : null}
                  {v.truck ? (
                    <span className="inline-flex items-center gap-0.5">
                      <Truck className="h-3 w-3" />
                      {v.truck}
                    </span>
                  ) : null}
                </div>
                {v.notes?.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {v.notes.slice(0, 4).map((nid) => (
                      <Link
                        key={nid}
                        to="/notes/$id"
                        params={{ id: String(nid) }}
                        className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900 hover:bg-emerald-100"
                      >
                        ת.מ. {nid}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {!history.length && (
              <p className="text-muted-foreground">אין היסטוריית ביקורים לאתר זה.</p>
            )}
          </div>
        </Card>

        <Card className="space-y-2 rounded-2xl border-border/70 p-3 shadow-sm">
          <h4 className="font-bold text-sm">זמני PTO בכתובת</h4>
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {ptoRows.slice(0, 40).map((v, i) => (
              <div
                key={`pto-${v.dateIso}-${i}`}
                className="rounded-xl border border-violet-200/60 bg-violet-50/40 px-2.5 py-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-bold">{fmtDate(v.dateIso)}</span>
                  <span className="font-extrabold text-violet-900">{v.ptoMin} דק׳ PTO</span>
                </div>
                <div className="mt-0.5 text-muted-foreground">
                  {[v.driver, v.truck].filter(Boolean).join(" · ") || "—"}
                </div>
                {v.notes?.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {v.notes.slice(0, 3).map((nid) => (
                      <Link
                        key={nid}
                        to="/notes/$id"
                        params={{ id: String(nid) }}
                        className="text-[10px] font-bold text-emerald-800 hover:underline"
                      >
                        ת.מ. {nid}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {!ptoRows.length && (
              <p className="text-muted-foreground">
                אין מדידות PTO מאומתות לכתובת (רק מקור מפורש נספר).
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
