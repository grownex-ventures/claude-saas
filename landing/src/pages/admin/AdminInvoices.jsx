import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Loader2,
  RefreshCw,
  XCircle
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, Button } from "@/components/app/ui";
import { adminApi } from "@/lib/adminApi";

export default function AdminInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState(null);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getInvoices();
      setInvoices(data.invoices || []);
    } catch (err) {
      toast.error(err.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const handleMarkPaid = async (orderId) => {
    if (!window.confirm(`Mark invoice ${orderId} as manually paid? This will activate the tenant subscription.`)) {
      return;
    }
    setMarkingId(orderId);
    try {
      const res = await adminApi.markInvoicePaid(orderId);
      toast.success(res.message || "Invoice marked as paid and tenant activated!");
      fetchInvoices();
    } catch (err) {
      toast.error(err.message || "Failed to mark invoice as paid");
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crypto Invoices Oversight"
        description="Platform transaction history, payment verification statuses, and manual subscription reconciliations."
        actions={
          <Button variant="secondary" size="sm" icon={RefreshCw} loading={loading} onClick={fetchInvoices}>
            Refresh
          </Button>
        }
      />

      <Card bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3.5">Order ID</th>
                <th className="px-5 py-3.5">Tenant Email</th>
                <th className="px-5 py-3.5">Amount</th>
                <th className="px-5 py-3.5">Currency</th>
                <th className="px-5 py-3.5">Payment Status</th>
                <th className="px-5 py-3.5">Created</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-500" />
                    <p className="mt-2 text-xs">Loading platform invoices...</p>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <CreditCard className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700" />
                    <p className="mt-2 text-sm font-medium">No billing transactions recorded</p>
                    <p className="text-xs text-slate-500">Cryptomus crypto invoices will appear here.</p>
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id || inv.orderId} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-900/40">
                    {/* Order ID */}
                    <td className="px-5 py-4 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {inv.orderId}
                    </td>

                    {/* Tenant Email */}
                    <td className="px-5 py-4 text-xs font-medium text-slate-700 dark:text-slate-300">
                      {inv.tenant?.email || inv.tenantEmail || "N/A"}
                    </td>

                    {/* Amount */}
                    <td className="px-5 py-4 font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                      ${inv.amount ? parseFloat(inv.amount).toFixed(2) : "0.00"}
                    </td>

                    {/* Currency */}
                    <td className="px-5 py-4 font-mono text-xs text-slate-500">
                      {inv.currency || "USD"}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          inv.status === "PAID"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                            : inv.status === "PENDING"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        {inv.status === "PAID" ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                        {inv.status}
                      </span>
                    </td>

                    {/* Created */}
                    <td className="px-5 py-4 text-xs text-slate-400 whitespace-nowrap">
                      {inv.createdAt ? new Date(inv.createdAt).toLocaleString() : "—"}
                    </td>

                    {/* Action: Mark Paid */}
                    <td className="px-5 py-4 text-right">
                      {inv.status !== "PAID" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={markingId === inv.orderId}
                          onClick={() => handleMarkPaid(inv.orderId)}
                          className="text-xs text-emerald-600 dark:text-emerald-400"
                        >
                          Mark Paid
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

