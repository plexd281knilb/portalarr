/**
 * PORTALARR EXTENDED BUILD & PRODUCTION VERIFICATION SUITE
 * 
 * Executes the complete 7-tier extended testing battery required before
 * pushing production milestone releases to the 'stable' branch.
 */

import { execSync } from "child_process";

interface ExtendedTier {
    tier: number;
    name: string;
    description: string;
    command: string;
}

const TIERS: ExtendedTier[] = [
    {
        tier: 1,
        name: "Strict TypeScript Type Integrity",
        description: "Zero type regressions, strict typechecks across all models, actions, and UI",
        command: "npx tsc --noEmit"
    },
    {
        tier: 2,
        name: "Curation Presets & Schedule Validator",
        description: "Audits all 49 curation presets, seasonal dates, and TMDb query definitions",
        command: "npx tsx scripts/test-all-presets.ts"
    },
    {
        tier: 3,
        name: "AI Server Assistant & Homelab Security Guardrails",
        description: "Audits 30 security guardrails, stream pattern analyzer, and diagnostic tools",
        command: "npx tsx scripts/test-ai-agent.ts"
    },
    {
        tier: 4,
        name: "Payment Scraper Lookback & Financial Engine",
        description: "Audits payment parsing, lookback retention, and settings synchronization",
        command: "npx tsx scripts/test-payment-lookback.ts"
    },
    {
        tier: 5,
        name: "Plex User Matching & Identity Resolution",
        description: "Audits identity heuristic collision guards, alphanumeric tokens, and user aliases",
        command: "npx tsx scripts/test-plex-lookup.ts"
    },
    {
        tier: 6,
        name: "Core System & Architecture 22-Suite Battery",
        description: "Full integration test suite covering database, edge, sync, and subscriptions",
        command: "npx tsx scripts/verify-all.ts"
    },
    {
        tier: 7,
        name: "Production Turbopack Next.js Build",
        description: "100% clean production compilation across all 40 static and dynamic routes",
        command: "next build"
    }
];

async function runExtendedVerification() {
    console.log("==========================================================");
    console.log("   PORTALARR EXTENDED BUILD VERIFICATION (STABLE GATE)    ");
    console.log("==========================================================\n");

    const startTime = Date.now();
    let passedTiers = 0;
    let failedTiers = 0;

    for (const t of TIERS) {
        console.log(`[TIER ${t.tier}/7] ${t.name}`);
        console.log(`         ${t.description}`);
        const tierStart = Date.now();

        try {
            execSync(t.command, {
                stdio: "inherit",
                env: { ...process.env, CI: "true", PORTALARR_EXTENDED: "true" }
            });
            const duration = ((Date.now() - tierStart) / 1000).toFixed(2);
            console.log(`>>> ✅ TIER ${t.tier} PASSED (${duration}s)\n`);
            passedTiers++;
        } catch (err: any) {
            const duration = ((Date.now() - tierStart) / 1000).toFixed(2);
            console.error(`>>> ❌ TIER ${t.tier} FAILED (${duration}s)\n`);
            failedTiers++;
            console.error("==========================================================");
            console.error(`   EXTENDED VERIFICATION FAILED AT TIER ${t.tier}: ${t.name}`);
            console.error("==========================================================");
            process.exit(1);
        }
    }

    const totalSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("==========================================================");
    console.log(`   EXTENDED VERIFICATION PASSED: 7/7 TIERS GREEN (${totalSeconds}s)   `);
    console.log("   100% READY FOR PRODUCTION DEPLOYMENT ON STABLE BRANCH  ");
    console.log("==========================================================\n");
}

runExtendedVerification();
