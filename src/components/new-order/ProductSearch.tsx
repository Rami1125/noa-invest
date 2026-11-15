import { Loader2, Package, Plus, Search } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";
import { hebrewIncludes, normalizeHebrew, splitHighlight } from "@/lib/new-order/hebrew-normalize";
import type { DictProduct } from "@/lib/new-order/types";

type Props = {
  products: DictProduct[];
  onAdd: (product: DictProduct) => void;
  loading?: boolean;
  className?: string;
};

function productBlob(p: DictProduct): string {
  return [p.sku, p.officialName, ...p.slangKeywords].join(" ");
}

export function ProductSearch({ products, onAdd, loading, className }: Props) {
  const listId = useId();
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 150);
    return () => window.clearTimeout(t);
  }, [query]);

  const results = useMemo(() => {
    if (debounced.length < 2) return [] as DictProduct[];
    const q = normalizeHebrew(debounced);
    return products.filter((p) => hebrewIncludes(productBlob(p), q)).slice(0, 30);
  }, [products, debounced]);

  useEffect(() => setActiveIndex(0), [results]);

  const pick = (p: DictProduct) => {
    onAdd(p);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open && e.key === "ArrowDown" && debounced.length >= 2) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % Math.max(1, results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      pick(results[activeIndex]);
    }
  };

  return (
    <div className={cn("relative space-y-2", className)}>
      <label htmlFor={inputId} className="block text-sm font-semibold text-[#102A43]">
        חיפוש מוצר מהמילון הלוגיסטי
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#52667A]" aria-hidden />
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="מק״ט, שם רשמי או סלנג (מ־2 תווים)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (query.trim().length >= 2) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="h-12 w-full rounded-[12px] border border-[#DCE6EF] bg-white pe-10 ps-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147D9C]"
        />
      </div>

      {open && debounced.length >= 2 && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-[20px] border border-[#DCE6EF] bg-white shadow-[0_8px_24px_rgba(16,42,67,.08)]">
          {loading && (
            <div className="flex items-center gap-2 p-4 text-sm text-[#52667A]">
              <Loader2 className="h-4 w-4 animate-spin" /> טוען מילון…
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="p-4 text-sm text-[#52667A]">לא נמצאו מוצרים תואמים</div>
          )}
          <ul id={listId} role="listbox" className="max-h-80 overflow-y-auto">
            {results.map((p, i) => {
              const active = i === activeIndex;
              const nameParts = splitHighlight(p.officialName, debounced);
              return (
                <li key={p.sku} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => pick(p)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-start text-sm transition",
                      active ? "bg-[#147D9C]/10" : "hover:bg-[#F3F7FB]",
                    )}
                  >
                    <Package className="mt-0.5 h-4 w-4 shrink-0 text-[#147D9C]" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-[#102A43]">
                        {nameParts.map((part, pi) =>
                          part.match ? (
                            <mark key={pi} className="bg-[#FEF3C7]">
                              {part.text}
                            </mark>
                          ) : (
                            <span key={pi}>{part.text}</span>
                          ),
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[#52667A]">
                        <span className="tabular-nums" dir="ltr">
                          מק״ט {p.sku}
                        </span>
                        <span>{p.unit}</span>
                        <span className="tabular-nums" dir="ltr">
                          {p.weightKgPerUnit} ק״ג
                        </span>
                        <span>{p.defaultWarehouse}</span>
                        <span>{p.recommendedDriver}</span>
                        {p.deposit && (
                          <span className="tabular-nums" dir="ltr">
                            פקדון {p.deposit}
                          </span>
                        )}
                      </div>
                    </div>
                    <Plus className="h-4 w-4 shrink-0 text-[#164E78]" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
