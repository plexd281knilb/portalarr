export interface MediaMarket {
    slug: string;
    name: string;
    shortName: string;
    state: string;
    region: string;
    keywords: string[];
    nflTeams: string[];
    collegeConferences?: string[];
    isHostServer?: boolean;
}

export const MEDIA_MARKETS: Record<string, MediaMarket> = {
    dallas: {
        slug: "dallas",
        name: "Dallas / Fort Worth, TX (Host Server • DFW)",
        shortName: "Dallas (DFW)",
        state: "TX",
        region: "Southwest",
        keywords: ["dallas", "dfw", "fort worth", "kxas", "kdfw", "ktvt", "wfaa", "ktxa", "kdfi", "bally sports southwest"],
        nflTeams: ["Dallas Cowboys"],
        collegeConferences: ["SEC", "Big 12"],
        isHostServer: true
    },
    houston: {
        slug: "houston",
        name: "Houston, TX",
        shortName: "Houston",
        state: "TX",
        region: "Southwest",
        keywords: ["houston", "kprc", "kriv", "khou", "ktrk", "space city"],
        nflTeams: ["Houston Texans"],
        collegeConferences: ["Big 12", "SEC"]
    },
    austin: {
        slug: "austin",
        name: "Austin, TX",
        shortName: "Austin",
        state: "TX",
        region: "Southwest",
        keywords: ["austin", "kxan", "ktbc", "kvue", "keye"],
        nflTeams: ["Dallas Cowboys", "Houston Texans"],
        collegeConferences: ["SEC"]
    },
    san_antonio: {
        slug: "san_antonio",
        name: "San Antonio, TX",
        shortName: "San Antonio",
        state: "TX",
        region: "Southwest",
        keywords: ["san antonio", "woai", "kabb", "kens", "ksat"],
        nflTeams: ["Dallas Cowboys", "Houston Texans"],
        collegeConferences: ["SEC", "AAC"]
    },
    new_york: {
        slug: "new_york",
        name: "New York City, NY",
        shortName: "New York",
        state: "NY",
        region: "Northeast",
        keywords: ["new york", "nyc", "wnbc", "wnyw", "wcbs", "wabc", "sny", "yes network", "msg"],
        nflTeams: ["New York Giants", "New York Jets"]
    },
    los_angeles: {
        slug: "los_angeles",
        name: "Los Angeles, CA",
        shortName: "Los Angeles",
        state: "CA",
        region: "West",
        keywords: ["los angeles", "la", "knbc", "kttv", "kcbs", "kabc", "ktla", "sportsnet la"],
        nflTeams: ["Los Angeles Rams", "Los Angeles Chargers"]
    },
    chicago: {
        slug: "chicago",
        name: "Chicago, IL",
        shortName: "Chicago",
        state: "IL",
        region: "Midwest",
        keywords: ["chicago", "wmaq", "wfld", "wbbm", "wls", "nbc sports chicago", "marquee"],
        nflTeams: ["Chicago Bears"],
        collegeConferences: ["Big Ten"]
    },
    philadelphia: {
        slug: "philadelphia",
        name: "Philadelphia, PA",
        shortName: "Philadelphia",
        state: "PA",
        region: "Northeast",
        keywords: ["philadelphia", "philly", "wcau", "wtxf", "kyw", "wpvi", "nbc sports philadelphia", "phl17"],
        nflTeams: ["Philadelphia Eagles"]
    },
    boston: {
        slug: "boston",
        name: "Boston / New England, MA",
        shortName: "Boston",
        state: "MA",
        region: "Northeast",
        keywords: ["boston", "wbts", "wfxt", "wbz", "wcvb", "nesn", "nbc sports boston"],
        nflTeams: ["New England Patriots"]
    },
    atlanta: {
        slug: "atlanta",
        name: "Atlanta, GA",
        shortName: "Atlanta",
        state: "GA",
        region: "Southeast",
        keywords: ["atlanta", "wxia", "waga", "wanf", "wsb", "bally sports south"],
        nflTeams: ["Atlanta Falcons"],
        collegeConferences: ["SEC", "ACC"]
    },
    miami: {
        slug: "miami",
        name: "Miami / South Florida, FL",
        shortName: "Miami",
        state: "FL",
        region: "Southeast",
        keywords: ["miami", "wtvj", "wsvn", "wfor", "wplg", "bally sports florida"],
        nflTeams: ["Miami Dolphins"],
        collegeConferences: ["ACC"]
    },
    denver: {
        slug: "denver",
        name: "Denver / Rocky Mountain, CO",
        shortName: "Denver",
        state: "CO",
        region: "Mountain",
        keywords: ["denver", "kusa", "kdvr", "kcnc", "kmgh", "altitude"],
        nflTeams: ["Denver Broncos"],
        collegeConferences: ["Big 12"]
    },
    phoenix: {
        slug: "phoenix",
        name: "Phoenix / Arizona, AZ",
        shortName: "Phoenix",
        state: "AZ",
        region: "Southwest",
        keywords: ["phoenix", "kpnx", "ksaz", "kpho", "knxv", "arizona"],
        nflTeams: ["Arizona Cardinals"],
        collegeConferences: ["Big 12"]
    },
    san_francisco: {
        slug: "san_francisco",
        name: "San Francisco / Bay Area, CA",
        shortName: "Bay Area",
        state: "CA",
        region: "West",
        keywords: ["san francisco", "bay area", "kntv", "ktvu", "kpix", "kgo", "nbc sports bay area"],
        nflTeams: ["San Francisco 49ers"],
        collegeConferences: ["ACC"]
    },
    seattle: {
        slug: "seattle",
        name: "Seattle / Pacific Northwest, WA",
        shortName: "Seattle",
        state: "WA",
        region: "West",
        keywords: ["seattle", "king", "kcpq", "kiro", "komo", "root sports"],
        nflTeams: ["Seattle Seahawks"],
        collegeConferences: ["Big Ten"]
    },
    minneapolis: {
        slug: "minneapolis",
        name: "Minneapolis / St. Paul, MN",
        shortName: "Minneapolis",
        state: "MN",
        region: "Midwest",
        keywords: ["minneapolis", "st. paul", "kare", "kmsp", "wcco", "kstp"],
        nflTeams: ["Minnesota Vikings"],
        collegeConferences: ["Big Ten"]
    },
    detroit: {
        slug: "detroit",
        name: "Detroit, MI",
        shortName: "Detroit",
        state: "MI",
        region: "Midwest",
        keywords: ["detroit", "wdiv", "wjbk", "wwj", "wxyz", "bally sports detroit"],
        nflTeams: ["Detroit Lions"],
        collegeConferences: ["Big Ten"]
    },
    pittsburgh: {
        slug: "pittsburgh",
        name: "Pittsburgh, PA",
        shortName: "Pittsburgh",
        state: "PA",
        region: "Northeast",
        keywords: ["pittsburgh", "wpxi", "wpgh", "kdka", "wtae", "sportsnet pittsburgh"],
        nflTeams: ["Pittsburgh Steelers"],
        collegeConferences: ["ACC"]
    },
    tampa: {
        slug: "tampa",
        name: "Tampa / St. Petersburg, FL",
        shortName: "Tampa",
        state: "FL",
        region: "Southeast",
        keywords: ["tampa", "st. petersburg", "wfla", "wtvt", "wtsp", "wfts"],
        nflTeams: ["Tampa Bay Buccaneers"],
        collegeConferences: ["SEC"]
    },
    national: {
        slug: "national",
        name: "National / All Feeds",
        shortName: "National",
        state: "US",
        region: "National",
        keywords: ["national", "east", "west", "usa", "america"],
        nflTeams: ["NFL RedZone", "NFL Network", "National Sunday Broadcasts"],
        collegeConferences: ["SEC", "Big Ten", "ACC", "Big 12"]
    }
};

