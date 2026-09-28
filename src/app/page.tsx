import { 
    getPublicMediaApps, 
    getRoadmapText, 
    getAlertBanner, 
    checkUserLibraryAccess,
    getUserReferralInfo,
    getPublicJoinConfig
} from "@/app/actions";
import { getCurrentUser } from "@/app/auth-actions";
import { getUserRequestQuotaAction } from "@/app/seerr-actions";
import { calculateProratedBilling } from "@/lib/prorated-billing";
import { prisma } from "@/lib/prisma";
import ReactMarkdown from "react-markdown";
import remarkGfm from 'remark-gfm'; 
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw'; 

import { AiServerAssistant } from "@/components/ai-server-assistant";
import SystemStatus from "@/components/system-status"; 
import SimpleSystemHealth from "@/components/simple-system-health";
import ActiveDownloads from "@/components/active-downloads"; 
import RequestLibraryAccess from "@/components/request-library-access";
import FeatureVotingPoll from "@/components/feature-voting-poll";
import MyPlexHub from "@/components/my-plex-hub";
import PlexInviteBanner from "@/components/plex-invite-banner";
import WhatsNewModal from "@/components/whats-new-modal";
import AdminUserSwitcher from "@/components/admin-user-switcher";
import AdminDetailedStreams from "@/components/admin-detailed-streams";
import TrialDashboardView from "@/components/trial-dashboard-view";
import SuperUserCard from "@/components/super-user-card";
import SupportTicketModal from "@/components/support-ticket-modal";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { redirect } from "next/navigation";
import { 
    ExternalLink, AlertTriangle, BookOpen, Sparkles, Compass, 
    Tv, Film, Zap, ArrowRight, Shield, Download, LifeBuoy, Settings, Wrench
} from "lucide-react"; 

export const dynamic = "force-dynamic";

function makeAbsoluteUrl(url: string | null | undefined) {
    if (!url) return "#";
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return `https://${url}`;
}

