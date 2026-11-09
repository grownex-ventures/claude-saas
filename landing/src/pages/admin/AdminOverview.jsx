import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  Bot,
  CreditCard,
  Database,
  Inbox,
  Mail,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Users,
  Zap
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, Button } from "@/components/app/ui";
import { adminApi } from "@/lib/adminApi";

export default function AdminOverview() {
  const [telemetry, setTelemetry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTelemetry = async (showToast = false) => {
    try {
      if (showToast) setRefreshing(true);
      const data = await adminApi.getTelemetry();
      setTelemetry(data);
      if (showToast) toast.success("Telemetry refreshed");
    } catch (err) {
      toast.error(err.message || "Failed to fetch telemetry");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, []);

  const formatUptime = (seconds) => {
    if (!seconds && seconds !== 0) return "N/A";
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Super Admin"
        description="Live operational telemetry, microservice health, and tenant activity across Cloud-SaaS."
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            loading={refreshing}
            onClick={() => fetchTelemetry(true)}
          >
            Refresh Telemetry
          </Button>
        }
      />

      {/* Primary KPI Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Tenants */}
        <div className="app-card relative overflow-hidden p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Tenants
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {loading ? "..." : (telemetry?.metrics?.totalTenants ?? telemetry?.counts?.totalTenants ?? 0)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Registered SaaS tenant organizations</p>
        </div>

        {/* Active Subscriptions */}
        <div className="app-card relative overflow-hidden p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active Subscriptions
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <CreditCard className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">
              {loading ? "..." : (telemetry?.metrics?.activeSubscriptions ?? telemetry?.counts?.activeSubscriptions ?? 0)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Enabled panels with active billing</p>
        </div>

        {/* Landing Leads */}
        <div className="app-card relative overflow-hidden p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Inbound Leads
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400">
              <Inbox className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {loading ? "..." : (telemetry?.metrics?.totalLeads ?? telemetry?.counts?.landingLeads ?? 0)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Prospective inquiries from landing page</p>
        </div>

        {/* Active Sessions */}
        <div className="app-card relative overflow-hidden p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active Bot Sessions
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {loading
                ? "..."
                : (telemetry?.metrics?.sessions
                    ? (telemetry.metrics.sessions.telegram || 0) +
                      (telemetry.metrics.sessions.whatsapp || 0) +
                      (telemetry.metrics.sessions.webChat || 0)
                    : telemetry?.counts?.activeBotSessions ?? 0)}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Telegram, WhatsApp & Web chats</p>
        </div>
      </div>

      {/* Microservice Health & Fast Actions Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Microservice Health Card */}
        <Card
          title="Microservice Health"
          description="Live connectivity across database, cache, and runtime workers."
          icon={Server}
        >
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {/* PostgreSQL */}
            <div className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-3">
                <Database className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">PostgreSQL Database</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    telemetry?.health?.database === "healthy" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                  }`}
                />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  {telemetry?.health?.database === "healthy" ? "CONNECTED" : "DEGRADED"}
                </span>
              </div>
            </div>

            {/* Redis */}
            <div className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-3">
                <Zap className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Redis Cache & PubSub</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    telemetry?.health?.redis === "healthy" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                  }`}
                />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  {telemetry?.health?.redis === "healthy" ? "PONG ONLINE" : "OFFLINE"}
                </span>
              </div>
            </div>

            {/* Process Uptime */}
            <div className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-3">
                <Activity className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Process Uptime</span>
              </div>
              <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">
                {formatUptime(telemetry?.health?.uptimeSeconds || telemetry?.uptime)}
              </span>
            </div>

            {/* Environment */}
            <div className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Running Environment</span>
              </div>
              <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400">
                {telemetry?.health?.nodeEnv || telemetry?.nodeEnv || "development"}
              </span>
            </div>
          </div>
        </Card>

        {/* Fast Actions Card */}
        <Card
          title="Fast Operational Actions"
          description="Direct shortcuts to common administrative workflows."
          icon={Sparkles}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              to="/admin/ai"
              className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-500/40 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/60"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                  <Bot className="h-4 w-4" />
                </div>
                <span className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                  Switch AI Model
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Configure OpenAI, Claude, or Gemini credentials.
              </p>
            </Link>

            <Link
              to="/admin/integrations"
              className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-500/40 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/60"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <Mail className="h-4 w-4" />
                </div>
                <span className="text-sm font-semibold text-slate-900 group-hover:text-emerald-600 dark:text-slate-100 dark:group-hover:text-emerald-400">
                  Test Email / SMTP
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Verify transactional emails and Cryptomus keys.
              </p>
            </Link>

            <Link
              to="/admin/tenants"
              className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-500/40 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/60"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400">
                  <Users className="h-4 w-4" />
                </div>
                <span className="text-sm font-semibold text-slate-900 group-hover:text-sky-600 dark:text-slate-100 dark:group-hover:text-sky-400">
                  Manage Tenants
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Adjust subscriptions, plans, or impersonate user.
              </p>
            </Link>

            <Link
              to="/admin/leads"
              className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-indigo-500/40 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/60"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
                  <Inbox className="h-4 w-4" />
                </div>
                <span className="text-sm font-semibold text-slate-900 group-hover:text-violet-600 dark:text-slate-100 dark:group-hover:text-violet-400">
                  Review Inbound Leads
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Qualify sales inquiries and convert new clients.
              </p>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
