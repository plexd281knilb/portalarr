"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
    LifeBuoy, 
    ExternalLink, 
    Zap, 
    Subtitles, 
    Volume2, 
    ChevronLeft, 
    ChevronRight,
    BookOpen,
    Bot,
    Film,
    Headphones,
    Gift,
    Sliders,
    Search,
    Edit3,
    Save,
    RotateCw,
    Loader2,
    X,
    FileText,
    ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getPlexSetupGuides, getFullUserGuideAction, saveFullUserGuideAction, getUserGuideAccessAction, UserGuideAccess } from "@/app/actions";
import { getCurrentUser } from "@/app/auth-actions";
import ServerSpeedTest from "@/components/server-speed-test";
import { GUIDE_TOPICS, FeatureGuideId, GuideTopic } from "@/components/feature-guide-modal";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MainNavCategory = 
    | "devices"
    | "ai-assistant"
    | "movies-tv"
    | "ebooks"
    | "audiobooks"
    | "referral-rewards"
    | "curation-studio"
    | "manual";

const NAV_ITEMS: { id: MainNavCategory; label: string; icon: any; badge?: string }[] = [
    { id: "devices", label: "Streaming Devices", icon: Tv, badge: "Direct Play" },
    { id: "ai-assistant", label: "AI Support & Probes", icon: Bot, badge: "Diagnostic" },
    { id: "movies-tv", label: "Movies & TV Requests", icon: Film },
    { id: "ebooks", label: "Ebooks & Kindle", icon: BookOpen },
    { id: "audiobooks", label: "Audiobooks & Chapters", icon: Headphones },
    { id: "referral-rewards", label: "Memberships & Referrals", icon: Gift, badge: "$15/Mo Off" },
    { id: "curation-studio", label: "Server Curation Suite", icon: Sliders },
    { id: "manual", label: "Full System Manual", icon: FileText, badge: "Complete Docs" }
];

