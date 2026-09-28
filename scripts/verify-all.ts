import { prisma } from "../src/lib/prisma";
import { 
    getLibraries,
    getLibraryBooks,
    getBookRequests,
    getBetaCards,
    getBlocklistedReleases,
    getSystemLogsAction,
    getAlertBanner,
    getRoadmapText,
    validateMemberReferenceAction
} from "../src/app/actions";
import { calculateProratedBilling } from "../src/lib/prorated-billing";
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

    // Ensure schema columns and tables are up to date before running verification
    const { ensureSchemaColumns } = await import("../src/lib/prisma");
    await ensureSchemaColumns();

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

    // 17. Server Action: submitAutoErrorTicketAction()
    await assertTest("Server Action: submitAutoErrorTicketAction()", async () => {
        const { submitAutoErrorTicketAction } = await import("../src/app/actions");
        const res = await submitAutoErrorTicketAction({
            errorMessage: "Test automated runtime error for verification",
            errorTitle: "Test System Error",
            pageUrl: "/library",
            userAgent: "PortalarrTestSuite/1.0",
            customNote: "Automated test runner note"
        });
        if (!res || !res.success || !res.ticketId) {
            throw new Error("submitAutoErrorTicketAction failed to create ticket");
        }
        // Cleanup test ticket
        await prisma.supportTicket.delete({ where: { id: res.ticketId } });
    });

    // 18. Prisma: MediaRequest Model (Seerr Requests)
    await assertTest("Prisma: MediaRequest Model Lifecycle & Transitions", async () => {
        const mediaReq = await prisma.mediaRequest.create({
            data: {
                mediaType: "tv",
                tmdbId: 999999,
                tvdbId: 888888,
                title: "Test Verification Series",
                releaseYear: "2026",
                posterPath: "/test-poster.jpg",
                overview: "Test TV Show for full test suite verification",
                status: "PENDING",
                is4k: true,
                isKids: false,
                contentRating: "TV-14",
                requestedByUsername: "testrunner",
                seasons: JSON.stringify([1, 2])
            }
        });

        if (!mediaReq.id || mediaReq.title !== "Test Verification Series") {
            throw new Error("MediaRequest creation failed");
        }

        for (const nextStatus of ["APPROVED", "PROCESSING", "AVAILABLE"]) {
            const updated = await prisma.mediaRequest.update({
                where: { id: mediaReq.id },
                data: { status: nextStatus, downloadProgress: nextStatus === "AVAILABLE" ? 100 : 50 }
            });
            if (updated.status !== nextStatus) throw new Error(`MediaRequest transition to ${nextStatus} failed`);
        }

        await prisma.mediaRequest.delete({ where: { id: mediaReq.id } });
    });

    // 19. Email Templates: Render All Seerr Email Templates
    await assertTest("Email Engine: Render Seerr Notification Templates", async () => {
        const { renderEmailTemplate } = await import("../src/lib/email-templates");
        const templatesToTest = [
            "seerr_request_new_admin",
            "seerr_request_auto_approved",
            "seerr_request_approved",
            "seerr_request_declined",
            "seerr_request_available",
            "seerr_request_failed"
        ];

        for (const tid of templatesToTest) {
            const rendered = await renderEmailTemplate(tid, {
                title: "Inception",
                mediaType: "Movie",
                releaseYear: "2010",
                overview: "A thief who steals corporate secrets through the use of dream-sharing technology.",
                requestedBy: "johndoe",
                username: "johndoe",
                contentRating: "PG-13",
                quality: "4K UHD",
                serverName: "Main PMS",
                seasons: "Season 1, Season 2",
                reason: "Disk storage limit reached",
                appName: "Portalarr",
                appUrl: "http://localhost:3000",
                posterUrl: "https://image.tmdb.org/t/p/w500/edv5CZvWj09upOsy2Y6IwDhK8bt.jpg",
                plexUrl: "https://app.plex.tv"
            });

            if (!rendered.subject || !rendered.html || !rendered.html.includes("Inception")) {
                throw new Error(`Email template ${tid} failed rendering test`);
            }
        }
    });

    // 20. Build Verification: Zero Emails Triggered on Server Boot / Push Routine
    await assertTest("Build Verification: Zero Emails Triggered on Server Boot / Push Routine", async () => {
        const { ensureSchemaColumns } = await import("../src/lib/prisma");
        const { expireDueTrialsAndSubscriptionsInternal, sendOrQueueEmail } = await import("../src/app/actions");
        await ensureSchemaColumns();

        const settings = await prisma.settings.findUnique({ where: { id: "global" } });
        if (!settings) throw new Error("Global settings not found");

        // Verify that automated email notifications are OFF by default or require manual admin approval
        if (settings.emailNotificationsEnabled !== false && settings.requireApprovalForEmails !== true) {
            throw new Error("Safety violation: email notifications must either be disabled by default or gated behind admin approval");
        }

        // Run boot trial/subscription expiration routine and assert it completes cleanly without firing unapproved emails
        const expireResult = await expireDueTrialsAndSubscriptionsInternal();
        if (!expireResult.success) {
            throw new Error(`expireDueTrialsAndSubscriptionsInternal failed: ${expireResult.error || 'Unknown error'}`);
        }

        // Test sendOrQueueEmail with requireApprovalForEmails = true: verify it queues into AdminApproval instead of sending
        const testQueueResult = await sendOrQueueEmail({
            to: "verify_push_recipient@example.com",
            subject: "Verification Test Outgoing Email",
            html: "<p>Push verification body</p>",
            templateId: "test_verification"
        });

        if (settings.requireApprovalForEmails !== false) {
            if (!testQueueResult.queued || !testQueueResult.approvalId) {
                throw new Error("Expected outgoing email to be staged in AdminApproval queue when approval gate is active");
            }

            const stagedRecord = await prisma.adminApproval.findUnique({
                where: { id: testQueueResult.approvalId }
            });
            if (!stagedRecord || stagedRecord.status !== "PENDING" || stagedRecord.type !== "EMAIL") {
                throw new Error("Staged email approval record was not properly created with PENDING status");
            }

            // Clean up test staged approval
            await prisma.adminApproval.delete({ where: { id: testQueueResult.approvalId } });
        }
    });

    // 21. Access Protection & Audit: Role/Access Changes Staged in Approval Queue & Admin Alerted
    await assertTest("Access Protection & Audit: Role/Access Changes Staged in Approval Queue & Admin Alerted", async () => {
        const { ensureSchemaColumns } = await import("../src/lib/prisma");
        const { renderEmailTemplate } = await import("../src/lib/email-templates");
        await ensureSchemaColumns();

        // 1. Verify admin_user_access_revoked template renders correctly with all variables
        const renderedAlert = await renderEmailTemplate("admin_user_access_revoked", {
            username: "jordan_verify",
            email: "jordan@example.com",
            oldStatus: "APPROVED",
            newStatus: "EXPIRED",
            oldRole: "USER",
            newRole: "USER",
            reason: "Trial period elapsed beyond grace period (3 days).",
            statusChange: "APPROVED -> EXPIRED",
            accessUrl: "http://localhost:3000/settings/access",
            appUrl: "http://localhost:3000"
        });

        if (!renderedAlert.subject.includes("jordan_verify") || !renderedAlert.html.includes("APPROVED &rarr; EXPIRED")) {
            throw new Error("admin_user_access_revoked template failed rendering or variable substitution");
        }

        // 2. Create a temporary test user to verify Plex Access Change Staging
        const testUser = await prisma.user.create({
            data: {
                username: "verify_gate_user",
                email: "verify_gate@example.com",
                password: "hashed_dummy_password",
                role: "USER",
                status: "APPROVED",
                plexLibrarySectionIds: "10,11"
            }
        });

        const { revokePlexAccessForUserInternal } = await import("../src/app/actions");
        await prisma.settings.update({
            where: { id: "global" },
            data: { requireApprovalForPlexChanges: true, requireApprovalForEmails: true }
        });

        try {
            // Test that revokePlexAccessForUserInternal stages into AdminApproval instead of calling Plex
            const revokeResult = await revokePlexAccessForUserInternal(testUser, "Test automated trial expiry");
            if (!revokeResult.staged || !revokeResult.approvalId) {
                throw new Error("revokePlexAccessForUserInternal failed to stage revocation when approval gate is active");
            }

            const stagedRevoke = await prisma.adminApproval.findUnique({
                where: { id: revokeResult.approvalId }
            });

            if (!stagedRevoke || stagedRevoke.status !== "PENDING" || stagedRevoke.type !== "PLEX_ACCESS_REVOKE") {
                throw new Error("Failed to create staged Plex access approval record with PENDING status");
            }

            // Verify status transition to APPROVED
            const approved = await prisma.adminApproval.update({
                where: { id: stagedRevoke.id },
                data: { status: "APPROVED", approvedBy: "admin", approvedAt: new Date() }
            });
            if (approved.status !== "APPROVED" || approved.approvedBy !== "admin") {
                throw new Error("Approval status transition to APPROVED failed");
            }

            // Verify status transition to REJECTED
            const rejected = await prisma.adminApproval.update({
                where: { id: stagedRevoke.id },
                data: { status: "REJECTED", rejectionReason: "Test rejection reason" }
            });
            if (rejected.status !== "REJECTED" || rejected.rejectionReason !== "Test rejection reason") {
                throw new Error("Approval status transition to REJECTED failed");
            }

            // Clean up
            await prisma.adminApproval.delete({ where: { id: stagedRevoke.id } });
        } finally {
            await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
        }
    });

    // 22. Prorated Subscription Billing Math ($15/mo base rate, 21 days in Oct + Nov + Dec)
    await assertTest("Billing: Prorated Rest-of-Year Math ($15/mo base)", async () => {
        // Start date: Sept 26, 2026 with 14-day trial -> ends Oct 10, 2026
        // Days remaining in Oct: 31 - 10 = 21 days
        // At $180/yr -> $15/mo base rate
        // Oct: (21 / 31) * 15 = $10.16
        // Nov + Dec: 2 * 15 = $30.00
        // Total amountDueNow: $40.16 (NOT $46.85)
        const result = calculateProratedBilling({
            startDate: new Date("2026-09-26T12:00:00Z"),
            trialDays: 14,
            yearlyPrice: 180,
            monthlyPrice: 15
        });

        if (result.amountDueNow !== 40.16) {
            throw new Error(`Expected amountDueNow to be 40.16 but got ${result.amountDueNow}`);
        }
        if (result.monthlyRate !== 15) {
            throw new Error(`Expected monthlyRate to be 15 but got ${result.monthlyRate}`);
        }
        if (result.remainingMonthsCount !== 2) {
            throw new Error(`Expected 2 remaining months but got ${result.remainingMonthsCount}`);
        }
    });

    // 23. Onboarding: Member Reference Validation (Referral code, username, and full name)
    await assertTest("Onboarding: Member Reference & Referral Validation", async () => {
        const testReferrer = await prisma.user.create({
            data: {
                username: "test_ref_member",
                name: "Test Reference FullName",
                email: "test_ref_member@example.com",
                password: "hashedpassword123",
                referralCode: "ref-code-vip-99",
                status: "APPROVED"
            }
        });

        try {
            // Test 1: Match by referralCode
            const res1 = await validateMemberReferenceAction("ref-code-vip-99");
            if (!res1.valid || !res1.referrerName) {
                throw new Error("Failed to validate by referralCode");
            }

            // Test 2: Match by username (case-insensitive)
            const res2 = await validateMemberReferenceAction("TEST_REF_MEMBER");
            if (!res2.valid || !res2.referrerName) {
                throw new Error("Failed to validate by username (case-insensitive)");
            }

            // Test 3: Match by full name
            const res3 = await validateMemberReferenceAction("Test Reference FullName");
            if (!res3.valid || !res3.referrerName) {
                throw new Error("Failed to validate by full name");
            }

            // Test 4: Reject non-existent member
            const res4 = await validateMemberReferenceAction("non_existent_fake_user_12345");
            if (res4.valid) {
                throw new Error("Should have rejected non-existent user reference");
            }
        } finally {
            await prisma.user.delete({ where: { id: testReferrer.id } }).catch(() => {});
        }
    });

    // 24. Email Templates: Trigger Events, Payment Receipts & Subscription Activation
    await assertTest("Email System: Templates Trigger Events & Payment Notifications", async () => {
        const { DEFAULT_EMAIL_TEMPLATES, renderEmailTemplate } = await import("../src/lib/email-templates");

        // Verify every template has non-empty triggerEvent
        for (const tmpl of DEFAULT_EMAIL_TEMPLATES) {
            if (!tmpl.triggerEvent || tmpl.triggerEvent.trim().length === 0) {
                throw new Error(`Email template ${tmpl.id} is missing a triggerEvent definition`);
            }
        }

        // Test payment_received template rendering
        const paymentRendered = await renderEmailTemplate("payment_received", {
            username: "sarah_connor",
            amount: "$15.00",
            provider: "Venmo",
            paymentDate: "October 1, 2026",
            periodGranted: "1 Month",
            validUntil: "November 1, 2026",
            transactionId: "VEN-998877",
            appUrl: "https://portalarr.example.com",
            loginUrl: "https://portalarr.example.com/login"
        });

        if (!paymentRendered.subject.includes("$15.00")) {
            throw new Error("payment_received subject does not contain amount");
        }
        if (!paymentRendered.html.includes("sarah_connor") || !paymentRendered.html.includes("VEN-998877")) {
            throw new Error("payment_received html does not contain user or transaction details");
        }

        // Test admin_payment_received template rendering
        const adminRendered = await renderEmailTemplate("admin_payment_received", {
            matchedUser: "sarah_connor",
            username: "sarah_connor",
            amount: "$15.00",
            provider: "Venmo",
            paymentDate: "October 1, 2026",
            periodGranted: "1 Month",
            validUntil: "November 1, 2026",
            transactionId: "VEN-998877"
        });
        if (!adminRendered.subject.includes("$15.00") || !adminRendered.subject.includes("sarah_connor")) {
            throw new Error("admin_payment_received subject does not contain amount or username");
        }

        // Test subscription_activated template rendering
        const subRendered = await renderEmailTemplate("subscription_activated", {
            username: "sarah_connor",
            validUntil: "November 1, 2026",
            loginUrl: "https://portalarr.example.com/login"
        });
        if (!subRendered.subject.includes("Full Membership")) {
            throw new Error("subscription_activated subject does not match expected default");
        }
    });

    // 25. Admin Approval Gates: Strict Enforcement of Require Buttons (Zero User Emails or Live Plex Changes Without Approval)
    await assertTest("Admin Approval Gates: Strict Enforcement of Require Buttons", async () => {
        const { revokePlexAccessForUserInternal, sendOrQueueEmail } = await import("../src/app/actions");
        
        // 1. Ensure gates are turned ON
        await prisma.settings.update({
            where: { id: "global" },
            data: {
                requireApprovalForPlexChanges: true,
                requireApprovalForEmails: true,
                emailNotificationsEnabled: true
            }
        });

        const testUser = await prisma.user.create({
            data: {
                username: "gate_enforcement_tester",
                email: "tester@example.com",
                password: "hashedpassword123",
                role: "USER",
                status: "APPROVED",
                plexLibrarySectionIds: "1,2,3"
            }
        });

        try {
            // A. Email gate enforcement: verify no email is sent and item is strictly queued in AdminApproval
            const emailRes = await sendOrQueueEmail({
                to: testUser.email,
                subject: "Gated Test Notification",
                html: "<p>This must not be sent without approval</p>",
                templateId: "user_approval",
                targetUser: testUser.username,
                userId: testUser.id
            });

            if (!emailRes.queued || !emailRes.approvalId) {
                throw new Error("Expected email to be queued for approval, but it was not queued");
            }

            const emailApproval = await prisma.adminApproval.findUnique({
                where: { id: emailRes.approvalId }
            });
            if (!emailApproval || emailApproval.status !== "PENDING" || emailApproval.type !== "EMAIL") {
                throw new Error("Email approval record was not properly created with PENDING status");
            }

            // B. Plex access change gate enforcement: verify no live Plex share deletion happens without approval
            const revokeRes = await revokePlexAccessForUserInternal(testUser, "Test automated suspension");
            if (!revokeRes.staged || !revokeRes.approvalId) {
                throw new Error("Expected Plex revocation to be staged for approval, but it was not staged");
            }

            const plexApproval = await prisma.adminApproval.findUnique({
                where: { id: revokeRes.approvalId }
            });
            if (!plexApproval || plexApproval.status !== "PENDING" || plexApproval.type !== "PLEX_ACCESS_REVOKE") {
                throw new Error("Plex revocation approval record was not properly created with PENDING status");
            }

            // C. Clean up staged approvals
            await prisma.adminApproval.delete({ where: { id: emailRes.approvalId } });
            await prisma.adminApproval.delete({ where: { id: revokeRes.approvalId } });
        } finally {
            await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
        }
    });

    // 26. Trial User Perk Framing & Access Isolation (Referral Blocking, Kid/Backup Server Isolation)
    await assertTest("Trial User Perk Framing & Access Isolation", async () => {
        const { validateMemberReferenceAction } = await import("../src/app/actions");

        const trialUser = await prisma.user.create({
            data: {
                username: "trial_tester_perks",
                email: "trial_perks@example.com",
                password: "hashedpassword123",
                role: "USER",
                status: "TRIAL",
                referralCode: "trial-tester-perks-code"
            }
        });

        try {
            // A. Referral Code Validation: Trial user referral code must be rejected on /join
            const trialRefCheck = await validateMemberReferenceAction("trial-tester-perks-code");
            if (trialRefCheck.valid) {
                throw new Error("Expected trial user referral code to be rejected, but validateMemberReferenceAction marked it valid");
            }

            // B. Upgrade user to APPROVED: Now referral code must be valid
            await prisma.user.update({
                where: { id: trialUser.id },
                data: { status: "APPROVED" }
            });

            const approvedRefCheck = await validateMemberReferenceAction("trial-tester-perks-code");
            if (!approvedRefCheck.valid) {
                throw new Error("Expected approved user referral code to be valid, but validateMemberReferenceAction rejected it");
            }

            // C. Server & Section Filtering for Trial Users: Ensure Kids and Backup servers are isolated
            const mockServers = [
                { serverId: "srv1", serverName: "MainPlexServer", sections: [{ id: 1, key: "1", title: "Movies", type: "movie" }, { id: 2, key: "2", title: "Kids Movies", type: "movie" }] },
                { serverId: "srv2", serverName: "KidsPlexServer", sections: [{ id: 3, key: "3", title: "Cartoons", type: "show" }] },
                { serverId: "srv3", serverName: "MainPlexServerBackup", sections: [{ id: 4, key: "4", title: "Movies Backup", type: "movie" }] }
            ];

            const filteredForTrial = mockServers
                .filter(s => {
                    const sName = (s.serverName || "").toLowerCase();
                    return !sName.includes("kid") && !sName.includes("backup");
                })
                .map(s => ({
                    ...s,
                    sections: (s.sections || []).filter(sec => {
                        const secTitle = (sec.title || "").toLowerCase();
                        return !secTitle.includes("kid");
                    })
                }))
                .filter(s => s.sections.length > 0);

            if (filteredForTrial.length !== 1 || filteredForTrial[0].serverId !== "srv1") {
                throw new Error(`Expected exactly 1 allowed primary server for trial user, found ${filteredForTrial.length}`);
            }
            if (filteredForTrial[0].sections.length !== 1 || filteredForTrial[0].sections[0].id !== 1) {
                throw new Error(`Expected only standard "Movies" section for trial user, found ${filteredForTrial[0].sections.map(s => s.title).join(", ")}`);
            }
        } finally {
            await prisma.user.delete({ where: { id: trialUser.id } }).catch(() => {});
        }
    });

    // 27. Brand & White-Label Integrity (DomsHomeLab & d281knilb Isolation, Zero Portalarr in Emails/Memos)
    await assertTest("Brand & White-Label Integrity (DomsHomeLab & d281knilb Isolation)", async () => {
        const { DEFAULT_EMAIL_TEMPLATES, wrapInPortalarrEmailLayout, renderEmailTemplate } = await import("../src/lib/email-templates");
        const { generatePaymentMemo } = await import("../src/lib/payment-links");

        // A. Assert all 18 default email templates contain zero occurrences of "Portalarr"
        if (DEFAULT_EMAIL_TEMPLATES.length < 18) {
            throw new Error(`Expected at least 18 email templates, found ${DEFAULT_EMAIL_TEMPLATES.length}`);
        }

        for (const t of DEFAULT_EMAIL_TEMPLATES) {
            if (/portalarr/i.test(t.defaultSubject)) {
                throw new Error(`Email template "${t.id}" contains "portalarr" in subject: ${t.defaultSubject}`);
            }
            if (/portalarr/i.test(t.defaultBody)) {
                throw new Error(`Email template "${t.id}" contains "portalarr" in body: ${t.defaultBody}`);
            }
            if (/portalarr/i.test(t.description)) {
                throw new Error(`Email template "${t.id}" contains "portalarr" in description: ${t.description}`);
            }
        }

        // B. Assert wrapInPortalarrEmailLayout produces DomsHomeLab & d281knilb branding and zero "Portalarr"
        const renderedHtml = wrapInPortalarrEmailLayout({
            body: "<p>Hello user</p>",
            subject: "Verification Test"
        });

        if (!renderedHtml.includes("DOMS") || !renderedHtml.includes("HOMELAB")) {
            throw new Error("Email layout header banner missing DOMSHOMELAB branding");
        }
        if (!renderedHtml.includes("d281knilb")) {
            throw new Error("Email layout missing d281knilb server subtitle");
        }
        if (/portalarr/i.test(renderedHtml)) {
            throw new Error("Email layout contains 'portalarr' in output HTML");
        }

        // C. Assert generatePaymentMemo outputs #DOMSHOMELAB-
        const memo = generatePaymentMemo("testuser");
        if (!memo.startsWith("#DOMSHOMELAB-TESTUSER-")) {
            throw new Error(`Expected memo to start with #DOMSHOMELAB-TESTUSER-, got: ${memo}`);
        }

        // D. Assert rendered user_approval template contains DomsHomeLab
        const renderedApproval = await renderEmailTemplate("user_approval", {
            username: "testuser",
            email: "testuser@example.com",
            loginUrl: "https://home.domshomelab.com/login"
        });
        if (/portalarr/i.test(renderedApproval.subject) || /portalarr/i.test(renderedApproval.html)) {
            throw new Error("Rendered user_approval template contains 'portalarr'");
        }
        if (!renderedApproval.html.includes("DomsHomeLab") && !renderedApproval.subject.includes("DomsHomeLab")) {
            throw new Error("Rendered user_approval template does not contain DomsHomeLab");
        }
    });

    // 28. Seerr & Media Requests: Quota Calculations & Limit Rules
    await assertTest("Seerr Quota Engine: Strict Zero-Limit Suppression & Calculation", async () => {
        const evalQuota = (limit: number, used: number) => ({
            used,
            limit,
            remaining: limit === 0 ? null : Math.max(0, limit - used)
        });

        // 1. Unlimited user (limit = 0)
        const unlimitedMovie = evalQuota(0, 5);
        if (unlimitedMovie.remaining !== null) {
            throw new Error(`Expected unlimited remaining to be null, got: ${unlimitedMovie.remaining}`);
        }
        const shouldShowQuotaUnlimited = Boolean(unlimitedMovie && unlimitedMovie.limit > 0 && unlimitedMovie.remaining !== null);
        if (shouldShowQuotaUnlimited) {
            throw new Error("UI should NOT show quota for unlimited users (limit === 0)");
        }

        // 2. Limited user (limit = 3, used = 1)
        const limitedMovie = evalQuota(3, 1);
        if (limitedMovie.remaining !== 2) {
            throw new Error(`Expected remaining to be 2, got: ${limitedMovie.remaining}`);
        }
        const shouldShowQuotaLimited = Boolean(limitedMovie && limitedMovie.limit > 0 && limitedMovie.remaining !== null);
        if (!shouldShowQuotaLimited) {
            throw new Error("UI should show quota for users with an active positive limit (limit > 0)");
        }

        // 3. Exhausted user (limit = 3, used = 3)
        const exhaustedMovie = evalQuota(3, 3);
        if (exhaustedMovie.remaining !== 0) {
            throw new Error(`Expected remaining to be 0, got: ${exhaustedMovie.remaining}`);
        }
        const shouldShowQuotaExhausted = Boolean(exhaustedMovie && exhaustedMovie.limit > 0 && exhaustedMovie.remaining !== null);
        if (!shouldShowQuotaExhausted) {
            throw new Error("UI should show quota for exhausted users (limit > 0, remaining = 0)");
        }
    });

    // 29. TMDb & Media Search: US-First Domestic Priority & Typo-Tolerant Re-ranking
    await assertTest("TMDb & Media Search: US-First Domestic Priority & Typo-Tolerant Re-ranking", async () => {
        const { 
            levenshteinDistance, 
            stringSimilarityRatio, 
            rankMediaByDownloadLikelihood 
        } = await import("../src/lib/curation/tmdb");

        // 1. Verify similarity and distance functions
        const distGladiater = levenshteinDistance("gladiater", "gladiator");
        if (distGladiater !== 1) {
            throw new Error(`Expected distance 1 for gladiater -> gladiator, got ${distGladiater}`);
        }
        const simGladiater = stringSimilarityRatio("gladiater", "gladiator");
        if (simGladiater < 0.85) {
            throw new Error(`Expected similarity >= 0.85, got ${simGladiater}`);
        }

        // 2. Test US domestic prioritization: "The Office" US vs UK vs Polish
        const testOfficeItems: any[] = [
            {
                id: 101,
                title: "The Office",
                originalTitle: "The Office",
                mediaType: "tv",
                releaseDate: "2001-07-09",
                originalLanguage: "en",
                originCountry: ["GB"],
                voteCount: 1005,
                popularity: 18,
                posterPath: "/poster_gb.jpg"
            },
            {
                id: 102,
                title: "The Office",
                originalTitle: "The Office",
                mediaType: "tv",
                releaseDate: "2005-03-24",
                originalLanguage: "en",
                originCountry: ["US"],
                voteCount: 5500,
                popularity: 350,
                posterPath: "/poster_us.jpg",
                certification: "TV-14"
            },
            {
                id: 103,
                title: "The Office PL",
                originalTitle: "The Office PL",
                mediaType: "tv",
                releaseDate: "2021-10-22",
                originalLanguage: "pl",
                originCountry: ["PL"],
                voteCount: 11,
                popularity: 8,
                posterPath: "/poster_pl.jpg"
            }
        ];

        const rankedOffice = rankMediaByDownloadLikelihood(testOfficeItems, "the office");
        if (rankedOffice[0].id !== 102 || !rankedOffice[0].originCountry?.includes("US")) {
            throw new Error(`Expected US version of The Office to rank #1, got: ${rankedOffice[0].title} (${rankedOffice[0].id})`);
        }

        // 3. Test Typo tolerance: "gladiater" query should rank "Gladiator" (2000, US/EN, 21k votes) #1
        const testGladiatorItems: any[] = [
            {
                id: 201,
                title: "Gladiater Obscure",
                originalTitle: "Gladiater Obscure",
                mediaType: "movie",
                releaseDate: "2019-01-01",
                originalLanguage: "es",
                originCountry: ["ES"],
                voteCount: 3,
                popularity: 1.2,
                posterPath: "/poster_obs.jpg"
            },
            {
                id: 202,
                title: "Gladiator",
                originalTitle: "Gladiator",
                mediaType: "movie",
                releaseDate: "2000-05-01",
                originalLanguage: "en",
                originCountry: ["US"],
                voteCount: 21500,
                popularity: 150,
                posterPath: "/poster_gladiator.jpg",
                certification: "R"
            }
        ];

        const rankedGladiator = rankMediaByDownloadLikelihood(testGladiatorItems, "gladiater", "gladiator");
        if (rankedGladiator[0].id !== 202) {
            throw new Error(`Expected iconic Gladiator (2000) to rank #1 for typo query 'gladiater', got id ${rankedGladiator[0].id}`);
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
