import { prisma } from "../src/lib/prisma";
import { 
    getLibraries,
    getLibraryBooks,
    getBookRequests,
    getBetaCards,
    getBlocklistedReleases,
    getSystemLogsAction,
    getAlertBanner,
    getRoadmapText
} from "../src/app/actions";
import { encryptData, decryptData } from "../src/lib/encryption";
import { logger } from "../src/lib/logger";

async function runTestSuite() {
    console.log("==========================================================");
    console.log("   PORTALARR FULL SYSTEM & DATABASE VERIFICATION SUITE    ");
    console.log("==========================================================\n");

    let passedTests = 0;
    let failedTests = 0;

    async function assertTest(name: string, fn: () => Promise<void>) {
        try {
            process.stdout.write(`[TEST] ${name.padEnd(52, ".")} `);
            await fn();
            console.log("✅ PASSED");
            passedTests++;
        } catch (err: any) {
            console.log("❌ FAILED");
            console.error(`       Error: ${err.message || err}`);
            failedTests++;
        }
    }

    // 1. Prisma Connection & Settings Model
    await assertTest("Prisma: Settings Model CRUD & Defaults", async () => {
        let settings = await prisma.settings.findUnique({ where: { id: "global" } });
        if (!settings) {
            settings = await prisma.settings.create({
                data: { id: "global", theme: "dark", autoSyncInterval: 6 }
            });
        }
        if (!settings || settings.id !== "global") throw new Error("Settings not retrieved properly");

        await prisma.settings.update({
            where: { id: "global" },
            data: { theme: "dark", refreshInterval: 10 }
        });
    });

    // 2. Encryption / Decryption Subsystem
    await assertTest("Security: AES-256-GCM Encryption/Decryption", async () => {
        const secretToken = "plex-super-secret-token-xyz-12345";
        const encrypted = encryptData(secretToken);
        if (!encrypted || encrypted === secretToken) throw new Error("Encryption failed");

        const decrypted = decryptData(encrypted);
        if (decrypted !== secretToken) throw new Error(`Decrypted value "${decrypted}" !== original "${secretToken}"`);
    });

    // 3. User Model CRUD & Operations
    await assertTest("Prisma: User Model (Create, Read, Update, Delete)", async () => {
        const testUsername = `test_runner_${Date.now()}`;
        const testEmail = `${testUsername}@example.com`;
        
        const user = await prisma.user.create({
            data: {
                username: testUsername,
                email: testEmail,
                password: "hashed_dummy_password",
                role: "USER",
                status: "APPROVED",
                kindleEmail: "device@kindle.com"
            }
        });
        if (!user.id) throw new Error("User creation failed");

        const found = await prisma.user.findUnique({ where: { id: user.id } });
        if (!found || found.username !== testUsername || found.kindleEmail !== "device@kindle.com") {
            throw new Error("User lookup failed");
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { role: "ADMIN", kindleEmail: "updated@kindle.com" }
        });

        const updated = await prisma.user.findUnique({ where: { id: user.id } });
        if (updated?.role !== "ADMIN" || updated?.kindleEmail !== "updated@kindle.com") {
            throw new Error("User update failed");
        }

        await prisma.user.delete({ where: { id: user.id } });
    });

    // 4. Library & Book Models
    await assertTest("Prisma: Library & Book Models (Relations & Cascades)", async () => {
        const testLibName = `Test_Library_${Date.now()}`;
        const lib = await prisma.library.create({
            data: {
                name: testLibName,
                description: "Automated Test Library",
                path: "/media/ebooks",
                mediaType: "ebook",
                allowedUsers: "*",
                restrictedUsers: ""
            }
        });

        const book = await prisma.book.create({
            data: {
                title: "Dune",
                author: "Frank Herbert",
                series: "Dune Chronicles",
                volumeNumber: "1",
                filePath: "/media/ebooks/Frank Herbert/Dune.epub",
                fileType: "epub",
                fileSize: 1048576,
                mediaType: "ebook",
                libraryId: lib.id
            }
        });

        if (!book.id || book.series !== "Dune Chronicles" || book.volumeNumber !== "1") {
            throw new Error("Book fields failed verification");
        }

        const libWithBooks = await prisma.library.findUnique({
            where: { id: lib.id },
            include: { books: true }
        });
        if (!libWithBooks || libWithBooks.books.length !== 1) {
            throw new Error("Library relation lookup failed");
        }

        await prisma.book.delete({ where: { id: book.id } });
        await prisma.library.delete({ where: { id: lib.id } });
    });

    // 5. BookRequest Model
    await assertTest("Prisma: BookRequest Model Lifecycle Transitions", async () => {
        const req = await prisma.bookRequest.create({
            data: {
                title: "The Way of Kings",
                author: "Brandon Sanderson",
                series: "The Stormlight Archive",
                volumeNumber: "1",
                requestedBy: "testuser",
                status: "Pending",
                mediaType: "ebook",
                type: "book"
            }
        });

        if (!req.id || req.status !== "Pending") throw new Error("Request creation failed");

        for (const nextStatus of ["Searching", "Downloading", "Downloaded"]) {
            const updated = await prisma.bookRequest.update({
                where: { id: req.id },
                data: { status: nextStatus }
            });
            if (updated.status !== nextStatus) throw new Error(`Transition to ${nextStatus} failed`);
        }

        await prisma.bookRequest.delete({ where: { id: req.id } });
    });

    // 6. KindleDeliveryLog Model
    await assertTest("Prisma: KindleDeliveryLog Model (Status & Logs)", async () => {
        const log = await prisma.kindleDeliveryLog.create({
            data: {
                bookTitle: "Project Hail Mary",
                bookAuthor: "Andy Weir",
                recipientEmail: "reader@kindle.com",
                userEmail: "reader@example.com",
                username: "reader",
                status: "DELIVERED",
                fileSize: 850000,
                fileType: "epub",
                diagnostics: JSON.stringify({ check: "all_passed", deliveryTimeMs: 1200 })
            }
        });

        if (!log.id) throw new Error("KindleDeliveryLog creation failed");
        const found = await prisma.kindleDeliveryLog.findUnique({ where: { id: log.id } });
        if (!found || found.status !== "DELIVERED") throw new Error("KindleDeliveryLog lookup failed");

        await prisma.kindleDeliveryLog.delete({ where: { id: log.id } });
    });

    // 7. FailedRelease Model
    await assertTest("Prisma: FailedRelease Model (Prowlarr Blocklist)", async () => {
        const failed = await prisma.failedRelease.create({
            data: {
                releaseTitle: "Sample.Book.2026.GERMAN.EPUB",
                downloadUrl: "http://indexer.local/dl/123",
                guid: "guid-blocklist-test",
                protocol: "torrent",
                reason: "Foreign language detected (German)"
            }
        });

        if (!failed.id) throw new Error("FailedRelease creation failed");
        const list = await prisma.failedRelease.findMany({ where: { id: failed.id } });
        if (list.length === 0) throw new Error("FailedRelease lookup failed");

        await prisma.failedRelease.delete({ where: { id: failed.id } });
    });

    // 8. MediaApp, SupportTicket, BetaCard, Tautulli & Glances
    await assertTest("Prisma: MediaApp, SupportTicket & Instance Models", async () => {
        const ticket = await prisma.supportTicket.create({
            data: {
                name: "Test User",
                email: "user@test.org",
                issue: "Test issue for verification",
                status: "Pending"
            }
        });
        await prisma.supportTicket.delete({ where: { id: ticket.id } });

        const card = await prisma.betaCard.create({
            data: {
                title: "Dark Mode 2.0",
                content: "Enhanced contrast and OLED black mode",
                buttonText: "Check it out",
                buttonUrl: "/settings"
            }
        });
        await prisma.betaCard.delete({ where: { id: card.id } });

        const app = await prisma.mediaApp.create({
            data: {
                type: "sonarr",
                name: "Sonarr TV",
                url: "http://192.168.1.50:8989",
                apiKey: "test_key_abc"
            }
        });
        await prisma.mediaApp.delete({ where: { id: app.id } });

        const tautulli = await prisma.tautulliInstance.create({
            data: {
                name: "Plex Monitor",
                url: "http://192.168.1.50:8181",
                apiKey: "tautulli_key_123"
            }
        });
        await prisma.tautulliInstance.delete({ where: { id: tautulli.id } });

        const glances = await prisma.glancesInstance.create({
            data: {
                name: "Node 1 Glances",
                url: "http://192.168.1.50:61208"
            }
        });
        await prisma.glancesInstance.delete({ where: { id: glances.id } });
    });

    // 9. Logger Subsystem
    await assertTest("System Logger: Add, Retrieve & Clear System Logs", async () => {
        logger.addLog("SYSTEM", "SYSTEM", "Test log message from test suite");
        const logs = logger.getLogs();
        if (!Array.isArray(logs) || logs.length === 0) {
            throw new Error("System logger did not record log entry");
        }
        const hasOurLog = logs.some(l => l.message.includes("Test log message from test suite"));
        if (!hasOurLog) throw new Error("Created log entry not found in logs array");
    });

    // 10. Server Actions: getLibraries()
    await assertTest("Server Action: getLibraries()", async () => {
        const libs = await getLibraries();
        if (!Array.isArray(libs)) throw new Error("getLibraries did not return an array");
    });

    // 11. Server Actions: getBookRequests()
    await assertTest("Server Action: getBookRequests()", async () => {
        const reqs = await getBookRequests();
        if (!Array.isArray(reqs)) throw new Error("getBookRequests did not return an array");
    });

    // 12. Server Actions: getBetaCards()
    await assertTest("Server Action: getBetaCards()", async () => {
        const cards = await getBetaCards();
        if (!Array.isArray(cards)) throw new Error("getBetaCards did not return an array");
    });

    // 13. Server Actions: getBlocklistedReleases()
    await assertTest("Server Action: getBlocklistedReleases()", async () => {
        const blocklist = await getBlocklistedReleases();
        if (!Array.isArray(blocklist)) throw new Error("getBlocklistedReleases did not return an array");
    });

    // 14. Server Actions: getSystemLogsAction()
    await assertTest("Server Action: getSystemLogsAction()", async () => {
        const logs = await getSystemLogsAction();
        if (!Array.isArray(logs)) throw new Error("getSystemLogsAction did not return an array");
    });

    // 15. Server Actions: getAlertBanner()
    await assertTest("Server Action: getAlertBanner()", async () => {
        const banner = await getAlertBanner();
        if (typeof banner !== "object" || typeof banner.enabled !== "boolean") {
            throw new Error("getAlertBanner did not return expected object structure");
        }
    });

    // 16. Server Actions: getRoadmapText()
    await assertTest("Server Action: getRoadmapText()", async () => {
        const text = await getRoadmapText();
        if (typeof text !== "string") {
            throw new Error("getRoadmapText did not return a string");
        }
    });

    console.log("\n==========================================================");
    console.log(`   INTEGRATION TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED   `);
    console.log("==========================================================\n");

    if (failedTests > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTestSuite().catch((e) => {
    console.error("FATAL TEST RUNNER ERROR:", e);
    process.exit(1);
});
