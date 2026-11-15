import { FileText, Trash2, UploadCloud, AlertCircle } from "lucide-react";
import { useCallback, useId, useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { cn } from "@/lib/utils";
import type { OrderAttachment } from "@/lib/new-order/types";

const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_BYTES = 10 * 1024 * 1024;

type Props = {
  value: OrderAttachment | null;
  onChange: (file: OrderAttachment | null) => void;
  className?: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileDropzone({ value, onChange, className }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");

  const readFile = useCallback(
    async (file: File) => {
      setError("");
      if (!ALLOWED.has(file.type)) {
        setError("מותרים רק PDF, JPG או PNG");
        onChange(null);
        return;
      }
      if (file.size > MAX_BYTES) {
        setError("הקובץ גדול מ-10MB");
        onChange(null);
        return;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("קריאת הקובץ נכשלה"));
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1] || "";
      onChange({
        fileName: file.name,
        mimeType: file.type as OrderAttachment["mimeType"],
        sizeBytes: file.size,
        base64,
      });
    },
    [onChange],
  );

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void readFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void readFile(f);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={inputId} className="block text-sm font-semibold text-[#102A43]">
        קובץ מצורף (אופציונלי)
      </label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed px-4 py-8 text-center transition",
          dragOver ? "border-[#147D9C] bg-[#147D9C]/10" : "border-[#DCE6EF] bg-white",
        )}
      >
        <UploadCloud className="h-8 w-8 text-[#147D9C]" aria-hidden />
        <p className="text-sm text-[#52667A]">גררו קובץ לכאן או</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#DCE6EF] bg-white px-4 text-sm font-bold text-[#102A43] transition hover:bg-[#F3F7FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147D9C]"
        >
          בחירת קובץ
        </button>
        <p className="text-xs text-[#52667A]">PDF / JPG / PNG · עד 10MB</p>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="sr-only"
          onChange={onInput}
        />
      </div>

      {value && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#DCE6EF] bg-[#F3F7FB] px-3 py-2.5 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-[#147D9C]" aria-hidden />
            <div className="min-w-0">
              <div className="truncate font-semibold text-[#102A43]" dir="ltr">
                {value.fileName}
              </div>
              <div className="text-xs text-[#52667A] tabular-nums" dir="ltr">
                {formatSize(value.sizeBytes)}
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="הסרת קובץ"
            onClick={() => {
              onChange(null);
              setError("");
            }}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[#B91C1C] hover:bg-[#FEE2E2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147D9C]"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#B91C1C]" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}
