"use server";

import { PrismaClient } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { redirect } from "next/navigation";

const prisma = new PrismaClient();
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "default-secret-key-change-me");

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

  console.log(`[AUTH] Attempting login for: ${username}`);

  if (!username || !password) {
    return { error: "Username and password required" };
  }

  const user = await prisma.user.findFirst({
    where: { username }
  });

  if (!user) {
    console.log(`[AUTH] User not found: ${username}`);
    return { error: "Invalid credentials" };
  }

  const isValid = await compare(password, user.password);

  if (!isValid) {
    console.log(`[AUTH] Invalid password for: ${username}`);
    return { error: "Invalid credentials" };
  }

  console.log(`[AUTH] Login success for: ${username} (${user.role})`);
  await createSession(user.id, user.username, user.role);
  return { success: true };
}

// --- 4. LOGOUT ---
export async function logout() {
  // FIX: await cookies() before calling delete
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

  console.log("[AUTH] Setting session cookie...");

  // FIX: await cookies() is required in Next.js 16
  (await cookies()).set("session", token, {
    httpOnly: true,
    secure: false,  // <--- THIS IS THE KEY. It allows login over HTTP (IP or Localhost).
    maxAge: 60 * 60 * 24, 
    path: "/",
    sameSite: "lax",
  });
}

// --- HELPER: GET SESSION (For Middleware/Server Components) ---
export async function getSession() {
  // FIX: await cookies() before calling get
  const token = (await cookies()).get("session")?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch (e) {
    return null;
  }
}