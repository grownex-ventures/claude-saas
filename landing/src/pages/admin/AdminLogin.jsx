import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail, ShieldAlert, Sparkles, User } from "lucide-react";
import { toast } from "sonner";
import { LogoMark } from "@/components/landing/Logo";
import { adminApi } from "@/lib/adminApi";
import { useAdminSession } from "@/lib/adminAuth";

export default function AdminLogin() {
  const navigate = useNavigate();
  const { refresh } = useAdminSession();

  const [checkingStatus, setCheckingStatus] = useState(true);
  const [hasAdmin, setHasAdmin] = useState(true);

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminApi
      .getStatus()
      .then((data) => {
        setHasAdmin(Boolean(data?.hasAdmin));
      })
      .catch(() => {
        setHasAdmin(true);
      })
      .finally(() => {
        setCheckingStatus(false);
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (!hasAdmin) {
        // Initial setup wizard
        if (!name.trim()) throw new Error("Full name is required");
        if (!email.trim()) throw new Error("Email address is required");
        if (password.length < 8) throw new Error("Password must be at least 8 characters");

        await adminApi.setup({ email: email.trim(), password, name: name.trim() });
        toast.success("Super Admin account initialized!");
      } else {
        // Regular login
        await adminApi.login({ email: email.trim(), password });
        toast.success("Welcome back, Super Admin");
      }

      await refresh();
      navigate("/admin");
    } catch (err) {
      setError(err.message || "Authentication failed");
      toast.error(err.message || "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row bg-slate-950 text-slate-100">
      {/* Left Hero Pane */}
      <div className="relative hidden w-full overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-12 lg:flex lg:w-1/2 lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293715_1px,transparent_1px),linear-gradient(to_bottom,#1f293715_1px,transparent_1px)] bg-[size:4rem_4rem]" />
        
        <div className="relative z-10 flex items-center gap-3">
          <LogoMark className="h-9 w-9 text-indigo-400" />
          <span className="text-xl font-bold tracking-tight text-white">YourSMMagent</span>
          <span className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-indigo-300">
            Control Center
          </span>
        </div>

        <div className="relative z-10 my-auto max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3.5 py-1 text-xs font-medium text-indigo-300">
            <ShieldAlert className="h-3.5 w-3.5 text-indigo-400" />
            <span>Platform Administrative Tier</span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            {hasAdmin ? "Master Platform Control." : "Initialize Platform Admin."}
          </h1>

          <p className="text-base text-slate-300 leading-relaxed">
            Configure dynamic AI model keys, inspect PostgreSQL & Redis telemetry, manage tenant bot entitlements, and review invoices in one place.
          </p>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Isolated Admin JWT Authentication Active</span>
            </div>
            <p className="text-xs text-slate-400">
              Protected by double-submit CSRF tokens and brute-force rate limiters.
            </p>
          </div>
        </div>

        <div className="relative z-10 text-xs text-slate-500">
          Super Admin Console • Encrypted Sessions • Cloud-SaaS v1.0
        </div>
      </div>

      {/* Right Form Pane */}
      <div className="flex flex-1 items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile Brand */}
          <div className="flex items-center gap-2 lg:hidden">
            <LogoMark className="h-7 w-7 text-indigo-400" />
            <span className="text-lg font-bold text-white">YourSMMagent</span>
            <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-300">Admin</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              {hasAdmin ? "Super Admin Sign In" : "Super Admin Setup Wizard"}
            </h2>
            <p className="mt-1.5 text-sm text-slate-400">
              {hasAdmin
                ? "Enter your credentials to access the platform control center."
                : "No admin exists yet. Create the master Super Admin account."}
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3.5 text-sm text-rose-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!hasAdmin && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-300">Your Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Master Administrator"
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/90 py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">Admin Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@yoursmmagent.com"
                  className="w-full rounded-lg border border-slate-800 bg-slate-900/90 py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-300">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-lg border border-slate-800 bg-slate-900/90 py-2.5 pl-10 pr-10 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50"
            >
              {submitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>{hasAdmin ? "Sign In to Control Center" : "Create Master Admin"}</span>
                </>
              )}
            </button>
          </form>

          <div className="text-center">
            <a href="/login" className="text-xs text-slate-500 hover:text-indigo-400">
              ← Return to customer login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

