import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getBuildTelemetry } from "@/lib/version";

export const dynamic = "force-dynamic";

const ICO_BY_KEY: Record<"prod" | "beta" | "dev", string> = {
    prod: "favicon-prod.ico",
    beta: "favicon-beta.ico",
    dev: "favicon-dev.ico",
};

export async function GET() {
    try {
        const telemetry = getBuildTelemetry();
        const filename = ICO_BY_KEY[telemetry.iconKey] || "favicon-prod.ico";
        const filePath = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "icons", filename);
        const bytes = await fs.promises.readFile(filePath);

        return new NextResponse(bytes, {
            status: 200,
            headers: {
                "Content-Type": "image/x-icon",
                "Cache-Control": "public, max-age=300",
            },
        });
    } catch {
        return new NextResponse(null, { status: 404 });
    }
}