export const ORDERED_MARKETS = Object.values(MEDIA_MARKETS);

/**
 * Detect media market from Cloudflare / HTTP headers or client IP
 */
export function detectMarketFromHeaders(headers: Headers | Record<string, string | string[] | undefined>): string {
    const getHeader = (key: string): string => {
        if (!headers) return "";
        if (typeof (headers as Headers).get === "function") {
            return ((headers as Headers).get(key) || "").toLowerCase();
        }
        const val = (headers as Record<string, any>)[key] || (headers as Record<string, any>)[key.toLowerCase()];
        return (Array.isArray(val) ? val[0] : (val || "")).toString().toLowerCase();
    };

    const cfCity = getHeader("cf-ipcity");
    const cfRegion = getHeader("cf-region");
    const cfRegionCode = getHeader("cf-region-code");

    // Match by direct city
    for (const [slug, market] of Object.entries(MEDIA_MARKETS)) {
        if (slug === "national") continue;
        for (const kw of market.keywords) {
            if (cfCity && (cfCity.includes(kw) || kw.includes(cfCity))) {
                return slug;
            }
        }
    }

    // Match by state/region code
    if (cfRegionCode === "TX" || cfRegion.includes("texas")) {
        if (cfCity.includes("houston")) return "houston";
        if (cfCity.includes("austin")) return "austin";
        if (cfCity.includes("san antonio")) return "san_antonio";
        return "dallas"; // Dallas is host default for Texas
    }

    if (cfRegionCode === "NY" || cfRegion.includes("new york")) return "new_york";
    if (cfRegionCode === "CA" || cfRegion.includes("california")) {
        if (cfCity.includes("francisco") || cfCity.includes("oakland") || cfCity.includes("jose")) return "san_francisco";
        return "los_angeles";
    }
    if (cfRegionCode === "IL" || cfRegion.includes("illinois")) return "chicago";
    if (cfRegionCode === "PA" || cfRegion.includes("pennsylvania")) {
        if (cfCity.includes("pittsburgh")) return "pittsburgh";
        return "philadelphia";
    }
    if (cfRegionCode === "MA" || cfRegion.includes("massachusetts")) return "boston";
    if (cfRegionCode === "GA" || cfRegion.includes("georgia")) return "atlanta";
    if (cfRegionCode === "FL" || cfRegion.includes("florida")) {
        if (cfCity.includes("tampa") || cfCity.includes("petersburg") || cfCity.includes("orlando")) return "tampa";
        return "miami";
    }
    if (cfRegionCode === "CO" || cfRegion.includes("colorado")) return "denver";
    if (cfRegionCode === "AZ" || cfRegion.includes("arizona")) return "phoenix";
    if (cfRegionCode === "WA" || cfRegion.includes("washington")) return "seattle";
    if (cfRegionCode === "MN" || cfRegion.includes("minnesota")) return "minneapolis";
    if (cfRegionCode === "MI" || cfRegion.includes("michigan")) return "detroit";

    // Host Server Default: Dallas / Fort Worth
    return "dallas";
}

