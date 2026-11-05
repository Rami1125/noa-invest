import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ImagePlus, UploadCloud, Copy, ExternalLink, FolderOpen, X, CheckCircle2,
  FileImage, Link2, RefreshCw, Package, ShieldCheck
} from "lucide-react";

export const Route = createFileRoute("/media-studio")({
  head: () => ({
    meta: [
      { title: "סטודיו תמונות ומדיה — נועה ח. סבן" },
      { name: "description", content: "העלאת תמונות מוצר, יצירת קישורי צפייה והפקת קוד מדיה למילון הלוגיסטי." },
    ],
  }),
  component: MediaStudio,
});

const DRIVE_FOLDER_ID = "1mb48kxT-9k5mYb356BtTJN6j9bjvPREG";
const DRIVE_FOLDER_URL = `https://drive.google.com/drive/folders/${DRIVE_FOLDER_ID}`;
const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

type UploadResult = {
  success?: boolean;
  mediaCode?: string;
  imageUrl?: string;
  fileUrl?: string;
  fileId?: string;
  error?: string;
};

function MediaStudio() {
  const [sku, setSku] = useState("");
  const [productName, setProductName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [endpoint, setEndpoint] = useState(import.meta.env.VITE_MEDIA_UPLOAD_URL || "");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const acceptFile = useCallback((candidate?: File) => {
    if (!candidate) return;
    if (!ACCEPTED.includes(candidate.type)) {
      toast.error("אפשר להעלות JPG, PNG, WEBP או GIF בלבד");
      return;
    }
    if (candidate.size > MAX_BYTES) {
      toast.error("גודל הקובץ חורג מ־15MB");
      return;
    }
    setFile(candidate);
    setPreview(URL.createObjectURL(candidate));
    setResult(null);
  }, []);

  const clearFile = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview("");
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const upload = async () => {
    const normalizedSku = sku.trim().replace(/^SKU[-_]?/i, "");
    if (!/^[A-Za-z0-9_-]{2,80}$/.test(normalizedSku)) {
      toast.error("יש להזין מק״ט תקין (אותיות באנגלית, ספרות, _ או -)");
      return;
    }
    if (!file) {
      toast.error("יש לבחור תמונת מוצר");
      return;
    }
    if (!endpoint.trim()) {
      toast.error("כתובת שירות ההעלאה עדיין לא הוגדרה");
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("קריאת הקובץ נכשלה"));
        reader.onerror = () => reject(new Error("קריאת הקובץ נכשלה"));
        reader.readAsDataURL(file);
      });
      const response = await fetch(endpoint.trim(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "uploadProductImage",
          sku: normalizedSku,
          productName: productName.trim(),
          fileName: file.name,
          mimeType: file.type,
          dataUrl,
          folderId: DRIVE_FOLDER_ID,
        }),
      });
      const payload = await response.json() as UploadResult;
      if (!response.ok || payload.success === false || !payload.imageUrl) {
        throw new Error(payload.error || "שירות ההעלאה לא החזיר קישור תמונה");
      }
      const completed = { ...payload, mediaCode: payload.mediaCode || `SKU_${normalizedSku}` };
      setResult(completed);
      toast.success("התמונה הועלתה בהצלחה");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ההעלאה נכשלה");
    } finally {
      setUploading(false);
    }
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} הועתק`);
    } catch {
      toast.error("לא ניתן להעתיק. בדוק הרשאות דפדפן");
    }
  };

  const tsv = result ? [sku.trim(), productName.trim(), result.mediaCode || "", result.imageUrl || ""].join("\\t") : "";
  const resetForm = () => {
    clearFile();
    setSku("");
    setProductName("");
  };

  return (
    <div dir="rtl">
      <PageHeader
        title="סטודיו תמונות ומדיה"
        subtitle="העלאת תמונות מוצרים · קישורים ציבוריים · קוד מדיה למילון הלוגיסטי"
        action={
          <Button size="sm" variant="outline" className="hit gap-2" onClick={() => window.open(DRIVE_FOLDER_URL, "_blank", "noopener,noreferrer")}>
            <FolderOpen className="h-4 w-4" /><span className="hidden sm:inline">תיקיית Drive</span>
          </Button>
        }
      />

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 md:px-8 md:py-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <InfoTile icon={Package} title="מזהה מדיה" value="SKU_ + מק״ט" detail="מזהה אחיד לכל תמונת מוצר" />
          <InfoTile icon={Link2} title="קישור לתמונה" value="צפייה ציבורית" detail="לשימוש בגיליון ובקטלוג" />
          <InfoTile icon={ShieldCheck} title="יעד אחסון" value="Google Drive" detail="תיקיית המדיה של ח. סבן" />
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
          <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
            <div className="border-b border-border/60 px-5 py-4">
              <div className="flex items-center gap-2 font-display text-lg font-bold"><ImagePlus className="h-5 w-5 text-primary" />העלאת תמונת מוצר</div>
              <p className="mt-1 text-sm text-muted-foreground">הזן מק״ט, בחר תמונה והעלה אותה לתיקיית המדיה.</p>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-bold">
                  מק״ט מוצר <span className="text-destructive">*</span>
                  <input value={sku} onChange={e => setSku(e.target.value)} placeholder="לדוגמה: 112260" dir="ltr" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-left font-mono text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </label>
                <label className="space-y-1.5 text-sm font-bold">
                  שם מוצר
                  <input value={productName} onChange={e => setProductName(e.target.value)} placeholder="לדוגמה: דבק קרמיקה" className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </label>
              </div>

              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files?.[0]); }}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
                className={`flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 py-7 text-center transition ${dragging ? "border-primary bg-primary/10" : "border-border bg-muted/30 hover:border-primary/50 hover:bg-primary/5"}`}
              >
                <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={e => acceptFile(e.target.files?.[0])} />
                {preview ? (
                  <div className="relative w-full max-w-sm">
                    <img src={preview} alt="תצוגה מקדימה של תמונת המוצר" className="mx-auto max-h-56 rounded-xl object-contain" />
                    <button type="button" onClick={e => { e.stopPropagation(); clearFile(); }} className="absolute -left-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-white shadow" aria-label="הסר תמונה"><X className="h-4 w-4" /></button>
                    <p className="mt-3 truncate text-sm font-bold">{file?.name}</p>
                    <p className="text-xs text-muted-foreground">{file ? (file.size / 1024 / 1024).toFixed(2) + " MB" : ""} · לחץ להחלפת תמונה</p>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><UploadCloud className="h-7 w-7" /></div>
                    <div className="font-bold">גרור תמונה לכאן או לחץ לבחירה</div>
                    <p className="mt-1 text-xs text-muted-foreground">JPG · PNG · WEBP · GIF עד 15MB</p>
                  </>
                )}
              </div>

              <Button onClick={() => void upload()} disabled={uploading || !file || !sku.trim()} className="hit w-full gap-2 text-sm font-bold">
                {uploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                {uploading ? "מעלה תמונה..." : "העלה ל־Google Drive"}
              </Button>
              <button type="button" onClick={resetForm} className="w-full py-1 text-xs font-semibold text-muted-foreground hover:text-foreground">נקה טופס</button>
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="rounded-2xl border-border/70 p-5 shadow-sm">
              <div className="flex items-center gap-2 font-display font-bold"><FolderOpen className="h-5 w-5 text-primary" />תיקיית היעד</div>
              <p className="mt-2 text-sm text-muted-foreground">כל התמונות יישמרו בתיקיית המדיה שהוגדרה עבור ח. סבן.</p>
              <a href={DRIVE_FOLDER_URL} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-bold hover:bg-muted"><ExternalLink className="h-4 w-4" />פתח תיקייה ב־Drive</a>
              <p className="mt-3 break-all font-mono text-[11px] text-muted-foreground" dir="ltr">{DRIVE_FOLDER_ID}</p>
            </Card>

            <Card className="rounded-2xl border-border/70 p-5 shadow-sm">
              <div className="font-display font-bold">חיבור שירות ההעלאה</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">כתובת API מאובטחת שמקבלת POST בפורמט JSON ומחזירה success ו־imageUrl. ניתן להגדיר גם במשתנה הסביבה VITE_MEDIA_UPLOAD_URL.</p>
              <label className="mt-3 block space-y-1.5 text-xs font-bold">
                כתובת שירות (Web App / API)
                <input value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="https://.../exec או /api/media/upload" dir="ltr" className="h-10 w-full rounded-xl border border-input bg-background px-3 text-left font-mono text-xs outline-none focus:border-primary" />
              </label>
              <p className="mt-2 text-[11px] text-muted-foreground">הכתובת נשמרת בשדה זה כל עוד הדף פתוח. אין להזין כאן מפתח סודי.</p>
            </Card>

            {result && (
              <Card className="space-y-3 rounded-2xl border-emerald-500/35 bg-emerald-500/5 p-5 shadow-sm">
                <div className="flex items-center gap-2 font-bold text-emerald-800"><CheckCircle2 className="h-5 w-5" />התמונה הועלתה</div>
                <ResultRow label="קוד מדיה" value={result.mediaCode || ""} onCopy={() => void copy(result.mediaCode || "", "קוד מדיה")} />
                <ResultRow label="קישור תמונה" value={result.imageUrl || ""} onCopy={() => void copy(result.imageUrl || "", "קישור התמונה")} />
                {result.fileUrl && <a href={result.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-primary"><ExternalLink className="h-3.5 w-3.5" />פתח קובץ ב־Drive</a>}
                <Button variant="outline" className="w-full gap-2" onClick={() => void copy(tsv, "שורת הגיליון")}><Copy className="h-4 w-4" />העתק שורה להדבקה בגיליון</Button>
              </Card>
            )}
          </div>
        </div>

        <Card className="rounded-2xl border-border/70 p-5 shadow-sm">
          <div className="flex items-center gap-2 font-bold"><FileImage className="h-5 w-5 text-primary" />מבנה הרשומה למילון הלוגיסטי</div>
          <p className="mt-1 text-xs text-muted-foreground">לאחר העלאה, מעתיקים את השורה ומדביקים בגיליון בעמודות המתאימות.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {["SKU / מק״ט", "שם מוצר", "mediaCode", "imageUrl"].map((field, i) => <div key={field} className="rounded-xl bg-muted/50 p-3"><div className="text-[10px] font-semibold text-muted-foreground">עמודה {i + 1}</div><div className="mt-1 break-all font-mono text-xs font-bold" dir="ltr">{field}</div></div>)}
          </div>
        </Card>
      </div>
    </div>
  );
}

function InfoTile({ icon: Icon, title, value, detail }: { icon: typeof Package; title: string; value: string; detail: string }) {
  return <Card className="flex items-center gap-3 rounded-2xl border-border/70 p-4 shadow-sm"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div><div className="min-w-0"><div className="text-xs font-semibold text-muted-foreground">{title}</div><div className="font-display text-base font-extrabold">{value}</div><div className="text-[11px] text-muted-foreground">{detail}</div></div></Card>;
}

function ResultRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return <div className="space-y-1"><div className="text-[11px] font-bold text-muted-foreground">{label}</div><div className="flex items-center gap-2"><code className="min-w-0 flex-1 break-all rounded-lg bg-background/80 p-2 text-[11px]" dir="ltr">{value}</code><button type="button" onClick={onCopy} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background" aria-label={`העתק ${label}`}><Copy className="h-4 w-4" /></button></div></div>;
}
