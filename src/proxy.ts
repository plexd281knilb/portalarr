import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "build-time-fallback-key");

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = req.cookies.get("session")?.value;

  // 1. Allow access to public static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.includes(".") // Catch other static files (images, fonts, etc.)
  ) {
    return NextResponse.next();
  }

  // 2. Allow access to the login page
  if (pathname === "/login") {
    // If already logged in, redirect to home
    if (session) {
      try {
        await jwtVerify(session, JWT_SECRET);
        return NextResponse.redirect(new URL("/", req.url));
      } catch (e) {
        // Invalid session, let them stay on login page
      }
    }
    return NextResponse.next();
  }

  // 3. Require login for everything else (including all API routes)
  if (!session) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const { payload } = await jwtVerify(session, JWT_SECRET);

    // 4. Role-based protection for Admin routes
    const isAdminRoute = 
      pathname.startsWith("/admin") || 
      pathname.startsWith("/settings");

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
