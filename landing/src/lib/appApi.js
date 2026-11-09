/**
 * YourSMMagent — dashboard API layer (MOCK).
 *
 * Every function below is async and returns plain JSON, exactly like a real
 * fetch call would. To connect your backend, replace a function body with
 * `apiRequest(...)` from "./api" — the pages only depend on these names and
 * return shapes, never on the mock internals.
 *
 * Suggested REST mapping:
 *   getAccount              GET    /account
 *   getOnboarding           GET    /account/onboarding
 *   getOverviewStats(range) GET    /stats?range=7|30|90
 *   getChannels             GET    /channels
 *   setChannelEnabled       PATCH  /channels/:channel        { enabled }
 *   deployTelegramBot       POST   /channels/telegram/deploy  { token }
 *   refreshTelegramStatus   GET    /channels/telegram/status
 *   testBot                 POST   /channels/telegram/test
 *   stopBot / startBot      POST   /channels/telegram/stop | /start
 *   startWhatsAppSession    POST   /channels/whatsapp/session
 *   getWhatsAppQR           GET    /channels/whatsapp/qr
 *   getWhatsAppStatus       GET    /channels/whatsapp/status
 *   sendWhatsAppTest        POST   /channels/whatsapp/test
 *   disconnectWhatsApp      DELETE /channels/whatsapp/session
 *   getWidgetConfig         GET    /channels/widget
 *   saveWidgetConfig        PUT    /channels/widget
 *   verifyWidgetInstall     POST   /channels/widget/verify
 *   getPanel / connectPanel / testPanelConnection / syncPanel / disconnectPanel  -> /panel
 *   getConversations(f)     GET    /conversations?channel=&status=&unread=&q=
 *   getConversation(id)     GET    /conversations/:id
 *   sendReply / takeOverConversation / handBackConversation -> /conversations/:id/...
 *   getAISettings / saveAISettings / addFaq / updateFaq / deleteFaq / testAI -> /ai
 *   getLogs(f)              GET    /logs?level=&channel=&range=&q=
 *   getBilling / changePlan -> /billing
 *   getSettings / saveProfile / resendVerification / changePassword /
 *   setTwoFactor / saveNotifications / regenerateApiKey / deleteAccount -> /settings
 *
 * Demo helpers: add `?simulateError` to any /app URL to see every error state.
 * Test inputs: Telegram tokens starting with "000" and panel URLs containing
 * "fail" are rejected, so you can see the error flows.
 */
import { tokenStore, apiRequest, authApi, USE_MOCK } from "@/lib/api";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const now = () => Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (n) => Array.from({ length: n }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : rand(16));

export class AppApiError extends Error {}
const fail = (msg) => {
    throw new AppApiError(msg);
};

export const CHANNELS = ["telegram", "whatsapp", "widget"];

export const PLANS = [
    {
        id: "starter",
        name: "Starter",
        monthly: 19,
        channels: ["telegram"],
        limits: { conversations: 1000, lookups: 5000 },
        features: ["Telegram bot", "1,000 conversations / mo", "Balance & order status", "Email support"],
    },
    {
        id: "pro",
        name: "Pro",
        monthly: 49,
        recommended: true,
        channels: ["telegram", "whatsapp", "widget"],
        limits: { conversations: 5000, lookups: 25000 },
        features: ["Telegram, WhatsApp & website chat", "5,000 conversations / mo", "Refill & cancel actions", "Live inbox takeover"],
    },
    {
        id: "business",
        name: "Business",
        monthly: 129,
        channels: ["telegram", "whatsapp", "widget"],
        limits: { conversations: 25000, lookups: 150000 },
        features: ["Everything in Pro", "25,000 conversations / mo", "Multiple team seats", "Priority support"],
    },
];
export const yearlyPrice = (p) => p.monthly * 10;

/* ------------------------------------------------------------------ */
/* Mock persistence                                                    */
/* ------------------------------------------------------------------ */
const storageKey = () => `ysmm_app:${tokenStore.get() || "anon"}`;

function initialState() {
    return {
        tenantId: `tn_${rand(12)}`,
        apiKeys: [
            { id: uid(), label: "Server key", key: `ysk_live_${rand(32)}`, createdAt: now() },
            { id: uid(), label: "Widget public key", key: `ysk_pub_${rand(24)}`, createdAt: now() },
        ],
        emailVerified: false,
        verificationSentAt: null,
        plan: "pro",
        trial: true,
        trialEndsAt: now() + 12 * DAY,
        cycle: "monthly",
        panel: { url: "", apiKeyLast4: "", connected: false, lastSync: null, name: null, services: 0 },
        telegram: { status: "not_setup", username: null, deployedAt: null, lastActivity: null, tokenLast4: "" },
        whatsapp: { status: "not_setup", number: null, connectedAt: null, lastActivity: null, qr: null },
        widget: {
            status: "not_setup",
            installedAt: null,
            lastActivity: null,
            config: {
                color: "#4F46E5",
                logo: null,
                title: "Support",
                welcome: "Hi! How can we help with your orders today?",
                position: "right",
                language: "en",
            },
        },
        onboarding: { testSent: false, shared: false },
        ai: {
            tone: "friendly",
            language: "auto",
            hours: { enabled: false, start: "09:00", end: "21:00", timezone: "UTC" },
            escalation: { onRequest: true, afterFailed: 2, keywords: "refund, chargeback, scam", notifyEmail: true },
            actions: { balance: true, services: true, orderStatus: true, refill: true, cancel: false },
            faqs: [
                {
                    id: uid(),
                    question: "How long does delivery take?",
                    answer: "Most services start within 0–30 minutes. Exact speed is listed on each service.",
                },
                {
                    id: uid(),
                    question: "What payment methods do you accept?",
                    answer: "We accept cards, crypto and local payment methods from the Add Funds page.",
                },
            ],
        },
        conversations: [],
        logs: [log("info", "system", "Workspace created", { event: "tenant.created" })],
        trafficSeeded: false,
        settings: {
            name: "",
            twoFA: false,
            notifications: { handoff: true, dailySummary: true, channelDown: true, billing: true },
        },
        invoices: [],
    };
}

