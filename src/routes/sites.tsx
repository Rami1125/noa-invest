import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { getSiteAtlasFn } from "@/lib/customer-history.functions";
import { getMapConfigFn } from "@/lib/map-config.functions";
import {
  generateInteractiveMapHtml,
  isSiteDelayBottleneck,
  getExpectedUnloadingMinutes,
} from "@/lib/sites-map-html";
import { fmtShort } from "@/lib/he-date";
import { cn } from "@/lib/utils";
import {
  Building2, ExternalLink, FileText, MapPin, Search,
  Users, RefreshCw, Filter, AlertTriangle, CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/sites")({
  head: () => ({ meta: [{ title: "אתרי אספקה, זמני פריקה וצווארי בקבוק — ח. סבן" }] }),
  component: SitesPage,
});

type Region = "all" | "sharon" | "center" | "north" | "south";

function getSiteRegion(city: string): Region {
  const c = String(city || "").trim();
  if (["הוד השרון", "כפר סבא", "רעננה", "הרצליה", "רמת השרון"].some((s) => c.includes(s))) return "sharon";
  if (["תל אביב", "רמת גן", "פתח תקווה", "בני ברק"].some((s) => c.includes(s))) return "center";
  if (["נתניה", "טייבה", "עמק חפר"].some((s) => c.includes(s))) return "north";
  if (["ראשון לציון", "חולון", "בת ים", "מודיעין"].some((s) => c.includes(s))) return "south";
  return "sharon";
}

