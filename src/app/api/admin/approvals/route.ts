import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/app/auth-actions";
import {
    getAdminApprovalsAction,
    getApprovalSettingsAction,
    getEmailTemplatesAction,
} from "@/app/actions";

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

        const sp = req.nextUrl.searchParams;
        const status = sp.get("status") || "PENDING";
        const type = sp.get("type") || "ALL";
        const page = Number(sp.get("page") || "1") || 1;
        const pageSize = Number(sp.get("pageSize") || "50") || 50;
        const includeTemplates = sp.get("includeTemplates") !== "0";

        const [approvalsRes, settingsRes, templatesRes] = await Promise.all([
            getAdminApprovalsAction({ status, type, page, pageSize }),
            getApprovalSettingsAction(),
            includeTemplates ? getEmailTemplatesAction() : Promise.resolve(null),
        ]);

        return NextResponse.json(
            {
                approvals: approvalsRes,
                approvalSettings: settingsRes,
                templates: templatesRes,
            },
            {
                headers: { "Cache-Control": "no-store, max-age=0" },
            }
        );
    } catch (e: any) {
        console.error("GET /api/admin/approvals error:", e);
        return NextResponse.json(
            { error: e?.message || "Failed to load approval queue" },
            { status: 500 }
        );
    }
}
