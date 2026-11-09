/**
 * MOCK backend used only while VITE_API_URL is not set.
 * Users live in this browser's localStorage. Not secure — demo only.
 * (Your real backend should hash passwords with Argon2id.)
 */
import { ApiError, tokenStore } from "@/lib/api";

const USERS_KEY = "ysmm_mock_users";
const delay = (ms = 650) => new Promise((r) => setTimeout(r, ms));
const loadUsers = () => JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
const saveUsers = (users) => localStorage.setItem(USERS_KEY, JSON.stringify(users));
const publicUser = ({ passwordHash, ...user }) => user;

async function digest(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const mockAuth = {
    async signup({ email, username, password, mobile_number, smm_panel_link }) {
        await delay();
        const users = loadUsers();
        const fields = {};
        if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) fields.email = "An account with this email already exists.";
        if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) fields.username = "This username is taken.";
        if (Object.keys(fields).length) throw new ApiError("Please fix the highlighted fields.", 409, fields);
        const user = {
            id: crypto.randomUUID(),
            email,
            username,
            mobile_number,
            smm_panel_link,
            created_at: new Date().toISOString(),
            passwordHash: await digest(password),
        };
        saveUsers([...users, user]);
        tokenStore.set(`mock.${user.id}`, true);
        return publicUser(user);
    },
    async login({ identifier, password, remember }) {
        await delay();
        const id = identifier.trim().toLowerCase();
        const user = loadUsers().find((u) => u.email.toLowerCase() === id || u.username.toLowerCase() === id);
        if (!user || user.passwordHash !== (await digest(password))) {
            throw new ApiError("Incorrect email/username or password.", 401);
        }
        tokenStore.set(`mock.${user.id}`, remember);
        return publicUser(user);
    },
    async verifyMfaLogin({ remember }) {
        await delay();
        const users = loadUsers();
        const user = users[0] || { id: "mock-id", email: "user@example.com" };
        tokenStore.set(`mock.${user.id}`, remember);
        return publicUser(user);
    },
    async forgotPassword() {
        await delay();
        return { message: "If an account exists, a reset link has been sent." };
    },
    async me() {
        const token = tokenStore.get();
        if (!token?.startsWith("mock.")) return null;
        const user = loadUsers().find((u) => `mock.${u.id}` === token);
        return user ? publicUser(user) : null;
    },
    async logout() {
        await delay(250);
        tokenStore.clear();
    },
    googleUrl: () => null,
};
