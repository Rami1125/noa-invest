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
  Wrench,
  Presentation,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const NAV: { to: string; label: string; icon: LucideIcon; group?: string }[] = [
  { to: "/", label: "לוח בקרה", icon: LayoutDashboard, group: "ראשי" },
  { to: "/notes", label: "תעודות משלוח", icon: FileText, group: "ראשי" },
  { to: "/orders", label: "הזמנות חיות", icon: ClipboardList, group: "ראשי" },
  { to: "/customers", label: "לקוחות", icon: Users, group: "ראשי" },
  { to: "/sites", label: "אתרים", icon: MapPin, group: "ראשי" },
  { to: "/ituran", label: "איתוראן", icon: Satellite, group: "שטח" },
  { to: "/tachograph", label: "טכוגרף", icon: Truck, group: "שטח" },
  { to: "/chat", label: "צ'אט נועה", icon: MessageCircle, group: "AI" },
  { to: "/notebook", label: "חדר רנטגן", icon: BookOpen, group: "AI" },
  { to: "/technical-advisor", label: "יועץ טכני", icon: Wrench, group: "AI" },
  { to: "/presentations", label: "מצגות", icon: Presentation, group: "AI" },
  { to: "/logistics-dict", label: "מילון לוגיסטי", icon: PackagePlus, group: "קטלוג" },
  { to: "/catalog", label: "קטלוג", icon: LayoutGrid, group: "קטלוג" },
  { to: "/harel", label: "הראל", icon: Crown, group: "הנהלה" },
  { to: "/mgmt", label: "ניהול", icon: ShieldCheck, group: "הנהלה" },
];

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
    <header className="sticky top-0 z-30 border-b border-[#102A43]/10 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-extrabold text-[#102A43] md:text-xl">{title}</h1>
          {subtitle ? (
            <p className="truncate text-xs font-medium text-[#5A6A7A]">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}

/** Audit status pill — used by NotesArchive and note detail */
export function StatusPill({ s }: { s: "ok" | "warn" | "fail" | string }) {
  const map: Record<string, { label: string; className: string }> = {
    ok: {
      label: "תקין",
      className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-800",
    },
    warn: {
      label: "לתשומת לב",
      className: "border-amber-500/40 bg-amber-500/15 text-amber-900",
    },
    fail: {
      label: "חריגה",
      className: "border-rose-500/40 bg-rose-500/15 text-rose-800",
    },
  };
  const item = map[s] || {
    label: String(s || "—"),
    className: "border-[#102A43]/15 bg-[#102A43]/5 text-[#102A43]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold",
        item.className,
      )}
    >
      {item.label}
    </span>
  );
}

function NavLink({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-bold transition",
        active
          ? "bg-[#1769AA] text-white shadow-sm"
          : "text-[#102A43]/80 hover:bg-[#F3F7FB] hover:text-[#1769AA]",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const groups = NAV.reduce<Record<string, typeof NAV>>((acc, item) => {
    const g = item.group || "אחר";
    (acc[g] ||= []).push(item);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#F3F7FB] text-[#102A43]" dir="rtl" lang="he">
      <div className="flex min-h-screen">
        {/* Sidebar desktop */}
        <aside className="hidden w-56 shrink-0 border-l border-[#102A43]/10 bg-white md:flex md:flex-col">
          <div className="flex items-center gap-2 border-b border-[#102A43]/10 px-4 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#102A43] text-white">
              <Crown className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-extrabold">נועה · סבן</div>
              <div className="text-[10px] font-semibold text-[#5A6A7A]">Saban Flow</div>
            </div>
          </div>
          <nav className="flex-1 space-y-4 overflow-y-auto p-3">
            {Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wide text-[#5A6A7A]">
                  {group}
                </div>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavLink key={item.to} {...item} />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {children}
        </div>
      </div>

      {/* Mobile bottom nav snippet */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-[#102A43]/10 bg-white/95 px-1 py-1 backdrop-blur md:hidden">
        {NAV.slice(0, 5).map((item) => (
          <MobileNavItem key={item.to} {...item} />
        ))}
      </nav>
    </div>
  );
}

function MobileNavItem({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
  return (
    <Link
      to={to}
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-bold",
        active ? "text-[#1769AA]" : "text-[#5A6A7A]",
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="truncate max-w-full px-0.5">{label}</span>
    </Link>
  );
}
