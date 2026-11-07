import { useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Bot, Check, Clock, Database, Inbox, MessagesSquare, Rocket } from "lucide-react";
import { ChannelCard, ChannelIcon, Card, EmptyState, ErrorState, PageHeader, Segmented, Skeleton, SkeletonCard, StatCard, StatusBadge } from "@/components/app/ui";
import { CHANNELS, getChannels, getConversations, getOnboarding, getOverviewStats } from "@/lib/appApi";
import { timeAgo, useAppQuery } from "@/lib/appQueries";
import { useSession } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

export default function Overview() {
    const { data: user } = useSession();
    return (
        <div className="space-y-6" data-testid="overview-page">
            <PageHeader title="Overview" description={`Welcome back${user?.username ? `, ${user.username}` : ""}. Here's how your AI support agent is doing.`} />
            <Onboarding />
            <Stats />
            <Channels />
            <RecentConversations />
        </div>
    );
}

function Onboarding() {
    const q = useAppQuery(["onboarding"], getOnboarding);
    if (q.isLoading) return <SkeletonCard lines={4} />;
    if (q.isError) return <ErrorState message={q.error.message} onRetry={q.refetch} testId="onboarding-error" />;
    const { steps, completed, total } = q.data;
    if (completed === total) return null;
    const nextIdx = steps.findIndex((s) => !s.done);
    return (
        <Card
            title="Get your AI agent live"
            description={`${completed} of ${total} steps done — most owners finish in under 3 minutes.`}
            icon={Rocket}
            testId="onboarding-checklist"
            action={
                <div className="flex w-40 items-center gap-2" aria-label={`${completed} of ${total} complete`}>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 transition-[width] duration-500" style={{ width: `${(completed / total) * 100}%` }} />
                    </div>
                    <span className="text-xs font-semibold tabular-nums app-muted">{Math.round((completed / total) * 100)}%</span>
                </div>
            }
            bodyClassName="p-2 sm:p-3"
        >
            <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                {steps.map((s, i) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-3" data-testid={`onboarding-step-${s.id}`} data-done={s.done}>
                        <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                s.done ? "bg-emerald-500 text-white" : i === nextIdx ? "bg-indigo-600 text-white" : "border border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                            }`}
                        >
                            {s.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                        </span>
                        <span className={`min-w-0 flex-1 text-sm font-medium ${s.done ? "text-slate-400 line-through dark:text-slate-500" : "app-heading"}`}>{s.label}</span>
                        {!s.done && (
                            <Link to={s.to} className={`btn btn-sm ${i === nextIdx ? "btn-primary" : "btn-ghost"}`} data-testid={`onboarding-step-${s.id}-button`}>
                                {s.cta}
                            </Link>
                        )}
                    </li>
                ))}
            </ol>
        </Card>
    );
}

