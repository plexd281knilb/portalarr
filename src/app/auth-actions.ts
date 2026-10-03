"use server";

import { compare, hash } from "bcryptjs";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { redirect } from "next/navigation";
import { decryptData, encryptData } from "@/lib/encryption";
import { getPlexServerFriends } from "@/lib/plex";
import prisma from "@/lib/prisma";

import { getJwtSecret } from "@/lib/auth-secret";
import { getAppUrl } from "@/lib/app-url";
import { renderEmailTemplate } from "@/lib/email-templates";

// --- 1. SETUP CHECK ---
export async function checkSystemInitialized() {
  const count = await prisma.user.count();
  return count > 0;
}

// --- 2. SETUP FIRST ADMIN ---
export async function setupFirstAdmin(formData: FormData) {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  const email = formData.get("email") as string;

  if (!username || !password || !email) {
    return { error: "All fields are required" };
  }

  const existing = await prisma.user.count();
  if (existing > 0) {
    return { error: "System already initialized" };
  }

  const hashedPassword = await hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: { username, email, password: hashedPassword, role: "ADMIN", status: "APPROVED" }
    });

    await createSession(user.id, user.username, user.role, user.status, null, null, "STANDARD");
    return { success: true };
  } catch (e: any) {
    console.error("Setup Error:", e);
    return { error: e.message || "Setup failed" };
  }
}

// --- 3. LOGIN ACTION ---
export async function login(formData: FormData) {
  const input = (formData.get("username") as string)?.trim();
  const password = formData.get("password") as string;

  if (!input || !password) {
    return { error: "Username/Email and password required" };
  }

  const normalizedInput = input.toLowerCase();

  // Support login by Username or Email (case-insensitive)
  const allUsers = await prisma.user.findMany();
  const user = allUsers.find(
    (u) => u.username.toLowerCase() === normalizedInput || u.email.toLowerCase() === normalizedInput
  );

  if (!user) {
    return { error: "Invalid credentials" };
  }

  if (user.status === "REJECTED") {
    return { error: "Your account request was declined by the administrator." };
  }

  const isValid = await compare(password, user.password);

  if (!isValid) {
    return { error: "Invalid credentials" };
  }

  // Check if trial or subscription elapsed before creating session
  const now = new Date();
  let currentStatus = user.status;
  if (currentStatus === "TRIAL" && user.trialEndsAt && new Date(user.trialEndsAt) < now) {
    currentStatus = "EXPIRED";
    await prisma.user.update({ where: { id: user.id }, data: { status: "EXPIRED", plexLibrarySectionIds: "" } }).catch(() => {});
  } else if (currentStatus === "APPROVED" && user.subscriptionEndsAt && new Date(user.subscriptionEndsAt) < now) {
    currentStatus = "EXPIRED";
    await prisma.user.update({ where: { id: user.id }, data: { status: "EXPIRED", plexLibrarySectionIds: "" } }).catch(() => {});
  }

  // Auto-heal membership tier for approved members or admins whose tier is still marked as TRIAL
  let currentTier = user.membershipTier;
  if ((currentStatus === "APPROVED" || user.role === "ADMIN") && currentTier === "TRIAL") {
    currentTier = "STANDARD";
    await prisma.user.update({ where: { id: user.id }, data: { membershipTier: "STANDARD", trialEndsAt: null } }).catch(() => {});
  }

  await createSession(user.id, user.username, user.role, currentStatus, user.trialEndsAt, user.subscriptionEndsAt, currentTier);
  return { success: true };
}

// --- 4. REQUEST PENDING ACCOUNT ACTION ---
export async function requestAccount(formData: FormData) {
  const username = (formData.get("username") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!username || !email || !password) {
    return { error: "Username, email, and password are required." };
  }

  const allUsers = await prisma.user.findMany();
  const existing = allUsers.find(
    (u) => u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === email
  );

  if (existing) {
    return { error: "An account with that username or email already exists." };
  }

  const hashedPassword = await hash(password, 10);

  const user = await prisma.user.create({
    data: {
      username,
      email,
      password: hashedPassword,
      role: "USER",
      status: "PENDING"
    }
  });

  // Notify administrator via SMTP email
  await sendAdminNewAccountRequestEmail({ id: user.id, username: user.username, email: user.email });

  // Log user into pending session state
  await createSession(user.id, user.username, user.role, user.status, null, null, user.membershipTier);
  return { success: true };
}

