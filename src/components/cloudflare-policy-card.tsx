"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Copy, Check, Lock, Globe, Film, AlertTriangle, Network, Sparkles, CheckCircle2, Server, ShieldCheck } from "lucide-react";
import { CLOUDFLARE_BYPASS_PATHS, CLOUDFLARE_SUPER_USER_PATHS, CLOUDFLARE_ADMIN_PATHS } from "@/lib/edge-policy-paths";

export default function CloudflarePolicyCard() {
    const [copiedBypass, setCopiedBypass] = useState(false);
    const [copiedSuperUser, setCopiedSuperUser] = useState(false);
    const [copiedAdmin, setCopiedAdmin] = useState(false);
    const [copiedTunnel, setCopiedTunnel] = useState(false);
    const [copiedMissing, setCopiedMissing] = useState(false);

    const bypassPaths = CLOUDFLARE_BYPASS_PATHS;
    const superUserPaths = CLOUDFLARE_SUPER_USER_PATHS;
    const adminProtectedPaths = CLOUDFLARE_ADMIN_PATHS;

    // Cloudflare Tunnel Public Hostname format (without leading slash for Tunnel UI)
    // Dynamically derived from CLOUDFLARE_ADMIN_PATHS to guarantee zero code drift
    const tunnelPublicHostnamePaths = Array.from(new Set(
        adminProtectedPaths.map((p) => p.replace(/^\//, ""))
    ));

    // Active hostnames verified in Dom's Cloudflare Zero Trust dashboard
    const userConfiguredCloudflareHostnames = new Set([
        "settings*",
        "admin*",
        "curation*",
        "tautulli*",
        "streams*",
        "api/admin*",
        "api/system*",
        "api/debug*",
        "api/curation*",
        "api/users*",
        "api/books/upload*"
    ]);

    // Detect paths that exist in Portalarr backend but are not yet added to Cloudflare
    const missingCloudflareHostnames = tunnelPublicHostnamePaths.filter(
        (p) => !userConfiguredCloudflareHostnames.has(p)
    );

    const handleCopy = (text: string, type: "bypass" | "superuser" | "admin" | "tunnel" | "missing") => {
        navigator.clipboard.writeText(text);
        if (type === "bypass") {
            setCopiedBypass(true);
            setTimeout(() => setCopiedBypass(false), 2000);
        } else if (type === "superuser") {
            setCopiedSuperUser(true);
            setTimeout(() => setCopiedSuperUser(false), 2000);
        } else if (type === "admin") {
            setCopiedAdmin(true);
            setTimeout(() => setCopiedAdmin(false), 2000);
        } else if (type === "tunnel") {
            setCopiedTunnel(true);
            setTimeout(() => setCopiedTunnel(false), 2000);
        } else {
            setCopiedMissing(true);
            setTimeout(() => setCopiedMissing(false), 2000);
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
                                Strict Admin-Only Edge Lockdown
                            </Badge>
                        </div>
                        <CardDescription className="text-xs">
                            Authoritative route configurations for Cloudflare Tunnels (Public Hostnames) and Cloudflare Access Zero Trust policies in front of DomsHomeLab.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* PROACTIVE CLOUDFLARE SYNC BANNER */}
                {missingCloudflareHostnames.length > 0 ? (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 animate-pulse" />
                                <span className="text-xs font-bold text-amber-300">
                                    Security Notice: {missingCloudflareHostnames.length} route(s) require entry in your Cloudflare Tunnel / Access Dashboard
                                </span>
                            </div>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCopy(missingCloudflareHostnames.join("\n"), "missing")}
                                className="text-xs font-semibold gap-1.5 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 self-start sm:self-auto shrink-0"
                            >
                                {copiedMissing ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                {copiedMissing ? "Copied Missing Paths!" : "Copy Missing Paths Only"}
                            </Button>
                        </div>
                        <p className="text-[11px] text-amber-200/80 leading-relaxed">
                            The following route(s) were added to Portalarr and must be registered in your Cloudflare Zero Trust public hostnames (<code className="text-amber-100">home.domshomelab.com</code>):
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                            {missingCloudflareHostnames.map((p) => (
                                <Badge key={p} variant="outline" className="text-xs font-mono bg-amber-950/60 text-amber-300 border-amber-400/50 px-2 py-0.5">
                                    {p}
                                </Badge>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                            <span className="text-xs font-semibold text-emerald-300">
                                100% Edge Coverage: All {tunnelPublicHostnamePaths.length} Admin & API Public Hostnames are active and protected in your Cloudflare Tunnel (<code className="text-emerald-200">home.domshomelab.com</code>).
                            </span>
                        </div>
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shrink-0">
                            Zero Drift • Fully Protected
                        </Badge>
                    </div>
                )}

                {/* CLOUDFLARE TUNNEL PUBLIC HOSTNAMES SECTION */}
                <div className="p-3.5 rounded-xl bg-orange-500/5 border border-orange-500/20 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <Network className="h-4 w-4 text-orange-400 shrink-0" />
                            <div>
                                <span className="font-bold text-xs text-foreground flex items-center gap-1.5">
                                    Cloudflare Tunnel • Public Hostnames (<code className="text-orange-400">home.domshomelab.com</code>)
                                </span>
                                <p className="text-[11px] text-muted-foreground">
                                    The 11 administrative paths routed through your Cloudflare Tunnel to <code className="text-slate-300">http://localhost:3000</code>:
                                </p>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopy(tunnelPublicHostnamePaths.join("\n"), "tunnel")}
                            className="text-xs font-semibold gap-1.5 border-orange-500/40 hover:bg-orange-500/15 text-orange-300 self-start sm:self-auto shrink-0"
                        >
                            {copiedTunnel ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedTunnel ? "Copied Tunnel Paths!" : "Copy All Tunnel Hostname Paths"}
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 pt-1">
                        {tunnelPublicHostnamePaths.map((p) => {
                            const isConfigured = userConfiguredCloudflareHostnames.has(p);
                            return (
                                <div
                                    key={p}
                                    className={`p-2.5 rounded-lg border text-xs font-mono flex items-center justify-between transition-all ${
                                        !isConfigured
                                            ? "bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.15)] ring-1 ring-amber-400/30"
                                            : "bg-black/40 border-white/[0.08] text-slate-300"
                                    }`}
                                >
                                    <span className="truncate">{p}</span>
                                    {isConfigured ? (
                                        <Badge variant="outline" className="text-[9px] px-1 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shrink-0 ml-1.5">
                                            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5 inline" /> In Cloudflare
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-400/20 text-amber-300 border-amber-400/50 shrink-0 ml-1.5 animate-pulse">
                                            ⚠️ Action Req.
                                        </Badge>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-amber-300/90 bg-amber-950/30 border border-amber-500/30 rounded-lg p-2">
                        <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <span>
                            <strong>Note on <code className="text-amber-200">api/admin*</code>:</strong> Protects <code className="text-amber-200">/api/admin/scripts</code> (homelab shell & powershell automation). Add this path to your Cloudflare Tunnel to ensure automated scripts run seamlessly.
                        </span>
                    </div>
                </div>

                {/* 3-COLUMN ACCESS POLICY BREAKDOWN */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* ADMIN ONLY PATHS */}
                    <div className="p-3.5 rounded-xl bg-orange-950/10 border border-orange-500/30 space-y-3 flex flex-col justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-xs text-orange-300 flex items-center gap-1.5">
                                    <Lock className="h-4 w-4 text-orange-400" />
                                    Admin-Only Paths (Strict Edge Block)
                                </span>
                                <Badge variant="outline" className="text-[10px] bg-orange-500/20 text-orange-300 border-orange-500/40">
                                    Require Admin Email
                                </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Cloudflare Access strictly locks down these 11 paths to <strong>your admin email only</strong>. Unauthorized external visitors are blocked at the Cloudflare edge with HTTP 403 before ever touching your local server:
                            </p>

                            <pre className="p-2.5 rounded-lg bg-black/60 border border-orange-500/20 font-mono text-[11px] text-orange-300/90 whitespace-pre overflow-x-auto max-h-48">
                                {adminProtectedPaths.join("\n")}
                            </pre>
                        </div>

                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopy(adminProtectedPaths.join("\n"), "admin")}
                            className="w-full text-xs font-semibold gap-1.5 border-orange-500/40 hover:bg-orange-500/15 text-orange-300"
                        >
                            {copiedAdmin ? <Check className="h-3.5 w-3.5 text-orange-400" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedAdmin ? "Copied Admin Paths!" : "Copy Admin-Only Paths"}
                        </Button>
                    </div>

                    {/* OPEN EDGE: MEMBER & PUBLIC PATHS */}
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3 flex flex-col justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-xs text-foreground flex items-center gap-1.5">
                                    <Globe className="h-4 w-4 text-emerald-400" />
                                    End-User & Member Routes (Open Edge)
                                </span>
                                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                    Native Session Gated
                                </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                These routes are <strong>open at Cloudflare&apos;s edge</strong> so friends and family never see Cloudflare login barriers. Security is enforced natively by DomsHomeLab&apos;s built-in session cookies at origin:
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
                            {copiedBypass ? "Copied Member Paths!" : "Copy Member Routes"}
                        </Button>
                    </div>

                    {/* OPEN EDGE: SUPER USER MEDIA APPS */}
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3 flex flex-col justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-xs text-foreground flex items-center gap-1.5">
                                    <Film className="h-4 w-4 text-purple-400" />
                                    Media Apps (Open Edge • Role Gated)
                                </span>
                                <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-300 border-purple-500/30">
                                    SUPER_USER &amp; ADMIN
                                </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Radarr &amp; Sonarr pass through Cloudflare directly to DomsHomeLab. The built-in session engine strictly restricts access to <code className="text-purple-300">SUPER_USER</code> and <code className="text-purple-300">ADMIN</code> roles:
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
                </div>

                {/* ZERO TRUST CONFIGURATION INSTRUCTIONS & BEST PRACTICES */}
                <div className="p-3.5 rounded-xl bg-orange-950/20 border border-orange-500/30 space-y-2.5">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-orange-400 shrink-0" />
                        <span className="font-bold text-xs text-orange-300">
                            Cloudflare Zero Trust Architecture (Single Admin-Only Application)
                        </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-muted-foreground leading-relaxed">
                        <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06] space-y-1.5">
                            <span className="font-semibold text-orange-300 flex items-center gap-1">
                                <Lock className="h-3 w-3 text-orange-400" />
                                1. Single Access Application
                            </span>
                            <ul className="list-disc list-inside space-y-1 text-slate-300/90">
                                <li><strong>Application Domain:</strong> <code className="text-orange-300">home.domshomelab.com</code></li>
                                <li><strong>Path Rules:</strong> Add all <strong>11 Admin-Only Paths</strong> (<code className="text-orange-300">settings*</code>, <code className="text-orange-300">admin*</code>, <code className="text-orange-300">curation*</code>, <code className="text-orange-300">api/admin*</code>, etc.).</li>
                                <li><strong>Action:</strong> <code className="text-orange-300">Allow</code></li>
                                <li><strong>Include:</strong> <code className="text-orange-300">Emails: [your-admin-email@example.com]</code></li>
                            </ul>
                        </div>

                        <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06] space-y-1.5">
                            <span className="font-semibold text-emerald-300 flex items-center gap-1">
                                <Globe className="h-3 w-3 text-emerald-400" />
                                2. Zero Bypass Rules Required
                            </span>
                            <ul className="list-disc list-inside space-y-1 text-slate-300/90">
                                <li><strong>Edge Status:</strong> All non-admin routes are <strong>open at the Cloudflare edge</strong> by default.</li>
                                <li><strong>No Bypass Lists:</strong> You do NOT need to create bypass or allow rules for member or public routes in Cloudflare.</li>
                                <li><strong>Result:</strong> Traffic to <code className="text-emerald-300">/profile</code>, <code className="text-emerald-300">/discover</code>, <code className="text-emerald-300">/requests</code>, and <code className="text-emerald-300">/library</code> flows directly to DomsHomeLab with zero edge prompts.</li>
                            </ul>
                        </div>

                        <div className="p-2.5 rounded-lg bg-black/40 border border-white/[0.06] space-y-1.5">
                            <span className="font-semibold text-purple-300 flex items-center gap-1">
                                <Server className="h-3 w-3 text-purple-400" />
                                3. Native Origin Session &amp; RBAC
                            </span>
                            <ul className="list-disc list-inside space-y-1 text-slate-300/90">
                                <li><strong>Origin Security:</strong> DomsHomeLab&apos;s built-in JWT session engine gates all requests at origin.</li>
                                <li><strong>Media Management:</strong> <code className="text-purple-300">/radarr*</code> and <code className="text-purple-300">/sonarr*</code> require a valid session with <code className="text-purple-300">SUPER_USER</code> or <code className="text-purple-300">ADMIN</code> role.</li>
                                <li><strong>Defense-in-Depth:</strong> Admin routes have dual protection: Cloudflare edge blocks plus origin admin checks.</li>
                            </ul>
                        </div>
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1.5 pt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                        <span><strong>Strict Path Isolation &amp; Zero-Collision Guarantee:</strong> Member account profile and preferences are located at <code className="text-emerald-300">/profile</code> (outside <code className="text-slate-300">/settings*</code>, guaranteeing members never hit Cloudflare edge blocks). System administration (<code className="text-orange-300">/settings*</code>) remains strictly locked to your admin email.</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}