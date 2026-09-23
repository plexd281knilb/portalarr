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
    Bell
} from "lucide-react";

export function SeerrSettingsPanel() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Settings state
    const [autoApproveAll, setAutoApproveAll] = useState(true);
    const [quotaMovies, setQuotaMovies] = useState(10);
    const [quotaTv, setQuotaTv] = useState(10);
    const [quotaDays, setQuotaDays] = useState(7);
    const [notificationOnAvailable, setNotificationOnAvailable] = useState(true);

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
                setAutoApproveAll(d.seerrAutoApproveAll);
                setQuotaMovies(d.seerrQuotaMovies ?? 10);
                setQuotaTv(d.seerrQuotaTv ?? 10);
                setQuotaDays(d.seerrQuotaDays ?? 7);
                setNotificationOnAvailable(d.seerrNotificationOnAvailable);

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
                seerrAutoApproveAll: autoApproveAll,
                seerrQuotaMovies: Number(quotaMovies),
                seerrQuotaTv: Number(quotaTv),
                seerrQuotaDays: Number(quotaDays),
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
                                Configure automated approvals, user request quotas, and default Radarr/Sonarr dispatch routing.
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-bold px-2.5 py-1">
                            Native Seerr v3.0
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Auto Approval Toggle */}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-background/50 border border-border/40">
                        <div className="space-y-0.5 max-w-xl">
                            <Label className="text-sm font-bold text-foreground flex items-center gap-1.5">
                                <Sparkles className="h-4 w-4 text-primary" />
                                Auto-Approve Media Requests
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                Automatically approve and immediately dispatch requests from approved users to Radarr and Sonarr without manual administrator review.
                            </p>
                        </div>
                        <Switch
                            checked={autoApproveAll}
                            onCheckedChange={setAutoApproveAll}
                        />
                    </div>

                    {/* Email Notification on Availability */}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-background/50 border border-border/40">
                        <div className="space-y-0.5 max-w-xl">
                            <Label className="text-sm font-bold text-foreground flex items-center gap-1.5">
                                <Bell className="h-4 w-4 text-emerald-400" />
                                Ready to Stream Notifications
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                Send an automated email notification to the requester when their requested movie or series is detected in Plex.
                            </p>
                        </div>
                        <Switch
                            checked={notificationOnAvailable}
                            onCheckedChange={setNotificationOnAvailable}
                        />
                    </div>

                    {/* User Quotas Grid */}
                    <div className="space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Default User Request Quotas
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="space-y-1.5 p-3.5 rounded-xl bg-background/40 border border-border/40">
                                <Label className="text-xs font-semibold text-foreground">Movie Quota Limit</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={quotaMovies}
                                    onChange={(e) => setQuotaMovies(parseInt(e.target.value, 10) || 0)}
                                    className="h-9 text-xs bg-background/60"
                                />
                                <span className="text-[10px] text-muted-foreground">0 = Unlimited movie requests</span>
                            </div>

                            <div className="space-y-1.5 p-3.5 rounded-xl bg-background/40 border border-border/40">
                                <Label className="text-xs font-semibold text-foreground">TV Show Quota Limit</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    value={quotaTv}
                                    onChange={(e) => setQuotaTv(parseInt(e.target.value, 10) || 0)}
                                    className="h-9 text-xs bg-background/60"
                                />
                                <span className="text-[10px] text-muted-foreground">0 = Unlimited TV requests</span>
                            </div>

                            <div className="space-y-1.5 p-3.5 rounded-xl bg-background/40 border border-border/40">
                                <Label className="text-xs font-semibold text-foreground">Quota Window (Days)</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={quotaDays}
                                    onChange={(e) => setQuotaDays(parseInt(e.target.value, 10) || 7)}
                                    className="h-9 text-xs bg-background/60"
                                />
                                <span className="text-[10px] text-muted-foreground">Sliding window in days (default: 7)</span>
                            </div>
                        </div>
                    </div>

                    {/* Radarr Movie Dispatch Configuration */}
                    <div className="space-y-3 border-t border-border/40 pt-5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <Film className="h-4 w-4 text-blue-400" />
                            Radarr (Movie) Dispatch Defaults
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-foreground">Standard Movie Server</Label>
                                <Select value={defaultMovieAppId || "none"} onValueChange={(v) => setDefaultMovieAppId(v === "none" ? "" : v)}>
                                    <SelectTrigger className="h-9 text-xs bg-background/50 border-border/50">
                                        <SelectValue placeholder="Auto-select first Radarr server" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Auto-select first Radarr instance</SelectItem>
                                        {radarrApps.map(app => (
                                            <SelectItem key={app.id} value={app.id}>{app.name} ({app.url})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-foreground">4K UHD Movie Server</Label>
                                <Select value={defaultMovie4kAppId || "none"} onValueChange={(v) => setDefaultMovie4kAppId(v === "none" ? "" : v)}>
                                    <SelectTrigger className="h-9 text-xs bg-background/50 border-border/50">
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
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-foreground">Default Movie Root Folder</Label>
                            <Input
                                placeholder="/movies or /data/media/movies"
                                value={defaultMovieRootFolder}
                                onChange={(e) => setDefaultMovieRootFolder(e.target.value)}
                                className="h-9 text-xs bg-background/50 border-border/50"
                            />
                            <span className="text-[10px] text-muted-foreground">Leaves blank to auto-use the first root folder configured in Radarr</span>
                        </div>
                    </div>

                    {/* Sonarr TV Dispatch Configuration */}
                    <div className="space-y-3 border-t border-border/40 pt-5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <Tv className="h-4 w-4 text-cyan-400" />
                            Sonarr (TV Show) Dispatch Defaults
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-foreground">Standard TV Server</Label>
                                <Select value={defaultTvAppId || "none"} onValueChange={(v) => setDefaultTvAppId(v === "none" ? "" : v)}>
                                    <SelectTrigger className="h-9 text-xs bg-background/50 border-border/50">
                                        <SelectValue placeholder="Auto-select first Sonarr server" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Auto-select first Sonarr instance</SelectItem>
                                        {sonarrApps.map(app => (
                                            <SelectItem key={app.id} value={app.id}>{app.name} ({app.url})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-foreground">4K UHD TV Server</Label>
                                <Select value={defaultTv4kAppId || "none"} onValueChange={(v) => setDefaultTv4kAppId(v === "none" ? "" : v)}>
                                    <SelectTrigger className="h-9 text-xs bg-background/50 border-border/50">
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
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-foreground">Default TV Root Folder</Label>
                            <Input
                                placeholder="/tv or /data/media/tv"
                                value={defaultTvRootFolder}
                                onChange={(e) => setDefaultTvRootFolder(e.target.value)}
                                className="h-9 text-xs bg-background/50 border-border/50"
                            />
                            <span className="text-[10px] text-muted-foreground">Leaves blank to auto-use the first root folder configured in Sonarr</span>
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
