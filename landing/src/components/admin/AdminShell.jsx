import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Bot,
  CreditCard,
  ExternalLink,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  ShieldAlert,
  Sun,
  Users,
  X
} from "lucide-react";
import { LogoMark } from "@/components/landing/Logo";
import { useAdminSession } from "@/lib/adminAuth";
import { useApplyTheme, useTheme } from "@/lib/theme";
import { adminApi } from "@/lib/adminApi";

export const ADMIN_NAV = [
  { to: "/admin", label: "Overview & Ops", icon: LayoutDashboard, end: true },
  { to: "/admin/tenants", label: "Tenants & Users", icon: Users },
  { to: "/admin/tickets", label: "Support Tickets", icon: LifeBuoy },
  { to: "/admin/ai", label: "AI Engine", icon: Bot },
  { to: "/admin/integrations", label: "Integrations & SMTP", icon: Plug },
  { to: "/admin/leads", label: "Landing Leads", icon: Inbox },
  { to: "/admin/invoices", label: "Crypto Invoices", icon: CreditCard },
];

export default function AdminShell() {
  useApplyTheme();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("ysmm_admin_sidebar") === "collapsed");
  const [drawer, setDrawer] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevCountRef = useRef(null);

  const fetchUnread = async () => {
    try {
      const data = await adminApi.getUnreadTicketCount();
      if (data && typeof data.unreadCount === "number") {
        if (prevCountRef.current !== null && data.unreadCount > prevCountRef.current) {
          toast.info(`📩 New support ticket received (${data.unreadCount} unread)`);
        }
        prevCountRef.current = data.unreadCount;
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // background polling
    }
  };

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 15000);
    const onTicketRead = () => fetchUnread();
    window.addEventListener("ticket-read", onTicketRead);
    return () => {
      clearInterval(interval);
      window.removeEventListener("ticket-read", onTicketRead);
    };
  }, [location.pathname]);

  const current = [...ADMIN_NAV].reverse().find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to))) || ADMIN_NAV[0];

  useEffect(() => {
    localStorage.setItem("ysmm_admin_sidebar", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  useEffect(() => {
    setDrawer(false);
    document.title = `${current.label} | Super Admin YourSMMagent`;
  }, [location.pathname, current.label]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100" data-testid="admin-shell">
      {/* Desktop Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden border-r border-slate-200 bg-white transition-[width] duration-300 dark:border-slate-800 dark:bg-slate-900 lg:block ${
          collapsed ? "w-[76px]" : "w-64"
        }`}
        data-testid="admin-sidebar"
        data-collapsed={collapsed}
      >
        <SidebarContent
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          unreadCount={unreadCount}
        />
      </aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.25 }}
              className="fixed inset-y-0 left-0 z-50 w-72 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:hidden"
            >
              <SidebarContent unreadCount={unreadCount} />
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Close menu"
                className="btn btn-ghost btn-icon absolute right-3 top-3.5"
              >
                <X className="h-5 w-5" />
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className={`transition-[padding] duration-300 ${collapsed ? "lg:pl-[76px]" : "lg:pl-64"}`}>
        <TopBar
          onOpenMenu={() => setDrawer(true)}
          currentLabel={current.label}
          collapsed={collapsed}
          onToggleSidebar={() => setCollapsed((c) => !c)}
        />
        <main className="p-4 sm:p-6 lg:p-8" data-testid="admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ collapsed, onToggle, unreadCount = 0 }) {
  const { admin, logout } = useAdminSession();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/admin/login");
  };

  return (
    <div className="flex h-full flex-col">
      {/* Brand Header */}
      <div className={`flex h-16 items-center border-b border-slate-100 px-3.5 dark:border-slate-800 ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed ? (
          <>
            <Link to="/admin" className="flex items-center gap-2.5 overflow-hidden font-bold">
              <LogoMark className="h-8 w-8 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <div className="flex flex-col">
                <span className="text-sm font-bold leading-tight">YourSMMagent</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  Super Admin
                </span>
              </div>
            </Link>
            {onToggle && (
              <button
                type="button"
                onClick={onToggle}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="btn btn-ghost btn-icon text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Expand sidebar"
            title="Click to expand sidebar"
            className="group relative flex h-10 w-10 items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <LogoMark className="h-8 w-8 shrink-0 text-indigo-600 dark:text-indigo-400 transition-transform group-hover:scale-95" />
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-white shadow ring-2 ring-white dark:ring-slate-900">
              <PanelLeftOpen className="h-2.5 w-2.5" />
            </span>
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Super Admin Navigation">
        {ADMIN_NAV.map((item) => {
          const Icon = item.icon;
          const isTickets = item.to === "/admin/tickets";
          const count = isTickets ? unreadCount : 0;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={collapsed ? (count > 0 ? `${item.label} (${count})` : item.label) : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  collapsed ? "justify-center px-2" : ""
                } ${
                  isActive
                    ? "bg-indigo-50 font-semibold text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200"
                }`
              }
            >
              <div className="relative shrink-0 flex items-center justify-center">
                <Icon className="h-5 w-5 shrink-0" />
                {collapsed && count > 0 && (
                  <span
                    className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[9px] font-bold text-amber-950 ring-2 ring-white dark:ring-slate-900"
                    title={`${count} unread`}
                  >
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </div>
              {!collapsed && (
                <>
                  <span className="truncate">{item.label}</span>
                  {count > 0 && (
                    <span className="ml-auto inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                      ({count})
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}

        <div className="pt-3">
          <div className="border-t border-slate-100 dark:border-slate-800 my-2" />
          <Link
            to="/dashboard"
            target="_blank"
            title={collapsed ? "Customer Dashboard" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200 ${
              collapsed ? "justify-center px-2" : ""
            }`}
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Customer App ↗</span>}
          </Link>
        </div>
      </nav>

      {/* Collapse / Expand Toggle Button (Matches User Dashboard AppShell) */}
      {onToggle && (
        <div className="border-t border-slate-100 p-2 dark:border-slate-800">
          <button
            type="button"
            onClick={onToggle}
            className={`flex h-9 w-full items-center rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors ${
              collapsed ? "justify-center px-0" : "justify-start px-3 gap-2.5"
            }`}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && <span>Collapse sidebar</span>}
          </button>
        </div>
      )}

      {/* Footer Profile & Logout */}
      <div className="border-t border-slate-100 p-3 dark:border-slate-800">
        <div className={`flex items-center gap-3 ${collapsed ? "flex-col justify-center" : "justify-between"}`}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white shadow-sm">
              {admin?.name ? admin.name.slice(0, 2).toUpperCase() : "SA"}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{admin?.name || "Super Admin"}</p>
                <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">{admin?.email || ""}</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Log out"
            aria-label="Log out of Super Admin"
            className="btn btn-ghost btn-icon text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function TopBar({ onOpenMenu, currentLabel, collapsed, onToggleSidebar }) {
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          className="btn btn-ghost btn-icon lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden btn btn-ghost btn-icon text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 lg:inline-flex"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-slate-900 dark:text-slate-100">{currentLabel}</span>
          <span className="hidden items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400 sm:inline-flex">
            <ShieldAlert className="h-3 w-3" /> Platform Control
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-label="Toggle color theme"
          className="btn btn-ghost btn-icon text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}