// --- 5. LOGOUT ---
export async function logout() {
  const cookieStore = await cookies();
  cookieStore.set("session", "", { path: "/", maxAge: 0 });
  cookieStore.delete("session");
  cookieStore.set("portalarr_impersonator_token", "", { path: "/", maxAge: 0 });
  cookieStore.delete("portalarr_impersonator_token");
  redirect("/login");
}

// --- HELPER: GET ADAPTIVE COOKIE OPTIONS ---
export async function getAuthCookieOptions(customMaxAge?: number) {
  let isSecure = process.env.NODE_ENV === "production";
  try {
    const h = await headers();
    const proto = h.get("x-forwarded-proto");
    const referer = h.get("referer");
    const host = h.get("host") || "";

    // If requested over plain unencrypted HTTP, or accessing local LAN IP directly without https, do NOT set secure flag
    // otherwise Chrome, Edge, Safari, and Firefox silently discard the cookie and prevent view switching!
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

// --- HELPER: CREATE SESSION ---
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

  const token = await new SignJWT({ 
    userId, 
    username, 
    role, 
    status,
    membershipTier: membershipTier || (status === "TRIAL" ? "TRIAL" : "STANDARD"),
    trialEndsAt: trialEndsAt ? new Date(trialEndsAt).toISOString() : null,
    subscriptionEndsAt: subscriptionEndsAt ? new Date(subscriptionEndsAt).toISOString() : null
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getJwtSecret());

  try {
    const cookieOpts = await getAuthCookieOptions(THIRTY_DAYS_SEC);
    (await cookies()).set("session", token, {
      ...cookieOpts,
      expires: expiresAt
    });
  } catch (cookieErr) {
    // In Server Components render context, Next.js does not allow setting cookies on the response.
  }
}

// --- HELPER: GET SESSION ---
export async function getSession() {
  const token = (await cookies()).get("session")?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload;
  } catch (e) {
    return null;
  }
}

// --- 6. PLEX CALLBACK (AUTO-PROVISION & SYNC) ---
export async function handlePlexCallback(authToken: string, rawUsername: string, rawEmail: string, isSetupMode: boolean = false) {
  let plexEmail = (rawEmail || "").trim().toLowerCase();
  let plexUsername = (rawUsername || "").trim();
  let plexUserId = "";

  console.log(`[AUTH] Processing Plex login for: username="${plexUsername}", email="${plexEmail}"`);

  // 1. Fetch authenticated user profile directly from Plex using the fresh authToken
  try {
    const userRes = await fetch("https://plex.tv/api/v2/user", {
      headers: {
        "Accept": "application/json",
        "X-Plex-Token": authToken,
        "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
      }
    });
    if (userRes.ok) {
      const userProfile = await userRes.json();
      const uObj = userProfile.user || userProfile;
      if (uObj.email) plexEmail = uObj.email.trim().toLowerCase();
      if (uObj.username || uObj.title) plexUsername = (uObj.username || uObj.title).trim();
      if (uObj.id) plexUserId = String(uObj.id);
    }
  } catch (err) {
    console.warn("[AUTH] Failed to fetch Plex profile with authToken:", err);
  }

  if (!plexEmail && !plexUsername) {
    return { error: "Plex account profile is missing email and username details." };
  }

  // 2. Discover if logging-in account owns a Plex Media Server
  let ownsPlexServer = false;
  try {
    const resRes = await fetch("https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1", {
      headers: {
        "Accept": "application/json",
        "X-Plex-Token": authToken,
        "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
      }
    });
    if (resRes.ok) {
      const resources = await resRes.json();
      if (Array.isArray(resources)) {
        ownsPlexServer = resources.some((r: any) => 
          r.provides && r.provides.includes("server") && (r.owned === true || r.owned === "1" || r.isOwner === true)
        );
      }
    }
  } catch (rErr) {
    console.warn("[AUTH] Failed to fetch Plex resources for owner check:", rErr);
  }

  // 3. Find existing user in database
  const allUsers = await prisma.user.findMany();
  let user = allUsers.find(
    (u) =>
      (plexEmail && u.email.toLowerCase() === plexEmail) ||
      (plexUsername && u.username.toLowerCase() === plexUsername.toLowerCase()) ||
      (plexEmail && u.plexEmail && u.plexEmail.toLowerCase() === plexEmail) ||
      (plexUsername && u.plexUsername && u.plexUsername.toLowerCase() === plexUsername.toLowerCase())
  );

  const totalDbAdmins = allUsers.filter(u => u.role === "ADMIN").length;
  const isExistingAdmin = user?.role === "ADMIN";
  const isFirstUserSetup = allUsers.length === 0 || totalDbAdmins === 0 || isSetupMode;
  const isAdminOwner = ownsPlexServer || isExistingAdmin || isFirstUserSetup;

  // 4. If Admin/Server Owner logs in, automatically save and refresh Admin Plex Token in settings!
  if (isAdminOwner && authToken) {
    try {
      const encryptedToken = encryptData(authToken);
      await prisma.settings.upsert({
        where: { id: "global" },
        update: { mainPlexToken: encryptedToken },
        create: { id: "global", mainPlexToken: encryptedToken }
      });
      console.log(`[AUTH] Automatically saved/refreshed Admin Plex Token in settings for ${plexUsername || plexEmail}.`);
    } catch (saveErr) {
      console.error("[AUTH] Failed to auto-save Admin Plex Token:", saveErr);
    }
  }

  // Load effective admin token for friend verification
  const settings = await prisma.settings.findFirst({ where: { id: "global" } });
  let adminToken = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
  if (!adminToken && authToken && isAdminOwner) {
    adminToken = authToken;
  }

  // Check if logging-in user is a verified Plex Friend across all endpoints
  let isFriend = false;
  if (!isAdminOwner && adminToken) {
    try {
      const serverFriends = await getPlexServerFriends(adminToken);
      isFriend = serverFriends.some((f) => 
        (plexEmail && f.email && f.email.toLowerCase() === plexEmail) ||
        (plexUsername && f.username && f.username.toLowerCase() === plexUsername.toLowerCase())
      );
    } catch (fErr) {
      console.warn("[AUTH] Error checking Plex friends list:", fErr);
    }
  }

  // 5. If user already exists in DB:
  if (user) {
    console.log(`[AUTH] Existing user matched: ${user.username} (${user.id}) status=${user.status} role=${user.role}`);

    const updateData: any = {};
    if (plexEmail && user.plexEmail !== plexEmail) updateData.plexEmail = plexEmail;
    if (plexUsername && user.plexUsername !== plexUsername) updateData.plexUsername = plexUsername;

    if (isAdminOwner) {
      updateData.role = "ADMIN";
      updateData.status = "APPROVED";
    } else if (isFriend && (user.status === "PENDING" || user.status === "REJECTED")) {
      updateData.status = "APPROVED";
    }

    if (Object.keys(updateData).length > 0) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: updateData
      });
    }

    // Check account status
    if (user.status === "REJECTED" && !isAdminOwner && !isFriend) {
      return { error: "Your account request was declined by the administrator." };
    }
    if (user.status === "PENDING" && !isAdminOwner && !isFriend) {
      return { error: "Your account is currently pending administrator approval." };
    }
    if (user.status === "SUSPENDED" || user.status === "EXPIRED") {
      // Allow them into the portal so proxy/client displays access renewal or suspended state
    }

    if (isAdminOwner) {
      import("./actions").then(({ syncPlexFriendsInternal }) => {
        syncPlexFriendsInternal().catch(e => console.error("[AUTH] Post-login Plex sync error:", e));
      });
    }

    await createSession(user.id, user.username, user.role, user.status, user.trialEndsAt, user.subscriptionEndsAt, user.membershipTier);
    return { success: true };
  }

  // 6. New User: Must be Plex Server Owner or verified Friend to auto-provision
  if (!isAdminOwner && !isFriend) {
    console.warn(`[AUTH] BLOCKED: ${plexUsername || plexEmail} is not on the shared Plex friends list.`);
    return { error: "Access Denied. You are not on the shared Plex friends list. If you are requesting access to ebooks & audiobooks, please create an account on the Register tab." };
  }

  // Generate safe, collision-free username
  let baseUsername = plexUsername || (plexEmail ? plexEmail.split('@')[0] : "plex_user");
  baseUsername = baseUsername.replace(/[^a-zA-Z0-9_\-]/g, "_");
  if (!baseUsername) baseUsername = "plex_user";

  let safeUsername = baseUsername;
  let counter = 1;
  while (allUsers.some((u) => u.username.toLowerCase() === safeUsername.toLowerCase())) {
    safeUsername = `${baseUsername}_${counter}`;
    counter++;
  }

  // Generate safe, collision-free email
  let safeEmail = plexEmail;
  if (!safeEmail || allUsers.some((u) => u.email.toLowerCase() === safeEmail.toLowerCase())) {
    safeEmail = `${safeUsername.toLowerCase()}@plex.local`;
  }

  const randomPassword = Math.random().toString(36).slice(-16) + "Plex!1";
  const hashedPassword = await hash(randomPassword, 10);

  const role = isAdminOwner ? "ADMIN" : "USER";
  const status = "APPROVED";

  user = await prisma.user.create({
    data: {
      username: safeUsername,
      email: safeEmail,
      password: hashedPassword,
      role,
      status,
      plexEmail: plexEmail || null,
      plexUsername: plexUsername || null
    }
  });

  console.log(`[AUTH] Successfully auto-provisioned Plex user: ${user.username} (${user.role})`);

  // Trigger background Plex friends sync if owner logged in
  if (isAdminOwner) {
    import("./actions").then(({ syncPlexFriendsInternal }) => {
      syncPlexFriendsInternal().catch(e => console.error("[AUTH] Post-login Plex sync error:", e));
    });
  }

  await createSession(user.id, user.username, user.role, user.status, user.trialEndsAt, user.subscriptionEndsAt, user.membershipTier);
  return { success: true };
}

