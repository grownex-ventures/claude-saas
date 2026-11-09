import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
    AlertTriangle,
    Check,
    ChevronDown,
    Copy,
    Eye,
    EyeOff,
    Globe,
    Inbox,
    Loader2,
    Lock,
    MessageCircle,
    RefreshCw,
    Send,
    X,
} from "lucide-react";
import { toast } from "sonner";

/* ---------------- Channel meta ---------------- */
export const CHANNEL_META = {
    telegram: { label: "Telegram", icon: Send, tint: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400" },
    whatsapp: { label: "WhatsApp", icon: MessageCircle, tint: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
    widget: { label: "Website Widget", icon: Globe, tint: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400" },
};

export function ChannelIcon({ channel, className = "h-10 w-10", iconClassName = "h-5 w-5" }) {
    const meta = CHANNEL_META[channel];
    if (!meta) return null;
    const Icon = meta.icon;
    return (
        <span className={`flex shrink-0 items-center justify-center rounded-xl ${meta.tint} ${className}`}>
            <Icon className={iconClassName} />
        </span>
    );
}

/* ---------------- Buttons ---------------- */
export function Button({ variant = "primary", size, loading, icon: Icon, children, className = "", type = "button", disabled, ...props }) {
    return (
        <button
            type={type}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${size === "icon" ? "btn-icon" : ""} ${className}`}
            {...props}
        >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" />}
            {children}
        </button>
    );
}

export function CopyButton({ text, label = "Copy", copiedLabel = "Copied", testId, onCopied, variant = "secondary", size = "sm" }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const ta = document.createElement("textarea");
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
        }
        setCopied(true);
        toast.success("Copied to clipboard");
        onCopied?.();
        setTimeout(() => setCopied(false), 1800);
    };
    return (
        <Button variant={variant} size={size} icon={copied ? Check : Copy} onClick={copy} data-testid={testId}>
            {label && (copied ? copiedLabel : label)}
        </Button>
    );
}

/* ---------------- Layout ---------------- */
export function PageHeader({ title, description, actions, testId = "page-header" }) {
    return (
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4" data-testid={testId}>
            <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight app-heading" data-testid="page-title">
                    {title}
                </h1>
                {description && <p className="mt-1 max-w-2xl text-sm app-muted">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

export function Card({ title, description, action, children, className = "", bodyClassName = "p-5 sm:p-6", testId, icon: Icon }) {
    return (
        <section className={`app-card ${className}`} data-testid={testId}>
            {(title || action) && (
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
                    <div className="flex min-w-0 items-start gap-3">
                        {Icon && (
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                                <Icon className="h-4 w-4" />
                            </span>
                        )}
                        <div className="min-w-0">
                            <h2 className="text-base font-semibold app-heading">{title}</h2>
                            {description && <p className="mt-0.5 text-sm app-muted">{description}</p>}
                        </div>
                    </div>
                    {action}
                </header>
            )}
            <div className={bodyClassName}>{children}</div>
        </section>
    );
}

export function StatCard({ label, value, hint, icon: Icon, loading, testId }) {
    return (
        <div className="app-card p-5" data-testid={testId}>
            <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium app-muted">{label}</p>
                {Icon && (
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                        <Icon className="h-4 w-4" />
                    </span>
                )}
            </div>
            {loading ? (
                <Skeleton className="mt-3 h-8 w-24" />
            ) : (
                <p className="mt-2 text-3xl font-bold tracking-tight app-heading" data-testid={testId && `${testId}-value`}>
                    {value}
                </p>
            )}
            {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
        </div>
    );
}

/* ---------------- Status ---------------- */
const STATUS = {
    live: { label: "Live", dot: "bg-emerald-500", cls: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300", pulse: true },
    offline: { label: "Offline", dot: "bg-slate-400", cls: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    not_setup: { label: "Not set up", dot: "bg-amber-500", cls: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300" },
    pending: { label: "Waiting for scan", dot: "bg-amber-500", cls: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300", pulse: true },
    locked: { label: "Locked", icon: Lock, cls: "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    connected: { label: "Connected", dot: "bg-emerald-500", cls: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" },
    disconnected: { label: "Not connected", dot: "bg-slate-400", cls: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    ai: { label: "AI handling", dot: "bg-indigo-500", cls: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300" },
    human: { label: "Needs human", dot: "bg-amber-500", cls: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300" },
    resolved: { label: "Resolved", dot: "bg-emerald-500", cls: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" },
    open: { label: "Open", dot: "bg-sky-500", cls: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300" },
    answered: { label: "Answered", dot: "bg-emerald-500", cls: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" },
    closed: { label: "Closed", dot: "bg-slate-400", cls: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    info: { label: "Info", dot: "bg-sky-500", cls: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300" },
    warn: { label: "Warning", dot: "bg-amber-500", cls: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300" },
    error: { label: "Error", dot: "bg-rose-500", cls: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300" },
};

export function StatusBadge({ status, label, testId }) {
    const s = STATUS[status] || STATUS.offline;
    const Icon = s.icon;
    return (
        <span
            data-testid={testId}
            data-status={status}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}
        >
            {Icon ? (
                <Icon className="h-3 w-3" />
            ) : (
                <span className="relative flex h-1.5 w-1.5">
                    {s.pulse && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${s.dot}`} />}
                    <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${s.dot}`} />
                </span>
            )}
            {label || s.label}
        </span>
    );
}

/* ---------------- Channel card ---------------- */
export function ChannelCard({ channel, data, to, testId }) {
    const meta = CHANNEL_META[channel];
    const identity =
        channel === "telegram"
            ? data.status === "not_setup" || data.locked ? "No bot connected yet" : data.username ? `@${data.username}` : "Detecting username…"
            : channel === "whatsapp"
              ? data.number || (data.status === "pending" ? "Waiting for QR scan" : "No number linked yet")
              : data.status === "live" ? "Installed on your site" : "Not installed yet";
    return (
        <div className="app-card flex flex-col p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]" data-testid={testId}>
            <div className="flex items-start justify-between gap-3">
                <ChannelIcon channel={channel} />
                <StatusBadge status={data.status} testId={testId && `${testId}-status`} />
            </div>
            <p className="mt-4 font-semibold app-heading">{meta.label}</p>
            <p className="mt-0.5 break-all text-sm app-muted" data-testid={testId && `${testId}-identity`}>
                {identity}
            </p>
            <Link to={to} className="btn btn-secondary btn-sm mt-5 self-start" data-testid={testId && `${testId}-manage`}>
                {data.locked ? "Upgrade to unlock" : data.status === "not_setup" ? "Set up" : "Manage"}
            </Link>
        </div>
    );
}

/* ---------------- Feedback states ---------------- */
export const Skeleton = ({ className = "" }) => (
    <div className={`skeleton rounded-lg bg-slate-200/70 dark:bg-slate-800 ${className}`} aria-hidden="true" />
);

export function SkeletonCard({ lines = 3, className = "" }) {
    return (
        <div className={`app-card space-y-3 p-6 ${className}`} data-testid="skeleton-card">
            <Skeleton className="h-5 w-1/3" />
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton key={i} className={`h-4 ${i % 2 ? "w-2/3" : "w-full"}`} />
            ))}
        </div>
    );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className = "", testId = "empty-state" }) {
    return (
        <div className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`} data-testid={testId}>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                <Icon className="h-6 w-6" />
            </span>
            <h3 className="mt-4 text-base font-semibold app-heading">{title}</h3>
            {description && <p className="mt-1 max-w-sm text-sm app-muted">{description}</p>}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}

export function ErrorState({ message = "Something went wrong.", onRetry, className = "", testId = "error-state" }) {
    return (
        <div className={`app-card flex flex-col items-center justify-center px-6 py-12 text-center ${className}`} data-testid={testId} role="alert">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
                <AlertTriangle className="h-6 w-6" />
            </span>
            <h3 className="mt-4 text-base font-semibold app-heading">Couldn't load this</h3>
            <p className="mt-1 max-w-sm text-sm app-muted">{message}</p>
            {onRetry && (
                <Button variant="secondary" size="sm" icon={RefreshCw} className="mt-5" onClick={onRetry} data-testid={`${testId}-retry`}>
                    Try again
                </Button>
            )}
        </div>
    );
}

/** Renders skeleton → error → children(data). */
export function QueryState({ query, skeleton, children, errorClassName }) {
    if (query.isLoading) return skeleton ?? <SkeletonCard />;
    if (query.isError) return <ErrorState message={query.error?.message} onRetry={() => query.refetch()} className={errorClassName} />;
    return children(query.data);
}

/* ---------------- Form controls ---------------- */
export function Field({ label, htmlFor, hint, error, children, labelRight, className = "" }) {
    return (
        <div className={className}>
            {(label || labelRight) && (
                <div className="mb-1.5 flex items-center justify-between gap-3">
                    {label && (
                        <label htmlFor={htmlFor} className="app-label">
                            {label}
                        </label>
                    )}
                    {labelRight}
                </div>
            )}
            {children}
            {error ? (
                <p className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400" role="alert" data-testid={htmlFor && `${htmlFor}-error`}>
                    {error}
                </p>
            ) : (
                hint && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
            )}
        </div>
    );
}

export function SecretInput({ id, value, onChange, placeholder, error, testId, ...props }) {
    const [show, setShow] = useState(false);
    return (
        <div className="relative">
            <input
                id={id}
                type={show ? "text" : "password"}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                autoComplete="off"
                spellCheck={false}
                data-testid={testId}
                aria-invalid={Boolean(error)}
                className={`app-input pr-11 font-mono ${error ? "app-input-error" : ""}`}
                {...props}
            />
            <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide value" : "Show value"}
                data-testid={testId && `${testId}-toggle`}
                className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
        </div>
    );
}

export function Select({ options, className = "", ...props }) {
    return (
        <div className="relative">
            <select className={`app-input appearance-none pr-10 ${className}`} {...props}>
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>
    );
}

export function Switch({ checked, onChange, disabled, label, testId, size = "md" }) {
    const big = size === "md";
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            data-testid={testId}
            className={`relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-900 ${
                big ? "h-6 w-11" : "h-5 w-9"
            } ${checked ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-700"}`}
        >
            <span
                className={`inline-block transform rounded-full bg-white shadow transition-transform duration-200 ${big ? "h-5 w-5" : "h-4 w-4"} ${
                    checked ? (big ? "translate-x-[22px]" : "translate-x-[18px]") : "translate-x-0.5"
                }`}
            />
        </button>
    );
}

