import { NextResponse } from "next/server";
import { getCurrentUser, getSession } from "@/app/auth-actions";
import {
    getPublicSmtpFromEmail,
    getKindleSenderUpdateNoticeStatusAction,
    getLibraries,
    getBookRequests,
    getAppUsersResult,
    getEbooksUserGuide,
    getKindleDeliveryLogs,
} from "@/app/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
    try {
        const [session, profile] = await Promise.all([
            getSession().catch(() => null),
            getCurrentUser().catch(() => null),
        ]);

        if (!session && !profile) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const isAdmin =
            String(session?.role || "").toUpperCase() === "ADMIN" ||
            String(profile?.role || "").toUpperCase() === "ADMIN";

        const [
            smtpFromEmail,
            kindleNotice,
            libraries,
            requests,
            usersRes,
            guideMarkdown,
            kindleLogs,
        ] = await Promise.all([
            getPublicSmtpFromEmail("kindle").catch(() => ""),
            getKindleSenderUpdateNoticeStatusAction().catch(() => null),
            getLibraries().catch(() => []),
            getBookRequests().catch(() => []),
            isAdmin
                ? getAppUsersResult().catch(() => ({ success: false, users: [] }))
                : Promise.resolve({ success: true, users: [] }),
            getEbooksUserGuide().catch(() => ""),
            getKindleDeliveryLogs().catch(() => []),
        ]);

        return NextResponse.json(
            {
                session,
                profile,
                smtpFromEmail: smtpFromEmail || "",
                kindleNotice,
                libraries: libraries || [],
                requests: requests || [],
                allUsers: usersRes?.users || [],
                guideMarkdown: guideMarkdown || "",
                kindleLogs: kindleLogs || [],
            },
            {
                headers: {
                    "Cache-Control": "no-store, max-age=0",
                },
            }
        );
    } catch (e: any) {
        console.error("GET /api/books/bootstrap error:", e);
        return NextResponse.json(
            { error: e?.message || "Failed to load book library bootstrap" },
            { status: 500 }
        );
    }
}
