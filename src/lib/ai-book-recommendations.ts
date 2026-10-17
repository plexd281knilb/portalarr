import prisma from "@/lib/prisma";
import { UserReadingProfile, BookRecommendationItem } from "@/lib/ai-server-assistant-types";

// ============================================================================
// CURATED AUTHOR & UNIVERSE AFFINITY CLUSTERS
// High-confidence taste mappings connecting author styles, themes, and sub-genres
// ============================================================================

interface AuthorAffinityGroup {
    genre: string;
    description: string;
    authors: string[];
    sampleThemes: string[];
    topRecommendations: Array<{
        title: string;
        author: string;
        series?: string;
        mediaType: "ebook" | "audiobook";
        pitch: string;
    }>;
}

const AUTHOR_AFFINITY_CLUSTERS: AuthorAffinityGroup[] = [
    {
        genre: "Sci-Fi Space Opera & Epic World-Building",
        description: "Expansive multi-planetary sagas, political intrigue, massive universe-building, and high-stakes dynasties.",
        authors: [
            "frank herbert", "isaac asimov", "arthur c. clarke", "dan simmons", "adrian tchaikovsky",
            "alastair reynolds", "james s.a. corey", "pierce brown", "iain m. banks", "peter f. hamilton",
            "vernor vinge", "ann leckie", "arkady martine", "c.j. cherryh", "brian herbert"
        ],
        sampleThemes: ["space opera", "galactic empire", "politics", "planetary ecology", "future dynasties"],
        topRecommendations: [
            { title: "Hyperion", author: "Dan Simmons", series: "Hyperion Cantos", mediaType: "ebook", pitch: "A breathtaking space opera masterpiece with Canterbury Tales structure and immense literary depth." },
            { title: "Children of Time", author: "Adrian Tchaikovsky", series: "Children of Time", mediaType: "ebook", pitch: "Epic evolutionary sci-fi tracking humanity's remnants colliding with an uplifting alien civilization." },
            { title: "Leviathan Wakes", author: "James S.A. Corey", series: "The Expanse", mediaType: "ebook", pitch: "Gritty, grounded solar system space noir with high-stakes geopolitical tension." },
            { title: "Red Rising", author: "Pierce Brown", series: "Red Rising Saga", mediaType: "ebook", pitch: "Adrenaline-fueled dystopian sci-fi blending Roman aesthetics with ruthless revolutionary rebellion." },
            { title: "Foundation", author: "Isaac Asimov", series: "Foundation", mediaType: "ebook", pitch: "The definitive mathematical and historical epic of galactic civilizational collapse and rebirth." }
        ]
    },
    {
        genre: "Hard Sci-Fi, Survival & Speculative Tech",
        description: "Clever science-backed problem solving, deep space survival, mind-bending quantum mysteries, and AI.",
        authors: [
            "andy weir", "blake crouch", "dennis e. taylor", "martha wells", "john scalzi",
            "neal stephenson", "cixin liu", "liu cixin", "ted chiang", "hugh howey",
            "michael crichton", "greg egan", "charles stross", "mary robinette kowal"
        ],
        sampleThemes: ["hard sci-fi", "space survival", "quantum physics", "multiverse", "murderbot", "humor"],
        topRecommendations: [
            { title: "Project Hail Mary", author: "Andy Weir", mediaType: "audiobook", pitch: "A brilliant, funny, high-science interstellar survival mission with an unforgettable alien friendship." },
            { title: "Dark Matter", author: "Blake Crouch", mediaType: "ebook", pitch: "A pulse-pounding quantum mechanics thriller about alternate paths and desperate parallel universe pursuit." },
            { title: "We Are Legion (We Are Bob)", author: "Dennis E. Taylor", series: "Bobiverse", mediaType: "audiobook", pitch: "Hilarious, scientifically grounded exploration of a cloned sentient space probe exploring the cosmos." },
            { title: "All Systems Red", author: "Martha Wells", series: "The Murderbot Diaries", mediaType: "ebook", pitch: "Snarky, relatable, action-packed adventures of a self-hacked security android who just wants to watch soap operas." },
            { title: "The Three-Body Problem", author: "Cixin Liu", series: "Remembrance of Earth's Past", mediaType: "ebook", pitch: "Monumental, mind-expanding cosmic hard sci-fi exploring first contact and game theory." }
        ]
    },
    {
        genre: "Epic & High Fantasy",
        description: "Vast magic systems, sweeping military campaigns, rich lore, and multi-book character journeys.",
        authors: [
            "brandon sanderson", "robert jordan", "patrick rothfuss", "george r.r. martin", "robin hobb",
            "joe abercrombie", "steven erikson", "brian mcclellan", "scott lynch", "brent weeks",
            "michael j. sullivan", "tad williams", "guy gavriel kay", "john gwynne", "james islington"
        ],
        sampleThemes: ["hard magic", "epic fantasy", "cosmere", "swords", "knights", "chosen one", "grimdark"],
        topRecommendations: [
            { title: "The Way of Kings", author: "Brandon Sanderson", series: "The Stormlight Archive", mediaType: "ebook", pitch: "The pinnacle of modern high fantasy with intricate magic, honorable knights, and shattering reveals." },
            { title: "Mistborn: The Final Empire", author: "Brandon Sanderson", series: "Mistborn", mediaType: "ebook", pitch: "A thrilling heist fantasy in a world where the dark lord already won and ash falls from the sky." },
            { title: "The Blade Itself", author: "Joe Abercrombie", series: "The First Law", mediaType: "audiobook", pitch: "Sharply witty, subversively dark character studies with unmatched dialogue and brutal combat." },
            { title: "The Name of the Wind", author: "Patrick Rothfuss", series: "The Kingkiller Chronicle", mediaType: "ebook", pitch: "Lyrical, masterfully told legend of a gifted musician, arcanist, and adventurer." },
            { title: "The Will of the Many", author: "James Islington", series: "Hierarchy", mediaType: "ebook", pitch: "A cunning academy fantasy set in a ruthless Roman-inspired empire where willpower is literal currency." }
        ]
    },
    {
        genre: "Urban Fantasy & Supernatural Mysteries",
        description: "Modern cities hiding magical undergrounds, wizard detectives, folklore, and occult investigations.",
        authors: [
            "jim butcher", "neil gaiman", "ben aaronovitch", "patricia briggs", "ilona andrews",
            "kevin hearne", "benedict jacka", "seanan mcguire", "richard kadrey", "charles de lint"
        ],
        sampleThemes: ["urban fantasy", "wizard detective", "chicago", "london", "mythology", "vampires", "fae"],
        topRecommendations: [
            { title: "Storm Front", author: "Jim Butcher", series: "The Dresden Files", mediaType: "audiobook", pitch: "Harry Dresden, Chicago's only wizard-for-hire, takes on grisly demonic mob crimes." },
            { title: "Rivers of London", author: "Ben Aaronovitch", series: "Rivers of London", mediaType: "ebook", pitch: "A London police constable discovers the secret division handling wizardry, spirits, and river gods." },
            { title: "Neverwhere", author: "Neil Gaiman", mediaType: "ebook", pitch: "A subterranean labyrinth of magic and perils underneath the streets of London." },
            { title: "Magic Bites", author: "Ilona Andrews", series: "Kate Daniels", mediaType: "ebook", pitch: "High-octane urban fantasy in a ruined, shifting Atlanta dominated by magical flare-ups." }
        ]
    },
    {
        genre: "Thrillers, Espionage & Crime Suspense",
        description: "Tight pacing, investigator intellect, conspiracy unmasking, and edge-of-your-seat suspense.",
        authors: [
            "lee child", "michael connelly", "david baldacci", "gillian flynn", "stieg larsson",
            "james patterson", "john grisham", "lucy foley", "harlan coben", "daniel silva",
            "vince flynn", "brad thor", "richard osman", "tana french", "anthony horowitz"
        ],
        sampleThemes: ["jack reacher", "detective", "murder mystery", "fbi", "cia", "assassin", "whodunit"],
        topRecommendations: [
            { title: "Killing Floor", author: "Lee Child", series: "Jack Reacher", mediaType: "ebook", pitch: "The iconic, bone-crunching debut of ex-military investigator Jack Reacher." },
            { title: "The Girl with the Dragon Tattoo", author: "Stieg Larsson", series: "Millennium", mediaType: "ebook", pitch: "A dark, labyrinthine Scandinavian family disappearance thriller pairing an investigative journalist and a genius hacker." },
            { title: "The Thursday Murder Club", author: "Richard Osman", series: "Thursday Murder Club", mediaType: "audiobook", pitch: "Witty, heartwarming, razor-sharp retirement village mystery quartet solving cold cases." },
            { title: "Gone Girl", author: "Gillian Flynn", mediaType: "ebook", pitch: "The definitive unreliable narrator psychological thriller dissecting toxic marriage and media frenzy." }
        ]
    },
    {
        genre: "Horror, Haunted & Dark Fiction",
        description: "Creeping dread, psychological torment, isolated gothic settings, and cosmic supernatural horror.",
        authors: [
            "stephen king", "dean koontz", "shirley jackson", "clive barker", "peter straub",
            "paul tremblay", "grady hendrix", "joe hill", "adam nevill", "catriona ward"
        ],
        sampleThemes: ["horror", "haunted house", "supernatural", "psychological", "small town dread"],
        topRecommendations: [
            { title: "The Shining", author: "Stephen King", mediaType: "ebook", pitch: "The claustrophobic, winter-bound descent into madness at the Overlook Hotel." },
            { title: "The Haunting of Hill House", author: "Shirley Jackson", mediaType: "ebook", pitch: "The foundational psychological haunted house classic of terror and isolation." },
            { title: "Heart-Shaped Box", author: "Joe Hill", mediaType: "ebook", pitch: "A terrifying modern ghost story about an aging rock star who buys a dead man's suit online." },
            { title: "The Southern Book Club's Guide to Slaying Vampires", author: "Grady Hendrix", mediaType: "audiobook", pitch: "Hilarious, deeply gruesome 90s suburban Southern Gothic vampire confrontation." }
        ]
    },
    {
        genre: "Romantasy & Modern Romance",
        description: "High-heat fantasy kingdoms, deadly trials, witty banter, and swoon-worthy slow-burn romance.",
        authors: [
            "sarah j. maas", "rebecca yarros", "ali hazelwood", "emily henry", "colleen hoover",
            "ana huang", "carissa broadbent", "jennifer l. armentrout", "tracy wolff", "stephanie garber"
        ],
        sampleThemes: ["romantasy", "dragons", "fae", "enemies to lovers", "trials", "magic", "slow burn"],
        topRecommendations: [
            { title: "Fourth Wing", author: "Rebecca Yarros", series: "The Empyrean", mediaType: "ebook", pitch: "Deadly dragon-riding military college where cadets bond with ferocious dragons or die trying." },
            { title: "A Court of Thorns and Roses", author: "Sarah J. Maas", series: "ACOTAR", mediaType: "ebook", pitch: "Immense, seductive faerie courts and high-stakes magical politics in a mortal huntress's journey." },
            { title: "The Serpent and the Wings of Night", author: "Carissa Broadbent", series: "Crowns of Nyaxia", mediaType: "ebook", pitch: "Cutthroat vampire tournament with lethal trials and dangerous romantic alliances." },
            { title: "Love Hypothesis", author: "Ali Hazelwood", mediaType: "ebook", pitch: "Charming, witty academic fake-dating romance between a biology PhD student and an intimidating professor." }
        ]
    },
    {
        genre: "Thought-Provoking Non-Fiction & Tech",
        description: "Engrossing biographies, human history, behavioral psychology, and world-changing technology.",
        authors: [
            "walter isaacson", "yuval noah harari", "malcolm gladwell", "bill bryson", "michael lewis",
            "ashlee vance", "carl sagan", "james clear", "david grann", "robert kolker"
        ],
        sampleThemes: ["biography", "history", "habits", "science", "space exploration", "ai", "silicon valley"],
        topRecommendations: [
            { title: "Sapiens: A Brief History of Humankind", author: "Yuval Noah Harari", mediaType: "audiobook", pitch: "A riveting exploration of how an insignificant ape became the master of planet Earth." },
            { title: "Atomic Habits", author: "James Clear", mediaType: "ebook", pitch: "The definitive, practical framework for tiny changes that compound into remarkable life results." },
            { title: "Steve Jobs", author: "Walter Isaacson", mediaType: "audiobook", pitch: "The gripping, unvarnished biography of the visionary who revolutionized six industries." },
            { title: "The Demon-Haunted World: Science as a Candle in the Dark", author: "Carl Sagan", mediaType: "ebook", pitch: "A passionate defense of scientific skepticism and wonder in an age of superstition." }
        ]
    }
];

