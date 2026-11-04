import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Menu, X } from "lucide-react";
import { APP_URL, LOGIN_URL, SIGNUP_URL, NAV_LINKS } from "@/lib/site";
import { Logo } from "./Logo";

export default function Header() {
    const [open, setOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <header
            className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
                scrolled
                    ? "border-b border-slate-200/80 bg-white/85 shadow-[0_1px_12px_rgba(15,23,42,0.04)] backdrop-blur-xl"
                    : "border-b border-transparent bg-white/60 backdrop-blur-sm"
            }`}
        >
            <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-8">
                <Logo />

                <nav aria-label="Main navigation" className="hidden items-center gap-1 lg:flex">
                    {NAV_LINKS.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            data-testid={`nav-link-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
                            className="rounded-full px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-900"
                        >
                            {link.label}
                        </a>
                    ))}
                </nav>

                <div className="hidden items-center gap-3 lg:flex">
                    <a
                        href={LOGIN_URL}
                        target="_self"
                        data-testid="header-login-link"
                        className="rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    >
                        Log In
                    </a>
                    <a
                        href={SIGNUP_URL}
                        target="_self"
                        data-testid="header-get-started-button"
                        className="group inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(79,70,229,0.55)] transition-all duration-200 hover:bg-indigo-500 active:scale-[0.98]"
                    >
                        Get Started
                        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </a>
                </div>

                <button
                    type="button"
                    aria-expanded={open}
                    aria-label={open ? "Close menu" : "Open menu"}
                    data-testid="mobile-menu-toggle"
                    onClick={() => setOpen((v) => !v)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 lg:hidden"
                >
                    {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
            </div>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="overflow-hidden border-b border-slate-200 bg-white/95 backdrop-blur-xl lg:hidden"
                    >
                        <nav aria-label="Mobile navigation" className="space-y-1 px-5 py-4">
                            {NAV_LINKS.map((link) => (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    data-testid={`mobile-nav-link-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
                                    onClick={() => setOpen(false)}
                                    className="block rounded-xl px-4 py-3 text-base font-medium text-slate-700 transition-colors hover:bg-slate-100"
                                >
                                    {link.label}
                                </a>
                            ))}
                            <div className="flex gap-3 pt-3">
                                <a
                                    href={LOGIN_URL}
                                    target="_self"
                                    data-testid="mobile-login-link"
                                    className="flex-1 rounded-full border border-slate-300 px-5 py-3 text-center text-sm font-semibold text-slate-700"
                                >
                                    Log In
                                </a>
                                <a
                                    href={SIGNUP_URL}
                                    target="_self"
                                    data-testid="mobile-get-started-button"
                                    className="flex-1 rounded-full bg-indigo-600 px-5 py-3 text-center text-sm font-semibold text-white"
                                >
                                    Get Started
                                </a>
                            </div>
                        </nav>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    );
}
