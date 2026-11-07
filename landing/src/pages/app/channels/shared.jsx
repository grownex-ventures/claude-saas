import { useState } from "react";
import { ChannelIcon, CHANNEL_META, ConfirmModal, StatusBadge, Switch } from "@/components/app/ui";
import { setChannelEnabled } from "@/lib/appApi";
import { duration, formatDateTime, timeAgo, useAppMutation } from "@/lib/appQueries";

/** Card header used by every channel: icon, name, status badge and the ON/OFF master switch. */
export function ChannelHeader({ channel, data, description, onRequestOff }) {
    const [confirm, setConfirm] = useState(false);
    const toggle = useAppMutation(setChannelEnabled, {
        success: (_, v) => `${CHANNEL_META[channel].label} switched ${v.enabled ? "ON" : "OFF"}`,
        onSuccess: () => setConfirm(false),
    });
    const setUp = data.status !== "not_setup" && data.status !== "pending" && !data.locked;
    const on = data.status === "live";
    return (
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6" data-testid={`${channel}-header`}>
            <div className="flex min-w-0 items-center gap-3">
                <ChannelIcon channel={channel} />
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold app-heading">{CHANNEL_META[channel].label}</h2>
                        <StatusBadge status={data.status} testId={`${channel}-status-badge`} />
                    </div>
                    <p className="mt-0.5 text-sm app-muted">{description}</p>
                </div>
            </div>
            <label className="flex items-center gap-2.5 text-sm font-semibold app-heading">
                <span className={setUp ? "" : "text-slate-400 dark:text-slate-500"}>{on ? "ON" : "OFF"}</span>
                <Switch
                    checked={on}
                    disabled={!setUp || toggle.isPending}
                    label={`${CHANNEL_META[channel].label} master switch`}
                    testId={`${channel}-master-switch`}
                    onChange={(next) => (next ? toggle.mutate({ channel, enabled: true }) : onRequestOff ? onRequestOff() : setConfirm(true))}
                />
            </label>
            <ConfirmModal
                open={confirm}
                title={`Turn off ${CHANNEL_META[channel].label}?`}
                description="The AI will stop replying on this channel until you switch it back on."
                confirmLabel="Turn off"
                loading={toggle.isPending}
                onConfirm={() => toggle.mutate({ channel, enabled: false })}
                onClose={() => setConfirm(false)}
                testId={`${channel}-off-modal`}
            />
        </div>
    );
}

export function LiveStatusCard({ channel, data, rows = [] }) {
    return (
        <section className="app-card p-5 sm:p-6" data-testid={`${channel}-live-status-card`}>
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold app-heading">Live status</h3>
                <StatusBadge status={data.status} />
            </div>
            <dl className="mt-4 space-y-3 text-sm">
                <StatRow label="Runtime" value={data.status === "live" ? "Running" : data.status === "offline" ? "Stopped" : data.status === "pending" ? "Waiting for scan" : "Not deployed"} testId={`${channel}-runtime`} />
                <StatRow label="Uptime" value={data.status === "live" ? duration(data.deployedAt || data.connectedAt || data.installedAt) : "—"} testId={`${channel}-uptime`} />
                <StatRow
                    label="Last activity"
                    value={data.lastActivity ? <span title={formatDateTime(data.lastActivity)}>{timeAgo(data.lastActivity)}</span> : "—"}
                    testId={`${channel}-last-activity`}
                />
                {rows.map((r) => (
                    <StatRow key={r.label} {...r} />
                ))}
            </dl>
        </section>
    );
}

export const StatRow = ({ label, value, testId }) => (
    <div className="flex items-start justify-between gap-4">
        <dt className="app-muted">{label}</dt>
        <dd className="break-all text-right font-medium app-heading" data-testid={testId}>
            {value}
        </dd>
    </div>
);