// ============================================================================
// 1. EXTRACT USER READING & REQUEST PROFILE
// Aggregates user requests, Kindle deliveries, and consumption patterns
// ============================================================================

export async function getUserReadingAndRequestProfile(user: any): Promise<UserReadingProfile> {
    const safeUsername = String(user?.username || "").trim();
    const safeEmail = String(user?.email || "").trim();
    const userId = user?.id ? String(user.id) : undefined;

    let enabledAddons: string[] = [];
    try {
        if (typeof user?.enabledAddons === "string") {
            enabledAddons = JSON.parse(user.enabledAddons);
        } else if (Array.isArray(user?.enabledAddons)) {
            enabledAddons = user.enabledAddons;
        }
    } catch (e) {}

    const kindleEmail = user?.kindleEmail || "";

    // 1. Query unified MediaRequest table for books & audiobooks
    const mediaRequests = await prisma.mediaRequest.findMany({
        where: {
            OR: [
                ...(safeUsername ? [{ requestedByUsername: safeUsername }] : []),
                ...(userId ? [{ requestedByUserId: userId }] : [])
            ],
            mediaType: { in: ["book", "audiobook"] }
        },
        orderBy: { createdAt: "desc" },
        take: 30
    }).catch(() => []);

    // 2. Query legacy/direct BookRequest table
    const bookRequests = await prisma.bookRequest.findMany({
        where: {
            OR: [
                ...(safeUsername ? [{ requestedBy: safeUsername }] : []),
                ...(userId ? [{ requestedByUserId: userId }] : [])
            ]
        },
        orderBy: { createdAt: "desc" },
        take: 30
    }).catch(() => []);

    // 3. Query Kindle delivery history
    const kindleDeliveries = await prisma.kindleDeliveryLog.findMany({
        where: {
            OR: [
                ...(safeEmail ? [{ userEmail: safeEmail }] : []),
                ...(safeUsername ? [{ username: safeUsername }] : [])
            ]
        },
        orderBy: { createdAt: "desc" },
        take: 15
    }).catch(() => []);

    // 4. Query Content Preferences
    const contentPref = userId ? await prisma.userContentPreference.findFirst({
        where: { userId }
    }).catch(() => null) : null;

    // Harmonize requests
    const seenTitles = new Set<string>();
    const requestedBooks: UserReadingProfile["requestedBooks"] = [];
    const authorCounts = new Map<string, number>();
    const seriesSet = new Set<string>();

    for (const req of mediaRequests) {
        const normTitle = (req.title || "").toLowerCase().trim();
        if (!normTitle || seenTitles.has(normTitle)) continue;
        seenTitles.add(normTitle);

        const author = req.bookAuthor || undefined;
        const series = req.bookSeries || undefined;

        requestedBooks.push({
            title: req.title,
            author,
            series,
            mediaType: req.mediaType || "ebook",
            status: req.status || "PENDING",
            createdAt: req.createdAt?.toISOString()
        });

        if (author && author !== "Unknown Author") {
            const normA = author.trim();
            authorCounts.set(normA, (authorCounts.get(normA) || 0) + 1);
        }
        if (series) seriesSet.add(series.trim());
    }

    for (const req of bookRequests) {
        const normTitle = (req.title || "").toLowerCase().trim();
        if (!normTitle || seenTitles.has(normTitle)) continue;
        seenTitles.add(normTitle);

        const author = req.author || undefined;
        const series = req.series || undefined;

        requestedBooks.push({
            title: req.title,
            author,
            series,
            mediaType: req.mediaType || "ebook",
            status: req.status || "Pending",
            createdAt: req.createdAt?.toISOString()
        });

        if (author && author !== "Unknown Author") {
            const normA = author.trim();
            authorCounts.set(normA, (authorCounts.get(normA) || 0) + 1);
        }
        if (series) seriesSet.add(series.trim());
    }

    // Sort authors by request frequency
    const favoriteAuthors = Array.from(authorCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0])
        .slice(0, 10);

    const favoriteSeries = Array.from(seriesSet).slice(0, 8);

    const mappedDeliveries = kindleDeliveries.map(kd => ({
        bookTitle: kd.bookTitle,
        author: kd.bookAuthor || undefined,
        date: kd.createdAt?.toLocaleDateString() || "Recent"
    }));

    // Build human-readable summaries for prompt and diagnostics
    const requestedBooksSummary = requestedBooks.length > 0
        ? requestedBooks.slice(0, 8).map(b => `"${b.title}"${b.author ? ` by ${b.author}` : ""}${b.series ? ` (${b.series})` : ""} [${b.mediaType.toUpperCase()} - ${b.status}]`).join("; ")
        : "No previous book requests recorded yet.";

    const recentKindleDeliveriesSummary = mappedDeliveries.length > 0
        ? mappedDeliveries.slice(0, 5).map(d => `"${d.bookTitle}"${d.author ? ` (${d.author})` : ""}`).join("; ")
        : "No Kindle deliveries sent yet.";

    const excludedParts: string[] = [];
    if (contentPref?.hideHorror) excludedParts.push("No Horror");
    if (contentPref?.hideNsfw) excludedParts.push("No NSFW / Explicit Content");
    if (contentPref?.hideGore) excludedParts.push("No Excessive Gore");

    return {
        kindleEmail,
        enabledAddons,
        requestedBooks,
        favoriteAuthors,
        favoriteSeries,
        recentKindleDeliveries: mappedDeliveries,
        excludedContent: excludedParts.length > 0 ? excludedParts.join(", ") : undefined,
        requestedBooksCount: requestedBooks.length,
        requestedBooksSummary,
        recentKindleDeliveriesSummary
    };
}

