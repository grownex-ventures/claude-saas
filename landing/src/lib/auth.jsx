import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { authApi } from "./api";
import { ROUTES } from "./site";

export const SESSION_KEY = ["session"];

export function useSession() {
    return useQuery({ queryKey: SESSION_KEY, queryFn: authApi.me, retry: false, staleTime: 5 * 60_000 });
}

function useAuthMutation(mutationFn) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: (data) => {
            if (data && !data.mfaRequired) {
                qc.removeQueries({ queryKey: ["app"] }); // never show one account's dashboard data to another
                qc.setQueryData(SESSION_KEY, data ?? null);
            }
        },
    });
}

export const useLogin = () => useAuthMutation(authApi.login);
export const useVerifyMfaLogin = () => useAuthMutation(authApi.verifyMfaLogin);
export const useSignup = () => useAuthMutation(authApi.signup);
export const useLogout = () => useAuthMutation(async () => (await authApi.logout(), null));
export const useForgotPassword = () => useMutation({ mutationFn: authApi.forgotPassword });

export function useTitle(title) {
    useEffect(() => {
        document.title = `${title} | YourSMMagent`;
    }, [title]);
}

export function FullPageLoader() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50" data-testid="full-page-loader">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-label="Loading" />
        </div>
    );
}

/** Only signed-in users. */
export function RequireAuth({ children }) {
    const { data: user, isLoading } = useSession();
    const location = useLocation();
    if (isLoading) return <FullPageLoader />;
    if (!user) return <Navigate to={ROUTES.login} replace state={{ from: location.pathname }} />;
    return children;
}

/** Only signed-out users (login / signup). */
export function GuestOnly({ children }) {
    const { data: user, isLoading } = useSession();
    if (isLoading) return <FullPageLoader />;
    if (user) return <Navigate to={ROUTES.dashboard} replace />;
    return children;
}
