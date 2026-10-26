"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
    Server, Tv, Monitor, Smartphone, Globe, Copy, Check, 
    ExternalLink, Sparkles, AlertCircle, ShieldCheck, CheckCircle2,
    Key, Lock, Loader2, XCircle
} from "lucide-react";
import { 
    ensureUserMediaServerProvisionedAction, 
    setUserMediaServerPasswordAction,
    authorizeMediaServerQuickConnectAction
} from "@/app/media-server-actions";

export interface MediaServerSetupGuideModalProps {
    isOpen: boolean;
    onClose: () => void;
    serverType: "JELLYFIN" | "EMBY";
    serverId?: string;
    serverName?: string;
    serverUrl?: string;
    username?: string;
}

export function MediaServerSetupGuideModal({
    isOpen,
    onClose,
    serverType,
    serverId,
    serverName,
    serverUrl,
    username = ""
}: MediaServerSetupGuideModalProps) {
    const [copiedUrl, setCopiedUrl] = useState(false);
    const [copiedUser, setCopiedUser] = useState(false);

    // Auto-provisioning state
    const [isProvisioning, setIsProvisioning] = useState(false);
    const [provisionSuccess, setProvisionSuccess] = useState<boolean | null>(null);
    const [provisionMsg, setProvisionMsg] = useState("");

    // Streaming password management state
    const [showPasswordSetup, setShowPasswordSetup] = useState(true);
    const [passwordInput, setPasswordInput] = useState("");
    const [savingPassword, setSavingPassword] = useState(false);
    const [passwordSuccess, setPasswordSuccess] = useState(false);
    const [passwordErr, setPasswordErr] = useState("");

    // Quick Connect state
    const [quickConnectCode, setQuickConnectCode] = useState("");
    const [authorizingQuickConnect, setAuthorizingQuickConnect] = useState(false);
    const [quickConnectSuccess, setQuickConnectSuccess] = useState<string | null>(null);
    const [quickConnectErr, setQuickConnectErr] = useState<string | null>(null);

    const isJellyfin = serverType === "JELLYFIN";
    const displayName = serverName || (isJellyfin ? "Jellyfin Media Server" : "Emby Media Server");
    const resolvedUrl = serverUrl && serverUrl.trim() !== "" 
        ? serverUrl.trim() 
        : (isJellyfin ? "https://jellyfin.domshomelab.com" : "https://emby.domshomelab.com");

    // Automatically verify or provision the user on the remote media server upon opening the guide
    useEffect(() => {
        if (!isOpen) return;
        let isCancelled = false;
        const runProvision = async () => {
            setIsProvisioning(true);
            try {
                const res = await ensureUserMediaServerProvisionedAction(serverId);
                if (isCancelled) return;
                if (res.success) {
                    setProvisionSuccess(true);
                    setProvisionMsg(res.message || `Account verified & active on ${serverType}`);
                } else {
                    setProvisionSuccess(false);
                    setProvisionMsg(res.error || `Could not automatically provision on ${serverType}`);
                }
            } catch (e: any) {
                if (isCancelled) return;
                setProvisionSuccess(false);
                setProvisionMsg(e.message || "Failed to reach media server");
            } finally {
                if (!isCancelled) setIsProvisioning(false);
            }
        };
        runProvision();
        return () => { isCancelled = true; };
    }, [isOpen, serverId, serverType]);

    const copyToClipboard = (text: string, type: "url" | "user") => {
        if (!navigator?.clipboard) return;
        navigator.clipboard.writeText(text);
        if (type === "url") {
            setCopiedUrl(true);
            setTimeout(() => setCopiedUrl(false), 2500);
        } else {
            setCopiedUser(true);
            setTimeout(() => setCopiedUser(false), 2500);
        }
    };

    const themeColor = isJellyfin 
        ? {
            badge: "bg-purple-500/15 text-purple-300 border-purple-500/40",
            iconBg: "bg-purple-500/15 border-purple-500/30 text-purple-400",
            borderHighlight: "border-purple-500/40",
            accentText: "text-purple-400"
        }
        : {
            badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
            iconBg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
            borderHighlight: "border-emerald-500/40",
            accentText: "text-emerald-400"
        };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] flex flex-col bg-[#121218]/95 border-border/60 backdrop-blur-xl shadow-2xl p-0 overflow-hidden">
                {/* Header */}
                <DialogHeader className="p-5 pb-4 border-b border-border/40 bg-white/[0.01]">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className={`h-10 w-10 rounded-xl flex items-center justify-center border shrink-0 ${themeColor.iconBg}`}>
                                <Server className="h-5 w-5" />
                            </div>
                            <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                    <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                                        {displayName} Setup Guide
                                    </DialogTitle>
                                    <Badge variant="outline" className={`text-[10px] font-bold ${themeColor.badge}`}>
                                        {serverType}
                                    </Badge>
                                </div>
                                <DialogDescription className="text-xs text-muted-foreground">
                                    Step-by-step instructions to connect your player apps for 100% Direct Play.
                                </DialogDescription>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* Step 1: Connect to Server Address */}
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-border/40 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold uppercase tracking-wider ${themeColor.accentText}`}>
                                    Step 1: Connect to Server Address
                                </span>
                            </div>
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                Server URL
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            When opening your {serverType} app for the first time, enter this server address:
                        </p>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 px-3 py-2 rounded-lg bg-black/40 border border-border/50 font-mono text-xs text-foreground truncate select-all">
                                {resolvedUrl}
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => copyToClipboard(resolvedUrl, "url")}
                                className="h-9 px-3 gap-1.5 text-xs font-semibold shrink-0 cursor-pointer"
                            >
                                {copiedUrl ? (
                                    <>
                                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                                        <span className="text-emerald-400">Copied!</span>
                                    </>
                                ) : (
                                    <>
                                        <Copy className="h-3.5 w-3.5" />
                                        <span>Copy URL</span>
                                    </>
                                )}
                            </Button>
                            {resolvedUrl.startsWith("http") && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    asChild
                                    className="h-9 px-3 gap-1 text-xs font-semibold shrink-0"
                                >
                                    <a href={resolvedUrl} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="h-3.5 w-3.5" />
                                        <span className="hidden sm:inline">Open Web Client</span>
                                    </a>
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Step 2: Sign In with Your Username & Password */}
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-border/40 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold uppercase tracking-wider ${themeColor.accentText}`}>
                                    Step 2: Sign In with Your Account
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                {isProvisioning ? (
                                    <Badge variant="outline" className="text-[10px] text-purple-300 border-purple-500/30 gap-1 bg-purple-500/10">
                                        <Loader2 className="h-2.5 w-2.5 animate-spin" /> Provisioning...
                                    </Badge>
                                ) : provisionSuccess ? (
                                    <Badge variant="outline" className="text-[10px] text-emerald-300 border-emerald-500/40 bg-emerald-500/10 gap-1">
                                        <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Account Active on {serverType}
                                    </Badge>
                                ) : provisionSuccess === false ? (
                                    <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-500/40 bg-amber-500/10 gap-1">
                                        <AlertCircle className="h-3 w-3 text-amber-400" /> Pending Server Sync
                                    </Badge>
                                ) : null}
                            </div>
                        </div>

                        {/* Username Block */}
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Server Username</Label>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 px-3 py-2 rounded-lg bg-black/40 border border-border/50 font-mono text-xs text-foreground truncate select-all font-bold">
                                    {username || "Your Portal Username"}
                                </div>
                                {username && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => copyToClipboard(username, "user")}
                                        className="h-9 px-3 gap-1.5 text-xs font-semibold shrink-0 cursor-pointer"
                                    >
                                        {copiedUser ? (
                                            <>
                                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                                                <span className="text-emerald-400">Copied!</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="h-3.5 w-3.5" />
                                                <span>Copy Username</span>
                                            </>
                                        )}
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Password Guidance Callout */}
                        <div className="p-3 rounded-lg bg-blue-950/20 border border-blue-500/30 space-y-1.5 text-xs">
                            <div className="flex items-center gap-1.5 font-bold text-blue-300">
                                <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
                                <span>Initial Sign-In Password: (None / Blank)</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Because you sign into DomsHomeLab via Plex, your {serverType} account is created with <strong className="text-foreground">NO PASSWORD</strong>. When opening your {serverType} player app, enter your username (<code className="text-foreground">{username}</code>) and <strong className="text-foreground">leave the password field completely empty</strong> to log in.
                            </p>
                        </div>

                        {/* Quick Connect TV & Device Pairing */}
                        <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                                    <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                                    <span>⚡ Quick Connect (TV & Player Apps)</span>
                                </Label>
                                <Badge variant="outline" className="text-[10px] text-purple-300 border-purple-500/40 bg-purple-500/10 font-medium">
                                    No Remote Typing
                                </Badge>
                            </div>
                            <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1">
                                <p>
                                    Opening <strong className="text-purple-300">{serverType}</strong> on an Apple TV, Roku, Fire TV, Android TV, or Smart TV? Skip typing passwords with the TV remote:
                                </p>
                                <ol className="list-decimal list-inside space-y-0.5 text-[10.5px] text-muted-foreground/90 pl-0.5">
                                    <li>Open {serverType} on your TV and select <strong className="text-foreground">"Quick Connect"</strong> on the sign-in screen.</li>
                                    <li>Your TV will display a temporary <strong className="text-purple-300 font-mono">6-character pairing code</strong> (e.g. <code>834912</code>).</li>
                                    <li>Type that TV code below and click <strong className="text-foreground">Authorize TV</strong>. Your TV logs in immediately!</li>
                                </ol>
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Enter TV code from screen (e.g. 834912)"
                                    value={quickConnectCode}
                                    onChange={e => {
                                        setQuickConnectCode(e.target.value.toUpperCase());
                                        setQuickConnectErr(null);
                                        setQuickConnectSuccess(null);
                                    }}
                                    maxLength={12}
                                    className="h-8 text-xs font-mono tracking-widest uppercase flex-1 bg-black/40 border-purple-500/30"
                                />
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={async () => {
                                        const clean = quickConnectCode.replace(/[\s-]/g, "").trim().toUpperCase();
                                        if (!clean || clean.length < 3) {
                                            setQuickConnectErr("Please enter the pairing code shown on your TV screen.");
                                            return;
                                        }
                                        if (username && (clean.toLowerCase() === username.toLowerCase() || clean === "D281KNILB")) {
                                            setQuickConnectErr(`"${clean}" is an account name. Look at your TV screen after selecting "Quick Connect" — it will display a temporary 6-character code (e.g. 834912).`);
                                            return;
                                        }
                                        setAuthorizingQuickConnect(true);
                                        setQuickConnectErr(null);
                                        setQuickConnectSuccess(null);
                                        try {
                                            const res = await authorizeMediaServerQuickConnectAction(serverId, clean);
                                            if (res.success) {
                                                setQuickConnectSuccess(res.message || "Device authorized! Your TV will log in immediately.");
                                                setQuickConnectCode("");
                                            } else {
                                                setQuickConnectErr(res.error || "Failed to authorize Quick Connect code");
                                            }
                                        } catch (e: any) {
                                            setQuickConnectErr(e.message || "Failed to authorize Quick Connect");
                                        } finally {
                                            setAuthorizingQuickConnect(false);
                                        }
                                    }}
                                    disabled={authorizingQuickConnect || quickConnectCode.trim().length < 3}
                                    className="h-8 text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white gap-1.5 shrink-0 cursor-pointer"
                                >
                                    {authorizingQuickConnect ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                    Authorize TV
                                </Button>
                            </div>
                            {quickConnectSuccess && (
                                <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                    <span>{quickConnectSuccess}</span>
                                </div>
                            )}
                            {quickConnectErr && (
                                <div className="text-[11px] text-red-400 flex items-center gap-1">
                                    <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                                    <span>{quickConnectErr}</span>
                                </div>
                            )}
                            <div className="pt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>Alternatively, authorize via browser:</span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    asChild
                                    className="h-6 px-1.5 text-[11px] text-purple-300 hover:text-purple-200 gap-1"
                                >
                                    <a href={`${resolvedUrl}/web/index.html#!/quickconnect.html`} target="_blank" rel="noopener noreferrer">
                                        <span>Open Web Quick Connect</span>
                                        <ExternalLink className="h-3 w-3" />
                                    </a>
                                </Button>
                            </div>
                        </div>

                        {/* Optional: Set Dedicated Streaming Password */}
                        <div className="pt-1">
                            {!showPasswordSetup ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowPasswordSetup(true)}
                                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5 cursor-pointer"
                                >
                                    <Key className="h-3.5 w-3.5 text-amber-400" />
                                    <span>Set a dedicated streaming password (Optional)</span>
                                </Button>
                            ) : (
                                <div className="p-3 rounded-lg bg-black/40 border border-border/50 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                            <Key className="h-3.5 w-3.5 text-amber-400" />
                                            <span>Set {serverType} Streaming Password (Optional)</span>
                                        </Label>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setShowPasswordSetup(false)}
                                            className="h-5 px-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
                                        >
                                            Minimize
                                        </Button>
                                    </div>
                                    <div className="flex gap-2">
                                        <Input
                                            type="password"
                                            placeholder="Enter streaming password (min 4 chars)"
                                            value={passwordInput}
                                            onChange={e => {
                                                setPasswordInput(e.target.value);
                                                setPasswordErr("");
                                                setPasswordSuccess(false);
                                            }}
                                            className="h-8 text-xs font-mono flex-1"
                                        />
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={async () => {
                                                if (!passwordInput.trim() || passwordInput.trim().length < 4) {
                                                    setPasswordErr("Password must be at least 4 characters.");
                                                    return;
                                                }
                                                setSavingPassword(true);
                                                setPasswordErr("");
                                                try {
                                                    const targetId = serverId || "";
                                                    const res = await setUserMediaServerPasswordAction(targetId, passwordInput.trim());
                                                    if (res.success) {
                                                        setPasswordSuccess(true);
                                                        setPasswordInput("");
                                                    } else {
                                                        setPasswordErr(res.error || "Failed to set password");
                                                    }
                                                } catch (e: any) {
                                                    setPasswordErr(e.message || "Failed to set password");
                                                } finally {
                                                    setSavingPassword(false);
                                                }
                                            }}
                                            disabled={savingPassword || passwordInput.trim().length < 4}
                                            className="h-8 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground gap-1 shrink-0 cursor-pointer"
                                        >
                                            {savingPassword ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                            Save Password
                                        </Button>
                                    </div>
                                    {passwordSuccess && (
                                        <div className="text-[11px] text-emerald-400 flex items-center gap-1">
                                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                            <span>Streaming password saved! You can now use this password in your {serverType} apps.</span>
                                        </div>
                                    )}
                                    {passwordErr && (
                                        <div className="text-[11px] text-red-400 flex items-center gap-1">
                                            <XCircle className="h-3.5 w-3.5 shrink-0" />
                                            <span>{passwordErr}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Step 3: Recommended Client Apps for Every Device */}
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-border/40 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <span className={`text-xs font-bold uppercase tracking-wider ${themeColor.accentText}`}>
                                Step 3: Recommended Apps for Every Screen
                            </span>
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                Client Apps
                            </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {/* Apple TV / iOS */}
                            <div className="p-3 rounded-lg bg-black/20 border border-border/30 space-y-1">
                                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                                    <Tv className="h-3.5 w-3.5 text-cyan-400" />
                                    <span>Apple TV &amp; iOS</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    {isJellyfin ? (
                                        <>
                                            <strong>Swiftfin</strong> (Recommended for native Swift 4K Direct Play) or official <strong>Jellyfin Mobile</strong> on the App Store.
                                        </>
                                    ) : (
                                        <>
                                            Official <strong>Emby for iOS &amp; Apple TV</strong> available directly from the Apple App Store.
                                        </>
                                    )}
                                </p>
                            </div>

                            {/* Roku */}
                            <div className="p-3 rounded-lg bg-black/20 border border-border/30 space-y-1">
                                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                                    <Monitor className="h-3.5 w-3.5 text-purple-400" />
                                    <span>Roku Streaming Devices</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    Search for <strong>{serverType}</strong> in the Roku Channel Store and add the official channel to your home screen.
                                </p>
                            </div>

                            {/* Fire TV & Android TV */}
                            <div className="p-3 rounded-lg bg-black/20 border border-border/30 space-y-1">
                                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                                    <Smartphone className="h-3.5 w-3.5 text-emerald-400" />
                                    <span>Fire TV &amp; Android TV / Shield</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    Download official <strong>{serverType} for Android TV</strong> on Google Play or the Amazon Appstore.
                                </p>
                            </div>

                            {/* Web Browser */}
                            <div className="p-3 rounded-lg bg-black/20 border border-border/30 space-y-1">
                                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                                    <Globe className="h-3.5 w-3.5 text-amber-400" />
                                    <span>Web Browser / PC / Mac</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    Open Chrome, Firefox, Safari, or Edge and navigate straight to your server address for instant playback.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Step 4: Direct Play & Zero-Buffering Optimization */}
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2">
                        <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
                            <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                                Step 4: Direct Play &amp; Zero-Buffering Optimization
                            </span>
                        </div>
                        <ul className="text-xs text-muted-foreground space-y-1.5 pl-5 list-disc leading-relaxed">
                            <li>
                                Go to <strong className="text-foreground">Settings → Playback</strong> in your {serverType} app.
                            </li>
                            <li>
                                Set <strong className="text-foreground">Home &amp; Remote Streaming Bitrate</strong> to <strong className="text-foreground">"Auto" or "Maximum"</strong> (100% Direct Play).
                            </li>
                            <li>
                                Ensure <strong className="text-foreground">Audio Output</strong> is set to <strong className="text-foreground">Direct / Passthrough</strong> for Dolby 5.1/Atmos surround sound.
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Footer */}
                <DialogFooter className="p-4 border-t border-border/40 bg-white/[0.01] flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                    <p className="text-[11px] text-muted-foreground">
                        Need help? Open a <a href="/tickets" className="text-primary hover:underline">Support Ticket</a> anytime.
                    </p>
                    <Button onClick={onClose} size="sm" className="font-semibold text-xs px-5 cursor-pointer w-full sm:w-auto">
                        Got It
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