export interface GenericIptvChannel {
    id: string;
    channelNumber: number | null;
    callsign: string | null;
    name: string;
    genre: string;
    logoUrl?: string | null;
    streamUrl?: string | null;
    epgName?: string | null;
    xmltvId?: string | null;
    isActive?: boolean;
    isCustom?: boolean;
}

/**
 * Dallas Anchor Channels - ALWAYS available and featured because the server is hosted in Dallas
 */
export function getDallasAnchorChannels<T extends GenericIptvChannel>(channels: T[]): T[] {
    const dallasKeywords = ["dallas", "dfw", "fort worth", "kxas", "kdfw", "ktvt", "wfaa", "ktxa", "kdfi"];
    
    const matched = channels.filter(c => {
        const name = (c.name || "").toLowerCase();
        const callsign = (c.callsign || "").toLowerCase();
        return dallasKeywords.some(kw => name.includes(kw) || callsign.includes(kw));
    });

    // Sort priority: NBC 5, FOX 4, CBS 11, ABC 8, then KTXA, KDFI, etc.
    const priority = (name: string): number => {
        const n = name.toLowerCase();
        if (n.includes("nbc 5") || n.includes("kxas")) return 1;
        if (n.includes("fox 4") || n.includes("kdfw")) return 2;
        if (n.includes("cbs 11") || n.includes("ktvt")) return 3;
        if (n.includes("abc 8") || n.includes("wfaa")) return 4;
        if (n.includes("ktxa") || n.includes("21")) return 5;
        if (n.includes("kdfi") || n.includes("27")) return 6;
        if (n.includes("cbs news dallas")) return 7;
        return 10;
    };

    return matched.sort((a, b) => priority(a.name) - priority(b.name));
}

/**
 * Filter channels for a specific user media market
 */
export function getMarketChannels<T extends GenericIptvChannel>(channels: T[], marketSlug: string): T[] {
    if (!marketSlug || marketSlug === "dallas") {
        return getDallasAnchorChannels(channels);
    }

    const market = MEDIA_MARKETS[marketSlug];
    if (!market || marketSlug === "national") {
        return channels;
    }

    const matched = channels.filter(c => {
        const name = (c.name || "").toLowerCase();
        const callsign = (c.callsign || "").toLowerCase();
        return market.keywords.some(kw => name.includes(kw) || callsign.includes(kw));
    });

    return matched;
}

/**
 * Filter NFL & Pro Football Channels
 */