// --- HELPER: EMAIL ADMINS ON NEW ACCOUNT REQUEST ---
async function sendAdminNewAccountRequestEmail(user: { id: string; username: string; email: string }) {
  try {
    const settings = await prisma.settings.findFirst({ where: { id: "global" } });
    if (!settings?.smtpHost || !settings?.smtpUser || !settings?.smtpPass) {
      console.log("[AUTH] SMTP not configured. Account request email notification skipped.");
      return;
    }

    if (settings.emailNotificationsEnabled === false || settings.notifyAdminNewUserRequest === false) {
      console.log("[AUTH] Admin new user request email notification is disabled in settings. Skipping.");
      return;
    }

    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" }
    });

    const adminEmails = admins.map(a => a.email).filter(Boolean) as string[];
    const recipientEmails = adminEmails.length > 0 ? adminEmails : [settings.smtpUser as string];
    const appUrl = await getAppUrl();
    const { subject, html } = await renderEmailTemplate("admin_new_user", {
      username: user.username,
      email: user.email,
      status: "PENDING APPROVAL",
      appUrl,
      accessUrl: `${appUrl}/settings/access`
    });

    const { sendOrQueueEmail } = await import("./actions");
    await sendOrQueueEmail({
      to: recipientEmails as string[],
      subject,
      html,
      templateId: "admin_new_user",
      targetUser: user.username,
      userId: user.id
    });
    console.log(`[AUTH] Account request notification email sent or queued for admins for ${user.username}`);
  } catch (err) {
    console.error("[AUTH] Error sending account request email:", err);
  }
}

