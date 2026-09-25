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
            { email: "plexd281knilb@gmail.com", username: "dominicjuliano" },
            { user: { email: "plexd281knilb@gmail.com", username: "dominicjuliano" } }
        ) === true,
        "Exact email & username matches"
    );

    // 2. Email prefix matches username
    assert(
        matchesPlexUser(
            { email: "trevsky313@gmail.com", username: "trevscar1121" },
            { user: { email: "different@email.com", username: "trevsky313" } }
        ) === true,
        "Email prefix (trevsky313) matches Plex username (trevsky313)"
    );

    // 3. Substring collision guard 1: dominicjuliano vs mjuli86 (mjuliano7@yahoo.com)
    assert(
        matchesPlexUser(
            { email: "plexd281knilb@gmail.com", username: "dominicjuliano", name: "David Garza" },
            { user: { email: "mjuliano7@yahoo.com", username: "mjuli86" } }
        ) === false,
        "Substring collision: dominicjuliano MUST NOT match mjuliano7/mjuli86"
    );

    // 4. Substring collision guard 2: dominicjuliano vs juliano
    assert(
        matchesPlexUser(
            { email: "plexd281knilb@gmail.com", username: "dominicjuliano" },
            { user: { email: "juliano@gmail.com", username: "juliano" } }
        ) === false,
        "Substring collision: dominicjuliano MUST NOT match juliano"
    );

    // 5. Unrelated user with same display name: dominicjuliano vs David Garza
    assert(
        matchesPlexUser(
            { email: "plexd281knilb@gmail.com", username: "dominicjuliano" },
            { user: { email: "davidgarza@gmail.com", username: "dgarza", title: "David Garza" } }
        ) === false,
        "Unrelated user: dominicjuliano MUST NOT match David Garza friend"
    );

    // 6. Alphanumeric match: trev_sky313 vs trevsky313
    assert(
        matchesPlexUser(
            { email: "test@test.com", username: "trev_sky313" },
            { user: { email: "other@other.com", username: "trevsky313" } }
        ) === true,
        "Normalized alnum match: trev_sky313 matches trevsky313"
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
}

runTests();
