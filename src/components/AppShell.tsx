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
  BookOpen,
  ShieldCheck,
  Archive,
  ImagePlus,
  ScanSearch,
} from "lucide-react";
import { type ReactNode, useState, useEffect, useRef } from "react";
import { useLocation, Link } from "@tanstack/react-router";
import noa from "@/assets/noa.jpg";
import { PWAInstallButton } from "./PWAInstallButton";
import { useTheme } from "@/hooks/use-theme";

import { playDispatchChime } from "@/lib/audio-alerts";
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
  { to: "/order-console", label: "הזמנה חדשה", icon: PackagePlus },
  { to: "/orders", label: "הזמנות בסידור", icon: ClipboardList },
  { to: "/notes-explorer", label: "ארכיון תעודות", icon: Archive },
  { to: "/notes", label: "תעודות משלוח", icon: FileText },
  { to: "/catalog", label: "קטלוג לוגיסטי", icon: BookOpen },
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
  { to: "/inquiry", label: "בירור תעודות", icon: Search },
] as const;

/** ניווט תחתון מובייל — בירור · נועה · תעודות · הראל */
const MOBILE_NAV = [
  { to: "/inquiry", label: "בירור", icon: Search },
  { to: "/chat", label: "נועה", icon: MessageCircle },
  { to: "/notes", label: "תעודות", icon: FileText },
  { to: "/harel", label: "הראל", icon: Crown },
] as const;

const MOBILE_MORE = DESKTOP_NAV.filter((d) => !MOBILE_NAV.some((m) => m.to === d.to));

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);

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
      void playDispatchChime(0.8);
    }, 600);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:right-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-primary-foreground"
      >
        דלג לתוכן
      </a>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex flex-col justify-between border-l border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">
          <div className="flex items-center gap-3 border-b border-sidebar-border/40 px-5 py-5">
            <div className="relative">
              <img
                src={noa}
                alt="נועה AI"
                width={44}
                height={44}
                className="h-11 w-11 rounded-full object-cover shadow-sm ring-2 ring-emerald-500"
              />
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-sidebar" />
            </div>
            <div>
              <div className="font-display text-base font-bold leading-tight">Saban Flow</div>
              <div className="text-[11px] text-sidebar-foreground/70">
                ח. סבן · לוגיסטיקה ללא נייר
              </div>
            </div>
          </div>

          <nav className="flex flex-col gap-1 px-3 py-4">
            {DESKTOP_NAV.map(({ to, label, icon: I }) => {
              const isCurrent = active(to);
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
                    isCurrent
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <I className="h-4.5 w-4.5 shrink-0" />
                  <span className="leading-tight">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="space-y-2 border-t border-sidebar-border/40 p-3">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
          >
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            {theme === "light" ? "מצב כהה" : "מצב בהיר"}
          </button>
          <PWAInstallButton />
        </div>
      </aside>

      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 pb-nav outline-none lg:pb-6">
        {children}
      </main>

      <nav
        aria-label="ניווט מובייל"
        className="glass fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border/70 pb-safe shadow-lg lg:hidden"
      >
        {MOBILE_NAV.map(({ to, label, icon: I }) => {
          const isCurrent = active(to);
          return (
            <Link
              key={to}
              to={to}
              onClick={triggerHaptic}
              aria-current={isCurrent ? "page" : undefined}
              className={`hit flex flex-col items-center justify-center gap-1 pb-1.5 pt-2 text-xs font-bold transition active:scale-95 motion-reduce:active:scale-100 ${
                isCurrent ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <I className={`h-5.5 w-5.5 ${isCurrent ? "stroke-[2.5]" : "stroke-2"}`} />
              <span>{label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => {
            triggerHaptic();
            setMoreOpen(true);
          }}
          aria-expanded={moreOpen}
          className={`hit flex flex-col items-center justify-center gap-1 pb-1.5 pt-2 text-xs font-bold transition active:scale-95 motion-reduce:active:scale-100 ${
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
                  }}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`flex min-h-14 items-center gap-3 rounded-2xl border px-3.5 py-3 text-sm font-bold transition active:scale-[0.98] motion-reduce:active:scale-100 ${
                    isCurrent
                      ? "border-primary/40 bg-primary/10 text-primary"
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
              onClick={toggleTheme}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border/70 bg-card px-3 py-2.5 text-sm font-semibold hover:bg-muted"
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
          <h1 className="truncate font-display text-xl font-extrabold tracking-tight text-foreground md:text-2xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug text-muted-foreground md:line-clamp-1 md:text-xs">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          <div className="md:hidden">
            <PWAInstallButton variant="compact" />
          </div>
        </div>
      </div>
    </header>
  );
}

export function StatusPill({ s }: { s: "ok" | "warn" | "fail" }) {
  const m = {
    ok: ["bg-emerald-500/15 text-emerald-700 border border-emerald-500/30", "🟢 מאומת 100%"],
    warn: ["bg-amber-500/20 text-amber-800 border border-amber-500/40", "⚠️ חריגה"],
    fail: ["bg-destructive/15 text-destructive border border-destructive/30", "🔴 כשל"],
  } as const;
  const [cls, label] = m[s];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${cls}`}>
      {label}
    </span>
  );
}
