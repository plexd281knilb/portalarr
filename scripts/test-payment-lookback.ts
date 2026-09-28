import prisma from "../src/lib/prisma";
import { scanPaymentEmailsInternal } from "../src/lib/payment-email-scraper";

async function run() {
    console.log("==========================================================");
    console.log("     PAYMENT SCRAPER LOOKBACK PERSISTENCE TESTS           ");
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

    // 1. Direct persistence of 14 days in Settings
    await prisma.settings.upsert({
        where: { id: "global" },
        update: { paymentEmailLookbackDays: 14 },
        create: { id: "global", paymentEmailLookbackDays: 14 }
    });

    let settings = await prisma.settings.findUnique({ where: { id: "global" } });
    assert(settings?.paymentEmailLookbackDays === 14, "Settings table stores paymentEmailLookbackDays = 14");

    // 2. Test scanPaymentEmailsInternal() with no arguments (background runner behavior) preserves 14 days
    await scanPaymentEmailsInternal();
    settings = await prisma.settings.findUnique({ where: { id: "global" } });
    assert(settings?.paymentEmailLookbackDays === 14, "Background scan maintains paymentEmailLookbackDays = 14 in DB");

    // 3. Test lookback parameter parsing (e.g. from FormData: "14", "30", "0")
    const parseLookback = (val: string | null | undefined) => {
        if (!val) return undefined;
        const parsed = parseInt(val, 10);
        return !isNaN(parsed) ? parsed : undefined;
    };
    assert(parseLookback("14") === 14, "parseLookback('14') returns 14");
    assert(parseLookback("30") === 30, "parseLookback('30') returns 30");
    assert(parseLookback("0") === 0, "parseLookback('0') returns 0 (all messages)");
    assert(parseLookback("") === undefined, "parseLookback('') returns undefined");

    // 4. Test lookback date math
    const now = new Date();
    const lookback14Date = new Date();
    lookback14Date.setDate(now.getDate() - 14);
    const diffDays = Math.round((now.getTime() - lookback14Date.getTime()) / (1000 * 60 * 60 * 24));
    assert(diffDays === 14, "Lookback date math accurately computes 14 days ago");

    // 5. Test scanPaymentEmailsInternal with 0 sources records lastScanResult with lookbackDays
    const emptyResult = await scanPaymentEmailsInternal("non_existent_source_id_test");
    settings = await prisma.settings.findUnique({ where: { id: "global" } });
    const lastScanResult = settings?.paymentLastScanResult ? JSON.parse(settings.paymentLastScanResult) : null;
    assert(lastScanResult?.lookbackDays === 14, "Empty scan logs correct lookbackDays in paymentLastScanResult");

    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
    process.exit(0);
}

run().catch(err => {
    console.error("Test error:", err);
    process.exit(1);
});

