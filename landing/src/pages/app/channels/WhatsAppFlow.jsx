import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { QrCode, RefreshCw, Send, Smartphone, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button, ConfirmModal, Skeleton, StatusBadge, StepperFlow } from "@/components/app/ui";
import { disconnectWhatsApp, getWhatsAppQR, getWhatsAppStatus, sendWhatsAppTest, startWhatsAppSession } from "@/lib/appApi";
import { useAppMutation, useAppQuery } from "@/lib/appQueries";
import { ChannelHeader, LiveStatusCard } from "./shared";

export default function WhatsAppFlow({ data }) {
    const current = data.status === "not_setup" || data.locked ? 0 : data.status === "pending" ? 1 : data.status === "live" ? 3 : 2;
    return (
        <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
            <section className="app-card" data-testid="whatsapp-flow">
                <ChannelHeader channel="whatsapp" data={data} description="Link a WhatsApp number and the AI replies to your customers there." />
                <div className="space-y-6 p-5 sm:p-6">
                    <StepperFlow steps={["Generate QR", "Scan with WhatsApp", "Connected"]} current={current} testId="whatsapp-stepper" />
                    {current === 0 && <GenerateStep />}
                    {current === 1 && <ScanStep />}
                    {current >= 2 && <ConnectedStep data={data} />}
                </div>
            </section>
            <LiveStatusCard channel="whatsapp" data={data} rows={[{ label: "Number", value: data.number || "—", testId: "whatsapp-status-number" }]} />
        </div>
    );
}

function GenerateStep() {
    const qc = useQueryClient();
    const start = useAppMutation(startWhatsAppSession, {
        success: "QR code ready — scan it with WhatsApp",
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["channels"] });
            qc.invalidateQueries({ queryKey: ["wa-qr"] });
            qc.invalidateQueries({ queryKey: ["wa-status"] });
        },
    });
    return (
        <div data-testid="whatsapp-step-generate">
            <h3 className="text-base font-semibold app-heading">Link your support number</h3>
            <p className="mt-1 text-sm app-muted">Use the phone that has your business WhatsApp. It stays logged in — like WhatsApp Web.</p>
            <Button className="mt-5" icon={QrCode} loading={start.isPending} onClick={() => start.mutate()} data-testid="whatsapp-generate-qr-button">
                Generate QR
            </Button>
        </div>
    );
}

function ScanStep() {
    const qc = useQueryClient();
    const qr = useAppQuery(["wa-qr"], getWhatsAppQR, { staleTime: 0 });
    const refresh = useAppMutation(startWhatsAppSession, {
        success: "New QR code generated",
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["wa-qr"] });
            qc.invalidateQueries({ queryKey: ["wa-status"] });
        },
    });
    const [left, setLeft] = useState(60);

    // Poll for the scan.
    const status = useAppQuery(["wa-status"], getWhatsAppStatus, { refetchInterval: 2000, staleTime: 0 });
    useEffect(() => {
        if (status.data?.status !== "live") return;
        toast.success(`WhatsApp connected as ${status.data.number || "Active Session"}`);
        qc.invalidateQueries({ queryKey: ["app"] });
        qc.invalidateQueries({ queryKey: ["channels"] });
        qc.invalidateQueries({ queryKey: ["account"] });
    }, [status.data?.status, status.data?.number, qc]);

    const activeQR = qr.data?.qrDataUrl ? qr.data : (status.data?.qrDataUrl ? status.data : qr.data);

    useEffect(() => {
        if (!activeQR?.expiresAt) return undefined;
        const tick = () => setLeft(Math.max(0, Math.round((activeQR.expiresAt - Date.now()) / 1000)));
        tick();
        const t = setInterval(tick, 1000);
        return () => clearInterval(t);
    }, [activeQR]);

    const expired = left === 0;
    const qrUrl = activeQR?.qrDataUrl;
    return (
        <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:items-start" data-testid="whatsapp-step-scan">
            <div className="relative mx-auto w-[220px] rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700">
                {qr.isLoading && !qrUrl ? (
                    <Skeleton className="h-[188px] w-[188px]" />
                ) : qrUrl ? (
                    <img src={qrUrl} alt="WhatsApp linking QR code" className="h-[188px] w-[188px] object-contain" data-testid="whatsapp-qr" />
                ) : (
                    <FakeQR value={activeQR?.value || "ysmm-wa-session"} />
                )}
                {expired && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/90 backdrop-blur-sm dark:bg-slate-900/90" data-testid="whatsapp-qr-expired">
                        <p className="text-sm font-semibold app-heading">QR code expired</p>
                        <Button size="sm" icon={RefreshCw} loading={refresh.isPending} onClick={() => refresh.mutate()} data-testid="whatsapp-qr-refresh-expired">
                            Refresh QR
                        </Button>
                    </div>
                )}
            </div>
            <div>
                <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status="pending" />
                    <span className="text-sm font-semibold tabular-nums app-muted" data-testid="whatsapp-qr-countdown">
                        {expired ? "Expired" : `Expires in 0:${String(left).padStart(2, "0")}`}
                    </span>
                </div>
                <ol className="mt-4 space-y-2.5 text-sm app-muted">
                    <li className="flex gap-2"><Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Open WhatsApp on your phone.</li>
                    <li>1. Tap <b className="app-heading">Settings</b> (or ⋮ menu) → <b className="app-heading">Linked devices</b>.</li>
                    <li>2. Tap <b className="app-heading">Link a device</b>.</li>
                    <li>3. Point your phone at this QR code.</li>
                </ol>
                <Button variant="secondary" size="sm" className="mt-5" icon={RefreshCw} loading={refresh.isPending} onClick={() => refresh.mutate()} data-testid="whatsapp-qr-refresh">
                    Refresh QR
                </Button>
            </div>
        </div>
    );
}

