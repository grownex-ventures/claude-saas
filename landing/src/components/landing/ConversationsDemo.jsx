import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Info } from "lucide-react";
import Reveal from "./Reveal";

const DEMOS = [
    {
        question: "Can you check my order status?",
        conversation: [
            { from: "customer", text: "Can you check my order status? Order #10247." },
            {
                from: "ai",
                text: "Of course — here is the latest update for order #10247:",
                card: {
                    title: "Order #10247 · 1,000 Followers — Premium",
                    status: "In Progress",
                    detail: "640 of 1,000 delivered · Started 10:02 · Following the service's normal delivery time",
                },
            },
            {
                from: "ai",
                text: "This status came through the panel API connection configured for this workspace. I'll keep helping if you have more questions.",
            },
        ],
    },
    {
        question: "How do I request a refill?",
        conversation: [
            { from: "customer", text: "How do I request a refill?" },
            {
                from: "ai",
                text: "If your order is eligible under the service's refill policy, you can request a refill from your order page — or simply reply with the order ID and I'll check it for you.",
            },
            {
                from: "ai",
                text: "I'll also walk you through the refill terms that apply to that specific service, so you know exactly what to expect.",
            },
        ],
    },
    {
        question: "What does \u201cIn Progress\u201d mean?",
        conversation: [
            { from: "customer", text: "What does \u201cIn Progress\u201d mean for my order?" },
            {
                from: "ai",
                text: "\u201cIn Progress\u201d means your order has been accepted and is currently being delivered to the link you provided. Delivery follows the timeframe stated on the service.",
            },
            {
                from: "ai",
                text: "If you'd like, share your order ID and I'll pull up the current progress for you.",
            },
        ],
    },
    {
        question: "Where can I find service details?",
        conversation: [
            { from: "customer", text: "Where can I find service details before ordering?" },
            {
                from: "ai",
                text: "Every service on the panel has a details page with its description, minimum and maximum quantity, expected delivery time, and refill or cancellation terms.",
            },
            {
                from: "ai",
                text: "Tell me which platform you're ordering for, and I'll point you to the right service and explain what each detail means.",
            },
        ],
    },
];

export default function ConversationsDemo() {
    const [active, setActive] = useState(0);
    const current = DEMOS[active];

    return (
        <section className="bg-slate-50/70 py-20 sm:py-28" aria-labelledby="conversations-heading">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
                <Reveal className="mx-auto max-w-3xl text-center">
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600 shadow-sm">
                        Example Conversations
                    </span>
                    <h2
                        id="conversations-heading"
                        className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.6rem] lg:leading-[1.15]"
                    >
                        See How AI Can Handle Common SMM Panel Questions
                    </h2>
                    <p className="mt-5 text-base leading-relaxed text-slate-600 sm:text-lg">
                        Select a question to preview how a configured support conversation might look. Each
                        example is a prewritten product illustration.
                    </p>
                </Reveal>

                <Reveal delay={0.1} className="mx-auto mt-12 grid max-w-4xl gap-6 lg:grid-cols-[300px_1fr]">
                    <div
                        className="flex flex-col gap-2.5"
                        role="tablist"
                        aria-label="Example questions"
                        data-testid="conversations-demo-tabs"
                    >
                        {DEMOS.map((demo, i) => (
                            <button
                                key={demo.question}
                                type="button"
                                role="tab"
                                aria-selected={active === i}
                                data-testid={`demo-question-button-${i}`}
                                onClick={() => setActive(i)}
                                className={`rounded-2xl border px-5 py-4 text-left text-sm font-semibold transition-all duration-200 sm:text-base ${
                                    active === i
                                        ? "border-indigo-600 bg-indigo-600 text-white shadow-[0_12px_30px_-12px_rgba(79,70,229,0.6)]"
                                        : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:text-slate-900"
                                }`}
                            >
                                &ldquo;{demo.question}&rdquo;
                            </button>
                        ))}
                        <p className="mt-2 flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-relaxed text-slate-500">
                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-400" />
                            Product illustration — prewritten demonstration responses, not a live chatbot.
                        </p>
                    </div>

                    <div
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_-24px_rgba(15,23,42,0.2)]"
                        data-testid="conversations-demo-panel"
                    >
                        <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50/80 px-5 py-3.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-blue-500 text-white">
                                <Bot className="h-4 w-4" />
                            </span>
                            <div>
                                <p className="text-sm font-semibold text-slate-800">AI Support Agent</p>
                                <p className="text-xs text-slate-400">Example conversation</p>
                            </div>
                            <span className="ml-auto rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600">
                                Illustrative
                            </span>
                        </div>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={active}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.28, ease: "easeOut" }}
                                className="flex min-h-[300px] flex-col gap-4 px-5 py-6"
                            >
                                {current.conversation.map((msg, i) =>
                                    msg.from === "customer" ? (
                                        <div key={i} className="flex items-end gap-2">
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                                                C
                                            </span>
                                            <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 px-4 py-2.5 text-sm text-slate-700">
                                                {msg.text}
                                            </p>
                                        </div>
                                    ) : (
                                        <div key={i} className="flex items-end justify-end gap-2">
                                            <div className="max-w-[88%] rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-sm text-indigo-50">
                                                <p>{msg.text}</p>
                                                {msg.card && (
                                                    <div className="mt-2.5 rounded-xl border border-indigo-400/30 bg-white/10 p-3">
                                                        <div className="flex items-center justify-between gap-3 text-xs">
                                                            <span className="font-semibold text-white">{msg.card.title}</span>
                                                            <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                                                                {msg.card.status}
                                                            </span>
                                                        </div>
                                                        <p className="mt-1.5 text-[11px] leading-relaxed text-indigo-100">
                                                            {msg.card.detail}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-blue-500 text-white">
                                                <Bot className="h-4 w-4" />
                                            </span>
                                        </div>
                                    ),
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </Reveal>
            </div>
        </section>
    );
}
