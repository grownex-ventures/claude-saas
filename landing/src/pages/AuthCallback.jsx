import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { tokenStore } from "@/lib/api";
import { FullPageLoader, SESSION_KEY } from "@/lib/auth";
import { ROUTES } from "@/lib/site";

/** Google OAuth landing: your backend redirects here with ?token=... (or ?error=...). */
export default function AuthCallback() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const qc = useQueryClient();

    useEffect(() => {
        const error = params.get("error");
        if (error) {
            toast.error(error);
            navigate(ROUTES.login, { replace: true });
            return;
        }
        const token = params.get("token");
        if (token) tokenStore.set(token, true);
        qc.invalidateQueries({ queryKey: SESSION_KEY }).then(() => navigate(ROUTES.dashboard, { replace: true }));
    }, [params, navigate, qc]);

    return <FullPageLoader />;
}
