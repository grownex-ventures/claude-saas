import { Bot, CheckCircle2, Database, Globe, Phone, Send } from "lucide-react";
import Reveal from "./Reveal";

const PILLARS = [
    "Business-specific AI instructions",
    "Centralized agent configuration",
    "Multiple customer support channels",
    "Panel-related assistance",
    "Supported API-connected workflows",
    "More consistent support experiences",
];

const CHANNEL_ICONS = [
    { icon: Globe, label: "Website" },
    { icon: Send, label: "Telegram" },
    { icon: Phone, label: "WhatsApp" },
];

export default function Introducing() {
    return (
        <section className="bg-slate-50/70 py-20 sm:py-28" aria-labelledby="introducing-heading">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
                <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
                    <Reveal>
                        <h2
                            id="introducing-heading"
                            className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.6rem] lg:leading-[1.15]"
                        >
                            Meet YourSMMagent — Your AI Support Partner for SMM Panels.
                        </h2>

                        <div className="mt-6 space-y-5 text-base leading-relaxed text-slate-600 sm:text-lg">
                            <p>
                                YourSMMagent is an AI support platform designed specifically for SMM panel
                                businesses. Instead of a generic bot bolted onto your website, it gives you a
                                dedicated AI support agent that you configure with your own business knowledge —
                                your services, your policies, and the way you want customers to be answered.
                            </p>
                            <p>
                                From one central place, you define which topics the agent should handle, how it
                                should respond, and when a conversation should be passed to a human. The agent
                                then assists customers across your website, Telegram, and WhatsApp — and, where
                                you connect a supported panel API, it can assist with panel-related workflows
                                such as order status inquiries through an authorized connection.
                            </p>
                            <p>
                                The result is support that understands the difference between a refill request
                                and a drip-feed question — and answers accordingly, consistently, at any hour of
                                the day.
                            </p>
                        </div>

                        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                            {PILLARS.map((item) => (
                                <li key={item} className="flex items-start gap-2.5 text-sm font-medium text-slate-700">
                                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </Reveal>

                    {/* Connection diagram */}
                    <Reveal delay={0.12}>
                        <div
                            className="relative mx-auto w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_24px_70px_-30px_rgba(15,23,42,0.25)]"
                            data-testid="introducing-diagram"
                        >
                            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                How your support connects
                            </p>

                            <div className="mt-5 flex justify-center gap-3">
                                {CHANNEL_ICONS.map(({ icon: Icon, label }) => (
                                    <span
                                        key={label}
                                        className="inline-flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                                    >
                                        <Icon className="h-5 w-5 text-slate-600" />
                                        <span className="text-xs font-medium text-slate-600">{label}</span>
                                    </span>
                                ))}
                            </div>

                            <div className="flex justify-center py-1" aria-hidden="true">
                                <svg width="24" height="34" viewBox="0 0 24 34" className="text-indigo-300">
                                    <line x1="12" y1="0" x2="12" y2="26" stroke="currentColor" strokeWidth="2" className="flow-dash" />
                                    <path d="M6 24 L12 32 L18 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>

                            <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 p-5 text-center shadow-[0_16px_40px_-14px_rgba(79,70,229,0.55)]">
                                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-white">
                                    <Bot className="h-6 w-6" />
                                </span>
                                <p className="mt-3 text-base font-bold text-white">YourSMMagent</p>
                                <p className="text-xs text-indigo-100">Your configured AI support agent</p>
                                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                                    {["Knowledge", "Instructions", "API workflows"].map((chip) => (
                                        <span
                                            key={chip}
                                            className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-indigo-50"
                                        >
                                            {chip}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-center py-1" aria-hidden="true">
                                <svg width="24" height="34" viewBox="0 0 24 34" className="text-indigo-300">
                                    <line x1="12" y1="0" x2="12" y2="26" stroke="currentColor" strokeWidth="2" className="flow-dash" />
                                    <path d="M6 24 L12 32 L18 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>

                            <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm">
                                    <Database className="h-5 w-5" />
                                </span>
                                <div>
                                    <p className="text-sm font-semibold text-slate-800">SMM Panel API</p>
                                    <p className="text-xs text-slate-500">
                                        Authorized connection, configured by you — supported actions only
                                    </p>
                                </div>
                            </div>
                        </div>
                    </Reveal>
                </div>
            </div>
        </section>
    );
}