function Stats() {
    const [range, setRange] = useState(7);
    const q = useAppQuery(["stats", range], () => getOverviewStats(range), { placeholderData: (prev) => prev });
    const { theme } = useTheme();
    const d = q.data;
    const empty = d && d.conversations === 0;
    const grid = theme === "dark" ? "#1e293b" : "#eef2f7";

    if (q.isError) return <ErrorState message={q.error.message} onRetry={q.refetch} testId="stats-error" />;
    return (
        <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="overview-stats">
                <StatCard label={`Conversations (${range}d)`} value={d ? d.conversations.toLocaleString() : ""} icon={MessagesSquare} loading={q.isLoading} testId="stat-conversations" />
                <StatCard label="Resolved by AI" value={d?.resolvedPct != null ? `${d.resolvedPct}%` : "—"} icon={Bot} loading={q.isLoading} testId="stat-resolved" />
                <StatCard label="Avg response time" value={d?.avgResponseSec != null ? `${d.avgResponseSec}s` : "—"} icon={Clock} loading={q.isLoading} testId="stat-response-time" />
                <StatCard label="Panel lookups" value={d ? d.panelLookups.toLocaleString() : ""} icon={Database} loading={q.isLoading} testId="stat-panel-lookups" />
            </div>
            <Card
                title="Conversations over time"
                description="All channels combined"
                testId="conversations-chart"
                action={
                    <Segmented
                        value={range}
                        onChange={setRange}
                        testId="chart-range"
                        options={[7, 30, 90].map((v) => ({ value: v, label: `${v} days` }))}
                    />
                }
            >
                {q.isLoading ? (
                    <Skeleton className="h-64 w-full" />
                ) : empty ? (
                    <EmptyState
                        icon={BarChart3}
                        title="No conversations yet"
                        description="Activate a channel and your customers' conversations will show up here."
                        action={<Link to="/dashboard/channels" className="btn btn-primary" data-testid="chart-empty-activate">Activate a channel</Link>}
                        testId="chart-empty"
                    />
                ) : (
                    <div className="h-64 w-full" data-testid="chart-canvas">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={d.series} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="convFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.28} />
                                        <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid stroke={grid} vertical={false} />
                                <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} minTickGap={24} />
                                <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <Tooltip
                                    contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12, background: theme === "dark" ? "#0f172a" : "#fff", color: theme === "dark" ? "#e2e8f0" : "#0f172a" }}
                                />
                                <Area type="monotone" dataKey="conversations" name="Conversations" stroke="#4F46E5" strokeWidth={2.5} fill="url(#convFill)" />
                                <Area type="monotone" dataKey="resolved" name="Resolved by AI" stroke="#2563EB" strokeWidth={1.5} strokeDasharray="4 4" fill="none" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </Card>
        </>
    );
}

function Channels() {
    const q = useAppQuery(["channels"], getChannels);
    return (
        <div>
            <h2 className="mb-3 text-base font-semibold app-heading">Channels</h2>
            {q.isError ? (
                <ErrorState message={q.error.message} onRetry={q.refetch} testId="channels-error" />
            ) : (
                <div className="grid gap-4 md:grid-cols-3" data-testid="overview-channels">
                    {CHANNELS.map((c) =>
                        q.isLoading ? (
                            <SkeletonCard key={c} lines={2} />
                        ) : (
                            <ChannelCard key={c} channel={c} data={q.data[c]} to={q.data[c].locked ? "/dashboard/billing" : `/dashboard/channels?tab=${c}`} testId={`channel-card-${c}`} />
                        ),
                    )}
                </div>
            )}
        </div>
    );
}

function RecentConversations() {
    const q = useAppQuery(["conversations", "recent"], () => getConversations());
    return (
        <Card
            title="Recent conversations"
            testId="recent-conversations"
            bodyClassName="p-2 sm:p-3"
            action={<Link to="/dashboard/inbox" className="btn btn-ghost btn-sm" data-testid="recent-conversations-view-all">Open inbox</Link>}
        >
            {q.isLoading ? (
                <div className="space-y-3 p-3">
                    {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
            ) : q.isError ? (
                <ErrorState message={q.error.message} onRetry={q.refetch} className="border-0 shadow-none" />
            ) : !q.data.length ? (
                <EmptyState icon={Inbox} title="No conversations yet" description="Once a channel is live, the latest customer chats appear here." testId="recent-conversations-empty" />
            ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {q.data.slice(0, 5).map((c) => (
                        <li key={c.id}>
                            <Link to={`/app/inbox?c=${c.id}`} className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50" data-testid="recent-conversation-item">
                                <ChannelIcon channel={c.channel} className="h-9 w-9" iconClassName="h-4 w-4" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-x-2">
                                        <p className="text-sm font-semibold app-heading">{c.customer.name}</p>
                                        {c.unread && <span className="h-2 w-2 rounded-full bg-indigo-600" aria-label="Unread" />}
                                    </div>
                                    <p className="line-clamp-1 text-sm app-muted">{c.preview}</p>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1">
                                    <StatusBadge status={c.status} />
                                    <span className="text-xs text-slate-500 dark:text-slate-400">{timeAgo(c.lastAt)}</span>
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}
