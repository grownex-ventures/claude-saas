import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronDown, KeyRound, Lock, Mail, RefreshCw, ShieldCheck, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, ConfirmModal, CopyButton, Field, Modal, PageHeader, QueryState, SecretInput, SkeletonCard, StatusBadge, ToggleRow } from "@/components/app/ui";
import {
    VERIFY_COOLDOWN_MS,
    changePassword,
    deleteAccount,
    getSettings,
    regenerateApiKey,
    resendVerification,
    saveNotifications,
    saveProfile,
    setTwoFactor,
} from "@/lib/appApi";
import { authApi } from "@/lib/api";
import { formatDateTime, useAppMutation, useAppQuery } from "@/lib/appQueries";
import { SESSION_KEY, useSession } from "@/lib/auth";
import { ROUTES } from "@/lib/site";

export default function Settings() {
    const q = useAppQuery(["settings"], getSettings);
    return (
        <div data-testid="settings-page">
            <PageHeader title="Settings" description="Your profile, security and account preferences." />
            <QueryState
                query={q}
                skeleton={
                    <div className="space-y-6">
                        <SkeletonCard lines={3} />
                        <SkeletonCard lines={4} />
                    </div>
                }
            >
                {(s) => (
                    <div className="mx-auto max-w-3xl space-y-6">
                        <Profile s={s} />
                        <EmailVerification s={s} onRefresh={() => q.refetch()} />
                        <PasswordCard />
                        <Security s={s} />
                        <Notifications s={s} />
                        <Advanced s={s} />
                        <DangerZone />
                    </div>
                )}
            </QueryState>
        </div>
    );
}

function Profile({ s }) {
    const { data: user } = useSession();
    const [name, setName] = useState(s.name);
    const save = useAppMutation(saveProfile, { success: "Profile saved" });
    return (
        <Card title="Profile" icon={User} testId="settings-profile">
            <form
                className="grid gap-5 sm:grid-cols-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    save.mutate({ name });
                }}
            >
                <Field label="Display name" htmlFor="profile-name" className="sm:col-span-2">
                    <input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="app-input" data-testid="profile-name-input" />
                </Field>
                <Field label="Username" htmlFor="profile-username">
                    <input id="profile-username" value={user?.username || ""} disabled className="app-input" />
                </Field>
                <Field label="Email" htmlFor="profile-email">
                    <input id="profile-email" value={user?.email || ""} disabled className="app-input" />
                </Field>
                <div className="sm:col-span-2">
                    <Button type="submit" loading={save.isPending} disabled={name === s.name} data-testid="profile-save-button">
                        Save profile
                    </Button>
                </div>
            </form>
        </Card>
    );
}

function EmailVerification({ s, onRefresh }) {
    const { data: user } = useSession();
    const [left, setLeft] = useState(0);
    const [checking, setChecking] = useState(false);

    useEffect(() => {
        const tick = () => setLeft(s.verificationSentAt ? Math.max(0, Math.ceil((s.verificationSentAt + VERIFY_COOLDOWN_MS - Date.now()) / 1000)) : 0);
        tick();
        const t = setInterval(tick, 1000);
        return () => clearInterval(t);
    }, [s.verificationSentAt]);

    const resend = useAppMutation(resendVerification, { success: `Verification email dispatched to ${user?.email}` });

    const handleCheckStatus = async () => {
        setChecking(true);
        try {
            await onRefresh?.();
            toast.info("Refreshed verification status");
        } finally {
            setChecking(false);
        }
    };

    return (
        <Card
            title="Email verification"
            icon={Mail}
            testId="settings-email"
            action={<StatusBadge status={s.emailVerified ? "resolved" : "not_setup"} label={s.emailVerified ? "Verified" : "Not verified"} testId="email-verified-badge" />}
        >
            {s.emailVerified ? (
                <p className="text-sm app-muted">
                    <b className="app-heading">{user?.email}</b> is verified. You will receive alerts and invoices here.
                </p>
            ) : (
                <>
                    <p className="text-sm app-muted">
                        We sent a verification link to <b className="break-all app-heading">{user?.email}</b>. Please click the link in your email to verify your address.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button icon={RefreshCw} loading={resend.isPending} disabled={left > 0} onClick={() => resend.mutate()} data-testid="email-resend-button">
                            {left > 0 ? `Resend in ${left}s` : "Resend email"}
                        </Button>
                        <Button variant="secondary" loading={checking} onClick={handleCheckStatus} data-testid="email-check-status">
                            Check status
                        </Button>
                    </div>
                </>
            )}
        </Card>
    );
}