// --- HELPER: EMAIL USER ON APPROVAL ---
export async function sendUserApprovalEmail(userEmail: string, username: string) {
  try {
    const settings = await prisma.settings.findFirst({ where: { id: "global" } });
    if (!settings?.smtpHost || !settings?.smtpUser || !settings?.smtpPass || !userEmail) {
      return;
    }

    if (settings.emailNotificationsEnabled === false || settings.notifyUserApproval === false) {
      console.log(`[AUTH] User approval email notification is disabled in settings. Skipping email for ${username}.`);
      return;
    }

    const appUrl = await getAppUrl();
    const { subject, html } = await renderEmailTemplate("user_approval", {
      username,
      email: userEmail,
      appUrl,
      loginUrl: `${appUrl}/login`
    });

    const { sendOrQueueEmail } = await import("./actions");
    await sendOrQueueEmail({
      to: userEmail,
      subject,
      html,
      templateId: "user_approval",
      targetUser: username
    });
  } catch (err) {
    console.error("[AUTH] Failed to send approval email to user:", err);
  }
}

// --- HELPER: GET CURRENT FULL USER ---
export async function getCurrentUser() {
  const payload = await getSession();
  if (!payload || !payload.userId) return null;
  
  let user = await prisma.user.findUnique({
    where: { id: payload.userId as string },
    select: { 
      id: true, 
      username: true, 
      email: true, 
      kindleEmail: true, 
      role: true, 
      status: true,
      membershipTier: true,
      subscriptionCadence: true,
      lastRenewalReminderSentAt: true,
      trialEndsAt: true,
      subscriptionEndsAt: true,
      referralCode: true,
      plexEmail: true,
      plexUsername: true
    }
  });

  if (!user) return null;

  // Auto-expire trials that have elapsed
  const now = new Date();
  if (user.status === "TRIAL" && user.trialEndsAt && new Date(user.trialEndsAt) < now) {
    console.log(`[AUTH] Trial expired for ${user.username}. Updating status to EXPIRED and revoking Plex access.`);
    user = await prisma.user.update({
      where: { id: user.id },
      data: { status: "EXPIRED", plexLibrarySectionIds: "" },
      select: {
        id: true,
        username: true,
        email: true,
        kindleEmail: true,
        role: true,
        status: true,
        membershipTier: true,
        subscriptionCadence: true,
        lastRenewalReminderSentAt: true,
        trialEndsAt: true,
        subscriptionEndsAt: true,
        referralCode: true,
        plexEmail: true,
        plexUsername: true
      }
    });

    try {
      const { revokePlexAccessForUserInternal } = await import("./actions");
      await revokePlexAccessForUserInternal(user, "Your trial period has expired.");
    } catch (revokeErr) {
      console.warn("[AUTH-TRIAL-REVOKE-WARNING]:", revokeErr);
    }
  }

  // Auto-expire timed subscriptions that have elapsed
  if (user.status === "APPROVED" && user.subscriptionEndsAt && new Date(user.subscriptionEndsAt) < now) {
    console.log(`[AUTH] Subscription expired for ${user.username}. Updating status to EXPIRED and revoking Plex access.`);
    user = await prisma.user.update({
      where: { id: user.id },
      data: { status: "EXPIRED", plexLibrarySectionIds: "" },
      select: {
        id: true,
        username: true,
        email: true,
        kindleEmail: true,
        role: true,
        status: true,
        membershipTier: true,
        subscriptionCadence: true,
        lastRenewalReminderSentAt: true,
        trialEndsAt: true,
        subscriptionEndsAt: true,
        referralCode: true,
        plexEmail: true,
        plexUsername: true
      }
    });

    try {
      const { revokePlexAccessForUserInternal } = await import("./actions");
      await revokePlexAccessForUserInternal(user, "Your subscription period has expired.");
    } catch (revokeErr) {
      console.warn("[AUTH-SUB-REVOKE-WARNING]:", revokeErr);
    }
  }
  
  // Auto-heal membership tier for approved members or admins whose tier is still marked as TRIAL
  if ((user.status === "APPROVED" || user.role === "ADMIN") && user.membershipTier === "TRIAL") {
    console.log(`[AUTH] Healing membership tier for approved user ${user.username} (TRIAL -> STANDARD)`);
    user = await prisma.user.update({
      where: { id: user.id },
      data: { membershipTier: "STANDARD", trialEndsAt: null },
      select: {
        id: true,
        username: true,
        email: true,
        kindleEmail: true,
        role: true,
        status: true,
        membershipTier: true,
        subscriptionCadence: true,
        lastRenewalReminderSentAt: true,
        trialEndsAt: true,
        subscriptionEndsAt: true,
        referralCode: true,
        plexEmail: true,
        plexUsername: true
      }
    });
  }
  
  // Prevent login loops: If user status, role, or tier in DB changed, re-issue updated session cookie immediately
  if (user.status !== payload.status || user.role !== payload.role || (payload as any).membershipTier !== user.membershipTier) {
    console.log(`[AUTH] User status/role/tier updated for ${user.username} (Status: ${payload.status} -> ${user.status}, Tier: ${(payload as any).membershipTier} -> ${user.membershipTier}). Updating session cookie.`);
    await createSession(user.id, user.username, user.role, user.status, user.trialEndsAt, user.subscriptionEndsAt, user.membershipTier);
  }

  return user;
}

