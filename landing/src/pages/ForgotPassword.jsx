import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, KeyRound, Mail, MailCheck } from "lucide-react";
import { Logo } from "@/components/landing/Logo";
import { Field, FormError, SubmitButton } from "@/components/auth/FormControls";
import { useForgotPassword, useTitle } from "@/lib/auth";
import { LANDING_URL, ROUTES } from "@/lib/site";
import { EMAIL_RE } from "@/lib/validation";

export default function ForgotPassword() {
    useTitle("Reset your password");
    const reset = useForgotPassword();
    const [email, setEmail] = useState("");
    const [error, setError] = useState();

    const onSubmit = (e) => {
        e.preventDefault();
        if (!EMAIL_RE.test(email.trim())) return setError("Enter a valid email address.");
        reset.mutate({ email: email.trim() });
    };

    return (
        <div className="relative flex min-h-screen flex-col bg-slate-50" data-testid="forgot-password-page">
            <div className="bg-grid pointer-events-none absolute inset-0" />
            <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-indigo-200/40 blur-3xl" />
            <header className="relative px-6 py-5 sm:px-10">
                <Logo href={LANDING_URL} testId="forgot-logo-link" />
            </header>
            <main className="relative flex flex-1 items-start justify-center px-6 pb-16 pt-8 sm:pt-16">
                <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                    className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white/90 p-8 shadow-[0_30px_60px_-30px_rgba(15,23,42,0.25)] backdrop-blur-xl sm:p-10"
                >
                    <AnimatePresence mode="wait">
                        {reset.isSuccess ? (
                            <motion.div
                                key="sent"
                                initial={{ opacity: 0, scale: 0.97 }}
                                animate={{ opacity: 1, scale: 1 }}
                                data-testid="forgot-password-success"
                            >
                                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                                    <MailCheck className="h-6 w-6" />
                                </span>
                                <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">Check your inbox</h1>
                                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                                    If an account exists for <b className="text-slate-900">{email.trim()}</b>, you'll receive a
                                    link to reset your password shortly.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => reset.reset()}
                                    data-testid="forgot-password-try-again"
                                    className="mt-6 text-sm font-semibold text-indigo-600 transition-colors hover:text-indigo-500"
                                >
                                    Use a different email
                                </button>
                            </motion.div>
                        ) : (
                            <motion.div key="form" exit={{ opacity: 0 }}>
                                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                                    <KeyRound className="h-6 w-6" />
                                </span>
                                <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900" data-testid="forgot-password-heading">
                                    Forgot your password?
                                </h1>
                                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                                    Enter the email you signed up with and we'll send you a reset link.
                                </p>
                                <form onSubmit={onSubmit} noValidate className="mt-7 space-y-5" data-testid="forgot-password-form">
                                    <FormError message={reset.error?.message} testId="forgot-password-form-error" />
                                    <Field
                                        id="email"
                                        label="Email"
                                        type="email"
                                        icon={Mail}
                                        placeholder="owner@mypanel.com"
                                        autoComplete="email"
                                        value={email}
                                        onChange={(e) => {
                                            setEmail(e.target.value);
                                            setError(undefined);
                                        }}
                                        error={error}
                                        testId="forgot-password-input-email"
                                    />
                                    <SubmitButton loading={reset.isPending} testId="forgot-password-submit-button">
                                        Send reset link
                                    </SubmitButton>
                                </form>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <Link
                        to={ROUTES.login}
                        data-testid="forgot-password-back-to-login"
                        className="group mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-900"
                    >
                        <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
                        Back to log in
                    </Link>
                </motion.div>
            </main>
        </div>
    );
}
