import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/app/auth-actions";
import { getPaymentEmailSources, getPaymentTransactions } from "@/app/payment-actions";
import { getAppUsersResult } from "@/app/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (String(user.role || "").toUpperCase() !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const filter = req.nextUrl.searchParams.get("filter") || "ALL";

        const [sourcesRes, txRes, usersRes] = await Promise.all([
            getPaymentEmailSources(),
            getPaymentTransactions(filter),
            getAppUsersResult(),
        ]);

        return NextResponse.json(
            {
                sources: sourcesRes,
                transactions: txRes,
                users: usersRes?.users || [],
            },
            {
                headers: { "Cache-Control": "no-store, max-age=0" },
            }
        );
    } catch (e: any) {
        console.error("GET /api/admin/payment-emails error:", e);
        return NextResponse.json(
            { error: e?.message || "Failed to load payment email data" },
            { status: 500 }
        );
    }
}
