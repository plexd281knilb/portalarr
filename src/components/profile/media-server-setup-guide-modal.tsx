"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
    Server, Tv, Monitor, Smartphone, Globe, Copy, Check, 
    ExternalLink, Sparkles, AlertCircle, ShieldCheck, CheckCircle2 
} from "lucide-react";

export interface MediaServerSetupGuideModalProps {
    isOpen: boolean;
    onClose: () => void;
    serverType: "JELLYFIN" | "EMBY";
    serverName?: string;
    serverUrl?: string;
    username?: string;
}

export function MediaServerSetupGuideModal({
    isOpen,
    onClose,
    serverType,
    serverName,
    serverUrl,
    username = ""
}: MediaServerSetupGuideModalProps) {
    const [copiedUrl, setCopiedUrl] = useState(false);
    const [copiedUser, setCopiedUser] = useState(false);

    const isJellyfin = serverType === "JELLYFIN";
    const displayName = serverName || (isJellyfin ? "Jellyfin Media Server" : "Emby Media Server");
    const resolvedUrl = serverUrl && serverUrl.trim() !== "" 
        ? serverUrl.trim() 
        : (isJellyfin ? "https://jellyfin.domshomelab.com" : "https://emby.domshomelab.com");

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

                    {/* Step 2: Sign In with Your Username */}
                    <div className="p-4 rounded-xl bg-white/[0.02] border border-border/40 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold uppercase tracking-wider ${themeColor.accentText}`}>
                                    Step 2: Sign In with Your Account
                                </span>
                            </div>
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                User Credentials
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Use your configured portal username to log into the {serverType} server:
                        </p>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 px-3 py-2 rounded-lg bg-black/40 border border-border/50 font-mono text-xs text-foreground truncate select-all">
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
                        <p className="text-[11px] text-muted-foreground/80 italic">
                            💡 For initial login or password synchronization, use your standard DomsHomeLab password or request a reset in Support Tickets.
                        </p>
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
                <DialogFooter className="p-4 border-t border-border/40 bg-white/[0.01] flex items-center justify-between sm:justify-between">
                    <p className="text-[11px] text-muted-foreground">
                        Need help? Open a <a href="/tickets" className="text-primary hover:underline">Support Ticket</a> anytime.
                    </p>
                    <Button onClick={onClose} size="sm" className="font-semibold text-xs px-5 cursor-pointer">
                        Got It
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
