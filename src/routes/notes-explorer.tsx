/**
 * דף ב': ארכיון תעודות משלוח
 * Gateway: get_delivery_note({ noteNumber, phone, key, action })
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
  SABAN_GATEWAY,
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
  const [noteNumber, setNoteNumber] = useState("6715848");
  const [phone, setPhone] = useState(SABAN_GATEWAY.managers.rami.phone);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<DeliveryNoteResult | null>(null);

  const runSearch = async () => {
    const n = noteNumber.trim();
    const p = phone.trim();
    if (!n) {
      toast.error("הזינו מספר תעודה");
      return;
    }
    if (!p) {
      toast.error("נדרש מספר טלפון מאומת (phone)");
      return;
    }
    setLoading(true);
    setNote(null);
    try {
      const one = await getDeliveryNote(n, p);
      setNote(one);
      if (!one?.driveLink && !one?.driveUrl) {
        toast.message("תעודה נשלפה — ללא driveLink");
      }
    } catch (e) {
      toast.error("שליפת תעודה נכשלה", {
        description:
          e instanceof GatewayError
            ? e.message
            : e instanceof Error
              ? e.message
              : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  const drive = note?.driveLink || note?.driveUrl;
  const customer = note?.customerName || note?.customer;
  const id = note?.noteNumber || note?.noteId || noteNumber;

  const driverLabel = (d?: string) => {
    if (!d) return "—";
    const hit = DRIVER_HINTS.find((h) => d.includes(h.plate) || d.includes(h.label));
    return hit ? `${hit.label} (${hit.plate})` : d;
  };

  return (
    <div dir="rtl">
      <PageHeader
        title="ארכיון תעודות משלוח"
        subtitle="get_delivery_note · noteNumber + phone · Drive PDF"
      />
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-5 md:px-8">
        <Card className="grid gap-3 rounded-2xl p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="space-y-1 text-xs font-bold">
            מספר תעודה (noteNumber)
            <Input
              value={noteNumber}
              onChange={(e) => setNoteNumber(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch();
              }}
              placeholder="6715848"
              className="h-11"
            />
          </label>
          <label className="space-y-1 text-xs font-bold">
            טלפון מאומת (phone)
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="972508860896"
              className="h-11"
              inputMode="tel"
            />
          </label>
          <Button className="min-h-11 gap-2 font-bold" disabled={loading} onClick={() => void runSearch()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            שליפת תעודה
          </Button>
        </Card>

        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/60" />
            ))}
          </div>
        )}

        {note && !loading && (
          <Card className="space-y-4 rounded-2xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-lg font-extrabold">
                  <FileText className="h-5 w-5 text-primary" />
                  תעודה {id}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{customer || "לקוח לא צוין"}</p>
                {note.filename && (
                  <p className="text-[11px] text-muted-foreground">{note.filename}</p>
                )}
                {note.caption && <p className="mt-1 text-xs">{note.caption}</p>}
              </div>
              {note.status && (
                <Badge variant="outline" className="font-bold">{note.status}</Badge>
              )}
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[10px] font-bold text-muted-foreground">תאריך אספקה</dt>
                <dd className="font-semibold">{note.date || "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold text-muted-foreground">כתובת</dt>
                <dd className="font-semibold">{note.address || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
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
                לא התקבל driveLink מהשרת לתעודה זו.
              </p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
