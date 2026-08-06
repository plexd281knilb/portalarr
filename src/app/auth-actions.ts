"use server";

import { compare, hash } from "bcryptjs";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { redirect } from "next/navigation";
import nodemailer from "nodemailer";
import { decryptData, encryptData } from "@/lib/encryption";
import prisma from "@/lib/prisma";

const JWT_SECRET_RAW = process.env.JWT_SECRET || "";
if (!JWT_SECRET_RAW && process.env.NODE_ENV === "production") {
    console.warn("⚠️ WARNING: JWT_SECRET environment variable is missing. Authentication will fail.");
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW || "build-time-fallback-key");

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

    await createSession(user.id, user.username, user.role, user.status);
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

  await createSession(user.id, user.username, user.role, user.status);
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
  await createSession(user.id, user.username, user.role, user.status);
  return { success: true };
}

// --- 5. LOGOUT ---
export async function logout() {
  (await cookies()).delete("session");
  redirect("/login");
}

// --- HELPER: CREATE SESSION ---
export async function createSession(userId: string, username: string, role: string, status: string = "APPROVED") {
  const THIRTY_DAYS_SEC = 60 * 60 * 24 * 30; // 30 Days persistent login
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_SEC * 1000);

  const token = await new SignJWT({ userId, username, role, status })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(JWT_SECRET);

  (await cookies()).set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: THIRTY_DAYS_SEC, 
    path: "/",
    sameSite: "lax",
    expires: expiresAt
  });
}

// --- HELPER: GET SESSION ---
export async function getSession() {
  const token = (await cookies()).get("session")?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch (e) {
    return null;
  }
}

