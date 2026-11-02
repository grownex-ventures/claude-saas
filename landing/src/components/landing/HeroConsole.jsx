import { useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
    Bot,
    CheckCircle2,
    Globe,
    KeyRound,
    Lock,
    Phone,
    Search,
    Send,
    UserCheck,
} from "lucide-react";

const CHANNELS = [
    { icon: Globe, name: "Website", detail: "Chat widget" },
    { icon: Send, name: "Telegram", detail: "Support bot" },
    { icon: Phone, name: "WhatsApp", detail: "Business API" },
];

const AI_AVATAR = (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-blue-500 text-white">
        <Bot className="h-4 w-4" />
    </span>
);

function CustomerMsg({ children, time }) {
    return (
        <div className="flex items-end gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                M
            </span>
            <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm">
                {children}
                <span className="mt-1 block text-right text-xs text-slate-500">{time}</span>
            </div>
        </div>
    );
}

function AiMsg({ children, time }) {
    return (
        <div className="flex items-end justify-end gap-2">
            <div className="max-w-[88%] rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-sm text-indigo-50 shadow-[0_8px_20px_-8px_rgba(79,70,229,0.5)]">
                {children}
                <span className="mt-1 block text-right text-[10px] text-indigo-200">{time}</span>
            </div>
            {AI_AVATAR}
        </div>
    );
}

export default function HeroConsole() {
    const ref = useRef(null);
    const reduce = useReducedMotion();
    const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
    const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
    const y = useTransform(scrollYProgress, [0, 1], [40, -40]);

    const onPointerMove = (e) => {
        if (reduce || !window.matchMedia("(pointer: fine)").matches) return;
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        setTilt({ rx: -py * 4, ry: px * 5 });
    };

    return (
        <motion.div ref={ref} style={{ y }} className="relative" data-testid="hero-product-console">
            <motion.div
                onPointerMove={onPointerMove}
                onPointerLeave={() => setTilt({ rx: 0, ry: 0 })}
                animate={{ rotateX: tilt.rx, rotateY: tilt.ry }}
                transition={{ type: "spring", stiffness: 120, damping: 18 }}
                style={{ transformPerspective: 1200 }}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_32px_90px_-28px_rgba(15,23,42,0.28)]"
            >
                {/* Window chrome */}
                <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/90 px-4 py-3">
                    <div className="flex gap-1.5" aria-hidden="true">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                    </div>
                    <span className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1 text-xs text-slate-500">
                        <Lock className="h-3 w-3 text-emerald-500" />
                        yourpanel.example.com — AI Support Widget
                    </span>
                    <span className="hidden w-10 sm:block" aria-hidden="true" />
                </div>

                <div className="grid md:grid-cols-[210px_1fr]">
                    {/* Channel rail */}
                    <aside className="hidden border-r border-slate-100 bg-slate-50/60 p-4 md:block">
                        <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                            Channels
                        </p>
                        <ul className="mt-3 space-y-1.5">
                            {CHANNELS.map(({ icon: Icon, name, detail }) => (
                                <li
                                    key={name}
                                    className="flex items-center gap-2.5 rounded-xl border border-transparent bg-white px-3 py-2.5 shadow-sm"
                                >
                                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    <span>
                                        <span className="block text-sm font-semibold text-slate-800">{name}</span>
                                        <span className="block text-xs text-slate-500">{detail}</span>
                                    </span>
                                    <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-500" />
                                </li>
                            ))}
                        </ul>
                        <div className="mt-4 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-blue-50 p-3.5">
                            <div className="flex items-center gap-2">
                                {AI_AVATAR}
                                <span>
                                    <span className="block text-sm font-semibold text-slate-800">AI Support Agent</span>
                                    <span className="flex items-center gap-1 text-xs text-emerald-600">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                        Active
                                    </span>
                                </span>
                            </div>
                            <p className="mt-2.5 text-xs leading-relaxed text-slate-500">
                                Answering FAQs, order questions and service inquiries — escalating when needed.
                            </p>
                        </div>
                    </aside>

                    {/* Conversation */}
                    <div className="flex flex-col">
                        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                                <Search className="h-4 w-4" />
                            </span>
                            <div>
                                <p className="text-sm font-semibold text-slate-800">Live support conversation</p>
                                <p className="text-xs text-slate-500">Website widget · Order assistance</p>
                            </div>
                            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Agent online
                            </span>
                        </div>

                        <div className="flex flex-1 flex-col gap-4 px-5 py-5" data-testid="hero-conversation-thread">
                            <CustomerMsg time="10:42">
                                Hi! I placed an order 2 hours ago — order #10247. Can you check its status?
                            </CustomerMsg>

                            <AiMsg time="10:42">
                                <p>Hi Maya! Of course — here is the latest update for your order:</p>
                                <div className="mt-2.5 rounded-xl border border-indigo-400/30 bg-white/10 p-3 text-indigo-50">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold text-white">Order #10247</span>
                                        <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                                            In Progress
                                        </span>
                                    </div>
                                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
                                        <div className="h-full w-[62%] rounded-full bg-gradient-to-r from-indigo-300 to-blue-300" />
                                    </div>
                                    <p className="mt-2 text-[11px] leading-relaxed text-indigo-100">
                                        640 of 1,000 delivered · Started 10:02 · Following the service&apos;s normal
                                        delivery time
                                    </p>
                                </div>
                                <p className="mt-2">Anything else I can help you with?</p>
                            </AiMsg>

                            <CustomerMsg time="10:44">
                                Perfect. And would a refill be possible later if needed?
                            </CustomerMsg>

                            <AiMsg time="10:44">
                                If your order becomes eligible under its refill policy, I can walk you through the
                                request — or hand you over to the team for anything more complex.
                            </AiMsg>

                            <div className="flex items-center gap-2 pl-9">
                                <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm">
                                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
                                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
                                    <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
                                </div>
                                <span className="text-xs font-medium text-slate-500">AI agent is typing…</span>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-xs text-slate-600">
                            <span className="inline-flex items-center gap-1.5">
                                <KeyRound className="h-3.5 w-3.5 text-indigo-500" />
                                Status via authorized panel API connection
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <UserCheck className="h-3.5 w-3.5 text-indigo-500" />
                                Human escalation available
                            </span>
                            <span className="ml-auto rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-medium text-slate-500">
                                Product preview · Illustrative data
                            </span>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Mobile channel chips */}
            <div className="mt-4 flex justify-center gap-2 md:hidden">
                {CHANNELS.map(({ icon: Icon, name }) => (
                    <span
                        key={name}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm"
                    >
                        <Icon className="h-3.5 w-3.5 text-indigo-500" />
                        {name}
                    </span>
                ))}
            </div>
        </motion.div>
    );
}
