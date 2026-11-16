import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/auth-actions";
import {
    getReferralStats,
    getPaymentAndTrialSettings,
    getAvailableAddonsAction,
    getAdminApprovalCountsAction,
} from "@/app/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (String(user.role || "").toUpperCase() !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const [referralsRes, paymentRes, addonsRes, approvalCountsRes] = await Promise.all([
            getReferralStats().catch((err) => ({ success: false, stats: null, error: err?.message })),
            getPaymentAndTrialSettings().catch((err) => ({ success: false, settings: null, error: err?.message })),
            getAvailableAddonsAction().catch((err) => ({ success: false, catalog: [], error: err?.message })),
            getAdminApprovalCountsAction().catch(() => ({ success: false, pendingCount: 0, totalCount: 0 })),
        ]);

        return NextResponse.json(
            {
                referrals: referralsRes,
                paymentSettings: paymentRes,
                addons: addonsRes,
                approvalCounts: approvalCountsRes,
            },
            {
                headers: {
                    "Cache-Control": "no-store, max-age=0",
                },
            }
        );
    } catch (e: any) {
        console.error("GET /api/admin/access-bootstrap error:", e);
        return NextResponse.json(
            { error: e?.message || "Failed to load access bootstrap data" },
            { status: 500 }
        );
    }
}
