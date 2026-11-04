/**
 * דף ג': קטלוג מוצרים לוגיסטי ויזואלי (מילון_לוגיסט · מאגר_מדיה)
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Search, Warehouse, Package } from "lucide-react";
import {
  getCatalog,
  searchCatalog,
  getMedia,
  type CatalogItem,
  GatewayError,
} from "@/lib/saban-gateway";

export const Route = createFileRoute("/catalog")({
  head: () => ({ meta: [{ title: "קטלוג לוגיסטי · נועה · ח. סבן" }] }),
  component: CatalogPage,
});

function CatalogPage() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [mediaMap, setMediaMap] = useState<Record<string, string>>({});

  const loadInitial = async () => {
    setLoading(true);
    try {
      const res = await getCatalog({ limit: 48, offset: 0 });
      setItems(res.items || []);
      setTotal(res.total ?? null);
    } catch (e) {
      toast.error("טעינת קטלוג נכשלה", {
        description: e instanceof GatewayError ? e.message : e instanceof Error ? e.message : String(e),
      });
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInitial();
  }, []);

  const onSearch = async () => {
    const q = query.trim();
    if (!q) {
      void loadInitial();
      return;
    }
    setLoading(true);
    try {
      const res = await searchCatalog(q);
      const list = res.items || res.products || [];
      setItems(list);
      setTotal(list.length);
    } catch (e) {
      toast.error("חיפוש נכשל", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  const ensureMedia = async (item: CatalogItem) => {
    if (!item.mediaId || mediaMap[item.mediaId] || item.imageUrl) return;
    try {
      const m = await getMedia(item.mediaId);
      const url = m.url || m.imageUrl;
      if (url) setMediaMap((prev) => ({ ...prev, [item.mediaId!]: url }));
    } catch {
      /* optional media */
    }
  };

  useEffect(() => {
    items.slice(0, 24).forEach((it) => {
      void ensureMedia(it);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  return (
    <div dir="rtl">
      <PageHeader
        title="קטלוג לוגיסטי"
        subtitle="מילון_לוגיסט · חיפוש סלנג · מאגר_מדיה"
        action={
          total != null ? (
            <Badge variant="outline" className="font-bold">
              {total.toLocaleString("he-IL")} פריטים
            </Badge>
          ) : null
        }
      />
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-5 md:px-8">
        <Card className="flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 space-y-1 text-xs font-bold">
            חיפוש חופשי / סלנג
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onSearch();
              }}
              placeholder="מלט, בלה חול, סומסום, ניצב, מסלול, מק\"ט…"
              className="h-11"
            />
          </label>
          <Button className="min-h-11 gap-2 font-bold" disabled={loading} onClick={() => void onSearch()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            חפש
          </Button>
        </Card>

        {loading && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted/60" />
            ))}
          </div>
        )}

        {!loading && items.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">לא נמצאו מוצרים</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => {
            const img = it.imageUrl || (it.mediaId ? mediaMap[it.mediaId] : undefined);
            return (
              <Card key={it.sku} className="overflow-hidden rounded-2xl">
                <div className="flex h-28 items-center justify-center bg-muted/40">
                  {img ? (
                    <img src={img} alt={it.name} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Package className="h-10 w-10 text-muted-foreground/50" />
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <div className="text-xs font-mono font-bold text-primary">{it.sku}</div>
                  <div className="text-sm font-extrabold leading-snug">{it.name}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {it.category && <Badge variant="secondary">{it.category}</Badge>}
                    {it.unit && <Badge variant="outline">{it.unit}</Badge>}
                    {it.weightKg != null && (
                      <Badge variant="outline">{it.weightKg} ק\"ג</Badge>
                    )}
                  </div>
                  {it.warehouse && (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Warehouse className="h-3 w-3" />
                      {it.warehouse}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
