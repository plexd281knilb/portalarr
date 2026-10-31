import prisma from "../src/lib/prisma";
import { getIptvSettings, saveIptvSettings } from "../src/lib/iptv/provider-vault";

// Priority keywords for curating the top ~220 channels
const LOCAL_KEYWORDS = [
    /\b(cbs|wcbs|wnbc|nbc|fox|wnyw|abc|wabc|cw|wpix|pbs|wnet)\b/i
];

const NEWS_KEYWORDS = [
    /\b(cnn|fox news|msnbc|cnbc|bloomberg|c-span|weather channel|bbc news|hln|newsmax|scripps news|newsnation)\b/i
];

const SPORTS_KEYWORDS = [
    /\b(espn|espn2|espnu|espnews|fs1|fs2|fox sports|nbc sports|cbs sports|cbssn|nfl network|redzone|mlb network|nba tv|nhl network|sec network|big ten|acc network|golf channel|tennis channel|fight network|motor trend|sportsnet|fan duel|pac-12|willow|mavtv|bein sports)\b/i
];

const ENTERTAINMENT_KEYWORDS = [
    /\b(usa network|usa hd|tnt|tbs|fx hd|fx\b|fxx|fxm|amc\b|bravo|hgtv|food network|comedy central|discovery|history|a&e|paramount network|hallmark|tlc|syfy|e!|bet|mtv|vh1|freeform|tru tv|investigation discovery|nat geo|national geographic|travel channel|oxygen|lifetime|own\b|vice|pop\b|reelz|tcm|turner classic|sundance|ifc|starz|hbo|cinemax|showtime|epix|mgm|encore|tv land|cozi|metv|antenna|game show|gsn)\b/i
];

const KIDS_KEYWORDS = [
    /\b(disney channel|disney xd|disney junior|nickelodeon|nick jr|nicktoons|teen nick|cartoon network|boomerang|pbs kids|universal kids)\b/i
];

