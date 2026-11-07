import { useState } from "react";
import { ExternalLink, KeyRound, Megaphone, Play, RefreshCw, Send, Square } from "lucide-react";
import { Button, ConfirmModal, CopyButton, Field, SecretInput, StatusBadge, StepperFlow } from "@/components/app/ui";
import { TELEGRAM_TOKEN_RE, deployTelegramBot, markShared, refreshTelegramStatus, startBot, stopBot, testBot } from "@/lib/appApi";
import { useAppMutation } from "@/lib/appQueries";
import { ChannelHeader, LiveStatusCard } from "./shared";

export default function TelegramFlow({ data, panelHost }) {
    const deployed = data.status !== "not_setup" && !data.locked;
    const [step, setStep] = useState(0);
    const [editing, setEditing] = useState(false);
    const [stopOpen, setStopOpen] = useState(false);
    const current = deployed && !editing ? 2 : Math.max(step, editing ? 1 : 0);

    const stop = useAppMutation(stopBot, { success: "Bot stopped", onSuccess: () => setStopOpen(false) });
    const announcement = `Get instant 24/7 support on Telegram!
1. Open ${data.username ? `@${data.username}` : "our Telegram bot"} and press /start
2. Link your account: send your API key from ${panelHost ? `${panelHost}/account` : "your account page"}
3. Check your balance any time with /balance
4. Browse services and prices with /services`;

    return (
        <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
            <section className="app-card" data-testid="telegram-flow">
                <ChannelHeader channel="telegram" data={data} description="Your AI agent answers customers inside your own Telegram bot." onRequestOff={() => setStopOpen(true)} />
                <div className="space-y-6 p-5 sm:p-6">
                    <StepperFlow steps={["Create a bot", "Paste token", "Live"]} current={current === 2 && data.status === "live" ? 3 : current} testId="telegram-stepper" />
                    {current === 0 && <CreateStep onNext={() => setStep(1)} />}
                    {current === 1 && (
                        <TokenStep
                            onBack={() => (editing ? setEditing(false) : setStep(0))}
                            onDone={() => {
                                setEditing(false);
                                setStep(2);
                            }}
                        />
                    )}
                    {current === 2 && <DoneStep data={data} onStop={() => setStopOpen(true)} onChangeToken={() => setEditing(true)} />}
                </div>
            </section>

            <div className="space-y-6">
                <LiveStatusCard channel="telegram" data={data} rows={[{ label: "Token", value: data.tokenLast4 ? `••••${data.tokenLast4}` : "—" }]} />
                <section className="app-card p-5 sm:p-6" data-testid="telegram-announcement-card">
                    <div className="flex items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                            <Megaphone className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                            <h3 className="text-base font-semibold app-heading">Customer announcement</h3>
                            <p className="mt-0.5 text-sm app-muted">Post this on your panel or channel so customers start using the bot.</p>
                        </div>
                    </div>
                    <ol className="mt-4 space-y-2.5 text-sm">
                        {[
                            ["/start", `Open ${data.username ? `@${data.username}` : "the bot"} and press Start`],
                            ["API key", "Link their panel account with their API key"],
                            ["/balance", "Check their balance instantly"],
                            ["/services", "Browse services and prices"],
                        ].map(([cmd, text], i) => (
                            <li key={cmd} className="flex items-start gap-3">
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{i + 1}</span>
                                <span className="app-muted">
                                    <code className="mr-1 rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">{cmd}</code>
                                    {text}
                                </span>
                            </li>
                        ))}
                    </ol>
                    <div className="mt-5">
                        <AnnouncementCopy text={announcement} />
                    </div>
                </section>
            </div>

            <ConfirmModal
                open={stopOpen}
                title="Stop your Telegram bot?"
                description="Customers messaging the bot won't get replies until you start it again. Your token and settings are kept."
                confirmLabel="Stop bot"
                loading={stop.isPending}
                onConfirm={() => stop.mutate()}
                onClose={() => setStopOpen(false)}
                testId="telegram-stop-modal"
            />
        </div>
    );
}

function AnnouncementCopy({ text }) {
    const share = useAppMutation(markShared, { success: false });
    return <CopyButton text={text} label="Copy announcement" variant="primary" size="md" testId="telegram-announcement-copy" onCopied={() => share.mutate()} />;
}

