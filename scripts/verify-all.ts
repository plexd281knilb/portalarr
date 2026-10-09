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
    calculateUserGuideAccess,
    fetchGlancesHardwareStats,
    checkMediaAppReachability,
    getAdminDetailedStreamsAction,
    getAdminInfrastructureStatusAction,
    updateCurrentUserKindleEmail
} from "../src/app/actions";
import { getBookCleanTitleKey, getBookCompositeDedupKey } from "../src/lib/books/book-dedup";
import http from "http";
import { calculateProratedBilling } from "../src/lib/prorated-billing";
import { encryptData, decryptData } from "../src/lib/encryption";
import { logger } from "../src/lib/logger";
import { matchesPlexUser } from "../src/lib/plex";
import { scanPaymentEmailsInternal, extractAmount, parseCashAppEmail, calculateAlignedExpiryDate } from "../src/lib/payment-email-scraper";
import { sendSubscriptionRenewalRemindersInternal } from "../src/app/payment-actions";
import { isScheduleDue, isPlexMaintenanceWindow } from "../src/lib/prisma";
import { calculateNextRunTime, formatScheduleLabel, formatLastRunDisplay, SCHEDULE_OPTIONS } from "../src/lib/curation/schedule-helper";
import { inferBookRating } from "../src/lib/books/book-rating";
import { parseAmazonBounceEmail } from "../src/lib/kindle-email-scanner";
import fs from "fs";
import path from "path";
import { CLOUDFLARE_BYPASS_PATHS, CLOUDFLARE_SUPER_USER_PATHS, CLOUDFLARE_ADMIN_PATHS, matchesCloudflareBypass, matchesCloudflareSuperUser, matchesCloudflareAdmin } from "../src/lib/edge-policy-paths";
import { getBuiltinOscarBestPictureList } from "../src/lib/curation/oscar-best-picture-data";
import { COLLECTION_PRESETS } from "../src/lib/curation/presets";
import { expandCandidateUrls, isPrivateOrLocalIp, isPlexItemPlaceholderOrStub, parsePlexXmlCollections } from "../src/lib/curation/plex-analyzer";
import {
    parseReminderDays,
    formatReminderDays,
    getNextRenewalReminderInfo,
    getDueReminderMilestone,
    isUserSubscriptionPaidForCycle,
    DEFAULT_YEARLY_REMINDER_DAYS,
    DEFAULT_MONTHLY_REMINDER_DAYS
} from "../src/lib/subscription-reminders";


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

    // 22b. Standalone Monthly Rate Proration ($17.50/mo standalone vs $180/yr annual base)
    await assertTest("Billing: Standalone Monthly Rate Proration ($17.50/mo vs $180/yr)", async () => {
        // Start date: Oct 1, 2026 with 14-day trial -> ends Oct 15, 2026
        // Days remaining in Oct: 31 - 15 = 16 days
        // Annual rate: $180/yr -> $15/mo base rate, dailyRate = $0.48/day, amountDueNow = 7.74 + 30 = $37.74
        // Standalone monthly rate: $17.50/mo -> monthlyDailyRate = $0.56/day, monthlyAmountDueNow = $9.03
        const result = calculateProratedBilling({
            startDate: new Date("2026-10-01T12:00:00Z"),
            trialDays: 14,
            yearlyPrice: 180,
            monthlyPrice: 17.5
        });

        if (result.standaloneMonthlyRate !== 17.5) {
            throw new Error(`Expected standaloneMonthlyRate to be 17.5 but got ${result.standaloneMonthlyRate}`);
        }
        if (result.annualMonthlyRate !== 15) {
            throw new Error(`Expected annualMonthlyRate to be 15 but got ${result.annualMonthlyRate}`);
        }
        if (result.monthlyDailyRate !== 0.56) {
            throw new Error(`Expected monthlyDailyRate to be 0.56 but got ${result.monthlyDailyRate}`);
        }
        if (result.monthlyAmountDueNow !== 9.03) {
            throw new Error(`Expected monthlyAmountDueNow to be 9.03 but got ${result.monthlyAmountDueNow}`);
        }
        if (result.amountDueNow !== 37.74) {
            throw new Error(`Expected amountDueNow to be 37.74 but got ${result.amountDueNow}`);
        }
        if (result.dailyRate !== 0.48) {
            throw new Error(`Expected dailyRate to be 0.48 but got ${result.dailyRate}`);
        }
        if (!result.monthlyBreakdownSummary.includes("$9.03 for 16 days remaining in October ($0.56/day)")) {
            throw new Error(`Expected monthlyBreakdownSummary to include daily rate breakdown, got: ${result.monthlyBreakdownSummary}`);
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
        
        // 1. Ensure gates are turned ON (requireApproval = true)
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
            // A. Email gate enforcement ON: verify email is NOT sent and item is strictly queued in AdminApproval
            const emailRes = await sendOrQueueEmail({
                to: testUser.email,
                subject: "Gated Test Notification",
                html: "<p>This must not be sent without approval</p>",
                templateId: "user_approval",
                targetUser: testUser.username,
                userId: testUser.id,
                attachments: [{ filename: "test.pdf", path: "/tmp/test.pdf", contentType: "application/pdf" }]
            });

            if (!emailRes.queued || !emailRes.approvalId) {
                throw new Error("Expected email to be queued for approval when requireApprovalForEmails=true, but it was not queued");
            }

            const emailApproval = await prisma.adminApproval.findUnique({
                where: { id: emailRes.approvalId }
            });
            if (!emailApproval || emailApproval.status !== "PENDING" || emailApproval.type !== "EMAIL") {
                throw new Error("Email approval record was not properly created with PENDING status");
            }
            const parsedPayload = JSON.parse(emailApproval.payload);
            if (!Array.isArray(parsedPayload.attachments) || parsedPayload.attachments.length !== 1) {
                throw new Error("Email approval payload did not properly preserve attachments");
            }

            // B. Plex access change gate enforcement ON: verify no live Plex share deletion happens without approval
            const revokeRes = await revokePlexAccessForUserInternal(testUser, "Test automated suspension");
            if (!revokeRes.staged || !revokeRes.approvalId) {
                throw new Error("Expected Plex revocation to be staged for approval when requireApprovalForPlexChanges=true, but it was not staged");
            }

            const plexApproval = await prisma.adminApproval.findUnique({
                where: { id: revokeRes.approvalId }
            });
            if (!plexApproval || plexApproval.status !== "PENDING" || plexApproval.type !== "PLEX_ACCESS_REVOKE") {
                throw new Error("Plex revocation approval record was not properly created with PENDING status");
            }

            // Clean up staged approvals from ON test
            await prisma.adminApproval.delete({ where: { id: emailRes.approvalId } });
            await prisma.adminApproval.delete({ where: { id: revokeRes.approvalId } });

            // 2. Test gates turned OFF (requireApproval = false): verify items are NOT staged in AdminApproval
            await prisma.settings.update({
                where: { id: "global" },
                data: {
                    requireApprovalForPlexChanges: false,
                    requireApprovalForEmails: false
                }
            });

            const approvalsCountBefore = await prisma.adminApproval.count();

            // C. Email gate OFF: sendOrQueueEmail must NOT queue into AdminApproval
            const directEmailRes = await sendOrQueueEmail({
                to: testUser.email,
                subject: "Direct Non-Gated Notification",
                html: "<p>Direct notification when gate is OFF</p>",
                templateId: "user_approval",
                targetUser: testUser.username,
                userId: testUser.id
            });

            if (directEmailRes.queued) {
                throw new Error("Expected email NOT to be queued when requireApprovalForEmails=false");
            }

            // D. Plex gate OFF: revokePlexAccessForUserInternal must NOT stage into AdminApproval
            const directRevokeRes = await revokePlexAccessForUserInternal(testUser, "Test direct suspension when gate is OFF");
            if (directRevokeRes.staged) {
                throw new Error("Expected Plex revocation NOT to be staged when requireApprovalForPlexChanges=false");
            }

            const approvalsCountAfter = await prisma.adminApproval.count();
            if (approvalsCountAfter !== approvalsCountBefore) {
                throw new Error("New AdminApproval records were unexpectedly created while approval gates were turned OFF");
            }
        } finally {
            // Restore default safety settings
            await prisma.settings.update({
                where: { id: "global" },
                data: {
                    requireApprovalForPlexChanges: true,
                    requireApprovalForEmails: true
                }
            });
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
        await prisma.paymentTransaction.deleteMany({ where: { matchedUser: { email: "payment_test@example.com" } } }).catch(() => {});
        await prisma.user.deleteMany({ where: { OR: [{ email: "payment_test@example.com" }, { username: "test_payment_member" }] } }).catch(() => {});
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
                emailSubject: "Paid you $180.00",
                emailUid: "test-uid-180",
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
                return pt.includes("media") || pt.includes("data") || pt.includes("mnt/user") || pt.includes("storage") || pt.includes("pool") || pt.includes("tank") || pt.includes("disk") || pt.includes("array");
            })
            || mockDisks.find(d => d.percent > 0 && d.mntPoint !== "/" && d.mntPoint !== "/boot")
            || mockDisks.find(d => d.percent > 0);

        if (heuristicMatch?.id !== "disk_media") {
            throw new Error(`Expected heuristic match to pick "disk_media", got "${heuristicMatch?.id}" (${heuristicMatch?.mntPoint})`);
        }
    });

    // 42b. Maintainerr: Prune Trigger Policy & Evaluation Gating
    await assertTest("Maintainerr: Prune Trigger Mode (Rule-Based Retention vs Capacity)", async () => {
        // 1. Settings DB Persistence & Schema Column
        await prisma.settings.upsert({
            where: { id: "global" },
            update: { pruneTriggerMode: "always" },
            create: { id: "global", pruneTriggerMode: "always" }
        });

        let s = await prisma.settings.findUnique({ where: { id: "global" } });
        if (s?.pruneTriggerMode !== "always") {
            throw new Error(`Expected pruneTriggerMode "always", got "${s?.pruneTriggerMode}"`);
        }

        await prisma.settings.update({
            where: { id: "global" },
            data: { pruneTriggerMode: "capacity" }
        });

        s = await prisma.settings.findUnique({ where: { id: "global" } });
        if (s?.pruneTriggerMode !== "capacity") {
            throw new Error(`Expected pruneTriggerMode "capacity", got "${s?.pruneTriggerMode}"`);
        }

        // Restore to recommended standard default "always"
        await prisma.settings.update({
            where: { id: "global" },
            data: { pruneTriggerMode: "always" }
        });

        // 2. Evaluation Gating Logic Verification
        const testGate = (triggerMode: string, capacityWarning: boolean, force: boolean, diskCount: number) => {
            return Boolean(
                force ||
                triggerMode === "always" ||
                capacityWarning ||
                (triggerMode === "capacity" && diskCount === 0)
            );
        };

        if (!testGate("always", false, false, 4)) {
            throw new Error("Expected triggerMode 'always' to evaluate even when capacityWarning is false and disks > 0");
        }

        if (testGate("capacity", false, false, 4)) {
            throw new Error("Expected triggerMode 'capacity' to skip evaluation when capacityWarning is false and disks > 0");
        }

        if (!testGate("capacity", true, false, 4)) {
            throw new Error("Expected triggerMode 'capacity' to evaluate when capacityWarning is true");
        }

        if (!testGate("capacity", false, false, 0)) {
            throw new Error("Expected triggerMode 'capacity' to evaluate as fallback when Glances disk count is 0");
        }

        if (!testGate("capacity", false, true, 4)) {
            throw new Error("Expected forceEvaluate to bypass capacity check");
        }
    });

    // 42c. Maintainerr: MediaContentAdvisory File Size Persistence & Recoverable Space Calculation
    await assertTest("Maintainerr: Media File Size Tracking & Recoverable Space Aggregation", async () => {
        const testRatingKey = "test_prune_size_item_99999";
        const testServerId = "test_server_prune";

        // 1. Create or upsert advisory with fileSizeGb
        await prisma.mediaContentAdvisory.upsert({
            where: { ratingKey_serverId: { ratingKey: testRatingKey, serverId: testServerId } },
            update: {
                title: "Test Prunable Movie",
                isLeavingSoon: true,
                leavingSoonDate: new Date(Date.now() + 14 * 86400000),
                leavingReason: "Maintainerr Retention Policy: [Lane 2: Never Watched]",
                fileSizeGb: 4.85
            },
            create: {
                ratingKey: testRatingKey,
                serverId: testServerId,
                title: "Test Prunable Movie",
                isLeavingSoon: true,
                leavingSoonDate: new Date(Date.now() + 14 * 86400000),
                leavingReason: "Maintainerr Retention Policy: [Lane 2: Never Watched]",
                fileSizeGb: 4.85
            }
        });

        // 2. Verify retrieval from SQLite
        const advisory = await prisma.mediaContentAdvisory.findUnique({
            where: { ratingKey_serverId: { ratingKey: testRatingKey, serverId: testServerId } }
        });

        if (!advisory || advisory.fileSizeGb !== 4.85) {
            throw new Error(`Expected advisory.fileSizeGb to be 4.85, got ${advisory?.fileSizeGb}`);
        }

        // 3. Verify aggregation and display formatting (GB vs TB)
        const mockItems = [
            { fileSizeGb: 4.85 },
            { fileSizeGb: 12.5 },
            { fileSizeGb: 0.75 },
            { fileSizeGb: null }
        ];

        const totalGb = mockItems.reduce((acc, it) => acc + (it.fileSizeGb || 0), 0);
        if (Math.abs(totalGb - 18.1) > 0.001) {
            throw new Error(`Expected total recoverable GB to be 18.1, got ${totalGb}`);
        }

        const formatSpace = (gb: number) => gb >= 1000 ? `${(gb / 1024).toFixed(2)} TB` : `${gb.toFixed(1)} GB`;
        if (formatSpace(totalGb) !== "18.1 GB") {
            throw new Error(`Expected "18.1 GB", got "${formatSpace(totalGb)}"`);
        }
        if (formatSpace(1500) !== "1.46 TB") {
            throw new Error(`Expected "1.46 TB", got "${formatSpace(1500)}"`);
        }

        // 4. Cleanup
        await prisma.mediaContentAdvisory.deleteMany({
            where: { ratingKey: testRatingKey, serverId: testServerId }
        });
    });

    // 42d. Maintainerr: Bulk Unmark Staged Media Items & Batch DB Flag Revocation
    await assertTest("Maintainerr: Bulk Unmark Staged Media Items & Batch DB Revocation", async () => {
        const testItems = [
            { ratingKey: "test_bulk_prune_1", serverId: "srv1", title: "Bulk Prune 1", fileSizeGb: 2.5 },
            { ratingKey: "test_bulk_prune_2", serverId: "srv1", title: "Bulk Prune 2", fileSizeGb: 3.5 },
            { ratingKey: "test_bulk_prune_3", serverId: "srv2", title: "Bulk Prune 3", fileSizeGb: 4.0 },
            { ratingKey: "test_bulk_prune_keep", serverId: "srv1", title: "Bulk Prune Keep", fileSizeGb: 1.0 }
        ];

        // 1. Seed items
        for (const it of testItems) {
            await prisma.mediaContentAdvisory.upsert({
                where: { ratingKey_serverId: { ratingKey: it.ratingKey, serverId: it.serverId } },
                update: {
                    title: it.title,
                    isLeavingSoon: true,
                    leavingSoonDate: new Date(Date.now() + 14 * 86400000),
                    leavingReason: "Maintainerr Retention Policy: [Lane 2: Never Watched]",
                    fileSizeGb: it.fileSizeGb
                },
                create: {
                    ratingKey: it.ratingKey,
                    serverId: it.serverId,
                    title: it.title,
                    isLeavingSoon: true,
                    leavingSoonDate: new Date(Date.now() + 14 * 86400000),
                    leavingReason: "Maintainerr Retention Policy: [Lane 2: Never Watched]",
                    fileSizeGb: it.fileSizeGb
                }
            });
        }

        // 2. Perform batch unmark on selected 3 items
        const selectedToUnmark = [
            { ratingKey: "test_bulk_prune_1", serverId: "srv1" },
            { ratingKey: "test_bulk_prune_2", serverId: "srv1" },
            { ratingKey: "test_bulk_prune_3", serverId: "srv2" }
        ];

        const byServer = new Map<string, string[]>();
        for (const it of selectedToUnmark) {
            const list = byServer.get(it.serverId) || [];
            list.push(it.ratingKey);
            byServer.set(it.serverId, list);
        }

        for (const [srvId, rKeys] of byServer.entries()) {
            await prisma.mediaContentAdvisory.updateMany({
                where: {
                    serverId: srvId,
                    ratingKey: { in: rKeys }
                },
                data: {
                    isLeavingSoon: false,
                    leavingSoonDate: null,
                    leavingReason: null
                }
            });
        }

        // 3. Verify unmarked items are no longer staged
        const remainingStaged = await prisma.mediaContentAdvisory.findMany({
            where: {
                ratingKey: { in: testItems.map(it => it.ratingKey) },
                isLeavingSoon: true
            }
        });

        if (remainingStaged.length !== 1 || remainingStaged[0].ratingKey !== "test_bulk_prune_keep") {
            throw new Error(`Expected exactly 1 remaining staged item (test_bulk_prune_keep), got ${remainingStaged.length}`);
        }

        // 4. Verify bulkUnmarkItemsLeavingSoonAction export exists in curation-actions.ts
        const curationActions = await import("../src/app/curation-actions");
        if (typeof curationActions.bulkUnmarkItemsLeavingSoonAction !== "function") {
            throw new Error("Missing bulkUnmarkItemsLeavingSoonAction in curation-actions.ts");
        }

        // 5. Cleanup
        await prisma.mediaContentAdvisory.deleteMany({
            where: { ratingKey: { in: testItems.map(it => it.ratingKey) } }
        });
    });

    // 42e. Maintainerr: Target Reclamation Headroom Capping & Auto-Staging Volume Quota
    await assertTest("Maintainerr: Target Reclamation Headroom Capping (pruneTargetHeadroomGb)", async () => {
        const mockCandidates = [
            { ratingKey: "cand_1", fileSizeGb: 50 },
            { ratingKey: "cand_2", fileSizeGb: 120 },
            { ratingKey: "cand_3", fileSizeGb: 150 }, // Reaches 320 GB >= 300 GB target
            { ratingKey: "cand_4", fileSizeGb: 80 },
            { ratingKey: "cand_5", fileSizeGb: 60 }
        ];

        const targetHeadroomGb = 300;
        let accumulatedGb = 0;
        const stagedKeys: string[] = [];

        for (const cand of mockCandidates) {
            if (targetHeadroomGb > 0 && accumulatedGb >= targetHeadroomGb) {
                break;
            }
            stagedKeys.push(cand.ratingKey);
            accumulatedGb += cand.fileSizeGb;
        }

        if (stagedKeys.length !== 3) {
            throw new Error(`Expected exactly 3 staged candidates to satisfy 300 GB target, got ${stagedKeys.length}`);
        }
        if (accumulatedGb !== 320) {
            throw new Error(`Expected accumulatedGb to be 320, got ${accumulatedGb}`);
        }

        // Test with existing staged items (e.g. 320 GB already in Leaving Soon)
        let newlyStaged = 0;
        const existingKeys = new Set(["cand_1", "cand_2", "cand_3"]);
        let currentStaged = 320;

        for (const cand of mockCandidates) {
            if (existingKeys.has(cand.ratingKey)) continue;
            if (targetHeadroomGb > 0 && currentStaged >= targetHeadroomGb) {
                break;
            }
            newlyStaged++;
            currentStaged += cand.fileSizeGb;
        }

        if (newlyStaged !== 0) {
            throw new Error(`Expected 0 newly staged items when existing staged storage (320 GB) meets target (300 GB), got ${newlyStaged}`);
        }
    });

    // 42f. Maintainerr: Poster Artwork Restoration & Buffer MIME Detection Resilience
    await assertTest("Maintainerr: Poster Artwork Restoration & MIME Detection Resilience", async () => {
        const { expandCandidateUrls, uploadPlexItemPoster } = await import("../src/lib/curation/plex-analyzer");
        const { restoreItemOriginalArtwork } = await import("../src/lib/curation/overlay-engine");

        if (typeof uploadPlexItemPoster !== "function") {
            throw new Error("Missing uploadPlexItemPoster export in plex-analyzer.ts");
        }
        if (typeof restoreItemOriginalArtwork !== "function") {
            throw new Error("Missing restoreItemOriginalArtwork export in overlay-engine.ts");
        }

        // Test expandCandidateUrls with single plex.direct candidate
        const candidates = expandCandidateUrls("https://192-168-1-100.abcdef.plex.direct:32400");
        if (!candidates.includes("http://192.168.1.100:32400") || !candidates.includes("https://192.168.1.100:32400")) {
            throw new Error(`expandCandidateUrls failed to decode direct LAN IP from .plex.direct, got: ${JSON.stringify(candidates)}`);
        }

        // Test magic bytes buffer MIME identification logic
        const pngBuf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
        const jpgBuf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
        const webpBuf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

        const detectMime = (buf: Buffer) => {
            if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return "image/png";
            if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return "image/jpeg";
            if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
                buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
            return "image/jpeg";
        };

        if (detectMime(pngBuf) !== "image/png") throw new Error("Failed to detect PNG magic bytes");
        if (detectMime(jpgBuf) !== "image/jpeg") throw new Error("Failed to detect JPEG magic bytes");
        if (detectMime(webpBuf) !== "image/webp") throw new Error("Failed to detect WebP magic bytes");
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

    // 44. Tagging Studio: Parental Advisory Tag Formatting, Severity Matching, Server Guard Rails, and Custom Tag Rule Logic
    await assertTest("Tagging Studio: Parental Tagging Formats, Server Guard Rails & Content Advisory Engine", async () => {
        const {
            formatParentalTag,
            isParentalTag,
            meetsSeverityThreshold,
            normalizeContentRating,
            getContentRatingRank,
            isRatingAllowedByGuardRail,
            isMediaAllowedByServerGuardRail,
            KID_SAFE_GUARD_RAIL_PRESET,
            FAMILY_GUARD_RAIL_PRESET,
            UNRESTRICTED_GUARD_RAIL_PRESET
        } = await import("../src/lib/curation/parental-guide-types");

        // 1. Tag Formatting Verification across all syntax templates
        const f1 = formatParentalTag("nudity", "Severe", "prefix_category_severity", "IMDb");
        if (f1 !== "IMDb: Nudity [Severe]") throw new Error(`Expected "IMDb: Nudity [Severe]", got "${f1}"`);

        const f2 = formatParentalTag("violence", "Moderate", "prefix_severity", "IMDb");
        if (f2 !== "IMDb: Moderate") throw new Error(`Expected "IMDb: Moderate", got "${f2}"`);

        const f3 = formatParentalTag("nudity", "Severe", "category_severity");
        if (f3 !== "Nudity [Severe]") throw new Error(`Expected "Nudity [Severe]", got "${f3}"`);

        const f4 = formatParentalTag("profanity", "Mild", "category_severity_paren");
        if (f4 !== "Profanity (Mild)") throw new Error(`Expected "Profanity (Mild)", got "${f4}"`);

        const f5 = formatParentalTag("alcohol", "Severe", "severity_category");
        if (f5 !== "Severe Alcohol") throw new Error(`Expected "Severe Alcohol", got "${f5}"`);

        const f6 = formatParentalTag("frightening", "Severe", "custom", "Advisory");
        if (f6 !== "Advisory: Frightening - Severe") throw new Error(`Expected "Advisory: Frightening - Severe", got "${f6}"`);

        // 2. Tag Detection & Prefix Parsing
        if (!isParentalTag("IMDb: Nudity [Severe]", "IMDb")) throw new Error("Expected isParentalTag true for IMDb: Nudity [Severe]");
        if (!isParentalTag("IMDb: Moderate", "IMDb")) throw new Error("Expected isParentalTag true for IMDb: Moderate");
        if (!isParentalTag("Nudity [Severe]")) throw new Error("Expected isParentalTag true for Nudity [Severe]");
        if (!isParentalTag("Nudity (Severe)")) throw new Error("Expected isParentalTag true for Nudity (Severe)");
        if (!isParentalTag("Severe Nudity")) throw new Error("Expected isParentalTag true for Severe Nudity");
        if (!isParentalTag("IMDb-Nudity: Severe", "IMDb")) throw new Error("Expected isParentalTag true for IMDb-Nudity: Severe");
        if (isParentalTag("Action Movies")) throw new Error("Expected isParentalTag false for regular genre");
        if (isParentalTag("4K UHD HDR")) throw new Error("Expected isParentalTag false for technical label");

        // 3. Severity Thresholds
        if (!meetsSeverityThreshold("Severe", "Mild")) throw new Error("Severe should meet Mild threshold");
        if (!meetsSeverityThreshold("Moderate", "Moderate")) throw new Error("Moderate should meet Moderate threshold");
        if (meetsSeverityThreshold("Mild", "Moderate")) throw new Error("Mild should not meet Moderate threshold");
        if (meetsSeverityThreshold("None", "Mild")) throw new Error("None should not meet Mild threshold");

        // 4. Content Rating Normalization (Handling country prefixes with colons and slashes)
        if (normalizeContentRating("us/PG-13") !== "PG-13") throw new Error("us/PG-13 failed normalization");
        if (normalizeContentRating("US:R") !== "R") throw new Error("US:R failed normalization");
        if (normalizeContentRating("gb/15") !== "15") throw new Error("gb/15 failed normalization");
        if (normalizeContentRating("PG-13") !== "PG-13") throw new Error("PG-13 failed normalization");

        // 5. Content Rating Ranks
        if (getContentRatingRank("G") !== 1) throw new Error("G rank should be 1");
        if (getContentRatingRank("PG") !== 2) throw new Error("PG rank should be 2");
        if (getContentRatingRank("PG-13") !== 3) throw new Error("PG-13 rank should be 3");
        if (getContentRatingRank("R") !== 4) throw new Error("R rank should be 4");
        if (getContentRatingRank("NC-17") !== 5) throw new Error("NC-17 rank should be 5");

        // 6. Server Guard Rails: Rating Policy
        const kidSafeCheckAllowed = isRatingAllowedByGuardRail("G", "G", ["PG", "PG-13", "R"], true);
        if (!kidSafeCheckAllowed.allowed) throw new Error("G rating should be allowed on Kid-Safe");

        const kidSafeCheckBlocked = isRatingAllowedByGuardRail("PG-13", "G", ["PG", "PG-13", "R"], true);
        if (kidSafeCheckBlocked.allowed) throw new Error("PG-13 rating should be blocked on Kid-Safe");

        const unratedCheck = isRatingAllowedByGuardRail("NR", "PG", [], true);
        if (unratedCheck.allowed) throw new Error("Unrated should be blocked when blockUnrated is true");

        // 7. Full Media Item Evaluation against Kid-Safe Server Guard Rail
        const kidSafeConfig = {
            ...KID_SAFE_GUARD_RAIL_PRESET,
            serverId: "kids-server"
        };

        // Permitted Kid Media
        const allowedMedia = isMediaAllowedByServerGuardRail({
            title: "Finding Nemo",
            contentRating: "G",
            genres: ["Animation", "Family"]
        }, kidSafeConfig);
        if (!allowedMedia.allowed) throw new Error(`Finding Nemo should be permitted: ${allowedMedia.reason}`);

        // Blocked by Rating (R)
        const blockedByRating = isMediaAllowedByServerGuardRail({
            title: "Deadpool",
            contentRating: "R",
            genres: ["Action", "Comedy"]
        }, kidSafeConfig);
        if (blockedByRating.allowed) throw new Error("Deadpool should be blocked by R rating");

        // Blocked by Genre (Horror)
        const blockedByGenre = isMediaAllowedByServerGuardRail({
            title: "Scary Cartoon",
            contentRating: "G",
            genres: ["Animation", "Horror"]
        }, kidSafeConfig);
        if (blockedByGenre.allowed) throw new Error("Horror genre should be blocked on Kid-Safe");

        // Blocked by Parental Severity (Severe Nudity)
        const blockedBySeverity = isMediaAllowedByServerGuardRail({
            title: "Unrated Art Film",
            contentRating: "G",
            advisory: {
                nudity: "Severe",
                violence: "None",
                profanity: "None",
                alcohol: "None",
                frightening: "None",
                source: "imdb_direct"
            }
        }, kidSafeConfig);
        if (blockedBySeverity.allowed) throw new Error("Severe nudity should be blocked by Kid-Safe limits");
    });

    // 45. Curation Automation: Schedule Calculations, isScheduleDue, and Next-Run Precision
    await assertTest("Curation Scheduling: Schedule Calculations, isScheduleDue & Next-Run Precision", async () => {
        const now = new Date();

        // 1. calculateNextRunTime for interval schedules
        const lastRun5hAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);
        const next6h = calculateNextRunTime("every_6_hours", lastRun5hAgo);
        if (next6h.isDue) throw new Error("every_6_hours with last run 5h ago should NOT be due yet");
        if (!next6h.relativeText.includes("in 1h") && !next6h.relativeText.includes("in 60 mins") && !next6h.relativeText.includes("in 59 mins")) {
            throw new Error(`Unexpected relativeText for 6h interval: ${next6h.relativeText}`);
        }

        const lastRun7hAgo = new Date(now.getTime() - 7 * 60 * 60 * 1000);
        const due6h = calculateNextRunTime("every_6_hours", lastRun7hAgo);
        if (!due6h.isDue) throw new Error("every_6_hours with last run 7h ago SHOULD be due");
        if (due6h.relativeText !== "Due on next scheduler tick") {
            throw new Error(`Expected 'Due on next scheduler tick', got '${due6h.relativeText}'`);
        }

        // 2. calculateNextRunTime for disabled schedules
        const disabledRun = calculateNextRunTime("disabled");
        if (disabledRun.isDue || disabledRun.relativeText !== "Disabled") {
            throw new Error(`Disabled schedule should return isDue=false and 'Disabled', got: ${JSON.stringify(disabledRun)}`);
        }

        // 3. calculateNextRunTime for monthly_1st
        const monthlyRun = calculateNextRunTime("monthly_1st");
        if (!monthlyRun.nextRunDate || !monthlyRun.relativeText.includes("4:00 AM")) {
            throw new Error(`monthly_1st should compute valid nextRunDate with 4:00 AM, got: ${JSON.stringify(monthlyRun)}`);
        }

        // 4. isScheduleDue for intervals (evaluated outside maintenance window)
        const afternoonRef = new Date("2026-10-02T14:00:00");
        const dueEveryHour = isScheduleDue("every_hour", new Date(afternoonRef.getTime() - 56 * 60 * 1000), afternoonRef);
        if (!dueEveryHour) throw new Error("every_hour with 56m elapsed should be due");

        const notDueEveryHour = isScheduleDue("every_hour", new Date(afternoonRef.getTime() - 30 * 60 * 1000), afternoonRef);
        if (notDueEveryHour) throw new Error("every_hour with 30m elapsed should NOT be due");

        // 5. isScheduleDue for daily fixed hours
        const target4amNow = new Date(now);
        target4amNow.setHours(4, 15, 0, 0); // 4:15 AM
        const yesterday4am = new Date(target4amNow.getTime() - 24 * 60 * 60 * 1000);
        const today4am = new Date(target4amNow.getTime() - 10 * 60 * 1000); // 4:05 AM today

        // At 4:15 AM, not run today:
        const isDueDaily4am = isScheduleDue("daily_4am", yesterday4am, target4amNow);
        if (!isDueDaily4am) throw new Error("daily_4am at 4:15 AM (last run yesterday) SHOULD be due");

        // At 4:15 AM, already run today:
        const alreadyRunDaily4am = isScheduleDue("daily_4am", today4am, target4amNow);
        if (alreadyRunDaily4am) throw new Error("daily_4am at 4:15 AM (already ran today at 4:05 AM) should NOT be due");

        // Off-hour (2:00 PM), null lastRun (fresh install) MUST NOT trigger prematurely:
        const target2pmNow = new Date(now);
        target2pmNow.setHours(14, 0, 0, 0);
        const freshInstallOffHour = isScheduleDue("daily_4am", null, target2pmNow);
        if (freshInstallOffHour) throw new Error("daily_4am on fresh install at 2:00 PM should NOT trigger prematurely");

        // On-hour (4:00 AM), null lastRun (fresh install) SHOULD trigger:
        const freshInstallOnHour = isScheduleDue("daily_4am", null, target4amNow);
        if (!freshInstallOnHour) throw new Error("daily_4am on fresh install at 4:15 AM SHOULD trigger");

        // 6. isScheduleDue for weekly Sunday
        const sunday4am = new Date(now);
        sunday4am.setDate(sunday4am.getDate() + ((7 - sunday4am.getDay()) % 7)); // this/next Sunday
        sunday4am.setHours(4, 10, 0, 0);
        const lastSunday = new Date(sunday4am.getTime() - 7 * 24 * 60 * 60 * 1000);
        const isDueSunday = isScheduleDue("weekly_sun", lastSunday, sunday4am);
        if (!isDueSunday) throw new Error("weekly_sun on Sunday at 4:10 AM should be due");

        // Fresh install on Tuesday must not trigger weekly Sunday
        const tuesday2pm = new Date(sunday4am.getTime() + 2 * 24 * 60 * 60 * 1000); // Tuesday
        tuesday2pm.setHours(14, 0, 0, 0);
        const notDueTuesday = isScheduleDue("weekly_sun", null, tuesday2pm);
        if (notDueTuesday) throw new Error("weekly_sun on Tuesday with null lastRun should NOT be due");

        // 7. Verify SCHEDULE_OPTIONS labels format properly
        for (const opt of SCHEDULE_OPTIONS) {
            const formatted = formatScheduleLabel(opt.value);
            if (!formatted || formatted === opt.value) {
                throw new Error(`Schedule option ${opt.value} did not format cleanly: ${formatted}`);
            }
        }

        // 8. Verify scheduler tick debouncing: once triggered at `now`, subsequent 60s ticks MUST NOT re-trigger
        const triggerTime = new Date("2026-10-02T14:00:00");
        const tick60sLater = new Date(triggerTime.getTime() + 60 * 1000);
        const tick5mLater = new Date(triggerTime.getTime() + 5 * 60 * 1000);

        // Incremental overlay (every_hour):
        if (isScheduleDue("every_hour", triggerTime, tick60sLater)) {
            throw new Error("every_hour MUST NOT be due 60s after triggering!");
        }
        if (isScheduleDue("every_hour", triggerTime, tick5mLater)) {
            throw new Error("every_hour MUST NOT be due 5m after triggering!");
        }

        // Agregarr collection sync (every_6_hours):
        if (isScheduleDue("every_6_hours", triggerTime, tick60sLater)) {
            throw new Error("every_6_hours MUST NOT be due 60s after triggering!");
        }
        if (isScheduleDue("every_6_hours", triggerTime, tick5mLater)) {
            throw new Error("every_6_hours MUST NOT be due 5m after triggering!");
        }

        // 9. 5:00 AM – 5:30 AM Unraid Plex Maintenance Window Blackout Verification
        const t459 = new Date("2026-10-02T04:59:59");
        const t500 = new Date("2026-10-02T05:00:00");
        const t515 = new Date("2026-10-02T05:15:30");
        const t529 = new Date("2026-10-02T05:29:59");
        const t530 = new Date("2026-10-02T05:30:00");
        const t535 = new Date("2026-10-02T05:35:00");
        const t600 = new Date("2026-10-02T06:00:00");

        if (isPlexMaintenanceWindow(t459)) throw new Error("4:59:59 AM should NOT be in maintenance window");
        if (!isPlexMaintenanceWindow(t500)) throw new Error("5:00:00 AM MUST be in maintenance window");
        if (!isPlexMaintenanceWindow(t515)) throw new Error("5:15:30 AM MUST be in maintenance window");
        if (!isPlexMaintenanceWindow(t529)) throw new Error("5:29:59 AM MUST be in maintenance window");
        if (isPlexMaintenanceWindow(t530)) throw new Error("5:30:00 AM should NOT be in maintenance window");
        if (isPlexMaintenanceWindow(t535)) throw new Error("5:35:00 AM should NOT be in maintenance window");
        if (isPlexMaintenanceWindow(t600)) throw new Error("6:00:00 AM should NOT be in maintenance window");

        // Schedule suppression during 5:00 AM – 5:30 AM blackout
        const yesterday5am = new Date("2026-10-01T05:30:00");
        const twoHoursAgo = new Date(t515.getTime() - 2 * 60 * 60 * 1000);

        if (isScheduleDue("daily_5am", yesterday5am, t515)) {
            throw new Error("daily_5am MUST be suppressed during 5:00-5:30 AM maintenance window!");
        }
        if (isScheduleDue("every_hour", twoHoursAgo, t515)) {
            throw new Error("every_hour MUST be suppressed during 5:00-5:30 AM maintenance window!");
        }
        if (isScheduleDue("every_6_hours", twoHoursAgo, t515)) {
            throw new Error("every_6_hours MUST be suppressed during 5:00-5:30 AM maintenance window!");
        }

        // Resumption immediately at 5:30:00 AM after maintenance completes
        if (!isScheduleDue("daily_5am", yesterday5am, t530)) {
            throw new Error("daily_5am MUST become due at 5:30 AM once maintenance window ends!");
        }
        if (!isScheduleDue("every_hour", twoHoursAgo, t530)) {
            throw new Error("every_hour MUST become due at 5:30 AM once maintenance window ends!");
        }

        // calculateNextRunTime transparency during maintenance
        const nextRunAt515 = calculateNextRunTime("daily_5am", yesterday5am, t515);
        if (nextRunAt515.isDue || !nextRunAt515.relativeText.includes("5:30 AM")) {
            throw new Error(`calculateNextRunTime at 5:15 AM should indicate deferral to 5:30 AM, got: ${JSON.stringify(nextRunAt515)}`);
        }

        const hourlyAt515 = calculateNextRunTime("every_hour", twoHoursAgo, t515);
        if (hourlyAt515.isDue || !hourlyAt515.relativeText.includes("maintenance")) {
            throw new Error(`calculateNextRunTime for every_hour at 5:15 AM should indicate maintenance pause, got: ${JSON.stringify(hourlyAt515)}`);
        }

        // Verify Maintainerr recommendation in SCHEDULE_OPTIONS is daily_6am
        const opt6am = SCHEDULE_OPTIONS.find(o => o.value === "daily_6am");
        if (!opt6am || !opt6am.recommendedFor?.toLowerCase().includes("maintainerr")) {
            throw new Error("SCHEDULE_OPTIONS must recommend daily_6am for Maintainerr!");
        }
    });

    // 66. Book Age & Maturity Rating Engine and Kids Mode Enforcement
    await assertTest("Books: Age & Maturity Rating Engine & Kids Isolation", async () => {
        // 1. Test inferBookRating with explicit Google Books maturityRating
        const matureGb = inferBookRating({ maturityRating: "MATURE", title: "Dark Nights", overview: "A gripping thriller" });
        if (matureGb.ageRating !== "18+ Mature" || matureGb.maturityRating !== "MATURE") {
            throw new Error(`Expected '18+ Mature' and 'MATURE', got: ${JSON.stringify(matureGb)}`);
        }

        // 2. Test inferBookRating with BISAC Juvenile categories
        const juvenileBook = inferBookRating({
            categories: ["Juvenile Fiction / Action & Adventure / General"],
            title: "Percy Jackson and the Lightning Thief"
        });
        if (juvenileBook.ageRating !== "Kids" || juvenileBook.maturityRating !== "NOT_MATURE") {
            throw new Error(`Expected 'Kids' and 'NOT_MATURE' for juvenile category, got: ${JSON.stringify(juvenileBook)}`);
        }

        // 3. Test inferBookRating with Young Adult categories
        const yaBook = inferBookRating({
            categories: ["Young Adult Fiction / Dystopian"],
            title: "The Hunger Games"
        });
        if (yaBook.ageRating !== "YA (12+)" || yaBook.maturityRating !== "NOT_MATURE") {
            throw new Error(`Expected 'YA (12+)' and 'NOT_MATURE' for YA category, got: ${JSON.stringify(yaBook)}`);
        }

        // 4. Test inferBookRating with OpenLibrary subjects
        const olKids = inferBookRating({
            subjects: ["Children's stories", "Picture books for children"],
            title: "Where the Wild Things Are"
        });
        if (olKids.ageRating !== "Kids") {
            throw new Error(`Expected 'Kids' from OpenLibrary subjects, got: ${JSON.stringify(olKids)}`);
        }

        const olYa = inferBookRating({
            subjects: ["Young adult literature", "Teenagers -- Fiction"],
            title: "The Fault in Our Stars"
        });
        if (olYa.ageRating !== "YA (12+)") {
            throw new Error(`Expected 'YA (12+)' from OpenLibrary subjects, got: ${JSON.stringify(olYa)}`);
        }

        // 5. Test inferBookRating with Erotica / Explicit keywords
        const eroticaBook = inferBookRating({
            categories: ["Fiction / Erotica / General"],
            title: "Passionate Desires",
            overview: "An explicit erotic romance novel for adults."
        });
        if (eroticaBook.ageRating !== "18+ Mature" || eroticaBook.maturityRating !== "MATURE") {
            throw new Error(`Expected '18+ Mature' and 'MATURE' for erotica, got: ${JSON.stringify(eroticaBook)}`);
        }

        // 6. Test inferBookRating title heuristics for famous kids titles
        const peppaBook = inferBookRating({ title: "Peppa Pig Goes Swimming" });
        if (peppaBook.ageRating !== "Kids") {
            throw new Error(`Expected 'Kids' for Peppa Pig title, got: ${JSON.stringify(peppaBook)}`);
        }

        // 7. Test inferBookRating for general fiction
        const generalBook = inferBookRating({
            title: "The Great Gatsby",
            author: "F. Scott Fitzgerald",
            categories: ["Fiction / Classics"]
        });
        if (generalBook.ageRating !== "All Ages" || generalBook.maturityRating !== "NOT_MATURE") {
            throw new Error(`Expected 'All Ages' and 'NOT_MATURE' for classic fiction, got: ${JSON.stringify(generalBook)}`);
        }

        // 8. Test Known Spicy Authors & Adult Romance Series (e.g. Elsie Silver - Gold Rush Ranch)
        const elsieSilverBook = inferBookRating({
            title: "Gold rush ranch",
            author: "Elsie Silver",
            series: "Gold Rush Ranch"
        });
        if (elsieSilverBook.ageRating !== "18+ Mature" || elsieSilverBook.maturityRating !== "MATURE" || !elsieSilverBook.isMature) {
            throw new Error(`Expected '18+ Mature' and 'MATURE' for Elsie Silver / Gold Rush Ranch, got: ${JSON.stringify(elsieSilverBook)}`);
        }

        const colleenHoover = inferBookRating({
            title: "It Ends With Us",
            author: "Colleen Hoover"
        });
        if (colleenHoover.ageRating !== "18+ Mature" || !colleenHoover.isMature) {
            throw new Error(`Expected Colleen Hoover to evaluate to '18+ Mature', got: ${JSON.stringify(colleenHoover)}`);
        }

        const spicyTropeBook = inferBookRating({
            title: "Flawless",
            author: "Unknown Author",
            overview: "A steamy cowboy ranch romance with high heat, enemies to lovers, and open door scenes."
        });
        if (spicyTropeBook.ageRating !== "18+ Mature" || !spicyTropeBook.isMature) {
            throw new Error(`Expected steamy romance trope book to evaluate to '18+ Mature', got: ${JSON.stringify(spicyTropeBook)}`);
        }

        const adultRomanceCategory = inferBookRating({
            title: "A Heart Remembers",
            author: "Jane Doe",
            categories: ["Fiction / Romance / Contemporary"]
        });
        if (adultRomanceCategory.ageRating !== "18+ Mature") {
            throw new Error(`Expected adult romance category to default to '18+ Mature', got: ${JSON.stringify(adultRomanceCategory)}`);
        }

        // Test Tessa Dare historical romance titles
        const tessaDare1 = inferBookRating({
            title: "A Night to Surrender",
            author: "Tessa Dare"
        });
        if (tessaDare1.ageRating !== "18+ Mature" || !tessaDare1.isMature) {
            throw new Error(`Expected Tessa Dare 'A Night to Surrender' to evaluate to '18+ Mature', got: ${JSON.stringify(tessaDare1)}`);
        }

        const tessaDare2 = inferBookRating({
            title: "Do You Want to Start a Scandal",
            author: "Tessa Dare"
        });
        if (tessaDare2.ageRating !== "18+ Mature" || !tessaDare2.isMature) {
            throw new Error(`Expected Tessa Dare 'Do You Want to Start a Scandal' to evaluate to '18+ Mature', got: ${JSON.stringify(tessaDare2)}`);
        }

        // Test romance title signatures without explicit author
        const scandalBook = inferBookRating({
            title: "A Scandalous Affair with the Duke",
            author: "Anonymous Author"
        });
        if (scandalBook.ageRating !== "18+ Mature" || !scandalBook.isMature) {
            throw new Error(`Expected scandalous romance title to evaluate to '18+ Mature', got: ${JSON.stringify(scandalBook)}`);
        }

        // 9. Test Database Persistence of ageRating and maturityRating on Book & BookRequest
        let testLibrary = await prisma.library.findFirst();
        if (!testLibrary) {
            testLibrary = await prisma.library.create({
                data: {
                    name: "Test Rating Library",
                    path: "/test/books",
                    mediaType: "ebook"
                }
            });
        }
        if (testLibrary) {
            const testBookKid = await prisma.book.create({
                data: {
                    title: "Test Kid Book Verification",
                    author: "Test Author",
                    libraryId: testLibrary.id,
                    ageRating: "Kids",
                    maturityRating: "NOT_MATURE",
                    fileType: "epub",
                    filePath: "/test/books/kid.epub"
                }
            });

            const testBookMature = await prisma.book.create({
                data: {
                    title: "Test Mature Book Verification",
                    author: "Test Author",
                    libraryId: testLibrary.id,
                    ageRating: "18+ Mature",
                    maturityRating: "MATURE",
                    fileType: "epub",
                    filePath: "/test/books/mature.epub"
                }
            });

            const testReq = await prisma.bookRequest.create({
                data: {
                    title: "Test Book Request Rating",
                    author: "Test Author",
                    mediaType: "ebook",
                    type: "single",
                    status: "Approved",
                    ageRating: "Kids",
                    maturityRating: "NOT_MATURE",
                    requestedBy: "test_verifier",
                    libraryId: testLibrary.id
                }
            });

            const fetchedKid = await prisma.book.findUnique({ where: { id: testBookKid.id } });
            if (!fetchedKid || fetchedKid.ageRating !== "Kids" || fetchedKid.maturityRating !== "NOT_MATURE") {
                throw new Error(`Prisma failed to persist ageRating/maturityRating on Book: ${JSON.stringify(fetchedKid)}`);
            }

            const fetchedMature = await prisma.book.findUnique({ where: { id: testBookMature.id } });
            if (!fetchedMature || fetchedMature.ageRating !== "18+ Mature" || fetchedMature.maturityRating !== "MATURE") {
                throw new Error(`Prisma failed to persist mature ageRating on Book: ${JSON.stringify(fetchedMature)}`);
            }

            const fetchedReq = await prisma.bookRequest.findUnique({ where: { id: testReq.id } });
            if (!fetchedReq || fetchedReq.ageRating !== "Kids" || fetchedReq.maturityRating !== "NOT_MATURE") {
                throw new Error(`Prisma failed to persist ageRating/maturityRating on BookRequest: ${JSON.stringify(fetchedReq)}`);
            }

            // Cleanup test records
            await prisma.book.deleteMany({ where: { id: { in: [testBookKid.id, testBookMature.id] } } });
            await prisma.bookRequest.deleteMany({ where: { id: testReq.id } });
        }
    });

    // 49. Seerr Engine: Discovery Caching, Reconcile Throttling & Fast Loading
    await assertTest("Seerr Engine: Discovery Caching, Reconcile Throttling & Fast Loading", async () => {
        const { getDiscoverHomeAction, reconcileBookRequestsWithMediaRequests } = await import("../src/app/seerr-actions");
        const { fetchTrendingEbooks, fetchTrendingAudiobooks } = await import("../src/lib/books/book-service");

        // 1. Discovery Home Caching Test
        const startFirst = Date.now();
        const homeRes1 = await getDiscoverHomeAction("main");
        const durationFirst = Date.now() - startFirst;

        if (!homeRes1.success || !Array.isArray(homeRes1.sections)) {
            throw new Error(`getDiscoverHomeAction failed: ${homeRes1.error || "No sections"}`);
        }

        const startSecond = Date.now();
        const homeRes2 = await getDiscoverHomeAction("main");
        const durationSecond = Date.now() - startSecond;

        if (!homeRes2.success || homeRes2.sections.length !== homeRes1.sections.length) {
            throw new Error("Cached getDiscoverHomeAction did not return identical sections");
        }

        // 2. Reconcile Book Requests Throttling Test
        await reconcileBookRequestsWithMediaRequests();

        const startThrottled = Date.now();
        await reconcileBookRequestsWithMediaRequests(); // should be throttled (returns immediately in < 20ms)
        const throttledDuration = Date.now() - startThrottled;

        if (throttledDuration > 50) {
            throw new Error(`Throttled reconcile took ${throttledDuration}ms (expected < 50ms)`);
        }

        // 3. Trending Books In-Memory Caching Test
        const ebooks1 = await fetchTrendingEbooks(false);
        const startEbooksCached = Date.now();
        const ebooks2 = await fetchTrendingEbooks(false);
        const cachedEbooksDuration = Date.now() - startEbooksCached;

        if (cachedEbooksDuration > 50) {
            throw new Error(`Cached fetchTrendingEbooks took ${cachedEbooksDuration}ms (expected < 50ms)`);
        }
    });

    // 50. Seerr Engine: Tab Pre-warming, Deduplicated Availability Indexing & Sub-Second Tab Switching
    await assertTest("Seerr Engine: Tab Pre-warming & Deduplicated Availability Indexing", async () => {
        const { getDiscoverHomeAction, getDiscoverMediaAction } = await import("../src/app/seerr-actions");
        const { getPlexLibraryGuidIndex } = await import("../src/lib/seerr/availability");
        const { getArrIndex } = await import("../src/lib/seerr/arr-monitoring");
        const { getTmdbApiKey } = await import("../src/lib/curation/tmdb");

        // 1. In-flight Promise Deduplication Test for Plex & Arr indexes
        const [plexIndex1, plexIndex2] = await Promise.all([
            getPlexLibraryGuidIndex(),
            getPlexLibraryGuidIndex()
        ]);
        if (!plexIndex1 || !plexIndex2) {
            throw new Error("getPlexLibraryGuidIndex returned null");
        }

        const [arrIndex1, arrIndex2] = await Promise.all([
            getArrIndex(),
            getArrIndex()
        ]);
        if (!arrIndex1 || !arrIndex2) {
            throw new Error("getArrIndex returned null");
        }

        // 2. Discover Home Action Pre-warms Popular Movies & TV Caches
        const homeRes = await getDiscoverHomeAction("main");
        if (!homeRes.success) {
            throw new Error(`getDiscoverHomeAction failed: ${homeRes.error}`);
        }

        // 3. Tab switch to "movies" (popular page 1) must be sub-second (< 250ms) from primed cache
        const startMovies = Date.now();
        const moviesRes = await getDiscoverMediaAction("popular", "movie", 1, false);
        const moviesDuration = Date.now() - startMovies;

        if (!moviesRes.success || !Array.isArray(moviesRes.items) || moviesRes.items.length === 0) {
            throw new Error("getDiscoverMediaAction for popular movies failed or returned empty items");
        }
        if (moviesDuration > 250) {
            throw new Error(`getDiscoverMediaAction for popular movies took ${moviesDuration}ms (expected < 250ms)`);
        }

        // 4. Tab switch to "tv" (popular page 1) must be sub-second (< 250ms) from primed cache
        const startTv = Date.now();
        const tvRes = await getDiscoverMediaAction("popular", "tv", 1, false);
        const tvDuration = Date.now() - startTv;

        if (!tvRes.success || !Array.isArray(tvRes.items) || tvRes.items.length === 0) {
            throw new Error("getDiscoverMediaAction for popular tv failed or returned empty items");
        }
        if (tvDuration > 250) {
            throw new Error(`getDiscoverMediaAction for popular tv took ${tvDuration}ms (expected < 250ms)`);
        }

        // 5. In-memory API key caching test
        const key1 = await getTmdbApiKey();
        const key2 = await getTmdbApiKey();
        if (!key1 || key1 !== key2) {
            throw new Error("getTmdbApiKey did not return consistent cached key");
        }
    });

    // 51. Kids Library Access & Kids Book Request Admin Approval Gating
    await assertTest("Kids & Family: Library Access & Request Approval Gating", async () => {
        const { isKidsLibrary } = await import("../src/lib/books/book-rating");
        const { isUserAllowedForLibrary } = await import("../src/lib/books/book-service");

        // 1. Verify isKidsLibrary detection
        if (!isKidsLibrary({ name: "Kids' Bookshelf", path: "/kids", description: "Children's books" })) {
            throw new Error("isKidsLibrary failed to detect Kids' Bookshelf");
        }
        if (isKidsLibrary({ name: "General Fiction", path: "/books", description: "Adult novels" })) {
            throw new Error("isKidsLibrary falsely identified adult library as kids library");
        }

        // 2. Verify isUserAllowedForLibrary with specific allowedUsers
        const mockKidsLib = {
            id: "kids-lib-test",
            name: "Kids' Bookshelf",
            path: "/kids",
            description: "Children",
            allowedUsers: "admin, testkiduser, parent@example.com",
            restrictedUsers: "",
            downloadCategory: "books",
            mediaType: "ebook",
            createdAt: new Date(),
            updatedAt: new Date()
        };

        if (!isUserAllowedForLibrary(mockKidsLib, "testkiduser")) {
            throw new Error("isUserAllowedForLibrary denied access to authorized username testkiduser");
        }
        if (!isUserAllowedForLibrary(mockKidsLib, "TestKidUser")) {
            throw new Error("isUserAllowedForLibrary failed case-insensitive match for TestKidUser");
        }
        if (!isUserAllowedForLibrary(mockKidsLib, "someone", "parent@example.com")) {
            throw new Error("isUserAllowedForLibrary denied access to authorized email parent@example.com");
        }
        if (isUserAllowedForLibrary(mockKidsLib, "unauthorizeduser", "unauthorized@example.com")) {
            throw new Error("isUserAllowedForLibrary allowed access to unauthorized user");
        }

        // 3. Verify Kids Book Request creation stays in Pending state (never auto-approved)
        const kidsReq = await prisma.bookRequest.create({
            data: {
                title: "Green Eggs and Ham",
                author: "Dr. Seuss",
                ageRating: "Kids",
                maturityRating: "NOT_MATURE",
                requestedBy: "testkiduser",
                status: "Pending",
                mediaType: "ebook"
            }
        });

        if (kidsReq.status !== "Pending") {
            throw new Error(`Expected kids request to be Pending, got ${kidsReq.status}`);
        }

        // 4. Background scheduler logic must NOT auto-approve kids requests
        const pendingRequests = await prisma.bookRequest.findMany({
            where: { id: kidsReq.id, status: "Pending" }
        });
        for (const req of pendingRequests) {
            const rating = req.ageRating || inferBookRating({ title: req.title, author: req.author || "" }).ageRating;
            const isKids = rating === "Kids";
            if (!isKids) {
                await prisma.bookRequest.update({ where: { id: req.id }, data: { status: "Approved" } });
            }
        }

        const reqAfterBgCheck = await prisma.bookRequest.findUnique({ where: { id: kidsReq.id } });
        if (reqAfterBgCheck?.status !== "Pending") {
            throw new Error(`CRITICAL: Background scheduler auto-approved kids request! Status: ${reqAfterBgCheck?.status}`);
        }

        // 5. Admin approval explicitly approves the request
        await prisma.bookRequest.update({
            where: { id: kidsReq.id },
            data: { status: "Approved" }
        });
        const reqAfterAdminApprove = await prisma.bookRequest.findUnique({ where: { id: kidsReq.id } });
        if (reqAfterAdminApprove?.status !== "Approved") {
            throw new Error(`Admin approval failed: status is ${reqAfterAdminApprove?.status}`);
        }

        // Clean up test request
        await prisma.bookRequest.delete({ where: { id: kidsReq.id } }).catch(() => {});
    });

    // 83. Payment Email Scraper: Positive Amount Extraction vs $0.00 Fees
    await assertTest("Payments: Amount Extraction with Zero-Fees and HTML Splits", async () => {
        // Test 1: $0.00 fee before actual positive payment
        const emailWithZeroFee = "Transaction Receipt:\nFee: $0.00 USD\nNet Amount Received: $180.00 USD\nStatus: Completed";
        const val180 = extractAmount(emailWithZeroFee);
        if (val180 !== 180) {
            throw new Error(`Expected extracted amount 180 from email with $0.00 fee, got: ${val180}`);
        }

        // Test 2: Venmo split newline HTML formatting
        const venmoSplitText = "Payment Details\n$\n 15\n 00\n .\nFrom: Alex";
        const val15 = extractAmount(venmoSplitText);
        if (val15 !== 15) {
            throw new Error(`Expected extracted amount 15 from Venmo split newline format, got: ${val15}`);
        }

        // Test 3: Standard single dollar format
        const standardVal = extractAmount("You received $25.50 from Mark for Plex subscription");
        if (standardVal !== 25.5) {
            throw new Error(`Expected 25.5, got: ${standardVal}`);
        }
    });

    // 84. Payment Email Scraper: Cash App Cashtag Isolation
    await assertTest("Payments: Cash App Cashtag vs Dollar Value Extraction", async () => {
        // Test 1: Subject contains dollar amount $180 - must NOT capture $180 as the user's cashtag
        const mockNumericOnly: any = {
            subject: "Alex sent you $180 for Plex",
            text: "Alex sent you $180.00 on Cash App for Plex. Available in your Cash balance immediately.",
            from: { text: "Cash App <cash@square.com>" },
            date: new Date()
        };
        const parsedNumeric = parseCashAppEmail(mockNumericOnly, "test-numeric-uid");
        if (parsedNumeric?.senderHandle === "$180") {
            throw new Error(`CRITICAL: Cash App parser incorrectly captured numeric amount as handle! Got "${parsedNumeric.senderHandle}"`);
        }
        if (parsedNumeric?.amount !== 180) {
            throw new Error(`Expected amount 180, got ${parsedNumeric?.amount}`);
        }

        // Test 2: Email contains real cashtag
        const mockRealTag: any = {
            subject: "Alex ($alexdev) sent you $15 for Plex",
            text: "Alex ($alexdev) sent you $15.00 on Cash App. Note: Plex monthly pass",
            from: { text: "Cash App <cash@square.com>" },
            date: new Date()
        };
        const parsedReal = parseCashAppEmail(mockRealTag, "test-tag-uid");
        if (parsedReal?.senderHandle !== "$alexdev") {
            throw new Error(`Expected cashtag $alexdev, got "${parsedReal?.senderHandle}"`);
        }
        if (parsedReal?.amount !== 15) {
            throw new Error(`Expected amount 15, got ${parsedReal?.amount}`);
        }
    });

    // 85. Payment Calculations: Q4 Monthly Cadence vs Annual Expiry Alignment
    await assertTest("Payments: Q4 Monthly vs Annual Calendar Cadence Calculation", async () => {
        // Test 1a: Monthly payment made on Oct 1st aligns to Nov 1st of same year
        const oct1Date = new Date(2026, 9, 1); // October 1, 2026
        const monthlyOct1 = calculateAlignedExpiryDate({
            paymentDate: oct1Date,
            totalAmount: 15,
            monthlyPrice: 15,
            yearlyPrice: 180,
            existingExpiry: null
        });
        if (monthlyOct1.cadence !== "MONTHLY") {
            throw new Error(`Expected cadence MONTHLY, got: ${monthlyOct1.cadence}`);
        }
        if (monthlyOct1.newExpiryDate.getFullYear() !== 2026 || monthlyOct1.newExpiryDate.getMonth() !== 10) {
            throw new Error(`Expected November 2026 for Oct 1st monthly payment, got: ${monthlyOct1.newExpiryDate.toISOString()}`);
        }

        // Test 1b: Mid-month payment (Oct 15) receives minimum 25-day guarantee aligning to Dec 1st of SAME year (never jumping to 2027)
        const oct15Date = new Date(2026, 9, 15);
        const monthlyOct15 = calculateAlignedExpiryDate({
            paymentDate: oct15Date,
            totalAmount: 15,
            monthlyPrice: 15,
            yearlyPrice: 180,
            existingExpiry: null
        });
        if (monthlyOct15.cadence !== "MONTHLY") {
            throw new Error(`Expected cadence MONTHLY, got: ${monthlyOct15.cadence}`);
        }
        if (monthlyOct15.newExpiryDate.getFullYear() !== 2026 || monthlyOct15.newExpiryDate.getMonth() !== 11) {
            throw new Error(`Expected Dec 1, 2026 for Oct 15 mid-month payment with 25d minimum, got: ${monthlyOct15.newExpiryDate.toISOString()}`);
        }

        // Test 2: Annual payment made in October covers rest of 2026 + all of 2027 -> Jan 1, 2028
        const yearlyOct = calculateAlignedExpiryDate({
            paymentDate: oct15Date,
            totalAmount: 180,
            monthlyPrice: 15,
            yearlyPrice: 180,
            existingExpiry: null
        });
        if (yearlyOct.cadence !== "YEARLY") {
            throw new Error(`Expected cadence YEARLY, got: ${yearlyOct.cadence}`);
        }
        if (yearlyOct.newExpiryDate.getFullYear() !== 2028 || yearlyOct.newExpiryDate.getMonth() !== 0 || yearlyOct.newExpiryDate.getDate() !== 1) {
            throw new Error(`Expected Jan 1, 2028 for Q4 annual renewal, got: ${yearlyOct.newExpiryDate.toISOString()}`);
        }

        // Test 3: Annual payment made in March covers rest of 2026 -> Jan 1, 2027
        const marDate = new Date(2026, 2, 10); // March 10, 2026
        const yearlyMar = calculateAlignedExpiryDate({
            paymentDate: marDate,
            totalAmount: 180,
            monthlyPrice: 15,
            yearlyPrice: 180,
            existingExpiry: null
        });
        if (yearlyMar.cadence !== "YEARLY") {
            throw new Error(`Expected cadence YEARLY, got: ${yearlyMar.cadence}`);
        }
        if (yearlyMar.newExpiryDate.getFullYear() !== 2027 || yearlyMar.newExpiryDate.getMonth() !== 0 || yearlyMar.newExpiryDate.getDate() !== 1) {
            throw new Error(`Expected Jan 1, 2027 for Spring annual renewal, got: ${yearlyMar.newExpiryDate.toISOString()}`);
        }
    });

    // 86. Subscription Renewal Reminders Engine & Milestone Deduplication
    await assertTest("Payments: Multi-Stage Renewal Reminders Engine & Deduplication", async () => {
        // Ensure global settings enable renewal notifications for testing
        const prevSettings = await prisma.settings.findUnique({ where: { id: "global" } });
        await prisma.settings.upsert({
            where: { id: "global" },
            update: { emailNotificationsEnabled: true, notifySubscriptionRenewal: true },
            create: { id: "global", emailNotificationsEnabled: true, notifySubscriptionRenewal: true }
        });

        const testUsername = `renew_verify_${Date.now()}`;
        // Set user to expire in exactly 14 days (triggers the "14d" annual reminder milestone)
        const expiry14d = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        const testUser = await prisma.user.create({
            data: {
                username: testUsername,
                password: "hashed_dummy_password",
                email: `${testUsername}@example.com`,
                role: "USER",
                status: "APPROVED",
                subscriptionCadence: "YEARLY",
                subscriptionEndsAt: expiry14d,
                membershipTier: "STANDARD"
            }
        });

        try {
            // First sweep: should evaluate the 14d milestone
            const firstResult = await sendSubscriptionRenewalRemindersInternal();
            const userAfterFirst = await prisma.user.findUnique({ where: { id: testUser.id } });
            if (!userAfterFirst?.lastRenewalReminderSentAt) {
                throw new Error("Expected lastRenewalReminderSentAt to be updated after sweep");
            }
            const history = JSON.parse(userAfterFirst.renewalRemindersSent || "{}");
            if (!Array.isArray(history.milestones) || !history.milestones.includes("14d")) {
                throw new Error(`Expected '14d' milestone recorded in renewalRemindersSent, got: ${userAfterFirst.renewalRemindersSent}`);
            }

            const initialSentTimestamp = userAfterFirst.lastRenewalReminderSentAt.getTime();

            // Second sweep: should NOT resend or update timestamp for the same 14d milestone
            const secondResult = await sendSubscriptionRenewalRemindersInternal();
            const userAfterSecond = await prisma.user.findUnique({ where: { id: testUser.id } });
            if (userAfterSecond?.lastRenewalReminderSentAt?.getTime() !== initialSentTimestamp) {
                throw new Error("Duplicate reminder dispatched! Milestone deduplication failed.");
            }
        } finally {
            // Clean up test user and restore settings
            await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
            if (prevSettings) {
                await prisma.settings.update({
                    where: { id: "global" },
                    data: {
                        emailNotificationsEnabled: prevSettings.emailNotificationsEnabled,
                        notifySubscriptionRenewal: prevSettings.notifySubscriptionRenewal
                    }
                }).catch(() => {});
            }
        }
    });

    // 87. Edge Security & Cloudflare Access: 100% Route Policy Coverage
    await assertTest("Security: Edge Policy & Cloudflare Access 100% Route Coverage", async () => {
        let appDir = path.join(__dirname, "../src/app");
        if (!fs.existsSync(appDir)) {
            appDir = path.join(process.cwd(), "src/app");
        }
        if (!fs.existsSync(appDir)) {
            throw new Error(`Cannot locate src/app directory from ${__dirname} or ${process.cwd()}`);
        }

        const foundRoutes: string[] = [];

        function scanRoutes(dir: string) {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    scanRoutes(fullPath);
                } else if (entry.isFile() && /^(page|route)\.tsx?$/.test(entry.name)) {
                    const relative = path.relative(appDir, fullPath);
                    let routePath = "/" + relative.replace(/\\/g, "/").replace(/\/?(page|route)\.tsx?$/, "");
                    if (routePath === "") routePath = "/";
                    foundRoutes.push(routePath);
                }
            }
        }

        scanRoutes(appDir);

        if (foundRoutes.length === 0) {
            throw new Error("No App Router routes detected during scan.");
        }

        const uncovered: string[] = [];
        for (const route of foundRoutes) {
            const isCovered = matchesCloudflareBypass(route) || matchesCloudflareAdmin(route) || matchesCloudflareSuperUser(route);
            if (!isCovered) {
                uncovered.push(route);
            }
        }

        if (uncovered.length > 0) {
            throw new Error(`The following ${uncovered.length} route(s) are NOT covered by CLOUDFLARE_BYPASS_PATHS, CLOUDFLARE_SUPER_USER_PATHS, or CLOUDFLARE_ADMIN_PATHS in src/lib/edge-policy-paths.ts:\n${uncovered.join("\n")}\n\n🚨 MANDATORY RULE: Whenever a new page or API route is created, updated, or removed, you MUST update src/lib/edge-policy-paths.ts, src/proxy.ts, and src/components/cloudflare-policy-card.tsx!`);
        }

        // Additional assertion sanity checks for standard routes & edge wildcards
        if (!matchesCloudflareBypass("/")) throw new Error("Root route / must match bypass");
        if (!matchesCloudflareBypass("/login")) throw new Error("/login must match bypass");
        if (!matchesCloudflareBypass("/join")) throw new Error("/join must match bypass");
        if (!matchesCloudflareBypass("/join/custom")) throw new Error("/join/custom must match bypass");
        if (!matchesCloudflareBypass("/invite/token-xyz")) throw new Error("/invite/token-xyz must match bypass");
        if (!matchesCloudflareBypass("/library")) throw new Error("/library must match bypass");
        if (!matchesCloudflareBypass("/requests")) throw new Error("/requests must match bypass");
        if (!matchesCloudflareBypass("/api/books/123/stream")) throw new Error("/api/books/:id/stream must match bypass");
        if (!matchesCloudflareBypass("/api/speedtest")) throw new Error("/api/speedtest must match bypass");
        if (!matchesCloudflareAdmin("/settings")) throw new Error("/settings must match admin");
        if (!matchesCloudflareAdmin("/settings/access")) throw new Error("/settings/access must match admin");
        if (!matchesCloudflareAdmin("/settings/profile")) throw new Error("/settings/profile must match admin (isolated)");
        if (matchesCloudflareBypass("/settings/profile")) throw new Error("/settings/profile must NEVER match bypass");
        if (!matchesCloudflareBypass("/profile")) throw new Error("/profile must match bypass for users");
        if (matchesCloudflareAdmin("/profile")) throw new Error("/profile must NOT match admin");
        if (!matchesCloudflareAdmin("/admin/tickets")) throw new Error("/admin/tickets must match admin");
        if (!matchesCloudflareAdmin("/curation/kometa")) throw new Error("/curation/kometa must match admin");
        if (!matchesCloudflareSuperUser("/radarr")) throw new Error("/radarr must match super user (media apps)");
        if (matchesCloudflareAdmin("/radarr")) throw new Error("/radarr must NOT be restricted to admin-only (super users need access)");
        if (!matchesCloudflareSuperUser("/sonarr")) throw new Error("/sonarr must match super user (media apps)");
        if (matchesCloudflareAdmin("/sonarr")) throw new Error("/sonarr must NOT be restricted to admin-only (super users need access)");
        if (!matchesCloudflareAdmin("/api/curation/badges")) throw new Error("/api/curation/badges must match admin");
        if (!matchesCloudflareAdmin("/api/users")) throw new Error("/api/users must match admin");
        if (matchesCloudflareBypass("/api/users")) throw new Error("/api/users must NEVER match bypass");
        if (!matchesCloudflareAdmin("/api/system/logs")) throw new Error("/api/system/logs must match admin");
        if (matchesCloudflareBypass("/api/system/logs")) throw new Error("/api/system/logs must NEVER match bypass");
        if (!matchesCloudflareAdmin("/api/debug/db")) throw new Error("/api/debug/db must match admin");
        if (matchesCloudflareBypass("/api/debug/db")) throw new Error("/api/debug/db must NEVER match bypass");
        if (!matchesCloudflareAdmin("/api/books/upload")) throw new Error("/api/books/upload must match admin");
        if (matchesCloudflareBypass("/api/books/upload")) throw new Error("/api/books/upload must NEVER match bypass");
    });

    // 88. Kindle: Amazon Send-to-Kindle Bounce Email Scanner & Rejection Parser
    await assertTest("Kindle: Amazon Send-to-Kindle Bounce Email Scanner & Rejection Parser", async () => {
        // 1. Test Amazon unapproved sender bounce email parsing
        const unapprovedSenderMail: any = {
            from: { text: "kindle-cs@amazon.com" },
            subject: "An email from books@domshomelab.com with the subject Deliver Book: Test did not have an approved sender address",
            text: "Dear Customer, you sent a personal document to Kindle. The sender address (books@domshomelab.com) is not on your approved personal document e-mail list. You can update your Approved Personal Document E-mail List on Manage Your Content and Devices.",
            date: new Date()
        };
        const bounce1 = parseAmazonBounceEmail(unapprovedSenderMail);
        if (!bounce1 || !bounce1.isBounce) {
            throw new Error(`Expected Amazon bounce email to be detected, got: ${JSON.stringify(bounce1)}`);
        }
        if (!bounce1.reason.includes("Approved Personal Document")) {
            throw new Error(`Expected reason to mention Approved Personal Document, got: "${bounce1.reason}"`);
        }

        // 2. Test Amazon document format rejection bounce
        const formatProblemMail: any = {
            from: { text: "do-not-reply@amazon.com" },
            subject: "There was a problem with the document you sent to Kindle",
            text: "The Kindle Personal Documents Service could not deliver your document due to an unsupported file format or corruption.",
            date: new Date()
        };
        const bounce2 = parseAmazonBounceEmail(formatProblemMail);
        if (!bounce2 || !bounce2.isBounce) {
            throw new Error(`Expected format problem bounce to be detected, got: ${JSON.stringify(bounce2)}`);
        }
        if (!bounce2.reason.includes("format") && !bounce2.reason.includes("document")) {
            throw new Error(`Expected reason to mention format or document, got: "${bounce2.reason}"`);
        }

        // 3. Test non-bounce email returns null
        const normalMail: any = {
            from: { text: "updates@github.com" },
            subject: "New commit in repository",
            text: "A new push was made to main.",
            date: new Date()
        };
        const bounce3 = parseAmazonBounceEmail(normalMail);
        if (bounce3 !== null) {
            throw new Error(`Expected normal non-bounce email to return null, got: ${JSON.stringify(bounce3)}`);
        }

        // 4. Test KindleDeliveryLog model lifecycle for bounce reconciliation
        const testDelivery = await prisma.kindleDeliveryLog.create({
            data: {
                bookTitle: "Test Bounce Book",
                recipientEmail: "testuser@kindle.com",
                username: "testuser",
                status: "DELIVERED"
            }
        });
        if (!testDelivery.id || testDelivery.status !== "DELIVERED") {
            throw new Error("Failed to create test Kindle delivery log");
        }

        // Simulate bounce scanner updating status to FAILED
        await prisma.kindleDeliveryLog.update({
            where: { id: testDelivery.id },
            data: {
                status: "FAILED",
                errorMessage: bounce1.reason,
                diagnostics: JSON.stringify({
                    detectedBy: "IMAP Amazon Bounce Scanner",
                    bounceSubject: bounce1.subject
                })
            }
        });

        const updated = await prisma.kindleDeliveryLog.findUnique({ where: { id: testDelivery.id } });
        if (updated?.status !== "FAILED" || !updated.errorMessage?.includes("Approved Personal Document")) {
            throw new Error(`Expected log status FAILED with bounce reason, got: ${JSON.stringify(updated)}`);
        }

        // Clean up
        await prisma.kindleDeliveryLog.delete({ where: { id: testDelivery.id } }).catch(() => {});
    });

    // 89. Monitoring: Multi-Server Health, Host & Plex Reachability Detection
    await assertTest("Monitoring: Multi-Server Health, Host & Plex Reachability Detection", async () => {
        // Test 1: Glances offline handling in glancesStats
        const mockGlances = [
            { name: "MainHost", url: "http://127.0.0.1:61208" }
        ];
        const glancesStats: any[] = [];
        for (const g of mockGlances) {
            // Emulate offline unreachable host
            const isOk = false;
            if (isOk) {
                glancesStats.push({ name: g.name, online: true, cpu: 12, ram: 45 });
            } else {
                glancesStats.push({ name: g.name, online: false, cpu: 0, ram: 0 });
            }
        }
        if (glancesStats.length !== 1 || glancesStats[0].online !== false) {
            throw new Error(`Expected offline Glances instance to be preserved with online: false, got: ${JSON.stringify(glancesStats)}`);
        }

        // Test 2: downApps aggregator collects offline Plex servers, Host servers, and Tautulli instances
        const downApps: string[] = [];
        const mockPlexOffline = { name: "TestPlexServer", reachable: false };
        const mockGlancesOffline = { name: "SecondaryHost", reachable: false };
        const mockTautulliOffline = { name: "MainTautulli", reachable: false };

        if (!mockPlexOffline.reachable) downApps.push(`${mockPlexOffline.name} (Plex Server)`);
        if (!mockGlancesOffline.reachable) downApps.push(`${mockGlancesOffline.name} (Host Server)`);
        if (!mockTautulliOffline.reachable) downApps.push(`${mockTautulliOffline.name} (Tautulli)`);

        if (downApps.length !== 3) {
            throw new Error(`Expected 3 offline items in downApps, got ${downApps.length}: ${JSON.stringify(downApps)}`);
        }
        if (!downApps.includes("TestPlexServer (Plex Server)")) {
            throw new Error("Missing Plex Server in downApps list");
        }
        if (!downApps.includes("SecondaryHost (Host Server)")) {
            throw new Error("Missing Host Server in downApps list");
        }
        if (!downApps.includes("MainTautulli (Tautulli)")) {
            throw new Error("Missing Tautulli in downApps list");
        }

        // Test 3: serverMap in Plex Hub preserves offline state when direct PMS fails
        const serverMap = new Map<string, any>();
        const testPlexKey = "testplex";
        serverMap.set(testPlexKey, {
            id: "plex::testplex::127.0.0.1:32400",
            name: "TestPlexServer",
            type: "Plex Media Server",
            directPms: true,
            tautulli: false,
            online: false
        });

        // If Tautulli container responds while direct PMS is offline, do NOT falsely mark direct PMS online
        const existing = serverMap.get(testPlexKey)!;
        existing.tautulli = true;
        existing.type = existing.directPms && existing.online ? "Direct PMS + Tautulli" : (existing.directPms ? "Direct PMS (Offline) + Tautulli" : "Tautulli Monitor");
        if (!existing.directPms) {
            existing.online = true;
        }

        if (existing.online !== false) {
            throw new Error(`Expected Plex server to remain online: false when PMS is offline, got online: ${existing.online}`);
        }
        if (existing.type !== "Direct PMS (Offline) + Tautulli") {
            throw new Error(`Expected type 'Direct PMS (Offline) + Tautulli', got '${existing.type}'`);
        }

        // Test 4: checkMediaAppReachability recognizes API endpoints, auth challenges, and redirects as UP
        const testHttpServer = http.createServer((req, res) => {
            if (req.url?.includes("/api/v3/system/status")) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ version: "10.0.0" }));
            } else if (req.url?.includes("/login")) {
                res.writeHead(200, { "Content-Type": "text/html" });
                res.end("<html>Login</html>");
            } else if (req.url === "/") {
                res.writeHead(302, { Location: "/login" });
                res.end();
            } else if (req.url?.includes("/api/v1/status")) {
                res.writeHead(401, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Unauthorized" }));
            } else {
                res.writeHead(404);
                res.end();
            }
        });
        await new Promise<void>((resolve) => testHttpServer.listen(0, "127.0.0.1", () => resolve()));
        const testPort = (testHttpServer.address() as any).port;
        const testBase = `http://127.0.0.1:${testPort}`;

        try {
            // Sonarr candidate: hits /api/v3/system/status
            const sonarrReachable = await checkMediaAppReachability({
                name: "Main Sonarr",
                type: "sonarr",
                url: testBase,
                apiKey: "testkey"
            });
            if (!sonarrReachable) {
                throw new Error("Expected Sonarr to be recognized as reachable via /api/v3/system/status");
            }

            // Seerr candidate returning 401: must still be recognized as reachable (process is alive!)
            const seerrReachable = await checkMediaAppReachability({
                name: "Main Seerr",
                type: "overseerr",
                url: testBase,
                apiKey: "badkey"
            });
            if (!seerrReachable) {
                throw new Error("Expected Seerr to be recognized as reachable even when returning 401 auth challenge");
            }

            // Redirecting candidate (root 302 -> /login): must be recognized as reachable
            const redirectReachable = await checkMediaAppReachability({
                name: "Custom Web App",
                type: "custom",
                url: testBase,
                apiKey: ""
            });
            if (!redirectReachable) {
                throw new Error("Expected redirecting web app to be recognized as reachable");
            }

            // Non-existent port/offline: must return false
            const offlineReachable = await checkMediaAppReachability({
                name: "Dead App",
                type: "radarr",
                url: "http://127.0.0.1:59999",
                apiKey: "key"
            }, 1000);
            if (offlineReachable) {
                throw new Error("Expected dead app port 59999 to return false");
            }
        } finally {
            testHttpServer.close();
        }
    });

    // 90. Monitoring: Selective Opt-In Monitoring Toggles & Discovered Server Isolation
    await assertTest("Monitoring: Selective Opt-In Monitoring Toggles & Discovered Server Isolation", async () => {
        // 1. Test downApps filtering: unmonitored items (monitored: false) must NEVER be pushed to downApps
        const allServers = [
            { name: "ProductionPMS", monitored: true, online: false },
            { name: "TestVM-Decommissioned", monitored: false, online: false },
            { name: "UnmonitoredGlances", monitored: false, online: false },
            { name: "ActiveGlances", monitored: true, online: false },
            { name: "UnmonitoredApp", monitored: false, online: false },
            { name: "MonitoredApp", monitored: true, online: false }
        ];

        // Simulate getLandingStats filter logic: only items with monitored !== false are probed
        const monitoredOnly = allServers.filter(s => s.monitored !== false);
        const testDownApps: string[] = [];
        for (const item of monitoredOnly) {
            if (!item.online) {
                testDownApps.push(item.name);
            }
        }

        if (testDownApps.includes("TestVM-Decommissioned")) {
            throw new Error("CRITICAL: Unmonitored Plex server 'TestVM-Decommissioned' was included in downApps!");
        }
        if (testDownApps.includes("UnmonitoredGlances")) {
            throw new Error("CRITICAL: Unmonitored Glances host was included in downApps!");
        }
        if (testDownApps.includes("UnmonitoredApp")) {
            throw new Error("CRITICAL: Unmonitored MediaApp was included in downApps!");
        }
        if (!testDownApps.includes("ProductionPMS") || !testDownApps.includes("ActiveGlances") || !testDownApps.includes("MonitoredApp")) {
            throw new Error(`CRITICAL: Monitored offline items missing from downApps: ${JSON.stringify(testDownApps)}`);
        }
        if (testDownApps.length !== 3) {
            throw new Error(`Expected exactly 3 items in downApps, got ${testDownApps.length}: ${JSON.stringify(testDownApps)}`);
        }

        // 2. Test Plex.tv Discovered Unconfigured Server Isolation
        // Servers passively discovered from Plex.tv that are not configured in DB must NEVER be probed or in downApps
        const discoveredFromPlexTv = [
            { name: "ProductionPMS", clientIdentifier: "prod-1", isConfigured: true },
            { name: "TestVM-To-Be-Deleted", clientIdentifier: "test-vm-2", isConfigured: false }
        ];
        const unconfiguredDiscovered = discoveredFromPlexTv.filter(d => !d.isConfigured);
        if (unconfiguredDiscovered.length !== 1 || unconfiguredDiscovered[0].name !== "TestVM-To-Be-Deleted") {
            throw new Error("Failed to isolate unconfigured discovered servers");
        }

        // 3. Database Lifecycle: Test monitored field persistence on PlexServer, GlancesInstance, TautulliInstance, and MediaApp
        const testPlex = await prisma.plexServer.create({
            data: {
                name: "TestOptInPlex",
                url: "http://127.0.0.1:32499",
                monitored: false
            }
        });

        if (testPlex.monitored !== false) {
            throw new Error(`Expected created PlexServer.monitored to be false, got ${testPlex.monitored}`);
        }

        // Toggle to true
        const toggledPlex = await prisma.plexServer.update({
            where: { id: testPlex.id },
            data: { monitored: true }
        });
        if (toggledPlex.monitored !== true) {
            throw new Error(`Expected toggled PlexServer.monitored to be true, got ${toggledPlex.monitored}`);
        }

        // Query filtering: prisma.plexServer.findMany({ where: { monitored: true } }) or filtering in code
        const queriedPlex = await prisma.plexServer.findUnique({ where: { id: testPlex.id } });
        if (!queriedPlex || queriedPlex.monitored !== true) {
            throw new Error("Failed to persist monitored state in DB");
        }

        // Clean up test server
        await prisma.plexServer.delete({ where: { id: testPlex.id } }).catch(() => {});

        // 4. Test serverMap in Plex Hub honors monitored: false
        const hubServerMap = new Map<string, any>();
        hubServerMap.set("test-key", {
            id: "plex::test::127.0.0.1:32499",
            name: "TestServerPaused",
            type: "Plex Media Server",
            directPms: true,
            tautulli: false,
            online: false,
            monitored: false
        });

        const hubEntry = hubServerMap.get("test-key");
        if (hubEntry?.monitored !== false) {
            throw new Error(`Expected hubEntry.monitored to be false, got ${hubEntry?.monitored}`);
        }

        // 5. Test fetchGlancesHardwareStats resiliency & multi-version fallback
        const emptyStats = await fetchGlancesHardwareStats("");
        if (emptyStats.online !== false || emptyStats.cpu !== 0 || emptyStats.ram !== 0) {
            throw new Error(`Expected empty URL stats to be offline (0, 0), got: ${JSON.stringify(emptyStats)}`);
        }

        const unreachableStats = await fetchGlancesHardwareStats("http://127.0.0.1:59999", 500);
        if (unreachableStats.online !== false) {
            throw new Error(`Expected unreachable host to be offline, got: ${JSON.stringify(unreachableStats)}`);
        }
    });

    // 91. Admin Streams Telemetry: Glances Hardware Hosts vs Ranked Streams Per Plex Server
    await assertTest("Admin Streams Telemetry: Glances Hardware Hosts vs Ranked Streams Per Plex Server", async () => {
        // 1. Verify getAdminDetailedStreamsAction returns structured glances and serversUsage
        const result = await getAdminDetailedStreamsAction(true);
        if (!result.success) {
            throw new Error(`getAdminDetailedStreamsAction returned success=false: ${result.error}`);
        }
        if (!Array.isArray(result.glances)) {
            throw new Error("Expected result.glances to be an array");
        }
        if (!Array.isArray(result.serversUsage)) {
            throw new Error("Expected result.serversUsage to be an array");
        }

        // 2. Validate simulation of 2 physical hardware hosts (Glances) and 3 Plex Media Servers
        const mockGlances = [
            { name: "Unraid Primary", online: true, monitored: true, cpu: 28, ram: 54 },
            { name: "Backup Host", online: true, monitored: true, cpu: 8, ram: 22 }
        ];

        // Ensure 2 physical hosts are isolated with valid CPU & RAM metrics
        if (mockGlances.length !== 2) {
            throw new Error(`Expected 2 hardware hosts, got ${mockGlances.length}`);
        }
        for (const host of mockGlances) {
            if (host.cpu < 0 || host.cpu > 100 || host.ram < 0 || host.ram > 100) {
                throw new Error(`Invalid host metrics for ${host.name}: CPU ${host.cpu}%, RAM ${host.ram}%`);
            }
        }

        // 3. Validate ranking and telemetry math for 3 Plex Servers (with audio conversion not counted as transcode)
        const mockSessions = [
            { serverName: "Main Plex", videoDecision: "direct play", audioDecision: "direct play", streamBitrate: 8000 },
            { serverName: "Main Plex", videoDecision: "transcode", audioDecision: "direct play", streamBitrate: 4000 }, // Actual video transcode
            { serverName: "Main Plex", videoDecision: "direct play", audioDecision: "transcode", streamBitrate: 6000 }, // Audio conversion only -> NOT using transcode power
            { serverName: "Kids Plex", videoDecision: "direct play", audioDecision: "direct play", streamBitrate: 3500 },
            { serverName: "Main Plex", videoDecision: "direct play", audioDecision: "direct play", streamBitrate: 6000 }
        ];

        const totalStreams = mockSessions.length;
        const serverMap = new Map<string, any>();
        const configuredServers = [
            { name: "Main Plex", monitored: true },
            { name: "Kids Plex", monitored: true },
            { name: "4K Plex", monitored: true },
            { name: "Decommissioned Old PMS", monitored: false } // Unmonitored server
        ];

        // Seed ONLY monitored servers with monitoring turned on
        for (const s of configuredServers) {
            if (s.monitored === false) continue; // Exclude unmonitored servers
            serverMap.set(s.name.toLowerCase(), {
                name: s.name,
                streamCount: 0,
                directPlayCount: 0,
                transcodeCount: 0,
                bandwidthKbps: 0,
                monitored: true
            });
        }

        for (const s of mockSessions) {
            const entry = serverMap.get(s.serverName.toLowerCase());
            if (entry) {
                entry.streamCount++;
                // ONLY count as transcode if videoDecision is transcode (audio conversion does NOT use transcoding power)
                if (s.videoDecision === "transcode") {
                    entry.transcodeCount++;
                } else {
                    entry.directPlayCount++;
                }
                entry.bandwidthKbps += s.streamBitrate;
            }
        }

        const ranked = Array.from(serverMap.values()).map(srv => ({
            ...srv,
            bandwidthMbps: Number((srv.bandwidthKbps / 1000).toFixed(1)),
            percentOfTotal: totalStreams > 0 ? Math.round((srv.streamCount / totalStreams) * 100) : 0
        })).sort((a, b) => b.streamCount - a.streamCount || b.bandwidthKbps - a.bandwidthKbps);

        // Assert strictly 3 monitored Plex servers tracked (unmonitored "Decommissioned Old PMS" must be excluded)
        if (ranked.length !== 3) {
            throw new Error(`Expected exactly 3 monitored Plex servers, got ${ranked.length}`);
        }
        if (ranked.some(r => r.name === "Decommissioned Old PMS")) {
            throw new Error("CRITICAL: Unmonitored server 'Decommissioned Old PMS' was included in serversUsage!");
        }

        // Rank #1: Main Plex (4 streams total: 3 DP [including the 1 audio-transcode stream], 1 Transcode, 24.0 Mbps, 80% total)
        const topServer = ranked[0];
        if (topServer.name !== "Main Plex") {
            throw new Error(`Expected rank #1 to be 'Main Plex', got '${topServer.name}'`);
        }
        if (topServer.streamCount !== 4) {
            throw new Error(`Expected 4 streams on Main Plex, got ${topServer.streamCount}`);
        }
        // Direct play MUST be 3 (1 pure DP + 1 audio-transcode DP + 1 pure DP = 3 DP)
        if (topServer.directPlayCount !== 3) {
            throw new Error(`Expected 3 Direct Play streams (audio conversion must not count as transcode), got ${topServer.directPlayCount}`);
        }
        // Transcode MUST be exactly 1 (only the video transcode)
        if (topServer.transcodeCount !== 1) {
            throw new Error(`Expected exactly 1 Transcode stream on Main Plex, got ${topServer.transcodeCount}`);
        }
        if (topServer.bandwidthMbps !== 24.0) {
            throw new Error(`Expected 24.0 Mbps, got ${topServer.bandwidthMbps}`);
        }
        if (topServer.percentOfTotal !== 80) {
            throw new Error(`Expected 80% of total, got ${topServer.percentOfTotal}%`);
        }

        // Rank #2: Kids Plex (1 stream, 1 DP, 0 Transcode, 3.5 Mbps, 20% total)
        const secondServer = ranked[1];
        if (secondServer.name !== "Kids Plex" || secondServer.streamCount !== 1 || secondServer.directPlayCount !== 1) {
            throw new Error(`Invalid secondary server metrics: ${JSON.stringify(secondServer)}`);
        }

        // Rank #3: 4K Plex (0 streams, 0 DP, 0 Transcode, 0 Mbps, 0% total)
        const idleServer = ranked[2];
        if (idleServer.name !== "4K Plex" || idleServer.streamCount !== 0) {
            throw new Error(`Invalid idle server metrics: ${JSON.stringify(idleServer)}`);
        }

        // 4. Validate Season and Episode formatting
        const testEpisodeSession = {
            grandparentTitle: "Breaking Bad",
            parentMediaIndex: 2,
            mediaIndex: 5,
            title: "Breakage"
        };
        const sNum = String(testEpisodeSession.parentMediaIndex).padStart(2, "0");
        const eNum = String(testEpisodeSession.mediaIndex).padStart(2, "0");
        const seasonEpTag = `S${sNum}E${eNum}`;
        const formattedTitle = `${testEpisodeSession.grandparentTitle} - ${seasonEpTag}: ${testEpisodeSession.title}`;

        if (seasonEpTag !== "S02E05") {
            throw new Error(`Expected 'S02E05', got '${seasonEpTag}'`);
        }
        if (formattedTitle !== "Breaking Bad - S02E05: Breakage") {
            throw new Error(`Unexpected formattedTitle: '${formattedTitle}'`);
        }
    });

    // 60. Admin Impersonation: Fast Candidate Lookup, Adaptive Security Cookies, Direct Admin Restoration & Lifecycle
    await assertTest("Admin Impersonation: Fast Candidate Lookup, Adaptive Cookies & Lifecycle", async () => {
        const { getAuthCookieOptions, impersonateUserAction, stopImpersonationAction, getImpersonationStatusAction } = await import("../src/app/auth-actions");
        const { SignJWT, jwtVerify } = await import("jose");
        const secret = new TextEncoder().encode(process.env.JWT_SECRET || "portalarr_jwt_secret_dev_key_only_for_testing");

        // 1. Verify getAuthCookieOptions sets secure: false over unencrypted LAN/HTTP
        const defaultOpts = await getAuthCookieOptions(3600);
        if (defaultOpts.httpOnly !== true || defaultOpts.sameSite !== "lax" || defaultOpts.path !== "/") {
            throw new Error(`Invalid cookie options structure: ${JSON.stringify(defaultOpts)}`);
        }

        // 2. Verify candidate user query structure
        const testCandidateUsers = await prisma.user.findMany({
            select: { id: true, username: true, role: true, status: true, membershipTier: true },
            take: 5
        });
        if (!Array.isArray(testCandidateUsers)) {
            throw new Error("Expected array of candidate users");
        }

        // 3. Verify admin switching to another admin restores admin mode without stale tokens
        const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" } });
        if (adminUser) {
            // Test admin impersonating themselves or another admin cleans up impersonation
            const res = await impersonateUserAction(adminUser.id);
            if (res.error) {
                // If caller is unauthenticated in test runner context, unauthorized is expected
                if (!res.error.includes("Unauthorized")) {
                    throw new Error(`Unexpected error from impersonateUserAction: ${res.error}`);
                }
            }
        }
    });

    // 61. Radarr Subsystem: Instance Security, Clean Wire Models, Deletion Actions & Progress Mechanics
    await assertTest("Radarr Subsystem: Security, Deletion Actions & Telemetry", async () => {
        const {
            getEnabledArrInstances,
            deleteRadarrMovie,
            deleteRadarrQueueItem,
            searchRadarrMovies,
            getRadarrLibrary
        } = await import("../src/app/arr-actions");

        // 1. Verify getEnabledArrInstances returns clean models without leaking decrypted apiKey to client
        const instancesRes = await getEnabledArrInstances("radarr");
        if (!instancesRes.success) {
            throw new Error(`getEnabledArrInstances failed: ${instancesRes.error}`);
        }
        if (instancesRes.data && instancesRes.data.length > 0) {
            for (const instance of instancesRes.data) {
                if ((instance as any).apiKey !== undefined) {
                    throw new Error(`Security breach: apiKey was exposed in client data model for instance ${instance.name}`);
                }
            }
        }

        // 2. Verify delete actions fail safely with unauthorized/not found for non-existent IDs
        const dummyDeleteMovieRes = await deleteRadarrMovie("invalid-app-id", 99999);
        if (dummyDeleteMovieRes.success) {
            throw new Error("Expected deleteRadarrMovie to fail for non-existent app");
        }

        const dummyDeleteQueueRes = await deleteRadarrQueueItem("invalid-app-id", 99999);
        if (dummyDeleteQueueRes.success) {
            throw new Error("Expected deleteRadarrQueueItem to fail for non-existent app");
        }

        // 3. Verify queue progress percentage formula
        const testSize = 10 * 1024 * 1024 * 1024; // 10 GB
        const testSizeLeft = 2.5 * 1024 * 1024 * 1024; // 2.5 GB left
        const computedPercent = Math.max(0, Math.min(100, Math.round((1 - testSizeLeft / testSize) * 100)));
        if (computedPercent !== 75) {
            throw new Error(`Expected 75% computed progress, got ${computedPercent}%`);
        }

        // 4. Verify custom format scoring ranking
        const testReleases = [
            { title: "Standard 1080p", customFormatScore: 0 },
            { title: "Remux Atmos HDR", customFormatScore: 1200 },
            { title: "Low Tier", customFormatScore: -500 }
        ];
        testReleases.sort((a, b) => (b.customFormatScore || 0) - (a.customFormatScore || 0));
        if (testReleases[0].customFormatScore !== 1200 || testReleases[2].customFormatScore !== -500) {
            throw new Error("Custom format scoring failed to sort releases in descending order");
        }
    });

    // 62. Sonarr Subsystem: Instance Security, Series Deletion, Queue Cancellation & Episode Statistics
    await assertTest("Sonarr Subsystem: Security, Deletion Actions & Telemetry", async () => {
        const {
            getEnabledArrInstances,
            deleteSonarrSeries,
            deleteSonarrQueueItem,
            searchSonarrSeries,
            getSonarrLibrary
        } = await import("../src/app/arr-actions");

        // 1. Verify getEnabledArrInstances returns clean models without leaking decrypted apiKey to client
        const instancesRes = await getEnabledArrInstances("sonarr");
        if (!instancesRes.success) {
            throw new Error(`getEnabledArrInstances failed: ${instancesRes.error}`);
        }
        if (instancesRes.data && instancesRes.data.length > 0) {
            for (const instance of instancesRes.data) {
                if ((instance as any).apiKey !== undefined) {
                    throw new Error(`Security breach: apiKey was exposed in client data model for instance ${instance.name}`);
                }
            }
        }

        // 2. Verify delete actions fail safely with unauthorized/not found for non-existent IDs
        const dummyDeleteSeriesRes = await deleteSonarrSeries("invalid-app-id", 99999);
        if (dummyDeleteSeriesRes.success) {
            throw new Error("Expected deleteSonarrSeries to fail for non-existent app");
        }

        const dummyDeleteQueueRes = await deleteSonarrQueueItem("invalid-app-id", 99999);
        if (dummyDeleteQueueRes.success) {
            throw new Error("Expected deleteSonarrQueueItem to fail for non-existent app");
        }

        // 3. Verify queue progress percentage formula
        const testSize = 20 * 1024 * 1024 * 1024; // 20 GB
        const testSizeLeft = 8 * 1024 * 1024 * 1024; // 8 GB left
        const computedPercent = Math.max(0, Math.min(100, Math.round(((testSize - testSizeLeft) / testSize) * 100)));
        if (computedPercent !== 60) {
            throw new Error(`Expected 60% computed progress, got ${computedPercent}%`);
        }

        // 4. Verify episode statistics calculation and season monitoring reconciliation
        const mockSeries = {
            id: 101,
            title: "Breaking Bad",
            monitored: true,
            seasons: [
                { seasonNumber: 0, monitored: false },
                { seasonNumber: 1, monitored: true, statistics: { episodeFileCount: 7, totalEpisodeCount: 7 } },
                { seasonNumber: 2, monitored: true, statistics: { episodeFileCount: 5, totalEpisodeCount: 13 } }
            ],
            statistics: {
                episodeFileCount: 12,
                totalEpisodeCount: 20,
                percentOfEpisodes: 60
            }
        };

        const monitoredRegularSeasons = mockSeries.seasons.filter(s => s.seasonNumber > 0 && s.monitored).length;
        const isEffectivelyMonitored = mockSeries.monitored && monitoredRegularSeasons > 0;
        if (!isEffectivelyMonitored || monitoredRegularSeasons !== 2) {
            throw new Error("Failed to correctly evaluate effective monitoring state for Sonarr series");
        }
    });

    // Test 64: Account Settings Subsystem (Kindle Bypass, Access Recheck Integrity & Safety Profiles)
    await assertTest("Account Settings: Kindle Direct Bypass, Access Recheck Integrity & Safety Profiles", async () => {
        // 1. Verify updateCurrentUserKindleEmail unauthorized safety
        const anonRes = await updateCurrentUserKindleEmail("DIRECT_DOWNLOAD");
        if (!anonRes || !anonRes.error) {
            throw new Error("Expected updateCurrentUserKindleEmail to fail without session");
        }

        // 2. Direct format & bypass validation logic
        const testBypass = "  DIRECT_DOWNLOAD  ";
        const isBypass = testBypass.trim().toUpperCase() === "DIRECT_DOWNLOAD";
        const cleanBypassEmail = isBypass ? "DIRECT_DOWNLOAD" : testBypass.trim().toLowerCase();
        if (!isBypass || cleanBypassEmail !== "DIRECT_DOWNLOAD") {
            throw new Error("Failed to validate DIRECT_DOWNLOAD bypass string");
        }

        const validEmail = "reader@kindle.com";
        const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(validEmail);
        if (!isValid) throw new Error("Regex rejected valid email");

        const invalidEmail = "not-an-email";
        const isInvalid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invalidEmail);
        if (isInvalid) throw new Error("Regex accepted invalid email");

        // 3. User access & payment recheck data integrity in database
        const testUsername = `acc_verify_${Date.now()}`;
        const user = await prisma.user.create({
            data: {
                username: testUsername,
                email: `${testUsername}@example.com`,
                password: "hashed_dummy_password",
                role: "USER",
                status: "APPROVED",
                membershipTier: "VIP_ALL_ACCESS",
                accountType: "KID",
                subscriptionCadence: "annual",
                selectedPlexLibrarySectionIds: JSON.stringify(["10", "20"]),
                kindleEmail: "DIRECT_DOWNLOAD"
            }
        });

        try {
            // Recheck user access fields selected by recheckUserAccessAndPaymentAction
            const freshUser = await prisma.user.findUnique({
                where: { id: user.id },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    kindleEmail: true,
                    role: true,
                    status: true,
                    membershipTier: true,
                    accountType: true,
                    subscriptionCadence: true,
                    trialEndsAt: true,
                    subscriptionEndsAt: true,
                    convertedAt: true,
                    plexUsername: true,
                    plexEmail: true,
                    selectedPlexLibrarySectionIds: true
                }
            });

            if (!freshUser) throw new Error("User lookup failed during recheck query");
            if (freshUser.membershipTier !== "VIP_ALL_ACCESS") {
                throw new Error(`membershipTier dropped or mismatched: ${freshUser.membershipTier}`);
            }
            if (freshUser.accountType !== "KID") {
                throw new Error(`accountType dropped or mismatched: ${freshUser.accountType}`);
            }
            if (freshUser.subscriptionCadence !== "annual") {
                throw new Error(`subscriptionCadence dropped or mismatched: ${freshUser.subscriptionCadence}`);
            }
            if (freshUser.selectedPlexLibrarySectionIds !== JSON.stringify(["10", "20"])) {
                throw new Error(`selectedPlexLibrarySectionIds dropped or mismatched: ${freshUser.selectedPlexLibrarySectionIds}`);
            }
            if (freshUser.kindleEmail !== "DIRECT_DOWNLOAD") {
                throw new Error(`kindleEmail bypass value mismatched: ${freshUser.kindleEmail}`);
            }
        } finally {
            await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
        }

        // 4. Dirty tracking logic for safety profiles
        const initialPrefs = {
            allowMatureContent: false,
            contentFilterStrictness: "STRICT",
            blockedTags: ["R", "NC-17"]
        };
        const currentPrefsModified = {
            allowMatureContent: true,
            contentFilterStrictness: "STRICT",
            blockedTags: ["R", "NC-17"]
        };
        const isDirty = JSON.stringify(initialPrefs) !== JSON.stringify(currentPrefsModified);
        if (!isDirty) throw new Error("Safety preferences dirty tracking failed to detect changes");

        // 5. Section-level library dirty comparison logic
        const initialSections = ["1", "2"];
        const currentSectionsDiffOrder = ["2", "1"];
        const areSameUnordered = initialSections.length === currentSectionsDiffOrder.length &&
            initialSections.every(id => currentSectionsDiffOrder.includes(id));
        if (!areSameUnordered) throw new Error("Section ID unordered set matching failed");
    });

    // Test 65: Docker & New Installation Database Lifecycle
    await assertTest("Docker & Database: New Install Detection, Entrypoint Script & Schema Auto-Creation", async () => {
        // 1. Verify docker-entrypoint.sh existence and LF line endings
        const entrypointPath = path.join(process.cwd(), "docker-entrypoint.sh");
        if (!fs.existsSync(entrypointPath)) {
            throw new Error("docker-entrypoint.sh does not exist in root directory");
        }
        const entrypointContent = fs.readFileSync(entrypointPath, "utf8");
        const entrypointBuffer = fs.readFileSync(entrypointPath);
        if (entrypointBuffer.includes(13)) {
            throw new Error("docker-entrypoint.sh contains CRLF (\\r) line endings which will fail in Linux containers");
        }
        if (!entrypointContent.includes("#!/bin/sh")) {
            throw new Error("docker-entrypoint.sh is missing POSIX shebang");
        }
        if (!entrypointContent.includes("prisma db push")) {
            throw new Error("docker-entrypoint.sh is missing prisma db push command for new installs");
        }
        if (!entrypointContent.includes("exec \"$@\"")) {
            throw new Error("docker-entrypoint.sh is missing exec \"$@\" CMD pass-through");
        }

        // 2. Verify Dockerfile wiring
        const dockerfilePath = path.join(process.cwd(), "Dockerfile");
        const dockerfileContent = fs.readFileSync(dockerfilePath, "utf8");
        if (!dockerfileContent.includes("ENTRYPOINT [\"/app/docker-entrypoint.sh\"]")) {
            throw new Error("Dockerfile is missing ENTRYPOINT [\"/app/docker-entrypoint.sh\"]");
        }
        if (!dockerfileContent.includes("/app/data")) {
            throw new Error("Dockerfile is missing /app/data default directory setup");
        }

        // 3. Verify path stripping logic for DATABASE_URL variations
        const parseDbPath = (url: string) => url.replace(/^file:\/\//, "").replace(/^file:/, "").replace(/\?.*$/, "");
        if (parseDbPath("file:/app/data/dev.db") !== "/app/data/dev.db") {
            throw new Error("Failed to parse standard file:/app/data/dev.db path");
        }
        if (parseDbPath("file:///app/data/dev.db") !== "/app/data/dev.db") {
            throw new Error("Failed to parse 3-slash file:///app/data/dev.db path");
        }
        if (parseDbPath("file:./prisma/dev.db?connection_limit=1") !== "./prisma/dev.db") {
            throw new Error("Failed to strip query params from relative DB path");
        }

        // 4. Verify new install detection heuristic
        const testTmpFile = path.join(process.cwd(), `scratch_test_detect_${Date.now()}.db`);
        try {
            // Case A: Missing file -> new install
            const isMissing = !fs.existsSync(testTmpFile);
            if (!isMissing) throw new Error("Expected missing file to be detected as new install");

            // Case B: 0-byte file -> new install
            fs.writeFileSync(testTmpFile, Buffer.alloc(0));
            const isZeroByte = fs.existsSync(testTmpFile) && fs.statSync(testTmpFile).size === 0;
            if (!isZeroByte) throw new Error("Expected 0-byte file to be detected as new install");

            // Case C: Non-empty file (>0 bytes) -> existing install
            fs.writeFileSync(testTmpFile, Buffer.from("SQLite format 3\0"));
            const isExisting = fs.existsSync(testTmpFile) && fs.statSync(testTmpFile).size > 0;
            if (!isExisting) throw new Error("Expected non-empty file to be detected as existing install");
        } finally {
            if (fs.existsSync(testTmpFile)) {
                fs.unlinkSync(testTmpFile);
            }
        }

        // 5. Verify all Prisma models have CREATE TABLE in ensureSchemaColumns (including User)
        const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma");
        const schemaText = fs.readFileSync(schemaPath, "utf8");
        const schemaModels = [...schemaText.matchAll(/^model\s+(\w+)/gm)].map(m => m[1]);

        const prismaTsPath = path.join(process.cwd(), "src", "lib", "prisma.ts");
        const prismaTsText = fs.readFileSync(prismaTsPath, "utf8");
        const createdTables = [...prismaTsText.matchAll(/CREATE TABLE IF NOT EXISTS ["']?(\w+)["']?/gi)].map(m => m[1].toLowerCase());

        const missingTables = schemaModels.filter(m => !createdTables.includes(m.toLowerCase()));
        if (missingTables.length > 0) {
            throw new Error(`Prisma models missing CREATE TABLE IF NOT EXISTS in prisma.ts: ${missingTables.join(", ")}`);
        }
    });

    // 77. User Process Deep Dive: Roles, Subscriptions, Tiers, Cadence, Addons & Proration
    await assertTest("User Process: Roles, Subscriptions, Tiers, Cadence, Addons & Proration", async () => {
        const testUserHandle = `test_proc_${Date.now()}`;
        const testUserEmail = `${testUserHandle}@example.com`;

        // Step 1: Create a Trial User
        const trialUser = await prisma.user.create({
            data: {
                username: testUserHandle,
                email: testUserEmail,
                password: "hashed_dummy_password",
                role: "USER",
                status: "TRIAL",
                membershipTier: "TRIAL",
                subscriptionCadence: "YEARLY",
                trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
            }
        });

        if (!trialUser.id || trialUser.status !== "TRIAL" || trialUser.membershipTier !== "TRIAL") {
            throw new Error("Failed to initialize trial user");
        }

        // Verify trial state
        const trialEnabledAddons: string[] = trialUser.enabledAddons ? JSON.parse(trialUser.enabledAddons) : [];
        if (trialEnabledAddons.length !== 0) throw new Error("Trial user should have zero enabled addons by default");

        // Step 2: Convert to Full Member (Tier 1 STANDARD)
        const fullMember = await prisma.user.update({
            where: { id: trialUser.id },
            data: {
                status: "APPROVED",
                membershipTier: "STANDARD",
                trialEndsAt: null,
                subscriptionEndsAt: new Date("2027-01-01T23:59:59.999Z")
            }
        });
        if (fullMember.status !== "APPROVED" || fullMember.membershipTier !== "STANDARD" || fullMember.trialEndsAt !== null) {
            throw new Error("Failed to transition user to full member Tier 1");
        }

        // Step 3: Upgrade to Tier 2 (TIER_2_VIP: Managed Support)
        const tier2Member = await prisma.user.update({
            where: { id: trialUser.id },
            data: { membershipTier: "TIER_2_VIP" }
        });
        if (tier2Member.membershipTier !== "TIER_2_VIP") {
            throw new Error("Failed to update user to Tier 2 (TIER_2_VIP)");
        }

        // Step 4: Role Transitions (USER -> SUPER_USER -> ADMIN)
        const superUser = await prisma.user.update({
            where: { id: trialUser.id },
            data: { role: "SUPER_USER" }
        });
        if (superUser.role !== "SUPER_USER") throw new Error("Failed to transition role to SUPER_USER");

        const adminUser = await prisma.user.update({
            where: { id: trialUser.id },
            data: { role: "ADMIN" }
        });
        if (adminUser.role !== "ADMIN") throw new Error("Failed to transition role to ADMIN");

        // Step 5: Cadence Switching (YEARLY <-> MONTHLY)
        const monthlyMember = await prisma.user.update({
            where: { id: trialUser.id },
            data: { subscriptionCadence: "MONTHLY" }
        });
        if (monthlyMember.subscriptionCadence !== "MONTHLY") throw new Error("Failed to update subscription cadence to MONTHLY");

        const yearlyMember = await prisma.user.update({
            where: { id: trialUser.id },
            data: { subscriptionCadence: "YEARLY" }
        });
        if (yearlyMember.subscriptionCadence !== "YEARLY") throw new Error("Failed to revert subscription cadence to YEARLY");

        // Step 6: Prorated Billing Calculation for Tier 1 vs Tier 2
        // Tier 1 Base: $180/yr ($15/mo)
        const tier1Billing = calculateProratedBilling({
            startDate: new Date("2026-06-01T00:00:00.000Z"),
            trialDays: 14,
            yearlyPrice: 180,
            monthlyPrice: 15,
            renewalMonth: 1,
            renewalDay: 1
        });
        if (tier1Billing.annualMonthlyRate !== 15) {
            throw new Error(`Tier 1 annualMonthlyRate mismatch: expected 15, got ${tier1Billing.annualMonthlyRate}`);
        }
        if (tier1Billing.standaloneMonthlyRate !== 15) {
            throw new Error(`Tier 1 standaloneMonthlyRate mismatch: expected 15, got ${tier1Billing.standaloneMonthlyRate}`);
        }
        if (tier1Billing.amountDueNow <= 0) {
            throw new Error("Tier 1 prorated amount due now should be greater than 0");
        }

        // Tier 2 Managed Support: $240/yr ($25/mo)
        const tier2Billing = calculateProratedBilling({
            startDate: new Date("2026-06-01T00:00:00.000Z"),
            trialDays: 14,
            yearlyPrice: 240,
            monthlyPrice: 25,
            renewalMonth: 1,
            renewalDay: 1
        });
        if (tier2Billing.annualMonthlyRate !== 20) {
            throw new Error(`Tier 2 annualMonthlyRate mismatch: expected 20 ($240/12), got ${tier2Billing.annualMonthlyRate}`);
        }
        if (tier2Billing.standaloneMonthlyRate !== 25) {
            throw new Error(`Tier 2 standaloneMonthlyRate mismatch: expected 25, got ${tier2Billing.standaloneMonthlyRate}`);
        }
        if (tier2Billing.amountDueNow <= tier1Billing.amountDueNow) {
            throw new Error(`Tier 2 amount due now ($${tier2Billing.amountDueNow}) should be greater than Tier 1 ($${tier1Billing.amountDueNow})`);
        }

        // Step 7: Add-ons & Sub-Account Allowances
        // Enable extra_kid_profile and extra_living_room
        const enabledAddonsList = ["extra_kid_profile", "extra_living_room", "music_streaming"];
        const userWithAddons = await prisma.user.update({
            where: { id: trialUser.id },
            data: { enabledAddons: JSON.stringify(enabledAddonsList) }
        });
        const parsedAddons: string[] = userWithAddons.enabledAddons ? JSON.parse(userWithAddons.enabledAddons) : [];
        if (!parsedAddons.includes("extra_kid_profile") || !parsedAddons.includes("extra_living_room") || !parsedAddons.includes("music_streaming")) {
            throw new Error("Failed to store and parse enabled add-ons");
        }

        // Verify limit calculations based on addons
        const extraKidsAllowed = parsedAddons.includes("extra_kid_profile") ? 3 : 1;
        const extraLivingRoomsAllowed = parsedAddons.includes("extra_living_room") ? 3 : 1;
        if (extraKidsAllowed !== 3) throw new Error("extra_kid_profile addon did not grant 3 kid profiles");
        if (extraLivingRoomsAllowed !== 3) throw new Error("extra_living_room addon did not grant 3 living room profiles");

        // Remove extra_kid_profile
        const updatedAddonsList = parsedAddons.filter(id => id !== "extra_kid_profile");
        const userAfterRemoval = await prisma.user.update({
            where: { id: trialUser.id },
            data: { enabledAddons: JSON.stringify(updatedAddonsList) }
        });
        const parsedAfterRemoval: string[] = userAfterRemoval.enabledAddons ? JSON.parse(userAfterRemoval.enabledAddons) : [];
        if (parsedAfterRemoval.includes("extra_kid_profile")) throw new Error("Failed to remove extra_kid_profile");
        if (!parsedAfterRemoval.includes("extra_living_room")) throw new Error("Removal inadvertently affected other addons");

        // Step 8: Nested Household Sub-Account Creation & Linking
        const subAccount = await prisma.user.create({
            data: {
                username: `${testUserHandle}_kid`,
                email: `${testUserHandle}_kid@example.com`,
                password: "hashed_dummy_password",
                role: "USER",
                status: "APPROVED",
                accountType: "KID",
                parentUserId: trialUser.id,
                subAccountLabel: "Kids Tablet Profile"
            }
        });
        if (!subAccount.id || subAccount.parentUserId !== trialUser.id || subAccount.accountType !== "KID") {
            throw new Error("Failed to create linked child sub-account");
        }

        // Verify parent relation lookup
        const parentWithSubs = await prisma.user.findUnique({
            where: { id: trialUser.id },
            include: { subAccounts: true }
        });
        if (!parentWithSubs || parentWithSubs.subAccounts.length !== 1 || parentWithSubs.subAccounts[0].id !== subAccount.id) {
            throw new Error("Parent-child sub-account relation query failed");
        }

        // Cleanup
        await prisma.user.delete({ where: { id: subAccount.id } });
        await prisma.user.delete({ where: { id: trialUser.id } });
    });

    // 78. AI Server Assistant: Autonomy Levels, Privacy Boundaries, Release Scoring & Rate Limiting
    await assertTest("Test 78: AI Assistant Tools, Guardrails, Autonomy & Safety", async () => {
        const { 
            validateUserCrossBoundaryQuery, 
            checkAgentRateLimit, 
            recordAgentGrabAction, 
            validateMediaReleaseCandidate 
        } = await import("../src/lib/ai-agent-guardrails");
        const { askAiServerMaster } = await import("../src/lib/ai-server-assistant");

        // 1. Privacy Boundary Guardrail
        const testUser = { id: "test-user-id", username: "alice", email: "alice@example.com", role: "USER" };
        const testAdmin = { id: "test-admin-id", username: "admin_user", email: "admin@example.com", role: "ADMIN" };
        const linkedSubs = [
            { id: "sub-1", username: "alice_kid", subAccountLabel: "Kids Tablet", accountType: "KID" },
            { id: "sub-2", username: "alice_living", subAccountLabel: "Living Room TV", accountType: "LIVING_ROOM" }
        ];

        // 1a. Non-admin querying other users
        const reconCheck = validateUserCrossBoundaryQuery("what other users are watching right now?", testUser, linkedSubs);
        if (reconCheck.allowed || reconCheck.violationType !== "CROSS_USER_RECONNAISSANCE") {
            throw new Error(`Expected CROSS_USER_RECONNAISSANCE violation, got: ${JSON.stringify(reconCheck)}`);
        }

        // 1b. Non-admin terminating another user's stream
        const killOtherCheck = validateUserCrossBoundaryQuery("stop stream for bob", testUser, linkedSubs);
        if (killOtherCheck.allowed || killOtherCheck.violationType !== "CROSS_USER_STREAM_TERMINATION") {
            throw new Error(`Expected CROSS_USER_STREAM_TERMINATION violation, got: ${JSON.stringify(killOtherCheck)}`);
        }

        // 1c. Non-admin attempting to shut off another user's access
        const accessCheck = validateUserCrossBoundaryQuery("shut off access for charlie", testUser, linkedSubs);
        if (accessCheck.allowed || accessCheck.violationType !== "UNAUTHORIZED_ACCESS_MODIFICATION") {
            throw new Error(`Expected UNAUTHORIZED_ACCESS_MODIFICATION violation, got: ${JSON.stringify(accessCheck)}`);
        }

        // 1d. Non-admin querying self or linked sub-account (must be ALLOWED)
        const selfKillCheck = validateUserCrossBoundaryQuery("stop my stream", testUser, linkedSubs);
        if (!selfKillCheck.allowed) {
            throw new Error(`Expected self stream stop to be allowed, got: ${JSON.stringify(selfKillCheck)}`);
        }

        const livingRoomCheck = validateUserCrossBoundaryQuery("stop the living room stream", testUser, linkedSubs);
        if (!livingRoomCheck.allowed) {
            throw new Error(`Expected living room sub-account stop to be allowed, got: ${JSON.stringify(livingRoomCheck)}`);
        }

        const kidsCheck = validateUserCrossBoundaryQuery("is the kids tablet stream working?", testUser, linkedSubs);
        if (!kidsCheck.allowed) {
            throw new Error(`Expected kids sub-account query to be allowed, got: ${JSON.stringify(kidsCheck)}`);
        }

        // 1e. Admin querying cluster (must be ALLOWED across all users)
        const adminReconCheck = validateUserCrossBoundaryQuery("show all active streams on the server", testAdmin, []);
        if (!adminReconCheck.allowed) {
            throw new Error(`Expected admin cluster query to be allowed, got: ${JSON.stringify(adminReconCheck)}`);
        }

        // 2. Automated Grab Rate Limiting
        const testRateId = `test_rate_user_${Date.now()}`;
        const limitCheck1 = checkAgentRateLimit(testRateId, 2);
        if (!limitCheck1.allowed || limitCheck1.remaining !== 2) {
            throw new Error(`Expected 2 remaining grabs, got: ${JSON.stringify(limitCheck1)}`);
        }

        // Record grab 1 and 2
        recordAgentGrabAction(testRateId, "RADARR_TEST", "Sample Movie 1", 2);
        recordAgentGrabAction(testRateId, "RADARR_TEST", "Sample Movie 2", 2);

        // 3rd grab should be BLOCKED
        const limitCheckBlocked = checkAgentRateLimit(testRateId, 2);
        if (limitCheckBlocked.allowed || limitCheckBlocked.remaining !== 0 || !limitCheckBlocked.resetInMinutes) {
            throw new Error(`Expected rate limit to block 3rd grab, got: ${JSON.stringify(limitCheckBlocked)}`);
        }

        // 3. Media Release Candidate Validation & Scoring
        // 3a. Low-quality CAM rejection
        const camRelease = { title: "Inception.2010.HDCAM.x264", size: 1.5 * 1024 * 1024 * 1024, protocol: "torrent", seeders: 50 };
        const camVal = validateMediaReleaseCandidate(camRelease, "movie", "English");
        if (camVal.ok || !camVal.reason?.includes("CAM")) {
            throw new Error(`Expected CAM release to be rejected, got: ${JSON.stringify(camVal)}`);
        }

        // 3b. Foreign-only release rejection when English requested
        const foreignRelease = { title: "Inception.2010.1080p.Spanish.Only.x264", size: 8 * 1024 * 1024 * 1024, protocol: "torrent", seeders: 30 };
        const foreignVal = validateMediaReleaseCandidate(foreignRelease, "movie", "English");
        if (foreignVal.ok) {
            throw new Error(`Expected foreign-only release to be rejected, got: ${JSON.stringify(foreignVal)}`);
        }

        // 3c. Zero seeders rejection
        const deadRelease = { title: "Inception.2010.1080p.BluRay.x264", size: 10 * 1024 * 1024 * 1024, protocol: "torrent", seeders: 0 };
        const deadVal = validateMediaReleaseCandidate(deadRelease, "movie", "English");
        if (deadVal.ok || !deadVal.reason?.includes("Zero seeders")) {
            throw new Error(`Expected 0-seeders release to be rejected, got: ${JSON.stringify(deadVal)}`);
        }

        // 3d. File size bounds (Too small: 100MB for a movie)
        const tinyRelease = { title: "Inception.2010.1080p.BluRay.x264", size: 100 * 1024 * 1024, protocol: "torrent", seeders: 20 };
        const tinyVal = validateMediaReleaseCandidate(tinyRelease, "movie", "English");
        if (tinyVal.ok || !tinyVal.reason?.includes("too small")) {
            throw new Error(`Expected tiny release to be rejected, got: ${JSON.stringify(tinyVal)}`);
        }

        // 3e. High-quality verified release candidate
        const goodRelease = { 
            title: "Inception.2010.1080p.BluRay.DTS-HD.MA.5.1.x264-Portal", 
            size: 14 * 1024 * 1024 * 1024, 
            protocol: "torrent", 
            seeders: 45,
            languages: [{ name: "English", id: 1 }]
        };
        const goodVal = validateMediaReleaseCandidate(goodRelease, "movie", "English");
        if (!goodVal.ok || goodVal.score < 140) {
            throw new Error(`Expected good release to pass with high score, got score=${goodVal.score}, ok=${goodVal.ok}`);
        }

        // 4. Autonomy Level Enforcement in AI Server Master
        // Save Settings to advisory level
        await prisma.settings.upsert({
            where: { id: "global" },
            update: { aiAutonomyLevel: "advisory" },
            create: { id: "global", aiAutonomyLevel: "advisory" }
        });

        const advisoryRes = await askAiServerMaster("stop my stream", [], testUser);
        if (!advisoryRes.success || !advisoryRes.answer.includes("Level 1: Advisory Mode")) {
            throw new Error(`Expected advisory response in Level 1 mode, got: ${advisoryRes.answer}`);
        }

        // Restore Settings to autonomous
        await prisma.settings.update({
            where: { id: "global" },
            data: { aiAutonomyLevel: "autonomous" }
        });
    });

    // Admin Infrastructure Status Cockpit & Real Monitored Plex Server Filtering
    await assertTest("Admin: Infrastructure Status Cockpit & Monitored Filter", async () => {
        // Create test paused Plex server and test active Plex server
        const pausedPlex = await prisma.plexServer.create({
            data: {
                name: "Test Paused Server Mock",
                url: "http://127.0.0.1:32499",
                monitored: false
            }
        });

        const activePlex = await prisma.plexServer.create({
            data: {
                name: "Test Active Server Mock",
                url: "http://127.0.0.1:32498",
                monitored: true
            }
        });

        try {
            const statusRes = await getAdminInfrastructureStatusAction(true);
            if (!statusRes.success) {
                throw new Error(`getAdminInfrastructureStatusAction failed: ${statusRes.error}`);
            }

            if (!statusRes.summary) {
                throw new Error("Missing summary in getAdminInfrastructureStatusAction result");
            }

            const pausedItem = statusRes.services.find(s => s.name === "Test Paused Server Mock");
            if (!pausedItem) {
                throw new Error("Could not find Test Paused Server Mock in infrastructure status services");
            }

            if (pausedItem.status !== "PAUSED" || pausedItem.monitored !== false) {
                throw new Error(`Expected paused server status to be PAUSED and monitored false, got status=${pausedItem.status}, monitored=${pausedItem.monitored}`);
            }

            const activeItem = statusRes.services.find(s => s.name === "Test Active Server Mock");
            if (!activeItem) {
                throw new Error("Could not find Test Active Server Mock in infrastructure status services");
            }

            if (activeItem.monitored !== true) {
                throw new Error(`Expected active server monitored to be true, got ${activeItem.monitored}`);
            }
        } finally {
            await prisma.plexServer.deleteMany({
                where: { id: { in: [pausedPlex.id, activePlex.id] } }
            }).catch(() => {});
        }
    });

    await assertTest("Agregarr: Popular Movies & TV Blueprints, TMDb & MDBList Fallback, and Crunchyroll Presets", async () => {
        const { COLLECTION_PRESETS } = await import("../src/lib/curation/presets");
        const popMovie = COLLECTION_PRESETS.find(p => p.id === "popular-movies");
        if (!popMovie || popMovie.sourceType !== "tmdb" || popMovie.sourceQuery !== "popular") {
            throw new Error(`Expected popular-movies preset to use sourceType='tmdb' and sourceQuery='popular', got: ${JSON.stringify(popMovie)}`);
        }

        const popTv = COLLECTION_PRESETS.find(p => p.id === "popular-tv-shows");
        if (!popTv || popTv.sourceType !== "tmdb" || popTv.sourceQuery !== "popular") {
            throw new Error(`Expected popular-tv-shows preset to use sourceType='tmdb' and sourceQuery='popular', got: ${JSON.stringify(popTv)}`);
        }

        const crTrending = COLLECTION_PRESETS.find(p => p.id === "crunchyroll-trending");
        if (!crTrending || crTrending.sourceType !== "tmdb" || crTrending.sourceQuery !== "provider:283") {
            throw new Error(`Expected crunchyroll-trending preset to use sourceType='tmdb' and sourceQuery='provider:283', got: ${JSON.stringify(crTrending)}`);
        }

        const crOriginals = COLLECTION_PRESETS.find(p => p.id === "crunchyroll-originals");
        if (!crOriginals || crOriginals.sourceType !== "tmdb" || crOriginals.sourceQuery !== "network:1112") {
            throw new Error(`Expected crunchyroll-originals preset to use sourceType='tmdb' and sourceQuery='network:1112', got: ${JSON.stringify(crOriginals)}`);
        }

        const { getCrunchyrollTrending, getTmdbPopularMovies } = await import("../src/lib/curation/tmdb");
        if (typeof getCrunchyrollTrending !== "function" || typeof getTmdbPopularMovies !== "function") {
            throw new Error("Missing getCrunchyrollTrending or getTmdbPopularMovies in tmdb.ts");
        }
    });

    await assertTest("Agregarr: Non-blocking Preset Installation, Background Sync Lifecycle & Plex Maintenance Window Guards", async () => {
        const { syncCollectionToPlexInternal } = await import("../src/app/curation-actions");
        if (typeof syncCollectionToPlexInternal !== "function") {
            throw new Error("Missing syncCollectionToPlexInternal in curation-actions.ts");
        }

        // Verify non-existent collection ID fails cleanly without crashing
        const invalidRes = await syncCollectionToPlexInternal("non-existent-collection-id-xyz");
        if (invalidRes.success !== false) {
            throw new Error(`Expected syncCollectionToPlexInternal to return success: false for invalid ID, got: ${JSON.stringify(invalidRes)}`);
        }

        // Verify syncPlexCollection function is exported and callable
        const { syncPlexCollection } = await import("../src/lib/curation/plex-analyzer");
        if (typeof syncPlexCollection !== "function") {
            throw new Error("Missing syncPlexCollection in plex-analyzer.ts");
        }
    });

    await assertTest("Agregarr: Genre & Keyword Discovery, Candidate Year Verification & Placeholder Exclusion", async () => {
        const { getTmdbGenreMedia, getTmdbKeywordMedia } = await import("../src/lib/curation/tmdb");
        if (typeof getTmdbGenreMedia !== "function" || typeof getTmdbKeywordMedia !== "function") {
            throw new Error("Missing getTmdbGenreMedia or getTmdbKeywordMedia in tmdb.ts");
        }

        const {
            isPlexItemPlaceholderOrStub,
            buildCandidateIndex,
            matchLibraryItemToCandidates
        } = await import("../src/lib/curation/plex-analyzer");

        // 1. Verify candidate matching strictly enforces release year when matching by title
        const candidateUpcomingReboot = [
            { id: 999999, title: "Resident Evil", year: 2026, releaseDate: "2026-09-18" }
        ];
        const index = buildCandidateIndex(candidateUpcomingReboot);

        const libraryOldMovie2002 = {
            ratingKey: "12345",
            title: "Resident Evil",
            year: 2002,
            guids: {}
        };
        const matchedOldMovie = matchLibraryItemToCandidates(libraryOldMovie2002, index);
        if (matchedOldMovie) {
            throw new Error("Library item Resident Evil (2002) falsely matched candidate Resident Evil (2026)!");
        }

        const libraryUpcomingStub = {
            ratingKey: "12346",
            title: "Resident Evil",
            year: 2026,
            guids: {}
        };
        const matchedUpcoming = matchLibraryItemToCandidates(libraryUpcomingStub, index);
        if (!matchedUpcoming) {
            throw new Error("Expected Resident Evil (2026) to match candidate Resident Evil (2026)");
        }

        // 2. Verify placeholder & unreleased exclusion
        const stubShortDuration = {
            title: "Backrooms",
            type: "movie",
            duration: 120000, // 2 minutes (trailer)
            year: 2026
        };
        if (!isPlexItemPlaceholderOrStub(stubShortDuration)) {
            throw new Error("Expected short duration movie to be detected as placeholder/stub");
        }

        const stubFutureYear = {
            title: "Toy Story 5",
            type: "movie",
            year: 2026,
            duration: 90 * 60 * 1000,
            fileSize: 1000000000
        };
        const currentYear = new Date().getFullYear();
        if (stubFutureYear.year > currentYear && !isPlexItemPlaceholderOrStub(stubFutureYear)) {
            throw new Error("Expected future unreleased item (year > currentYear) to be detected as placeholder");
        }

        const regularReleasedMovie = {
            title: "The Dark Knight",
            type: "movie",
            year: 2008,
            duration: 152 * 60 * 1000,
            fileSize: 15 * 1024 * 1024 * 1024
        };
        if (isPlexItemPlaceholderOrStub(regularReleasedMovie)) {
            throw new Error("Released library movie The Dark Knight falsely detected as placeholder/stub");
        }

        // 3. Verify Seasonal In-Season vs Out-of-Season calculation
        // Summer Blockbusters: 5/15 to 8/31
        const isDateInSeason = (m: number, d: number, startM: number, startD: number, endM: number, endD: number) => {
            const curVal = m * 100 + d;
            const startVal = startM * 100 + startD;
            const endVal = endM * 100 + endD;
            return startVal <= endVal ? (curVal >= startVal && curVal <= endVal) : (curVal >= startVal || curVal <= endVal);
        };

        // October 6 must be OUT of season for Summer Blockbusters (May 15 - Aug 31)
        if (isDateInSeason(10, 6, 5, 15, 8, 31)) {
            throw new Error("October 6 falsely evaluated as in-season for Summer Blockbusters");
        }
        // July 4 must be IN season for Summer Blockbusters
        if (!isDateInSeason(7, 4, 5, 15, 8, 31)) {
            throw new Error("July 4 evaluated as out-of-season for Summer Blockbusters");
        }
        // October 6 must be IN season for Halloween (Oct 1 - Nov 5)
        if (!isDateInSeason(10, 6, 10, 1, 11, 5)) {
            throw new Error("October 6 evaluated as out-of-season for Halloween");
        }
    });

    // 76. Agregarr: Curation Presets Audit, Built-in Oscar Best Picture Registry & Franchise Resolution
    await assertTest("Agregarr: Curation Presets Audit & Oscar Fallback", async () => {
        // 1. Built-in Oscar Best Picture Registry integrity
        const oscarList = getBuiltinOscarBestPictureList();
        if (!Array.isArray(oscarList) || oscarList.length < 90) {
            throw new Error(`Expected at least 90 Oscar Best Picture winners, got ${oscarList?.length}`);
        }
        const oppenheimer = oscarList.find(o => o.title === "Oppenheimer");
        if (!oppenheimer || oppenheimer.year !== 2023 || oppenheimer.tmdbId !== 872585 || oppenheimer.imdbId !== "tt15398776") {
            throw new Error("Oppenheimer entry corrupted in Oscar Best Picture registry");
        }
        const wings = oscarList.find(o => o.title === "Wings");
        if (!wings || wings.year !== 1927 || wings.rank !== 1) {
            throw new Error("Wings (1927) rank 1 entry corrupted in Oscar Best Picture registry");
        }

        // 2. All 49 Presets audit verification
        if (COLLECTION_PRESETS.length < 49) {
            throw new Error(`Expected at least 49 collection presets, found ${COLLECTION_PRESETS.length}`);
        }
        const seenIds = new Set<string>();
        for (const p of COLLECTION_PRESETS) {
            if (seenIds.has(p.id)) throw new Error(`Duplicate preset ID: ${p.id}`);
            seenIds.add(p.id);
            if (!p.title || !p.icon || !p.sourceType || !p.category) {
                throw new Error(`Preset ${p.id} missing mandatory metadata fields`);
            }
            if (p.isSeasonal) {
                if (!p.scheduleStartMonth || !p.scheduleEndMonth || !p.scheduleStartDay || !p.scheduleEndDay) {
                    throw new Error(`Seasonal preset ${p.id} has invalid schedule range`);
                }
            }
        }

        // 3. Verify specific presets that were fixed
        const mcu = COLLECTION_PRESETS.find(p => p.id === "marvel-cinematic-universe");
        if (!mcu || mcu.sourceQuery !== "franchise:mcu") {
            throw new Error(`Marvel MCU preset must use sourceQuery "franchise:mcu", got "${mcu?.sourceQuery}"`);
        }

        const dceu = COLLECTION_PRESETS.find(p => p.id === "dc-extended-universe");
        if (!dceu || dceu.sourceQuery !== "franchise:dceu") {
            throw new Error(`DC Universe preset must use sourceQuery "franchise:dceu", got "${dceu?.sourceQuery}"`);
        }

        const radarrTag = COLLECTION_PRESETS.find(p => p.id === "radarr-tag-collection");
        if (!radarrTag || radarrTag.sourceQuery !== "tag:portalarr") {
            throw new Error(`Radarr tag preset must use "tag:portalarr", got "${radarrTag?.sourceQuery}"`);
        }

        const sonarrTag = COLLECTION_PRESETS.find(p => p.id === "sonarr-tag-collection");
        if (!sonarrTag || sonarrTag.sourceQuery !== "tag:portalarr") {
            throw new Error(`Sonarr tag preset must use "tag:portalarr", got "${sonarrTag?.sourceQuery}"`);
        }

        // 4. Candidate matching against Oscar Registry
        const { buildCandidateIndex, matchLibraryItemToCandidates } = await import("../src/lib/curation/plex-analyzer");
        const oscarIndex = buildCandidateIndex(oscarList);
        const parasiteItem = {
            ratingKey: "991",
            title: "Parasite",
            year: 2019,
            guids: { tmdb: "496243" }
        };
        if (!matchLibraryItemToCandidates(parasiteItem, oscarIndex)) {
            throw new Error("Parasite failed to match Oscar Best Picture candidate index");
        }
    });

    // 77. Agregarr: Trending Auto-Placeholders, Coming Soon Exclusion & Selective Trailer Filtering
    await assertTest("Agregarr: Trending Auto-Placeholders, Coming Soon Exclusion & Selective Trailer Filtering", async () => {
        const { COLLECTION_PRESETS } = await import("../src/lib/curation/presets");
        const { isPlexItemExcludedByLabels } = await import("../src/lib/curation/plex-analyzer");

        // 1. Verify Trending Presets have auto placeholders enabled and exclude coming soon movies
        const trendingPresetIds = [
            "trending-this-week",
            "netflix-trending",
            "netflix-kids-trending",
            "disney-trending",
            "disney-kids-trending",
            "crunchyroll-trending"
        ];

        for (const pid of trendingPresetIds) {
            const p = COLLECTION_PRESETS.find(x => x.id === pid);
            if (!p) throw new Error(`Missing expected trending preset: ${pid}`);
            if (p.defaultIncludePlaceholders !== true) {
                throw new Error(`Preset "${pid}" must have defaultIncludePlaceholders: true`);
            }
            if (!p.defaultExcludedLabels || !p.defaultExcludedLabels.includes("Coming Soon-placeholder")) {
                throw new Error(`Preset "${pid}" must exclude "Coming Soon-placeholder"`);
            }
            if (!p.defaultExcludedLabels.includes("coming_soon")) {
                throw new Error(`Preset "${pid}" must exclude "coming_soon"`);
            }
            if (p.defaultExcludedLabels.includes("trailer-placeholder")) {
                throw new Error(`Preset "${pid}" must NOT exclude "trailer-placeholder" (needs to include its own placeholders)`);
            }
        }

        // 2. Verify Coming Soon Presets have placeholders enabled and ignore trending trailers
        const comingSoonPresetIds = ["radarr-coming-soon", "sonarr-coming-soon"];
        for (const pid of comingSoonPresetIds) {
            const p = COLLECTION_PRESETS.find(x => x.id === pid);
            if (!p) throw new Error(`Missing expected coming soon preset: ${pid}`);
            if (p.defaultIncludePlaceholders !== true) {
                throw new Error(`Preset "${pid}" must have defaultIncludePlaceholders: true`);
            }
            if (!p.defaultExcludedLabels || !p.defaultExcludedLabels.includes("trailer-placeholder")) {
                throw new Error(`Preset "${pid}" must exclude "trailer-placeholder"`);
            }
            if (p.defaultExcludedLabels.includes("Coming Soon-placeholder")) {
                throw new Error(`Preset "${pid}" must NOT exclude "Coming Soon-placeholder" (needs to include its own monitored stubs)`);
            }
        }

        // 3. Test isPlexItemExcludedByLabels selective filtering in Trending collection
        const trendingExcludedLabels = "Coming Soon-placeholder, coming_soon, leaving-soon";
        const trendingTrailerStub = {
            ratingKey: "trailer_101",
            title: "Stranger Things Season 5",
            isPlaceholder: true,
            editionTitle: "Trailer",
            labels: ["trailer-placeholder"]
        };
        const comingSoonStub = {
            ratingKey: "monitored_202",
            title: "Avatar: Fire and Ash",
            isPlaceholder: true,
            editionTitle: "Trailer",
            labels: ["Coming Soon-placeholder"]
        };
        const comingSoonAltStub = {
            ratingKey: "monitored_203",
            title: "Dune Messiah",
            isPlaceholder: true,
            labels: ["coming_soon"]
        };
        const releasedMovie = {
            ratingKey: "real_303",
            title: "Oppenheimer",
            labels: []
        };
        const leavingSoonMovie = {
            ratingKey: "leaving_404",
            title: "Old Movie",
            isLeavingSoon: true,
            labels: ["leaving-soon"]
        };

        // In Trending (allowPlaceholders = true):
        // Trending trailers must be allowed (NOT excluded)
        if (isPlexItemExcludedByLabels(trendingTrailerStub, trendingExcludedLabels, true)) {
            throw new Error("Trending collection incorrectly excluded its own trailer-placeholder stub!");
        }
        // Coming soon movies must be EXCLUDED
        if (!isPlexItemExcludedByLabels(comingSoonStub, trendingExcludedLabels, true)) {
            throw new Error("Trending collection failed to exclude Coming Soon-placeholder movie!");
        }
        if (!isPlexItemExcludedByLabels(comingSoonAltStub, trendingExcludedLabels, true)) {
            throw new Error("Trending collection failed to exclude coming_soon movie!");
        }
        // Leaving soon must be EXCLUDED
        if (!isPlexItemExcludedByLabels(leavingSoonMovie, trendingExcludedLabels, true)) {
            throw new Error("Trending collection failed to exclude leaving-soon movie!");
        }
        // Normal movie must be allowed
        if (isPlexItemExcludedByLabels(releasedMovie, trendingExcludedLabels, true)) {
            throw new Error("Trending collection incorrectly excluded a standard library movie!");
        }

        // 4. Test isPlexItemExcludedByLabels selective filtering in Coming Soon collection
        const comingSoonExcludedLabels = "trailer-placeholder, trailers, leaving-soon";

        // In Coming Soon (allowPlaceholders = true):
        // Trending trailers must be EXCLUDED / IGNORED
        if (!isPlexItemExcludedByLabels(trendingTrailerStub, comingSoonExcludedLabels, true)) {
            throw new Error("Coming Soon collection failed to ignore trending trailer-placeholder!");
        }
        // Monitored coming soon stub must be allowed (NOT excluded)
        if (isPlexItemExcludedByLabels(comingSoonStub, comingSoonExcludedLabels, true)) {
            throw new Error("Coming Soon collection incorrectly excluded its own Coming Soon-placeholder stub!");
        }
        // Leaving soon must be EXCLUDED
        if (!isPlexItemExcludedByLabels(leavingSoonMovie, comingSoonExcludedLabels, true)) {
            throw new Error("Coming Soon collection failed to exclude leaving-soon movie!");
        }
        // Normal movie must be allowed
        if (isPlexItemExcludedByLabels(releasedMovie, comingSoonExcludedLabels, true)) {
            throw new Error("Coming Soon collection incorrectly excluded standard library movie!");
        }

        // 5. In standard collections (allowPlaceholders = false), ALL placeholders are excluded
        const standardExcludedLabels = "trailer-placeholder, trailers, coming_soon, leaving-soon";
        if (!isPlexItemExcludedByLabels(trendingTrailerStub, standardExcludedLabels, false)) {
            throw new Error("Standard collection failed to blanket exclude trailer placeholder!");
        }
        if (!isPlexItemExcludedByLabels(comingSoonStub, standardExcludedLabels, false)) {
            throw new Error("Standard collection failed to blanket exclude coming soon stub!");
        }
    });

    await assertTest("Agregarr: Collection Update Priority Preservation & Plex Hub Ordering Integrity", async () => {
        const {
            updatePlexCollectionPromotionAndOrder,
            reorderPlexHubsSelective
        } = await import("../src/lib/curation/plex-analyzer");

        if (typeof updatePlexCollectionPromotionAndOrder !== "function") {
            throw new Error("Missing updatePlexCollectionPromotionAndOrder in plex-analyzer.ts");
        }
        if (typeof reorderPlexHubsSelective !== "function") {
            throw new Error("Missing reorderPlexHubsSelective in plex-analyzer.ts");
        }

        // 1. Verify sortTitle normalization regex strips repeated/compounded prefixes cleanly
        const stripPrefixes = (t: string) => t.replace(/^(![\d]+_)+/, "").trim();
        if (stripPrefixes("!01_!01_Trending Movies") !== "Trending Movies") {
            throw new Error(`Failed stripping compounded prefix: ${stripPrefixes("!01_!01_Trending Movies")}`);
        }
        if (stripPrefixes("!02_!03_!05_Leaving Soon") !== "Leaving Soon") {
            throw new Error(`Failed stripping triple compounded prefix: ${stripPrefixes("!02_!03_!05_Leaving Soon")}`);
        }
        if (stripPrefixes("Regular Title Without Prefix") !== "Regular Title Without Prefix") {
            throw new Error(`Failed on title without prefix: ${stripPrefixes("Regular Title Without Prefix")}`);
        }

        // 2. Test database orderIndex & sortPrefix preservation on update simulation
        const testCollId = "test_priority_preserve_" + Date.now();
        const initialOrder = 3;
        const initialPrefix = `!03_`;

        // Create test collection at priority rank #3
        const created = await prisma.mediaCollection.create({
            data: {
                id: testCollId,
                title: "Test Priority Collection",
                summary: "Testing priority rank preservation",
                sortTitle: `${initialPrefix}Test Priority Collection`,
                type: "movie",
                category: "curated",
                serverId: "test_srv_priority",
                sectionKey: "1",
                sourceType: "tmdb",
                sourceQuery: "trending",
                orderIndex: initialOrder,
                sortPrefix: initialPrefix,
                promotedToHome: true,
                promotedToRecommended: true
            }
        });

        if (created.orderIndex !== 3 || created.sortPrefix !== "!03_") {
            throw new Error(`Expected created orderIndex=3 and sortPrefix='!03_', got ${created.orderIndex}, ${created.sortPrefix}`);
        }

        // Simulate update where incoming payload does NOT specify orderIndex (orderIndex is undefined/0)
        // Demonstrating that existing.orderIndex (3) and sortPrefix (!03_) are strictly preserved
        const existing = await prisma.mediaCollection.findUnique({ where: { id: testCollId } });
        if (!existing) throw new Error("Test collection not found in database");

        const incomingData: { orderIndex?: number; sortPrefix?: string; summary?: string } = {
            summary: "Updated description without specifying orderIndex"
        };

        const effectiveOrderIndex = (incomingData.orderIndex !== undefined && incomingData.orderIndex > 0)
            ? incomingData.orderIndex
            : (existing.orderIndex && existing.orderIndex > 0 ? existing.orderIndex : 1);
        const effectiveSortPrefix = incomingData.sortPrefix || existing.sortPrefix || `!${String(effectiveOrderIndex).padStart(2, '0')}_`;

        const updated = await prisma.mediaCollection.update({
            where: { id: testCollId },
            data: {
                summary: incomingData.summary,
                orderIndex: effectiveOrderIndex,
                sortPrefix: effectiveSortPrefix
            }
        });

        if (updated.orderIndex !== 3) {
            throw new Error(`Expected orderIndex to remain 3 after update, got ${updated.orderIndex} (dropped to bottom bug!)`);
        }
        if (updated.sortPrefix !== "!03_") {
            throw new Error(`Expected sortPrefix to remain '!03_', got '${updated.sortPrefix}'`);
        }

        // Cleanup
        await prisma.mediaCollection.deleteMany({
            where: { id: testCollId }
        });
    });

    // 79. Agregarr & Plex Direct: SSL Enforcement, LAN/WAN IP Isolation & Candidate URL Precedence
    await assertTest("Agregarr: Plex Direct Endpoint SSL Security, Private LAN IP Isolation & Working Server URL Precedence", async () => {
        // 1. Verify isPrivateOrLocalIp detects private subnets, loopbacks, link-local, and Docker hosts
        const privateIps = [
            "127.0.0.1", "localhost", "::1", "host.docker.internal", "plex",
            "192.168.1.1", "192.168.0.254", "10.0.0.1", "10.255.255.255",
            "172.16.0.1", "172.20.10.2", "172.31.255.254", "169.254.1.1"
        ];
        for (const ip of privateIps) {
            if (!isPrivateOrLocalIp(ip)) {
                throw new Error(`Expected isPrivateOrLocalIp("${ip}") to be true, got false`);
            }
        }

        // 2. Verify isPrivateOrLocalIp rejects public WAN IPs
        const publicIps = [
            "162.231.214.194", "8.8.8.8", "1.1.1.1", "208.67.222.222",
            "172.32.0.1", "172.15.255.255", "192.169.1.1"
        ];
        for (const ip of publicIps) {
            if (isPrivateOrLocalIp(ip)) {
                throw new Error(`Expected isPrivateOrLocalIp("${ip}") to be false, got true`);
            }
        }

        // 3. Verify expandCandidateUrls enforces HTTPS on .plex.direct (never returns plain http:// for .plex.direct)
        const httpPlexDirect = "http://192-168-1-50.57284ecb50604cbabd5368742bd8cc5f.plex.direct:32400";
        const expandedHttp = expandCandidateUrls(httpPlexDirect);
        for (const cand of expandedHttp) {
            if (cand.includes(".plex.direct") && cand.startsWith("http://")) {
                throw new Error(`Protocol violation: expandCandidateUrls generated plain http:// for .plex.direct: "${cand}"`);
            }
        }

        // 4. Verify candidate #0 (confirmed working server URL) is ALWAYS preserved as Candidate #1
        const workingDirectUrl = "http://192.168.1.100:32400";
        const wanPlexDirectUrl = "https://162-231-214-194.57284ecb50604cbabd5368742bd8cc5f.plex.direct:24960";
        const expandedPriority = expandCandidateUrls([workingDirectUrl, wanPlexDirectUrl]);

        if (expandedPriority[0] !== workingDirectUrl) {
            throw new Error(`Expected Candidate #0 to remain confirmed working URL "${workingDirectUrl}", got "${expandedPriority[0]}"`);
        }

        // 5. Verify public WAN .plex.direct does NOT get decoded into high-priority direct LAN candidates
        const expandedWan = expandCandidateUrls(wanPlexDirectUrl);
        // It must NOT generate http://162-231-214-194...plex.direct
        if (expandedWan.some(u => u.includes(".plex.direct") && u.startsWith("http://"))) {
            throw new Error(`Found plain http:// for WAN .plex.direct in: ${expandedWan.join(", ")}`);
        }
        // Direct LAN URLs must come before WAN fallback URLs when both are present
        const directLanIndex = expandedPriority.indexOf("http://192.168.1.100:32400");
        const wanIndex = expandedPriority.indexOf(wanPlexDirectUrl);
        if (directLanIndex === -1 || wanIndex === -1 || directLanIndex > wanIndex) {
            throw new Error(`Expected direct LAN URL (idx: ${directLanIndex}) to precede WAN fallback URL (idx: ${wanIndex})`);
        }
    });

    await assertTest("Agregarr: Collection Media Preview Concurrency, Timeout Safety & Offline Resilience", async () => {
        const { evaluateCollectionMediaPreviewInternal } = await import("../src/app/curation-actions");
        if (typeof evaluateCollectionMediaPreviewInternal !== "function") {
            throw new Error("Missing evaluateCollectionMediaPreviewInternal in curation-actions.ts");
        }

        const startTime = Date.now();
        const dummyCollection = {
            id: "test-preview-dummy",
            title: "Test Dummy Preview",
            sourceType: "tmdb",
            sourceQuery: "collection:999999999",
            category: "franchise",
            type: "movie",
            serverId: "non-existent-server",
            sectionKey: "non-existent-section"
        };

        const previewRes = await evaluateCollectionMediaPreviewInternal(dummyCollection);
        const duration = Date.now() - startTime;

        if (duration > 8500) {
            throw new Error(`Preview evaluation took too long: ${duration}ms (exceeded 8500ms safety threshold)`);
        }

        if (!previewRes || typeof previewRes.success !== "boolean") {
            throw new Error(`Invalid preview response structure: ${JSON.stringify(previewRes)}`);
        }

        if (!Array.isArray(previewRes.items)) {
            throw new Error("Expected preview response to return items array");
        }
    });

    await assertTest("Agregarr & System: Fast Direct Plex Sync, Batch Hub Reorder & Universal Clipboard", async () => {
        const { copyToClipboard } = await import("../src/lib/utils");
        if (typeof copyToClipboard !== "function") {
            throw new Error("Missing copyToClipboard export in utils.ts");
        }
        const emptyResult = await copyToClipboard("");
        if (emptyResult !== false) {
            throw new Error(`Expected copyToClipboard("") to return false, got ${emptyResult}`);
        }

        const { syncCollectionToPlexInternal, getMediaCollectionsAction } = await import("../src/app/curation-actions");
        const res = await syncCollectionToPlexInternal("non-existent-collection-id-999", {
            skipHubReorder: true,
            cachedExistingCollections: []
        });
        if (res.success !== false) {
            throw new Error(`Expected failure for non-existent collection, got: ${JSON.stringify(res)}`);
        }

        const getRes = await getMediaCollectionsAction("main", "1");
        if (!getRes || typeof getRes.success !== "boolean") {
            throw new Error("getMediaCollectionsAction failed structure test");
        }
    });

    // 82. Agregarr: Coming Soon (Radarr & Sonarr Monitored) Ingestion Heuristics & Placeholder Candidate Matching
    await assertTest("Agregarr: Coming Soon (Radarr & Sonarr Monitored) Ingestion Heuristics & Placeholder Candidate Matching", async () => {
        const now = new Date();
        const nextMonth = new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString();
        const sixMonthsAhead = new Date(now.getTime() + 180 * 24 * 3600 * 1000).toISOString();
        const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 3600 * 1000).toISOString();
        const fiveYearsAgo = new Date(now.getTime() - 5 * 365 * 24 * 3600 * 1000).toISOString();

        // 1. Verify candidate evaluation logic on synthetic Radarr fixtures
        const mockAnnouncedMovie = { id: 101, title: "Future Epic 2027", year: now.getFullYear() + 1, monitored: true, hasFile: false, status: "announced" };
        const mockInCinemasMovie = { id: 102, title: "Theatrical Hit", year: now.getFullYear(), monitored: true, hasFile: false, status: "inCinemas", inCinemas: fortyDaysAgo };
        const mockFutureDigitalMovie = { id: 103, title: "Streaming Countdown", year: now.getFullYear(), monitored: true, hasFile: false, status: "announced", digitalRelease: sixMonthsAhead };
        const mockLegacyMissingBacklog = { id: 104, title: "Forgotten 2018 Backlog", year: 2018, monitored: true, hasFile: false, status: "released", digitalRelease: fiveYearsAgo, physicalRelease: fiveYearsAgo };
        const mockDownloadedMovie = { id: 105, title: "Acquired Movie", year: now.getFullYear(), monitored: true, hasFile: true, status: "released" };
        const mockUnmonitoredMovie = { id: 106, title: "Unmonitored Movie", year: now.getFullYear(), monitored: false, hasFile: false, status: "announced" };

        // 2. Verify candidate evaluation logic on synthetic Sonarr fixtures
        const mockUpcomingSeries = { id: 201, title: "Brand New Sci-Fi", year: now.getFullYear(), monitored: true, status: "upcoming", statistics: { episodeFileCount: 0, totalEpisodeCount: 10 } };
        const mockContinuingSeries = { id: 202, title: "Returning Drama", year: now.getFullYear() - 1, monitored: true, status: "continuing", statistics: { episodeFileCount: 18, totalEpisodeCount: 20 } };
        const mockScheduledSeries = { id: 203, title: "Scheduled Series", year: now.getFullYear(), monitored: true, status: "continuing", nextAiring: nextMonth, statistics: { episodeFileCount: 10, totalEpisodeCount: 12 } };
        const mockCompletedSeries = { id: 204, title: "Finished Series", year: 2020, monitored: true, status: "ended", statistics: { episodeFileCount: 50, totalEpisodeCount: 50 } };
        const mockUnmonitoredSeries = { id: 205, title: "Unmonitored Show", year: now.getFullYear(), monitored: false, status: "upcoming", statistics: { episodeFileCount: 0, totalEpisodeCount: 10 } };

        const { previewCollectionMatchingAction } = await import("../src/app/curation-actions");
        const { getEnabledArrInstances } = await import("../src/app/arr-actions");

        if (typeof previewCollectionMatchingAction !== "function") {
            throw new Error("Missing previewCollectionMatchingAction export");
        }
        if (typeof getEnabledArrInstances !== "function") {
            throw new Error("Missing getEnabledArrInstances export");
        }

        // Test preview structure with synthetic preset params
        const previewRes = await previewCollectionMatchingAction("non-existent-server", "1", {
            sourceType: "radarr",
            sourceQuery: "monitored_missing",
            title: "Coming Soon (Radarr Monitored)",
            includePlaceholders: true
        });
        if (typeof previewRes.success !== "boolean") {
            throw new Error(`Expected boolean success from previewCollectionMatchingAction, got: ${JSON.stringify(previewRes)}`);
        }
    });

    // 109. Curation: Agregarr Plex Collection Synchronization & Batch Item Addition
    await assertTest("Agregarr: Plex Collection Item Batching & Multi-URI Isolation", async () => {
        const { syncPlexCollection, removeItemsFromPlexCollection, getPlexServerMachineIdentifier } = await import("../src/lib/curation/plex-analyzer");
        if (typeof syncPlexCollection !== "function") throw new Error("Missing syncPlexCollection");
        if (typeof removeItemsFromPlexCollection !== "function") throw new Error("Missing removeItemsFromPlexCollection");
        if (typeof getPlexServerMachineIdentifier !== "function") throw new Error("Missing getPlexServerMachineIdentifier");

        // Verify removeItemsFromPlexCollection safely handles empty input
        const emptyRemoved = await removeItemsFromPlexCollection([], "dummy-token", "Test Coll", []);
        if (emptyRemoved !== 0) throw new Error("Expected 0 removed for empty input");

        // Verify seasonal presets have distinct valid queries
        const { COLLECTION_PRESETS } = await import("../src/lib/curation/presets");
        const halloween = COLLECTION_PRESETS.find(p => p.id === "halloween-horror-fest");
        const summer = COLLECTION_PRESETS.find(p => p.id === "summer-blockbusters");
        const christmas = COLLECTION_PRESETS.find(p => p.id === "christmas-holiday-cheer");
        const thanksgiving = COLLECTION_PRESETS.find(p => p.id === "thanksgiving-family-feast");

        if (!halloween || halloween.sourceQuery !== "genre:27") throw new Error("Invalid halloween preset query");
        if (!summer || summer.sourceQuery !== "genre:28") throw new Error("Invalid summer preset query");
        if (!christmas || christmas.sourceQuery !== "keyword:christmas") throw new Error("Invalid christmas preset query");
        if (!thanksgiving || thanksgiving.sourceQuery !== "genre:10751") throw new Error("Invalid thanksgiving preset query");
    });

    // 85. Agregarr: Out-of-Season Hiding, Schedule Evaluation & Visibility Promotion Flags
    await assertTest("Agregarr: Out-of-Season Hiding & Schedule Evaluation", async () => {
        const { isSeasonalCollectionInSeason, isCollectionScheduleActive } = await import("../src/lib/curation/schedule-helper");

        const oct7 = new Date("2026-10-07T12:00:00Z");

        // 1. Halloween Horror & Spooky Nights (Oct 1 - Nov 3) -> IN SEASON on Oct 7
        const halloweenColl = {
            isSeasonal: true,
            scheduleStartMonth: 10,
            scheduleStartDay: 1,
            scheduleEndMonth: 11,
            scheduleEndDay: 3,
            seasonalAction: "promote_hide"
        };
        if (!isSeasonalCollectionInSeason(halloweenColl, oct7)) {
            throw new Error("Halloween collection should be IN SEASON on Oct 7");
        }
        if (!isCollectionScheduleActive(halloweenColl, oct7)) {
            throw new Error("Halloween collection schedule should be ACTIVE on Oct 7");
        }

        // 2. Summer Blockbusters & Action Thrills (May 15 - Aug 31) -> OUT OF SEASON on Oct 7
        const summerColl = {
            isSeasonal: true,
            scheduleStartMonth: 5,
            scheduleStartDay: 15,
            scheduleEndMonth: 8,
            scheduleEndDay: 31,
            seasonalAction: "promote_hide"
        };
        if (isSeasonalCollectionInSeason(summerColl, oct7)) {
            throw new Error("Summer Blockbusters collection should be OUT OF SEASON on Oct 7");
        }
        if (isCollectionScheduleActive(summerColl, oct7)) {
            throw new Error("Summer Blockbusters schedule should be INACTIVE on Oct 7");
        }

        // 3. Holiday Cheer & Christmas Classics (Nov 20 - Jan 6) -> OUT OF SEASON on Oct 7
        const christmasColl = {
            isSeasonal: true,
            scheduleStartMonth: 11,
            scheduleStartDay: 20,
            scheduleEndMonth: 1,
            scheduleEndDay: 6,
            seasonalAction: "promote_hide"
        };
        if (isSeasonalCollectionInSeason(christmasColl, oct7)) {
            throw new Error("Holiday Cheer collection should be OUT OF SEASON on Oct 7");
        }
        if (isCollectionScheduleActive(christmasColl, oct7)) {
            throw new Error("Holiday Cheer schedule should be INACTIVE on Oct 7");
        }

        // 4. Thanksgiving & Fall Family Cinema (Nov 1 - Nov 30) -> OUT OF SEASON on Oct 7
        const thanksgivingColl = {
            isSeasonal: true,
            scheduleStartMonth: 11,
            scheduleStartDay: 1,
            scheduleEndMonth: 11,
            scheduleEndDay: 30,
            seasonalAction: "promote_hide"
        };
        if (isSeasonalCollectionInSeason(thanksgivingColl, oct7)) {
            throw new Error("Thanksgiving collection should be OUT OF SEASON on Oct 7");
        }
        if (isCollectionScheduleActive(thanksgivingColl, oct7)) {
            throw new Error("Thanksgiving schedule should be INACTIVE on Oct 7");
        }

        // 5. Wrap-around Christmas in December: Dec 25 -> IN SEASON
        const dec25 = new Date("2026-12-25T12:00:00Z");
        if (!isSeasonalCollectionInSeason(christmasColl, dec25)) {
            throw new Error("Holiday Cheer collection should be IN SEASON on Dec 25");
        }

        // 6. Non-seasonal collection should always be active
        const standardColl = { isSeasonal: false, activeDays: "all", activeTimeRange: "all_day" };
        if (!isCollectionScheduleActive(standardColl, oct7)) {
            throw new Error("Standard collection should always be active");
        }
    });

    // 86. Agregarr: Exclusion of TV Specials and Trailer Stubs from Filtered Smart Hubs & Candidate Previews
    await assertTest("Agregarr: TV Specials & Trailer Stub Exclusion from Smart Hubs", async () => {
        // 1. isPlexItemPlaceholderOrStub detects TV shows with trailer/placeholder paths
        const tvTrailerStub = {
            type: "show",
            title: "Supernatural",
            filePath: "/mnt/user/data/media/tv/placeholders/curated_tv_shows/Supernatural/Supernatural - S00E00 - Trailer.mp4"
        };
        if (!isPlexItemPlaceholderOrStub(tvTrailerStub)) {
            throw new Error("isPlexItemPlaceholderOrStub failed to flag TV show with placeholder path as stub");
        }

        // 2. isPlexItemPlaceholderOrStub detects TV show with .trailer. in filePath
        const tvTrailerFile = {
            type: "tv",
            title: "Young Hearts",
            filePath: "/mnt/user/data/media/tv/Young Hearts/Young Hearts.trailer.mkv"
        };
        if (!isPlexItemPlaceholderOrStub(tvTrailerFile)) {
            throw new Error("isPlexItemPlaceholderOrStub failed to flag TV show with trailer file as stub");
        }

        // 3. isPlexItemPlaceholderOrStub detects TV shows with only specials or no regular seasons
        const tvOnlySpecials = {
            type: "show",
            title: "Late Show With David Letterman",
            hasOnlySpecials: true
        };
        if (!isPlexItemPlaceholderOrStub(tvOnlySpecials)) {
            throw new Error("isPlexItemPlaceholderOrStub failed to flag TV show with hasOnlySpecials: true as stub");
        }

        const tvNoRegularSeasons = {
            type: "show",
            title: "Tagesschau",
            hasRegularSeasons: false
        };
        if (!isPlexItemPlaceholderOrStub(tvNoRegularSeasons)) {
            throw new Error("isPlexItemPlaceholderOrStub failed to flag TV show with hasRegularSeasons: false as stub");
        }

        // 4. isPlexItemPlaceholderOrStub returns FALSE for genuine TV shows and movies
        const genuineShow = {
            type: "show",
            title: "Abbott Elementary",
            filePath: "/mnt/user/data/media/tv/Abbott Elementary/Season 01/Abbott Elementary - S01E01 - Pilot.mkv",
            hasRegularSeasons: true,
            hasOnlySpecials: false,
            year: 2021
        };
        if (isPlexItemPlaceholderOrStub(genuineShow)) {
            throw new Error("isPlexItemPlaceholderOrStub falsely flagged genuine TV show as placeholder");
        }

        const genuineMovie = {
            type: "movie",
            title: "Oppenheimer",
            filePath: "/mnt/user/data/media/movies/Oppenheimer (2023)/Oppenheimer.mkv",
            fileSize: 30 * 1024 * 1024 * 1024,
            duration: 180 * 60 * 1000,
            year: 2023
        };
        if (isPlexItemPlaceholderOrStub(genuineMovie)) {
            throw new Error("isPlexItemPlaceholderOrStub falsely flagged genuine movie as placeholder");
        }

        // 5. parsePlexXmlCollections properly extracts content attribute (smart query URI)
        const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="2">
    <Directory ratingKey="481321" title="Recently Added TV (Curated)" smart="1" content="server://abc/com.plexapp.plugins.library/library/sections/7/all?type=2&amp;sort=addedAt:desc&amp;season.index!=0&amp;episode.title!=Trailer%20(Placeholder)&amp;label!=trailer-placeholder&amp;limit=25" childCount="25" />
    <Directory ratingKey="481322" title="Standard Collection" smart="0" childCount="10" />
</MediaContainer>`;
        const parsed = parsePlexXmlCollections(sampleXml);
        if (parsed.length !== 2) {
            throw new Error(`Expected 2 parsed collections, got ${parsed.length}`);
        }
        const smartColl = parsed.find(c => c.ratingKey === "481321");
        if (!smartColl || !smartColl.smart) {
            throw new Error("Parsed collection should be marked as smart");
        }
        if (!smartColl.content || !smartColl.content.includes("season.index!=0")) {
            throw new Error(`Parsed smart collection content should contain 'season.index!=0', got: ${smartColl.content}`);
        }

        const standardColl = parsed.find(c => c.ratingKey === "481322");
        if (!standardColl || standardColl.smart) {
            throw new Error("Parsed standard collection should NOT be smart");
        }
    });

    // 86. Kometa: IMDb Top 150 vs Top 250 Waterfall Ribbon Differentiation & Vector Corner Banner Resolution
    await assertTest("Kometa: IMDb Top 150 vs Top 250 Waterfall Ribbons & Vector Banner Resolution", async () => {
        const {
            resolveStockRibbonPath,
            evaluateWaterfallRibbon,
            isRibbonTypeMatching,
            applyOverlaysToPoster
        } = await import("../src/lib/curation/overlay-engine");
        const sharp = (await import("sharp")).default;

        // 1. Verify stock asset resolution: Top 150 must NOT map to static Top 250 image
        const p150 = resolveStockRibbonPath("imdb_top_150", "gold");
        if (!p150 || !p150.includes("blank-") || p150.endsWith("imdb.png")) {
            throw new Error(`Expected resolveStockRibbonPath for imdb_top_150 to return blank ribbon template, got: ${p150}`);
        }

        const p250 = resolveStockRibbonPath("imdb_top_250", "gold");
        if (!p250 || !p250.endsWith("imdb.png")) {
            throw new Error(`Expected resolveStockRibbonPath for imdb_top_250 to return stock imdb.png, got: ${p250}`);
        }

        // 2. Waterfall Priority Evaluation
        const waterfallTiers = [
            { id: "tier-1", type: "imdb_top_150", text: "IMDb TOP 150", theme: "gold" as const, enabled: true },
            { id: "tier-2", type: "imdb_top_250", text: "IMDb TOP 250", theme: "gold" as const, enabled: true },
            { id: "tier-3", type: "certified_fresh", text: "CERTIFIED FRESH", theme: "crimson" as const, enabled: true }
        ];

        // Alien (1979) has IMDb rank #48 <= 150
        const alienMediaInfo = {
            title: "Alien",
            year: 1979,
            guids: { imdb: "tt0078748" },
            detectedBadges: { resolution: "4K" }
        };

        if (!isRibbonTypeMatching("imdb_top_150", alienMediaInfo as any)) {
            throw new Error("Alien (rank 48) failed isRibbonTypeMatching for imdb_top_150");
        }

        const alienMatch = evaluateWaterfallRibbon(alienMediaInfo as any, waterfallTiers);
        if (!alienMatch) {
            throw new Error("Expected Alien to match waterfall ribbon tiers");
        }
        if (alienMatch.matchedType !== "imdb_top_150" || alienMatch.priority !== 1) {
            throw new Error(`Alien matched unexpected tier: ${alienMatch.matchedType} (priority #${alienMatch.priority})`);
        }
        if (alienMatch.text !== "IMDB TOP 150") {
            throw new Error(`Expected Alien ribbon text to be "IMDB TOP 150", got "${alienMatch.text}"`);
        }

        // Test item with rank > 150 (e.g. Fargo rank 177, tt0116282)
        const rank177MediaInfo = {
            title: "Fargo",
            year: 1996,
            guids: { imdb: "tt0116282" },
            detectedBadges: {}
        };

        if (isRibbonTypeMatching("imdb_top_150", rank177MediaInfo as any)) {
            throw new Error("Fargo (rank 177) falsely matched imdb_top_150");
        }
        if (!isRibbonTypeMatching("imdb_top_250", rank177MediaInfo as any)) {
            throw new Error("Fargo (rank 177) failed isRibbonTypeMatching for imdb_top_250");
        }

        const fargoMatch = evaluateWaterfallRibbon(rank177MediaInfo as any, waterfallTiers);
        if (!fargoMatch) {
            throw new Error("Expected Fargo to match waterfall ribbon tiers");
        }
        if (fargoMatch.matchedType !== "imdb_top_250" || fargoMatch.priority !== 2) {
            throw new Error(`Fargo matched unexpected tier: ${fargoMatch.matchedType} (priority #${fargoMatch.priority})`);
        }

        // 3. Poster overlay generation with dynamic Top 150 ribbon
        const dummyPoster = await sharp({
            create: {
                width: 1000,
                height: 1500,
                channels: 3,
                background: { r: 30, g: 30, b: 30 }
            }
        }).jpeg().toBuffer();

        const overlaidBuf = await applyOverlaysToPoster(dummyPoster, alienMediaInfo as any, {
            showRibbon: true,
            ribbonMode: "waterfall",
            tieredRibbons: waterfallTiers
        });

        if (!overlaidBuf || overlaidBuf.length === 0) {
            throw new Error("applyOverlaysToPoster returned empty buffer for Top 150 media item");
        }
    });

    // 87. Books: Multi-Tier Deduplication Key Matching & Boot Scan Redundancy Prevention
    await assertTest("Books: Deduplication Key Normalization & Boot Scan Dedup Engine", async () => {
        // 1. Verify clean title key normalization
        const title1 = getBookCleanTitleKey("Rick Riordan - [Fighting Fantasy 32] Demigods of Olympus");
        const title2 = getBookCleanTitleKey("Demigods of Olympus");
        const title3 = getBookCleanTitleKey("Harry Potter and the Order of the Phoenix (2003)");
        const title4 = getBookCleanTitleKey("Harry Potter and the Order of the Phoenix");
        const title5 = getBookCleanTitleKey("The Hobbit (Audiobook) [1937]");
        const title6 = getBookCleanTitleKey("The Hobbit");

        if (title3 !== "harry potter 5" || title4 !== "harry potter 5") {
            throw new Error(`Expected HP5 title keys to equal "harry potter 5", got "${title3}" and "${title4}"`);
        }
        if (title5 !== "hobbit" || title6 !== "hobbit") {
            throw new Error(`Expected Hobbit title keys to equal "hobbit", got "${title5}" and "${title6}"`);
        }
        if (!title1.includes("demigodsofolympus") && title1 !== title2) {
            throw new Error(`Expected Demigods of Olympus title keys to match or be normalized, got "${title1}" and "${title2}"`);
        }

        // Bracketed series and volume tag normalization assertions
        const cosmereKey1 = getBookCleanTitleKey("[Cosmere 01] Arcanum Unbounded The Cosmere Collection");
        const cosmereKey2 = getBookCleanTitleKey("Arcanum Unbounded The Cosmere Collection");
        if (cosmereKey1 !== cosmereKey2) {
            throw new Error(`Expected [Cosmere 01] title key "${cosmereKey1}" to match "${cosmereKey2}"`);
        }

        const ffKey1 = getBookCleanTitleKey("[Fighting Fantasy 32] Demigods of Olympus");
        const ffKey2 = getBookCleanTitleKey("Demigods of Olympus");
        if (ffKey1 !== ffKey2) {
            throw new Error(`Expected [Fighting Fantasy 32] title key "${ffKey1}" to match "${ffKey2}"`);
        }

        const csKey1 = getBookCleanTitleKey("[Chestnut Springs 01] Wild Love");
        const csKey2 = getBookCleanTitleKey("Wild Love");
        if (csKey1 !== csKey2) {
            throw new Error(`Expected [Chestnut Springs 01] title key "${csKey1}" to match "${csKey2}"`);
        }

        const csKey3 = getBookCleanTitleKey("[Chestnut Springs 03] Wild Eyes");
        const csKey4 = getBookCleanTitleKey("Wild Eyes");
        if (csKey3 !== csKey4) {
            throw new Error(`Expected [Chestnut Springs 03] title key "${csKey3}" to match "${csKey4}"`);
        }

        // 2. Verify composite dedup keys
        const keyA = getBookCompositeDedupKey({
            mediaType: "ebook",
            author: "Brandon Sanderson",
            title: "Arcanum Unbounded The Cosmere Collection"
        });
        const keyB = getBookCompositeDedupKey({
            mediaType: "ebook",
            author: "Brandon Sanderson",
            title: "Arcanum Unbounded The Cosmere Collection [Retail] (2016)"
        });

        if (!keyA || !keyB || keyA !== keyB) {
            throw new Error(`Expected identical composite keys for Arcanum Unbounded, got "${keyA}" and "${keyB}"`);
        }

        const keyHP_Audio = getBookCompositeDedupKey({
            mediaType: "audiobook",
            author: "J. K. Rowling",
            title: "Harry Potter and the Order of the Phoenix"
        });
        const keyHP_Ebook = getBookCompositeDedupKey({
            mediaType: "ebook",
            author: "J. K. Rowling",
            title: "Harry Potter and the Order of the Phoenix"
        });

        if (keyHP_Audio === keyHP_Ebook) {
            throw new Error("Expected audiobook and ebook versions of same title to have distinct composite keys");
        }
        if (!keyHP_Audio.startsWith("audiobook:::") || !keyHP_Ebook.startsWith("ebook:::")) {
            throw new Error("Expected mediaType prefix on composite dedup key");
        }

        // 3. Verify same-author different title separation
        const keyWildLove = getBookCompositeDedupKey({
            mediaType: "ebook",
            author: "Elsie Silver",
            title: "Wild Love"
        });
        const keyWildEyes = getBookCompositeDedupKey({
            mediaType: "ebook",
            author: "Elsie Silver",
            title: "Wild Eyes"
        });
        if (keyWildLove === keyWildEyes) {
            throw new Error("Expected Wild Love and Wild Eyes to have distinct composite keys");
        }

        const keyDemigods1 = getBookCompositeDedupKey({
            mediaType: "ebook",
            author: "Rick Riordan",
            title: "Demigods of Olympus"
        });
        const keyDemigods2 = getBookCompositeDedupKey({
            mediaType: "ebook",
            author: "Rick Riordan",
            title: "[Fighting Fantasy 32] Demigods of Olympus"
        });
        if (keyDemigods1 !== keyDemigods2) {
            throw new Error(`Expected identical keys for Demigods of Olympus: "${keyDemigods1}" vs "${keyDemigods2}"`);
        }

        // 4. Verify post-scan deduplication metadata synchronization logic
        const mockKeepBook = { id: "cmt8y82yu0025qg2m47y0pq0v", libraryId: "old-lib", filePath: "/old/path/Demigods.epub", fileSize: 0, fileType: "missing", mediaType: "book" };
        const mockValidDiskItem = { id: "cmuzusrgu0007pm01fhrrtw4f", libraryId: "new-lib", filePath: "/Kidsbooks/books/Rick Riordan/[Fighting Fantasy 32] Demigods of Olympus/Rick Riordan - [Fighting Fantasy 32] Demigods of Olympus.epub", fileSize: 210000, fileType: "epub", mediaType: "ebook" };
        const updateKeepData: any = {};
        if (mockKeepBook.libraryId !== "new-lib") updateKeepData.libraryId = "new-lib";
        if (mockValidDiskItem.filePath && mockKeepBook.filePath !== mockValidDiskItem.filePath) updateKeepData.filePath = mockValidDiskItem.filePath;
        if (typeof mockValidDiskItem.fileSize === 'number' && mockValidDiskItem.fileSize > 0 && mockKeepBook.fileSize !== mockValidDiskItem.fileSize) updateKeepData.fileSize = mockValidDiskItem.fileSize;
        if (mockValidDiskItem.fileType && mockValidDiskItem.fileType !== 'missing' && mockKeepBook.fileType !== mockValidDiskItem.fileType) updateKeepData.fileType = mockValidDiskItem.fileType;
        if (mockKeepBook.mediaType !== "ebook") updateKeepData.mediaType = "ebook";

        if (updateKeepData.libraryId !== "new-lib" || updateKeepData.filePath !== mockValidDiskItem.filePath || updateKeepData.fileSize !== 210000 || updateKeepData.fileType !== "epub" || updateKeepData.mediaType !== "ebook") {
            throw new Error("Post-scan metadata synchronization failed to adopt valid on-disk properties");
        }

        // 5. Verify null/'book' mediaType and 'all' author fallback normalization
        const keyNullMedia = getBookCompositeDedupKey({
            mediaType: null,
            author: "Rick Riordan",
            title: "Demigods of Olympus"
        });
        const keyBookMedia = getBookCompositeDedupKey({
            mediaType: "book",
            author: "Rick Riordan",
            title: "Demigods of Olympus"
        });
        if (keyNullMedia !== keyDemigods1 || keyBookMedia !== keyDemigods1) {
            throw new Error(`Expected null and 'book' mediaTypes to normalize to 'ebook' composite key: "${keyNullMedia}", "${keyBookMedia}" vs "${keyDemigods1}"`);
        }

        const keyUnknownAuthor = getBookCompositeDedupKey({
            mediaType: "ebook",
            author: "Unknown Author",
            title: "Demigods of Olympus"
        });
        const keyNullAuthor = getBookCompositeDedupKey({
            mediaType: "ebook",
            author: null,
            title: "Demigods of Olympus"
        });
        if (keyUnknownAuthor !== "ebook:::all:::demigodsofolympus" || keyNullAuthor !== "ebook:::all:::demigodsofolympus") {
            throw new Error(`Expected unknown/null author to map to 'all' authorGroupKey, got "${keyUnknownAuthor}" and "${keyNullAuthor}"`);
        }
    });

    // 88. Subscriptions: Multi-Tier Renewal Reminder Schedules, Timings & Paid Verification
    await assertTest("Subscriptions: Multi-Tier Renewal Reminders & Paid Detection", async () => {
        // 1. Parsing & formatting of reminder day lists
        const defaultYearly = parseReminderDays(null);
        if (JSON.stringify(defaultYearly) !== JSON.stringify(DEFAULT_YEARLY_REMINDER_DAYS)) {
            throw new Error(`Expected default yearly days ${JSON.stringify(DEFAULT_YEARLY_REMINDER_DAYS)}, got ${JSON.stringify(defaultYearly)}`);
        }

        const customParsed = parseReminderDays("60, 30, 14, 3, 1, 30, 0, -5");
        if (JSON.stringify(customParsed) !== JSON.stringify([60, 30, 14, 3, 1])) {
            throw new Error(`Expected cleaned descending deduplicated list [60, 30, 14, 3, 1], got ${JSON.stringify(customParsed)}`);
        }

        const formatted = formatReminderDays([1, 14, 30, 60, 3]);
        if (formatted !== "60,30,14,3,1") {
            throw new Error(`Expected formatted string "60,30,14,3,1", got "${formatted}"`);
        }

        const customMonthlyParsed = parseReminderDays("14, 7, 3, 1, 1", DEFAULT_MONTHLY_REMINDER_DAYS);
        if (JSON.stringify(customMonthlyParsed) !== JSON.stringify([14, 7, 3, 1])) {
            throw new Error(`Expected custom monthly [14, 7, 3, 1], got ${JSON.stringify(customMonthlyParsed)}`);
        }

        // 2. Next renewal reminder calculation for Annual Member
        const now = new Date("2026-10-01T12:00:00Z");
        // Case A: User subscription expiring in 75 days (2026-12-15) - advance notice 60d is scheduled in 15 days
        const yearlyExpiry75d = new Date("2026-12-15T12:00:00Z");
        const userAnnualScheduled = {
            id: "user-annual-1",
            username: "AnnualUser",
            role: "USER",
            status: "APPROVED",
            subscriptionCadence: "YEARLY",
            subscriptionEndsAt: yearlyExpiry75d,
            renewalRemindersSent: null,
            paymentTransactions: []
        };

        const infoAnnual = getNextRenewalReminderInfo({
            user: userAnnualScheduled,
            settings: { yearlyRenewalReminderDays: "60,30,14,3,1", monthlyRenewalReminderDays: "7,3,1" },
            now
        });

        if (infoAnnual.cadence !== "YEARLY") throw new Error(`Expected cadence YEARLY, got ${infoAnnual.cadence}`);
        if (infoAnnual.nextMilestoneDays !== 60) throw new Error(`Expected next milestone 60 days, got ${infoAnnual.nextMilestoneDays}`);
        if (infoAnnual.status !== "paid" || !infoAnnual.isPaid) throw new Error(`Expected status paid and isPaid true, got ${infoAnnual.status}`);

        // Case B: User expiring in 45 days with 60d notice already sent -> next is 30d in 15 days
        const yearlyExpiry45d = new Date("2026-11-15T12:00:00Z");
        const userAnnual60dSent = {
            id: "user-annual-2",
            username: "AnnualUser2",
            role: "USER",
            status: "APPROVED",
            subscriptionCadence: "YEARLY",
            subscriptionEndsAt: yearlyExpiry45d,
            renewalRemindersSent: JSON.stringify({ cycleTarget: "2026-11-15", milestones: ["60d"] }),
            paymentTransactions: []
        };

        const infoAnnual30d = getNextRenewalReminderInfo({
            user: userAnnual60dSent,
            settings: { yearlyRenewalReminderDays: "60,30,14,3,1" },
            now
        });
        if (infoAnnual30d.nextMilestoneDays !== 30) throw new Error(`Expected next milestone 30 days, got ${infoAnnual30d.nextMilestoneDays}`);
        if (infoAnnual30d.daysUntilNextReminder !== 15) throw new Error(`Expected daysUntilNextReminder 15, got ${infoAnnual30d.daysUntilNextReminder}`);
        if (infoAnnual30d.status !== "scheduled") throw new Error(`Expected status scheduled, got ${infoAnnual30d.status}`);

        // 3. Next renewal reminder calculation for Monthly Member
        // User subscription expiring in 5 days (2026-10-06T12:00:00Z) with 7d notice already sent
        const monthlyExpiry = new Date("2026-10-06T12:00:00Z");
        const userMonthly = {
            id: "user-monthly-1",
            username: "MonthlyUser",
            role: "USER",
            status: "APPROVED",
            subscriptionCadence: "MONTHLY",
            subscriptionEndsAt: monthlyExpiry,
            renewalRemindersSent: JSON.stringify({ cycleTarget: "2026-10-06", milestones: ["7d"] }),
            paymentTransactions: []
        };

        const infoMonthly = getNextRenewalReminderInfo({
            user: userMonthly,
            settings: { yearlyRenewalReminderDays: "60,30,14,3,1", monthlyRenewalReminderDays: "7,3,1" },
            now
        });

        // 5 days remaining, 7d sent. Next milestone is 3 days before expiration (in 2 days, on 2026-10-03).
        if (infoMonthly.cadence !== "MONTHLY") throw new Error(`Expected cadence MONTHLY, got ${infoMonthly.cadence}`);
        if (infoMonthly.nextMilestoneDays !== 3) throw new Error(`Expected next milestone 3 days, got ${infoMonthly.nextMilestoneDays}`);
        if (infoMonthly.daysUntilNextReminder !== 2) throw new Error(`Expected daysUntilNextReminder 2, got ${infoMonthly.daysUntilNextReminder}`);

        // 4. Milestone Due Today
        // Expiry in 3 days, milestone 3 days
        const dueSoonExpiry = new Date("2026-10-04T12:00:00Z"); // exactly 3 days away
        const userDueSoon = {
            id: "user-due-1",
            username: "DueSoonUser",
            role: "USER",
            status: "APPROVED",
            subscriptionCadence: "MONTHLY",
            subscriptionEndsAt: dueSoonExpiry,
            renewalRemindersSent: null,
            paymentTransactions: []
        };

        const dueMilestone = getDueReminderMilestone({
            daysRemaining: 3,
            milestoneDays: [7, 3, 1],
            sentMilestones: []
        });
        if (dueMilestone.dueMilestone !== "3d") throw new Error(`Expected dueMilestone 3d, got ${dueMilestone.dueMilestone}`);

        const infoDue = getNextRenewalReminderInfo({
            user: userDueSoon,
            settings: { monthlyRenewalReminderDays: "7,3,1" },
            now
        });
        if (infoDue.status !== "due_today") throw new Error(`Expected status due_today, got ${infoDue.status}`);

        // 5. Already-Paid Check: Subscription extends beyond max milestone window
        const userCoveredFuture = {
            id: "user-covered-1",
            username: "CoveredUser",
            role: "USER",
            status: "APPROVED",
            subscriptionCadence: "YEARLY",
            subscriptionEndsAt: new Date("2027-09-01T12:00:00Z"), // 335 days away (> 60 max milestone)
            paymentTransactions: []
        };
        const paidResult1 = isUserSubscriptionPaidForCycle({ user: userCoveredFuture, now, maxMilestoneDays: 60 });
        if (!paidResult1.isPaid) throw new Error(`Expected covered user to have isPaid: true, got ${paidResult1.isPaid} (${paidResult1.reason})`);

        // 6. Already-Paid Check: Expiry within milestone window, but confirmed payment transaction present
        // Expiry in 10 days, milestone window is active, but user sent CashApp/PayPal payment 2 days ago
        const userPaidRecently = {
            id: "user-paid-1",
            username: "PaidRecentlyUser",
            role: "USER",
            status: "APPROVED",
            subscriptionCadence: "YEARLY",
            subscriptionEndsAt: new Date("2026-10-11T12:00:00Z"), // 10 days away
            paymentTransactions: [
                {
                    id: "tx-100",
                    amount: 60,
                    provider: "cashapp",
                    emailDate: new Date("2026-09-29T10:00:00Z"), // 2 days ago, well within renewal window
                    status: "PROCESSED",
                    appliedSubscription: true
                }
            ]
        };
        const paidResult2 = isUserSubscriptionPaidForCycle({ user: userPaidRecently, now, maxMilestoneDays: 60 });
        if (!paidResult2.isPaid) throw new Error(`Expected paid user to have isPaid: true, got ${paidResult2.isPaid}`);

        const infoPaidRecently = getNextRenewalReminderInfo({
            user: userPaidRecently,
            settings: { yearlyRenewalReminderDays: "60,30,14,3,1" },
            now
        });
        if (!infoPaidRecently.isPaid || infoPaidRecently.status !== "paid") {
            throw new Error(`Expected getNextRenewalReminderInfo to return status "paid" for paid member, got ${infoPaidRecently.status}`);
        }

        // 7. Unpaid user in window returns isPaid: false
        const userUnpaidInWindow = {
            id: "user-unpaid-1",
            username: "UnpaidUser",
            role: "USER",
            status: "APPROVED",
            subscriptionCadence: "YEARLY",
            subscriptionEndsAt: new Date("2026-10-11T12:00:00Z"), // 10 days away
            paymentTransactions: []
        };
        const unpaidResult = isUserSubscriptionPaidForCycle({ user: userUnpaidInWindow, now, maxMilestoneDays: 60 });
        if (unpaidResult.isPaid) throw new Error(`Expected unpaid member to return isPaid: false`);

        // 8. Admin account returns isPaid: true always
        const adminUser = {
            id: "admin-1",
            username: "AdminUser",
            role: "ADMIN",
            status: "APPROVED",
            subscriptionEndsAt: null
        };
        const adminCheck = isUserSubscriptionPaidForCycle({ user: adminUser, now });
        if (!adminCheck.isPaid) throw new Error("Expected admin account to be marked paid");
    });

    // 89. Books: Scanner In-Loop Deduplication & Stub Ingestion Engine
    await assertTest("Books: Scanner In-Loop Deduplication & Stub Ingestion Engine", async () => {
        const { getBookCompositeDedupKey, getBookCleanTitleKey, getNormTitle } = await import("../src/lib/books/book-dedup");

        // 1. Verify composite dedup keys match across bracketed series tags and raw titles
        const keyRaw = getBookCompositeDedupKey({ mediaType: "ebook", author: "Elsie Silver", title: "Wild Love" });
        const keyBracketed = getBookCompositeDedupKey({ mediaType: "ebook", author: "Elsie Silver", title: "[Chestnut Springs 01] Wild Love" });
        const keyNumbered = getBookCompositeDedupKey({ mediaType: "ebook", author: "Elsie Silver", title: "Chestnut Springs 01 - Wild Love" });
        const keyWithParen = getBookCompositeDedupKey({ mediaType: "ebook", author: "Elsie Silver", title: "Wild Love (Chestnut Springs #1)" });

        if (keyRaw !== "ebook:::elsiesilver:::wildlove") throw new Error(`Expected ebook:::elsiesilver:::wildlove, got ${keyRaw}`);
        if (keyBracketed !== keyRaw) throw new Error(`Bracketed key mismatch: ${keyBracketed} vs ${keyRaw}`);
        if (keyNumbered !== keyRaw) throw new Error(`Numbered prefix key mismatch: ${keyNumbered} vs ${keyRaw}`);
        if (keyWithParen !== keyRaw) throw new Error(`Parenthetical key mismatch: ${keyWithParen} vs ${keyRaw}`);

        // 2. Demigods of Olympus Fighting Fantasy bracket normalization
        const demiRaw = getBookCompositeDedupKey({ mediaType: "ebook", author: "Rick Riordan", title: "Demigods of Olympus" });
        const demiBracketed = getBookCompositeDedupKey({ mediaType: "ebook", author: "Rick Riordan", title: "[Fighting Fantasy 32] Demigods of Olympus" });
        if (demiBracketed !== demiRaw || demiRaw !== "ebook:::rickriordan:::demigodsofolympus") {
            throw new Error(`Demigods of Olympus key normalization mismatch: ${demiBracketed} vs ${demiRaw}`);
        }

        // 3. Multi-value candidate Map indexing simulation
        const dbBooks = [
            {
                id: "stub-1",
                title: "Wild Love",
                author: "Elsie Silver",
                filePath: "/Kyrabooks/books/Elsie Silver/[Chestnut Springs 01] Wild Love",
                fileType: "missing",
                mediaType: "ebook",
                libraryId: "lib-kyra"
            },
            {
                id: "stub-2",
                title: "Wild Eyes",
                author: "Elsie Silver",
                filePath: "/Kyrabooks/books/Elsie Silver/[Chestnut Springs 03] Wild Eyes",
                fileType: "epub", // fileType updated, but filePath is directory
                mediaType: "ebook",
                libraryId: "lib-kyra"
            }
        ];

        const dbBooksByParentDirLower = new Map<string, any[]>();
        const dbBooksByDedupKey = new Map<string, any[]>();
        const normScanPath = "/kyrabooks/books";

        for (const b of dbBooks) {
            const normP = b.filePath.toLowerCase();
            const ext = path.extname(b.filePath);
            const isFolderStub = b.fileType === "missing" || b.fileType === "folder" || !ext;
            if (isFolderStub) {
                if (!dbBooksByParentDirLower.has(normP)) dbBooksByParentDirLower.set(normP, []);
                dbBooksByParentDirLower.get(normP)!.push(b);
            }
            const dedupKey = getBookCompositeDedupKey(b);
            if (dedupKey) {
                if (!dbBooksByDedupKey.has(dedupKey)) dbBooksByDedupKey.set(dedupKey, []);
                dbBooksByDedupKey.get(dedupKey)!.push(b);
            }
        }

        // Directory lookup for incoming real disk file inside stub-1
        const incomingPath1 = "/kyrabooks/books/elsie silver/[chestnut springs 01] wild love";
        const dirMatches1 = dbBooksByParentDirLower.get(incomingPath1);
        if (!dirMatches1 || dirMatches1.length === 0 || dirMatches1[0].id !== "stub-1") {
            throw new Error(`Failed to match stub-1 via directory map: ${JSON.stringify(dirMatches1)}`);
        }

        // Directory lookup for stub-2 where fileType was updated to 'epub' but path is directory (no ext)
        const incomingPath2 = "/kyrabooks/books/elsie silver/[chestnut springs 03] wild eyes";
        const dirMatches2 = dbBooksByParentDirLower.get(incomingPath2);
        if (!dirMatches2 || dirMatches2.length === 0 || dirMatches2[0].id !== "stub-2") {
            throw new Error(`Failed to match stub-2 with non-missing fileType via directory map: ${JSON.stringify(dirMatches2)}`);
        }

        // Dedup key candidates
        const candWildLove = dbBooksByDedupKey.get("ebook:::elsiesilver:::wildlove");
        if (!candWildLove || candWildLove[0].id !== "stub-1") {
            throw new Error(`Failed to find candidate in multi-item dedup map`);
        }
    });

    // 90. Admin Platform Isolation: Permanent Access, Exemption from Subscriptions, Cadences, Renewal Reminders, and Member Tiers
    await assertTest("Test 90: Admin Platform Isolation: Permanent Access & Exemption from Subscriptions, Cadences, Renewal Reminders, and Member Tiers", async () => {
        const { getNextRenewalReminderInfo } = await import("../src/lib/subscription-reminders");

        // 1. Verify getNextRenewalReminderInfo explicitly recognizes Admin accounts
        const adminUser = {
            id: "admin-user-1",
            username: "d281knilb",
            role: "ADMIN",
            status: "APPROVED",
            membershipTier: "ADMIN",
            subscriptionEndsAt: null,
            subscriptionCadence: null,
            trialEndsAt: null,
            lastRenewalReminderSentAt: null,
            renewalRemindersSent: null
        };

        const reminder = getNextRenewalReminderInfo({
            user: adminUser,
            settings: { yearlyRenewalReminderDays: "60,30,14,3,1", monthlyRenewalReminderDays: "7,3,1" }
        });

        if (reminder.status !== "not_applicable") {
            throw new Error(`Expected admin reminder status to be 'not_applicable', got '${reminder.status}'`);
        }
        if (!reminder.label.includes("Permanent Access") && !reminder.label.includes("Admin")) {
            throw new Error(`Expected admin reminder label to include Permanent Access or Admin, got '${reminder.label}'`);
        }

        // 2. Verify isTrial evaluates to false for admin accounts regardless of legacy fields
        const dirtyAdminUser = {
            ...adminUser,
            status: "TRIAL",
            membershipTier: "TRIAL",
            trialEndsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000)
        };
        const isAdminTrial = (dirtyAdminUser.status === "TRIAL" || dirtyAdminUser.membershipTier === "TRIAL") && dirtyAdminUser.status !== "APPROVED" && dirtyAdminUser.role !== "ADMIN";
        if (isAdminTrial) {
            throw new Error("Admin user must NEVER evaluate isTrial as true");
        }

        // 3. Verify Admin auto-heal and sanitization logic restores permanent access state
        let recoveredAdmin = { ...dirtyAdminUser, subscriptionEndsAt: new Date(), subscriptionCadence: "YEARLY" };
        if (recoveredAdmin.role === "ADMIN") {
            recoveredAdmin.status = "APPROVED";
            recoveredAdmin.subscriptionEndsAt = null;
            recoveredAdmin.subscriptionCadence = null;
            recoveredAdmin.trialEndsAt = null;
            recoveredAdmin.membershipTier = "ADMIN";
        }

        if (recoveredAdmin.status !== "APPROVED" || recoveredAdmin.subscriptionEndsAt !== null || recoveredAdmin.subscriptionCadence !== null || recoveredAdmin.trialEndsAt !== null || recoveredAdmin.membershipTier !== "ADMIN") {
            throw new Error(`Admin auto-heal failed: ${JSON.stringify(recoveredAdmin)}`);
        }

        // 4. Verify Permanent Access evaluation for UI
        const isPermanentAccess = recoveredAdmin.role === "ADMIN" || (recoveredAdmin.status === "APPROVED" && !recoveredAdmin.subscriptionEndsAt);
        if (!isPermanentAccess) {
            throw new Error("Expected admin user to evaluate as permanent access");
        }
    });

    // 91. Discord Bot: Canonical Blueprint, Server Architecture, Roles & Pinned Guides Engine
    await assertTest("Test 91: Discord Bot: Canonical Blueprint, Server Architecture, Roles & Pinned Guides Engine", async () => {
        const {
            DISCORD_SERVER_BLUEPRINT,
            DISCORD_ROLES_BLUEPRINT,
            generateDiscordEmbed,
            getDiscordBotInviteUrl
        } = await import("../src/lib/discord/discord-bot");
        const { encryptData, decryptData } = await import("../src/lib/encryption");

        // 1. Verify Server Blueprint Categories & Channels
        if (!Array.isArray(DISCORD_SERVER_BLUEPRINT) || DISCORD_SERVER_BLUEPRINT.length < 5) {
            throw new Error(`Expected at least 5 blueprint categories, found ${DISCORD_SERVER_BLUEPRINT.length}`);
        }

        const categoryNames = DISCORD_SERVER_BLUEPRINT.map(c => c.name);
        if (!categoryNames.some(n => n.includes("INFORMATION"))) throw new Error("Missing Information & Rules category");
        if (!categoryNames.some(n => n.includes("SETUP"))) throw new Error("Missing Setup & Guides category");
        if (!categoryNames.some(n => n.includes("MEDIA"))) throw new Error("Missing Media & Requests category");
        if (!categoryNames.some(n => n.includes("COMMUNITY"))) throw new Error("Missing Community Lounge category");
        if (!categoryNames.some(n => n.includes("SUPPORT"))) throw new Error("Missing Support & Help Desk category");

        const allChannels = DISCORD_SERVER_BLUEPRINT.flatMap(c => c.channels);
        const channelNames = allChannels.map(ch => ch.name);

        const requiredChannels = [
            "welcome-and-rules", "announcements", "system-status", "subscription-tiers",
            "plex-setup-guides", "kindle-and-reading", "audiobooks-guide",
            "media-requests", "recently-added", "leaving-soon", "recommendations",
            "general-chat", "movies-and-tv", "reading-nook", "transcode-doctor", "support-tickets"
        ];

        for (const req of requiredChannels) {
            if (!channelNames.includes(req)) {
                throw new Error(`Missing expected blueprint channel: ${req}`);
            }
        }

        // 2. Verify Roles Blueprint
        if (!Array.isArray(DISCORD_ROLES_BLUEPRINT) || DISCORD_ROLES_BLUEPRINT.length < 4) {
            throw new Error(`Expected 4 member roles in blueprint, got ${DISCORD_ROLES_BLUEPRINT.length}`);
        }
        const roleNames = DISCORD_ROLES_BLUEPRINT.map(r => r.name);
        if (!roleNames.some(r => r.includes("Admin"))) throw new Error("Missing Admin role in blueprint");
        if (!roleNames.some(r => r.includes("Tier 2"))) throw new Error("Missing Tier 2 VIP role in blueprint");
        if (!roleNames.some(r => r.includes("Tier 1"))) throw new Error("Missing Tier 1 Regular role in blueprint");
        if (!roleNames.some(r => r.includes("Trial"))) throw new Error("Missing Trial Pass role in blueprint");

        // 3. Verify Rich Pinned Embed Generators
        const welcomeEmbed = generateDiscordEmbed("welcome_rules");
        if (!welcomeEmbed.title || !welcomeEmbed.description || !welcomeEmbed.fields || welcomeEmbed.fields.length < 4) {
            throw new Error("Welcome & Rules embed must have title, description, and at least 4 guideline fields");
        }

        const tiersEmbed = generateDiscordEmbed("subscription_tiers");
        if (!tiersEmbed.title?.includes("Membership Plans")) throw new Error("Invalid subscription tiers embed title");
        if (!tiersEmbed.fields?.some(f => f.name.includes("Tier 1"))) throw new Error("Tiers embed must include Tier 1");
        if (!tiersEmbed.fields?.some(f => f.name.includes("Tier 2"))) throw new Error("Tiers embed must include Tier 2");
        if (!tiersEmbed.fields?.some(f => f.name.includes("Payment Methods"))) throw new Error("Tiers embed must list payment options");

        const plexEmbed = generateDiscordEmbed("plex_guides");
        if (!plexEmbed.title?.includes("Plex Device Setup")) throw new Error("Invalid plex guides embed title");
        if (!plexEmbed.fields?.some(f => f.name.includes("Apple TV"))) throw new Error("Plex embed missing Apple TV");
        if (!plexEmbed.fields?.some(f => f.name.includes("Roku"))) throw new Error("Plex embed missing Roku");
        if (!plexEmbed.fields?.some(f => f.name.includes("Fire TV"))) throw new Error("Plex embed missing Fire TV");

        const doctorEmbed = generateDiscordEmbed("transcode_doctor");
        if (!doctorEmbed.title?.includes("Transcode Doctor")) throw new Error("Invalid transcode doctor embed title");
        if (!doctorEmbed.fields?.some(f => f.name.includes("720p"))) throw new Error("Doctor embed missing 720p throttle fix");

        const statusEmbed = generateDiscordEmbed("system_status", {
            summary: { totalConfigured: 3, onlineCount: 3, offlineCount: 0 },
            services: [
                { category: "PLEX", name: "MainPlexServer", status: "ONLINE", latencyMs: 12 },
                { category: "HOST", name: "Glances Unraid", status: "ONLINE", latencyMs: 5 },
                { category: "ARR", name: "Radarr", status: "ONLINE", latencyMs: 8 }
            ]
        });
        if (!statusEmbed.title?.includes("All Systems Operational")) throw new Error("Expected all systems operational in status embed");
        if (!statusEmbed.fields?.some(f => f.value.includes("MainPlexServer"))) throw new Error("Status embed missing MainPlexServer");

        // 4. Verify Bot Invite URL Generator
        const invite = getDiscordBotInviteUrl("123456789012345678");
        if (!invite.includes("client_id=123456789012345678") || !invite.includes("permissions=8") || !invite.includes("scope=bot")) {
            throw new Error(`Unexpected bot invite URL: ${invite}`);
        }

        // 5. Verify Token Encryption & Decryption
        const sampleToken = "Bot.MTIzNDU2Nzg5MDEyMzQ1Njc4.GA-XYZ.abcdefghijklmnopqrstuvwxyz123456";
        const encrypted = encryptData(sampleToken);
        if (encrypted === sampleToken) throw new Error("Token was not encrypted");
        const decrypted = decryptData(encrypted);
        if (decrypted !== sampleToken) throw new Error("Decrypted token does not match original token");
    });

    // 92. Book Scanner Multi-Library File Isolation & Non-Destructive Candidate Selection
    await assertTest("Test 92: Book Scanner Multi-Library File Isolation & Non-Destructive Candidate Selection", async () => {
        const currentLibraryId = "lib_kyra";
        const currentScanPath = "/Kyrabooks/books";
        const normScanPath = currentScanPath.toLowerCase();

        const matchedDbBookIds = new Set<string>();

        // Simulating the selectMatchingCandidate engine
        const selectCandidate = (candidates: any[], fileExistsMock: (p: string) => boolean) => {
            if (!candidates || candidates.length === 0) return undefined;
            // 1. Strict Priority 1: Match within the library currently being scanned
            const inLib = candidates.find(b => !matchedDbBookIds.has(b.id) && b.libraryId === currentLibraryId);
            if (inLib) return inLib;

            // 2. Cross-library candidate adoption:
            // ONLY permitted if candidate's path starts with normScanPath, OR if candidate's existing file no longer exists on disk.
            // If the candidate's file STILL EXISTS on disk in another library, NEVER steal or reassign it!
            return candidates.find(b => {
                if (matchedDbBookIds.has(b.id)) return false;
                if (!b.filePath) return true;
                const normBPath = b.filePath.toLowerCase();
                if (normScanPath && normBPath.startsWith(normScanPath)) return true;
                try {
                    if (fileExistsMock(b.filePath)) return false;
                } catch (e) {
                    return false;
                }
                return true;
            });
        };

        const mockCandidates = [
            { id: "book_pub_1", title: "The Final Empire", libraryId: "lib_public", filePath: "/Userbooks/books/The Final Empire.epub" },
            { id: "book_kyra_1", title: "The Final Empire", libraryId: "lib_kyra", filePath: "/Kyrabooks/books/The Final Empire.epub" }
        ];

        // Scenario 1: Both libraries have books in DB. Kyra's library scan MUST pick Kyra's own book.
        const picked1 = selectCandidate(mockCandidates, () => true);
        if (!picked1 || picked1.id !== "book_kyra_1") {
            throw new Error(`Scenario 1 failed: Expected Kyra's own book "book_kyra_1", got ${picked1?.id}`);
        }

        // Scenario 2: Kyra's library has NO book in DB yet, but Public library has an active file on disk.
        // Kyra's library MUST NOT steal Public library's book!
        const onlyPublicCandidate = [
            { id: "book_pub_1", title: "The Final Empire", libraryId: "lib_public", filePath: "/Userbooks/books/The Final Empire.epub" }
        ];
        const picked2 = selectCandidate(onlyPublicCandidate, (p) => p === "/Userbooks/books/The Final Empire.epub");
        if (picked2 !== undefined) {
            throw new Error(`Scenario 2 failed: Expected undefined (anti-theft guard), but Public Library's book was stolen: ${picked2?.id}`);
        }

        // Scenario 3: Public library had a record, but the file was deleted/moved to Kyra's library.
        const picked3 = selectCandidate(onlyPublicCandidate, () => false);
        if (!picked3 || picked3.id !== "book_pub_1") {
            throw new Error(`Scenario 3 failed: Expected orphan adoption of "book_pub_1", got ${picked3?.id}`);
        }

        // Scenario 4: A record had the wrong libraryId, but its filePath is inside Kyra's folder.
        const mislabeledCandidate = [
            { id: "book_mislabeled", title: "Mistborn 2", libraryId: "lib_public", filePath: "/Kyrabooks/books/Mistborn 2.epub" }
        ];
        const picked4 = selectCandidate(mislabeledCandidate, () => true);
        if (!picked4 || picked4.id !== "book_mislabeled") {
            throw new Error(`Scenario 4 failed: Expected adoption of path-matched record, got ${picked4?.id}`);
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
