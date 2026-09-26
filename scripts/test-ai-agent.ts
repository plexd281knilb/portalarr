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

    function assert(desc: string, condition: boolean) {
        if (condition) {
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
    assert("askAiServerMaster blocks cross-user reconnaissance and returns security notice", !e2eBlocked.success && e2eBlocked.answer?.includes("Privacy Boundary"));

    const e2eKillBlocked = await askAiServerMaster("Stop streams for user Bob", [], regularUser);
    assert("askAiServerMaster blocks terminating another user's stream", !e2eKillBlocked.success && e2eKillBlocked.answer?.includes("Access Control"));

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
