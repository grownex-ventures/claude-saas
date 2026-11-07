import { motion } from "framer-motion";
import { Check, Globe, Lock, MessageCircle, Plug, Send, Sparkles, UserPlus, Zap } from "lucide-react";
import { Logo } from "@/components/landing/Logo";
import { LANDING_URL } from "@/lib/site";

const fadeUp = {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
};

/** Split auth layout: rich brand panel + form column. */
export default function AuthLayout({ panel, children, testId }) {
    return (
        <div className="grid min-h-screen bg-white lg:grid-cols-[1.08fr_1fr]" data-testid={testId}>
            <aside className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-950 text-white lg:flex">
                <div className="auth-panel-grid pointer-events-none absolute inset-0" />
                <div className="pointer-events-none absolute -left-24 top-10 h-80 w-80 rounded-full bg-indigo-500/30 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-24 right-0 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
                <div className="relative flex w-full flex-col justify-between p-10 xl:p-14">
                    <Logo href={LANDING_URL} tone="light" testId="auth-panel-logo-link" />
                    {panel === "signup" ? <SignupPanel /> : <LoginPanel />}
                    <p className="flex items-center gap-2 text-xs text-indigo-200/80" data-testid="auth-panel-security-note">
                        <Lock className="h-3.5 w-3.5" />
                        Passwords are hashed with Argon2id · Encrypted in transit
                    </p>
                </div>
            </aside>

            <main className="relative flex flex-col bg-white">
                <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
                <div className="relative flex items-center justify-between px-6 py-5 sm:px-10">
                    <Logo href={LANDING_URL} className="lg:invisible" testId="auth-form-logo-link" />
                </div>
                <motion.div
                    {...fadeUp}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center px-6 pb-12 sm:px-0"
                >
                    {children}
                </motion.div>
            </main>
        </div>
    );
}

function Eyebrow({ children }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-200">
            <Sparkles className="h-3.5 w-3.5" />
            {children}
        </span>
    );
}

function LoginPanel() {
    return (
        <div className="my-10 max-w-lg" data-testid="login-side-panel">
            <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
                <Eyebrow>AI support for SMM panels</Eyebrow>
                <h2 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight xl:text-[44px]">
                    Pick up right where your{" "}
                    <span className="bg-gradient-to-r from-indigo-300 to-sky-300 bg-clip-text text-transparent">AI agent</span>{" "}
                    left off.
                </h2>
                <p className="mt-4 text-base leading-relaxed text-indigo-100/80">
                    Order status checks, refill requests and support tickets — answered across your website, Telegram and
                    WhatsApp while you focus on growing your panel.
                </p>
            </motion.div>

            <motion.div
                {...fadeUp}
                transition={{ duration: 0.5, delay: 0.15 }}
                className="relative mt-9 rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)] backdrop-blur-md"
            >
                <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/20 text-sky-300">
                            <Send className="h-4 w-4" />
                        </span>
                        <div>
                            <p className="text-sm font-semibold">Telegram support bot</p>
                            <p className="text-xs text-indigo-200/70">@yourpanel_bot</p>
                        </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                        Agent online
                    </span>
                </div>
                <div className="space-y-3 pt-4 text-sm">
                    <div className="max-w-[80%] rounded-2xl rounded-tl-md bg-white/10 px-3.5 py-2.5 text-indigo-50">
                        Hi! Has order #10247 started yet?
                    </div>
                    <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-indigo-500 px-3.5 py-2.5 text-white">
                        Yes — order #10247 is <b>In progress</b>: 3,200 of 5,000 delivered. I'll message you as soon as it
                        completes.
                    </div>
                    <p className="flex items-center justify-end gap-1.5 text-[11px] text-indigo-200/70">
                        <Check className="h-3.5 w-3.5 text-emerald-300" /> Checked via your Panel API
                    </p>
                </div>
                <div className="auth-float absolute -right-5 -top-5 hidden items-center gap-2 rounded-xl border border-white/15 bg-indigo-950/80 px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur xl:flex">
                    <Zap className="h-3.5 w-3.5 text-amber-300" /> Refill request queued
                </div>
            </motion.div>

            <motion.ul
                {...fadeUp}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="mt-7 flex flex-wrap gap-2.5"
                data-testid="login-side-panel-channels"
            >
                {[
                    { icon: Globe, label: "Website chat" },
                    { icon: Send, label: "Telegram" },
                    { icon: MessageCircle, label: "WhatsApp" },
                    { icon: Plug, label: "Panel API" },
                ].map(({ icon: Icon, label }) => (
                    <li
                        key={label}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-xs font-medium text-indigo-100"
                    >
                        <Icon className="h-3.5 w-3.5 text-indigo-300" />
                        {label}
                    </li>
                ))}
            </motion.ul>
        </div>
    );
}

const STEPS = [
    {
        icon: UserPlus,
        title: "Create your account",
        body: "Tell us where your panel lives and how to reach you. Takes under a minute.",
    },
    {
        icon: Plug,
        title: "Connect your SMM panel",
        body: "Link your panel API so the agent can check orders, refills and balances in real time.",
    },
    {
        icon: MessageCircle,
        title: "Switch on your channels",
        body: "Website chat, Telegram and WhatsApp — one AI agent answering every inbox.",
    },
];

function SignupPanel() {
    return (
        <div className="my-10 max-w-lg" data-testid="signup-side-panel">
            <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
                <Eyebrow>Get started</Eyebrow>
                <h2 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight xl:text-[44px]">
                    Launch your AI support agent in{" "}
                    <span className="bg-gradient-to-r from-indigo-300 to-sky-300 bg-clip-text text-transparent">
                        three steps.
                    </span>
                </h2>
                <p className="mt-4 text-base leading-relaxed text-indigo-100/80">
                    Built for SMM panel owners who want faster replies, fewer repetitive tickets and happier customers.
                </p>
            </motion.div>

            <ol className="relative mt-10 space-y-7">
                <span className="absolute bottom-6 left-[19px] top-6 w-px bg-gradient-to-b from-indigo-400/60 via-indigo-400/20 to-transparent" />
                {STEPS.map(({ icon: Icon, title, body }, i) => (
                    <motion.li
                        key={title}
                        {...fadeUp}
                        transition={{ duration: 0.45, delay: 0.15 + i * 0.12 }}
                        className="relative flex gap-4"
                        data-testid={`signup-step-${i + 1}`}
                    >
                        <span
                            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                                i === 0
                                    ? "border-indigo-300/50 bg-indigo-500 text-white shadow-[0_0_0_6px_rgba(99,102,241,0.18)]"
                                    : "border-white/15 bg-indigo-950/60 text-indigo-200"
                            }`}
                        >
                            <Icon className="h-[18px] w-[18px]" />
                        </span>
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-300">
                                Step {i + 1}
                            </p>
                            <p className="mt-0.5 text-base font-semibold">{title}</p>
                            <p className="mt-1 text-sm leading-relaxed text-indigo-100/70">{body}</p>
                        </div>
                    </motion.li>
                ))}
            </ol>
        </div>
    );
}
