import { Clock4, Link2, ListChecks, ShieldCheck, TrendingUp } from "lucide-react";
import Reveal from "./Reveal";

const SMALL_CARDS = [
    {
        icon: Clock4,
        title: "Improve Customer Support Accessibility",
        text: "Offer customers convenient support entry points across your website, Telegram, and WhatsApp — with an AI agent ready to help at any hour.",
    },
    {
        icon: ListChecks,
        title: "Standardize Common Answers",
        text: "Built on configured knowledge and instructions, responses to common questions stay consistent — regardless of when or where a customer asks.",
    },
    {
        icon: TrendingUp,
        title: "Support Business Growth",
        text: "As inquiries increase, AI-assisted support helps you keep structured, predictable support processes instead of a chaotic inbox.",
    },
];

export default function Benefits() {
    return (
        <section id="benefits" className="scroll-mt-24 py-20 sm:py-28" aria-labelledby="benefits-heading">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
                <Reveal className="mx-auto max-w-3xl text-center">
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">
                        Business Benefits
                    </span>
                    <h2
                        id="benefits-heading"
                        className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.6rem] lg:leading-[1.15]"
                    >
                        Spend Less Time on Repetitive Support. More Time on Your Business.
                    </h2>
                    <p className="mt-5 text-base leading-relaxed text-slate-600 sm:text-lg">
                        AI-assisted support is not about replacing your team — it is about giving panel
                        administrators a structured way to handle the questions that come with every order.
                    </p>
                </Reveal>

                <div className="mt-14 grid gap-5 md:grid-cols-3">
                    <Reveal className="md:col-span-2 md:row-span-1 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/90 to-blue-50/60 p-7 sm:p-9">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white">
                            <ShieldCheck className="h-6 w-6" />
                        </span>
                        <h3 className="mt-5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                            Reduce Repetitive Manual Responses
                        </h3>
                        <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-600">
                            Frequently repeated customer questions — order status, refills, service
                            requirements — are exactly what a configured AI support agent is built to handle,
                            freeing your time for the work that actually grows the panel.
                        </p>
                        <div className="mt-6 flex flex-wrap gap-2" aria-hidden="true">
                            {["\u201cWhere is my order?\u201d", "\u201cIs this service available?\u201d", "\u201cHow do refills work?\u201d", "\u201cWhat does this status mean?\u201d"].map(
                                (chip) => (
                                    <span
                                        key={chip}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600"
                                    >
                                        {chip}
                                        <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">
                                            AI
                                        </span>
                                    </span>
                                ),
                            )}
                        </div>
                    </Reveal>

                    {SMALL_CARDS.slice(0, 1).map(({ icon: Icon, title, text }) => (
                        <Reveal
                            key={title}
                            delay={0.08}
                            className="h-full rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
                        >
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                                <Icon className="h-6 w-6" />
                            </span>
                            <h3 className="mt-5 text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
                            <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{text}</p>
                        </Reveal>
                    ))}

                    {SMALL_CARDS.slice(1).map(({ icon: Icon, title, text }, i) => (
                        <Reveal
                            key={title}
                            delay={i * 0.08}
                            className="h-full rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
                        >
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                                <Icon className="h-6 w-6" />
                            </span>
                            <h3 className="mt-5 text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
                            <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{text}</p>
                        </Reveal>
                    ))}

                    <Reveal
                        delay={0.12}
                        className="h-full rounded-2xl border border-slate-200 bg-slate-50 p-7 sm:p-9"
                    >
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
                            <Link2 className="h-6 w-6" />
                        </span>
                        <h3 className="mt-5 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                            Connect Support to Panel Workflows
                        </h3>
                        <p className="mt-2.5 text-sm leading-relaxed text-slate-600">
                            Use authorized data integrations where supported — so support conversations can
                            reach into the panel workflows you connect, within the permissions you define.
                        </p>
                    </Reveal>
                </div>
            </div>
        </section>
    );
}