// --- 7. FORGOT PASSWORD ACTION ---
export async function requestForgotPassword(formData: FormData) {
  const input = (formData.get("emailOrUsername") as string)?.trim();
  if (!input) {
    return { error: "Please enter your username or email address." };
  }

  const normalizedInput = input.toLowerCase();
  const allUsers = await prisma.user.findMany();
  const user = allUsers.find(
    (u) => u.username.toLowerCase() === normalizedInput || u.email.toLowerCase() === normalizedInput
  );

  const genericResponse = {
    success: true,
    message: "If an account with that username/email exists, a temporary password has been sent to your email inbox."
  };

  if (!user || !user.email || user.email.endsWith("@plex.local")) {
    return genericResponse;
  }

  const settings = await prisma.settings.findFirst({ where: { id: "global" } });
  if (!settings?.smtpHost || !settings?.smtpUser || !settings?.smtpPass) {
    return { error: "SMTP email is not configured on this server. Please contact your administrator to reset your password." };
  }

  if (settings.emailNotificationsEnabled === false || settings.notifyPasswordReset === false) {
    return { error: "Password reset emails are currently disabled by the administrator. Please contact your admin directly for assistance." };
  }

  const tempPassword = "DomsHomeLab-" + Math.random().toString(36).slice(-6) + "!";
  const hashedPassword = await hash(tempPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword }
  });

  try {
    const appUrl = await getAppUrl();
    const { subject, html } = await renderEmailTemplate("password_reset", {
      username: user.username,
      email: user.email,
      tempPassword,
      appUrl,
      loginUrl: `${appUrl}/login`
    });

    const { sendOrQueueEmail } = await import("./actions");
    await sendOrQueueEmail({
      to: user.email,
      subject,
      html,
      templateId: "password_reset",
      targetUser: user.username,
      userId: user.id
    });
    console.log(`[AUTH] Sent or queued temporary password email to ${user.email} (${user.username})`);
  } catch (err: any) {
    console.error("[AUTH] Error sending temporary password email:", err);
    return { error: "Failed to send email. Please verify SMTP settings with your administrator." };
  }

  return genericResponse;
}

