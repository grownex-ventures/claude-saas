import {
    Check,
    Database,
    HelpCircle,
    Lock,
    RefreshCcw,
    ShieldCheck,
    ShoppingBag,
    UserCircle,
    X,
} from "lucide-react";
import Reveal from "./Reveal";
import WorkflowJourney from "./WorkflowJourney";

const USE_CASES = [
    {
        icon: ShoppingBag,
        title: "Order Status Assistance",
        text: "When your connected panel API supports authenticated lookups, the agent can assist with order status inquiries — retrieving the latest updates for a customer's order through the authorized connection.",
    },
    {
        icon: Database,
        title: "Service Information",
        text: "The AI can explain service details supplied by your connected data or configured knowledge — descriptions, quantities, delivery expectations, and requirements, in language your customers understand.",
    },
    {
        icon: RefreshCcw,
        title: "Refill Inquiries",
        text: "Where a supported integration allows it, the agent can assist with refill eligibility and related support questions, based on the service's refill policy and your configured instructions.",
    },
    {
        icon: HelpCircle,
        title: "Cancellation Questions",
        text: "The agent provides guidance on cancellation eligibility based on your applicable service policies and the capabilities your panel's API supports — no improvised promises.",
    },
    {
        icon: UserCircle,
        title: "Account Questions",
        text: "Authorized support workflows may assist with relevant account information, always subject to the access permissions you define — sensitive details stay protected.",
    },
];

const GENERIC = [
    "Only answers pre-written questions it was scripted with",
    "Knows nothing about your panel, services, or policies",
    "Cannot assist with order-related workflows",
    "Customers fall through the cracks the moment a question gets specific",
];

const CONNECTED = [
    "Works with authorized SMM panel data through supported API integrations",
    "Answers grounded in your configured knowledge and instructions",
    "Supports panel workflows like order status lookups where the API allows",
    "Escalates to human support when a question needs a person",
];

export default function Integration() {
    return (
        <section id="integrations" className="scroll-mt-24 bg-slate-50/70 py-20 sm:py-28" aria-labelledby="integrations-heading">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
                <Reveal className="mx-auto max-w-3xl text-center">
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600 shadow-sm">
                        SMM Panel API Integration
                    </span>
                    <h2
                        id="integrations-heading"
                        className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.6rem] lg:leading-[1.15]"
                    >
                        More Than a Chatbot. Support Designed Around Your Panel.
                    </h2>
                    <p className="mt-5 text-base leading-relaxed text-slate-600 sm:text-lg">
                        Most chatbots answer a fixed list of questions and stop there. An AI support agent
                        connected to your panel works differently — it can use authorized panel data through
                        supported API integrations, so its answers reflect what is actually happening in your
                        business.
                    </p>
                </Reveal>

                {/* Comparison */}
                <div className="mt-14 grid gap-5 lg:grid-cols-2">
                    <Reveal className="h-full rounded-2xl border border-slate-200 bg-white p-7 sm:p-8">
                        <h3 className="text-lg font-semibold text-slate-900">A generic chatbot</h3>
                        <ul className="mt-5 space-y-3.5">
                            {GENERIC.map((item) => (
                                <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-slate-600 sm:text-base">
                                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                        <X className="h-3 w-3" />
                                    </span>
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </Reveal>
                    <Reveal delay={0.1} className="h-full rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-blue-50/60 p-7 shadow-[0_20px_50px_-24px_rgba(79,70,229,0.35)] sm:p-8">
                        <h3 className="text-lg font-semibold text-slate-900">An API-connected AI support agent</h3>
                        <ul className="mt-5 space-y-3.5">
                            {CONNECTED.map((item) => (
                                <li key={item} className="flex items-start gap-3 text-sm leading-relaxed text-slate-700 sm:text-base">
                                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
                                        <Check className="h-3 w-3" />
                                    </span>
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </Reveal>
                </div>

                {/* Use cases */}
                <Reveal className="mt-16">
                    <h3 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                        Illustrative use cases for a connected panel
                    </h3>
                    <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        {USE_CASES.map(({ icon: Icon, title, text }, i) => (
                            <div
                                key={title}
                                className={`flex flex-col gap-2 p-6 sm:flex-row sm:items-center sm:gap-5 ${
                                    i !== USE_CASES.length - 1 ? "border-b border-slate-100" : ""
                                }`}
                            >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                                    <Icon className="h-5 w-5" />
                                </span>
                                <div className="sm:max-w-[240px]">
                                    <p className="text-sm font-bold text-slate-900 sm:text-base">{title}</p>
                                </div>
                                <p className="text-sm leading-relaxed text-slate-600">{text}</p>
                            </div>
                        ))}
                    </div>
                </Reveal>

                {/* Workflow diagram */}
                <Reveal delay={0.08} className="mt-16">
                    <div
                        className="rounded-3xl border border-slate-200 bg-white p-7 sm:p-10"
                        data-testid="integration-workflow-diagram"
                    >
                        <h3 className="text-center text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                            How a connected support workflow comes together
                        </h3>
                        <WorkflowJourney />
                        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-medium text-emerald-700">
                                <Lock className="h-3.5 w-3.5" />
                                API credentials stored securely — never exposed in conversations
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-xs font-medium text-slate-500">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Works with supported panel APIs — available actions depend on your panel&apos;s API
                            </span>
                        </div>
                    </div>
                </Reveal>
            </div>
        </section>
    );
}
