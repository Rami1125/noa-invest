import {
  Crown,
  FileText,
  Satellite,
  ClipboardList,
  MessageCircle,
  Users,
  Edit3,
  Sun,
  Moon,
  Search,
  LayoutGrid,
  MapPin,
  LayoutDashboard,
  PackagePlus,
  Presentation,
  Wrench,
  BookOpen,
  ShieldCheck,
  Archive,
  ImagePlus,
  ScanSearch,
  GraduationCap,
  Warehouse,
  Boxes,
  PanelRightOpen,
} from "lucide-react";
import { type ReactNode, useState, useEffect, useRef, useCallback } from "react";
import { useLocation, Link } from "@tanstack/react-router";
import noa from "@/assets/noa.jpg";
import { PWAInstallButton } from "./PWAInstallButton";
import { GasConnectionBanner } from "@/components/GasConnectionBanner";
import { useTheme } from "@/hooks/use-theme";
import { StatusPill } from "./StatusPill";
export { StatusPill };

import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const DESKTOP_NAV = [
  { to: "/", label: "ראשי הראל", icon: Crown },
  { to: "/harel", label: "משימות הראל", icon: Crown },
  { to: "/new-order", label: "הזמנה חדשה", icon: PackagePlus },
  { to: "/orders", label: "הזמנות בסידור", icon: ClipboardList },
  { to: "/stock", label: "מלאי חי", icon: Boxes },
  { to: "/notes-explorer", label: "ארכיון תעודות", icon: Archive },
  { to: "/notes", label: "תעודות משלוח", icon: FileText },
  { to: "/catalog", label: "קטלוג לוגיסטי", icon: BookOpen },
  { to: "/presentations", label: "מצגות יום אספקה", icon: Presentation },
  { to: "/technical-advisor", label: "יועץ טכני", icon: Wrench },
  { to: "/logistics-dict", label: "מילון · מנוע יצירה", icon: Warehouse },
  { to: "/media-studio", label: "סטודיו מדיה ו-Drive", icon: ImagePlus },
  { to: "/canvas", label: "עריכת תעודה (קנבס)", icon: Edit3 },
  { to: "/customers", label: "תיקי לקוחות", icon: Users },
  { to: "/sites", label: "אתרי אספקה", icon: MapPin },
  { to: "/ituran", label: " נתוני-איתורן", icon: Satellite },
  { to: "/notebook", label: "חדר רנטגן (Notebook)", icon: ScanSearch },
  { to: "/mgmt", label: "בקרת הנהלה", icon: ShieldCheck },
  { to: "/noa-console", label: "מרכז ניהול נועה AI", icon: LayoutDashboard },
  { to: "/noa-brain", label: "נועה Brain", icon: MessageCircle },
  { to: "/chat", label: "צ'אט נועה AI", icon: MessageCircle },
  { to: "/train", label: "אימון נועה (WhatsApp)", icon: GraduationCap },
  { to: "/inquiry", label: "בירור תעודות", icon: Search },
] as const;

const MOBILE_NAV = [
  { to: "/inquiry", label: "בירור", icon: Search },
  { to: "/chat", label: "נועה", icon: MessageCircle },
  { to: "/notes", label: "תעודות", icon: FileText },
  { to: "/harel", label: "הראל", icon: Crown },
] as const;

const MOBILE_MORE = DESKTOP_NAV.filter((d) => !MOBILE_NAV.some((m) => m.to === d.to));

