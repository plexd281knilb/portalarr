import { normalizeChannelNameForDedup, cleanChannelNameForDisplay } from "../src/lib/iptv/dispatcharr-client";

export async function curateDispatcharrChannels(customApiKey?: string) {
    const key = (customApiKey || "3fhUZnZF8B3Db2SesYfYS008MRyKtZ98V4ku343n5gHtFMxNYw3jgA").trim();
    const baseUrl = "http://192.168.1.87:9191";
    const headers = {
        "X-API-Key": key,
        "Accept": "application/json",
        "Content-Type": "application/json"
    };

    console.log("[CURATE-250] Fetching all master channels from Dispatcharr...");
    const chanRes = await fetch(`${baseUrl}/api/channels/channels/?page_size=2000`, { headers });
    const chanData = await chanRes.json();
    const allChannels: any[] = Array.isArray(chanData.results) ? chanData.results : chanData;
    console.log(`[CURATE-250] Found ${allChannels.length} total master channels.`);

    // Dallas local channels (exclusive local broadcast affiliates)
    const dallasRegex = /\b(dallas|dfw|ft\.?\s*worth|ktvt|kxas|kdfw|wfaa|kdaf|kera|kxtx|ktxa|kmpk)\b/i;

    // Out-of-market locals and callsigns to strictly exclude
    const otherCityRegex = /\b(philadelphia|philly|wphl|wfmz|el paso|ktsm|parkersburg|wtap|panama city|wjhg|wpgx|wecp|paducah|wpsd|palm springs|kmir|kdfx|west palm|wptv|wflx|wpec|atlanta|chicago|boston|houston|los angeles|miami|new york|nyc|san antonio|austin|denver|detroit|seattle|phoenix|tampa|orlando|pittsburgh|baltimore|cleveland|st\.?\s*louis|charlotte|indianapolis|columbus|nashville|kansas city|las vegas|milwaukee|minneapolis|cincinnati|memphis|oklahoma city|raleigh|richmond|buffalo|albany|albuquerque|birmingham|fresno|grand rapids|green bay|hartford|honolulu|jacksonville|knoxville|louisville|norfolk|omaha|providence|rochester|sacramento|salt lake|san diego|san francisco|spokane|syracuse|tucson|tulsa|wichita|champaign|wcia|spartanburg|wspa|kansas)\b/i;

    const otherCallsignsRegex = /\b(wnbc|wcbs|wabc|wnyw|knbc|kcbs|kabc|kttv|kcal|wbbm|wmaq|wls|wfld|kyw|wcau|wpvi|wtxf|wbz|wcvb|whdh|wfxt|wsbk|wwj|wgcl|keye|khou|kprc|kriv|kbb|kptv|kiro|kpix|kens|kpho|wcco|wfor|kcnc|kdka|wfts|kvue|knxv|ktrk|ksat|kgo|wcvb|komo|wtae|kstp|wzdx|woai|wdiv|kcpq|ksaz|kmsp|wsvn|ktbc|waga|ktvu|wjbk|wpgh|wcae|kpnx|kare|wpxi|wfla|kusa|wtvj|king)\b/i;

    const outOfMarketRsnRegex = /\b(nesn|masn|altitude|csn california|marquee|monumental|space city|msg|yes network|sportsnet la|sportsnet lakers|nbc sports bay area|nbc sports california|nbc sports philadelphia|nbc sports philadelfia|nbc sports washington|fox sports midwest|fox sports north|fox sports ohio|fox sports south|fox sports sun|fox sports wisconsin|nbc bay area)\b/i;

    // Filter out low-value, religious, shopping, audio feeds, overflow college extras, and Russian propaganda/dead channels
    const lowValueRegex = /\b(\[bk\]|\(bk\)|\[bk1\]|\[bk2\]|offline|placeholder|test\b|qvc|hsn|gem shopping|infowars|music choice|tbn|victory|the word|ewtn|hope channel|failarmy|so yummy|bizarre foods|love kills|wired2fish|merit\+|dog tv|hunt channel|awe|retro tv|real american|justice central|law and crime|court tv|universo|estrella|mega tv|free speech|bnc|afn|all women's sports|billiard tv|pokergo|players tv|pickleball|red bull|outside tv|golfpass|stadium|college extra|bein sports [4-8]|big ten network [2-4]|rt news|rt documentary|god tv|hsn2|say yes to the dress|local now|dabl tv|charge!|buzzr)\b/i;

    const seenNormalized = new Set<string>();

    function normKey(name: string): string {
        let n = normalizeChannelNameForDedup(name);
        n = n.replace(/\b(east|west|feed|fhd|hd|sd|plus|\+)\b/g, "").replace(/\s+/g, " ").trim();
        if (/^disney channel/.test(n)) return "disney channel";
        if (/^disney jr|^disney junior/.test(n)) return "disney junior";
        if (/^nickelodeon|^nick at nite/.test(n)) return "nickelodeon";
        if (/^cartoon network/.test(n)) return "cartoon network";
        if (/^comedy central/.test(n)) return "comedy central";
        if (/^discovery channel|^discovery$/.test(n)) return "discovery";
        if (/^hallmark channel|^hallmark$/.test(n)) return "hallmark";
        if (/^paramount network|^paramount$/.test(n)) return "paramount";
        if (/^national geographic|^nat geo$/.test(n)) return "national geographic";
        if (/^investigation discovery|^id$/.test(n)) return "investigation discovery";
        if (/^crime & investigation|^crime investigation/.test(n)) return "crime investigation";
        if (/^heroes & icons|^h&i|^heroes and icons/.test(n)) return "heroes and icons";
        if (/^me tv|^metv/.test(n)) return "metv";
        if (/^cozi tv|^cozi/.test(n)) return "cozi";
        if (/^e!/.test(n)) return "e entertainment";
        if (/^fuse/.test(n)) return "fuse";
        if (/^mtv 2|^mtv2/.test(n)) return "mtv2";
        if (/^cowboy channel/.test(n)) return "cowboy channel";
        if (/^laff/.test(n)) return "laff";
        if (/^tlc/.test(n)) return "tlc";
        if (/^tv land/.test(n)) return "tv land";
        if (/^own\b|^oprah/.test(n)) return "own";
        if (/^get tv|^gettv/.test(n)) return "gettv";
        if (/^bounce/.test(n)) return "bounce tv";
        if (/^up\b|^up tv/.test(n)) return "up tv";
        if (/^viceland|^vice\b/.test(n)) return "viceland";
        if (/^fox business/.test(n)) return "fox business";
        if (/^c-span 1|^c-span$/.test(n)) return "cspan";
        if (/^c-span 2/.test(n)) return "cspan2";
        if (/^c-span 3/.test(n)) return "cspan3";
        if (/^tcm|^turner classic/.test(n)) return "turner classic movies";
        if (/^sundance/.test(n)) return "sundance";
        if (/^babyfirst|^baby first/.test(n)) return "babyfirst";
        if (/^fm\b/.test(n)) return "fm";
        if (/^espn 1|^espn$/.test(n)) return "espn";
        if (/^espn 2|^espn2$/.test(n)) return "espn2";
        return n;
    }

    const dallasChannels: any[] = [];
    const newsChannels: any[] = [];
    const sportsChannels: any[] = [];
    const entChannels: any[] = [];
    const movieChannels: any[] = [];
    const kidsChannels: any[] = [];

    // 1. Dallas locals
    for (const ch of allChannels) {
        const raw = ch.name || "";
        if (dallasRegex.test(raw)) {
            const k = normKey(raw);
            if (!seenNormalized.has(k)) {
                seenNormalized.add(k);
                dallasChannels.push({
                    id: ch.id,
                    name: cleanChannelNameForDisplay(ch.name),
                    raw,
                    auto_created: Boolean(ch.auto_created),
                    category: "Dallas Locals"
                });
            }
        }
    }

    // Suppress generic national ABC/NBC/CBS/FOX so Dallas locals are the primary broadcast affiliates
    seenNormalized.add("abc");
    seenNormalized.add("cbs");
    seenNormalized.add("nbc");
    seenNormalized.add("fox");

    // 2. Curate rest
    for (const ch of allChannels) {
        const raw = ch.name || "";
        const clean = cleanChannelNameForDisplay(raw);

        if (dallasRegex.test(raw)) continue;
        if (otherCityRegex.test(raw) || otherCallsignsRegex.test(raw) || /^(abc|cbs|nbc|fox|cw|pbs)\s+\d+/i.test(clean)) continue;
        if (outOfMarketRsnRegex.test(raw)) continue;
        if (lowValueRegex.test(raw)) continue;

        const k = normKey(raw);
        if (seenNormalized.has(k)) continue;

        const item = {
            id: ch.id,
            name: clean,
            raw,
            auto_created: Boolean(ch.auto_created)
        };

        if (/\b(disney|nick|cartoon|boomerang|baby|teen nick|pbs kids)\b/i.test(clean)) {
            seenNormalized.add(k);
            kidsChannels.push({ ...item, category: "Kids & Family" });
        } else if (/\b(news|cnn|msnbc|cnbc|bloomberg|c-span|weather|hln|newsmax|newsnation|accuweather|first|cheddar)\b/i.test(clean)) {
            seenNormalized.add(k);
            newsChannels.push({ ...item, category: "News & Weather" });
        } else if (/\b(espn|fox sports|fs1|fs2|sports|nfl|mlb|nba|nhl|golf|tennis|fight|beIN|acc network|sec network|big ten|fan duel|mavtv|outdoor|willow|soccer|deportes|tvg|racing|sportsnet)\b/i.test(clean)) {
            seenNormalized.add(k);
            sportsChannels.push({ ...item, category: "Sports" });
        } else if (/\b(hbo|showtime|cinemax|starz|tcm|turner classic|sundance|ifc|fxm|mgm|encore|retrocplex|indieplex|pixl|hallmark m|lmn|lifetime movie)\b/i.test(clean)) {
            seenNormalized.add(k);
            movieChannels.push({ ...item, category: "Movies & Cinema" });
        } else {
            seenNormalized.add(k);
            entChannels.push({ ...item, category: "Entertainment & Lifestyle" });
        }
    }

    let fullCurated = [
        ...dallasChannels,
        ...newsChannels,
        ...sportsChannels,
        ...entChannels,
        ...movieChannels,
        ...kidsChannels
    ];

    if (fullCurated.length > 250) {
        fullCurated = fullCurated.slice(0, 250);
    }

    console.log(`[CURATE-250] Target lineup trimmed to ${fullCurated.length} channels.`);

    // Renumber all 250 channels sequentially from 1 to 250
    console.log(`[CURATE-250] Renumbering channels from 1 to ${fullCurated.length}...`);
    const batchSize = 10;
    for (let i = 0; i < fullCurated.length; i += batchSize) {
        const batch = fullCurated.slice(i, i + batchSize);
        await Promise.all(batch.map((ch, idx) => {
            const newNum = i + idx + 1;
            ch.channel_number = newNum;
            const patchBody: any = { channel_number: newNum };
            if (ch.auto_created) {
                patchBody.override = { channel_number: newNum };
            }
            return fetch(`${baseUrl}/api/channels/channels/${ch.id}/`, {
                method: "PATCH",
                headers,
                body: JSON.stringify(patchBody)
            }).catch(e => console.error(`Error patching channel ${ch.id}:`, e.message));
        }));
    }

    // Bulk-update profile 8 (Combined)
    const profRes = await fetch(`${baseUrl}/api/channels/profiles/`, { headers });
    const profiles: any[] = await profRes.json();
    let combinedProfile = profiles.find(p => p.name.toLowerCase() === "combined");

    if (combinedProfile) {
        const selectedIds = new Set(fullCurated.map(c => c.id));
        const payload = {
            channels: allChannels.map(c => ({
                channel_id: c.id,
                enabled: selectedIds.has(c.id)
            }))
        };

        const updateRes = await fetch(`${baseUrl}/api/channels/profiles/${combinedProfile.id}/channels/bulk-update/`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(payload)
        });
        console.log(`[CURATE-250] Bulk-update status: ${updateRes.status}`);
    }

    const tunerUrl = `${baseUrl}/hdhr/Combined`;
    const guideUrl = `${baseUrl}/output/epg/Combined`;

    return {
        success: true,
        channelCount: fullCurated.length,
        profileName: "Combined",
        tunerUrl,
        guideUrl,
        channels: fullCurated
    };
}

if (require.main === module) {
    curateDispatcharrChannels()
        .then(res => {
            console.log("\n[SUCCESS] Applied 250 curated channels!");
            process.exit(0);
        })
        .catch(err => {
            console.error("Execution error:", err);
            process.exit(1);
        });
}
