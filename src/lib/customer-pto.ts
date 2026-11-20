/**
 * שליפת וצימוד סשני PTO/מנוף לתיק לקוח
 */
export type PtoRow = Record<string, string>;

export type CustomerPtoSession = {
  eventTimeIso: string;
  openTime?: string;
  closeTime?: string;
  durationMin: number | null;
  truck: string;
  driver: string;
  address: string;
  noteId: string;
  eventType?: string;
  source: string;
};

const normHeader = (h: string) => h.replace(/\u200f|\u200e/g, "").trim();

export const foldKey = (h: string) =>
  normHeader(h)
    .toLowerCase()
    .replace(/[\s`'׳״".,_\-\/\\:()\[\]]+/g, "")
    .replace(/מספר/g, "מס");

export const g = (row: PtoRow, ...keys: string[]) => {
  for (const k of keys) {
    const nk = normHeader(k);
    const v = row[nk] ?? row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  const wanted = keys.map(foldKey).filter(Boolean);
  for (const [hk, hv] of Object.entries(row)) {
    if (hv == null || String(hv).trim() === "") continue;
    const fh = foldKey(hk);
    if (wanted.some((w) => fh === w || (w.length >= 4 && (fh.includes(w) || w.includes(fh))))) {
      return String(hv).trim();
    }
  }
  return "";
};

export const digitsOnly = (v: string) => String(v || "").replace(/\.0+$/, "").replace(/[^0-9]/g, "");

export const num = (v: string | number | null | undefined): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v).replace(/[^\d.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export function buildAddrTokens(parts: string[]): Set<string> {
  return new Set(
    parts
      .join(" ")
      .toLowerCase()
      .replace(/[^\u0590-\u05FFa-z0-9\s]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3),
  );
}

export function rowMatchesCustomer(
  r: PtoRow,
  customerNo: string,
  noteIds: Set<string>,
  nameKey: string,
  addrTokens: Set<string>,
): boolean {
  const no = digitsOnly(g(r, "מס' לקוח", "מספר לקוח", "מס׳ לקוח", "customerNo", "מס לקוח"));
  if (no && no === customerNo) return true;

  const doc = digitsOnly(
    g(r, "מס' תעודה", "מס' תעודת משלוח", "מס׳ תעודת משלוח", "מספר תעודה", "docId", "docNumber", "noteId"),
  );
  if (doc && noteIds.has(doc)) return true;

  const name = g(r, "שם לקוח", "לקוח", "customerName", "customer")
    .toLowerCase()
    .replace(/["'״׳.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (nameKey && name && (name === nameKey || name.includes(nameKey) || nameKey.includes(name))) return true;

  const addr = (g(r, "כתובת", "address", "location", "אתר") || "").toLowerCase();
  if (addr && addrTokens.size) {
    let hits = 0;
    for (const tok of addrTokens) {
      if (addr.includes(tok)) hits++;
    }
    if (hits >= 2) return true;
    if (
      hits >= 1 &&
      /קדימה|צורן|רעננה|הוד/.test(addr) &&
      /קדימה|צורן|רעננה|הוד/.test([...addrTokens].join(" "))
    ) {
      return true;
    }
  }
  return false;
}

function mapPtoRow(r: PtoRow, source: string): CustomerPtoSession | null {
  const eventType = g(r, "eventType", "סוג אירוע", "סוג", "type");
  let open = g(
    r,
    "eventTimeIso",
    "PTO פתיחה",
    "PTO פתיחה (איתוראן)",
    "ptoOpen",
    "ptoOpenTime",
    "openTime",
    "שעת פתיחה",
    "eventTime",
    "openedAt",
  );
  if (!open && /open|פתיח/i.test(eventType)) open = g(r, "eventTimeIso", "eventTime", "time");
  let close = g(
    r,
    "PTO סגירה",
    "PTO סגירה (איתוראן)",
    "ptoClose",
    "ptoCloseTime",
    "closeTime",
    "שעת סגירה",
    "closedAt",
  );
  if (!close && /close|סגיר/i.test(eventType)) close = g(r, "eventTimeIso", "eventTime", "time");
  const duration = num(
    g(r, "PTO משך (דק׳)", "PTO דק׳", "PTO דק", "ptoDurationMin", "ptoMin", "durationMin", "משך דק", "משך"),
  );
  if (!open && !close && duration == null) return null;
  return {
    eventTimeIso: open || close || "",
    openTime: open || undefined,
    closeTime: close || undefined,
    durationMin: duration,
    truck: g(r, "truck", "משאית", "רכב", "רישוי"),
    driver: g(r, "driver", "נהג"),
    address: g(r, "address", "כתובת", "location", "אתר"),
    noteId: digitsOnly(g(r, "docId", "מס' תעודה", "מס' תעודת משלוח", "מס׳ תעודת משלוח", "noteId", "מספר תעודה")),
    eventType: eventType || undefined,
    source,
  };
}

function pairEventRows(
  rows: PtoRow[],
  source: string,
  customerNo: string,
  noteIds: Set<string>,
  nameKey: string,
  addrTokens: Set<string>,
): CustomerPtoSession[] {
  type Ev = { t: number; iso: string; type: string; row: PtoRow };
  const events: Ev[] = [];
  for (const r of rows) {
    if (!rowMatchesCustomer(r, customerNo, noteIds, nameKey, addrTokens)) continue;
    const iso = g(r, "eventTimeIso", "eventTime", "time", "PTO פתיחה", "PTO סגירה");
    if (!iso) continue;
    const t = Date.parse(iso) || 0;
    const type = (g(r, "eventType", "סוג") || "").toLowerCase();
    events.push({ t, iso, type, row: r });
  }
  events.sort((a, b) => a.t - b.t);
  const out: CustomerPtoSession[] = [];
  const used = new Set<number>();
  for (let i = 0; i < events.length; i++) {
    if (used.has(i)) continue;
    const e = events[i]!;
    const isOpen = /open|פתיח/.test(e.type) || !/close|סגיר/.test(e.type);
    if (!isOpen && e.type) continue;
    let closeIdx = -1;
    for (let j = i + 1; j < events.length; j++) {
      if (used.has(j)) continue;
      const c = events[j]!;
      if (!/close|סגיר/.test(c.type)) continue;
      const truckE = g(e.row, "truck", "משאית");
      const truckC = g(c.row, "truck", "משאית");
      if (truckE && truckC && truckE !== truckC) continue;
      closeIdx = j;
      break;
    }
    const openIso = e.iso;
    const closeIso = closeIdx >= 0 ? events[closeIdx]!.iso : "";
    if (closeIdx >= 0) used.add(closeIdx);
    used.add(i);
    let duration: number | null = num(g(e.row, "durationMin", "ptoMin", "PTO דק׳", "PTO דק"));
    if (duration == null && closeIso && openIso) {
      const ms = Date.parse(closeIso) - Date.parse(openIso);
      if (Number.isFinite(ms) && ms > 0) duration = Math.round(ms / 60000);
    }
    out.push({
      eventTimeIso: openIso,
      openTime: openIso,
      closeTime: closeIso || undefined,
      durationMin: duration,
      truck: g(e.row, "truck", "משאית"),
      driver: g(e.row, "driver", "נהג"),
      address: g(e.row, "address", "כתובת"),
      noteId: digitsOnly(g(e.row, "docId", "מס' תעודה", "מס' תעודת משלוח", "noteId")),
      eventType: "pto_session",
      source,
    });
  }
  return out;
}

export type NoteLike = {
  id: string;
  dateIso: string;
  address: string;
  driver: string;
  truck: string;
  craneNotes?: string;
  craneMin?: number | null;
  ptoOpen?: string;
  ptoClose?: string;
  ptoMin?: number | null;
  measureSource?: string;
};

export type IturanLike = {
  noteId: string;
  dateIso: string;
  address: string;
  driver: string;
  truck: string;
  arrival: string;
  departure: string;
  ptoMin: number | null;
};

export type VisitLike = {
  dateIso: string;
  truck: string;
  driver: string;
  address: string;
  noteIds: string[];
  ptoMin: number | null;
};

export function collectCustomerPtoSessions(input: {
  customerNo: string;
  nameKey: string;
  noteIds: Set<string>;
  addrTokens: Set<string>;
  ptoRows: PtoRow[];
  sessionRows: PtoRow[];
  notes: NoteLike[];
  ituranVisits: IturanLike[];
  visits: VisitLike[];
}): CustomerPtoSession[] {
  const { customerNo, nameKey, noteIds, addrTokens, ptoRows, sessionRows, notes, ituranVisits, visits } = input;
  const collected: CustomerPtoSession[] = [];

  collected.push(...pairEventRows(ptoRows, "איתוראן_PTO", customerNo, noteIds, nameKey, addrTokens));
  collected.push(...pairEventRows(sessionRows, "סשנים_PTO", customerNo, noteIds, nameKey, addrTokens));

  for (const r of [...ptoRows, ...sessionRows]) {
    if (!rowMatchesCustomer(r, customerNo, noteIds, nameKey, addrTokens)) continue;
    const s = mapPtoRow(r, "סשנים_PTO");
    if (s) collected.push(s);
  }

  for (const v of ituranVisits) {
    if (v.ptoMin != null && v.ptoMin > 0) {
      collected.push({
        eventTimeIso: v.arrival || v.dateIso,
        openTime: v.arrival,
        closeTime: v.departure,
        durationMin: v.ptoMin,
        truck: v.truck,
        driver: v.driver,
        address: v.address,
        noteId: v.noteId,
        source: "איתוראן_ביקורים",
      });
    }
  }
  for (const v of visits) {
    if (v.ptoMin != null && v.ptoMin > 0) {
      collected.push({
        eventTimeIso: v.dateIso,
        durationMin: v.ptoMin,
        truck: v.truck,
        driver: v.driver,
        address: v.address,
        noteId: (v.noteIds && v.noteIds[0]) || "",
        source: "היסטוריית_ביקורים",
      });
    }
  }

  for (const n of notes) {
    const hasPto = Boolean(n.ptoOpen || n.ptoClose || (n.ptoMin != null && n.ptoMin > 0));
    const hasCrane = Boolean(n.craneNotes || (n.craneMin != null && n.craneMin > 0));
    if (!hasPto && !hasCrane) continue;
    const m = String(n.craneNotes || "").match(/(\d{1,2}:\d{2})\s*[–\-−]\s*(\d{1,2}:\d{2})/);
    const open = n.ptoOpen || (m ? m[1] : undefined);
    const close = n.ptoClose || (m ? m[2] : undefined);
    collected.push({
      eventTimeIso: open
        ? open.includes("T") || open.includes("-")
          ? open
          : `${n.dateIso}T${open}`
        : n.dateIso,
      openTime: open,
      closeTime: close,
      durationMin: n.ptoMin ?? n.craneMin ?? null,
      truck: n.truck,
      driver: n.driver,
      address: n.address,
      noteId: n.id,
      eventType: hasPto ? "archive_pto" : "crane_from_note",
      source: n.measureSource ? `ארכיון (${n.measureSource})` : "ארכיון_תעודות_גליה",
    });
  }

  const seen = new Set<string>();
  return collected
    .filter((s) => {
      const k = `${s.noteId}|${s.openTime || s.eventTimeIso}|${s.closeTime || ""}|${s.durationMin ?? ""}|${s.source}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return Boolean(s.eventTimeIso || s.openTime || s.durationMin != null);
    })
    .sort((a, b) => String(b.eventTimeIso).localeCompare(String(a.eventTimeIso)));
}
