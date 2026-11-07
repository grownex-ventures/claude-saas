import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Bot, Hand, Inbox as InboxIcon, Info, MessageSquareDashed, Search, Send, UserRound } from "lucide-react";
import { Button, ChannelIcon, CHANNEL_META, EmptyState, ErrorState, PageHeader, Select, Skeleton, StatusBadge, Switch } from "@/components/app/ui";
import { getConversation, getConversations, handBackConversation, sendReply, takeOverConversation } from "@/lib/appApi";
import { formatDateTime, money, timeAgo, useAppMutation, useAppQuery } from "@/lib/appQueries";

const QUICK_REPLIES = ["Checking that for you now — one moment.", "Could you share your order ID?", "Your refill has been requested.", "Thanks for your patience!"];

export default function Inbox() {
    const [params, setParams] = useSearchParams();
    const selected = params.get("c");
    const [filters, setFilters] = useState({ channel: "all", status: "all", unread: false, search: "" });
    const [showDetails, setShowDetails] = useState(false);
    const list = useAppQuery(["conversations", filters], () => getConversations(filters), { placeholderData: (p) => p });
    const all = useAppQuery(["conversations", "all"], () => getConversations());
    const select = (id) => setParams(id ? { c: id } : {}, { replace: true });

    if (all.isSuccess && all.data.length === 0) {
        return (
            <div data-testid="inbox-page">
                <PageHeader title="Live Inbox" description="Watch the AI handle conversations and step in whenever you want." />
                <div className="app-card">
                    <EmptyState
                        icon={InboxIcon}
                        title="Your inbox is empty"
                        description="Conversations from Telegram, WhatsApp and your website widget appear here as soon as a channel is live."
                        action={<Link to="/dashboard/channels" className="btn btn-primary" data-testid="inbox-empty-activate">Activate a channel</Link>}
                        testId="inbox-empty"
                    />
                </div>
            </div>
        );
    }

    return (
        <div data-testid="inbox-page">
            <PageHeader title="Live Inbox" description="Watch the AI handle conversations and step in whenever you want." />
            <div className="app-card grid overflow-hidden lg:h-[calc(100vh-15rem)] lg:min-h-[560px] lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_280px]">
                {/* List */}
                <div className={`flex min-h-0 flex-col border-slate-100 dark:border-slate-800 lg:border-r ${selected ? "hidden lg:flex" : "flex"}`} data-testid="inbox-list-pane">
                    <div className="space-y-2.5 border-b border-slate-100 p-3 dark:border-slate-800">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                value={filters.search}
                                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                                placeholder="Search conversations…"
                                className="app-input h-10 pl-10"
                                aria-label="Search conversations"
                                data-testid="inbox-search-input"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Select
                                value={filters.channel}
                                onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))}
                                aria-label="Channel filter"
                                className="h-10"
                                data-testid="inbox-channel-filter"
                                options={[{ value: "all", label: "All channels" }, ...Object.entries(CHANNEL_META).map(([value, m]) => ({ value, label: m.label }))]}
                            />
                            <Select
                                value={filters.status}
                                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                                aria-label="Status filter"
                                className="h-10"
                                data-testid="inbox-status-filter"
                                options={[{ value: "all", label: "All statuses" }, { value: "ai", label: "AI handling" }, { value: "human", label: "Needs human" }, { value: "resolved", label: "Resolved" }]}
                            />
                        </div>
                        <label className="flex items-center justify-between gap-2 text-sm font-medium app-muted">
                            Unread only
                            <Switch size="sm" checked={filters.unread} onChange={(v) => setFilters((f) => ({ ...f, unread: v }))} label="Unread only" testId="inbox-unread-filter" />
                        </label>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-2">
                        {list.isLoading ? (
                            <div className="space-y-2 p-1">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
                        ) : list.isError ? (
                            <ErrorState message={list.error.message} onRetry={list.refetch} className="border-0 shadow-none" />
                        ) : !list.data.length ? (
                            <EmptyState icon={Search} title="No matches" description="Try different filters." testId="inbox-no-matches" />
                        ) : (
                            <ul className="space-y-1">
                                {list.data.map((c) => (
                                    <li key={c.id}>
                                        <button
                                            type="button"
                                            onClick={() => select(c.id)}
                                            data-testid="inbox-conversation-item"
                                            aria-current={selected === c.id}
                                            className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                                                selected === c.id ? "bg-indigo-50 dark:bg-indigo-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                            }`}
                                        >
                                            <ChannelIcon channel={c.channel} className="h-9 w-9" iconClassName="h-4 w-4" />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className={`break-all text-sm ${c.unread ? "font-bold" : "font-semibold"} app-heading`}>{c.customer.name}</p>
                                                    <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">{timeAgo(c.lastAt)}</span>
                                                </div>
                                                <p className="mt-0.5 line-clamp-2 text-xs app-muted">{c.preview}</p>
                                                <div className="mt-1.5 flex items-center gap-2">
                                                    <StatusBadge status={c.status} />
                                                    {c.unread && <span className="h-2 w-2 rounded-full bg-indigo-600" aria-label="Unread" data-testid="inbox-unread-dot" />}
                                                </div>
                                            </div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Thread + details */}
                {selected ? (
                    <Thread id={selected} onBack={() => select(null)} showDetails={showDetails} setShowDetails={setShowDetails} />
                ) : (
                    <div className="hidden items-center justify-center lg:flex xl:col-span-2">
                        <EmptyState icon={MessageSquareDashed} title="Select a conversation" description="Pick a chat on the left to read it, take over or reply." testId="inbox-no-selection" />
                    </div>
                )}
            </div>
        </div>
    );
}

function Thread({ id, onBack, showDetails, setShowDetails }) {
    const q = useAppQuery(["conversation", id], () => getConversation(id));
    const [text, setText] = useState("");
    const endRef = useRef(null);
    const take = useAppMutation(takeOverConversation, { success: "You're now replying — the AI is paused here" });
    const back = useAppMutation(handBackConversation, { success: "Handed back to the AI" });
    const reply = useAppMutation(sendReply, { success: "Reply sent", onSuccess: () => setText("") });

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: "end" });
    }, [q.data?.messages.length]);

    if (q.isLoading)
        return (
            <div className="space-y-3 p-6 xl:col-span-2">
                <Skeleton className="h-8 w-1/3" />
                <Skeleton className="h-16 w-2/3" />
                <Skeleton className="ml-auto h-16 w-1/2" />
            </div>
        );
    if (q.isError) return <ErrorState message={q.error.message} onRetry={q.refetch} className="m-4 xl:col-span-2" />;

    const c = q.data;
    const human = c.status === "human";
    return (
        <>
            <div className={`flex min-h-[520px] min-w-0 flex-col lg:min-h-0 ${showDetails ? "hidden xl:flex" : "flex"}`} data-testid="inbox-thread-pane">
                <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                    <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Back to list" onClick={onBack} data-testid="inbox-back-button">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <ChannelIcon channel={c.channel} className="h-9 w-9" iconClassName="h-4 w-4" />
                    <div className="min-w-0 flex-1">
                        <p className="break-all text-sm font-semibold app-heading" data-testid="inbox-thread-name">{c.customer.name}</p>
                        <p className="text-xs app-muted">{CHANNEL_META[c.channel].label}</p>
                    </div>
                    <StatusBadge status={c.status} testId="inbox-thread-status" />
                    <Button variant="ghost" size="icon" className="xl:hidden" aria-label="Customer details" onClick={() => setShowDetails(true)} data-testid="inbox-details-button">
                        <Info className="h-4 w-4" />
                    </Button>
                    {human ? (
                        <Button size="sm" variant="secondary" icon={Bot} loading={back.isPending} onClick={() => back.mutate(c.id)} data-testid="inbox-handback-button">
                            Hand back to AI
                        </Button>
                    ) : (
                        <Button size="sm" icon={Hand} loading={take.isPending} onClick={() => take.mutate(c.id)} data-testid="inbox-takeover-button">
                            Take over from AI
                        </Button>
                    )}
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4 dark:bg-slate-950/40" data-testid="inbox-messages">
                    {c.messages.map((m) =>
                        m.from === "system" ? (
                            <p key={m.id} className="text-center text-xs font-medium text-slate-500 dark:text-slate-400">— {m.text} · {timeAgo(m.at)} —</p>
                        ) : (
                            <div key={m.id} className={`flex ${m.from === "customer" ? "justify-start" : "justify-end"}`} data-testid={`inbox-message-${m.from}`}>
                                <div className="max-w-[80%]">
                                    <p className={`mb-1 text-[11px] font-semibold ${m.from === "customer" ? "text-slate-500" : "text-right text-indigo-600 dark:text-indigo-400"}`}>
                                        {m.from === "customer" ? c.customer.name : m.from === "ai" ? "AI agent" : "You"} · {timeAgo(m.at)}
                                    </p>
                                    <p
                                        className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm ${
                                            m.from === "customer"
                                                ? "rounded-tl-md border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                                : m.from === "ai"
                                                  ? "rounded-tr-md bg-indigo-50 text-indigo-950 dark:bg-indigo-500/15 dark:text-indigo-100"
                                                  : "rounded-tr-md bg-indigo-600 text-white"
                                        }`}
                                    >
                                        {m.text}
                                    </p>
                                </div>
                            </div>
                        ),
                    )}
                    <div ref={endRef} />
                </div>

                <form
                    className="border-t border-slate-100 p-3 dark:border-slate-800"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (text.trim()) reply.mutate({ id: c.id, text });
                    }}
                    data-testid="inbox-composer"
                >
                    {human ? (
                        <>
                            <div className="mb-2 flex flex-wrap gap-1.5">
                                {QUICK_REPLIES.map((r) => (
                                    <button
                                        key={r}
                                        type="button"
                                        onClick={() => setText(r)}
                                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-500/50 dark:hover:text-indigo-300"
                                        data-testid="inbox-quick-reply"
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-end gap-2">
                                <textarea
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            if (text.trim()) reply.mutate({ id: c.id, text });
                                        }
                                    }}
                                    rows={2}
                                    placeholder="Write a reply…  (Enter to send, Shift+Enter for a new line)"
                                    className="app-input h-auto min-h-[44px] resize-none py-2.5"
                                    aria-label="Reply"
                                    data-testid="inbox-reply-input"
                                />
                                <Button type="submit" icon={Send} loading={reply.isPending} disabled={!text.trim()} data-testid="inbox-send-button">
                                    Send
                                </Button>
                            </div>
                        </>
                    ) : (
                        <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-3 text-sm app-muted dark:bg-slate-800/60" data-testid="inbox-ai-notice">
                            <Bot className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                            The AI is handling this conversation. Take over to reply yourself.
                        </p>
                    )}
                </form>
            </div>

            <aside className={`min-w-0 overflow-y-auto border-slate-100 p-5 dark:border-slate-800 xl:block xl:border-l ${showDetails ? "block lg:col-start-2" : "hidden"}`} data-testid="inbox-details-pane">
                <div className="mb-4 flex items-center justify-between xl:hidden">
                    <p className="text-sm font-semibold app-heading">Customer details</p>
                    <Button variant="ghost" size="sm" onClick={() => setShowDetails(false)} data-testid="inbox-details-close">
                        Back to chat
                    </Button>
                </div>
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <UserRound className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                        <p className="break-all text-sm font-semibold app-heading">{c.customer.name}</p>
                        <p className="text-xs app-muted">via {CHANNEL_META[c.channel].label}</p>
                    </div>
                </div>
                <dl className="mt-5 space-y-3 text-sm">
                    <div className="flex justify-between gap-3">
                        <dt className="app-muted">Panel username</dt>
                        <dd className="break-all text-right font-medium app-heading" data-testid="inbox-detail-username">{c.customer.panelUsername}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                        <dt className="app-muted">Balance</dt>
                        <dd className="font-semibold text-emerald-700 dark:text-emerald-400" data-testid="inbox-detail-balance">{money(c.customer.balance, c.customer.currency)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                        <dt className="app-muted">Last message</dt>
                        <dd className="text-right font-medium app-heading">{formatDateTime(c.lastAt)}</dd>
                    </div>
                </dl>
                <h4 className="mt-6 text-xs font-semibold uppercase tracking-wider text-slate-500">Recent orders</h4>
                {c.customer.orders.length ? (
                    <ul className="mt-2 space-y-2" data-testid="inbox-detail-orders">
                        {c.customer.orders.map((o) => (
                            <li key={o.id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-mono text-xs font-semibold app-heading">#{o.id}</span>
                                    <span className="text-xs font-semibold app-muted">{o.status}</span>
                                </div>
                                <p className="mt-1 text-sm app-heading">{o.service}</p>
                                <p className="mt-0.5 text-xs app-muted">
                                    {o.qty.toLocaleString()} · {money(o.charge)}
                                </p>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="mt-2 text-sm app-muted">No orders found for this customer.</p>
                )}
            </aside>
        </>
    );
}
