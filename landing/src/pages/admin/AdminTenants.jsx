import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Gift,
  Globe,
  Loader2,
  MessageCircle,
  MoreVertical,
  RefreshCw,
  Search,
  Send,
  Shield,
  Trash2,
  UserCheck,
  UserX,
  Users,
  X
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, Button, Modal } from "@/components/app/ui";
import { adminApi } from "@/lib/adminApi";

export default function AdminTenants() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  // Modals state
  const [grantModalTenant, setGrantModalTenant] = useState(null);
  const [grantDays, setGrantDays] = useState(30);
  const [grantTg, setGrantTg] = useState(true);
  const [grantWa, setGrantWa] = useState(true);
  const [grantWidget, setGrantWidget] = useState(true);
  const [granting, setGranting] = useState(false);

  const [plansModalTenant, setPlansModalTenant] = useState(null);
  const [planTg, setPlanTg] = useState(false);
  const [planWa, setPlanWa] = useState(false);
  const [planWidget, setPlanWidget] = useState(false);
  const [savingPlans, setSavingPlans] = useState(false);

  const [deleteModalTenant, setDeleteModalTenant] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [actionMenuId, setActionMenuId] = useState(null);

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getTenants({
        search: search.trim(),
        status: statusFilter,
        page,
        limit: 50
      });
      setTenants(data.tenants || []);
      setPagination(data.pagination || null);
    } catch (err) {
      toast.error(err.message || "Failed to load tenants");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, [statusFilter, page]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchTenants();
  };

  // Impersonate
  const handleImpersonate = async (tenant) => {
    try {
      toast.info(`Creating impersonation session for ${tenant.email}...`);
      const res = await adminApi.impersonateTenant(tenant.id);
      toast.success(`Signed in as ${tenant.email}!`);
      // Open dashboard in new tab
      window.open("/dashboard", "_blank");
    } catch (err) {
      toast.error(err.message || "Failed to impersonate tenant");
    }
  };

  // Toggle Email Verification
  const handleToggleEmailVerified = async (tenant) => {
    try {
      const nextState = !tenant.isEmailVerified;
      await adminApi.toggleTenantEmailVerified(tenant.id, nextState);
      toast.success(`Tenant email marked as ${nextState ? "Verified" : "Unverified"}`);
      fetchTenants();
    } catch (err) {
      toast.error(err.message || "Failed to update email verification");
    }
  };

  // Grant Access Modal
  const openGrantModal = (tenant) => {
    setGrantModalTenant(tenant);
    setGrantDays(30);
    setGrantTg(Boolean(tenant.hasTelegram));
    setGrantWa(Boolean(tenant.hasWhatsapp));
    setGrantWidget(Boolean(tenant.hasWidget));
    setActionMenuId(null);
  };

  const handleGrantAccessSubmit = async (e) => {
    e.preventDefault();
    if (!grantModalTenant) return;
    setGranting(true);
    try {
      await adminApi.grantTenantAccess(grantModalTenant.id, {
        hasTelegram: grantTg,
        hasWhatsapp: grantWa,
        hasWidget: grantWidget,
        durationDays: parseInt(grantDays, 10) || 0
      });
      toast.success(`Granted ${grantDays} days complimentary access to ${grantModalTenant.email}`);
      setGrantModalTenant(null);
      fetchTenants();
    } catch (err) {
      toast.error(err.message || "Failed to grant access");
    } finally {
      setGranting(false);
    }
  };

  // Plans Modal
  const openPlansModal = (tenant) => {
    setPlansModalTenant(tenant);
    setPlanTg(Boolean(tenant.hasTelegram));
    setPlanWa(Boolean(tenant.hasWhatsapp));
    setPlanWidget(Boolean(tenant.hasWidget));
    setActionMenuId(null);
  };

  const handleSavePlans = async (e) => {
    e.preventDefault();
    if (!plansModalTenant) return;
    setSavingPlans(true);
    try {
      await adminApi.updateTenantPlans(plansModalTenant.id, {
        hasTelegram: planTg,
        hasWhatsapp: planWa,
        hasWidget: planWidget
      });
      toast.success("Channel plan entitlements updated");
      setPlansModalTenant(null);
      fetchTenants();
    } catch (err) {
      toast.error(err.message || "Failed to update plans");
    } finally {
      setSavingPlans(false);
    }
  };

  // Delete Tenant
  const handleDeleteTenant = async () => {
    if (!deleteModalTenant) return;
    setDeleting(true);
    try {
      await adminApi.deleteTenant(deleteModalTenant.id);
      toast.success(`Tenant ${deleteModalTenant.email} deleted`);
      setDeleteModalTenant(null);
      fetchTenants();
    } catch (err) {
      toast.error(err.message || "Failed to delete tenant");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenants & Organizations"
        description="Search, inspect, grant complimentary access, manage channel entitlements, and 1-click impersonate customer sessions."
        actions={
          <Button variant="secondary" size="sm" icon={RefreshCw} loading={loading} onClick={fetchTenants}>
            Refresh
          </Button>
        }
      />

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email, name or panel URL..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          />
        </form>

        <div className="flex items-center gap-2">
          {["ALL", "ACTIVE", "INACTIVE", "EXPIRED"].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => {
                setStatusFilter(status);
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === status
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100 dark:border dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Tenants Table */}
      <Card bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3.5">Tenant Email & ID</th>
                <th className="px-5 py-3.5">Panel API URL</th>
                <th className="px-5 py-3.5">Channels</th>
                <th className="px-5 py-3.5">Subscription</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Created</th>
                <th className="px-6 py-3.5 text-right w-[180px] min-w-[180px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && tenants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-500" />
                    <p className="mt-2 text-xs">Loading tenant records...</p>
                  </td>
                </tr>
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Users className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700" />
                    <p className="mt-2 text-sm font-medium">No tenants found</p>
                    <p className="text-xs text-slate-500">Try adjusting your search query or filters.</p>
                  </td>
                </tr>
              ) : (
                tenants.map((t) => {
                  const isMenuOpen = actionMenuId === t.id;
                  return (
                    <tr key={t.id} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-900/40">
                      {/* Email & ID */}
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{t.email}</div>
                        <div className="font-mono text-[11px] text-slate-400 truncate max-w-[180px]">{t.id}</div>
                      </td>

                      {/* Panel URL */}
                      <td className="px-5 py-4">
                        {t.panelApiUrl ? (
                          <span className="font-mono text-xs text-slate-600 dark:text-slate-300 truncate block max-w-[200px]" title={t.panelApiUrl}>
                            {t.panelApiUrl}
                          </span>
                        ) : (
                          <span className="text-xs italic text-slate-400">Not connected</span>
                        )}
                      </td>

                      {/* Channels Pills */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <span
                            title="Telegram Bot"
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              t.hasTelegram
                                ? "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
                                : "bg-slate-100 text-slate-400 line-through dark:bg-slate-800"
                            }`}
                          >
                            TG
                          </span>
                          <span
                            title="WhatsApp Bot"
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              t.hasWhatsapp
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                                : "bg-slate-100 text-slate-400 line-through dark:bg-slate-800"
                            }`}
                          >
                            WA
                          </span>
                          <span
                            title="Website Widget"
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              t.hasWidget
                                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
                                : "bg-slate-100 text-slate-400 line-through dark:bg-slate-800"
                            }`}
                          >
                            Web
                          </span>
                        </div>
                      </td>

                      {/* Subscription Status */}
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            t.subscriptionStatus === "ACTIVE"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                              : t.subscriptionStatus === "EXPIRED"
                              ? "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              t.subscriptionStatus === "ACTIVE"
                                ? "bg-emerald-500"
                                : t.subscriptionStatus === "EXPIRED"
                                ? "bg-rose-500"
                                : "bg-slate-400"
                            }`}
                          />
                          {t.subscriptionStatus || "INACTIVE"}
                        </span>
                      </td>

                      {/* Email Verified */}
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => handleToggleEmailVerified(t)}
                          title="Click to toggle email verification status"
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                            t.isEmailVerified
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
                          }`}
                        >
                          {t.isEmailVerified ? (
                            <>
                              <UserCheck className="h-3 w-3" /> Verified
                            </>
                          ) : (
                            <>
                              <UserX className="h-3 w-3" /> Unverified
                            </>
                          )}
                        </button>
                      </td>

                      {/* Created Date */}
                      <td className="px-5 py-4 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "N/A"}
                      </td>

                      {/* Actions Menu */}
                      <td className="px-6 py-4 text-right relative whitespace-nowrap w-[180px] min-w-[180px]">
                        <div className="flex items-center justify-end gap-1">
                          {/* 1-Click Impersonate Button */}
                          <button
                            type="button"
                            onClick={() => handleImpersonate(t)}
                            title={`Log into ${t.email} customer dashboard`}
                            className="btn btn-secondary btn-sm inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>Impersonate</span>
                          </button>

                          {/* 3-Dot Dropdown Toggle */}
                          <button
                            type="button"
                            onClick={() => setActionMenuId(isMenuOpen ? null : t.id)}
                            className="btn btn-ghost btn-icon h-8 w-8 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Dropdown Menu Popup */}
                        {isMenuOpen && (
                          <>
                            <div className="fixed inset-0 z-30" onClick={() => setActionMenuId(null)} />
                            <div className="absolute right-5 top-12 z-40 w-48 rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900 text-left">
                              <button
                                type="button"
                                onClick={() => openGrantModal(t)}
                                className="flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                <Gift className="h-3.5 w-3.5 text-emerald-500" />
                                <span>Grant Free Access</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => openPlansModal(t)}
                                className="flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                <Shield className="h-3.5 w-3.5 text-indigo-500" />
                                <span>Channel Entitlements</span>
                              </button>

                              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteModalTenant(t);
                                  setActionMenuId(null);
                                }}
                                className="flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Delete Tenant</span>
                              </button>
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Grant Complimentary Access Modal */}
      {grantModalTenant && (
        <Modal
          title={`Grant Free Access: ${grantModalTenant.email}`}
          description="Grant complimentary active subscription without requiring crypto payment."
          onClose={() => setGrantModalTenant(null)}
        >
          <form onSubmit={handleGrantAccessSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Duration (Days)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={grantDays}
                onChange={(e) => setGrantDays(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              />
              <p className="mt-1 text-[11px] text-slate-400">Set 0 or empty for permanent lifetime access.</p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Enabled Channels
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={grantTg}
                  onChange={(e) => setGrantTg(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <span>Telegram Support Bot</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={grantWa}
                  onChange={(e) => setGrantWa(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <span>WhatsApp Support Bot</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={grantWidget}
                  onChange={(e) => setGrantWidget(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <span>Embeddable Website Widget</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <Button variant="ghost" size="sm" onClick={() => setGrantModalTenant(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={granting}>
                Confirm Free Access
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Plans Entitlements Modal */}
      {plansModalTenant && (
        <Modal
          title={`Channel Plans: ${plansModalTenant.email}`}
          description="Toggle channel feature flags for this tenant."
          onClose={() => setPlansModalTenant(null)}
        >
          <form onSubmit={handleSavePlans} className="space-y-4">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={planTg}
                  onChange={(e) => setPlanTg(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <span>Enable Telegram Bot</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={planWa}
                  onChange={(e) => setPlanWa(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <span>Enable WhatsApp Bot</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={planWidget}
                  onChange={(e) => setPlanWidget(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <span>Enable Website Widget</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <Button variant="ghost" size="sm" onClick={() => setPlansModalTenant(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={savingPlans}>
                Save Channel Plans
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalTenant && (
        <Modal
          title="Delete Tenant Organization"
          description={`Are you sure you want to delete ${deleteModalTenant.email}? This action is irreversible.`}
          onClose={() => setDeleteModalTenant(null)}
        >
          <div className="space-y-4">
            <p className="text-xs text-rose-500 font-medium">
              Warning: All conversations, logs, bot configurations, and session tokens for this tenant will be permanently deleted.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setDeleteModalTenant(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={deleting}
                onClick={handleDeleteTenant}
              >
                Permanently Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