function CreateStep({ onNext }) {
    return (
        <div data-testid="telegram-step-create">
            <h3 className="text-base font-semibold app-heading">Create your bot with @BotFather</h3>
            <ol className="mt-3 space-y-2 text-sm app-muted">
                <li>1. Open <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400" data-testid="telegram-botfather-link">@BotFather</a> in Telegram.</li>
                <li>2. Send <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">/newbot</code> and choose a name and a username ending in “bot”.</li>
                <li>3. BotFather replies with a token like <code className="break-all rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">123456789:AAH…</code> — copy it.</li>
            </ol>
            <div className="mt-5 flex flex-wrap gap-2">
                <Button onClick={onNext} icon={KeyRound} data-testid="telegram-have-token-button">
                    I have my token
                </Button>
                <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                    Open @BotFather <ExternalLink className="h-4 w-4" />
                </a>
            </div>
        </div>
    );
}

function TokenStep({ onBack, onDone }) {
    const [token, setToken] = useState("");
    const [error, setError] = useState();
    const deploy = useAppMutation(deployTelegramBot, { success: "Bot activated — it's live!", onSuccess: onDone, onError: (e) => setError(e.message) });
    const submit = (e) => {
        e.preventDefault();
        if (!TELEGRAM_TOKEN_RE.test(token.trim())) return setError("That doesn't look like a bot token. It should look like 123456789:AAH…");
        deploy.mutate({ token: token.trim() });
    };
    return (
        <form onSubmit={submit} noValidate data-testid="telegram-step-token">
            <Field label="Bot token" htmlFor="telegram-token" error={error} hint="We store it encrypted and never show it again — only the last 4 characters.">
                <SecretInput
                    id="telegram-token"
                    value={token}
                    onChange={(e) => {
                        setToken(e.target.value);
                        setError(undefined);
                    }}
                    placeholder="123456789:AAH…"
                    error={error}
                    testId="telegram-token-input"
                />
            </Field>
            <div className="mt-5 flex flex-wrap gap-2">
                <Button type="submit" loading={deploy.isPending} data-testid="telegram-activate-button">
                    {deploy.isPending ? "Activating…" : "Activate Bot"}
                </Button>
                <Button variant="ghost" onClick={onBack} disabled={deploy.isPending} data-testid="telegram-back-button">
                    Back
                </Button>
            </div>
        </form>
    );
}

function DoneStep({ data, onStop, onChangeToken }) {
    const refresh = useAppMutation(refreshTelegramStatus, { success: (t) => (t.username ? `Found @${t.username}` : "Still detecting — try again in a moment") });
    const test = useAppMutation(testBot, { success: (r) => r.message });
    const start = useAppMutation(startBot, { success: "Bot started" });
    const live = data.status === "live";
    return (
        <div data-testid="telegram-step-done">
            <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500 text-white">
                    <Send className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Bot username</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        <p className="break-all text-lg font-semibold app-heading" data-testid="telegram-bot-username">
                            {data.username ? `@${data.username}` : "Detecting…"}
                        </p>
                        {!data.username && (
                            <Button variant="ghost" size="sm" icon={RefreshCw} loading={refresh.isPending} onClick={() => refresh.mutate()} data-testid="telegram-refresh-username">
                                Refresh
                            </Button>
                        )}
                    </div>
                </div>
                <StatusBadge status={data.status} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
                {live ? (
                    <Button icon={Send} loading={test.isPending} onClick={() => test.mutate()} data-testid="telegram-test-button">
                        Test Bot
                    </Button>
                ) : (
                    <Button icon={Play} loading={start.isPending} onClick={() => start.mutate()} data-testid="telegram-start-button">
                        Start Bot
                    </Button>
                )}
                <a
                    href={data.username ? `https://t.me/${data.username}` : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-disabled={!data.username}
                    className={`btn btn-secondary ${data.username ? "" : "pointer-events-none opacity-60"}`}
                    data-testid="telegram-open-link"
                >
                    Open in Telegram <ExternalLink className="h-4 w-4" />
                </a>
                {live && (
                    <Button variant="danger-outline" icon={Square} onClick={onStop} data-testid="telegram-stop-button">
                        Stop Bot
                    </Button>
                )}
                <Button variant="ghost" onClick={onChangeToken} data-testid="telegram-change-token">
                    Change token
                </Button>
            </div>
        </div>
    );
}
