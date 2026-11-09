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
    disableTwoFactor,
    enableTwoFactor,
    getSettings,
    regenerateApiKey,
    resendVerification,
    saveNotifications,
    saveProfile,
    setTwoFactor,
    setupTwoFactor,
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
                        <Security s={s} onRefresh={() => q.refetch()} />
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

function Security({ s, onRefresh }) {
    const [setupOpen, setSetupOpen] = useState(false);
    const [disableOpen, setDisableOpen] = useState(false);
    const [setupData, setSetupData] = useState(null);
    const [setupLoading, setSetupLoading] = useState(false);
    const [setupError, setSetupError] = useState(null);
    const [verifyCode, setVerifyCode] = useState("");
    const [activating, setActivating] = useState(false);
    const [backupCodes, setBackupCodes] = useState(null);

    // Disable state
    const [disableCred, setDisableCred] = useState("");
    const [disabling, setDisabling] = useState(false);
    const [disableError, setDisableError] = useState(null);

    const handleToggle = (turnOn) => {
        if (turnOn) {
            setSetupData(null);
            setSetupError(null);
            setVerifyCode("");
            setBackupCodes(null);
            setSetupOpen(true);
            setSetupLoading(true);
            setupTwoFactor()
                .then((data) => setSetupData(data))
                .catch((e) => setSetupError(e.message || "Failed to initialize 2FA setup."))
                .finally(() => setSetupLoading(false));
        } else {
            setDisableCred("");
            setDisableError(null);
            setDisableOpen(true);
        }
    };

    const handleVerifySetup = async (e) => {
        e.preventDefault();
        const code = verifyCode.trim();
        if (!code || !/^\d{6}$/.test(code)) {
            setSetupError("Enter a valid 6-digit code from your authenticator app.");
            return;
        }
        setActivating(true);
        setSetupError(null);
        try {
            await enableTwoFactor({ code });
            toast.success("Two-factor authentication enabled successfully!");
            if (setupData?.backupCodes?.length) {
                setBackupCodes(setupData.backupCodes);
            } else {
                setSetupOpen(false);
            }
            onRefresh?.();
        } catch (err) {
            setSetupError(err.message || "Invalid code. Please ensure your authenticator clock is synced.");
        } finally {
            setActivating(false);
        }
    };

    const handleDisable = async (e) => {
        e.preventDefault();
        const cred = disableCred.trim();
        if (!cred) {
            setDisableError("Enter your current password or 6-digit code.");
            return;
        }
        setDisabling(true);
        setDisableError(null);
        try {
            await disableTwoFactor({ passwordOrCode: cred });
            toast.success("Two-factor authentication disabled.");
            setDisableOpen(false);
            onRefresh?.();
        } catch (err) {
            setDisableError(err.message || "Failed to disable 2FA.");
        } finally {
            setDisabling(false);
        }
    };

    return (
        <Card title="Security" icon={ShieldCheck} testId="settings-security">
            <ToggleRow
                title="Two-factor authentication"
                description="Require a 6-digit code from an authenticator app (Google Authenticator, Authy) when signing in."
                checked={s.twoFA}
                onChange={handleToggle}
                testId="settings-2fa-toggle"
            />

            {/* 2FA Setup Modal */}
            <Modal
                open={setupOpen}
                title={backupCodes ? "Save your backup codes" : "Set up two-factor authentication"}
                description={
                    backupCodes
                        ? "Store these one-time codes in a safe place. If you ever lose your phone, each code can be used once to access your account."
                        : "Scan the QR code with your authenticator app and enter the 6-digit verification code below."
                }
                onClose={() => !activating && setSetupOpen(false)}
                maxWidth={backupCodes ? "max-w-lg" : "max-w-md"}
                testId="2fa-setup-modal"
            >
                {backupCodes ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-sm text-slate-800 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200">
                            {backupCodes.map((c, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <span className="text-xs text-slate-400 select-none">#{i + 1}</span>
                                    <span className="font-semibold tracking-wider">{c}</span>
                                </div>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                            <CopyButton
                                text={backupCodes.join("\n")}
                                label="Copy all codes"
                                copiedLabel="Copied all codes!"
                                testId="2fa-copy-backup-codes"
                            />
                            <Button
                                variant="primary"
                                onClick={() => setSetupOpen(false)}
                                testId="2fa-backup-codes-done"
                            >
                                Done
                            </Button>
                        </div>
                    </div>
                ) : setupLoading ? (
                    <div className="flex flex-col items-center justify-center py-10 space-y-3">
                        <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
                        <p className="text-sm app-muted">Generating your secure 2FA QR code…</p>
                    </div>
                ) : setupError && !setupData ? (
                    <div className="space-y-4 py-2">
                        <p className="text-sm text-rose-600 dark:text-rose-400">{setupError}</p>
                        <Button variant="secondary" onClick={() => handleToggle(true)}>Retry setup</Button>
                    </div>
                ) : (
                    <form onSubmit={handleVerifySetup} className="space-y-4">
                        {setupData?.qrCodeDataUrl && (
                            <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                                <img
                                    src={setupData.qrCodeDataUrl}
                                    alt="2FA QR Code"
                                    className="h-44 w-44 rounded-lg border border-slate-100 p-1"
                                    data-testid="2fa-qr-image"
                                />
                                <div className="mt-3 flex w-full flex-col items-center text-center">
                                    <span className="text-xs app-muted">Can't scan? Enter this key manually:</span>
                                    <div className="mt-1 flex items-center gap-2">
                                        <code className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono font-semibold tracking-wider text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                                            {setupData.secret}
                                        </code>
                                        <CopyButton text={setupData.secret} label="Copy" size="xs" />
                                    </div>
                                </div>
                            </div>
                        )}

                        <Field label="6-Digit verification code" htmlFor="2fa-verify-code" hint="Enter the current code showing in your authenticator app">
                            <input
                                id="2fa-verify-code"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={6}
                                placeholder="123456"
                                value={verifyCode}
                                onChange={(e) => {
                                    setVerifyCode(e.target.value);
                                    setSetupError(null);
                                }}
                                autoFocus
                                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-center text-lg tracking-widest text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                data-testid="2fa-code-input"
                            />
                        </Field>

                        {setupError && (
                            <p className="text-sm font-medium text-rose-600 dark:text-rose-400" role="alert" data-testid="2fa-setup-error">
                                {setupError}
                            </p>
                        )}

                        <div className="flex flex-wrap justify-end gap-2 pt-2">
                            <Button variant="secondary" onClick={() => setSetupOpen(false)} disabled={activating}>
                                Cancel
                            </Button>
                            <Button variant="primary" type="submit" loading={activating} disabled={verifyCode.trim().length !== 6} data-testid="2fa-activate-button">
                                Verify & Activate
                            </Button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* 2FA Disable Modal */}
            <Modal
                open={disableOpen}
                title="Disable two-factor authentication?"
                description="Your account will only be protected by your password. Enter your current password or 6-digit authenticator code to confirm."
                onClose={() => !disabling && setDisableOpen(false)}
                testId="2fa-disable-modal"
            >
                <form onSubmit={handleDisable} className="space-y-4">
                    <Field label="Current password or 2FA code" htmlFor="2fa-disable-cred">
                        <SecretInput
                            id="2fa-disable-cred"
                            value={disableCred}
                            onChange={(e) => {
                                setDisableCred(e.target.value);
                                setDisableError(null);
                            }}
                            placeholder="Enter password or 6-digit code"
                            autoComplete="current-password"
                            testId="2fa-disable-cred-input"
                        />
                    </Field>

                    {disableError && (
                        <p className="text-sm font-medium text-rose-600 dark:text-rose-400" role="alert" data-testid="2fa-disable-error">
                            {disableError}
                        </p>
                    )}

                    <div className="flex flex-wrap justify-end gap-2 pt-2">
                        <Button variant="secondary" onClick={() => setDisableOpen(false)} disabled={disabling}>
                            Cancel
                        </Button>
                        <Button variant="danger" type="submit" loading={disabling} disabled={!disableCred.trim()} data-testid="2fa-disable-confirm-button">
                            Disable 2FA
                        </Button>
                    </div>
                </form>
            </Modal>
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
