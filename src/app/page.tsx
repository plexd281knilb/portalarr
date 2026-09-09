import { getPublicMediaApps, getBetaDashboardText, getRoadmapText, getAlertBanner, checkUserLibraryAccess } from "@/app/actions";
import ReactMarkdown from "react-markdown";
import remarkGfm from 'remark-gfm'; 
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw'; 
import LandingSupport from "@/components/landing-support";
import SystemStatus from "@/components/system-status"; 
import ActiveDownloads from "@/components/active-downloads"; 
import RequestLibraryAccess from "@/components/request-library-access";
import FeatureVotingPoll from "@/components/feature-voting-poll";
import MyPlexHub from "@/components/my-plex-hub";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ExternalLink, AlertTriangle, BookOpen } from "lucide-react"; 
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
  if (sessionVal) {
    try {
      const { payload } = await jwtVerify(sessionVal, getJwtSecret());
      isAdmin = payload.role === "ADMIN";
    } catch (e) {}
  }

  // Fetch all dynamic content safely
  const [apps, betaText, roadmapText, alertBanner, hasAccess] = await Promise.all([
      getPublicMediaApps().catch(() => []),
      getBetaDashboardText().catch(() => ""),
      getRoadmapText().catch(() => ""),
      getAlertBanner().catch(() => ({ enabled: false, text: "" })),
      isLoggedIn ? checkUserLibraryAccess().catch(() => false) : Promise.resolve(false)
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

      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6 sm:space-y-8 animate-in fade-in duration-500">
        
        <section className="text-center space-y-3 py-6 sm:py-8">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent">
                System Dashboard
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base lg:text-lg max-w-2xl mx-auto">
                Real-time status, active downloads, content requests, and support.
            </p>
        </section>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <SystemStatus />
            <Card className="h-full flex flex-col border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm hover:shadow-md transition-all duration-200">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg font-bold">
                        <ExternalLink className="h-5 w-5 text-primary"/> Request Content
                    </CardTitle>
                    <CardDescription>Looking for something specific? Request it here.</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-center space-y-4">
                    {isLoggedIn && (
                        <div className="border-b border-border/40 pb-4">
                            {hasAccess ? (
                                <Link href="/library" className="w-full block">
                                    <Button size="lg" className="w-full text-base font-semibold h-12 shadow-sm transition-all duration-200 bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 hover:ring-2 hover:ring-emerald-400/50 hover:shadow-lg active:scale-98">
                                        <BookOpen className="h-5 w-5 text-white" />
                                        Access Book Library
                                    </Button>
                                </Link>
                            ) : (
                                <RequestLibraryAccess />
                            )}
                        </div>
                    )}
                    {requestApps.length === 0 ? (
                        <div className="text-center text-muted-foreground italic p-4 border border-dashed rounded-lg border-border/40">
                            No request apps configured.
                        </div>
                    ) : (
                        requestApps.map(app => {
                            const safeUrl = makeAbsoluteUrl(app.externalUrl);
                            return (
                                <Link 
                                    key={app.id} 
                                    href={safeUrl} 
                                    target={app.externalUrl ? "_blank" : "_self"} 
                                    className={`w-full block ${!app.externalUrl && "opacity-50 cursor-not-allowed"}`}
                                >
                                    <Button 
                                        size="lg" 
                                        disabled={!app.externalUrl} 
                                        className="w-full text-base sm:text-lg h-14 sm:h-16 shadow-md transition-all duration-200 font-semibold hover:ring-2 hover:ring-primary/50 hover:shadow-lg active:scale-98"
                                    >
                                        {app.name} 
                                        {app.externalUrl ? <ExternalLink className="ml-2 h-5 w-5" /> : <span className="ml-2 text-xs font-normal opacity-70">(Not Configured)</span>}
                                    </Button>
                                </Link>
                            );
                        })
                    )}
                </CardContent>
            </Card>
            <LandingSupport />
        </div>

        {/* --- MY PLEX HUB (PERSONAL STREAMS, WATCH HISTORY & DIAGNOSTICS) --- */}
        {isLoggedIn && (
            <div className="w-full">
                <MyPlexHub />
            </div>
        )}

        <div className="w-full">
             <ActiveDownloads />
        </div>

        {/* ROADMAP CARD */}
        <div className="w-full">
            <Card className="bg-[#121218]/80 border-primary/20 backdrop-blur-md shadow-sm hover:shadow-md transition-all duration-200">
                <CardHeader className="pb-3 border-b border-border/40">
                    <CardTitle className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-primary">
                        🗺️ Roadmap & New Features
                    </CardTitle>
                    <CardDescription className="text-sm text-muted-foreground">
                        Recent feature highlights, active developments, and upcoming milestones.
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 pb-6 text-sm sm:text-base leading-relaxed break-words overflow-hidden">
                    <ReactMarkdown 
                        remarkPlugins={[remarkGfm, remarkBreaks]} 
                        rehypePlugins={[rehypeRaw]}
                        components={{
                            h1: ({ node, ...props }) => (
                                <h1 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight mt-4 mb-3 border-b border-border/40 pb-2 flex items-center gap-2" {...props} />
                            ),
                            h2: ({ node, ...props }) => (
                                <h2 className="text-lg sm:text-xl font-bold text-foreground mt-4 mb-2.5 border-b border-border/30 pb-2 flex items-center gap-2" {...props} />
                            ),
                            h3: ({ node, ...props }) => (
                                <h3 className="text-base sm:text-lg font-bold text-foreground mt-4 mb-2 flex items-center gap-2 first:mt-0 text-primary/95" {...props} />
                            ),
                            h4: ({ node, ...props }) => (
                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-3 mb-1.5 flex items-center gap-1.5" {...props} />
                            ),
                            p: ({ node, ...props }) => (
                                <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground/95 my-2" {...props} />
                            ),
                            ul: ({ node, ...props }) => (
                                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5 my-2.5 pl-0 list-none" {...props} />
                            ),
                            ol: ({ node, ...props }) => (
                                <ol className="space-y-2 my-2.5 pl-5 list-decimal text-xs sm:text-sm text-muted-foreground/95 leading-relaxed" {...props} />
                            ),
                            li: ({ node, ...props }) => (
                                <li className="text-xs sm:text-sm leading-relaxed text-muted-foreground/95 p-3 rounded-xl bg-muted/20 border border-border/40 hover:border-primary/30 transition-all block" {...props} />
                            ),
                            hr: ({ node, ...props }) => (
                                <hr className="my-4 border-t border-border/40" {...props} />
                            ),
                            strong: ({ node, ...props }) => (
                                <strong className="font-semibold text-foreground" {...props} />
                            ),
                            blockquote: ({ node, ...props }) => (
                                <blockquote className="border-l-2 border-primary/70 pl-3 py-1.5 my-2.5 bg-primary/5 rounded-r text-xs sm:text-sm text-foreground/90 italic" {...props} />
                            ),
                            a: ({ node, ...props }) => (
                                <a className="text-primary underline hover:text-primary/80 transition-colors" target="_blank" rel="noopener noreferrer" {...props} />
                            ),
                        }}
                    >
                        {roadmapText}
                    </ReactMarkdown>
                </CardContent>
            </Card>
        </div>

        {/* COMMUNITY FEATURE SUGGESTIONS & VOTING POLL */}
        <div className="w-full">
            <FeatureVotingPoll isAdmin={isAdmin} />
        </div>

        {/* BETA TESTING CARD */}
        <div className="w-full">
            <Card className="bg-[#121218]/80 border-purple-500/20 backdrop-blur-md shadow-sm hover:shadow-md transition-all duration-200">
                <CardHeader className="pb-3 border-b border-border/40">
                    <CardTitle className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-purple-400">
                        🧪 Beta Testing & Additional Services
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-6 pb-4 text-sm sm:text-base leading-relaxed break-words overflow-hidden">
                    <ReactMarkdown 
                        remarkPlugins={[remarkGfm, remarkBreaks]} 
                        rehypePlugins={[rehypeRaw]}
                        components={{
                            h3: ({ node, ...props }) => (
                                <h3 className="text-lg font-bold text-foreground mt-4 mb-2" {...props} />
                            ),
                            p: ({ node, ...props }) => (
                                <p className="text-sm sm:text-base leading-relaxed text-muted-foreground/90 my-2.5" {...props} />
                            ),
                            ul: ({ node, ...props }) => (
                                <ul className="space-y-2 my-3 pl-0 list-none" {...props} />
                            ),
                            li: ({ node, ...props }) => (
                                <li className="text-sm leading-relaxed text-muted-foreground/90 p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/10 block" {...props} />
                            ),
                        }}
                    >
                        {betaText}
                    </ReactMarkdown>
                </CardContent>
                <CardContent className="pt-0 pb-6">
                    <Button asChild size="lg" className="font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-all duration-200 hover:ring-2 hover:ring-purple-400/50 hover:shadow-lg active:scale-98">
                        <Link href="/beta">View Beta Services</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
      </main>
    </div>
  );
}