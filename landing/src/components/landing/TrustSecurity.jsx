import { EyeOff, KeyRound, Lock, ShieldCheck, SlidersHorizontal } from "lucide-react";
import Reveal from "./Reveal";

const PRINCIPLES = [
    {
        icon: KeyRound,
        title: "Authorized API integrations",
        text: "Panel connections are established through API access that you configure and authorize. The agent works within the capabilities and permissions of that connection.",
    },
    {
        icon: Lock,
        title: "Responsible credential handling",
        text: "Panel API credentials used for connected workflows are handled as sensitive configuration — stored securely and never exposed in customer conversations.",
    },
    {
        icon: ShieldCheck,
        title: "Access control",
        text: "You decide what the agent can access, which topics it handles, and where its responsibilities end. Permissions stay in your hands.",
    },
    {
        icon: SlidersHorizontal,
        title: "AI configuration and oversight",
        text: "Agent behavior follows your written instructions and configured knowledge, with human escalation available for anything that needs judgment.",
    },
    {
        icon: EyeOff,
        title: "Careful handling of sensitive information",
        text: "The agent is configured not to reveal sensitive account information without authorization, and to route sensitive requests to your team instead.",
    },
];

export default function TrustSecurity() {
    return (
        <section id="security" className="scroll-mt-24 py-20 sm:py-28" aria-labelledby="security-heading">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
                <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-20">
                    <Reveal>
                        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">
                            Trust &amp; Security
                        </span>
                        <h2
                            id="security-heading"
                            className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.6rem] lg:leading-[1.15]"
                        >
                            Your Business Data Deserves Thoughtful Protection.
                        </h2>
                        <p className="mt-5 text-base leading-relaxed text-slate-600 sm:text-lg">
                            Connecting an AI agent to your panel means trusting it with your customers and your
                            workflows. YourSMMagent is designed around clear principles: authorized connections,
                            defined permissions, and human oversight — so support automation never becomes a
                            black box.
                        </p>
                        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-500">
                            These points describe the platform&apos;s security design principles. They are not a
                            substitute for independent security certification or audit.
                        </p>
                    </Reveal>

                    <div className="space-y-4">
                        {PRINCIPLES.map(({ icon: Icon, title, text }, i) => (
                            <Reveal
                                key={title}
                                delay={i * 0.07}
                                className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
                            >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                                    <Icon className="h-5 w-5" />
                                </span>
                                <div>
                                    <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{text}</p>
                                </div>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
