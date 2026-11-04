import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { SIGNUP_URL } from "@/lib/site";
import Reveal from "./Reveal";

const FAQS = [
    {
        q: "What is YourSMMagent?",
        a: "YourSMMagent is an AI-powered customer support platform built specifically for SMM panel businesses. It lets you configure a dedicated AI support agent that assists customers through website chat, Telegram, and WhatsApp, using your business knowledge and, where supported, authorized panel API workflows.",
    },
    {
        q: "How does AI customer support work for an SMM panel?",
        a: "You configure the agent with your business information — services, policies, tone, and rules. It then answers common customer questions like order status, service details, and refill eligibility based on that configuration. For panel-related workflows such as order lookups, it uses a supported, authorized API connection. Anything it cannot resolve can be escalated to a human.",
    },
    {
        q: "Is YourSMMagent an SMM panel?",
        a: "No. YourSMMagent is not an SMM panel and does not sell followers, likes, views, or any other engagement services. It is support software for businesses that already operate their own SMM panel or reseller business.",
    },
    {
        q: "Can I integrate YourSMMagent with my existing SMM panel?",
        a: "YourSMMagent is designed to connect to your panel through supported API integrations. You provide your panel's API connection details during setup, and the available assistance — such as order status lookups — depends on what your panel's API supports and the permissions you grant.",
    },
    {
        q: "Can the AI chatbot check customer order statuses?",
        a: "Yes, when your workspace is connected to a supported panel API that allows authenticated order lookups. Order status assistance is one of the core use cases — the agent retrieves the status through the authorized connection and explains it to the customer. Without a connected API, it can still guide customers on how to check their orders.",
    },
    {
        q: "Does YourSMMagent support Telegram?",
        a: "Yes. You can provide support through a Telegram bot that handles repetitive FAQ questions, order-related inquiries, and general support requests — following the instructions you configure, with human escalation available when needed.",
    },
    {
        q: "Can I provide customer support through WhatsApp?",
        a: "Yes. YourSMMagent supports customer assistance through supported WhatsApp Business integrations. Because WhatsApp requires its own business setup and permissions, the channel is connected as part of configuring your support flows.",
    },
    {
        q: "Can I add an AI chat widget to my website?",
        a: "Yes. The website AI chatbot is an embedded support widget for your panel website. It answers common questions using your configured business information and helps customers as they browse services and place orders.",
    },
    {
        q: "Can I configure my AI agent's knowledge and instructions?",
        a: "Yes — that is the heart of the product. From a central configuration, you define what the agent knows (services, policies, answers to common questions), how it should speak, and which topics it should handle or refuse. You can update the configuration any time.",
    },
    {
        q: "Can customers contact a human support representative?",
        a: "Yes. Escalation is configurable: you define when a conversation should be handed to a human — for example complex issues, sensitive requests, or anything outside the agent's scope — so people always have a path to your team.",
    },
    {
        q: "Do I need technical knowledge to configure an AI support agent?",
        a: "Day-to-day configuration is designed to be done without coding: you write instructions and knowledge in plain language. Connecting a panel API or a WhatsApp Business integration involves technical details, and those steps are handled as guided setup.",
    },
    {
        q: "How do I get started with YourSMMagent?",
        a: "Create your account in the YourSMMagent application, configure your AI support agent with your business knowledge, and connect your channels — website chat, Telegram, and WhatsApp — plus your supported panel API. From there, the agent is ready to assist customers.",
    },
];

function FaqItem({ faq, index, open, onToggle }) {
    const panelId = `faq-panel-${index}`;
    return (
        <div
            className={`overflow-hidden rounded-2xl border transition-colors duration-200 ${
                open ? "border-indigo-200 bg-white shadow-[0_12px_32px_-16px_rgba(79,70,229,0.18)]" : "border-slate-200 bg-white"
            }`}
        >
            <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                data-testid={`faq-question-button-${index}`}
                onClick={onToggle}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
            >
                <span className="text-base font-semibold text-slate-900">{faq.q}</span>
                <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                        open ? "rotate-180 bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                >
                    <ChevronDown className="h-4 w-4" />
                </span>
            </button>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        id={panelId}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: "easeInOut" }}
                    >
                        <p className="px-6 pb-6 text-sm leading-relaxed text-slate-600 sm:text-base">{faq.a}</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default function FAQ() {
    const [openIndex, setOpenIndex] = useState(0);
    return (
        <section id="faq" className="scroll-mt-24 bg-slate-50/70 py-20 sm:py-28" aria-labelledby="faq-heading">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
                <Reveal className="mx-auto max-w-3xl text-center">
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600 shadow-sm">
                        FAQ
                    </span>
                    <h2
                        id="faq-heading"
                        className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.6rem] lg:leading-[1.15]"
                    >
                        Frequently Asked Questions About YourSMMagent
                    </h2>
                </Reveal>

                <div className="mx-auto mt-12 max-w-3xl space-y-3.5" data-testid="faq-accordion">
                    {FAQS.map((faq, i) => (
                        <Reveal key={faq.q} delay={Math.min(i * 0.04, 0.3)}>
                            <FaqItem
                                faq={faq}
                                index={i}
                                open={openIndex === i}
                                onToggle={() => setOpenIndex(openIndex === i ? -1 : i)}
                            />
                        </Reveal>
                    ))}
                </div>

                <Reveal delay={0.1} className="mt-10 text-center">
                    <p className="text-sm text-slate-500">
                        Ready to see it on your own panel?{" "}
                        <a
                            href={SIGNUP_URL}
                            target="_self"
                            data-testid="faq-get-started-link"
                            className="font-semibold text-indigo-600 underline decoration-indigo-300 underline-offset-4 transition-colors hover:text-indigo-500"
                        >
                            Get started with YourSMMagent
                        </a>
                    </p>
                </Reveal>
            </div>
        </section>
    );
}
