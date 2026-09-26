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
