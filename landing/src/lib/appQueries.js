import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/** All dashboard queries live under the "app" key so a mutation can refresh everything. */
export const useAppQuery = (key, queryFn, options = {}) =>
    useQuery({ queryKey: ["app", ...key], queryFn, retry: false, staleTime: 15_000, ...options });

/**
 * Mutation with toast feedback + app-wide refresh.
 * `success` may be a string or (data, vars) => string; set to false for no toast.
 */
export function useAppMutation(mutationFn, { success, onSuccess, onError } = {}) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: async (data, vars) => {
            await qc.invalidateQueries({ queryKey: ["app"] });
            const msg = typeof success === "function" ? success(data, vars) : success;
            if (msg) toast.success(msg);
            onSuccess?.(data, vars);
        },
        onError: (err, vars) => {
            toast.error(err.message || "Something went wrong");
            onError?.(err, vars);
        },
    });
}

export function timeAgo(ts) {
    if (!ts) return "—";
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 45) return "just now";
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h ago`;
    return `${Math.round(h / 24)} d ago`;
}

export function duration(fromTs) {
    if (!fromTs) return "—";
    const m = Math.floor((Date.now() - fromTs) / 60_000);
    if (m < 1) return "under a minute";
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h} h ${m % 60} min` : `${Math.floor(h / 24)} d ${h % 24} h`;
}

export const formatDateTime = (ts) =>
    new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export const money = (n, currency = "USD") =>
    new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
