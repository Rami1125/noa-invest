/**
 * /train — סימולטור אימון נועה (WhatsApp · Kapso-style)
 * מפנה לגרסה המלאה ב-public/train.html עד לסנכרון מלא של הרכיב React.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/train")({
  head: () => ({
    meta: [
      { title: "אימון נועה · WhatsApp Simulator | ח. סבן" },
      {
        name: "description",
        content: "סימולטור אימון Kapso-style: תפריטים, כפתורים וכלים של נועה AI.",
      },
    ],
  }),
  component: TrainRedirect,
});

function TrainRedirect() {
  useEffect(() => {
    // סימולטור מלא (HTML עצמאי) — כולל פרופילים, כפתורים ויומן כלים
    window.location.replace("/train.html");
  }, []);

  return (
    <div
      dir="rtl"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-[#0b141a] p-6 text-slate-100"
    >
      <p className="text-lg font-bold">טוען סימולטור אימון נועה…</p>
      <a
        href="/train.html"
        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white"
      >
        פתח סימולטור WhatsApp
      </a>
    </div>
  );
}
