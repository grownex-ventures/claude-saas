import { useEffect, useRef, useState } from "react";
import { Bot, Clock, MessageSquarePlus, Pencil, Send, ShieldAlert, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button, Card, ConfirmModal, EmptyState, Field, PageHeader, QueryState, Segmented, Select, SkeletonCard, Switch, ToggleRow } from "@/components/app/ui";
import { addFaq, deleteFaq, getAISettings, saveAISettings, testAI, updateFaq } from "@/lib/appApi";
import { useAppMutation, useAppQuery } from "@/lib/appQueries";

const ACTIONS = [
    ["balance", "Check balance", "Tell customers their current panel balance."],
    ["services", "List services & prices", "Share service names, rates and minimums."],
    ["orderStatus", "Order status", "Look up an order's progress by ID."],
    ["refill", "Request refills", "Create refill requests for eligible orders."],
    ["cancel", "Cancel orders", "Cancel pending orders and refund the balance."],
];

export default function AIKnowledge() {
    const q = useAppQuery(["ai"], getAISettings);
    return (
        <div data-testid="ai-page">
            <QueryState
                query={q}
                skeleton={
                    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                        <SkeletonCard lines={8} />
                        <SkeletonCard lines={5} />
                    </div>
                }
            >
                {(ai) => <AIEditor ai={ai} />}
            </QueryState>
        </div>
    );
}

function AIEditor({ ai }) {
    const { faqs, ...saved } = ai;
    const [draft, setDraft] = useState(saved);
    useEffect(() => {
        setDraft(saved);
    }, [JSON.stringify(saved)]); // eslint-disable-line react-hooks/exhaustive-deps
    const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
    const save = useAppMutation(saveAISettings, { success: "AI settings saved" });
    const set = (path, value) =>
        setDraft((d) => {
            const [a, b] = path.split(".");
            return b ? { ...d, [a]: { ...d[a], [b]: value } } : { ...d, [a]: value };
        });

    return (
        <>
            <PageHeader
                title="AI & Knowledge"
                description="Shape how your agent talks, what it's allowed to do and what it knows."
                actions={
                    <>
                        {dirty && <span className="text-xs font-medium text-amber-700 dark:text-amber-300" data-testid="ai-unsaved">Unsaved changes</span>}
                        <Button variant="secondary" disabled={!dirty || save.isPending} onClick={() => setDraft(saved)} data-testid="ai-discard-button">
                            Discard
                        </Button>
                        <Button loading={save.isPending} disabled={!dirty} onClick={() => save.mutate(draft)} data-testid="ai-save-button">
                            Save changes
                        </Button>
                    </>
                }
            />
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
                <div className="min-w-0 space-y-6">
                    <Card title="Personality" icon={Sparkles} testId="ai-personality-card">
                        <div className="grid gap-5 sm:grid-cols-2">
                            <Field label="Tone">
                                <Segmented
                                    value={draft.tone}
                                    onChange={(v) => set("tone", v)}
                                    testId="ai-tone"
                                    options={[{ value: "friendly", label: "Friendly" }, { value: "professional", label: "Professional" }, { value: "short", label: "Short" }]}
                                />
                            </Field>
                            <Field label="Reply language" htmlFor="ai-language">
                                <Select
                                    id="ai-language"
                                    value={draft.language}
                                    onChange={(e) => set("language", e.target.value)}
                                    data-testid="ai-language-select"
                                    options={[
                                        { value: "auto", label: "Match the customer (auto)" },
                                        { value: "en", label: "English" },
                                        { value: "es", label: "Español" },
                                        { value: "pt", label: "Português" },
                                        { value: "ru", label: "Русский" },
                                        { value: "hi", label: "हिन्दी" },
                                        { value: "ar", label: "العربية" },
                                    ]}
                                />
                            </Field>
                        </div>
                    </Card>

                    <Card title="Business hours" description="Outside these hours the AI still replies and tells customers when a human is back." icon={Clock} testId="ai-hours-card">
                        <ToggleRow title="Use business hours" checked={draft.hours.enabled} onChange={(v) => set("hours.enabled", v)} testId="ai-hours-toggle" />
                        <div className={`grid gap-4 pt-2 sm:grid-cols-3 ${draft.hours.enabled ? "" : "pointer-events-none opacity-50"}`}>
                            <Field label="Opens" htmlFor="ai-hours-start">
                                <input id="ai-hours-start" type="time" value={draft.hours.start} onChange={(e) => set("hours.start", e.target.value)} disabled={!draft.hours.enabled} className="app-input" data-testid="ai-hours-start" />
                            </Field>
                            <Field label="Closes" htmlFor="ai-hours-end">
                                <input id="ai-hours-end" type="time" value={draft.hours.end} onChange={(e) => set("hours.end", e.target.value)} disabled={!draft.hours.enabled} className="app-input" data-testid="ai-hours-end" />
                            </Field>
                            <Field label="Time zone" htmlFor="ai-hours-tz">
                                <Select
                                    id="ai-hours-tz"
                                    value={draft.hours.timezone}
                                    onChange={(e) => set("hours.timezone", e.target.value)}
                                    disabled={!draft.hours.enabled}
                                    options={["UTC", "Asia/Kolkata", "Europe/London", "Europe/Istanbul", "America/New_York", "Asia/Dubai"].map((v) => ({ value: v, label: v }))}
                                />
                            </Field>
                        </div>
                    </Card>

                    <Card title="Escalation rules" description="When should the AI hand a conversation to you?" icon={ShieldAlert} testId="ai-escalation-card">
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            <ToggleRow title="Customer asks for a human" description="Phrases like “talk to an agent” or “real person”." checked={draft.escalation.onRequest} onChange={(v) => set("escalation.onRequest", v)} testId="ai-escalate-request" />
                            <ToggleRow title="Email me on every handoff" checked={draft.escalation.notifyEmail} onChange={(v) => set("escalation.notifyEmail", v)} testId="ai-escalate-email" />
                        </div>
                        <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_2fr]">
                            <Field label="After failed answers" htmlFor="ai-escalate-failed">
                                <Select
                                    id="ai-escalate-failed"
                                    value={String(draft.escalation.afterFailed)}
                                    onChange={(e) => set("escalation.afterFailed", Number(e.target.value))}
                                    data-testid="ai-escalate-failed"
                                    options={[1, 2, 3, 5].map((n) => ({ value: String(n), label: `${n} ${n === 1 ? "attempt" : "attempts"}` }))}
                                />
                            </Field>
                            <Field label="Always escalate on these words" htmlFor="ai-escalate-keywords" hint="Comma-separated">
                                <input id="ai-escalate-keywords" value={draft.escalation.keywords} onChange={(e) => set("escalation.keywords", e.target.value)} className="app-input" data-testid="ai-escalate-keywords" />
                            </Field>
                        </div>
                    </Card>

                    <Card title="Allowed actions" description="Turn off anything the AI shouldn't do on its own." icon={Wand2} testId="ai-actions-card">
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {ACTIONS.map(([key, title, desc]) => (
                                <ToggleRow key={key} title={title} description={desc} checked={draft.actions[key]} onChange={(v) => set(`actions.${key}`, v)} testId={`ai-action-${key}`} />
                            ))}
                        </div>
                    </Card>

                    <FaqCard faqs={faqs} />
                </div>

                <div className="lg:sticky lg:top-20 lg:self-start">
                    <Sandbox settings={{ ...draft, faqs }} />
                </div>
            </div>
        </>
    );
}

