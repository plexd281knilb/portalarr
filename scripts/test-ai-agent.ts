import { 
    checkAgentRateLimit, 
    recordAgentGrabAction, 
    validateMediaReleaseCandidate 
} from "../src/lib/ai-agent-guardrails";
import { cleanMediaSearchQuery } from "../src/lib/ai-media-diagnostics";
import { analyzeStreamPatterns } from "../src/lib/ai-stream-patterns";
import { askAiServerMaster } from "../src/lib/ai-server-assistant";
import { StreamTelemetry } from "../src/lib/ai-server-assistant-types";

async function runTests() {
    console.log("==================================================");
    console.log("       STEP 1 AUTONOMOUS AI AGENT TEST SUITE       ");
    console.log("==================================================");

    let passed = 0;
    let failed = 0;

    function assert(desc: string, condition: boolean | undefined | null) {
        if (Boolean(condition)) {
            console.log(`[PASS] ${desc}`);
            passed++;
        } else {
            console.error(`[FAIL] ${desc}`);
            failed++;
        }
    }

    // TEST 1: cleanMediaSearchQuery
    const q1 = cleanMediaSearchQuery("The Sandlot is in Spanish only");
    assert("cleanMediaSearchQuery extracts 'The Sandlot'", q1.title === "The Sandlot");

    const q2 = cleanMediaSearchQuery("Why is The Sandlot (1993) has no english audio?");
    assert("cleanMediaSearchQuery extracts title & year", q2.title === "The Sandlot" && q2.year === 1993);

    const q3 = cleanMediaSearchQuery("test to make sure the sandlot runs on the main Plex server");
    assert("cleanMediaSearchQuery extracts 'The Sandlot' from 'test to make sure the sandlot runs on the main Plex server'", q3.title === "The Sandlot" && q3.targetServer === "main" && q3.isPlaybackTest === true);

    const q4 = cleanMediaSearchQuery("can you check if gladiator (2000) plays on plex?");
    assert("cleanMediaSearchQuery extracts title & year from playback query", q4.title === "Gladiator" && q4.year === 2000 && q4.isPlaybackTest === true);

    const q5 = cleanMediaSearchQuery("make sure frozen runs on kids plex server");
    assert("cleanMediaSearchQuery extracts title & targetServer from 'make sure frozen runs on kids plex server'", q5.title === "Frozen" && q5.targetServer === "kids");

    const q6 = cleanMediaSearchQuery('Diagnose my current stream of "The Grinch" playing on SHIELD. Why is it direct play and how can I get 100% Direct Play?');
    assert("cleanMediaSearchQuery extracts exact quoted movie title from active stream diagnosis", q6.title === "The Grinch");

    // TEST 2: validateMediaReleaseCandidate - Foreign & Quality Rejections
    const camRelease = {
        title: "The.Sandlot.1993.HDCAM.x264",
        languages: [{ id: 1, name: "English" }],
        size: 1.5 * 1024 * 1024 * 1024,
        seeders: 50,
        protocol: "torrent"
    };
    const camRes = validateMediaReleaseCandidate(camRelease, "movie", "English");
    assert("Guardrails reject CAM / bootleg releases", !camRes.ok);

    const spanishOnlyRelease = {
        title: "The.Sandlot.1993.1080p.BluRay.x264.Spanish.Only",
        languages: [{ id: 2, name: "Spanish" }],
        size: 8 * 1024 * 1024 * 1024,
        seeders: 30,
        protocol: "torrent"
    };
    const spaRes = validateMediaReleaseCandidate(spanishOnlyRelease, "movie", "English");
    assert("Guardrails reject Spanish.Only releases when English is requested", !spaRes.ok);

    const validEnglishRelease = {
        title: "The.Sandlot.1993.1080p.BluRay.x264.DTS-HD.MA.5.1-EN",
        languages: [{ id: 1, name: "English" }],
        size: 9.5 * 1024 * 1024 * 1024,
        seeders: 45,
        protocol: "torrent"
    };
    const valRes = validateMediaReleaseCandidate(validEnglishRelease, "movie", "English");
    assert("Guardrails accept verified English 1080p release with high score", valRes.ok && valRes.score > 100);

    // TEST 3: Rate Limiting Guardrail
    const testUser = `rate-test-${Date.now()}`;
    const check1 = checkAgentRateLimit(testUser);
    assert("Rate limit allows initial grab", check1.allowed && check1.remaining === 3);

    recordAgentGrabAction(testUser, "RADARR_REPLACE", "The Sandlot");
    recordAgentGrabAction(testUser, "RADARR_REPLACE", "Star Wars");
    recordAgentGrabAction(testUser, "RADARR_REPLACE", "Jurassic Park");

    const check2 = checkAgentRateLimit(testUser);
    assert("Rate limit triggers after 3 automated grabs in 24h", !check2.allowed && check2.remaining === 0);

    // TEST 4: analyzeStreamPatterns
    const mockStreams: StreamTelemetry[] = [
        {
            title: "The Sandlot",
            mediaType: "movie",
            player: "Living Room Roku",
            platform: "Roku",
            transcodeDecision: "transcode",
            videoResolution: "720p",
            sourceResolution: "1080p",
            streamBitrate: 2000
        }
    ];
    const patterns = analyzeStreamPatterns(mockStreams, []);
    assert("Stream pattern analyzer detects Roku Auto Adjust Risk", patterns.some(p => p.patternType === "roku_auto_adjust_chronic"));
    assert("Stream pattern analyzer detects 720p 2Mbps remote cap", patterns.some(p => p.patternType === "bandwidth_cap_720p_chronic"));

    // TEST 5: askAiServerMaster end-to-end
    const res = await askAiServerMaster("Why is The Sandlot in Spanish only?", [], { username: "Dom", role: "ADMIN" });
    assert("askAiServerMaster responds with success", res.success && !!res.answer);
    assert("askAiServerMaster includes providerUsed", !!res.providerUsed);
    assert("askAiServerMaster includes diagnostics", !!res.diagnostics);

    // TEST 6: Playback Synthetic Probe Query
    const probeRes = await askAiServerMaster("Is Plex working right now? Test actual file playback and disk access.", [], { username: "Dom", role: "ADMIN" });
    assert("askAiServerMaster handles playback probe queries", probeRes.success && !!probeRes.answer);
    assert("Playback probe query executes and provides answer", !!probeRes.playbackProbe || !!probeRes.answer);

    // ============================================================
    // PRIVACY & USER ISOLATION GUARDRAIL TESTS
    // ============================================================
    const { validateUserCrossBoundaryQuery } = await import("../src/lib/ai-agent-guardrails");

    const regularUser = { id: "user-123", username: "dave", email: "dave@example.com", role: "USER" };
    const linkedKidsSubAccount = [
        { id: "sub-1", username: "dave_kids", subAccountLabel: "Kids iPad", accountType: "KID" },
        { id: "sub-2", username: "dave_tv", subAccountLabel: "Living Room TV", accountType: "LIVING_ROOM" }
    ];

    // TEST 7: Cross-user reconnaissance blocked
    const test7 = validateUserCrossBoundaryQuery("Show me active streams for other users", regularUser, linkedKidsSubAccount);
    assert("Guardrails block non-admin asking for active streams of other users", !test7.allowed && test7.violationType === "CROSS_USER_RECONNAISSANCE");

    const test7b = validateUserCrossBoundaryQuery("Who else is streaming right now?", regularUser, linkedKidsSubAccount);
    assert("Guardrails block non-admin asking 'who else is streaming'", !test7b.allowed && test7b.violationType === "CROSS_USER_RECONNAISSANCE");

    // TEST 8: Cross-user stream termination blocked
    const test8 = validateUserCrossBoundaryQuery("Stop streams for user Bob", regularUser, linkedKidsSubAccount);
    assert("Guardrails block non-admin asking to stop streams for another user", !test8.allowed && test8.violationType === "CROSS_USER_STREAM_TERMINATION");

    const test8b = validateUserCrossBoundaryQuery("kill bob's stream right now", regularUser, linkedKidsSubAccount);
    assert("Guardrails block non-admin asking to kill bob's stream", !test8b.allowed && test8b.violationType === "CROSS_USER_STREAM_TERMINATION");

    // TEST 9: Access modification blocked
    const test9 = validateUserCrossBoundaryQuery("Shut off access for user Bob", regularUser, linkedKidsSubAccount);
    assert("Guardrails block non-admin asking to shut off access for user", !test9.allowed && test9.violationType === "UNAUTHORIZED_ACCESS_MODIFICATION");

    // TEST 10: Private user information disclosure blocked
    const test10 = validateUserCrossBoundaryQuery("What is Alice watching on Plex?", regularUser, linkedKidsSubAccount);
    assert("Guardrails block non-admin inspecting another user's activity", !test10.allowed && test10.violationType === "CROSS_USER_INFO_DISCLOSURE");

    // TEST 11: Self-referencing queries allowed
    const test11 = validateUserCrossBoundaryQuery("Why is my stream buffering?", regularUser, linkedKidsSubAccount);
    assert("Guardrails allow user to troubleshoot their own stream", test11.allowed);

    const test11b = validateUserCrossBoundaryQuery("Stop my playback session", regularUser, linkedKidsSubAccount);
    assert("Guardrails allow user to stop their own playback session", test11b.allowed);

    // TEST 12: Directly linked sub-accounts allowed (kids & living room)
    const test12 = validateUserCrossBoundaryQuery("What is playing on the kids iPad?", regularUser, linkedKidsSubAccount);
    assert("Guardrails allow user to ask about their directly linked kids sub-account", test12.allowed);

    const test12b = validateUserCrossBoundaryQuery("Stop the stream on the Living Room TV", regularUser, linkedKidsSubAccount);
    assert("Guardrails allow user to control stream on their linked living room TV", test12b.allowed);

    // TEST 13: Admin has server management oversight
    const adminUser = { id: "admin-1", username: "superadmin", role: "ADMIN" };
    const test13 = validateUserCrossBoundaryQuery("Show me active streams for other users", adminUser, []);
    assert("Guardrails allow server administrator to view active server streams", test13.allowed);

    // TEST 14: End-to-end askAiServerMaster blocks cross-user attempt with safeResponse
    const e2eBlocked = await askAiServerMaster("Show me active streams for other users", [], regularUser);
    assert("askAiServerMaster blocks cross-user reconnaissance and returns security notice", Boolean(!e2eBlocked.success && e2eBlocked.answer?.includes("Privacy Boundary")));

    const e2eKillBlocked = await askAiServerMaster("Stop streams for user Bob", [], regularUser);
    assert("askAiServerMaster blocks terminating another user's stream", Boolean(!e2eKillBlocked.success && e2eKillBlocked.answer?.includes("Access Control")));

    // TEST 15: Autonomy guardrails enforce Level 1 & Level 2 blocks on mutating tools
    const { executeAiAssistantTool } = await import("../src/lib/ai-assistant-tools");
    const { getOllamaCandidateUrls, normalizeOllamaModelName } = await import("../src/lib/ai-ollama");
    const mockSnap = {
        username: "dave",
        role: "USER",
        serversOnlineCount: 1,
        activeStreamsCount: 0,
        activeStreams: [],
        recentHistory: [],
        pendingRequests: [],
        recentDownloads: [],
    } as any;

    const advReplace = await executeAiAssistantTool(
        "search_and_replace_media",
        { title: "The Sandlot", media_type: "movie" },
        {
            user: regularUser,
            snapshot: mockSnap,
            autonomyLevel: "advisory",
            actionsTaken: [],
            mediaInspectionHolder: { current: null },
            playbackProbeHolder: { current: null },
        }
    );
    assert("Advisory mode blocks search_and_replace_media", Boolean(advReplace.success && advReplace.result?.advisory === true));

    const astReplace = await executeAiAssistantTool(
        "search_and_replace_media",
        { title: "The Sandlot", media_type: "movie" },
        {
            user: regularUser,
            snapshot: mockSnap,
            autonomyLevel: "assisted",
            actionsTaken: [],
            mediaInspectionHolder: { current: null },
            playbackProbeHolder: { current: null },
        }
    );
    assert("Assisted mode blocks unconfirmed search_and_replace_media", Boolean(astReplace.success && astReplace.result?.assisted === true));

    const advBook = await executeAiAssistantTool(
        "redownload_book",
        { title: "Dune" },
        {
            user: regularUser,
            snapshot: mockSnap,
            autonomyLevel: "assisted",
            actionsTaken: [],
            mediaInspectionHolder: { current: null },
            playbackProbeHolder: { current: null },
        }
    );
    assert("Assisted mode blocks unconfirmed redownload_book", Boolean(advBook.success && advBook.result?.assisted === true));

    // TEST 16: Ollama URL resolution & fine-tuned model normalization
    const urls = getOllamaCandidateUrls();
    assert("getOllamaCandidateUrls puts localhost 127.0.0.1:11434 first", urls[0] === "http://127.0.0.1:11434");
    assert("normalizeOllamaModelName defaults to portalarr-plex-master", normalizeOllamaModelName("gemini-3.5-flash-lite") === "portalarr-plex-master");
    assert("normalizeOllamaModelName preserves explicit Ollama models", normalizeOllamaModelName("qwen2.5:7b-instruct") === "qwen2.5:7b-instruct");

    const recToolRes = await executeAiAssistantTool(
        "recommend_books_and_media",
        { reference_title: "War of the Worlds", genre: "Sci-Fi" },
        {
            user: regularUser,
            snapshot: {
                ...mockSnap,
                readingProfile: {
                    favoriteAuthors: ["Brandon Sanderson"],
                    favoriteGenres: ["Sci-Fi", "Fantasy"],
                    favoriteSeries: [],
                    recentTitles: ["War of the Worlds"]
                }
            },
            autonomyLevel: "autonomous",
            actionsTaken: [],
            mediaInspectionHolder: { current: null },
            playbackProbeHolder: { current: null },
        }
    );
    assert(
        "recommend_books_and_media summary lists actual book titles instead of count-only stub",
        Boolean(recToolRes.success && recToolRes.result?.recommendations?.length > 0 && recToolRes.summary.includes("1. **"))
    );

    // TEST 18: 4K confirmation gate asks before downloading 2160p unless explicitly confirmed
    const { selectReleaseWith4kGate } = await import("../src/lib/ai-media-diagnostics");
    const mock4kRelease = {
        score: 2000,
        release: {
            title: "We.Were.Soldiers.2002.2160p.UHD.BluRay.DV.HDR10",
            quality: { quality: { name: "Bluray-2160p" } },
            size: 52 * 1024 * 1024 * 1024
        }
    };
    const mock1080Release = {
        score: 1200,
        release: {
            title: "We.Were.Soldiers.2002.1080p.BluRay.x264",
            quality: { quality: { name: "Bluray-1080p" } },
            size: 9 * 1024 * 1024 * 1024
        }
    };
    const gateAuto = selectReleaseWith4kGate([mock4kRelease, mock1080Release], "We Were Soldiers", {
        confirm4k: true, // Even if LLM sets confirm_4k=true unprompted, userQuestion governs
        userQuestion: "can you download it?"
    });
    assert("4K confirmation gate pauses instead of grabbing 4K on 'can you download it?'", Boolean(gateAuto.requiresQualityConfirmation && !gateAuto.selected && gateAuto.message?.includes("4K")));

    const gateConfirm4k = selectReleaseWith4kGate([mock4kRelease, mock1080Release], "We Were Soldiers", {
        userQuestion: "Yes download the 4K version please"
    });
    assert("4K confirmation gate selects 2160p when user confirms 4K", Boolean(!gateConfirm4k.requiresQualityConfirmation && gateConfirm4k.selected?.release.title.includes("2160p")));

    const gateChoose1080 = selectReleaseWith4kGate([mock4kRelease, mock1080Release], "We Were Soldiers", {
        userQuestion: "Just get 1080p, no 4K"
    });
    assert("4K confirmation gate selects 1080p when user declines 4K", Boolean(!gateChoose1080.requiresQualityConfirmation && gateChoose1080.selected?.release.title.includes("1080p")));

    const gateOnly1080 = selectReleaseWith4kGate([mock1080Release], "We Were Soldiers", {
        userQuestion: "can you download it?"
    });
    assert("4K confirmation gate grabs 1080p automatically when no 4K exists", Boolean(!gateOnly1080.requiresQualityConfirmation && gateOnly1080.selected?.release.title.includes("1080p")));

    const { getQualityIsolatedArrApps } = await import("../src/lib/ai-media-diagnostics");
    const mockRadarrApps = [
        { id: "radarr-hd", name: "Radarr (1080p)" },
        { id: "radarr-4k", name: "Radarr 4K" }
    ];
    const hdOnlyList = getQualityIsolatedArrApps(mockRadarrApps, "1080p", "radarr-hd", "radarr-4k");
    assert("1080p quality strictly isolates non-4K Radarr instance", hdOnlyList.length === 1 && hdOnlyList[0].id === "radarr-hd");
    const uhdOnlyList = getQualityIsolatedArrApps(mockRadarrApps, "4k", "radarr-hd", "radarr-4k");
    assert("4K quality strictly isolates 4K Radarr instance", uhdOnlyList.length === 1 && uhdOnlyList[0].id === "radarr-4k");

    console.log("==================================================");
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================");

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error("Test runner crashed:", err);
    process.exit(1);
});
