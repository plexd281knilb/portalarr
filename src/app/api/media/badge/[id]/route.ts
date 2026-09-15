import { NextRequest, NextResponse } from "next/server";
import { GET as getBadgeHandler } from "@/app/api/curation/badges/[id]/route";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    return getBadgeHandler(req, context);
}
