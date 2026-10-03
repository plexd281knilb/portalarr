"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Copy, Check, ExternalLink, Lock, Globe, AlertTriangle } from "lucide-react";
import { CLOUDFLARE_BYPASS_PATHS, CLOUDFLARE_ADMIN_PATHS } from "@/lib/edge-policy-paths";

export default function CloudflarePolicyCard() {
    const [copiedBypass, setCopiedBypass] = useState(false);
    const [copiedAdmin, setCopiedAdmin] = useState(false);

    const bypassPaths = CLOUDFLARE_BYPASS_PATHS;
    const adminProtectedPaths = CLOUDFLARE_ADMIN_PATHS;

    const handleCopy = (text: string, type: "bypass" | "admin") => {
        navigator.clipboard.writeText(text);
        if (type === "bypass") {
            setCopiedBypass(true);
            setTimeout(() => setCopiedBypass(false), 2000);
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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* BYPASS / PUBLIC PATHS */}
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3 flex flex-col justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-xs text-foreground flex items-center gap-1.5">
                                    <Globe className="h-4 w-4 text-emerald-400" />
                                    End-User & Public Paths (Bypass Policy)
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
                            {copiedBypass ? "Copied Bypass Paths!" : "Copy Bypass Paths to Clipboard"}
                        </Button>
                    </div>

                    {/* ADMIN PROTECTED PATHS */}
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3 flex flex-col justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-xs text-foreground flex items-center gap-1.5">
                                    <Lock className="h-4 w-4 text-orange-400" />
                                    Admin-Only Paths (Strict Protection)
                                </span>
                                <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-300 border-orange-500/30">
                                    Rule: Require Admin
                                </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                These routes contain administrative consoles, database diagnostics, curation studios, Radarr/Sonarr, and API tokens. Cloudflare Access must require your admin email/2FA for these prefixes:
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
                            {copiedAdmin ? "Copied Admin Paths!" : "Copy Admin Protect Paths to Clipboard"}
                        </Button>
                    </div>
                </div>

                {/* ZERO TRUST CONFIGURATION INSTRUCTIONS & BEST PRACTICES */}
                <div className="p-3.5 rounded-xl bg-orange-950/20 border border-orange-500/30 space-y-2.5">
                    <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-orange-400 shrink-0" />
                        <span className="font-bold text-xs text-orange-300">
                            Cloudflare Zero Trust Setup Guide (Ensuring Admin Paths Are Blocked for Everyone Else)
                        </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-muted-foreground leading-relaxed">
                        <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06] space-y-1.5">
                            <span className="font-semibold text-orange-300 flex items-center gap-1">
                                <Lock className="h-3 w-3 text-orange-400" />
                                1. Admin Protection Rule (Priority 1 / High)
                            </span>
                            <ul className="list-disc list-inside space-y-1 text-slate-300/90">
                                <li><strong>Action:</strong> <code className="text-orange-300">Allow</code></li>
                                <li><strong>Paths:</strong> Add all <strong>Admin-Only Paths</strong> listed above (e.g. <code className="text-orange-300">/settings*</code>, <code className="text-orange-300">/admin*</code>, etc.).</li>
                                <li><strong>Include:</strong> <code className="text-orange-300">Emails: [your-admin-email@example.com]</code></li>
                                <li><strong>Result:</strong> Anyone outside of you trying to access these paths will be stopped with an HTTP 403 / Access Denied at Cloudflare&apos;s edge before reaching your server.</li>
                            </ul>
                        </div>

                        <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06] space-y-1.5">
                            <span className="font-semibold text-emerald-300 flex items-center gap-1">
                                <Globe className="h-3 w-3 text-emerald-400" />
                                2. End-User & Family Rule (Priority 2 / Lower)
                            </span>
                            <ul className="list-disc list-inside space-y-1 text-slate-300/90">
                                <li><strong>Action:</strong> <code className="text-emerald-300">Bypass</code></li>
                                <li><strong>Paths:</strong> Add all <strong>End-User & Public Paths</strong> listed above.</li>
                                <li><strong>Include:</strong> <code className="text-emerald-300">Everyone</code></li>
                                <li><strong>Result:</strong> Friends & family can freely stream, request media, and manage their account profile (<code className="text-emerald-300">/profile</code>) without seeing Cloudflare login barriers.</li>
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
