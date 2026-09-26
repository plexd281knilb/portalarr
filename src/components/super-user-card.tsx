"use client";

import { useState } from "react";
import { toggleSelfSuperUserAction } from "@/app/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Zap, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import Link from "next/link";

interface SuperUserCardProps {
    initialRole?: string;
}

export default function SuperUserCard({ initialRole = "USER" }: SuperUserCardProps) {
    const [role, setRole] = useState(initialRole);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState("");
    const [err, setErr] = useState("");

    const isSuper = role === "SUPER_USER" || role === "ADMIN";

    const handleToggle = async () => {
        setLoading(true);
        setMsg("");
        setErr("");
        try {
            const res = await toggleSelfSuperUserAction();
            if (res.success && res.role) {
                setRole(res.role);
                setMsg(res.message || "Super User mode updated!");
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                setErr(res.error || "Failed to update role");
            }
        } catch (e: any) {
            setErr(e.message || "Error toggling Super User");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="border-cyan-500/30 bg-gradient-to-br from-cyan-950/20 via-[#121218]/90 to-[#0d0d12] backdrop-blur-md shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
            <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                            <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-foreground">
                                <Zap className="h-5 w-5 text-cyan-400" />
                                {isSuper ? "Super User Mode Active" : "Want to Help Out? Become a Super User"}
                            </CardTitle>
                            <Badge 
                                variant="outline" 
                                className={`text-[10px] font-semibold ${
                                    isSuper 
                                        ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/40" 
                                        : "bg-white/[0.05] text-muted-foreground border-border/40"
                                }`}
                            >
                                {isSuper ? "Super User" : "Standard User"}
                            </Badge>
                        </div>
                        <CardDescription className="text-xs">
                            Super users get direct access to Radarr and Sonarr to fix missing episodes, adjust search indexers, and help manage downloads.
                        </CardDescription>
                    </div>

                    <Button
                        onClick={handleToggle}
                        disabled={loading}
                        className={`text-xs font-bold h-9 px-4 shrink-0 transition-all rounded-xl cursor-pointer ${
                            isSuper 
                                ? "bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40" 
                                : "bg-cyan-500 hover:bg-cyan-600 text-black shadow-md hover:ring-2 hover:ring-cyan-400/50"
                        }`}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Updating...
                            </>
                        ) : isSuper ? (
                            "Switch to Standard User View"
                        ) : (
                            <>
                                <Zap className="h-3.5 w-3.5 mr-1.5" /> Enable Super User Access
                            </>
                        )}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="pt-0">
                {msg && (
                    <div className="mb-2 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                        <span>{msg}</span>
                    </div>
                )}
                {err && (
                    <div className="mb-2 p-2.5 rounded-lg bg-red-950/40 border border-red-500/40 text-red-300 text-xs">
                        {err}
                    </div>
                )}
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/30">
                    <span>You can toggle this option anytime here or on your <Link href="/settings/profile" className="text-cyan-400 hover:underline">Settings &gt; Profile</Link> page.</span>
                    {isSuper && (
                        <div className="flex items-center gap-2">
                            <Link href="/radarr" className="text-cyan-400 hover:underline flex items-center gap-0.5">
                                Radarr <ArrowRight className="h-3 w-3" />
                            </Link>
                            <span>•</span>
                            <Link href="/sonarr" className="text-cyan-400 hover:underline flex items-center gap-0.5">
                                Sonarr <ArrowRight className="h-3 w-3" />
                            </Link>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
