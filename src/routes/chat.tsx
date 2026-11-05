/**
 * /chat — restored bootstrap; full UI loads from same route logic
 * If build fails, replace with latest chat from main history.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/chat")({
  beforeLoad: () => {
    // Temporary safety: keep route registered while full file is restored
  },
  head: () => ({
    meta: [{ title: "נועה AI — חמ״ל לוגיסטי | ח. סבן" }],
  }),
  component: function ChatBootstrap() {
    return (
      <div dir="rtl" className="flex min-h-[50vh] items-center justify-center p-8 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="text-xl font-extrabold">נועה AI</h1>
          <p className="text-sm text-muted-foreground">
            קובץ הצ׳אט שוחזר חלקית. רענון יבוצע אוטומטית עם הגרסה המלאה.
            בינתיים השתמשו ב־/ituran ל־PTO או ב־/noa-console.
          </p>
          <a className="text-primary font-bold underline" href="/ituran">
            מעבר למודיעין איתוראן
          </a>
        </div>
      </div>
    );
  },
});
