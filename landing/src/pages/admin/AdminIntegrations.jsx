import { useEffect, useState } from "react";
import {
  CreditCard,
  Eye,
  EyeOff,
  Globe,
  Key,
  Mail,
  RefreshCw,
  Save,
  Send,
  ShieldCheck
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, Button, Modal } from "@/components/app/ui";
import { adminApi } from "@/lib/adminApi";

export default function AdminIntegrations() {
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [maskedPass, setMaskedPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");

  const [cryptomusMerchant, setCryptomusMerchant] = useState("");
  const [cryptomusKey, setCryptomusKey] = useState("");
  const [maskedCryptoKey, setMaskedCryptoKey] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showCryptoKey, setShowCryptoKey] = useState(false);

  // Test Email state
  const [testEmailModal, setTestEmailModal] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    adminApi
      .getSettings()
      .then((data) => {
        const s = data?.settings || {};
        if (s.smtp_host) setSmtpHost(s.smtp_host);
        if (s.smtp_port) setSmtpPort(s.smtp_port);
        if (s.smtp_user) setSmtpUser(s.smtp_user);
        if (s.smtp_pass) setMaskedPass(s.smtp_pass);
        if (s.smtp_from) setSmtpFrom(s.smtp_from);
        if (s.cryptomus_merchant_id) setCryptomusMerchant(s.cryptomus_merchant_id);
        if (s.cryptomus_api_key) setMaskedCryptoKey(s.cryptomus_api_key);
      })
      .catch((err) => toast.error(err.message || "Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updates = {
        smtp_host: smtpHost.trim(),
        smtp_port: smtpPort.trim(),
        smtp_user: smtpUser.trim(),
        smtp_from: smtpFrom.trim(),
        cryptomus_merchant_id: cryptomusMerchant.trim()
      };
      if (smtpPass.trim()) updates.smtp_pass = smtpPass.trim();
      if (cryptomusKey.trim()) updates.cryptomus_api_key = cryptomusKey.trim();

      await adminApi.updateSettings(updates);
      toast.success("Integrations settings successfully saved!");
      setSmtpPass("");
      setCryptomusKey("");
    } catch (err) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestEmail = async (e) => {
    e.preventDefault();
    if (!testEmailTo.trim()) return;
    setSendingTest(true);
    try {
      const res = await adminApi.testEmailConnection(testEmailTo.trim());
      toast.success(res.message || `Test email dispatched to ${testEmailTo}`);
      setTestEmailModal(false);
    } catch (err) {
      toast.error(err.message || "Failed to send test email");
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Integrations & Gateways"
        description="Configure transactional SMTP email dispatch and Cryptomus merchant keys."
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={Send}
            onClick={() => setTestEmailModal(true)}
          >
            Send Test Email
          </Button>
        }
      />

      <form onSubmit={handleSave} className="space-y-6">
        {/* Transactional Email (SMTP) */}
        <Card title="Transactional Email (SMTP)" icon={Mail}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                SMTP Host
              </label>
              <input
                type="text"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="e.g. email-smtp.us-east-1.amazonaws.com"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                SMTP Port
              </label>
              <input
                type="text"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                placeholder="587 or 465"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                SMTP Username
              </label>
              <input
                type="text"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="AKIA..."
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  SMTP Password
                </label>
                {maskedPass && <span className="font-mono text-[10px] text-slate-400">Vault: {maskedPass}</span>}
              </div>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  placeholder={maskedPass ? "•••••••••••• (Leave blank to keep)" : "SMTP password"}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-10 text-sm font-mono dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                From Address Header
              </label>
              <input
                type="text"
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
                placeholder='"YourSMMagent" <noreply@yourdomain.com>'
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
        </Card>

        {/* Cryptomus Billing */}
        <Card title="Cryptomus Payment Gateway" icon={CreditCard}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Merchant UUID
              </label>
              <input
                type="text"
                value={cryptomusMerchant}
                onChange={(e) => setCryptomusMerchant(e.target.value)}
                placeholder="UUID from Cryptomus dashboard"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Payment API Key
                </label>
                {maskedCryptoKey && <span className="font-mono text-[10px] text-slate-400">Vault: {maskedCryptoKey}</span>}
              </div>
              <div className="relative">
                <input
                  type={showCryptoKey ? "text" : "password"}
                  value={cryptomusKey}
                  onChange={(e) => setCryptomusKey(e.target.value)}
                  placeholder={maskedCryptoKey ? "•••••••••••• (Leave blank to keep)" : "API key from Cryptomus"}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-10 text-sm font-mono dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setShowCryptoKey(!showCryptoKey)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showCryptoKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </Card>

        <div className="flex justify-end pt-2">
          <Button type="submit" variant="primary" icon={Save} loading={saving}>
            Save Integration Settings
          </Button>
        </div>
      </form>

      {/* Test Email Modal */}
      {testEmailModal && (
        <Modal
          title="Send Test Transactional Email"
          description="Dispatch a live test email through your configured SMTP transport."
          onClose={() => setTestEmailModal(false)}
        >
          <form onSubmit={handleSendTestEmail} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Recipient Email Address
              </label>
              <input
                type="email"
                required
                value={testEmailTo}
                onChange={(e) => setTestEmailTo(e.target.value)}
                placeholder="you@domain.com"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setTestEmailModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" loading={sendingTest} icon={Send}>
                Send Test Now
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

