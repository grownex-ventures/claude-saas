import { useState } from "react";
import { Check, CreditCard, FileText, Gauge } from "lucide-react";
import { Button, Card, ConfirmModal, DataTable, EmptyState, PageHeader, QueryState, Segmented, SkeletonCard, StatusBadge } from "@/components/app/ui";
import { changePlan, getBilling, yearlyPrice } from "@/lib/appApi";
import { formatDateTime, money, useAppMutation, useAppQuery } from "@/lib/appQueries";

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
                {(b) => <BillingContent b={b} />}
            </QueryState>
        </div>
    );
}

function BillingContent({ b }) {
    const [cycle, setCycle] = useState(b.cycle);
    const [pick, setPick] = useState(null);
    const change = useAppMutation(changePlan, { success: (r) => `You're now on ${r.plan.name}`, onSuccess: () => setPick(null) });
    const price = (p) => (cycle === "yearly" ? yearlyPrice(p) : p.monthly);

    return (
        <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
                <Card title="Current plan" icon={CreditCard} testId="billing-current-plan">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <p className="text-2xl font-bold tracking-tight app-heading" data-testid="billing-plan-name">
                            {b.plan.name}
                        </p>
                        {b.trial ? <StatusBadge status="pending" label="Free trial" /> : <StatusBadge status="live" label="Active" />}
                    </div>
                    <p className="mt-2 text-sm app-muted" data-testid="billing-plan-detail">
                        {b.trial
                            ? `Trial ends ${new Date(b.trialEndsAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })} — ${daysLeft(b.trialEndsAt)} days left. Choose a plan to keep your channels live.`
                            : `${money(b.cycle === "yearly" ? yearlyPrice(b.plan) : b.plan.monthly)} / ${b.cycle === "yearly" ? "year" : "month"} · renews automatically`}
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
                        const current = p.id === b.plan.id && !b.trial && cycle === b.cycle;
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
                                    onClick={() => setPick(p)}
                                    data-testid={`plan-choose-${p.id}`}
                                >
                                    {current ? "Current plan" : `Choose ${p.name}`}
                                </Button>
                            </div>
                        );
                    })}
                </div>
            </div>

            <Card title="Invoices" icon={FileText} testId="billing-invoices" bodyClassName="p-2 sm:p-3">
                <DataTable
                    testId="invoices-table"
                    rows={b.invoices}
                    columns={[
                        { key: "id", header: "Invoice", render: (i) => <span className="font-mono text-xs font-semibold app-heading">{i.id}</span> },
                        { key: "date", header: "Date", render: (i) => formatDateTime(i.date) },
                        { key: "description", header: "Description" },
                        { key: "amount", header: "Amount", render: (i) => <span className="font-semibold app-heading">{money(i.amount)}</span> },
                        { key: "status", header: "Status", render: (i) => <StatusBadge status="resolved" label={i.status} /> },
                    ]}
                    empty={<EmptyState icon={FileText} title="No invoices yet" description="Invoices appear here after your first payment." testId="invoices-empty" />}
                />
            </Card>

            <ConfirmModal
                open={Boolean(pick)}
                danger={false}
                title={pick ? `Switch to ${pick.name}?` : ""}
                description={
                    pick
                        ? `You'll be billed ${money(price(pick))} per ${cycle === "yearly" ? "year" : "month"}. ${pick.channels.length < 3 ? "Channels not included in this plan will be locked." : ""}`
                        : ""
                }
                confirmLabel="Confirm plan"
                loading={change.isPending}
                onConfirm={() => change.mutate({ planId: pick.id, cycle })}
                onClose={() => setPick(null)}
                testId="plan-confirm-modal"
            />
        </div>
    );
}