function ConnectedStep({ data }) {
    const qc = useQueryClient();
    const [confirm, setConfirm] = useState(false);
    const test = useAppMutation(sendWhatsAppTest, { success: (r) => r.message });
    const disconnect = useAppMutation(disconnectWhatsApp, {
        success: "WhatsApp disconnected",
        onSuccess: () => {
            setConfirm(false);
            qc.invalidateQueries({ queryKey: ["channels"] });
            qc.invalidateQueries({ queryKey: ["wa-status"] });
        },
    });
    const reconnect = useAppMutation(startWhatsAppSession, {
        success: "Scan the new QR to reconnect",
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["channels"] });
            qc.invalidateQueries({ queryKey: ["wa-qr"] });
            qc.invalidateQueries({ queryKey: ["wa-status"] });
        },
    });
    return (
        <div data-testid="whatsapp-step-connected">
            <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500 text-white">
                    <Smartphone className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Linked number</p>
                    <p className="mt-0.5 text-lg font-semibold app-heading" data-testid="whatsapp-number">
                        {data.number}
                    </p>
                </div>
                <StatusBadge status={data.status} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
                <Button icon={Send} loading={test.isPending} disabled={data.status !== "live"} onClick={() => test.mutate()} data-testid="whatsapp-test-button">
                    Send test message
                </Button>
                <Button variant="secondary" icon={RefreshCw} loading={reconnect.isPending} onClick={() => reconnect.mutate()} data-testid="whatsapp-reconnect-button">
                    Reconnect
                </Button>
                <Button variant="danger-outline" icon={Unplug} onClick={() => setConfirm(true)} data-testid="whatsapp-disconnect-button">
                    Disconnect
                </Button>
            </div>
            <ConfirmModal
                open={confirm}
                title="Disconnect WhatsApp?"
                description="This unlinks the device. The AI stops replying on WhatsApp until you scan a new QR code."
                confirmLabel="Disconnect"
                loading={disconnect.isPending}
                onConfirm={() => disconnect.mutate()}
                onClose={() => setConfirm(false)}
                testId="whatsapp-disconnect-modal"
            />
        </div>
    );
}

/** Visual stand-in for a QR code (deterministic from the session value). Replace with your backend's QR image. */
function FakeQR({ value }) {
    const N = 25;
    const cells = useMemo(() => {
        let h = 0;
        for (const c of value) h = (h * 31 + c.charCodeAt(0)) >>> 0;
        const out = [];
        for (let i = 0; i < N * N; i++) {
            h = (h * 1103515245 + 12345) >>> 0;
            out.push((h >>> 16) & 1);
        }
        return out;
    }, [value]);
    const finder = (x, y) => [[0, 0], [N - 7, 0], [0, N - 7]].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
    const finderOn = (x, y) => {
        const [fx, fy] = [[0, 0], [N - 7, 0], [0, N - 7]].find(([a, b]) => x >= a && x < a + 7 && y >= b && y < b + 7);
        const dx = x - fx;
        const dy = y - fy;
        return dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
    };
    return (
        <svg viewBox={`0 0 ${N} ${N}`} className="h-[188px] w-[188px]" role="img" aria-label="WhatsApp linking QR code" data-testid="whatsapp-qr">
            {cells.map((on, i) => {
                const x = i % N;
                const y = Math.floor(i / N);
                const fill = finder(x, y) ? finderOn(x, y) : on;
                return fill ? <rect key={i} x={x} y={y} width="1" height="1" fill="#0f172a" /> : null;
            })}
        </svg>
    );
}
