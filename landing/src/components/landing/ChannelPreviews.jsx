import { Bot, Globe, Lock, MessageCircle, Send, Wifi } from "lucide-react";

export const WebsitePreview = () => (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.22)]">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
            <span className="flex gap-1.5" aria-hidden="true">
                <span className="h-2 w-2 rounded-full bg-rose-300" />
                <span className="h-2 w-2 rounded-full bg-amber-300" />
                <span className="h-2 w-2 rounded-full bg-emerald-300" />
            </span>
            <span className="mx-auto rounded-full bg-white px-3 py-0.5 text-[11px] text-slate-400 ring-1 ring-slate-200">
                yourpanel.example.com
            </span>
        </div>
        <div className="p-5">
            <div className="space-y-2 rounded-xl bg-slate-50 p-4" aria-hidden="true">
                <div className="h-2.5 w-1/3 rounded bg-slate-200" />
                <div className="h-2 w-2/3 rounded bg-slate-200/70" />
                <div className="flex gap-2 pt-2">
                    <div className="h-6 w-20 rounded-lg bg-slate-200/70" />
                    <div className="h-6 w-20 rounded-lg bg-slate-200/50" />
                </div>
            </div>
            <div className="ml-auto mt-4 w-[86%] rounded-2xl border border-slate-200 bg-white shadow-[0_16px_40px_-16px_rgba(15,23,42,0.2)] sm:w-[80%]">
                <div className="flex items-center gap-2.5 rounded-t-2xl bg-gradient-to-r from-indigo-600 to-blue-500 px-4 py-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-white">
                        <Bot className="h-4 w-4" />
                    </span>
                    <div>
                        <p className="text-xs font-bold text-white">Panel Support · AI Assistant</p>
                        <p className="flex items-center gap-1 text-[10px] text-indigo-100">
                            <span className="h-1 w-1 rounded-full bg-emerald-300" /> Online
                        </p>
                    </div>
                    <Lock className="ml-auto h-3.5 w-3.5 text-indigo-200" />
                </div>
                <div className="space-y-3 px-4 py-4 text-sm">
                    <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-2 text-slate-700">
                        Do you offer drip-feed on the follower services?
                    </p>
                    <p className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-indigo-600 px-3.5 py-2 text-indigo-50">
                        Yes — drip-feed is available on services that show the drip-feed option. You can set the
                        interval when placing the order, and I can explain the details of any service before you
                        order.
                    </p>
                </div>
            </div>
        </div>
    </div>
);

export const TelegramPreview = () => (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[#e7ebf0] shadow-[0_24px_60px_-24px_rgba(15,23,42,0.22)]">
        <div className="flex items-center gap-3 border-b border-black/5 bg-white/90 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#229ED9] text-white">
                <Send className="h-4 w-4" />
            </span>
            <div>
                <p className="text-sm font-bold text-slate-900">
                    YourPanel Support <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">bot</span>
                </p>
                <p className="text-xs text-[#229ED9]">bot · online</p>
            </div>
        </div>
        <div className="space-y-3 p-4">
            <p className="max-w-[80%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-sm text-slate-700 shadow-sm">
                Hi! I can help with order status, refills and common questions. How can I help?
            </p>
            <p className="ml-auto max-w-[75%] rounded-2xl rounded-br-md bg-[#e1fec6] px-3.5 py-2 text-sm text-slate-800 shadow-sm">
                Can you check order #10245 for me?
            </p>
            <p className="max-w-[88%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-sm text-slate-700 shadow-sm">
                Order #10245 is <strong>In Progress</strong> — 640 of 1,000 delivered and following the
                service&apos;s normal delivery time. I can also check refill eligibility once the order qualifies.
            </p>
            <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm text-slate-400 shadow-sm">
                <MessageCircle className="h-4 w-4" />
                Write a message…
                <Wifi className="ml-auto h-4 w-4 rotate-90" />
            </div>
        </div>
    </div>
);

export const WhatsAppPreview = () => (
    <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.22)]">
        <div className="flex items-center gap-3 border-b border-black/5 bg-white px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366] text-white">
                <MessageCircle className="h-4 w-4" />
            </span>
            <div>
                <p className="text-sm font-bold text-slate-900">YourPanel Support</p>
                <p className="text-xs text-slate-400">Business account · online</p>
            </div>
        </div>
        <div className="wa-chat-bg space-y-3 p-4">
            <p className="max-w-[82%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-sm text-slate-700 shadow-sm">
                Hello! I need help choosing the right service for YouTube views.
            </p>
            <p className="ml-auto max-w-[86%] rounded-2xl rounded-br-md bg-[#dcf8c6] px-3.5 py-2 text-sm text-slate-800 shadow-sm">
                Happy to help! Could you share your target link and the quantity you have in mind? I&apos;ll list
                the matching services with their details, delivery time and refill terms.
            </p>
            <p className="ml-auto max-w-[70%] rounded-2xl rounded-br-md bg-[#dcf8c6] px-3.5 py-2 text-sm text-slate-800 shadow-sm">
                Then you can pick the one that fits — and I&apos;ll stay here if you have questions.
            </p>
            <p className="text-center text-[10px] text-slate-400">
                Requires a supported WhatsApp Business integration and applicable permissions
            </p>
        </div>
    </div>
);
