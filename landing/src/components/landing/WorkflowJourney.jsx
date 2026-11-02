import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Bot, Check, Database, MessagesSquare } from "lucide-react";

const NODES = {
    api: {
        icon: Database,
        title: "SMM Panel API",
        sub: "Connected with your own authorized credentials",
        featured: false,
        testid: "workflow-node-api",
    },
    agent: {
        icon: Bot,
        title: "YourSMMagent",
        sub: "Configured knowledge, instructions & guardrails",
        featured: true,
        testid: "workflow-node-agent",
    },
    channels: {
        icon: MessagesSquare,
        title: "Customer Support Channels",
        sub: "Website chat · Telegram · WhatsApp",
        featured: false,
        testid: "workflow-node-channels",
    },
};

const STAGES = [
    {
        node: "channels",
        dot: { segment: "B", dir: "r2l" },
        title: "Customer asks a question",
        detail: "\u201cCan you check my order status?\u201d — from the website widget, Telegram, or WhatsApp",
    },
    {
        node: "agent",
        dot: null,
        title: "Agent understands the request",
        detail: "Intent is interpreted using your configured knowledge and instructions",
    },
    {
        node: "api",
        dot: { segment: "A", dir: "r2l" },
        title: "Authorized API call",
        detail: "Order status lookup through the supported, authorized panel API connection",
    },
    {
        node: "agent",
        dot: { segment: "A", dir: "l2r" },
        title: "Panel API responds",
        detail: "Order data returns to the agent through the same secure connection",
    },
    {
        node: "channels",
        dot: { segment: "B", dir: "l2r" },
        title: "Customer gets the answer",
        detail: "The agent replies on the channel where the conversation started",
    },
];

const SEGMENT_LABELS = { A: "Authorized connection", B: "Assisted conversations" };

function JourneyNode({ nodeKey, active }) {
    const { icon: Icon, title, sub, featured, testid } = NODES[nodeKey];
    return (
        <div
            data-testid={testid}
            className={`w-full max-w-xs rounded-2xl p-5 text-center transition-all duration-500 sm:p-6 ${
                featured
                    ? "bg-gradient-to-br from-indigo-600 to-blue-500 shadow-[0_20px_50px_-16px_rgba(79,70,229,0.55)]"
                    : active
                        ? "bg-white shadow-[0_0_34px_-6px_rgba(79,70,229,0.4)] ring-2 ring-indigo-400"
                        : "border border-slate-200 bg-white shadow-sm"
            } ${active ? "scale-[1.03]" : "scale-100"}`}
        >
            <span
                className={`mx-auto flex h-12 w-12 items-center justify-center rounded-2xl transition-colors duration-500 ${
                    featured ? "bg-white/15 text-white" : active ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-600"
                }`}
            >
                <Icon className="h-6 w-6" />
            </span>
            <p className={`mt-3 text-base font-bold ${featured ? "text-white" : "text-slate-900"}`}>{title}</p>
            <p className={`mt-1 text-xs leading-relaxed ${featured ? "text-indigo-100" : "text-slate-500"}`}>{sub}</p>
        </div>
    );
}

function Connector({ segment, dot }) {
    const label = SEGMENT_LABELS[segment];
    return (
        <>
            <div className="relative flex flex-col items-center py-1 md:hidden" aria-hidden="true">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
                <svg width="24" height="40" viewBox="0 0 24 40" className="text-indigo-300">
                    <line x1="12" y1="0" x2="12" y2="32" stroke="currentColor" strokeWidth="2" className="flow-dash" />
                    <path
                        d="M6 30 L12 38 L18 30"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
                {dot && (
                    <span
                        key={dot.dir}
                        className={`journey-dot-v journey-dot-v-${dot.dir === "l2r" ? "down" : "up"}`}
                    />
                )}
            </div>
            <div className="relative hidden flex-col items-center md:flex" aria-hidden="true">
                {dot && (
                    <span
                        key={dot.dir}
                        className={`journey-dot journey-dot-${dot.dir === "l2r" ? "right" : "left"}`}
                    />
                )}
                <svg width="88" height="24" viewBox="0 0 88 24" className="text-indigo-300">
                    <line x1="0" y1="12" x2="74" y2="12" stroke="currentColor" strokeWidth="2" className="flow-dash" />
                    <path
                        d="M72 6 L82 12 L72 18"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
                <span className="mt-1 max-w-[92px] text-center text-[10px] font-semibold uppercase leading-tight tracking-[0.12em] text-slate-400">
                    {label}
                </span>
            </div>
        </>
    );
}

export default function WorkflowJourney() {
    const reduce = useReducedMotion();
    const [stage, setStage] = useState(0);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (reduce) return undefined;
        const id = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 2600);
        return () => clearInterval(id);
    }, [reduce, tick]);

    const current = STAGES[stage];
    const dotFor = (segment) =>
        !reduce && current && current.dot && current.dot.segment === segment ? current.dot : null;

    const selectStage = (i) => {
        setStage(i);
        setTick((t) => t + 1);
    };

    return (
        <div data-testid="workflow-journey">
            <div className="flex flex-col items-center justify-center md:flex-row">
                <JourneyNode nodeKey="api" active={current.node === "api"} />
                <Connector segment="A" dot={dotFor("A")} />
                <JourneyNode nodeKey="agent" active={current.node === "agent"} />
                <Connector segment="B" dot={dotFor("B")} />
                <JourneyNode nodeKey="channels" active={current.node === "channels"} />
            </div>

            <div className="mt-8 border-t border-slate-100 pt-6" data-testid="workflow-journey-log">
                <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Follow one request end-to-end
                    </p>
                    {reduce && (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-500">
                            Auto-play paused · reduced motion
                        </span>
                    )}
                </div>
                <div className="mt-3 grid gap-1.5 lg:grid-cols-1">
                    {STAGES.map((s, i) => {
                        const active = stage === i;
                        const done = !reduce && i < stage;
                        return (
                            <button
                                key={s.title}
                                type="button"
                                onClick={() => selectStage(i)}
                                aria-current={active ? "step" : undefined}
                                data-testid={`workflow-stage-${i}`}
                                className={`flex items-start gap-3.5 rounded-xl px-4 py-3 text-left transition-colors duration-300 ${
                                    active ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-slate-50"
                                }`}
                            >
                                <span
                                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                                        done
                                            ? "bg-emerald-500 text-white"
                                            : active
                                                ? "bg-indigo-600 text-white"
                                                : "bg-slate-100 text-slate-500"
                                    }`}
                                >
                                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                                </span>
                                <span className="min-w-0">
                                    <span
                                        className={`block text-sm font-semibold ${active ? "text-indigo-900" : "text-slate-800"}`}
                                    >
                                        {s.title}
                                    </span>
                                    <span className="block text-xs leading-relaxed text-slate-500">{s.detail}</span>
                                </span>
                                {active && (
                                    <span
                                        className="ml-auto mt-1.5 inline-flex h-2 w-2 shrink-0 animate-pulse rounded-full bg-indigo-500"
                                        aria-hidden="true"
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <p className="mt-5 text-center text-xs text-slate-400">
                Illustrative request journey — prewritten demonstration, not a live connection.
            </p>
        </div>
    );
}