function sanitizeLoadedState(s) {
    if (!s) return s;
    if (s.telegram && typeof s.telegram.username === "string" && s.telegram.username.includes("_support_bot")) {
        s.telegram.username = null;
    }
    if (Array.isArray(s.conversations)) {
        s.conversations = s.conversations.filter(
            (c) => c?.customer?.name !== "@rahul_growth" && c?.customer?.name !== "@smm_kingpin" && c?.customer?.name !== "@boostmaster" && c?.customer?.name !== "@viralvibes"
        );
    }
    return s;
}

function load() {
    try {
        const raw = localStorage.getItem(storageKey());
        if (raw) return sanitizeLoadedState(JSON.parse(raw));
    } catch {
        /* ignore */
    }
    const state = sanitizeLoadedState(initialState());
    save(state);
    return state;
}
const save = (s) => localStorage.setItem(storageKey(), JSON.stringify(s));

async function call(fn, ms = 550) {
    await sleep(ms + Math.random() * 250);
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("simulateError")) {
        fail("We couldn't reach the YourSMMagent servers. Please try again.");
    }
    const state = load();
    current = state;
    let result;
    try {
        result = await fn(state);
    } finally {
        save(state); // persist side effects (e.g. error logs) even when the call fails
    }
    return result === undefined ? { ok: true } : JSON.parse(JSON.stringify(result));
}

function log(level, channel, message, raw = {}, at = now()) {
    return { id: uid(), at, level, channel, message, raw: { ts: new Date(at).toISOString(), level, channel, ...raw } };
}
/** Appends to the state currently being mutated inside call(). */
let current = null;
const addLog = (...args) => {
    current.logs.unshift(log(...args));
    current.logs = current.logs.slice(0, 400);
};

const isSetUp = (s, ch) => s[ch].status !== "not_setup";
const planOf = (s) => PLANS.find((p) => p.id === s.plan) || PLANS[0];
const isLocked = (s, ch) => {
    if (ch === "whatsapp" && (s.hasWhatsapp || s.whatsapp?.status === "live")) return false;
    if (ch === "widget" && (s.hasWidget || s.widget?.status === "live")) return false;
    return !planOf(s).channels.includes(ch);
};

/** No synthetic mock traffic — real production state only */
function seedTraffic(s) {
    // Zero fake traffic in production
}

/* ------------------------------------------------------------------ */
/* Account & onboarding                                                */
/* ------------------------------------------------------------------ */
export const getAccount = async () => {
    try {
        const me = await authApi.me();
        if (me && me.id) {
            const s = load();
            s.tenantId = me.id;
            s.emailVerified = Boolean(me.emailVerified);
            s.hasWhatsapp = Boolean(me.hasWhatsapp);
            s.hasWidget = Boolean(me.hasWidget);
            const isPro = me.subscriptionStatus === "ACTIVE" || Boolean(me.hasWhatsapp);
            s.plan = isPro ? "pro" : "starter";
            save(s);
            return {
                tenantId: me.id,
                email: me.email,
                emailVerified: Boolean(me.emailVerified),
                verificationSentAt: null,
                plan: PLANS.find((p) => p.id === (isPro ? "pro" : "starter")) || PLANS[1],
                trial: me.subscriptionStatus !== "ACTIVE",
                trialEndsAt: me.subscriptionExpiresAt ? new Date(me.subscriptionExpiresAt).getTime() : Date.now() + 14 * DAY,
            };
        }
    } catch (e) {
        // fallback
    }
    return call((s) => ({
        tenantId: s.tenantId,
        emailVerified: s.emailVerified,
        verificationSentAt: s.verificationSentAt,
        plan: planOf(s),
        trial: s.trial,
        trialEndsAt: s.trialEndsAt,
    }), 300);
};

export const getOnboarding = () =>
    call((s) => {
        const anyLive = CHANNELS.some((c) => s[c].status === "live");
        const steps = [
            { id: "verify", label: "Verify your email", done: s.emailVerified, cta: "Verify email", to: "/dashboard/settings" },
            { id: "panel", label: "Connect your SMM panel", done: s.panel.connected, cta: "Connect panel", to: "/dashboard/panel" },
            { id: "channel", label: "Activate a channel", done: anyLive, cta: "Activate channel", to: "/dashboard/channels?tab=telegram" },
            { id: "test", label: "Send a test message", done: s.onboarding.testSent, cta: "Send test", to: "/dashboard/channels?tab=telegram" },
            { id: "share", label: "Share your bot link", done: s.onboarding.shared, cta: "Share link", to: "/dashboard/channels?tab=telegram" },
        ];
        return { steps, completed: steps.filter((x) => x.done).length, total: steps.length };
    }, 350);

export const getOverviewStats = async (range = 7) => {
    try {
        const stats = await apiRequest(`/api/v1/tenants/overview-stats?rangeDays=${range}`);
        if (stats && Array.isArray(stats.series)) {
            return stats;
        }
    } catch (e) {
        console.warn("Backend getOverviewStats fallback:", e?.message);
    }
    const series = Array.from({ length: range }, (_, i) => {
        const d = new Date(now() - (range - 1 - i) * DAY);
        return { date: d.toISOString().slice(0, 10), conversations: 0, resolved: 0 };
    });
    return {
        range,
        series,
        conversations: 0,
        messages: 0,
        resolvedPct: null,
        avgResponseSec: null,
        panelLookups: 0,
        activeChannels: 0,
    };
};

/* ------------------------------------------------------------------ */
/* Channels                                                            */
/* ------------------------------------------------------------------ */
export const getChannels = async () => {
    try {
        const me = await authApi.me();
        if (me && me.id) {
            const s = load();
            if (me.botToken) {
                s.telegram.status = "live";
                s.telegram.tokenLast4 = me.botToken.slice(-4);
            }
            if (me.botUsername) {
                s.telegram.username = me.botUsername;
            } else if (me.botToken) {
                try {
                    const testRes = await apiRequest("/api/v1/tenants/telegram/test");
                    if (testRes?.botUsername) {
                        s.telegram.username = testRes.botUsername;
                    }
                } catch (_) {}
            }
            if (me.panelApiUrl) {
                s.panel.connected = true;
                s.panel.url = me.panelApiUrl;
            }
            if (me.hasWhatsapp) {
                s.hasWhatsapp = true;
            }
            if (me.hasWidget) {
                s.hasWidget = true;
            }
            if (me.whatsAppPhoneNumber && (me.hasWhatsapp || me.whatsAppEnabled)) {
                s.whatsapp.status = "live";
                s.whatsapp.number = me.whatsAppPhoneNumber;
            } else if (!s.whatsapp.qr && s.whatsapp.status !== "pending") {
                s.whatsapp.status = "not_setup";
            }
            if (typeof me.widgetEnabled === "boolean") {
                s.widget.status = me.widgetEnabled ? "live" : "offline";
            } else if (me.hasWidget && s.widget.status !== "offline") {
                s.widget.status = "live";
            }
            if (typeof me.whatsAppEnabled === "boolean" && !me.whatsAppEnabled) {
                s.whatsapp.status = "offline";
            }
            save(s);
        }
    } catch (e) {
        // fallback
    }
    return call((s) => {
        return Object.fromEntries(
            CHANNELS.map((c) => [c, { ...s[c], qr: undefined, locked: isLocked(s, c), status: isLocked(s, c) ? "locked" : s[c].status }]),
        );
    }, 400);
};

