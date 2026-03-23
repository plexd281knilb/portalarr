"use server";

import { PrismaClient } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { redirect } from "next/navigation";
import { decryptData } from "@/lib/encryption";

// ... (leave the rest of the file exactly as is!)

const prisma = new PrismaClient();

if (!process.env.JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is missing.");
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

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
      data: { username, email, password: hashedPassword, role: "ADMIN" }
    });

    await createSession(user.id, user.username, user.role);
    return { success: true };
  } catch (e: any) {
    console.error("Setup Error:", e);
    return { error: e.message || "Setup failed" };
  }
}

// --- 3. LOGIN ACTION ---
export async function login(formData: FormData) {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    return { error: "Username and password required" };
  }

  const user = await prisma.user.findFirst({
    where: { username }
  });

  if (!user) {
    return { error: "Invalid credentials" };
  }

  const isValid = await compare(password, user.password);

  if (!isValid) {
    return { error: "Invalid credentials" };
  }

  await createSession(user.id, user.username, user.role);
  return { success: true };
}

// --- 4. LOGOUT ---
export async function logout() {
  (await cookies()).delete("session");
  redirect("/login");
}

// --- HELPER: CREATE SESSION ---
async function createSession(userId: string, username: string, role: string) {
  const token = await new SignJWT({ userId, username, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(JWT_SECRET);

  const isProd = process.env.NODE_ENV === "production";

  (await cookies()).set("session", token, {
    httpOnly: true,
    secure: isProd,
    maxAge: 60 * 60 * 24, 
    path: "/",
    sameSite: "lax",
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

// --- 5. PLEX CALLBACK (OPTION 2: AUTO-SYNC) ---
export async function handlePlexCallback(plexProfile: { email: string; username: string }) {
  console.log(`[AUTH] Processing Plex login for: ${plexProfile.username}`);

  if (!plexProfile.email || !plexProfile.username) {
    return { error: "Plex account is missing an email or username." };
  }

  let user = await prisma.user.findUnique({
    where: { email: plexProfile.email }
  });

  if (!user) {
    console.log(`[AUTH] Checking Plex Friends List for: ${plexProfile.username}`);
    
    const settings = await prisma.settings.findFirst({ where: { id: "global" } });
    if (!settings?.mainPlexToken) {
        return { error: "The Server Admin must configure their Plex Token in Settings before users can join." };
    }

    const adminToken = decryptData(settings.mainPlexToken);
    const response = await fetch("https://plex.tv/api/v2/friends", {
        headers: {
            "Accept": "application/json",
            "X-Plex-Token": adminToken,
            "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
        }
    });

    let isFriend = false;
    if (response.ok) {
        const friendsList = await response.json();
        isFriend = friendsList.some((friend: any) => 
            friend.email === plexProfile.email || friend.username === plexProfile.username
        );
    }

    if (!isFriend) {
        console.warn(`[AUTH] BLOCKED: ${plexProfile.username} is not on the shared friends list.`);
        return { error: "Access Denied. You do not have access to this Plex Server." };
    }

    let safeUsername = plexProfile.username;
    const existingUsername = await prisma.user.findUnique({ where: { username: safeUsername } });
    if (existingUsername) safeUsername = `${safeUsername}_plex`;

    const randomPassword = Math.random().toString(36).slice(-16) + "Plex!1";
    const hashedPassword = await hash(randomPassword, 10);

    user = await prisma.user.create({
      data: {
        username: safeUsername,
        email: plexProfile.email,
        password: hashedPassword,
        role: "USER", 
      }
    });
  }

  await createSession(user.id, user.username, user.role);
  return { success: true };
}

// --- HELPER: GET CURRENT FULL USER ---
export async function getCurrentUser() {
  const payload = await getSession();
  if (!payload || !payload.userId) return null;
  
  const user = await prisma.user.findUnique({
    where: { id: payload.userId as string },
    select: { username: true, email: true }
  });
  
  return user;
}