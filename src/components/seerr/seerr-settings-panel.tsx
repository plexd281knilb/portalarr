"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
    getSeerrSettingsAction, 
    updateSeerrSettingsAction, 
    getArrAppProfilesAndFoldersAction,
    testSeerrDiscordWebhookAction
} from "@/app/seerr-actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
    Compass, 
    Save, 
    CheckCircle2, 
    AlertCircle, 
    Film, 
    Tv, 
    Sparkles, 
    Sliders, 
    Layers, 
    Bell,
    UserCheck,
    Clock,
    Smile,
    ShieldCheck,
    ShieldAlert,
    CopyCheck,
    FolderTree,
    HardDrive,
    RotateCw,
    MessageSquare,
    Send,
    Mail,
    Check,
    Loader2,
    ExternalLink,
    Link
} from "lucide-react";

interface ArrAppProfile {
    id: number;
    name: string;
}

interface ArrAppFolder {
    id: number;
    path: string;
    freeSpace?: number;
    freeSpaceFormatted?: string;
}

interface ArrAppData {
    profiles: ArrAppProfile[];
    folders: ArrAppFolder[];
}

interface SeerrSettingsPanelProps {
    onNavigateTab?: (tab: string) => void;
}

export function SeerrSettingsPanel({ onNavigateTab }: SeerrSettingsPanelProps = {}) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [refreshingAppId, setRefreshingAppId] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Full Accounts Settings
    const [fullAutoApprove, setFullAutoApprove] = useState(true);
    const [fullUnlimited, setFullUnlimited] = useState(true);
    const [fullQuotaMovies, setFullQuotaMovies] = useState(0);
    const [fullQuotaTv, setFullQuotaTv] = useState(0);
    const [fullQuotaDays, setFullQuotaDays] = useState(7);

    // Trial Accounts Settings
    const [trialAutoApprove, setTrialAutoApprove] = useState(false);
    const [trialQuotaMovies, setTrialQuotaMovies] = useState(3);
    const [trialQuotaTv, setTrialQuotaTv] = useState(3);

    // Dual 4K + 1080p Ingestion
    const [autoDual1080pFor4k, setAutoDual1080pFor4k] = useState(true);

    // Notifications (Discord & Email)
    const [notificationOnAvailable, setNotificationOnAvailable] = useState(true);
    const [discordWebhookUrl, setDiscordWebhookUrl] = useState<string>("");
    const [discordBotUsername, setDiscordBotUsername] = useState<string>("Portalarr");
    const [discordBotAvatarUrl, setDiscordBotAvatarUrl] = useState<string>("");
    const [discordNotifyPending, setDiscordNotifyPending] = useState(true);
    const [discordNotifyAutoApproved, setDiscordNotifyAutoApproved] = useState(true);
    const [discordNotifyApproved, setDiscordNotifyApproved] = useState(true);
    const [discordNotifyDeclined, setDiscordNotifyDeclined] = useState(true);
    const [discordNotifyAvailable, setDiscordNotifyAvailable] = useState(true);
    const [discordNotifyFailed, setDiscordNotifyFailed] = useState(true);

    const [emailNotifyAdminNewRequest, setEmailNotifyAdminNewRequest] = useState(true);
    const [emailNotifyUserAutoApproved, setEmailNotifyUserAutoApproved] = useState(true);
    const [emailNotifyUserApproved, setEmailNotifyUserApproved] = useState(true);
    const [emailNotifyUserDeclined, setEmailNotifyUserDeclined] = useState(true);
    const [emailNotifyUserAvailable, setEmailNotifyUserAvailable] = useState(true);
    const [emailNotifyUserFailed, setEmailNotifyUserFailed] = useState(true);

    const [testingDiscord, setTestingDiscord] = useState(false);
    const [testDiscordResult, setTestDiscordResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);

    // Main Movies (1080p & 4K)
    const [defaultMovieAppId, setDefaultMovieAppId] = useState<string>("");
    const [defaultMovieProfileId, setDefaultMovieProfileId] = useState<number | null>(null);
    const [defaultMovieRootFolder, setDefaultMovieRootFolder] = useState<string>("");

    const [defaultMovie4kAppId, setDefaultMovie4kAppId] = useState<string>("");
    const [defaultMovie4kProfileId, setDefaultMovie4kProfileId] = useState<number | null>(null);
    const [defaultMovie4kRootFolder, setDefaultMovie4kRootFolder] = useState<string>("");

    // Main TV (1080p & 4K)
    const [defaultTvAppId, setDefaultTvAppId] = useState<string>("");
    const [defaultTvProfileId, setDefaultTvProfileId] = useState<number | null>(null);
    const [defaultTvRootFolder, setDefaultTvRootFolder] = useState<string>("");

    const [defaultTv4kAppId, setDefaultTv4kAppId] = useState<string>("");
    const [defaultTv4kProfileId, setDefaultTv4kProfileId] = useState<number | null>(null);
    const [defaultTv4kRootFolder, setDefaultTv4kRootFolder] = useState<string>("");

    // Kids Section (1080p & 4K Movies & TV)
    const [kidsAutoApprovePg, setKidsAutoApprovePg] = useState(true);
    const [kidsRequireApprovalPg13, setKidsRequireApprovalPg13] = useState(true);

    const [kidsMovieAppId, setKidsMovieAppId] = useState<string>("");
    const [kidsMovieProfileId, setKidsMovieProfileId] = useState<number | null>(null);
    const [kidsMovieRootFolder, setKidsMovieRootFolder] = useState<string>("");

    const [kidsMovie4kAppId, setKidsMovie4kAppId] = useState<string>("");
    const [kidsMovie4kProfileId, setKidsMovie4kProfileId] = useState<number | null>(null);
    const [kidsMovie4kRootFolder, setKidsMovie4kRootFolder] = useState<string>("");

    const [kidsTvAppId, setKidsTvAppId] = useState<string>("");
    const [kidsTvProfileId, setKidsTvProfileId] = useState<number | null>(null);
    const [kidsTvRootFolder, setKidsTvRootFolder] = useState<string>("");

    const [kidsTv4kAppId, setKidsTv4kAppId] = useState<string>("");
    const [kidsTv4kProfileId, setKidsTv4kProfileId] = useState<number | null>(null);
    const [kidsTv4kRootFolder, setKidsTv4kRootFolder] = useState<string>("");

    // Apps & Cached Profiles/Folders Map
    const [radarrApps, setRadarrApps] = useState<any[]>([]);
    const [sonarrApps, setSonarrApps] = useState<any[]>([]);
    const [appDataMap, setAppDataMap] = useState<Record<string, ArrAppData>>({});

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
        try {
            const res = await getSeerrSettingsAction();
            if (res.success && res.data) {
                const d = res.data;
                // Full Accounts
                setFullAutoApprove(d.seerrFullAutoApprove ?? true);
                setFullUnlimited(d.seerrFullUnlimited ?? true);
                setFullQuotaMovies(d.seerrFullQuotaMovies ?? 0);
                setFullQuotaTv(d.seerrFullQuotaTv ?? 0);
                setFullQuotaDays(d.seerrFullQuotaDays ?? 7);

                // Trial Accounts
                setTrialAutoApprove(d.seerrTrialAutoApprove ?? false);
                setTrialQuotaMovies(d.seerrTrialQuotaMovies ?? 3);
                setTrialQuotaTv(d.seerrTrialQuotaTv ?? 3);

                // Dual 1080p Companion
                setAutoDual1080pFor4k(d.seerrAutoDual1080pFor4k ?? true);

                // Notifications (Discord & Email)
                setNotificationOnAvailable(d.seerrNotificationOnAvailable ?? true);
                setDiscordWebhookUrl(d.seerrDiscordWebhookUrl || "");
                setDiscordBotUsername(d.seerrDiscordBotUsername || "Portalarr");
                setDiscordBotAvatarUrl(d.seerrDiscordBotAvatarUrl || "");
                setDiscordNotifyPending(d.seerrDiscordNotifyPending ?? true);
                setDiscordNotifyAutoApproved(d.seerrDiscordNotifyAutoApproved ?? true);
                setDiscordNotifyApproved(d.seerrDiscordNotifyApproved ?? true);
                setDiscordNotifyDeclined(d.seerrDiscordNotifyDeclined ?? true);
                setDiscordNotifyAvailable(d.seerrDiscordNotifyAvailable ?? true);
                setDiscordNotifyFailed(d.seerrDiscordNotifyFailed ?? true);

                setEmailNotifyAdminNewRequest(d.seerrEmailNotifyAdminNewRequest ?? true);
                setEmailNotifyUserAutoApproved(d.seerrEmailNotifyUserAutoApproved ?? true);
                setEmailNotifyUserApproved(d.seerrEmailNotifyUserApproved ?? true);
                setEmailNotifyUserDeclined(d.seerrEmailNotifyUserDeclined ?? true);
                setEmailNotifyUserAvailable(d.seerrEmailNotifyUserAvailable ?? true);
                setEmailNotifyUserFailed(d.seerrEmailNotifyUserFailed ?? true);

                // Main Movies
                setDefaultMovieAppId(d.seerrDefaultMovieAppId || "");
                setDefaultMovieProfileId(d.seerrDefaultMovieProfileId ?? null);
                setDefaultMovieRootFolder(d.seerrDefaultMovieRootFolder || "");

                setDefaultMovie4kAppId(d.seerrDefaultMovie4kAppId || "");
                setDefaultMovie4kProfileId(d.seerrDefaultMovie4kProfileId ?? null);
                setDefaultMovie4kRootFolder(d.seerrDefaultMovie4kRootFolder || "");

                // Main TV
                setDefaultTvAppId(d.seerrDefaultTvAppId || "");
                setDefaultTvProfileId(d.seerrDefaultTvProfileId ?? null);
                setDefaultTvRootFolder(d.seerrDefaultTvRootFolder || "");

                setDefaultTv4kAppId(d.seerrDefaultTv4kAppId || "");
                setDefaultTv4kProfileId(d.seerrDefaultTv4kProfileId ?? null);
                setDefaultTv4kRootFolder(d.seerrDefaultTv4kRootFolder || "");

                // Kids Section
                setKidsAutoApprovePg(d.seerrKidsAutoApprovePg ?? true);
                setKidsRequireApprovalPg13(d.seerrKidsRequireApprovalPg13 ?? true);

                setKidsMovieAppId(d.seerrKidsMovieAppId || "");
                setKidsMovieProfileId(d.seerrKidsMovieProfileId ?? null);
                setKidsMovieRootFolder(d.seerrKidsMovieRootFolder || "");

                setKidsMovie4kAppId(d.seerrKidsMovie4kAppId || "");
                setKidsMovie4kProfileId(d.seerrKidsMovie4kProfileId ?? null);
                setKidsMovie4kRootFolder(d.seerrKidsMovie4kRootFolder || "");

                setKidsTvAppId(d.seerrKidsTvAppId || "");
                setKidsTvProfileId(d.seerrKidsTvProfileId ?? null);
                setKidsTvRootFolder(d.seerrKidsTvRootFolder || "");

                setKidsTv4kAppId(d.seerrKidsTv4kAppId || "");
                setKidsTv4kProfileId(d.seerrKidsTv4kProfileId ?? null);
                setKidsTv4kRootFolder(d.seerrKidsTv4kRootFolder || "");

                setRadarrApps(d.radarrApps || []);
                setSonarrApps(d.sonarrApps || []);
                setAppDataMap(d.appDataMap || {});
            }
        } catch (e) {} finally {
            setLoading(false);
        }
    };

    const fetchAppProfilesAndFolders = async (appId: string, force = false) => {
        if (!appId || appId === "none") return;
        if (!force && appDataMap[appId]?.profiles?.length > 0) return;

        setRefreshingAppId(appId);
        try {
            const res = await getArrAppProfilesAndFoldersAction(appId);
            if (res.success) {
                setAppDataMap(prev => ({
                    ...prev,
                    [appId]: {
                        profiles: res.profiles,
                        folders: res.folders
                    }
                }));
            }
        } catch (e) {} finally {
            setRefreshingAppId(null);
        }
    };

    const handleTestDiscordWebhook = async () => {
        if (!discordWebhookUrl || !discordWebhookUrl.trim()) {
            setTestDiscordResult({ success: false, error: "Please enter a Discord Webhook URL first." });
            return;
        }
        setTestingDiscord(true);
        setTestDiscordResult(null);
        try {
            const res = await testSeerrDiscordWebhookAction(
                discordWebhookUrl.trim(),
                discordBotUsername.trim(),
                discordBotAvatarUrl.trim()
            );
            setTestDiscordResult(res);
            setTimeout(() => setTestDiscordResult(null), 6000);
        } catch (e: any) {
            setTestDiscordResult({ success: false, error: e.message || "Failed to send test webhook" });
        } finally {
            setTestingDiscord(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setSuccessMsg(null);
        setErrorMsg(null);
        try {
            const res = await updateSeerrSettingsAction({
                // Full Accounts
                seerrFullAutoApprove: fullAutoApprove,
                seerrFullUnlimited: fullUnlimited,
                seerrFullQuotaMovies: Number(fullQuotaMovies),
                seerrFullQuotaTv: Number(fullQuotaTv),
                seerrFullQuotaDays: Number(fullQuotaDays),

                // Trial Accounts
                seerrTrialAutoApprove: trialAutoApprove,
                seerrTrialQuotaMovies: Number(trialQuotaMovies),
                seerrTrialQuotaTv: Number(trialQuotaTv),

                // Kids Section
                seerrKidsAutoApprovePg: kidsAutoApprovePg,
                seerrKidsRequireApprovalPg13: kidsRequireApprovalPg13,
                seerrKidsMovieAppId: kidsMovieAppId || null,
                seerrKidsMovieProfileId: kidsMovieProfileId,
                seerrKidsMovieRootFolder: kidsMovieRootFolder || null,
                seerrKidsMovie4kAppId: kidsMovie4kAppId || null,
                seerrKidsMovie4kProfileId: kidsMovie4kProfileId,
                seerrKidsMovie4kRootFolder: kidsMovie4kRootFolder || null,
                seerrKidsTvAppId: kidsTvAppId || null,
                seerrKidsTvProfileId: kidsTvProfileId,
                seerrKidsTvRootFolder: kidsTvRootFolder || null,
                seerrKidsTv4kAppId: kidsTv4kAppId || null,
                seerrKidsTv4kProfileId: kidsTv4kProfileId,
                seerrKidsTv4kRootFolder: kidsTv4kRootFolder || null,

                // Dual 1080p Companion
                seerrAutoDual1080pFor4k: autoDual1080pFor4k,

                // Discord Webhook Notification Settings
                seerrDiscordWebhookUrl: discordWebhookUrl ? discordWebhookUrl.trim() : null,
                seerrDiscordBotUsername: discordBotUsername ? discordBotUsername.trim() : "Portalarr",
                seerrDiscordBotAvatarUrl: discordBotAvatarUrl ? discordBotAvatarUrl.trim() : null,
                seerrDiscordNotifyPending: discordNotifyPending,
                seerrDiscordNotifyAutoApproved: discordNotifyAutoApproved,
                seerrDiscordNotifyApproved: discordNotifyApproved,
                seerrDiscordNotifyDeclined: discordNotifyDeclined,
                seerrDiscordNotifyAvailable: discordNotifyAvailable,
                seerrDiscordNotifyFailed: discordNotifyFailed,

                // Email Notification Settings
                seerrEmailNotifyAdminNewRequest: emailNotifyAdminNewRequest,
                seerrEmailNotifyUserAutoApproved: emailNotifyUserAutoApproved,
                seerrEmailNotifyUserApproved: emailNotifyUserApproved,
                seerrEmailNotifyUserDeclined: emailNotifyUserDeclined,
                seerrEmailNotifyUserAvailable: emailNotifyUserAvailable,
                seerrEmailNotifyUserFailed: emailNotifyUserFailed,

                // Notifications & Main
                seerrNotificationOnAvailable: notificationOnAvailable,
                seerrDefaultMovieAppId: defaultMovieAppId || null,
                seerrDefaultMovieProfileId: defaultMovieProfileId,
                seerrDefaultMovieRootFolder: defaultMovieRootFolder || null,
                seerrDefaultMovie4kAppId: defaultMovie4kAppId || null,
                seerrDefaultMovie4kProfileId: defaultMovie4kProfileId,
                seerrDefaultMovie4kRootFolder: defaultMovie4kRootFolder || null,
                seerrDefaultTvAppId: defaultTvAppId || null,
                seerrDefaultTvProfileId: defaultTvProfileId,
                seerrDefaultTvRootFolder: defaultTvRootFolder || null,
                seerrDefaultTv4kAppId: defaultTv4kAppId || null,
                seerrDefaultTv4kProfileId: defaultTv4kProfileId,
                seerrDefaultTv4kRootFolder: defaultTv4kRootFolder || null
            });

            if (res.success) {
                setSuccessMsg(res.message || "Request settings saved successfully!");
            } else {
                setErrorMsg(res.error || "Failed to save settings.");
            }
        } catch (e: any) {
            setErrorMsg(e.message || "An unexpected error occurred.");
        } finally {
            setSaving(false);
        }
    };

    /**
     * Reusable Arr slot selector card with live Quality Profile and Root Folder dropdowns
     */
    const renderArrSlotConfig = (options: {
        title: string;
        badgeText: string;
        badgeVariant?: "blue" | "purple" | "cyan" | "orange";
        icon: React.ReactNode;
        appsList: any[];
        selectedAppId: string;
        onAppChange: (val: string) => void;
        selectedProfileId: number | null;
        onProfileChange: (val: number | null) => void;
        selectedRootFolder: string;
        onRootFolderChange: (val: string) => void;
        appPlaceholder?: string;
        allowDisabled?: boolean;
    }) => {
        const {
            title,
            badgeText,
            badgeVariant = "blue",
            icon,
            appsList,
            selectedAppId,
            onAppChange,
            selectedProfileId,
            onProfileChange,
            selectedRootFolder,
            onRootFolderChange,
            appPlaceholder = "Auto-select first server",
            allowDisabled = false
        } = options;

        const isExplicitlyDisabled = selectedAppId === "none" || (allowDisabled && (!selectedAppId || selectedAppId === ""));
        const currentApp = isExplicitlyDisabled ? null : (appsList.find(a => a.id === selectedAppId) || (!allowDisabled && selectedAppId === "" ? appsList[0] : null));
        const currentAppData = currentApp ? appDataMap[currentApp.id] : undefined;
        const profiles = currentAppData?.profiles || [];
        const folders = currentAppData?.folders || [];
        const isRefreshing = currentApp ? refreshingAppId === currentApp.id : false;

        const badgeStyles = {
            blue: "bg-blue-500/15 text-blue-400 border-blue-500/30",
            purple: "bg-purple-500/15 text-purple-300 border-purple-500/30",
            cyan: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
            orange: "bg-orange-500/15 text-orange-300 border-orange-500/30"
        }[badgeVariant];

        return (
            <div className={`p-4 rounded-xl transition-all space-y-3.5 ${isExplicitlyDisabled ? 'bg-background/20 border border-border/30 opacity-75' : 'bg-background/40 border border-border/40 hover:border-border/70'}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {icon}
                        <span className="text-xs font-bold text-foreground">{title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] font-bold px-2 py-0.5 ${badgeStyles}`}>
                            {badgeText}
                        </Badge>
                        {currentApp && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => fetchAppProfilesAndFolders(currentApp.id, true)}
                                disabled={isRefreshing}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                title="Re-sync profiles and root folders from this Arr server"
                            >
                                <RotateCw className={`h-3 w-3 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
                            </Button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* 1. Server Instance Selection */}
                    <div className="space-y-1">
                        <Label className="text-[11px] font-semibold text-muted-foreground">Target Server Instance</Label>
                        <Select 
                            value={selectedAppId || "none"} 
                            onValueChange={(v) => {
                                const newId = v === "none" ? "" : v;
                                onAppChange(newId);
                                if (newId && newId !== "none") {
                                    fetchAppProfilesAndFolders(newId);
                                } else {
                                    onProfileChange(null);
                                    onRootFolderChange("");
                                }
                            }}
                        >
                            <SelectTrigger className="h-8 text-xs bg-background/60 border-border/50">
                                <SelectValue placeholder={appPlaceholder} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">
                                    {allowDisabled ? (appPlaceholder.startsWith("Disabled") ? appPlaceholder : `Disabled (${appPlaceholder})`) : appPlaceholder}
                                </SelectItem>
                                {appsList.map(app => (
                                    <SelectItem key={app.id} value={app.id}>
                                        {app.name} ({app.url})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* 2. Quality Profile Dropdown (Populated directly from Arr API) */}
                    <div className="space-y-1">
                        <Label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                            <Sliders className="h-3 w-3 text-primary/70" />
                            Default Quality Profile
                        </Label>
                        {isExplicitlyDisabled ? (
                            <div className="h-8 px-3 py-1.5 rounded-md bg-muted/20 border border-border/40 text-muted-foreground text-xs flex items-center">
                                Disabled / Don't Use
                            </div>
                        ) : (
                            <Select 
                                value={selectedProfileId ? String(selectedProfileId) : "none"} 
                                onValueChange={(v) => onProfileChange(v === "none" ? null : Number(v))}
                                disabled={!currentApp || profiles.length === 0}
                            >
                                <SelectTrigger className="h-8 text-xs bg-background/60 border-border/50">
                                    <SelectValue placeholder={profiles.length > 0 ? "Select Quality Profile" : (isRefreshing ? "Fetching profiles..." : "No profiles found / Select server")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Auto-select server default</SelectItem>
                                    {profiles.map(p => (
                                        <SelectItem key={p.id} value={String(p.id)}>
                                            {p.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    {/* 3. Root Folder Dropdown (Populated directly from Arr API) */}
                    <div className="space-y-1">
                        <Label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                            <FolderTree className="h-3 w-3 text-emerald-400/70" />
                            Default Root Folder
                        </Label>
                        {isExplicitlyDisabled ? (
                            <div className="h-8 px-3 py-1.5 rounded-md bg-muted/20 border border-border/40 text-muted-foreground text-xs flex items-center">
                                Disabled / Don't Use
                            </div>
                        ) : folders.length > 0 ? (
                            <Select 
                                value={selectedRootFolder || "none"} 
                                onValueChange={(v) => onRootFolderChange(v === "none" ? "" : v)}
                                disabled={!currentApp}
                            >
                                <SelectTrigger className="h-8 text-xs bg-background/60 border-border/50">
                                    <SelectValue placeholder="Select Root Folder" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Auto-select first folder</SelectItem>
                                    {folders.map(f => (
                                        <SelectItem key={f.id} value={f.path}>
                                            <span className="font-mono">{f.path}</span>
                                            {f.freeSpaceFormatted && (
                                                <span className="ml-1.5 text-[10px] text-emerald-400/90 font-sans">
                                                    ({f.freeSpaceFormatted})
                                                </span>
                                            )}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <Input
                                placeholder="/movies or /tv"
                                value={selectedRootFolder}
                                onChange={(e) => onRootFolderChange(e.target.value)}
                                disabled={!currentApp}
                                className="h-8 text-xs bg-background/60 border-border/50 font-mono"
                            />
                        )}
                    </div>
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="p-16 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                <p className="text-xs text-muted-foreground animate-pulse">Loading Seerr & Request settings...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="text-lg font-bold flex items-center gap-2">
                                <Compass className="h-5 w-5 text-primary" />
                                Native Media Requests & Seerr Engine
                            </CardTitle>
                            <CardDescription>
                                Configure instance routing, quality profiles, root paths, Full vs Trial accounts, and Dual 4K+1080p ingestion rules.
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-bold px-2.5 py-1">
                            Seerr Engine v3.6
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-8">
                    {/* 1. MAIN MOVIES & TV SHOWS ARRS (1080p & 4K) */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                            <Layers className="h-5 w-5 text-blue-400" />
                            <div>
                                <h3 className="text-sm font-bold text-foreground">Main Arrs Dispatch Defaults (1080p & 4K UHD)</h3>
                                <p className="text-xs text-muted-foreground">
                                    Quality profiles and root folders are automatically retrieved from each selected Radarr and Sonarr server.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {/* Standard Movies (1080p) */}
                            {renderArrSlotConfig({
                                title: "Standard Movies (1080p)",
                                badgeText: "1080p",
                                badgeVariant: "blue",
                                icon: <Film className="h-4 w-4 text-blue-400" />,
                                appsList: radarrApps,
                                selectedAppId: defaultMovieAppId,
                                onAppChange: setDefaultMovieAppId,
                                selectedProfileId: defaultMovieProfileId,
                                onProfileChange: setDefaultMovieProfileId,
                                selectedRootFolder: defaultMovieRootFolder,
                                onRootFolderChange: setDefaultMovieRootFolder,
                                appPlaceholder: "Auto-select first Radarr server"
                            })}

                            {/* 4K UHD Movies */}
                            {renderArrSlotConfig({
                                title: "4K UHD Movies",
                                badgeText: "4K UHD",
                                badgeVariant: "purple",
                                icon: <Film className="h-4 w-4 text-purple-400" />,
                                appsList: radarrApps,
                                selectedAppId: defaultMovie4kAppId,
                                onAppChange: setDefaultMovie4kAppId,
                                selectedProfileId: defaultMovie4kProfileId,
                                onProfileChange: setDefaultMovie4kProfileId,
                                selectedRootFolder: defaultMovie4kRootFolder,
                                onRootFolderChange: setDefaultMovie4kRootFolder,
                                appPlaceholder: "Disabled / Don't Use",
                                allowDisabled: true
                            })}

                            {/* Standard TV Shows (1080p) */}
                            {renderArrSlotConfig({
                                title: "Standard TV Shows (1080p)",
                                badgeText: "1080p",
                                badgeVariant: "cyan",
                                icon: <Tv className="h-4 w-4 text-cyan-400" />,
                                appsList: sonarrApps,
                                selectedAppId: defaultTvAppId,
                                onAppChange: setDefaultTvAppId,
                                selectedProfileId: defaultTvProfileId,
                                onProfileChange: setDefaultTvProfileId,
                                selectedRootFolder: defaultTvRootFolder,
                                onRootFolderChange: setDefaultTvRootFolder,
                                appPlaceholder: "Auto-select first Sonarr server"
                            })}

                            {/* 4K UHD TV Shows */}
                            {renderArrSlotConfig({
                                title: "4K UHD TV Shows",
                                badgeText: "4K UHD",
                                badgeVariant: "purple",
                                icon: <Tv className="h-4 w-4 text-purple-400" />,
                                appsList: sonarrApps,
                                selectedAppId: defaultTv4kAppId,
                                onAppChange: setDefaultTv4kAppId,
                                selectedProfileId: defaultTv4kProfileId,
                                onProfileChange: setDefaultTv4kProfileId,
                                selectedRootFolder: defaultTv4kRootFolder,
                                onRootFolderChange: setDefaultTv4kRootFolder,
                                appPlaceholder: "Disabled / Don't Use",
                                allowDisabled: true
                            })}
                        </div>
                    </div>

                    {/* 2. KIDS SECTION & DEDICATED KIDS ARRS */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                            <Smile className="h-5 w-5 text-orange-400" />
                            <div>
                                <h3 className="text-sm font-bold text-foreground">Kids Section & Dedicated Kids Arrs</h3>
                                <p className="text-xs text-muted-foreground">Content ratings filtering and dedicated 1080p & 4K Kids Radarr/Sonarr destinations.</p>
                            </div>
                        </div>

                        {/* Rating Approval Toggles */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3.5 rounded-xl bg-background/50 border border-border/40">
                                <div className="space-y-0.5 max-w-xl">
                                    <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                                        Auto-Approve PG & Below Ratings
                                    </Label>
                                    <p className="text-[11px] text-muted-foreground">
                                        Automatically approve and dispatch titles rated G, PG, TV-Y, TV-Y7, TV-G, and TV-PG in the Kids section.
                                    </p>
                                </div>
                                <Switch
                                    checked={kidsAutoApprovePg}
                                    onCheckedChange={setKidsAutoApprovePg}
                                />
                            </div>

                            <div className="flex items-center justify-between p-3.5 rounded-xl bg-background/50 border border-border/40">
                                <div className="space-y-0.5 max-w-xl">
                                    <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                        <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                                        Require Admin Approval for PG-13 & Unrated
                                    </Label>
                                    <p className="text-[11px] text-muted-foreground">
                                        Hold PG-13, Unrated, and NR requests submitted in the Kids section for administrator review.
                                    </p>
                                </div>
                                <Switch
                                    checked={kidsRequireApprovalPg13}
                                    onCheckedChange={setKidsRequireApprovalPg13}
                                />
                            </div>

                            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                                <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
                                <span><strong>Mature Content Filter:</strong> R, NC-17, TV-MA, and TV-14 content is automatically excluded from Kids discovery and search.</span>
                            </div>
                        </div>

                        {/* Dedicated Kids Slots */}
                        <div className="space-y-3 pt-2">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Dedicated Kids Instances & Paths (Optional)
                            </h4>

                            {/* Kids Standard Movies */}
                            {renderArrSlotConfig({
                                title: "Kids Movies (1080p)",
                                badgeText: "Kids 1080p",
                                badgeVariant: "orange",
                                icon: <Film className="h-4 w-4 text-orange-400" />,
                                appsList: radarrApps,
                                selectedAppId: kidsMovieAppId,
                                onAppChange: setKidsMovieAppId,
                                selectedProfileId: kidsMovieProfileId,
                                onProfileChange: setKidsMovieProfileId,
                                selectedRootFolder: kidsMovieRootFolder,
                                onRootFolderChange: setKidsMovieRootFolder,
                                appPlaceholder: "Use standard 1080p movie server",
                                allowDisabled: true
                            })}

                            {/* Kids 4K Movies */}
                            {renderArrSlotConfig({
                                title: "Kids 4K UHD Movies",
                                badgeText: "Kids 4K",
                                badgeVariant: "purple",
                                icon: <Film className="h-4 w-4 text-purple-400" />,
                                appsList: radarrApps,
                                selectedAppId: kidsMovie4kAppId,
                                onAppChange: setKidsMovie4kAppId,
                                selectedProfileId: kidsMovie4kProfileId,
                                onProfileChange: setKidsMovie4kProfileId,
                                selectedRootFolder: kidsMovie4kRootFolder,
                                onRootFolderChange: setKidsMovie4kRootFolder,
                                appPlaceholder: "Disabled / Don't Use",
                                allowDisabled: true
                            })}

                            {/* Kids Standard TV */}
                            {renderArrSlotConfig({
                                title: "Kids TV Shows (1080p)",
                                badgeText: "Kids 1080p",
                                badgeVariant: "orange",
                                icon: <Tv className="h-4 w-4 text-orange-400" />,
                                appsList: sonarrApps,
                                selectedAppId: kidsTvAppId,
                                onAppChange: setKidsTvAppId,
                                selectedProfileId: kidsTvProfileId,
                                onProfileChange: setKidsTvProfileId,
                                selectedRootFolder: kidsTvRootFolder,
                                onRootFolderChange: setKidsTvRootFolder,
                                appPlaceholder: "Use standard 1080p TV server",
                                allowDisabled: true
                            })}

                            {/* Kids 4K TV */}
                            {renderArrSlotConfig({
                                title: "Kids 4K UHD TV Shows",
                                badgeText: "Kids 4K",
                                badgeVariant: "purple",
                                icon: <Tv className="h-4 w-4 text-purple-400" />,
                                appsList: sonarrApps,
                                selectedAppId: kidsTv4kAppId,
                                onAppChange: setKidsTv4kAppId,
                                selectedProfileId: kidsTv4kProfileId,
                                onProfileChange: setKidsTv4kProfileId,
                                selectedRootFolder: kidsTv4kRootFolder,
                                onRootFolderChange: setKidsTv4kRootFolder,
                                appPlaceholder: "Disabled / Don't Use",
                                allowDisabled: true
                            })}
                        </div>
                    </div>

                    {/* 3. DUAL 4K + 1080P INGESTION RULE */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                            <CopyCheck className="h-5 w-5 text-purple-400" />
                            <div>
                                <h3 className="text-sm font-bold text-foreground">Dual 4K + 1080p Ingestion Rule</h3>
                                <p className="text-xs text-muted-foreground">Ensure backward compatibility for non-4K streaming devices and remote transcoding.</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30">
                            <div className="space-y-0.5 max-w-xl">
                                <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                    Auto-Add 1080p Companion on 4K Request
                                </Label>
                                <p className="text-[11px] text-muted-foreground">
                                    When media is requested or added to a 4K Radarr/Sonarr instance, automatically create and dispatch a companion 1080p request using the configured 1080p Arr server and profile.
                                </p>
                            </div>
                            <Switch
                                checked={autoDual1080pFor4k}
                                onCheckedChange={setAutoDual1080pFor4k}
                            />
                        </div>
                    </div>

                    {/* 4. FULL ACCOUNTS CONFIGURATION */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                            <UserCheck className="h-5 w-5 text-emerald-400" />
                            <div>
                                <h3 className="text-sm font-bold text-foreground">Full Accounts (Approved / Paying Users)</h3>
                                <p className="text-xs text-muted-foreground">Rules applied to approved regular members and active subscribers.</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3.5 rounded-xl bg-background/50 border border-border/40">
                                <div className="space-y-0.5 max-w-xl">
                                    <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                        <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                                        Auto-Approve Full Account Requests
                                    </Label>
                                    <p className="text-[11px] text-muted-foreground">
                                        Immediately dispatch media requests from full accounts to Radarr and Sonarr without requiring admin approval.
                                    </p>
                                </div>
                                <Switch
                                    checked={fullAutoApprove}
                                    onCheckedChange={setFullAutoApprove}
                                />
                            </div>

                            <div className="flex items-center justify-between p-3.5 rounded-xl bg-background/50 border border-border/40">
                                <div className="space-y-0.5 max-w-xl">
                                    <Label className="text-xs font-bold text-foreground">
                                        Unlimited Requests (No Quotas)
                                    </Label>
                                    <p className="text-[11px] text-muted-foreground">
                                        Full accounts have no limits on movies or TV show requests.
                                    </p>
                                </div>
                                <Switch
                                    checked={fullUnlimited}
                                    onCheckedChange={setFullUnlimited}
                                />
                            </div>

                            {!fullUnlimited && (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-background/30 border border-border/40">
                                    <div className="space-y-1">
                                        <Label className="text-[11px] font-semibold text-foreground">Movie Quota Limit</Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={fullQuotaMovies}
                                            onChange={(e) => setFullQuotaMovies(parseInt(e.target.value, 10) || 0)}
                                            className="h-8 text-xs bg-background/60"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[11px] font-semibold text-foreground">TV Show Quota Limit</Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={fullQuotaTv}
                                            onChange={(e) => setFullQuotaTv(parseInt(e.target.value, 10) || 0)}
                                            className="h-8 text-xs bg-background/60"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[11px] font-semibold text-foreground">Quota Window (Days)</Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={fullQuotaDays}
                                            onChange={(e) => setFullQuotaDays(parseInt(e.target.value, 10) || 7)}
                                            className="h-8 text-xs bg-background/60"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 5. TRIAL ACCOUNTS CONFIGURATION */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                            <Clock className="h-5 w-5 text-amber-400" />
                            <div>
                                <h3 className="text-sm font-bold text-foreground">Trial Accounts (Guest / Limited Users)</h3>
                                <p className="text-xs text-muted-foreground">Strict request limits with mandatory administrator approval.</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3.5 rounded-xl bg-background/50 border border-border/40">
                                <div className="space-y-0.5 max-w-xl">
                                    <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                        Auto-Approve Trial Requests (Not Recommended)
                                    </Label>
                                    <p className="text-[11px] text-muted-foreground">
                                        When disabled (default), trial user requests are held in Pending state for administrator approval.
                                    </p>
                                </div>
                                <Switch
                                    checked={trialAutoApprove}
                                    onCheckedChange={setTrialAutoApprove}
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-background/30 border border-border/40">
                                <div className="space-y-1">
                                    <Label className="text-[11px] font-semibold text-foreground">Trial Movie Limit</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={trialQuotaMovies}
                                        onChange={(e) => setTrialQuotaMovies(parseInt(e.target.value, 10) || 1)}
                                        className="h-8 text-xs bg-background/60"
                                    />
                                    <span className="text-[10px] text-muted-foreground">Default: 3 movies during trial period</span>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[11px] font-semibold text-foreground">Trial TV Show Limit</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={trialQuotaTv}
                                        onChange={(e) => setTrialQuotaTv(parseInt(e.target.value, 10) || 1)}
                                        className="h-8 text-xs bg-background/60"
                                    />
                                    <span className="text-[10px] text-muted-foreground">Default: 3 TV shows during trial period</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 6. DISCORD WEBHOOK NOTIFICATIONS */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between pb-2 border-b border-border/40">
                            <div className="flex items-center gap-2">
                                <MessageSquare className="h-5 w-5 text-[#5865F2]" />
                                <div>
                                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                                        Discord Webhook Notifications
                                        <Badge variant="outline" className="text-[10px] border-[#5865F2]/40 text-[#5865F2] bg-[#5865F2]/10 font-mono">
                                            Overseerr Style
                                        </Badge>
                                    </h3>
                                    <p className="text-xs text-muted-foreground">Broadcast rich request cards, status updates, and Plex availability alerts directly into your Discord channels.</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3.5">
                            {/* Webhook URL Input */}
                            <div className="space-y-1.5 p-3.5 rounded-xl bg-background/50 border border-border/40">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                        <Link className="h-3.5 w-3.5 text-primary" /> Discord Webhook URL
                                    </Label>
                                    <span className="text-[10px] text-muted-foreground">Server Settings &rarr; Integrations &rarr; Webhooks</span>
                                </div>
                                <Input
                                    type="url"
                                    placeholder="https://discord.com/api/webhooks/..."
                                    value={discordWebhookUrl}
                                    onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                                    className="h-9 text-xs bg-background/70 font-mono"
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    Create a webhook in your Discord server channel and paste the full webhook URL above.
                                </p>
                            </div>

                            {/* Bot Customization & Test Button */}
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3.5 rounded-xl bg-background/30 border border-border/40">
                                <div className="sm:col-span-4 space-y-1">
                                    <Label className="text-[11px] font-semibold text-foreground">Bot Username</Label>
                                    <Input
                                        placeholder="Portalarr"
                                        value={discordBotUsername}
                                        onChange={(e) => setDiscordBotUsername(e.target.value)}
                                        className="h-8 text-xs bg-background/60"
                                    />
                                </div>
                                <div className="sm:col-span-5 space-y-1">
                                    <Label className="text-[11px] font-semibold text-foreground">Bot Avatar URL (Optional)</Label>
                                    <Input
                                        type="url"
                                        placeholder="https://.../avatar.png"
                                        value={discordBotAvatarUrl}
                                        onChange={(e) => setDiscordBotAvatarUrl(e.target.value)}
                                        className="h-8 text-xs bg-background/60"
                                    />
                                </div>
                                <div className="sm:col-span-3 flex items-end">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={testingDiscord || !discordWebhookUrl.trim()}
                                        onClick={handleTestDiscordWebhook}
                                        className="w-full h-8 text-xs font-semibold gap-1.5 border-[#5865F2]/40 text-[#5865F2] hover:bg-[#5865F2]/10"
                                    >
                                        {testingDiscord ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                        Test Webhook
                                    </Button>
                                </div>
                            </div>

                            {/* Test Webhook Status Feedback */}
                            {testDiscordResult && (
                                <div className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                                    testDiscordResult.success 
                                        ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-300" 
                                        : "bg-rose-500/15 border border-rose-500/40 text-rose-300"
                                }`}>
                                    {testDiscordResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                                    <span>{testDiscordResult.message || testDiscordResult.error}</span>
                                </div>
                            )}

                            {/* Discord Event Triggers Grid */}
                            <div className="space-y-2 pt-1">
                                <Label className="text-xs font-bold text-foreground">Discord Notification Event Triggers</Label>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                    {/* 1. Pending Request */}
                                    <div className="flex items-start justify-between p-3 rounded-xl border border-border/40 bg-background/40 hover:bg-background/60 transition-colors">
                                        <div className="space-y-0.5 pr-2">
                                            <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                                <Clock className="h-3.5 w-3.5 text-amber-400" /> New Request (Pending)
                                            </div>
                                            <p className="text-[10px] text-muted-foreground leading-tight">
                                                Alert Discord when a request requiring admin review is submitted.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={discordNotifyPending}
                                            onCheckedChange={setDiscordNotifyPending}
                                            disabled={!discordWebhookUrl.trim()}
                                        />
                                    </div>

                                    {/* 2. Auto-Approved */}
                                    <div className="flex items-start justify-between p-3 rounded-xl border border-border/40 bg-background/40 hover:bg-background/60 transition-colors">
                                        <div className="space-y-0.5 pr-2">
                                            <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                                <Sparkles className="h-3.5 w-3.5 text-blue-400" /> Auto-Approved Request
                                            </div>
                                            <p className="text-[10px] text-muted-foreground leading-tight">
                                                Alert Discord when a request is auto-approved and queued for download.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={discordNotifyAutoApproved}
                                            onCheckedChange={setDiscordNotifyAutoApproved}
                                            disabled={!discordWebhookUrl.trim()}
                                        />
                                    </div>

                                    {/* 3. Admin Approved */}
                                    <div className="flex items-start justify-between p-3 rounded-xl border border-border/40 bg-background/40 hover:bg-background/60 transition-colors">
                                        <div className="space-y-0.5 pr-2">
                                            <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Admin Approved
                                            </div>
                                            <p className="text-[10px] text-muted-foreground leading-tight">
                                                Alert Discord when an administrator manually approves a pending request.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={discordNotifyApproved}
                                            onCheckedChange={setDiscordNotifyApproved}
                                            disabled={!discordWebhookUrl.trim()}
                                        />
                                    </div>

                                    {/* 4. Request Declined */}
                                    <div className="flex items-start justify-between p-3 rounded-xl border border-border/40 bg-background/40 hover:bg-background/60 transition-colors">
                                        <div className="space-y-0.5 pr-2">
                                            <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                                <AlertCircle className="h-3.5 w-3.5 text-rose-400" /> Request Declined
                                            </div>
                                            <p className="text-[10px] text-muted-foreground leading-tight">
                                                Alert Discord when a request is declined with reason.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={discordNotifyDeclined}
                                            onCheckedChange={setDiscordNotifyDeclined}
                                            disabled={!discordWebhookUrl.trim()}
                                        />
                                    </div>

                                    {/* 5. Media Available */}
                                    <div className="flex items-start justify-between p-3 rounded-xl border border-border/40 bg-background/40 hover:bg-background/60 transition-colors">
                                        <div className="space-y-0.5 pr-2">
                                            <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                                <Film className="h-3.5 w-3.5 text-emerald-400" /> Media Available on Plex
                                            </div>
                                            <p className="text-[10px] text-muted-foreground leading-tight">
                                                Broadcast announcement when media is ready to stream.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={discordNotifyAvailable}
                                            onCheckedChange={setDiscordNotifyAvailable}
                                            disabled={!discordWebhookUrl.trim()}
                                        />
                                    </div>

                                    {/* 6. Request Failed */}
                                    <div className="flex items-start justify-between p-3 rounded-xl border border-border/40 bg-background/40 hover:bg-background/60 transition-colors">
                                        <div className="space-y-0.5 pr-2">
                                            <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                                <ShieldAlert className="h-3.5 w-3.5 text-amber-400" /> Request Issue / Failure
                                            </div>
                                            <p className="text-[10px] text-muted-foreground leading-tight">
                                                Notify admins when a request encounters a download or dispatch error.
                                            </p>
                                        </div>
                                        <Switch
                                            checked={discordNotifyFailed}
                                            onCheckedChange={setDiscordNotifyFailed}
                                            disabled={!discordWebhookUrl.trim()}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 7. EMAIL NOTIFICATIONS */}
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border/40">
                            <div className="flex items-center gap-2">
                                <Mail className="h-5 w-5 text-indigo-400" />
                                <div>
                                    <h3 className="text-sm font-bold text-foreground">Email Notifications</h3>
                                    <p className="text-xs text-muted-foreground">Automated transactional emails dispatched via your server SMTP configuration.</p>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    if (onNavigateTab) {
                                        onNavigateTab("emails");
                                    } else {
                                        router.push("/settings?tab=emails");
                                    }
                                }}
                                className="h-7 text-[11px] gap-1.5 border-primary/30 text-primary hover:bg-primary/10 self-start sm:self-auto cursor-pointer"
                            >
                                <Mail className="h-3 w-3" /> Customize Email Templates
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                            {/* 1. Admin Request Alert */}
                            <div className="flex items-start justify-between p-3 rounded-xl border border-border/40 bg-background/40 hover:bg-background/60 transition-colors">
                                <div className="space-y-0.5 pr-2">
                                    <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                        <ShieldCheck className="h-3.5 w-3.5 text-blue-400" /> Admin Request Alerts
                                    </div>
                                    <p className="text-[10px] text-muted-foreground leading-tight">
                                        Email server administrators when a new user request requires manual approval.
                                    </p>
                                </div>
                                <Switch
                                    checked={emailNotifyAdminNewRequest}
                                    onCheckedChange={setEmailNotifyAdminNewRequest}
                                />
                            </div>

                            {/* 2. User Auto-Approved */}
                            <div className="flex items-start justify-between p-3 rounded-xl border border-border/40 bg-background/40 hover:bg-background/60 transition-colors">
                                <div className="space-y-0.5 pr-2">
                                    <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                        <Sparkles className="h-3.5 w-3.5 text-indigo-400" /> User Auto-Approved Notice
                                    </div>
                                    <p className="text-[10px] text-muted-foreground leading-tight">
                                        Email user when their request is automatically approved and queued.
                                    </p>
                                </div>
                                <Switch
                                    checked={emailNotifyUserAutoApproved}
                                    onCheckedChange={setEmailNotifyUserAutoApproved}
                                />
                            </div>

                            {/* 3. User Admin Approved */}
                            <div className="flex items-start justify-between p-3 rounded-xl border border-border/40 bg-background/40 hover:bg-background/60 transition-colors">
                                <div className="space-y-0.5 pr-2">
                                    <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> User Admin-Approved Notice
                                    </div>
                                    <p className="text-[10px] text-muted-foreground leading-tight">
                                        Email user when an admin reviews and approves their pending request.
                                    </p>
                                </div>
                                <Switch
                                    checked={emailNotifyUserApproved}
                                    onCheckedChange={setEmailNotifyUserApproved}
                                />
                            </div>

                            {/* 4. User Request Declined */}
                            <div className="flex items-start justify-between p-3 rounded-xl border border-border/40 bg-background/40 hover:bg-background/60 transition-colors">
                                <div className="space-y-0.5 pr-2">
                                    <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                        <AlertCircle className="h-3.5 w-3.5 text-rose-400" /> User Declined Notice
                                    </div>
                                    <p className="text-[10px] text-muted-foreground leading-tight">
                                        Email user with the administrator decline reason when rejected.
                                    </p>
                                </div>
                                <Switch
                                    checked={emailNotifyUserDeclined}
                                    onCheckedChange={setEmailNotifyUserDeclined}
                                />
                            </div>

                            {/* 5. User Media Available */}
                            <div className="flex items-start justify-between p-3 rounded-xl border border-border/40 bg-background/40 hover:bg-background/60 transition-colors">
                                <div className="space-y-0.5 pr-2">
                                    <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                        <Film className="h-3.5 w-3.5 text-emerald-400" /> Ready to Stream (Plex)
                                    </div>
                                    <p className="text-[10px] text-muted-foreground leading-tight">
                                        Email user with a direct "Watch on Plex" button when media is available.
                                    </p>
                                </div>
                                <Switch
                                    checked={emailNotifyUserAvailable && notificationOnAvailable}
                                    onCheckedChange={(val) => {
                                        setEmailNotifyUserAvailable(val);
                                        setNotificationOnAvailable(val);
                                    }}
                                />
                            </div>

                            {/* 6. User Request Failed */}
                            <div className="flex items-start justify-between p-3 rounded-xl border border-border/40 bg-background/40 hover:bg-background/60 transition-colors">
                                <div className="space-y-0.5 pr-2">
                                    <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                        <ShieldAlert className="h-3.5 w-3.5 text-amber-400" /> Request Failure Alert
                                    </div>
                                    <p className="text-[10px] text-muted-foreground leading-tight">
                                        Email alert if a request encounters a download or dispatch error.
                                    </p>
                                </div>
                                <Switch
                                    checked={emailNotifyUserFailed}
                                    onCheckedChange={setEmailNotifyUserFailed}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Status Feedback Messages */}
                    {successMsg && (
                        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-medium flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>{successMsg}</span>
                        </div>
                    )}
                    {errorMsg && (
                        <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-medium flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    {/* Save Button */}
                    <div className="pt-2 flex justify-end">
                        <Button
                            size="lg"
                            className="h-10 px-6 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all active:scale-95 flex items-center gap-2"
                            disabled={saving}
                            onClick={handleSave}
                        >
                            {saving ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <Save className="h-4 w-4" />
                                    <span>Save Request Settings</span>
                                </>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
