import { Component, useEffect } from "react";
import Lenis from "lenis";
import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import Marquee from "@/components/landing/Marquee";
import PainPoints from "@/components/landing/PainPoints";
import Introducing from "@/components/landing/Introducing";
import Channels from "@/components/landing/Channels";
import Integration from "@/components/landing/Integration";
import HowItWorks from "@/components/landing/HowItWorks";
import Capabilities from "@/components/landing/Capabilities";
import ConversationsDemo from "@/components/landing/ConversationsDemo";
import Benefits from "@/components/landing/Benefits";
import WhoItsFor from "@/components/landing/WhoItsFor";
import TrustSecurity from "@/components/landing/TrustSecurity";
import FAQ from "@/components/landing/FAQ";
import FinalCTA from "@/components/landing/FinalCTA";
import Footer from "@/components/landing/Footer";

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="flex min-h-screen items-center justify-center px-6 text-center">
                    <p className="text-slate-600">Something went wrong. Please refresh the page.</p>
                </div>
            );
        }
        return this.props.children;
    }
}

function useSmoothScroll() {
    useEffect(() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
        const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
        let raf = requestAnimationFrame(function loop(t) {
            lenis.raf(t);
            raf = requestAnimationFrame(loop);
        });
        const onClick = (e) => {
            const a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
            if (!a) return;
            const hash = a.getAttribute("href");
            if (!hash || hash.length < 2) return;
            const el = document.querySelector(hash);
            if (!el) return;
            e.preventDefault();
            lenis.scrollTo(el, { offset: -72 });
        };
        document.addEventListener("click", onClick);
        return () => {
            cancelAnimationFrame(raf);
            lenis.destroy();
            document.removeEventListener("click", onClick);
        };
    }, []);
}

function Home() {
    useSmoothScroll();
    return (
        <div id="top" className="min-h-screen bg-white text-slate-900">
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
            >
                Skip to content
            </a>
            <Header />
            <main id="main-content">
                <Hero />
                <Marquee />
                <PainPoints />
                <Introducing />
                <Channels />
                <Integration />
                <HowItWorks />
                <Capabilities />
                <ConversationsDemo />
                <Benefits />
                <WhoItsFor />
                <TrustSecurity />
                <FAQ />
                <FinalCTA />
            </main>
            <Footer />
        </div>
    );
}

export default function App() {
    return (
        <ErrorBoundary>
            <Home />
        </ErrorBoundary>
    );
}
