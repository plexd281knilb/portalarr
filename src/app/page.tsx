import { getLandingStats, getMediaApps, getSupportTickets } from "@/app/actions";
import LandingSupport from "@/components/landing-support";
import SystemStatus from "@/components/system-status"; // <--- Import New Component
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ExternalLink, Server, LogIn } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function UserLandingPage() {
  const [stats, apps, tickets] = await Promise.all([
      getLandingStats(),
      getMediaApps(),
      getSupportTickets()
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
            <span>Adminarr Media</span>
          </div>
          <Link href="/login">
            <Button variant="ghost" size="sm" className="gap-2">
                <LogIn className="h-4 w-4" /> Admin Login
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
            
            {/* 1. SYSTEM STATUS CARD (Now Auto-Updating) */}
            <SystemStatus initialData={stats} />

            {/* 2. REQUEST CONTENT CARD */}
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
                        requestApps.map(app => (
                            <Link key={app.id} href={app.externalUrl || app.url} target="_blank" className="w-full">
                                <Button size="lg" className="w-full text-lg h-16 shadow-md hover:shadow-lg transition-all">
                                    {app.name} <ExternalLink className="ml-2 h-5 w-5" />
                                </Button>
                            </Link>
                        ))
                    )}
                    <div className="text-xs text-center text-muted-foreground mt-4">
                        Links open in a new tab.
                    </div>
                </CardContent>
            </Card>

            {/* 3. SUPPORT CARD */}
            <LandingSupport initialTickets={tickets} />
            
        </div>
      </main>
    </div>
  );
}