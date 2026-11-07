import { useState } from "react";
import { Download, Radio, ScrollText, Search } from "lucide-react";
import { Button, Card, CopyButton, DataTable, EmptyState, ErrorState, PageHeader, Select, Skeleton, StatusBadge, Switch } from "@/components/app/ui";
import { getLogs } from "@/lib/appApi";
import { formatDateTime, useAppQuery } from "@/lib/appQueries";

const CHANNEL_OPTIONS = [
    { value: "all", label: "All sources" },
    { value: "telegram", label: "Telegram" },
    { value: "whatsapp", label: "WhatsApp" },
    { value: "widget", label: "Website Widget" },
    { value: "panel", label: "SMM Panel" },
    { value: "system", label: "System" },
];
const SOURCE_LABEL = Object.fromEntries(CHANNEL_OPTIONS.map((o) => [o.value, o.label]));

export default function Logs() {
    const [filters, setFilters] = useState({ level: "all", channel: "all", range: "24h", search: "" });
    const [live, setLive] = useState(false);
    const q = useAppQuery(["logs", filters, live], () => getLogs({ ...filters, live }), {
        refetchInterval: live ? 3000 : false,
        placeholderData: (prev) => prev,
    });
    const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

    const exportLogs = () => {
        const blob = new Blob([JSON.stringify(q.data.map((l) => l.raw ? { ...l.raw, message: l.message } : l), null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `yoursmmagent-logs-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    return (
        <div data-testid="logs-page">
            <PageHeader
                title="Runtime Logs"
                description="Everything your AI agent, channels and panel connection did — in plain language."
                actions={
                    <>
                        <label className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                            <Radio className={`h-4 w-4 ${live ? "animate-pulse text-emerald-500" : "text-slate-400"}`} />
                            Live tail
                            <Switch checked={live} onChange={setLive} label="Live tail" size="sm" testId="logs-live-toggle" />
                        </label>
                        <Button variant="secondary" icon={Download} onClick={exportLogs} disabled={!q.data?.length} data-testid="logs-export-button">
                            Export
                        </Button>
                    </>
                }
            />
            <Card bodyClassName="p-0" testId="logs-card">
                <div className="grid gap-3 border-b border-slate-100 p-4 dark:border-slate-800 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input value={filters.search} onChange={set("search")} placeholder="Search messages or JSON…" className="app-input pl-10" data-testid="logs-search-input" aria-label="Search logs" />
                    </div>
                    <Select value={filters.level} onChange={set("level")} aria-label="Level" data-testid="logs-level-filter" options={[{ value: "all", label: "All levels" }, { value: "info", label: "Info" }, { value: "warn", label: "Warning" }, { value: "error", label: "Error" }]} />
                    <Select value={filters.channel} onChange={set("channel")} aria-label="Source" data-testid="logs-channel-filter" options={CHANNEL_OPTIONS} />
                    <Select value={filters.range} onChange={set("range")} aria-label="Time range" data-testid="logs-range-filter" options={[{ value: "1h", label: "Last hour" }, { value: "24h", label: "Last 24 hours" }, { value: "7d", label: "Last 7 days" }, { value: "30d", label: "Last 30 days" }]} />
                </div>
                <div className="p-2 sm:p-3">
                    {q.isLoading ? (
                        <div className="space-y-2 p-3">
                            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                        </div>
                    ) : q.isError ? (
                        <ErrorState message={q.error.message} onRetry={q.refetch} className="border-0 shadow-none" />
                    ) : (
                        <DataTable
                            testId="logs-table"
                            rows={q.data}
                            columns={[
                                { key: "at", header: "Time", className: "whitespace-nowrap w-40", render: (l) => <span className="tabular-nums">{formatDateTime(l.at)}</span> },
                                { key: "level", header: "Level", className: "w-28", render: (l) => <StatusBadge status={l.level} /> },
                                { key: "channel", header: "Source", className: "w-36 whitespace-nowrap", render: (l) => SOURCE_LABEL[l.channel] },
                                { key: "message", header: "Message", render: (l) => <span className="font-medium text-slate-800 dark:text-slate-200">{l.message}</span> },
                            ]}
                            renderExpanded={(l) => (
                                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950" onClick={(e) => e.stopPropagation()}>
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Raw event</span>
                                        <CopyButton text={JSON.stringify(l.raw, null, 2)} testId="logs-row-copy" />
                                    </div>
                                    <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-slate-700 dark:text-slate-300" data-testid="logs-row-raw">
                                        {JSON.stringify(l.raw, null, 2)}
                                    </pre>
                                </div>
                            )}
                            empty={
                                <EmptyState
                                    icon={ScrollText}
                                    title="No log entries match"
                                    description="Try a wider time range or clear your filters."
                                    action={
                                        <Button variant="secondary" onClick={() => setFilters({ level: "all", channel: "all", range: "30d", search: "" })} data-testid="logs-clear-filters">
                                            Clear filters
                                        </Button>
                                    }
                                    testId="logs-empty"
                                />
                            }
                        />
                    )}
                </div>
            </Card>
        </div>
    );
}
