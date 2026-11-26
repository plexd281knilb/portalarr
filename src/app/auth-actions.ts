"use server";

import { compare, hash } from "bcryptjs";
import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { redirect } from "next/navigation";
import { decryptData, encryptData } from "@/lib/encryption";
import { getPlexServerFriends, getPlexOwnerUser } from "@/lib/plex";
import prisma from "@/lib/prisma";

import { getJwtSecret } from "@/lib/auth-secret";
import { createSession, getAdaptiveCookieOptions } from "@/lib/session-cookie";
import { getAppUrl } from "@/lib/app-url";
import { renderEmailTemplate } from "@/lib/email-templates";
import { sendOrQueueEmail } from "@/lib/email-dispatcher";
import { runAsServerInternal } from "@/lib/internal-context";
import {
  canonicalizeIdentifier,
  checkRateLimit,
  secureRandomPassword,
  stripDangerousUnicode,
  validateUsernameInput,
} from "@/lib/security";

// --- 1. SETUP CHECK ---
export async function checkSystemInitialized() {
  const count = await prisma.user.count();
  return count > 0;
}

// --- 2. SETUP FIRST ADMIN ---
export async function setupFirstAdmin(formData: FormData) {
  const userCheck = validateUsernameInput(formData.get("username"));
  const password = formData.get("password") as string;
  const email = stripDangerousUnicode(formData.get("email")).toLowerCase();

  if (!userCheck.valid) {
    return { error: userCheck.error || "Invalid username" };
  }
  const username = userCheck.display;

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
  const input = stripDangerousUnicode(formData.get("username"));
  const password = formData.get("password") as string;

  if (!input || !password) {
    return { error: "Username/Email and password required" };
  }

  if (process.env.PORTALARR_TEST !== "true" && !checkRateLimit("login", input, 20, 60_000)) {
    return { error: "Too many login attempts. Please wait a minute and try again." };
  }

  const normalizedInput = input.toLowerCase();
  const canonicalInput = canonicalizeIdentifier(input);

  // Support login by Username, Email, Plex Username, or Plex Email (case-insensitive & trimmed)
  const allUsers = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      password: true,
      role: true,
      status: true,
      membershipTier: true,
      trialEndsAt: true,
      subscriptionEndsAt: true,
      plexUsername: true,
      plexEmail: true
    }
  });
  const user = allUsers.find((u) => {
    const dbUsername = u.username?.trim().toLowerCase();
    const dbUsernameCanon = canonicalizeIdentifier(u.username);
    const dbEmail = u.email?.trim().toLowerCase();
    const dbPlexUser = u.plexUsername?.trim().toLowerCase();
    const dbPlexUserCanon = canonicalizeIdentifier(u.plexUsername);
    const dbPlexEmail = u.plexEmail?.trim().toLowerCase();

    return (
      dbUsername === normalizedInput ||
      (canonicalInput && dbUsernameCanon === canonicalInput) ||
      dbEmail === normalizedInput ||
      (dbPlexUser && (dbPlexUser === normalizedInput || (canonicalInput && dbPlexUserCanon === canonicalInput))) ||
      (dbPlexEmail && dbPlexEmail === normalizedInput)
    );
  });

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

  // Check if trial or subscription elapsed before creating session (never auto-expire ADMIN or when autoSuspendExpiredAccounts is disabled)
  const now = new Date();
  let currentStatus = user.status;
  if (user.role !== "ADMIN" && (currentStatus === "TRIAL" || currentStatus === "APPROVED")) {
    const settings = await prisma.settings.findUnique({
      where: { id: "global" },
      select: { autoSuspendExpiredAccounts: true, subscriptionGracePeriodDays: true }
    }).catch(() => null);
    if (settings?.autoSuspendExpiredAccounts === true) {
      const graceMs = Math.max(0, Number(settings?.subscriptionGracePeriodDays || 0)) * 24 * 60 * 60 * 1000;
      const cutoff = now.getTime() - graceMs;
      if (currentStatus === "TRIAL" && user.trialEndsAt && new Date(user.trialEndsAt).getTime() <= cutoff) {
        currentStatus = "EXPIRED";
        await prisma.user.update({ where: { id: user.id }, data: { status: "EXPIRED", plexLibrarySectionIds: "", selectedPlexLibrarySectionIds: "" } }).catch(() => {});
      } else if (currentStatus === "APPROVED" && user.subscriptionEndsAt && new Date(user.subscriptionEndsAt).getTime() <= cutoff) {
        currentStatus = "EXPIRED";
        await prisma.user.update({ where: { id: user.id }, data: { status: "EXPIRED", plexLibrarySectionIds: "", selectedPlexLibrarySectionIds: "" } }).catch(() => {});
      }
    }
  }

  // Auto-heal membership tier for approved members or admins whose tier is still marked as TRIAL
  let currentTier = user.membershipTier;
  if ((currentStatus === "APPROVED" || user.role === "ADMIN") && currentTier === "TRIAL") {
    currentTier = "STANDARD";
    await prisma.user.update({ where: { id: user.id }, data: { membershipTier: "STANDARD", trialEndsAt: null } }).catch(() => {});
  }

  await createSession(user.id, user.username, user.role, currentStatus, user.trialEndsAt, user.subscriptionEndsAt, currentTier);

  // Asynchronously trigger personalized user prewarming for instant subsequent navigation
  try {
    const { prewarmUserSession } = await import("@/lib/prewarm");
    prewarmUserSession({
      id: user.id,
      username: user.username,
      role: user.role,
      email: user.email,
      status: currentStatus
    }).catch(() => {});
  } catch (e) {}

  return { success: true };
}

