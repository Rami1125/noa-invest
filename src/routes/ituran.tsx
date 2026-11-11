/**
 * /ituran — מרכז מודיעין לוגיסטי
 * Stage B: anomalies center
 * SEE ARTIFACT ituran_stage_b_READY.tsx FOR FULL SOURCE — temporary minimal restore
 */
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/ituran")({
  head: () => ({ meta: [{ title: "מודיעין איתוראן — נועה | ח. סבן" }] }),
  component: () => (
    <div className="p-8 text-center" dir="rtl">
      <h1 className="text-xl font-bold">שלב ב׳ בבנייה — שחזור מלא בקרוב</h1>
      <p className="text-sm text-muted-foreground mt-2">אם רואים מסך זה, יש לדחוף מחדש את ituran.tsx המלא.</p>
    </div>
  ),
});