function FaqCard({ faqs }) {
    const [editing, setEditing] = useState(null); // null | "new" | faq id
    const [form, setForm] = useState({ question: "", answer: "" });
    const [toDelete, setToDelete] = useState(null);
    const close = () => {
        setEditing(null);
        setForm({ question: "", answer: "" });
    };
    const add = useAppMutation(addFaq, { success: "FAQ added", onSuccess: close });
    const update = useAppMutation(updateFaq, { success: "FAQ updated", onSuccess: close });
    const remove = useAppMutation(deleteFaq, { success: "FAQ deleted", onSuccess: () => setToDelete(null) });

    const editor = (
        <form
            className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/5"
            onSubmit={(e) => {
                e.preventDefault();
                editing === "new" ? add.mutate(form) : update.mutate({ id: editing, ...form });
            }}
            data-testid="faq-editor"
        >
            <input value={form.question} onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))} placeholder="Question, e.g. Do you offer refunds?" className="app-input" aria-label="Question" data-testid="faq-question-input" />
            <textarea value={form.answer} onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))} placeholder="The answer the AI should give" rows={3} className="app-input h-auto py-2.5" aria-label="Answer" data-testid="faq-answer-input" />
            <div className="flex gap-2">
                <Button type="submit" size="sm" loading={add.isPending || update.isPending} data-testid="faq-save-button">
                    {editing === "new" ? "Add FAQ" : "Save FAQ"}
                </Button>
                <Button size="sm" variant="ghost" onClick={close} data-testid="faq-cancel-button">
                    Cancel
                </Button>
            </div>
        </form>
    );

    return (
        <Card
            title="Custom FAQ"
            description="Answers the AI should give word-for-word."
            icon={MessageSquarePlus}
            testId="ai-faq-card"
            action={
                editing === null && (
                    <Button size="sm" variant="secondary" onClick={() => setEditing("new")} data-testid="faq-add-button">
                        Add FAQ
                    </Button>
                )
            }
        >
            <div className="space-y-3">
                {editing === "new" && editor}
                {!faqs.length && editing !== "new" && <EmptyState icon={MessageSquarePlus} title="No FAQ entries yet" description="Add the questions your customers ask most." testId="faq-empty" />}
                {faqs.map((f) =>
                    editing === f.id ? (
                        <div key={f.id}>{editor}</div>
                    ) : (
                        <div key={f.id} className="group flex items-start gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800" data-testid="faq-item">
                            <div className="min-w-0 flex-1">
                                <p className="break-words text-sm font-semibold app-heading">{f.question}</p>
                                <p className="mt-1 break-words text-sm app-muted">{f.answer}</p>
                            </div>
                            <div className="flex shrink-0 gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Edit FAQ"
                                    onClick={() => {
                                        setEditing(f.id);
                                        setForm({ question: f.question, answer: f.answer });
                                    }}
                                    data-testid="faq-edit-button"
                                >
                                    <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" aria-label="Delete FAQ" onClick={() => setToDelete(f)} data-testid="faq-delete-button">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ),
                )}
            </div>
            <ConfirmModal
                open={Boolean(toDelete)}
                title="Delete this FAQ?"
                description={toDelete ? `“${toDelete.question}” will be removed from the AI's knowledge.` : ""}
                confirmLabel="Delete"
                loading={remove.isPending}
                onConfirm={() => remove.mutate(toDelete.id)}
                onClose={() => setToDelete(null)}
                testId="faq-delete-modal"
            />
        </Card>
    );
}