function GuidesContent() {
    const searchParams = useSearchParams();
    const queryTab = searchParams.get("tab") as MainNavCategory | null;
    const queryTopic = searchParams.get("topic") as FeatureGuideId | null;

    const [mainCategory, setMainCategory] = useState<MainNavCategory>("devices");
    const [guides, setGuides] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeDeviceTab, setActiveDeviceTab] = useState<string>("appletv");
    const [userAccess, setUserAccess] = useState<UserGuideAccess | null>(null);

    // Full manual state
    const [fullManualMarkdown, setFullManualMarkdown] = useState<string>("");
    const [manualLoading, setManualLoading] = useState(false);
    const [manualSearch, setManualSearch] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);
    const [isEditingManual, setIsEditingManual] = useState(false);
    const [editManualText, setEditManualText] = useState("");
    const [savingManual, setSavingManual] = useState(false);
    const [manualFeedback, setManualFeedback] = useState<{ text: string; error?: boolean } | null>(null);

    const deviceTabsRef = useRef<HTMLDivElement>(null);
    const navScrollRef = useRef<HTMLDivElement>(null);

    const scrollTabs = (direction: "left" | "right") => {
        if (deviceTabsRef.current) {
            const offset = direction === "left" ? -250 : 250;
            deviceTabsRef.current.scrollBy({ left: offset, behavior: "smooth" });
        }
    };

    // Load initial Plex device guides, user role & granular access permissions
    useEffect(() => {
        Promise.all([
            getPlexSetupGuides().catch(() => []),
            getCurrentUser().catch(() => null),
            getUserGuideAccessAction().catch(() => null)
        ]).then(([g, user, access]) => {
            if (g && Array.isArray(g)) {
                setGuides(g);
                if (g.length > 0 && !activeDeviceTab) {
                    setActiveDeviceTab(g[0].id);
                }
            }
            if (user && (user.status === "EXPIRED" || user.status === "PENDING" || user.status === "REJECTED" || user.status === "SUSPENDED")) {
                window.location.href = "/pending";
                return;
            }
            if (access) {
                setUserAccess(access);
                if (access.isAdmin) {
                    setIsAdmin(true);
                }
            } else if (user?.role === "ADMIN") {
                setIsAdmin(true);
            }
        }).catch((err) => {
            console.error("Failed to load initial guide data:", err);
        }).finally(() => {
            setLoading(false);
        });
    }, []);

    // Filter categories strictly according to what the active user has permissions/access to
    const visibleNavItems = useMemo(() => {
        if (!userAccess) {
            return NAV_ITEMS.filter(item => item.id === "devices" || item.id === "ai-assistant");
        }
        return NAV_ITEMS.filter(item => userAccess.allowedCategories.includes(item.id));
    }, [userAccess]);

    // Sync query params and enforce access gates
    useEffect(() => {
        if (!userAccess) return;

        let targetCategory: MainNavCategory = "devices";

        if (queryTopic) {
            if (queryTopic === "ai-assistant") targetCategory = "ai-assistant";
            else if (queryTopic === "movies-tv") targetCategory = "movies-tv";
            else if (queryTopic === "ebooks" || queryTopic === "kindle-setup") targetCategory = "ebooks";
            else if (queryTopic === "audiobooks") targetCategory = "audiobooks";
            else if (queryTopic === "requests-pipeline") {
                targetCategory = userAccess.hasEbooksAccess ? "ebooks" : (userAccess.hasAudiobooksAccess ? "audiobooks" : "movies-tv");
            }
            else if (queryTopic === "referral-rewards") targetCategory = "referral-rewards";
            else if (queryTopic === "curation-studio") targetCategory = "curation-studio";
            else if (queryTopic === "stream-diagnostics") targetCategory = "devices";
        } else if (queryTab) {
            if (["devices", "ai-assistant", "movies-tv", "ebooks", "audiobooks", "referral-rewards", "curation-studio", "manual"].includes(queryTab)) {
                targetCategory = queryTab;
            }
        }

        // Enforce user gate: only set category if user has access to it
        if (userAccess.allowedCategories.includes(targetCategory)) {
            setMainCategory(targetCategory);
        } else {
            const fallback = (userAccess.allowedCategories[0] as MainNavCategory) || "devices";
            setMainCategory(fallback);
        }
    }, [queryTab, queryTopic, userAccess]);

    // Load full manual when manual tab selected and user is confirmed admin
    useEffect(() => {
        if (mainCategory === "manual" && !fullManualMarkdown && userAccess?.isAdmin) {
            setManualLoading(true);
            getFullUserGuideAction().then(content => {
                setFullManualMarkdown(content);
                setEditManualText(content);
            }).catch(e => {
                console.error("Failed to load full user guide:", e);
                setFullManualMarkdown("# Error\nFailed to load manual content.");
            }).finally(() => {
                setManualLoading(false);
            });
        }
    }, [mainCategory, fullManualMarkdown, userAccess?.isAdmin]);

    const handleSaveManual = async () => {
        setSavingManual(true);
        setManualFeedback(null);
        try {
            const res = await saveFullUserGuideAction(editManualText);
            if (res && res.success) {
                setFullManualMarkdown(editManualText);
                setIsEditingManual(false);
                setManualFeedback({ text: "Manual successfully saved!", error: false });
                setTimeout(() => setManualFeedback(null), 4000);
            } else {
                setManualFeedback({ text: res?.error || "Failed to save user guide.", error: true });
            }
        } catch (e: any) {
            setManualFeedback({ text: e.message || "Failed to save user guide.", error: true });
        } finally {
            setSavingManual(false);
        }
    };

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

    // Filtered manual text if user enters a search term
    const displayedManual = useMemo(() => {
        if (!manualSearch.trim()) return fullManualMarkdown;
        const query = manualSearch.toLowerCase();
        // Split markdown by lines and extract paragraphs/sections matching
        const lines = fullManualMarkdown.split("\n");
        const matchedLines: string[] = [];
        let inMatchingSection = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith("#")) {
                inMatchingSection = line.toLowerCase().includes(query);
                if (inMatchingSection) {
                    matchedLines.push(line);
                }
            } else if (inMatchingSection) {
                matchedLines.push(line);
            } else if (line.toLowerCase().includes(query)) {
                matchedLines.push(`> ... ${line} ...\n`);
            }
        }

        if (matchedLines.length === 0) {
            return `*No exact matches found for "${manualSearch}". Showing full manual below.* \n\n---\n\n` + fullManualMarkdown;
        }

        return `### Search Results for "${manualSearch}":\n\n` + matchedLines.join("\n");
    }, [fullManualMarkdown, manualSearch]);

    if (loading) {
        return <GuidesLoadingSkeleton />;
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
                        <span>DomsHomeLab (d281knilb) Knowledge Base</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground">
                        Guides & Platform Knowledge Base
                    </h1>
                    <p className="text-muted-foreground text-sm sm:text-base max-w-3xl leading-relaxed">
                        {userAccess?.headerSubtitle || "Configure streaming devices for 100% Direct Play, troubleshoot buffering with our AI bot, navigate audiobooks & Send-to-Kindle, and master platform features."}
                    </p>
                </div>

                {/* MASTER CATEGORY NAVIGATION PILLS */}
                <div 
                    ref={navScrollRef}
                    className="overflow-x-auto pb-1 pt-0.5 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent scroll-smooth"
                >
                    <div className="flex items-center gap-1.5 p-1.5 bg-muted/20 border border-border/40 rounded-2xl min-w-full w-max">
                        {visibleNavItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = mainCategory === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => setMainCategory(item.id)}
                                    className={`flex items-center gap-2 py-2 px-3.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                                        isActive
                                            ? "bg-primary text-primary-foreground shadow-md font-bold"
                                            : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                                    }`}
                                >
                                    <Icon className={`h-4 w-4 ${isActive ? "text-primary-foreground" : "text-primary"}`} />
                                    <span>{item.label}</span>
                                    {item.badge && (
                                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${
                                            isActive 
                                                ? "bg-black/20 text-white" 
                                                : "bg-primary/10 text-primary border border-primary/20"
                                        }`}>
                                            {item.badge}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* TAB 1: STREAMING DEVICES (PLEX SETUP GUIDES) */}
                {mainCategory === "devices" && (
                    <div className="space-y-6 animate-in fade-in-50 duration-200">
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
                            <Tabs defaultValue={activeDeviceTab} value={activeDeviceTab} onValueChange={setActiveDeviceTab} className="w-full space-y-4">
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
                    </div>
                )}

                {/* FEATURE GUIDES RENDERER (AI Assistant, Movies/TV, Ebooks, Audiobooks, Referrals, Curation) */}
                {mainCategory !== "devices" && mainCategory !== "manual" && (
                    userAccess && !userAccess.allowedCategories.includes(mainCategory) ? (
                        <Card className="rounded-2xl border-amber-500/30 bg-amber-950/10 p-8 text-center space-y-4">
                            <AlertCircle className="h-10 w-10 text-amber-400 mx-auto" />
                            <div className="space-y-1">
                                <h3 className="text-lg font-bold text-foreground">Access Restricted</h3>
                                <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
                                    You do not have active library access or permissions for this section of the platform.
                                </p>
                            </div>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => setMainCategory("devices")}
                                className="text-xs font-semibold"
                            >
                                Return to Allowed Guides
                            </Button>
                        </Card>
                    ) : (
                        <FeatureTopicRenderer topicId={mainCategory as FeatureGuideId} />
                    )
                )}

                {/* TAB: FULL PLATFORM MANUAL */}
                {mainCategory === "manual" && (
                    !userAccess?.isAdmin ? (
                        <Card className="rounded-2xl border-amber-500/30 bg-amber-950/10 p-8 text-center space-y-4">
                            <AlertCircle className="h-10 w-10 text-amber-400 mx-auto" />
                            <div className="space-y-1">
                                <h3 className="text-lg font-bold text-foreground">Admin Manual Restricted</h3>
                                <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
                                    The full system documentation is reserved for platform administrators.
                                </p>
                            </div>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => setMainCategory("devices")}
                                className="text-xs font-semibold"
                            >
                                Return to Allowed Guides
                            </Button>
                        </Card>
                    ) : (
                        <div className="space-y-6 animate-in fade-in-50 duration-200">
                            {/* MANUAL CONTROLS & HEADER */}
                            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-card border border-border/50">
                                <div className="space-y-1">
                                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                                        <FileText className="h-5 w-5 text-primary" />
                                        <span>Complete System Documentation (`USER_GUIDE.md`)</span>
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        Authoritative documentation covering architecture, storage probing, Transcode Doctor, Kindle delivery, and billing logic.
                                    </p>
                                </div>

                            <div className="flex items-center gap-2 flex-wrap">
                                {isAdmin && !isEditingManual && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-xs font-semibold gap-1.5"
                                        onClick={() => setIsEditingManual(true)}
                                    >
                                        <Edit3 className="h-3.5 w-3.5" />
                                        <span>Edit Guide (Admin)</span>
                                    </Button>
                                )}

                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs font-semibold gap-1.5"
                                    disabled={manualLoading}
                                    onClick={() => {
                                        setManualLoading(true);
                                        getFullUserGuideAction().then(content => {
                                            setFullManualMarkdown(content);
                                            setEditManualText(content);
                                        }).finally(() => setManualLoading(false));
                                    }}
                                >
                                    <RotateCw className={`h-3.5 w-3.5 ${manualLoading ? "animate-spin" : ""}`} />
                                    <span>Refresh</span>
                                </Button>
                            </div>
                        </div>

                        {/* FEEDBACK ALERT */}
                        {manualFeedback && (
                            <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                                manualFeedback.error 
                                    ? "bg-red-500/10 border-red-500/20 text-red-400" 
                                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                            }`}>
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                <span>{manualFeedback.text}</span>
                            </div>
                        )}

                        {/* SEARCH BAR (WHEN NOT EDITING) */}
                        {!isEditingManual && (
                            <div className="relative">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                <Input
                                    type="text"
                                    placeholder="Search the manual for topics (e.g. 'probe', 'kindle', 'referral', 'transcode')..."
                                    value={manualSearch}
                                    onChange={(e) => setManualSearch(e.target.value)}
                                    className="pl-9 pr-9 h-10 text-xs bg-muted/20 border-border/50 rounded-xl"
                                />
                                {manualSearch && (
                                    <button 
                                        onClick={() => setManualSearch("")}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        )}

                        {/* EDITING MODE VS VIEWING MODE */}
                        {isEditingManual ? (
                            <Card className="rounded-2xl border-primary/30 p-4 space-y-4">
                                <div className="flex items-center justify-between border-b border-border/30 pb-3">
                                    <span className="text-xs font-bold text-primary">Editing USER_GUIDE.md</span>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 text-xs"
                                            onClick={() => {
                                                setEditManualText(fullManualMarkdown);
                                                setIsEditingManual(false);
                                            }}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            size="sm"
                                            className="h-8 text-xs font-semibold gap-1.5"
                                            disabled={savingManual}
                                            onClick={handleSaveManual}
                                        >
                                            {savingManual ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Save className="h-3.5 w-3.5" />
                                            )}
                                            <span>Save Changes</span>
                                        </Button>
                                    </div>
                                </div>
                                <Textarea
                                    value={editManualText}
                                    onChange={(e) => setEditManualText(e.target.value)}
                                    rows={26}
                                    className="font-mono text-xs leading-relaxed bg-black/40 border-border/50 resize-y"
                                />
                            </Card>
                        ) : (
                            <Card className="rounded-2xl border-border/50 bg-[#121218]/90 backdrop-blur-md p-6 sm:p-8 shadow-sm">
                                {manualLoading ? (
                                    <div className="space-y-4 py-8">
                                        <Skeleton className="h-8 w-64" />
                                        <Skeleton className="h-4 w-full" />
                                        <Skeleton className="h-4 w-5/6" />
                                        <Skeleton className="h-4 w-3/4" />
                                        <Skeleton className="h-32 w-full rounded-xl" />
                                    </div>
                                ) : (
                                    <div className="prose prose-invert max-w-none text-sm text-foreground
                                        [&>h1]:text-2xl [&>h1]:font-extrabold [&>h1]:text-sky-300 [&>h1]:mt-8 [&>h1]:mb-4 [&>h1]:border-b [&>h1]:border-border/40 [&>h1]:pb-3
                                        [&>h2]:text-xl [&>h2]:font-bold [&>h2]:text-emerald-300 [&>h2]:mt-6 [&>h2]:mb-3
                                        [&>h3]:text-base [&>h3]:font-semibold [&>h3]:text-amber-300 [&>h3]:mt-5 [&>h3]:mb-2
                                        [&>p]:text-muted-foreground [&>p]:leading-relaxed [&>p]:mb-3
                                        [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:mb-3 [&>ul]:space-y-1.5 [&>ul]:text-muted-foreground
                                        [&>ol]:list-decimal [&>ol]:pl-5 [&>ol]:mb-3 [&>ol]:space-y-1.5 [&>ol]:text-muted-foreground
                                        [&>li]:leading-relaxed
                                        [&>table]:w-full [&>table]:my-4 [&>table]:border-collapse [&>table]:text-xs
                                        [&_th]:border [&_th]:border-border/60 [&_th]:p-2.5 [&_th]:bg-muted/40 [&_th]:font-semibold [&_th]:text-foreground
                                        [&_td]:border [&_td]:border-border/40 [&_td]:p-2.5 [&_td]:text-muted-foreground
                                        [&>blockquote]:border-l-2 [&>blockquote]:border-primary [&>blockquote]:pl-4 [&>blockquote]:py-1.5 [&>blockquote]:my-4 [&>blockquote]:bg-primary/5 [&>blockquote]:rounded-r
                                        [&_code]:bg-muted/40 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-primary [&_code]:text-xs [&_code]:font-mono
                                        [&_pre]:bg-slate-900 [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-slate-800
                                        [&_hr]:border-muted/40 [&_hr]:my-6
                                        [&_a]:text-primary [&_a]:underline [&_a]:hover:text-primary/80"
                                    >
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {displayedManual || "*No manual content found.*"}
                                        </ReactMarkdown>
                                    </div>
                                )}
                            </Card>
                        )}
                    </div>
                ))}

                {/* TROUBLESHOOTING & ASSISTANCE FOOTER */}
                <Card className="rounded-2xl border-border/40 bg-gradient-to-r from-muted/20 via-background to-muted/20 p-6">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="space-y-1 text-center sm:text-left">
                            <h4 className="text-base font-bold text-foreground flex items-center gap-2 justify-center sm:justify-start">
                                <LifeBuoy className="h-4 w-4 text-primary" />
                                Still experiencing buffering or have questions?
                            </h4>
                            <p className="text-xs text-muted-foreground">
                                Test your connection with our built-in speed test, review live stream health in My Plex Hub, or ask our 24/7 AI Support bot.
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

