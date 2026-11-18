import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  ExternalLink,
  Layers,
  Package,
  Plus,
  Route as RouteIcon,
  Sparkles,
  Truck,
  Warehouse,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { validCoordinates, warehouses, type SiteRecord } from "@/lib/sites-model";

export interface PlannedStopLoad {
  siteId: string;
  docNo: string;
  unloadBags: number;
  unloadPallets: number;
  unloadTons: number;
  pickupBags: number;
  pickupPallets: number;
  hasWaste: boolean;
}

interface DeliveryPlannerProps {
  allSites: SiteRecord[];
  plannedIds: string[];
  origin: string;
  onChangeOrder: (nextIds: string[]) => void;
  onRemove: (id: string) => void;
  onAdd: (id: string) => void;
  onNotify: (msg: string) => void;
}

const DRIVERS = [
  { id: "hikmat", name: "חכמת גאבר · מנוף (615-41-002)", maxTons: 24 },
  { id: "ali", name: "עלי · משאית פתוחה", maxTons: 15 },
];

export default function DeliveryPlanner({
  allSites,
  plannedIds,
  origin,
  onChangeOrder,
  onRemove,
  onAdd,
  onNotify,
}: DeliveryPlannerProps) {
  const [driverId, setDriverId] = useState("hikmat");
  const [departureTime, setDepartureTime] = useState("06:30");
  const [addSearch, setAddSearch] = useState("");
  const [loads, setLoads] = useState<Record<string, PlannedStopLoad>>({});
  const [copied, setCopied] = useState(false);

  const driver = DRIVERS.find((d) => d.id === driverId) || DRIVERS[0];
  const warehouse = warehouses.find((w) => w.id === origin) || warehouses[0];

  const getLoad = (siteId: string): PlannedStopLoad =>
    loads[siteId] || {
      siteId,
      docNo: "",
      unloadBags: 0,
      unloadPallets: 0,
      unloadTons: 0,
      pickupBags: 0,
      pickupPallets: 0,
      hasWaste: false,
    };

  const updateLoad = (siteId: string, patch: Partial<PlannedStopLoad>) => {
    setLoads((prev) => ({
      ...prev,
      [siteId]: { ...getLoad(siteId), ...patch },
    }));
  };

  const plannedSites = useMemo(
    () =>
      plannedIds
        .map((id) => allSites.find((s) => s.id === id))
        .filter((s): s is SiteRecord => Boolean(s)),
    [plannedIds, allSites],
  );

  const quickAddCandidates = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    if (!q) return [];
    return allSites
      .filter(
        (s) =>
          !plannedIds.includes(s.id) &&
          (s.customer.toLowerCase().includes(q) ||
            s.address.toLowerCase().includes(q) ||
            s.city.toLowerCase().includes(q)),
      )
      .slice(0, 6);
  }, [allSites, plannedIds, addSearch]);

  const totals = useMemo(() => {
    let unloadTons = 0;
    let unloadBags = 0;
    let pickupItems = 0;
    let totalP80 = 0;
    let criticalCount = 0;

    plannedSites.forEach((s) => {
      const l = getLoad(s.id);
      unloadTons += Number(l.unloadTons) || 0;
      unloadBags += Number(l.unloadBags) || 0;
      pickupItems += (Number(l.pickupBags) || 0) + (Number(l.pickupPallets) || 0);
      totalP80 += Number(s.p80Min) || 0;
      if ((s.p80Min ?? 0) >= 26) criticalCount++;
    });

    return {
      unloadTons: Math.round(unloadTons * 100) / 100,
      unloadBags,
      pickupItems,
      totalP80,
      criticalCount,
    };
  }, [plannedSites, loads]);

  const moveStop = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= plannedIds.length) return;
    const next = [...plannedIds];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    onChangeOrder(next);
  };

  // אלגוריתם סידור תחנות: ציר צפון->דרום + דחיית איסוף פקדונות גדול לסוף מקטע העיר + חזרה להוד השרון בסוף
  const optimizeRouteOrder = () => {
    if (plannedSites.length < 2) return;
    const scored = [...plannedSites].sort((a, b) => {
      const aHome = a.city.includes("הוד השרון") ? 1 : 0;
      const bHome = b.city.includes("הוד השרון") ? 1 : 0;
      if (aHome !== bHome) return aHome - bHome; // תחנות קרובות למחסן בסוף הסבב

      const loadA = getLoad(a.id);
      const loadB = getLoad(b.id);
      const pickupScoreA = loadA.pickupBags + loadA.pickupPallets + (loadA.hasWaste ? 5 : 0);
      const pickupScoreB = loadB.pickupBags + loadB.pickupPallets + (loadB.hasWaste ? 5 : 0);
      if (Math.abs(pickupScoreA - pickupScoreB) >= 4) {
        return pickupScoreA - pickupScoreB; // איסוף גדול אחרי פריקה
      }

      if (validCoordinates(a.lat, a.lng) && validCoordinates(b.lat, b.lng)) {
        return b.lat - a.lat; // מצפון לדרום
      }
      return 0;
    });

    onChangeOrder(scored.map((s) => s.id));
    onNotify("סדר התחנות אופס ודורג לפי משקל, פקדונות וכיוון נסיעה");
  };

  // סדר העמסה במחסן: LIFO (מהקבינה אחורה = תחנה אחרונה קרובה לקבינה)
  const loadingPlan = useMemo(() => {
    const reversed = [...plannedSites].reverse();
    return reversed.map((site, idx) => {
      const l = getLoad(site.id);
      let zone = "מרכז הארגז";
      if (idx === 0) zone = "צמוד לקבינה (לפריקה אחרונה)";
      else if (idx === reversed.length - 1) zone = "קצה אחורי (לפריקה ראשונה מהירה)";
      return { site, load: l, zone, deliveryIndex: reversed.length - idx };
    });
  }, [plannedSites, loads]);

  const googleMapsRouteUrl = useMemo(() => {
    if (!plannedSites.length) return "";
    const originStr = validCoordinates(warehouse.lat, warehouse.lng)
      ? `${warehouse.lat},${warehouse.lng}`
      : warehouse.address;
    const stops = plannedSites.map((s) =>
      validCoordinates(s.lat, s.lng) ? `${s.lat},${s.lng}` : `${s.address} ${s.city}`,
    );
    const dest = stops[stops.length - 1];
    const waypoints = stops.slice(0, -1).join("|");
    const params = new URLSearchParams({
      api: "1",
      origin: originStr,
      destination: dest,
      travelmode: "driving",
    });
    if (waypoints) params.set("waypoints", waypoints);
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }, [plannedSites, warehouse]);

  const copyWhatsAppDispatch = async () => {
    const stopsText = plannedSites
      .map((s, i) => {
        const l = getLoad(s.id);
        const unload = [
          l.unloadBags ? `${l.unloadBags} בלות` : "",
          l.unloadPallets ? `${l.unloadPallets} משטחים` : "",
          l.unloadTons ? `~${l.unloadTons} טון` : "",
        ]
          .filter(Boolean)
          .join(", ");
        const pickup = [
          l.pickupBags ? `${l.pickupBags} בלות` : "",
          l.pickupPallets ? `${l.pickupPallets} משטחים` : "",
          l.hasWaste ? "פינוי פסולת" : "",
        ]
          .filter(Boolean)
          .join(", ");
        return `${i + 1}. *${s.customer}* (${s.address})${l.docNo ? ` | תעודה ${l.docNo}` : ""}${unload ? `\n   פריקה: ${unload}` : ""}${pickup ? `\n   איסוף חזור: ${pickup}` : ""}`;
      })
      .join("\n");

    const loadText = loadingPlan
      .map(
        (item, idx) =>
          `${idx + 1}. ${item.zone}: ${item.site.customer} (${item.load.unloadBags || 0} בלות, ${item.load.unloadPallets || 0} משטחים)`,
      )
      .join("\n");

    const msg =
      `*סידור עבודה והעמסה · ח. סבן*\n` +
      `נהג: ${driver.name}\n` +
      `מוצא: ${warehouse.name} | יציאה: ${departureTime}\n` +
      `סה"כ משקל פריקה: ~${totals.unloadTons} טון | זמן פריקה משוער (P80): ${totals.totalP80} דק'\n\n` +
      `*סדר תחנות:*\n${stopsText}\n\n` +
      `*הנחיות העמסה מהקבינה אחורה:*\n${loadText}` +
      (googleMapsRouteUrl ? `\n\n*מסלול ניווט:*\n${googleMapsRouteUrl}` : "");

    await navigator.clipboard.writeText(msg);
    setCopied(true);
    onNotify("הודעת הסידור והעמסה הועתקה ל־WhatsApp");
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className="space-y-4">
      {/* סרגל הגדרות סבב עליון */}
      <div className="grid gap-3 md:grid-cols-4 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
        <label className="text-xs font-semibold text-slate-700 space-y-1">
          <span className="flex items-center gap-1.5">
            <Truck size={14} /> נהג ומשאית
          </span>
          <select
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className="w-full min-h-10 rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-bold"
          >
            {DRIVERS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-semibold text-slate-700 space-y-1">
          <span>שעת יציאה</span>
          <input
            type="time"
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            className="w-full min-h-10 rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-bold"
          />
        </label>

        <div className="text-xs space-y-1">
          <span className="text-slate-500 font-semibold">עומס סבב מצטבר</span>
          <div className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 flex items-center justify-between font-bold">
            <span>{totals.unloadTons} / {driver.maxTons} טון</span>
            <span className="text-[#1769AA]">P80: {totals.totalP80}ד׳</span>
          </div>
        </div>

        <div className="flex items-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={optimizeRouteOrder}
            disabled={plannedSites.length < 2}
            className="w-full min-h-10 text-xs font-bold"
          >
            <Sparkles size={14} />
            חשב סדר אופטימלי
          </Button>
        </div>
      </div>

      {/* התראת עומס/משקל */}
      {(totals.unloadTons > driver.maxTons || totals.criticalCount >= 2) && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-900 flex items-center gap-2">
          <AlertTriangle size={16} className="shrink-0" />
          <span>
            {totals.unloadTons > driver.maxTons
              ? `חריגת משקל משוערת (${totals.unloadTons} טון מעל מגבלת ${driver.maxTons} טון). `
              : ""}
            {totals.criticalCount >= 2
              ? `בסבב ${totals.criticalCount} אתרים קריטיים (≥26 דק׳ פריקה) — מומלץ לתכנן באפר זמן.`
              : ""}
          </span>
        </div>
      )}

      {/* הוספה מהירה מתוך טאב התכנון */}
      <div className="relative">
        <input
          type="search"
          value={addSearch}
          onChange={(e) => setAddSearch(e.target.value)}
          placeholder="הוסף תחנה מהירה לסבב לפי שם לקוח, כתובת או עיר..."
          className="w-full min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs"
        />
        {quickAddCandidates.length > 0 && (
          <div className="mt-1 rounded-xl border border-slate-200 bg-white shadow-md divide-y divide-slate-100">
            {quickAddCandidates.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onAdd(s.id);
                  setAddSearch("");
                }}
                className="w-full px-3 py-2 text-right text-xs hover:bg-slate-50 flex items-center justify-between"
              >
                <span>
                  <strong>{s.customer}</strong> · {s.address}
                </span>
                <span className="inline-flex items-center gap-1 text-[#1769AA] font-bold">
                  <Plus size={13} /> הוסף
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* רשימת תחנות עם פירוט פריקה ואיסוף */}
      {plannedSites.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
          בחר אתרים מהמפה או מהחיפוש המהיר למעלה כדי לבנות סבב והוראות העמסה.
        </div>
      ) : (
        <div className="space-y-2.5">
          {plannedSites.map((s, idx) => {
            const l = getLoad(s.id);
            return (
              <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full bg-[#102A43] text-white text-xs font-bold grid place-items-center shrink-0">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="font-bold text-sm text-[#102A43]">{s.customer}</div>
                      <div className="text-xs text-slate-500">
                        {s.address} {s.p80Min !== null ? `· P80: ${s.p80Min} דק׳` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" disabled={idx === 0} onClick={() => moveStop(idx, -1)} aria-label="הזז למעלה">
                      <ArrowUp size={15} />
                    </Button>
                    <Button variant="ghost" size="icon" disabled={idx === plannedSites.length - 1} onClick={() => moveStop(idx, 1)} aria-label="הזז למטה">
                      <ArrowDown size={15} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onRemove(s.id)} aria-label="הסר מהסבב">
                      <X size={15} />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-[11px]">
                  <label className="space-y-0.5">
                    <span className="text-slate-500">תעודה</span>
                    <input
                      type="text"
                      value={l.docNo}
                      placeholder="6716..."
                      onChange={(e) => updateLoad(s.id, { docNo: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-slate-500">פריקה (בלות)</span>
                    <input
                      type="number"
                      min={0}
                      value={l.unloadBags || ""}
                      onChange={(e) => updateLoad(s.id, { unloadBags: Number(e.target.value) || 0 })}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-slate-500">פריקה (משטחים)</span>
                    <input
                      type="number"
                      min={0}
                      value={l.unloadPallets || ""}
                      onChange={(e) => updateLoad(s.id, { unloadPallets: Number(e.target.value) || 0 })}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-slate-500">משקל (טון)</span>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={l.unloadTons || ""}
                      onChange={(e) => updateLoad(s.id, { unloadTons: Number(e.target.value) || 0 })}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-slate-500">איסוף (בלות/מש׳)</span>
                    <input
                      type="number"
                      min={0}
                      value={l.pickupBags || ""}
                      onChange={(e) => updateLoad(s.id, { pickupBags: Number(e.target.value) || 0 })}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1"
                    />
                  </label>
                  <label className="flex items-end pb-1.5 gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={l.hasWaste}
                      onChange={(e) => updateLoad(s.id, { hasWaste: e.target.checked })}
                    />
                    <span className="font-semibold text-slate-700">פינוי פסולת</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* הנחיות העמסה במחסן (מהקבינה אחורה) */}
      {loadingPlan.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2.5">
          <div className="flex items-center gap-2 font-bold text-sm text-[#102A43]">
            <Layers size={16} className="text-[#1769AA]" />
            הנחיות העמסה במחסן ({warehouse.name}) — מהקבינה אחורה
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {loadingPlan.map((item, i) => (
              <div key={item.site.id} className="rounded-xl border border-slate-200 bg-white p-2.5 text-xs">
                <div className="font-bold text-[#1769AA]">
                  {i + 1}. {item.zone}
                </div>
                <div className="font-semibold text-[#102A43] mt-0.5">
                  {item.site.customer} (תחנה #{item.deliveryIndex} בפריקה)
                </div>
                <div className="text-slate-500 mt-0.5 flex items-center gap-1">
                  <Package size={12} />
                  {item.load.unloadBags} בלות · {item.load.unloadPallets} משטחים · ~{item.load.unloadTons} טון
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* כפתורי פעולה לסיום */}
      {plannedSites.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={copyWhatsAppDispatch} className="min-h-11">
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "הועתק!" : "העתק סידור והעמסה ל־WhatsApp"}
          </Button>
          {googleMapsRouteUrl && (
            <Button variant="outline" asChild className="min-h-11">
              <a href={googleMapsRouteUrl} target="_blank" rel="noreferrer">
                <RouteIcon size={16} />
                פתח מסלול ב־Google Maps
                <ExternalLink size={14} />
              </a>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
