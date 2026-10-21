"use client";

import { useState, useEffect } from "react";
import { 
    getUserMediaServersAndLibrariesAction,
    updateUserMediaServersAndLibrariesAction,
    updateUserAccountPreferencesAction,
    UserAvailableServer
} from "@/app/media-server-actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
    Server, Tv, Film, Music, Check, CheckSquare, Square, 
    CheckCircle2, XCircle, Loader2, Shield, FolderCheck, 
    Sparkles, Crown, Zap, BookOpen, Compass, Settings, 
    Sliders, Volume2, Globe, EyeOff, Bell, User, Layers
} from "lucide-react";

interface UserMediaServersManagerProps {
    userRole?: string;
    userStatus?: string;
    membershipTier?: string;
    username?: string;
}

export function UserMediaServersManager({
    userRole = "USER",
    userStatus = "APPROVED",
    membershipTier = "STANDARD",
    username = ""
}: UserMediaServersManagerProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingPrefs, setSavingPrefs] = useState(false);
    const [msg, setMsg] = useState("");
    const [err, setErr] = useState("");
    const [prefsMsg, setPrefsMsg] = useState("");
    const [prefsErr, setPrefsErr] = useState("");

    const [isTrial, setIsTrial] = useState(false);
    const [servers, setServers] = useState<UserAvailableServer[]>([]);
    const [selectedServerKeys, setSelectedServerKeys] = useState<string[]>([]);
    const [selectedMediaLibraryKeys, setSelectedMediaLibraryKeys] = useState<string[]>([]);
    const [jellyfinUsername, setJellyfinUsername] = useState("");
    const [embyUsername, setEmbyUsername] = useState("");

    // Extended Account Preferences State
    const [qualityProfile, setQualityProfile] = useState("direct_play");
    const [audioLanguage, setAudioLanguage] = useState("en");
    const [subtitleLanguage, setSubtitleLanguage] = useState("en");
    const [autoSubtitles, setAutoSubtitles] = useState("foreign");
    const [transcodeAlertsEnabled, setTranscodeAlertsEnabled] = useState(true);
    const [hideFromLeaderboards, setHideFromLeaderboards] = useState(false);
    const [weeklyDigestEnabled, setWeeklyDigestEnabled] = useState(true);
    const [autoSyncWatchlist, setAutoSyncWatchlist] = useState(true);

    const [isDirty, setIsDirty] = useState(false);
    const [isPrefsDirty, setIsPrefsDirty] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await getUserMediaServersAndLibrariesAction();
            if (res.success) {
                setIsTrial(res.isTrial);
                setServers(res.servers);
                setSelectedServerKeys(res.selectedServerKeys);
                setSelectedMediaLibraryKeys(res.selectedMediaLibraryKeys);
                setJellyfinUsername(res.jellyfinUsername || username);
                setEmbyUsername(res.embyUsername || username);

                // Populate account preferences
                if (res.accountPreferences) {
                    const p = res.accountPreferences;
                    if (p.qualityProfile) setQualityProfile(p.qualityProfile);
                    if (p.audioLanguage) setAudioLanguage(p.audioLanguage);
                    if (p.subtitleLanguage) setSubtitleLanguage(p.subtitleLanguage);
                    if (p.autoSubtitles) setAutoSubtitles(p.autoSubtitles);
                    if (p.transcodeAlertsEnabled !== undefined) setTranscodeAlertsEnabled(p.transcodeAlertsEnabled);
                    if (p.hideFromLeaderboards !== undefined) setHideFromLeaderboards(p.hideFromLeaderboards);
                    if (p.weeklyDigestEnabled !== undefined) setWeeklyDigestEnabled(p.weeklyDigestEnabled);
                    if (p.autoSyncWatchlist !== undefined) setAutoSyncWatchlist(p.autoSyncWatchlist);
                }
            } else {
                setErr(res.error || "Failed to load media servers");
            }
        } catch (e: any) {
            setErr(e.message || "Failed to load media servers");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleToggleServer = (serverKey: string) => {
        setIsDirty(true);
        setSelectedServerKeys(prev => 
            prev.includes(serverKey) ? prev.filter(k => k !== serverKey) : [...prev, serverKey]
        );
    };

    const handleToggleLibrary = (libKey: string) => {
        setIsDirty(true);
        setSelectedMediaLibraryKeys(prev => 
            prev.includes(libKey) ? prev.filter(k => k !== libKey) : [...prev, libKey]
        );
    };

    const handleSelectAllServerLibs = (server: UserAvailableServer) => {
        setIsDirty(true);
        const serverLibKeys = server.allowedLibraries.map(l => l.libraryKey);
        setSelectedMediaLibraryKeys(prev => Array.from(new Set([...prev, ...serverLibKeys])));
    };

    const handleDeselectAllServerLibs = (server: UserAvailableServer) => {
        setIsDirty(true);
        const serverLibKeys = new Set(server.allowedLibraries.map(l => l.libraryKey));
        setSelectedMediaLibraryKeys(prev => prev.filter(k => !serverLibKeys.has(k)));
    };

    const handleSaveServers = async () => {
        setSaving(true);
        setMsg("");
        setErr("");
        try {
            const res = await updateUserMediaServersAndLibrariesAction({
                selectedServerKeys,
                selectedMediaLibraryKeys,
                jellyfinUsername,
                embyUsername
            });
            if (res.success) {
                setMsg(res.message || "Your media server preferences have been saved!");
                setIsDirty(false);
                setTimeout(() => setMsg(""), 5000);
            } else {
                setErr(res.error || "Failed to save preferences");
            }
        } catch (e: any) {
            setErr(e.message || "Failed to save preferences");
        } finally {
            setSaving(false);
        }
    };

    const handleSavePrefs = async () => {
        setSavingPrefs(true);
        setPrefsMsg("");
        setPrefsErr("");
        try {
            const res = await updateUserAccountPreferencesAction({
                qualityProfile,
                audioLanguage,
                subtitleLanguage,
                autoSubtitles,
                transcodeAlertsEnabled,
                hideFromLeaderboards,
                weeklyDigestEnabled,
                autoSyncWatchlist
            });
            if (res.success) {
                setPrefsMsg("Your streaming and playback preferences have been saved!");
                setIsPrefsDirty(false);
                setTimeout(() => setPrefsMsg(""), 5000);
            } else {
                setPrefsErr(res.error || "Failed to update preferences");
            }
        } catch (e: any) {
            setPrefsErr(e.message || "Failed to update preferences");
        } finally {
            setSavingPrefs(false);
        }
    };

    const isAdmin = userRole === "ADMIN";
    const isSuperUser = userRole === "SUPER_USER";
    const isTrialUser = isTrial || userStatus === "TRIAL" || membershipTier === "TRIAL";

    return (
        <div className="space-y-6">
            {/* ========================================================================= */}
            {/* 1. ROLE & CAPABILITIES OVERVIEW BANNER */}
            {/* ========================================================================= */}
            <Card className="border-border/60 bg-gradient-to-r from-purple-950/20 via-[#121218]/90 to-blue-950/20 shadow-md relative overflow-hidden">
                <div className="absolute top-0 right-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-base sm:text-lg font-bold text-foreground">
                                    Account Tier &amp; Capabilities
                                </span>
                                {isTrialUser ? (
                                    <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-xs font-bold">
                                        Trial Account
                                    </Badge>
                                ) : isSuperUser ? (
                                    <Badge variant="outline" className="bg-cyan-500/15 text-cyan-300 border-cyan-500/30 text-xs font-bold">
                                        Super User
                                    </Badge>
                                ) : isAdmin ? (
                                    <Badge variant="outline" className="bg-purple-500/15 text-purple-300 border-purple-500/30 text-xs font-bold">
                                        Administrator
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-xs font-bold">
                                        Full Member
                                    </Badge>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {isTrialUser 
                                    ? "You are currently enjoying a 14-day evaluation pass with curated streaming and request access."
                                    : "Full Member account with unthrottled streaming across Plex, Jellyfin, and Emby, book libraries, and self-service controls."}
                            </p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-1 pb-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-border/40 text-center space-y-1">
                            <Tv className="h-4 w-4 mx-auto text-primary" />
                            <span className="text-[11px] font-bold block text-foreground truncate">Direct Play</span>
                            <span className="text-[10px] text-emerald-400 block font-mono">Active</span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-border/40 text-center space-y-1">
                            <Compass className="h-4 w-4 mx-auto text-rose-400" />
                            <span className="text-[11px] font-bold block text-foreground truncate">Media Requests</span>
                            <span className="text-[10px] text-emerald-400 block font-mono">
                                {isTrialUser ? "3 / Week" : "Uncapped"}
                            </span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-border/40 text-center space-y-1">
                            <BookOpen className="h-4 w-4 mx-auto text-emerald-400" />
                            <span className="text-[11px] font-bold block text-foreground truncate">Book Library</span>
                            <span className={`text-[10px] block font-mono ${isTrialUser ? "text-amber-400" : "text-emerald-400"}`}>
                                {isTrialUser ? "Full Members" : "Unlocked"}
                            </span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-border/40 text-center space-y-1">
                            <Zap className="h-4 w-4 mx-auto text-purple-400" />
                            <span className="text-[11px] font-bold block text-foreground truncate">AI Assistant</span>
                            <span className="text-[10px] text-emerald-400 block font-mono">24/7 Active</span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-border/40 text-center space-y-1">
                            <Server className="h-4 w-4 mx-auto text-cyan-400" />
                            <span className="text-[11px] font-bold block text-foreground truncate">Multi-Server</span>
                            <span className="text-[10px] text-emerald-400 block font-mono">Self-Select</span>
                        </div>

                        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-border/40 text-center space-y-1">
                            <Crown className="h-4 w-4 mx-auto text-amber-400" />
                            <span className="text-[11px] font-bold block text-foreground truncate">Sub-Accounts</span>
                            <span className={`text-[10px] block font-mono ${isTrialUser ? "text-amber-400" : "text-emerald-400"}`}>
                                {isTrialUser ? "Full Members" : "Included"}
                            </span>
                        </div>
                    </div>

                    {isTrialUser && (
                        <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row items-center justify-between gap-2.5">
                            <div className="flex items-center gap-2 text-xs text-amber-300">
                                <Sparkles className="h-4 w-4 shrink-0 text-amber-400" />
                                <span>
                                    Ready to unlock unlimited requests, 4K HDR streams, audiobooks, and household sub-accounts?
                                </span>
                            </div>
                            <Button size="sm" asChild className="h-8 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shrink-0">
                                <a href="#billing">Upgrade Account</a>
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ========================================================================= */}
            {/* 2. MULTI-PLATFORM MEDIA SERVERS & LIBRARIES COMMAND CENTER */}
            {/* ========================================================================= */}
            <Card id="media-servers" className={`transition-all duration-300 bg-[#121218]/90 backdrop-blur-md relative overflow-hidden scroll-mt-6 ${isDirty ? "border-2 border-amber-500/70 shadow-[0_0_20px_rgba(245,158,11,0.2)]" : "border-cyan-500/30 shadow-sm"}`}>
                <div className="absolute top-0 right-0 w-72 h-72 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
                <CardHeader className="pb-3 border-b border-border/30">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                                <Server className="h-5 w-5 text-cyan-400" />
                                <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                                    My Media Servers &amp; Libraries (Plex • Jellyfin • Emby)
                                </CardTitle>
                                {isDirty && (
                                    <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30 font-bold ml-1 animate-pulse">
                                        ● Unsaved Changes
                                    </Badge>
                                )}
                            </div>
                            <CardDescription className="text-xs">
                                Choose which media servers and libraries appear in your player apps. Showing only servers and libraries permitted by your Administrator.
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-cyan-500/15 text-cyan-300 border-cyan-500/30 text-xs w-fit">
                            {selectedServerKeys.length} Servers • {selectedMediaLibraryKeys.length} Libraries Selected
                        </Badge>
                    </div>
                </CardHeader>

                <CardContent className="pt-4 space-y-5">
                    {msg && (
                        <div className="p-3 text-xs bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 rounded-lg flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                            <span>{msg}</span>
                        </div>
                    )}
                    {err && (
                        <div className="p-3 text-xs bg-red-950/40 border border-red-500/40 text-red-300 rounded-lg flex items-center gap-2">
                            <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                            <span>{err}</span>
                        </div>
                    )}

                    {loading ? (
                        <div className="p-8 text-center space-y-2">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                            <p className="text-xs text-muted-foreground">Loading permitted media servers...</p>
                        </div>
                    ) : servers.length === 0 ? (
                        <div className="p-6 text-center text-xs text-muted-foreground bg-white/[0.01] border border-border/40 rounded-xl">
                            No media servers are currently permitted for your account. Please contact your server administrator.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {servers.map(server => {
                                const isPlex = server.serverType === "PLEX";
                                const isJellyfin = server.serverType === "JELLYFIN";
                                const isEmby = server.serverType === "EMBY";
                                const isServerActive = selectedServerKeys.includes(server.serverKey) || selectedServerKeys.includes(server.serverId);
                                const allowedLibs = server.allowedLibraries;

                                const badgeColor = isPlex 
                                    ? "bg-amber-500/15 text-amber-300 border-amber-500/40" 
                                    : isJellyfin 
                                    ? "bg-purple-500/15 text-purple-300 border-purple-500/40" 
                                    : "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";

                                return (
                                    <div 
                                        key={server.serverKey}
                                        className={`rounded-xl border transition-all overflow-hidden ${
                                            isServerActive 
                                                ? "bg-white/[0.02] border-border/60" 
                                                : "bg-background/40 border-border/30 opacity-70"
                                        }`}
                                    >
                                        {/* Server Header Bar */}
                                        <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/30 bg-white/[0.01]">
                                            <div className="flex items-center gap-3">
                                                <div className={`h-9 w-9 rounded-xl flex items-center justify-center border shrink-0 ${
                                                    isPlex ? "bg-amber-500/10 border-amber-500/30 text-amber-400" :
                                                    isJellyfin ? "bg-purple-500/10 border-purple-500/30 text-purple-400" :
                                                    "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                                }`}>
                                                    <Server className="h-4.5 w-4.5" />
                                                </div>
                                                <div className="space-y-0.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-sm text-foreground">{server.serverName}</span>
                                                        <Badge variant="outline" className={`text-[10px] font-bold ${badgeColor}`}>
                                                            {server.serverType}
                                                        </Badge>
                                                        <span className="text-[11px] text-muted-foreground">
                                                            ({allowedLibs.length} allowed)
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {isPlex 
                                                            ? "Synced with your Plex username/email." 
                                                            : `Connect your ${server.serverType} player app using your server credentials.`}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 self-end sm:self-auto">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-semibold text-muted-foreground">
                                                        {isServerActive ? "Enabled" : "Disabled"}
                                                    </span>
                                                    <Switch
                                                        checked={isServerActive}
                                                        onCheckedChange={() => handleToggleServer(server.serverKey)}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Server Body (Username & Libraries) */}
                                        {isServerActive && (
                                            <div className="p-3.5 space-y-3.5">
                                                {/* Remote Username Binding for Jellyfin/Emby */}
                                                {!isPlex && (
                                                    <div className="p-2.5 rounded-lg bg-white/[0.02] border border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                                        <div className="space-y-0.5">
                                                            <Label className="text-xs font-semibold text-foreground">
                                                                {server.serverType} Username
                                                            </Label>
                                                            <p className="text-[11px] text-muted-foreground">
                                                                Used to automatically provision your user policy on this server.
                                                            </p>
                                                        </div>
                                                        <Input
                                                            value={isJellyfin ? jellyfinUsername : embyUsername}
                                                            onChange={e => {
                                                                setIsDirty(true);
                                                                if (isJellyfin) setJellyfinUsername(e.target.value);
                                                                else setEmbyUsername(e.target.value);
                                                            }}
                                                            placeholder={username || "Enter username"}
                                                            className="h-8 text-xs max-w-xs font-mono"
                                                        />
                                                    </div>
                                                )}

                                                {/* Library Grid */}
                                                <div className="space-y-2">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <span className="text-xs text-muted-foreground">
                                                            Select libraries to display in your player:
                                                        </span>
                                                        <div className="flex items-center gap-1.5">
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleSelectAllServerLibs(server)}
                                                                className="h-6 px-2 text-[10px] text-cyan-300 hover:text-cyan-200"
                                                            >
                                                                <CheckSquare className="h-2.5 w-2.5 mr-1" /> Select All Allowed
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleDeselectAllServerLibs(server)}
                                                                className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                                                            >
                                                                <Square className="h-2.5 w-2.5 mr-1" /> Deselect All
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                                        {allowedLibs.map(lib => {
                                                            const isLibSelected = selectedMediaLibraryKeys.includes(lib.libraryKey) || selectedMediaLibraryKeys.includes(lib.id);
                                                            return (
                                                                <button
                                                                    key={lib.libraryKey}
                                                                    type="button"
                                                                    onClick={() => handleToggleLibrary(lib.libraryKey)}
                                                                    className={`p-2.5 rounded-lg border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
                                                                        isLibSelected
                                                                            ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-200 shadow-xs"
                                                                            : "bg-background/50 border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        {lib.type.includes("movie") ? (
                                                                            <Film className={`h-3.5 w-3.5 shrink-0 ${isLibSelected ? "text-cyan-400" : "text-muted-foreground"}`} />
                                                                        ) : lib.type.includes("show") || lib.type.includes("tv") ? (
                                                                            <Tv className={`h-3.5 w-3.5 shrink-0 ${isLibSelected ? "text-purple-400" : "text-muted-foreground"}`} />
                                                                        ) : lib.type.includes("music") ? (
                                                                            <Music className={`h-3.5 w-3.5 shrink-0 ${isLibSelected ? "text-emerald-400" : "text-muted-foreground"}`} />
                                                                        ) : (
                                                                            <FolderCheck className={`h-3.5 w-3.5 shrink-0 ${isLibSelected ? "text-amber-400" : "text-muted-foreground"}`} />
                                                                        )}
                                                                        <span className="text-xs font-semibold truncate">{lib.title}</span>
                                                                    </div>
                                                                    <div className={`h-4 w-4 rounded shrink-0 flex items-center justify-center border transition-all ${
                                                                        isLibSelected ? "bg-cyan-500 border-cyan-400 text-slate-950" : "border-muted-foreground/40 bg-transparent"
                                                                    }`}>
                                                                        {isLibSelected && <Check className="h-3 w-3 stroke-[3]" />}
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>

                <CardFooter className="pt-3 pb-4 px-4 bg-white/[0.01] border-t border-border/30 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <p className="text-[11px] text-muted-foreground italic">
                        💡 Changes synchronize directly to your Plex shares and Jellyfin/Emby user policies.
                    </p>
                    <Button
                        type="button"
                        onClick={handleSaveServers}
                        disabled={saving}
                        className="w-full sm:w-auto font-bold text-xs h-9 bg-cyan-600 hover:bg-cyan-500 text-white gap-2 transition-all hover:ring-2 hover:ring-cyan-400/40 active:scale-95 cursor-pointer shadow-sm"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        <span>Save Media Server Preferences</span>
                    </Button>
                </CardFooter>
            </Card>

            {/* ========================================================================= */}
            {/* 3. STREAMING, PLAYBACK & ACCOUNT PREFERENCES (FULL MEMBERS) */}
            {/* ========================================================================= */}
            {!isTrialUser && (
                <Card id="playback-preferences" className={`transition-all duration-300 bg-[#121218]/90 backdrop-blur-md relative overflow-hidden scroll-mt-6 ${isPrefsDirty ? "border-2 border-amber-500/70 shadow-[0_0_20px_rgba(245,158,11,0.2)]" : "border-border/50 shadow-sm"}`}>
                    <CardHeader className="pb-3 border-b border-border/30">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                    <Sliders className="h-5 w-5 text-purple-400" />
                                    <CardTitle className="text-base sm:text-lg font-bold text-foreground">
                                        Streaming, Playback &amp; Account Preferences
                                    </CardTitle>
                                    {isPrefsDirty && (
                                        <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30 font-bold ml-1 animate-pulse">
                                            ● Unsaved Changes
                                        </Badge>
                                    )}
                                </div>
                                <CardDescription className="text-xs">
                                    Tailor your default playback resolution, preferred audio/subtitle languages, and privacy options.
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="pt-4 space-y-4">
                        {prefsMsg && (
                            <div className="p-3 text-xs bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 rounded-lg flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                                <span>{prefsMsg}</span>
                            </div>
                        )}
                        {prefsErr && (
                            <div className="p-3 text-xs bg-red-950/40 border border-red-500/40 text-red-300 rounded-lg flex items-center gap-2">
                                <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                                <span>{prefsErr}</span>
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Default Quality Profile</Label>
                                <Select value={qualityProfile} onValueChange={v => { setQualityProfile(v); setIsPrefsDirty(true); }}>
                                    <SelectTrigger className="h-9 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="direct_play">Original 4K HDR (Direct Play)</SelectItem>
                                        <SelectItem value="1080p_high">1080p High (20 Mbps)</SelectItem>
                                        <SelectItem value="1080p_balanced">1080p Balanced (10 Mbps)</SelectItem>
                                        <SelectItem value="720p_saver">720p Data Saver (4 Mbps)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Preferred Audio Track</Label>
                                <Select value={audioLanguage} onValueChange={v => { setAudioLanguage(v); setIsPrefsDirty(true); }}>
                                    <SelectTrigger className="h-9 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="en">English (Default)</SelectItem>
                                        <SelectItem value="es">Spanish</SelectItem>
                                        <SelectItem value="fr">French</SelectItem>
                                        <SelectItem value="ja">Japanese (Anime)</SelectItem>
                                        <SelectItem value="de">German</SelectItem>
                                        <SelectItem value="original">Original Audio Track</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Preferred Subtitle Language</Label>
                                <Select value={subtitleLanguage} onValueChange={v => { setSubtitleLanguage(v); setIsPrefsDirty(true); }}>
                                    <SelectTrigger className="h-9 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="en">English</SelectItem>
                                        <SelectItem value="es">Spanish</SelectItem>
                                        <SelectItem value="fr">French</SelectItem>
                                        <SelectItem value="ja">Japanese</SelectItem>
                                        <SelectItem value="off">None / Disabled</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Auto-Subtitle Mode</Label>
                                <Select value={autoSubtitles} onValueChange={v => { setAutoSubtitles(v); setIsPrefsDirty(true); }}>
                                    <SelectTrigger className="h-9 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="foreign">Foreign Audio Only</SelectItem>
                                        <SelectItem value="always">Always Display Subtitles</SelectItem>
                                        <SelectItem value="off">Manual Only (Off)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Privacy & Automation Switches */}
                        <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border/30">
                            <div className="p-3 rounded-xl bg-white/[0.02] border border-border/40 flex items-center justify-between gap-3">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-semibold text-foreground">
                                        Transcode Doctor Alert Banner
                                    </Label>
                                    <p className="text-[11px] text-muted-foreground">
                                        Proactively show 30-second fix guides when playback is capped.
                                    </p>
                                </div>
                                <Switch
                                    checked={transcodeAlertsEnabled}
                                    onCheckedChange={v => { setTranscodeAlertsEnabled(v); setIsPrefsDirty(true); }}
                                />
                            </div>

                            <div className="p-3 rounded-xl bg-white/[0.02] border border-border/40 flex items-center justify-between gap-3">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-semibold text-foreground">
                                        Watch History Leaderboard Privacy
                                    </Label>
                                    <p className="text-[11px] text-muted-foreground">
                                        Hide your username from public community streaming leaderboards.
                                    </p>
                                </div>
                                <Switch
                                    checked={hideFromLeaderboards}
                                    onCheckedChange={v => { setHideFromLeaderboards(v); setIsPrefsDirty(true); }}
                                />
                            </div>

                            <div className="p-3 rounded-xl bg-white/[0.02] border border-border/40 flex items-center justify-between gap-3">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-semibold text-foreground">
                                        Plex Watchlist Auto-Sync
                                    </Label>
                                    <p className="text-[11px] text-muted-foreground">
                                        Automatically submit requests when you add movies to your Plex Watchlist.
                                    </p>
                                </div>
                                <Switch
                                    checked={autoSyncWatchlist}
                                    onCheckedChange={v => { setAutoSyncWatchlist(v); setIsPrefsDirty(true); }}
                                />
                            </div>

                            <div className="p-3 rounded-xl bg-white/[0.02] border border-border/40 flex items-center justify-between gap-3">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-semibold text-foreground">
                                        Weekly Newly Added Digest
                                    </Label>
                                    <p className="text-[11px] text-muted-foreground">
                                        Receive a weekly summary email of new releases added to your libraries.
                                    </p>
                                </div>
                                <Switch
                                    checked={weeklyDigestEnabled}
                                    onCheckedChange={v => { setWeeklyDigestEnabled(v); setIsPrefsDirty(true); }}
                                />
                            </div>
                        </div>
                    </CardContent>

                    <CardFooter className="pt-3 pb-4 px-4 bg-white/[0.01] border-t border-border/30 flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">
                            Custom preferences apply immediately to your streaming profile.
                        </span>
                        <Button
                            type="button"
                            onClick={handleSavePrefs}
                            disabled={savingPrefs}
                            className="font-bold text-xs h-9 bg-purple-600 hover:bg-purple-500 text-white gap-2 transition-all hover:ring-2 hover:ring-purple-400/40 active:scale-95 cursor-pointer shadow-sm"
                        >
                            {savingPrefs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            <span>Save Playback Preferences</span>
                        </Button>
                    </CardFooter>
                </Card>
            )}
        </div>
    );
}
