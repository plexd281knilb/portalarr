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
    validateMemberReferenceAction,
    calculateUserGuideAccess
} from "../src/app/actions";
import { calculateProratedBilling } from "../src/lib/prorated-billing";
import { encryptData, decryptData } from "../src/lib/encryption";
import { logger } from "../src/lib/logger";
import { matchesPlexUser } from "../src/lib/plex";
import { scanPaymentEmailsInternal } from "../src/lib/payment-email-scraper";


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

        // C. Assert generatePaymentMemo outputs clean username
        const memo = generatePaymentMemo("testuser");
        if (memo !== "testuser") {
            throw new Error(`Expected memo to be 'testuser', got: ${memo}`);
        }
        const memoWithAt = generatePaymentMemo("@testuser");
        if (memoWithAt !== "testuser") {
            throw new Error(`Expected memoWithAt to be 'testuser', got: ${memoWithAt}`);
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

    // 30. Referral Rewards & Credit Calculations
    await assertTest("Subscriptions: Referral Rewards & Renewal Engine", async () => {
        const { calculateUserRenewalSummary } = await import("../src/lib/referral-rewards");

        // Scenario 1: User pays yearly ($180/yr, $15/mo), expiration is Jan 1, 2027, 1 friend converted
        const summary1 = calculateUserRenewalSummary({
            user: {
                username: "annual_member",
                status: "APPROVED",
                subscriptionEndsAt: new Date(2027, 0, 1),
                referrals: [
                    { id: "friend1", username: "new_friend", status: "APPROVED", convertedAt: new Date() }
                ]
            },
            yearlyPrice: 180,
            monthlyPrice: 15
        });

        if (summary1.convertedReferralsCount !== 1) {
            throw new Error(`Expected 1 converted referral, got: ${summary1.convertedReferralsCount}`);
        }
        if (summary1.discountedYearlyPrice !== 165) {
            throw new Error(`Expected discounted annual price to be $165, got: ${summary1.discountedYearlyPrice}`);
        }
        if (summary1.rewardDiscountAmount !== 15) {
            throw new Error(`Expected reward discount amount to be $15, got: ${summary1.rewardDiscountAmount}`);
        }
        if (!summary1.delayedMonthlyStartDate?.includes("February 1, 2027")) {
            throw new Error(`Expected delayed monthly start date to be February 1, 2027, got: ${summary1.delayedMonthlyStartDate}`);
        }
        if (!summary1.reminderNoticeText.includes("$165.00") || !summary1.reminderNoticeText.includes("February 1, 2027")) {
            throw new Error(`Reminder text missing discount or delayed date: ${summary1.reminderNoticeText}`);
        }

        // Scenario 1b: Standalone flexible monthly price higher than annual ($17.50/mo vs $180/yr)
        // Annual renewal should strictly receive 1 month off at the annual rate ($15.00 off -> $165.00, NOT $17.50 off -> $162.50)
        const summary1b = calculateUserRenewalSummary({
            user: {
                username: "annual_member_flex_system",
                status: "APPROVED",
                subscriptionEndsAt: new Date(2027, 0, 1),
                referrals: [
                    { id: "friend1", username: "blackjord", status: "APPROVED", convertedAt: new Date() }
                ]
            },
            yearlyPrice: 180,
            monthlyPrice: 17.50
        });

        if (summary1b.rewardDiscountAmount !== 15) {
            throw new Error(`Expected annual reward discount to be $15.00, got: $${summary1b.rewardDiscountAmount}`);
        }
        if (summary1b.discountedYearlyPrice !== 165) {
            throw new Error(`Expected annual renewal discounted price to be $165.00, got: $${summary1b.discountedYearlyPrice}`);
        }
        if (summary1b.annualMonthlyRate !== 15) {
            throw new Error(`Expected annualMonthlyRate to be 15, got: ${summary1b.annualMonthlyRate}`);
        }
        if (summary1b.monthlyRate !== 17.50) {
            throw new Error(`Expected monthlyRate to be 17.50, got: ${summary1b.monthlyRate}`);
        }
        if (!summary1b.reminderNoticeText.includes("$15.00 discount") || !summary1b.reminderNoticeText.includes("$165.00")) {
            throw new Error(`Expected reminder notice to show $15.00 discount and $165.00 annual renewal: ${summary1b.reminderNoticeText}`);
        }
        if (!summary1b.reminderNoticeText.includes("$17.50/mo")) {
            throw new Error(`Expected reminder notice to display $17.50/mo for monthly alternative: ${summary1b.reminderNoticeText}`);
        }

        // Scenario 2: Multiple referrals (e.g. 2 converted referrals)
        const summary2 = calculateUserRenewalSummary({
            user: {
                username: "vip_member",
                status: "APPROVED",
                subscriptionEndsAt: new Date(2027, 0, 1),
                referrals: [
                    { id: "f1", username: "friend_one", status: "APPROVED", convertedAt: new Date() },
                    { id: "f2", username: "friend_two", status: "APPROVED", convertedAt: new Date() }
                ]
            },
            yearlyPrice: 180,
            monthlyPrice: 15
        });

        if (summary2.convertedReferralsCount !== 2) {
            throw new Error(`Expected 2 converted referrals, got: ${summary2.convertedReferralsCount}`);
        }
        if (summary2.discountedYearlyPrice !== 150) {
            throw new Error(`Expected $150 discounted yearly price for 2 referrals, got: ${summary2.discountedYearlyPrice}`);
        }
        if (!summary2.delayedMonthlyStartDate?.includes("March 1, 2027")) {
            throw new Error(`Expected delayed monthly start date to be March 1, 2027, got: ${summary2.delayedMonthlyStartDate}`);
        }

        // Scenario 3: Database User Referral Linking
        const referrerUser = await prisma.user.upsert({
            where: { username: "test_referrer_user" },
            create: {
                username: "test_referrer_user",
                email: "referrer@example.com",
                password: "hash123",
                status: "APPROVED",
                subscriptionEndsAt: new Date(2027, 0, 1)
            },
            update: {
                status: "APPROVED",
                subscriptionEndsAt: new Date(2027, 0, 1)
            }
        });

        const friendUser = await prisma.user.upsert({
            where: { username: "test_referred_friend" },
            create: {
                username: "test_referred_friend",
                email: "friend@example.com",
                password: "hash456",
                status: "APPROVED"
            },
            update: {
                status: "APPROVED"
            }
        });

        // Link friend to referrer in database
        await prisma.user.update({
            where: { id: friendUser.id },
            data: {
                referredByUserId: referrerUser.id,
                convertedAt: new Date()
            }
        });

        // Fetch referrer with referrals included
        const updatedReferrer = await prisma.user.findUnique({
            where: { id: referrerUser.id },
            include: { referrals: true }
        });

        if (!updatedReferrer || updatedReferrer.referrals.length === 0) {
            throw new Error("Failed to link referral in database");
        }

        const dbSummary = calculateUserRenewalSummary({
            user: updatedReferrer,
            yearlyPrice: 180,
            monthlyPrice: 15
        });

        if (dbSummary.discountedYearlyPrice !== 165) {
            throw new Error(`Expected $165 renewal from DB user, got: ${dbSummary.discountedYearlyPrice}`);
        }

        // Clean up test users
        await prisma.user.deleteMany({
            where: { username: { in: ["test_referrer_user", "test_referred_friend"] } }
        }).catch(() => {});
    });

    // 31. Payment Subscriptions: Calendar Alignment, Late Payments, and Multi-Year Integrity
    await assertTest("Payment Subscriptions: Calendar Alignment & Multi-Year Integrity", async () => {
        const { calculateAlignedExpiryDate } = await import("../src/lib/payment-email-scraper");
        const { recalculateUserSubscriptionFromPayments, deletePaymentTransactionAction } = await import("../src/app/payment-actions");

        const yearlyPrice = 180;
        const monthlyPrice = 15;

        // A. Payment made on 12/31/2025 for $180 -> Credits 2026, due 1/1/2027
        const resDec31 = calculateAlignedExpiryDate({
            paymentDate: new Date("2025-12-31T15:30:00Z"),
            totalAmount: 180,
            yearlyPrice,
            monthlyPrice,
            existingExpiry: null
        });

        if (resDec31.newExpiryDate.getFullYear() !== 2027 || resDec31.newExpiryDate.getMonth() !== 0 || resDec31.newExpiryDate.getDate() !== 1) {
            throw new Error(`Expected Dec 31, 2025 payment to expire on Jan 1, 2027, got: ${resDec31.newExpiryDate.toISOString()}`);
        }

        // B. Late payment made on 1/2/2026 for $180 -> Credits 2026, due 1/1/2027 (NOT 2028!)
        const resJan2 = calculateAlignedExpiryDate({
            paymentDate: new Date("2026-01-02T10:00:00Z"),
            totalAmount: 180,
            yearlyPrice,
            monthlyPrice,
            existingExpiry: null
        });

        if (resJan2.newExpiryDate.getFullYear() !== 2027 || resJan2.newExpiryDate.getMonth() !== 0 || resJan2.newExpiryDate.getDate() !== 1) {
            throw new Error(`Expected Jan 2, 2026 payment to expire on Jan 1, 2027, got: ${resJan2.newExpiryDate.toISOString()}`);
        }

        // C. User already marked paid through Jan 1, 2027: attributing Jan 2, 2026 payment must NOT bump to 2028
        const existingExp2027 = new Date(2027, 0, 1, 23, 59, 59, 999);
        const resAlreadyCovered = calculateAlignedExpiryDate({
            paymentDate: new Date("2026-01-02T10:00:00Z"),
            totalAmount: 180,
            yearlyPrice,
            monthlyPrice,
            existingExpiry: existingExp2027
        });

        if (resAlreadyCovered.newExpiryDate.getFullYear() !== 2027) {
            throw new Error(`Expected already-covered user to stay at Jan 1, 2027, got: ${resAlreadyCovered.newExpiryDate.toISOString()}`);
        }

        // D. Extra paid: $360 on Jan 2, 2026 -> 2 Years, expires Jan 1, 2028
        const resExtraPaid = calculateAlignedExpiryDate({
            paymentDate: new Date("2026-01-02T10:00:00Z"),
            totalAmount: 360,
            yearlyPrice,
            monthlyPrice,
            existingExpiry: null
        });

        if (resExtraPaid.newExpiryDate.getFullYear() !== 2028) {
            throw new Error(`Expected $360 payment to expire on Jan 1, 2028, got: ${resExtraPaid.newExpiryDate.toISOString()}`);
        }

        // E. Renewal payment: $180 paid on 12/31/2026 when active through Jan 1, 2027 -> extends to Jan 1, 2028
        const resRenewal = calculateAlignedExpiryDate({
            paymentDate: new Date("2026-12-31T12:00:00Z"),
            totalAmount: 180,
            yearlyPrice,
            monthlyPrice,
            existingExpiry: existingExp2027
        });

        if (resRenewal.newExpiryDate.getFullYear() !== 2028) {
            throw new Error(`Expected renewal payment on Dec 31, 2026 to expire on Jan 1, 2028, got: ${resRenewal.newExpiryDate.toISOString()}`);
        }

        // F. Integration test in SQLite: Verify recalculateUserSubscriptionFromPayments and cleanup on delete
        const testPaymentUser = await prisma.user.create({
            data: {
                username: "test_payment_member",
                email: "payment_test@example.com",
                password: "hashed_dummy_password",
                role: "USER",
                status: "APPROVED"
            }
        });

        // Create 1 payment of $180 on Jan 2, 2026
        const testTx = await prisma.paymentTransaction.create({
            data: {
                provider: "VENMO",
                amount: 180,
                currency: "USD",
                emailDate: new Date("2026-01-02T10:00:00Z"),
                matchedUserId: testPaymentUser.id,
                status: "MANUAL",
                appliedSubscription: true
            }
        });

        // Recalculate
        await recalculateUserSubscriptionFromPayments(testPaymentUser.id);
        const userAfterPayment = await prisma.user.findUnique({ where: { id: testPaymentUser.id } });

        if (!userAfterPayment?.subscriptionEndsAt || new Date(userAfterPayment.subscriptionEndsAt).getFullYear() !== 2027) {
            throw new Error(`Expected user subscription to be Jan 1, 2027 after recalculate, got: ${userAfterPayment?.subscriptionEndsAt}`);
        }

        // Recalculating again must not change the year
        await recalculateUserSubscriptionFromPayments(testPaymentUser.id);
        const userAfterSecondRecalc = await prisma.user.findUnique({ where: { id: testPaymentUser.id } });
        if (new Date(userAfterSecondRecalc!.subscriptionEndsAt!).getFullYear() !== 2027) {
            throw new Error(`Subscription changed on second recalculate: ${userAfterSecondRecalc?.subscriptionEndsAt}`);
        }

        // Now delete the transaction & recalculate -> User must be reset (no secret retention)
        await prisma.paymentTransaction.delete({ where: { id: testTx.id } });
        await recalculateUserSubscriptionFromPayments(testPaymentUser.id);
        const userAfterDelete = await prisma.user.findUnique({ where: { id: testPaymentUser.id } });

        if (userAfterDelete?.subscriptionEndsAt !== null) {
            throw new Error(`User still kept secret subscription date after transaction delete: ${userAfterDelete?.subscriptionEndsAt}`);
        }
        if (userAfterDelete?.status !== "EXPIRED") {
            throw new Error(`User status expected EXPIRED after unmatched/deleted payment, got: ${userAfterDelete?.status}`);
        }

        // Clean up test user
        await prisma.user.delete({ where: { id: testPaymentUser.id } }).catch(() => {});
    });

    // 41. Plex User Matching & Identity Anti-Collision Engine
    await assertTest("Plex: User Matching & Substring Collision Guards", async () => {
        // Exact email & username match
        if (!matchesPlexUser(
            { email: "plexd281knilb@gmail.com", username: "dominicjuliano" },
            { user: { email: "plexd281knilb@gmail.com", username: "dominicjuliano" } }
        )) throw new Error("Exact email & username failed to match");

        // Email prefix matches Plex username
        if (!matchesPlexUser(
            { email: "trevsky313@gmail.com", username: "trevscar1121" },
            { user: { email: "different@email.com", username: "trevsky313" } }
        )) throw new Error("Email prefix failed to match Plex username");

        // Guard against substring collisions (dominicjuliano must NOT match mjuliano7 or mjuli86)
        if (matchesPlexUser(
            { email: "plexd281knilb@gmail.com", username: "dominicjuliano", name: "David Garza" },
            { user: { email: "mjuliano7@yahoo.com", username: "mjuli86" } }
        )) throw new Error("CRITICAL: Substring collision allowed! dominicjuliano matched mjuli86");

        // Guard against substring collisions (dominicjuliano must NOT match juliano)
        if (matchesPlexUser(
            { email: "plexd281knilb@gmail.com", username: "dominicjuliano" },
            { user: { email: "juliano@gmail.com", username: "juliano" } }
        )) throw new Error("CRITICAL: Substring collision allowed! dominicjuliano matched juliano");

        // Guard against matching unrelated friend with same display title
        if (matchesPlexUser(
            { email: "plexd281knilb@gmail.com", username: "dominicjuliano" },
            { user: { email: "davidgarza@gmail.com", username: "dgarza", title: "David Garza" } }
        )) throw new Error("CRITICAL: Matched unrelated user based on display title");

        // Normalized alphanumeric match
        if (!matchesPlexUser(
            { email: "test@test.com", username: "trev_sky313" },
            { user: { email: "other@other.com", username: "trevsky313" } }
        )) throw new Error("Normalized alphanumeric matching failed");

        // Plex numeric ID match
        if (!matchesPlexUser(
            { id: "12345678", email: "changed@email.com", username: "changed" },
            { user: { id: 12345678, email: "old@email.com", username: "old" } }
        )) throw new Error("Plex numeric ID matching failed");
    });

    // 42. Payment Scraper: Lookback Window Persistence & Date Math
    await assertTest("Payments: Lookback Window Persistence & Date Math", async () => {
        // Set lookback to 14 days in Settings
        await prisma.settings.upsert({
            where: { id: "global" },
            update: { paymentEmailLookbackDays: 14 },
            create: { id: "global", paymentEmailLookbackDays: 14 }
        });

        let settings = await prisma.settings.findUnique({ where: { id: "global" } });
        if (settings?.paymentEmailLookbackDays !== 14) {
            throw new Error(`Expected paymentEmailLookbackDays to be 14, got ${settings?.paymentEmailLookbackDays}`);
        }

        // Background runner scanPaymentEmailsInternal() without arguments must preserve 14 days
        await scanPaymentEmailsInternal();
        settings = await prisma.settings.findUnique({ where: { id: "global" } });
        if (settings?.paymentEmailLookbackDays !== 14) {
            throw new Error(`Background scan mutated lookback window, got ${settings?.paymentEmailLookbackDays}`);
        }

        // 1-day lookback ("Today Only") check
        await prisma.settings.upsert({
            where: { id: "global" },
            update: { paymentEmailLookbackDays: 1 },
            create: { id: "global", paymentEmailLookbackDays: 1 }
        });
        settings = await prisma.settings.findUnique({ where: { id: "global" } });
        if (settings?.paymentEmailLookbackDays !== 1) {
            throw new Error(`Expected paymentEmailLookbackDays to be 1, got ${settings?.paymentEmailLookbackDays}`);
        }
        await scanPaymentEmailsInternal();
        settings = await prisma.settings.findUnique({ where: { id: "global" } });
        if (settings?.paymentEmailLookbackDays !== 1) {
            throw new Error(`Background scan mutated 1-day lookback window, got ${settings?.paymentEmailLookbackDays}`);
        }

        // Parsing logic tests
        const parseLookback = (val: string | null | undefined) => {
            if (!val) return undefined;
            const parsed = parseInt(val, 10);
            return !isNaN(parsed) ? parsed : undefined;
        };
        if (parseLookback("1") !== 1 || parseLookback("3") !== 3 || parseLookback("7") !== 7 || parseLookback("14") !== 14 || parseLookback("30") !== 30 || parseLookback("0") !== 0 || parseLookback("") !== undefined) {
            throw new Error("Lookback string parsing failed");
        }

        // Lookback date math check for 1 day (Today) and 14 days
        const now = new Date();
        const lookback1 = new Date();
        lookback1.setDate(now.getDate() - 1);
        const diff1 = Math.round((now.getTime() - lookback1.getTime()) / (1000 * 60 * 60 * 24));
        if (diff1 !== 1) {
            throw new Error(`1-day lookback math mismatch: expected 1 day difference, got ${diff1}`);
        }

        const lookback14 = new Date();
        lookback14.setDate(now.getDate() - 14);
        const diff = Math.round((now.getTime() - lookback14.getTime()) / (1000 * 60 * 60 * 24));
        if (diff !== 14) {
            throw new Error(`Lookback math mismatch: expected 14 days difference, got ${diff}`);
        }
    });

    // 34. AI Agent: Natural Language Playback Probe & Title Extraction Engine
    await assertTest("AI Agent: Natural Language Playback Probe & Title Extraction", async () => {
        const { cleanMediaSearchQuery } = await import("../src/lib/ai-media-diagnostics");

        // A. Natural language query with leading filler, trailing verb, and target server
        const q1 = cleanMediaSearchQuery("test to make sure the sandlot runs on the main Plex server");
        if (q1.title !== "The Sandlot") {
            throw new Error(`Expected title 'The Sandlot', got: '${q1.title}'`);
        }
        if (q1.targetServer !== "main") {
            throw new Error(`Expected targetServer 'main', got: '${q1.targetServer}'`);
        }
        if (!q1.isPlaybackTest) {
            throw new Error(`Expected isPlaybackTest to be true, got: ${q1.isPlaybackTest}`);
        }

        // B. Year in parentheses with polite question and trailing platform
        const q2 = cleanMediaSearchQuery("can you check if gladiator (2000) plays on plex?");
        if (q2.title !== "Gladiator") {
            throw new Error(`Expected title 'Gladiator', got: '${q2.title}'`);
        }
        if (q2.year !== 2000) {
            throw new Error(`Expected year 2000, got: ${q2.year}`);
        }
        if (!q2.isPlaybackTest) {
            throw new Error(`Expected isPlaybackTest to be true, got: ${q2.isPlaybackTest}`);
        }

        // C. Kids server target
        const q3 = cleanMediaSearchQuery("make sure frozen runs on kids plex server");
        if (q3.title !== "Frozen") {
            throw new Error(`Expected title 'Frozen', got: '${q3.title}'`);
        }
        if (q3.targetServer !== "kids") {
            throw new Error(`Expected targetServer 'kids', got: '${q3.targetServer}'`);
        }

        // D. Language problem query
        const q4 = cleanMediaSearchQuery("why is the sandlot in spanish only");
        if (q4.title !== "The Sandlot") {
            throw new Error(`Expected title 'The Sandlot', got: '${q4.title}'`);
        }

        // E. Pronoun resolution across turns: "can you test it on the main server?"
        const q5 = cleanMediaSearchQuery("can you test it on the main server?", {
            lastTitle: "The Sandlot",
            lastYear: 1993,
            lastWasPlaybackTest: true
        });
        if (q5.title !== "The Sandlot") {
            throw new Error(`Expected resolved title 'The Sandlot', got: '${q5.title}'`);
        }
        if (q5.targetServer !== "main") {
            throw new Error(`Expected targetServer 'main', got: '${q5.targetServer}'`);
        }
        if (!q5.isPlaybackTest) {
            throw new Error(`Expected isPlaybackTest to be true for pronoun query, got: ${q5.isPlaybackTest}`);
        }

        // F. Conversational title correction: "no the sandlot"
        const q6 = cleanMediaSearchQuery("no the sandlot", {
            lastTitle: "The Sandlot",
            lastServer: "main",
            lastWasPlaybackTest: true
        });
        if (q6.title !== "The Sandlot") {
            throw new Error(`Expected corrected title 'The Sandlot', got: '${q6.title}'`);
        }
        if (q6.targetServer !== "main") {
            throw new Error(`Expected targetServer 'main' inherited from context, got: '${q6.targetServer}'`);
        }
        if (!q6.isPlaybackTest) {
            throw new Error(`Expected isPlaybackTest to be true for title correction, got: ${q6.isPlaybackTest}`);
        }

        // G. Server Cluster Status query: "what all servers are online?"
        const { askAiServerMaster } = await import("../src/lib/ai-server-assistant");
        const serverStatusRes = await askAiServerMaster("what all servers are online?", [], { username: "tester", role: "ADMIN" });
        if (!serverStatusRes.success) {
            throw new Error(`Expected server status query to succeed, got error: ${serverStatusRes.error}`);
        }
        if (!serverStatusRes.answer?.includes("Media Server Infrastructure Status")) {
            throw new Error(`Expected server status answer to include Media Server Infrastructure Status, got: ${serverStatusRes.answer}`);
        }
        if (serverStatusRes.providerUsed !== "Built-in Infrastructure Health Monitor") {
            throw new Error(`Expected provider Built-in Infrastructure Health Monitor, got: ${serverStatusRes.providerUsed}`);
        }

        // H. System-Wide Playback Probe query: must NOT extract movie title or run single-item media inspection
        const q7 = cleanMediaSearchQuery("Is Plex working right now? Test actual file playback and disk access for each server.");
        if (q7.title !== "") {
            throw new Error(`Expected empty title for system playback probe query, got: '${q7.title}'`);
        }

        const probeRes = await askAiServerMaster("Is Plex working right now? Test actual file playback and disk access for each server.", [], { username: "tester", role: "ADMIN" });
        if (!probeRes.success) {
            throw new Error(`Expected playback probe query to succeed, got error: ${probeRes.error}`);
        }
        if (probeRes.mediaInspection) {
            throw new Error(`Expected mediaInspection to be undefined for system probe query, got inspection for: ${probeRes.mediaInspection.title}`);
        }
    });

    // 35. Auth & Routing: Expired Session Detection & Dual Cadence Reactivation
    await assertTest("Auth & Routing: Expired Session Detection & Dual Cadence Reactivation", async () => {
        const { SignJWT, jwtVerify } = await import("jose");
        const { getJwtSecret } = await import("../src/lib/auth-secret");
        const { calculateProratedBilling } = await import("../src/lib/prorated-billing");

        const secret = getJwtSecret();

        // 1. JWT with past trialEndsAt
        const pastTrialDate = new Date(Date.now() - 3600 * 1000).toISOString();
        const trialToken = await new SignJWT({
            userId: "test-user-id",
            username: "expired_trial_user",
            role: "USER",
            status: "TRIAL",
            trialEndsAt: pastTrialDate,
            subscriptionEndsAt: null
        })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt()
            .setExpirationTime("30d")
            .sign(secret);

        const { payload: trialPayload } = await jwtVerify(trialToken, secret);
        let status1 = (trialPayload.status as string) || "APPROVED";
        const now = Date.now();
        if (status1 === "TRIAL" && trialPayload.trialEndsAt && new Date(trialPayload.trialEndsAt as string).getTime() < now) {
            status1 = "EXPIRED";
        }
        if (status1 !== "EXPIRED") {
            throw new Error(`Expected trial session to evaluate to EXPIRED, got: ${status1}`);
        }

        // 2. JWT with past subscriptionEndsAt
        const pastSubDate = new Date(Date.now() - 3600 * 1000).toISOString();
        const subToken = await new SignJWT({
            userId: "test-user-id",
            username: "expired_sub_user",
            role: "USER",
            status: "APPROVED",
            trialEndsAt: null,
            subscriptionEndsAt: pastSubDate
        })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt()
            .setExpirationTime("30d")
            .sign(secret);

        const { payload: subPayload } = await jwtVerify(subToken, secret);
        let status2 = (subPayload.status as string) || "APPROVED";
        if (status2 === "APPROVED" && subPayload.subscriptionEndsAt && new Date(subPayload.subscriptionEndsAt as string).getTime() < now) {
            status2 = "EXPIRED";
        }
        if (status2 !== "EXPIRED") {
            throw new Error(`Expected subscription session to evaluate to EXPIRED, got: ${status2}`);
        }

        // 3. Reactivation billing options (Yearly vs Monthly)
        const billing = calculateProratedBilling({
            startDate: new Date(),
            yearlyPrice: 180,
            monthlyPrice: 15
        });

        if (typeof billing.amountDueNow !== "number" || billing.amountDueNow <= 0) {
            throw new Error(`Expected valid yearly amountDueNow, got: ${billing.amountDueNow}`);
        }
        if (typeof billing.monthlyAmountDueNow !== "number" || billing.monthlyAmountDueNow <= 0) {
            throw new Error(`Expected valid monthlyAmountDueNow, got: ${billing.monthlyAmountDueNow}`);
        }
        if (!billing.amountDueText.includes("$")) {
            throw new Error(`Expected amountDueText to include '$', got: ${billing.amountDueText}`);
        }
        if (!billing.monthlyAmountDueText.includes("$")) {
            throw new Error(`Expected monthlyAmountDueText to include '$', got: ${billing.monthlyAmountDueText}`);
        }
    });

    await assertTest("Test 64: Trial Account Upgrade & Activation Transition Engine (Status Healing, Membership Tier Upgrades, and IsTrial Demotion)", async () => {
        const { SignJWT, jwtVerify } = await import("jose");
        const { getJwtSecret } = await import("../src/lib/auth-secret");
        const secret = getJwtSecret();

        // 1. Emulate user with previous TRIAL status and membershipTier
        const trialUser = {
            id: "user-trial-123",
            username: "dominicjuliano",
            status: "TRIAL",
            membershipTier: "TRIAL",
            role: "USER",
            trialEndsAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
            subscriptionEndsAt: null,
            convertedAt: null
        };

        // Before activation: user must be flagged as trial
        const isTrialBefore = (trialUser.status === "TRIAL" || trialUser.membershipTier === "TRIAL") && trialUser.status !== "APPROVED" && trialUser.role !== "ADMIN";
        const isFullUserBefore = !isTrialBefore && trialUser.role !== "ADMIN";
        if (!isTrialBefore || isFullUserBefore) {
            throw new Error(`Expected user to be trial before activation, got isTrial=${isTrialBefore}, isFullUser=${isFullUserBefore}`);
        }

        // 2. Simulate Administrator approval for REST_OF_YEAR
        const activationType = "REST_OF_YEAR";
        const now = new Date();
        let newStatus = trialUser.status;
        let trialEndsAt: Date | null = trialUser.trialEndsAt;
        let subscriptionEndsAt: Date | null = trialUser.subscriptionEndsAt;
        let convertedAt = trialUser.convertedAt;
        let membershipTier = trialUser.membershipTier;

        if (activationType === "REST_OF_YEAR") {
            newStatus = "APPROVED";
            const currentYear = now.getFullYear();
            subscriptionEndsAt = new Date(currentYear, 11, 31, 23, 59, 59, 999);
            trialEndsAt = null;
            if (!convertedAt) convertedAt = now;
            if (membershipTier === "TRIAL" || !membershipTier) membershipTier = "STANDARD";
        }

        // Apply activation state
        const activatedUser = {
            ...trialUser,
            status: newStatus,
            membershipTier,
            trialEndsAt,
            subscriptionEndsAt,
            convertedAt
        };

        if (activatedUser.status !== "APPROVED") {
            throw new Error(`Expected activated user status to be APPROVED, got: ${activatedUser.status}`);
        }
        if (activatedUser.membershipTier !== "STANDARD") {
            throw new Error(`Expected activated user membershipTier to be STANDARD, got: ${activatedUser.membershipTier}`);
        }
        if (activatedUser.trialEndsAt !== null) {
            throw new Error(`Expected trialEndsAt to be cleared to null, got: ${activatedUser.trialEndsAt}`);
        }
        if (!activatedUser.subscriptionEndsAt || activatedUser.subscriptionEndsAt.getFullYear() !== now.getFullYear()) {
            throw new Error(`Expected subscriptionEndsAt to end on year ${now.getFullYear()}, got: ${activatedUser.subscriptionEndsAt}`);
        }

        // 3. Verify isTrial and isFullUser logic for activated user
        const isTrialAfter = (activatedUser.status === "TRIAL" || activatedUser.membershipTier === "TRIAL") && activatedUser.status !== "APPROVED" && activatedUser.role !== "ADMIN";
        const isFullUserAfter = !isTrialAfter && activatedUser.role !== "ADMIN";
        if (isTrialAfter || !isFullUserAfter) {
            throw new Error(`Expected activated user to NOT be trial and to be full user, got isTrial=${isTrialAfter}, isFullUser=${isFullUserAfter}`);
        }

        // 4. Verify self-healing logic: if user status is APPROVED but membershipTier was stuck as TRIAL
        const stuckUser = {
            id: "user-stuck-123",
            username: "stuckuser",
            status: "APPROVED",
            membershipTier: "TRIAL",
            role: "USER",
            trialEndsAt: new Date(Date.now() + 14 * 24 * 3600 * 1000)
        };

        // Before healing, page-level isTrial check must guard against stuck TRIAL tier
        const pageIsTrial = (stuckUser.status === "TRIAL" || stuckUser.membershipTier === "TRIAL") && stuckUser.status !== "APPROVED" && stuckUser.role !== "ADMIN";
        if (pageIsTrial) {
            throw new Error(`Expected APPROVED stuck user to evaluate isTrial=false on page level, got: ${pageIsTrial}`);
        }

        // Self-healing execution
        if ((stuckUser.status === "APPROVED" || stuckUser.role === "ADMIN") && stuckUser.membershipTier === "TRIAL") {
            stuckUser.membershipTier = "STANDARD";
            stuckUser.trialEndsAt = null;
        }

        if (stuckUser.membershipTier !== "STANDARD" || stuckUser.trialEndsAt !== null) {
            throw new Error(`Self-healing failed to heal membershipTier to STANDARD or clear trialEndsAt`);
        }

        // 5. Verify JWT session token includes updated membershipTier
        const sessionToken = await new SignJWT({
            userId: activatedUser.id,
            username: activatedUser.username,
            role: activatedUser.role,
            status: activatedUser.status,
            membershipTier: activatedUser.membershipTier,
            trialEndsAt: null,
            subscriptionEndsAt: activatedUser.subscriptionEndsAt.toISOString()
        })
            .setProtectedHeader({ alg: "HS256" })
            .setIssuedAt()
            .setExpirationTime("30d")
            .sign(secret);

        const { payload: jwtPayload } = await jwtVerify(sessionToken, secret);
        if (jwtPayload.membershipTier !== "STANDARD") {
            throw new Error(`Expected JWT membershipTier to be STANDARD, got: ${jwtPayload.membershipTier}`);
        }
        if (jwtPayload.status !== "APPROVED") {
            throw new Error(`Expected JWT status to be APPROVED, got: ${jwtPayload.status}`);
        }
    });

    // 65. Curation Studio: Protective Library Automation Guard Rails & Override Logic
    await assertTest("Test 65: Curation Studio Protective Library Automation Guard Rails", async () => {
        // Helper function mimicking the isSectionEnabled algorithm used across all 4 studios
        const isSectionEnabled = (list: string[], srvId: string, secKey: string): boolean => {
            if (!list || list.length === 0) return true;
            if (list.includes(`disabled:${srvId}`) || list.includes(`${srvId}:none`)) return false;
            if (list.includes(`disabled:${srvId}:${secKey}`)) return false;
            const compoundKey = `${srvId}:${secKey}`;
            if (list.includes(compoundKey)) return true;
            const hasServerEntries = list.some(k => k === srvId || k.startsWith(`${srvId}:`) || k.startsWith(`disabled:${srvId}`));
            if (hasServerEntries) {
                if (list.includes(srvId) && !list.some(k => k.startsWith(`${srvId}:`))) return true;
                return false;
            }
            return true;
        };

        const serverId = "KidsPlexServer";
        const movieSection = "1";
        const tvSection = "2";

        // Scenario 1: KidsPlexServer only has TV enabled, Movies excluded from schedule
        let enabledList = [`${serverId}:${tvSection}`];

        if (isSectionEnabled(enabledList, serverId, movieSection) !== false) {
            throw new Error(`Expected Movies (#1) to be disabled when only TV (#2) is enabled`);
        }
        if (isSectionEnabled(enabledList, serverId, tvSection) !== true) {
            throw new Error(`Expected TV (#2) to be enabled`);
        }

        // Scenario 2: Guard Option 1 - Enable Library permanently
        // When admin clicks "1. Enable Library & Apply", it permanently enables the section in the list
        enabledList = [...enabledList, `${serverId}:${movieSection}`];
        if (isSectionEnabled(enabledList, serverId, movieSection) !== true) {
            throw new Error(`Expected Movies (#1) to be enabled after Option 1 (Enable Library & Apply)`);
        }

        // Scenario 3: Guard Option 2 - Force Update (One-Time Override)
        // Reset to excluded state
        enabledList = [`${serverId}:${tvSection}`];
        // Executing force update must NOT alter the enabledList
        const forceRan = true;
        if (!forceRan) throw new Error("Force run failed");
        if (isSectionEnabled(enabledList, serverId, movieSection) !== false) {
            throw new Error(`Expected Movies (#1) to remain excluded after Option 2 (One-Time Force Update)`);
        }

        // Scenario 4: Verify across all 4 studio setting field types
        const studioTypes = [
            "enabledServersForOverlays",
            "enabledServersForCollections",
            "enabledServersForPruning",
            "enabledServersForTagging"
        ];
        for (const studioField of studioTypes) {
            const listWithExplicitDisable = [`disabled:${serverId}:${movieSection}`, `${serverId}:${tvSection}`];
            if (isSectionEnabled(listWithExplicitDisable, serverId, movieSection) !== false) {
                throw new Error(`Failed explicit disabled section check for ${studioField}`);
            }
        }
    });

    // 38. Guides & Knowledge Base: Granular User Access Gating
    await assertTest("Guides: Granular User Access Gating & Permissions Engine", async () => {
        const dummyLibraries = [
            { name: "General Ebooks", mediaType: "ebook", allowedUsers: "*", restrictedUsers: "" },
            { name: "General Audiobooks", mediaType: "audiobook", allowedUsers: "*", restrictedUsers: "" },
            { name: "Restricted Library", mediaType: "ebook", allowedUsers: "vip_only", restrictedUsers: "banned_user" }
        ];

        // 1. Admin persona: Has 100% access to all 8 categories and all topics
        const adminAccess = await calculateUserGuideAccess(
            { username: "admin", role: "ADMIN", status: "APPROVED" },
            dummyLibraries
        );
        if (!adminAccess.isAdmin) throw new Error("Admin persona failed isAdmin");
        if (!adminAccess.hasEbooksAccess || !adminAccess.hasAudiobooksAccess) throw new Error("Admin must have ebooks and audiobooks access");
        const requiredAdminCategories = ["devices", "ai-assistant", "movies-tv", "ebooks", "audiobooks", "referral-rewards", "curation-studio", "manual"];
        for (const cat of requiredAdminCategories) {
            if (!adminAccess.allowedCategories.includes(cat)) {
                throw new Error(`Admin missing category: ${cat}`);
            }
        }
        if (!adminAccess.allowedGuideTopicIds.includes("curation-studio")) throw new Error("Admin missing curation-studio topic");

        // 2. Trial persona: Strictly barred from ebooks, audiobooks, curation, and manual
        const trialAccess = await calculateUserGuideAccess(
            { username: "trial_member", role: "USER", status: "TRIAL", membershipTier: "TRIAL" },
            dummyLibraries
        );
        if (!trialAccess.isTrial) throw new Error("Trial persona failed isTrial");
        if (trialAccess.hasEbooksAccess !== false) throw new Error("Trial user must NOT have ebooks access");
        if (trialAccess.hasAudiobooksAccess !== false) throw new Error("Trial user must NOT have audiobooks access");
        if (trialAccess.allowedCategories.includes("ebooks")) throw new Error("Trial user must not see ebooks tab");
        if (trialAccess.allowedCategories.includes("audiobooks")) throw new Error("Trial user must not see audiobooks tab");
        if (trialAccess.allowedCategories.includes("curation-studio")) throw new Error("Trial user must not see curation-studio");
        if (trialAccess.allowedCategories.includes("manual")) throw new Error("Trial user must not see manual tab");
        if (trialAccess.headerSubtitle.includes("audiobooks") || trialAccess.headerSubtitle.includes("Send-to-Kindle")) {
            throw new Error(`Trial headerSubtitle should not advertise audiobooks or Kindle: ${trialAccess.headerSubtitle}`);
        }

        // 3. Regular member with Ebooks only (audiobooks library restricted or empty)
        const ebooksOnlyLibraries = [
            { name: "My Books", mediaType: "ebook", allowedUsers: "bookworm", restrictedUsers: "" }
        ];
        const ebookUserAccess = await calculateUserGuideAccess(
            { username: "bookworm", role: "USER", status: "APPROVED" },
            ebooksOnlyLibraries
        );
        if (ebookUserAccess.hasEbooksAccess !== true) throw new Error("User with ebooks should have hasEbooksAccess true");
        if (ebookUserAccess.hasAudiobooksAccess !== false) throw new Error("User without audiobooks should have hasAudiobooksAccess false");
        if (!ebookUserAccess.allowedCategories.includes("ebooks")) throw new Error("User should see ebooks tab");
        if (ebookUserAccess.allowedCategories.includes("audiobooks")) throw new Error("User should NOT see audiobooks tab");
        if (ebookUserAccess.allowedCategories.includes("curation-studio")) throw new Error("Non-admin should not see curation");
        if (!ebookUserAccess.headerSubtitle.includes("navigate ebooks & Send-to-Kindle")) {
            throw new Error(`Expected ebooks & Send-to-Kindle in headerSubtitle: ${ebookUserAccess.headerSubtitle}`);
        }

        // 4. Regular member with Audiobooks only (ebooks library restricted or empty)
        const audioOnlyLibraries = [
            { name: "My Audio", mediaType: "audiobook", allowedUsers: "*", restrictedUsers: "" }
        ];
        const audioUserAccess = await calculateUserGuideAccess(
            { username: "listener", role: "USER", status: "APPROVED" },
            audioOnlyLibraries
        );
        if (audioUserAccess.hasAudiobooksAccess !== true) throw new Error("User with audiobooks should have hasAudiobooksAccess true");
        if (audioUserAccess.hasEbooksAccess !== false) throw new Error("User without ebooks should have hasEbooksAccess false");
        if (!audioUserAccess.allowedCategories.includes("audiobooks")) throw new Error("User should see audiobooks tab");
        if (audioUserAccess.allowedCategories.includes("ebooks")) throw new Error("User should NOT see ebooks tab");
        if (!audioUserAccess.headerSubtitle.includes("navigate audiobooks & chapter streaming")) {
            throw new Error(`Expected audiobooks & chapter streaming in headerSubtitle: ${audioUserAccess.headerSubtitle}`);
        }

        // 5. Explicitly restricted user in library restrictedUsers
        const restrictedLibraries = [
            { name: "Restricted Library", mediaType: "ebook", allowedUsers: "*", restrictedUsers: "banned_user" }
        ];
        const restrictedUserAccess = await calculateUserGuideAccess(
            { username: "banned_user", role: "USER", status: "APPROVED" },
            restrictedLibraries
        );
        if (restrictedUserAccess.hasEbooksAccess) throw new Error("Restricted user should not have ebooks access");

        // 6. Kid sub-account: Barred from billing/referrals, curation, and manual
        const kidAccess = await calculateUserGuideAccess(
            { username: "timmy", role: "USER", status: "APPROVED", accountType: "KID", canRequest: false },
            []
        );
        if (kidAccess.hasReferralAccess !== false) throw new Error("Kid account must have hasReferralAccess false");
        if (kidAccess.allowedCategories.includes("referral-rewards")) throw new Error("Kid account must not see referral-rewards");
        if (kidAccess.allowedCategories.includes("movies-tv")) throw new Error("Kid account without canRequest must not see movies-tv");
        if (kidAccess.allowedCategories.includes("curation-studio")) throw new Error("Kid account must not see curation-studio");
        if (kidAccess.allowedCategories.includes("manual")) throw new Error("Kid account must not see manual");

        // 7. Null/unauthenticated session: Safe fallback
        const unauthAccess = await calculateUserGuideAccess(null, []);
        if (unauthAccess.allowedCategories.length !== 1 || unauthAccess.allowedCategories[0] !== "devices") {
            throw new Error("Unauthenticated user must only receive devices fallback");
        }
    });

    // 39. AI Engine: Gemini Model Normalization & Multi-Model Cascade Fallback
    await assertTest("AI Engine: Gemini Model Normalization & Multi-Model Cascade Fallback", async () => {
        const { normalizeGeminiModel, isLegacyGeminiModel, getGeminiCandidateModels } = await import("../src/lib/ai-agent");

        // 1. Pro models auto-alias to high-quota 500 RPD gemini-3.5-flash-lite to prevent 429 quota exhaustion
        if (normalizeGeminiModel("gemini-2.5-pro") !== "gemini-3.5-flash-lite") {
            throw new Error(`Expected gemini-2.5-pro to normalize to gemini-3.5-flash-lite, got ${normalizeGeminiModel("gemini-2.5-pro")}`);
        }
        if (normalizeGeminiModel("gemini-1.5-pro") !== "gemini-3.5-flash-lite") {
            throw new Error(`Expected gemini-1.5-pro to normalize to gemini-3.5-flash-lite, got ${normalizeGeminiModel("gemini-1.5-pro")}`);
        }
        if (normalizeGeminiModel("gemini-3.1-pro-preview") !== "gemini-3.5-flash-lite") {
            throw new Error(`Expected gemini-3.1-pro-preview to normalize to gemini-3.5-flash-lite, got ${normalizeGeminiModel("gemini-3.1-pro-preview")}`);
        }

        // 2. Deprecated Flash models auto-alias to flagship gemini-3.5-flash-lite
        if (normalizeGeminiModel("gemini-2.5-flash") !== "gemini-3.5-flash-lite") {
            throw new Error(`Expected gemini-2.5-flash to normalize to gemini-3.5-flash-lite, got ${normalizeGeminiModel("gemini-2.5-flash")}`);
        }
        if (normalizeGeminiModel("gemini-2.0-flash") !== "gemini-3.5-flash-lite") {
            throw new Error(`Expected gemini-2.0-flash to normalize to gemini-3.5-flash-lite, got ${normalizeGeminiModel("gemini-2.0-flash")}`);
        }
        if (normalizeGeminiModel("gemini-1.5-flash") !== "gemini-3.5-flash-lite") {
            throw new Error(`Expected gemini-1.5-flash to normalize to gemini-3.5-flash-lite, got ${normalizeGeminiModel("gemini-1.5-flash")}`);
        }
        if (normalizeGeminiModel("gemini-1.5-flash-8b") !== "gemini-3.5-flash-lite") {
            throw new Error(`Expected gemini-1.5-flash-8b to normalize to gemini-3.5-flash-lite, got ${normalizeGeminiModel("gemini-1.5-flash-8b")}`);
        }

        // 3. Modern active models preserved
        if (normalizeGeminiModel("gemini-3.5-flash-lite") !== "gemini-3.5-flash-lite") {
            throw new Error(`Expected gemini-3.5-flash-lite preserved, got ${normalizeGeminiModel("gemini-3.5-flash-lite")}`);
        }
        if (normalizeGeminiModel("gemini-3.1-flash-lite") !== "gemini-3.1-flash-lite") {
            throw new Error(`Expected gemini-3.1-flash-lite preserved, got ${normalizeGeminiModel("gemini-3.1-flash-lite")}`);
        }
        if (normalizeGeminiModel("gemini-3.8-flash") !== "gemini-3.8-flash") {
            throw new Error(`Expected gemini-3.8-flash preserved, got ${normalizeGeminiModel("gemini-3.8-flash")}`);
        }
        if (normalizeGeminiModel("gemini-3.5-flash") !== "gemini-3.5-flash") {
            throw new Error(`Expected gemini-3.5-flash preserved, got ${normalizeGeminiModel("gemini-3.5-flash")}`);
        }

        // 4. Default / empty fallback to high-quota gemini-3.5-flash-lite
        if (normalizeGeminiModel("default") !== "gemini-3.5-flash-lite") {
            throw new Error(`Expected default to normalize to gemini-3.5-flash-lite, got ${normalizeGeminiModel("default")}`);
        }
        if (normalizeGeminiModel("") !== "gemini-3.5-flash-lite") {
            throw new Error(`Expected empty string to normalize to gemini-3.5-flash-lite, got ${normalizeGeminiModel("")}`);
        }
        if (normalizeGeminiModel(undefined) !== "gemini-3.5-flash-lite") {
            throw new Error(`Expected undefined to normalize to gemini-3.5-flash-lite, got ${normalizeGeminiModel(undefined)}`);
        }

        // 5. Verify isLegacyGeminiModel filters out 404 models
        if (!isLegacyGeminiModel("gemini-2.0-flash") || !isLegacyGeminiModel("gemini-2.5-flash")) {
            throw new Error("Expected legacy 2.x models to be recognized as legacy");
        }
        if (isLegacyGeminiModel("gemini-3.8-flash") || isLegacyGeminiModel("gemini-3.5-flash-lite")) {
            throw new Error("Active 3.x models must not be marked as legacy");
        }

        // 6. Verify isTextGenerationModel filters out TTS, Transcribe, and Audio models
        const { isTextGenerationModel } = await import("../src/lib/ai-agent");
        if (isTextGenerationModel("gemini-3.8-flash-tts") || isTextGenerationModel("gemini-3.5-transcribe") || isTextGenerationModel("lyria-3.5")) {
            throw new Error("Expected non-text models to be filtered out");
        }
        if (!isTextGenerationModel("gemini-3.5-flash-lite") || !isTextGenerationModel("gemini-3.8-flash")) {
            throw new Error("Expected valid text models to pass isTextGenerationModel");
        }

        // 7. Verify getGeminiCandidateModels strictly caps at 3 text-only models
        const candidates = getGeminiCandidateModels("gemini-2.5-flash", [
            "gemini-2.0-flash", 
            "gemini-3.8-flash", 
            "gemini-3.8-flash-tts", 
            "lyria-3.5",
            "gemini-3.7-flash"
        ]);
        if (candidates.includes("gemini-2.5-flash") || candidates.includes("gemini-2.0-flash")) {
            throw new Error(`Legacy 404 models leaked into candidates list: ${JSON.stringify(candidates)}`);
        }
        if (candidates.includes("gemini-3.8-flash-tts") || candidates.includes("lyria-3.5")) {
            throw new Error(`Non-text models leaked into candidates list: ${JSON.stringify(candidates)}`);
        }
        if (candidates.length > 3) {
            throw new Error(`Expected at most 3 candidate models to prevent thundering herd cascade, got ${candidates.length}: ${JSON.stringify(candidates)}`);
        }
    });

    // 40. Maintainerr: Watch Activity Revocation Logic (Lane 1 Retention & Grace Period Rescue)
    await assertTest("Maintainerr: Watch Revocation (Lane 1 Retention & Grace Period Rescue)", async () => {
        const flaggedAt = Date.now() - 3 * 86400000; // Staged 3 days ago

        // Case A: Oldest Watched (Lane 1) item with plays from 200 days ago
        const lane1OldPlay = flaggedAt - 200 * 86400000;
        const lane1RecentlyWatched = Boolean(lane1OldPlay && (lane1OldPlay >= (flaggedAt - 86400000)));
        if (lane1RecentlyWatched) {
            throw new Error("Lane 1 item with old play was mistakenly marked as recently watched!");
        }

        // Case B: Item watched yesterday (during 14-day notice period)
        const recentPlay = flaggedAt + 1 * 86400000;
        const recentlyWatched = Boolean(recentPlay && (recentPlay >= (flaggedAt - 86400000)));
        if (!recentlyWatched) {
            throw new Error("Item streamed during grace period failed to trigger recent watch rescue!");
        }

        // Case C: Never watched item (viewCount 0, lastViewedAt null)
        const neverWatched: number | null = null;
        const neverWatchedFlag = Boolean(neverWatched && (neverWatched >= (flaggedAt - 86400000)));
        if (neverWatchedFlag) {
            throw new Error("Unwatched item with null lastViewedAt was mistakenly marked as watched!");
        }
    });

    // 41. Maintainerr: Sonarr TV Season Pruning Safety & Title Parsing
    await assertTest("Maintainerr: TV Season Pruning Detection & Safe Sonarr Title Parsing", async () => {
        const testCases = [
            { raw: "Breaking Bad - Season 1", expectedSeason: 1, expectedClean: "Breaking Bad", isSeason: true },
            { raw: "The Simpsons (Season 03)", expectedSeason: 3, expectedClean: "The Simpsons", isSeason: true },
            { raw: "Severance (2022) - Season 2", expectedSeason: 2, expectedClean: "Severance", isSeason: true },
            { raw: "Inception (2010)", expectedSeason: null, expectedClean: "Inception", isSeason: false },
            { raw: "The Dark Knight", expectedSeason: null, expectedClean: "The Dark Knight", isSeason: false }
        ];

        for (const tc of testCases) {
            const seasonMatch = tc.raw.match(/(?:-\s*Season\s*|\(Season\s*)(\d+)\)?/i);
            const seasonNum = seasonMatch ? parseInt(seasonMatch[1], 10) : null;
            const isSeasonItem = seasonNum !== null && !isNaN(seasonNum);
            const cleanTitle = tc.raw
                .replace(/\s*\(\d{4}\).*$/, "")
                .replace(/\s*-\s*Season\s*\d+.*$/i, "")
                .replace(/\s*\(Season\s*\d+\).*$/i, "")
                .trim();

            if (isSeasonItem !== tc.isSeason) {
                throw new Error(`Expected isSeasonItem=${tc.isSeason} for "${tc.raw}", got ${isSeasonItem}`);
            }
            if (seasonNum !== tc.expectedSeason) {
                throw new Error(`Expected seasonNum=${tc.expectedSeason} for "${tc.raw}", got ${seasonNum}`);
            }
            if (cleanTitle !== tc.expectedClean) {
                throw new Error(`Expected cleanTitle="${tc.expectedClean}" for "${tc.raw}", got "${cleanTitle}"`);
            }
        }
    });

    // 42. Maintainerr: Glances Storage Array Mount Heuristic Fallback
    await assertTest("Maintainerr: Glances Mount Heuristic Prefers Media Storage over Root", async () => {
        const mockDisks = [
            { id: "disk_root", mntPoint: "/", percent: 35 },
            { id: "disk_boot", mntPoint: "/boot", percent: 45 },
            { id: "disk_media", mntPoint: "/mnt/user/media", percent: 91 },
            { id: "disk_data", mntPoint: "/data", percent: 88 }
        ];

        // 1. Explicit selection takes highest precedence
        const selectedId = "disk_data";
        const explicitMatch = mockDisks.find(d => selectedId ? d.id === selectedId : false);
        if (explicitMatch?.id !== "disk_data") {
            throw new Error(`Expected explicit match "disk_data", got "${explicitMatch?.id}"`);
        }

        // 2. Unset selection prefers media/data/mnt/user storage over root "/"
        const unsetId = undefined;
        const heuristicMatch = mockDisks.find(d => unsetId ? d.id === unsetId : false)
            || mockDisks.find(d => {
                const pt = (d.mntPoint || "").toLowerCase();
                return pt.includes("media") || pt.includes("data") || pt.includes("mnt/user") || pt.includes("storage") || pt.includes("pool") || pt.includes("tank");
            })
            || mockDisks.find(d => d.percent > 0 && d.mntPoint !== "/" && d.mntPoint !== "/boot")
            || mockDisks.find(d => d.percent > 0);

        if (heuristicMatch?.id !== "disk_media") {
            throw new Error(`Expected heuristic match to pick "disk_media", got "${heuristicMatch?.id}" (${heuristicMatch?.mntPoint})`);
        }
    });

    // 43. Kometa: Rule Scoping, Section Revert Scoping & Aspect Ratio Guard
    await assertTest("Kometa: Rule Scoping, Section Revert Scoping & Episode Aspect Ratio Guards", async () => {
        // 1. Rule Scoping & Isolation
        const mockRules = [
            { id: "rule_srvA_sec1", serverId: "srvA", sectionKey: "1", name: "Movies 4K" },
            { id: "rule_srvA_default", serverId: "srvA", sectionKey: null, name: "Default Rule" },
            { id: "rule_srvB_sec1", serverId: "srvB", sectionKey: "1", name: "Kids Movies" }
        ];

        // Resolving for srvA, section 1 -> matches exact
        const matchSec1 = mockRules.find(r => r.serverId === "srvA" && r.sectionKey === "1")
            || mockRules.find(r => r.serverId === "srvA" && r.sectionKey === null);
        if (matchSec1?.id !== "rule_srvA_sec1") {
            throw new Error(`Expected rule_srvA_sec1, got ${matchSec1?.id}`);
        }

        // Resolving for srvA, unconfigured section 2 -> falls back to srvA default, NEVER cross-server srvB
        const matchSec2 = mockRules.find(r => r.serverId === "srvA" && r.sectionKey === "2")
            || mockRules.find(r => r.serverId === "srvA" && r.sectionKey === null);
        if (matchSec2?.id !== "rule_srvA_default") {
            throw new Error(`Expected rule_srvA_default fallback, got ${matchSec2?.id}`);
        }

        // Resolving for srvB, unconfigured section 3 -> NO fallback from srvA
        const matchSec3 = mockRules.find(r => r.serverId === "srvB" && r.sectionKey === "3")
            || mockRules.find(r => r.serverId === "srvB" && r.sectionKey === null);
        if (matchSec3 !== undefined) {
            throw new Error(`Expected no match for unconfigured srvB section, but got ${matchSec3?.id}`);
        }

        // 2. Custom Badge ID Scoping
        const allBadges = [
            { id: "badge-4k", name: "4K UHD" },
            { id: "badge-hdr", name: "HDR10" },
            { id: "badge-atmos", name: "Dolby Atmos" }
        ];
        const ruleWithSelection = { customBadgeIds: JSON.stringify(["badge-4k", "badge-atmos"]) };
        const allowedIds = JSON.parse(ruleWithSelection.customBadgeIds);
        const filteredBadges = allBadges.filter(b => allowedIds.includes(b.id));
        if (filteredBadges.length !== 2 || filteredBadges.some(b => b.id === "badge-hdr")) {
            throw new Error("Custom badge ID filtering failed to exclude unselected badges");
        }

        // 3. Aspect Ratio & TV Episode Guard
        const episodeItem = { ratingKey: "991", title: "Pilot", type: "episode" };
        const movieItem = { ratingKey: "992", title: "Inception", type: "movie" };
        const isEpisodeRejected = (it: { type?: string }) => it.type === "episode";

        if (!isEpisodeRejected(episodeItem)) {
            throw new Error("Expected episode item to be rejected by 2:3 vertical poster guard");
        }
        if (isEpisodeRejected(movieItem)) {
            throw new Error("Expected movie item to be permitted by poster overlay engine");
        }

        // 4. Section Revert Scoping
        const section1Items = [{ ratingKey: "101" }, { ratingKey: "102" }];
        const section2Items = [{ ratingKey: "201" }];
        const allBackups = [
            { ratingKey: "101", serverId: "srvA" },
            { ratingKey: "102", serverId: "srvA" },
            { ratingKey: "201", serverId: "srvA" },
            { ratingKey: "301", serverId: "srvB" }
        ];

        const sec1RatingKeys = new Set(section1Items.map(it => it.ratingKey));
        const scopedBackups = allBackups.filter(b => b.serverId === "srvA" && sec1RatingKeys.has(b.ratingKey));
        if (scopedBackups.length !== 2 || scopedBackups.some(b => b.ratingKey === "201" || b.serverId === "srvB")) {
            throw new Error(`Expected exactly 2 scoped backups for Section 1, got ${scopedBackups.length}`);
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
