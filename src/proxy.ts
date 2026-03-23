import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET || "default-secret-key-change-me");

export async function proxy(req: NextRequest) {
  const session = req.cookies.get("session")?.value;
  const { pathname } = req.nextUrl;

  const isPublicRoute = pathname === "/login";

  // 1. Define the routes strictly reserved for Admins
  const isAdminRoute = 
       pathname.startsWith("/admin") 
    || pathname.startsWith("/users")
    || pathname.startsWith("/payments")
    || pathname.startsWith("/settings");

  // 2. Global Lock: If not on the login page and no session, kick to login
  if (!isPublicRoute && !session) {
    console.log("[PROXY] No session found. Redirecting to login.");
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // 3. If they DO have a session, verify it and check their role
  if (session) {
    try {
      // jwtVerify decodes the token so we can read the payload (username, role, etc.)
      const { payload } = await jwtVerify(session, SECRET_KEY);
      
      // UX Fix: Bounce logged-in users away from the login screen
      if (isPublicRoute) {
        return NextResponse.redirect(new URL("/", req.url));
      }
      
      // 4. THE BOUNCER: If it's an admin route and they aren't an admin, deny access
      if (isAdminRoute && payload.role !== "ADMIN") {
        console.log(`[PROXY] Access Denied: Standard user (${payload.username}) attempted to reach ${pathname}`);
        // Redirect them back to the safe user dashboard
        return NextResponse.redirect(new URL("/", req.url));
      }

      // If they pass all checks, let them through
      return NextResponse.next();
      
    } catch (err) {
      console.log("[PROXY] Token invalid or expired. Redirecting.");
      
      const response = NextResponse.redirect(new URL("/login", req.url));
      response.cookies.delete("session"); 
      
      if (!isPublicRoute) {
        return response;
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};