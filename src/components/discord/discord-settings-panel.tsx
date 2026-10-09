"use client";

import { useState, useEffect } from "react";
import {
    getDiscordBotSettingsAction,
    saveDiscordBotSettingsAction,
    testDiscordBotConnectionAction,
    syncDiscordServerAction,
    updateDiscordStatusEmbedAction,
    postDiscordTestMessageAction
} from "@/app/discord-actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
    MessageSquare, Bot, Shield, CheckCircle2, AlertTriangle, 
    RefreshCw, ExternalLink, Key, Eye, EyeOff, Server, 
    Layers, Hash, Sparkles, Send, Bell, Activity, Check, 
    ChevronDown, ChevronUp, Copy, BookOpen, HeartPulse, UserCheck
} from "lucide-react";
import { format } from "date-fns";

export default function DiscordSettingsPanel() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);

    // Form States
    const [botToken, setBotToken] = useState("");
    const [guildId, setGuildId] = useState("");
    const [clientId, setClientId] = useState("");
    const [serverSyncEnabled, setServerSyncEnabled] = useState(true);
    const [statusChannelId, setStatusChannelId] = useState("");
    const [requestsChannelId, setRequestsChannelId] = useState("");
    const [announcementsChannelId, setAnnouncementsChannelId] = useState("");
    const [inviteUrl, setInviteUrl] = useState("");

    // UI Toggles & Telemetry
    const [showToken, setShowToken] = useState(false);
    const [isConfigured, setIsConfigured] = useState(false);
    const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
    const [lastSyncStatus, setLastSyncStatus] = useState<any>(null);
    const [blueprint, setBlueprint] = useState<any[]>([]);
    const [rolesBlueprint, setRolesBlueprint] = useState<any[]>([]);
    const [showSetupGuide, setShowSetupGuide] = useState(false);
    const [copiedInvite, setCopiedInvite] = useState(false);

    // Live Test Connection Result
    const [testResult, setTestResult] = useState<{
        success?: boolean;
        error?: string;
        bot?: any;
        guild?: any;
    } | null>(null);

    // Feedback Toasts / Banners
    const [bannerMsg, setBannerMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const res = await getDiscordBotSettingsAction();
            if (res.success) {
                setBotToken(res.botTokenMasked || "");
                setGuildId(res.guildId || "");
                setClientId(res.clientId || "");
                setServerSyncEnabled(res.serverSyncEnabled);
                setStatusChannelId(res.statusChannelId || "");
                setRequestsChannelId(res.requestsChannelId || "");
                setAnnouncementsChannelId(res.announcementsChannelId || "");
                setInviteUrl(res.inviteUrl || "");
                setIsConfigured(res.isConfigured);
                setLastSyncAt(res.lastSyncAt || null);
                setLastSyncStatus(res.lastSyncStatus || null);
                setBlueprint(res.blueprint || []);
                setRolesBlueprint(res.rolesBlueprint || []);
            }
        } catch (e: any) {
            console.error("Failed to load Discord settings:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setBannerMsg(null);
        try {
            const res = await saveDiscordBotSettingsAction({
                discordBotToken: botToken,
                discordGuildId: guildId,
                discordClientId: clientId,
                discordServerSyncEnabled: serverSyncEnabled,
                discordStatusChannelId: statusChannelId,
                discordRequestsChannelId: requestsChannelId,
                discordAnnouncementsChannelId: announcementsChannelId,
                discordInviteUrl: inviteUrl
            });

            if (res.success) {
                setBannerMsg({ type: "success", text: "Discord bot settings saved successfully!" });
                await loadSettings();
            } else {
                setBannerMsg({ type: "error", text: res.error || "Failed to save Discord settings." });
            }
        } catch (e: any) {
            setBannerMsg({ type: "error", text: e.message || "Network error saving settings." });
        } finally {
            setSaving(false);
        }
    };

    const handleTestConnection = async () => {
        setTesting(true);
        setTestResult(null);
        setBannerMsg(null);
        try {
            const res = await testDiscordBotConnectionAction({
                botToken: botToken.includes("••••") ? undefined : botToken,
                guildId: guildId || undefined
            });
            setTestResult(res);
            if (res.success) {
                setBannerMsg({
                    type: "success",
                    text: `Connected to Discord as "${res.bot?.username}" (${res.guild?.name ? `${res.guild.name} • ${res.guild.memberCount || 0} members` : "No Server ID tested"})`
                });
            } else {
                setBannerMsg({ type: "error", text: res.error || "Failed to connect to Discord." });
            }
        } catch (e: any) {
            setTestResult({ success: false, error: e.message });
            setBannerMsg({ type: "error", text: e.message });
        } finally {
            setTesting(false);
        }
    };

    const handleSyncServer = async () => {
        if (!confirm("This will synchronize your Discord server categories, channels, permissions, and roles to match the Portalarr template. Missing channels will be created. Proceed?")) {
            return;
        }

        setSyncing(true);
        setBannerMsg(null);
        try {
            const res = await syncDiscordServerAction({
                updateTopics: true,
                createRoles: true,
                postPinnedEmbeds: true
            });

            if (res.success) {
                setBannerMsg({
                    type: "success",
                    text: res.summaryText || "Discord server synchronized successfully!"
                });
                await loadSettings();
            } else {
                setBannerMsg({
                    type: "error",
                    text: res.error || "Server sync failed. Check bot administrator permissions."
                });
            }
        } catch (e: any) {
            setBannerMsg({ type: "error", text: e.message || "Failed to run server sync." });
        } finally {
            setSyncing(false);
        }
    };

    const handleUpdateLiveStatus = async () => {
        setUpdatingStatus(true);
        setBannerMsg(null);
        try {
            const res = await updateDiscordStatusEmbedAction();
            if (res.success) {
                setBannerMsg({ type: "success", text: "Live platform status embed in #system-status updated!" });
            } else {
                setBannerMsg({ type: "error", text: res.error || "Failed to update status embed." });
            }
        } catch (e: any) {
            setBannerMsg({ type: "error", text: e.message });
        } finally {
            setUpdatingStatus(false);
        }
    };

    const generatedInvite = clientId.trim() 
        ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId.trim())}&permissions=8&scope=bot%20applications.commands` 
        : "";

    const handleCopyInvite = () => {
        if (!generatedInvite) return;
        navigator.clipboard.writeText(generatedInvite);
        setCopiedInvite(true);
        setTimeout(() => setCopiedInvite(false), 2000);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 space-y-4">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading Discord Bot Engine settings...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* HEADER BANNER */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-blue-500/10 border border-indigo-500/20">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                        <MessageSquare className="h-6 w-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold tracking-tight">Discord Bot & Server Mission Control</h2>
                            {isConfigured ? (
                                <Badge variant="outline" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-xs gap-1 font-semibold">
                                    <CheckCircle2 className="h-3 w-3" /> CONNECTED
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs gap-1 font-semibold">
                                    <AlertTriangle className="h-3 w-3" /> SETUP REQUIRED
                                </Badge>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Automate your Discord community to match Portalarr: categories, channels, pinned device setup guides, and live system status.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1.5 border-border/60 hover:bg-muted/60"
                        onClick={() => setShowSetupGuide(!showSetupGuide)}
                    >
                        <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
                        {showSetupGuide ? "Hide Setup Guide" : "3-Step Setup Guide"}
                        {showSetupGuide ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </Button>
                    <Button
                        size="sm"
                        className="h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-sm"
                        onClick={handleSyncServer}
                        disabled={syncing || !isConfigured}
                    >
                        {syncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {syncing ? "Syncing..." : "Sync Server Now"}
                    </Button>
                </div>
            </div>

            {/* FEEDBACK BANNER */}
            {bannerMsg && (
                <div className={`p-3.5 rounded-lg text-xs font-medium flex items-center justify-between border ${
                    bannerMsg.type === "success" 
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" 
                        : bannerMsg.type === "error"
                        ? "bg-red-500/10 text-red-300 border-red-500/30"
                        : "bg-blue-500/10 text-blue-300 border-blue-500/30"
                }`}>
                    <div className="flex items-center gap-2">
                        {bannerMsg.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                        <span>{bannerMsg.text}</span>
                    </div>
                    <button className="text-muted-foreground hover:text-foreground text-xs ml-2 cursor-pointer" onClick={() => setBannerMsg(null)}>✕</button>
                </div>
            )}

            {/* COLLAPSIBLE 3-STEP SETUP GUIDE */}
            {showSetupGuide && (
                <Card className="border-indigo-500/30 bg-background/60 shadow-md">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-indigo-300">
                            <Bot className="h-4 w-4" /> 3-Step Discord Developer Portal Setup Guide
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Follow these quick steps to create your bot and invite it to your Discord server with 1 click.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs text-muted-foreground">
                        <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 space-y-1.5">
                            <div className="font-semibold text-foreground flex items-center gap-2">
                                <span className="h-5 w-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-[11px] font-bold">1</span>
                                Create Application & Bot
                            </div>
                            <p className="pl-7">
                                Go to the <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="text-indigo-400 underline font-medium hover:text-indigo-300 inline-flex items-center gap-1">Discord Developer Portal <ExternalLink className="h-3 w-3" /></a> $\rightarrow$ Click <strong>New Application</strong> $\rightarrow$ Name it <em>DomsHomeLab</em> or <em>Portalarr</em>.
                            </p>
                        </div>

                        <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 space-y-1.5">
                            <div className="font-semibold text-foreground flex items-center gap-2">
                                <span className="h-5 w-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-[11px] font-bold">2</span>
                                Copy Token & Enable Privileged Intents
                            </div>
                            <p className="pl-7">
                                In the left sidebar, click <strong>Bot</strong> $\rightarrow$ Click <strong>Reset Token</strong> and copy the token. Scroll down to <em>Privileged Gateway Intents</em> and enable <strong>Server Members Intent</strong>.
                            </p>
                        </div>

                        <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 space-y-1.5">
                            <div className="font-semibold text-foreground flex items-center gap-2">
                                <span className="h-5 w-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-[11px] font-bold">3</span>
                                Invite Bot & Copy Server ID
                            </div>
                            <p className="pl-7">
                                In Discord Developer Portal $\rightarrow$ <strong>General Information</strong>, copy the <strong>Application ID</strong> and paste it below to generate your 1-click invite link. In Discord, right-click your server icon $\rightarrow$ click <strong>Copy Server ID</strong> (requires Developer Mode enabled in Discord User Settings).
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* CREDENTIALS & CONNECTION CONFIGURATION */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 shadow-sm border-border/60">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <Key className="h-4 w-4 text-amber-400" /> Bot Credentials & Server Association
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Bot tokens are securely stored using AES-256-GCM encryption in server memory.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-xs">
                        {/* BOT TOKEN */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Discord Bot Token</Label>
                            <div className="relative">
                                <Input
                                    type={showToken ? "text" : "password"}
                                    value={botToken}
                                    onChange={(e) => setBotToken(e.target.value)}
                                    placeholder="Paste Bot Token (e.g. MTIzNDU2...)"
                                    className="font-mono text-xs pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowToken(!showToken)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                                >
                                    {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                            </div>
                        </div>

                        {/* GUILD ID & CLIENT ID */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Discord Server (Guild) ID</Label>
                                <Input
                                    value={guildId}
                                    onChange={(e) => setGuildId(e.target.value)}
                                    placeholder="e.g. 112233445566778899"
                                    className="font-mono text-xs"
                                />
                                <p className="text-[11px] text-muted-foreground">Right-click server in Discord $\rightarrow$ Copy Server ID</p>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-medium">Application (Client) ID <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                                <Input
                                    value={clientId}
                                    onChange={(e) => setClientId(e.target.value)}
                                    placeholder="e.g. 123456789012345678"
                                    className="font-mono text-xs"
                                />
                                <p className="text-[11px] text-muted-foreground">Used to generate 1-click bot invite link</p>
                            </div>
                        </div>

                        {/* 1-CLICK BOT INVITE BANNER */}
                        {clientId && (
                            <div className="flex items-center justify-between p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/25">
                                <div className="flex items-center gap-2">
                                    <Bot className="h-4 w-4 text-indigo-400 shrink-0" />
                                    <span className="text-[11px] font-medium text-indigo-200">
                                        Bot Invite Link Ready with Administrator permissions
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px] border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 gap-1"
                                        onClick={handleCopyInvite}
                                    >
                                        {copiedInvite ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                        {copiedInvite ? "Copied" : "Copy Link"}
                                    </Button>
                                    <a
                                        href={generatedInvite}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 h-7 px-2.5 rounded text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                                    >
                                        Authorize & Add Bot <ExternalLink className="h-3 w-3" />
                                    </a>
                                </div>
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="flex items-center justify-between border-t border-border/40 pt-3">
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs gap-1.5 font-medium border-border/60 hover:bg-muted/60"
                            onClick={handleTestConnection}
                            disabled={testing || (!botToken && !guildId)}
                        >
                            {testing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5 text-blue-400" />}
                            {testing ? "Testing..." : "Test Connection"}
                        </Button>

                        <Button
                            size="sm"
                            className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            {saving ? "Saving..." : "Save Settings"}
                        </Button>
                    </CardFooter>
                </Card>

                {/* BOT & GUILD TELEMETRY CARD */}
                <Card className="shadow-sm border-border/60 flex flex-col justify-between">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <Bot className="h-4 w-4 text-indigo-400" /> Bot Status & Sync Telemetry
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Live connection status and last server sync summary.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs">
                        {testResult?.bot ? (
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50">
                                {testResult.bot.avatarUrl ? (
                                    <img src={testResult.bot.avatarUrl} alt="Bot" className="h-10 w-10 rounded-full border border-indigo-500/40" />
                                ) : (
                                    <div className="h-10 w-10 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                                        🤖
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <div className="font-semibold text-foreground truncate">
                                        {testResult.bot.username}
                                        <span className="text-muted-foreground text-[10px] ml-1 font-mono">#{testResult.bot.discriminator}</span>
                                    </div>
                                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                        <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-300 border-emerald-500/30 px-1 py-0">
                                            ACTIVE BOT
                                        </Badge>
                                        {testResult.guild?.hasAdminPermission && (
                                            <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-300 border-amber-500/30 px-1 py-0">
                                                ADMINISTRATOR
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="p-3 rounded-lg bg-muted/20 border border-border/30 text-center text-muted-foreground">
                                <Bot className="h-8 w-8 mx-auto text-muted-foreground/40 mb-1" />
                                <p className="font-medium text-xs">Bot Not Verified</p>
                                <p className="text-[11px] text-muted-foreground/70 mt-0.5">Click "Test Connection" to fetch live bot telemetry.</p>
                            </div>
                        )}

                        {/* LAST SYNC STATS */}
                        <div className="p-2.5 rounded-lg bg-muted/30 border border-border/30 space-y-1.5">
                            <div className="flex items-center justify-between text-muted-foreground">
                                <span>Last Server Sync:</span>
                                <span className="font-medium text-foreground">
                                    {lastSyncAt ? format(new Date(lastSyncAt), "MMM d, yyyy h:mm a") : "Never Synced"}
                                </span>
                            </div>
                            {lastSyncStatus?.summaryText && (
                                <p className="text-[11px] text-muted-foreground/80 italic border-t border-border/20 pt-1">
                                    {lastSyncStatus.summaryText}
                                </p>
                            )}
                        </div>

                        {/* ACTIONS */}
                        <div className="space-y-1.5 pt-1">
                            <Button
                                size="sm"
                                variant="outline"
                                className="w-full h-8 text-xs gap-1.5 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/15"
                                onClick={handleUpdateLiveStatus}
                                disabled={updatingStatus || !isConfigured}
                            >
                                {updatingStatus ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
                                {updatingStatus ? "Updating..." : "Update Live #system-status Now"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* SERVER ARCHITECTURE & BLUEPRINT OVERVIEW */}
            <Card className="shadow-sm border-border/60">
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                <Layers className="h-4 w-4 text-purple-400" /> Canonical Server Architecture & Channel Blueprint
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Portalarr automatically provisions these categories, channels, permissions, and pinned embeds to ensure consistency.
                            </CardDescription>
                        </div>
                        <Button
                            size="sm"
                            className="h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold self-start sm:self-auto"
                            onClick={handleSyncServer}
                            disabled={syncing || !isConfigured}
                        >
                            {syncing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                            Sync All Channels & Roles
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {blueprint.map((cat, idx) => (
                            <div key={idx} className="p-3 rounded-lg bg-background/50 border border-border/40 space-y-2">
                                <div className="font-semibold text-xs text-foreground flex items-center justify-between border-b border-border/30 pb-1.5">
                                    <span className="truncate">{cat.name}</span>
                                    <Badge variant="outline" className="text-[9px] bg-muted/40 text-muted-foreground border-border/30">
                                        {cat.channels.length} ch
                                    </Badge>
                                </div>
                                <div className="space-y-1.5">
                                    {cat.channels.map((ch: any, chIdx: number) => (
                                        <div key={chIdx} className="flex items-center justify-between text-[11px] p-1 rounded bg-muted/20 border border-border/20">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <Hash className="h-3 w-3 text-muted-foreground shrink-0" />
                                                <span className="font-medium text-foreground truncate">{ch.name}</span>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                {ch.readOnlyForEveryone && (
                                                    <span className="text-[9px] bg-amber-500/10 text-amber-300 border border-amber-500/20 px-1 rounded font-mono" title="Read-only for regular members">
                                                        READ-ONLY
                                                    </span>
                                                )}
                                                {ch.adminOnly && (
                                                    <span className="text-[9px] bg-red-500/10 text-red-300 border border-red-500/20 px-1 rounded font-mono" title="Admin only">
                                                        ADMIN
                                                    </span>
                                                )}
                                                {ch.pinnedEmbedKey && (
                                                    <span className="text-[9px] bg-purple-500/10 text-purple-300 border border-purple-500/20 px-1 rounded font-mono" title="Contains pinned guide embed">
                                                        EMBED
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* ROLES TEMPLATE */}
                    <div className="pt-2 border-t border-border/30">
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                            <Shield className="h-3.5 w-3.5 text-emerald-400" /> Provisioned Server Roles
                        </h4>
                        <div className="flex flex-wrap items-center gap-2">
                            {rolesBlueprint.map((role, idx) => (
                                <Badge
                                    key={idx}
                                    variant="outline"
                                    className="text-xs py-1 px-2.5 font-semibold bg-background/80 border-border/60"
                                    style={{ borderLeftColor: `#${role.color.toString(16).padStart(6, "0")}`, borderLeftWidth: 4 }}
                                >
                                    {role.name}
                                </Badge>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
