"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { 
    Tv, 
    Tv2, 
    Flame, 
    Monitor, 
    Smartphone, 
    Globe, 
    CheckCircle2, 
    Sparkles, 
    AlertCircle, 
    ArrowLeft, 
    Gauge, 
    LifeBuoy, 
    ExternalLink, 
    ShieldCheck, 
    Zap, 
    SlidersHorizontal,
    Subtitles,
    Volume2,
    ChevronLeft,
    ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getPlexSetupGuides } from "@/app/actions";
import ServerSpeedTest from "@/components/server-speed-test";

export default function GuidesPage() {
    const [guides, setGuides] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<string>("appletv");

    const deviceTabsRef = useRef<HTMLDivElement>(null);

    const scrollTabs = (direction: "left" | "right") => {
        if (deviceTabsRef.current) {
            const offset = direction === "left" ? -250 : 250;
            deviceTabsRef.current.scrollBy({ left: offset, behavior: "smooth" });
        }
    };

    useEffect(() => {
        getPlexSetupGuides().then(g => {
            if (g && Array.isArray(g)) {
                setGuides(g);
                if (g.length > 0 && !activeTab) {
                    setActiveTab(g[0].id);
                }
            }
        }).catch((err) => {
            console.error("Failed to load guides:", err);
        }).finally(() => {
            setLoading(false);
        });
    }, []);

    const getDeviceIcon = (id: string) => {
        switch (id) {
            case "appletv": return <Tv className="h-4 w-4 text-cyan-400" />;
            case "roku": return <Tv2 className="h-4 w-4 text-purple-400" />;
            case "firetv": return <Flame className="h-4 w-4 text-orange-400" />;
            case "smarttv": return <Monitor className="h-4 w-4 text-blue-400" />;
            case "googletv": return <Smartphone className="h-4 w-4 text-emerald-400" />;
            case "mobile": return <Smartphone className="h-4 w-4 text-pink-400" />;
            case "web": return <Globe className="h-4 w-4 text-amber-400" />;
            default: return <Tv className="h-4 w-4 text-primary" />;
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex flex-col animate-in fade-in duration-300">
                <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full space-y-6">
                    <div className="space-y-3">
                        <Skeleton className="h-8 w-40" />
                        <Skeleton className="h-10 w-96" />
                        <Skeleton className="h-5 w-2/3" />
                    </div>
                    <Skeleton className="h-28 w-full rounded-2xl" />
                    <Skeleton className="h-12 w-full rounded-xl" />
                    <div className="space-y-4">
                        <Skeleton className="h-48 w-full rounded-2xl" />
                        <Skeleton className="h-48 w-full rounded-2xl" />
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col animate-in fade-in duration-300">
            <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full space-y-8 pb-16">
                
                {/* TOP NAVIGATION & ACTIONS */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                        <Link href="/">
                            <ArrowLeft className="h-4 w-4" />
                            <span>Back to Dashboard</span>
                        </Link>
                    </Button>

                    <div className="flex items-center gap-2">
                        <ServerSpeedTest />
                        <Button asChild variant="outline" size="sm" className="h-9 px-3 text-xs font-semibold gap-1.5 border-border/60 hover:border-primary/40">
                            <a href="https://support.plex.tv" target="_blank" rel="noreferrer">
                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>Plex Docs</span>
                            </a>
                        </Button>
                    </div>
                </div>

                {/* PAGE HEADER */}
                <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Streaming Optimization Center</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground">
                        Plex Device Setup & Quality Guides
                    </h1>
                    <p className="text-muted-foreground text-sm sm:text-base max-w-3xl leading-relaxed">
                        Configure your streaming devices for 100% Direct Play. Stop video transcoding, eliminate buffering, and experience studio master 4K HDR and crisp audio.
                    </p>
                </div>

                {/* THE GOLDEN RULE CALLOUT BANNER */}
                <Card className="rounded-2xl border-amber-500/30 bg-gradient-to-br from-amber-950/20 via-background to-background p-5 sm:p-6 shadow-md relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
                    <div className="flex items-start gap-4">
                        <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0 mt-0.5">
                            <AlertCircle className="h-6 w-6" />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <h3 className="text-base sm:text-lg font-bold text-amber-300">
                                    The #1 Rule for Zero Buffering: Force "Maximum / Original" Quality
                                </h3>
                                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-300 border-amber-500/30 font-semibold uppercase">
                                    Essential Fix
                                </Badge>
                            </div>
                            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                                By default, almost every fresh Plex app installation caps remote streaming quality to a restricted <strong className="text-foreground">2 Mbps (720p)</strong>. 
                                This forces the server to re-encode the stream into a low-resolution file in real-time, causing spinning wheels and stuttering. 
                                Simply changing your client setting to <strong className="text-emerald-400">"Maximum" or "Original"</strong> allows your device to stream the native studio file with zero server lag.
                            </p>
                        </div>
                    </div>
                </Card>

                {/* DEVICE GUIDES TABS */}
                {guides.length > 0 && (
                    <Tabs defaultValue={activeTab} value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
                        <div className="flex items-center justify-between gap-2 px-1">
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                                Select Your Streaming Device:
                            </span>
                            <div className="flex items-center gap-1">
                                <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-7 w-7 rounded-lg bg-white/[0.04] border-border/40 text-muted-foreground hover:text-foreground"
                                    onClick={() => scrollTabs("left")}
                                    title="Scroll devices left"
                                >
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-7 w-7 rounded-lg bg-white/[0.04] border-border/40 text-muted-foreground hover:text-foreground"
                                    onClick={() => scrollTabs("right")}
                                    title="Scroll devices right"
                                >
                                    <ChevronRight className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>

                        <div 
                            ref={deviceTabsRef} 
                            className="overflow-x-auto pb-2 pt-0.5 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent scroll-smooth"
                        >
                            <TabsList className="inline-flex items-center justify-start gap-1.5 p-1.5 bg-muted/20 border border-border/40 rounded-2xl min-w-full w-max h-auto">
                                {guides.map(guide => (
                                    <TabsTrigger 
                                        key={guide.id} 
                                        value={guide.id} 
                                        className="flex items-center gap-2 py-2.5 px-3.5 text-xs font-semibold data-[state=active]:bg-sky-500 data-[state=active]:text-white data-[state=active]:shadow-md transition-all rounded-xl shrink-0 cursor-pointer"
                                    >
                                        {getDeviceIcon(guide.id)}
                                        <span>{guide.name}</span>
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </div>

                        {guides.map(guide => (
                            <TabsContent key={guide.id} value={guide.id} className="space-y-6 animate-in fade-in-50 duration-200">
                                <Card className="rounded-2xl border-border/50 bg-[#121218]/90 backdrop-blur-md shadow-sm">
                                    <CardHeader className="pb-4 border-b border-border/30">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2.5">
                                                    {getDeviceIcon(guide.id)}
                                                    <CardTitle className="text-xl sm:text-2xl font-bold text-foreground">
                                                        {guide.name}
                                                    </CardTitle>
                                                    {guide.badge && (
                                                        <Badge variant="outline" className="text-xs bg-sky-500/10 text-sky-400 border-sky-500/30 font-medium">
                                                            {guide.badge}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <CardDescription className="text-sm text-muted-foreground">
                                                    {guide.summary}
                                                </CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>

                                    <CardContent className="pt-6 space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {guide.steps.map((step: any, idx: number) => (
                                                <div 
                                                    key={idx} 
                                                    className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-sky-500/40 hover:bg-white/[0.03] transition-all space-y-2 group"
                                                >
                                                    <div className="flex items-center gap-2.5 text-sm font-semibold text-foreground group-hover:text-sky-300 transition-colors">
                                                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                                                        <span>{step.title}</span>
                                                    </div>
                                                    <p className="text-xs sm:text-sm text-muted-foreground/90 pl-6.5 leading-relaxed">
                                                        {step.desc}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* PRO-TIPS SECTION PER DEVICE */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                                    <Card className="rounded-xl border-border/40 bg-muted/10 p-4 space-y-2">
                                        <div className="flex items-center gap-2 text-xs font-bold text-sky-400 uppercase tracking-wide">
                                            <Subtitles className="h-4 w-4 shrink-0" />
                                            <span>Subtitle Settings</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Always set <strong className="text-foreground">Burn Subtitles</strong> to <strong className="text-foreground">"Only Image Formats"</strong> or <strong className="text-foreground">"Automatic"</strong>. This allows normal text (SRT) subtitles to overlay smoothly without forcing CPU transcoding.
                                        </p>
                                    </Card>

                                    <Card className="rounded-xl border-border/40 bg-muted/10 p-4 space-y-2">
                                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wide">
                                            <Volume2 className="h-4 w-4 shrink-0" />
                                            <span>Surround Sound</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Enable <strong className="text-foreground">Audio Passthrough</strong> (HDMI/Optical) if you have an external soundbar or AVR receiver so multichannel Dolby Digital 5.1 / Atmos passes directly to your speakers.
                                        </p>
                                    </Card>

                                    <Card className="rounded-xl border-border/40 bg-muted/10 p-4 space-y-2">
                                        <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wide">
                                            <Zap className="h-4 w-4 shrink-0" />
                                            <span>Network Stability</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Use a <strong className="text-foreground">5GHz Wi-Fi band</strong> or wired ethernet connection. 2.4GHz Wi-Fi often has neighborhood interference that causes momentary drops during 4K peak bitrates (60–100 Mbps).
                                        </p>
                                    </Card>
                                </div>
                            </TabsContent>
                        ))}
                    </Tabs>
                )}

                {/* TROUBLESHOOTING & ASSISTANCE FOOTER */}
                <Card className="rounded-2xl border-border/40 bg-gradient-to-r from-muted/20 via-background to-muted/20 p-6">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="space-y-1 text-center sm:text-left">
                            <h4 className="text-base font-bold text-foreground flex items-center gap-2 justify-center sm:justify-start">
                                <LifeBuoy className="h-4 w-4 text-primary" />
                                Still experiencing buffering or have questions?
                            </h4>
                            <p className="text-xs text-muted-foreground">
                                Test your connection with our built-in speed test, review live stream health in My Plex Hub, or submit a support ticket.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button asChild variant="outline" size="sm" className="text-xs font-semibold gap-1.5">
                                <Link href="/#my-plex-hub">
                                    <Zap className="h-3.5 w-3.5 text-primary" />
                                    <span>My Plex Hub</span>
                                </Link>
                            </Button>
                        </div>
                    </div>
                </Card>

            </main>
        </div>
    );
}
