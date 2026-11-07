import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AtSign, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import AuthLayout from "@/components/auth/AuthLayout";
import { Field, FormError, GoogleButton, MockBanner, OrDivider, PasswordField, SubmitButton } from "@/components/auth/FormControls";
import { useLogin, useTitle } from "@/lib/auth";
import { ROUTES } from "@/lib/site";
import { validateLogin } from "@/lib/validation";

export default function Login() {
    useTitle("Log in");
    const navigate = useNavigate();
    const location = useLocation();
    const login = useLogin();
    const [values, setValues] = useState({ identifier: "", password: "", remember: true });
    const [errors, setErrors] = useState({});

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
                onSuccess: (user) => {
                    toast.success(`Welcome back${user?.username ? `, ${user.username}` : ""}!`);
                    navigate(location.state?.from || ROUTES.dashboard, { replace: true });
                },
                onError: (err) => err.fields && setErrors(err.fields),
            },
        );
    };

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