export const setChannelEnabled = async ({ channel, enabled }) => {
    try {
        if (channel === "widget") {
            await apiRequest("/api/v1/tenants/widget/configure", {
                method: "POST",
                body: { widgetEnabled: enabled },
            });
        } else if (channel === "telegram") {
            if (enabled) {
                await apiRequest("/api/v1/tenants/activate", { method: "POST" });
            } else {
                await apiRequest("/api/v1/tenants/deactivate", { method: "POST" });
            }
        } else if (channel === "whatsapp") {
            await apiRequest("/api/v1/tenants/whatsapp/configure", {
                method: "POST",
                body: { enabled },
            });
        }
    } catch (err) {
        console.warn(`[setChannelEnabled] Backend toggle failed for ${channel}:`, err?.message);
        throw err;
    }

    const s = load();
    if (s[channel]) {
        s[channel].status = enabled ? "live" : "offline";
    }
    addLog(enabled ? "info" : "warn", channel, `Channel switched ${enabled ? "ON" : "OFF"}`, { event: "channel.toggle", enabled });
    save(s);
    return { channel, enabled };
};

export const TELEGRAM_TOKEN_RE = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/;

export const deployTelegramBot = async ({ token }) => {
    if (!TELEGRAM_TOKEN_RE.test(token.trim())) fail("That doesn't look like a bot token. It should look like 123456789:AA…");
    const s = load();
    const panelUrl = s.panel?.url || "https://mypanel.com/api/v2";
    let detectedUsername = null;

    try {
        const cfgRes = await apiRequest("/api/v1/tenants/configure", {
            method: "POST",
            body: {
                botToken: token.trim(),
                panelApiUrl: panelUrl,
            },
        });
        if (cfgRes?.botUsername) {
            detectedUsername = cfgRes.botUsername;
        }
        await apiRequest("/api/v1/tenants/activate", { method: "POST" });
    } catch (err) {
        console.warn("Backend Telegram deploy error:", err.message);
        if (err.message && !err.message.includes("Can't reach") && !err.message.includes("offline")) {
            fail(err.message);
        }
    }

    if (!detectedUsername) {
        try {
            const testRes = await apiRequest("/api/v1/tenants/telegram/test");
            if (testRes?.botUsername) {
                detectedUsername = testRes.botUsername;
            }
        } catch (_) {}
    }

    Object.assign(s.telegram, {
        status: "live",
        username: detectedUsername,
        deployedAt: now(),
        lastActivity: now(),
        tokenLast4: token.slice(-4),
        token: token.trim(),
    });
    addLog("info", "telegram", `Bot @${detectedUsername || 'live'} deployed and polling for messages`, {
        event: "bot.deployed",
        token_last4: token.slice(-4),
        username: detectedUsername,
    });
    save(s);
    return s.telegram;
};

export const refreshTelegramStatus = async () => {
    const s = load();
    try {
        const testRes = await apiRequest("/api/v1/tenants/telegram/test");
        if (testRes?.botUsername) {
            s.telegram.username = testRes.botUsername;
        }
        if (testRes && typeof testRes.isRunning === "boolean") {
            s.telegram.status = testRes.isRunning ? "live" : (s.telegram.status || "live");
        }
        save(s);
    } catch (e) {
        console.warn("refreshTelegramStatus error:", e?.message);
    }
    return s.telegram;
};

export const testBot = async () => {
    const s = load();
    if (s.telegram.status !== "live") fail("Start the bot before sending a test message.");
    try {
        const res = await apiRequest("/api/v1/tenants/telegram/test");
        if (res?.botUsername) {
            s.telegram.username = res.botUsername;
        }
        s.telegram.lastActivity = now();
        s.onboarding.testSent = true;
        addLog("info", "telegram", `Test checked (${res.botUsername ? '@' + res.botUsername : 'active'})`, { event: "bot.test", delivered: true });
        save(s);
        return { message: res.message || `Bot @${res.botUsername || s.telegram.username || "support"} is verified and active.` };
    } catch (err) {
        s.telegram.lastActivity = now();
        s.onboarding.testSent = true;
        addLog("info", "telegram", `Test checked (${err.message})`, { event: "bot.test" });
        save(s);
        return { message: `Bot test completed: ${err.message}` };
    }
};

export const stopBot = async () => {
    try {
        await apiRequest("/api/v1/tenants/deactivate", { method: "POST" });
    } catch (e) {
        console.warn("Backend deactivate:", e?.message);
    }
    const s = load();
    s.telegram.status = "offline";
    addLog("warn", "telegram", "Bot stopped by owner", { event: "bot.stopped" });
    save(s);
};

export const startBot = async () => {
    try {
        await apiRequest("/api/v1/tenants/activate", { method: "POST" });
    } catch (e) {
        console.warn("Backend activate:", e?.message);
    }
    const s = load();
    if (s.telegram.status === "not_setup") fail("Deploy the bot first.");
    s.telegram.status = "live";
    s.telegram.lastActivity = now();
    addLog("info", "telegram", "Bot restarted", { event: "bot.started" });
    save(s);
};

export const markShared = () =>
    call((s) => {
        s.onboarding.shared = true;
    }, 100);

