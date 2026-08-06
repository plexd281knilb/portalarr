import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "build-time-fallback-key");

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = req.cookies.get("session")?.value;

  // 1. Allow access to public static assets (strictly excluding /api endpoints)
  if (
    !pathname.startsWith("/api") &&
    (pathname.startsWith("/_next") ||
     pathname === "/favicon.ico" ||
     /\.(png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|eot|mp4|webm)$/i.test(pathname))
  ) {
    return NextResponse.next();
  }

  // 2. Allow access to the login page & pending status page without redirect loops
  if (pathname === "/login") {
    if (session) {
      try {
        const { payload } = await jwtVerify(session, JWT_SECRET);
        const status = (payload.status as string) || "APPROVED";
        if (status === "PENDING" || status === "REJECTED") {
          return NextResponse.redirect(new URL("/pending", req.url));
        }
        return NextResponse.redirect(new URL("/", req.url));
      } catch (e) {
        // Invalid session, allow login page
      }
    }
    return NextResponse.next();
  }

  // 3. Require login for everything else
  if (!session) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const { payload } = await jwtVerify(session, JWT_SECRET);
    const userStatus = (payload.status as string) || "APPROVED";

    // 4. Pending or Rejected user protection
    if (userStatus === "PENDING" || userStatus === "REJECTED") {
      if (pathname === "/pending") {
        return NextResponse.next();
      }
      if (pathname.startsWith("/api")) {
        return NextResponse.json({ error: "Account Pending Approval" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/pending", req.url));
    }

    // If an approved user visits /pending, send them home
    if (pathname === "/pending") {
      return NextResponse.redirect(new URL("/", req.url));
    }

    // 5. Role-based protection for Admin routes (excl. /settings/profile which is user self-management)
    const isAdminRoute = 
      pathname.startsWith("/admin") || 
      (pathname.startsWith("/settings") && pathname !== "/settings/profile");

    if (isAdminRoute && payload.role !== "ADMIN") {
      if (pathname.startsWith("/api")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.next();
  } catch (err) {
    // Invalid session, clean up session cookie and redirect/return 401
    if (pathname.startsWith("/api")) {
      const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      response.cookies.delete("session");
      return response;
    }
    const response = NextResponse.redirect(new URL("/login", req.url));
    response.cookies.delete("session");
    return response;
  }
}

