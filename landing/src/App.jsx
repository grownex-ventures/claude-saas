import { Component } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import ForgotPassword from "@/pages/ForgotPassword";
import AuthCallback from "@/pages/AuthCallback";
import AppShell from "@/components/app/AppShell";
import Overview from "@/pages/app/Overview";
import Channels from "@/pages/app/Channels";
import Inbox from "@/pages/app/Inbox";
import AIKnowledge from "@/pages/app/AIKnowledge";
import PanelConnection from "@/pages/app/PanelConnection";
import Logs from "@/pages/app/Logs";
import Billing from "@/pages/app/Billing";
import Settings from "@/pages/app/Settings";
import Support from "@/pages/app/Support";
import { GuestOnly, RequireAuth } from "@/lib/auth";
import { IS_APP_HOST, ROUTES } from "@/lib/site";

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="flex min-h-screen items-center justify-center px-6 text-center">
                    <p className="text-slate-600">Something went wrong. Please refresh the page.</p>
                </div>
            );
        }
        return this.props.children;
    }
}

const loginPage = (
    <GuestOnly>
        <Login />
    </GuestOnly>
);

export default function App() {
    return (
        <ErrorBoundary>
            <Routes>
                {/* app.yoursmmagent.com/ -> Login, yoursmmagent.com/ -> Landing */}
                <Route path="/" element={IS_APP_HOST ? loginPage : <Landing />} />
                <Route path="/login" element={IS_APP_HOST ? <Navigate to="/" replace /> : loginPage} />
                <Route
                    path={ROUTES.signup}
                    element={
                        <GuestOnly>
                            <Signup />
                        </GuestOnly>
                    }
                />
                <Route path={ROUTES.forgotPassword} element={<ForgotPassword />} />
                <Route path={ROUTES.authCallback} element={<AuthCallback />} />
                <Route
                    path="/dashboard"
                    element={
                        <RequireAuth>
                            <AppShell />
                        </RequireAuth>
                    }
                >
                    <Route index element={<Overview />} />
                    <Route path="channels" element={<Channels />} />
                    <Route path="inbox" element={<Inbox />} />
                    <Route path="ai" element={<AIKnowledge />} />
                    <Route path="panel" element={<PanelConnection />} />
                    <Route path="logs" element={<Logs />} />
                    <Route path="billing" element={<Billing />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="support" element={<Support />} />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Route>
                <Route path="/app/*" element={<Navigate to="/dashboard" replace />} />
                <Route path="/app" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </ErrorBoundary>
    );
}