export const startWhatsAppSession = async () => {
    try {
        const s = load();
        const panelUrl = s.panel?.url || "https://indianprovider.com/api/v2";
        const res = await apiRequest("/api/v1/tenants/whatsapp/start", {
            method: "POST",
            body: { mode: "qr", panelApiUrl: panelUrl },
        });
        s.whatsapp.status = res.connected ? "live" : "pending";
        if (res.connected && res.phoneNumber) {
            s.whatsapp.number = res.phoneNumber;
        }
        s.whatsapp.qr = {
            value: res.lastQR || res.qrDataUrl || `ysmm-wa-session`,
            qrDataUrl: res.qrDataUrl || null,
            createdAt: now(),
            expiresAt: now() + 60_000,
        };
        addLog("info", "whatsapp", "Linking session started — waiting for QR scan", { event: "wa.session_started" });
        save(s);
        return s.whatsapp.qr;
    } catch (err) {
        console.warn("Backend WA start session failed:", err?.message);
        fail(err.message || "Failed to start WhatsApp linking session");
    }
};

export const getWhatsAppQR = async () => {
    try {
        const res = await apiRequest("/api/v1/tenants/whatsapp/status");
        if (res && res.qrDataUrl) {
            const s = load();
            s.whatsapp.qr = {
                value: res.lastQR || res.qrDataUrl,
                qrDataUrl: res.qrDataUrl,
                createdAt: now(),
                expiresAt: now() + 60_000,
            };
            save(s);
            return s.whatsapp.qr;
        }
    } catch (_) {}
    return call((s) => {
        const qr = s.whatsapp.qr;
        if (!qr) fail("No active linking session. Click Generate QR.");
        return { ...qr, expired: now() > qr.expiresAt };
    }, 250);
};

export const getWhatsAppStatus = async () => {
    try {
        const res = await apiRequest("/api/v1/tenants/whatsapp/status");
        const s = load();
        if (res && res.connected) {
            Object.assign(s.whatsapp, {
                status: "live",
                number: res.phoneNumber || s.whatsapp.number || null,
                connectedAt: s.whatsapp.connectedAt || now(),
                lastActivity: now(),
                qr: null,
            });
            save(s);
            return { ...s.whatsapp };
        } else if (res && res.qrDataUrl) {
            s.whatsapp.status = "pending";
            s.whatsapp.qr = {
                value: res.lastQR || res.qrDataUrl,
                qrDataUrl: res.qrDataUrl,
                createdAt: now(),
                expiresAt: now() + 60_000,
            };
            save(s);
            return { ...s.whatsapp };
        } else if (res && !res.connected && s.whatsapp.status === "live") {
            s.whatsapp.status = "offline";
            save(s);
            return { ...s.whatsapp };
        }
    } catch (e) {
        // fallback
    }
    return call((s) => {
        return { ...s.whatsapp };
    }, 250);
};

export const sendWhatsAppTest = async () => {
    const s = load();
    if (s.whatsapp.status !== "live") fail("Connect WhatsApp before sending a test.");
    try {
        const res = await apiRequest("/api/v1/tenants/whatsapp/test", { method: "POST" });
        s.whatsapp.lastActivity = now();
        s.onboarding.testSent = true;
        addLog("info", "whatsapp", res.message || `Test message sent to ${s.whatsapp.number}`, { event: "wa.test" });
        save(s);
        return { message: res.message || `WhatsApp is active and connected as ${s.whatsapp.number}.` };
    } catch (err) {
        s.whatsapp.lastActivity = now();
        s.onboarding.testSent = true;
        addLog("info", "whatsapp", `WhatsApp test checked (${err.message})`, { event: "wa.test" });
        save(s);
        throw err;
    }
};

export const disconnectWhatsApp = async () => {
    try {
        await apiRequest("/api/v1/tenants/whatsapp/disconnect", {
            method: "POST",
            body: { clearCredentials: true },
        });
    } catch (e) {
        console.warn("Backend WA disconnect:", e?.message);
    }
    const s = load();
    Object.assign(s.whatsapp, { status: "not_setup", number: null, connectedAt: null, qr: null });
    addLog("warn", "whatsapp", "WhatsApp session disconnected", { event: "wa.disconnected" });
    save(s);
};

export const getWidgetConfig = async () => {
    try {
        const res = await apiRequest("/api/v1/tenants/widget/settings");
        if (res) {
            const s = load();
            return {
                status: res.widgetEnabled ? "live" : "offline",
                tenantId: res.tenantId || s.tenantId,
                panelUrl: res.panelApiUrl || s.panel.url,
                config: {
                    color: res.widgetAccentColor || "#4F46E5",
                    logo: null,
                    title: res.widgetTitle || "Support",
                    welcome: res.widgetWelcomeMessage || "Hi! How can we help with your orders today?",
                    position: "right",
                    language: "en",
                },
            };
        }
    } catch (e) {
        // fallback
    }
    return call((s) => ({ ...s.widget, tenantId: s.tenantId, panelUrl: s.panel.url }), 400);
};

export const saveWidgetConfig = async (config) => {
    if (!/^#[0-9a-f]{6}$/i.test(config.color)) fail("Brand colour must be a hex value like #4F46E5.");
    if (!config.welcome.trim()) fail("Welcome message can't be empty.");
    try {
        await apiRequest("/api/v1/tenants/widget/configure", {
            method: "POST",
            body: {
                widgetTitle: config.title,
                widgetAccentColor: config.color,
                widgetWelcomeMessage: config.welcome,
                widgetEnabled: true,
            },
        });
    } catch (e) {
        console.warn("Backend widget save:", e?.message);
    }
    const s = load();
    s.widget.config = config;
    s.widget.configSavedAt = now();
    addLog("info", "widget", "Widget appearance updated", { event: "widget.config_saved", position: config.position, language: config.language });
    save(s);
    return s.widget.config;
};

export const verifyWidgetInstall = () =>
    call((s) => {
        if (!s.panel.connected) fail("Connect your SMM panel first so we know which site to check.");
        const host = new URL(s.panel.url).hostname;
        Object.assign(s.widget, { status: "live", installedAt: now(), lastActivity: now() });
        addLog("info", "widget", `Widget detected on ${host}`, { event: "widget.verified", host });
        return { message: `Widget detected on ${host} — it's live!` };
    }, 1500);

/* ------------------------------------------------------------------ */
/* SMM panel                                                           */
/* ------------------------------------------------------------------ */
export const PANEL_URL_RE = /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[^\s]*)?$/i;

