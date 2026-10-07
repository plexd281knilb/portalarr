import { execSync } from "child_process";

const ITERATIONS = 10;

interface IterationResult {
    iteration: number;
    durationMs: number;
    passed: boolean;
    error?: string;
}

async function runSoakTest() {
    console.log("==========================================================");
    console.log(`   PORTALARR AUTOMATED SOAK & STRESS SUITE (${ITERATIONS} CYCLES)   `);
    console.log("==========================================================\n");

    const results: IterationResult[] = [];
    const startTimeOverall = Date.now();

    for (let i = 1; i <= ITERATIONS; i++) {
        process.stdout.write(`[CYCLE ${String(i).padStart(2, '0')}/${ITERATIONS}] Running 79 verification test cases... `);
        const cycleStart = Date.now();
        let passed = true;
        let errorMsg = "";

        try {
            execSync("npx tsx scripts/verify-all.ts", {
                stdio: ["ignore", "pipe", "pipe"],
                timeout: 180000,
                env: { ...process.env, CI: "true" }
            });
        } catch (err: any) {
            passed = false;
            const stderr = err.stderr ? err.stderr.toString() : "";
            const stdout = err.stdout ? err.stdout.toString() : "";
            errorMsg = stderr || stdout || err.message;
        }

        const duration = Date.now() - cycleStart;
        results.push({ iteration: i, durationMs: duration, passed, error: errorMsg });

        if (passed) {
            console.log(`✅ PASSED (${(duration / 1000).toFixed(2)}s)`);
        } else {
            console.log(`❌ FAILED (${(duration / 1000).toFixed(2)}s)`);
            const snippet = errorMsg
                .split("\n")
                .filter(l => l.includes("FAILED") || l.includes("Error:") || l.includes("Expected"))
                .join(" | ");
            console.error(`   Failure Snippet: ${snippet || errorMsg.slice(0, 300)}`);
        }
    }

    const totalDuration = Date.now() - startTimeOverall;
    const passedCycles = results.filter(r => r.passed).length;
    const failedCycles = results.filter(r => !r.passed).length;
    const durations = results.map(r => r.durationMs);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);

    console.log("\n==========================================================");
    console.log("   SOAK & STRESS TEST REPORT SUMMARY                      ");
    console.log("==========================================================");
    console.log(`Total Cycles Run:        ${ITERATIONS}`);
    console.log(`Total Tests Executed:    ${ITERATIONS * 79}`);
    console.log(`Cycles Passed:           ${passedCycles} / ${ITERATIONS} (${((passedCycles / ITERATIONS) * 100).toFixed(1)}%)`);
    console.log(`Cycles Failed:           ${failedCycles} / ${ITERATIONS}`);
    console.log(`Fastest Cycle:           ${(minDuration / 1000).toFixed(2)}s`);
    console.log(`Slowest Cycle:           ${(maxDuration / 1000).toFixed(2)}s`);
    console.log(`Average Cycle:           ${(avgDuration / 1000).toFixed(2)}s`);
    console.log(`Total Elapsed Time:      ${(totalDuration / 1000).toFixed(2)}s`);
    console.log("==========================================================\n");

    if (failedCycles > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runSoakTest().catch((e) => {
    console.error("Fatal Soak Test Error:", e);
    process.exit(1);
});
