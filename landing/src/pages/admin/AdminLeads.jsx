import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Edit3,
  ExternalLink,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  Trash2
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, Button, Modal } from "@/components/app/ui";
import { adminApi } from "@/lib/adminApi";

const STATUSES = ["ALL", "NEW", "CONTACTED", "QUALIFIED", "CLOSED"];

export default function AdminLeads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Notes Modal
  const [noteModalLead, setNoteModalLead] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getLeads({
        status: statusFilter,
        search: search.trim()
      });
      setLeads(data.leads || []);
    } catch (err) {
      toast.error(err.message || "Failed to load leads");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [statusFilter]);

  const handleStatusChange = async (leadId, nextStatus) => {
    try {
      await adminApi.updateLead(leadId, { status: nextStatus });
      toast.success(`Lead status updated to ${nextStatus}`);
      fetchLeads();
    } catch (err) {
      toast.error(err.message || "Failed to update status");
    }
  };

  const openNoteModal = (lead) => {
    setNoteModalLead(lead);
    setNoteText(lead.notes || "");
  };

  const handleSaveNotes = async (e) => {
    e.preventDefault();
    if (!noteModalLead) return;
    setSavingNote(true);
    try {
      await adminApi.updateLead(noteModalLead.id, { notes: noteText });
      toast.success("Lead notes updated");
      setNoteModalLead(null);
      fetchLeads();
    } catch (err) {
      toast.error(err.message || "Failed to save notes");
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteLead = async (lead) => {
    if (!window.confirm(`Delete inquiry from ${lead.email || lead.name || "this lead"}?`)) return;
    try {
      await adminApi.deleteLead(lead.id);
      toast.success("Lead removed");
      fetchLeads();
    } catch (err) {
      toast.error(err.message || "Failed to delete lead");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbound Landing Leads CRM"
        description="Prospective panel owners requesting demos, integrations, or custom enterprise solutions."
        actions={
          <Button variant="secondary" size="sm" icon={RefreshCw} loading={loading} onClick={fetchLeads}>
            Refresh
          </Button>
        }
      />

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {STATUSES.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === st
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100 dark:border dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Leads Table */}
      <Card bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3.5">Contact</th>
                <th className="px-5 py-3.5">Panel URL</th>
                <th className="px-5 py-3.5">Message / Inquiry</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Notes</th>
                <th className="px-5 py-3.5">Received</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-500" />
                    <p className="mt-2 text-xs">Loading leads...</p>
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Inbox className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700" />
                    <p className="mt-2 text-sm font-medium">No lead inquiries found</p>
                    <p className="text-xs text-slate-500">Inbound requests will appear here automatically.</p>
                  </td>
                </tr>
              ) : (
                leads.map((l) => (
                  <tr key={l.id} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-900/40">
                    {/* Contact */}
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{l.name || "Anonymous Lead"}</div>
                      <div className="text-xs text-slate-500">{l.email}</div>
                      {l.phone && <div className="text-[11px] font-mono text-slate-400">{l.phone}</div>}
                    </td>

                    {/* Panel URL */}
                    <td className="px-5 py-4">
                      {l.panelUrl ? (
                        <a
                          href={l.panelUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-indigo-600 hover:underline dark:text-indigo-400 truncate block max-w-[180px]"
                        >
                          {l.panelUrl}
                        </a>
                      ) : (
                        <span className="text-xs italic text-slate-400">—</span>
                      )}
                    </td>

                    {/* Message */}
                    <td className="px-5 py-4">
                      <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xs line-clamp-2">
                        {l.message || "—"}
                      </p>
                    </td>

                    {/* Status Select */}
                    <td className="px-5 py-4">
                      <select
                        value={l.status || "NEW"}
                        onChange={(e) => handleStatusChange(l.id, e.target.value)}
                        className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                          l.status === "QUALIFIED"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                            : l.status === "CONTACTED"
                            ? "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400"
                            : l.status === "CLOSED"
                            ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                            : "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400"
                        }`}
                      >
                        <option value="NEW">NEW</option>
                        <option value="CONTACTED">CONTACTED</option>
                        <option value="QUALIFIED">QUALIFIED</option>
                        <option value="CLOSED">CLOSED</option>
                      </select>
                    </td>

                    {/* Notes */}
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => openNoteModal(l)}
                        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
                      >
                        <Edit3 className="h-3 w-3" />
                        <span className="truncate max-w-[100px]">{l.notes ? l.notes : "Add note..."}</span>
                      </button>
                    </td>

                    {/* Received Date */}
                    <td className="px-5 py-4 text-xs text-slate-400 whitespace-nowrap">
                      {l.createdAt ? new Date(l.createdAt).toLocaleDateString() : "—"}
                    </td>

                    {/* Delete */}
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteLead(l)}
                        className="btn btn-ghost btn-icon h-8 w-8 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Notes Modal */}
      {noteModalLead && (
        <Modal
          title={`Notes: ${noteModalLead.name || noteModalLead.email}`}
          description="Internal sales and qualification notes for this inquiry."
          onClose={() => setNoteModalLead(null)}
        >
          <form onSubmit={handleSaveNotes} className="space-y-4">
            <textarea
              rows={4}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="e.g. Needs WhatsApp multi-agent support for 50k monthly orders..."
              className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setNoteModalLead(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={savingNote}>
                Save Notes
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