function checkPanel({ url, apiKey }) {
    if (!PANEL_URL_RE.test(url.trim())) fail("Panel API URL must start with https:// — e.g. https://mypanel.com/api/v2");
    if (apiKey.trim().length < 8) fail("API key looks too short. Copy it from your panel's API page.");
    if (/fail/i.test(url)) fail("401 Unauthorized — your panel rejected this API key.");
    const host = new URL(url.trim()).hostname.replace(/^www\./, "");
    return { name: host.split(".")[0], services: 0, balance: 0, latencyMs: 120 };
}

export const getPanel = async () => {
    try {
        const data = await apiRequest("/api/v1/tenants/panel");
        if (data && typeof data === "object") {
            const s = load();
            s.panel = {
                url: data.url || "",
                apiKeyLast4: data.apiKeyLast4 || "",
                connected: Boolean(data.connected),
                lastSync: data.lastSync ? new Date(data.lastSync).getTime() : null,
                name: data.name,
                services: data.services || 0,
            };
            save(s);
            return s.panel;
        }
    } catch (e) {
        console.warn("Backend getPanel error:", e?.message);
    }
    return call((s) => s.panel, 400);
};

export const testPanelConnection = async (input) => {
    try {
        const data = await apiRequest("/api/v1/tenants/panel/test", {
            method: "POST",
            body: {
                url: input.url.trim(),
                apiKey: input.apiKey ? input.apiKey.trim() : undefined,
            },
        });
        addLog("info", "panel", `Connection test passed (${data.latencyMs} ms)`, { event: "panel.test", ok: true });
        return {
            ok: true,
            name: data.name,
            balance: data.balance,
            currency: data.currency,
            services: data.services,
            latencyMs: data.latencyMs,
        };
    } catch (e) {
        addLog("error", "panel", `Connection test failed: ${e.message}`, { event: "panel.test", ok: false });
        throw e;
    }
};

export const connectPanel = async (input) => {
    try {
        const data = await apiRequest("/api/v1/tenants/panel/connect", {
            method: "POST",
            body: {
                url: input.url.trim(),
                apiKey: input.apiKey ? input.apiKey.trim() : undefined,
            },
        });
        const s = load();
        s.panel = {
            url: data.url || input.url.trim(),
            apiKeyLast4: data.apiKeyLast4 || (input.apiKey ? input.apiKey.trim().slice(-4) : s.panel.apiKeyLast4),
            connected: true,
            lastSync: data.lastSync ? new Date(data.lastSync).getTime() : now(),
            name: data.name,
            services: data.services || 0,
        };
        addLog("info", "panel", `Panel connected — ${s.panel.services} services synced`, { event: "panel.connected", services: s.panel.services });
        save(s);
        return s.panel;
    } catch (e) {
        addLog("error", "panel", `Panel connection failed: ${e.message}`, { event: "panel.connected", ok: false });
        throw e;
    }
};

export const syncPanel = async () => {
    try {
        const data = await apiRequest("/api/v1/tenants/panel/sync", {
            method: "POST",
        });
        const s = load();
        s.panel.lastSync = data.lastSync ? new Date(data.lastSync).getTime() : now();
        s.panel.services = data.services !== undefined ? data.services : s.panel.services;
        addLog("info", "panel", `Synced ${s.panel.services} services`, { event: "panel.synced" });
        save(s);
        return s.panel;
    } catch (e) {
        addLog("error", "panel", `Panel sync failed: ${e.message}`, { event: "panel.synced", ok: false });
        throw e;
    }
};

export const disconnectPanel = async () => {
    try {
        await apiRequest("/api/v1/tenants/panel/disconnect", {
            method: "POST",
        });
    } catch (e) {
        console.warn("Backend panel disconnect:", e?.message);
    }
    const s = load();
    s.panel = { url: "", apiKeyLast4: "", connected: false, lastSync: null, name: null, services: 0 };
    addLog("warn", "panel", "Panel disconnected", { event: "panel.disconnected" });
    save(s);
    return s.panel;
};

/* ------------------------------------------------------------------ */
/* Conversations (Live inbox)                                          */
/* ------------------------------------------------------------------ */
export const getConversations = async ({ channel = "all", status = "all", unread = false, search = "" } = {}) => {
    try {
        const params = new URLSearchParams();
        if (channel !== "all") params.set("channel", channel);
        if (search) params.set("search", search);
        const data = await apiRequest(`/api/v1/tenants/conversations?${params.toString()}`);
        const items = Array.isArray(data) ? data : (Array.isArray(data?.conversations) ? data.conversations : []);
        if (items.length >= 0) {
            let res = items;
            if (status !== "all") res = res.filter((c) => c.status === status);
            if (unread) res = res.filter((c) => c.unread);
            const s = load();
            s.conversations = items;
            save(s);
            return res;
        }
    } catch (e) {
        console.warn("Backend getConversations error:", e?.message);
    }
    return [];
};

export const getConversation = async (id) => {
    try {
        const data = await apiRequest(`/api/v1/tenants/conversations/${id}`);
        if (data && data.id) {
            return data;
        }
    } catch (e) {
        console.warn("Backend getConversation error:", e?.message);
    }
    return call((s) => {
        const c = (s.conversations || []).find((x) => x.id === id);
        if (!c) fail("Conversation not found.");
        c.unread = false;
        return c;
    }, 350);
};

function mutateConv(s, id, fn) {
    const c = (s.conversations || []).find((x) => x.id === id);
    if (!c) fail("Conversation not found.");
    fn(c);
    return c;
}

export const takeOverConversation = async (id) => {
    try {
        await apiRequest(`/api/v1/tenants/conversations/${id}/takeover`, {
            method: "POST",
        });
    } catch (e) {
        console.warn("Backend takeOverConversation error:", e?.message);
    }
    return call((s) =>
        mutateConv(s, id, (c) => {
            c.status = "human";
            c.messages.push({ id: uid(), from: "system", text: "You took over from the AI", at: now() });
            addLog("info", c.channel, `Owner took over conversation with ${c.customer.name}`, { event: "conversation.takeover", conversation_id: id });
        }),
    300);
};

export const handBackConversation = async (id) => {
    try {
        await apiRequest(`/api/v1/tenants/conversations/${id}/handback`, {
            method: "POST",
        });
    } catch (e) {
        console.warn("Backend handBackConversation error:", e?.message);
    }
    return call((s) =>
        mutateConv(s, id, (c) => {
            c.status = "ai";
            c.messages.push({ id: uid(), from: "system", text: "Handed back to the AI", at: now() });
            addLog("info", c.channel, `Conversation with ${c.customer.name} handed back to AI`, { event: "conversation.handback", conversation_id: id });
        }),
    300);
};

