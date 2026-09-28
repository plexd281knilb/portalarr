"use client";

import { useState } from "react";
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription,
    DialogTrigger 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
    BookOpen, 
    Sparkles, 
    Bot, 
    Film, 
    Headphones, 
    Send, 
    Activity, 
    Gift, 
    Sliders, 
    ExternalLink, 
    CheckCircle2, 
    AlertCircle, 
    ArrowRight, 
    FileText, 
    Tv, 
    Zap, 
    Layers,
    Search,
    Inbox,
    Clock,
    Flame,
    Monitor,
    Shield
} from "lucide-react";
import Link from "next/link";

export type FeatureGuideId = 
    | "ai-assistant"
    | "movies-tv"
    | "ebooks"
    | "audiobooks"
    | "requests-pipeline"
    | "kindle-setup"
    | "stream-diagnostics"
    | "referral-rewards"
    | "curation-studio"
    | "general";

export interface GuideTopic {
    id: FeatureGuideId;
    title: string;
    subtitle: string;
    category: string;
    badgeColor: string;
    icon: any;
    highlights: string[];
    sections: {
        title: string;
        desc: string;
        icon?: any;
        bullets?: string[];
        proTip?: string;
        warning?: string;
    }[];
}

export const GUIDE_TOPICS: Record<FeatureGuideId, GuideTopic> = {
    "ai-assistant": {
        id: "ai-assistant",
        title: "Plex & Server Master AI Support Assistant",
        subtitle: "Automated media playback testing, stream health diagnostics, and smart audio track replacement.",
        category: "AI Support",
        badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/30",
        icon: Bot,
        highlights: [
            "Active byte-range physical disk read testing",
            "Transcode Doctor & device buffering diagnostics",
            "Automatic English audio release replacement",
            "1-click ticket escalation with telemetry snapshot"
        ],
        sections: [
            {
                title: "1. Pre-Playback File & Storage Read Testing",
                desc: "Ask the bot to test any specific movie or episode before you start streaming to verify physical disk readability and network latency:",
                bullets: [
                    'Try asking: "test to make sure The Sandlot runs on the main Plex server"',
                    'Try asking: "can you check if Gladiator (2000) is ready to play?"',
                    'Try asking: "is Dune available with English audio on the 4K server?"'
                ],
                proTip: "The AI agent performs an active HTTP Range probe (bytes=0-65535) directly against the storage part, reporting physical storage reachability and latency in milliseconds (e.g. 18ms)."
            },
            {
                title: "2. Real-Time Stream Health & Buffering Diagnostics",
                desc: "When playback buffers or quality drops, describe the symptom or paste the exact TV error message:",
                bullets: [
                    "Roku auto-adjust quality drop to 720p: Provides exact menu steps to lock original quality.",
                    "Audio transcode stutter: Identifies incompatible formats like TrueHD 7.1/DTS and guides you to secondary 5.1/Stereo tracks.",
                    "Subtitle burn buffering: Explains how to switch from image-based PGS/VOBSUB to text-based SRT subtitles."
                ]
            },
            {
                title: "3. Automated Audio Language Replacement",
                desc: "If a downloaded title has foreign-only audio (e.g. Spanish or French release with no English track), tell the bot: \"The Sandlot only has Spanish audio\".",
                bullets: [
                    "The bot inspects container audio streams to confirm the missing language.",
                    "It searches connected indexers via Radarr/Sonarr for a verified English audio release.",
                    "It auto-grabs the best replacement release and triggers download ingestion."
                ]
            },
            {
                title: "4. 1-Click Support Ticket Escalation",
                desc: "If an issue requires administrator intervention, click 'Open Ticket With This Diagnosis' to instantly submit a ticket pre-populated with active stream telemetry and AI diagnostics."
            }
        ]
    },
    "movies-tv": {
        id: "movies-tv",
        title: "Movies & TV Show Discovery & Requests",
        subtitle: "Native Seerr discovery engine, 1-click requests, 4K UHD quality toggles, and episode monitoring.",
        category: "Media Requests",
        badgeColor: "bg-sky-500/10 text-sky-400 border-sky-500/30",
        icon: Film,
        highlights: [
            "1-click movie requests directly to Radarr",
            "Granular season & episode monitoring in Sonarr",
            "Dedicated 4K UHD vs standard 1080p toggles",
            "Real-time availability badges and Discord/Email alerts"
        ],
        sections: [
            {
                title: "1. Discovering Trending & Recommended Titles",
                desc: "Browse dynamic carousels on /discover powered directly by TMDb and connected Plex libraries:",
                bullets: [
                    "Trending Movies & Trending TV Shows: Real-time popular titles updated daily.",
                    "Availability Badges: See immediately whether a title is Available (green), Partially Available (amber), Requested (blue), or Monitored.",
                    "Deep Details: Click any card for high-definition posters, trailers, cast/crew directory, ratings, and similar recommendations."
                ]
            },
            {
                title: "2. Requesting Movies (1080p vs 4K UHD)",
                desc: "Request any movie with a single click. If 4K is enabled for your account, toggle between Standard 1080p and Dedicated 4K UHD.",
                proTip: "4K UHD files require high bandwidth and compatible 4K HDR displays. Use Standard 1080p for older TVs, phones, or traveling."
            },
            {
                title: "3. Granular TV Series, Season & Episode Requests",
                desc: "You don't have to download an entire series if you only need specific seasons:",
                bullets: [
                    "All Seasons: Request the complete series with past, present, and future air dates.",
                    "Specific Seasons: Check exact season cards to download only the seasons you want.",
                    "Episode Monitoring: Expand seasons to view episode thumbnails, air dates, and individual monitoring switches."
                ]
            },
            {
                title: "4. Automated Download Pipeline & Notifications",
                desc: "All requests are automatically processed by Radarr/Sonarr and sent to download clients. You receive real-time notifications via Discord embed cards and styled HTML emails."
            },
            {
                title: "5. Ebooks & Audiobooks Discovery",
                desc: "Discover is your all-in-one hub for books and audiobooks too! Browse Popular Books, Trending Audiobooks, and 'Missing from Your Series' carousels. Click any book to view chapter/volume details, author catalogs, or request with 1-click auto-approval and automatic Send-to-Kindle delivery."
            }
        ]
    },
    "ebooks": {
        id: "ebooks",
        title: "Ebooks, Comics & In-Browser Kindle Reader",
        subtitle: "Kindle Paperwhite reading experience, comic book streaming, series discovery, and Send-to-Kindle.",
        category: "Reading",
        badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
        icon: BookOpen,
        highlights: [
            "In-browser Kindle Paperwhite reader with Bookerly font",
            "0ms CacheStorage reopening for offline reading",
            "Unified Discover Hub (/discover) with 1-click requests",
            "Auto Send-to-Kindle upon download completion",
            "Series tracking, 'Show Missing Books' & 1-click Auto-Grab"
        ],
        sections: [
            {
                title: "1. In-Browser Kindle Paperwhite Reading Experience",
                desc: "Click 'Read' or 'Resume (X%)' on any EPUB to launch the distraction-free reader:",
                bullets: [
                    "0ms Instant Reopening: Books are stored in your browser's persistent cache for instant offline access.",
                    "Reading Speed Estimation: Displays 'X mins left in chapter' and 'Y hrs Z mins left in book'.",
                    "Kindle Aa Controls: Choose Bookerly (Kindle Serif), Ember (Sans), or Monospace; adjust margins, line height, and Night/Sepia/Day themes.",
                    "Tappable Status Footer: Tap the footer bar to cycle between Time Left, Page, Location, and Percentage."
                ]
            },
            {
                title: "2. Discovering & Requesting Books (/discover)",
                desc: "Requesting books and audiobooks is fully integrated into the Discover and Requests hub:",
                bullets: [
                    "Unified Discover Hub: Browse Popular Books, Trending Audiobooks, or search by title, author, or series across Audible, iTunes, OpenLibrary, and Google Books.",
                    "1-Click Requests: Click 'Request Ebook' or 'Request Audiobook' on any title. All requests are auto-approved instantly!",
                    "Auto Send-to-Kindle: When an ebook finishes downloading, DomsHomeLab automatically emails it directly to your Kindle if your Kindle email is configured.",
                    "Format Standardization: Non-EPUB files (MOBI, AZW3, PDF) are auto-converted to clean EPUBs, and redundant legacy formats are pruned."
                ]
            },
            {
                title: "3. Comic & Graphic Novel Streaming",
                desc: "Read .cbr, .cbz, and image archive comics directly in your browser with zero conversion lag:",
                bullets: [
                    "WebAssembly unrar & JSZip: Decompresses archive pages on-the-fly.",
                    "Display Modes: Fit-to-Width, Fit-to-Height, and Original resolution.",
                    "Keyboard Navigation: Use Arrow Keys, Spacebar, or the bottom thumbnail scrubber."
                ]
            },
            {
                title: "4. Series Tracking & Missing Books Auto-Grab",
                desc: "Group shelves by series to organize installments sequentially:",
                bullets: [
                    "Click 'Show Missing Books' on any series to discover unacquired volumes (Vol 1, Vol 2, Vol 3...).",
                    "Click 'Auto-Grab' to automatically search indexers and download missing books.",
                    "Missing books appear as grayscale stubs on your shelf until downloaded."
                ]
            },
            {
                title: "5. Wireless Send-to-Kindle Delivery",
                desc: "Click the Kindle icon on any book card to wirelessly dispatch standardized EPUB files directly to your Amazon account, or let new requests auto-deliver upon completion."
            }
        ]
    },
    "audiobooks": {
        id: "audiobooks",
        title: "Audiobooks & Chapter Studio",
        subtitle: "Built-in floating web player, interactive chapter selection, and physical disk track reordering.",
        category: "Audiobooks",
        badgeColor: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
        icon: Headphones,
        highlights: [
            "Floating web player pinned at the bottom of the screen",
            "Continuous autoplay next chapter with speed memory",
            "Interactive Chapter Selector modal",
            "Reorder and rename audio tracks directly on disk"
        ],
        sections: [
            {
                title: "1. Floating Web Audio Player",
                desc: "Click Play on any audiobook to begin streaming immediately:",
                bullets: [
                    "Pinned Bottom Bar: Listen uninterrupted while browsing other libraries, requests, and settings.",
                    "Continuous Autoplay: Automatically advances to the next chapter track when the current track finishes.",
                    "HTTP Range Streaming: Scrub and seek instantly without downloading multi-gigabyte audio files.",
                    "Speed & Volume Memory: Remembers your preferred playback speed (1.0x, 1.25x, 1.5x, 2.0x) and volume."
                ]
            },
            {
                title: "2. Interactive Chapter Selector",
                desc: "Click 'Listen & Chapters' on any audiobook card to view all detected chapter tracks, jump directly to any track, or view duration and bitrates."
            },
            {
                title: "3. Reorder & Edit Chapters on Disk",
                desc: "Need to correct track numbering or chapter sequence?",
                bullets: [
                    "Click '✏️ Reorder & Edit Chapters' inside the Chapter Selector Modal.",
                    "Use Up / Down buttons or edit track numbers directly.",
                    "Click 'Save Order' to physically rename and synchronize track files on disk for all users."
                ],
                proTip: "Multi-disc audiobooks (e.g. Disc 01/, Disc 02/) and multi-track chapters are automatically consolidated into a single card with total duration."
            }
        ]
    },
    "requests-pipeline": {
        id: "requests-pipeline",
        title: "Book Requests & Download Pipeline",
        subtitle: "Multi-source registry search, interactive release selection, and 1-click download folder import.",
        category: "Pipeline",
        badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/30",
        icon: Inbox,
        highlights: [
            "Combined Title & Author registry autocomplete",
            "Prowlarr multi-tier Torznab search engine",
            "Interactive Release Chooser modal",
            "1-click manual download folder import"
        ],
        sections: [
            {
                title: "1. Multi-Source Title & Author Discovery",
                desc: "Request new books or audiobooks with verified metadata in seconds:",
                bullets: [
                    "Combined Search: Enter title and author (e.g. 'Project Hail Mary Andy Weir') for instant ranked matches.",
                    "Multi-Registry Verification: Queries Audible, iTunes, OpenLibrary, and Google Books simultaneously.",
                    "Format Selection: Toggle between 📖 Ebook and 🎧 Audiobook."
                ]
            },
            {
                title: "2. Interactive Release Chooser",
                desc: "If an auto-grab misses or you want a specific narrator or quality group:",
                bullets: [
                    "Click '🔍 Search Release' on any request card to inspect indexer results.",
                    "Compare file sizes, seeders, Usenet vs Torrent protocols, and upload age.",
                    "Click 'Push Release' (📥) to dispatch that exact release to SABnzbd or qBittorrent."
                ]
            },
            {
                title: "3. 1-Click Manual Download Import",
                desc: "If a download finished in your client but hasn't appeared on your shelf, click '📥 Import Download'. The system scans completed folders, copies the files, and organizes them automatically."
            }
        ]
    },
    "kindle-setup": {
        id: "kindle-setup",
        title: "Wireless Send-to-Kindle Setup",
        subtitle: "Configure Amazon approved sender emails, run pre-flight diagnostics, and manage delivery logs.",
        category: "E-Readers",
        badgeColor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
        icon: Send,
        highlights: [
            "1-click wireless delivery of EPUB files to Kindle",
            "Step-by-step Amazon approved senders whitelist guide",
            "Pre-flight delivery configuration test",
            "Delivery history logs with 1-click retry"
        ],
        sections: [
            {
                title: "1. Find Your Kindle Email Address",
                desc: "Log into Amazon → Account & Lists → Content & Devices → Preferences → Personal Document Settings. Your device email ends in @kindle.com."
            },
            {
                title: "2. Whitelist DomsHomeLab's Sender Email",
                desc: "Under 'Approved Personal Document E-mail List' on Amazon, click 'Add a new approved e-mail address' and add the server sender address shown in your Kindle Settings tab.",
                warning: "Amazon silently discards emails sent from unauthorized addresses. You must add the sender email before your first delivery!"
            },
            {
                title: "3. Run Pre-Flight Diagnostics Check",
                desc: "Click 'Run Pre-Flight Delivery Check' in the Kindle Settings tab to verify SMTP connectivity, address syntax, and file size limits before sending books."
            },
            {
                title: "4. Outbound Delivery Logs & Retries",
                desc: "View timestamps, status (Delivered vs Failed), and error details for all sent books in the Kindle Delivery History panel. Click 'Retry Delivery' to re-attempt anytime."
            }
        ]
    },
    "stream-diagnostics": {
        id: "stream-diagnostics",
        title: "Stream Diagnostics & Speed Test",
        subtitle: "Understand Direct Play vs Transcode, Transcode Doctor fixes, and in-browser bandwidth tests.",
        category: "Streaming",
        badgeColor: "bg-rose-500/10 text-rose-400 border-rose-500/30",
        icon: Activity,
        highlights: [
            "Direct Play vs Transcode telemetry monitoring",
            "Transcode Doctor tailored root-cause analysis",
            "In-browser server speed test and latency measurement",
            "User self-service stream termination"
        ],
        sections: [
            {
                title: "1. The Direct Play Golden Rule",
                desc: "Direct Play streams the original studio file directly to your screen with zero CPU/GPU overhead. Transcoding re-encodes the stream on-the-fly and can cause buffering if bandwidth or hardware is constrained.",
                proTip: "Always set 'Remote Streaming Quality' to 'Maximum' or 'Original' in your Plex player app to prevent automatic 720p transcoding."
            },
            {
                title: "2. Transcode Doctor Diagnostics",
                desc: "Click 'Transcode Doctor' on any active playback card to see exactly why transcoding is occurring:",
                bullets: [
                    "Audio Codec Incompatibility: Player cannot decode TrueHD 7.1/DTS-HD; switch to secondary 5.1/Stereo track.",
                    "Subtitle Burn: Player cannot render PGS/VOBSUB images; switch to text-based SRT subtitles.",
                    "Bandwidth Cap: Client app is capped at 2 Mbps or 4 Mbps; increase remote quality to Original."
                ]
            },
            {
                title: "3. In-Browser Server Speed Test",
                desc: "Click the 'Speed Test' (⚡) button in My Plex Hub to measure real-time download bandwidth and latency between your device and the media server."
            },
            {
                title: "4. Stopping Stuck or Ghost Streams",
                desc: "If an app crashed or was left running, click 'Stop Stream' (⏹️) on your playback card to safely terminate the session and free up server bandwidth."
            }
        ]
    },
    "referral-rewards": {
        id: "referral-rewards",
        title: "Memberships & Referral Rewards",
        subtitle: "Earn 1 free month per friend referred, annual vs monthly pricing, and managed family profiles.",
        category: "Membership",
        badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/30",
        icon: Gift,
        highlights: [
            "Earn 1 free month ($15.00 discount) per friend who joins",
            "Annual Pass ($180/yr) vs Flexible Monthly ($17.50/mo)",
            "P2P payments (Venmo, PayPal, Cash App, Zelle)",
            "Living Room TV & Kids PG-curated profiles"
        ],
        sections: [
            {
                title: "1. Referral Rewards: Earn 1 Free Month Per Friend",
                desc: "Share your personal invite link (/join?ref=YOUR_CODE) with friends and family:",
                bullets: [
                    "Annual Subscribers: Receive $15.00 off your upcoming annual renewal per friend ($180 - $15 = $165.00 for 1 friend; $180 - $30 = $150.00 for 2 friends; 12 friends = 100% FREE YEAR).",
                    "Monthly Subscribers: Your monthly billing is delayed by +1 full month per converted friend.",
                    "Live Statement Preview: View exact calculated renewal discounts directly on your Profile page."
                ]
            },
            {
                title: "2. Membership Plans & Cadences",
                desc: "Choose the cadence that fits your viewing habits:",
                bullets: [
                    "Rest-of-Year Annual Pass ($180/year): Best value ($15.00/month base). Prorated to only charge for remaining days and full months in the current year.",
                    "Flexible Monthly Plan ($17.50/month): Flexible pay-as-you-go month-to-month access with zero long-term commitment."
                ]
            },
            {
                title: "3. Direct P2P Payments & Automatic Matching",
                desc: "Renew seamlessly via Venmo, PayPal, Cash App, or Zelle with zero processing fees. Include your username in the payment note/memo for instant automatic matching."
            },
            {
                title: "4. Managed Living Room & Kids Profiles",
                desc: "Unlock dedicated sub-profiles for your household: Living Room TV profile with content safety filters, and Kids profile locked strictly to G/PG ratings."
            }
        ]
    },
    "curation-studio": {
        id: "curation-studio",
        title: "Server Curation Studio Suite (Admin)",
        subtitle: "Kometa poster overlays, Agregarr smart hubs, Maintainerr storage pruning, and Tagging studio.",
        category: "Admin Suite",
        badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/30",
        icon: Sliders,
        highlights: [
            "Kometa Overlays: 4K HDR badges, Dolby Vision, audio ribbons",
            "Agregarr: Trakt/TMDb dynamic trending hubs & collections",
            "Maintainerr: Automated disk storage reclamation rules",
            "Tagging Studio: Batch library tagging & parental labels"
        ],
        sections: [
            {
                title: "1. Kometa Overlays Studio",
                desc: "Apply high-definition badges, 4K HDR ribbons, Dolby Vision/Atmos labels, and audio codecs to movie and TV posters with live canvas preview before applying."
            },
            {
                title: "2. Agregarr Smart Home Hubs",
                desc: "Sync dynamic trending hubs, smart collections, and discovery rows linked directly with Trakt, TMDb, and IMDb charts. Promote custom hubs to shared home screens."
            },
            {
                title: "3. Maintainerr Prune Engine",
                desc: "Set disk space recovery rules, detect unwatched media, stage items in 'Leaving Soon' with countdown posters, and automatically reclaim storage."
            },
            {
                title: "4. Tagging Studio",
                desc: "Batch assign custom tags, age rating filters, and parental guide labels across Plex libraries to prepare for user shelf controls."
            }
        ]
    },
    "general": {
        id: "general",
        title: "DomsHomeLab Mission Control Guide",
        subtitle: "Complete overview of the media portal, Plex hub, digital libraries, and support systems.",
        category: "Overview",
        badgeColor: "bg-sky-500/10 text-sky-400 border-sky-500/30",
        icon: Sparkles,
        highlights: [
            "Unified Plex & Tautulli stream mission control",
            "Digital Ebook & Audiobook reading/listening suites",
            "AI Assistant with active playback storage testing",
            "Native movie & TV discovery and request engine"
        ],
        sections: [
            {
                title: "1. Navigation & Mission Control",
                desc: "DomsHomeLab centralizes your entire media server ecosystem into one modern portal:",
                bullets: [
                    "Dashboard (/): Active streams, watch analytics, server health, speed test, and AI assistant.",
                    "Discover (/discover): Trending movies & TV shows, availability badges, 1-click requests.",
                    "Library (/library): Ebooks, Audiobooks, Kindle delivery, and request pipelines.",
                    "Guides (/guides): Interactive device setup guides and system manuals."
                ]
            },
            {
                title: "2. Need Help or Assistance?",
                desc: "Click the Support icon in the navigation bar to submit a ticket or ask the built-in AI Assistant for immediate step-by-step guidance."
            }
        ]
    }
};

