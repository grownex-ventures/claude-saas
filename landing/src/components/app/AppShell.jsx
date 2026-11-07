import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
    Bot,
    ChevronLeft,
    ChevronRight,
    CreditCard,
    Inbox,
    LifeBuoy,
    LayoutDashboard,
    LogOut,
    Menu,
    MailWarning,
    Moon,
    PanelLeftClose,
    PanelLeftOpen,
    Plug,
    Radio,
    ScrollText,
    Settings,
    Sun,
    Timer,
    X,
} from "lucide-react";
import { toast } from "sonner";
import { LogoMark } from "@/components/landing/Logo";
import { initials } from "@/components/app/ui";
import { getAccount } from "@/lib/appApi";
import { useAppQuery } from "@/lib/appQueries";
import { useLogout, useSession } from "@/lib/auth";
import { LANDING_URL, ROUTES } from "@/lib/site";
import { useApplyTheme, useTheme } from "@/lib/theme";

export const NAV = [
    { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/dashboard/channels", label: "Channels", icon: Radio },
    { to: "/dashboard/inbox", label: "Live Inbox", icon: Inbox },
    { to: "/dashboard/ai", label: "AI & Knowledge", icon: Bot },
    { to: "/dashboard/panel", label: "SMM Panel", icon: Plug },
    { to: "/dashboard/logs", label: "Runtime Logs", icon: ScrollText },
    { to: "/dashboard/billing", label: "Billing & Plans", icon: CreditCard },
    { to: "/dashboard/support", label: "Support", icon: LifeBuoy },
    { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

const daysLeft = (ts) => Math.max(0, Math.ceil((ts - Date.now()) / 86_400_000));

export default function AppShell() {
    useApplyTheme();
    const location = useLocation();
    const [collapsed, setCollapsed] = useState(() => localStorage.getItem("ysmm_sidebar") === "collapsed");
    const [drawer, setDrawer] = useState(false);
    const current = [...NAV].reverse().find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to))) || NAV[0];

    useEffect(() => {
        localStorage.setItem("ysmm_sidebar", collapsed ? "collapsed" : "expanded");
    }, [collapsed]);
    useEffect(() => {
        setDrawer(false);
        document.title = `${current.label} | YourSMMagent`;
    }, [location.pathname, current.label]);

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100" data-testid="app-shell">
            <aside
                className={`fixed inset-y-0 left-0 z-30 hidden border-r border-slate-200 bg-white transition-[width] duration-300 dark:border-slate-800 dark:bg-slate-900 lg:block ${collapsed ? "w-[76px]" : "w-64"}`}
                data-testid="app-sidebar"
                data-collapsed={collapsed}
            >
                <SidebarContent collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
            </aside>

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
                            data-testid="app-mobile-drawer"
                        >
                            <SidebarContent />
                            <button
                                type="button"
                                onClick={() => setDrawer(false)}
                                aria-label="Close menu"
                                className="btn btn-ghost btn-icon absolute right-3 top-3.5"
                                data-testid="app-mobile-drawer-close"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>

            <div className={`transition-[padding] duration-300 ${collapsed ? "lg:pl-[76px]" : "lg:pl-64"}`}>
                <TopBar title={current.label} onMenu={() => setDrawer(true)} />
                <AlertStrip />
                <motion.main
                    key={location.pathname}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
                >
                    <Outlet />
                </motion.main>
            </div>
        </div>
    );
}