// --- 4. REQUEST PENDING ACCOUNT ACTION ---
export async function requestAccount(formData: FormData) {
  const userCheck = validateUsernameInput(formData.get("username"));
  const email = stripDangerousUnicode(formData.get("email")).toLowerCase();
  const password = formData.get("password") as string;

  if (!userCheck.valid) {
    return { error: userCheck.error || "Invalid username." };
  }
  const username = userCheck.display;

  if (!username || !email || !password) {
    return { error: "Username, email, and password are required." };
  }

  if (process.env.PORTALARR_TEST !== "true" && !checkRateLimit("register", email, 10, 60_000)) {
    return { error: "Too many registration attempts. Please try again later." };
  }

  const allUsers = await prisma.user.findMany({
    select: { id: true, username: true, email: true }
  });
  const existing = allUsers.find(
    (u) =>
      canonicalizeIdentifier(u.username) === userCheck.canonical ||
      u.email.trim().toLowerCase() === email
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
  return getAdaptiveCookieOptions(customMaxAge);
}

// --- HELPER: GET SESSION ---
export async function getSession() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("session")?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"] });
    return payload;
  } catch (e) {
    return null;
  }
}

// --- 6. PLEX CALLBACK (AUTO-PROVISION & SYNC) ---
export async function handlePlexCallback(authToken: string, rawUsername: string, rawEmail: string, isSetupMode: boolean = false) {
  const isMockTestToken =
    process.env.PORTALARR_TEST === "true" &&
    process.env.NODE_ENV === "test" &&
    typeof authToken === "string" &&
    authToken.startsWith("mock_");

  let plexEmail = isMockTestToken ? stripDangerousUnicode(rawEmail).toLowerCase() : "";
  let plexUsername = isMockTestToken ? stripDangerousUnicode(rawUsername) : "";
  let plexUserId = "";
  let plexProfileVerified = isMockTestToken;

  if (!authToken || typeof authToken !== "string") {
    return { error: "Missing Plex authentication token." };
  }

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
      if (uObj.email) plexEmail = stripDangerousUnicode(uObj.email).toLowerCase();
      if (uObj.username || uObj.title) plexUsername = stripDangerousUnicode(uObj.username || uObj.title);
      if (uObj.id) plexUserId = String(uObj.id);
      plexProfileVerified = Boolean(plexEmail || plexUsername);
    }
  } catch (err) {
    console.warn("[AUTH] Failed to fetch Plex profile with authToken:", err);
  }

  if (!plexProfileVerified || (!plexEmail && !plexUsername)) {
    return { error: "Unable to verify Plex authentication token with Plex.tv." };
  }

  console.log(`[AUTH] Processing Plex login for: username="${plexUsername}", email="${plexEmail}"`);

  // 2. Discover user in database and determine admin status
  const allUsers = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      status: true,
      membershipTier: true,
      trialEndsAt: true,
      subscriptionEndsAt: true,
      plexUsername: true,
      plexEmail: true
    }
  });
  const canonicalPlexUser = canonicalizeIdentifier(plexUsername);
  let user = allUsers.find(
    (u) =>
      (plexEmail && u.email.trim().toLowerCase() === plexEmail) ||
      (plexEmail && u.plexEmail && u.plexEmail.trim().toLowerCase() === plexEmail) ||
      (plexUsername && u.plexUsername && canonicalizeIdentifier(u.plexUsername) === canonicalPlexUser) ||
      (plexUsername &&
        canonicalizeIdentifier(u.username) === canonicalPlexUser &&
        (!plexEmail || u.email.endsWith("@plex.local") || u.email.trim().toLowerCase() === plexEmail))
  );

  const totalDbAdmins = allUsers.filter(u => u.role === "ADMIN").length;
  const isExistingAdmin = user?.role === "ADMIN";
  const isFirstUserSetup = (allUsers.length === 0 || totalDbAdmins === 0);

  // 3. Load effective admin token for friend verification and admin refresh
  const settings = await prisma.settings.findFirst({ where: { id: "global" } });
  let adminToken = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
  if (!adminToken) {
    try {
      const { resolveActivePlexAdminToken } = await import("@/lib/iptv/plex-jellyfin-livetv");
      adminToken = await resolveActivePlexAdminToken();
    } catch {}
  }

  // 4. Save/refresh Admin Plex Token ONLY for verified administrators who own the homelab or match the active token
  if ((isFirstUserSetup || isExistingAdmin) && authToken) {
    let canUpdateAdminToken = false;

    if (isFirstUserSetup) {
      canUpdateAdminToken = true;
    } else if (isExistingAdmin) {
      if (!adminToken) {
        canUpdateAdminToken = true;
      } else {
        // Check if logging-in admin matches the existing token owner
        try {
          const ownerUser = await getPlexOwnerUser(adminToken);
          if (ownerUser && (
            (plexEmail && ownerUser.email && ownerUser.email.toLowerCase() === plexEmail) ||
            (plexUsername && ownerUser.username && ownerUser.username.toLowerCase() === plexUsername.toLowerCase())
          )) {
            canUpdateAdminToken = true;
          }
        } catch {}

        // Fallback: Check if logging-in admin owns any of the homelab's configured Plex servers
        if (!canUpdateAdminToken) {
          try {
            const dbServers = await prisma.plexServer.findMany({ select: { clientIdentifier: true } });
            const configuredClientIds = new Set(dbServers.map(s => s.clientIdentifier).filter(Boolean));
            if (configuredClientIds.size > 0) {
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
                  const ownsHomelabServer = resources.some((r: any) =>
                    r.provides && r.provides.includes("server") &&
                    (r.owned === true || r.owned === "1" || r.isOwner === true) &&
                    r.clientIdentifier && configuredClientIds.has(r.clientIdentifier)
                  );
                  if (ownsHomelabServer) {
                    canUpdateAdminToken = true;
                  }
                }
              }
            }
          } catch (rErr) {
            console.warn("[AUTH] Failed to verify homelab server ownership for admin token refresh:", rErr);
          }
        }
      }
    }

    if (canUpdateAdminToken) {
      try {
        const encryptedToken = encryptData(authToken);
        await prisma.settings.upsert({
          where: { id: "global" },
          update: { mainPlexToken: encryptedToken },
          create: { id: "global", mainPlexToken: encryptedToken }
        });
        adminToken = authToken;
        console.log(`[AUTH] Automatically saved/refreshed Admin Plex Token in settings for admin ${plexUsername || plexEmail}.`);
      } catch (saveErr) {
        console.error("[AUTH] Failed to auto-save Admin Plex Token:", saveErr);
      }
    }
  }

  // 5. Check if logging-in user is a verified Plex Friend across all endpoints
  let isFriend = false;
  if (!isExistingAdmin && !isFirstUserSetup && adminToken) {
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

  // 6. If user already exists in DB:
  if (user) {
    console.log(`[AUTH] Existing user matched: ${user.username} (${user.id}) status=${user.status} role=${user.role}`);

    const updateData: any = {};
    if (plexEmail && user.plexEmail !== plexEmail) updateData.plexEmail = plexEmail;
    if (plexUsername && user.plexUsername !== plexUsername) updateData.plexUsername = plexUsername;

    // Auto-approve pending or rejected users if they are on the Plex friends list
    if (isFriend && (user.status === "PENDING" || user.status === "REJECTED")) {
      updateData.status = "APPROVED";
    }

    // CRITICAL SECURITY ENFORCEMENT:
    // NEVER alter user.role during Plex login for existing users!
    // A regular user, trial user, or super user must NEVER be promoted to ADMIN on login.
    // Roles can ONLY be modified by an administrator in the Access Settings panel.

    if (Object.keys(updateData).length > 0) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: updateData
      });
    }

    // Check account status
    if (user.status === "REJECTED" && !isExistingAdmin && !isFriend) {
      return { error: "Your account request was declined by the administrator." };
    }
    if (user.status === "PENDING" && !isExistingAdmin && !isFriend) {
      return { error: "Your account is currently pending administrator approval." };
    }
    if (user.status === "SUSPENDED" || user.status === "EXPIRED") {
      // Allow them into the portal so proxy/client displays access renewal or suspended state
    }

    if (isExistingAdmin) {
      import("./actions").then(({ syncPlexFriendsInternal }) => {
        runAsServerInternal(() => syncPlexFriendsInternal()).catch(e => console.error("[AUTH] Post-login Plex sync error:", e));
      });
    }

    await createSession(user.id, user.username, user.role, user.status, user.trialEndsAt, user.subscriptionEndsAt, user.membershipTier);
    return { success: true };
  }

  // 7. New User: Must be verified Friend to auto-provision (unless first system setup)
  if (!isFirstUserSetup && !isFriend) {
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

  const randomPassword = secureRandomPassword();
  const hashedPassword = await hash(randomPassword, 10);

  // New users are ALWAYS "USER" unless it's the very first system setup
  const role = isFirstUserSetup ? "ADMIN" : "USER";
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

  // Trigger background Plex friends sync if first setup admin logged in
  if (isFirstUserSetup) {
    import("./actions").then(({ syncPlexFriendsInternal }) => {
      runAsServerInternal(() => syncPlexFriendsInternal()).catch(e => console.error("[AUTH] Post-login Plex sync error:", e));
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

    const { resolveAdminNotificationEmails } = await import("@/lib/email-templates");
    const recipientEmails = await resolveAdminNotificationEmails(settings);
    if (recipientEmails.length === 0) {
      console.log("[AUTH] No admin recipient emails configured. Skipping account request email.");
      return;
    }
    const appUrl = await getAppUrl();
    const { subject, html } = await renderEmailTemplate("admin_new_user", {
      username: user.username,
      email: user.email,
      status: "PENDING APPROVAL",
      appUrl,
      accessUrl: `${appUrl}/settings/access`
    });

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
      lastLogin: true,
      membershipTier: true,
      subscriptionCadence: true,
      lastRenewalReminderSentAt: true,
      trialEndsAt: true,
      subscriptionEndsAt: true,
      referralCode: true,
      plexEmail: true,
      plexUsername: true,
      accountCredit: true,
      lastPaymentAmount: true,
      lastPaymentDate: true,
      lastPaymentProvider: true,
      discordId: true,
      discordUsername: true,
      discordDiscriminator: true,
      discordAvatar: true,
      discordLinkedAt: true
    }
  });

  if (!user) return null;

  // Auto-expire trials/subscriptions that have elapsed beyond grace period (strictly excluding ADMIN & honoring autoSuspendExpiredAccounts)
  const now = new Date();
  if (user.role !== "ADMIN" && (user.status === "TRIAL" || user.status === "APPROVED")) {
    const expirySettings = await prisma.settings.findUnique({
      where: { id: "global" },
      select: { autoSuspendExpiredAccounts: true, subscriptionGracePeriodDays: true }
    }).catch(() => null);
    if (expirySettings?.autoSuspendExpiredAccounts === true) {
      const graceMs = Math.max(0, Number(expirySettings?.subscriptionGracePeriodDays || 0)) * 24 * 60 * 60 * 1000;
      const cutoff = now.getTime() - graceMs;

      if (user.status === "TRIAL" && user.trialEndsAt && new Date(user.trialEndsAt).getTime() <= cutoff) {
        console.log(`[AUTH] Trial expired for ${user.username}. Updating status to EXPIRED and revoking Plex access.`);
        user = await prisma.user.update({
          where: { id: user.id },
          data: { status: "EXPIRED", plexLibrarySectionIds: "", selectedPlexLibrarySectionIds: "" },
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
            plexUsername: true,
            accountCredit: true,
            lastPaymentAmount: true,
            lastPaymentDate: true,
            lastPaymentProvider: true,
          discordId: true,
          discordUsername: true,
          discordDiscriminator: true,
          discordAvatar: true,
          discordLinkedAt: true,
            lastLogin: true
          }
        });

        try {
          const { revokePlexAccessForUserInternal } = await import("./actions");
          if (user) await runAsServerInternal(() => revokePlexAccessForUserInternal(user!, "Your trial period has expired."));
        } catch (revokeErr) {
          console.warn("[AUTH-TRIAL-REVOKE-WARNING]:", revokeErr);
        }
        if (!user) return null;
      }

      if (user.status === "APPROVED" && user.subscriptionEndsAt && new Date(user.subscriptionEndsAt).getTime() <= cutoff) {
        console.log(`[AUTH] Subscription expired for ${user.username}. Updating status to EXPIRED and revoking Plex access.`);
        user = await prisma.user.update({
          where: { id: user.id },
          data: { status: "EXPIRED", plexLibrarySectionIds: "", selectedPlexLibrarySectionIds: "" },
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
            plexUsername: true,
            accountCredit: true,
            lastPaymentAmount: true,
            lastPaymentDate: true,
            lastPaymentProvider: true,
          discordId: true,
          discordUsername: true,
          discordDiscriminator: true,
          discordAvatar: true,
          discordLinkedAt: true,
            lastLogin: true
          }
        });

        try {
          const { revokePlexAccessForUserInternal } = await import("./actions");
          if (user) await runAsServerInternal(() => revokePlexAccessForUserInternal(user!, "Your subscription period has expired."));
        } catch (revokeErr) {
          console.warn("[AUTH-SUB-REVOKE-WARNING]:", revokeErr);
        }
      }
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
        plexUsername: true,
        accountCredit: true,
        lastPaymentAmount: true,
        lastPaymentDate: true,
        lastPaymentProvider: true,
      discordId: true,
      discordUsername: true,
      discordDiscriminator: true,
      discordAvatar: true,
      discordLinkedAt: true,
        lastLogin: true
      }
    });
  }
  
  // Auto-heal Admin records: Admins have permanent lifetime access and never expire
  if (user.role === "ADMIN" && (user.subscriptionEndsAt || user.subscriptionCadence || user.membershipTier !== "ADMIN" || user.trialEndsAt)) {
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionEndsAt: null,
          subscriptionCadence: null,
          membershipTier: "ADMIN",
          trialEndsAt: null,
          status: "APPROVED"
        }
      });
      user.subscriptionEndsAt = null;
      user.subscriptionCadence = null;
      user.membershipTier = "ADMIN";
      user.trialEndsAt = null;
      user.status = "APPROVED";
    } catch (e) {}
  }
  
  // Prevent login loops: If user status, role, or tier in DB changed, re-issue updated session cookie immediately
  if (
    user.status !== payload.status || 
    user.role !== payload.role || 
    (payload as any).membershipTier !== user.membershipTier ||
    (user.role === "ADMIN" && (Boolean(payload.subscriptionEndsAt) || Boolean((payload as any).trialEndsAt)))
  ) {
    console.log(`[AUTH] User status/role/tier updated for ${user.username} (Status: ${payload.status} -> ${user.status}, Tier: ${(payload as any).membershipTier} -> ${user.membershipTier}). Updating session cookie.`);
    await createSession(user.id, user.username, user.role, user.status, user.trialEndsAt, user.subscriptionEndsAt, user.membershipTier);
  }

  // Update lastLogin to record site visit activity (debounced to 5 minutes, skipping admin impersonation)
  try {
    const cookieStore = await cookies().catch(() => null);
    const isImpersonating = !!cookieStore?.get("portalarr_impersonator_token")?.value;
    if (!isImpersonating) {
      const lastActive = (user as any).lastLogin ? new Date((user as any).lastLogin).getTime() : 0;
      const FIVE_MINUTES_MS = 5 * 60 * 1000;
      if (!lastActive || now.getTime() - lastActive > FIVE_MINUTES_MS) {
        prisma.user.update({
          where: { id: user.id },
          data: { lastLogin: now }
        }).catch((err) => {
          console.warn("[AUTH] Failed to touch lastLogin on site visit:", err);
        });
        (user as any).lastLogin = now;
      }
    }
  } catch (touchErr) {}

  return user;
}

