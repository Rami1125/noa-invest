import { ChevronDown, Clock, Loader2, Plus, Search, UserRound, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";
import { hebrewIncludes, normalizeHebrew, splitHighlight } from "@/lib/new-order/hebrew-normalize";
import type { OrderCustomer } from "@/lib/new-order/types";

const TEMP_CUSTOMER_NO = "500500";

type Props = {
  customers: OrderCustomer[];
  value: OrderCustomer | null;
  onSelect: (c: OrderCustomer | null) => void;
  onCreateTemp: () => void;
  loading?: boolean;
  error?: string | null;
  className?: string;
};

function customerSearchBlob(c: OrderCustomer): string {
  return [
    c.customerNo,
    c.name,
    c.comaxPrimaryNo,
    ...c.aliases,
    ...c.comaxLinkedIds,
    ...c.phones,
    c.defaultSiteAddress,
  ].join(" ");
}

export function CustomerCombobox({
  customers,
  value,
  onSelect,
  onCreateTemp,
  loading,
  error,
  className,
}: Props) {
  const listId = useId();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 150);
    return () => window.clearTimeout(t);
  }, [query]);

  const results = useMemo(() => {
    if (debounced.length < 2) return [] as OrderCustomer[];
    const q = normalizeHebrew(debounced);
    return customers
      .filter((c) => hebrewIncludes(customerSearchBlob(c), q))
      .slice(0, 40);
  }, [customers, debounced]);

  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  const close = useCallback(() => setOpen(false), []);

  const pick = useCallback(
    (c: OrderCustomer) => {
      onSelect(c);
      setQuery("");
      setOpen(false);
    },
    [onSelect],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter") && debounced.length >= 2) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    const total = results.length + 1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % total);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + total) % total);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= results.length) {
        onCreateTemp();
        setQuery("");
        setOpen(false);
      } else if (results[activeIndex]) {
        pick(results[activeIndex]);
      }
    }
  };

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  return (
    <div className={cn("relative space-y-2", className)}>
      <label htmlFor={inputId} className="block text-sm font-semibold text-[#102A43]">
        איתור לקוח
      </label>

      {value ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[20px] border border-[#DCE6EF] bg-white p-3 shadow-[0_1px_2px_rgba(16,42,67,.05)]">
          <UserRound className="h-5 w-5 text-[#147D9C]" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="font-bold text-[#102A43]">{value.name}</div>
            <div className="text-xs text-[#52667A] tabular-nums" dir="ltr">
              מס׳ {value.customerNo}
              {value.phones[0] ? ` · ${value.phones[0]}` : ""}
            </div>
          </div>
          {value.isPendingComax && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#B45309]/30 bg-[#FEF3C7] px-2.5 py-1 text-[11px] font-bold text-[#B45309]">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              ממתין להקמה בקומקס
            </span>
          )}
          <button
            type="button"
            aria-label="ניקוי בחירת לקוח"
            onClick={() => onSelect(null)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl hover:bg-[#F3F7FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147D9C]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#52667A]" aria-hidden />
          <input
            ref={inputRef}
            id={inputId}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open ? `${listId}-opt-${activeIndex}` : undefined}
            autoComplete="off"
            placeholder="הקלידו שם, כינוי או מס׳ לקוח (מ־2 תווים)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (query.trim().length >= 2) setOpen(true);
            }}
            onKeyDown={onKeyDown}
            className="h-12 w-full rounded-[12px] border border-[#DCE6EF] bg-white pe-10 ps-3 text-sm text-[#102A43] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#147D9C]"
          />
          <ChevronDown className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#52667A]" aria-hidden />
        </div>
      )}

      {open && !value && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-[20px] border border-[#DCE6EF] bg-white shadow-[0_8px_24px_rgba(16,42,67,.08)]">
          {loading && (
            <div className="flex items-center gap-2 p-4 text-sm text-[#52667A]">
              <Loader2 className="h-4 w-4 animate-spin" /> טוען לקוחות…
            </div>
          )}
          {error && (
            <div className="p-4 text-sm font-semibold text-[#B91C1C]" role="alert">
              {error}
            </div>
          )}
          {!loading && !error && debounced.length < 2 && (
            <div className="p-4 text-sm text-[#52667A]">המשיכו להקליד לפחות 2 תווים לחיפוש</div>
          )}
          {!loading && !error && debounced.length >= 2 && results.length === 0 && (
            <div className="p-4 text-sm text-[#52667A]">לא נמצאו לקוחות תואמים</div>
          )}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="תוצאות חיפוש לקוחות"
            className="max-h-80 overflow-y-auto"
          >
            {results.map((c, i) => {
              const active = i === activeIndex;
              const nameParts = splitHighlight(c.name, debounced);
              return (
                <li key={`${c.customerNo}-${c.masterId || i}`} role="presentation">
                  <button
                    type="button"
                    id={`${listId}-opt-${i}`}
                    role="option"
                    aria-selected={active}
                    data-idx={i}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => pick(c)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 px-4 py-3 text-start text-sm transition",
                      active ? "bg-[#147D9C]/10" : "hover:bg-[#F3F7FB]",
                    )}
                  >
                    <span className="font-bold text-[#102A43]">
                      {nameParts.map((p, pi) =>
                        p.match ? (
                          <mark key={pi} className="bg-[#FEF3C7] text-[#102A43]">
                            {p.text}
                          </mark>
                        ) : (
                          <span key={pi}>{p.text}</span>
                        ),
                      )}
                    </span>
                    <span className="text-xs text-[#52667A] tabular-nums" dir="ltr">
                      {c.customerNo}
                      {c.defaultSiteAddress ? ` · ${c.defaultSiteAddress}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
            <li role="presentation" className="border-t border-[#DCE6EF]">
              <button
                type="button"
                id={`${listId}-opt-${results.length}`}
                role="option"
                aria-selected={activeIndex === results.length}
                data-idx={results.length}
                onMouseEnter={() => setActiveIndex(results.length)}
                onClick={() => {
                  onCreateTemp();
                  setQuery("");
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-4 py-3 text-start text-sm font-bold text-[#164E78]",
                  activeIndex === results.length ? "bg-[#147D9C]/10" : "hover:bg-[#F3F7FB]",
                )}
              >
                <Plus className="h-4 w-4" aria-hidden />
                לקוח חדש (קוד זמני {TEMP_CUSTOMER_NO})
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

export { TEMP_CUSTOMER_NO };