// ============================================================================
// 2. GENERATE PERSONALIZED BOOK & AUDIOBOOK RECOMMENDATIONS
// Cross-references server library availability with affinity clusters & requests
// ============================================================================

export async function getPersonalizedBookRecommendations(options: {
    user: any;
    profile?: UserReadingProfile;
    referenceTitle?: string;
    author?: string;
    genre?: string;
    mediaType?: "ebook" | "audiobook" | "all";
    limit?: number;
}): Promise<{
    recommendations: BookRecommendationItem[];
    basedOn: {
        authors: string[];
        series: string[];
        referenceTitle?: string;
        source: "explicit_query" | "request_history" | "server_popular";
    };
    summary: string;
}> {
    const limit = options.limit || 5;
    const profile = options.profile || await getUserReadingAndRequestProfile(options.user);

    // Track books user already requested or received
    const alreadyKnownTitles = new Set<string>();
    for (const b of profile.requestedBooks) {
        alreadyKnownTitles.add(b.title.toLowerCase().replace(/[^a-z0-9]/g, ""));
    }
    for (const kd of profile.recentKindleDeliveries) {
        alreadyKnownTitles.add(kd.bookTitle.toLowerCase().replace(/[^a-z0-9]/g, ""));
    }

    // Determine target authors and cluster signals
    let targetAuthors = new Set<string>();
    let targetGenres = new Set<string>();
    let querySource: "explicit_query" | "request_history" | "server_popular" = "request_history";

    if (options.author) {
        targetAuthors.add(options.author.toLowerCase().trim());
        querySource = "explicit_query";
    }
    if (options.genre) {
        targetGenres.add(options.genre.toLowerCase().trim());
        querySource = "explicit_query";
    }

    if (targetAuthors.size === 0 && profile.favoriteAuthors.length > 0) {
        for (const a of profile.favoriteAuthors) {
            targetAuthors.add(a.toLowerCase().trim());
        }
    }

    // If still no authors, check if user specified a reference title
    if (options.referenceTitle) {
        const refNorm = options.referenceTitle.toLowerCase().trim();
        querySource = "explicit_query";
        for (const cluster of AUTHOR_AFFINITY_CLUSTERS) {
            const hasRec = cluster.topRecommendations.some(r => r.title.toLowerCase().includes(refNorm));
            if (hasRec) {
                targetGenres.add(cluster.genre.toLowerCase());
                for (const a of cluster.authors) targetAuthors.add(a);
                break;
            }
        }
    }

    // If still empty, default to Sci-Fi and Epic Fantasy popular clusters
    if (targetAuthors.size === 0 && targetGenres.size === 0) {
        querySource = "server_popular";
        targetAuthors.add("andy weir");
        targetAuthors.add("brandon sanderson");
        targetAuthors.add("frank herbert");
    }

    // Find relevant affinity clusters
    const matchedClusters = AUTHOR_AFFINITY_CLUSTERS.filter(cluster => {
        if (targetGenres.size > 0) {
            for (const tg of targetGenres) {
                if (cluster.genre.toLowerCase().includes(tg)) return true;
                if (cluster.sampleThemes.some(t => t.includes(tg))) return true;
            }
        }
        for (const ta of targetAuthors) {
            if (cluster.authors.some(ca => ca.includes(ta) || ta.includes(ca))) return true;
        }
        return false;
    });

    const activeClusters = matchedClusters.length > 0 ? matchedClusters : AUTHOR_AFFINITY_CLUSTERS.slice(0, 2);

    // 1. Fetch available books on server disk from SQLite
    const allDbBooks = await prisma.book.findMany({
        where: { fileType: { not: "missing" } },
        select: {
            id: true,
            title: true,
            author: true,
            series: true,
            volumeNumber: true,
            coverUrl: true,
            mediaType: true,
            fileType: true,
            libraryId: true
        },
        take: 300
    }).catch(() => []);

    const recommendations: BookRecommendationItem[] = [];
    const recSeenKeys = new Set<string>();

    const makeKey = (title: string, author?: string) => 
        `${title.toLowerCase().replace(/[^a-z0-9]/g, "")}_${(author || "").toLowerCase().replace(/[^a-z0-9]/g, "")}`;

    // A. Priority 1: Check books in server's DB by favorite authors that user hasn't requested yet
    for (const dbBook of allDbBooks) {
        if (recommendations.length >= limit) break;
        const normTitle = dbBook.title.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (alreadyKnownTitles.has(normTitle)) continue;

        const bookAuthorLower = (dbBook.author || "").toLowerCase().trim();
        const authorMatch = Array.from(targetAuthors).some(ta => bookAuthorLower.includes(ta) || ta.includes(bookAuthorLower));

        if (authorMatch) {
            const key = makeKey(dbBook.title, dbBook.author || undefined);
            if (!recSeenKeys.has(key)) {
                recSeenKeys.add(key);
                recommendations.push({
                    title: dbBook.title,
                    author: dbBook.author || "Unknown Author",
                    series: dbBook.series || undefined,
                    genre: "Your Favorite Author",
                    inLibrary: true,
                    mediaType: (dbBook.mediaType === "audiobook" ? "audiobook" : "ebook") as any,
                    matchReason: `Available now in your library! Written by ${dbBook.author}, an author you've requested before.`,
                    actionUrl: "/library",
                    actionLabel: "Read Now / Send to Kindle",
                    coverUrl: dbBook.coverUrl || undefined
                });
            }
        }
    }

    // B. Priority 2: Check books in server's DB by affiliated cluster authors
    for (const cluster of activeClusters) {
        if (recommendations.length >= limit) break;
        for (const dbBook of allDbBooks) {
            if (recommendations.length >= limit) break;
            const normTitle = dbBook.title.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (alreadyKnownTitles.has(normTitle)) continue;

            const bookAuthorLower = (dbBook.author || "").toLowerCase().trim();
            const isAffiliatedAuthor = cluster.authors.some(ca => bookAuthorLower.includes(ca) || ca.includes(bookAuthorLower));

            if (isAffiliatedAuthor) {
                const key = makeKey(dbBook.title, dbBook.author || undefined);
                if (!recSeenKeys.has(key)) {
                    recSeenKeys.add(key);
                    recommendations.push({
                        title: dbBook.title,
                        author: dbBook.author || "Unknown Author",
                        series: dbBook.series || undefined,
                        genre: cluster.genre,
                        inLibrary: true,
                        mediaType: (dbBook.mediaType === "audiobook" ? "audiobook" : "ebook") as any,
                        matchReason: `In your server library! Shares the ${cluster.genre} style and themes you love.`,
                        actionUrl: "/library",
                        actionLabel: "Read Now / Send to Kindle",
                        coverUrl: dbBook.coverUrl || undefined
                    });
                }
            }
        }
    }

    // C. Priority 3: Curated top recommendations from matching affinity clusters (mark as inLibrary if in DB, else ready to request)
    for (const cluster of activeClusters) {
        if (recommendations.length >= limit) break;
        for (const topRec of cluster.topRecommendations) {
            if (recommendations.length >= limit) break;
            const normTitle = topRec.title.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (alreadyKnownTitles.has(normTitle)) continue;

            const key = makeKey(topRec.title, topRec.author);
            if (recSeenKeys.has(key)) continue;

            // Check if it happens to be in DB
            const existingInDb = allDbBooks.find(b => 
                b.title.toLowerCase().replace(/[^a-z0-9]/g, "") === normTitle ||
                (b.author && b.author.toLowerCase().includes(topRec.author.toLowerCase()) && b.title.toLowerCase().includes(topRec.title.toLowerCase()))
            );

            recSeenKeys.add(key);

            if (existingInDb) {
                recommendations.push({
                    title: existingInDb.title,
                    author: existingInDb.author || topRec.author,
                    series: existingInDb.series || topRec.series,
                    genre: cluster.genre,
                    inLibrary: true,
                    mediaType: (existingInDb.mediaType === "audiobook" ? "audiobook" : topRec.mediaType) as any,
                    matchReason: `In library right now! ${topRec.pitch}`,
                    actionUrl: "/library",
                    actionLabel: "Read Now / Send to Kindle",
                    coverUrl: existingInDb.coverUrl || undefined
                });
            } else {
                recommendations.push({
                    title: topRec.title,
                    author: topRec.author,
                    series: topRec.series,
                    genre: cluster.genre,
                    inLibrary: false,
                    mediaType: topRec.mediaType,
                    matchReason: `${topRec.pitch} (1-click auto-download ready)`,
                    actionUrl: "/requests",
                    actionLabel: "Request Book in 1 Click"
                });
            }
        }
    }

    const basedOnAuthors = Array.from(targetAuthors).map(a => 
        a.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
    ).slice(0, 5);

    const basedOnSeries = profile.favoriteSeries.slice(0, 3);

    const summary = recommendations.length > 0
        ? `Found ${recommendations.length} personalized recommendation(s) based on your interest in ${basedOnAuthors.join(", ") || "our top library titles"}.`
        : "No personalized recommendations found.";

    return {
        recommendations,
        basedOn: {
            authors: basedOnAuthors,
            series: basedOnSeries,
            referenceTitle: options.referenceTitle,
            source: querySource
        },
        summary
    };
}