export const sendReply = async ({ id, text }) => {
    if (!text.trim()) fail("Message can't be empty.");
    try {
        const res = await apiRequest(`/api/v1/tenants/conversations/${id}/reply`, {
            method: "POST",
            body: { text: text.trim() },
        });
        const s = load();
        const c = (s.conversations || []).find((x) => x.id === id);
        if (c) {
            c.messages.push(res.message || { id: uid(), from: "agent", text: text.trim(), at: now() });
            c.lastAt = now();
            save(s);
        }
        return res;
    } catch (e) {
        console.warn("Backend sendReply error:", e?.message);
        throw e;
    }
};

/* ------------------------------------------------------------------ */
/* AI & knowledge                                                      */
/* ------------------------------------------------------------------ */
export const getAISettings = async () => {
    try {
        const res = await apiRequest("/api/v1/tenants/ai");
        if (res && res.tone) {
            const s = load();
            s.ai = res;
            save(s);
            return res;
        }
    } catch (e) {
        console.warn("Backend getAISettings fallback:", e?.message);
    }
    return call((s) => s.ai, 450);
};

export const saveAISettings = async (ai) => {
    if (ai.hours?.enabled && ai.hours?.start && ai.hours?.end && ai.hours.start >= ai.hours.end) {
        fail("Business hours: the end time must be after the start time.");
    }
    try {
        const res = await apiRequest("/api/v1/tenants/ai", {
            method: "PATCH",
            body: ai,
        });
        if (res && res.tone) {
            const s = load();
            s.ai = { ...res, faqs: s.ai?.faqs || [] };
            addLog("info", "system", "AI settings updated", { event: "ai.settings_saved", tone: ai.tone });
            save(s);
            return res;
        }
    } catch (e) {
        if (e instanceof AppApiError) throw e;
        console.warn("Backend saveAISettings fallback:", e?.message);
    }
    return call((s) => {
        s.ai = { ...ai, faqs: s.ai.faqs };
        addLog("info", "system", "AI settings updated", { event: "ai.settings_saved", tone: ai.tone });
        return s.ai;
    }, 800);
};

export const addFaq = async ({ question, answer }) => {
    if (!question.trim() || !answer.trim()) fail("Both a question and an answer are required.");
    try {
        const res = await apiRequest("/api/v1/tenants/ai/faqs", {
            method: "POST",
            body: { question: question.trim(), answer: answer.trim() },
        });
        if (res && res.id) {
            const s = load();
            if (s.ai && Array.isArray(s.ai.faqs)) {
                s.ai.faqs.push(res);
                save(s);
            }
            return res;
        }
    } catch (e) {
        if (e instanceof AppApiError) throw e;
        console.warn("Backend addFaq fallback:", e?.message);
    }
    return call((s) => {
        const faq = { id: uid(), question: question.trim(), answer: answer.trim() };
        s.ai.faqs.push(faq);
        return faq;
    }, 500);
};

export const updateFaq = async ({ id, question, answer }) => {
    if (!question.trim() || !answer.trim()) fail("Both a question and an answer are required.");
    try {
        const res = await apiRequest(`/api/v1/tenants/ai/faqs/${id}`, {
            method: "PUT",
            body: { question: question.trim(), answer: answer.trim() },
        });
        if (res && res.id) {
            const s = load();
            if (s.ai && Array.isArray(s.ai.faqs)) {
                const idx = s.ai.faqs.findIndex((x) => x.id === id);
                if (idx !== -1) s.ai.faqs[idx] = res;
                save(s);
            }
            return res;
        }
    } catch (e) {
        if (e instanceof AppApiError) throw e;
        console.warn("Backend updateFaq fallback:", e?.message);
    }
    return call((s) => {
        const f = s.ai.faqs.find((x) => x.id === id);
        if (!f) fail("FAQ not found.");
        Object.assign(f, { question: question.trim(), answer: answer.trim() });
        return f;
    }, 500);
};

export const deleteFaq = async (id) => {
    try {
        await apiRequest(`/api/v1/tenants/ai/faqs/${id}`, {
            method: "DELETE",
        });
        const s = load();
        if (s.ai && Array.isArray(s.ai.faqs)) {
            s.ai.faqs = s.ai.faqs.filter((x) => x.id !== id);
            save(s);
        }
        return { success: true };
    } catch (e) {
        console.warn("Backend deleteFaq fallback:", e?.message);
    }
    return call((s) => {
        s.ai.faqs = s.ai.faqs.filter((x) => x.id !== id);
    }, 500);
};

