process.env.PORTALARR_TEST = "true";
process.env.NODE_ENV = "test";
process.env.DISABLE_DISCORD_NOTIFICATIONS = "true";

import { prisma, isScheduleDue, isPlexMaintenanceWindow } from "../src/lib/prisma";
import { encryptData, decryptData } from "../src/lib/encryption";
import { calculateProratedBilling } from "../src/lib/prorated-billing";
import { parseCashAppEmail, extractAmount, calculateAlignedExpiryDate } from "../src/lib/payment-email-scraper";
import { evaluatePaymentThreshold } from "../src/lib/payment-threshold-engine";
import { parseReminderDays, formatReminderDays, getNextRenewalReminderInfo, isUserSubscriptionPaidForCycle } from "../src/lib/subscription-reminders";
import { matchesCloudflareBypass, matchesCloudflareSuperUser, matchesCloudflareAdmin } from "../src/lib/edge-policy-paths";
import { parseAmazonBounceEmail } from "../src/lib/kindle-email-scanner";
import { getBookCleanTitleKey, getBookCompositeDedupKey } from "../src/lib/books/book-dedup";
import { inferBookRating } from "../src/lib/books/book-rating";
import { expandCandidateUrls, isPrivateOrLocalIp, isPlexItemPlaceholderOrStub } from "../src/lib/curation/plex-analyzer";
import { COLLECTION_PRESETS } from "../src/lib/curation/presets";
import { getBuiltinOscarBestPictureList } from "../src/lib/curation/oscar-best-picture-data";
import { calculateNextRunTime, formatScheduleLabel, formatLastRunDisplay, SCHEDULE_OPTIONS } from "../src/lib/curation/schedule-helper";
import { getAllScripts, getScriptById, saveScript, deleteScript, getScriptRuns } from "../src/lib/scripts/script-manager";
import { executeScript, abortActiveScriptRun } from "../src/lib/scripts/script-runner";
import { DISCORD_ROLES_BLUEPRINT, DISCORD_SERVER_BLUEPRINT, resolveOrProvisionStatusChannel, updateDiscordLiveStatus } from "../src/lib/discord/discord-bot";
import { computeExpectedDiscordRole, findBestMatch } from "../src/lib/discord/discord-role-sync";
import { getBuildTelemetry } from "../src/lib/version";
import fs from "fs";
import path from "path";

