import { Store, TrendingUp, Users, UserRound } from "lucide-react";
import Reveal from "./Reveal";

const AUDIENCES = [
    {
        icon: UserRound,
        title: "Independent SMM Panel Owners",
        text: "When you run a panel, support lands on your desk by default. An AI support agent covers the routine questions around the clock, so evenings go to growing the business instead of clearing the inbox.",
    },
    {
        icon: TrendingUp,
        title: "Growing SMM Reseller Businesses",
        text: "More orders means more tickets. AI-assisted support keeps answers consistent as volume rises, and hands the conversations that genuinely need judgment to your human team.",
    },
    {
        icon: Store,
        title: "SMM Service Providers",
        text: "Customers constantly ask what a service does, how delivery works, and what the refill terms are. A configured agent explains service details clearly and consistently, using the knowledge you provide.",
    },
    {
        icon: Users,
        title: "Multi-Channel Support Teams",
        text: "One configured agent across website, Telegram, and WhatsApp means everyone works from the same knowledge and the same rules — with escalation and oversight designed in.",
    },
];

export default function WhoItsFor() {
    return (
        <section className="bg-slate-50/70 py-20 sm:py-28" aria-labelledby="who-its-for-heading">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
                <Reveal className="mx-auto max-w-3xl text-center">
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600 shadow-sm">
                        Who It&apos;s For
                    </span>
                    <h2
                        id="who-its-for-heading"
                        className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.6rem] lg:leading-[1.15]"
                    >
                        Built for Businesses That Run SMM Panels.
                    </h2>
                    <p className="mt-5 text-base leading-relaxed text-slate-600 sm:text-lg">
                        YourSMMagent is support infrastructure for the people behind SMM panel businesses —
                        shaped to how each stage of the journey actually works.
                    </p>
                </Reveal>

                <div className="mt-14 grid gap-5 sm:grid-cols-2">
                    {AUDIENCES.map(({ icon: Icon, title, text }, i) => (
                        <Reveal
                            key={title}
                            delay={(i % 2) * 0.08}
                            className="flex h-full gap-5 rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-all duration-300 hover:border-indigo-200 hover:shadow-[0_18px_44px_-20px_rgba(79,70,229,0.2)] sm:p-8"
                        >
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white">
                                <Icon className="h-6 w-6" />
                            </span>
                            <div>
                                <h3 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-slate-600 sm:text-base">{text}</p>
                            </div>
                        </Reveal>
                    ))}
                </div>
            </div>
        </section>
    );
}
