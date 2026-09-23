"use client";

import { useState, useEffect } from "react";
import { getSeerrSettingsAction, updateSeerrSettingsAction } from "@/app/seerr-actions";
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
    Check,
    Bell,
    UserCheck,
    Clock,
    Smile,
    ShieldCheck,
    ShieldAlert,
    CopyCheck
} from "lucide-react";

export function SeerrSettingsPanel() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
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
    const [trialQuotaDays, setTrialQuotaDays] = useState(7);

    // Kids Section & Routing Settings
    const [kidsAutoApprovePg, setKidsAutoApprovePg] = useState(true);
    const [kidsRequireApprovalPg13, setKidsRequireApprovalPg13] = useState(true);
    const [kidsMovieAppId, setKidsMovieAppId] = useState<string>("");
    const [kidsMovie4kAppId, setKidsMovie4kAppId] = useState<string>("");
    const [kidsMovieRootFolder, setKidsMovieRootFolder] = useState<string>("");
    const [kidsTvAppId, setKidsTvAppId] = useState<string>("");
    const [kidsTv4kAppId, setKidsTv4kAppId] = useState<string>("");
    const [kidsTvRootFolder, setKidsTvRootFolder] = useState<string>("");

    // Dual 4K + 1080p Ingestion
    const [autoDual1080pFor4k, setAutoDual1080pFor4k] = useState(true);

    // Notifications
    const [notificationOnAvailable, setNotificationOnAvailable] = useState(true);

    // Main Radarr / Sonarr Routing Defaults
    const [defaultMovieAppId, setDefaultMovieAppId] = useState<string>("");
    const [defaultMovie4kAppId, setDefaultMovie4kAppId] = useState<string>("");
    const [defaultMovieRootFolder, setDefaultMovieRootFolder] = useState<string>("");
    const [defaultTvAppId, setDefaultTvAppId] = useState<string>("");
    const [defaultTv4kAppId, setDefaultTv4kAppId] = useState<string>("");
    const [defaultTvRootFolder, setDefaultTvRootFolder] = useState<string>("");

    // Media apps list
    const [radarrApps, setRadarrApps] = useState<any[]>([]);
    const [sonarrApps, setSonarrApps] = useState<any[]>([]);

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
                setTrialQuotaDays(d.seerrTrialQuotaDays ?? 7);

                // Kids Section
                setKidsAutoApprovePg(d.seerrKidsAutoApprovePg ?? true);
                setKidsRequireApprovalPg13(d.seerrKidsRequireApprovalPg13 ?? true);
                setKidsMovieAppId(d.seerrKidsMovieAppId || "");
                setKidsMovie4kAppId(d.seerrKidsMovie4kAppId || "");
                setKidsMovieRootFolder(d.seerrKidsMovieRootFolder || "");
                setKidsTvAppId(d.seerrKidsTvAppId || "");
                setKidsTv4kAppId(d.seerrKidsTv4kAppId || "");
                setKidsTvRootFolder(d.seerrKidsTvRootFolder || "");

                // Dual 1080p Companion
                setAutoDual1080pFor4k(d.seerrAutoDual1080pFor4k ?? true);

                // Notifications
                setNotificationOnAvailable(d.seerrNotificationOnAvailable ?? true);

                // Main Defaults
                setDefaultMovieAppId(d.seerrDefaultMovieAppId || "");
                setDefaultMovie4kAppId(d.seerrDefaultMovie4kAppId || "");
                setDefaultMovieRootFolder(d.seerrDefaultMovieRootFolder || "");
                setDefaultTvAppId(d.seerrDefaultTvAppId || "");
                setDefaultTv4kAppId(d.seerrDefaultTv4kAppId || "");
                setDefaultTvRootFolder(d.seerrDefaultTvRootFolder || "");

                setRadarrApps(d.radarrApps || []);
                setSonarrApps(d.sonarrApps || []);
            }
        } catch (e) {} finally {
            setLoading(false);
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
                seerrTrialQuotaDays: Number(trialQuotaDays),

                // Kids Section
                seerrKidsAutoApprovePg: kidsAutoApprovePg,
                seerrKidsRequireApprovalPg13: kidsRequireApprovalPg13,
                seerrKidsMovieAppId: kidsMovieAppId || null,
                seerrKidsMovie4kAppId: kidsMovie4kAppId || null,
                seerrKidsMovieRootFolder: kidsMovieRootFolder || null,
                seerrKidsTvAppId: kidsTvAppId || null,
                seerrKidsTv4kAppId: kidsTv4kAppId || null,
                seerrKidsTvRootFolder: kidsTvRootFolder || null,

                // Dual 1080p Companion
                seerrAutoDual1080pFor4k: autoDual1080pFor4k,

                // Notifications & Main
                seerrNotificationOnAvailable: notificationOnAvailable,
                seerrDefaultMovieAppId: defaultMovieAppId || null,
                seerrDefaultMovie4kAppId: defaultMovie4kAppId || null,
                seerrDefaultMovieRootFolder: defaultMovieRootFolder || null,
                seerrDefaultTvAppId: defaultTvAppId || null,
                seerrDefaultTv4kAppId: defaultTv4kAppId || null,
                seerrDefaultTvRootFolder: defaultTvRootFolder || null
            });

            if (res.success) {
                setSuccessMsg(res.message || "Settings saved successfully!");
            } else {
                setErrorMsg(res.error || "Failed to save settings.");
            }
        } catch (e: any) {
            setErrorMsg(e.message || "An unexpected error occurred.");
        } finally {
            setSaving(false);
        }
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
                                Configure Full vs Trial accounts, Kids Section ratings & Arrs routing, and Dual 4K+1080p ingestion rules.
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-bold px-2.5 py-1">
                            Seerr Engine v3.5
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-8">
                    {/* 1. FULL ACCOUNTS CONFIGURATION */}
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

                    {/* 2. TRIAL ACCOUNTS CONFIGURATION */}
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

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-background/30 border border-border/40">
                                <div className="space-y-1">
                                    <Label className="text-[11px] font-semibold text-foreground">Trial Movie Limit</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={trialQuotaMovies}
                                        onChange={(e) => setTrialQuotaMovies(parseInt(e.target.value, 10) || 1)}
                                        className="h-8 text-xs bg-background/60"
                                    />
                                    <span className="text-[10px] text-muted-foreground">Default: 3 movies</span>
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
                                    <span className="text-[10px] text-muted-foreground">Default: 3 TV shows</span>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[11px] font-semibold text-foreground">Trial Window (Days)</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={trialQuotaDays}
                                        onChange={(e) => setTrialQuotaDays(parseInt(e.target.value, 10) || 7)}
                                        className="h-8 text-xs bg-background/60"
                                    />
                                    <span className="text-[10px] text-muted-foreground">Sliding window in days</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 3. KIDS SECTION & DEDICATED KIDS ARRS */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                            <Smile className="h-5 w-5 text-orange-400" />
                            <div>
                                <h3 className="text-sm font-bold text-foreground">Kids Section & Dedicated Kids Arrs</h3>
                                <p className="text-xs text-muted-foreground">Content ratings filtering and separate Radarr/Sonarr destination routing.</p>
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

                        {/* Dedicated Kids Arrs Routing */}
                        <div className="space-y-3 pt-2">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Kids Radarr & Sonarr Routing (Optional)
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-foreground">Kids Movies Radarr Instance</Label>
                                    <Select value={kidsMovieAppId || "none"} onValueChange={(v) => setKidsMovieAppId(v === "none" ? "" : v)}>
                                        <SelectTrigger className="h-8 text-xs bg-background/50 border-border/50">
                                            <SelectValue placeholder="Use Standard Movie Server" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Use Standard Movie Server</SelectItem>
                                            {radarrApps.map(app => (
                                                <SelectItem key={app.id} value={app.id}>{app.name} ({app.url})</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-foreground">Kids Movies 4K Radarr Instance</Label>
                                    <Select value={kidsMovie4kAppId || "none"} onValueChange={(v) => setKidsMovie4kAppId(v === "none" ? "" : v)}>
                                        <SelectTrigger className="h-8 text-xs bg-background/50 border-border/50">
                                            <SelectValue placeholder="Use Standard 4K Server" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Use Standard 4K Server</SelectItem>
                                            {radarrApps.map(app => (
                                                <SelectItem key={app.id} value={app.id}>{app.name} ({app.url})</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label className="text-xs font-semibold text-foreground">Kids Movies Root Folder</Label>
                                    <Input
                                        placeholder="/data/media/kids_movies"
                                        value={kidsMovieRootFolder}
                                        onChange={(e) => setKidsMovieRootFolder(e.target.value)}
                                        className="h-8 text-xs bg-background/50 border-border/50"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-foreground">Kids TV Shows Sonarr Instance</Label>
                                    <Select value={kidsTvAppId || "none"} onValueChange={(v) => setKidsTvAppId(v === "none" ? "" : v)}>
                                        <SelectTrigger className="h-8 text-xs bg-background/50 border-border/50">
                                            <SelectValue placeholder="Use Standard TV Server" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Use Standard TV Server</SelectItem>
                                            {sonarrApps.map(app => (
                                                <SelectItem key={app.id} value={app.id}>{app.name} ({app.url})</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-foreground">Kids TV Shows 4K Sonarr Instance</Label>
                                    <Select value={kidsTv4kAppId || "none"} onValueChange={(v) => setKidsTv4kAppId(v === "none" ? "" : v)}>
                                        <SelectTrigger className="h-8 text-xs bg-background/50 border-border/50">
                                            <SelectValue placeholder="Use Standard 4K TV Server" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Use Standard 4K TV Server</SelectItem>
                                            {sonarrApps.map(app => (
                                                <SelectItem key={app.id} value={app.id}>{app.name} ({app.url})</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label className="text-xs font-semibold text-foreground">Kids TV Root Folder</Label>
                                    <Input
                                        placeholder="/data/media/kids_tv"
                                        value={kidsTvRootFolder}
                                        onChange={(e) => setKidsTvRootFolder(e.target.value)}
                                        className="h-8 text-xs bg-background/50 border-border/50"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 4. DUAL 4K + 1080P INGESTION RULE */}
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
                                    When media is requested or added to a 4K Radarr/Sonarr instance, automatically create and dispatch a companion 1080p request to the standard 1080p Arr as well.
                                </p>
                            </div>
                            <Switch
                                checked={autoDual1080pFor4k}
                                onCheckedChange={setAutoDual1080pFor4k}
                            />
                        </div>
                    </div>

                    {/* 5. MAIN / STANDARD ARRS DISPATCH DEFAULTS */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 pb-2 border-b border-border/40">
                            <Layers className="h-5 w-5 text-blue-400" />
                            <div>
                                <h3 className="text-sm font-bold text-foreground">Main Arrs Dispatch Defaults</h3>
                                <p className="text-xs text-muted-foreground">Standard destination servers and default library folder paths.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                                    <Film className="h-3.5 w-3.5 text-blue-400" /> Standard Movie Server (1080p)
                                </Label>
                                <Select value={defaultMovieAppId || "none"} onValueChange={(v) => setDefaultMovieAppId(v === "none" ? "" : v)}>
                                    <SelectTrigger className="h-8 text-xs bg-background/50 border-border/50">
                                        <SelectValue placeholder="Auto-select first Radarr server" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Auto-select first Radarr server</SelectItem>
                                        {radarrApps.map(app => (
                                            <SelectItem key={app.id} value={app.id}>{app.name} ({app.url})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                                    <Film className="h-3.5 w-3.5 text-purple-400" /> 4K UHD Movie Server
                                </Label>
                                <Select value={defaultMovie4kAppId || "none"} onValueChange={(v) => setDefaultMovie4kAppId(v === "none" ? "" : v)}>
                                    <SelectTrigger className="h-8 text-xs bg-background/50 border-border/50">
                                        <SelectValue placeholder="Use standard movie server" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Use standard movie server</SelectItem>
                                        {radarrApps.map(app => (
                                            <SelectItem key={app.id} value={app.id}>{app.name} ({app.url})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5 sm:col-span-2">
                                <Label className="text-xs font-semibold text-foreground">Default Movie Root Folder</Label>
                                <Input
                                    placeholder="/movies or /data/media/movies"
                                    value={defaultMovieRootFolder}
                                    onChange={(e) => setDefaultMovieRootFolder(e.target.value)}
                                    className="h-8 text-xs bg-background/50 border-border/50"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                                    <Tv className="h-3.5 w-3.5 text-cyan-400" /> Standard TV Server (1080p)
                                </Label>
                                <Select value={defaultTvAppId || "none"} onValueChange={(v) => setDefaultTvAppId(v === "none" ? "" : v)}>
                                    <SelectTrigger className="h-8 text-xs bg-background/50 border-border/50">
                                        <SelectValue placeholder="Auto-select first Sonarr server" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Auto-select first Sonarr server</SelectItem>
                                        {sonarrApps.map(app => (
                                            <SelectItem key={app.id} value={app.id}>{app.name} ({app.url})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                                    <Tv className="h-3.5 w-3.5 text-purple-400" /> 4K UHD TV Server
                                </Label>
                                <Select value={defaultTv4kAppId || "none"} onValueChange={(v) => setDefaultTv4kAppId(v === "none" ? "" : v)}>
                                    <SelectTrigger className="h-8 text-xs bg-background/50 border-border/50">
                                        <SelectValue placeholder="Use standard TV server" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Use standard TV server</SelectItem>
                                        {sonarrApps.map(app => (
                                            <SelectItem key={app.id} value={app.id}>{app.name} ({app.url})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5 sm:col-span-2">
                                <Label className="text-xs font-semibold text-foreground">Default TV Root Folder</Label>
                                <Input
                                    placeholder="/tv or /data/media/tv"
                                    value={defaultTvRootFolder}
                                    onChange={(e) => setDefaultTvRootFolder(e.target.value)}
                                    className="h-8 text-xs bg-background/50 border-border/50"
                                />
                            </div>
                        </div>
                    </div>

                    {/* 6. NOTIFICATION ON AVAILABILITY */}
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-background/50 border border-border/40">
                        <div className="space-y-0.5 max-w-xl">
                            <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                <Bell className="h-3.5 w-3.5 text-emerald-400" />
                                Ready to Stream Email Notifications
                            </Label>
                            <p className="text-[11px] text-muted-foreground">
                                Send an automated email notification to the requester when their requested movie or series is detected and ready to stream in Plex.
                            </p>
                        </div>
                        <Switch
                            checked={notificationOnAvailable}
                            onCheckedChange={setNotificationOnAvailable}
                        />
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
