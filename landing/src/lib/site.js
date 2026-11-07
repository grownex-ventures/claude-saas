/**
 * Domains & routes.
 *
 * Production layout:
 *   yoursmmagent.com            -> marketing landing page
 *   app.yoursmmagent.com        -> Login (root path)
 *   app.yoursmmagent.com/signup -> Signup
 *   app.yoursmmagent.com/app    -> Protected dashboard (/app/channels, /app/inbox, …)
 *
 * The SAME build can be deployed to both hosts: when the page is served from an
 * `app.` hostname the root path renders Login instead of the landing page.
 * On any other host (localhost, preview) the auth pages live at /login, /signup.
 * Override with VITE_APP_URL / VITE_LANDING_URL if you need different domains.
 */
const host = typeof window !== "undefined" ? window.location.hostname : "";

export const IS_APP_HOST = host.startsWith("app.");
const IS_PROD_LANDING_HOST = host === "yoursmmagent.com" || host === "www.yoursmmagent.com";

/** Base URL of the app (login/signup/dashboard). Empty string = same origin. */
export const APP_URL = (
    import.meta.env.VITE_APP_URL ?? (IS_PROD_LANDING_HOST ? "https://app.yoursmmagent.com" : "")
).replace(/\/$/, "");

/** Where the logo on auth/dashboard pages points back to. */
export const LANDING_URL = import.meta.env.VITE_LANDING_URL ?? (IS_APP_HOST ? "https://yoursmmagent.com" : "/");

/** In-app routes (relative to the app host). */
export const ROUTES = {
    login: IS_APP_HOST ? "/" : "/login",
    signup: "/signup",
    forgotPassword: "/forgot-password",
    authCallback: "/auth/callback",
    dashboard: "/dashboard",
};

/** Links used by the landing page CTAs. */
export const LOGIN_URL = APP_URL ? `${APP_URL}/` : ROUTES.login;
export const SIGNUP_URL = `${APP_URL}${ROUTES.signup}`;

export const NAV_LINKS = [
    { label: "Features", href: "#features" },
    { label: "Channels", href: "#channels" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Integrations", href: "#integrations" },
    { label: "Benefits", href: "#benefits" },
    { label: "FAQ", href: "#faq" },
];
