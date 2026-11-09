import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  LifeBuoy,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  User,
  X
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, Button, Modal } from "@/components/app/ui";
import { adminApi } from "@/lib/adminApi";

const PRIORITY_CLS = {
  low: "text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300",
  normal: "text-sky-700 bg-sky-50 dark:bg-sky-500/10 dark:text-sky-300",
  high: "text-amber-800 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300",
  urgent: "text-rose-700 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-300"
};

const STATUS_CLS = {
  open: "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
  answered: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20",
  closed: "text-slate-600 bg-slate-100 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
};

function PriorityChip({ value }) {
  const v = (value || "normal").toLowerCase();
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${PRIORITY_CLS[v] || PRIORITY_CLS.normal}`}>
      {v}
    </span>
  );
}

function StatusChip({ value }) {
  const v = (value || "open").toLowerCase();
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${STATUS_CLS[v] || STATUS_CLS.open}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${v === "open" ? "bg-amber-500" : v === "answered" ? "bg-emerald-500" : "bg-slate-400"}`} />
      {v}
    </span>
  );
}

export default function AdminTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  // Active ticket conversation modal
  const [activeTicketId, setActiveTicketId] = useState(null);
  const [activeTicket, setActiveTicket] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getTickets({
        status: statusFilter,
        priority: priorityFilter,
        search: search.trim(),
        page,
        limit: 50
      });
      setTickets(data?.tickets || []);
      setPagination(data?.pagination || null);
    } catch (err) {
      toast.error(err.message || "Failed to load support tickets");
    } finally {
      setLoading(false);
    }
  };

  const loadTicketDetail = async (id) => {
    setActiveTicketId(id);
    setLoadingDetail(true);
    setReplyText("");
    try {
      const data = await adminApi.getTicket(id);
      setActiveTicket(data);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("ticket-read"));
      }
    } catch (err) {
      toast.error(err.message || "Failed to load ticket details");
      setActiveTicketId(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [statusFilter, priorityFilter, page]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchTickets();
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !activeTicket) return;

    setSendingReply(true);
    try {
      await adminApi.replyTicket(activeTicket.id, replyText.trim());
      toast.success("Reply dispatched to tenant!");
      setReplyText("");
      // Refresh ticket details and list
      await loadTicketDetail(activeTicket.id);
      fetchTickets();
    } catch (err) {
      toast.error(err.message || "Failed to send reply");
    } finally {
      setSendingReply(false);
    }
  };

  const handleStatusChange = async (nextStatus) => {
    if (!activeTicket) return;
    setUpdatingStatus(true);
    try {
      await adminApi.updateTicketStatus(activeTicket.id, nextStatus);
      toast.success(`Ticket marked as ${nextStatus.toLowerCase()}`);
      await loadTicketDetail(activeTicket.id);
      fetchTickets();
    } catch (err) {
      toast.error(err.message || "Failed to update ticket status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Ticket counts
  const openCount = tickets.filter((t) => t.status === "OPEN").length;
  const answeredCount = tickets.filter((t) => t.status === "ANSWERED").length;
  const closedCount = tickets.filter((t) => t.status === "CLOSED").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support Tickets"
        description="Tenant queries, panel connection help, and technical issue tickets across your SaaS platform."
        actions={
          <Button
            variant="outline"
            icon={RefreshCw}
            onClick={fetchTickets}
            disabled={loading}
            className={loading ? "opacity-75" : ""}
          >
            Refresh
          </Button>
        }
      />

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card bodyClassName="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Showing</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{pagination?.total ?? tickets.length}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
            <LifeBuoy className="h-5 w-5" />
          </div>
        </Card>

        <Card bodyClassName="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">Needs Response</p>
            <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-400">{openCount}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
            <Clock className="h-5 w-5" />
          </div>
        </Card>

        <Card bodyClassName="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Answered</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400">{answeredCount}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <MessageSquare className="h-5 w-5" />
          </div>
        </Card>

        <Card bodyClassName="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Closed</p>
            <p className="mt-1 text-2xl font-bold text-slate-700 dark:text-slate-300">{closedCount}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </Card>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearchSubmit} className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ticket #, subject or tenant email..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2">
          {["ALL", "OPEN", "ANSWERED", "CLOSED"].map((status) => (
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

      {/* Tickets Table */}
      <Card bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3.5">Ticket #</th>
                <th className="px-5 py-3.5">Tenant</th>
                <th className="px-5 py-3.5">Subject & Preview</th>
                <th className="px-5 py-3.5">Category</th>
                <th className="px-5 py-3.5">Priority</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Updated</th>
                <th className="px-6 py-3.5 text-right w-[140px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && tickets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-500" />
                    <p className="mt-2 text-xs">Loading support tickets...</p>
                  </td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <LifeBuoy className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700" />
                    <p className="mt-2 text-sm font-medium">No tickets found</p>
                    <p className="text-xs text-slate-500">No support tickets match the current filters.</p>
                  </td>
                </tr>
              ) : (
                tickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                      {t.ticketNumber}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{t.tenantEmail}</div>
                      {t.panelUrl && (
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                          <span className="truncate max-w-[140px]">{t.panelUrl}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 max-w-xs">
                      <div className="font-semibold text-slate-900 truncate dark:text-slate-100">{t.subject}</div>
                      <div className="text-xs text-slate-500 truncate dark:text-slate-400">{t.lastMessage || "No messages yet"}</div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 capitalize dark:bg-slate-800 dark:text-slate-300">
                        {t.category ? t.category.toLowerCase() : "technical"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <PriorityChip value={t.priority} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <StatusChip value={t.status} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                      {new Date(t.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3.5 text-right">
                      <Button
                        size="sm"
                        onClick={() => loadTicketDetail(t.id)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                      >
                        View & Reply
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <div>
              Showing Page <span className="font-semibold">{pagination.page}</span> of <span className="font-semibold">{pagination.pages}</span> ({pagination.total} total)
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Ticket Conversation Modal */}
      {activeTicketId && (
        <Modal
          open={true}
          onClose={() => setActiveTicketId(null)}
          title={
            activeTicket ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-indigo-600 dark:text-indigo-400">{activeTicket.ticketNumber}</span>
                <span className="text-slate-400">·</span>
                <span className="truncate max-w-md">{activeTicket.subject}</span>
                <StatusChip value={activeTicket.status} />
                <PriorityChip value={activeTicket.priority} />
              </div>
            ) : "Ticket Conversation"
          }
          className="max-w-3xl"
        >
          {loadingDetail || !activeTicket ? (
            <div className="py-16 text-center text-slate-400">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-500" />
              <p className="mt-2 text-sm">Loading full ticket conversation...</p>
            </div>
          ) : (
            <div className="flex flex-col space-y-4 max-h-[75vh]">
              {/* Tenant context banner */}
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-900/60 dark:text-slate-300 flex flex-wrap items-center justify-between gap-2 border border-slate-200 dark:border-slate-800">
                <div className="space-y-0.5">
                  <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    Tenant: {activeTicket.tenantEmail}
                  </div>
                  {activeTicket.panelUrl && (
                    <div className="text-slate-500 flex items-center gap-1">
                      Panel: <span className="font-mono">{activeTicket.panelUrl}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {activeTicket.status !== "CLOSED" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleStatusChange("CLOSED")}
                      disabled={updatingStatus}
                    >
                      Close Ticket
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleStatusChange("OPEN")}
                      disabled={updatingStatus}
                    >
                      Reopen Ticket
                    </Button>
                  )}
                </div>
              </div>

              {/* Message Thread */}
              <div className="flex-1 overflow-y-auto space-y-3 p-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 min-h-[220px] max-h-[380px]">
                {activeTicket.messages?.map((msg) => {
                  const isSupport = msg.sender === "support";
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isSupport ? "items-end" : "items-start"}`}
                    >
                      <div className="flex items-center gap-1.5 px-1 pb-1 text-[11px] text-slate-400">
                        <span className="font-medium text-slate-600 dark:text-slate-300">
                          {isSupport ? (msg.senderName || "Admin Support") : (activeTicket.tenantEmail || "Tenant")}
                        </span>
                        <span>·</span>
                        <span>
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                          isSupport
                            ? "bg-indigo-600 text-white rounded-br-none shadow-sm"
                            : "bg-slate-100 text-slate-900 rounded-bl-none dark:bg-slate-800 dark:text-slate-100"
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reply Box */}
              <form onSubmit={handleSendReply} className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type an official reply to the tenant... (Sets status to ANSWERED)"
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    The tenant will see this immediately in their dashboard under <span className="font-medium">/dashboard/support</span>.
                  </span>
                  <Button
                    type="submit"
                    icon={Send}
                    disabled={sendingReply || !replyText.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                  >
                    {sendingReply ? "Sending..." : "Send Reply"}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

