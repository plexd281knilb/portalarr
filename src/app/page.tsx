import { 
    getPublicMediaApps, 
    getBetaDashboardText, 
    getRoadmapText, 
    getAlertBanner, 
    checkUserLibraryAccess,
    getUserReferralInfo,
    getPublicJoinConfig
} from "@/app/actions";
import ReactMarkdown from "react-markdown";
import remarkGfm from 'remark-gfm'; 
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw'; 
import LandingSupport from "@/components/landing-support";
import { AiServerAssistant } from "@/components/ai-server-assistant";
import SystemStatus from "@/components/system-status"; 
import ActiveDownloads from "@/components/active-downloads"; 
import RequestLibraryAccess from "@/components/request-library-access";
import FeatureVotingPoll from "@/components/feature-voting-poll";
import MyPlexHub from "@/components/my-plex-hub";
import PlexInviteBanner from "@/components/plex-invite-banner";
import WhatsNewModal from "@/components/whats-new-modal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ExternalLink, AlertTriangle, BookOpen, Sparkles, Compass } from "lucide-react"; 
import { cookies } from "next/headers"; 
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/auth-secret";

export const dynamic = "force-dynamic";

function makeAbsoluteUrl(url: string | null | undefined) {
    if (!url) return "#";
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return `https://${url}`;
}

