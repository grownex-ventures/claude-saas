import { useEffect, useState } from "react";
import { Globe, ImagePlus, MessageCircle, Send, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button, CopyButton, Field, QueryState, Segmented, Select, SkeletonCard, StepperFlow } from "@/components/app/ui";
import { getWidgetConfig, saveWidgetConfig, verifyWidgetInstall } from "@/lib/appApi";
import { useAppMutation, useAppQuery } from "@/lib/appQueries";
import { ChannelHeader, LiveStatusCard } from "./shared";

const LANGUAGES = [
    { value: "en", label: "English" },
    { value: "es", label: "Español" },
    { value: "pt", label: "Português" },
    { value: "ru", label: "Русский" },
    { value: "tr", label: "Türkçe" },
    { value: "hi", label: "हिन्दी" },
    { value: "ar", label: "العربية" },
    { value: "id", label: "Bahasa Indonesia" },
];
const PLACEHOLDER = { en: "Type a message…", es: "Escribe un mensaje…", pt: "Digite uma mensagem…", ru: "Введите сообщение…", tr: "Bir mesaj yazın…", hi: "संदेश लिखें…", ar: "اكتب رسالة…", id: "Ketik pesan…" };

export default function WidgetFlow({ data }) {
    const q = useAppQuery(["widget"], getWidgetConfig);
    return (
        <QueryState query={q} skeleton={<SkeletonCard lines={6} />}>
            {(w) => <WidgetEditor data={data} widget={w} />}
        </QueryState>
    );
}