// --- 7. FORGOT PASSWORD ACTION ---
export async function requestForgotPassword(formData: FormData) {
  const input = stripDangerousUnicode(formData.get("emailOrUsername"));
  if (!input) {
    return { error: "Please enter your username or email address." };
  }

  if (process.env.PORTALARR_TEST !== "true" && !checkRateLimit("forgot", input, 5, 60_000)) {
    return {
      success: true,
      message: "If an account with that username/email exists, a temporary password has been sent to your email inbox."
    };
  }

  const normalizedInput = input.toLowerCase();
  const canonicalInput = canonicalizeIdentifier(input);
  const allUsers = await prisma.user.findMany({
    select: { id: true, username: true, email: true, plexUsername: true, plexEmail: true }
  });
  const user = allUsers.find((u) => {
    const dbUsername = u.username?.trim().toLowerCase();
    const dbUsernameCanon = canonicalizeIdentifier(u.username);
    const dbEmail = u.email?.trim().toLowerCase();
    const dbPlexUser = u.plexUsername?.trim().toLowerCase();
    const dbPlexUserCanon = canonicalizeIdentifier(u.plexUsername);
    const dbPlexEmail = u.plexEmail?.trim().toLowerCase();

    return (
      dbUsername === normalizedInput ||
      (canonicalInput && dbUsernameCanon === canonicalInput) ||
      dbEmail === normalizedInput ||
      (dbPlexUser && (dbPlexUser === normalizedInput || (canonicalInput && dbPlexUserCanon === canonicalInput))) ||
      (dbPlexEmail && dbPlexEmail === normalizedInput)
    );
  });

  const genericResponse = {
    success: true,
    message: "If an account with that username/email exists, a temporary password has been sent to your email inbox."
  };

  if (!user) {
    return genericResponse;
  }

  // Resolve target email: prioritize real user email, or fall back to verified Plex email if email is a local placeholder
  let targetEmail = user.email?.trim();
  if ((!targetEmail || targetEmail.endsWith("@plex.local")) && user.plexEmail && !user.plexEmail.endsWith("@plex.local")) {
    targetEmail = user.plexEmail.trim();
  }

  if (!targetEmail || targetEmail.endsWith("@plex.local")) {
    return genericResponse;
  }

  const settings = await prisma.settings.findFirst({ where: { id: "global" } });
  if (!settings?.smtpHost || !settings?.smtpUser || !settings?.smtpPass) {
    return { error: "SMTP email is not configured on this server. Please contact your administrator to reset your password." };
  }

  if (settings.emailNotificationsEnabled === false || settings.notifyPasswordReset === false) {
    return { error: "Password reset emails are currently disabled by the administrator. Please contact your admin directly for assistance." };
  }

  const tempPassword = secureRandomPassword();
  const hashedPassword = await hash(tempPassword, 10);

  // Update password and heal placeholder email with real Plex email if applicable
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      ...(user.email.endsWith("@plex.local") ? { email: targetEmail } : {})
    }
  });

  try {
    const appUrl = await getAppUrl();
    const { subject, html } = await renderEmailTemplate("password_reset", {
      username: user.username,
      email: targetEmail,
      tempPassword,
      appUrl,
      loginUrl: `${appUrl}/login`
    });

    await sendOrQueueEmail({
      to: targetEmail,
      subject,
      html,
      templateId: "password_reset",
      targetUser: user.username,
      userId: user.id
    });
    console.log(`[AUTH] Sent or queued temporary password email to ${targetEmail} (${user.username})`);
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
  let cookieStore: any;
  try {
    cookieStore = await cookies();
  } catch {
    return [];
  }
  const sessionToken = cookieStore.get("session")?.value;
  const impersonatorToken = cookieStore.get(IMPERSONATOR_COOKIE_NAME)?.value;

  let callerIsAdmin = false;
  if (sessionToken) {
    try {
    const { payload } = await jwtVerify(sessionToken, getJwtSecret(), { algorithms: ["HS256"] });
    if (payload.role === "ADMIN" && payload.userId) callerIsAdmin = true;
  } catch {}
}
if (!callerIsAdmin && impersonatorToken) {
  try {
    const { payload } = await jwtVerify(impersonatorToken, getJwtSecret(), { algorithms: ["HS256"] });
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
  let cookieStore: any;
  try {
    cookieStore = await cookies();
  } catch {
    return { error: "Unauthorized. Admin privileges required to view site as another user." };
  }
  const sessionToken = cookieStore.get("session")?.value;
  const impersonatorToken = cookieStore.get(IMPERSONATOR_COOKIE_NAME)?.value;

  // 1. Verify caller is an Admin (either current active session or original impersonator token is Admin)
  let callerIsAdmin = false;
  let adminUserId = "";

  if (sessionToken) {
    try {
      const { payload } = await jwtVerify(sessionToken, getJwtSecret(), { algorithms: ["HS256"] });
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

  if (!callerIsAdmin && impersonatorToken) {
    try {
      const { payload } = await jwtVerify(impersonatorToken, getJwtSecret(), { algorithms: ["HS256"] });
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
  let cookieStore: any;
  try {
    cookieStore = await cookies();
  } catch {
    return { error: "No active impersonation session found." };
  }
  const impersonatorToken = cookieStore.get(IMPERSONATOR_COOKIE_NAME)?.value;

  if (!impersonatorToken) {
    return { error: "No active impersonation session found." };
  }

  try {
    const { payload } = await jwtVerify(impersonatorToken, getJwtSecret(), { algorithms: ["HS256"] });
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
  let cookieStore: any;
  try {
    cookieStore = await cookies();
  } catch {
    return { isImpersonating: false };
  }
  const impersonatorToken = cookieStore.get(IMPERSONATOR_COOKIE_NAME)?.value;
  const sessionToken = cookieStore.get("session")?.value;

  if (!impersonatorToken || !sessionToken) {
    return { isImpersonating: false };
  }

  try {
    const { payload: adminPayload } = await jwtVerify(impersonatorToken, getJwtSecret(), { algorithms: ["HS256"] });
    const { payload: currentPayload } = await jwtVerify(sessionToken, getJwtSecret(), { algorithms: ["HS256"] });

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