import { getPublicMediaApps, getBetaDashboardText, getRoadmapText, getAlertBanner, checkUserLibraryAccess } from "@/app/actions";
import ReactMarkdown from "react-markdown";
import remarkGfm from 'remark-gfm'; 
import rehypeRaw from 'rehype-raw'; 
import LandingSupport from "@/components/landing-support";
import SystemStatus from "@/components/system-status"; 
import ActiveDownloads from "@/components/active-downloads"; 
import RequestLibraryAccess from "@/components/request-library-access";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ExternalLink, AlertTriangle, BookOpen } from "lucide-react"; 
import { cookies } from "next/headers"; 

export const dynamic = "force-dynamic";

function makeAbsoluteUrl(url: string | null | undefined) {
    if (!url) return "#";
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return `https://${url}`;
}

export default async function UserLandingPage() {
  const cookieStore = await cookies();
  const isLoggedIn = !!cookieStore.get("session")?.value;

  // Fetch all dynamic content
  const [apps, betaText, roadmapText, alertBanner, hasAccess] = await Promise.all([
      getPublicMediaApps(),
      getBetaDashboardText(),
      getRoadmapText(),
      getAlertBanner(),
      isLoggedIn ? checkUserLibraryAccess() : Promise.resolve(false)
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
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
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

        <div className="w-full">
             <ActiveDownloads />
        </div>

        {/* ROADMAP CARD */}
        <div className="w-full">
            <Card className="bg-[#121218]/80 border-primary/20 backdrop-blur-md shadow-sm hover:shadow-md transition-all duration-200">
                <CardHeader>
                    <CardTitle className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-primary">
                        🗺️ Roadmap & New Features
                    </CardTitle>
                </CardHeader>
                <CardContent className="prose prose-sm dark:prose-invert max-w-none break-words overflow-hidden pb-4">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                        {roadmapText}
                    </ReactMarkdown>
                </CardContent>
            </Card>
        </div>

        {/* BETA TESTING CARD */}
        <div className="w-full">
            <Card className="bg-[#121218]/80 border-purple-500/20 backdrop-blur-md shadow-sm hover:shadow-md transition-all duration-200">
                <CardHeader>
                    <CardTitle className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-purple-400">
                        🧪 Beta Testing & Additional Services
                    </CardTitle>
                </CardHeader>
                <CardContent className="prose prose-sm dark:prose-invert max-w-none break-words overflow-hidden pb-4">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                        {betaText}
                    </ReactMarkdown>
                </CardContent>
                <CardContent>
                    <Button asChild size="lg" className="mt-2 font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-all duration-200 hover:ring-2 hover:ring-purple-400/50 hover:shadow-lg active:scale-98">
                        <Link href="/beta">View Beta Services</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
      </main>
    </div>
  );
}