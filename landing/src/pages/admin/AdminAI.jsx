import { useEffect, useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  Flame,
  Key,
  Loader2,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  Zap
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, Button } from "@/components/app/ui";
import { adminApi } from "@/lib/adminApi";

const PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    badge: "Most Popular",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"],
    placeholder: "sk-proj-...",
    desc: "Industry standard speed & high reasoning accuracy for customer support."
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    badge: "High Precision",
    models: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
    placeholder: "sk-ant-...",
    desc: "Unmatched contextual understanding and nuanced conversational tone."
  },
  {
    id: "gemini",
    name: "Google Gemini",
    badge: "Cost Efficient",
    models: ["gemini-1.5-flash", "gemini-1.5-pro"],
    placeholder: "AIzaSy...",
    desc: "Ultra-fast response latency and massive token window."
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    badge: "High Performance",
    models: ["deepseek-chat", "deepseek-reasoner"],
    placeholder: "sk-...",
    desc: "State-of-the-art open reasoning architecture at competitive rates."
  }
];

export default function AdminAI() {
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("gpt-4o-mini");
  const [apiKey, setApiKey] = useState("");
  const [maskedKey, setMaskedKey] = useState("");
  const [temperature, setTemperature] = useState(0.3);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    adminApi
      .getSettings()
      .then((data) => {
        const s = data?.settings || {};
        if (s.ai_provider) setProvider(s.ai_provider);
        if (s.ai_model) setModel(s.ai_model);
        if (s.ai_api_key) setMaskedKey(s.ai_api_key);
        if (s.ai_temperature) setTemperature(parseFloat(s.ai_temperature));
      })
      .catch((err) => toast.error(err.message || "Failed to load AI settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleProviderSelect = (pId) => {
    setProvider(pId);
    const p = PROVIDERS.find((x) => x.id === pId);
    if (p && p.models.length > 0) {
      setModel(p.models[0]);
    }
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await adminApi.testAiConnection({
        provider,
        model,
        apiKey: apiKey.trim() || undefined
      });
      setTestResult(res);
      toast.success("AI connection handshake succeeded!");
    } catch (err) {
      setTestResult({ success: false, error: err.message });
      toast.error(err.message || "AI test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updates = {
        ai_provider: provider,
        ai_model: model,
        ai_temperature: String(temperature)
      };
      if (apiKey.trim()) {
        updates.ai_api_key = apiKey.trim();
      }

      await adminApi.updateSettings(updates);
      toast.success("AI configuration saved and activated across all tenant bots!");
      setApiKey("");
      const fresh = await adminApi.getSettings();
      if (fresh?.settings?.ai_api_key) {
        setMaskedKey(fresh.settings.ai_api_key);
      }
    } catch (err) {
      toast.error(err.message || "Failed to save AI configuration");
    } finally {
      setSaving(false);
    }
  };

  const currentProviderConfig = PROVIDERS.find((p) => p.id === provider) || PROVIDERS[0];

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="AI Engine Configuration"
        description="Select runtime intelligence provider, manage AES-256 encrypted API keys, and test live responses."
      />

      <form onSubmit={handleSave} className="space-y-6">
        {/* Provider Cards */}
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
            Select Active AI Provider
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PROVIDERS.map((p) => {
              const selected = provider === p.id;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => handleProviderSelect(p.id)}
                  className={`flex flex-col text-left rounded-xl p-4 transition-all border ${
                    selected
                      ? "border-indigo-600 bg-indigo-50/70 shadow-sm dark:border-indigo-500 dark:bg-indigo-950/40"
                      : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{p.name}</span>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        selected
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {p.badge}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{p.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Credentials & Model Card */}
        <Card title="Model Parameters & API Key" icon={Key}>
          <div className="space-y-4">
            {/* Model Name */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Model Name / Checkpoint
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. gpt-4o-mini"
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
                <select
                  value={currentProviderConfig.models.includes(model) ? model : ""}
                  onChange={(e) => e.target.value && setModel(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                >
                  <option value="">Recommended Models...</option>
                  {currentProviderConfig.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* API Key */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  API Key (Stored in Encrypted Vault)
                </label>
                {maskedKey && (
                  <span className="font-mono text-[11px] text-slate-500">
                    Current active: <span className="font-semibold text-indigo-500">{maskedKey}</span>
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={maskedKey ? "Leave blank to keep active key" : currentProviderConfig.placeholder}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-10 text-sm font-mono text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Temperature Slider */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Temperature: <span className="text-indigo-600 font-mono dark:text-indigo-400">{temperature}</span>
                </label>
                <span className="text-[11px] text-slate-400">
                  {temperature <= 0.2 ? "Precise & Deterministic" : temperature >= 0.7 ? "Creative" : "Balanced"}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>
          </div>
        </Card>

        {/* Live Handshake Test Result Card */}
        {testResult && (
          <div
            className={`rounded-xl border p-4 ${
              testResult.success
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
                : "border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-200"
            }`}
          >
            <div className="flex items-start gap-3">
              {testResult.success ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-rose-500 mt-0.5 shrink-0" />
              )}
              <div className="space-y-1 text-xs">
                <p className="font-semibold">{testResult.message || (testResult.success ? "Handshake Successful" : "Test Failed")}</p>
                {testResult.reply && (
                  <p className="font-mono bg-white/40 dark:bg-slate-950/40 p-2 rounded text-[11px] leading-relaxed">
                    Model response: "{testResult.reply}"
                  </p>
                )}
                {testResult.latencyMs && (
                  <p className="text-[10px] text-slate-500">Round-trip latency: {testResult.latencyMs}ms</p>
                )}
                {testResult.error && <p className="text-rose-400 font-mono text-[11px]">{testResult.error}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            icon={Zap}
            loading={testing}
            onClick={handleTestConnection}
          >
            Test Handshake Live
          </Button>

          <Button type="submit" variant="primary" icon={Save} loading={saving}>
            Save & Activate AI Config
          </Button>
        </div>
      </form>
    </div>
  );
}

