/**
 * שלבים ב׳+ד׳ — מרכז חריגות + השוואת שהייה לצי/P80
 * שהיות, פתיחות מנוף, PTO פתוח, תעודות לא משויכות + ניווט
 */
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import { israelTime } from "@/lib/smart-dispatch/pto-pairing";
import type { PtoSession } from "@/lib/smart-dispatch/pto-pairing";
import { cn } from "@/lib/utils";

export const STAY_ALERT_MIN = 20;

export function dwellBand(min: number | null | undefined): "ok" | "watch" | "delay" | "severe" | "unknown" {
  if (min == null || !Number.isFinite(min) || min < 0) return "unknown";
  if (min <= STAY_ALERT_MIN) return "ok";
  if (min <= 40) return "watch";
  if (min <= 60) return "delay";
  return "severe";
}

export function dwellBandClass(band: ReturnType<typeof dwellBand>): string {
  switch (band) {
    case "ok":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "watch":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "delay":
      return "border-orange-300 bg-orange-50 text-orange-950";
    case "severe":
      return "border-red-300 bg-red-50 text-red-950";
    default:
      return "border-border/50 bg-muted/20 text-muted-foreground";
  }
}

export function dwellBandLabel(band: ReturnType<typeof dwellBand>): string {
  switch (band) {
    case "ok":
      return "תקין";
    case "watch":
      return "ממושך";
    case "delay":
      return "עיכוב";
    case "severe":
      return "חריג";
    default:
      return "אין נתון";
  }
}

export type LongStayRow = {
  noteId: string;
  customer: string;
  customerNo?: string;
  address: string;
  driver: string;
  plate: string;
  dwell: number;
  band: ReturnType<typeof dwellBand>;
  tier: string;
  ptoMin: number | null;
  kindLabel?: string;
  fleetRangeLabel?: string;
  siteP80?: number | null;
  verdict?: string;
  verdictLabel?: string;
  summaryHe?: string;
  overFleetMin?: number;
  overSiteP80Min?: number;
};

export type AnomaliesData = {
  longStays: LongStayRow[];
  craneOpens: PtoSession[];
  openPto: PtoSession[];
  unmatchedNotes: Array<{
    note: { id: string; customer?: string; customerNo?: string; siteAddress?: string };
    status: string;
    tier: string;
  }>;
  longStayCount: number;
  severeCount: number;
  aboveFleetCount: number;
  aboveSiteP80Count: number;
};

type Props = {
  anomalies: AnomaliesData;
  onOpenSitesTab: (address?: string) => void;
};

