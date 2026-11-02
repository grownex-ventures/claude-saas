import { ArrowRight } from "lucide-react";
import { APP_URL } from "@/lib/site";
import Reveal from "./Reveal";

export default function FinalCTA() {
    return (
        <section className="py-20 sm:py-28" aria-labelledby="final-cta-heading">
            <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
                <Reveal>
                    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-blue-600 px-7 py-16 text-center shadow-[0_40px_90px_-30px_rgba(79,70,229,0.55)] sm:px-12 sm:py-20">
                        <div
                            className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[size:44px_44px]"
                            aria-hidden="true"
                        />
                        <div
                            className="absolute -top-24 left-1/2 h-64 w-[640px] -translate-x-1/2 rounded-full bg-white/15 blur-[100px]"
                            aria-hidden="true"
                        />
                        <div className="relative">
                            <h2
                                id="final-cta-heading"
                                className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-[2.75rem] lg:leading-[1.12]"
                            >
                                Your SMM Panel Deserves Smarter Customer Support.
                            </h2>
                            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-indigo-100 sm:text-lg">
                                Explore AI-powered support designed around the needs of SMM panel businesses.
                                Bring your support knowledge, customer conversations, and connected workflows
                                together.
                            </p>
                            <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
                                <a
                                    href={APP_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    data-testid="final-cta-get-started-button"
                                    className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-semibold text-indigo-700 shadow-[0_14px_36px_-12px_rgba(0,0,0,0.35)] transition-all duration-200 hover:bg-indigo-50 active:scale-[0.98]"
                                >
                                    Get Started with YourSMMagent
                                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                                </a>
                            </div>
                            <a
                                href="#features"
                                data-testid="final-cta-explore-features-link"
                                className="mt-6 inline-block text-sm font-medium text-indigo-100 underline decoration-indigo-300/60 underline-offset-4 transition-colors hover:text-white"
                            >
                                Explore features on this page
                            </a>
                        </div>
                    </div>
                </Reveal>
            </div>
        </section>
    );
}