export default async function UserLandingPage() {
  const cookieStore = await cookies();
  const sessionVal = cookieStore.get("session")?.value;
  const isLoggedIn = !!sessionVal;
  let isAdmin = false;
  let isSuperUser = false;
  let userSession: any = null;

  if (sessionVal) {
    try {
      const { payload } = await jwtVerify(sessionVal, getJwtSecret());
      userSession = payload;
      isAdmin = payload.role === "ADMIN";
      isSuperUser = payload.role === "SUPER_USER" || isAdmin;
    } catch (e) {}
  }

  // Fetch all dynamic content safely
  const [apps, betaText, roadmapText, alertBanner, hasAccess, referralInfo, joinConfig] = await Promise.all([
      getPublicMediaApps().catch(() => []),
      getBetaDashboardText().catch(() => ""),
      getRoadmapText().catch(() => ""),
      getAlertBanner().catch(() => ({ enabled: false, text: "" })),
      isLoggedIn ? checkUserLibraryAccess().catch(() => false) : Promise.resolve(false),
      isLoggedIn ? getUserReferralInfo().catch(() => null) : Promise.resolve(null),
      getPublicJoinConfig().catch(() => null)
  ]);

  const requestApps = apps.filter(app => 
      app.type === "Requests" || 
      ["overseerr", "ombi", "jellyseerr"].includes(app.type?.toLowerCase())
  );

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

      <main className="flex-1 p-2.5 sm:p-5 lg:p-8 max-w-7xl 2xl:max-w-[1600px] 3xl:max-w-[2200px] 4xl:max-w-[2560px] mx-auto w-full space-y-4 sm:space-y-6 lg:space-y-8 animate-in fade-in duration-500 min-w-0">
        
        <section className="text-center space-y-2 sm:space-y-3 py-3 sm:py-5 lg:py-6">
            <h1 className="text-2xl sm:text-3xl lg:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent">
                System Dashboard
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm lg:text-base max-w-2xl mx-auto">
                Real-time status, active downloads, content requests, and support.
            </p>
            
            {/* Quick action bar with What's New Popup & Direct navigation */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <WhatsNewModal roadmapText={roadmapText} triggerButton={true} />
                <Link href="/beta">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 px-3 text-xs font-semibold gap-1.5 rounded-full border-border/60 bg-white/[0.02] hover:bg-purple-500/10 hover:text-purple-300 hover:border-purple-500/40 active:scale-95 transition-all shadow-sm"
                    >
                        <span>Beta Services</span>
                    </Button>
                </Link>
                {isLoggedIn && (
                    <a href="#my-plex-hub">
                        <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 px-3 text-xs font-semibold gap-1.5 rounded-full border-border/60 bg-white/[0.02] hover:bg-amber-500/10 hover:text-amber-300 hover:border-amber-500/40 active:scale-95 transition-all shadow-sm"
                        >
                            <span>My Plex Hub</span>
                        </Button>
                    </a>
                )}
                <a href="#downloads">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 px-3 text-xs font-semibold gap-1.5 rounded-full border-border/60 bg-white/[0.02] hover:bg-blue-500/10 hover:text-blue-300 hover:border-blue-500/40 active:scale-95 transition-all shadow-sm"
                    >
                        <span>Downloads</span>
                    </Button>
                </a>
            </div>
        </section>

        {/* --- PLEX INVITE & FREE TRIAL BANNER --- */}
        {isLoggedIn && (
            <PlexInviteBanner 
                referralCode={referralInfo?.referralCode || userSession?.username}
                trialDays={joinConfig?.config?.defaultTrialDays || 14}
                username={userSession?.username}
                totalReferrals={referralInfo?.totalReferrals || 0}
                activeTrials={referralInfo?.activeTrials || 0}
                conversions={referralInfo?.conversions || 0}
                appUrl={referralInfo?.appUrl || joinConfig?.config?.appUrl}
            />
        )}

        {/* --- 4-CARD CORE STATUS GRID --- */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            <SystemStatus />
            <Card className="h-full flex flex-col border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm hover:shadow-md transition-all duration-200">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg font-bold">
                        <Compass className="h-5 w-5 text-primary"/> Discover & Requests
                    </CardTitle>
                    <CardDescription>Browse trending titles, watch trailers & request media.</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-center space-y-3">
                    <Link href="/discover" className="w-full block">
                        <Button size="lg" className="w-full text-sm sm:text-base font-bold h-12 sm:h-13 shadow-md transition-all duration-200 bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center gap-2 hover:ring-2 hover:ring-primary/50 hover:shadow-lg active:scale-98 rounded-xl">
                            <Compass className="h-5 w-5" />
                            Discover Movies & TV
                        </Button>
                    </Link>

                    {isLoggedIn && (
                        <div>
                            {hasAccess ? (
                                <Link href="/library" className="w-full block">
                                    <Button size="lg" variant="outline" className="w-full text-sm sm:text-base font-semibold h-11 sm:h-12 shadow-sm transition-all duration-200 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 flex items-center justify-center gap-2 hover:ring-1 hover:ring-emerald-400/50 active:scale-98 rounded-xl">
                                        <BookOpen className="h-4 w-4 text-emerald-400" />
                                        Access Book Library
                                    </Button>
                                </Link>
                            ) : (
                                <RequestLibraryAccess />
                            )}
                        </div>
                    )}

                    {requestApps.length > 0 && (
                        <div className="pt-2 border-t border-border/30 space-y-2">
                            {requestApps.map(app => {
                                const safeUrl = makeAbsoluteUrl(app.externalUrl);
                                return (
                                    <Link 
                                        key={app.id} 
                                        href={safeUrl} 
                                        target={app.externalUrl ? "_blank" : "_self"} 
                                        className={`w-full block ${!app.externalUrl && "opacity-50 cursor-not-allowed"}`}
                                    >
                                        <Button 
                                            size="sm" 
                                            variant="ghost"
                                            disabled={!app.externalUrl} 
                                            className="w-full text-xs h-9 transition-all text-muted-foreground hover:text-foreground font-semibold"
                                        >
                                            {app.name} 
                                            {app.externalUrl ? <ExternalLink className="ml-1.5 h-3.5 w-3.5" /> : <span className="ml-1.5 text-[10px] font-normal opacity-70">(Not Configured)</span>}
                                        </Button>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
            <LandingSupport />
            <AiServerAssistant />
        </div>

        {/* --- MY PLEX HUB (PERSONAL STREAMS, WATCH HISTORY & DIAGNOSTICS) --- */}
        {isLoggedIn && (
            <div id="my-plex-hub" className="w-full scroll-mt-6">
                <MyPlexHub />
            </div>
        )}

        {/* --- ACTIVE DOWNLOADS --- */}
        <div id="downloads" className="w-full scroll-mt-6">
             <ActiveDownloads />
        </div>

        {/* --- COMMUNITY FEATURE SUGGESTIONS & VOTING POLL --- */}
        <div id="voting" className="w-full scroll-mt-6">
            <FeatureVotingPoll isAdmin={isAdmin} />
        </div>
      </main>
    </div>
  );
}