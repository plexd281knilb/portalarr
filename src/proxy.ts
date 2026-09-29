import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/auth-secret";

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

  // 2. Allow access to public routes: /join, /login & pending status page without redirect loops
  if (pathname === "/join" || pathname.startsWith("/join/")) {
    return NextResponse.next();
  }

  if (pathname === "/login") {
    if (session) {
      try {
        const { payload } = await jwtVerify(session, getJwtSecret());
        let status = (payload.status as string) || "APPROVED";
        const now = Date.now();
        if (status === "TRIAL" && payload.trialEndsAt && new Date(payload.trialEndsAt as string).getTime() < now) {
          status = "EXPIRED";
        }
        if (status === "APPROVED" && payload.subscriptionEndsAt && new Date(payload.subscriptionEndsAt as string).getTime() < now) {
          status = "EXPIRED";
        }
        if (status === "PENDING" || status === "REJECTED" || status === "SUSPENDED" || status === "EXPIRED") {
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
    const { payload } = await jwtVerify(session, getJwtSecret());
    let userStatus = (payload.status as string) || "APPROVED";

    // Auto-detect expired trials or subscriptions directly in proxy from JWT timestamps
    const now = Date.now();
    if (userStatus === "TRIAL" && payload.trialEndsAt && new Date(payload.trialEndsAt as string).getTime() < now) {
      userStatus = "EXPIRED";
    }
    if (userStatus === "APPROVED" && payload.subscriptionEndsAt && new Date(payload.subscriptionEndsAt as string).getTime() < now) {
      userStatus = "EXPIRED";
    }

    // 4. Pending, Rejected, Suspended, or Expired user protection
    if (userStatus === "PENDING" || userStatus === "REJECTED" || userStatus === "SUSPENDED" || userStatus === "EXPIRED") {
      if (pathname === "/pending") {
        return NextResponse.next();
      }
      if (pathname.startsWith("/api")) {
        return NextResponse.json({ error: `Account status: ${userStatus}` }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/pending", req.url));
    }

    // If an approved or trial user visits /pending, send them home
    if (pathname === "/pending") {
      return NextResponse.redirect(new URL("/", req.url));
    }

    // 5. Role-based protection for Admin routes
    if ((pathname.startsWith("/admin") || pathname.startsWith("/curation") || pathname.startsWith("/api/debug") || pathname.startsWith("/api/system")) && payload.role !== "ADMIN") {
      if (pathname.startsWith("/api")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/", req.url));
    }

    if (pathname.startsWith("/settings") && pathname !== "/settings/profile" && payload.role !== "ADMIN") {
      if (pathname.startsWith("/api")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      // Direct non-admin users to their Account Settings / Password Change screen (/profile)
      return NextResponse.redirect(new URL("/profile", req.url));
    }

    // 6. Role-based protection for Radarr/Sonarr routes
    if ((pathname.startsWith("/radarr") || pathname.startsWith("/sonarr")) && payload.role !== "ADMIN" && payload.role !== "SUPER_USER") {
      if (pathname.startsWith("/api")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/", req.url));
    }

    // 7. Strict route protection for TRIAL accounts
    // Trial accounts have access to: /, /discover, /requests, /guides, /profile, /settings/profile (password/my plex hub).
    // They are strictly forbidden from /library (Book Library), /radarr, /sonarr, /beta, /curation, /admin.
    const isTrialUser = (userStatus === "TRIAL" || payload.role === "TRIAL" || (payload as any).isTrial === true) && userStatus !== "APPROVED" && payload.role !== "ADMIN";
    if (isTrialUser) {
      if (
        pathname.startsWith("/library") || 
        pathname.startsWith("/radarr") || 
        pathname.startsWith("/sonarr") || 
        pathname.startsWith("/beta") ||
        pathname.startsWith("/curation") ||
        pathname.startsWith("/admin") ||
        (pathname.startsWith("/api/books") && !pathname.includes("/stream"))
      ) {
        if (pathname.startsWith("/api")) {
          return NextResponse.json({ error: "Trial accounts cannot access this service. Please upgrade to a full account." }, { status: 403 });
        }
        return NextResponse.redirect(new URL("/", req.url));
      }
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