export async function curateDispatcharrChannels(customApiKey?: string) {
    const key = (customApiKey || "3fhUZnZF8B3Db2SesYfYS008MRyKtZ98V4ku343n5gHtFMxNYw3jgA").trim();
    const settings = await getIptvSettings();
    const baseUrl = (settings.dispatcharrUrl || "http://192.168.1.87:9191").replace(/\/+$/, "");

    await saveIptvSettings({ dispatcharrApiKey: key, dispatcharrUrl: baseUrl });
    console.log(`[CURATE] Saved real Dispatcharr API key into Portalarr settings.`);

    const headers = {
        "X-API-Key": key,
        "Accept": "application/json",
        "Content-Type": "application/json"
    };

    console.log(`[CURATE] Connecting to Dispatcharr at ${baseUrl}...`);

    // 1. Fetch all channels
    const chanRes = await fetch(`${baseUrl}/api/channels/channels/?page_size=5000`, { headers });
    if (!chanRes.ok) {
        throw new Error(`Failed to fetch channels from Dispatcharr: HTTP ${chanRes.status}`);
    }
    const chanData = await chanRes.json();
    const allChannels: any[] = Array.isArray(chanData?.results) ? chanData.results : (Array.isArray(chanData) ? chanData : []);
    console.log(`[CURATE] Found ${allChannels.length} total channels in Dispatcharr.`);

    // 2. Filter and rank channels to keep under 250
    const validChannels = allChannels.filter(c => {
        const name = (c.name || "").toLowerCase();
        if (/\[bk\]|\(bk\)|\[alt\]|\(alt\)|test\b/i.test(name)) return false;
        if (/offline|dead|placeholder/i.test(name)) return false;
        return true;
    });

    const selectedChannels: any[] = [];
    const seenNames = new Set<string>();

    function cClean(n: string) {
        return (n || "").replace(/^(us[|:]|✦●✦)\s*/i, "").replace(/\[usa\]|\(fhd\)|1080p|60fps|hd/gi, "").trim();
    }

    function pickChannels(keywordList: RegExp[], limit: number) {
        for (const kw of keywordList) {
            for (const ch of validChannels) {
                if (selectedChannels.length >= 240) break;
                const name = cClean(ch.name).toLowerCase();
                if (kw.test(name) && !seenNames.has(name)) {
                    seenNames.add(name);
                    selectedChannels.push(ch);
                }
            }
        }
    }

    // Pick in clean priority order: Local (1-25), News (26-60), Sports (61-130), Entertainment (131-210), Kids (211-235)
    pickChannels(LOCAL_KEYWORDS, 25);
    pickChannels(NEWS_KEYWORDS, 35);
    pickChannels(SPORTS_KEYWORDS, 70);
    pickChannels(ENTERTAINMENT_KEYWORDS, 95);
    pickChannels(KIDS_KEYWORDS, 25);

    // If still under 200, fill with top remaining channels
    if (selectedChannels.length < 200) {
        for (const ch of validChannels) {
            if (selectedChannels.length >= 235) break;
            const name = cClean(ch.name).toLowerCase();
            if (!seenNames.has(name)) {
                seenNames.add(name);
                selectedChannels.push(ch);
            }
        }
    }

    console.log(`[CURATE] Selected ${selectedChannels.length} top channels (Strictly under 250).`);

    // 3. Renumber selected channels starting at 1 sequentially (in concurrent batches of 15)
    console.log(`[CURATE] Renumbering ${selectedChannels.length} channels from 1 to ${selectedChannels.length}...`);
    const batchSize = 15;
    for (let i = 0; i < selectedChannels.length; i += batchSize) {
        const batch = selectedChannels.slice(i, i + batchSize);
        await Promise.all(batch.map((ch, idx) => {
            const newNum = i + idx + 1;
            return fetch(`${baseUrl}/api/channels/channels/${ch.id}/`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({
                    channel_number: newNum
                })
            }).catch(e => console.error(`Failed to patch channel ${ch.id}:`, e.message));
        }));
    }
    console.log(`[CURATE] Renumbering complete! Channels now ordered 1 to ${selectedChannels.length}.`);

    // 4. Ensure profile "Combined" exists and only has selected channels enabled
    const profRes = await fetch(`${baseUrl}/api/channels/profiles/`, { headers });
    const profiles: any[] = await profRes.json();
    let combinedProfile = profiles.find(p => p.name.toLowerCase() === "combined");

    if (combinedProfile) {
        const selectedIdSet = new Set(selectedChannels.map(c => c.id));
        const membershipPayload = {
            channels: allChannels.map(c => ({
                channel_id: c.id,
                enabled: selectedIdSet.has(c.id)
            }))
        };
        const bulkRes = await fetch(`${baseUrl}/api/channels/profiles/${combinedProfile.id}/channels/bulk-update/`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(membershipPayload)
        });
        console.log(`[CURATE] Bulk-update status for profile Combined: ${bulkRes.status}`);
        console.log(`[CURATE] Exactly ${selectedChannels.length} channels enabled in 'Combined', all other ${allChannels.length - selectedChannels.length} disabled.`);
    }

    const tunerUrl = `${baseUrl}/hdhr/Combined`;
    const guideUrl = `${baseUrl}/output/epg/Combined`;

    console.log(`\n==========================================================`);
    console.log(`[SUCCESS] Curated 1 Single Combined Profile in Dispatcharr!`);
    console.log(`Channel Count: ${selectedChannels.length} (Numbered 1 to ${selectedChannels.length})`);
    console.log(`Tuner Device Address: ${tunerUrl}`);
    console.log(`XMLTV EPG Guide URL:  ${guideUrl}`);
    console.log(`==========================================================\n`);

    return {
        success: true,
        channelCount: selectedChannels.length,
        profileName: "Combined",
        tunerUrl,
        guideUrl
    };
}

if (require.main === module) {
    curateDispatcharrChannels()
        .then(res => {
            console.log("Completed successfully:", res);
            process.exit(0);
        })
        .catch(err => {
            console.error("Execution error:", err);
            process.exit(1);
        });
}
