import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET || "default-secret-key-change-me");

// FIX: In Next.js, this exported function MUST be named "middleware"
export async function middleware(req: NextRequest) {
  const session = req.cookies.get("session")?.value;
  const { pathname } = req.nextUrl;

  // 1. DEFINE PROTECTED ROUTES
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
      return NextResponse.next();
    } catch (err) {
      console.log("[MIDDLEWARE] Token invalid or expired. Redirecting.");
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};