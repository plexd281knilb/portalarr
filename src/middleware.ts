import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "");

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = req.cookies.get("session")?.value;

  // 1. Allow access to public static assets and API routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.includes(".") // Catch other static files
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
        // Invalid session, let them stay on login
      }
    }
    return NextResponse.next();
  }

  // 3. Require login for everything else
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const { payload } = await jwtVerify(session, JWT_SECRET);

    // 4. Role-based protection for Admin routes
    const isAdminRoute = 
      pathname.startsWith("/admin") || 
      pathname.startsWith("/settings");

    if (isAdminRoute && payload.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.next();
  } catch (err) {
    // Invalid session, redirect to login and clear cookie
    const response = NextResponse.redirect(new URL("/login", req.url));
    response.cookies.delete("session");
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
