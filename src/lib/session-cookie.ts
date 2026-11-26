import { cookies, headers } from "next/headers";
import { SignJWT } from "jose";
import prisma from "@/lib/prisma";
import { getJwtSecret } from "@/lib/auth-secret";

export function isPrivateOrLocalHostHeader(rawHost: string): boolean {
  const host = (rawHost || "").trim().toLowerCase();
  if (!host) return false;
  return /^(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9-]+\.local|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(host);
}

export async function getAdaptiveCookieOptions(customMaxAge?: number) {
  let isSecure = process.env.NODE_ENV === "production";
  try {
    const h = await headers();
    const proto = (h.get("x-forwarded-proto") || "").split(",")[0].trim().toLowerCase();
    const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim().toLowerCase();
    const origin = (h.get("origin") || h.get("referer") || "").trim().toLowerCase();
    const isLocalHost = isPrivateOrLocalHostHeader(host);

    if (proto === "https" || origin.startsWith("https://")) {
      isSecure = true;
    } else if (origin.startsWith("http://") || proto === "http" || isLocalHost) {
      isSecure = false;
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
