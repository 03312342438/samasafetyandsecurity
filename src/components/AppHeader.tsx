import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SAMA_LOGO_BASE64 } from "@/lib/logo";
import { Button } from "@/components/ui/button";
import { MaintenanceReminder } from "@/components/MaintenanceReminder";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { NotificationBell } from "@/components/NotificationBell";
import {
  LogOut, FileText, Building2, Handshake, FolderKanban, ClipboardList,
  Boxes, HardHat, Truck, Receipt, CheckSquare, ShieldCheck, Menu, TrendingUp, PackageSearch,
  PackageMinus, LayoutDashboard,
} from "lucide-react";


import { hasDept, isStoreOnly, isSalesOnly } from "@/lib/workflow";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof FileText; show: boolean; search?: Record<string, string> };

export function AppHeader({
  isAdmin,
  name,
  roles,
}: {
  isAdmin?: boolean;
  name?: string;
  roles?: string[];
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Reserve space for the fixed rail while this shell is mounted.
  useEffect(() => {
    document.documentElement.classList.add("has-rail");
    return () => document.documentElement.classList.remove("has-rail");
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const canSeeCustomers = hasDept(roles, "sales") || hasDept(roles, "project_manager");
  const canSeeProjects =
    canSeeCustomers ||
    hasDept(roles, "inventory") ||
    hasDept(roles, "technician") ||
    hasDept(roles, "accounts");
  // Store staff work only in Stock, Store, Release Items, Projects and Approvals.
  const inventoryOnly = isStoreOnly(roles, isAdmin);
  const salesOnly = isSalesOnly(roles, isAdmin);
  const isPm = hasDept(roles, "project_manager");

  const items: NavItem[] = [
    ...(inventoryOnly ? [{ to: "/stock", label: "Stock", icon: PackageSearch, show: true } as NavItem] : []),
    ...(isPm && !isAdmin
      ? [{ to: "/overview", label: "Dashboard", icon: LayoutDashboard, show: true } as NavItem]
      : []),
    {
      to: "/dashboard",
      label: isPm && !isAdmin ? "Maintenance" : "Dashboard",
      icon: FileText,
      show: !inventoryOnly,
      ...(isPm && !isAdmin ? { search: { view: "maintenance" } } : {}),
    },
    { to: "/customers", label: "Customers", icon: Building2, show: !!isAdmin || canSeeCustomers },
    {
      to: "/sales", label: "Sales", icon: Handshake,
      show: !!isAdmin || hasDept(roles, "sales") || hasDept(roles, "project_manager"),
    },
    { to: "/projects", label: "Projects", icon: FolderKanban, show: !!isAdmin || canSeeProjects },
    {
      to: "/engineering", label: "Planning", icon: ClipboardList,
      show: !inventoryOnly && (!!isAdmin || hasDept(roles, "project_manager") || hasDept(roles, "inventory")),
    },
    {
      to: "/inventory", label: "Store", icon: Boxes,
      show: !!isAdmin || hasDept(roles, "inventory") || hasDept(roles, "project_manager"),
    },
    {
      to: "/suppliers", label: "Suppliers", icon: Truck,
      show: !!isAdmin || hasDept(roles, "project_manager") || hasDept(roles, "accounts"),
    },
    {
      to: "/releases", label: "Release Items", icon: PackageMinus,
      show: !!isAdmin || hasDept(roles, "inventory"),
    },
    {
      to: "/execution", label: "Site", icon: HardHat,
      show:
        !inventoryOnly &&
        !salesOnly &&
        (!!isAdmin || hasDept(roles, "technician") || hasDept(roles, "project_manager")),
    },

    {
      to: "/progress", label: "Progress", icon: TrendingUp,
      show: hasDept(roles, "sales"),
    },
    ...(inventoryOnly ? [] : [{ to: "/stock", label: "Stock", icon: PackageSearch, show: true } as NavItem]),
    { to: "/accounts", label: "Accounts", icon: Receipt, show: !!isAdmin || hasDept(roles, "accounts") },
    { to: "/approvals", label: "Approvals", icon: CheckSquare, show: true },
    { to: "/admin", label: "Management", icon: ShieldCheck, show: !!isAdmin },
  ];



  const rail = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <Link to="/dashboard" className="flex items-center gap-3 border-b border-sidebar-border px-4 py-4">
        <span className="rounded-xl bg-sidebar-accent p-1.5">
          <img src={SAMA_LOGO_BASE64} alt="Sama Safety & Security" className="h-9 w-auto" />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold text-sidebar-accent-foreground">Sama Portal</span>
          <span className="block text-xs text-sidebar-foreground/70">Fire &amp; Safety ERP</span>
        </span>
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {items.filter((i) => i.show).map((item) => {
          const active = pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              search={item.search as never}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-[var(--shadow-card)]"
                  : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border px-3 py-3">
        {name && <p className="px-1 pb-2 text-xs text-sidebar-foreground/70">{name}</p>}
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* Fixed desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border md:block">
        {rail}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-[var(--shadow-elegant)]">{rail}</aside>
        </div>
      )}

      <header className="sticky top-0 z-20 border-b bg-card/95 shadow-[var(--shadow-card)] backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen((v) => !v)} aria-label="Toggle navigation">
              <Menu className="h-5 w-5" />
            </Button>
            <span className="text-sm font-semibold text-foreground">
              {items.find((i) => pathname.startsWith(i.to))?.label ?? "Sama Portal"}
            </span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            {name && <span className="hidden text-sm text-muted-foreground sm:inline">{name}</span>}
            <NotificationBell />
            <ChangePasswordDialog />
            <MaintenanceReminder />
          </div>
        </div>
      </header>
    </>
  );
}
