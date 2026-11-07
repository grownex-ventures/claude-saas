import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AtSign, Link2, LockKeyhole, Mail, Phone, User } from "lucide-react";
import { toast } from "sonner";
import AuthLayout from "@/components/auth/AuthLayout";
import { Field, FormError, GoogleButton, MockBanner, OrDivider, PasswordField, SubmitButton } from "@/components/auth/FormControls";
import { useSignup, useTitle } from "@/lib/auth";
import { ROUTES } from "@/lib/site";
import { digitsOnly, normalizeUrl, passwordStrength, validateSignup } from "@/lib/validation";

const INITIAL = { email: "", username: "", password: "", confirmPassword: "", mobile: "", panelLink: "", terms: false };
// Backend field names -> form field names (for inline server errors).
const SERVER_FIELD_MAP = { mobile_number: "mobile", smm_panel_link: "panelLink", confirm_password: "confirmPassword" };
const STRENGTH_COLORS = ["bg-slate-200", "bg-rose-500", "bg-amber-500", "bg-sky-500", "bg-emerald-500"];

function StrengthMeter({ password }) {
    const { score, label } = passwordStrength(password);
    if (!password) return null;
    return (
        <div className="mt-2" data-testid="signup-password-strength">
            <div className="flex gap-1.5">
                {[1, 2, 3, 4].map((i) => (
                    <span
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i <= score ? STRENGTH_COLORS[score] : "bg-slate-200"}`}
                    />
                ))}
            </div>
            <p className="mt-1 text-xs font-medium text-slate-500" data-testid="signup-password-strength-label">
                Strength: <span className="text-slate-800">{label}</span>
            </p>
        </div>
    );
}

export default function Signup() {
    useTitle("Create your account");
    const navigate = useNavigate();
    const signup = useSignup();
    const [values, setValues] = useState(INITIAL);
    const [errors, setErrors] = useState({});

    const set = (key) => (e) => {
        const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
        setValues((v) => ({ ...v, [key]: value }));
        setErrors((er) => ({ ...er, [key]: undefined }));
    };

    const onSubmit = (e) => {
        e.preventDefault();
        const found = validateSignup(values);
        setErrors(found);
        if (Object.keys(found).length) return;
        signup.mutate(
            {
                email: values.email.trim(),
                username: values.username.trim(),
                password: values.password,
                mobile_number: digitsOnly(values.mobile),
                smm_panel_link: normalizeUrl(values.panelLink),
            },
            {
                onSuccess: () => {
                    toast.success("Account created — welcome aboard!");
                    navigate(ROUTES.dashboard, { replace: true });
                },
                onError: (err) => {
                    if (!err.fields) return;
                    setErrors(
                        Object.fromEntries(Object.entries(err.fields).map(([k, msg]) => [SERVER_FIELD_MAP[k] || k, msg])),
                    );
                },
            },
        );
    };

    return (
        <AuthLayout panel="signup" testId="signup-page">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-[34px]" data-testid="signup-heading">
                Create your account
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
                Set up AI-powered support for your SMM panel in minutes.
            </p>

            <div className="mt-7 space-y-5">
                <GoogleButton label="Sign up with Google" testId="signup-google-button" />
                <OrDivider />
            </div>

            <form onSubmit={onSubmit} noValidate className="mt-5 space-y-4" data-testid="signup-form">
                <FormError message={signup.error?.message} testId="signup-form-error" />
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                        id="email"
                        label="Email"
                        type="email"
                        icon={Mail}
                        placeholder="owner@mypanel.com"
                        autoComplete="email"
                        value={values.email}
                        onChange={set("email")}
                        error={errors.email}
                        testId="signup-input-email"
                    />
                    <Field
                        id="username"
                        label="Username"
                        icon={User}
                        placeholder="panel_owner"
                        autoComplete="username"
                        value={values.username}
                        onChange={set("username")}
                        error={errors.username}
                        testId="signup-input-username"
                    />
                </div>
                <div>
                    <PasswordField
                        id="password"
                        label="Password"
                        icon={LockKeyhole}
                        placeholder="Min. 8 characters"
                        autoComplete="new-password"
                        value={values.password}
                        onChange={set("password")}
                        error={errors.password}
                        testId="signup-input-password"
                    />
                    <StrengthMeter password={values.password} />
                </div>
                <PasswordField
                    id="confirmPassword"
                    label="Confirm password"
                    icon={LockKeyhole}
                    placeholder="Repeat your password"
                    autoComplete="new-password"
                    value={values.confirmPassword}
                    onChange={set("confirmPassword")}
                    error={errors.confirmPassword}
                    testId="signup-input-confirm-password"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                        id="mobile"
                        label="Mobile number"
                        type="tel"
                        inputMode="tel"
                        icon={Phone}
                        placeholder="+91 98765 43210"
                        autoComplete="tel"
                        value={values.mobile}
                        onChange={set("mobile")}
                        error={errors.mobile}
                        testId="signup-input-mobile"
                    />
                    <Field
                        id="panelLink"
                        label="SMM panel link"
                        inputMode="url"
                        icon={Link2}
                        placeholder="mypanel.com"
                        autoComplete="url"
                        value={values.panelLink}
                        onChange={set("panelLink")}
                        error={errors.panelLink}
                        testId="signup-input-panel-link"
                    />
                </div>
                <div>
                    <label className="flex cursor-pointer select-none items-start gap-2.5 text-sm leading-relaxed text-slate-600">
                        <input
                            type="checkbox"
                            checked={values.terms}
                            onChange={set("terms")}
                            data-testid="signup-terms-checkbox"
                            className="mt-1 h-4 w-4 rounded border-slate-300 accent-indigo-600"
                        />
                        <span>
                            I agree to the{" "}
                            <a href="#" className="font-semibold text-slate-800 underline decoration-slate-300 underline-offset-2">
                                Terms of Service
                            </a>{" "}
                            and{" "}
                            <a href="#" className="font-semibold text-slate-800 underline decoration-slate-300 underline-offset-2">
                                Privacy Policy
                            </a>
                            .
                        </span>
                    </label>
                    {errors.terms && (
                        <p className="mt-1.5 text-xs font-medium text-rose-600" data-testid="signup-terms-checkbox-error">
                            {errors.terms}
                        </p>
                    )}
                </div>
                <SubmitButton loading={signup.isPending} testId="signup-submit-button">
                    {signup.isPending ? "Creating account…" : "Create account"}
                </SubmitButton>
            </form>

            <p className="mt-7 text-center text-sm text-slate-600">
                Already have an account?{" "}
                <Link
                    to={ROUTES.login}
                    data-testid="signup-login-link"
                    className="font-semibold text-indigo-600 transition-colors hover:text-indigo-500"
                >
                    Log in
                </Link>
            </p>
            <div className="mt-6">
                <MockBanner />
            </div>
        </AuthLayout>
    );
}
