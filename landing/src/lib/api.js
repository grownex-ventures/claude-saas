/**
 * API layer — the ONLY file you need to touch to connect your backend.
 *
 * 1. Set VITE_API_URL in frontend/.env (e.g. VITE_API_URL=https://api.yoursmmagent.com)
 * 2. Adjust ENDPOINTS / payload shapes below if your backend differs.
 *
 * While VITE_API_URL is empty the app runs on a MOCK backend stored in the
 * browser's localStorage (see mockAuth.js) so the full flow can be demoed.
 *
 * Expected contract (defaults):
 *   POST {API}/auth/signup           body: { email, username, password, mobile_number, smm_panel_link }
 *                                    200:  { token?, user }
 *   POST {API}/auth/login            body: { identifier, password, remember }   (identifier = email OR username)
 *                                    200:  { token?, user }
 *   POST {API}/auth/forgot-password  body: { email }                            200: { message? }
 *   GET  {API}/auth/me               200:  { user } or user object              401 when signed out
 *   POST {API}/auth/logout           200
 *   GET  {API}/auth/google?redirect_uri={APP}/auth/callback
 *        -> backend runs Google OAuth, then redirects to /auth/callback?token=... (or ?error=...)
 *
 * Errors: return a non-2xx with { message } or { detail } and optionally
 *   { errors: { fieldName: "message" } } to show inline field errors.
 *
 * Passwords are sent in plain text over HTTPS — your backend must hash them
 * with Argon2id (e.g. argon2-cffi / argon2 npm package) before storing.
 *
 * Auth: if `token` is returned it is sent as `Authorization: Bearer <token>`.
 * Cookies are also sent (credentials: "include"), so cookie sessions work too.
 */
import { mockAuth } from "@/lib/mockAuth";

export const API_BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export const USE_MOCK =
    import.meta.env.VITE_USE_MOCK === "true" ||
    (typeof window !== "undefined" && window.location.search.includes("mock=true"));

export const ENDPOINTS = {
    signup: "/api/v1/auth/signup",
    login: "/api/v1/auth/login",
    forgotPassword: "/api/v1/auth/forgot-password",
    me: "/api/v1/auth/me",
    logout: "/api/v1/auth/logout",
    google: "/api/v1/auth/google",
    mfaVerifyLogin: "/api/v1/auth/mfa/verify-login",
    mfaSetup: "/api/v1/auth/mfa/setup",
    mfaEnable: "/api/v1/auth/mfa/enable",
    mfaDisable: "/api/v1/auth/mfa/disable",
};

export class ApiError extends Error {
    constructor(message, status = 0, fields = undefined) {
        super(message);
        this.status = status;
        this.fields = fields;
    }
}

const TOKEN_KEY = "ysmm_token";
const LEGACY_TOKEN_KEY = "supportbot_token";

export const tokenStore = {
    get: () => {
        if (typeof window === "undefined") return null;
        return (
            localStorage.getItem(TOKEN_KEY) ||
            sessionStorage.getItem(TOKEN_KEY) ||
            localStorage.getItem(LEGACY_TOKEN_KEY) ||
            sessionStorage.getItem(LEGACY_TOKEN_KEY) ||
            null
        );
    },
    set(token, remember = true) {
        this.clear();
        if (token && typeof window !== "undefined") {
            const store = remember ? localStorage : sessionStorage;
            store.setItem(TOKEN_KEY, token);
            store.setItem(LEGACY_TOKEN_KEY, token);
        }
    },
    clear() {
        if (typeof window !== "undefined") {
            localStorage.removeItem(TOKEN_KEY);
            sessionStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(LEGACY_TOKEN_KEY);
            sessionStorage.removeItem(LEGACY_TOKEN_KEY);
        }
    },
};

/** Generic JSON request helper — reuse it for your dashboard endpoints too. */
export async function apiRequest(path, { method = "GET", body } = {}) {
    const token = tokenStore.get();
    let res;
    try {
        res = await fetch(`${API_BASE_URL}${path}`, {
            method,
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
    } catch {
        throw new ApiError("Can't reach the server. Check your connection and try again.");
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        const detail = typeof data?.detail === "string" ? data.detail : undefined;
        const msg = data?.error || data?.message || detail || `Request failed (${res.status})`;
        throw new ApiError(msg, res.status, data?.errors);
    }
    return data;
}

const toUser = (data) => {
    const raw = data?.tenant || data?.user || (data?.email ? data : null);
    if (!raw) return null;
    return {
        ...raw,
        name: raw.name || raw.email?.split("@")[0] || "User",
        username: raw.username || raw.email?.split("@")[0] || "User",
    };
};

const real = {
    async signup(payload) {
        const data = await apiRequest(ENDPOINTS.signup, { method: "POST", body: payload });
        tokenStore.set(data?.token, true);
        return toUser(data);
    },
    async login({ identifier, password, remember }) {
        const data = await apiRequest(ENDPOINTS.login, {
            method: "POST",
            body: { email: identifier, password, remember },
        });
        if (data?.mfaRequired) {
            return {
                mfaRequired: true,
                mfaSessionToken: data.mfaSessionToken,
                message: data.message,
                remember,
            };
        }
        tokenStore.set(data?.token, remember);
        return toUser(data);
    },
    async verifyMfaLogin({ mfaSessionToken, code, remember }) {
        const data = await apiRequest(ENDPOINTS.mfaVerifyLogin, {
            method: "POST",
            body: { mfaSessionToken, code: (code || "").trim() },
        });
        tokenStore.set(data?.token, remember);
        return toUser(data);
    },
    forgotPassword: ({ email }) => apiRequest(ENDPOINTS.forgotPassword, { method: "POST", body: { email } }),
    async me() {
        try {
            return toUser(await apiRequest(ENDPOINTS.me));
        } catch (err) {
            if (err.status === 401 || err.status === 403) {
                tokenStore.clear();
                return null;
            }
            throw err;
        }
    },
    async logout() {
        try {
            await apiRequest(ENDPOINTS.logout, { method: "POST" });
        } finally {
            tokenStore.clear();
        }
    },
    googleUrl: () =>
        `${API_BASE_URL}${ENDPOINTS.google}?redirect_uri=${encodeURIComponent(`${window.location.origin}/auth/callback`)}`,
};

export const authApi = USE_MOCK ? mockAuth : real;