// --- 8. CHANGE PASSWORD ACTION ---
export async function changeUserPassword(formData: FormData) {
  const payload = await getSession();
  if (!payload || !payload.userId) return { error: "Unauthorized" };

  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;

  if (!currentPassword || !newPassword) {
    return { error: "Current password and new password are required." };
  }

  if (newPassword.length < 6) {
    return { error: "New password must be at least 6 characters long." };
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId as string } });
  if (!user) return { error: "User not found." };

  const isValid = await compare(currentPassword, user.password);
  if (!isValid) return { error: "Current password is incorrect." };

  const hashedPassword = await hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword }
  });

  return { success: true, message: "Your password has been successfully updated!" };
}

// ============================================================================
// --- 9. IMPERSONATION (VIEW SITE AS USER) ---
// ============================================================================
const IMPERSONATOR_COOKIE_NAME = "portalarr_impersonator_token";

/**
 * Blazing fast candidate user list for impersonation switcher (under 2ms).
 * Excludes heavy relations, payment logs, and expiration routines.
 */
export async function getImpersonationUserListAction() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session")?.value;
  const impersonatorToken = cookieStore.get(IMPERSONATOR_COOKIE_NAME)?.value;

  let callerIsAdmin = false;
  if (sessionToken) {
    try {
      const { payload } = await jwtVerify(sessionToken, getJwtSecret());
      if (payload.role === "ADMIN" && payload.userId) callerIsAdmin = true;
    } catch {}
  }
  if (!callerIsAdmin && impersonatorToken) {
    try {
      const { payload } = await jwtVerify(impersonatorToken, getJwtSecret());
      if (payload.role === "ADMIN" && payload.userId) {
        const dbAdmin = await prisma.user.findUnique({ where: { id: payload.userId as string } });
        if (dbAdmin && dbAdmin.role === "ADMIN") callerIsAdmin = true;
      }
    } catch {}
  }

  if (!callerIsAdmin) {
    return [];
  }

  return await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      role: true,
      status: true,
      membershipTier: true
    },
    orderBy: { username: "asc" }
  });
}