export function IturanAnomaliesPanel({ anomalies, onOpenSitesTab }: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 px-4 py-3 text-xs text-amber-950">
        <strong>מרכז חריגות תפעולי</strong> — סף שהייה {STAY_ALERT_MIN} דק׳. צבעים הם סף התראה, לא האשמת נהג.
        שלב ד׳: השוואה לטווח צי (מנוף/פלטה) ול־P80 אתר. ניווט: תעודה · לקוח · כתובת.
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-center">
          <div className="text-[10px] font-semibold text-muted-foreground">שהיות ממושכות</div>
          <div className="font-display text-xl font-extrabold">{anomalies.longStayCount}</div>
        </div>
        <div className="rounded-xl border border-orange-200 bg-orange-50/60 px-3 py-2 text-center">
          <div className="text-[10px] font-semibold text-orange-900">מעל טווח צי</div>
          <div className="font-display text-xl font-extrabold text-orange-950">{anomalies.aboveFleetCount}</div>
        </div>
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2 text-center">
          <div className="text-[10px] font-semibold text-violet-900">מעל P80 אתר</div>
          <div className="font-display text-xl font-extrabold text-violet-950">{anomalies.aboveSiteP80Count}</div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/60 px-3 py-2 text-center">
          <div className="text-[10px] font-semibold text-red-900">חריגות חמורות</div>
          <div className="font-display text-xl font-extrabold text-red-950">{anomalies.severeCount}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 rounded-2xl border-border p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-base font-bold">פתיחות מנוף אחרונות</h3>
            <span className="text-[11px] text-muted-foreground">{anomalies.craneOpens.length} אירועים</span>
          </div>
          <div className="max-h-[32rem] space-y-2 overflow-y-auto">
            {anomalies.craneOpens.slice(0, 40).map((s, i) => {
              const mins = s.durationMin;
              const band = s.orphan === "missing_close" ? "delay" : dwellBand(mins);
              return (
                <div
                  key={`${s.id}-${i}`}
                  className={cn("rounded-xl border px-3 py-2.5 text-sm", dwellBandClass(band))}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold">
                      {s.truck || "—"}
                      {s.driver ? <span className="mr-2 text-xs font-normal opacity-80">· {s.driver}</span> : null}
                    </div>
                    <span className="text-[11px] font-bold">
                      {s.orphan === "missing_close"
                        ? "פתוח כעת"
                        : mins != null
                          ? `${mins} דק׳ · ${dwellBandLabel(band)}`
                          : dwellBandLabel("unknown")}
                    </span>
                  </div>
                  <div className="mt-1 text-xs opacity-90">
                    {s.openIso ? israelTime(s.openIso) : "—"}
                    {" – "}
                    {s.closeIso ? israelTime(s.closeIso) : "פתוח"}
                    {s.date ? ` · ${s.date}` : ""}
                  </div>
                  <div className="mt-0.5 truncate text-xs opacity-80">{s.address || "כתובת לא ידועה"}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.matchedNoteId ? (
                      <Link
                        to="/notes/$id"
                        params={{ id: String(s.matchedNoteId) }}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white/70 px-2 py-1 text-[11px] font-bold text-emerald-900 hover:bg-white"
                      >
                        ת.מ. {s.matchedNoteId} <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      <span className="text-[11px] font-semibold text-amber-800">ללא תעודה משויכת</span>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenSitesTab(s.address || undefined)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-white/50 px-2 py-1 text-[11px] font-semibold hover:bg-white"
                    >
                      היסטוריית אתר
                    </button>
                  </div>
                </div>
              );
            })}
            {!anomalies.craneOpens.length && (
              <p className="text-sm text-muted-foreground">אין פתיחות מנוף בטווח הנתונים.</p>
            )}
          </div>
        </Card>

        <Card className="space-y-3 rounded-2xl border-border p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-base font-bold">אתרים עם שהייה ממושכת</h3>
            <span className="text-[11px] text-muted-foreground">
              מעל {STAY_ALERT_MIN} דק׳ · {anomalies.longStayCount}
            </span>
          </div>
          <div className="max-h-[32rem] space-y-2 overflow-y-auto">
            {anomalies.longStays.slice(0, 40).map((row) => (
              <div
                key={`${row.noteId}-${row.dwell}`}
                className={cn("rounded-xl border px-3 py-2.5 text-sm", dwellBandClass(row.band))}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-bold">{row.address}</div>
                    <div className="text-xs opacity-80">
                      {row.driver} · {row.plate}
                      {row.kindLabel ? ` · ${row.kindLabel}` : ""}
                    </div>
                    {row.summaryHe ? (
                      <div className="mt-0.5 text-[11px] opacity-90">{row.summaryHe}</div>
                    ) : null}
                  </div>
                  <div className="text-left">
                    <div className="font-display text-lg font-extrabold">{row.dwell} דק׳</div>
                    <div className="text-[11px] font-bold">
                      {row.verdictLabel || dwellBandLabel(row.band)}
                    </div>
                    {row.siteP80 != null ? (
                      <div className="text-[10px] opacity-80">P80 אתר: {row.siteP80}</div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    to="/notes/$id"
                    params={{ id: String(row.noteId) }}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white/70 px-2 py-1 text-[11px] font-bold text-emerald-900 hover:bg-white"
                  >
                    ת.מ. {row.noteId} <ExternalLink className="h-3 w-3" />
                  </Link>
                  {row.customerNo ? (
                    <Link
                      to="/customers/$id"
                      params={{ id: String(row.customerNo) }}
                      className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-white/70 px-2 py-1 text-[11px] font-bold text-sky-900 hover:bg-white"
                    >
                      {row.customer} <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : (
                    <span className="text-[11px] opacity-80">{row.customer}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenSitesTab(row.address || undefined)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-white/50 px-2 py-1 text-[11px] font-semibold hover:bg-white"
                  >
                    היסטוריית אתר
                  </button>
                </div>
              </div>
            ))}
            {!anomalies.longStays.length && (
              <p className="text-sm text-muted-foreground">
                אין שהיות מעל {STAY_ALERT_MIN} דק׳ בנתונים שנטענו.
              </p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 rounded-2xl border-border p-4 shadow-sm">
          <h3 className="font-display text-base font-bold">PTO פתוח (חסרה סגירה)</h3>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {anomalies.openPto.map((s, i) => (
              <div
                key={`open-${s.id}-${i}`}
                className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm"
              >
                <div className="font-bold">{s.truck || "—"} · {s.driver || "—"}</div>
                <div className="text-xs text-muted-foreground">
                  נפתח {s.openIso ? israelTime(s.openIso) : "—"} · {s.date || ""}
                </div>
                <div className="truncate text-xs">{s.address || "—"}</div>
                {s.matchedNoteId && (
                  <Link
                    to="/notes/$id"
                    params={{ id: String(s.matchedNoteId) }}
                    className="mt-1 inline-flex text-[11px] font-bold text-emerald-800 hover:underline"
                  >
                    ת.מ. {s.matchedNoteId}
                  </Link>
                )}
              </div>
            ))}
            {!anomalies.openPto.length && (
              <p className="text-sm text-muted-foreground">אין אירועי PTO פתוחים כעת.</p>
            )}
          </div>
        </Card>

        <Card className="space-y-3 rounded-2xl border-border p-4 shadow-sm">
          <h3 className="font-display text-base font-bold">תעודות ללא התאמת GPS</h3>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {anomalies.unmatchedNotes.slice(0, 30).map((m) => (
              <div
                key={m.note.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-bold">ת.מ. {m.note.id}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {m.note.customer} · {m.note.siteAddress || "—"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    to="/notes/$id"
                    params={{ id: String(m.note.id) }}
                    className="rounded-lg border px-2 py-1 text-[11px] font-bold hover:bg-white"
                  >
                    תעודה
                  </Link>
                  {m.note.customerNo && (
                    <Link
                      to="/customers/$id"
                      params={{ id: String(m.note.customerNo) }}
                      className="rounded-lg border px-2 py-1 text-[11px] font-bold hover:bg-white"
                    >
                      לקוח
                    </Link>
                  )}
                </div>
              </div>
            ))}
            {!anomalies.unmatchedNotes.length && (
              <p className="text-sm text-muted-foreground">כל התעודות משויכות או בסטטוס תקין.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
