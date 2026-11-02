import { CheckCircle2, Globe, Phone, Send } from "lucide-react";
import Reveal from "./Reveal";
import { WebsitePreview, TelegramPreview, WhatsAppPreview } from "./ChannelPreviews";

const BLOCKS = [
    {
        id: "website-chat",
        icon: Globe,
        chip: "Website AI Chatbot",
        title: "AI Chat Support for Your SMM Panel Website",
        text: "Add an embedded customer support widget to your panel website and let an AI assistant handle the questions that come with every order. It answers common inquiries using your business-specific information, helps customers understand services before they buy, and plugs into the support workflows you configure in YourSMMagent.",
        points: [
            "Embedded customer support widget for your website",
            "Answers common questions with your business information",
            "Assists customers as they browse services and place orders",
            "Connects to your configured support workflows",
        ],
        Preview: WebsitePreview,
    },
    {
        id: "telegram",
        icon: Send,
        chip: "Telegram AI Support Bot",
        title: "Telegram AI Chatbot for SMM Panel Support",
        text: "Meet customers where they already are. A Telegram support bot handles repetitive FAQ questions, order-related inquiries, and general support requests — following the instructions you configure, with the option to escalate complex cases to your human team.",
        points: [
            "Support through a dedicated Telegram bot",
            "Handles repetitive FAQs and order-related inquiries",
            "Convenient, familiar channel for your customers",
            "Configurable support instructions and escalation",
        ],
        Preview: TelegramPreview,
    },
    {
        id: "whatsapp",
        icon: Phone,
        chip: "WhatsApp AI Customer Support",
        title: "WhatsApp AI Support for SMM Panel Businesses",
        text: "Offer assistance through one of the most familiar messaging channels in the world. Through supported WhatsApp Business integrations, the AI agent answers common inquiries and follows your configured support flows — with channel-specific requirements and permissions set up as part of the integration.",
        points: [
            "Customer assistance through supported WhatsApp Business integrations",
            "A familiar, convenient communication channel",
            "Answers common inquiries with configured flows",
            "Channel-specific requirements and permissions handled in setup",
        ],
        Preview: WhatsAppPreview,
    },
];

function ChannelBlock({ block, index }) {
    const { icon: Icon, chip, title, text, points, Preview } = block;
    const flip = index % 2 === 1;
    return (
        <article className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal className={flip ? "lg:order-2" : ""}>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600 shadow-sm">
                    <Icon className="h-3.5 w-3.5" />
                    {chip}
                </span>
                <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h3>
                <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">{text}</p>
                <ul className="mt-6 space-y-2.5">
                    {points.map((point) => (
                        <li key={point} className="flex items-start gap-2.5 text-sm font-medium text-slate-700 sm:text-base">
                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
                            {point}
                        </li>
                    ))}
                </ul>
            </Reveal>
            <Reveal delay={0.12} className={flip ? "lg:order-1" : ""}>
                <div className="mx-auto w-full max-w-md">
                    <Preview />
                </div>
            </Reveal>
        </article>
    );
}

export default function Channels() {
    return (
        <section id="channels" className="scroll-mt-24 py-20 sm:py-28" aria-labelledby="channels-heading">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
                <Reveal className="mx-auto max-w-3xl text-center">
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">
                        Multi-Channel Support
                    </span>
                    <h2
                        id="channels-heading"
                        className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.6rem] lg:leading-[1.15]"
                    >
                        One AI Agent. Support Across the Channels Your Customers Use.
                    </h2>
                    <p className="mt-5 text-base leading-relaxed text-slate-600 sm:text-lg">
                        Your customers already have a favorite way to reach you. YourSMMagent brings the same
                        configured AI support to all of them — so answers stay consistent no matter where a
                        conversation starts.
                    </p>
                </Reveal>

                <div className="mt-16 space-y-20 sm:space-y-24">
                    {BLOCKS.map((block, i) => (
                        <ChannelBlock key={block.id} block={block} index={i} />
                    ))}
                </div>
            </div>
        </section>
    );
}