export async function impersonateUserAction(targetUserId: string) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session")?.value;
  const impersonatorToken = cookieStore.get(IMPERSONATOR_COOKIE_NAME)?.value;

  // 1. Verify caller is an Admin (either current active session or original impersonator token is Admin)
  let callerIsAdmin = false;
  let adminUserId = "";

  if (sessionToken) {
    try {
      const { payload } = await jwtVerify(sessionToken, getJwtSecret());
      if (payload.role === "ADMIN" && payload.userId) {
        callerIsAdmin = true;
        adminUserId = payload.userId as string;
      }
    } catch {
      // ignore
    }
  }

  if (!callerIsAdmin && impersonatorToken) {
    try {
      const { payload } = await jwtVerify(impersonatorToken, getJwtSecret());
      if (payload.role === "ADMIN" && payload.userId) {
        const dbAdmin = await prisma.user.findUnique({ where: { id: payload.userId as string } });
        if (dbAdmin && dbAdmin.role === "ADMIN") {
          callerIsAdmin = true;
          adminUserId = dbAdmin.id;
        }
      }
    } catch {
      // ignore
    }
  }

  if (!callerIsAdmin) {
    return { error: "Unauthorized. Admin privileges required to view site as another user." };
  }

  // 2. Fetch target user
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, username: true, role: true, status: true, membershipTier: true, trialEndsAt: true, subscriptionEndsAt: true }
  });

  if (!targetUser) {
    return { error: "Target user not found." };
  }

  // 3. If target user is an Admin (or the original admin user themselves), restore Admin mode cleanly!
  if (targetUser.role === "ADMIN" || targetUser.id === adminUserId) {
    cookieStore.set(IMPERSONATOR_COOKIE_NAME, "", { path: "/", maxAge: 0 });
    cookieStore.delete(IMPERSONATOR_COOKIE_NAME);
    await createSession(
      targetUser.id, 
      targetUser.username, 
      targetUser.role, 
      targetUser.status, 
      targetUser.trialEndsAt, 
      targetUser.subscriptionEndsAt, 
      targetUser.membershipTier,
      true
    );
    return {
      success: true,
      isRestoredAdmin: true,
      targetUsername: targetUser.username,
      targetRole: targetUser.role
    };
  }

  // 4. Preserve original Admin session token if not already impersonating
  if (!impersonatorToken && sessionToken) {
    const cookieOpts = await getAuthCookieOptions(60 * 60 * 24 * 7); // 7 days
    cookieStore.set(IMPERSONATOR_COOKIE_NAME, sessionToken, cookieOpts);
  }

  // 5. Create fresh session cookie for the target user (skip lastLogin DB write for preview)
  await createSession(
    targetUser.id, 
    targetUser.username, 
    targetUser.role, 
    targetUser.status, 
    targetUser.trialEndsAt, 
    targetUser.subscriptionEndsAt, 
    targetUser.membershipTier,
    true
  );

  return {
    success: true,
    isRestoredAdmin: false,
    targetUsername: targetUser.username,
    targetRole: targetUser.role
  };
}