export function getNflChannels<T extends GenericIptvChannel>(channels: T[]): T[] {
    const redzoneAndNflNet = channels.filter(c => {
        const n = (c.name || "").toLowerCase();
        return n.includes("redzone") || n.includes("nfl network") || n.includes("nfl hd");
    });

    // Broadcast networks carrying Sunday football (CBS, FOX, NBC)
    const broadcastSunday = channels.filter(c => {
        const n = (c.name || "").toLowerCase();
        const isAffiliate = (n.includes("fox") || n.includes("cbs") || n.includes("nbc")) && (n.includes("dallas") || n.includes("east") || n.includes("fhd") || n.includes("hd"));
        const notRedzone = !n.includes("redzone") && !n.includes("nfl network");
        return isAffiliate && notRedzone;
    });

    // Deduplicate by name
    const seen = new Set<string>();
    const result: T[] = [];

    // RedZone first, NFL Network second, then top Sunday broadcast games
    for (const c of [...redzoneAndNflNet, ...broadcastSunday]) {
        if (!seen.has(c.id)) {
            seen.add(c.id);
            result.push(c);
        }
    }

    // Sort order: RedZone #1, NFL Network #2, then broadcast affiliates
    return result.sort((a, b) => {
        const aN = a.name.toLowerCase();
        const bN = b.name.toLowerCase();
        const rank = (n: string) => {
            if (n.includes("redzone")) return 1;
            if (n.includes("nfl network")) return 2;
            if (n.includes("dallas")) return 3;
            return 10;
        };
        return rank(aN) - rank(bN);
    });
}

/**
 * Filter NCAA & College Football / Sports Channels
 */
export function getNcaaChannels<T extends GenericIptvChannel>(channels: T[]): T[] {
    const collegePatterns = [
        "sec network",
        "acc network",
        "big ten network",
        "espnu",
        "cbs sports network",
        "espn college extra",
        "college",
        "btn"
    ];

    const matched = channels.filter(c => {
        const n = (c.name || "").toLowerCase();
        // Exclude AccuWeather false positives
        if (n.includes("accuweather")) return false;
        return collegePatterns.some(pat => n.includes(pat));
    });

    // Sort order: SEC Network, Big Ten Network, ACC Network, ESPNU, CBS Sports Network, ESPN College Extra
    const rank = (name: string): number => {
        const n = name.toLowerCase();
        if (n.includes("sec network") && !n.includes("alternate")) return 1;
        if (n.includes("big ten network") || n.includes("btn")) return 2;
        if (n.includes("acc network")) return 3;
        if (n.includes("espnu")) return 4;
        if (n.includes("cbs sports network")) return 5;
        if (n.includes("espn college extra")) return 6;
        return 10;
    };

    return matched.sort((a, b) => rank(a.name) - rank(b.name));
}

/**
 * Generates an actionable AI Dispatcharr Prompt to locate, provision, and map
 * local broadcast network affiliates and regional sports into Dispatcharr.
 */
export function generateMarketAiPrompt(marketSlug: string, requestedByUsername?: string): string {
    const market = MEDIA_MARKETS[marketSlug] || MEDIA_MARKETS.dallas;
    const requester = requestedByUsername ? `Member "${requestedByUsername}"` : "A homelab member";
    const nflString = market.nflTeams.length > 0 ? market.nflTeams.join(", ") : "Regional NFL Broadcasts";
    const conferences = market.collegeConferences?.join(", ") || "NCAA Division 1";

    return `[AI-DISPATCHARR-PROMPT]
Target Media Market: ${market.name} (${market.shortName}, ${market.state})
Requested By: ${requester}
In-Market NFL / Regional Sports: ${nflString}
College Coverage: ${conferences}

Target Broadcast Networks & Station Callsigns:
- Callsigns & Search Terms: ${market.keywords.join(", ")}
- Network Affiliates to Map: NBC, CBS, FOX, ABC, CW, and Regional Sports Networks

Instructions to Add into Dispatcharr:
1. Search unmapped M3U provider streams:
   GET /api/channels/streams/?search=<KEYWORD>&page_size=50
   Run queries for: ${market.keywords.slice(0, 8).map(k => `"${k}"`).join(", ")}
2. Provision matching live streams into active channels:
   POST /api/channels/channels/from-stream/
   Body: { "stream_id": <STREAM_ID>, "name": "<CLEAN_CHANNEL_NAME>" }
3. Assign newly created local stations to the "Sports" (regional sports) and "Entertainment" (affiliates) channel profiles.
4. Trigger Portalarr Lineup Sync to expose virtual tuners directly to Plex Live TV & Jellyfin.`;
}

