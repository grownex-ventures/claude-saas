import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, AtSign, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import AuthLayout from "@/components/auth/AuthLayout";
import { Field, FormError, GoogleButton, MockBanner, OrDivider, PasswordField, SubmitButton } from "@/components/auth/FormControls";
import { useLogin, useTitle, useVerifyMfaLogin } from "@/lib/auth";
import { ROUTES } from "@/lib/site";
import { validateLogin } from "@/lib/validation";

export default function Login() {
    useTitle("Log in");
    const navigate = useNavigate();
    const location = useLocation();
    const login = useLogin();
    const verifyMfa = useVerifyMfaLogin();
    const [values, setValues] = useState({ identifier: "", password: "", remember: true });
    const [errors, setErrors] = useState({});
    const [mfaChallenge, setMfaChallenge] = useState(null);
    const [mfaCode, setMfaCode] = useState("");
    const [mfaError, setMfaError] = useState(null);

    const set = (key) => (e) => {
        const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
        setValues((v) => ({ ...v, [key]: value }));
        setErrors((er) => ({ ...er, [key]: undefined }));
    };

    const onSubmit = (e) => {
        e.preventDefault();
        const found = validateLogin(values);
        setErrors(found);
        if (Object.keys(found).length) return;
        login.mutate(
            { identifier: values.identifier.trim(), password: values.password, remember: values.remember },
            {
                onSuccess: (data) => {
                    if (data?.mfaRequired) {
                        setMfaChallenge({
                            mfaSessionToken: data.mfaSessionToken,
                            remember: values.remember,
                        });
                        setMfaCode("");
                        setMfaError(null);
                        return;
                    }
                    toast.success(`Welcome back${data?.username ? `, ${data.username}` : ""}!`);
                    navigate(location.state?.from || ROUTES.dashboard, { replace: true });
                },
                onError: (err) => err.fields && setErrors(err.fields),
            },
        );
    };

    const onMfaSubmit = (e) => {
        e.preventDefault();
        const code = mfaCode.trim();
        if (!code) {
            setMfaError("Please enter your 6-digit verification code or backup code.");
            return;
        }
        verifyMfa.mutate(
            {
                mfaSessionToken: mfaChallenge.mfaSessionToken,
                code,
                remember: mfaChallenge.remember,
            },
            {
                onSuccess: (user) => {
                    toast.success(`Welcome back${user?.username ? `, ${user.username}` : ""}!`);
                    navigate(location.state?.from || ROUTES.dashboard, { replace: true });
                },
                onError: (err) => {
                    setMfaError(err.message || "Invalid two-factor code. Please try again.");
                },
            },
        );
    };

    if (mfaChallenge) {
        return (
            <AuthLayout panel="login" testId="login-mfa-page">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200">
                        <ShieldCheck className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl" data-testid="login-mfa-heading">
                            Two-factor auth
                        </h1>
                        <p className="mt-1 text-sm text-slate-600">
                            Enter the 6-digit code from your authenticator app (Google Authenticator, Authy) or backup code.
                        </p>
                    </div>
                </div>

                <form onSubmit={onMfaSubmit} noValidate className="mt-8 space-y-5" data-testid="login-mfa-form">
                    <FormError message={mfaError} testId="login-mfa-error" />
                    <Field
                        id="mfaCode"
                        label="Security verification code"
                        icon={KeyRound}
                        placeholder="123456 or backup code"
                        autoComplete="one-time-code"
                        autoFocus
                        value={mfaCode}
                        onChange={(e) => {
                            setMfaCode(e.target.value);
                            setMfaError(null);
                        }}
                        testId="login-input-mfa-code"
                    />
                    <SubmitButton loading={verifyMfa.isPending} testId="login-mfa-submit-button">
                        {verifyMfa.isPending ? "Verifying code…" : "Verify & Sign in"}
                    </SubmitButton>
                </form>

                <div className="mt-6 border-t border-slate-100 pt-5">
                    <button
                        type="button"
                        onClick={() => {
                            setMfaChallenge(null);
                            setMfaCode("");
                            setMfaError(null);
                        }}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-900"
                        data-testid="login-mfa-back-button"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to sign in
                    </button>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout panel="login" testId="login-page">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-[34px]" data-testid="login-heading">
                Welcome back
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
                Log in to manage your AI support agent, channels and panel integrations.
            </p>

            <div className="mt-8 space-y-5">
                <GoogleButton testId="login-google-button" />
                <OrDivider />
            </div>

            <form onSubmit={onSubmit} noValidate className="mt-5 space-y-5" data-testid="login-form">
                <FormError message={login.error && !login.error.fields ? login.error.message : null} testId="login-form-error" />
                <Field
                    id="identifier"
                    label="Email or username"
                    icon={AtSign}
                    placeholder="you@yourpanel.com or panel_owner"
                    autoComplete="username"
                    value={values.identifier}
                    onChange={set("identifier")}
                    error={errors.identifier}
                    testId="login-input-identifier"
                />
                <PasswordField
                    id="password"
                    label="Password"
                    icon={LockKeyhole}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    value={values.password}
                    onChange={set("password")}
                    error={errors.password}
                    testId="login-input-password"
                    labelRight={
                        <Link
                            to={ROUTES.forgotPassword}
                            data-testid="login-forgot-password-link"
                            className="text-xs font-semibold text-indigo-600 transition-colors hover:text-indigo-500"
                        >
                            Forgot password?
                        </Link>
                    }
                />
                <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-slate-600">
                    <input
                        type="checkbox"
                        checked={values.remember}
                        onChange={set("remember")}
                        data-testid="login-remember-checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 accent-indigo-600"
                    />
                    Keep me signed in
                </label>
                <SubmitButton loading={login.isPending} testId="login-submit-button">
                    {login.isPending ? "Signing in…" : "Log in"}
                </SubmitButton>
            </form>

            <p className="mt-7 text-center text-sm text-slate-600">
                New to YourSMMagent?{" "}
                <Link
                    to={ROUTES.signup}
                    data-testid="login-signup-link"
                    className="font-semibold text-indigo-600 transition-colors hover:text-indigo-500"
                >
                    Create an account
                </Link>
            </p>
            <div className="mt-6">
                <MockBanner />
            </div>
        </AuthLayout>
    );
}