export async function stopImpersonationAction() {
  const cookieStore = await cookies();
  const impersonatorToken = cookieStore.get(IMPERSONATOR_COOKIE_NAME)?.value;

  if (!impersonatorToken) {
    return { error: "No active impersonation session found." };
  }

  try {
    const { payload } = await jwtVerify(impersonatorToken, getJwtSecret());
    if (!payload.userId) {
      cookieStore.set(IMPERSONATOR_COOKIE_NAME, "", { path: "/", maxAge: 0 });
      cookieStore.delete(IMPERSONATOR_COOKIE_NAME);
      return { error: "Invalid impersonator session token." };
    }

    const adminUser = await prisma.user.findUnique({
      where: { id: payload.userId as string },
      select: { id: true, username: true, role: true, status: true, membershipTier: true, trialEndsAt: true, subscriptionEndsAt: true }
    });

    if (!adminUser || adminUser.role !== "ADMIN") {
      cookieStore.set(IMPERSONATOR_COOKIE_NAME, "", { path: "/", maxAge: 0 });
      cookieStore.delete(IMPERSONATOR_COOKIE_NAME);
      return { error: "Original admin user not found or no longer has admin privileges." };
    }

    // Restore original Admin session (skip lastLogin write)
    await createSession(
      adminUser.id, 
      adminUser.username, 
      adminUser.role, 
      adminUser.status, 
      adminUser.trialEndsAt, 
      adminUser.subscriptionEndsAt, 
      adminUser.membershipTier,
      true
    );
    cookieStore.set(IMPERSONATOR_COOKIE_NAME, "", { path: "/", maxAge: 0 });
    cookieStore.delete(IMPERSONATOR_COOKIE_NAME);

    return { success: true, adminUsername: adminUser.username };
  } catch (err: any) {
    console.error("[AUTH] Failed to stop impersonation:", err);
    cookieStore.set(IMPERSONATOR_COOKIE_NAME, "", { path: "/", maxAge: 0 });
    cookieStore.delete(IMPERSONATOR_COOKIE_NAME);
    return { error: "Failed to restore admin session." };
  }
}

export async function getImpersonationStatusAction() {
  const cookieStore = await cookies();
  const impersonatorToken = cookieStore.get(IMPERSONATOR_COOKIE_NAME)?.value;
  const sessionToken = cookieStore.get("session")?.value;

  if (!impersonatorToken || !sessionToken) {
    return { isImpersonating: false };
  }

  try {
    const { payload: adminPayload } = await jwtVerify(impersonatorToken, getJwtSecret());
    const { payload: currentPayload } = await jwtVerify(sessionToken, getJwtSecret());

    if (!adminPayload.userId || adminPayload.role !== "ADMIN") {
      return { isImpersonating: false };
    }

    // If current session is already the admin, clean up stale impersonator token
    if (currentPayload.userId === adminPayload.userId && currentPayload.role === "ADMIN") {
      cookieStore.set(IMPERSONATOR_COOKIE_NAME, "", { path: "/", maxAge: 0 });
      cookieStore.delete(IMPERSONATOR_COOKIE_NAME);
      return { isImpersonating: false };
    }

    return {
      isImpersonating: true,
      adminUserId: adminPayload.userId as string,
      adminUsername: (adminPayload.username as string) || "Admin",
      currentUserId: currentPayload.userId as string,
      currentUsername: (currentPayload.username as string) || "User",
      currentRole: (currentPayload.role as string) || "USER"
    };
  } catch {
    return { isImpersonating: false };
  }
}