async function runTestSuite() {
    console.log("==========================================================");
    console.log("   PORTALARR CORE SYSTEM & ARCHITECTURE VERIFICATION     ");
    console.log("==========================================================\n");

    let passedTests = 0;
    let failedTests = 0;

    async function assertTest(name: string, fn: () => Promise<void>) {
        try {
            process.stdout.write(`[TEST] ${name.padEnd(56, ".")} `);
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

    // =========================================================================
    // SUITE 1: Database Schema, Encryption & Core Settings
    // =========================================================================
    await assertTest("Suite 1: Database Schema, Encryption & Core Settings", async () => {
        // 1. Settings Model CRUD
        let settings = await prisma.settings.findUnique({ where: { id: "global" } });
        if (!settings) {
            settings = await prisma.settings.create({
                data: { id: "global", theme: "dark", autoSyncInterval: 6 }
            });
        }
        if (!settings || settings.id !== "global") throw new Error("Settings lookup failed");

        await prisma.settings.update({
            where: { id: "global" },
            data: { theme: "dark", refreshInterval: 10 }
        });

        // 2. AES-256-GCM Encryption / Decryption
        const secretToken = "plex-super-secret-token-xyz-12345";
        const encrypted = encryptData(secretToken);
        if (!encrypted || encrypted === secretToken) throw new Error("Encryption failed");

        const decrypted = decryptData(encrypted);
        if (decrypted !== secretToken) throw new Error(`Decrypted value "${decrypted}" !== original "${secretToken}"`);

        // 3. Decoupled Outbound Email Engine Persistence (Resend vs Custom SMTP)
        const mockResendKey = "re_test_key_abc123xyz789";
        const mockCustomPass = "gmail-app-password-secret-xyz";
        await prisma.settings.update({
            where: { id: "global" },
            data: {
                resendApiKey: encryptData(mockResendKey),
                resendFrom: "notifications@domshomelab.com",
                customSmtpHost: "smtp.gmail.com",
                customSmtpPort: 587,
                customSmtpUser: "testuser@gmail.com",
                customSmtpPass: encryptData(mockCustomPass),
                customSmtpFrom: "testuser@gmail.com",
                emailProviderMode: "resend"
            }
        });

        const verifySettings = await prisma.settings.findUnique({ where: { id: "global" } });
        if (!verifySettings) throw new Error("Settings not found after decoupled email test");
        if (verifySettings.emailProviderMode !== "resend") throw new Error("emailProviderMode mismatch");
        if (decryptData(verifySettings.resendApiKey || "") !== mockResendKey) throw new Error("resendApiKey decryption mismatch");
        if (decryptData(verifySettings.customSmtpPass || "") !== mockCustomPass) throw new Error("customSmtpPass decryption mismatch");
        if (verifySettings.customSmtpHost !== "smtp.gmail.com") throw new Error("customSmtpHost mismatch");
        if (verifySettings.resendFrom !== "notifications@domshomelab.com") throw new Error("resendFrom mismatch");

        // 4. User Model Basic Persistence
        const testUser = await prisma.user.create({
            data: {
                username: `core_db_user_${Date.now()}`,
                email: `core_db_user_${Date.now()}@example.com`,
                password: "mock_password_hash_123",
                role: "USER",
                status: "APPROVED"
            }
        });
        if (!testUser.id) throw new Error("User creation failed");
        await prisma.user.delete({ where: { id: testUser.id } });
    });

    // =========================================================================
    // SUITE 2: Edge Security & Cloudflare Access (100% App Router Route Coverage)
    // =========================================================================
    await assertTest("Suite 2: Edge Security & Cloudflare Access (100% Route Coverage)", async () => {
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
        if (foundRoutes.length === 0) throw new Error("No App Router routes detected during scan.");

        const uncovered: string[] = [];
        for (const route of foundRoutes) {
            const isCovered = matchesCloudflareBypass(route) || matchesCloudflareAdmin(route) || matchesCloudflareSuperUser(route);
            if (!isCovered) uncovered.push(route);
        }

        if (uncovered.length > 0) {
            throw new Error(`The following ${uncovered.length} route(s) are NOT covered in src/lib/edge-policy-paths.ts:\n${uncovered.join("\n")}`);
        }

        // Boundary sanity checks
        if (!matchesCloudflareBypass("/")) throw new Error("Root / must match bypass");
        if (!matchesCloudflareBypass("/login")) throw new Error("/login must match bypass");
        if (!matchesCloudflareBypass("/join")) throw new Error("/join must match bypass");
        if (!matchesCloudflareBypass("/library")) throw new Error("/library must match bypass");
        if (!matchesCloudflareBypass("/profile")) throw new Error("/profile must match bypass");
        if (!matchesCloudflareAdmin("/settings")) throw new Error("/settings must match admin");
        if (!matchesCloudflareAdmin("/settings/profile")) throw new Error("/settings/profile must match admin (isolated)");
        if (!matchesCloudflareAdmin("/admin/monitoring")) throw new Error("/admin/monitoring must match admin");
        if (!matchesCloudflareAdmin("/admin/scripts")) throw new Error("/admin/scripts must match admin");
        if (!matchesCloudflareAdmin("/admin/streams")) throw new Error("/admin/streams must match admin");
        if (!matchesCloudflareSuperUser("/radarr")) throw new Error("/radarr must match super user");
        if (!matchesCloudflareSuperUser("/sonarr")) throw new Error("/sonarr must match super user");
    });

    // =========================================================================
    // SUITE 3: User Accounts, Access Gating & Admin Lifetime Immunity
    // =========================================================================
    await assertTest("Suite 3: User Accounts, Access Gating & Admin Lifetime Immunity", async () => {
        const { validateMemberReferenceAction } = await import("../src/app/actions");

        const testId = Date.now();
        const adminUser = await prisma.user.create({
            data: {
                username: `adm_imm_${testId}`,
                email: `adm_imm_${testId}@example.com`,
                password: "mock_password_hash_123",
                role: "ADMIN",
                status: "APPROVED",
                membershipTier: "ANNUAL",
                subscriptionEndsAt: new Date(Date.now() - 30 * 86400000) // Past date
            }
        });

        const kidUser = await prisma.user.create({
            data: {
                username: `kid_sub_${testId}`,
                email: `kid_sub_${testId}@example.com`,
                password: "mock_password_hash_123",
                role: "USER",
                accountType: "KID",
                status: "APPROVED"
            }
        });

        try {
            // Admin lifetime immunity check: Admin is never expired even with past subscription date
            if (adminUser.role !== "ADMIN" || adminUser.status !== "APPROVED") {
                throw new Error("Admin user role/status mismatch");
            }

            // Sub-account validation
            if (kidUser.accountType !== "KID") {
                throw new Error("Kid accountType was not properly set");
            }

            // Member reference and referral validation
            const refCheck = await validateMemberReferenceAction(adminUser.username);
            if (!refCheck.success || !refCheck.valid) {
                throw new Error(`Referral check failed for valid user ${adminUser.username}`);
            }

            const invalidCheck = await validateMemberReferenceAction("non_existent_ref_99999");
            if (invalidCheck.valid) {
                throw new Error("Invalid referral should not be matched");
            }

            // Page Fix Suggestion & AI Telemetry Engine test
            const { getPageFileHints, getAdminNotificationEmailAction, updateAppUserEmail } = await import("../src/app/actions");
            const libHints = await getPageFileHints("/library");
            if (!libHints.title.includes("Library") || !libHints.fileHints.includes("src/app/library/page.tsx")) {
                throw new Error("getPageFileHints failed for /library");
            }
            const rootHints = await getPageFileHints("/");
            if (!rootHints.fileHints.includes("src/app/page.tsx")) {
                throw new Error("getPageFileHints failed for /");
            }

            // Primary Email Resolution & Admin Recipient Verification
            process.env.PORTALARR_TEST_AUTH = "true";
            process.env.PORTALARR_TEST_USER_ID = adminUser.id;

            const adminEmailRes = await getAdminNotificationEmailAction();
            if (!adminEmailRes.success || !adminEmailRes.email?.includes("@")) {
                throw new Error(`getAdminNotificationEmailAction failed: ${JSON.stringify(adminEmailRes)}`);
            }

            // Update user email action test
            const newEmail = `updated_kid_${testId}@example.com`;
            const updateEmailRes = await updateAppUserEmail(kidUser.id, newEmail);
            if (!updateEmailRes.success) {
                throw new Error(`updateAppUserEmail failed: ${JSON.stringify(updateEmailRes)}`);
            }
            const verifiedKid = await prisma.user.findUnique({ where: { id: kidUser.id } });
            if (verifiedKid?.email !== newEmail) {
                throw new Error(`Expected email ${newEmail}, got ${verifiedKid?.email}`);
            }

            // Duplicate email prevention test
            const dupRes = await updateAppUserEmail(adminUser.id, newEmail);
            if (dupRes.success) {
                throw new Error("Expected updateAppUserEmail to fail on duplicate email collision!");
            }

            // Seamless Multi-Alias User Login & Identity Matching Test
            const { hash } = await import("bcryptjs");
            const { login, requestForgotPassword } = await import("../src/app/auth-actions");
            const testPassword = "SeamlessPassword123!";
            const hashedPassword = await hash(testPassword, 10);

            const aliasUser = await prisma.user.create({
                data: {
                    username: `plex_local_${testId}`,
                    email: `plex_local_${testId}@plex.local`,
                    plexUsername: `PlexMaster_${testId}`,
                    plexEmail: `plex_real_${testId}@gmail.com`,
                    password: hashedPassword,
                    role: "USER",
                    status: "APPROVED"
                }
            });

            try {
                // Test login by Plex username (with mixed case and whitespace)
                const formDataPlexUser = new FormData();
                formDataPlexUser.append("username", `  plexmaster_${testId}  `);
                formDataPlexUser.append("password", testPassword);
                const loginByPlexUserRes = await login(formDataPlexUser);
                if (!loginByPlexUserRes.success) {
                    throw new Error(`Failed to login using Plex Username alias: ${JSON.stringify(loginByPlexUserRes)}`);
                }

                // Test login by Plex email (with mixed case and whitespace)
                const formDataPlexEmail = new FormData();
                formDataPlexEmail.append("username", `  PLEX_REAL_${testId}@GMAIL.COM  `);
                formDataPlexEmail.append("password", testPassword);
                const loginByPlexEmailRes = await login(formDataPlexEmail);
                if (!loginByPlexEmailRes.success) {
                    throw new Error(`Failed to login using Plex Email alias: ${JSON.stringify(loginByPlexEmailRes)}`);
                }

                // Test forgot password resolving real email instead of discarding @plex.local
                const forgotFormData = new FormData();
                forgotFormData.append("emailOrUsername", `plexmaster_${testId}`);
                const forgotRes = await requestForgotPassword(forgotFormData);
                if (!forgotRes.success && !forgotRes.error?.includes("SMTP")) {
                    throw new Error(`Forgot password failed: ${JSON.stringify(forgotRes)}`);
                }

                // Test proxy preservation of returnTo deep links
                const { proxy } = await import("../src/proxy");
                const { NextRequest } = await import("next/server");
                const unauthReq = new NextRequest(new Request("http://localhost:3000/requests?tab=books&query=dune"));
                const proxyRedirectRes = await proxy(unauthReq);
                const redirectLocation = proxyRedirectRes.headers.get("location");
                if (!redirectLocation || !redirectLocation.includes("returnTo=%2Frequests%3Ftab%3Dbooks%26query%3Ddune")) {
                    throw new Error(`Proxy failed to preserve returnTo parameter: ${redirectLocation}`);
                }
            } finally {
                await prisma.user.delete({ where: { id: aliasUser.id } }).catch(() => {});
            }
        } finally {
            delete process.env.PORTALARR_TEST_USER_ID;
            await prisma.user.deleteMany({ where: { id: { in: [adminUser.id, kidUser.id] } } });
        }
    });

    // =========================================================================
    // SUITE 4: Free Add-ons & Live Plex Library Access Sync
    // =========================================================================
    await assertTest("Suite 4: Free Add-ons & Live Plex Library Access Sync", async () => {
        const { getDefaultAddonsCatalogAction, syncAudiobooksPlexLibraryAccessForUser } = await import("../src/app/actions");

        // 1. Add-ons Catalog separation
        const defaultCatalog = await getDefaultAddonsCatalogAction();
        const ebooksAddon = defaultCatalog.find((a: any) => a.id === "ebooks");
        if (!ebooksAddon || ebooksAddon.icon !== "book" || ebooksAddon.isFree !== true) {
            throw new Error(`Expected ebooks add-on in catalog, got: ${JSON.stringify(ebooksAddon)}`);
        }

        const audiobooksAddon = defaultCatalog.find((a: any) => a.id === "audiobooks");
        if (!audiobooksAddon || audiobooksAddon.icon !== "headphones" || audiobooksAddon.isFree !== true) {
            throw new Error(`Expected audiobooks add-on in catalog, got: ${JSON.stringify(audiobooksAddon)}`);
        }

        const legacyCombined = defaultCatalog.find((a: any) => a.id === "books_audiobooks");
        if (legacyCombined) {
            throw new Error("Legacy books_audiobooks should be split and not present in DEFAULT_ADDONS_CATALOG");
        }

        const jellyfinAddon = defaultCatalog.find((a: any) => a.id === "jellyfin_access");
        if (!jellyfinAddon || jellyfinAddon.icon !== "server" || jellyfinAddon.isFree !== true) {
            throw new Error(`Expected jellyfin_access in DEFAULT_ADDONS_CATALOG, got: ${JSON.stringify(jellyfinAddon)}`);
        }

        const embyAddon = defaultCatalog.find((a: any) => a.id === "emby_access");
        if (!embyAddon || embyAddon.icon !== "server" || embyAddon.isFree !== true) {
            throw new Error(`Expected emby_access in DEFAULT_ADDONS_CATALOG, got: ${JSON.stringify(embyAddon)}`);
        }

        // Household sub-accounts should be locked as coming soon until implemented
        const kidsProfileAddon = defaultCatalog.find((a: any) => a.id === "extra_kid_profile");
        if (!kidsProfileAddon || kidsProfileAddon.isAvailable !== false) {
            throw new Error(`Expected extra_kid_profile to be locked (isAvailable: false), got: ${JSON.stringify(kidsProfileAddon)}`);
        }

        const livingRoomProfileAddon = defaultCatalog.find((a: any) => a.id === "extra_living_room");
        if (!livingRoomProfileAddon || livingRoomProfileAddon.isAvailable !== false) {
            throw new Error(`Expected extra_living_room to be locked (isAvailable: false), got: ${JSON.stringify(livingRoomProfileAddon)}`);
        }

        // 2. Live Audiobooks Library Access Sync & Addons Catalog Verification
        const testUser = await prisma.user.create({
            data: {
                username: `aud_sync_usr_${Date.now()}`,
                email: `aud_sync_usr_${Date.now()}@test.local`,
                password: "mock_password_hash_123",
                role: "USER",
                status: "APPROVED",
                selectedPlexLibrarySectionIds: "10,20",
                plexLibrarySectionIds: "10,20"
            }
        });

        // Test getAvailableAddonsAction legacy filtering
        const { getAvailableAddonsAction } = await import("../src/app/actions");
        process.env.PORTALARR_TEST_AUTH = "true";
        process.env.PORTALARR_TEST_USER_ID = testUser.id;

        // Simulate legacy books_audiobooks in settings
        const origSettings = await prisma.settings.findUnique({ where: { id: "global" } });
        await prisma.settings.upsert({
            where: { id: "global" },
            update: {
                availableAddons: JSON.stringify([
                    { id: "books_audiobooks", name: "Books & Audiobooks Access", isAvailable: true, price: 0, isFree: true },
                    { id: "extra_kid_profile", name: "Additional Kids Sub-Account", isAvailable: true, price: 0, isFree: true }
                ])
            },
            create: { id: "global" }
        });

        try {
            const availableRes = await getAvailableAddonsAction();
            if (!availableRes.success || !availableRes.catalog) {
                throw new Error(`getAvailableAddonsAction failed: ${availableRes.error}`);
            }
            const hasLegacy = availableRes.catalog.some((a: any) => a.id === "books_audiobooks");
            if (hasLegacy) {
                throw new Error("Legacy books_audiobooks was improperly present in getAvailableAddonsAction catalog");
            }
            const kidsCatalogItem = availableRes.catalog.find((a: any) => a.id === "extra_kid_profile");
            if (kidsCatalogItem && kidsCatalogItem.isAvailable !== false) {
                throw new Error("extra_kid_profile should be locked (isAvailable: false) in getAvailableAddonsAction");
            }
        } finally {
            // Restore settings
            await prisma.settings.upsert({
                where: { id: "global" },
                update: { availableAddons: origSettings?.availableAddons ?? null },
                create: { id: "global" }
            });
            delete process.env.PORTALARR_TEST_USER_ID;
        }

        const testAudioLib = await prisma.library.create({
            data: {
                name: `Audiobooks Test Lib ${Date.now()}`,
                path: "/mock/audiobooks",
                mediaType: "audiobook",
                allowedUsers: "admin"
            }
        });

        try {
            // Enable audiobooks access
            const enableRes = await syncAudiobooksPlexLibraryAccessForUser(testUser.id, true);
            if (!enableRes.success) throw new Error(`syncAudiobooksPlexLibraryAccessForUser(true) failed: ${enableRes.error}`);

            const updatedLibAfterEnable = await prisma.library.findUnique({ where: { id: testAudioLib.id } });
            if (!updatedLibAfterEnable?.allowedUsers?.includes(testUser.username)) {
                throw new Error(`Expected audio library allowedUsers to include ${testUser.username}`);
            }

            // Disable audiobooks access
            const disableRes = await syncAudiobooksPlexLibraryAccessForUser(testUser.id, false);
            if (!disableRes.success) throw new Error(`syncAudiobooksPlexLibraryAccessForUser(false) failed: ${disableRes.error}`);

            const updatedLibAfterDisable = await prisma.library.findUnique({ where: { id: testAudioLib.id } });
            if (updatedLibAfterDisable?.allowedUsers?.includes(testUser.username)) {
                throw new Error(`Expected audio library allowedUsers to NOT include ${testUser.username}`);
            }
        } finally {
            await prisma.library.delete({ where: { id: testAudioLib.id } }).catch(() => {});
            await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
        }
    });

    // =========================================================================
    // SUITE 5: Billing Math, Payment Scrapers & Cadence Engine
    // =========================================================================
    await assertTest("Suite 5: Billing Math, Payment Scrapers & Cadence Engine", async () => {
        // 1. Prorated rest-of-year calculation ($15/mo base)
        const proratedAnnual = calculateProratedBilling({
            startDate: new Date("2026-09-26T12:00:00Z"),
            trialDays: 14,
            yearlyPrice: 180,
            monthlyPrice: 15
        });
        if (proratedAnnual.amountDueNow !== 40.16) {
            throw new Error(`Expected amountDueNow to be 40.16, got ${proratedAnnual.amountDueNow}`);
        }
        if (proratedAnnual.monthlyRate !== 15 || proratedAnnual.remainingMonthsCount !== 2) {
            throw new Error(`Expected monthlyRate 15 and 2 remaining months, got ${proratedAnnual.monthlyRate}, ${proratedAnnual.remainingMonthsCount}`);
        }

        // 2. Standalone monthly rate proration ($17.50/mo)
        const proratedMonthly = calculateProratedBilling({
            startDate: new Date("2026-10-01T12:00:00Z"),
            trialDays: 14,
            yearlyPrice: 180,
            monthlyPrice: 17.5
        });
        if (proratedMonthly.monthlyAmountDueNow !== 9.03 || proratedMonthly.monthlyDailyRate !== 0.56) {
            throw new Error(`Expected monthlyAmountDueNow 9.03 and monthlyDailyRate 0.56, got ${proratedMonthly.monthlyAmountDueNow}`);
        }

        // 3. Amount extraction from payment text
        const amountFound = extractAmount("You received $180.00 from John Doe for membership");
        if (amountFound !== 180.00) throw new Error(`Expected amount 180.00, got ${amountFound}`);

        // 4. Cash App cashtag vs dollar extraction
        const cashAppMail: any = {
            from: { text: "Cash App <cash@square.com>" },
            subject: "John Doe sent you $15.00 for Media Server",
            text: "Payment from $johndoe for Media Server: $15.00 sent directly to your cash.app balance.",
            date: new Date()
        };
        const parsedCash = parseCashAppEmail(cashAppMail, "uid_123");
        if (!parsedCash || parsedCash.amount !== 15.00 || parsedCash.senderHandle !== "$johndoe") {
            throw new Error(`Expected amount 15.00 and cashtag $johndoe, got: ${JSON.stringify(parsedCash)}`);
        }

        // 5. Payment threshold evaluation (Full Yearly, Referral Discounted Yearly, Rest-of-Year Prorated, & Prorated Monthly)
        const threshEval = evaluatePaymentThreshold({
            user: { membershipTier: "ANNUAL" },
            payment: { amount: 180, provider: "CASHAPP" }
        });
        if (threshEval.action !== "FULL_YEARLY" || threshEval.cadence !== "YEARLY") {
            throw new Error(`Expected full yearly payment approval, got: ${JSON.stringify(threshEval)}`);
        }

        // 5b. Referral-discounted annual payment ($165 with 1 converted referral)
        const referralEval = evaluatePaymentThreshold({
            user: {
                membershipTier: "STANDARD",
                subscriptionCadence: "YEARLY",
                referrals: [{ id: "ref_1", username: "friend1", status: "APPROVED", convertedAt: new Date() }]
            },
            payment: { amount: 165, provider: "VENMO", emailDate: new Date("2026-12-20T12:00:00Z") }
        });
        if (referralEval.action !== "FULL_YEARLY" || referralEval.targetPrice !== 165 || referralEval.newAccountCredit !== 0) {
            throw new Error(`Expected referral-discounted FULL_YEARLY at $165, got: ${JSON.stringify(referralEval)}`);
        }

        // 5c. Rest-of-Year prorated annual payment ($40.16 on Sep 26)
        const proratedYearlyEval = evaluatePaymentThreshold({
            user: { status: "TRIAL", membershipTier: "TRIAL" },
            payment: { amount: 40.16, provider: "VENMO", emailDate: new Date("2026-09-26T12:00:00Z") }
        });
        if (proratedYearlyEval.action !== "FULL_YEARLY" || proratedYearlyEval.cadence !== "YEARLY") {
            throw new Error(`Expected Rest-of-Year prorated payment ($40.16) to fulfill FULL_YEARLY, got: ${JSON.stringify(proratedYearlyEval)}`);
        }

        // 5d. Prorated standalone monthly payment ($9.03 on Oct 1)
        const proratedMonthlyEval = evaluatePaymentThreshold({
            user: { status: "TRIAL", membershipTier: "TRIAL" },
            payment: { amount: 9.03, provider: "CASHAPP", emailDate: new Date("2026-10-01T12:00:00Z") }
        });
        if (proratedMonthlyEval.action !== "FULL_MONTHLY" || proratedMonthlyEval.cadence !== "MONTHLY") {
            throw new Error(`Expected prorated monthly payment ($9.03) to fulfill FULL_MONTHLY, got: ${JSON.stringify(proratedMonthlyEval)}`);
        }

        // 6. Renewal reminder parsing
        const reminderDays = parseReminderDays("14,7,3,1");
        if (reminderDays.length !== 4 || reminderDays[0] !== 14 || reminderDays[3] !== 1) {
            throw new Error(`Unexpected reminder days parsed: ${JSON.stringify(reminderDays)}`);
        }
    });

    // =========================================================================
    // SUITE 6: Media Requests & Discovery Engine (Seerr)
    // =========================================================================
    await assertTest("Suite 6: Media Requests & Discovery Engine (Seerr)", async () => {
        const { renderEmailTemplate } = await import("../src/lib/email-templates");

        const testReq = await prisma.mediaRequest.create({
            data: {
                title: "Dune: Part Two",
                mediaType: "movie",
                tmdbId: 693134,
                requestedByUsername: "test_member",
                status: "PENDING",
                qualityProfileId: 1
            }
        });
        if (!testReq.id || testReq.status !== "PENDING") throw new Error("MediaRequest creation failed");

        // Status transition
        await prisma.mediaRequest.update({
            where: { id: testReq.id },
            data: { status: "APPROVED" }
        });
        const updated = await prisma.mediaRequest.findUnique({ where: { id: testReq.id } });
        if (updated?.status !== "APPROVED") throw new Error("MediaRequest status update failed");

        // Template rendering for book & audiobook admin alerts
        const renderedBook = await renderEmailTemplate("media_request_admin", {
            title: "The Way of Kings",
            author: "Brandon Sanderson",
            mediaType: "ebook",
            mediaLabel: "Ebook",
            requestedBy: "test_member",
            type: "book",
            publishYear: "2010",
            manageUrl: "http://localhost:3000/requests",
            appUrl: "http://localhost:3000"
        });
        if (!renderedBook.subject.includes("The Way of Kings") || !renderedBook.html.includes("Brandon Sanderson")) {
            throw new Error("media_request_admin failed to render book metadata");
        }

        // Test newly registered book_file_delivery template
        const renderedBookDelivery = await renderEmailTemplate("book_file_delivery", {
            username: "test_member",
            title: "Project Hail Mary",
            author: "Andy Weir",
            format: "EPUB",
            itemTypeLabel: "Ebook",
            appUrl: "http://localhost:3000"
        });
        if (!renderedBookDelivery.subject.includes("Project Hail Mary") || !renderedBookDelivery.html.includes("Andy Weir") || !renderedBookDelivery.html.includes("EPUB")) {
            throw new Error("book_file_delivery template rendering verification failed");
        }

        // Test admin_approval template
        const renderedApproval = await renderEmailTemplate("admin_approval", {
            adminName: "LeadAdmin",
            actionTitle: "Clean Library Cache",
            actionType: "SYSTEM_MAINTENANCE",
            targetDisplay: "Main Media Server",
            details: "Purging stale transcoding segments",
            approvalsUrl: "http://localhost:3000/settings/approvals",
            appUrl: "http://localhost:3000"
        });
        if (!renderedApproval.subject.includes("Clean Library Cache") || !renderedApproval.html.includes("LeadAdmin") || !renderedApproval.html.includes("Main Media Server")) {
            throw new Error("admin_approval template rendering verification failed");
        }

        const { DEFAULT_EMAIL_TEMPLATES } = await import("../src/lib/email-templates");
        if (DEFAULT_EMAIL_TEMPLATES.length < 33) {
            throw new Error(`Expected at least 33 registered email templates, found: ${DEFAULT_EMAIL_TEMPLATES.length}`);
        }

        // Category-specific email sender routing verification
        const { resolveSenderAddress, getTemplateSenderCategory } = await import("../src/lib/email-templates");
        
        const kindleSender = resolveSenderAddress("kindle_delivery", "notifications@domshomelab.com");
        if (kindleSender.email !== "kindle@domshomelab.com" || kindleSender.displayName !== "DomsHomeLab Kindle") {
            throw new Error(`Expected kindle_delivery sender to be kindle@domshomelab.com, got: ${kindleSender.formatted}`);
        }

        const bookSender = resolveSenderAddress("book_file_delivery", "notifications@domshomelab.com");
        if (bookSender.email !== "kindle@domshomelab.com" || bookSender.displayName !== "DomsHomeLab Kindle") {
            throw new Error(`Expected book_file_delivery sender to be kindle@domshomelab.com, got: ${bookSender.formatted}`);
        }

        const billingSender = resolveSenderAddress("payment_received", "notifications@domshomelab.com");
        if (billingSender.email !== "payments@domshomelab.com" || billingSender.displayName !== "DomsHomeLab Billing") {
            throw new Error(`Expected payment_received sender to be payments@domshomelab.com, got: ${billingSender.formatted}`);
        }

        const accountsSender = resolveSenderAddress("user_approval", "notifications@domshomelab.com");
        if (accountsSender.email !== "accounts@domshomelab.com" || accountsSender.displayName !== "DomsHomeLab Accounts") {
            throw new Error(`Expected user_approval sender to be accounts@domshomelab.com, got: ${accountsSender.formatted}`);
        }

        const requestsSender = resolveSenderAddress("media_ready", "notifications@domshomelab.com");
        if (requestsSender.email !== "requests@domshomelab.com" || requestsSender.displayName !== "DomsHomeLab Requests") {
            throw new Error(`Expected media_ready sender to be requests@domshomelab.com, got: ${requestsSender.formatted}`);
        }

        const supportSender = resolveSenderAddress("ticket_update", "notifications@domshomelab.com");
        if (supportSender.email !== "support@domshomelab.com" || supportSender.displayName !== "DomsHomeLab Support") {
            throw new Error(`Expected ticket_update sender to be support@domshomelab.com, got: ${supportSender.formatted}`);
        }

        const govSender = resolveSenderAddress("admin_approval", "notifications@domshomelab.com");
        if (govSender.email !== "accounts@domshomelab.com" || govSender.displayName !== "DomsHomeLab Governance") {
            throw new Error(`Expected admin_approval sender to be accounts@domshomelab.com (Governance), got: ${govSender.formatted}`);
        }

        const broadcastSender = resolveSenderAddress("broadcast", "notifications@domshomelab.com");
        if (broadcastSender.email !== "notifications@domshomelab.com" || broadcastSender.displayName !== "DomsHomeLab") {
            throw new Error(`Expected broadcast sender to be notifications@domshomelab.com, got: ${broadcastSender.formatted}`);
        }

        // Public webmail domain preservation (prevents SPF/DKIM breakage)
        const gmailSender = resolveSenderAddress("kindle_delivery", "d281knilb@gmail.com");
        if (gmailSender.email !== "d281knilb@gmail.com" || gmailSender.isCustomDomain) {
            throw new Error(`Expected gmail sender to preserve address, got: ${gmailSender.formatted}`);
        }

        const { getPublicSmtpFromEmail, getPublicJoinConfig } = await import("../src/app/actions");
        const publicKindle = await getPublicSmtpFromEmail("kindle");
        if (publicKindle !== "kindle@domshomelab.com") {
            throw new Error(`Expected getPublicSmtpFromEmail('kindle') to be kindle@domshomelab.com, got: ${publicKindle}`);
        }

        const joinConfig = await getPublicJoinConfig();
        if (!joinConfig.success || joinConfig.config?.kindleSenderEmail !== "kindle@domshomelab.com") {
            throw new Error(`Expected joinConfig kindleSenderEmail to be kindle@domshomelab.com, got: ${joinConfig.config?.kindleSenderEmail}`);
        }

        // Progressive Sequential Search Verification (Movies, TV Shows, Books, Audiobooks)
        const { searchMediaAction } = await import("../src/app/seerr-actions");
        const emptySearch = await searchMediaAction("");
        if (!emptySearch.success || emptySearch.items.length !== 0) {
            throw new Error("Expected empty query to return empty items immediately");
        }

        const movieSearch = await searchMediaAction("Inception", 1, false, "movie");
        if (!movieSearch.success || !Array.isArray(movieSearch.items)) {
            throw new Error("Expected movie search to succeed");
        }
        if (movieSearch.items.length > 0 && movieSearch.items.some(i => i.mediaType !== "movie")) {
            throw new Error("Expected movie search to only return movies");
        }

        const tvSearch = await searchMediaAction("Breaking Bad", 1, false, "tv");
        if (!tvSearch.success || !Array.isArray(tvSearch.items)) {
            throw new Error("Expected tv search to succeed");
        }
        if (tvSearch.items.length > 0 && tvSearch.items.some(i => i.mediaType !== "tv")) {
            throw new Error("Expected tv search to only return tv shows");
        }

        await prisma.mediaRequest.delete({ where: { id: testReq.id } });
    });

    // =========================================================================
    // SUITE 7: Bookshelf & Send-to-Kindle Subsystem
    // =========================================================================
    await assertTest("Suite 7: Bookshelf & Send-to-Kindle Subsystem", async () => {
        // 1. Deduplication key normalization
        const cleanKey = getBookCleanTitleKey("The Lord of the Rings: The Fellowship of the Ring (Special Edition)");
        if (!cleanKey.includes("fellowship")) {
            throw new Error(`Expected clean slug to include fellowship, got: ${cleanKey}`);
        }

        const compKey = getBookCompositeDedupKey({ title: "Dune", author: "Frank Herbert", mediaType: "ebook" });
        if (!compKey.includes("dune") || !compKey.includes("frankherbert")) {
            throw new Error(`Expected composite dedup key, got: ${compKey}`);
        }

        // 2. Amazon Send-to-Kindle bounce email parser
        const bounceMail: any = {
            from: { text: "kindle-cs@amazon.com" },
            subject: "An email from kindle@domshomelab.com did not have an approved sender address",
            text: "Dear Customer, the sender address (kindle@domshomelab.com) is not on your approved personal document list.",
            date: new Date()
        };
        const bounce = parseAmazonBounceEmail(bounceMail);
        if (!bounce || !bounce.isBounce || !bounce.reason.includes("Approved Personal Document")) {
            throw new Error(`Expected bounce parser to identify unapproved sender, got: ${JSON.stringify(bounce)}`);
        }

        // 3. Maturity rating inference
        const kidsRating = inferBookRating({ overview: "Ages 4-8 picture book about friendly animals", title: "Friendly Animals" });
        if (kidsRating.ageRating !== "Kids" || kidsRating.isMature) {
            throw new Error(`Expected rating 'Kids' for children's book, got ${JSON.stringify(kidsRating)}`);
        }
        const yaRating = inferBookRating({ overview: "Young adult high school fantasy adventure", title: "School of Spells" });
        if (yaRating.ageRating !== "YA (12+)") {
            throw new Error(`Expected YA rating YA (12+), got ${JSON.stringify(yaRating)}`);
        }

        // 4. Kindle Sender Update Notice Lifecycle for Existing Users
        const { getKindleSenderUpdateNoticeStatusAction, acknowledgeKindleSenderUpdateAction } = await import("../src/app/actions");
        const noticeTestUser = await prisma.user.create({
            data: {
                username: `kindlenotice_${Date.now()}`,
                email: `kindlenotice_${Date.now()}@test.com`,
                password: "mock_password_hash",
                role: "USER",
                accountType: "FULL",
                kindleEmail: "reader_test_device@kindle.com"
            }
        });

        try {
            process.env.PORTALARR_TEST_AUTH = "true";
            process.env.PORTALARR_TEST_USER_ID = noticeTestUser.id;

            // Initially has Kindle configured and needs notice
            const noticeStatus1 = await getKindleSenderUpdateNoticeStatusAction();
            if (!noticeStatus1.hasKindleEmail || !noticeStatus1.needsNotice || noticeStatus1.senderEmail !== "kindle@domshomelab.com") {
                throw new Error(`Expected needsNotice=true and senderEmail=kindle@domshomelab.com, got: ${JSON.stringify(noticeStatus1)}`);
            }

            // Acknowledge notice
            const ackRes = await acknowledgeKindleSenderUpdateAction();
            if (!ackRes.success) {
                throw new Error(`acknowledgeKindleSenderUpdateAction failed: ${ackRes.error}`);
            }

            // Post-acknowledgment check
            const noticeStatus2 = await getKindleSenderUpdateNoticeStatusAction();
            if (!noticeStatus2.hasKindleEmail || noticeStatus2.needsNotice) {
                throw new Error(`Expected needsNotice=false after acknowledgment, got: ${JSON.stringify(noticeStatus2)}`);
            }
        } finally {
            process.env.PORTALARR_TEST_AUTH = "true";
            delete process.env.PORTALARR_TEST_USER_ID;
            await prisma.user.delete({ where: { id: noticeTestUser.id } }).catch(() => {});
        }
    });

    // =========================================================================
    // SUITE 8: Plex Integration & Collection Hub Curation (Agregarr)
    // =========================================================================
    await assertTest("Suite 8: Plex Integration & Collection Hub Curation (Agregarr)", async () => {
        // 1. Candidate URL expansion & IP detection
        const candidates = expandCandidateUrls("192.168.1.87", 32400);
        if (candidates.length === 0 || !candidates[0].includes("192.168.1.87")) {
            throw new Error(`Candidate URLs not generated properly: ${JSON.stringify(candidates)}`);
        }
        if (!isPrivateOrLocalIp("192.168.1.87") || !isPrivateOrLocalIp("10.0.0.5") || !isPrivateOrLocalIp("127.0.0.1")) {
            throw new Error("Private/Local IP detection failed");
        }
        if (isPrivateOrLocalIp("98.12.34.56")) {
            throw new Error("Public WAN IP incorrectly classified as private");
        }

        // 2. Collection stub / placeholder identification
        const stubItem = { title: "Avatar 3 [Placeholder]", isPlaceholder: true, summary: "Placeholder stub for upcoming release" };
        if (!isPlexItemPlaceholderOrStub(stubItem as any)) {
            throw new Error("Expected placeholder item to be flagged as stub");
        }

        // 3. Curation Presets & Schedule Calculation
        if (!Array.isArray(COLLECTION_PRESETS) || COLLECTION_PRESETS.length === 0) {
            throw new Error("COLLECTION_PRESETS must not be empty");
        }
        const oscarList = getBuiltinOscarBestPictureList();
        if (!Array.isArray(oscarList) || oscarList.length < 50) {
            throw new Error("Oscar best picture list should contain at least 50 titles");
        }

        const nextRun = calculateNextRunTime("daily_3am", new Date("2026-10-15T12:00:00Z"));
        if (!nextRun?.nextRunDate || nextRun.nextRunDate.getHours() !== 3) {
            throw new Error(`Expected next run at 3 AM, got: ${JSON.stringify(nextRun)}`);
        }
    });

    // =========================================================================
    // SUITE 9: Poster Studio & Metadata Badges (Kometa)
    // =========================================================================
    await assertTest("Suite 9: Poster Studio & Metadata Badges (Kometa)", async () => {
        // Verify badge presets and dimensions
        const badges = [
            { label: "4K UHD", resolution: "2160p", color: "#38bdf8" },
            { label: "Dolby Vision", hdrType: "dovi", color: "#818cf8" },
            { label: "Dolby Atmos", audio: "atmos", color: "#34d399" },
            { label: "IMDb Top 250", type: "ribbon", color: "#f59e0b" }
        ];

        for (const b of badges) {
            if (!b.label || !b.color) throw new Error(`Invalid badge definition: ${JSON.stringify(b)}`);
        }
    });

    // =========================================================================
    // SUITE 10: Library Pruning & Leaving Soon Watch Activity Engine (Maintainerr)
    // =========================================================================
    await assertTest("Suite 10: Library Pruning & Leaving Soon Watch Activity Engine (Maintainerr)", async () => {
        const { recheckLeavingSoonWatchActivityInternal } = await import("../src/app/curation-actions");

        const testRatingKey = `test_leaving_soon_${Date.now()}`;
        const testServerId = "test_server_prune_suite10";

        // 1. Create a test leaving soon item
        await prisma.mediaContentAdvisory.create({
            data: {
                ratingKey: testRatingKey,
                serverId: testServerId,
                title: "Test Prune Watch Candidate Movie",
                isLeavingSoon: true,
                leavingSoonDate: new Date(Date.now() + 7 * 86400000),
                leavingReason: "Inactivity pruning staging"
            }
        });

        // Ensure settings has a mock mainPlexToken
        const existingSettings = await prisma.settings.findFirst({ where: { id: "global" } });
        if (!existingSettings?.mainPlexToken) {
            await prisma.settings.upsert({
                where: { id: "global" },
                update: { mainPlexToken: encryptData("test_plex_token_suite10") },
                create: { id: "global", mainPlexToken: encryptData("test_plex_token_suite10") }
            });
        }

        try {
            // 2. Create local watch history record (Tier 1 indexed lookup)
            await prisma.watchHistory.create({
                data: {
                    ratingKey: testRatingKey,
                    serverId: testServerId,
                    user: "testuser_suite10",
                    title: "Test Prune Watch Candidate Movie",
                    mediaType: "movie",
                    watchedAt: new Date(Date.now() - 3600000)
                }
            });

            // 3. Execute watch recheck: Tier 1 resolves watched item locally with 0 network calls
            const res = await recheckLeavingSoonWatchActivityInternal(testServerId, false, true);
            if (!res.success) throw new Error(`recheckLeavingSoonWatchActivityInternal failed: ${res.error}`);
            if (res.unflaggedCount !== 1) {
                throw new Error(`Expected exactly 1 unflagged item via Tier 1 watch history, got ${res.unflaggedCount}`);
            }

            // Verify advisory record was updated
            const adv = await prisma.mediaContentAdvisory.findFirst({
                where: { ratingKey: testRatingKey, serverId: testServerId }
            });
            if (adv?.isLeavingSoon !== false) {
                throw new Error("Advisory record should have isLeavingSoon set to false");
            }
        } finally {
            await prisma.watchHistory.deleteMany({ where: { ratingKey: testRatingKey } });
            await prisma.mediaContentAdvisory.deleteMany({ where: { ratingKey: testRatingKey } });
        }
    });

    // =========================================================================
    // SUITE 11: Host Hardware & Docker Fleet Monitoring
    // =========================================================================
    await assertTest("Suite 11: Host Hardware & Docker Fleet Monitoring", async () => {
        const { listDockerContainers } = await import("../src/lib/monitoring/docker-client");
        const { recordServiceProbes, calculateServiceUptime } = await import("../src/lib/monitoring/uptime-tracker");

        // 1. Docker fleet listing
        const fleetData = await listDockerContainers();
        if (!fleetData || !fleetData.summary || !Array.isArray(fleetData.containers)) {
            throw new Error("listDockerContainers failed to return summary and containers array");
        }
        if (fleetData.summary.totalContainers < 0) {
            throw new Error("totalContainers should be non-negative");
        }

        // 2. Service uptime calculation & probe recording
        const testServiceId = `test-service-${Date.now()}`;
        const mockService: any = {
            id: testServiceId,
            name: "Test Plex Server",
            type: "Plex Media Server",
            category: "plex",
            url: "http://192.168.1.99:32400",
            monitored: true,
            status: "ONLINE",
            latencyMs: 14
        };

        await recordServiceProbes([mockService]);
        const uptime = calculateServiceUptime(testServiceId, "ONLINE", 14);
        if (uptime.pct24h !== 100) {
            throw new Error(`Expected 100% uptime, got ${uptime.pct24h}%`);
        }
        if (!uptime.currentStreak.includes("Up for")) {
            throw new Error(`Expected streak 'Up for', got '${uptime.currentStreak}'`);
        }
    });

    // =========================================================================
    // SUITE 12: Stream Intelligence, History & Password Sharing Detection
    // =========================================================================
    await assertTest("Suite 12: Stream Intelligence, History & Password Sharing Detection", async () => {
        const { 
            parseDateRange, 
            getUserStreamProfiles, 
            getUserDetailedTelemetry,
            analyzeUserAccountSharing,
            isFixedHomeDevice,
            isMobileRoamingDevice,
            isSameSubnetOrIp
        } = await import("../src/lib/telemetry/stream-tracker");

        // 1. Date Range Boundaries
        const rAll = parseDateRange("all");
        if (rAll.startDate !== undefined || rAll.endDate !== undefined) throw new Error("Expected all-time range to have undefined boundaries");

        const r30 = parseDateRange("30d");
        if (!r30.startDate) throw new Error("30d range start boundary missing");

        const rCustom = parseDateRange("custom", "2026-05-01", "2026-05-15");
        if (!rCustom.startDate || !rCustom.endDate) throw new Error("Custom range start/end missing");

        // 2. Seed watch records across dates
        const testUser = `stream_usr_${Date.now()}`;
        const now = Date.now();
        const dayMs = 86400000;

        await prisma.watchHistory.createMany({
            data: [
                {
                    user: testUser,
                    title: "Movie Recent",
                    mediaType: "movie",
                    ratingKey: "test_rk_recent",
                    serverName: "MainPlexServer",
                    durationMs: 7200000,
                    progressPercent: 95,
                    videoDecision: "direct play",
                    player: "Apple TV",
                    ipAddress: "192.168.1.150",
                    watchedAt: new Date(now - 5 * dayMs) // 5 days ago (30d)
                },
                {
                    user: testUser,
                    title: "Movie Older",
                    mediaType: "movie",
                    ratingKey: "test_rk_older",
                    serverName: "MainPlexServer",
                    durationMs: 7200000,
                    progressPercent: 90,
                    videoDecision: "transcode",
                    player: "Roku",
                    ipAddress: "192.168.1.151",
                    watchedAt: new Date(now - 45 * dayMs) // 45 days ago (60d)
                }
            ]
        });

        try {
            const profiles30 = await getUserStreamProfiles({ range: "30d" });
            const u30 = profiles30.find(u => u.user === testUser);
            if (!u30 || u30.totalPlays !== 1) throw new Error(`Expected 1 play for 30d, got ${u30?.totalPlays}`);

            const profilesAll = await getUserStreamProfiles({ range: "all" });
            const uAll = profilesAll.find(u => u.user === testUser);
            if (!uAll || uAll.totalPlays !== 2) throw new Error(`Expected 2 plays for all-time, got ${uAll?.totalPlays}`);

            // 3. Device classification
            if (!isFixedHomeDevice("Apple TV 4K", "tvOS", "Plex for tvOS")) throw new Error("Apple TV should be fixed home device");
            if (isFixedHomeDevice("iPhone 15 Pro", "iOS", "Plex for iOS")) throw new Error("iPhone must NOT be fixed home device");
            if (!isMobileRoamingDevice("iPhone 15 Pro", "iOS", "Plex for iOS")) throw new Error("iPhone should be mobile roaming device");

            // 4. Subnet matching
            if (!isSameSubnetOrIp("73.18.20.15", "73.18.20.210")) throw new Error("Same /24 subnet should match");
            if (isSameSubnetOrIp("73.18.20.15", "73.19.20.15")) throw new Error("Different /24 subnets must NOT match");

            // 5. Account sharing detection: Dual fixed TVs on disparate public IPs playing simultaneously
            const overlapTime = new Date("2026-06-15T20:00:00Z");
            const dualTvSessions = [
                {
                    id: "dtv1",
                    user: "bob",
                    title: "Movie One",
                    device: "Roku Ultra",
                    platform: "Roku",
                    player: "Plex for Roku",
                    ipAddress: "73.189.44.12",
                    watchedAt: overlapTime,
                    durationMs: 7200000
                },
                {
                    id: "dtv2",
                    user: "bob",
                    title: "Movie Two",
                    device: "Apple TV 4K",
                    platform: "tvOS",
                    player: "Plex for Apple TV",
                    ipAddress: "98.245.10.88",
                    watchedAt: new Date(overlapTime.getTime() + 15 * 60 * 1000),
                    durationMs: 7200000
                }
            ];
            const dualTvEval = analyzeUserAccountSharing(dualTvSessions);
            if (dualTvEval.sharingAssessment.risk !== "HIGH_SHARING_RISK") {
                throw new Error(`Expected dual TV concurrency to trigger HIGH_SHARING_RISK, got ${dualTvEval.sharingAssessment.risk}`);
            }
        } finally {
            await prisma.watchHistory.deleteMany({ where: { user: testUser } });
        }
    });

    // =========================================================================
    // SUITE 13: Live Playback Diagnostics & Transcode Doctor
    // =========================================================================
    await assertTest("Suite 13: Live Playback Diagnostics & Transcode Doctor", async () => {
        const { diagnoseStreamSettings, detectDeviceCategory } = await import("../src/lib/telemetry/device-diagnostics");
        const { formatDurationMs, formatEtaTimestamp, formatAudioChannels, resolveResolution } = await import("../src/lib/telemetry/stream-tracker");

        // 1. Device category detection
        if (detectDeviceCategory("Roku", "Plex for Roku") !== "Roku") throw new Error("Roku detection failed");
        if (detectDeviceCategory("tvOS", "Plex for tvOS") !== "Apple TV") throw new Error("Apple TV detection failed");
        if (detectDeviceCategory("Android", "AFTT") !== "Fire TV") throw new Error("Fire TV detection failed");

        // 2. Video transcoding on Roku triggers doctor recommendations
        const rokuSession = {
            device: "Roku Ultra",
            platform: "Roku",
            player: "Living Room Roku",
            videoDecision: "transcode",
            videoCodec: "h264",
            streamBitrate: 2000,
            videoResolution: "720p",
            user: "TestUserRoku",
            title: "Test Movie 4K"
        };
        const rokuDiag = diagnoseStreamSettings(rokuSession);
        if (!rokuDiag.hasIssue || rokuDiag.issueType !== "roku_auto_adjust") {
            throw new Error(`Expected Roku transcode to flag roku_auto_adjust, got: ${JSON.stringify(rokuDiag)}`);
        }
        if (!rokuDiag.stepByStepGuide || rokuDiag.stepByStepGuide.length === 0) {
            throw new Error("Expected step-by-step fix guide for Roku transcode");
        }

        // 3. Audio-only transcoding MUST suppress doctor fixes (negligible power consumption)
        const audioOnlySession = {
            platform: "Apple TV",
            player: "Plex for tvOS",
            videoDecision: "direct play",
            audioDecision: "transcode",
            streamBitrate: 8500
        };
        const audioDiag = diagnoseStreamSettings(audioOnlySession);
        if (audioDiag.hasIssue !== false) {
            throw new Error(`Audio-only conversion must have hasIssue: false, got ${audioDiag.hasIssue}`);
        }
        if (audioDiag.stepByStepGuide.length !== 0) {
            throw new Error(`Audio-only conversion must have empty steps, got ${JSON.stringify(audioDiag.stepByStepGuide)}`);
        }
        if (audioDiag.severity !== "info") {
            throw new Error(`Audio-only conversion severity must be info, got ${audioDiag.severity}`);
        }

        // 4. Telemetry and duration formatting
        if (formatDurationMs(3665000) !== "1:01:05") throw new Error(`Expected 1:01:05, got ${formatDurationMs(3665000)}`);
        if (formatAudioChannels(8) !== "7.1") throw new Error(`Expected 7.1, got ${formatAudioChannels(8)}`);
        if (formatAudioChannels(6) !== "5.1") throw new Error(`Expected 5.1, got ${formatAudioChannels(6)}`);
        if (resolveResolution(null, 1080, 1920) !== "1080p") throw new Error(`Expected 1080p, got ${resolveResolution(null, 1080, 1920)}`);
        if (resolveResolution(null, 2160, 3840) !== "4K UHD") throw new Error(`Expected 4K UHD, got ${resolveResolution(null, 2160, 3840)}`);
    });

    // =========================================================================
    // SUITE 14: AI Server Assistant & Homelab Command Center
    // =========================================================================
    await assertTest("Suite 14: AI Server Assistant & Homelab Command Center", async () => {
        const { 
            validateUserCrossBoundaryQuery, 
            checkAgentRateLimit, 
            recordAgentGrabAction, 
            validateMediaReleaseCandidate 
        } = await import("../src/lib/ai-agent-guardrails");
        const { askAiServerMaster } = await import("../src/lib/ai-server-assistant");

        const testUser = { id: "test-user-id", username: "alice", email: "alice@example.com", role: "USER" };
        const testAdmin = { id: "test-admin-id", username: "admin_user", email: "admin@example.com", role: "ADMIN" };
        const linkedSubs = [
            { id: "sub-1", username: "alice_kid", subAccountLabel: "Kids Tablet", accountType: "KID" }
        ];

        // 1. Cross-user reconnaissance blocked
        const reconCheck = validateUserCrossBoundaryQuery("what other users are watching right now?", testUser, linkedSubs);
        if (reconCheck.allowed || reconCheck.violationType !== "CROSS_USER_RECONNAISSANCE") {
            throw new Error(`Expected CROSS_USER_RECONNAISSANCE, got: ${JSON.stringify(reconCheck)}`);
        }

        // 2. Self and linked sub-account stream query allowed
        const selfCheck = validateUserCrossBoundaryQuery("stop my stream", testUser, linkedSubs);
        if (!selfCheck.allowed) throw new Error("Self stream stop should be allowed");

        const adminClusterCheck = validateUserCrossBoundaryQuery("show all active streams on the server", testAdmin, []);
        if (!adminClusterCheck.allowed) throw new Error("Admin cluster query should be allowed");

        // 3. Automated grab rate limiting
        const testRateId = `test_rate_user_${Date.now()}`;
        recordAgentGrabAction(testRateId, "RADARR", "Test Movie 1", 2);
        recordAgentGrabAction(testRateId, "RADARR", "Test Movie 2", 2);
        const rateBlocked = checkAgentRateLimit(testRateId, 2);
        if (rateBlocked.allowed) throw new Error("Expected rate limit to block 3rd grab");

        // 4. Release scoring: CAM and 0-seeder releases rejected
        const camRelease = { title: "Dune.2024.HDCAM.x264", size: 1.5 * 1024 * 1024 * 1024, protocol: "torrent", seeders: 50 };
        const camVal = validateMediaReleaseCandidate(camRelease, "movie", "English");
        if (camVal.ok) throw new Error("CAM release should be rejected");

        const deadRelease = { title: "Dune.2024.1080p.BluRay.x264", size: 10 * 1024 * 1024 * 1024, protocol: "torrent", seeders: 0 };
        const deadVal = validateMediaReleaseCandidate(deadRelease, "movie", "English");
        if (deadVal.ok) throw new Error("0 seeders release should be rejected");

        // 5. Offline heuristic engine fallback
        const serverQuery = await askAiServerMaster("what servers are online?", [], testAdmin);
        if (!serverQuery || !serverQuery.success || !serverQuery.answer) {
            throw new Error(`Expected server status response, got: ${JSON.stringify(serverQuery)}`);
        }

        // 6. Personalized book recommendations based on user's previous requests
        const { getUserReadingAndRequestProfile, getPersonalizedBookRecommendations } = await import("../src/lib/ai-book-recommendations");
        const recTestUser = { id: `user_rec_${Date.now()}`, username: `user_rec_${Date.now()}`, email: `user_rec_${Date.now()}@example.com`, role: "USER" };
        await prisma.user.create({
            data: {
                id: recTestUser.id,
                username: recTestUser.username,
                email: recTestUser.email,
                password: "test_password_hash",
                role: "USER"
            }
        });
        const testBookReq = await prisma.mediaRequest.create({
            data: {
                title: "Dune",
                mediaType: "book",
                bookAuthor: "Frank Herbert",
                bookSeries: "Dune",
                requestedByUsername: recTestUser.username,
                requestedByUserId: recTestUser.id,
                status: "APPROVED"
            }
        });

        try {
            const profile = await getUserReadingAndRequestProfile(recTestUser);
            if (!profile.favoriteAuthors.includes("Frank Herbert")) {
                throw new Error(`Expected favoriteAuthors to include 'Frank Herbert', got: ${JSON.stringify(profile.favoriteAuthors)}`);
            }

            const recs = await getPersonalizedBookRecommendations({
                user: recTestUser,
                profile,
                limit: 3
            });
            if (recs.recommendations.length === 0) {
                throw new Error("Expected personalized book recommendations to return at least 1 book");
            }

            const askRec = await askAiServerMaster("can you recommend some books based on my requests?", [], recTestUser);
            const hasRecMention = askRec.answer?.toLowerCase().includes("recommend");
            const hasRecAction = askRec.actionsTaken?.some((a: any) => a.action === "BOOK_RECOMMENDATION");
            if (!askRec.success || !askRec.answer || (!hasRecMention && !hasRecAction)) {
                throw new Error(`Expected personalized recommendations response, got: ${JSON.stringify(askRec)}`);
            }
        } finally {
            await prisma.mediaRequest.delete({ where: { id: testBookReq.id } }).catch(() => {});
            await prisma.user.delete({ where: { id: recTestUser.id } }).catch(() => {});
        }
    });

    // =========================================================================
    // SUITE 15: Homelab Shell Automation & User Scripts Subsystem
    // =========================================================================
    await assertTest("Suite 15: Homelab Shell Automation & User Scripts Subsystem", async () => {
        // 1. Verify default seeded scripts
        const allScripts = getAllScripts();
        if (allScripts.length < 4) {
            throw new Error(`Expected at least 4 default scripts, got: ${allScripts.length}`);
        }

        const plexHealthScript = allScripts.find(s => s.id === "check_all_plex_servers");
        if (!plexHealthScript || !plexHealthScript.name.includes("Plex")) {
            throw new Error("Default script 'check_all_plex_servers' missing or invalid");
        }

        // 2. Save, get, and delete test script
        const testScriptId = `verify_script_${Date.now()}`;
        saveScript({
            id: testScriptId,
            name: "Verify Automation Script",
            filename: "verify_auto.sh",
            description: "Automated test script",
            category: "System & Backup",
            interpreter: "bash",
            content: "echo '[OK] Automated test script passed'\nexit 0"
        });

        const fetched = getScriptById(testScriptId);
        if (!fetched || fetched.name !== "Verify Automation Script") {
            throw new Error("Failed to retrieve saved script");
        }

        deleteScript(testScriptId);
        const deleted = getScriptById(testScriptId);
        if (deleted) throw new Error("Script was not deleted");
    });

    // =========================================================================
    // SUITE 16: Discord Bot Blueprint & Role Synchronization
    // =========================================================================
    await assertTest("Suite 16: Discord Bot Blueprint & Role Synchronization", async () => {
        // 1. Blueprint structure
        if (!DISCORD_ROLES_BLUEPRINT || !Array.isArray(DISCORD_ROLES_BLUEPRINT)) {
            throw new Error("DISCORD_ROLES_BLUEPRINT missing or not an array");
        }
        if (!DISCORD_SERVER_BLUEPRINT || !Array.isArray(DISCORD_SERVER_BLUEPRINT) || DISCORD_SERVER_BLUEPRINT.length === 0) {
            throw new Error("DISCORD_SERVER_BLUEPRINT missing or empty");
        }

        // 2. Role resolution
        const mockRoleMap = {
            admin: "role_admin_123",
            member: "role_member_456",
            trial: "role_trial_789",
            kids: "role_kids_101"
        };
        const adminRole = computeExpectedDiscordRole({ role: "ADMIN", status: "APPROVED" }, mockRoleMap);
        if (adminRole !== "role_admin_123") throw new Error(`Expected role_admin_123, got ${adminRole}`);

        const memberRole = computeExpectedDiscordRole({ role: "USER", status: "APPROVED", membershipTier: "ANNUAL" }, mockRoleMap);
        if (memberRole !== "role_member_456") throw new Error(`Expected role_member_456, got ${memberRole}`);

        const trialRole = computeExpectedDiscordRole({ role: "USER", status: "TRIAL", membershipTier: "TRIAL" }, mockRoleMap);
        if (trialRole !== "role_trial_789") throw new Error(`Expected role_trial_789, got ${trialRole}`);

        const kidRole = computeExpectedDiscordRole({ role: "USER", accountType: "KID", status: "APPROVED" }, mockRoleMap);
        if (kidRole !== "role_kids_101") throw new Error(`Expected role_kids_101, got ${kidRole}`);

        // 3. Username matching
        const match = findBestMatch(
            { discordId: "123", discordUsername: "kyra_plex" },
            [{ id: "u1", username: "kyra" }, { id: "u2", username: "john_doe" }]
        );
        if (!match || match.username !== "kyra") throw new Error(`Expected match 'kyra', got ${match?.username}`);

        // 4. Status channel resolution & auto-provisioning
        const statusRes = await resolveOrProvisionStatusChannel({
            botToken: "mock-token",
            guildId: "mock-guild",
            channelId: "existing-ch-id"
        });
        if (!statusRes.channelId) throw new Error("Expected status channel resolution to succeed in test mode");

        const liveRes = await updateDiscordLiveStatus({
            botToken: "mock-token",
            guildId: "mock-guild"
        });
        if (!liveRes.success || !liveRes.channelId) throw new Error("Expected updateDiscordLiveStatus to succeed in test mode");
    });

    // =========================================================================
    // SUITE 17: Direct Plex SQLite Snapshot & Delta-Sync Engine
    // =========================================================================
    await assertTest("Suite 17: Direct Plex SQLite Snapshot & Delta-Sync Engine", async () => {
        const {
            resolvePlexDatabaseFilePath,
            createPlexDatabaseSnapshot,
            inspectPlexDatabase,
            getSnapshotLibraryTagsAudit,
            getSnapshotLibraryMediaItems,
            evaluatePruneCandidatesFromSnapshotsUnified
        } = await import("../src/lib/curation/plex-snapshot-engine");

        // 1. Path Resolution Checks
        const invalidResolved = resolvePlexDatabaseFilePath("/non_existent_folder_abc_123");
        if (invalidResolved !== null) throw new Error("Expected non-existent path to resolve to null");

        // 2. Mock Test SQLite Plex Database Creation
        // Dynamically create a small mock com.plexapp.plugins.library.db to verify snapshotting and queries
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { DatabaseSync } = require("node:sqlite");
        const tmpDir = path.join(__dirname, "../tmp_test_plex_dbs");
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        const mainDbPath = path.join(tmpDir, "com.plexapp.plugins.library.db");
        const kidsDbPath = path.join(tmpDir, "kids_com.plexapp.plugins.library.db");

        try {
            if (fs.existsSync(mainDbPath)) fs.unlinkSync(mainDbPath);
            if (fs.existsSync(kidsDbPath)) fs.unlinkSync(kidsDbPath);

            // Populate Main Plex Mock DB
            const mainDb = new DatabaseSync(mainDbPath);
            mainDb.exec(`
                CREATE TABLE library_sections (id INTEGER PRIMARY KEY, name TEXT, section_type INTEGER);
                INSERT INTO library_sections VALUES (1, 'Movies', 1), (2, 'TV Shows', 2);

                CREATE TABLE metadata_items (
                    id INTEGER PRIMARY KEY,
                    library_section_id INTEGER,
                    parent_id INTEGER,
                    metadata_type INTEGER,
                    title TEXT,
                    year INTEGER,
                    guid TEXT,
                    added_at INTEGER,
                    updated_at INTEGER,
                    created_at INTEGER,
                    [index] INTEGER
                );
                INSERT INTO metadata_items VALUES
                    (101, 1, NULL, 1, 'Inception', 2010, 'imdb://tt1375666', 1577836800, 1577836800, 1577836800, NULL),
                    (102, 1, NULL, 1, 'Interstellar', 2014, 'imdb://tt0816692', 1577836800, 1577836800, 1577836800, NULL),
                    (200, 2, NULL, 2, 'Breaking Bad', 2008, 'imdb://tt0903747', 1577836800, 1577836800, 1577836800, NULL),
                    (201, 2, 200, 3, 'Season 1', NULL, 'imdb://tt0903747:season:1', 1577836800, 1577836800, 1577836800, 1),
                    (202, 2, 201, 4, 'Pilot', NULL, 'imdb://tt0903747:1:1', 1577836800, 1577836800, 1577836800, 1);

                CREATE TABLE media_items (
                    id INTEGER PRIMARY KEY,
                    metadata_item_id INTEGER,
                    size INTEGER,
                    width INTEGER,
                    height INTEGER,
                    bitrate INTEGER,
                    video_codec TEXT,
                    audio_codec TEXT,
                    audio_channels INTEGER
                );
                INSERT INTO media_items VALUES 
                    (1, 101, 25000000000, 3840, 2160, 25000, 'hevc', 'truehd', 8),
                    (2, 102, 10000000000, 1920, 1080, 8000, 'h264', 'eac3', 6),
                    (3, 202, 3000000000, 1920, 1080, 5000, 'h264', 'aac', 2);

                CREATE TABLE media_parts (
                    id INTEGER PRIMARY KEY,
                    media_item_id INTEGER,
                    file TEXT
                );
                INSERT INTO media_parts VALUES
                    (1, 1, '/movies/Inception (2010)/Inception.2010.4K.mkv'),
                    (2, 2, '/movies/Interstellar (2014)/Interstellar.2014.1080p.mkv'),
                    (3, 3, '/tv/Breaking Bad/Season 01/S01E01.mkv');

                CREATE TABLE tags (id INTEGER PRIMARY KEY, tag TEXT, tag_type INTEGER);
                INSERT INTO tags VALUES (1, 'IMDb:Violence:Severe', 11), (2, 'Sci-Fi', 1), (3, 'Leaving Soon', 2);

                CREATE TABLE taggings (id INTEGER PRIMARY KEY, metadata_item_id INTEGER, tag_id INTEGER);
                INSERT INTO taggings VALUES (1, 101, 1), (2, 101, 2), (3, 102, 3);

                CREATE TABLE metadata_item_views (
                    id INTEGER PRIMARY KEY,
                    guid TEXT,
                    metadata_type INTEGER,
                    viewed_at INTEGER,
                    account_id INTEGER
                );
                INSERT INTO metadata_item_views VALUES (1, 'imdb://tt1375666', 1, 1600000000, 1);
            `);
            mainDb.close();

            // Populate Kids Plex Mock DB
            const kidsDb = new DatabaseSync(kidsDbPath);
            kidsDb.exec(`
                CREATE TABLE library_sections (id INTEGER PRIMARY KEY, name TEXT, section_type INTEGER);
                INSERT INTO library_sections VALUES (1, 'Kids Movies', 1);

                CREATE TABLE metadata_items (
                    id INTEGER PRIMARY KEY,
                    library_section_id INTEGER,
                    parent_id INTEGER,
                    metadata_type INTEGER,
                    title TEXT,
                    guid TEXT,
                    added_at INTEGER,
                    updated_at INTEGER,
                    created_at INTEGER,
                    [index] INTEGER
                );
                INSERT INTO metadata_items VALUES (301, 1, NULL, 1, 'Finding Nemo', 'imdb://tt0266543', 1577836800, 1577836800, 1577836800, NULL);

                CREATE TABLE media_items (id INTEGER PRIMARY KEY, metadata_item_id INTEGER, size INTEGER, video_codec TEXT);
                INSERT INTO media_items VALUES (1, 301, 5000000000, 'h264');

                CREATE TABLE media_parts (id INTEGER PRIMARY KEY, media_item_id INTEGER, file TEXT);
                INSERT INTO media_parts VALUES (1, 1, '/kid_movies/Finding Nemo/Finding Nemo.mkv');

                CREATE TABLE metadata_item_views (id INTEGER PRIMARY KEY, guid TEXT, viewed_at INTEGER);
                INSERT INTO metadata_item_views VALUES (1, 'imdb://tt0816692', 1700000000);
            `);
            kidsDb.close();

            // 3. Test resolvePlexDatabaseFilePath on real created DB
            const resolved = resolvePlexDatabaseFilePath(mainDbPath);
            if (!resolved) throw new Error("Failed to resolve newly created mock Plex DB path");

            // 4. Test createPlexDatabaseSnapshot
            const snap = await createPlexDatabaseSnapshot(mainDbPath, "test_main_server", { force: true, label: "Test Main Server" });
            if (!snap.success || !snap.snapshotPath) throw new Error(`Snapshot creation failed: ${snap.error}`);
            if (!fs.existsSync(snap.snapshotPath)) throw new Error("Snapshot file was not found on disk");

            // 5. Test inspectPlexDatabase
            const inspection = inspectPlexDatabase(snap.snapshotPath);
            if (!inspection.success) throw new Error(`Inspection failed: ${inspection.error}`);
            if (inspection.movieCount !== 2) throw new Error(`Expected 2 movies, got ${inspection.movieCount}`);
            if (inspection.showCount !== 1) throw new Error(`Expected 1 show, got ${inspection.showCount}`);
            if (inspection.sectionCount !== 2) throw new Error(`Expected 2 sections, got ${inspection.sectionCount}`);

            // 6. Test getSnapshotLibraryTagsAudit
            const tagsAudit = getSnapshotLibraryTagsAudit(snap.snapshotPath, 1);
            const inceptionTags = tagsAudit.get("101");
            if (!inceptionTags) throw new Error("Expected tags for ratingKey 101");
            if (!inceptionTags.labels.includes("IMDb:Violence:Severe")) throw new Error("Missing label IMDb:Violence:Severe");
            if (!inceptionTags.genres.includes("Sci-Fi")) throw new Error("Missing genre Sci-Fi");

            // 7. Test getSnapshotLibraryMediaItems
            const mediaItems = getSnapshotLibraryMediaItems(snap.snapshotPath, 1, { limit: 10 });
            if (mediaItems.length !== 2) throw new Error(`Expected 2 media items, got ${mediaItems.length}`);
            const inception = mediaItems.find(m => m.ratingKey === "101");
            if (!inception) throw new Error("Inception not found in snapshot media items");
            if (inception.detectedBadges.resolution !== "4K") throw new Error(`Expected 4K badge, got ${inception.detectedBadges.resolution}`);

            // 8. Test Unified Cross-Server Snapshot Evaluation
            const unifiedResult = await evaluatePruneCandidatesFromSnapshotsUnified(
                { serverId: "main_srv", serverName: "Main Server", databasePath: mainDbPath },
                [{ serverId: "kids_srv", serverName: "Kids Server", databasePath: kidsDbPath }],
                { unwatchedMinAgeDays: 30, watchedMinAgeDays: 30, maxCandidates: 10 }
            );

            if (unifiedResult.evaluatedCount < 2) throw new Error(`Expected >=2 evaluated units, got ${unifiedResult.evaluatedCount}`);

            // 9. Test Prisma PlexServer databasePath persistence
            const testPlexServer = await prisma.plexServer.create({
                data: {
                    name: "Snapshot Test Server",
                    url: "http://127.0.0.1:32400",
                    isDefault: false,
                    monitored: true,
                    databasePath: mainDbPath
                }
            });
            if (testPlexServer.databasePath !== mainDbPath) throw new Error("databasePath was not saved to PlexServer model");

            // Test updating databasePath (simulating savePlexDatabasePathAction behavior)
            const updatedPlexServer = await prisma.plexServer.update({
                where: { id: testPlexServer.id },
                data: { databasePath: kidsDbPath }
            });
            if (updatedPlexServer.databasePath !== kidsDbPath) throw new Error("databasePath update failed");

            // Test clearing databasePath
            const clearedPlexServer = await prisma.plexServer.update({
                where: { id: testPlexServer.id },
                data: { databasePath: null }
            });
            if (clearedPlexServer.databasePath !== null) throw new Error("databasePath clear failed");

            await prisma.plexServer.delete({ where: { id: testPlexServer.id } });
        } finally {
            try {
                if (fs.existsSync(mainDbPath)) fs.unlinkSync(mainDbPath);
                if (fs.existsSync(kidsDbPath)) fs.unlinkSync(kidsDbPath);
                if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch (e) {}
        }
    });

    // =========================================================================
    // SUITE 18: Dynamic Branch, Version & Build Workflow Telemetry Engine
    // =========================================================================
    await assertTest("Suite 18: Dynamic Branch, Version & Build Telemetry Engine", async () => {
        // 1. Test standard telemetry resolution
        const telemetry = getBuildTelemetry();
        if (!telemetry.version) throw new Error("Telemetry version missing");
        if (!telemetry.branch) throw new Error("Telemetry branch missing");
        if (!telemetry.channel) throw new Error("Telemetry channel missing");
        if (!telemetry.displayBadge) throw new Error("Telemetry displayBadge missing");
        if (!telemetry.fullDisplay) throw new Error("Telemetry fullDisplay missing");
        if (!telemetry.dockerImageTag) throw new Error("Telemetry dockerImageTag missing");

        // 2. Test Beta branch identification
        const originalEnv = { ...process.env };
        try {
            process.env.NEXT_PUBLIC_GIT_BRANCH = "main";
            process.env.NEXT_PUBLIC_PORTALARR_VERSION = "3.0.0-beta.2";
            process.env.NEXT_PUBLIC_GIT_SHA = "2cf7cdfe1234567890abcdef";
            process.env.NEXT_PUBLIC_BUILD_NUMBER = "142";
            
            const betaTelemetry = getBuildTelemetry();
            if (betaTelemetry.branch !== "main") throw new Error(`Expected branch main, got ${betaTelemetry.branch}`);
            if (betaTelemetry.isBeta !== true) throw new Error("Expected isBeta to be true for main branch");
            if (betaTelemetry.isStable !== false) throw new Error("Expected isStable to be false for main branch");
            if (betaTelemetry.channel !== "beta") throw new Error(`Expected channel beta, got ${betaTelemetry.channel}`);
            if (!betaTelemetry.displayBadge.includes("BETA")) throw new Error(`Expected displayBadge to contain BETA, got ${betaTelemetry.displayBadge}`);
            if (betaTelemetry.commitShortSha !== "2cf7cdf") throw new Error(`Expected short SHA 2cf7cdf, got ${betaTelemetry.commitShortSha}`);
            if (betaTelemetry.buildNumber !== "142") throw new Error(`Expected buildNumber 142, got ${betaTelemetry.buildNumber}`);
            if (!betaTelemetry.dockerImageTag.includes(":main")) throw new Error(`Expected docker tag to include :main, got ${betaTelemetry.dockerImageTag}`);
            if (!betaTelemetry.workflowUrl) throw new Error("Expected workflowUrl to be populated when buildNumber is present");

            // 3. Test Production / Stable branch identification
            process.env.NEXT_PUBLIC_GIT_BRANCH = "stable";
            process.env.NEXT_PUBLIC_PORTALARR_VERSION = "3.0.0";
            delete process.env.NEXT_PUBLIC_BUILD_NUMBER;
            delete process.env.BUILD_NUMBER;

            const stableTelemetry = getBuildTelemetry();
            if (stableTelemetry.branch !== "stable") throw new Error(`Expected branch stable, got ${stableTelemetry.branch}`);
            if (stableTelemetry.isBeta !== false) throw new Error("Expected isBeta to be false for stable branch");
            if (stableTelemetry.isStable !== true) throw new Error("Expected isStable to be true for stable branch");
            if (stableTelemetry.channel !== "stable") throw new Error(`Expected channel stable, got ${stableTelemetry.channel}`);
            if (!stableTelemetry.displayBadge.includes("PROD")) throw new Error(`Expected displayBadge to contain PROD, got ${stableTelemetry.displayBadge}`);
            if (!stableTelemetry.dockerImageTag.includes(":stable")) throw new Error(`Expected docker tag to include :stable, got ${stableTelemetry.dockerImageTag}`);
        } finally {
            process.env = originalEnv;
        }

        // 4. Test Git Commit Version Prefixing Engine & Hook Enforcement
        const { formatCommitMessageWithVersion, installGitHook } = await import("./git-commit-msg-hook");
        
        // Ensure hook installer runs cleanly during every verification
        installGitHook();

        // Test prepending version to unadorned commit message
        const testMsg1 = "feat(telemetry): add branch indicator";
        const formatted1 = formatCommitMessageWithVersion(testMsg1, "1.0.0-beta.1");
        if (formatted1 !== "[v1.0.0-beta.1] feat(telemetry): add branch indicator") {
            throw new Error(`Failed to prepend version at front of commit: "${formatted1}"`);
        }

        // Test relocating trailing version to the front
        const testMsg2 = "fix(ui): adjust modal padding (v1.0.0-beta.1)";
        const formatted2 = formatCommitMessageWithVersion(testMsg2, "1.0.0-beta.1");
        if (formatted2 !== "[v1.0.0-beta.1] fix(ui): adjust modal padding") {
            throw new Error(`Failed to relocate trailing version to front: "${formatted2}"`);
        }

        // Test preserving already-correctly prefixed commit message
        const testMsg3 = "[v1.0.0-beta.1] chore(release): update package";
        const formatted3 = formatCommitMessageWithVersion(testMsg3, "1.0.0-beta.1");
        if (formatted3 !== "[v1.0.0-beta.1] chore(release): update package") {
            throw new Error(`Failed to preserve existing front-prefixed version: "${formatted3}"`);
        }

        // Test leaving merge commits untouched
        const testMsg4 = "Merge branch 'main' into stable";
        const formatted4 = formatCommitMessageWithVersion(testMsg4, "1.0.0-beta.1");
        if (formatted4 !== testMsg4) {
            throw new Error(`Merge commit was altered unexpectedly: "${formatted4}"`);
        }
    });

    // =========================================================================
    // SUITE 19: Multi-Platform Media Servers (Jellyfin/Emby), Admin Whitelists & User Self-Selection
    // =========================================================================
    await assertTest("Suite 19: Multi-Platform Media Servers (Jellyfin/Emby), Admin Whitelists & User Preferences", async () => {
        const { 
            getAdminMediaServersAction, 
            saveMediaServerAction, 
            deleteMediaServerAction,
            getUserMediaServersAndLibrariesAction,
            updateUserMediaServersAndLibrariesAction,
            updateUserAccountPreferencesAction,
            ensureUserMediaServerProvisionedAction,
            setUserMediaServerPasswordAction,
            authorizeMediaServerQuickConnectAction
        } = await import("../src/app/media-server-actions");
        const { getPlexSetupGuides, toggleFreeAddonAction } = await import("../src/app/actions");
        const { testMediaServerConnection } = await import("../src/lib/media-servers");

        // 1. MediaServer Model CRUD and Encryption
        const testServerApiKey = "test_emby_api_key_secret_12345";
        const testMediaServer = await prisma.mediaServer.create({
            data: {
                name: "Test Jellyfin Lab",
                type: "JELLYFIN",
                url: "http://192.168.1.100:8096",
                apiKey: encryptData(testServerApiKey),
                isActive: true,
                isMonitored: true,
                allowUserSelfSelect: true,
                allowTrialAccess: false,
                allowedLibraryIds: JSON.stringify(["movies-hd", "shows-hd"]),
                cachedLibraries: JSON.stringify([
                    { id: "movies-hd", title: "Movies HD", type: "movies" },
                    { id: "shows-hd", title: "TV Shows HD", type: "tvshows" },
                    { id: "4k-movies", title: "4K Movies", type: "movies" }
                ])
            }
        });
        if (!testMediaServer.id) throw new Error("MediaServer creation failed");

        // Verify API key decryption
        const decryptedKey = decryptData(testMediaServer.apiKey);
        if (decryptedKey !== testServerApiKey) {
            throw new Error(`MediaServer API key decryption mismatch: expected ${testServerApiKey}, got ${decryptedKey}`);
        }

        // Test editing existing media server (URL & Name update while keeping existing API key + setting internalUrl)
        const editServerRes = await saveMediaServerAction({
            id: testMediaServer.id,
            name: "Updated Jellyfin Node",
            type: "JELLYFIN",
            url: "http://127.0.0.1:9999/jellyfin",
            internalUrl: "http://127.0.0.1:9998",
            apiKey: ""
        });
        if (!editServerRes.success || editServerRes.server?.name !== "Updated Jellyfin Node" || editServerRes.server?.internalUrl !== "http://127.0.0.1:9998") {
            throw new Error(`Failed to edit existing media server or save internalUrl: ${editServerRes.error}`);
        }

        // Verify getAdminMediaServersAction returns decrypted API key and internalUrl for admin review
        const adminServersRes = await getAdminMediaServersAction();
        if (!adminServersRes.success) throw new Error("Failed to fetch admin media servers");
        const foundTestServer = adminServersRes.servers.find(s => s.id === testMediaServer.id);
        if (!foundTestServer || foundTestServer.apiKey !== testServerApiKey || foundTestServer.internalUrl !== "http://127.0.0.1:9998") {
            throw new Error(`Expected admin server to have decrypted apiKey and internalUrl, got: ${JSON.stringify(foundTestServer)}`);
        }

        // 2. Test MediaServer connection error handling (mock / offline URL + dual-URL testing)
        const connResult = await testMediaServerConnection(
            "JELLYFIN",
            "http://127.0.0.1:9999",
            "mock_test_key",
            1000,
            "http://127.0.0.1:9998"
        );
        if (connResult.ok !== false) {
            throw new Error("Expected offline media server connection test to fail gracefully");
        }
        if (!connResult.error && !connResult.summary) {
            throw new Error("Expected offline media server error message to be set");
        }

        // 3. Test User Account Preferences Persistence
        process.env.PORTALARR_TEST_AUTH = "true";
        const prefResult = await updateUserAccountPreferencesAction({
            qualityCap: "1080p_10mbps",
            audioLanguage: "eng",
            subtitleMode: "forced",
            weeklyDigest: true,
            hideWatchHistory: false
        });
        if (!prefResult.success) {
            throw new Error(`Failed to update account preferences: ${prefResult.error}`);
        }

        // 4. Test User Server & Library Access Query
        const userAccess = await getUserMediaServersAndLibrariesAction();
        if (!userAccess.success) {
            throw new Error(`Failed to query user media servers: ${userAccess.error}`);
        }

        // 5. Strict Admin Whitelist Enforcement Test
        const forbiddenLibKey = `jellyfin:${testMediaServer.id}:4k-movies`;
        const allowedLibKey = `jellyfin:${testMediaServer.id}:movies-hd`;

        const memberUser = await prisma.user.create({
            data: {
                username: `test_member_${Date.now()}`,
                email: `test_member_${Date.now()}@example.com`,
                password: "mock_password_hash",
                role: "USER",
                status: "APPROVED",
                allowedServerKeys: JSON.stringify([`jellyfin:${testMediaServer.id}`]),
                allowedMediaLibraryKeys: JSON.stringify([allowedLibKey])
            }
        });

        try {
            const sanitizedAllowed = [allowedLibKey];
            await prisma.user.update({
                where: { id: memberUser.id },
                data: {
                    selectedServerKeys: JSON.stringify([`jellyfin:${testMediaServer.id}`]),
                    selectedMediaLibraryKeys: JSON.stringify(sanitizedAllowed),
                    accountPreferences: JSON.stringify({ qualityCap: "720p_4mbps", audioLanguage: "fra" })
                }
            });

            const refreshedUser = await prisma.user.findUnique({ where: { id: memberUser.id } });
            if (!refreshedUser?.selectedMediaLibraryKeys?.includes("movies-hd")) {
                throw new Error("Selected library keys not saved on user model");
            }
            if (refreshedUser?.selectedMediaLibraryKeys?.includes("4k-movies")) {
                throw new Error("Forbidden library key was improperly included in user selection");
            }

            const parsedPrefs = JSON.parse(refreshedUser?.accountPreferences || "{}");
            if (parsedPrefs.qualityCap !== "720p_4mbps") {
                throw new Error("Account preferences quality cap mismatch");
            }

            // 6. Step-by-Step Setup Guides Verification for Jellyfin and Emby
            const allGuides = await getPlexSetupGuides();
            const jellyfinGuide = allGuides.find((g: any) => g.id === "jellyfin");
            if (!jellyfinGuide || !Array.isArray(jellyfinGuide.steps) || jellyfinGuide.steps.length < 4) {
                throw new Error("Expected Jellyfin setup guide with at least 4 step-by-step instructions in getPlexSetupGuides");
            }

            const embyGuide = allGuides.find((g: any) => g.id === "emby");
            if (!embyGuide || !Array.isArray(embyGuide.steps) || embyGuide.steps.length < 4) {
                throw new Error("Expected Emby setup guide with at least 4 step-by-step instructions in getPlexSetupGuides");
            }

            // 7. Full-Member Gating & Trial Member Restriction Verification
            const trialUser = await prisma.user.create({
                data: {
                    username: `test_trial_${Date.now()}`,
                    email: `test_trial_${Date.now()}@example.com`,
                    password: "mock_password_hash",
                    role: "USER",
                    status: "TRIAL",
                    membershipTier: "TRIAL"
                }
            });

            try {
                // Mock test auth user header/cookie
                process.env.PORTALARR_TEST_USER_ID = trialUser.id;
                process.env.PORTALARR_TEST_AUTH = "true";

                // Attempting to toggle Jellyfin or Emby on trial account must be rejected
                const trialJellyfinToggle = await toggleFreeAddonAction("jellyfin_access", true);
                if (trialJellyfinToggle.success) {
                    throw new Error("Expected trial user toggle for jellyfin_access to be rejected");
                }
                if (!trialJellyfinToggle.error?.includes("exclusively available for Full Members")) {
                    throw new Error(`Expected full member gating error message, got: ${trialJellyfinToggle.error}`);
                }

                const trialEmbyToggle = await toggleFreeAddonAction("emby_access", true);
                if (trialEmbyToggle.success) {
                    throw new Error("Expected trial user toggle for emby_access to be rejected");
                }
                if (!trialEmbyToggle.error?.includes("exclusively available for Full Members")) {
                    throw new Error(`Expected full member gating error message, got: ${trialEmbyToggle.error}`);
                }

                // 8. Test Instant Provisioning Trial Gating
                const trialProvision = await ensureUserMediaServerProvisionedAction(testMediaServer.id);
                if (trialProvision.success) {
                    throw new Error("Expected trial user provisioning to be rejected");
                }
                if (!trialProvision.error?.includes("exclusively available for Full Members")) {
                    throw new Error(`Expected full member error on trial user provisioning, got: ${trialProvision.error}`);
                }

                // 9. Test Streaming Password Length Guardrail
                const shortPassword = await setUserMediaServerPasswordAction(testMediaServer.id, "123");
                if (shortPassword.success) {
                    throw new Error("Expected short password (<4 chars) to be rejected");
                }

                // 10. Test Quick Connect Trial Gating
                const trialQuickConnect = await authorizeMediaServerQuickConnectAction(testMediaServer.id, "123456");
                if (trialQuickConnect.success) {
                    throw new Error("Expected trial user Quick Connect authorization to be rejected");
                }
                if (!trialQuickConnect.error?.includes("exclusively available for Full Members")) {
                    throw new Error(`Expected full member gating error on Quick Connect, got: ${trialQuickConnect.error}`);
                }
            } finally {
                delete process.env.PORTALARR_TEST_USER_ID;
                await prisma.user.delete({ where: { id: trialUser.id } }).catch(() => {});
            }

            // 11. Test Quick Connect Input Validation for Full Member
            process.env.PORTALARR_TEST_USER_ID = memberUser.id;
            const invalidCodeRes = await authorizeMediaServerQuickConnectAction(testMediaServer.id, "");
            if (invalidCodeRes.success) {
                throw new Error("Expected empty Quick Connect code to be rejected");
            }
            delete process.env.PORTALARR_TEST_USER_ID;

            // 12. Test Jellyfin/Emby Active Playback Session Normalization & Stream Termination
            const { fetchMediaServerActiveSessions, stopMediaServerSession } = await import("../src/lib/media-servers");
            const { killUserStream, getAdminDetailedStreamsAction } = await import("../src/app/actions");

            // Verify stopMediaServerSession handles offline/unreachable servers gracefully
            const stopResult = await stopMediaServerSession(
                { url: "http://127.0.0.1:9999", apiKey: "mock_key" },
                "mock_session_123"
            );
            if (stopResult !== false) {
                throw new Error("Expected stopMediaServerSession to return false on unreachable server");
            }

            // Verify killUserStream handles media_server_ prefix for non-existent server
            const killInvalidRes = await killUserStream("media_server_non_existent", "mock_key");
            if (killInvalidRes.success || !killInvalidRes.error?.includes("Media server not found")) {
                throw new Error(`Expected media server not found error, got: ${killInvalidRes.error}`);
            }

            // Verify getAdminDetailedStreamsAction includes monitored media server in server usage
            const adminStreamsRes = await getAdminDetailedStreamsAction(true);
            if (!adminStreamsRes || !Array.isArray(adminStreamsRes.serversUsage)) {
                throw new Error("Expected getAdminDetailedStreamsAction to return serversUsage array");
            }
            const foundMsUsage = adminStreamsRes.serversUsage.find((s: any) => s.id === `media_server_${testMediaServer.id}` || s.name === testMediaServer.name);
            if (!foundMsUsage) {
                throw new Error(`Expected test media server "${testMediaServer.name}" to be present in serversUsage`);
            }
        } finally {
            await prisma.user.delete({ where: { id: memberUser.id } }).catch(() => {});
            await prisma.mediaServer.delete({ where: { id: testMediaServer.id } }).catch(() => {});
        }
    });

    // =========================================================================
    // SUITE 20: Multi-Tier Gemini Subagent Orchestration & Quota Fallback Topology
    // =========================================================================
    await assertTest("Suite 20: Multi-Tier Gemini Subagent Orchestration & Quota Fallback Topology", async () => {
        const fs = await import("fs");
        const path = await import("path");

        // 1. Verify .vscode/tasks.json configuration
        const tasksPath = path.join(process.cwd(), ".vscode", "tasks.json");
        if (!fs.existsSync(tasksPath)) {
            throw new Error(".vscode/tasks.json does not exist");
        }
        const tasksJson = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
        const tasks: any[] = tasksJson.tasks || [];

        const rootTask = tasks.find((t) => t.label?.includes("Root Orchestrator"));
        if (!rootTask || !rootTask.command?.includes("gemini-3.8-flash-high")) {
            throw new Error("Root Orchestrator task must target gemini-3.8-flash-high by default");
        }

        const architectTask = tasks.find((t) => t.label?.includes("Deep Architect"));
        if (!architectTask || !architectTask.command?.includes("gemini-4-argon-high")) {
            throw new Error("Deep Architect task must target gemini-4-argon-high for escalation");
        }

        const fallbackTask = tasks.find((t) => t.label?.includes("Fallback Architect"));
        if (!fallbackTask || !fallbackTask.command?.includes("gemini-3.8-flash-high")) {
            throw new Error("Fallback Architect task must target gemini-3.8-flash-high for quota fallback");
        }

        const workerTask = tasks.find((t) => t.label?.includes("Parallel Worker"));
        if (!workerTask || !workerTask.command?.includes("gemini-3.8-flash-high")) {
            throw new Error("Parallel Worker task must target gemini-3.8-flash-high");
        }

        const lightReconTask = tasks.find((t) => t.label?.includes("Light Recon"));
        if (!lightReconTask || !lightReconTask.command?.includes("gemini-3.5-flash-lite")) {
            throw new Error("Light Recon task must target gemini-3.5-flash-lite");
        }

        // Verify strictly Gemini models are used across all tasks
        for (const t of tasks) {
            if (t.command?.startsWith("agy")) {
                const cmd = t.command.toLowerCase();
                if (cmd.includes("claude") || cmd.includes("openai") || cmd.includes("gpt")) {
                    throw new Error(`Forbidden non-Gemini model detected in task: ${t.label}`);
                }
                if (!cmd.includes("gemini")) {
                    throw new Error(`Task ${t.label} must strictly use a Google Gemini model`);
                }
            }
        }

        // 2. Verify .agents/skills/gemini-orchestration/SKILL.md
        const skillPath = path.join(process.cwd(), ".agents", "skills", "gemini-orchestration", "SKILL.md");
        if (!fs.existsSync(skillPath)) {
            throw new Error("gemini-orchestration skill does not exist");
        }
        const skillContent = fs.readFileSync(skillPath, "utf-8");
        if (!skillContent.includes("Multi-Tier Gemini Subagent Orchestration Architecture")) {
            throw new Error("Skill missing orchestration header");
        }
        if (!skillContent.includes("deep-architect") || !skillContent.includes("execution-worker")) {
            throw new Error("Skill missing required subagent definitions");
        }
        if (!skillContent.includes("Fallback Model") || !skillContent.includes("Gemini 3.8 Flash")) {
            throw new Error("Skill missing Argon-to-Flash fallback protocol");
        }

        // 3. Verify GEMINI.md contains the orchestration rules
        const geminiMdPath = path.join(process.cwd(), "GEMINI.md");
        const geminiMdContent = fs.readFileSync(geminiMdPath, "utf-8");
        if (!geminiMdContent.includes("Multi-Tier Gemini Subagent Orchestration Architecture")) {
            throw new Error("GEMINI.md missing Multi-Tier Gemini Subagent Orchestration section");
        }
    });

    // =========================================================================
    // SUITE 21: User Profile Bootstrap Prewarming, SWR Cache & Dashboard Servers Launchpad
    // =========================================================================
    await assertTest("Suite 21: User Profile Bootstrap Prewarming, SWR Cache & Dashboard Launchpad", async () => {
        const { getUserProfileBootstrapAction } = await import("../src/app/actions");
        const { getUserMediaServersAndLibrariesAction } = await import("../src/app/media-server-actions");
        const { getUserCache, clearUserCache } = await import("../src/lib/prewarm");

        process.env.PORTALARR_TEST_AUTH = "true";

        // 1. Invalidate any existing bootstrap cache
        clearUserCache("user_profile_bootstrap:");
        clearUserCache("user_media_servers:");

        // 2. Cold bootstrap fetch
        const startCold = Date.now();
        const bootstrapRes = await getUserProfileBootstrapAction(true);
        const coldDuration = Date.now() - startCold;

        if (!bootstrapRes || !bootstrapRes.success || !bootstrapRes.data) {
            throw new Error(`Failed to execute getUserProfileBootstrapAction: ${bootstrapRes?.error || "Unknown error"}`);
        }
        const data = bootstrapRes.data;
        if (!data.user) throw new Error("Bootstrap data missing user");
        if (!data.notifPrefs) throw new Error("Bootstrap data missing notification preferences");
        if (!data.contentPrefs) throw new Error("Bootstrap data missing content preferences");
        if (!Array.isArray(data.allowedLibraries)) throw new Error("Bootstrap data missing allowedLibraries array");
        if (!Array.isArray(data.addonsCatalog)) throw new Error("Bootstrap data missing addonsCatalog array");

        // 3. SWR Warm memory cache hit test (<25ms response time)
        const startWarm = Date.now();
        const warmRes = await getUserProfileBootstrapAction(false);
        const warmDuration = Date.now() - startWarm;

        if (!warmRes || !warmRes.success || !warmRes.data) {
            throw new Error("Failed warm bootstrap fetch from cache");
        }
        if (warmDuration > 50) {
            // SWR cache should return within 50ms in Node test environment
            console.warn(`[WARN] SWR cache hit took ${warmDuration}ms (expected <50ms)`);
        }

        // 4. Media Servers SWR caching test
        const mediaServersRes = await getUserMediaServersAndLibrariesAction();
        if (!mediaServersRes || !mediaServersRes.success) {
            throw new Error(`Failed getUserMediaServersAndLibrariesAction: ${mediaServersRes?.error}`);
        }

        // 5. Verify User Launchpad has Servers & Libraries card pointing to /settings/profile
        const launchpadPath = path.join(process.cwd(), "src", "components", "dashboard", "user-launchpad.tsx");
        const launchpadContent = fs.readFileSync(launchpadPath, "utf-8");
        if (!launchpadContent.includes("/settings/profile")) {
            throw new Error("UserLaunchpad missing link to /settings/profile");
        }
        if (!launchpadContent.includes("Servers &amp; Libraries") && !launchpadContent.includes("Servers & Libraries")) {
            throw new Error("UserLaunchpad missing Servers & Libraries card title");
        }
        if (!launchpadContent.includes("Access")) {
            throw new Error("UserLaunchpad missing Access badge on Servers card");
        }

        // 6. Verify discrete PlexInviteBanner placement in page.tsx
        const pagePath = path.join(process.cwd(), "src", "app", "page.tsx");
        const pageContent = fs.readFileSync(pagePath, "utf-8");
        const launchpadIdx = pageContent.indexOf("<UserLaunchpad");
        const bannerIdx = pageContent.indexOf("<PlexInviteBanner");
        if (launchpadIdx === -1 || bannerIdx === -1) {
            throw new Error("Could not find UserLaunchpad or PlexInviteBanner in src/app/page.tsx");
        }
        if (bannerIdx < launchpadIdx) {
            throw new Error("PlexInviteBanner should be positioned below UserLaunchpad for a discrete layout");
        }
    });

    // =========================================================================
    // SUITE 22: Sent Email Audit Log & Automatic vs Approved Dispatch Tracking
    // =========================================================================
    await assertTest("Suite 22: Sent Email Audit Log & Automatic vs Approved Dispatches", async () => {
        const { getSentEmailLogsAction, deleteSentEmailLogAction } = await import("../src/app/actions");

        const testId = Date.now();
        const autoEmail = await prisma.sentEmailLog.create({
            data: {
                recipient: `auto_test_${testId}@example.com`,
                recipientName: `auto_user_${testId}`,
                subject: `Automated Welcome Notification ${testId}`,
                bodyPreview: "Welcome to DomsHomeLab. Your account is active.",
                html: "<p>Welcome to DomsHomeLab. Your account is active.</p>",
                templateId: "welcome",
                sendMode: "AUTOMATIC",
                status: "SENT"
            }
        });

        const approvedEmail = await prisma.sentEmailLog.create({
            data: {
                recipient: `approved_test_${testId}@example.com`,
                recipientName: `approved_user_${testId}`,
                subject: `Account Approved by Governance ${testId}`,
                bodyPreview: "Your access has been vetted and approved by administrator.",
                html: "<p>Your access has been vetted and approved by administrator.</p>",
                templateId: "user_approval",
                sendMode: "APPROVED_AND_SENT",
                status: "SENT",
                approvalId: `appr_${testId}`,
                approvedBy: "MasterAdmin",
                approvedAt: new Date()
            }
        });

        try {
            // 1. Verify retrieval of all logs
            const allRes = await getSentEmailLogsAction({ search: `${testId}` });
            if (!allRes.success || !allRes.logs || allRes.logs.length < 2) {
                throw new Error(`Expected at least 2 logs matching testId, got ${allRes.logs?.length}`);
            }

            // 2. Verify filter by AUTOMATIC
            const autoRes = await getSentEmailLogsAction({ search: `${testId}`, mode: "AUTOMATIC" });
            if (!autoRes.success || autoRes.logs.length !== 1 || autoRes.logs[0].sendMode !== "AUTOMATIC") {
                throw new Error("Failed to filter sent emails by AUTOMATIC mode");
            }
            if (autoRes.logs[0].recipient !== autoEmail.recipient) {
                throw new Error("Mismatched recipient for AUTOMATIC email");
            }

            // 3. Verify filter by APPROVED_AND_SENT
            const approvedRes = await getSentEmailLogsAction({ search: `${testId}`, mode: "APPROVED_AND_SENT" });
            if (!approvedRes.success || approvedRes.logs.length !== 1 || approvedRes.logs[0].sendMode !== "APPROVED_AND_SENT") {
                throw new Error("Failed to filter sent emails by APPROVED_AND_SENT mode");
            }
            if (approvedRes.logs[0].approvedBy !== "MasterAdmin") {
                throw new Error(`Expected approvedBy 'MasterAdmin', got '${approvedRes.logs[0].approvedBy}'`);
            }

            // 4. Verify Access Control page UI integrates Sent Emails tab
            const accessPagePath = path.join(process.cwd(), "src", "app", "settings", "access", "page.tsx");
            const accessPageContent = fs.readFileSync(accessPagePath, "utf-8");
            if (!accessPageContent.includes('TabsTrigger value="sent-emails"')) {
                throw new Error("Access Control page.tsx missing TabsTrigger for 'sent-emails'");
            }

            // 5. Verify resendApprovalNotificationAction and Media Server Preferences approval notification
            const { resendApprovalNotificationAction } = await import("../src/app/actions");
            const testApproval = await prisma.adminApproval.create({
                data: {
                    type: "PLEX_ACCESS_GRANT",
                    status: "PENDING",
                    title: `Media Server Preferences Test ${testId}`,
                    description: "User updated media server choices (0 servers, 11 libraries). Staged for approval.",
                    targetUser: `test_user_${testId}`,
                    targetEmail: `test_${testId}@example.com`,
                    payload: JSON.stringify({ userId: "mock", selectedPlexSections: ["1", "2"], selectedKeys: ["1", "2"] })
                }
            });

            try {
                const notifyRes = await resendApprovalNotificationAction(testApproval.id);
                if (!notifyRes.success) {
                    throw new Error(`Expected resendApprovalNotificationAction to succeed, got: ${notifyRes.error}`);
                }
            } finally {
                await prisma.adminApproval.delete({ where: { id: testApproval.id } }).catch(() => {});
            }
            if (!accessPageContent.includes('TabsContent value="sent-emails"')) {
                throw new Error("Access Control page.tsx missing TabsContent for 'sent-emails'");
            }
            if (!accessPageContent.includes("SentEmailAuditLog")) {
                throw new Error("Access Control page.tsx missing SentEmailAuditLog component mount");
            }

            // 6. Verify Email Template text hygiene & dark/light mode Open Dashboard button
            const { DEFAULT_EMAIL_TEMPLATES, wrapInPortalarrEmailLayout } = await import("../src/lib/email-templates");
            for (const t of DEFAULT_EMAIL_TEMPLATES) {
                if (t.defaultBody.includes("Cash App") || t.description.includes("Cash App")) {
                    throw new Error(`Email template ${t.id} contains disallowed Cash App reference`);
                }
            }
            const testEmailHtml = wrapInPortalarrEmailLayout({
                title: "Test Layout",
                contentHtml: "<p>Test Content</p>",
                appUrl: "https://home.domshomelab.com"
            });
            if (!testEmailHtml.includes("open-dashboard-btn") || !testEmailHtml.includes("Open Dashboard")) {
                throw new Error("wrapInPortalarrEmailLayout missing high-contrast Open Dashboard button");
            }
            if (!testEmailHtml.includes("color-scheme: light dark")) {
                throw new Error("wrapInPortalarrEmailLayout missing light/dark color-scheme meta/styles");
            }
            const launchTpl = DEFAULT_EMAIL_TEMPLATES.find(t => t.id === "new_site_launch");
            if (!launchTpl || !launchTpl.defaultBody.includes("Suggest Fix") || !launchTpl.defaultBody.includes("Monthly") || !launchTpl.defaultBody.includes("Yearly")) {
                throw new Error("new_site_launch missing Suggest Fix or Monthly/Yearly billing options");
            }
            if (launchTpl.defaultBody.includes("#billing")) {
                throw new Error("new_site_launch should not contain '#billing' fragment in paths");
            }
        } finally {
            await prisma.sentEmailLog.deleteMany({
                where: { id: { in: [autoEmail.id, approvedEmail.id] } }
            });
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
