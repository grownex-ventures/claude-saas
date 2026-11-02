import { ArrowRight } from "lucide-react";
import { APP_URL } from "@/lib/site";

export const PrimaryCTA = ({ children, className = "", testId, href = APP_URL, external = true }) => (
    <a
        href={href}
        {...(external && href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        data-testid={testId}
        className={`group inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(79,70,229,0.55)] transition-all duration-200 hover:bg-indigo-500 hover:shadow-[0_14px_36px_-10px_rgba(79,70,229,0.6)] active:scale-[0.98] sm:text-base ${className}`}
    >
        {children}
    </a>
);

export const SecondaryCTA = ({ children, className = "", testId, href = "#features", onClick }) => (
    <a
        href={href}
        onClick={onClick}
        data-testid={testId}
        className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-all duration-200 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 active:scale-[0.98] sm:text-base"
    >
        {children}
    </a>
);

export const ArrowCta = () => (
    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
);
