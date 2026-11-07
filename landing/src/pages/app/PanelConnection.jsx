import { useEffect, useState } from "react";
import { CheckCircle2, Plug, RefreshCw, Unplug, XCircle } from "lucide-react";
import { Button, Card, ConfirmModal, Field, PageHeader, QueryState, SecretInput, SkeletonCard, StatusBadge } from "@/components/app/ui";
import { PANEL_URL_RE, connectPanel, disconnectPanel, getPanel, syncPanel, testPanelConnection } from "@/lib/appApi";
import { formatDateTime, money, timeAgo, useAppMutation, useAppQuery } from "@/lib/appQueries";

export default function PanelConnection() {
    const q = useAppQuery(["panel"], getPanel);
    return (
        <div data-testid="panel-page">
            <PageHeader title="SMM Panel Connection" description="Connect your panel's API so the AI can check balances, services and orders for your customers." />
            <QueryState query={q} skeleton={<SkeletonCard lines={5} />}>
                {(panel) => <PanelForm panel={panel} />}
            </QueryState>
        </div>
    );
}

function PanelForm({ panel }) {
    const [url, setUrl] = useState(panel.url || "");
    const [apiKey, setApiKey] = useState("");
    const [errors, setErrors] = useState({});
    const [result, setResult] = useState(null);
    const [confirm, setConfirm] = useState(false);

    useEffect(() => {
        setUrl(panel.url || "");
    }, [panel.url]);

    const test = useAppMutation(testPanelConnection, {
        success: false,
        onSuccess: (r) => setResult({ ok: true, ...r }),
        onError: (e) => setResult({ ok: false, message: e.message }),
    });
    const connect = useAppMutation(connectPanel, { success: "Panel connected — services synced", onSuccess: () => setApiKey("") });
    const sync = useAppMutation(syncPanel, { success: "Panel synced" });
    const disconnect = useAppMutation(disconnectPanel, { success: "Panel disconnected", onSuccess: () => { setConfirm(false); setResult(null); } });

    const validate = () => {
        const e = {};
        if (!PANEL_URL_RE.test(url.trim())) e.url = "Use the full API URL starting with https://, e.g. https://mypanel.com/api/v2";
        if (apiKey.trim().length < 16) e.apiKey = panel.connected && !apiKey ? "Enter the API key again to update the connection." : "API key should be at least 16 characters.";
        setErrors(e);
        return !Object.keys(e).length;
    };

    return (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card
                title="API credentials"
                description="Find these on your panel under Account → API."
                icon={Plug}
                testId="panel-credentials-card"
                action={<StatusBadge status={panel.connected ? "connected" : "disconnected"} testId="panel-status-badge" />}
            >
                <form
                    noValidate
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (validate()) connect.mutate({ url, apiKey });
                    }}
                    className="space-y-5"
                    data-testid="panel-form"
                >
                    <Field label="Panel API URL" htmlFor="panel-url" error={errors.url} hint="Example: https://mypanel.com/api/v2">
                        <input
                            id="panel-url"
                            value={url}
                            onChange={(e) => {
                                setUrl(e.target.value);
                                setErrors((x) => ({ ...x, url: undefined }));
                                setResult(null);
                            }}
                            placeholder="https://mypanel.com/api/v2"
                            inputMode="url"
                            className={`app-input ${errors.url ? "app-input-error" : ""}`}
                            data-testid="panel-url-input"
                        />
                    </Field>
                    <Field
                        label="API key"
                        htmlFor="panel-key"
                        error={errors.apiKey}
                        hint={panel.connected ? `Saved key ends in ••••${panel.apiKeyLast4}. Enter a new key to replace it.` : "Stored encrypted. Only the last 4 characters are ever shown."}
                    >
                        <SecretInput
                            id="panel-key"
                            value={apiKey}
                            onChange={(e) => {
                                setApiKey(e.target.value);
                                setErrors((x) => ({ ...x, apiKey: undefined }));
                                setResult(null);
                            }}
                            placeholder={panel.connected ? `••••••••••••${panel.apiKeyLast4}` : "Paste your panel API key"}
                            error={errors.apiKey}
                            testId="panel-key-input"
                        />
                    </Field>

                    {result && (
                        <div
                            role="status"
                            data-testid={result.ok ? "panel-test-success" : "panel-test-error"}
                            className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
                                result.ok
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                                    : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                            }`}
                        >
                            {result.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0" />}
                            <div>
                                <p className="font-semibold">{result.ok ? "Connection successful" : "Connection failed"}</p>
                                <p className="mt-0.5">
                                    {result.ok
                                        ? `Found ${result.services.toLocaleString()} services · panel balance ${money(result.balance)} · ${result.latencyMs} ms response`
                                        : result.message}
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                        <Button type="submit" loading={connect.isPending} data-testid="panel-connect-button">
                            {panel.connected ? "Update connection" : "Save & connect"}
                        </Button>
                        <Button
                            variant="secondary"
                            loading={test.isPending}
                            onClick={() => validate() && test.mutate({ url, apiKey })}
                            data-testid="panel-test-button"
                        >
                            Test connection
                        </Button>
                    </div>
                </form>
            </Card>

            <Card title="Sync status" testId="panel-sync-card">
                <dl className="space-y-4 text-sm">
                    <Row label="Status" value={<StatusBadge status={panel.connected ? "connected" : "disconnected"} />} />
                    <Row label="Panel" value={panel.connected ? new URL(panel.url).hostname : "—"} testId="panel-host" />
                    <Row label="Services synced" value={panel.connected ? panel.services.toLocaleString() : "—"} />
                    <Row
                        label="Last sync"
                        value={panel.lastSync ? <span title={formatDateTime(panel.lastSync)}>{timeAgo(panel.lastSync)}</span> : "Never"}
                        testId="panel-last-sync"
                    />
                </dl>
                {panel.connected && (
                    <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-5 dark:border-slate-800">
                        <Button variant="secondary" size="sm" icon={RefreshCw} loading={sync.isPending} onClick={() => sync.mutate()} data-testid="panel-sync-button">
                            Sync now
                        </Button>
                        <Button variant="danger-outline" size="sm" icon={Unplug} onClick={() => setConfirm(true)} data-testid="panel-disconnect-button">
                            Disconnect
                        </Button>
                    </div>
                )}
            </Card>

            <ConfirmModal
                open={confirm}
                title="Disconnect your SMM panel?"
                description="The AI will stop answering balance, service and order questions until you reconnect."
                confirmLabel="Disconnect"
                loading={disconnect.isPending}
                onConfirm={() => disconnect.mutate()}
                onClose={() => setConfirm(false)}
                testId="panel-disconnect-modal"
            />
        </div>
    );
}

const Row = ({ label, value, testId }) => (
    <div className="flex items-center justify-between gap-4">
        <dt className="app-muted">{label}</dt>
        <dd className="break-all text-right font-medium app-heading" data-testid={testId}>
            {value}
        </dd>
    </div>
);