// --- 6. PLEX CALLBACK (AUTO-PROVISION & SYNC) ---
export async function handlePlexCallback(authToken: string, rawUsername: string, rawEmail: string, isSetupMode: boolean = false) {
  rawEmail = (rawEmail || "").trim().toLowerCase();
  rawUsername = (rawUsername || (rawEmail ? rawEmail.split('@')[0] : "")).trim();

  console.log(`[AUTH] Processing Plex login for: username="${rawUsername}", email="${rawEmail}"`);

  if (!rawEmail && !rawUsername) {
    return { error: "Plex account profile is missing email and username details." };
  }

  // Check if user already exists in Portalarr
  const allUsers = await prisma.user.findMany();
  let user = allUsers.find(
    (u) =>
      (rawEmail && u.email.toLowerCase() === rawEmail) ||
      (rawUsername && u.username.toLowerCase() === rawUsername.toLowerCase())
  );

  // If user already exists in DB, log them in directly
  if (user) {
    console.log(`[AUTH] Existing user matched: ${user.username} (${user.id}) status=${user.status}`);
    if (user.status === "REJECTED") {
      return { error: "Your account request was declined by the administrator." };
    }
    await createSession(user.id, user.username, user.role, user.status);
    return { success: true };
  }

  // New User Auto-Provisioning: Verify access to the Plex Server
  console.log(`[AUTH] User not in DB. Verifying Plex Server access for: ${rawUsername || rawEmail}`);
  
  const settings = await prisma.settings.findFirst({ where: { id: "global" } });
  let adminToken = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
  if (!adminToken && authToken) {
    adminToken = authToken;
  }

  if (!adminToken) {
      return { error: "The Server Admin must configure their Plex Token in Settings before new users can sign in with Plex." };
  }

  // Check if logging-in user IS the Plex Server Owner
  let isAdminOwner = false;
  try {
    const adminRes = await fetch("https://plex.tv/api/v2/user", {
      headers: {
        "Accept": "application/json",
        "X-Plex-Token": adminToken,
        "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
      }
    });
    if (adminRes.ok) {
      const adminProfile = await adminRes.json();
      const adminEmail = (adminProfile.email || "").toLowerCase().trim();
      const adminUsername = (adminProfile.username || adminProfile.title || "").toLowerCase().trim();
      const adminId = adminProfile.id ? String(adminProfile.id) : null;

      if (
        (adminEmail && rawEmail && adminEmail === rawEmail) ||
        (adminUsername && rawUsername && adminUsername === rawUsername.toLowerCase())
      ) {
        isAdminOwner = true;
        console.log(`[AUTH] User identified as Plex Server Owner.`);
      }
    }
  } catch (err) {
    console.warn("[AUTH] Failed to fetch admin Plex profile for owner verification:", err);
  }

  // If owner logged in and Plex token is not saved yet, save token automatically
  if (isAdminOwner && authToken && (!settings?.mainPlexToken)) {
    try {
      const encryptedToken = encryptData(authToken);
      await prisma.settings.upsert({
        where: { id: "global" },
        update: { mainPlexToken: encryptedToken },
        create: { id: "global", mainPlexToken: encryptedToken }
      });
      console.log("[AUTH] Automatically saved Admin Plex Token to global settings.");
    } catch (saveErr) {
      console.error("[AUTH] Failed to auto-save Admin Plex Token:", saveErr);
    }
  }

  // If not owner, check Plex Friends / Shared list
  let isFriend = false;
  if (!isAdminOwner) {
    try {
      const response = await fetch("https://plex.tv/api/v2/friends", {
        headers: {
          "Accept": "application/json",
          "X-Plex-Token": adminToken,
          "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
        }
      });

      if (response.ok) {
        const friendsList = await response.json();
        if (Array.isArray(friendsList)) {
          isFriend = friendsList.some((friend: any) => {
            const fEmail = (friend.email || "").toLowerCase().trim();
            const fUsername = (friend.username || friend.title || "").toLowerCase().trim();
            return (
              (rawEmail && fEmail === rawEmail) ||
              (rawUsername && fUsername === rawUsername.toLowerCase())
            );
          });
        }
      }
    } catch (err) {
      console.warn("[AUTH] Failed to fetch Plex friends list:", err);
    }
  }

  if (!isAdminOwner && !isFriend) {
    console.warn(`[AUTH] BLOCKED: ${rawUsername || rawEmail} is not on the shared Plex friends list.`);
    return { error: "Access Denied. You do not have access to this Plex Server." };
  }

  // Generate safe, collision-free username
  let baseUsername = rawUsername || (rawEmail ? rawEmail.split('@')[0] : "plex_user");
  baseUsername = baseUsername.replace(/[^a-zA-Z0-9_\-]/g, "_");
  if (!baseUsername) baseUsername = "plex_user";

  let safeUsername = baseUsername;
  let counter = 1;
  while (allUsers.some((u) => u.username.toLowerCase() === safeUsername.toLowerCase())) {
    safeUsername = `${baseUsername}_${counter}`;
    counter++;
  }

  // Generate safe, collision-free email
  let safeEmail = rawEmail;
  if (!safeEmail || allUsers.some((u) => u.email.toLowerCase() === safeEmail.toLowerCase())) {
    safeEmail = `${safeUsername.toLowerCase()}@plex.local`;
  }

  const randomPassword = Math.random().toString(36).slice(-16) + "Plex!1";
  const hashedPassword = await hash(randomPassword, 10);

  // If server owner, assign ADMIN + APPROVED, otherwise USER + APPROVED (since friend list verified)
  const role = isAdminOwner ? "ADMIN" : "USER";
  const status = "APPROVED";

  user = await prisma.user.create({
    data: {
      username: safeUsername,
      email: safeEmail,
      password: hashedPassword,
      role,
      status
    }
  });

  console.log(`[AUTH] Successfully auto-provisioned Plex user: ${user.username} (${user.role})`);

  // Trigger background Plex friends sync if owner logged in
  if (isAdminOwner) {
    import("./actions").then(({ syncPlexFriendsInternal }) => {
      syncPlexFriendsInternal().catch(e => console.error("[AUTH] Post-login Plex sync error:", e));
    });
  }

  await createSession(user.id, user.username, user.role, user.status);
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

    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" }
    });

    const adminEmails = admins.map(a => a.email).filter(Boolean);
    const recipientEmails = adminEmails.length > 0 ? adminEmails : [settings.smtpUser];
    const senderEmail = settings.smtpFrom || settings.smtpUser;

    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort || 587,
      secure: settings.smtpPort === 465,
      auth: {
        user: settings.smtpUser,
        pass: decryptData(settings.smtpPass)
      }
    });

    const mailOptions = {
      from: senderEmail,
      to: recipientEmails.join(", "),
      subject: `👤 New Account Request: ${user.username}`,
      html: `
        <div style="font-family: sans-serif; padding: 24px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">New Account Request</h2>
          <p style="font-size: 15px; color: #475569;">A new user has registered a temporary account and is awaiting your approval to access Portalarr.</p>
          
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 6px 0; font-weight: bold; width: 120px; color: #64748b;">Username:</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${user.username}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Email:</td>
                <td style="padding: 6px 0; color: #0f172a;">${user.email}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Status:</td>
                <td style="padding: 6px 0; color: #d97706; font-weight: bold;">PENDING APPROVAL</td>
              </tr>
            </table>
          </div>

          <p style="font-size: 14px; color: #475569;">You can review and approve this user in your Portalarr Dashboard under <strong>Settings &gt; Access Control</strong>.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`[AUTH] Account request notification email sent to admins for ${user.username}`);
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

    const senderEmail = settings.smtpFrom || settings.smtpUser;
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort || 587,
      secure: settings.smtpPort === 465,
      auth: {
        user: settings.smtpUser,
        pass: decryptData(settings.smtpPass)
      }
    });

    await transporter.sendMail({
      from: senderEmail,
      to: userEmail,
      subject: `🎉 Your Portalarr Account has been Approved!`,
      html: `
        <div style="font-family: sans-serif; padding: 24px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #0f172a; margin-top: 0;">Account Approved!</h2>
          <p>Hi <strong>${username}</strong>,</p>
          <p>Great news! Your account request for Portalarr has been approved by the administrator.</p>
          <p>You can now sign in and access media requests and services.</p>
        </div>
      `
    });
  } catch (err) {
    console.error("[AUTH] Failed to send approval email to user:", err);
  }
}

// --- HELPER: GET CURRENT FULL USER ---
export async function getCurrentUser() {
  const payload = await getSession();
  if (!payload || !payload.userId) return null;
  
  const user = await prisma.user.findUnique({
    where: { id: payload.userId as string },
    select: { id: true, username: true, email: true, kindleEmail: true, role: true, status: true }
  });

  if (!user) return null;
  
  // Prevent login loops: If user status or role in DB changed, re-issue updated session cookie immediately
  if (user.status !== payload.status || user.role !== payload.role) {
    console.log(`[AUTH] User status/role updated for ${user.username} (Status: ${payload.status} -> ${user.status}). Updating session cookie.`);
    await createSession(user.id, user.username, user.role, user.status);
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

  const tempPassword = "Portalarr-" + Math.random().toString(36).slice(-6) + "!";
  const hashedPassword = await hash(tempPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword }
  });

  try {
    const senderEmail = settings.smtpFrom || settings.smtpUser;
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort || 587,
      secure: settings.smtpPort === 465,
      auth: {
        user: settings.smtpUser,
        pass: decryptData(settings.smtpPass)
      }
    });

    await transporter.sendMail({
      from: senderEmail,
      to: user.email,
      subject: `🔑 Temporary Password for Portalarr`,
      html: `
        <div style="font-family: sans-serif; padding: 24px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">Temporary Password Request</h2>
          <p style="font-size: 15px; color: #475569;">Hi <strong>${user.username}</strong>,</p>
          <p style="font-size: 15px; color: #475569;">We received a password reset request for your Portalarr account. Here is your temporary password:</p>
          
          <div style="background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 16px; border-radius: 8px; font-family: monospace; font-size: 20px; font-weight: bold; text-align: center; letter-spacing: 2px; color: #0f172a; margin: 20px 0;">
            ${tempPassword}
          </div>

          <p style="font-size: 14px; color: #475569;">Please log in with this temporary password and update your password in your settings or profile.</p>
        </div>
      `
    });
    console.log(`[AUTH] Sent temporary password email to ${user.email} (${user.username})`);
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