function FeatureTopicRenderer({ topicId }: { topicId: FeatureGuideId }) {
    const topic: GuideTopic | undefined = GUIDE_TOPICS[topicId];
    if (!topic) return null;

    const TopicIcon = topic.icon;

    // Determine quick link button target based on topic
    const getQuickLink = () => {
        switch (topicId) {
            case "ai-assistant":
                return { href: "/#ai-assistant", label: "Launch AI Assistant" };
            case "movies-tv":
            case "requests-pipeline":
                return { href: "/discover", label: "Browse & Request Titles" };
            case "ebooks":
            case "kindle-setup":
                return { href: "/library", label: "Open Ebook Library" };
            case "audiobooks":
                return { href: "/library", label: "Open Audiobooks" };
            case "referral-rewards":
                return { href: "/settings/profile", label: "View Profile & Referrals" };
            case "curation-studio":
                return { href: "/curation/kometa", label: "Open Curation Studio" };
            default:
                return { href: "/", label: "Dashboard" };
        }
    };

    const link = getQuickLink();

    return (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
            {/* TOPIC BANNER */}
            <Card className="rounded-2xl border-border/50 bg-[#121218]/90 backdrop-blur-md shadow-sm">
                <CardHeader className="pb-4 border-b border-border/30">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                                    <TopicIcon className="h-5 w-5" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <CardTitle className="text-xl sm:text-2xl font-bold text-foreground">
                                            {topic.title}
                                        </CardTitle>
                                        <Badge variant="outline" className={`text-xs ${topic.badgeColor}`}>
                                            {topic.category}
                                        </Badge>
                                    </div>
                                    <CardDescription className="text-sm text-muted-foreground mt-1">
                                        {topic.subtitle}
                                    </CardDescription>
                                </div>
                            </div>
                        </div>

                        {link && (
                            <Button asChild size="sm" className="h-9 px-4 text-xs font-semibold gap-1.5 shadow-md">
                                <Link href={link.href}>
                                    <span>{link.label}</span>
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            </Button>
                        )}
                    </div>

                    {/* HIGHLIGHTS */}
                    {topic.highlights && topic.highlights.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pt-4">
                            {topic.highlights.map((h, idx) => (
                                <span 
                                    key={idx} 
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/[0.03] border border-white/[0.08] text-slate-200"
                                >
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                    <span>{h}</span>
                                </span>
                            ))}
                        </div>
                    )}
                </CardHeader>

                {/* DETAILED SECTIONS */}
                <CardContent className="pt-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {topic.sections.map((sec, idx) => (
                            <div 
                                key={idx} 
                                className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-primary/40 transition-all space-y-3 flex flex-col justify-between"
                            >
                                <div className="space-y-2.5">
                                    <div className="flex items-center gap-2.5 text-sm font-bold text-foreground">
                                        <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/15 text-primary text-xs font-extrabold shrink-0 border border-primary/20">
                                            {idx + 1}
                                        </span>
                                        <span>{sec.title}</span>
                                    </div>

                                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pl-8.5">
                                        {sec.desc}
                                    </p>

                                    {sec.bullets && sec.bullets.length > 0 && (
                                        <ul className="space-y-1.5 pl-12 list-disc text-xs text-slate-300">
                                            {sec.bullets.map((b, bIdx) => (
                                                <li key={bIdx} className="leading-relaxed">
                                                    {b}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                <div className="space-y-2 pt-2">
                                    {sec.proTip && (
                                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2.5">
                                            <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                                            <span className="leading-relaxed"><strong>Pro Tip:</strong> {sec.proTip}</span>
                                        </div>
                                    )}

                                    {sec.warning && (
                                        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-start gap-2.5">
                                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                                            <span className="leading-relaxed"><strong>Important:</strong> {sec.warning}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function GuidesLoadingSkeleton() {
    return (
        <div className="min-h-screen bg-background flex flex-col animate-in fade-in duration-300">
            <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full space-y-6">
                <div className="space-y-3">
                    <Skeleton className="h-8 w-40" />
                    <Skeleton className="h-10 w-96" />
                    <Skeleton className="h-5 w-2/3" />
                </div>
                <Skeleton className="h-14 w-full rounded-2xl" />
                <Skeleton className="h-28 w-full rounded-2xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Skeleton className="h-48 w-full rounded-2xl" />
                    <Skeleton className="h-48 w-full rounded-2xl" />
                </div>
            </main>
        </div>
    );
}

export default function GuidesPage() {
    return (
        <Suspense fallback={<GuidesLoadingSkeleton />}>
            <GuidesContent />
        </Suspense>
    );
}
