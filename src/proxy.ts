import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET || "default-secret-key-change-me");

// Renamed back to "proxy" for Next.js 16+
export async function proxy(req: NextRequest) {
  const session = req.cookies.get("session")?.value;
  const { pathname } = req.nextUrl;

  const isProtectedRoute = 
       pathname.startsWith("/admin") 
    || pathname.startsWith("/users")
    || pathname.startsWith("/payments")
    || pathname.startsWith("/settings");

  if (isProtectedRoute) {
    if (!session) {
      console.log("[PROXY] No session found. Redirecting to login.");
      return NextResponse.redirect(new URL("/login", req.url));
    }

    try {
      await jwtVerify(session, SECRET_KEY);
      return NextResponse.next();
    } catch (err) {
      console.log("[PROXY] Token invalid or expired. Redirecting.");
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};