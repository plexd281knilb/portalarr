"use client";

import Link from "next/link";
import { 
    User, KeyRound, BookOpen, Tv, LifeBuoy, Terminal, 
    Settings, Sparkles, Film, ArrowRight, ShieldCheck, MailCheck
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface DashboardQuickActionsProps {
    isLoggedIn: boolean;
    isAdmin: boolean;
    isSuperUser?: boolean;
    hasLibraryAccess: boolean;
    username?: string;
}

export default function DashboardQuickActions({
    isLoggedIn,
    isAdmin,
    isSuperUser = false,
    hasLibraryAccess,
    username
}: DashboardQuickActionsProps) {
    if (!isLoggedIn) {
        return (
            <Card className="w-full border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm">
                <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="space-y-1 text-center sm:text-left">
                        <h3 className="text-base font-bold text-foreground flex items-center justify-center sm:justify-start gap-2">
                            <ShieldCheck className="h-4 w-4 text-primary" /> Sign In to Access Your Portal
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            Log in with your Plex or Portalarr credentials to monitor streams, access books, manage your password, and invite friends.
                        </p>
                    </div>
                    <Button asChild size="lg" className="font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 shadow-md">
                        <Link href="/login">Sign In</Link>
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="w-full space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-primary" /> Quick Navigation & Account Hub
                    </span>
                    {username && (
                        <Badge variant="outline" className="text-[10px] font-semibold bg-primary/10 text-primary border-primary/30 py-0.5">
                            {username}
                        </Badge>
                    )}
                </div>

                {/* Direct quick action chips */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Link href="/settings/profile#password">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 px-2.5 text-[11px] font-medium bg-white/[0.03] hover:bg-blue-500/10 hover:text-blue-300 border-border/60 hover:border-blue-500/40 gap-1.5 transition-all rounded-lg"
                        >
                            <KeyRound className="h-3 w-3 text-blue-400" />
                            <span>Change Password</span>
                        </Button>
                    </Link>
                    <Link href="/settings/profile#kindle">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 px-2.5 text-[11px] font-medium bg-white/[0.03] hover:bg-amber-500/10 hover:text-amber-300 border-border/60 hover:border-amber-500/40 gap-1.5 transition-all rounded-lg"
                        >
                            <MailCheck className="h-3 w-3 text-amber-400" />
                            <span>Kindle Settings</span>
                        </Button>
                    </Link>
                    {isAdmin && (
                        <Link href="/settings">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-7 px-2.5 text-[11px] font-medium bg-white/[0.03] hover:bg-primary/10 hover:text-primary border-border/60 hover:border-primary/40 gap-1.5 transition-all rounded-lg"
                            >
                                <Settings className="h-3 w-3 text-primary" />
                                <span>System Settings</span>
                            </Button>
                        </Link>
                    )}
                </div>
            </div>

            {/* Quick Action Navigation Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Account & Change Password */}
                <Link href="/settings/profile" className="block group">
                    <Card className="h-full border-blue-500/20 bg-gradient-to-br from-[#121218] via-[#101017] to-blue-950/20 backdrop-blur-md shadow-sm hover:border-blue-500/50 hover:shadow-md transition-all duration-200">
                        <CardContent className="p-4 flex items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 group-hover:scale-105 transition-transform">
                                        <User className="h-4 w-4" />
                                    </div>
                                    <h3 className="font-bold text-sm text-foreground group-hover:text-blue-400 transition-colors truncate">
                                        Account & Password
                                    </h3>
                                </div>
                                <p className="text-[11px] text-muted-foreground line-clamp-2">
                                    Change password, Send-to-Kindle email, and manage account preferences.
                                </p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                        </CardContent>
                    </Card>
                </Link>

                {/* 2. Book Library */}
                <Link href="/library" className="block group">
                    <Card className="h-full border-emerald-500/20 bg-gradient-to-br from-[#121218] via-[#101017] to-emerald-950/20 backdrop-blur-md shadow-sm hover:border-emerald-500/50 hover:shadow-md transition-all duration-200">
                        <CardContent className="p-4 flex items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 group-hover:scale-105 transition-transform">
                                        <BookOpen className="h-4 w-4" />
                                    </div>
                                    <h3 className="font-bold text-sm text-foreground group-hover:text-emerald-400 transition-colors truncate">
                                        Book Library
                                    </h3>
                                </div>
                                <p className="text-[11px] text-muted-foreground line-clamp-2">
                                    Browse Ebooks & Audiobooks with web reader, audio player & Kindle sync.
                                </p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                        </CardContent>
                    </Card>
                </Link>

                {/* 3. My Plex Hub */}
                <a href="#my-plex-hub" className="block group">
                    <Card className="h-full border-amber-500/20 bg-gradient-to-br from-[#121218] via-[#101017] to-amber-950/20 backdrop-blur-md shadow-sm hover:border-amber-500/50 hover:shadow-md transition-all duration-200">
                        <CardContent className="p-4 flex items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 group-hover:scale-105 transition-transform">
                                        <Tv className="h-4 w-4" />
                                    </div>
                                    <h3 className="font-bold text-sm text-foreground group-hover:text-amber-400 transition-colors truncate">
                                        My Plex Hub
                                    </h3>
                                </div>
                                <p className="text-[11px] text-muted-foreground line-clamp-2">
                                    Live stream telemetry, transcode health diagnostics & device setup guides.
                                </p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                        </CardContent>
                    </Card>
                </a>

                {/* 4. Support Tickets or Admin Settings */}
                {isAdmin ? (
                    <Link href="/settings" className="block group">
                        <Card className="h-full border-primary/20 bg-gradient-to-br from-[#121218] via-[#101017] to-primary/10 backdrop-blur-md shadow-sm hover:border-primary/50 hover:shadow-md transition-all duration-200">
                            <CardContent className="p-4 flex items-start justify-between gap-3">
                                <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 rounded-lg bg-primary/20 text-primary border border-primary/30 group-hover:scale-105 transition-transform">
                                            <Settings className="h-4 w-4" />
                                        </div>
                                        <h3 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors truncate">
                                            System Settings
                                        </h3>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground line-clamp-2">
                                        Server config, user access control, integrations & system logs.
                                    </p>
                                </div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                            </CardContent>
                        </Card>
                    </Link>
                ) : (
                    <Link href="/admin/tickets" className="block group">
                        <Card className="h-full border-cyan-500/20 bg-gradient-to-br from-[#121218] via-[#101017] to-cyan-950/20 backdrop-blur-md shadow-sm hover:border-cyan-500/50 hover:shadow-md transition-all duration-200">
                            <CardContent className="p-4 flex items-start justify-between gap-3">
                                <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 group-hover:scale-105 transition-transform">
                                            <LifeBuoy className="h-4 w-4" />
                                        </div>
                                        <h3 className="font-bold text-sm text-foreground group-hover:text-cyan-400 transition-colors truncate">
                                            Support Tickets
                                        </h3>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground line-clamp-2">
                                        Submit tickets, report playback issues & get administrator support.
                                    </p>
                                </div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                            </CardContent>
                        </Card>
                    </Link>
                )}
            </div>

            {/* Additional Admin Studios Row (When Admin) */}
            {isAdmin && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <Link href="/curation/kometa" className="block group">
                        <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/20 hover:border-purple-500/40 flex items-center justify-between gap-2 transition-all">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <Sparkles className="h-4 w-4 text-purple-400 shrink-0" />
                                <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-foreground group-hover:text-purple-300 transition-colors truncate">
                                        Kometa Overlays & Badges
                                    </h4>
                                    <p className="text-[10px] text-muted-foreground truncate">Custom 4K/HDR/Atmos overlays</p>
                                </div>
                            </div>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-purple-300 transition-colors shrink-0" />
                        </div>
                    </Link>

                    <Link href="/curation/agregarr" className="block group">
                        <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/20 hover:border-amber-500/40 flex items-center justify-between gap-2 transition-all">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <Film className="h-4 w-4 text-amber-400 shrink-0" />
                                <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-foreground group-hover:text-amber-300 transition-colors truncate">
                                        Agregarr Hubs & Releases
                                    </h4>
                                    <p className="text-[10px] text-muted-foreground truncate">Upcoming theatrical & digital countdowns</p>
                                </div>
                            </div>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-amber-300 transition-colors shrink-0" />
                        </div>
                    </Link>

                    <Link href="/admin/tickets" className="block group">
                        <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/20 hover:border-cyan-500/40 flex items-center justify-between gap-2 transition-all">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <LifeBuoy className="h-4 w-4 text-cyan-400 shrink-0" />
                                <div className="min-w-0">
                                    <h4 className="text-xs font-bold text-foreground group-hover:text-cyan-300 transition-colors truncate">
                                        User Support Tickets
                                    </h4>
                                    <p className="text-[10px] text-muted-foreground truncate">Review user inquiries & issue logs</p>
                                </div>
                            </div>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-cyan-300 transition-colors shrink-0" />
                        </div>
                    </Link>
                </div>
            )}
        </div>
    );
}
