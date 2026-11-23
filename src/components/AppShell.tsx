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

/** זמן חוסר פעילות עד הסתרת תפריט (מס״ש) */
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
    `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-all duration-200 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 ${
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

      <main
        id="main-content"
        tabIndex={-1}
        className="min-w-0 flex-1 pb-nav outline-none lg:pb-6"
      >
        <GasConnectionBanner />
        {children}
      </main>
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
  return (
    <header className="pt-safe sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-8">
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-extrabold">{title}</h1>
          {subtitle ? <p className="truncate text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </div>
    </header>
  );
}