export function ToggleRow({ title, description, checked, onChange, disabled, testId }) {
    return (
        <div className="flex items-start justify-between gap-4 py-3.5">
            <div className="min-w-0">
                <p className="text-sm font-semibold app-heading">{title}</p>
                {description && <p className="mt-0.5 text-sm app-muted">{description}</p>}
            </div>
            <Switch checked={checked} onChange={onChange} disabled={disabled} label={title} testId={testId} />
        </div>
    );
}

export function Segmented({ options, value, onChange, testId, className = "" }) {
    return (
        <div
            role="tablist"
            className={`inline-flex flex-wrap gap-1 rounded-full border border-slate-200 bg-slate-100/80 p-1 dark:border-slate-800 dark:bg-slate-900 ${className}`}
            data-testid={testId}
        >
            {options.map((o) => {
                const active = o.value === value;
                const Icon = o.icon;
                return (
                    <button
                        key={o.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(o.value)}
                        data-testid={testId && `${testId}-${o.value}`}
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                            active
                                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                        }`}
                    >
                        {Icon && <Icon className="h-4 w-4" />}
                        {o.label}
                        {o.badge}
                    </button>
                );
            })}
        </div>
    );
}

/* ---------------- Stepper ---------------- */
export function StepperFlow({ steps, current, testId = "stepper" }) {
    return (
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-3" data-testid={testId}>
            {steps.map((label, i) => {
                const done = i < current;
                const active = i === current;
                return (
                    <Fragment key={label}>
                        <li className="flex items-center gap-2.5" data-testid={`${testId}-step-${i + 1}`} data-state={done ? "done" : active ? "active" : "todo"}>
                            <span
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-300 ${
                                    done
                                        ? "bg-emerald-500 text-white"
                                        : active
                                          ? "bg-indigo-600 text-white shadow-[0_0_0_4px_rgba(79,70,229,0.15)]"
                                          : "border border-slate-300 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                                }`}
                            >
                                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                            </span>
                            <span className={`text-sm font-semibold ${active || done ? "app-heading" : "text-slate-500 dark:text-slate-400"}`}>{label}</span>
                        </li>
                        {i < steps.length - 1 && (
                            <li aria-hidden="true" className={`hidden h-px w-8 sm:block lg:w-12 ${done ? "bg-emerald-400" : "bg-slate-200 dark:bg-slate-700"}`} />
                        )}
                    </Fragment>
                );
            })}
        </ol>
    );
}

