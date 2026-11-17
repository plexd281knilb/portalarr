import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, JWTPayload } from "jose";
import path from "path";
import prisma from "@/lib/prisma";
import { getJwtSecret } from "@/lib/auth-secret";

/**
 * Resolves `relativeInput` inside `baseDir` and rejects any null bytes or directory traversal
 * escaping `baseDir`. Returns the normalized absolute path or `null` if invalid.
 */
export function resolveContainedPath(
    baseDir: string,
    relativeInput: string,
    allowBaseSelf: boolean = false
): string | null {
    if (!relativeInput || relativeInput.includes("\0")) return null;
    const resolvedBase = path.resolve(/*turbopackIgnore: true*/ baseDir);
    const cleanRel = relativeInput.replace(/^[/\\]+/, "");
    const resolvedTarget = path.resolve(/*turbopackIgnore: true*/ resolvedBase, cleanRel);

    if (resolvedTarget === resolvedBase) {
        return allowBaseSelf ? resolvedTarget : null;
    }
    const basePrefix = resolvedBase.endsWith(path.sep) ? resolvedBase : `${resolvedBase}${path.sep}`;
    return resolvedTarget.startsWith(basePrefix) ? resolvedTarget : null;
}

export function checkBookLibraryAccess(
    allowedUsersStr: string,
    restrictedUsersStr: string = "",
    username: string = "",
    email: string = "",
    role: string = ""
): boolean {
    if ((role || "").toUpperCase() === "ADMIN") return true;

    const safeUsername = (username || "").toLowerCase();
    const safeEmail = (email || "").toLowerCase();

    if (restrictedUsersStr && restrictedUsersStr.trim() !== "") {
        const restricted = restrictedUsersStr.split(",").map(u => u.trim().toLowerCase()).filter(Boolean);
        if ((safeUsername && restricted.includes(safeUsername)) || (safeEmail && restricted.includes(safeEmail))) {
            return false;
        }
    }

    if (!allowedUsersStr || allowedUsersStr.trim() === "" || allowedUsersStr.trim() === "*") return true;
    const allowed = allowedUsersStr.split(",").map(u => u.trim().toLowerCase()).filter(Boolean);
    return Boolean(allowed.includes("*") || (safeUsername && allowed.includes(safeUsername)) || (safeEmail && allowed.includes(safeEmail)));
}

export async function verifyBookFileRequest(
    req: NextRequest,
    bookId: string
): Promise<{ error: NextResponse } | { book: any; payload: JWTPayload }> {
    const session = req.cookies.get("session")?.value;
    if (!session) {
        return { error: new NextResponse("Unauthorized", { status: 401 }) };
    }

    let payload: JWTPayload;
    try {
        const decoded = await jwtVerify(session, getJwtSecret());
        payload = decoded.payload;
    } catch {
        return { error: new NextResponse("Unauthorized", { status: 401 }) };
    }

    const userId = ((payload.userId || payload.id) as string) || "";
    if (!userId) {
        return { error: new NextResponse("Unauthorized", { status: 401 }) };
    }

    const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            username: true,
            email: true,
            role: true,
            status: true,
            membershipTier: true,
            trialEndsAt: true,
            subscriptionEndsAt: true
        }
    });

    if (!dbUser) {
        return { error: new NextResponse("Unauthorized", { status: 401 }) };
    }

    const isAdmin = String(dbUser.role || "").toUpperCase() === "ADMIN";
    const status = String(dbUser.status || "APPROVED").toUpperCase();
    const now = Date.now();

    if (!isAdmin) {
        if (status === "PENDING" || status === "REJECTED" || status === "SUSPENDED" || status === "EXPIRED") {
            return { error: new NextResponse(`Access denied: account ${status.toLowerCase()}`, { status: 403 }) };
        }
        if (status === "TRIAL" || dbUser.membershipTier === "TRIAL") {
            return { error: new NextResponse("Trial accounts cannot access book library files", { status: 403 }) };
        }
        if (dbUser.subscriptionEndsAt && new Date(dbUser.subscriptionEndsAt).getTime() < now) {
            return { error: new NextResponse("Access denied: subscription expired", { status: 403 }) };
        }
    }

    const book = await prisma.book.findUnique({
        where: { id: bookId },
        include: { library: true }
    });

    if (!book) {
        return { error: new NextResponse("Book Not Found", { status: 404 }) };
    }

    const hasAccess = checkBookLibraryAccess(
        book.library.allowedUsers,
        book.library.restrictedUsers || "",
        dbUser.username || "",
        dbUser.email || "",
        dbUser.role || ""
    );

    if (!hasAccess) {
        return { error: new NextResponse("Access Denied", { status: 403 }) };
    }

    return { book, payload };
}
