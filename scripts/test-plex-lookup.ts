import { matchesPlexUser } from "../src/lib/plex";

function runTests() {
    console.log("==========================================================");
    console.log("       PLEX USER MATCHING & LOOKUP UNIT TESTS             ");
    console.log("==========================================================\n");

    let passed = 0;
    let failed = 0;

    const assert = (condition: boolean, desc: string) => {
        if (condition) {
            console.log(`[PASS] ${desc}`);
            passed++;
        } else {
            console.error(`[FAIL] ${desc}`);
            failed++;
        }
    };

    // 1. Exact email match
    assert(
        matchesPlexUser(
            { email: "user_primary@example.com", username: "userprimary" },
            { user: { email: "user_primary@example.com", username: "userprimary" } }
        ) === true,
        "Exact email & username matches"
    );

    // 2. Email prefix matches username
    assert(
        matchesPlexUser(
            { email: "prefixmatch313@example.com", username: "prefix_alias" },
            { user: { email: "different@example.com", username: "prefixmatch313" } }
        ) === true,
        "Email prefix (prefixmatch313) matches Plex username (prefixmatch313)"
    );

    // 3. Substring collision guard 1: userprimary vs mjprimary86 (primary7@example.com)
    assert(
        matchesPlexUser(
            { email: "user_primary@example.com", username: "userprimary", name: "David Garcia" },
            { user: { email: "primary7@example.com", username: "mjprimary86" } }
        ) === false,
        "Substring collision: userprimary MUST NOT match primary7/mjprimary86"
    );

    // 4. Substring collision guard 2: userprimary vs primary
    assert(
        matchesPlexUser(
            { email: "user_primary@example.com", username: "userprimary" },
            { user: { email: "primary@example.com", username: "primary" } }
        ) === false,
        "Substring collision: userprimary MUST NOT match primary"
    );

    // 5. Unrelated user with same display name: userprimary vs David Garcia
    assert(
        matchesPlexUser(
            { email: "user_primary@example.com", username: "userprimary" },
            { user: { email: "davidgarcia@example.com", username: "dgarcia", title: "David Garcia" } }
        ) === false,
        "Unrelated user: userprimary MUST NOT match David Garcia friend"
    );

    // 6. Alphanumeric match: prefix_match313 vs prefixmatch313
    assert(
        matchesPlexUser(
            { email: "test@example.com", username: "prefix_match313" },
            { user: { email: "other@example.com", username: "prefixmatch313" } }
        ) === true,
        "Normalized alnum match: prefix_match313 matches prefixmatch313"
    );

    // 7. Numeric Plex ID match
    assert(
        matchesPlexUser(
            { id: "12345678", email: "changed@email.com", username: "changed" },
            { user: { id: 12345678, email: "old@email.com", username: "old" } }
        ) === true,
        "Plex Numeric ID match (12345678)"
    );

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
    process.exit(0);
}

runTests();

