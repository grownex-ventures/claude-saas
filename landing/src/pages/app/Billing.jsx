import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, CreditCard, ExternalLink, FileText, Gauge, Loader2, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, CopyButton, DataTable, EmptyState, Modal, PageHeader, QueryState, Segmented, SkeletonCard, StatusBadge } from "@/components/app/ui";
import {
    checkInvoiceStatus,
    createBillingInvoice,
    getBilling,
    simulateMockPayment,
    yearlyPrice,
} from "@/lib/appApi";
import { formatDateTime, money, useAppQuery } from "@/lib/appQueries";

const daysLeft = (ts) => Math.max(0, Math.ceil((ts - Date.now()) / 86_400_000));

export default function Billing() {
    const q = useAppQuery(["billing"], getBilling);
    return (
        <div data-testid="billing-page">
            <PageHeader title="Billing & Plans" description="Your plan, usage and invoices." />
            <QueryState
                query={q}
                skeleton={
                    <div className="space-y-6">
                        <SkeletonCard lines={4} />
                        <SkeletonCard lines={6} />
                    </div>
                }
            >
                {(b) => <BillingContent b={b} onRefresh={() => q.refetch()} />}
            </QueryState>
        </div>
    );
}

function BillingContent({ b, onRefresh }) {
    const qc = useQueryClient();
    const [cycle, setCycle] = useState(b.cycle || "monthly");
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [invoice, setInvoice] = useState(null);
    const [invoiceLoading, setInvoiceLoading] = useState(false);
    const [invoiceError, setInvoiceError] = useState(null);
    const [paymentSuccess, setPaymentSuccess] = useState(false);
    const [simulating, setSimulating] = useState(false);

    const price = (p) => (cycle === "yearly" ? yearlyPrice(p) : p.monthly);

    const handleSelectPlan = (plan) => {
        setSelectedPlan(plan);
        setCheckoutOpen(true);
        setInvoice(null);
        setInvoiceError(null);
        setPaymentSuccess(false);
        setInvoiceLoading(true);

        const durationMonths = cycle === "yearly" ? 12 : 1;
        createBillingInvoice({ channels: plan.channels, durationMonths })
            .then((inv) => setInvoice(inv))
            .catch((err) => setInvoiceError(err.message || "Failed to create invoice."))
            .finally(() => setInvoiceLoading(false));
    };

    // Real-time invoice status poller while checkout modal is open
    useEffect(() => {
        if (!checkoutOpen || !invoice?.orderId || paymentSuccess) return undefined;

        const interval = setInterval(async () => {
            try {
                const res = await checkInvoiceStatus(invoice.orderId);
                const st = (res?.status || "").toUpperCase();
                if (st === "PAID" || st === "SUCCESS") {
                    setPaymentSuccess(true);
                    toast.success("Payment confirmed! Your subscription is now ACTIVE.");
                    qc.invalidateQueries({ queryKey: ["billing"] });
                    qc.invalidateQueries({ queryKey: ["session"] });
                    qc.invalidateQueries({ queryKey: ["channels"] });
                    qc.invalidateQueries({ queryKey: ["onboarding"] });
                    onRefresh?.();
                }
            } catch {
                // silent poll retry
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [checkoutOpen, invoice?.orderId, paymentSuccess, qc, onRefresh]);

    const handleSimulatePayment = async () => {
        if (!invoice?.orderId) return;
        setSimulating(true);
        try {
            await simulateMockPayment(invoice.orderId);
            setPaymentSuccess(true);
            toast.success("Sandbox payment verified! Subscription activated.");
            qc.invalidateQueries({ queryKey: ["billing"] });
            qc.invalidateQueries({ queryKey: ["session"] });
            qc.invalidateQueries({ queryKey: ["channels"] });
            qc.invalidateQueries({ queryKey: ["onboarding"] });
            onRefresh?.();
        } catch (err) {
            toast.error(err.message || "Sandbox payment failed.");
        } finally {
            setSimulating(false);
        }
    };

    const isCurrentPlan = (p) => {
        const isMatch = p.id === b.plan.id;
        const isActive = b.subscriptionStatus === "ACTIVE" || !b.trial;
        return isMatch && isActive;
    };

    return (
        <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
                <Card title="Current plan" icon={CreditCard} testId="billing-current-plan">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <p className="text-2xl font-bold tracking-tight app-heading" data-testid="billing-plan-name">
                            {b.plan.name}
                        </p>
                        {b.trial ? (
                            <StatusBadge status="pending" label="Free trial" />
                        ) : b.subscriptionStatus === "ACTIVE" ? (
                            <StatusBadge status="live" label="Active" />
                        ) : (
                            <StatusBadge status="offline" label={b.subscriptionStatus || "Inactive"} />
                        )}
                    </div>
                    <p className="mt-2 text-sm app-muted" data-testid="billing-plan-detail">
                        {b.trial
                            ? `Trial ends ${new Date(b.trialEndsAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })} — ${daysLeft(b.trialEndsAt)} days left. Upgrade to unlock all channels.`
                            : b.subscriptionExpiresAt
                              ? `Renews / expires on ${new Date(b.subscriptionExpiresAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.`
                              : `${money(b.cycle === "yearly" ? yearlyPrice(b.plan) : b.plan.monthly)} / ${b.cycle === "yearly" ? "year" : "month"}`}
                    </p>
                    <ul className="mt-4 space-y-2 text-sm">
                        {b.plan.features.map((f) => (
                            <li key={f} className="flex items-start gap-2 app-muted">
                                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                {f}
                            </li>
                        ))}
                    </ul>
                </Card>
                <Card title="Usage this month" icon={Gauge} testId="billing-usage">
                    <div className="space-y-5">
                        {b.usage.map((u) => {
                            const pct = Math.min(100, Math.round((u.used / u.limit) * 100));
                            return (
                                <div key={u.id} data-testid={`usage-${u.id}`}>
                                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                                        <span className="font-medium app-heading">{u.label}</span>
                                        <span className="tabular-nums app-muted">
                                            {u.used.toLocaleString()} / {u.limit.toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={u.label}>
                                        <div className={`h-full rounded-full transition-[width] duration-500 ${pct > 85 ? "bg-amber-500" : "bg-gradient-to-r from-indigo-600 to-blue-600"}`} style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            </div>

            <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-base font-semibold app-heading">Plans</h2>
                    <Segmented
                        value={cycle}
                        onChange={setCycle}
                        testId="billing-cycle"
                        options={[
                            { value: "monthly", label: "Monthly" },
                            { value: "yearly", label: "Yearly", badge: <span className="rounded-full bg-emerald-100 px-1.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">2 months free</span> },
                        ]}
                    />
                </div>
                <div className="grid gap-4 md:grid-cols-3" data-testid="billing-plans">
                    {b.plans.map((p) => {
                        const current = isCurrentPlan(p);
                        return (
                            <div
                                key={p.id}
                                data-testid={`plan-card-${p.id}`}
                                className={`app-card relative flex flex-col p-6 ${p.recommended ? "border-indigo-300 ring-4 ring-indigo-100 dark:border-indigo-500/50 dark:ring-indigo-500/10" : ""}`}
                            >
                                {p.recommended && (
                                    <span className="absolute -top-3 left-6 rounded-full bg-indigo-600 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">Recommended</span>
                                )}
                                <p className="text-base font-semibold app-heading">{p.name}</p>
                                <p className="mt-3">
                                    <span className="text-3xl font-bold tracking-tight app-heading" data-testid={`plan-price-${p.id}`}>
                                        {money(price(p))}
                                    </span>
                                    <span className="text-sm app-muted"> / {cycle === "yearly" ? "year" : "month"}</span>
                                </p>
                                <ul className="mt-5 flex-1 space-y-2 text-sm">
                                    {p.features.map((f) => (
                                        <li key={f} className="flex items-start gap-2 app-muted">
                                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                                <Button
                                    className="mt-6 w-full"
                                    variant={p.recommended ? "primary" : "secondary"}
                                    disabled={current}
                                    onClick={() => handleSelectPlan(p)}
                                    data-testid={`plan-choose-${p.id}`}
                                >
                                    {current ? "Current plan" : `Choose ${p.name}`}
                                </Button>
                            </div>
                        );
                    })}
                </div>
            </div>

            <Card title="Invoices & Receipts" icon={FileText} testId="billing-invoices" bodyClassName="p-2 sm:p-3">
                <DataTable
                    testId="invoices-table"
                    rows={b.invoices}
                    columns={[
                        {
                            key: "id",
                            header: "Order / Invoice",
                            render: (i) => (
                                <div className="flex items-center gap-1.5 font-mono text-xs font-semibold app-heading">
                                    <span>{i.id}</span>
                                    <CopyButton text={i.id} size="xs" label="Copy" />
                                </div>
                            ),
                        },
                        { key: "date", header: "Date", render: (i) => formatDateTime(i.date) },
                        { key: "description", header: "Description" },
                        { key: "amount", header: "Amount", render: (i) => <span className="font-semibold app-heading">{money(i.amount)}</span> },
                        {
                            key: "status",
                            header: "Status",
                            render: (i) => {
                                const st = (i.status || "").toLowerCase();
                                const badgeStatus = st === "paid" || st === "success" ? "live" : st === "pending" ? "pending" : "offline";
                                return <StatusBadge status={badgeStatus} label={i.status} />;
                            },
                        },
                    ]}
                    empty={<EmptyState icon={FileText} title="No invoices yet" description="Invoices appear here as soon as you create a subscription." testId="invoices-empty" />}
                />
            </Card>

            {/* Real Checkout & Payment Modal */}
            <Modal
                open={checkoutOpen}
                title={paymentSuccess ? "Subscription Activated!" : `Upgrade to ${selectedPlan?.name || "Plan"}`}
                description={
                    paymentSuccess
                        ? "Your payment has been received and verified. All channels in your plan are now live and unlocked."
                        : "Complete payment to activate your plan. Crypto payments are processed securely via Cryptomus."
                }
                onClose={() => {
                    setCheckoutOpen(false);
                    if (paymentSuccess) {
                        onRefresh?.();
                    }
                }}
                maxWidth="max-w-lg"
                testId="billing-checkout-modal"
            >
                {paymentSuccess ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/5">
                            <CheckCircle2 className="h-10 w-10" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold app-heading">You are now on the {selectedPlan?.name} plan!</h3>
                            <p className="mt-1 text-sm app-muted">
                                Your account has been upgraded. Invoice #{invoice?.orderId} has been marked as Paid.
                            </p>
                        </div>
                        <Button
                            variant="primary"
                            className="mt-2 w-full"
                            onClick={() => {
                                setCheckoutOpen(false);
                                onRefresh?.();
                            }}
                            data-testid="checkout-success-done"
                        >
                            Back to dashboard
                        </Button>
                    </div>
                ) : invoiceLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-3">
                        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                        <p className="text-sm font-medium app-muted">Generating your secure checkout session…</p>
                    </div>
                ) : invoiceError ? (
                    <div className="space-y-4 py-4">
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/30 dark:bg-rose-900/20 dark:text-rose-400">
                            {invoiceError}
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setCheckoutOpen(false)}>
                                Cancel
                            </Button>
                            <Button variant="primary" onClick={() => handleSelectPlan(selectedPlan)}>
                                Try again
                            </Button>
                        </div>
                    </div>
                ) : invoice ? (
                    <div className="space-y-5">
                        {/* Summary breakdown box */}
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                            <div className="flex items-baseline justify-between">
                                <span className="text-sm font-medium app-muted">Plan & Cycle</span>
                                <span className="text-sm font-semibold app-heading">
                                    {selectedPlan?.name} · {cycle === "yearly" ? "12 Months (20% off)" : "1 Month"}
                                </span>
                            </div>
                            <div className="mt-2.5 flex items-baseline justify-between border-t border-slate-200/60 pt-2.5 dark:border-slate-800">
                                <span className="text-sm font-medium app-muted">Order ID</span>
                                <span className="font-mono text-xs font-semibold app-heading">{invoice.orderId}</span>
                            </div>
                            <div className="mt-2.5 flex items-baseline justify-between border-t border-slate-200/60 pt-2.5 dark:border-slate-800">
                                <span className="text-base font-semibold app-heading">Total Due</span>
                                <span className="text-2xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
                                    ${invoice.amount} <span className="text-xs font-semibold text-slate-500">USD</span>
                                </span>
                            </div>
                        </div>

                        {/* Payment CTAs */}
                        <div className="space-y-3">
                            {invoice.paymentUrl && (
                                <a
                                    href={invoice.paymentUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-primary flex w-full items-center justify-center gap-2 py-3 text-base shadow-sm"
                                    data-testid="checkout-crypto-pay-button"
                                >
                                    <span>Pay with Crypto (USDT, TON, BTC)</span>
                                    <ExternalLink className="h-4 w-4" />
                                </a>
                            )}

                            <p className="text-center text-xs app-muted">
                                Cryptomus accepts USDT (TRC-20), TON, BTC, ETH, and cards via crypto onramps.
                            </p>

                            {/* Live poller indicator */}
                            <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-100/80 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                <span className="relative flex h-2 w-2">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                                </span>
                                <span>Waiting for payment confirmation… (auto-detects when paid)</span>
                            </div>

                            {/* Sandbox simulation button (for zero-cost instant verification) */}
                            <div className="border-t border-dashed border-slate-200 pt-3 dark:border-slate-800">
                                <div className="flex flex-col gap-1.5 text-center">
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                        Developer & Sandbox Testing
                                    </span>
                                    <Button
                                        variant="secondary"
                                        icon={Zap}
                                        loading={simulating}
                                        onClick={handleSimulatePayment}
                                        className="w-full justify-center text-xs"
                                        data-testid="checkout-sandbox-simulate-button"
                                    >
                                        Simulate Instant Payment (Sandbox Test)
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-1">
                            <Button variant="ghost" size="sm" onClick={() => setCheckoutOpen(false)}>
                                Cancel and close
                            </Button>
                        </div>
                    </div>
                ) : null}
            </Modal>
        </div>
    );
}
