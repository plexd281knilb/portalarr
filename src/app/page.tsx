import { getPublicMediaApps, getBetaDashboardText } from "@/app/actions";
import ReactMarkdown from "react-markdown";
import LandingSupport from "@/components/landing-support";
import SystemStatus from "@/components/system-status"; 
import ActiveDownloads from "@/components/active-downloads"; 
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ExternalLink, Server, LogIn, Settings } from "lucide-react"; 
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

  // FAST FETCH: Only local database queries run on the server now
  const [apps, betaText] = await Promise.all([
      getPublicMediaApps(),
      getBetaDashboardText()
  ]);

  const requestApps = apps.filter(app => 
      app.type === "Requests" || 
      ["overseerr", "ombi", "jellyseerr"].includes(app.type?.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-muted/20">
        <div className="flex h-16 items-center px-6 gap-4 max-w-7xl mx-auto w-full justify-between">
          <div className="font-bold text-xl flex items-center gap-2">
            <Server className="h-6 w-6 text-primary" />
            <span>Home Page</span>
          </div>
          
          <Link href={isLoggedIn ? "/settings" : "/login"}>
            <Button variant="ghost" size="sm" className="gap-2">
                {isLoggedIn ? <Settings className="h-4 w-4" /> : <LogIn className="h-4 w-4" />} 
                {isLoggedIn ? "Admin Settings" : "Admin Login"}
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-8">
        
        <section className="text-center space-y-4 py-8">
            <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">System Dashboard</h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Real-time status, content requests, and support.
            </p>
        </section>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            
            {/* System Status now fetches its own data instantly via the API */}
            <SystemStatus />

            <Card className="h-full flex flex-col">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ExternalLink className="h-5 w-5 text-primary"/> Request Content
                    </CardTitle>
                    <CardDescription>Looking for something specific? Request it here.</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-center space-y-4">
                    {requestApps.length === 0 ? (
                        <div className="text-center text-muted-foreground italic p-4">
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
                                    className={`w-full ${!app.externalUrl && "opacity-50 cursor-not-allowed"}`}
                                >
                                    <Button size="lg" disabled={!app.externalUrl} className="w-full text-lg h-16 shadow-md hover:shadow-lg transition-all">
                                        {app.name} 
                                        {app.externalUrl ? <ExternalLink className="ml-2 h-5 w-5" /> : <span className="ml-2 text-xs">(Not Configured)</span>}
                                    </Button>
                                </Link>
                            );
                        })
                    )}
                    <div className="text-xs text-center text-muted-foreground mt-4">
                        Links open in a new tab.
                    </div>
                </CardContent>
            </Card>

            <LandingSupport />
            
        </div>

        <div className="w-full">
            {/* Active Downloads now fetches its own data instantly via the API */}
             <ActiveDownloads />
        </div>

        <div className="w-full">
            <Card className="bg-muted/30 border-primary/20">
                <CardHeader>
                    <CardTitle className="text-2xl flex items-center gap-2">
                        🧪 Beta Testing & Additional Services
                    </CardTitle>
                </CardHeader>
                <CardContent className="prose prose-sm dark:prose-invert max-w-none break-words overflow-hidden">
                    <ReactMarkdown>{betaText}</ReactMarkdown>
                </CardContent>
                <CardContent>
                    <Button asChild size="lg" className="mt-4">
                        <Link href="/beta">View Beta Services</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>

      </main>
    </div>
  );
}