/** Sandbox: answers with the given (possibly unsaved) settings via real AiAgentService */
export const testAI = async ({ message, settings }) => {
    try {
        const res = await apiRequest("/api/v1/tenants/ai/test", {
            method: "POST",
            body: { message, settings },
        });
        if (res && res.reply) {
            return res;
        }
    } catch (e) {
        console.warn("Backend testAI fallback:", e?.message);
    }
    // Fallback sandbox simulation
    return call(() => {
        const m = message.toLowerCase();
        const a = settings.actions;
        const handoff = "I'll pass this to a human teammate who will reply shortly.";
        const words = (t) => t.toLowerCase().match(/[a-z]{4,}/g) || [];
        const faq = (settings.faqs || []).find((f) => words(f.question).filter((w) => m.includes(w)).length >= 2);
        const keywords = (settings.escalation?.keywords || "").split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
        let reply;
        if (keywords.some((k) => m.includes(k))) reply = handoff;
        else if (faq) reply = faq.answer;
        else if (/balance|funds/.test(m)) reply = a.balance ? "Your current balance is $24.50." : handoff;
        else if (/service|price|rate|cheap/.test(m)) reply = a.services ? "Instagram Followers (HQ) are $1.20 per 1,000 and TikTok Views are $0.08 per 1,000. Want the full list?" : handoff;
        else if (/refill/.test(m)) reply = a.refill ? "Done — a refill for order #48213 has been requested. Refills usually start within 24 hours." : handoff;
        else if (/cancel/.test(m)) reply = a.cancel ? "Order #48213 has been cancelled and $3.60 refunded to your balance." : handoff;
        else if (/order|status|#\d+/.test(m)) reply = a.orderStatus ? "Order #48213 is In progress — 3,200 of 5,000 delivered." : handoff;
        else {
            const can = [a.balance && "balance", a.services && "services & prices", a.orderStatus && "order status", a.refill && "refills", a.cancel && "cancellations"].filter(Boolean);
            reply = `I can help with ${can.join(", ") || "general questions"}. What do you need?`;
        }
        const prefix = { friendly: "Sure thing! ", professional: "Certainly. ", short: "" }[settings.tone] ?? "";
        if (settings.tone === "short") reply = reply.split(/(?<=[.!?])\s/)[0];
        return { reply: reply === handoff ? reply : prefix + reply, escalated: reply === handoff };
    }, 900);
};

/* ------------------------------------------------------------------ */
/* Logs                                                                */
/* ------------------------------------------------------------------ */
export const getLogs = async ({ level = "all", channel = "all", range = "24h", search = "", live = false } = {}) => {
    try {
        const params = new URLSearchParams();
        if (level !== "all") params.set("level", level);
        if (channel !== "all") params.set("channel", channel);
        if (search) params.set("search", search);
        const res = await apiRequest(`/api/v1/tenants/logs?${params.toString()}`);
        if (res && Array.isArray(res.logs)) {
            return res.logs.map((l) => ({
                id: l.id,
                at: new Date(l.timestamp || l.createdAt).getTime(),
                level: l.level || "info",
                channel: l.channel || "system",
                message: l.message,
                raw: l.details || {},
            }));
        }
    } catch (e) {
        // fallback to state logs
    }
    return call((s) => {
        const since = now() - { "1h": HOUR, "24h": DAY, "7d": 7 * DAY, "30d": 30 * DAY }[range];
        const q = search.trim().toLowerCase();
        return (s.logs || [])
            .filter((l) => l.at >= since)
            .filter((l) => level === "all" || l.level === level)
            .filter((l) => channel === "all" || l.channel === channel)
            .filter((l) => !q || l.message.toLowerCase().includes(q) || JSON.stringify(l.raw).toLowerCase().includes(q));
    }, live ? 150 : 450);
};

/* ------------------------------------------------------------------ */
/* Billing                                                             */
/* ------------------------------------------------------------------ */
export const getBilling = async () => {
    try {
        const summary = await apiRequest("/api/v1/billing/summary");
        if (summary && summary.success) {
            const plan = PLANS.find((p) => p.id === summary.planId) || PLANS[1]; // Pro default
            return {
                plan,
                subscriptionStatus: summary.subscriptionStatus,
                subscriptionExpiresAt: summary.subscriptionExpiresAt,
                trial: summary.isTrial,
                trialEndsAt: summary.trialEndsAt,
                cycle: "monthly",
                plans: PLANS,
                usage: [
                    { id: "conversations", label: "Conversations this month", used: summary.usage?.conversations || 0, limit: plan.limits.conversations },
                    { id: "lookups", label: "Panel lookups", used: summary.usage?.lookups || 0, limit: plan.limits.lookups },
                    { id: "channels", label: "Active channels", used: summary.usage?.activeChannels || 0, limit: plan.channels.length },
                ],
                invoices: Array.isArray(summary.invoices) ? summary.invoices : [],
            };
        }
    } catch (e) {
        console.warn("Backend getBilling summary error:", e?.message);
    }

    const defaultPlan = PLANS[1];
    return {
        plan: defaultPlan,
        subscriptionStatus: "INACTIVE",
        trial: true,
        trialEndsAt: Date.now() + 14 * DAY,
        cycle: "monthly",
        plans: PLANS,
        usage: [
            { id: "conversations", label: "Conversations this month", used: 0, limit: defaultPlan.limits.conversations },
            { id: "lookups", label: "Panel lookups", used: 0, limit: defaultPlan.limits.lookups },
            { id: "channels", label: "Active channels", used: 0, limit: defaultPlan.channels.length },
        ],
        invoices: [],
    };
};

export const createBillingInvoice = async ({ channels, durationMonths = 1 }) => {
    if (!channels || !channels.length) fail("Please select at least one channel.");
    try {
        const data = await apiRequest("/api/v1/billing/invoices", {
            method: "POST",
            body: { channels, durationMonths: Number(durationMonths) || 1 },
        });
        return data?.invoice || data;
    } catch (err) {
        fail(err.message || "Failed to create payment invoice.");
    }
};

export const checkInvoiceStatus = async (orderId) => {
    if (!orderId) fail("Order ID is required.");
    try {
        const data = await apiRequest(`/api/v1/billing/invoices/${encodeURIComponent(orderId)}`);
        return data?.invoice || data;
    } catch (err) {
        fail(err.message || "Unable to check invoice status.");
    }
};

export const simulateMockPayment = async (orderId) => {
    if (!orderId) fail("Order ID is required.");
    try {
        const res = await apiRequest(`/api/v1/billing/mock-pay/${encodeURIComponent(orderId)}`, {
            method: "POST",
        });
        return res;
    } catch (err) {
        fail(err.message || "Sandbox payment simulation failed.");
    }
};

export const changePlan = async ({ planId, cycle }) => {
    const plan = PLANS.find((p) => p.id === planId) || PLANS[1];
    const durationMonths = cycle === "yearly" ? 12 : 1;
    return createBillingInvoice({
        channels: plan.channels,
        durationMonths,
    });
};

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */
export const VERIFY_COOLDOWN_MS = 60_000;

export const getSettings = async () => {
    try {
        const data = await apiRequest("/api/v1/tenants/settings");
        if (data && data.tenantId) {
            return data;
        }
    } catch (e) {
        console.warn("Backend getSettings error:", e?.message);
        throw e;
    }
    throw new Error("Unable to retrieve account settings");
};

export const saveProfile = async ({ name }) => {
    if (!name || name.trim().length > 60) fail("Name must be 60 characters or fewer.");
    try {
        const res = await apiRequest("/api/v1/tenants/settings/profile", {
            method: "PATCH",
            body: { name: name.trim() }
        });
        return res;
    } catch (err) {
        fail(err.message || "Failed to save profile");
    }
};

export const resendVerification = async () => {
    try {
        const res = await apiRequest("/api/v1/auth/resend-verification", { method: "POST" });
        return { sentAt: Date.now(), ...res };
    } catch (e) {
        fail(e.message || "Failed to dispatch verification email");
    }
};

export const changePassword = async ({ current, next }) => {
    if (!current) fail("Enter your current password.");
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) fail("New password needs 8+ characters with a letter and a number.");
    if (next === current) fail("New password must be different from the current one.");
    try {
        const res = await apiRequest("/api/v1/auth/change-password", {
            method: "POST",
            body: { current, next },
        });
        return res;
    } catch (err) {
        fail(err.message || "Failed to update password");
    }
};

