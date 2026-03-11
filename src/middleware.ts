import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// FIX: This must match the fallback key in auth-actions.ts EXACTLY
const SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET || "default-secret-key-change-me");

export async function middleware(req: NextRequest) {
  const session = req.cookies.get("session")?.value;
  const { pathname } = req.nextUrl;

  console.log(`[MIDDLEWARE] Checking path: ${pathname}`);

  // 1. DEFINE PROTECTED ROUTES
  // These are the paths that REQUIRE a login
  const isProtectedRoute = 
       pathname.startsWith("/admin") 
    || pathname.startsWith("/users")
    || pathname.startsWith("/payments")
    || pathname.startsWith("/settings");

  // 2. CHECK SESSION
  if (isProtectedRoute) {
    if (!session) {
      console.log("[MIDDLEWARE] No session found. Redirecting to login.");
      return NextResponse.redirect(new URL("/login", req.url));
    }

    try {
      // Verify Token is valid
      await jwtVerify(session, SECRET_KEY);
      console.log("[MIDDLEWARE] Token valid. Access granted.");
      return NextResponse.next();
    } catch (err) {
      console.log("[MIDDLEWARE] Token invalid or signature mismatch. Redirecting.");
      // Fake/Expired Token? Go to login
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};