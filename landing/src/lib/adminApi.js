/**
 * Super Admin API client for Cloud-SaaS
 * Handles authentication, CSRF double-submit token headers, and all /api/v1/admin/* operations.
 */
import { API_BASE_URL } from "@/lib/api";

const ADMIN_TOKEN_KEY = "ysmm_admin_token";

export const adminTokenStore = {
  get: () => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ADMIN_TOKEN_KEY) || sessionStorage.getItem(ADMIN_TOKEN_KEY) || null;
  },
  set: (token, remember = true) => {
    if (typeof window === "undefined") return;
    adminTokenStore.clear();
    if (token) {
      if (remember) {
        localStorage.setItem(ADMIN_TOKEN_KEY, token);
      } else {
        sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
      }
    }
  },
  clear: () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  }
};

function getCookie(name) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^|;\\s*)(${name})=([^;]*)`));
  return match ? decodeURIComponent(match[3]) : null;
}

export class AdminApiError extends Error {
  constructor(message, status = 0, code = undefined) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function adminRequest(path, { method = "GET", body } = {}) {
  const token = adminTokenStore.get();
  const csrfToken = getCookie("admin_csrf_token");

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(csrfToken ? { "x-csrf-token": csrfToken } : {})
  };

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: "include",
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    throw new AdminApiError("Network error: Cannot reach server", 0);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const errorMsg = data?.error || data?.message || `Admin request failed (${res.status})`;
    throw new AdminApiError(errorMsg, res.status, data?.code);
  }

  return data;
}

export const adminApi = {
  // Public setup & status
  getStatus: () => adminRequest("/api/v1/admin/status"),
  setup: (payload) => adminRequest("/api/v1/admin/setup", { method: "POST", body: payload }),
  login: async ({ email, password, remember = true }) => {
    const data = await adminRequest("/api/v1/admin/login", {
      method: "POST",
      body: { email, password }
    });
    if (data?.token) {
      adminTokenStore.set(data.token, remember);
    }
    return data;
  },
  logout: async () => {
    try {
      await adminRequest("/api/v1/admin/logout", { method: "POST" });
    } finally {
      adminTokenStore.clear();
    }
  },
  getMe: () => adminRequest("/api/v1/admin/me"),

  // Telemetry
  getTelemetry: () => adminRequest("/api/v1/admin/telemetry"),

  // Tenants
  getTenants: ({ search, status, page = 1, limit = 50 } = {}) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status && status !== "ALL") params.set("status", status);
    params.set("page", String(page));
    params.set("limit", String(limit));
    return adminRequest(`/api/v1/admin/tenants?${params.toString()}`);
  },
  updateTenantSubscription: (id, status) =>
    adminRequest(`/api/v1/admin/tenants/${id}/subscription`, {
      method: "PATCH",
      body: { status }
    }),
  updateTenantPlans: (id, plans) =>
    adminRequest(`/api/v1/admin/tenants/${id}/plans`, {
      method: "PATCH",
      body: plans
    }),
  grantTenantAccess: (id, { hasTelegram, hasWhatsapp, hasWidget, durationDays }) =>
    adminRequest(`/api/v1/admin/tenants/${id}/grant-access`, {
      method: "POST",
      body: { hasTelegram, hasWhatsapp, hasWidget, durationDays }
    }),
  toggleTenantEmailVerified: (id, verified) =>
    adminRequest(`/api/v1/admin/tenants/${id}/verify-email`, {
      method: "PATCH",
      body: { verified }
    }),
  impersonateTenant: (id) =>
    adminRequest(`/api/v1/admin/tenants/${id}/impersonate`, {
      method: "POST"
    }),
  deleteTenant: (id) =>
    adminRequest(`/api/v1/admin/tenants/${id}`, {
      method: "DELETE"
    }),

  // AI & System Settings
  getSettings: () => adminRequest("/api/v1/admin/settings"),
  updateSettings: (updates) =>
    adminRequest("/api/v1/admin/settings", {
      method: "POST",
      body: updates
    }),
  testAiConnection: (payload) =>
    adminRequest("/api/v1/admin/test-ai", {
      method: "POST",
      body: payload
    }),
  testEmailConnection: (to) =>
    adminRequest("/api/v1/admin/test-email", {
      method: "POST",
      body: { to }
    }),

  // Leads
  getLeads: ({ status, search, page = 1, limit = 50 } = {}) => {
    const params = new URLSearchParams();
    if (status && status !== "ALL") params.set("status", status);
    if (search) params.set("search", search);
    params.set("page", String(page));
    params.set("limit", String(limit));
    return adminRequest(`/api/v1/admin/leads?${params.toString()}`);
  },
  updateLead: (id, data) =>
    adminRequest(`/api/v1/admin/leads/${id}`, {
      method: "PATCH",
      body: data
    }),
  deleteLead: (id) =>
    adminRequest(`/api/v1/admin/leads/${id}`, {
      method: "DELETE"
    }),

  // Invoices
  getInvoices: () => adminRequest("/api/v1/admin/invoices"),
  markInvoicePaid: (orderId) =>
    adminRequest(`/api/v1/admin/invoices/${orderId}/mark-paid`, {
      method: "POST"
    }),

  // Support Tickets
  getTickets: ({ status, priority, search, page = 1, limit = 50 } = {}) => {
    const params = new URLSearchParams();
    if (status && status !== "ALL") params.set("status", status);
    if (priority && priority !== "ALL") params.set("priority", priority);
    if (search) params.set("search", search);
    params.set("page", String(page));
    params.set("limit", String(limit));
    return adminRequest(`/api/v1/admin/tickets?${params.toString()}`);
  },
  getTicket: (id) => adminRequest(`/api/v1/admin/tickets/${encodeURIComponent(id)}`),
  replyTicket: (id, message) =>
    adminRequest(`/api/v1/admin/tickets/${encodeURIComponent(id)}/reply`, {
      method: "POST",
      body: { message }
    }),
  updateTicketStatus: (id, status) =>
    adminRequest(`/api/v1/admin/tickets/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: { status }
    }),
  getUnreadTicketCount: () => adminRequest("/api/v1/admin/tickets/unread-count")
};

