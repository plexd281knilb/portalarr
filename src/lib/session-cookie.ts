import { cookies, headers } from "next/headers";
import { SignJWT } from "jose";
import prisma from "@/lib/prisma";
import { getJwtSecret } from "@/lib/auth-secret";

async function getAdaptiveCookieOptions(customMaxAge?: number) {
  let isSecure = process.env.NODE_ENV === "production";
  try {
    const h = await headers();
    const proto = h.get("x-forwarded-proto");
    const referer = h.get("referer");
    const host = h.get("host") || "";

    if (proto === "http" || referer?.startsWith("http://")) {
      isSecure = false;
    } else if (proto === "https" || referer?.startsWith("https://")) {
      isSecure = true;
    } else if (/^(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host)) {
      if (proto !== "https" && !referer?.startsWith("https://")) {
        isSecure = false;
      }
    }
  } catch {
    // In contexts where headers() cannot be read, fallback safely
  }

  return {
    httpOnly: true,
    secure: isSecure,
    path: "/",
    sameSite: "lax" as const,
    ...(customMaxAge !== undefined ? { maxAge: customMaxAge } : {})
  };
}

export async function createSession(
  userId: string,
  username: string,
  role: string,
  status: string = "APPROVED",
  trialEndsAt?: Date | string | null,
  subscriptionEndsAt?: Date | string | null,
  membershipTier?: string | null,
  skipLastLoginUpdate: boolean = false
) {
  const THIRTY_DAYS_SEC = 60 * 60 * 24 * 30; // 30 Days persistent login
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_SEC * 1000);

  if (!skipLastLoginUpdate) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { lastLogin: new Date() }
      });
    } catch (e) {
      console.error("[AUTH] Failed to update lastLogin for user:", e);
    }
  }

  const isAdmin = role === "ADMIN";
  const token = await new SignJWT({
    userId,
    username,
    role,
    status: isAdmin ? "APPROVED" : status,
    membershipTier: isAdmin ? "ADMIN" : (membershipTier || (status === "TRIAL" ? "TRIAL" : "STANDARD")),
    trialEndsAt: isAdmin ? null : (trialEndsAt ? new Date(trialEndsAt).toISOString() : null),
    subscriptionEndsAt: isAdmin ? null : (subscriptionEndsAt ? new Date(subscriptionEndsAt).toISOString() : null)
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getJwtSecret());

  try {
    const cookieOpts = await getAdaptiveCookieOptions(THIRTY_DAYS_SEC);
    (await cookies()).set("session", token, {
      ...cookieOpts,
      expires: expiresAt
    });
  } catch (cookieErr) {
    // In Server Components render context, Next.js does not allow setting cookies on the response.
  }
}
