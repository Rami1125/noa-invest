/**
 * תפריט שאלות מהירות לנועה + כרטיס תשובה.
 * השאלות נענות מהגיליון בקוד (askNoaQuick), בלי Gemini ובלי מכסת AI.
 * שימוש בחדר הצ'אט: <NoaQuickMenu onAnswer={…} /> ליד שורת ההקלדה, ו-<NoaAnswerCard …/> להצגת תשובה.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, Check, Database, Sparkles } from "lucide-react";
import { askNoaQuick, QUICK_CATALOG, type QuickDef, type QuickResult } from "@/lib/noa-quick.functions";
import { cn } from "@/lib/utils";

const FONT = "font-[Heebo,system-ui,'Segoe UI',sans-serif]";
const yesterday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(Date.now() - 864e5);
export type QuickAnswer = { question: string; result: QuickResult };

export function NoaQuickMenu({ onAnswer, disabled }: { onAnswer: (a: QuickAnswer) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<QuickDef | null>(null);
  const [p, setP] = useState<Record<string, string>>({ date: yesterday(), days: "7", customer: "", note_id: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const run = async (def: QuickDef) => {
    setBusy(true); setErr("");
    try {
      const params: Record<string, string> = {};
      def.params.forEach((k) => { params[k] = p[k] ?? ""; });
      const result = await askNoaQuick({ data: { id: def.id, params } });
      onAnswer({ question: result.question || def.label, result });
      setOpen(false); setSel(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "שגיאה בשליפת הנתונים"); }
    finally { setBusy(false); }
  };
  const pick = (def: QuickDef) => (def.params.length ? setSel(def) : void run(def));
  const groups = [...new Set(QUICK_CATALOG.map((q) => q.group))];
  const field = "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#1F5FBF]";

  return (
    <div ref={ref} dir="rtl" className={cn("relative", FONT)}>
      <button type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen((o) => !o); setSel(null); }}
        className="flex h-11 items-center gap-2 rounded-xl bg-[#0F1B2D] px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#1c2d47] disabled:opacity-50">
        <Database className="h-4 w-4" aria-hidden /> שאלות מהירות
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div role="menu" className="absolute bottom-full end-0 z-40 mb-2 w-[min(92vw,26rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          {!sel ? (
            <div className="max-h-[60vh] overflow-y-auto py-1">
              <p className="px-4 pb-1 pt-3 text-xs text-slate-500">נענות מהגיליון, בלי AI ובלי מכסה</p>
              {groups.map((g) => (
                <div key={g}>
                  <div className="px-4 pb-1 pt-3 text-[11px] font-bold tracking-wide text-[#1F5FBF]">{g}</div>
                  {QUICK_CATALOG.filter((q) => q.group === g).map((q) => (
                    <button key={q.id} role="menuitem" type="button" onClick={() => pick(q)}
                      className="block w-full px-4 py-2.5 text-start text-sm text-[#0F1B2D] hover:bg-[#EEF1F4] focus-visible:bg-[#EEF1F4] focus-visible:outline-none">
                      {q.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <form className="space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); void run(sel); }}>
              <div className="text-sm font-bold text-[#0F1B2D]">{sel.label}</div>
              {sel.params.includes("date") && <label className="block text-xs text-slate-600">תאריך<input type="date" value={p["date"]} onChange={(e) => setP({ ...p, date: e.target.value })} className={cn(field, "mt-1")} /></label>}
              {sel.params.includes("days") && (
                <label className="block text-xs text-slate-600">טווח
                  <select value={p["days"]} onChange={(e) => setP({ ...p, days: e.target.value })} className={cn(field, "mt-1")}>
                    <option value="7">7 ימים אחרונים</option><option value="14">14 ימים</option><option value="30">30 ימים</option><option value="90">90 ימים</option>
                  </select>
                </label>
              )}
              {sel.params.includes("customer") && <label className="block text-xs text-slate-600">מספר לקוח או חלק מהשם<input value={p["customer"]} onChange={(e) => setP({ ...p, customer: e.target.value })} className={cn(field, "mt-1")} autoFocus /></label>}
              {sel.params.includes("note_id") && <label className="block text-xs text-slate-600">מספר תעודה<input inputMode="numeric" value={p["note_id"]} onChange={(e) => setP({ ...p, note_id: e.target.value })} className={cn(field, "mt-1")} autoFocus /></label>}
              {err && <p className="text-xs text-red-700">{err}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="h-11 flex-1 rounded-xl bg-[#1F5FBF] text-sm font-bold text-white disabled:opacity-60">{busy ? "שולפת…" : "הצגת תשובה"}</button>
                <button type="button" onClick={() => setSel(null)} className="h-11 rounded-xl border border-slate-300 px-4 text-sm">חזרה</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/** כרטיס תשובה ממורכז: תג מקור (גיליון/AI), טקסט, טבלה, מספרי תעודה והעתקה. */
export function NoaAnswerCard({ question, text, source, columns, rows, ids }: { question?: string; text: string; source: "sheet" | "ai"; columns?: string[]; rows?: string[][]; ids?: string[] }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text + (ids?.length ? `\nתעודות: ${ids.join(", ")}` : "")); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ללא הרשאה */ }
  };
  return (
    <article dir="rtl" className={cn("mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm", FONT)}>
      <header className="mb-2 flex items-center justify-between gap-3">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", source === "sheet" ? "bg-emerald-100 text-emerald-900" : "bg-violet-100 text-violet-900")}>
          {source === "sheet" ? <Database className="h-3 w-3" aria-hidden /> : <Sparkles className="h-3 w-3" aria-hidden />}
          {source === "sheet" ? "מהגיליון · ללא AI" : "ניתוח AI"}
        </span>
        <button type="button" onClick={copy} aria-label="העתקת התשובה" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">
          {copied ? <Check className="h-4 w-4 text-emerald-700" /> : <Copy className="h-4 w-4" />}
        </button>
      </header>
      {question && <h3 className="mb-1 text-[15px] font-bold text-[#0F1B2D]">{question}</h3>}
      <p className="whitespace-pre-line text-[15px] leading-7 text-[#0F1B2D]">{text}</p>
      {rows && rows.length > 0 && columns && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-[#EEF1F4] text-xs text-slate-600"><tr>{columns.map((c) => <th key={c} className="px-3 py-2 text-start font-semibold">{c}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-slate-100">{r.map((c, j) => <td key={j} className="px-3 py-2 tabular-nums">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      {ids && ids.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="מספרי תעודה">
          {ids.slice(0, 20).map((id) => <span key={id} className="rounded-full bg-[#EEF1F4] px-2.5 py-1 text-xs tabular-nums text-slate-700">{id}</span>)}
        </div>
      )}
    </article>
  );
}