interface FeatureGuideModalProps {
    guideId?: FeatureGuideId;
    triggerText?: string;
    triggerVariant?: "default" | "outline" | "ghost" | "secondary";
    triggerSize?: "default" | "sm" | "lg" | "icon";
    className?: string;
    showIcon?: boolean;
    customTrigger?: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export default function FeatureGuideModal({
    guideId = "general",
    triggerText,
    triggerVariant = "outline",
    triggerSize = "sm",
    className = "",
    showIcon = true,
    customTrigger,
    open: controlledOpen,
    onOpenChange: setControlledOpen
}: FeatureGuideModalProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const [activeGuideId, setActiveGuideId] = useState<FeatureGuideId>(guideId);

    const isControlled = typeof controlledOpen === "boolean";
    const isOpen = isControlled ? controlledOpen : internalOpen;
    const setIsOpen = isControlled ? setControlledOpen! : setInternalOpen;

    const currentTopic = GUIDE_TOPICS[activeGuideId] || GUIDE_TOPICS["general"];
    const TopicIcon = currentTopic.icon || BookOpen;

    const defaultTriggerLabel = triggerText || (
        guideId === "ai-assistant" ? "AI Guide" :
        guideId === "movies-tv" ? "Request Guide" :
        guideId === "ebooks" ? "Ebooks Guide" :
        guideId === "audiobooks" ? "Audio Guide" :
        guideId === "requests-pipeline" ? "Pipeline Guide" :
        guideId === "kindle-setup" ? "Kindle Guide" :
        guideId === "stream-diagnostics" ? "Diagnostics Guide" :
        guideId === "referral-rewards" ? "Referral Guide" :
        guideId === "curation-studio" ? "Curation Guide" :
        "Feature Guide"
    );

    return (
        <Dialog open={isOpen} onOpenChange={(val) => {
            setIsOpen(val);
            if (val && guideId) {
                setActiveGuideId(guideId);
            }
        }}>
            {customTrigger ? (
                <DialogTrigger asChild>
                    {customTrigger}
                </DialogTrigger>
            ) : (
                <DialogTrigger asChild>
                    <Button 
                        variant={triggerVariant} 
                        size={triggerSize} 
                        className={`h-8 text-xs font-semibold gap-1.5 border-border/60 hover:border-primary/50 hover:bg-primary/10 transition-all active:scale-95 shadow-sm ${className}`}
                        title={`Open ${currentTopic.title}`}
                    >
                        {showIcon && <BookOpen className="h-3.5 w-3.5 text-primary" />}
                        <span>{defaultTriggerLabel}</span>
                    </Button>
                </DialogTrigger>
            )}

            <DialogContent className="w-[95vw] sm:w-[92vw] md:w-[90vw] max-w-3xl lg:max-w-4xl max-h-[90vh] sm:max-h-[92vh] overflow-y-auto overflow-x-hidden p-0 bg-[#0c0c12] border border-border/60 shadow-2xl rounded-2xl sm:rounded-3xl scrollbar-thin text-foreground">
                <div className="flex flex-col min-h-0 min-w-0 w-full overflow-x-hidden">
                    
                    {/* MODAL HEADER */}
                    <DialogHeader className="p-5 sm:p-6 pb-4 border-b border-border/40 bg-gradient-to-b from-white/[0.03] to-transparent">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="space-y-1.5 min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Badge variant="outline" className={`text-[10px] px-2 py-0.5 font-semibold uppercase tracking-wider ${currentTopic.badgeColor}`}>
                                        {currentTopic.category}
                                    </Badge>
                                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                        <Sparkles className="h-3 w-3 text-amber-400" /> Interactive Feature Guide
                                    </span>
                                </div>
                                <DialogTitle className="text-lg sm:text-xl font-extrabold tracking-tight flex items-center gap-2 text-foreground">
                                    <div className="p-1.5 rounded-lg bg-primary/15 border border-primary/30 text-primary shrink-0">
                                        <TopicIcon className="h-4 w-4" />
                                    </div>
                                    <span className="truncate">{currentTopic.title}</span>
                                </DialogTitle>
                                <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-2">
                                    {currentTopic.subtitle}
                                </DialogDescription>
                            </div>
                        </div>

                        {/* QUICK TOPIC SWITCHER BAR */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pt-3 pb-1 scrollbar-thin w-full">
                            {(Object.keys(GUIDE_TOPICS) as FeatureGuideId[]).map((tId) => {
                                const t = GUIDE_TOPICS[tId];
                                const isSelected = tId === activeGuideId;
                                return (
                                    <button
                                        key={tId}
                                        type="button"
                                        onClick={() => setActiveGuideId(tId)}
                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all shrink-0 cursor-pointer ${
                                            isSelected 
                                                ? "bg-primary text-primary-foreground shadow-sm" 
                                                : "bg-white/[0.03] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground border border-white/[0.04]"
                                        }`}
                                    >
                                        {t.category}
                                    </button>
                                );
                            })}
                        </div>
                    </DialogHeader>

                    {/* MODAL BODY */}
                    <div className="p-5 sm:p-6 space-y-6">
                        
                        {/* KEY HIGHLIGHTS BAR */}
                        {currentTopic.highlights && currentTopic.highlights.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                                {currentTopic.highlights.map((h, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-xs text-foreground">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                        <span className="truncate">{h}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* DETAILED SECTIONS */}
                        <div className="space-y-4">
                            {currentTopic.sections.map((sec, idx) => (
                                <div key={idx} className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2.5">
                                    <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                                        <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/20 text-primary text-[10px] font-extrabold shrink-0">
                                            {idx + 1}
                                        </span>
                                        <span>{sec.title}</span>
                                    </h4>
                                    
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        {sec.desc}
                                    </p>

                                    {sec.bullets && sec.bullets.length > 0 && (
                                        <ul className="space-y-1.5 pl-6 list-disc text-xs text-slate-300">
                                            {sec.bullets.map((b, bIdx) => (
                                                <li key={bIdx} className="leading-relaxed">
                                                    {b}
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    {sec.proTip && (
                                        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2 mt-2">
                                            <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                                            <span className="leading-relaxed"><strong>Pro Tip:</strong> {sec.proTip}</span>
                                        </div>
                                    )}

                                    {sec.warning && (
                                        <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-start gap-2 mt-2">
                                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                                            <span className="leading-relaxed"><strong>Important:</strong> {sec.warning}</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* FOOTER ACTIONS */}
                        <div className="pt-3 border-t border-border/40 flex flex-wrap items-center justify-between gap-3 text-xs">
                            <Button asChild variant="outline" size="sm" className="h-8 text-xs font-semibold gap-1.5 border-border/60 hover:border-primary/40">
                                <Link href="/guides" onClick={() => setIsOpen(false)}>
                                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span>Browse All Guides Center</span>
                                </Link>
                            </Button>

                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 text-xs font-semibold text-muted-foreground hover:text-foreground"
                                onClick={() => setIsOpen(false)}
                            >
                                Close Guide
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
