import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/auth-actions";
import {
    getBroadcastUsersAction,
    getEmailTemplatesAction,
    getEmailNotificationSettings,
    getApprovalSettingsAction,
    getAnnualRecapVarsAction,
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

        const [usersRes, templatesRes, emailSettingsRes, approvalSettingsRes, annualRecapRes] = await Promise.all([
            getBroadcastUsersAction().catch((err) => ({ success: false, users: [], error: err?.message })),
            getEmailTemplatesAction().catch((err) => ({ success: false, templates: [], error: err?.message })),
            getEmailNotificationSettings().catch(() => ({ success: false, settings: null })),
            getApprovalSettingsAction().catch(() => ({ success: false })),
            getAnnualRecapVarsAction().catch(() => ({ success: false, vars: {} })),
        ]);

        return NextResponse.json(
            {
                users: usersRes,
                templates: templatesRes,
                emailSettings: emailSettingsRes,
                approvalSettings: approvalSettingsRes,
                annualRecap: annualRecapRes,
            },
            {
                headers: { "Cache-Control": "no-store, max-age=0" },
            }
        );
    } catch (e: any) {
        console.error("GET /api/admin/email-management error:", e);
        return NextResponse.json(
            { error: e?.message || "Failed to load email management data" },
            { status: 500 }
        );
    }
}