export const setTwoFactor = async (enabled) => {
    try {
        const res = await apiRequest("/api/v1/tenants/settings/2fa", {
            method: "PATCH",
            body: { enabled: Boolean(enabled) }
        });
        return res;
    } catch (err) {
        fail(err.message || "Failed to update two-factor authentication");
    }
};

export const setupTwoFactor = async () => {
    try {
        const res = await apiRequest("/api/v1/auth/mfa/setup", {
            method: "POST"
        });
        return res;
    } catch (err) {
        fail(err.message || "Failed to initialize two-factor setup");
    }
};

export const enableTwoFactor = async ({ code }) => {
    if (!code || !/^\d{6}$/.test(code.trim())) {
        fail("Please enter a valid 6-digit verification code.");
    }
    try {
        const res = await apiRequest("/api/v1/auth/mfa/enable", {
            method: "POST",
            body: { code: code.trim() }
        });
        return res;
    } catch (err) {
        fail(err.message || "Failed to verify and activate two-factor authentication");
    }
};

export const disableTwoFactor = async ({ passwordOrCode }) => {
    if (!passwordOrCode) {
        fail("Password or verification code is required.");
    }
    try {
        const res = await apiRequest("/api/v1/auth/mfa/disable", {
            method: "POST",
            body: { passwordOrCode }
        });
        return res;
    } catch (err) {
        fail(err.message || "Failed to disable two-factor authentication");
    }
};

export const saveNotifications = async (prefs) => {
    try {
        const res = await apiRequest("/api/v1/tenants/settings/notifications", {
            method: "PATCH",
            body: prefs
        });
        return res;
    } catch (err) {
        fail(err.message || "Failed to save notifications");
    }
};

export const regenerateApiKey = async (_id) => {
    try {
        const keyData = await apiRequest("/api/v1/tenants/settings/api-key/regenerate", {
            method: "POST"
        });
        return keyData;
    } catch (err) {
        fail(err.message || "Failed to regenerate API key");
    }
};

export const deleteAccount = async ({ password } = {}) => {
    if (!password) fail("Password is required to delete your account.");
    try {
        await apiRequest("/api/v1/tenants/me", {
            method: "DELETE",
            body: { password },
        });
    } catch (e) {
        fail(e.message || "Failed to delete account");
    }
    localStorage.removeItem(storageKey());
    tokenStore.clear();
};

/* ------------------------------------------------------------------ */
/* Seed data (Disabled in production)                                  */
/* ------------------------------------------------------------------ */
function seedConversations() {
    return [];
}

/* ------------------------------------------------------------------ */
/* Support tickets                                                     */
/*   getTickets(f)    GET   /tickets?status=&q=                        */
/*   getTicket(id)    GET   /tickets/:id                               */
/*   createTicket     POST  /tickets   { subject, category, priority, message } */
/*   replyTicket      POST  /tickets/:id/replies  { message }          */
/*   closeTicket      POST  /tickets/:id/close                         */
/*   reopenTicket     POST  /tickets/:id/reopen                        */
/* ------------------------------------------------------------------ */
export const TICKET_CATEGORIES = [
    { value: "technical", label: "Technical issue" },
    { value: "channel", label: "Channel setup (Telegram / WhatsApp / Widget)" },
    { value: "panel", label: "SMM panel connection" },
    { value: "billing", label: "Billing & plans" },
    { value: "feature", label: "Feature request" },
    { value: "other", label: "Other" },
];
export const TICKET_PRIORITIES = [
    { value: "low", label: "Low" },
    { value: "normal", label: "Normal" },
    { value: "high", label: "High" },
    { value: "urgent", label: "Urgent" },
];

const ticketSummary = ({ messages, ...t }) => ({ ...t, replies: messages.length, preview: messages[messages.length - 1].text });

function findTicket(s, id) {
    const t = (s.tickets || []).find((x) => x.id === id);
    if (!t) fail("Ticket not found.");
    return t;
}

export const getTickets = async ({ status = "all", search = "" } = {}) => {
    try {
        const params = new URLSearchParams();
        if (status && status !== "all") params.set("status", status);
        if (search) params.set("search", search);
        const data = await apiRequest(`/api/v1/tenants/tickets?${params.toString()}`);
        if (Array.isArray(data)) {
            return data;
        }
    } catch (e) {
        console.warn("Backend getTickets error:", e?.message);
    }
    return [];
};

export const getTicket = async (id) => {
    try {
        const data = await apiRequest(`/api/v1/tenants/tickets/${encodeURIComponent(id)}`);
        if (data && data.id) {
            if (typeof window !== "undefined") {
                window.dispatchEvent(new Event("tenant-ticket-read"));
            }
            return data;
        }
    } catch (e) {
        console.warn("Backend getTicket error:", e?.message);
        throw e;
    }
    fail("Ticket not found.");
};

export const createTicket = async ({ subject, category, priority, message }) => {
    return apiRequest("/api/v1/tenants/tickets", {
        method: "POST",
        body: { subject, category, priority, message }
    });
};

export const replyTicket = async ({ id, message }) => {
    return apiRequest(`/api/v1/tenants/tickets/${encodeURIComponent(id)}/reply`, {
        method: "POST",
        body: { message }
    });
};

export const closeTicket = async (id) => {
    return apiRequest(`/api/v1/tenants/tickets/${encodeURIComponent(id)}/close`, {
        method: "POST"
    });
};

export const reopenTicket = async (id) => {
    return apiRequest(`/api/v1/tenants/tickets/${encodeURIComponent(id)}/reopen`, {
        method: "POST"
    });
};

export const getUnreadTicketCount = async () => {
    try {
        const data = await apiRequest("/api/v1/tenants/tickets/unread-count");
        if (data && typeof data.unreadCount === "number") {
            return data.unreadCount;
        }
    } catch (e) {
        console.warn("Backend getUnreadTicketCount error:", e?.message);
    }
    return 0;
};
