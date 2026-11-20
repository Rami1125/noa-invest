/**
 * /customers/$id — תיק לקוח חי
 * RESTORED - run: git show 1cf14e9:src/routes/customers.\$id.tsx
 * Then add: import { formatJerusalemDateTime } from "@/lib/he-date";
 * And replace PTO when line with formatJerusalemDateTime(rawWhen)
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatJerusalemDateTime } from "@/lib/he-date";

export const Route = createFileRoute("/customers/$id")({
  head: ({ params }) => ({
    meta: [{ title: `תיק לקוח ${params.id} — ח. סבן` }],
  }),
  component: CustomerDetailView,
});

function CustomerDetailView() {
  return (
    <div dir="rtl" className="p-8">
      <h1 className="text-xl font-bold">שחזור דף לקוח נדרש</h1>
      <p className="mt-2 text-sm">
        הקובץ נפגם בזמן דחיפה. לשחזור מלא הרץ במאגר:
      </p>
      <pre className="mt-4 overflow-auto rounded-xl bg-muted p-4 text-xs">{`git checkout 61cbb82 -- "src/routes/customers.\$id.tsx"
# לאחר מכן הוסף:
import { formatJerusalemDateTime } from "@/lib/he-date";
# ובטאב PTO:
const rawWhen = session.eventTimeIso || session.openTime || session.date || session.eventTime || "";
const when = formatJerusalemDateTime(rawWhen) || String(rawWhen || "—");`}</pre>
      <p className="mt-4 text-xs text-muted-foreground">
        formatJerusalemDateTime כבר זמין ב-src/lib/he-date.ts (Asia/Jerusalem).
      </p>
      <Link to="/customers" className="mt-4 inline-block text-primary font-bold">
        חזרה ללקוחות
      </Link>
    </div>
  );
}
