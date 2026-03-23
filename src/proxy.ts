import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// SECURITY FIX: Remove fallback. Throw error if missing.
if (!process.env.JWT_SECRET) {
  console.warn("FATAL: JWT_SECRET missing in environment variables.");
}
const SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET as string);

export async function proxy(req: NextRequest) {
  // Fail closed if the server is misconfigured
  if (!process.env.JWT_SECRET) {
    return new NextResponse("Server Misconfiguration: Missing Secret", { status: 500 });
  }

  const session = req.cookies.get("session")?.value;
  const { pathname } = req.nextUrl;

  const isPublicRoute = pathname === "/login";

  const isAdminRoute = 
       pathname.startsWith("/admin") 
    || pathname.startsWith("/users")
    || pathname.startsWith("/payments")
    || pathname.startsWith("/settings");

  if (!isPublicRoute && !session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (session) {
    try {
      const { payload } = await jwtVerify(session, SECRET_KEY);
      
      if (isPublicRoute) {
        return NextResponse.redirect(new URL("/", req.url));
      }
      
      if (isAdminRoute && payload.role !== "ADMIN") {
        return NextResponse.redirect(new URL("/", req.url));
      }

      return NextResponse.next();
      
    } catch (err) {
      const response = NextResponse.redirect(new URL("/login", req.url));
      response.cookies.delete("session"); 
      if (!isPublicRoute) return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};