import { useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authApi, USE_MOCK } from "@/lib/api";

export function Field({ id, label, icon: Icon, error, hint, labelRight, trailing, testId, ...inputProps }) {
    return (
        <div>
            <div className="flex items-center justify-between gap-3">
                <label htmlFor={id} className="text-sm font-semibold text-slate-800">
                    {label}
                </label>
                {labelRight}
            </div>
            <div className="relative mt-1.5">
                {Icon && (
                    <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                )}
                <input
                    id={id}
                    name={id}
                    data-testid={testId}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${id}-error` : undefined}
                    className={`h-11 w-full rounded-xl border bg-white text-sm text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] duration-200 placeholder:text-slate-400 focus:outline-none focus:ring-4 ${
                        Icon ? "pl-10" : "pl-3.5"
                    } ${trailing ? "pr-11" : "pr-3.5"} ${
                        error
                            ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
                            : "border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"
                    }`}
                    {...inputProps}
                />
                {trailing}
            </div>
            {error ? (
                <p id={`${id}-error`} data-testid={`${testId}-error`} className="mt-1.5 text-xs font-medium text-rose-600">
                    {error}
                </p>
            ) : (
                hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
            )}
        </div>
    );
}

export function PasswordField(props) {
    const [show, setShow] = useState(false);
    return (
        <Field
            {...props}
            type={show ? "text" : "password"}
            trailing={
                <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? "Hide password" : "Show password"}
                    data-testid={`${props.testId}-toggle`}
                    className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700"
                >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
            }
        />
    );
}

export function SubmitButton({ loading, children, testId }) {
    return (
        <button
            type="submit"
            disabled={loading}
            data-testid={testId}
            className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-indigo-600 px-6 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(79,70,229,0.55)] transition-[background-color,box-shadow,transform] duration-200 hover:bg-indigo-500 hover:shadow-[0_14px_36px_-10px_rgba(79,70,229,0.6)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
        >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {children}
        </button>
    );
}

export function FormError({ message, testId }) {
    if (!message) return null;
    return (
        <div
            role="alert"
            data-testid={testId}
            className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-700"
        >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {message}
        </div>
    );
}

const GoogleIcon = () => (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
        <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81z" />
        <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24z" />
        <path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1z" />
        <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.59 1.8l3.44-3.44A11.53 11.53 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77z" />
    </svg>
);

export function GoogleButton({ label = "Continue with Google", testId }) {
    const onClick = () => {
        if (USE_MOCK) {
            toast.info("Google sign-in needs your backend", {
                description: "Set VITE_API_URL — the button then redirects to {API}/auth/google.",
            });
            return;
        }
        window.location.href = authApi.googleUrl();
    };
    return (
        <button
            type="button"
            onClick={onClick}
            data-testid={testId}
            className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-full border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-[background-color,border-color,transform] duration-200 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98]"
        >
            <GoogleIcon />
            {label}
        </button>
    );
}

export function OrDivider() {
    return (
        <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            or
            <span className="h-px flex-1 bg-slate-200" />
        </div>
    );
}

export function MockBanner() {
    if (!USE_MOCK) return null;
    return (
        <p
            data-testid="mock-mode-banner"
            className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800"
        >
            <span className="font-semibold">Demo mode:</span> accounts are stored in this browser only. Set{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[11px]">VITE_API_URL</code> to connect your
            backend.
        </p>
    );
}