/* ---------------- Modal ---------------- */
export function Modal({ open = true, title, description, onClose, children, maxWidth = "max-w-md", testId = "modal" }) {
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => e.key === "Escape" && onClose && onClose();
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div className="fixed inset-0 z-[60] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={`${testId}-title`}
                        initial={{ opacity: 0, y: 12, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 12, scale: 0.98 }}
                        transition={{ duration: 0.18 }}
                        className={`app-card relative w-full ${maxWidth} p-6 shadow-2xl`}
                        data-testid={testId}
                    >
                        {onClose && (
                            <button type="button" onClick={onClose} aria-label="Close" className="btn btn-ghost btn-icon absolute right-3 top-3">
                                <X className="h-4 w-4" />
                            </button>
                        )}
                        {title && (
                            <h2 id={`${testId}-title`} className="text-lg font-semibold app-heading">
                                {title}
                            </h2>
                        )}
                        {description && <p className="mt-1 text-sm app-muted mb-4">{description}</p>}
                        {children}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export function ConfirmModal({ open, title, description, confirmLabel = "Confirm", danger = true, loading, onConfirm, onClose, requireText, testId = "confirm-modal" }) {
    const [typed, setTyped] = useState("");
    useEffect(() => {
        if (!open) return undefined;
        setTyped("");
        const onKey = (e) => e.key === "Escape" && !loading && onClose();
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, loading, onClose]);
    const blocked = requireText && typed !== requireText;
    return (
        <AnimatePresence>
            {open && (
                <motion.div className="fixed inset-0 z-[60] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !loading && onClose()} />
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={`${testId}-title`}
                        initial={{ opacity: 0, y: 12, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 12, scale: 0.98 }}
                        transition={{ duration: 0.18 }}
                        className="app-card relative w-full max-w-md p-6 shadow-2xl"
                        data-testid={testId}
                    >
                        <button type="button" onClick={onClose} disabled={loading} aria-label="Close" className="btn btn-ghost btn-icon absolute right-3 top-3" data-testid={`${testId}-close`}>
                            <X className="h-4 w-4" />
                        </button>
                        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${danger ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" : "bg-indigo-50 text-indigo-600"}`}>
                            <AlertTriangle className="h-5 w-5" />
                        </span>
                        <h2 id={`${testId}-title`} className="mt-4 text-lg font-semibold app-heading">
                            {title}
                        </h2>
                        {description && <p className="mt-1.5 text-sm app-muted">{description}</p>}
                        {requireText && (
                            <div className="mt-4">
                                <label className="text-sm app-muted" htmlFor={`${testId}-input`}>
                                    Type <b className="font-mono app-heading">{requireText}</b> to confirm
                                </label>
                                <input id={`${testId}-input`} value={typed} onChange={(e) => setTyped(e.target.value)} className="app-input mt-1.5" data-testid={`${testId}-input`} autoComplete="off" />
                            </div>
                        )}
                        <div className="mt-6 flex flex-wrap justify-end gap-2">
                            <Button variant="secondary" onClick={onClose} disabled={loading} data-testid={`${testId}-cancel`}>
                                Cancel
                            </Button>
                            <Button variant={danger ? "danger" : "primary"} loading={loading} disabled={blocked} onClick={onConfirm} data-testid={`${testId}-confirm`}>
                                {confirmLabel}
                            </Button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

/* ---------------- Data table ---------------- */
export function DataTable({ columns, rows, rowKey = (r) => r.id, renderExpanded, empty, testId = "data-table" }) {
    const [open, setOpen] = useState(null);
    if (!rows.length) return empty;
    return (
        <div className="overflow-x-auto" data-testid={testId}>
            <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        {renderExpanded && <th className="w-10 px-3 py-3" />}
                        {columns.map((c) => (
                            <th key={c.key} className={`px-3 py-3 ${c.className || ""}`}>
                                {c.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => {
                        const k = rowKey(r);
                        const isOpen = open === k;
                        return (
                            <Fragment key={k}>
                                <tr
                                    className={`border-b border-slate-100 transition-colors dark:border-slate-800/70 ${renderExpanded ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" : ""} ${isOpen ? "bg-slate-50 dark:bg-slate-800/40" : ""}`}
                                    onClick={() => renderExpanded && setOpen(isOpen ? null : k)}
                                    data-testid={`${testId}-row`}
                                >
                                    {renderExpanded && (
                                        <td className="px-3 py-3">
                                            <button
                                                type="button"
                                                aria-expanded={isOpen}
                                                aria-label={isOpen ? "Collapse row" : "Expand row"}
                                                className="btn btn-ghost h-7 w-7 px-0"
                                                data-testid={`${testId}-row-toggle`}
                                            >
                                                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                                            </button>
                                        </td>
                                    )}
                                    {columns.map((c) => (
                                        <td key={c.key} className={`px-3 py-3 align-top text-slate-700 dark:text-slate-300 ${c.className || ""}`}>
                                            {c.render ? c.render(r) : r[c.key]}
                                        </td>
                                    ))}
                                </tr>
                                {isOpen && (
                                    <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800/70 dark:bg-slate-800/40">
                                        <td colSpan={columns.length + 1} className="px-3 pb-4">
                                            {renderExpanded(r)}
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/* ---------------- Locked preview ---------------- */
export function LockedPreview({ channelLabel, planName = "Pro", children, testId = "locked-preview" }) {
    return (
        <div className="relative" data-testid={testId}>
            <div className="pointer-events-none select-none blur-[3px] opacity-60" aria-hidden="true">
                {children}
            </div>
            <div className="absolute inset-0 flex items-start justify-center p-4 pt-16">
                <div className="app-card max-w-sm p-6 text-center shadow-[0_30px_60px_-30px_rgba(15,23,42,0.45)]">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                        <Lock className="h-6 w-6" />
                    </span>
                    <h3 className="mt-4 text-base font-semibold app-heading">{channelLabel} is available on {planName}</h3>
                    <p className="mt-1 text-sm app-muted">Upgrade your plan to activate {channelLabel} and let the AI answer customers there too.</p>
                    <Link to="/dashboard/billing" className="btn btn-primary mt-5" data-testid={`${testId}-upgrade`}>
                        Upgrade to unlock
                    </Link>
                </div>
            </div>
        </div>
    );
}

export const initials = (name = "") => name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "U";
