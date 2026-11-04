import { LOGIN_URL, SIGNUP_URL, NAV_LINKS } from "@/lib/site";
import { Logo } from "./Logo";

const APP_LINKS = [
    { label: "Get Started", href: SIGNUP_URL },
    { label: "Log In", href: LOGIN_URL },
];

export default function Footer() {
    const year = new Date().getFullYear();
    return (
        <footer className="border-t border-slate-200 bg-slate-50" data-testid="site-footer">
            <div className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 sm:py-16">
                <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
                    <div className="lg:col-span-2 lg:max-w-sm">
                        <Logo />
                        <p className="mt-4 text-sm leading-relaxed text-slate-600">
                            AI-powered customer support for SMM panel businesses. Configure an AI support agent
                            for your website, Telegram, and WhatsApp — with supported, API-connected panel
                            workflows.
                        </p>
                        <p className="mt-4 text-sm font-medium text-slate-400">yoursmmagent.com</p>
                    </div>

                    <nav aria-label="Footer navigation">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-700">
                            Navigation
                        </p>
                        <ul className="mt-4 space-y-2.5">
                            {NAV_LINKS.map((link) => (
                                <li key={link.href}>
                                    <a
                                        href={link.href}
                                        data-testid={`footer-nav-link-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
                                        className="text-sm font-medium text-slate-600 transition-colors hover:text-indigo-600"
                                    >
                                        {link.label}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </nav>

                    <nav aria-label="Application links">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-700">
                            Application
                        </p>
                        <ul className="mt-4 space-y-2.5">
                            {APP_LINKS.map((link) => (
                                <li key={link.label}>
                                    <a
                                        href={link.href}
                                        target="_self"
                                        data-testid={`footer-app-link-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
                                        className="text-sm font-medium text-slate-600 transition-colors hover:text-indigo-600"
                                    >
                                        {link.label}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </div>

                <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-7 sm:flex-row">
                    <p className="text-sm text-slate-600">© {year} YourSMMagent. All rights reserved.</p>
                    <p className="text-sm text-slate-500">AI customer support for SMM panel businesses</p>
                </div>
            </div>
        </footer>
    );
}
