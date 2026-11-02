import {
    KeyRound,
    LifeBuoy,
    MessagesSquare,
    NotebookPen,
    SlidersHorizontal,
    Sparkles,
} from "lucide-react";
import Reveal from "./Reveal";

const CARDS = [
    {
        icon: MessagesSquare,
        title: "AI-Powered Customer Conversations",
        text: "The agent holds natural, context-aware conversations instead of forcing customers through rigid menu trees — understanding what they need and responding in plain language.",
        benefit: "Support that feels like a conversation, not a script.",
    },
    {
        icon: NotebookPen,
        title: "Custom Knowledge and Instructions",
        text: "Teach the agent your services, refill and cancellation policies, delivery expectations, and tone of voice. It answers based on what you configured — not generic guesses.",
        benefit: "Consistent, on-brand answers across every conversation.",
    },
    {
        icon: KeyRound,
        title: "Authorized Panel API Connections",
        text: "Connect a supported panel API and the agent can assist with panel-related workflows, such as order status assistance, using an authorized connection you control.",
        benefit: "Answers grounded in your panel — not assumptions.",
    },
    {
        icon: Sparkles,
        title: "Multi-Channel Support",
        text: "One configured agent serves your website, Telegram, and WhatsApp — the same knowledge, the same behavior, everywhere your customers reach out.",
        benefit: "Customers get help where they already are.",
    },
    {
        icon: LifeBuoy,
        title: "Human Support Escalation",
        text: "When a question is too complex or sensitive, the agent hands the conversation to your human team — following escalation rules you define.",
        benefit: "AI handles the volume, humans handle the nuance.",
    },
    {
        icon: SlidersHorizontal,
        title: "Configurable Agent Behavior",
        text: "Set which topics the agent covers, how it phrases answers, and when it should stay quiet. Adjust behavior any time as your services and policies evolve.",
        benefit: "The agent stays aligned with how you run your panel.",
    },
];

export default function Capabilities() {
    return (
        <section id="features" className="scroll-mt-24 py-20 sm:py-28" aria-labelledby="features-heading">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
                <Reveal className="mx-auto max-w-3xl text-center">
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">
                        Product Capabilities
                    </span>
                    <h2
                        id="features-heading"
                        className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.6rem] lg:leading-[1.15]"
                    >
                        Everything You Need to Build Smarter SMM Panel Support
                    </h2>
                    <p className="mt-5 text-base leading-relaxed text-slate-600 sm:text-lg">
                        A focused toolkit for configuring an AI support agent that understands your panel
                        business — and a support experience your customers will notice.
                    </p>
                </Reveal>

                <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {CARDS.map(({ icon: Icon, title, text, benefit }, i) => (
                        <Reveal
                            key={title}
                            delay={(i % 3) * 0.08}
                            className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-[0_20px_50px_-20px_rgba(79,70,229,0.22)]"
                        >
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 transition-colors duration-300 group-hover:bg-indigo-600 group-hover:text-white">
                                <Icon className="h-6 w-6" />
                            </span>
                            <h3 className="mt-5 text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
                            <p className="mt-2.5 flex-1 text-sm leading-relaxed text-slate-600">{text}</p>
                            <p className="mt-5 border-t border-slate-100 pt-4 text-sm font-medium text-indigo-600">
                                {benefit}
                            </p>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
}