const NAV_IDLE_MS = 2800;
const EDGE_PX = 28;

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  /** פורטל לקוח קצה — ללא תפריט ניהול מאובטח */
  if (pathname === "/portal" || pathname.startsWith("/portal/")) {
    return <>{children}</>;
  }
  const { theme, toggleTheme } = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);
  const [bottomOpen, setBottomOpen] = useState(true);
  const sideOpenRef = useRef(true);
  const bottomOpenRef = useRef(true);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    sideOpenRef.current = sideOpen;
  }, [sideOpen]);
  useEffect(() => {
    bottomOpenRef.current = bottomOpen;
  }, [bottomOpen]);

  const clearIdle = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearIdle();
    idleTimerRef.current = setTimeout(() => {
      setSideOpen(false);
      setBottomOpen(false);
    }, NAV_IDLE_MS);
  }, [clearIdle]);

  useEffect(() => {
    scheduleHide();
    const isTouch = () =>
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none), (pointer: coarse)").matches;
    const onMouseMove = (e: MouseEvent) => {
      if (isTouch()) return;
      const nearEdge = e.clientX <= EDGE_PX || e.clientX >= window.innerWidth - EDGE_PX;
      let overAside = false;
      if (asideRef.current) {
        const r = asideRef.current.getBoundingClientRect();
        overAside =
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom;
      }
      if (nearEdge || overAside) {
        setSideOpen(true);
        scheduleHide();
      } else if (sideOpenRef.current) {
        scheduleHide();
      }
    };
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const nearBottom = t.clientY >= window.innerHeight - 64;
      const nearSide = t.clientX <= EDGE_PX || t.clientX >= window.innerWidth - EDGE_PX;
      if (nearBottom || nearSide || !bottomOpenRef.current) {
        setBottomOpen(true);
        setSideOpen(true);
        scheduleHide();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSideOpen(false);
        setBottomOpen(false);
        return;
      }
      if (e.altKey && (e.key === "m" || e.key === "M" || e.key === "מ")) {
        e.preventDefault();
        setSideOpen((v) => !v);
        setBottomOpen((v) => !v);
      }
    };
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearIdle();
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [scheduleHide, clearIdle]);

  useEffect(() => {
    setSideOpen(true);
    setBottomOpen(true);
    scheduleHide();
  }, [pathname, scheduleHide]);

  const active = (to: string) => {
    if (to === "/") return pathname === "/" || pathname === "";
    return pathname === to || pathname.startsWith(`${to}/`);
  };
  const moreActive = MOBILE_MORE.some((m) => active(m.to));
  const triggerHaptic = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(10);
      } catch {
        /* ignore */
      }
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      toast.message("מערכת נועה מוכנה", {
        description: `סטטוס נטען · ${new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`,
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, []);

  const navItemClass = (isCurrent: boolean) =>
    `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-all duration-200 ease-out active:scale-[0.97] ${
      isCurrent
        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm ring-1 ring-sidebar-border/60"
        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
    }`;

  return (
    <div className="flex min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:right-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-primary-foreground"
      >
        דלג לתוכן
      </a>

      <button
        type="button"
        aria-label="הצג תפריט ניווט"
        aria-expanded={sideOpen}
        onClick={() => {
          setSideOpen(true);
          scheduleHide();
        }}
        className={`fixed top-1/2 z-50 hidden h-24 w-3 -translate-y-1/2 rounded-l-full bg-primary/80 shadow-md transition-all duration-300 hover:w-4 hover:bg-primary lg:block ${
          sideOpen ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        style={{ insetInlineStart: 0 }}
      />

      <aside
        ref={asideRef as React.RefObject<HTMLElement>}
        onMouseEnter={() => {
          setSideOpen(true);
          clearIdle();
        }}
        onMouseLeave={() => scheduleHide()}
        aria-hidden={!sideOpen}
        className={`sticky top-0 z-40 hidden h-dvh w-60 shrink-0 flex-col justify-between border-l border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[0_0_24px_rgba(16,42,67,0.08)] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex ${
          sideOpen ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-[110%] opacity-0"
        }`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
          <div className="flex items-center gap-3 border-b border-sidebar-border/40 px-5 py-5">
            <div className="relative">
              <img src={noa} alt="נועה AI" width={44} height={44} className="h-11 w-11 rounded-full object-cover shadow-sm ring-2 ring-emerald-500" />
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-sidebar" />
            </div>
            <div>
              <div className="font-display text-base font-bold leading-tight">Saban Flow</div>
              <div className="text-[11px] text-sidebar-foreground/70">ח. סבן · לוגיסטיקה ללא נייר</div>
            </div>
          </div>
          <nav className="flex flex-col gap-1 px-3 py-4" aria-label="ניווט ראשי">
            {DESKTOP_NAV.map(({ to, label, icon: I }) => {
              const isCurrent = active(to);
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={isCurrent ? "page" : undefined}
                  onClick={() => {
                    triggerHaptic();
                    scheduleHide();
                  }}
                  className={navItemClass(isCurrent)}
                >
                  <I className={`h-4.5 w-4.5 shrink-0 ${isCurrent ? "stroke-[2.5]" : ""}`} />
                  <span className="leading-tight">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="space-y-2 border-t border-sidebar-border/40 p-3">
          <button
            type="button"
            onClick={() => {
              triggerHaptic();
              toggleTheme();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-sidebar-foreground/80 transition-all duration-200 hover:bg-sidebar-accent/60 active:scale-[0.98]"
          >
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            {theme === "light" ? "מצב כהה" : "מצב בהיר"}
          </button>
          <PWAInstallButton />
        </div>
      </aside>

      <main
        id="main-content"
        tabIndex={-1}
        className="min-w-0 flex-1 pb-nav outline-none lg:pb-6"
        onMouseMove={() => {
          if (sideOpenRef.current) scheduleHide();
        }}
      >
        <GasConnectionBanner />
        {children}
      </main>

      <button
        type="button"
        aria-label="הצג ניווט"
        onClick={() => {
          triggerHaptic();
          setBottomOpen(true);
          scheduleHide();
        }}
        className={`glass fixed bottom-3 left-1/2 z-40 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-border/70 shadow-lg transition-all duration-300 active:scale-95 lg:hidden ${
          bottomOpen ? "pointer-events-none translate-y-16 opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        <PanelRightOpen className="h-5 w-5 text-primary" />
      </button>

      <nav
        aria-label="ניווט מובייל"
        onTouchStart={() => {
          setBottomOpen(true);
          clearIdle();
        }}
        className={`glass fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border/70 pb-safe shadow-lg transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden ${
          bottomOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {MOBILE_NAV.map(({ to, label, icon: I }) => {
          const isCurrent = active(to);
          return (
            <Link
              key={to}
              to={to}
              onClick={() => {
                triggerHaptic();
                scheduleHide();
              }}
              aria-current={isCurrent ? "page" : undefined}
              className={`hit relative flex flex-col items-center justify-center gap-1 pb-1.5 pt-2 text-xs font-bold transition-all duration-200 active:scale-95 ${
                isCurrent ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <I className={`h-5.5 w-5.5 ${isCurrent ? "stroke-[2.5] scale-105" : "stroke-2"}`} />
              <span>{label}</span>
              {isCurrent && <span className="absolute bottom-1 h-0.5 w-6 rounded-full bg-primary/80" />}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => {
            triggerHaptic();
            setMoreOpen(true);
            clearIdle();
          }}
          aria-expanded={moreOpen}
          className={`hit relative flex flex-col items-center justify-center gap-1 pb-1.5 pt-2 text-xs font-bold transition-all duration-200 active:scale-95 ${
            moreActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <LayoutGrid className={`h-5.5 w-5.5 ${moreActive ? "stroke-[2.5]" : "stroke-2"}`} />
          <span>עוד</span>
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          dir="rtl"
          className="max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-3xl px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-5 lg:hidden"
        >
          <SheetHeader className="text-right">
            <SheetTitle className="font-display text-base font-bold">כל המסכים</SheetTitle>
            <SheetDescription className="sr-only">ניווט לכל אזורי המערכת</SheetDescription>
          </SheetHeader>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {MOBILE_MORE.map(({ to, label, icon: I }) => {
              const isCurrent = active(to);
              return (
                <Link
                  key={to}
                  to={to}
                  onClick={() => {
                    triggerHaptic();
                    setMoreOpen(false);
                    scheduleHide();
                  }}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`flex min-h-14 items-center gap-3 rounded-2xl border px-3.5 py-3 text-sm font-bold transition-all duration-200 active:scale-[0.98] ${
                    isCurrent
                      ? "border-primary/40 bg-primary/10 text-primary shadow-sm"
                      : "border-border/70 bg-card hover:bg-muted"
                  }`}
                >
                  <I className="h-5 w-5 shrink-0" />
                  <span className="leading-tight">{label}</span>
                </Link>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                triggerHaptic();
                toggleTheme();
              }}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 text-sm font-semibold transition-all duration-200 hover:bg-muted active:scale-[0.98]"
            >
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              <span>{theme === "light" ? "מצב כהה" : "מצב בהיר"}</span>
            </button>
            <div className="flex min-h-12 items-center justify-center">
              <PWAInstallButton />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const syncHeight = () => root.style.setProperty("--header-h", `${el.offsetHeight}px`);
    syncHeight();
    const ro = new ResizeObserver(syncHeight);
    ro.observe(el);
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setStuck(window.scrollY > 4));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
      root.style.removeProperty("--header-h");
    };
  }, []);
  return (
    <header
      ref={ref}
      data-stuck={stuck}
      className="pt-safe header-elevated sticky top-0 z-30 glass border-b border-border/60"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-8 md:py-3.5">
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-extrabold">{title}</h1>
          {subtitle ? <p className="truncate text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </div>
    </header>
  );
}