export default async function UserLandingPage() {
    const user = await getCurrentUser().catch(() => null);
    if (user && (user.status === "EXPIRED" || user.status === "PENDING" || user.status === "REJECTED" || user.status === "SUSPENDED")) {
        redirect("/pending");
    }
    const isLoggedIn = !!user;

    const isAdmin = user?.role === "ADMIN";
    const isSuperUser = user?.role === "SUPER_USER";
    const isTrial = user?.status === "TRIAL" || user?.membershipTier === "TRIAL";
    const isFullUser = isLoggedIn && !isAdmin && !isSuperUser && !isTrial;

    // Fetch dynamic content safely
    const [apps, roadmapText, alertBanner, hasAccess, referralInfo, joinConfig, globalSettings] = await Promise.all([
        getPublicMediaApps().catch(() => []),
        getRoadmapText().catch(() => ""),
        getAlertBanner().catch(() => ({ enabled: false, text: "" })),
        isLoggedIn ? checkUserLibraryAccess().catch(() => false) : Promise.resolve(false),
        isLoggedIn ? getUserReferralInfo().catch(() => null) : Promise.resolve(null),
        getPublicJoinConfig().catch(() => null),
        prisma.settings.findFirst({ where: { id: "global" } }).catch(() => null)
    ]);

    // Request quota for trial / user accounts
    let quota: any = { movies: { remaining: 3, limit: 3, used: 0 }, tv: { remaining: 3, limit: 3, used: 0 } };
    if (isLoggedIn) {
        try {
            const qRes = await getUserRequestQuotaAction();
            if (qRes && qRes.success && qRes.data) {
                quota = qRes.data;
            }
        } catch {}
    }

    // Prorated billing calculation for trial view
    const billing = calculateProratedBilling({
        startDate: (user as any)?.createdAt || new Date(),
        trialDays: globalSettings?.defaultTrialDays || 14,
        yearlyPrice: globalSettings?.yearlyPrice ?? 180,
        monthlyPrice: globalSettings?.monthlyPrice ?? 15,
        renewalMonth: globalSettings?.renewalMonth || 1,
        renewalDay: globalSettings?.renewalDay || 1
    });

    const requestApps = apps.filter(app => 
        app.type === "Requests" || 
        ["overseerr", "ombi", "jellyseerr"].includes(app.type?.toLowerCase())
    );
    const isOmbiApp = (a: any) => 
        (a.name || "").toLowerCase().includes("ombi") || 
        (a.type || "").toLowerCase().includes("ombi");
    const ombiApps = requestApps.filter(isOmbiApp);
    const otherRequestApps = requestApps.filter(a => !isOmbiApp(a));

    return (
        <div className="min-h-screen bg-background flex flex-col">
            
            {/* --- ALERT BANNER --- */}
            {alertBanner.enabled && alertBanner.text && (
                <div className="w-full bg-orange-500/15 border-b border-orange-500/40 text-orange-600 dark:text-orange-400 px-4 py-3 text-center text-sm font-medium flex items-center justify-center gap-2 backdrop-blur-md shadow-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-orange-500 animate-pulse" />
                    <div className="[&>p]:inline">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeRaw]}>
                            {alertBanner.text}
                        </ReactMarkdown>
                    </div>
                </div>
            )}

            <main className="flex-1 p-2.5 sm:p-5 lg:p-8 max-w-7xl 2xl:max-w-[1600px] 3xl:max-w-[2200px] 4xl:max-w-[2560px] mx-auto w-full space-y-5 sm:space-y-6 lg:space-y-8 animate-in fade-in duration-500 min-w-0">
                
                {/* --- DASHBOARD HEADER --- */}
                <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2 border-b border-border/40">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent">
                                System Dashboard
                            </h1>
                            {isTrial ? (
                                <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-xs font-semibold">
                                    Free Trial
                                </Badge>
                            ) : isSuperUser ? (
                                <Badge variant="outline" className="bg-cyan-500/15 text-cyan-300 border-cyan-500/30 text-xs font-semibold">
                                    Super User
                                </Badge>
                            ) : isAdmin ? (
                                <Badge variant="outline" className="bg-purple-500/15 text-purple-300 border-purple-500/30 text-xs font-semibold">
                                    Admin Mission Control
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-xs font-semibold">
                                    Full Member
                                </Badge>
                            )}
                        </div>
                        <p className="text-muted-foreground text-xs sm:text-sm">
                            {isTrial 
                                ? "Your curated media server dashboard, content requests, and playback diagnostics."
                                : isSuperUser
                                ? "Tech-savvy management dashboard with direct Radarr & Sonarr controls."
                                : isAdmin
                                ? "Administrative monitoring, live stream diagnostics, and server performance."
                                : "Real-time status, media requests, book library access, and community voting."}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <WhatsNewModal 
                            roadmapText={roadmapText} 
                            userRole={isAdmin ? "ADMIN" : isSuperUser ? "SUPER_USER" : isTrial ? "TRIAL" : "USER"} 
                            triggerButton={true} 
                        />
                    </div>
                </section>

                {/* ========================================================================= */}
                {/* 1. ADMIN USER SWITCHER DROPDOWN (ONLY VISIBLE TO ADMINS) */}
                {/* ========================================================================= */}
                {isAdmin && (
                    <div className="w-full">
                        <AdminUserSwitcher />
                    </div>
                )}

                {/* ========================================================================= */}
                {/* ACCOUNT VIEW 1: TRIAL ACCOUNT (MINIMAL, NO INVITES, NO SYSTEM STATUS, NO VOTING) */}
                {/* ========================================================================= */}
                {isTrial ? (
                    <TrialDashboardView 
                        user={user} 
                        quota={quota} 
                        billing={billing} 
                    />
                ) : null}

                {/* ========================================================================= */}
                {/* ACCOUNT VIEW 2: FULL USER (BEGINNER / NON-SUPER USER) */}
                {/* ========================================================================= */}
                {isFullUser ? (
                    <div className="space-y-6">
                        {/* 1. INVITE LINK BANNER AT THE TOP (GUIDE COLLAPSED BY DEFAULT) */}
                        <PlexInviteBanner 
                            referralCode={referralInfo?.referralCode || user?.username}
                            trialDays={joinConfig?.config?.defaultTrialDays || 14}
                            username={user?.username}
                            totalReferrals={referralInfo?.totalReferrals || 0}
                            activeTrials={referralInfo?.activeTrials || 0}
                            conversions={referralInfo?.conversions || 0}
                            appUrl={referralInfo?.appUrl || joinConfig?.config?.appUrl}
                        />

                        {/* 2. MEDIA REQUESTS SECTION (BUILT-IN IS MAIN, SEERR, OMBI AT BOTTOM WITH NOTE) */}
                        <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-foreground">
                                    <Compass className="h-5 w-5 text-primary" /> Media Requests
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Browse trending releases, watch high-definition trailers, and request movies & TV shows.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3.5">
                                {/* MAIN OPTION: BUILT-IN REQUESTS */}
                                <Button asChild size="lg" className="w-full text-sm sm:text-base font-bold h-12 shadow-md bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center gap-2 rounded-xl transition-all active:scale-98">
                                    <Link href="/discover" className="flex items-center justify-center gap-2">
                                        <Compass className="h-5 w-5" />
                                        Launch Built-In Media Requests
                                    </Link>
                                </Button>

                                {/* SECONDARY REQUEST APPS (SEERR / OVERSEERR) */}
                                {otherRequestApps.length > 0 && (
                                    <div className="pt-2 border-t border-border/30 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {otherRequestApps.map(app => {
                                            const safeUrl = makeAbsoluteUrl(app.externalUrl);
                                            return (
                                                <a 
                                                    key={app.id} 
                                                    href={safeUrl} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="block w-full"
                                                >
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        className="w-full text-xs h-9 justify-between font-semibold border-border/60 hover:bg-white/[0.04]"
                                                    >
                                                        <span>{app.name}</span>
                                                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                                    </Button>
                                                </a>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* OMBI AT BOTTOM WITH NOTE THAT SUPPORT IS ENDING SOON */}
                                {ombiApps.length > 0 && (
                                    <div className="space-y-2 pt-1">
                                        {ombiApps.map((ombiApp) => (
                                            <div key={ombiApp.id} className="p-2.5 rounded-xl bg-white/[0.02] border border-amber-500/20 flex items-center justify-between gap-3 text-xs">
                                                <div className="space-y-0.5 min-w-0">
                                                    <div className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                                                        <span>{ombiApp.name || "Ombi Requests"}</span>
                                                        <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/30">
                                                             Support Ending Soon
                                                        </Badge>
                                                    </div>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        Legacy request engine. Please use the built-in request tool above for immediate auto-approval.
                                                    </p>
                                                </div>
                                                <Button asChild size="sm" variant="ghost" className="h-8 text-xs shrink-0 text-muted-foreground hover:text-foreground">
                                                    <a href={makeAbsoluteUrl(ombiApp.externalUrl)} target="_blank" rel="noopener noreferrer">
                                                        Open <ExternalLink className="ml-1 h-3 w-3" />
                                                    </a>
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* 3. OVERALL SYSTEM HEALTH INDICATOR */}
                        <SimpleSystemHealth />

                        {/* 4. AI SERVER ASSISTANT WITH SMALL SUPPORT TICKET BUTTON */}
                        <div className="space-y-2">
                            <AiServerAssistant />
                            <div className="flex justify-end pt-1">
                                <SupportTicketModal />
                            </div>
                        </div>

                        {/* 5. PROMINENT SUPER USER PROMOTION CARD */}
                        <SuperUserCard initialRole="USER" />

                        {/* 6. PROMINENT BOOK LIBRARY ACCESS CARD */}
                        <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 via-[#121218]/90 to-[#0d0d12] backdrop-blur-md shadow-md relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
                            <CardHeader className="pb-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="space-y-0.5">
                                        <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-foreground">
                                            <BookOpen className="h-5 w-5 text-emerald-400" />
                                            Book & Audiobook Library
                                        </CardTitle>
                                        <CardDescription className="text-xs">
                                            Read ebooks, stream audiobooks with built-in chapters, and deliver directly to your Amazon Kindle.
                                        </CardDescription>
                                    </div>
                                    <Badge variant="outline" className={`text-[10px] font-semibold w-fit ${hasAccess ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-amber-500/10 text-amber-400 border-amber-500/30"}`}>
                                        {hasAccess ? "Access Unlocked" : "Setup Required"}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {hasAccess ? (
                                    <Button asChild size="lg" className="w-full text-sm font-bold h-11 bg-emerald-500 hover:bg-emerald-600 text-black shadow-md rounded-xl">
                                        <Link href="/library" className="flex items-center justify-center gap-2">
                                            <BookOpen className="h-4 w-4" /> Open Book & Audiobook Library
                                        </Link>
                                    </Button>
                                ) : (
                                    <RequestLibraryAccess />
                                )}
                                <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/30 flex items-center justify-between">
                                    <span>Supports Send-to-Kindle delivery or direct browser downloads/reading.</span>
                                    <Link href="/settings/profile#kindle" className="text-emerald-400 hover:underline">
                                        Configure in Settings &gt;
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>

                        {/* 7. MY PLEX HUB (ACTIVE STREAMS COLLAPSED BY DEFAULT) */}
                        <div id="my-plex-hub" className="w-full scroll-mt-6">
                            <MyPlexHub />
                        </div>

                        {/* 8. FEATURE VOTING POLL SECTION */}
                        <div id="voting" className="w-full scroll-mt-6">
                            <FeatureVotingPoll isAdmin={false} />
                        </div>
                    </div>
                ) : null}

                {/* ========================================================================= */}
                {/* ACCOUNT VIEW 3: SUPER USER (TECH-SAVVY, BIG RADARR/SONARR BUTTONS, NO TICKETS) */}
                {/* ========================================================================= */}
                {isSuperUser && !isAdmin ? (
                    <div className="space-y-6">
                        {/* BIG QUICK ACCESS ACTION MATRIX */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                            {/* RADARR QUICK FIX BUTTON */}
                            <Link href="/radarr" className="block group">
                                <Card className="p-4 bg-gradient-to-br from-amber-500/10 via-[#121218] to-[#0f0f14] border-amber-500/30 group-hover:border-amber-500/60 transition-all shadow-md group-active:scale-98">
                                    <div className="flex items-center justify-between">
                                        <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
                                            <Film className="h-6 w-6" />
                                        </div>
                                        <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-500/30">
                                            Movies
                                        </Badge>
                                    </div>
                                    <div className="pt-3">
                                        <h3 className="text-base font-bold text-foreground group-hover:text-amber-300 transition-colors flex items-center gap-1.5">
                                            Open Radarr <ArrowRight className="h-4 w-4 opacity-70 group-hover:translate-x-1 transition-transform" />
                                        </h3>
                                        <p className="text-xs text-muted-foreground pt-0.5">
                                            Fix missing movie files, re-trigger indexer grabs & check quality.
                                        </p>
                                    </div>
                                </Card>
                            </Link>

                            {/* SONARR QUICK FIX BUTTON */}
                            <Link href="/sonarr" className="block group">
                                <Card className="p-4 bg-gradient-to-br from-sky-500/10 via-[#121218] to-[#0f0f14] border-sky-500/30 group-hover:border-sky-500/60 transition-all shadow-md group-active:scale-98">
                                    <div className="flex items-center justify-between">
                                        <div className="p-2 rounded-xl bg-sky-500/15 text-sky-400">
                                            <Tv className="h-6 w-6" />
                                        </div>
                                        <Badge variant="outline" className="text-[10px] text-sky-300 border-sky-500/30">
                                            TV Shows
                                        </Badge>
                                    </div>
                                    <div className="pt-3">
                                        <h3 className="text-base font-bold text-foreground group-hover:text-sky-300 transition-colors flex items-center gap-1.5">
                                            Open Sonarr <ArrowRight className="h-4 w-4 opacity-70 group-hover:translate-x-1 transition-transform" />
                                        </h3>
                                        <p className="text-xs text-muted-foreground pt-0.5">
                                            Manage missing episodes, season packs & series monitored states.
                                        </p>
                                    </div>
                                </Card>
                            </Link>

                            {/* BOOK LIBRARY */}
                            <Link href="/library" className="block group">
                                <Card className="p-4 bg-gradient-to-br from-emerald-500/10 via-[#121218] to-[#0f0f14] border-emerald-500/30 group-hover:border-emerald-500/60 transition-all shadow-md group-active:scale-98">
                                    <div className="flex items-center justify-between">
                                        <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400">
                                            <BookOpen className="h-6 w-6" />
                                        </div>
                                        <Badge variant="outline" className="text-[10px] text-emerald-300 border-emerald-500/30">
                                            Books & Audio
                                        </Badge>
                                    </div>
                                    <div className="pt-3">
                                        <h3 className="text-base font-bold text-foreground group-hover:text-emerald-300 transition-colors flex items-center gap-1.5">
                                            Book Library <ArrowRight className="h-4 w-4 opacity-70 group-hover:translate-x-1 transition-transform" />
                                        </h3>
                                        <p className="text-xs text-muted-foreground pt-0.5">
                                            Browse audiobooks, ebooks, and manage downloads.
                                        </p>
                                    </div>
                                </Card>
                            </Link>

                            {/* MEDIA REQUESTS */}
                            <Link href="/discover" className="block group">
                                <Card className="p-4 bg-gradient-to-br from-primary/10 via-[#121218] to-[#0f0f14] border-primary/30 group-hover:border-primary/60 transition-all shadow-md group-active:scale-98">
                                    <div className="flex items-center justify-between">
                                        <div className="p-2 rounded-xl bg-primary/15 text-primary">
                                            <Compass className="h-6 w-6" />
                                        </div>
                                        <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                                            Requests
                                        </Badge>
                                    </div>
                                    <div className="pt-3">
                                        <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                                            Media Requests <ArrowRight className="h-4 w-4 opacity-70 group-hover:translate-x-1 transition-transform" />
                                        </h3>
                                        <p className="text-xs text-muted-foreground pt-0.5">
                                            Browse trending movies, trailers, and submit requests.
                                        </p>
                                    </div>
                                </Card>
                            </Link>
                        </div>

                        {/* HARDWARE & SYSTEM STATUS */}
                        <div className="w-full">
                            <SystemStatus />
                        </div>

                        {/* ACTIVE DOWNLOADS */}
                        <div id="downloads" className="w-full scroll-mt-6">
                            <ActiveDownloads />
                        </div>

                        {/* MY PLEX HUB */}
                        <div id="my-plex-hub" className="w-full scroll-mt-6">
                            <MyPlexHub />
                        </div>

                        {/* FEATURE VOTING POLL */}
                        <div id="voting" className="w-full scroll-mt-6">
                            <FeatureVotingPoll isAdmin={false} />
                        </div>
                    </div>
                ) : null}

                {/* ========================================================================= */}
                {/* ACCOUNT VIEW 4: ADMIN MISSION CONTROL */}
                {/* ========================================================================= */}
                {isAdmin ? (
                    <div className="space-y-6">
                        {/* INTRICATE ADMIN SYSTEM STATUS & STREAM TELEMETRY TABLE */}
                        <AdminDetailedStreams />

                        {/* QUICK ACCESS ADMIN TOOL MATRIX */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            <Link href="/discover" className="block group">
                                <div className="p-3 rounded-xl bg-white/[0.02] border border-border/50 group-hover:border-primary/50 text-center space-y-1.5 transition-all">
                                    <Compass className="h-5 w-5 mx-auto text-primary" />
                                    <span className="text-xs font-bold block text-foreground">Requests</span>
                                </div>
                            </Link>

                            <Link href="/library" className="block group">
                                <div className="p-3 rounded-xl bg-white/[0.02] border border-border/50 group-hover:border-emerald-500/50 text-center space-y-1.5 transition-all">
                                    <BookOpen className="h-5 w-5 mx-auto text-emerald-400" />
                                    <span className="text-xs font-bold block text-foreground">Book Library</span>
                                </div>
                            </Link>

                            <Link href="/radarr" className="block group">
                                <div className="p-3 rounded-xl bg-white/[0.02] border border-border/50 group-hover:border-amber-500/50 text-center space-y-1.5 transition-all">
                                    <Film className="h-5 w-5 mx-auto text-amber-400" />
                                    <span className="text-xs font-bold block text-foreground">Radarr</span>
                                </div>
                            </Link>

                            <Link href="/sonarr" className="block group">
                                <div className="p-3 rounded-xl bg-white/[0.02] border border-border/50 group-hover:border-sky-500/50 text-center space-y-1.5 transition-all">
                                    <Tv className="h-5 w-5 mx-auto text-sky-400" />
                                    <span className="text-xs font-bold block text-foreground">Sonarr</span>
                                </div>
                            </Link>

                            <Link href="/admin/tickets" className="block group">
                                <div className="p-3 rounded-xl bg-white/[0.02] border border-border/50 group-hover:border-rose-500/50 text-center space-y-1.5 transition-all">
                                    <LifeBuoy className="h-5 w-5 mx-auto text-rose-400" />
                                    <span className="text-xs font-bold block text-foreground">Tickets</span>
                                </div>
                            </Link>

                            <Link href="/settings" className="block group">
                                <div className="p-3 rounded-xl bg-white/[0.02] border border-border/50 group-hover:border-purple-500/50 text-center space-y-1.5 transition-all">
                                    <Settings className="h-5 w-5 mx-auto text-purple-400" />
                                    <span className="text-xs font-bold block text-foreground">Settings</span>
                                </div>
                            </Link>
                        </div>

                        {/* ACTIVE DOWNLOADS */}
                        <div id="downloads" className="w-full scroll-mt-6">
                            <ActiveDownloads />
                        </div>

                        {/* MY PLEX HUB */}
                        <div id="my-plex-hub" className="w-full scroll-mt-6">
                            <MyPlexHub />
                        </div>

                        {/* FEATURE VOTING POLL */}
                        <div id="voting" className="w-full scroll-mt-6">
                            <FeatureVotingPoll isAdmin={true} />
                        </div>
                    </div>
                ) : null}

                {/* PUBLIC FALLBACK IF NOT LOGGED IN */}
                {!isLoggedIn && (
                    <div className="py-12 text-center space-y-4">
                        <p className="text-sm text-muted-foreground">Please sign in to access your media portal and dashboard.</p>
                        <Button asChild size="lg">
                            <Link href="/login">Sign In</Link>
                        </Button>
                    </div>
                )}
            </main>
        </div>
    );
}