function WidgetEditor({ data, widget }) {
    const [cfg, setCfg] = useState(widget.config);
    const [hexDraft, setHexDraft] = useState(widget.config.color);
    useEffect(() => {
        setCfg(widget.config);
        setHexDraft(widget.config.color);
    }, [widget.config]);
    const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
    const dirty = JSON.stringify(cfg) !== JSON.stringify(widget.config);

    const save = useAppMutation(saveWidgetConfig, { success: "Widget appearance saved" });
    const verify = useAppMutation(verifyWidgetInstall, { success: (r) => r.message });

    const live = data.status === "live";
    const current = live ? 3 : widget.configSavedAt ? (data.status === "offline" ? 2 : 1) : 0;
    const snippet = `<script src="https://cdn.yoursmmagent.com/widget.js"
  data-tenant="${widget.tenantId}"
  data-color="${cfg.color}"
  data-position="${cfg.position}"
  data-lang="${cfg.language}"
  async></script>`;

    const onLogo = (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (!file.type.startsWith("image/")) return toast.error("Please choose an image file.");
        if (file.size > 300_000) return toast.error("Logo must be smaller than 300 KB.");
        const reader = new FileReader();
        reader.onload = () => set("logo", reader.result);
        reader.readAsDataURL(file);
    };

    return (
        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            <div className="min-w-0 space-y-6">
                <section className="app-card" data-testid="widget-flow">
                    <ChannelHeader channel="widget" data={data} description="A chat bubble on your panel website, answered by your AI agent." />
                    <div className="space-y-6 p-5 sm:p-6">
                        <StepperFlow steps={["Customize", "Install", "Verify"]} current={current} testId="widget-stepper" />
                        <form
                            noValidate
                            onSubmit={(e) => {
                                e.preventDefault();
                                save.mutate(cfg);
                            }}
                            className="grid gap-5 sm:grid-cols-2"
                            data-testid="widget-customizer"
                        >
                            <Field label="Brand colour" htmlFor="widget-color-hex">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={cfg.color}
                                        onChange={(e) => {
                                            set("color", e.target.value.toUpperCase());
                                            setHexDraft(e.target.value.toUpperCase());
                                        }}
                                        aria-label="Pick brand colour"
                                        className="h-11 w-12 shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-950"
                                        data-testid="widget-color-picker"
                                    />
                                    <input
                                        id="widget-color-hex"
                                        value={hexDraft}
                                        onChange={(e) => {
                                            setHexDraft(e.target.value);
                                            if (/^#[0-9a-f]{6}$/i.test(e.target.value)) set("color", e.target.value.toUpperCase());
                                        }}
                                        className="app-input font-mono uppercase"
                                        maxLength={7}
                                        data-testid="widget-color-input"
                                    />
                                </div>
                            </Field>
                            <Field label="Logo" htmlFor="widget-logo" hint="PNG or SVG, up to 300 KB">
                                <div className="flex items-center gap-2">
                                    <label className="btn btn-secondary cursor-pointer" data-testid="widget-logo-upload">
                                        <ImagePlus className="h-4 w-4" /> {cfg.logo ? "Replace" : "Upload"}
                                        <input id="widget-logo" type="file" accept="image/*" onChange={onLogo} className="sr-only" />
                                    </label>
                                    {cfg.logo && (
                                        <>
                                            <img src={cfg.logo} alt="Widget logo" className="h-10 w-10 rounded-lg border border-slate-200 object-cover dark:border-slate-700" />
                                            <Button variant="ghost" size="icon" aria-label="Remove logo" onClick={() => set("logo", null)} data-testid="widget-logo-remove">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </Field>
                            <Field label="Chat title" htmlFor="widget-title" className="sm:col-span-2">
                                <input id="widget-title" value={cfg.title} maxLength={40} onChange={(e) => set("title", e.target.value)} className="app-input" data-testid="widget-title-input" />
                            </Field>
                            <Field label="Welcome message" htmlFor="widget-welcome" className="sm:col-span-2" hint={`${cfg.welcome.length}/200`}>
                                <textarea
                                    id="widget-welcome"
                                    value={cfg.welcome}
                                    maxLength={200}
                                    rows={3}
                                    onChange={(e) => set("welcome", e.target.value)}
                                    className="app-input h-auto py-2.5"
                                    data-testid="widget-welcome-input"
                                />
                            </Field>
                            <Field label="Position">
                                <Segmented value={cfg.position} onChange={(v) => set("position", v)} testId="widget-position" options={[{ value: "left", label: "Bottom left" }, { value: "right", label: "Bottom right" }]} />
                            </Field>
                            <Field label="Language" htmlFor="widget-language">
                                <Select id="widget-language" value={cfg.language} onChange={(e) => set("language", e.target.value)} options={LANGUAGES} data-testid="widget-language-select" />
                            </Field>
                            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                                <Button type="submit" loading={save.isPending} disabled={!dirty && Boolean(widget.configSavedAt)} data-testid="widget-save-button">
                                    {widget.configSavedAt ? "Save changes" : "Save appearance"}
                                </Button>
                                {dirty && <span className="text-xs font-medium text-amber-700 dark:text-amber-300" data-testid="widget-unsaved">Unsaved changes</span>}
                            </div>
                        </form>
                    </div>
                </section>

                <section className="app-card p-5 sm:p-6" data-testid="widget-install-card">
                    <h3 className="text-base font-semibold app-heading">Install on your website</h3>
                    <p className="mt-1 text-sm app-muted">
                        Paste this just before <code className="rounded bg-slate-100 px-1 font-mono text-xs dark:bg-slate-800">&lt;/body&gt;</code> on every page of your panel.
                    </p>
                    <div className="relative mt-4 rounded-xl border border-slate-200 bg-slate-950 p-4 dark:border-slate-700">
                        <pre className="overflow-x-auto whitespace-pre-wrap break-all pr-20 font-mono text-xs leading-relaxed text-indigo-100" data-testid="widget-embed-snippet">
                            {snippet}
                        </pre>
                        <div className="absolute right-3 top-3">
                            <CopyButton text={snippet} testId="widget-embed-copy" />
                        </div>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                        <Button icon={ShieldCheck} loading={verify.isPending} onClick={() => verify.mutate()} data-testid="widget-verify-button">
                            Verify installation
                        </Button>
                        <span className="text-sm app-muted">
                            {widget.panelUrl ? `We'll check ${new URL(widget.panelUrl).hostname}` : "Connect your SMM panel first so we know where to look."}
                        </span>
                    </div>
                </section>
            </div>

            <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
                <WidgetPreview cfg={cfg} />
                <LiveStatusCard channel="widget" data={data} />
            </div>
        </div>
    );
}

function WidgetPreview({ cfg }) {
    const [open, setOpen] = useState(true);
    const side = cfg.position === "left" ? "left-4 items-start" : "right-4 items-end";
    return (
        <section className="app-card overflow-hidden" data-testid="widget-preview">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                <h3 className="text-sm font-semibold app-heading">Live preview</h3>
                <span className="text-xs app-muted">Updates as you type</span>
            </div>
            <div className="relative h-[460px] bg-slate-100 dark:bg-slate-950">
                <div className="flex items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                    <span className="ml-2 flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        <Globe className="h-3 w-3" /> yourpanel.com
                    </span>
                </div>
                <div className="space-y-3 p-5" aria-hidden="true">
                    <div className="h-4 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-3 w-2/3 rounded bg-slate-200/80 dark:bg-slate-800/80" />
                    <div className="h-3 w-1/2 rounded bg-slate-200/80 dark:bg-slate-800/80" />
                    <div className="grid grid-cols-3 gap-2 pt-2">
                        {[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-lg bg-slate-200/70 dark:bg-slate-800/70" />)}
                    </div>
                </div>
                <div className={`absolute bottom-4 flex flex-col gap-3 ${side}`} dir={cfg.language === "ar" ? "rtl" : "ltr"}>
                    {open && (
                        <div className="widget-pop w-[250px] overflow-hidden rounded-2xl bg-white shadow-[0_20px_50px_-15px_rgba(15,23,42,0.4)] dark:bg-slate-900" data-testid="widget-preview-window">
                            <div className="flex items-center gap-2.5 px-3.5 py-3 text-white" style={{ backgroundColor: cfg.color }}>
                                {cfg.logo ? (
                                    <img src={cfg.logo} alt="" className="h-7 w-7 rounded-full bg-white object-cover" />
                                ) : (
                                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
                                        <MessageCircle className="h-4 w-4" />
                                    </span>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="break-words text-sm font-semibold" data-testid="widget-preview-title">{cfg.title || "Support"}</p>
                                    <p className="text-[11px] opacity-80">Typically replies instantly</p>
                                </div>
                                <button type="button" onClick={() => setOpen(false)} aria-label="Close preview chat" className="rounded-md p-1 hover:bg-white/15">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="space-y-2 p-3 text-[13px]">
                                <p className="max-w-[85%] break-words rounded-2xl rounded-tl-md bg-slate-100 px-3 py-2 text-slate-800 dark:bg-slate-800 dark:text-slate-100" data-testid="widget-preview-welcome">
                                    {cfg.welcome || "…"}
                                </p>
                                <p className="ml-auto max-w-[80%] rounded-2xl rounded-tr-md px-3 py-2 text-white" style={{ backgroundColor: cfg.color }}>
                                    Order #48213 status?
                                </p>
                            </div>
                            <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2.5 dark:border-slate-800">
                                <span className="flex-1 text-[12px] text-slate-400">{PLACEHOLDER[cfg.language]}</span>
                                <Send className="h-4 w-4" style={{ color: cfg.color }} />
                            </div>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => setOpen((o) => !o)}
                        aria-label={open ? "Hide chat" : "Show chat"}
                        className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_12px_30px_-8px_rgba(15,23,42,0.45)] transition-transform duration-200 hover:scale-105"
                        style={{ backgroundColor: cfg.color }}
                        data-testid="widget-preview-bubble"
                    >
                        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
                    </button>
                </div>
            </div>
        </section>
    );
}
