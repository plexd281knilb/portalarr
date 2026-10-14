import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/app/auth-actions";
import { executeScript } from "@/lib/scripts/script-runner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const { scriptId, customCode } = body;

        if (!scriptId) {
            return NextResponse.json({ error: "scriptId is required." }, { status: 400 });
        }

        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    await executeScript({
                        scriptId,
                        customCode,
                        runMode: "interactive",
                        onLog: (line: string) => {
                            try {
                                controller.enqueue(encoder.encode(`${line}\n`));
                            } catch (_) {}
                        },
                        abortSignal: req.signal
                    });
                } catch (err: any) {
                    try {
                        controller.enqueue(encoder.encode(`[ERROR] Execution failed: ${err.message}\n`));
                    } catch (_) {}
                } finally {
                    try {
                        controller.close();
                    } catch (_) {}
                }
            },
            cancel() {
                // Triggered if client closes the connection stream
            }
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                "X-Content-Type-Options": "nosniff",
                "Connection": "keep-alive"
            }
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Failed to initiate script run" }, { status: 500 });
    }
}
