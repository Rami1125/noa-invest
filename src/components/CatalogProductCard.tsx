import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Image as ImageIcon, Link2, Loader2, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { mediaFn, upsertProductMediaFn, deleteProductMediaFn } from "@/lib/noa-gateway.functions";

export type CatalogProduct = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  weightKg: number;
  warehouse: string;
  imageUrl?: string;
  mediaCode?: string;
};

const str = (value: unknown) => (value == null ? "" : String(value));

/** Drive /file/d/ID/view does not render in <img> — convert to direct view URL */
function toDisplayableImageUrl(raw: string): string {
  const url = str(raw).trim();
  if (!url) return "";

  if (
    url.includes("uc?export=") ||
    url.includes("uc?id=") ||
    url.includes("googleusercontent.com") ||
    url.includes("lh3.googleusercontent.com")
  ) {
    return url;
  }

  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1?.[1]) {
    return `https://drive.google.com/uc?export=view&id=${m1[1]}`;
  }

  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2?.[1] && url.includes("drive.google.com")) {
    return `https://drive.google.com/uc?export=view&id=${m2[1]}`;
  }

  return url;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-muted-foreground">{label}</div>
      <strong className="text-xs">{value || "-"}</strong>
    </div>
  );
}

function ProductImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const display = toDisplayableImageUrl(src);

  useEffect(() => {
    setFailed(false);
  }, [display]);

  if (!display || failed) {
    return (
      <div className={`grid place-items-center bg-muted ${className || ""}`}>
        <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
      </div>
    );
  }

  return (
    <img
      src={display}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={className || "h-full w-full object-contain"}
      onError={() => setFailed(true)}
    />
  );
}

