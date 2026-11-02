import { ArrowRight, UserRoundPlus, Settings2, PlugZap, Headset } from "lucide-react";
import Reveal from "./Reveal";
import { ArrowCta, PrimaryCTA } from "./Buttons";

const STEPS = [
    {
        icon: UserRoundPlus,
        title: "Create Your Account",
        text: "Sign up for YourSMMagent and set up your workspace in minutes. No technical setup is required to get started — you can begin shaping your AI support agent right away.",
    },
    {
        icon: Settings2,
        title: "Configure Your AI Support Agent",
        text: "Teach the agent about your business: your services, your policies, your tone of voice, and the topics it should handle. You decide what it answers and what it passes to a human.",
    },
    {
        icon: PlugZap,
        title: "Connect Your Supported Channels and Panel API",
        text: "Add your website chat widget, Telegram bot, and WhatsApp Business integration — and connect a supported panel API to enable authorized, order-related assistance.",
    },
    {
        icon: Headset,
        title: "Provide AI-Assisted Customer Support",
        text: "Customers get consistent, informed answers across every channel, while your team stays in control of escalations, oversight, and everything that needs a human touch.",
    },
];

export default function HowItWorks() {
    return (
        <section id="how-it-works" className="scroll-mt-24 py-20 sm:py-28" aria-labelledby="how-it-works-heading">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
                <Reveal className="mx-auto max-w-3xl text-center">
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">
                        Getting Started
                    </span>
                    <h2
                        id="how-it-works-heading"
                        className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.6rem] lg:leading-[1.15]"
                    >
                        How YourSMMagent Works
                    </h2>
                    <p className="mt-5 text-base leading-relaxed text-slate-600 sm:text-lg">
                        From sign-up to a working AI support agent in four clear steps — each one designed
                        around how SMM panel businesses actually operate.
                    </p>
                </Reveal>

                <ol className="relative mt-16 grid gap-10 lg:grid-cols-4 lg:gap-6" data-testid="how-it-works-steps">
                    <div
                        className="absolute left-6 top-0 hidden h-full w-px bg-gradient-to-b from-indigo-200 via-indigo-200/60 to-transparent lg:left-0 lg:top-8 lg:h-px lg:w-full lg:bg-gradient-to-r"
                        aria-hidden="true"
                    />
                    {STEPS.map(({ icon: Icon, title, text }, i) => (
                        <Reveal key={title} delay={i * 0.1} as="li" className="relative">
                            <div className="flex items-start gap-4 lg:flex-col lg:gap-5">
                                <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-[0_10px_26px_-10px_rgba(79,70,229,0.6)]">
                                    <Icon className="h-5 w-5" />
                                    <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-[10px] font-bold text-white">
                                        {i + 1}
                                    </span>
                                </div>
                                <div className="lg:pr-6">
                                    <h3 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
                                </div>
                            </div>
                        </Reveal>
                    ))}
                </ol>

                <Reveal delay={0.15} className="mt-14 text-center">
                    <PrimaryCTA testId="how-it-works-get-started-button">
                        Get Started
                        <ArrowCta />
                    </PrimaryCTA>
                    <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-400">
                        <ArrowRight className="h-3 w-3" />
                        Opens the YourSMMagent application
                    </p>
                </Reveal>
            </div>
        </section>
    );
}
