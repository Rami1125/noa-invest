/**
 * /technical-advisor — יועץ טכני | SABAN TECHNICAL ADVISOR
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  ClipboardCopy,
  History,
  Layers,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { cn } from "@/lib/utils";
import {
  type AdvisorAudience,
  type AdvisorContentType,
  type AdvisorDetailLevel,
  type AdvisorMasterState,
  type AdvisorProduction,
  type AdvisorTargetTool,
  AUDIENCE_LABELS,
  CONTENT_TYPE_LABELS,
  DETAIL_LABELS,
  TOOL_LABELS,
  deleteProduction,
  loadAdvisorMaster,
  loadProductions,
  resetAdvisorMasterToApproved,
  restoreAdvisorMasterVersion,
  saveAdvisorMasterVersion,
  saveProduction,
} from "@/lib/technical-advisor/master";
import { buildAdvisorPrompt } from "@/lib/technical-advisor/prompt-builder";

export const Route = createFileRoute("/technical-advisor")({
  head: () => ({
    meta: [{ title: "יועץ טכני · SABAN TECHNICAL ADVISOR — ח. סבן" }],
  }),
  component: TechnicalAdvisorPage,
});

function TechnicalAdvisorPage() {
  const [master, setMaster] = useState<AdvisorMasterState | null>(null);
  const [masterDraft, setMasterDraft] = useState("");
  const [masterLabel, setMasterLabel] = useState("");
  const [showMaster, setShowMaster] = useState(false);
  const [history, setHistory] = useState<AdvisorProduction[]>([]);

  const [topic, setTopic] = useState("");
  const [contentType, setContentType] = useState<AdvisorContentType>("slides");
  const [audience, setAudience] = useState<AdvisorAudience>("desk");
  const [detailLevel, setDetailLevel] = useState<AdvisorDetailLevel>("professional");
  const [products, setProducts] = useState("");
  const [sources, setSources] = useState("");
  const [notes, setNotes] = useState("");
  const [targetTool, setTargetTool] = useState<AdvisorTargetTool>("notebooklm");

  const [copied, setCopied] = useState(false);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  useEffect(() => {
    const m = loadAdvisorMaster();
    setMaster(m);
    setMasterDraft(m.instructions);
    setHistory(loadProductions());
  }, []);

  const built = useMemo(() => {
    if (!master) return null;
    return buildAdvisorPrompt({
      topic,
      contentType,
      audience,
      detailLevel,
      products,
      sources,
      notes,
      masterVersion: master.activeVersion,
      masterInstructions: master.instructions,
      targetTool,
    });
  }, [master, topic, contentType, audience, detailLevel, products, sources, notes, targetTool]);

  const onCopy = async () => {
    if (!built?.canCopy) return;
    try {
      await navigator.clipboard.writeText(built.prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const onSaveProduction = () => {
    if (!built?.canCopy || !master) return;
    const p: AdvisorProduction = {
      id: `ta-${Date.now()}`,
      createdAt: new Date().toISOString(),
      title: topic.trim().slice(0, 80) || "הפקה",
      topic: topic.trim(),
      contentType,
      audience,
      detailLevel,
      products,
      sources,
      notes,
      masterVersion: master.activeVersion,
      masterSnapshot: master.instructions,
      targetTool,
      prompt: built.prompt,
      status: "ready",
    };
    setHistory(saveProduction(p));
    setSavedFlash("ההפקה נשמרה בהיסטוריה (עם גרסת MASTER)");
    window.setTimeout(() => setSavedFlash(null), 3000);
  };

  const loadFromHistory = (p: AdvisorProduction) => {
    setTopic(p.topic);
    setContentType(p.contentType);
    setAudience(p.audience);
    setDetailLevel(p.detailLevel);
    setProducts(p.products);
    setSources(p.sources);
    setNotes(p.notes);
    setTargetTool(p.targetTool);
  };

  if (!master) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F3F7FB]" dir="rtl">
        <RefreshCw className="h-6 w-6 animate-spin text-[#1769AA]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F7FB]" dir="rtl" lang="he">
      <PageHeader
        title="יועץ טכני"
        subtitle="ידע מקצועי שהופך לפתרון בשטח · SABAN TECHNICAL ADVISOR"
        action={
          <Link
            to="/logistics-dict"
            className="rounded-xl border border-[#1769AA]/30 bg-white px-3 py-2 text-xs font-bold text-[#1769AA]"
          >
            מנוע יצירה / מילון
          </Link>
        }
      />

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
        <section className="grid gap-3 rounded-3xl border border-[#102A43]/15 bg-white p-4 shadow-sm sm:grid-cols-3 md:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#102A43] text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-[#5A6A7A]">MASTER פעיל</div>
              <div className="text-sm font-extrabold text-[#102A43]">{master.activeVersion}</div>
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[#5A6A7A]">עודכן</div>
            <div className="text-sm font-bold text-[#102A43]">
              {new Date(master.updatedAt).toLocaleString("he-IL")}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => setShowMaster((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#1769AA]/30 bg-[#F3F7FB] px-3 py-2 text-xs font-bold text-[#1769AA]"
            >
              <BookOpen className="h-3.5 w-3.5" />
              {showMaster ? "הסתר MASTER" : "צפייה ב-MASTER"}
            </button>
          </div>
        </section>

        <section className="space-y-4 rounded-3xl border border-[#1769AA]/20 bg-white p-5 shadow-sm md:p-6">
          <div className="flex items-center gap-2 border-b border-[#DCE6EF] pb-3">
            <Wrench className="h-5 w-5 text-[#1769AA]" />
            <h2 className="text-lg font-extrabold text-[#102A43]">יצירת הפקה חדשה</h2>
          </div>
          <p className="text-sm text-[#5A6A7A]">
            הזן נושא בלבד — כללי האיכות, המבנה והאמינות נטענים אוטומטית מ־TECHNICAL_ADVISOR_MASTER.
          </p>

          <label className="block text-xs font-bold text-[#102A43]">
            נושא ההפקה *
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="לדוגמה: איטום לקראת החורף"
              className="mt-1.5 w-full rounded-xl border border-[#DCE6EF] bg-[#F3F7FB] px-3 py-2.5 text-sm font-semibold text-[#102A43] outline-none ring-[#1769AA] focus:ring-2"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs font-bold text-[#102A43]">
              סוג תוכן
              <select
                value={contentType}
                onChange={(e) => setContentType(e.target.value as AdvisorContentType)}
                className="mt-1.5 w-full rounded-xl border border-[#DCE6EF] bg-white px-3 py-2.5 text-sm"
              >
                {(Object.keys(CONTENT_TYPE_LABELS) as AdvisorContentType[]).map((k) => (
                  <option key={k} value={k}>
                    {CONTENT_TYPE_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold text-[#102A43]">
              קהל יעד
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as AdvisorAudience)}
                className="mt-1.5 w-full rounded-xl border border-[#DCE6EF] bg-white px-3 py-2.5 text-sm"
              >
                {(Object.keys(AUDIENCE_LABELS) as AdvisorAudience[]).map((k) => (
                  <option key={k} value={k}>
                    {AUDIENCE_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold text-[#102A43]">
              רמת פירוט
              <select
                value={detailLevel}
                onChange={(e) => setDetailLevel(e.target.value as AdvisorDetailLevel)}
                className="mt-1.5 w-full rounded-xl border border-[#DCE6EF] bg-white px-3 py-2.5 text-sm"
              >
                {(Object.keys(DETAIL_LABELS) as AdvisorDetailLevel[]).map((k) => (
                  <option key={k} value={k}>
                    {DETAIL_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-bold text-[#102A43]">
              כלי יעד
              <select
                value={targetTool}
                onChange={(e) => setTargetTool(e.target.value as AdvisorTargetTool)}
                className="mt-1.5 w-full rounded-xl border border-[#DCE6EF] bg-white px-3 py-2.5 text-sm"
              >
                {(Object.keys(TOOL_LABELS) as AdvisorTargetTool[]).map((k) => (
                  <option key={k} value={k}>
                    {TOOL_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-xs font-bold text-[#102A43]">
              מוצרים רלוונטיים (אופציונלי)
              <textarea
                value={products}
                onChange={(e) => setProducts(e.target.value)}
                rows={2}
                placeholder="שמות מוצרים אמיתיים בלבד"
                className="mt-1.5 w-full rounded-xl border border-[#DCE6EF] bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-bold text-[#102A43]">
              מקורות מקצועיים (אופציונלי)
              <textarea
                value={sources}
                onChange={(e) => setSources(e.target.value)}
                rows={2}
                placeholder="מפרט יצרן, קישורים…"
                className="mt-1.5 w-full rounded-xl border border-[#DCE6EF] bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block text-xs font-bold text-[#102A43]">
            הערות מיוחדות
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1.5 w-full rounded-xl border border-[#DCE6EF] bg-white px-3 py-2 text-sm"
            />
          </label>
        </section>

        {built && (
          <section className="space-y-4 rounded-3xl border border-[#102A43]/15 bg-white p-5 shadow-sm md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DCE6EF] pb-3">
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#102A43]">
                <Layers className="h-5 w-5 text-[#20A4C8]" />
                בקרת איכות ופקודה
              </h2>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-bold",
                  built.canCopy
                    ? "bg-emerald-500/15 text-emerald-800"
                    : "bg-amber-500/15 text-amber-900",
                )}
              >
                {built.canCopy ? "מוכן להעתקה" : "דורש השלמה"}
              </span>
            </div>

            <ul className="grid gap-2 sm:grid-cols-2">
              {built.qa.map((q) => (
                <li
                  key={q.id}
                  className={cn(
                    "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-semibold",
                    q.ok
                      ? "border-emerald-200 bg-emerald-50/50 text-emerald-900"
                      : "border-amber-200 bg-amber-50/60 text-amber-950",
                  )}
                >
                  <span className="mt-0.5">{q.ok ? "✓" : "!"}</span>
                  <span>
                    {q.label}
                    {!q.ok && q.hint ? (
                      <span className="mt-0.5 block font-medium opacity-80">{q.hint}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!built.canCopy}
                onClick={onCopy}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white",
                  built.canCopy ? "bg-[#102A43] hover:bg-[#1769AA]" : "cursor-not-allowed bg-[#858B91]",
                )}
              >
                {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
                {copied ? "הועתק" : "העתק פקודה"}
              </button>
              <button
                type="button"
                disabled={!built.canCopy}
                onClick={onSaveProduction}
                className="inline-flex items-center gap-2 rounded-xl border border-[#1769AA]/40 bg-white px-4 py-2.5 text-sm font-bold text-[#1769AA] disabled:opacity-40"
              >
                <Save className="h-4 w-4" />
                שמור בהיסטוריה
              </button>
              {savedFlash ? (
                <span className="self-center text-xs font-bold text-emerald-700">{savedFlash}</span>
              ) : null}
            </div>

            <p className="text-[11px] font-medium text-[#5A6A7A]">
              המערכת מפיקה פקודה מוכנה להעתקה ל־{TOOL_LABELS[targetTool]} — לא קובץ מצגת/סרטון סופי.
            </p>

            <details className="rounded-2xl border border-[#DCE6EF] bg-[#F3F7FB]/80">
              <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[#102A43]">
                תצוגת פקודה ({built.prompt.length.toLocaleString("he-IL")} תווים)
              </summary>
              <pre
                dir="rtl"
                className="max-h-80 overflow-auto whitespace-pre-wrap border-t border-[#DCE6EF] px-4 py-3 text-[11px] leading-relaxed text-[#1C2732]"
              >
                {built.prompt}
              </pre>
            </details>
          </section>
        )}

        <section className="space-y-3 rounded-3xl border border-[#102A43]/10 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#102A43]">
            <History className="h-5 w-5 text-[#1769AA]" />
            היסטוריית הפקות
          </h2>
          {history.length === 0 ? (
            <p className="text-sm text-[#5A6A7A]">אין הפקות שמורות עדיין.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#DCE6EF] bg-[#F3F7FB]/50 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-extrabold text-[#102A43]">{p.title}</div>
                    <div className="text-[11px] font-medium text-[#5A6A7A]">
                      {new Date(p.createdAt).toLocaleString("he-IL")} ·{" "}
                      {CONTENT_TYPE_LABELS[p.contentType]} · {AUDIENCE_LABELS[p.audience]} · MASTER{" "}
                      {p.masterVersion}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => loadFromHistory(p)}
                      className="rounded-lg border border-[#1769AA]/30 px-2.5 py-1.5 text-[11px] font-bold text-[#1769AA]"
                    >
                      טען
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(p.prompt);
                      }}
                      className="rounded-lg border border-[#102A43]/20 px-2.5 py-1.5 text-[11px] font-bold text-[#102A43]"
                    >
                      העתק
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistory(deleteProduction(p.id))}
                      className="rounded-lg border border-red-200 px-2 py-1.5 text-red-600"
                      aria-label="מחק"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {showMaster && (
          <section className="space-y-4 rounded-3xl border border-[#0F766E]/25 bg-white p-5 shadow-sm md:p-6">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#102A43]">
              <Sparkles className="h-5 w-5 text-[#0F766E]" />
              ניהול TECHNICAL_ADVISOR_MASTER
            </h2>
            <textarea
              value={masterDraft}
              onChange={(e) => setMasterDraft(e.target.value)}
              rows={14}
              className="w-full rounded-2xl border border-[#DCE6EF] bg-[#F3F7FB] px-3 py-3 font-mono text-[11px] leading-relaxed text-[#1C2732]"
              dir="rtl"
            />
            <div className="flex flex-wrap gap-2">
              <input
                value={masterLabel}
                onChange={(e) => setMasterLabel(e.target.value)}
                placeholder="תווית גרסה"
                className="rounded-xl border border-[#DCE6EF] px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  const next = saveAdvisorMasterVersion(master, masterDraft, masterLabel || "גרסה ידנית");
                  setMaster(next);
                  setMasterLabel("");
                  setSavedFlash(`MASTER ${next.activeVersion} נשמר`);
                  window.setTimeout(() => setSavedFlash(null), 2500);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F766E] px-4 py-2 text-sm font-bold text-white"
              >
                <Save className="h-4 w-4" />
                שמור גרסה חדשה
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = resetAdvisorMasterToApproved(master);
                  setMaster(next);
                  setMasterDraft(next.instructions);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#102A43]/20 px-4 py-2 text-sm font-bold text-[#102A43]"
              >
                <RotateCcw className="h-4 w-4" />
                שחזור לברירת מחדל
              </button>
            </div>
            <div>
              <div className="mb-2 text-xs font-bold text-[#5A6A7A]">היסטוריית גרסאות</div>
              <ul className="space-y-1">
                {master.history.map((h) => (
                  <li
                    key={h.version}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#DCE6EF] px-3 py-2 text-xs"
                  >
                    <span className="font-bold text-[#102A43]">
                      {h.version} · {h.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = restoreAdvisorMasterVersion(master, h.version);
                        setMaster(next);
                        setMasterDraft(next.instructions);
                      }}
                      className="font-bold text-[#1769AA]"
                    >
                      שחזר
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