function PasswordCard() {
    const [f, setF] = useState({ current: "", next: "", confirm: "" });
    const [error, setError] = useState();
    const save = useAppMutation(changePassword, {
        success: "Password updated",
        onSuccess: () => setF({ current: "", next: "", confirm: "" }),
        onError: (e) => setError(e.message),
    });
    const set = (k) => (e) => {
        setF((x) => ({ ...x, [k]: e.target.value }));
        setError(undefined);
    };
    return (
        <Card title="Change password" icon={Lock} testId="settings-password">
            <form
                className="grid gap-5 sm:grid-cols-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (f.next !== f.confirm) return setError("New passwords don't match.");
                    save.mutate({ current: f.current, next: f.next });
                }}
                noValidate
            >
                <Field label="Current password" htmlFor="pw-current" className="sm:col-span-2">
                    <SecretInput id="pw-current" value={f.current} onChange={set("current")} testId="password-current-input" />
                </Field>
                <Field label="New password" htmlFor="pw-next" hint="8+ characters with a letter and a number">
                    <SecretInput id="pw-next" value={f.next} onChange={set("next")} testId="password-new-input" />
                </Field>
                <Field label="Confirm new password" htmlFor="pw-confirm">
                    <SecretInput id="pw-confirm" value={f.confirm} onChange={set("confirm")} testId="password-confirm-input" />
                </Field>
                {error && <p className="text-sm font-medium text-rose-600 dark:text-rose-400 sm:col-span-2" role="alert" data-testid="password-error">{error}</p>}
                <div className="sm:col-span-2">
                    <Button type="submit" loading={save.isPending} disabled={!f.current || !f.next} data-testid="password-save-button">
                        Update password
                    </Button>
                </div>
            </form>
        </Card>
    );
}

function Security({ s }) {
    const toggle = useAppMutation(setTwoFactor, { success: (_, on) => `Two-factor authentication ${on ? "enabled" : "disabled"}` });
    return (
        <Card title="Security" icon={ShieldCheck} testId="settings-security">
            <ToggleRow
                title="Two-factor authentication"
                description="Require a 6-digit code from an authenticator app when signing in."
                checked={s.twoFA}
                disabled={toggle.isPending}
                onChange={(v) => toggle.mutate(v)}
                testId="settings-2fa-toggle"
            />
        </Card>
    );
}

const NOTIFS = [
    ["handoff", "Human handoff", "When the AI escalates a conversation to you."],
    ["channelDown", "Channel offline", "When a bot or WhatsApp session stops working."],
    ["dailySummary", "Daily summary", "A short daily email with conversations and AI resolution rate."],
    ["billing", "Billing", "Invoices, failed payments and trial reminders."],
];

function Notifications({ s }) {
    const [prefs, setPrefs] = useState(s.notifications);
    const dirty = JSON.stringify(prefs) !== JSON.stringify(s.notifications);
    const save = useAppMutation(saveNotifications, { success: "Notification preferences saved" });
    return (
        <Card title="Notifications" description="Email alerts we send you." icon={Bell} testId="settings-notifications">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {NOTIFS.map(([k, t, d]) => (
                    <ToggleRow key={k} title={t} description={d} checked={prefs[k]} onChange={(v) => setPrefs((p) => ({ ...p, [k]: v }))} testId={`notif-${k}`} />
                ))}
            </div>
            <Button className="mt-4" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate(prefs)} data-testid="notifications-save-button">
                Save preferences
            </Button>
        </Card>
    );
}