function SidebarContent({ collapsed = false, onToggle }) {
    return (
        <div className="flex h-full flex-col">
            <a href={LANDING_URL} className={`flex h-16 shrink-0 items-center gap-2.5 ${collapsed ? "justify-center px-0" : "px-5"}`} data-testid="app-logo-link" aria-label="YourSMMagent home">
                <LogoMark className="h-8 w-8 shrink-0" />
                {!collapsed && (
                    <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                        Your<span className="text-indigo-600 dark:text-indigo-400">SMM</span>agent
                    </span>
                )}
            </a>
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3" aria-label="App navigation">
                {NAV.map(({ to, label, icon: Icon, end }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={end}
                        title={collapsed ? label : undefined}
                        data-testid={`sidebar-link-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                        className={({ isActive }) =>
                            `group relative flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                                collapsed ? "justify-center px-0" : "px-3"
                            } ${
                                isActive
                                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                            }`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                {isActive && <span className="absolute left-0 top-2 h-6 w-1 rounded-r-full bg-indigo-600 dark:bg-indigo-400" />}
                                <Icon className="h-[18px] w-[18px] shrink-0" />
                                {!collapsed && <span>{label}</span>}
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>
            {onToggle && (
                <div className="border-t border-slate-200 p-3 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={onToggle}
                        className={`btn btn-ghost h-10 w-full rounded-xl ${collapsed ? "px-0" : "justify-start px-3"}`}
                        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                        data-testid="sidebar-collapse-toggle"
                    >
                        {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
                        {!collapsed && "Collapse"}
                    </button>
                </div>
            )}
        </div>
    );
}

function TopBar({ title, onMenu }) {
    const { theme, toggle } = useTheme();
    const account = useAppQuery(["account"], getAccount);
    const a = account.data;
    const badge = a ? (a.trial ? `${a.plan.name.toUpperCase()} TRIAL · ${daysLeft(a.trialEndsAt)} days left` : a.plan.name.toUpperCase()) : null;

    return (
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80">
            <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
                <button type="button" onClick={onMenu} aria-label="Open menu" className="btn btn-secondary btn-icon lg:hidden" data-testid="app-mobile-menu-button">
                    <Menu className="h-[18px] w-[18px]" />
                </button>
                <p className="min-w-0 text-sm font-semibold app-heading" data-testid="topbar-title">
                    {title}
                </p>
                <div className="ml-auto flex items-center gap-2 sm:gap-3">
                    {badge && (
                        <Link
                            to="/dashboard/billing"
                            data-testid="topbar-plan-badge"
                            className="hidden items-center rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] font-bold tracking-[0.08em] text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 sm:inline-flex"
                        >
                            {badge}
                        </Link>
                    )}
                    <button
                        type="button"
                        onClick={toggle}
                        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                        className="btn btn-ghost btn-icon"
                        data-testid="theme-toggle"
                    >
                        {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
                    </button>
                    <AvatarMenu />
                </div>
            </div>
        </header>
    );
}

function AvatarMenu() {
    const { data: user } = useSession();
    const logout = useLogout();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
        const esc = (e) => e.key === "Escape" && setOpen(false);
        document.addEventListener("mousedown", close);
        document.addEventListener("keydown", esc);
        return () => {
            document.removeEventListener("mousedown", close);
            document.removeEventListener("keydown", esc);
        };
    }, []);

    const signOut = () =>
        logout.mutate(undefined, {
            onSuccess: () => {
                toast.success("You've been signed out.");
                navigate(ROUTES.login, { replace: true });
            },
        });

    const item = "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors";
    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-label="Account menu"
                data-testid="avatar-menu-button"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-blue-600 text-xs font-bold text-white ring-offset-2 transition-shadow hover:ring-2 hover:ring-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:ring-offset-slate-900 dark:hover:ring-indigo-500/40"
            >
                {initials(user?.username || user?.email)}
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className="app-card absolute right-0 mt-2 w-64 origin-top-right p-2 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.35)]"
                        data-testid="avatar-menu"
                    >
                        <div className="border-b border-slate-100 px-3 pb-3 pt-2 dark:border-slate-800">
                            <p className="break-all text-sm font-semibold app-heading" data-testid="avatar-menu-username">
                                {user?.username}
                            </p>
                            <p className="break-all text-xs app-muted">{user?.email}</p>
                        </div>
                        <div className="pt-1">
                            <Link to="/dashboard/settings" onClick={() => setOpen(false)} className={`${item} text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800`} data-testid="avatar-menu-settings">
                                <Settings className="h-4 w-4 text-slate-400" /> Settings
                            </Link>
                            <Link to="/dashboard/billing" onClick={() => setOpen(false)} className={`${item} text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800`} data-testid="avatar-menu-billing">
                                <CreditCard className="h-4 w-4 text-slate-400" /> Billing & Plans
                            </Link>
                            <button type="button" onClick={signOut} disabled={logout.isPending} className={`${item} text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10`} data-testid="avatar-menu-signout">
                                <LogOut className="h-4 w-4" /> {logout.isPending ? "Signing out…" : "Sign out"}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/** One dismissible strip for all account alerts (cycles with arrows). */
function AlertStrip() {
    const { data: a } = useAppQuery(["account"], getAccount);
    const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("ysmm_alerts_dismissed") === "1");
    const [idx, setIdx] = useState(0);
    if (!a || dismissed) return null;
    const alerts = [
        !a.emailVerified && { id: "email", icon: MailWarning, text: "Please verify your email address to keep your channels running.", cta: "Verify email", to: "/dashboard/settings" },
        a.trial && daysLeft(a.trialEndsAt) <= 14 && { id: "trial", icon: Timer, text: `Your ${a.plan.name} trial ends in ${daysLeft(a.trialEndsAt)} days.`, cta: "Choose a plan", to: "/dashboard/billing" },
    ].filter(Boolean);
    if (!alerts.length) return null;
    const cur = alerts[Math.min(idx, alerts.length - 1)];
    const Icon = cur.icon;
    const dismiss = () => {
        sessionStorage.setItem("ysmm_alerts_dismissed", "1");
        setDismissed(true);
    };
    return (
        <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10" data-testid="alert-strip" data-alert={cur.id}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-8">
                <Icon className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                <p className="min-w-0 flex-1 text-sm font-medium text-amber-900 dark:text-amber-100" data-testid="alert-strip-text">
                    {cur.text}{" "}
                    <Link to={cur.to} className="font-semibold underline decoration-amber-400 underline-offset-2 hover:text-amber-700 dark:hover:text-amber-200" data-testid="alert-strip-cta">
                        {cur.cta}
                    </Link>
                </p>
                <div className="flex items-center gap-1">
                    {alerts.length > 1 && (
                        <>
                            <button type="button" aria-label="Previous alert" className="btn btn-ghost h-7 w-7 px-0 text-amber-800 dark:text-amber-200" onClick={() => setIdx((i) => (i - 1 + alerts.length) % alerts.length)} data-testid="alert-strip-prev">
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <span className="text-xs font-semibold tabular-nums text-amber-800 dark:text-amber-200" data-testid="alert-strip-count">
                                {alerts.indexOf(cur) + 1} / {alerts.length}
                            </span>
                            <button type="button" aria-label="Next alert" className="btn btn-ghost h-7 w-7 px-0 text-amber-800 dark:text-amber-200" onClick={() => setIdx((i) => (i + 1) % alerts.length)} data-testid="alert-strip-next">
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </>
                    )}
                    <button type="button" aria-label="Dismiss alerts" className="btn btn-ghost h-7 w-7 px-0 text-amber-800 dark:text-amber-200" onClick={dismiss} data-testid="alert-strip-dismiss">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