function Sandbox({ settings }) {
    const [messages, setMessages] = useState([{ from: "ai", text: "Hi! I'm your AI agent. Ask me something your customers would ask — I'll use your current (even unsaved) settings." }]);
    const [text, setText] = useState("");
    const endRef = useRef(null);
    const ask = useAppMutation(testAI, {
        success: false,
        onSuccess: (r) => setMessages((m) => [...m, { from: "ai", text: r.reply, escalated: r.escalated }]),
    });
    useEffect(() => {
        endRef.current?.scrollIntoView({ block: "nearest" });
    }, [messages.length]);
    const send = (msg) => {
        if (!msg.trim() || ask.isPending) return;
        setMessages((m) => [...m, { from: "customer", text: msg.trim() }]);
        setText("");
        ask.mutate({ message: msg.trim(), settings });
    };
    return (
        <Card title="Test the AI" description="A private sandbox — customers never see this." icon={Bot} testId="ai-sandbox" bodyClassName="p-0">
            <div className="h-[380px] space-y-3 overflow-y-auto bg-slate-50/60 p-4 dark:bg-slate-950/40" data-testid="ai-sandbox-messages">
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.from === "customer" ? "justify-end" : "justify-start"}`}>
                        <p
                            className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm ${
                                m.from === "customer" ? "rounded-tr-md bg-indigo-600 text-white" : "rounded-tl-md border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            }`}
                            data-testid={`ai-sandbox-${m.from}-message`}
                        >
                            {m.text}
                            {m.escalated && <span className="mt-1.5 block text-[11px] font-semibold text-amber-600 dark:text-amber-400">Escalated to a human</span>}
                        </p>
                    </div>
                ))}
                {ask.isPending && (
                    <div className="flex gap-1 px-2" aria-label="AI is typing" data-testid="ai-sandbox-typing">
                        {[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${i * 120}ms` }} />)}
                    </div>
                )}
                <div ref={endRef} />
            </div>
            <div className="border-t border-slate-100 p-3 dark:border-slate-800">
                <div className="mb-2 flex flex-wrap gap-1.5">
                    {["What's my balance?", "Status of order #48213", "Refill please", "Cancel my order"].map((s) => (
                        <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" data-testid="ai-sandbox-suggestion">
                            {s}
                        </button>
                    ))}
                </div>
                <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        send(text);
                    }}
                >
                    <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a customer message…" className="app-input" aria-label="Test message" data-testid="ai-sandbox-input" />
                    <Button type="submit" icon={Send} disabled={!text.trim()} loading={ask.isPending} data-testid="ai-sandbox-send">
                        Send
                    </Button>
                </form>
            </div>
        </Card>
    );
}
