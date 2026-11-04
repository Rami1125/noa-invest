/**
 * דף ב': ארכיון תעודות משלוח (Delivery Notes Explorer)
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Search, FileText, ExternalLink, Truck } from "lucide-react";
import {
  getDeliveryNote,
  searchDeliveryNotes,
  type DeliveryNoteResult,
  GatewayError,
} from "@/lib/saban-gateway";

export const Route = createFileRoute("/notes-explorer")({
  head: () => ({ meta: [{ title: "ארכיון תעודות · נועה · ח. סבן" }] }),
  component: NotesExplorerPage,
});

const DRIVER_HINTS = [
  { plate: "615-41-002", label: "חכמת מנוף" },
  { plate: "651-51-701", label: "עלי פלטה" },
] as const;

function NotesExplorerPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<DeliveryNoteResult | null>(null);
  const [list, setList] = useState<DeliveryNoteResult[]>([]);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) {
      toast.error("הזינו מספר תעודה או שם לקוח");
      return;
    }
    setLoading(true);
    setNote(null);
    setList([]);
    try {
      // Try precise note first, then list search
      try {
        const one = await getDeliveryNote(q);
        if (one && (one.noteId || one.customer || one.driveLink || one.driveUrl)) {
          setNote(one);
          return;
        }
      } catch {
        /* fall through to search */
      }
      const res = await searchDeliveryNotes(q);
      const items = res.notes || res.items || [];
      setList(items);
      if (items.length === 1) setNote(items[0]!);
      if (items.length === 0) toast.message("לא נמצאו תעודות");
    } catch (e) {
      toast.error("שליפת תעודה נכשלה", {
        description: e instanceof GatewayError ? e.message : e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  const drive =
    note?.driveLink || note?.driveUrl || (note as { pdfUrl?: string } | null)?.pdfUrl;

  const driverLabel = (d?: string) => {
    if (!d) return "—";
    const hit = DRIVER_HINTS.find((h) => d.includes(h.plate) || d.includes(h.label));
    return hit ? `${hit.label} (${hit.plate})` : d;
  };

  return (
    <div dir="rtl">
      <PageHeader
        title="ארכיון תעודות משלוח"
        subtitle="חיפוש לפי מספר תעודה / לקוח · PDF חתום ב-Drive"
      />
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-5 md:px-8">
        <Card className="flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 space-y-1 text-xs font-bold">
            מספר תעודה או שם לקוח
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch();
              }}
              placeholder="לדוגמה: 6196219 או שם לקוח"
              className="h-11"
            />
          </label>
          <Button
            className="min-h-11 gap-2 font-bold"
            disabled={loading}
            onClick={() => void runSearch()}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            חפש תעודה
          </Button>
        </Card>

        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-2xl bg-muted/60"
              />
            ))}
          </div>
        )}

        {note && !loading && (
          <Card className="space-y-4 rounded-2xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-lg font-extrabold">
                  <FileText className="h-5 w-5 text-primary" />
                  תעודה {note.noteId || query}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {note.customer || "לקוח לא צוין"}
                </p>
              </div>
              {note.status && (
                <Badge variant="outline" className="font-bold">
                  {note.status}
                </Badge>
              )}
            </div>

            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-[10px] font-bold text-muted-foreground">תאריך אספקה</dt>
                <dd className="font-semibold">{note.date || "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold text-muted-foreground">כתובת</dt>
                <dd className="font-semibold">{note.address || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                  <Truck className="h-3 w-3" /> נהג
                </dt>
                <dd className="font-semibold">{driverLabel(note.driver)}</dd>
              </div>
            </dl>

            {drive ? (
              <Button
                className="min-h-11 w-full gap-2 font-bold sm:w-auto"
                onClick={() => window.open(String(drive), "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="h-4 w-4" />
                צפה בתעודה חתומה (PDF)
              </Button>
            ) : (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                לא התקבל קישור Drive (driveLink) מהשרת לתעודה זו.
              </p>
            )}
          </Card>
        )}

        {list.length > 1 && !loading && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-foreground">
              {list.length} תוצאות — בחרו תעודה
            </p>
            {list.map((n, i) => (
              <button
                key={`${n.noteId || i}`}
                type="button"
                onClick={() => setNote(n)}
                className="flex w-full flex-col items-start gap-0.5 rounded-xl border px-4 py-3 text-start hover:bg-muted/50"
              >
                <span className="font-bold">
                  {n.noteId || "ללא מזהה"} · {n.customer || "—"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {[n.date, n.address, n.driver].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