function SitesPage() {
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [expandedKey, setExpandedKey] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<Region>("all");
  const [delayOnlyFilter, setDelayOnlyFilter] = useState(false);

  const q = useQuery({
    queryKey: ["site-atlas"],
    queryFn: () => getSiteAtlasFn(),
    staleTime: 5_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const mapCfg = useQuery({
    queryKey: ["map-config"],
    queryFn: () => getMapConfigFn(),
    staleTime: 300_000,
  });
  const cartoKey = mapCfg.data?.cartoKey || "";
  const data = q.data;

  const delayCountTotal = useMemo(
    () => (data?.sites || []).filter(isSiteDelayBottleneck).length,
    [data],
  );

  const filteredList = useMemo(() => {
    if (!data?.sites) return [];
    let list = data.sites;
    if (delayOnlyFilter) list = list.filter(isSiteDelayBottleneck);
    if (selectedRegion !== "all") list = list.filter((s) => getSiteRegion(s.city) === selectedRegion);
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter((site) =>
        [site.address, site.city, site.customerName, site.customerNo]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(term)),
      );
    }
    return list;
  }, [data, delayOnlyFilter, selectedRegion, search]);

  const selectedSite = useMemo(() => {
    return (
      filteredList.find((s) => (s.siteKey || `${s.city}|${s.address}`) === selectedKey) ||
      filteredList[0]
    );
  }, [filteredList, selectedKey]);

  const mappedCount = filteredList.filter((s) => s.latitude != null && s.longitude != null).length;

  const mapHtml = useMemo(() => {
    return generateInteractiveMapHtml(
      filteredList,
      selectedSite?.siteKey || (selectedSite ? `${selectedSite.city}|${selectedSite.address}` : undefined),
      cartoKey,
    );
  }, [filteredList, selectedSite, cartoKey]);

  const selectedExpectedMin = selectedSite ? getExpectedUnloadingMinutes(selectedSite) : 30;
  const selectedIsDelay = selectedSite ? isSiteDelayBottleneck(selectedSite) : false;

  return (
    <>
      <PageHeader
        title="אתרי אספקה וצווארי בקבוק"
        subtitle={
          data
            ? `${data.sites.length} כתובות · ${mappedCount} סיכות · ${delayCountTotal} מעכבים · מפה: ${cartoKey ? "CARTO" : "CARTO ללא מפתח"}`
            : "טוען…"
        }
        action={
          <button
            type="button"
            onClick={() => void q.refetch()}
            disabled={q.isFetching}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} />
            רענון
          </button>
        }
      />

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-8" dir="rtl">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "אתרים", value: data?.sites.length ?? "—", icon: MapPin },
            { label: "על המפה", value: mappedCount, icon: Building2 },
            { label: "מעכבים", value: delayCountTotal, icon: AlertTriangle },
            { label: "מפתח CARTO", value: cartoKey ? "פעיל" : "חסר", icon: CheckCircle2 },
          ].map((m) => (
            <div key={m.label} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                <m.icon className="h-3.5 w-3.5" />
                {m.label}
              </div>
              <div className={cn("mt-1 font-display text-xl font-extrabold")}>
                {m.value}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {(["all", "sharon", "center", "north", "south"] as Region[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setSelectedRegion(r)}
              className={cn(
                "rounded-xl px-3 py-1.5 text-xs font-bold",
                selectedRegion === r ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted",
              )}
            >
              {r === "all" ? "הכל" : r === "sharon" ? "השרון" : r === "center" ? "מרכז" : r === "north" ? "צפון" : "דרום"}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDelayOnlyFilter((v) => !v)}
            className={cn(
              "rounded-xl px-3 py-1.5 text-xs font-bold",
              delayOnlyFilter ? "bg-red-600 text-white" : "bg-muted/50 hover:bg-muted",
            )}
          >
            מעכבים בלבד
          </button>
          <div className="relative min-w-[12rem] flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש כתובת / לקוח…"
              className="min-h-10 w-full rounded-xl border bg-card py-2 pe-10 ps-3 text-sm"
            />
          </div>
        </div>

        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div>
              <h2 className="font-display font-bold">מפת כתובות</h2>
              <p className="text-xs text-muted-foreground">
                {cartoKey ? "CARTO Basemaps Voyager · מפתח פעיל" : "CARTO ללא מפתח — הגדר CARTO_BASEMAPS_API_KEY ב־Vercel"}
              </p>
            </div>
            {selectedSite?.latitude != null && (
              <a
                className="inline-flex min-h-9 items-center gap-1 rounded-xl border px-3 text-xs font-bold hover:bg-muted"
                href={`https://www.google.com/maps?q=${selectedSite.latitude},${selectedSite.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Google Maps
              </a>
            )}
          </div>
          <iframe
            title="מפת אתרי אספקה"
            srcDoc={mapHtml}
            className="h-[380px] w-full border-0 md:h-[440px]"
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          />
          {selectedSite && (
            <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3 text-sm">
              <MapPin className="h-4 w-4 text-primary" />
              <strong>{selectedSite.address}</strong>
              <span className="text-muted-foreground">{selectedSite.city}</span>
              <span className={cn("rounded-lg px-2 py-0.5 text-xs font-bold", selectedIsDelay ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800")}>
                {selectedIsDelay ? "מעכב" : "שגרתי"} · צפי {selectedExpectedMin} דק׳
              </span>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-lg font-extrabold">רשימת אתרים ({filteredList.length})</h2>
          {filteredList.map((site, i) => {
            const key = site.siteKey || `${site.city}|${site.address}`;
            const expanded = expandedKey === key;
            const isSelected =
              (selectedSite?.siteKey || `${selectedSite?.city}|${selectedSite?.address}`) === key;
            const delay = isSiteDelayBottleneck(site);
            return (
              <article
                key={`${key}-${i}`}
                className={cn(
                  "overflow-hidden rounded-2xl border bg-card shadow-sm",
                  isSelected && "border-primary/40",
                  delay && "border-red-200",
                )}
              >
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    className="flex min-h-12 min-w-0 flex-1 items-start gap-3 rounded-xl text-start"
                  >
                    <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", delay ? "bg-red-100 text-red-700" : "bg-primary/10 text-primary")}>
                      <MapPin className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{site.address}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {[site.city, site.customerName, site.customerNo && `#${site.customerNo}`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <span className="rounded-lg bg-muted/40 px-2 py-1">ביקורים: {site.visits}</span>
                    <span className="rounded-lg bg-muted/40 px-2 py-1">חציון: {site.medianMin != null ? `${site.medianMin}ד׳` : "—"}</span>
                    <span className="rounded-lg bg-muted/40 px-2 py-1">P80: {site.p80Min != null ? `${site.p80Min}ד׳` : "—"}</span>
                    <span className="rounded-lg bg-muted/40 px-2 py-1">צפי: {getExpectedUnloadingMinutes(site)}ד׳</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedKey(expanded ? "" : key)}
                    className="rounded-xl border px-3 py-2 text-xs font-bold hover:bg-muted"
                  >
                    {expanded ? "סגור" : "היסטוריה"}
                  </button>
                </div>
                {expanded && (
                  <div className="border-t bg-muted/20 p-4">
                    {site.customerNo && (
                      <Link
                        to="/customers/$id"
                        params={{ id: String(site.customerNo) }}
                        className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-sky-700 hover:underline"
                      >
                        <Users className="h-3.5 w-3.5" /> תיק לקוח
                      </Link>
                    )}
                    {(site.visitHistory || []).length ? (
                      <ol className="space-y-2">
                        {(site.visitHistory || []).slice(0, 20).map((visit, index) => (
                          <li key={`${visit.dateIso}-${index}`} className="rounded-xl border bg-card p-3 text-xs">
                            <div className="flex flex-wrap justify-between gap-2 font-bold">
                              <span>{visit.dateIso ? fmtShort(visit.dateIso) : "—"}</span>
                              <span className="text-muted-foreground font-normal">
                                {visit.driver}
                                {visit.durationMin != null ? ` · ${visit.durationMin} דק׳` : ""}
                                {visit.ptoMin != null ? ` · PTO ${visit.ptoMin}` : ""}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {(visit.notes || []).map((id) => (
                                <a
                                  key={id}
                                  href={`/notes/${encodeURIComponent(id)}`}
                                  className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-semibold hover:bg-muted"
                                >
                                  <FileText className="h-3 w-3" /> ת.מ. {id}
                                </a>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm text-muted-foreground">אין היסטוריית ביקורים.</p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {!filteredList.length && (
            <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">אין אתרים בסינון.</p>
          )}
        </section>
      </main>
    </>
  );
}
