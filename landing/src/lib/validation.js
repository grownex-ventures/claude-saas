export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function normalizeUrl(value) {
    const v = value.trim();
    if (!v) return v;
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export function isValidUrl(value) {
    try {
        const url = new URL(normalizeUrl(value));
        return url.hostname.includes(".");
    } catch {
        return false;
    }
}

export const digitsOnly = (value) => value.replace(/[\s\-().]/g, "");

export function passwordStrength(pw) {
    if (!pw) return { score: 0, label: "" };
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 14) score++;
    return { score, label: ["Too short", "Weak", "Fair", "Good", "Strong"][score] };
}

export function validateSignup(v) {
    const e = {};
    if (!EMAIL_RE.test(v.email.trim())) e.email = "Enter a valid email address.";
    if (!USERNAME_RE.test(v.username.trim())) e.username = "3–20 characters: letters, numbers or underscores.";
    if (v.password.length < 8) e.password = "Use at least 8 characters.";
    else if (!/[A-Za-z]/.test(v.password) || !/\d/.test(v.password)) e.password = "Include at least one letter and one number.";
    if (!v.confirmPassword) e.confirmPassword = "Please confirm your password.";
    else if (v.confirmPassword !== v.password) e.confirmPassword = "Passwords don't match.";
    if (!/^\+?\d{7,15}$/.test(digitsOnly(v.mobile))) e.mobile = "Enter a valid mobile number with country code.";
    if (!isValidUrl(v.panelLink)) e.panelLink = "Enter your panel URL, e.g. https://mypanel.com";
    if (!v.terms) e.terms = "Please accept the terms to continue.";
    return e;
}

export function validateLogin(v) {
    const e = {};
    if (!v.identifier.trim()) e.identifier = "Enter your email or username.";
    if (!v.password) e.password = "Enter your password.";
    return e;
}
