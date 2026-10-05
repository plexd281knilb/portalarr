"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Copy, Check, ExternalLink, Lock, Globe, Film, AlertTriangle } from "lucide-react";
import { CLOUDFLARE_BYPASS_PATHS, CLOUDFLARE_SUPER_USER_PATHS, CLOUDFLARE_ADMIN_PATHS } from "@/lib/edge-policy-paths";

export default function CloudflarePolicyCard() {
    const [copiedBypass, setCopiedBypass] = useState(false);
    const [copiedSuperUser, setCopiedSuperUser] = useState(false);
    const [copiedAdmin, setCopiedAdmin] = useState(false);

    const bypassPaths = CLOUDFLARE_BYPASS_PATHS;
    const superUserPaths = CLOUDFLARE_SUPER_USER_PATHS;
    const adminProtectedPaths = CLOUDFLARE_ADMIN_PATHS;

    const handleCopy = (text: string, type: "bypass" | "superuser" | "admin") => {
        navigator.clipboard.writeText(text);
        if (type === "bypass") {
            setCopiedBypass(true);
            setTimeout(() => setCopiedBypass(false), 2000);
        } else if (type === "superuser") {
            setCopiedSuperUser(true);
            setTimeout(() => setCopiedSuperUser(false), 2000);
        } else {
            setCopiedAdmin(true);
            setTimeout(() => setCopiedAdmin(false), 2000);
        }
    };

    return (
        <Card className="border-orange-500/30 bg-[#121218]/90 backdrop-blur-md shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />
            <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                            <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-foreground">
                                <Shield className="h-5 w-5 text-orange-400" />
                                Cloudflare Access & Edge Security Policy Paths
                            </CardTitle>
                            <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-300 border-orange-500/30">
                                Reverse Proxy / WAF
                            </Badge>
                        </div>
                        <CardDescription className="text-xs">
                            If you run Cloudflare Access, Zero Trust, Authentik, or Authelia in front of DomsHomeLab, configure these route policies to ensure users and webhooks are not blocked.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* BYPASS / PUBLIC PATHS */}
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3 flex flex-col justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-xs text-foreground flex items-center gap-1.5">
                                    <Globe className="h-4 w-4 text-emerald-400" />
                                    End-User & Public Paths
                                </span>
                                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                    Rule: Bypass / Allow
                                </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Add these paths to your Cloudflare Access <strong>Bypass</strong> or <strong>Allow Everyone</strong> policy so friends and family can sign in, request media, and stream audiobooks without encountering Cloudflare login walls:
                            </p>

                            <pre className="p-2.5 rounded-lg bg-black/50 border border-white/10 font-mono text-[11px] text-emerald-300/90 whitespace-pre overflow-x-auto max-h-48">
                                {bypassPaths.join("\n")}
                            </pre>
                        </div>

                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopy(bypassPaths.join("\n"), "bypass")}
                            className="w-full text-xs font-semibold gap-1.5 border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400"
                        >
                            {copiedBypass ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedBypass ? "Copied Bypass Paths!" : "Copy Bypass Paths"}
                        </Button>
                    </div>

                    {/* SUPER USER & ADMIN PATHS (MEDIA APPS) */}
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3 flex flex-col justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-xs text-foreground flex items-center gap-1.5">
                                    <Film className="h-4 w-4 text-purple-400" />
                                    Media Apps (Super Users & Admin)
                                </span>
                                <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-300 border-purple-500/30">
                                    Super Users & Admin
                                </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                These routes provide movie and TV show library management (Radarr & Sonarr). Super Users (trusted power members) and Administrators have access to these services:
                            </p>

                            <pre className="p-2.5 rounded-lg bg-black/50 border border-white/10 font-mono text-[11px] text-purple-300/90 whitespace-pre overflow-x-auto max-h-48">
                                {superUserPaths.join("\n")}
                            </pre>
                        </div>

                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopy(superUserPaths.join("\n"), "superuser")}
                            className="w-full text-xs font-semibold gap-1.5 border-purple-500/30 hover:bg-purple-500/10 text-purple-400"
                        >
                            {copiedSuperUser ? <Check className="h-3.5 w-3.5 text-purple-400" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedSuperUser ? "Copied Media Apps Paths!" : "Copy Media Apps Paths"}
                        </Button>
                    </div>

                    {/* ADMIN ONLY PATHS */}
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3 flex flex-col justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-xs text-foreground flex items-center gap-1.5">
                                    <Lock className="h-4 w-4 text-orange-400" />
                                    Admin-Only Paths (Only You)
                                </span>
                                <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-300 border-orange-500/30">
                                    Require Admin (Strict)
                                </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                These routes contain administrative consoles, database diagnostics, curation studios, user permissions, and API secrets. Cloudflare Access must require YOUR admin email only:
                            </p>

                            <pre className="p-2.5 rounded-lg bg-black/50 border border-white/10 font-mono text-[11px] text-orange-300/90 whitespace-pre overflow-x-auto max-h-48">
                                {adminProtectedPaths.join("\n")}
                            </pre>
                        </div>

                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopy(adminProtectedPaths.join("\n"), "admin")}
                            className="w-full text-xs font-semibold gap-1.5 border-orange-500/30 hover:bg-orange-500/10 text-orange-400"
                        >
                            {copiedAdmin ? <Check className="h-3.5 w-3.5 text-orange-400" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedAdmin ? "Copied Admin Paths!" : "Copy Admin-Only Paths"}
                        </Button>
                    </div>
                </div>

                {/* ZERO TRUST CONFIGURATION INSTRUCTIONS & BEST PRACTICES */}
                <div className="p-3.5 rounded-xl bg-orange-950/20 border border-orange-500/30 space-y-2.5">
                    <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-orange-400 shrink-0" />
                        <span className="font-bold text-xs text-orange-300">
                            Cloudflare Zero Trust Setup Guide (Role & Path Isolation)
                        </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-muted-foreground leading-relaxed">
                        <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06] space-y-1.5">
                            <span className="font-semibold text-orange-300 flex items-center gap-1">
                                <Lock className="h-3 w-3 text-orange-400" />
                                1. Admin Only (Priority 1 / Highest)
                            </span>
                            <ul className="list-disc list-inside space-y-1 text-slate-300/90">
                                <li><strong>Action:</strong> <code className="text-orange-300">Allow</code></li>
                                <li><strong>Paths:</strong> Add all <strong>Admin-Only Paths</strong> (<code className="text-orange-300">/settings*</code>, <code className="text-orange-300">/admin*</code>, <code className="text-orange-300">/curation*</code>, etc.).</li>
                                <li><strong>Include:</strong> <code className="text-orange-300">Emails: [your-admin-email@example.com]</code></li>
                                <li><strong>Result:</strong> Anyone outside of you is stopped with an HTTP 403 / Access Denied at Cloudflare&apos;s edge before reaching your server.</li>
                            </ul>
                        </div>

                        <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06] space-y-1.5">
                            <span className="font-semibold text-purple-300 flex items-center gap-1">
                                <Film className="h-3 w-3 text-purple-400" />
                                2. Super Users & Admin (Priority 2)
                            </span>
                            <ul className="list-disc list-inside space-y-1 text-slate-300/90">
                                <li><strong>Action:</strong> <code className="text-purple-300">Allow</code></li>
                                <li><strong>Paths:</strong> Add <code className="text-purple-300">/radarr*</code> and <code className="text-purple-300">/sonarr*</code>.</li>
                                <li><strong>Include:</strong> <code className="text-purple-300">Emails: [your-email, superuser-emails]</code></li>
                                <li><strong>Note:</strong> If Super Users authenticate via Portalarr native login, you can include Radarr/Sonarr in Bypass; Portalarr&apos;s built-in session strictly gates them to <code className="text-purple-300">SUPER_USER</code> &amp; <code className="text-purple-300">ADMIN</code>.</li>
                            </ul>
                        </div>

                        <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06] space-y-1.5">
                            <span className="font-semibold text-emerald-300 flex items-center gap-1">
                                <Globe className="h-3 w-3 text-emerald-400" />
                                3. Public & Family Bypass (Priority 3)
                            </span>
                            <ul className="list-disc list-inside space-y-1 text-slate-300/90">
                                <li><strong>Action:</strong> <code className="text-emerald-300">Bypass</code></li>
                                <li><strong>Paths:</strong> Add all <strong>End-User &amp; Public Paths</strong>.</li>
                                <li><strong>Include:</strong> <code className="text-emerald-300">Everyone</code></li>
                                <li><strong>Result:</strong> Friends &amp; family can freely stream, request media, and manage their account profile (<code className="text-emerald-300">/profile</code>) without seeing Cloudflare login barriers.</li>
                            </ul>
                        </div>
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1.5 pt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                        <span><strong>Zero-Leakage Architecture:</strong> <code className="text-slate-300">/settings*</code> is 100% admin-only. User profile, Kindle email, and billing settings are accessed via <code className="text-slate-300">/profile</code> to guarantee zero policy conflicts.</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
