import { motion, useReducedMotion } from "framer-motion";
import { MessagesSquare, Sparkles, Target, Workflow } from "lucide-react";
import { ArrowCta, PrimaryCTA, SecondaryCTA } from "./Buttons";
import HeroConsole from "./HeroConsole";

const line1 = [{ t: "AI Customer Support," }];
const line2 = [{ t: "Built for " }, { t: "SMM Panels.", gradient: true }];

const VALUE_PROPS = [
    { icon: Target, label: "Built for SMM Panel Businesses" },
    { icon: MessagesSquare, label: "Multi-Channel AI Support" },
    { icon: Workflow, label: "API-Connected Support Workflows" },
];

export default function Hero() {
    const reduce = useReducedMotion();
    const reveal = (delay) =>
        reduce
            ? {}
            : {
                  initial: { y: "110%" },
                  animate: { y: 0 },
                  transition: { duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] },
              };

    return (
        <section className="relative overflow-hidden pb-16 pt-28 sm:pb-20 sm:pt-36 lg:pt-40">
            <div className="bg-grid absolute inset-0" aria-hidden="true" />
            <div
                className="absolute left-1/2 top-[-320px] h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-indigo-200/40 blur-[140px]"
                aria-hidden="true"
            />
            <div
                className="absolute right-[-180px] top-[120px] h-[420px] w-[420px] rounded-full bg-blue-100/50 blur-[120px]"
                aria-hidden="true"
            />

            <div className="relative mx-auto w-full max-w-7xl px-5 sm:px-8">
                <div className="mx-auto max-w-3xl text-center">
                    <motion.span
                        initial={reduce ? { opacity: 1 } : { opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50/80 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600"
                        data-testid="hero-eyebrow"
                    >
                        <Sparkles className="h-3.5 w-3.5" />
                        AI-Powered Support for SMM Panels
                    </motion.span>

                    <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl sm:leading-[1.08]">
                        <span className="block overflow-hidden pb-1">
                            <motion.span className="block" {...reveal(0.1)}>
                                {line1.map((part, i) => (
                                    <span key={i}>{part.t}</span>
                                ))}
                            </motion.span>
                        </span>
                        <span className="block overflow-hidden pb-2">
                            <motion.span className="block" {...reveal(0.22)}>
                                {line2.map((part, i) =>
                                    part.gradient ? (
                                        <span
                                            key={i}
                                            className="bg-gradient-to-r from-indigo-600 to-blue-500 bg-clip-text text-transparent"
                                        >
                                            {part.t}
                                        </span>
                                    ) : (
                                        <span key={i}>{part.t}</span>
                                    ),
                                )}
                            </motion.span>
                        </span>
                    </h1>

                    <motion.p
                        initial={reduce ? { opacity: 1 } : { opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.4 }}
                        className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg"
                        data-testid="hero-description"
                    >
                        Turn repetitive customer questions into smarter support conversations.
                        YourSMMagent brings AI-powered assistance to your SMM panel through website
                        chat, Telegram, WhatsApp, and connected support workflows.
                    </motion.p>

                    <motion.div
                        initial={reduce ? { opacity: 1 } : { opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.52 }}
                        className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
                    >
                        <PrimaryCTA testId="hero-get-started-button" className="w-full sm:w-auto">
                            Get Started
                            <ArrowCta />
                        </PrimaryCTA>
                        <SecondaryCTA testId="hero-explore-features-link" href="#features" className="w-full sm:w-auto">
                            Explore Features
                        </SecondaryCTA>
                    </motion.div>

                    <motion.ul
                        initial={reduce ? { opacity: 1 } : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.8, delay: 0.68 }}
                        className="mx-auto mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
                        data-testid="hero-value-props"
                    >
                        {VALUE_PROPS.map(({ icon: Icon, label }) => (
                            <li key={label} className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
                                <Icon className="h-4 w-4 text-indigo-500" />
                                {label}
                            </li>
                        ))}
                    </motion.ul>
                </div>

                <div className="relative mx-auto mt-14 max-w-5xl sm:mt-16">
                    <HeroConsole />
                </div>
            </div>
        </section>
    );
}