function Advanced({ s }) {
    const [open, setOpen] = useState(false);
    const [regen, setRegen] = useState(null);
    const rotate = useAppMutation(regenerateApiKey, { success: "New key generated — update it wherever you use it", onSuccess: () => setRegen(null) });
    const mask = (k) => `${k.slice(0, 9)}${"•".repeat(12)}${k.slice(-4)}`;
    return (
        <section className="app-card" data-testid="settings-advanced">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:px-6"
                data-testid="settings-advanced-toggle"
            >
                <span className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                        <KeyRound className="h-4 w-4" />
                    </span>
                    <span>
                        <span className="block text-base font-semibold app-heading">Advanced</span>
                        <span className="block text-sm app-muted">Tenant ID and API keys for developers</span>
                    </span>
                </span>
                <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
                <div className="space-y-4 border-t border-slate-100 px-5 py-5 dark:border-slate-800 sm:px-6" data-testid="settings-advanced-content">
                    <KeyRow label="Tenant ID" value={s.tenantId} display={s.tenantId} testId="tenant-id" />
                    {s.apiKeys.map((k) => (
                        <KeyRow
                            key={k.id}
                            label={k.label}
                            value={k.key}
                            display={mask(k.key)}
                            hint={`Created ${formatDateTime(k.createdAt)}`}
                            testId={`api-key-${k.label.toLowerCase().replace(/\s+/g, "-")}`}
                            extra={
                                <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => setRegen(k)} data-testid={`api-key-${k.label.toLowerCase().replace(/\s+/g, "-")}-regenerate`}>
                                    Regenerate
                                </Button>
                            }
                        />
                    ))}
                </div>
            )}
            <ConfirmModal
                open={Boolean(regen)}
                title="Regenerate this key?"
                description="The current key stops working immediately. Anything using it must be updated."
                confirmLabel="Regenerate"
                loading={rotate.isPending}
                onConfirm={() => rotate.mutate(regen.id)}
                onClose={() => setRegen(null)}
                testId="api-key-regenerate-modal"
            />
        </section>
    );
}

const KeyRow = ({ label, value, display, hint, extra, testId }) => (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
        <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-1 break-all font-mono text-sm app-heading" data-testid={`${testId}-value`}>
                {display}
            </p>
            {hint && <p className="mt-0.5 text-xs app-muted">{hint}</p>}
        </div>
        <div className="flex items-center gap-1">
            {extra}
            <CopyButton text={value} testId={`${testId}-copy`} />
        </div>
    </div>
);

function DangerZone() {
    const [open, setOpen] = useState(false);
    const [password, setPassword] = useState("");
    const navigate = useNavigate();
    const qc = useQueryClient();
    const del = useAppMutation(deleteAccount, {
        success: false,
        onSuccess: async () => {
            await authApi.logout();
            qc.setQueryData(SESSION_KEY, null);
            toast.success("Your account has been deleted.");
            navigate(ROUTES.login, { replace: true });
        },
    });

    const handleDelete = (e) => {
        e.preventDefault();
        if (!password) {
            toast.error("Please enter your current password to confirm deletion.");
            return;
        }
        del.mutate({ password });
    };

    return (
        <section className="rounded-2xl border border-rose-200 bg-white p-5 dark:border-rose-500/30 dark:bg-slate-900 sm:p-6" data-testid="settings-danger-zone">
            <h2 className="text-base font-semibold text-rose-700 dark:text-rose-400">Danger zone</h2>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                <p className="max-w-lg text-sm app-muted">Delete your account, stop all channels and permanently erase conversations, logs and settings. This cannot be undone.</p>
                <Button variant="danger-outline" icon={Trash2} onClick={() => { setPassword(""); setOpen(true); }} data-testid="delete-account-button">
                    Delete account
                </Button>
            </div>
            <Modal
                open={open}
                title="Delete your account?"
                description="All channels will stop immediately and your data will be permanently erased. Enter your password to confirm."
                onClose={() => !del.isPending && setOpen(false)}
                testId="delete-account-modal"
            >
                <form onSubmit={handleDelete} className="space-y-4">
                    <Field label="Account password" htmlFor="delete-account-password">
                        <SecretInput
                            id="delete-account-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your current password"
                            autoComplete="current-password"
                            testId="delete-account-password-input"
                        />
                    </Field>
                    <div className="flex flex-wrap justify-end gap-2 pt-2">
                        <Button variant="secondary" onClick={() => setOpen(false)} disabled={del.isPending} data-testid="delete-account-cancel">
                            Cancel
                        </Button>
                        <Button variant="danger" type="submit" loading={del.isPending} disabled={!password} data-testid="delete-account-confirm">
                            Permanently delete account
                        </Button>
                    </div>
                </form>
            </Modal>
        </section>
    );
}
