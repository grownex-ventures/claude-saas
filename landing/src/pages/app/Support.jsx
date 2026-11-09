import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, LifeBuoy, Lock, Plus, RotateCcw, Search, Send, TicketPlus } from "lucide-react";
import { Button, ConfirmModal, EmptyState, ErrorState, Field, PageHeader, Segmented, Select, Skeleton, StatusBadge } from "@/components/app/ui";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, closeTicket, createTicket, getTicket, getTickets, reopenTicket, replyTicket } from "@/lib/appApi";
import { formatDateTime, timeAgo, useAppMutation, useAppQuery } from "@/lib/appQueries";

const CATEGORY_LABEL = Object.fromEntries(TICKET_CATEGORIES.map((c) => [c.value, c.label]));
const PRIORITY_CLS = {
    low: "text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300",
    normal: "text-sky-700 bg-sky-50 dark:bg-sky-500/10 dark:text-sky-300",
    high: "text-amber-800 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300",
    urgent: "text-rose-700 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-300",
};
const PriorityTag = ({ value }) => (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${PRIORITY_CLS[value]}`} data-testid="ticket-priority">
        {value}
    </span>
);

export default function Support() {
    const [params, setParams] = useSearchParams();
    const selected = params.get("t");
    const creating = params.get("new") === "1";
    const [filters, setFilters] = useState({ status: "all", search: "" });
    const list = useAppQuery(["tickets", filters], () => getTickets(filters), { placeholderData: (p) => p, refetchInterval: 10000 });
    const go = (p) => setParams(p, { replace: true });
    const rightOpen = selected || creating;

    return (
        <div data-testid="support-page">
            <PageHeader
                title="Support"
                description="Create a ticket and our team will get back to you right here."
                actions={
                    <Button icon={Plus} onClick={() => go({ new: "1" })} data-testid="support-new-ticket-button">
                        New ticket
                    </Button>
                }
            />
            <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
                {/* Ticket list */}
                <section className={`app-card flex min-h-0 flex-col ${rightOpen ? "hidden lg:flex" : "flex"}`} data-testid="support-ticket-list">
                    <div className="space-y-3 border-b border-slate-100 p-4 dark:border-slate-800">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                value={filters.search}
                                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                                placeholder="Search by subject or ticket ID…"
                                className="app-input h-10 pl-10"
                                aria-label="Search tickets"
                                data-testid="support-search-input"
                            />
                        </div>
                        <Segmented
                            value={filters.status}
                            onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
                            testId="support-status-filter"
                            options={[
                                { value: "all", label: "All" },
                                { value: "open", label: "Open" },
                                { value: "answered", label: "Answered" },
                                { value: "closed", label: "Closed" },
                            ]}
                        />
                    </div>
                    <div className="max-h-[calc(100vh-20rem)] min-h-[200px] overflow-y-auto p-2">
                        {list.isLoading ? (
                            <div className="space-y-2 p-1">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
                        ) : list.isError ? (
                            <ErrorState message={list.error.message} onRetry={list.refetch} className="border-0 shadow-none" />
                        ) : !list.data.length ? (
                            filters.status === "all" && !filters.search ? (
                                <EmptyState
                                    icon={LifeBuoy}
                                    title="No tickets yet"
                                    description="Need help with a channel, your panel or billing? Open a ticket."
                                    action={<Button onClick={() => go({ new: "1" })} data-testid="support-empty-create">Create a ticket</Button>}
                                    testId="support-empty"
                                />
                            ) : (
                                <EmptyState icon={Search} title="No tickets match" description="Try another status or search." testId="support-no-matches" />
                            )
                        ) : (
                            <ul className="space-y-1">
                                {list.data.map((t) => (
                                    <li key={t.id}>
                                        <button
                                            type="button"
                                            onClick={() => go({ t: t.id })}
                                            aria-current={selected === t.id}
                                            data-testid="support-ticket-item"
                                            className={`w-full rounded-xl px-3 py-3 text-left transition-colors ${selected === t.id ? "bg-indigo-50 dark:bg-indigo-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">{t.id}</span>
                                                <span className="text-[11px] text-slate-500 dark:text-slate-400">{timeAgo(t.updatedAt)}</span>
                                            </div>
                                            <p className="mt-1 break-words text-sm font-semibold app-heading">{t.subject}</p>
                                            <p className="mt-0.5 line-clamp-1 text-xs app-muted">{t.preview}</p>
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                <StatusBadge status={t.status} />
                                                <PriorityTag value={t.priority} />
                                                {t.status === "answered" && (
                                                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                                                        New reply
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </section>

                {/* Right pane */}
                <div className={rightOpen ? "block" : "hidden lg:block"}>
                    {creating ? (
                        <NewTicket onCancel={() => go({})} onCreated={(t) => go({ t: t.id })} />
                    ) : selected ? (
                        <TicketDetail id={selected} onBack={() => go({})} />
                    ) : (
                        <div className="app-card">
                            <EmptyState icon={TicketPlus} title="Select a ticket" description="Open a ticket on the left to read replies, or create a new one." testId="support-no-selection" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function NewTicket({ onCancel, onCreated }) {
    const [f, setF] = useState({ subject: "", category: "technical", priority: "normal", message: "" });
    const [errors, setErrors] = useState({});
    const create = useAppMutation(createTicket, { success: (t) => `Ticket ${t.id} created`, onSuccess: onCreated });
    const set = (k) => (e) => {
        setF((x) => ({ ...x, [k]: e.target.value }));
        setErrors((x) => ({ ...x, [k]: undefined }));
    };
    const submit = (e) => {
        e.preventDefault();
        const errs = {};
        if (f.subject.trim().length < 5) errs.subject = "Subject should be at least 5 characters.";
        if (f.message.trim().length < 10) errs.message = "Please describe the issue in at least 10 characters.";
        setErrors(errs);
        if (!Object.keys(errs).length) create.mutate(f);
    };
    return (
        <section className="app-card" data-testid="support-new-ticket-form">
            <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Back to tickets" onClick={onCancel} data-testid="support-new-back">
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h2 className="text-base font-semibold app-heading">New support ticket</h2>
                    <p className="text-sm app-muted">The more detail you share, the faster we can help.</p>
                </div>
            </header>
            <form noValidate onSubmit={submit} className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
                <Field label="Subject" htmlFor="ticket-subject" error={errors.subject} className="sm:col-span-2">
                    <input
                        id="ticket-subject"
                        value={f.subject}
                        onChange={set("subject")}
                        maxLength={120}
                        placeholder="e.g. Telegram bot stopped replying"
                        className={`app-input ${errors.subject ? "app-input-error" : ""}`}
                        data-testid="ticket-subject-input"
                    />
                </Field>
                <Field label="Category" htmlFor="ticket-category">
                    <Select id="ticket-category" value={f.category} onChange={set("category")} options={TICKET_CATEGORIES} data-testid="ticket-category-select" />
                </Field>
                <Field label="Priority" htmlFor="ticket-priority">
                    <Select id="ticket-priority" value={f.priority} onChange={set("priority")} options={TICKET_PRIORITIES} data-testid="ticket-priority-select" />
                </Field>
                <Field label="Describe the issue" htmlFor="ticket-message" error={errors.message} hint={`${f.message.length}/2000`} className="sm:col-span-2">
                    <textarea
                        id="ticket-message"
                        value={f.message}
                        onChange={set("message")}
                        maxLength={2000}
                        rows={6}
                        placeholder="What happened, what you expected, and any order IDs or error messages."
                        className={`app-input h-auto py-2.5 ${errors.message ? "app-input-error" : ""}`}
                        data-testid="ticket-message-input"
                    />
                </Field>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                    <Button type="submit" loading={create.isPending} data-testid="ticket-submit-button">
                        Submit ticket
                    </Button>
                    <Button variant="ghost" onClick={onCancel} disabled={create.isPending} data-testid="ticket-cancel-button">
                        Cancel
                    </Button>
                </div>
            </form>
        </section>
    );
}

function TicketDetail({ id, onBack }) {
    const q = useAppQuery(["ticket", id], () => getTicket(id), { refetchInterval: 5000 });
    const [text, setText] = useState("");
    const [confirm, setConfirm] = useState(false);
    const endRef = useRef(null);
    const reply = useAppMutation(replyTicket, { success: "Reply sent", onSuccess: () => setText("") });
    const close = useAppMutation(closeTicket, { success: "Ticket closed", onSuccess: () => setConfirm(false) });
    const reopen = useAppMutation(reopenTicket, { success: "Ticket reopened" });

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: "nearest" });
    }, [q.data?.messages.length]);

    if (q.isLoading)
        return (
            <div className="app-card space-y-3 p-6">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-2/3" />
            </div>
        );
    if (q.isError) return <ErrorState message={q.error.message} onRetry={q.refetch} />;

    const t = q.data;
    const closed = t.status === "closed";
    return (
        <section className="app-card flex flex-col" data-testid="support-ticket-detail">
            <header className="flex flex-wrap items-start gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6">
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Back to tickets" onClick={onBack} data-testid="support-detail-back">
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400" data-testid="ticket-detail-id">{t.id}</p>
                    <h2 className="mt-0.5 break-words text-base font-semibold app-heading" data-testid="ticket-detail-subject">{t.subject}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs app-muted">
                        <StatusBadge status={t.status} testId="ticket-detail-status" />
                        <PriorityTag value={t.priority} />
                        <span>{CATEGORY_LABEL[t.category]}</span>
                        <span>· Opened {formatDateTime(t.createdAt)}</span>
                    </div>
                </div>
                {closed ? (
                    <Button variant="secondary" size="sm" icon={RotateCcw} loading={reopen.isPending} onClick={() => reopen.mutate(t.id)} data-testid="ticket-reopen-button">
                        Reopen
                    </Button>
                ) : (
                    <Button variant="danger-outline" size="sm" icon={Lock} onClick={() => setConfirm(true)} data-testid="ticket-close-button">
                        Close ticket
                    </Button>
                )}
            </header>

            <div className="max-h-[calc(100vh-24rem)] min-h-[260px] space-y-4 overflow-y-auto bg-slate-50/60 p-5 dark:bg-slate-950/40 sm:p-6" data-testid="ticket-messages">
                {t.messages.map((m) =>
                    m.from === "system" ? (
                        <p key={m.id} className="text-center text-xs font-medium text-slate-500 dark:text-slate-400">— {m.text} · {timeAgo(m.at)} —</p>
                    ) : (
                        <div key={m.id} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`} data-testid={`ticket-message-${m.from}`}>
                            <div className="max-w-[85%]">
                                <p className={`mb-1 text-[11px] font-semibold ${m.from === "user" ? "text-right text-indigo-600 dark:text-indigo-400" : "text-slate-500"}`}>
                                    {m.from === "user" ? "You" : "YourSMMagent Support"} · {formatDateTime(m.at)}
                                </p>
                                <p
                                    className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm ${
                                        m.from === "user"
                                            ? "rounded-tr-md bg-indigo-600 text-white"
                                            : "rounded-tl-md border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
                className="border-t border-slate-100 p-4 dark:border-slate-800"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (text.trim()) reply.mutate({ id: t.id, message: text });
                }}
            >
                {closed ? (
                    <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-sm app-muted dark:bg-slate-800/60" data-testid="ticket-closed-notice">
                        This ticket is closed. Reopen it if you still need help.
                    </p>
                ) : (
                    <div className="flex items-end gap-2">
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            rows={2}
                            placeholder="Write a reply…"
                            className="app-input h-auto min-h-[44px] resize-none py-2.5"
                            aria-label="Reply to ticket"
                            data-testid="ticket-reply-input"
                        />
                        <Button type="submit" icon={Send} loading={reply.isPending} disabled={!text.trim()} data-testid="ticket-reply-send">
                            Send
                        </Button>
                    </div>
                )}
            </form>

            <ConfirmModal
                open={confirm}
                title="Close this ticket?"
                description="You can reopen it later if the issue comes back."
                confirmLabel="Close ticket"
                loading={close.isPending}
                onConfirm={() => close.mutate(t.id)}
                onClose={() => setConfirm(false)}
                testId="ticket-close-modal"
            />
        </section>
    );
}
