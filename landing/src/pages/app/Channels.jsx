import { useSearchParams } from "react-router-dom";
import { CHANNEL_META, ErrorState, LockedPreview, PageHeader, Segmented, SkeletonCard } from "@/components/app/ui";
import { CHANNELS, PLANS, getChannels, getPanel } from "@/lib/appApi";
import { useAppQuery } from "@/lib/appQueries";
import TelegramFlow from "./channels/TelegramFlow";
import WhatsAppFlow from "./channels/WhatsAppFlow";
import WidgetFlow from "./channels/WidgetFlow";

const DOT = { live: "bg-emerald-500", offline: "bg-slate-400", not_setup: "bg-amber-500", pending: "bg-amber-500", locked: "bg-slate-300 dark:bg-slate-600" };
const FLOWS = { telegram: TelegramFlow, whatsapp: WhatsAppFlow, widget: WidgetFlow };

export default function Channels() {
    const [params, setParams] = useSearchParams();
    const tab = CHANNELS.includes(params.get("tab")) ? params.get("tab") : "telegram";
    const q = useAppQuery(["channels"], getChannels, {
        // Keep polling while the bot username is being detected.
        refetchInterval: (query) => {
            const t = query.state.data?.telegram;
            return t && t.status !== "not_setup" && t.status !== "locked" && !t.username ? 3000 : false;
        },
    });
    const panel = useAppQuery(["panel"], getPanel);
    const Flow = FLOWS[tab];
    const ch = q.data?.[tab];
    const unlockPlan = PLANS.find((p) => p.channels.includes(tab))?.name;

    return (
        <div data-testid="channels-page">
            <PageHeader title="Channels" description="Activate a channel in a few steps, then monitor and control it here." />
            <Segmented
                className="mb-6"
                value={tab}
                onChange={(v) => setParams({ tab: v }, { replace: true })}
                testId="channel-tabs"
                options={CHANNELS.map((c) => ({
                    value: c,
                    label: CHANNEL_META[c].label,
                    icon: CHANNEL_META[c].icon,
                    badge: q.data && <span className={`h-1.5 w-1.5 rounded-full ${DOT[q.data[c].status]}`} aria-label={q.data[c].status} />,
                }))}
            />
            {q.isLoading ? (
                <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
                    <SkeletonCard lines={6} />
                    <SkeletonCard lines={4} />
                </div>
            ) : q.isError ? (
                <ErrorState message={q.error.message} onRetry={q.refetch} />
            ) : ch.locked ? (
                <LockedPreview channelLabel={CHANNEL_META[tab].label} planName={unlockPlan} testId={`${tab}-locked`}>
                    <Flow data={{ ...ch, status: "locked" }} panelHost={null} />
                </LockedPreview>
            ) : (
                <Flow key={tab} data={ch} panelHost={panel.data?.connected ? new URL(panel.data.url).hostname : null} />
            )}
        </div>
    );
}
