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
const isLocked = (s, ch) => !planOf(s).channels.includes(ch);

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
            save(s);
            return {
                tenantId: me.id,
                email: me.email,
                emailVerified: Boolean(me.emailVerified),
                verificationSentAt: null,
                plan: PLANS.find((p) => p.id === (me.subscriptionStatus === "ACTIVE" ? "pro" : "starter")) || PLANS[1],
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
            if (me.whatsAppPhoneNumber || me.hasWhatsapp) {
                s.whatsapp.status = "live";
                s.whatsapp.number = me.whatsAppPhoneNumber || null;
            }
            if (me.hasWidget || me.widgetEnabled) {
                s.widget.status = "live";
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

export const setChannelEnabled = ({ channel, enabled }) =>
    call((s) => {
        if (!isSetUp(s, channel)) fail("Finish setting up this channel first.");
        s[channel].status = enabled ? "live" : "offline";
        addLog(enabled ? "info" : "warn", channel, `Channel switched ${enabled ? "ON" : "OFF"}`, { event: "channel.toggle", enabled });
    });

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
        const res = await apiRequest("/api/v1/tenants/whatsapp/start", {
            method: "POST",
            body: { mode: "qr" },
        });
        const s = load();
        s.whatsapp.status = "pending";
        s.whatsapp.qr = {
            value: res.qr || res.qrDataUrl || `ysmm-wa-session`,
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

export const getWhatsAppQR = () =>
    call((s) => {
        const qr = s.whatsapp.qr;
        if (!qr) fail("No active linking session. Click Generate QR.");
        return { ...qr, expired: now() > qr.expiresAt };
    }, 250);

export const getWhatsAppStatus = async () => {
    try {
        const res = await apiRequest("/api/v1/tenants/whatsapp/status");
        const s = load();
        if (res && res.connected) {
            Object.assign(s.whatsapp, {
                status: "live",
                number: res.phoneNumber || res.number || null,
                connectedAt: now(),
                lastActivity: now(),
                qr: null,
            });
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

export const sendWhatsAppTest = () =>
    call((s) => {
        if (s.whatsapp.status !== "live") fail("Connect WhatsApp before sending a test.");
        s.whatsapp.lastActivity = now();
        s.onboarding.testSent = true;
        addLog("info", "whatsapp", `Test message sent to ${s.whatsapp.number}`, { event: "wa.test" });
        return { message: `Test message sent to ${s.whatsapp.number}.` };
    }, 1000);

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
                status: res.widgetEnabled ? "live" : "not_setup",
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
        const me = await authApi.me();
        if (me && me.panelApiUrl) {
            const s = load();
            s.panel.url = me.panelApiUrl;
            s.panel.connected = true;
            s.panel.name = new URL(me.panelApiUrl).hostname.replace(/^www\./, "").split(".")[0];
            save(s);
        }
    } catch (e) {
        // fallback
    }
    return call((s) => s.panel, 400);
};

export const testPanelConnection = (input) =>
    call((s) => {
        try {
            const info = checkPanel(input);
            addLog("info", "panel", `Connection test passed (${info.latencyMs} ms)`, { event: "panel.test", ok: true });
            return { ok: true, ...info };
        } catch (e) {
            addLog("error", "panel", `Connection test failed: ${e.message}`, { event: "panel.test", ok: false });
            throw e;
        }
    }, 1200);

export const connectPanel = async (input) => {
    const info = checkPanel(input);
    const s = load();
    const token = s.telegram?.token;
    try {
        if (token) {
            await apiRequest("/api/v1/tenants/configure", {
                method: "POST",
                body: {
                    panelApiUrl: input.url.trim(),
                    botToken: token,
                },
            });
        }
    } catch (e) {
        console.warn("Backend panel configure:", e?.message);
    }

    Object.assign(s.panel, {
        url: input.url.trim(),
        apiKeyLast4: input.apiKey.trim().slice(-4),
        connected: true,
        lastSync: now(),
        name: info.name,
        services: info.services,
    });
    addLog("info", "panel", `Panel connected — ${info.services} services synced`, { event: "panel.connected", services: info.services });
    save(s);
    return s.panel;
};

export const syncPanel = () =>
    call((s) => {
        if (!s.panel.connected) fail("Connect your panel first.");
        s.panel.lastSync = now();
        addLog("info", "panel", `Synced ${s.panel.services} services`, { event: "panel.synced" });
        return s.panel;
    }, 1000);

export const disconnectPanel = () =>
    call((s) => {
        s.panel = { url: "", apiKeyLast4: "", connected: false, lastSync: null, name: null, services: 0 };
        addLog("warn", "panel", "Panel disconnected", { event: "panel.disconnected" });
    }, 800);

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
        const data = await apiRequest("/api/v1/tenants/conversations");
        const items = Array.isArray(data) ? data : (Array.isArray(data?.conversations) ? data.conversations : []);
        const found = items.find((x) => x.id === id);
        if (found) return found;
    } catch (_) {}
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

export const takeOverConversation = (id) =>
    call((s) =>
        mutateConv(s, id, (c) => {
            c.status = "human";
            c.messages.push({ id: uid(), from: "system", text: "You took over from the AI", at: now() });
            addLog("info", c.channel, `Owner took over conversation with ${c.customer.name}`, { event: "conversation.takeover", conversation_id: id });
        }),
    600);

export const handBackConversation = (id) =>
    call((s) =>
        mutateConv(s, id, (c) => {
            c.status = "ai";
            c.messages.push({ id: uid(), from: "system", text: "Handed back to the AI", at: now() });
            addLog("info", c.channel, `Conversation with ${c.customer.name} handed back to AI`, { event: "conversation.handback", conversation_id: id });
        }),
    600);

export const sendReply = ({ id, text }) =>
    call((s) =>
        mutateConv(s, id, (c) => {
            if (c.status !== "human") fail("Take over from the AI before replying.");
            if (!text.trim()) fail("Message can't be empty.");
            c.messages.push({ id: uid(), from: "agent", text: text.trim(), at: now() });
            c.lastAt = now();
        }),
    500);

/* ------------------------------------------------------------------ */
/* AI & knowledge                                                      */
/* ------------------------------------------------------------------ */
export const getAISettings = () => call((s) => s.ai, 450);

export const saveAISettings = (ai) =>
    call((s) => {
        if (ai.hours.enabled && ai.hours.start >= ai.hours.end) fail("Business hours: the end time must be after the start time.");
        s.ai = { ...ai, faqs: s.ai.faqs };
        addLog("info", "system", "AI settings updated", { event: "ai.settings_saved", tone: ai.tone });
        return s.ai;
    }, 800);

export const addFaq = ({ question, answer }) =>
    call((s) => {
        if (!question.trim() || !answer.trim()) fail("Both a question and an answer are required.");
        const faq = { id: uid(), question: question.trim(), answer: answer.trim() };
        s.ai.faqs.push(faq);
        return faq;
    }, 500);

export const updateFaq = ({ id, question, answer }) =>
    call((s) => {
        const f = s.ai.faqs.find((x) => x.id === id);
        if (!f) fail("FAQ not found.");
        if (!question.trim() || !answer.trim()) fail("Both a question and an answer are required.");
        Object.assign(f, { question: question.trim(), answer: answer.trim() });
        return f;
    }, 500);

export const deleteFaq = (id) =>
    call((s) => {
        s.ai.faqs = s.ai.faqs.filter((x) => x.id !== id);
    }, 500);

/** Sandbox: answers with the given (possibly unsaved) settings. */
export const testAI = ({ message, settings }) =>
    call(() => {
        const m = message.toLowerCase();
        const a = settings.actions;
        const handoff = "I'll pass this to a human teammate who will reply shortly.";
        const words = (t) => t.toLowerCase().match(/[a-z]{4,}/g) || [];
        const faq = settings.faqs.find((f) => words(f.question).filter((w) => m.includes(w)).length >= 2);
        const keywords = settings.escalation.keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
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
    let backendInvoices = [];
    try {
        const res = await apiRequest("/api/v1/billing/invoices");
        if (res && Array.isArray(res.invoices)) {
            backendInvoices = res.invoices.map((inv) => ({
                id: inv.orderId || inv.id,
                date: new Date(inv.createdAt).getTime(),
                description: `Subscription · ${inv.plan || "Pro"}`,
                amount: Number(inv.amount) || 49,
                status: inv.status === "PAID" ? "Paid" : (inv.status || "Pending"),
            }));
        }
    } catch (e) {
        // fallback
    }

    return call((s) => {
        const plan = planOf(s);
        const convs = s.trafficSeeded ? 1240 : 0;
        return {
            plan,
            trial: s.trial,
            trialEndsAt: s.trialEndsAt,
            cycle: s.cycle,
            plans: PLANS,
            usage: [
                { id: "conversations", label: "Conversations this month", used: convs, limit: plan.limits.conversations },
                { id: "lookups", label: "Panel lookups", used: convs * 3, limit: plan.limits.lookups },
                { id: "channels", label: "Active channels", used: CHANNELS.filter((c) => s[c].status === "live").length, limit: plan.channels.length },
            ],
            invoices: backendInvoices.length > 0 ? backendInvoices : s.invoices,
        };
    });
};

export const changePlan = ({ planId, cycle }) =>
    call((s) => {
        const plan = PLANS.find((p) => p.id === planId);
        if (!plan) fail("Unknown plan.");
        Object.assign(s, { plan: planId, cycle, trial: false });
        const amount = cycle === "yearly" ? yearlyPrice(plan) : plan.monthly;
        s.invoices.unshift({
            id: `INV-${new Date().getFullYear()}-${String(s.invoices.length + 1).padStart(4, "0")}`,
            date: now(),
            description: `${plan.name} plan · ${cycle}`,
            amount,
            status: "Paid",
        });
        addLog("info", "system", `Plan changed to ${plan.name} (${cycle})`, { event: "billing.plan_changed", plan: planId, cycle });
        return { plan };
    }, 1200);

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */
export const VERIFY_COOLDOWN_MS = 60_000;

export const getSettings = () =>
    call((s) => ({
        ...s.settings,
        emailVerified: s.emailVerified,
        verificationSentAt: s.verificationSentAt,
        tenantId: s.tenantId,
        apiKeys: s.apiKeys,
    }), 400);

export const saveProfile = ({ name }) =>
    call((s) => {
        if (name.trim().length > 60) fail("Name must be 60 characters or fewer.");
        s.settings.name = name.trim();
    }, 700);

export const resendVerification = async () => {
    const s = load();
    if (s.verificationSentAt && now() - s.verificationSentAt < VERIFY_COOLDOWN_MS) fail("Please wait before requesting another email.");
    try {
        await apiRequest("/api/v1/auth/resend-verification", { method: "POST" });
    } catch (e) {
        console.warn("Backend resend verification:", e?.message);
    }
    s.verificationSentAt = now();
    save(s);
    return { sentAt: s.verificationSentAt };
};

/** Demo only — in production the user clicks the link in their inbox. */
export const simulateEmailVerified = () =>
    call((s) => {
        s.emailVerified = true;
        addLog("info", "system", "Email address verified", { event: "account.email_verified" });
    }, 500);

export const changePassword = async ({ current, next }) => {
    if (!current) fail("Enter your current password.");
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) fail("New password needs 8+ characters with a letter and a number.");
    if (next === current) fail("New password must be different from the current one.");
    try {
        await apiRequest("/api/v1/auth/change-password", {
            method: "POST",
            body: { current, next },
        });
    } catch (err) {
        fail(err.message || "Failed to update password");
    }
};

export const setTwoFactor = (enabled) =>
    call((s) => {
        s.settings.twoFA = enabled;
        addLog("info", "system", `Two-factor authentication ${enabled ? "enabled" : "disabled"}`, { event: "account.2fa", enabled });
    }, 700);

export const saveNotifications = (prefs) =>
    call((s) => {
        s.settings.notifications = prefs;
    }, 600);

export const regenerateApiKey = (id) =>
    call((s) => {
        const k = s.apiKeys.find((x) => x.id === id);
        if (!k) fail("Key not found.");
        k.key = k.key.replace(/_[a-z0-9]+$/, `_${rand(k.key.split("_").pop().length)}`);
        k.createdAt = now();
        return k;
    }, 800);

export const deleteAccount = async () => {
    try {
        await apiRequest("/api/v1/tenants/me", {
            method: "DELETE",
            body: { password: "confirmed" },
        });
    } catch (e) {
        console.warn("Backend delete account:", e?.message);
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

export const getTickets = ({ status = "all", search = "" } = {}) =>
    call((s) => {
        const q = search.trim().toLowerCase();
        return (s.tickets || [])
            .filter((t) => status === "all" || t.status === status)
            .filter((t) => !q || `${t.id} ${t.subject}`.toLowerCase().includes(q))
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map(ticketSummary);
    }, 450);

export const getTicket = (id) => call((s) => findTicket(s, id), 350);

export const createTicket = ({ subject, category, priority, message }) =>
    call((s) => {
        if (subject.trim().length < 5) fail("Subject should be at least 5 characters.");
        if (message.trim().length < 10) fail("Please describe the issue in at least 10 characters.");
        s.tickets = s.tickets || [];
        const t0 = now();
        const ticket = {
            id: `TCK-${1001 + s.tickets.length}`,
            subject: subject.trim(),
            category,
            priority,
            status: "open",
            createdAt: t0,
            updatedAt: t0,
            messages: [
                { id: uid(), from: "user", text: message.trim(), at: t0 },
                { id: uid(), from: "support", text: "Thanks for reaching out! Your ticket is in our queue — a support agent will reply here, usually within a few hours.", at: t0 + 1000 },
            ],
        };
        s.tickets.push(ticket);
        addLog("info", "system", `Support ticket ${ticket.id} created`, { event: "ticket.created", ticket_id: ticket.id, priority });
        return ticket;
    }, 900);

export const replyTicket = ({ id, message }) =>
    call((s) => {
        const t = findTicket(s, id);
        if (t.status === "closed") fail("This ticket is closed. Reopen it to reply.");
        if (!message.trim()) fail("Reply can't be empty.");
        t.messages.push({ id: uid(), from: "user", text: message.trim(), at: now() });
        t.status = "open";
        t.updatedAt = now();
        return t;
    }, 600);

export const closeTicket = (id) =>
    call((s) => {
        const t = findTicket(s, id);
        t.status = "closed";
        t.updatedAt = now();
        t.messages.push({ id: uid(), from: "system", text: "Ticket closed", at: now() });
        return t;
    }, 600);

export const reopenTicket = (id) =>
    call((s) => {
        const t = findTicket(s, id);
        t.status = "open";
        t.updatedAt = now();
        t.messages.push({ id: uid(), from: "system", text: "Ticket reopened", at: now() });
        return t;
    }, 600);
