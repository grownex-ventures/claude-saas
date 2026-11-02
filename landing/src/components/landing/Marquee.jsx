import { Asterisk } from "lucide-react";

const ITEMS = [
    "Order Status Assistance",
    "Telegram Support Bot",
    "Website Chat Widget",
    "Refill Inquiries",
    "WhatsApp Support",
    "FAQ Automation",
    "Panel API Workflows",
    "Human Escalation",
];

function Track({ hidden = false }) {
    return (
        <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
            {ITEMS.map((item) => (
                <li key={item} className="flex items-center">
                    <span className="whitespace-nowrap px-6 text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">
                        {item}
                    </span>
                    <Asterisk className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" />
                </li>
            ))}
        </ul>
    );
}

export default function Marquee() {
    return (
        <div
            className="overflow-hidden border-y border-slate-200/80 bg-slate-50 py-4"
            data-testid="editorial-marquee"
        >
            <div className="marquee-track flex w-max">
                <Track />
                <Track hidden />
            </div>
        </div>
    );
}