export function CatalogProductCard({ product }: { product: CatalogProduct }) {
  const defaultCode = product.mediaCode || (product.sku ? `SKU_${product.sku}` : "");
  const [editing, setEditing] = useState(false);
  const [urlDraft, setUrlDraft] = useState(product.imageUrl || "");
  const [codeDraft, setCodeDraft] = useState(defaultCode);
  const [localUrl, setLocalUrl] = useState(product.imageUrl || "");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<"save" | "delete" | "load" | null>(null);
  const [autoTried, setAutoTried] = useState(false);

  const media = useQuery({
    queryKey: ["noa-product-media", product.sku, codeDraft],
    queryFn: () =>
      mediaFn({
        data: {
          sku: product.sku,
          mediaCode: codeDraft || defaultCode || product.sku,
        },
      }),
    enabled: false,
    staleTime: 300_000,
  });

  const mediaResult = media.data || {};
  const rawUrl =
    localUrl ||
    product.imageUrl ||
    str(
      mediaResult.imageUrl ||
        mediaResult.url ||
        mediaResult.directUrl ||
        mediaResult.driveLink,
    );
  const imageUrl = toDisplayableImageUrl(rawUrl);

  const applyMediaPayload = (d: Record<string, unknown>) => {
    const u = str(
      d.imageUrl || d.url || d.directUrl || d.driveLink || (d as { link?: string }).link,
    );
    if (u) {
      setLocalUrl(u);
      setUrlDraft(u);
      return u;
    }
    return "";
  };

  const loadMedia = async (silent = false) => {
    setBusy("load");
    if (!silent) setStatus("");
    try {
      const res = await media.refetch();
      const d = (res.data || {}) as Record<string, unknown>;
      const u = applyMediaPayload(d);
      if (u) {
        if (!silent) setStatus("תמונה נטענה ממאגר_מדיה");
      } else if (!silent) {
        setStatus('לא נמצאה מדיה לקוד זה (בדקו mediaCode / מק"ט_מקושר)');
      }
    } catch (e) {
      if (!silent) setStatus(e instanceof Error ? e.message : "טעינה נכשלה");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (autoTried) return;
    if (localUrl || product.imageUrl) return;
    if (!product.sku) return;
    setAutoTried(true);
    void loadMedia(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.sku, product.imageUrl, localUrl, autoTried]);

  const saveMedia = async () => {
    const url = urlDraft.trim();
    const mediaCode = (codeDraft || defaultCode).trim();
    if (!product.sku) {
      setStatus('חסר מק"ט למוצר');
      return;
    }
    if (!url) {
      setStatus("חסר קישור תמונה");
      return;
    }
    setBusy("save");
    setStatus("");
    try {
      await upsertProductMediaFn({
        data: { sku: product.sku, url, mediaCode, name: product.name },
      });
      setLocalUrl(url);
      setEditing(false);
      setStatus("נשמר בגיליון");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "שמירה נכשלה");
    } finally {
      setBusy(null);
    }
  };

  const removeMedia = async () => {
    if (!product.sku) return;
    if (!confirm(`למחוק קישור תמונה למוצר ${product.sku}?`)) return;
    setBusy("delete");
    setStatus("");
    try {
      await deleteProductMediaFn({
        data: {
          sku: product.sku,
          mediaCode: (codeDraft || defaultCode).trim(),
        },
      });
      setLocalUrl("");
      setUrlDraft("");
      setEditing(false);
      setStatus("הקישור נמחק מהגיליון");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "מחיקה נכשלה");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="overflow-hidden rounded-2xl p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border bg-muted">
          <ProductImage
            src={imageUrl || rawUrl}
            alt={product.name}
            className="h-full w-full object-contain"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] font-bold text-primary">
            {product.sku || 'ללא מק"ט'}
          </p>
          <h3 className="line-clamp-2 text-sm font-extrabold">
            {product.name || "פריט ללא שם"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {product.category || "קטגוריה לא הוגדרה"}
          </p>
          {rawUrl ? (
            <a
              href={rawUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline"
              dir="ltr"
            >
              <ExternalLink className="h-3 w-3" />
              פתח מקור תמונה
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-xs">
        <Info label="יחידה" value={product.unit} />
        <Info
          label="משקל"
          value={product.weightKg ? `${product.weightKg} ק"ג` : "-"}
        />
        <Info label="מחסן" value={product.warehouse || "-"} />
      </div>

      {editing ? (
        <div className="mt-3 space-y-2 rounded-xl border bg-muted/30 p-3">
          <label className="block space-y-1 text-[10px] font-bold">
            mediaCode
            <input
              value={codeDraft}
              onChange={(e) => setCodeDraft(e.target.value)}
              className="h-9 w-full rounded-lg border bg-background px-2 font-mono text-xs"
              placeholder="SKU_10002"
              dir="ltr"
            />
          </label>
          <label className="block space-y-1 text-[10px] font-bold">
            קישור תמונה (URL)
            <input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              className="h-9 w-full rounded-lg border bg-background px-2 text-xs"
              placeholder="https://..."
              dir="ltr"
            />
          </label>
          {urlDraft.trim() ? (
            <div className="flex h-24 items-center justify-center overflow-hidden rounded-lg border bg-background">
              <ProductImage
                src={urlDraft.trim()}
                alt="תצוגה מקדימה"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-8 gap-1 text-xs font-bold"
              disabled={busy !== null}
              onClick={() => void saveMedia()}
            >
              {busy === "save" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2 className="h-3.5 w-3.5" />
              )}
              שמור בגיליון
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-xs"
              disabled={busy !== null}
              onClick={() => setEditing(false)}
            >
              <X className="h-3.5 w-3.5" /> ביטול
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-8 gap-1 text-xs"
              disabled={busy !== null}
              onClick={() => void removeMedia()}
            >
              {busy === "delete" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              מחק קישור
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            {status ||
              (imageUrl || rawUrl
                ? "יש קישור תמונה"
                : "אין תמונה — הטמיעו קישור")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => void loadMedia(false)}
              disabled={busy !== null || !product.sku}
              className="rounded-lg border px-2 py-1 text-[10px] font-bold disabled:opacity-50"
            >
              {busy === "load" ? "טוען..." : "טען תמונה"}
            </button>
            <button
              type="button"
              onClick={() => {
                setUrlDraft(localUrl || product.imageUrl || "");
                setCodeDraft(defaultCode);
                setEditing(true);
                setStatus("");
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/5 px-2 py-1 text-[10px] font-bold text-primary"
            >
              <Pencil className="h-3 w-3" />
              {rawUrl ? "עדכון קישור" : "הטמעת קישור"}
            </button>
          </div>
        </div>
      )}
      {status ? (
        <p className="mt-1 text-[10px] text-muted-foreground">{status}</p>
      ) : null}
    </Card>
  );
}
