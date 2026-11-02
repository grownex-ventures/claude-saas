import { ClipboardList, Inbox, MessagesSquare, Repeat2 } from "lucide-react";
import Reveal from "./Reveal";

const PAINS = [
    {
        icon: Repeat2,
        title: "Repetitive Customer Questions",
        text: "Order status. Refill eligibility. Service requirements. The same handful of questions arrive every day, and each one interrupts something more important — processing orders, updating services, or growing the panel.",
    },
    {
        icon: MessagesSquare,
        title: "Support Across Multiple Channels",
        text: "Customers message through your website, Telegram, and WhatsApp. Without a unified setup, conversations get scattered, context is lost, and answer quality depends on who happens to be online.",
    },
    {
        icon: ClipboardList,
        title: "Manual Order Status Inquiries",
        text: "Every \u201cwhere is my order?\u201d message means opening the panel dashboard, locating the order, and typing out an update. Multiply that across a day of orders and support quietly becomes the biggest task on the list.",
    },
    {
        icon: Inbox,
        title: "Growing Customer Support Workload",
        text: "As a panel grows, inquiries grow with it. Hiring more staff to answer predictable, repeatable questions rarely feels like a good use of time or budget — but leaving customers waiting is not an option either.",
    },
];

export default function PainPoints() {
    return (
        <section className="py-20 sm:py-28" aria-labelledby="support-challenge-heading">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
                <Reveal className="max-w-3xl">
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">
                        The Support Challenge
                    </span>
                    <h2
                        id="support-challenge-heading"
                        className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.6rem] lg:leading-[1.15]"
                    >
                        Running an SMM panel shouldn&apos;t mean answering the same questions all day.
                    </h2>
                    <p className="mt-5 text-base leading-relaxed text-slate-600 sm:text-lg">
                        Managing an SMM panel involves far more than processing orders. Customers ask about
                        order status, delays, refill requests, service availability, service requirements, and
                        account-related issues — and those requests arrive from every direction at once. When
                        support lives in scattered inboxes and depends on manual lookups, the operational
                        friction compounds: slower answers, inconsistent information, and a team that spends its
                        day on copy-paste replies instead of the business itself.
                    </p>
                </Reveal>

                <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {PAINS.map(({ icon: Icon, title, text }, i) => (
                        <Reveal
                            key={title}
                            delay={i * 0.08}
                            className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-[0_16px_40px_-16px_rgba(79,70,229,0.18)]"
                        >
                            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                                <Icon className="h-5 w-5" />
                            </span>
                            <h3 className="mt-5 text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
                            <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{text}</p>
                        </Reveal>
                    ))}
                </div>

                <Reveal delay={0.1} className="mt-10 max-w-3xl">
                    <p className="text-base leading-relaxed text-slate-600 sm:text-lg">
                        YourSMMagent was built for exactly this problem — a support layer designed around how
                        SMM panel businesses actually work, not a generic chatbot retrofitted to your industry.
                    </p>
                </Reveal>
            </div>
        </section>
    );
}
