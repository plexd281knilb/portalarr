"use server";

import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs"; 
import nodemailer from "nodemailer"; 
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { encryptData, decryptData } from "@/lib/encryption";
import prisma from "@/lib/prisma";

const JWT_SECRET_RAW = process.env.JWT_SECRET || "";
if (!JWT_SECRET_RAW && process.env.NODE_ENV === "production") {
    console.warn("⚠️ WARNING: JWT_SECRET environment variable is missing. Authentication will fail.");
}
const SECRET_KEY = new TextEncoder().encode(JWT_SECRET_RAW || "build-time-fallback-key");

// ============================================================================
// --- SECURITY LAYER ---
// ============================================================================

async function verifyAdmin() {
    const cookieStore = await cookies();
    const session = cookieStore.get("session")?.value;
    
    if (!session) throw new Error("Unauthorized");
    
    try {
        const { payload } = await jwtVerify(session, SECRET_KEY);
        if (payload.role !== "ADMIN") {
            throw new Error("Unauthorized");
        }
    } catch (err) {
        console.error("JWT Verification Failed:", err);
        throw new Error("Unauthorized");
    }
}

function cleanUrl(url: string): string {
    if (!url) return "";
    return url.replace(/\/$/, ""); 
}

// ============================================================================
// --- SECURE ADMIN ACTIONS (REQUIRES LOGIN) ---
// ============================================================================

export async function getSettings() {
    await verifyAdmin();
    const settings = await prisma.settings.findFirst() || {} as any;
    
    if (settings.smtpPass) settings.smtpPass = decryptData(settings.smtpPass);
    if (settings.mainPlexToken) settings.mainPlexToken = decryptData(settings.mainPlexToken);
    
    return settings;
}

export async function saveSettings(formData: FormData) {
  await verifyAdmin();
  const smtpHost = formData.get("smtpHost") as string;
  const smtpPort = formData.get("smtpPort") as string;
  const smtpUser = formData.get("smtpUser") as string;
  const rawSmtpPass = formData.get("smtpPass") as string;
  const rawPlexToken = formData.get("mainPlexToken") as string;
  const smtpFrom = formData.get("smtpFrom") as string || "";

  const encryptedSmtpPass = encryptData(rawSmtpPass);
  const encryptedPlexToken = encryptData(rawPlexToken);

  await prisma.settings.upsert({
    where: { id: "global" },
    update: { 
        smtpHost, smtpPort: Number(smtpPort), smtpUser, smtpPass: encryptedSmtpPass, 
        smtpFrom, mainPlexToken: encryptedPlexToken 
    },
    create: { 
        id: "global", smtpHost, smtpPort: Number(smtpPort), smtpUser, smtpPass: encryptedSmtpPass, 
        smtpFrom, mainPlexToken: encryptedPlexToken 
    },
  });
  revalidatePath("/settings");
}

export async function saveJobSettings(formData: FormData) {
  await verifyAdmin();
  const autoSyncInterval = Number(formData.get("autoSyncInterval"));
  const downloadsPath = formData.get("downloadsPath") as string || "/downloads";
  
  await prisma.settings.upsert({
    where: { id: "global" },
    update: { autoSyncInterval, downloadsPath },
    create: { id: "global", autoSyncInterval, downloadsPath },
  });
  revalidatePath("/settings");
}

export async function clearSmtpSettings() {
  await verifyAdmin();
  await prisma.settings.update({
    where: { id: "global" },
    data: { smtpHost: "", smtpPort: 0, smtpUser: "", smtpPass: "", smtpFrom: "" },
  });
  revalidatePath("/settings");
}

export async function addTautulliInstance(formData: FormData) {
  await verifyAdmin();
  const name = formData.get("name") as string;
  const url = formData.get("url") as string;
  const rawApiKey = formData.get("apiKey") as string;
  
  // Encrypt before saving
  await prisma.tautulliInstance.create({ 
      data: { name, url, apiKey: encryptData(rawApiKey) } 
  });
  revalidatePath("/settings");
}

export async function removeTautulliInstance(id: string) {
  await verifyAdmin();
  await prisma.tautulliInstance.delete({ where: { id } });
  revalidatePath("/settings");
}

export async function getTautulliInstances() {
    await verifyAdmin();
    const instances = await prisma.tautulliInstance.findMany();
    // Decrypt before sending to the UI
    return instances.map(i => ({ ...i, apiKey: decryptData(i.apiKey) }));
}

export async function addGlancesInstance(formData: FormData) {
  await verifyAdmin();
  const name = formData.get("name") as string;
  const url = formData.get("url") as string;
  await prisma.glancesInstance.create({ data: { name, url } });
  revalidatePath("/settings");
}

export async function removeGlancesInstance(id: string) {
  await verifyAdmin();
  await prisma.glancesInstance.delete({ where: { id } });
  revalidatePath("/settings");
}

export async function getGlancesInstances() {
    await verifyAdmin();
    return await prisma.glancesInstance.findMany();
}

export async function getMediaApps() {
    await verifyAdmin();
    const apps = await prisma.mediaApp.findMany();
    // Decrypt before sending to the UI
    return apps.map(app => ({ ...app, apiKey: decryptData(app.apiKey as string) }));
}

export async function addMediaApp(formData: FormData) {
  await verifyAdmin();
  const type = formData.get("type") as string;
  const name = formData.get("name") as string;
  const url = formData.get("url") as string;
  const externalUrl = formData.get("externalUrl") as string; 
  const rawApiKey = formData.get("apiKey") as string;
  
  // Encrypt before saving
  await prisma.mediaApp.create({ 
      data: { type, name, url, externalUrl: externalUrl || null, apiKey: encryptData(rawApiKey) } 
  });
  revalidatePath("/settings");
}

export async function updateMediaApp(formData: FormData) {
    await verifyAdmin();
    const id = formData.get("id") as string;
    const type = formData.get("type") as string;
    const name = formData.get("name") as string;
    const url = formData.get("url") as string;
    const externalUrl = formData.get("externalUrl") as string;
    const rawApiKey = formData.get("apiKey") as string;

    // Encrypt before saving
    await prisma.mediaApp.update({
        where: { id },
        data: { type, name, url, externalUrl: externalUrl || null, apiKey: encryptData(rawApiKey) }
    });
    revalidatePath("/settings");
}

export async function removeMediaApp(id: string) {
  await verifyAdmin();
  await prisma.mediaApp.delete({ where: { id } });
  revalidatePath("/settings");
}

export async function getAppUsers() {
    await verifyAdmin();
    return await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, username: true, email: true, role: true, createdAt: true }
    });
}

export async function createAppUser(formData: FormData) {
    await verifyAdmin();
    const username = formData.get("username") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const role = formData.get("role") as string;

    if (!username || !password || !email) return;
    const hashedPassword = await hash(password, 10);

    try {
        await prisma.user.create({
            data: { username, email, password: hashedPassword, role }
        });
        revalidatePath("/settings");
    } catch (e) {
        console.error("Failed to create user", e);
    }
}

export async function deleteAppUser(id: string) {
    await verifyAdmin();
    try {
        await prisma.user.delete({ where: { id } });
        revalidatePath("/settings/access");
        revalidatePath("/settings");
    } catch (e) {
        console.error("Failed to delete user:", e);
    }
}

export async function getSupportTickets() {
    await verifyAdmin();
    return await prisma.supportTicket.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50
    });
}

export async function updateTicketStatus(id: string, status: string, adminComment?: string) {
    await verifyAdmin();
    const ticket = await prisma.supportTicket.update({
        where: { id },
        data: { status, adminComment }
    });

    if (status === "Acknowledged" || status === "Completed") {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        
        if (settings?.smtpHost && settings?.smtpUser) {
            const transporter = nodemailer.createTransport({
                host: settings.smtpHost,
                port: settings.smtpPort,
                secure: settings.smtpPort === 465, 
                auth: { user: settings.smtpUser, pass: decryptData(settings.smtpPass as string) },
            } as any);

            let emailText = `Hi ${ticket.name},\n\nYour support ticket status has been updated to: ${status}.\n\n`;
            if (adminComment) {
                emailText += `Admin Reply:\n${adminComment}\n\n`;
            }
            emailText += `--- Original Issue ---\n${ticket.issue}\n\nThanks,\nPortalarr Support`;

            await transporter.sendMail({
                from: `"Portalarr" <${settings.smtpUser}>`,
                to: ticket.email,
                subject: `Support Ticket Update: ${status}`,
                text: emailText
            });
        }
    }

    revalidatePath("/");
    revalidatePath("/admin/tickets");
}

export async function deleteSupportTicket(id: string) {
    await verifyAdmin();
    try {
        await prisma.supportTicket.delete({
            where: { id }
        });
        revalidatePath("/admin/tickets");
        revalidatePath("/settings");
        return { success: true };
    } catch (e) {
        console.error("Failed to delete ticket:", e);
        return { error: "Failed to delete ticket." };
    }
}

export async function sendManualEmail(formData: FormData) {
    await verifyAdmin();
    const to = formData.get("to") as string;
    const subject = formData.get("subject") as string;
    const message = formData.get("message") as string;

    if (!to || !subject || !message) return { error: "All fields are required." };

    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        
        if (!settings?.smtpHost || !settings?.smtpUser) {
            return { error: "SMTP settings not configured." };
        }

        const transporter = nodemailer.createTransport({
            host: settings.smtpHost,
            port: settings.smtpPort,
            secure: settings.smtpPort === 465, 
            auth: { user: settings.smtpUser, pass: decryptData(settings.smtpPass as string) },
        } as any);

        await transporter.sendMail({
            from: `"Portalarr" <${settings.smtpUser}>`,
            to: to,
            subject: subject,
            html: `<div style="font-family: sans-serif; white-space: pre-wrap;">${message}</div>` 
        });

        return { success: true };
    } catch (e: any) {
        console.error("Email Failed:", e);
        return { error: "Failed to send email. Please check your SMTP settings in the General tab." };
    }
}

// ============================================================================
// --- PUBLIC DASHBOARD ACTIONS (DO NOT SECURE THESE - THEY FEED THE UI) ---
// ============================================================================

export async function getPublicMediaApps() {
    const apps = await prisma.mediaApp.findMany();
    return apps.map(app => ({
        id: app.id,
        name: app.name,
        type: app.type,
        externalUrl: app.externalUrl 
    }));
}

export async function submitSupportTicket(formData: FormData) {
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const issue = formData.get("issue") as string;

    if (!name || !email || !issue) return { error: "All fields required" };

    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentTicket = await prisma.supportTicket.findFirst({
            where: {
                email: email,
                createdAt: { gte: oneHourAgo }
            }
        });

        if (recentTicket) {
            return { error: "You've already submitted a ticket recently. Please wait an hour before submitting another." };
        }

        await prisma.supportTicket.create({
            data: { name, email, issue }
        });

        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        
        if (settings?.smtpHost && settings?.smtpUser) {
            const transporter = nodemailer.createTransport({
                host: settings.smtpHost,
                port: settings.smtpPort,
                secure: settings.smtpPort === 465, 
                auth: { user: settings.smtpUser, pass: decryptData(settings.smtpPass as string) },
            } as any);

            await transporter.sendMail({
                from: `"Support" <${settings.smtpUser}>`,
                to: settings.smtpUser, 
                replyTo: email,
                subject: `New Ticket from ${name}`,
                text: `User: ${name} (${email})\n\nIssue:\n${issue}`
            });
        }
        revalidatePath("/");
        return { success: true };
    } catch (e) {
        console.error("Support Ticket Error:", e);
        return { error: "An unexpected error occurred. Please try again later." };
    }
}

export async function getActiveDownloads() {
    const apps = await prisma.mediaApp.findMany({
        where: { type: { in: ["sabnzbd", "nzbget", "qBittorrent"] } }
    });

    const results = await Promise.all(apps.map(async (app) => {
        // 1. Initialize the data object for THIS specific app iteration
        let data: any = { 
            id: app.id, 
            type: app.type, 
            name: app.name, 
            online: false,
            queue: []
        };

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); 
            const cleanUrl = app.url.replace(/\/$/, "");
            
            // Decrypt the API key from your secure storage
            const decryptedKey = decryptData(app.apiKey as string);

            const res = await fetch(`${cleanUrl}/api?mode=queue&output=json&apikey=${decryptedKey}`, { 
                signal: controller.signal, 
                cache: "no-store" 
            });
            clearTimeout(timeoutId);
            
            const json = await res.json();

            // 2. Now 'data' is defined and can be updated
            if (json.queue) {
                data.online = true;
                data.queue = (json.queue.slots || []).map((slot: any) => ({
                    filename: slot.filename || "Unknown Download",
                    percentage: slot.percentage || "0",
                    timeleft: slot.timeleft || "0:00",
                    mb: slot.mb || 0,
                    mbleft: slot.mbleft || 0
                }));
            }
            return data;
        } catch (e) {
            // Return the initialized 'data' object (which has online: false) if the fetch fails
            return data;
        }
    }));

    return results;
}

export async function getLandingStats() {
    const [tautulli, glances, apps] = await Promise.all([
        prisma.tautulliInstance.findMany(),
        prisma.glancesInstance.findMany(),
        prisma.mediaApp.findMany()
    ]);

    let streamStats: { name: string, count: number }[] = [];
    let serverStats: any[] = [];
    let downApps: string[] = [];

    await Promise.all(tautulli.map(async (t) => {
        let baseUrl = cleanUrl(t.url).replace(/\/api\/v2\/?$/, "");
        const fullUrl = `${baseUrl}/api/v2?apikey=${t.apiKey}&cmd=get_activity`;

        try {
            const res = await fetch(fullUrl, { next: { revalidate: 10 } });
            
            if (!res.ok) {
                streamStats.push({ name: t.name, count: 0 }); 
                return;
            }
            
            const data = await res.json();
            const count = data.response?.data?.stream_count ? Number(data.response.data.stream_count) : 0;
            streamStats.push({ name: t.name, count: count });

        } catch (e: any) { 
            streamStats.push({ name: t.name, count: 0 }); 
        }
    }));

    await Promise.all(glances.map(async (g) => {
        const cleanGlances = cleanUrl(g.url);
        
        const fetchGlancesMetric = async (endpoint: string) => {
            const versions = [4, 3, 2]; 
            for (const v of versions) {
                try {
                    const url = `${cleanGlances}/api/${v}/${endpoint}`;
                    const res = await fetch(url, { next: { revalidate: 10 } });
                    if (res.ok) return await res.json();
                } catch (e) { }
            }
            throw new Error(`Failed`);
        };

        try {
            const cpu = await fetchGlancesMetric("cpu");
            const mem = await fetchGlancesMetric("mem");
            
            serverStats.push({ 
                name: g.name, 
                cpu: cpu.total, 
                ram: mem.percent, 
                online: true 
            });
        } catch (e: any) {
            serverStats.push({ name: g.name, online: false });
        }
    }));

    await Promise.all(apps.map(async (app) => {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 2000); 
            await fetch(app.url, { signal: controller.signal, mode: 'no-cors' });
            clearTimeout(id);
        } catch (e) {
            downApps.push(app.name);
        }
    }));

    return { streamStats, serverStats, downApps };
}

// ============================================================================
// --- BETA TESTING ACTIONS ---
// ============================================================================

export async function getBetaDashboardText() {
    const settings = await prisma.settings.findUnique({ where: { id: "global" } });
    return settings?.betaDashboardText || "### Interested in Beta Testing?\nWe are rolling out new features. Click below to see what we are currently testing and how you can get access!";
}

export async function updateBetaDashboardText(formData: FormData) {
    await verifyAdmin();
    const text = formData.get("text") as string;
    await prisma.settings.upsert({
        where: { id: "global" },
        update: { betaDashboardText: text },
        create: { id: "global", betaDashboardText: text }
    });
    revalidatePath("/");
    revalidatePath("/settings");
}

export async function getBetaCards() {
    return await prisma.betaCard.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function createBetaCard(formData: FormData) {
    await verifyAdmin();
    const title = formData.get("title") as string;
    const content = formData.get("content") as string;
    const buttonText = formData.get("buttonText") as string;
    const buttonUrl = formData.get("buttonUrl") as string;
    
    await prisma.betaCard.create({ 
        data: { title, content, buttonText, buttonUrl } 
    });
    revalidatePath("/beta");
    revalidatePath("/settings");
}

export async function updateBetaCard(formData: FormData) {
    await verifyAdmin();
    const id = formData.get("id") as string;
    const title = formData.get("title") as string;
    const content = formData.get("content") as string;
    const buttonText = formData.get("buttonText") as string;
    const buttonUrl = formData.get("buttonUrl") as string;
    
    await prisma.betaCard.update({ 
        where: { id },
        data: { title, content, buttonText, buttonUrl } 
    });
    revalidatePath("/beta");
    revalidatePath("/settings");
}

export async function deleteBetaCard(id: string) {
    await verifyAdmin();
    await prisma.betaCard.delete({ where: { id } });
    revalidatePath("/beta");
    revalidatePath("/settings");
}

// ============================================================================
// --- ROADMAP ACTIONS ---
// ============================================================================

export async function getRoadmapText() {
    const settings = await prisma.settings.findUnique({ where: { id: "global" } });
    return settings?.roadmapText || "### 🚀 Upcoming Releases & Roadmap\nNo new updates at this time. Check back later!";
}

export async function updateRoadmapText(formData: FormData) {
    await verifyAdmin();
    const text = formData.get("text") as string;
    await prisma.settings.upsert({
        where: { id: "global" },
        update: { roadmapText: text },
        create: { id: "global", roadmapText: text }
    });
    revalidatePath("/");
    revalidatePath("/settings");
}

// ============================================================================
// --- ALERT BANNER ACTIONS ---
// ============================================================================

export async function getAlertBanner() {
    const settings = await prisma.settings.findUnique({ where: { id: "global" } });
    return {
        enabled: settings?.alertBannerEnabled || false,
        text: settings?.alertBannerText || "⚠️ **System Maintenance:** Expected downtime this weekend."
    };
}

export async function updateAlertBanner(formData: FormData) {
    await verifyAdmin();
    const enabled = formData.get("enabled") === "on";
    const text = formData.get("text") as string;
    await prisma.settings.upsert({
        where: { id: "global" },
        update: { alertBannerEnabled: enabled, alertBannerText: text },
        create: { id: "global", alertBannerEnabled: enabled, alertBannerText: text }
    });
    revalidatePath("/");
    revalidatePath("/settings");
}

// ============================================================================
// --- BOOK LIBRARY & REQUEST ACTIONS (SHELFMARK + GRIMMORY) ---
// ============================================================================

import fs from "fs";
import path from "path";

async function verifyUser() {
    const cookieStore = await cookies();
    const session = cookieStore.get("session")?.value;
    if (!session) throw new Error("Unauthorized");
    try {
        const { payload } = await jwtVerify(session, SECRET_KEY);
        return payload; // { userId, username, role }
    } catch (err) {
        throw new Error("Unauthorized");
    }
}

async function checkLibraryAccess(allowedUsersStr: string, username: string, role: string) {
    if (role === "ADMIN") return true;
    if (!allowedUsersStr) return false;
    const allowed = allowedUsersStr.split(",").map(u => u.trim().toLowerCase());
    if (allowed.includes("*") || allowed.includes(username.toLowerCase())) {
        return true;
    }
    return false;
}

export async function getLibraries() {
    const session = await verifyUser();
    const libraries = await prisma.library.findMany({
        orderBy: { name: "asc" }
    });
    
    const accessible = [];
    for (const lib of libraries) {
        if (await checkLibraryAccess(lib.allowedUsers, session.username as string, session.role as string)) {
            accessible.push(lib);
        }
    }
    return accessible;
}

export async function createLibrary(formData: FormData) {
    await verifyAdmin();
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const path = formData.get("path") as string || "";
    const allowedUsers = formData.get("allowedUsers") as string || "";
    const downloadCategory = formData.get("downloadCategory") as string || "books";
    
    await prisma.library.create({
        data: { name, description, path, allowedUsers, downloadCategory }
    });
    revalidatePath("/library");

    const usersList = allowedUsers.split(",").map(u => u.trim()).filter(Boolean);
    if (usersList.length > 0) {
        sendLibraryAccessEmail(name, description, usersList).catch(e => console.error(e));
    }
}

export async function updateLibrary(formData: FormData) {
    await verifyAdmin();
    const id = formData.get("id") as string;
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const path = formData.get("path") as string || "";
    const allowedUsers = formData.get("allowedUsers") as string || "";
    const downloadCategory = formData.get("downloadCategory") as string || "books";
    
    const existing = await prisma.library.findUnique({ where: { id } });

    await prisma.library.update({
        where: { id },
        data: { name, description, path, allowedUsers, downloadCategory }
    });
    revalidatePath("/library");

    if (existing) {
        const oldUsers = existing.allowedUsers.split(",").map(u => u.trim()).filter(Boolean);
        const newUsers = allowedUsers.split(",").map(u => u.trim()).filter(Boolean);
        const newlyAdded = newUsers.filter(u => !oldUsers.includes(u));
        if (newlyAdded.length > 0) {
            sendLibraryAccessEmail(name, description, newlyAdded).catch(e => console.error(e));
        }
    }
}

async function sendLibraryAccessEmail(libraryName: string, description: string, usernames: string[]) {
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        if (!settings || !settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
            console.log("[SMTP-LIBRARY-ACCESS] SMTP is not configured. Skipping access email.");
            return;
        }

        let targetUsers: any[] = [];
        if (usernames.includes("*")) {
            targetUsers = await prisma.user.findMany({ where: { email: { not: "" } } });
        } else {
            targetUsers = await prisma.user.findMany({
                where: {
                    username: { in: usernames },
                    email: { not: "" }
                }
            });
        }

        if (targetUsers.length === 0) {
            console.log("[SMTP-LIBRARY-ACCESS] No users to notify.");
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

        for (const user of targetUsers) {
            const subject = `📖 Access Granted: Portalarr "${libraryName}" Library Shelf`;
            const text = `Hello ${user.username},

You have been granted access to the "${libraryName}" library shelf on Portalarr!

Library Description: ${description || "No description provided."}

Instructions:
1. Log in to Portalarr on your device.
2. Navigate to the "Book Library" tab.
3. Select "${libraryName}" from the list of shelves.
4. You can now browse all available books, request new ones, download files directly, or send them to your configured Kindle email address in one click!

Happy reading!
- Portalarr Administration`;

            const html = `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff; color: #334155;">
                    <h2 style="color: #ea580c; margin-top: 0;">📖 Portalarr Library Access</h2>
                    <p>Hello <strong>${user.username}</strong>,</p>
                    <p>You have been granted access to the new library shelf: <strong>"${libraryName}"</strong> on Portalarr!</p>
                    ${description ? `<p style="font-style: italic; color: #475569; padding: 8px 12px; background-color: #f8fafc; border-left: 4px solid #cbd5e1; margin: 15px 0;">${description}</p>` : ""}
                    
                    <h3 style="color: #0f172a; margin-top: 20px;">What you can do:</h3>
                    <ul style="padding-left: 20px; color: #334155; line-height: 1.6;">
                        <li><strong>Browse Ebooks:</strong> Open the <strong>Book Library</strong> tab and view this library shelf.</li>
                        <li><strong>One-Click Kindle:</strong> Configure your Kindle settings and click "Send to Kindle" to instantly email books directly to your Kindle reader!</li>
                        <li><strong>Request Books:</strong> If you don't see the book you want, request it in the "Requests" tab. The system will search, download, and copy it to this shelf automatically.</li>
                        <li><strong>Direct Download:</strong> Download EPUB/PDF/CBZ files directly to your device.</li>
                    </ul>
                    
                    <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px;">
                        This email was sent automatically from your Portalarr server.
                    </div>
                </div>
            `;

            try {
                await transporter.sendMail({
                    from: `"Portalarr" <${senderEmail}>`,
                    to: user.email,
                    subject,
                    text,
                    html
                });
                console.log(`[SMTP-LIBRARY-ACCESS] Sent access notification email to ${user.username} (${user.email})`);
            } catch (err: any) {
                console.error(`[SMTP-LIBRARY-ACCESS] Failed to send email to ${user.username}:`, err.message);
            }
        }
    } catch (e: any) {
        console.error(`[SMTP-LIBRARY-ACCESS] SMTP notification error:`, e);
    }
}

export async function deleteLibrary(id: string) {
    await verifyAdmin();
    
    const books = await prisma.book.findMany({ where: { libraryId: id } });
    for (const book of books) {
        try {
            if (fs.existsSync(book.filePath)) {
                fs.unlinkSync(book.filePath);
            }
        } catch (e) {
            console.error(`Failed to delete book file: ${book.filePath}`, e);
        }
    }
    
    await prisma.library.delete({ where: { id } });
    revalidatePath("/library");
}

export async function getLibraryBooks(libraryId: string) {
    const session = await verifyUser();
    const library = await prisma.library.findUnique({
        where: { id: libraryId }
    });
    
    if (!library) throw new Error("Library not found");
    
    const hasAccess = await checkLibraryAccess(
        library.allowedUsers, 
        session.username as string, 
        session.role as string
    );
    if (!hasAccess) throw new Error("Unauthorized access to this library");
    
    return await prisma.book.findMany({
        where: { libraryId },
        orderBy: { title: "asc" }
    });
}

export async function deleteBook(id: string) {
    await verifyAdmin();
    const book = await prisma.book.findUnique({ where: { id } });
    if (!book) throw new Error("Book not found");
    
    try {
        if (fs.existsSync(book.filePath)) {
            fs.unlinkSync(book.filePath);
        }
    } catch (e) {
        console.error(`Failed to delete book file: ${book.filePath}`, e);
    }
    
    await prisma.book.delete({ where: { id } });
    revalidatePath("/library");
}

export async function updateBook(id: string, title: string, author: string, coverUrl: string) {
    await verifyAdmin();
    await prisma.book.update({
        where: { id },
        data: { title, author, coverUrl }
    });
    await renameBookFileOnDisk(id);
    revalidatePath("/library");
}

async function renameBookFileOnDisk(bookId: string): Promise<string> {
    try {
        const book = await prisma.book.findUnique({ where: { id: bookId } });
        if (!book) return "";
        if (!fs.existsSync(book.filePath)) return book.filePath;

        const ext = path.extname(book.filePath);
        const dir = path.dirname(book.filePath);
        
        let safeAuthor = (book.author && book.author !== "Unknown Author") 
            ? book.author.replace(/[/\\?%*:|"<>]/g, "").trim()
            : "";
        let safeTitle = book.title.replace(/[/\\?%*:|"<>]/g, "").trim();

        if (safeTitle.length > 100) safeTitle = safeTitle.substring(0, 100).trim();
        if (safeAuthor.length > 50) safeAuthor = safeAuthor.substring(0, 50).trim();

        let newFileName = "";
        if (safeAuthor) {
            newFileName = `${safeAuthor} - ${safeTitle}${ext}`;
        } else {
            newFileName = `${safeTitle}${ext}`;
        }

        const newPath = path.join(dir, newFileName);
        if (book.filePath === newPath) return book.filePath;

        let finalPath = newPath;
        let counter = 1;
        while (fs.existsSync(finalPath)) {
            if (finalPath === book.filePath) break;
            const baseWithoutExt = path.basename(newPath, ext);
            finalPath = path.join(dir, `${baseWithoutExt}_${counter}${ext}`);
            counter++;
        }

        if (book.filePath !== finalPath && fs.existsSync(book.filePath)) {
            console.log(`[FILE-RENAME] Renaming on-disk file: ${book.filePath} -> ${finalPath}`);
            fs.renameSync(book.filePath, finalPath);
            
            await prisma.book.update({
                where: { id: bookId },
                data: { filePath: finalPath }
            });
            return finalPath;
        }
        return book.filePath;
    } catch (err: any) {
        console.error(`[FILE-RENAME] Failed to rename file for book ${bookId}:`, err.message);
        const book = await prisma.book.findUnique({ where: { id: bookId } });
        return book ? book.filePath : "";
    }
}

export async function deleteBookRequest(id: string) {
    const session = await verifyUser();
    const request = await prisma.bookRequest.findUnique({ where: { id } });
    if (!request) throw new Error("Request not found");

    if (session.role !== "ADMIN" && request.requestedBy !== session.username) {
        throw new Error("You are not authorized to delete this request");
    }

    await prisma.bookRequest.delete({ where: { id } });
    revalidatePath("/library");
}

export async function getBookRequests() {
    const session = await verifyUser();
    
    if (session.role === "ADMIN") {
        return await prisma.bookRequest.findMany({
            orderBy: { createdAt: "desc" }
        });
    } else {
        return await prisma.bookRequest.findMany({
            where: { requestedBy: session.username as string },
            orderBy: { createdAt: "desc" }
        });
    }
}

async function sendRequestNotificationToAdmins(request: { title: string, author: string, requestedBy: string, type: string, publishYear?: string | null }) {
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        if (!settings || !settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
            console.log("[SMTP-NOTIFICATION] SMTP is not configured. Skipping request notification.");
            return;
        }

        const admins = await prisma.user.findMany({
            where: { role: "ADMIN" }
        });

        if (admins.length === 0) {
            console.log("[SMTP-NOTIFICATION] No admin users found. Skipping request notification.");
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

        for (const admin of admins) {
            if (!admin.email) continue;
            
            let detailsHtml = "";
            if (request.type === "checklist") {
                detailsHtml = `
                    <p>Multiple books were requested from a checklist by <strong>${request.requestedBy}</strong>:</p>
                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 6px; font-family: monospace; white-space: pre-wrap; line-height: 1.5;">${request.author}</div>
                `;
            } else {
                detailsHtml = `
                    <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                        <tr style="background-color: #f8fafc;">
                            <td style="padding: 10px; font-weight: bold; width: 120px; border: 1px solid #e2e8f0;">Title:</td>
                            <td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>${request.title}</strong></td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Author:</td>
                            <td style="padding: 10px; border: 1px solid #e2e8f0;">${request.author || "Unknown Author"}</td>
                        </tr>
                        <tr style="background-color: #f8fafc;">
                            <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Requested By:</td>
                            <td style="padding: 10px; border: 1px solid #e2e8f0;"><code>${request.requestedBy}</code></td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Type:</td>
                            <td style="padding: 10px; border: 1px solid #e2e8f0;"><span style="text-transform: uppercase; font-size: 11px; font-weight: bold; padding: 2px 6px; background-color: #dbeafe; color: #1e40af; border-radius: 4px;">${request.type}</span></td>
                        </tr>
                        ${request.publishYear ? `
                        <tr style="background-color: #f8fafc;">
                            <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Publish Year:</td>
                            <td style="padding: 10px; border: 1px solid #e2e8f0;">${request.publishYear}</td>
                        </tr>
                        ` : ""}
                    </table>
                `;
            }

            const mailOptions = {
                from: senderEmail,
                to: admin.email,
                subject: `📚 New Book Request: ${request.title}`,
                html: `
                    <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                        <h2 style="color: #4f46e5; margin-top: 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px;">New Ebook Request</h2>
                        ${detailsHtml}
                        <div style="margin-top: 25px; text-align: center;">
                            <a href="${process.env.APP_URL || 'http://localhost:3000'}/library" style="background-color: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Manage Requests</a>
                        </div>
                    </div>
                `
            };

            await transporter.sendMail(mailOptions);
        }
        console.log(`[SMTP-NOTIFICATION] Request notification sent successfully for "${request.title}"`);
    } catch (e: any) {
        console.error("[SMTP-NOTIFICATION] Failed to send request email notification to admins:", e);
    }
}

export async function createBookRequest(formData: FormData) {
    const session = await verifyUser();
    const title = formData.get("title") as string;
    const author = formData.get("author") as string || "";
    const type = formData.get("type") as string || "book"; // "book" or "series"
    const coverUrl = formData.get("coverUrl") as string || "";
    const publishYear = formData.get("publishYear") as string || "";
    
    if (!title) throw new Error("Title is required");
    
    if (type === "series") {
        const expanded = await expandSeriesRequest(title, author, session.username as string);
        if (expanded) {
            // Save the parent series request record itself in the DB
            await prisma.bookRequest.create({
                data: {
                    title,
                    author,
                    coverUrl,
                    publishYear,
                    requestedBy: session.username as string,
                    type: "series",
                    status: "Approved"
                }
            });

            sendRequestNotificationToAdmins({
                title: `${title} (Book Series)`,
                author,
                requestedBy: session.username as string,
                type: "series",
                publishYear: null
            }).catch(err => {
                console.error(`[SMTP-NOTIFICATION] Series request email notification failed:`, err);
            });
            revalidatePath("/library");
            return;
        }
    }
    
    const request = await prisma.bookRequest.create({
        data: {
            title,
            author,
            coverUrl,
            publishYear,
            requestedBy: session.username as string,
            type,
            status: "Pending"
        }
    });
    
    if (type === "book") {
        autoDownloadBookRequest(request.id, title, author).catch(err => {
            console.error(`[AUTO-DOWNLOAD] Background process failed:`, err);
        });
        
        sendRequestNotificationToAdmins({
            title,
            author,
            requestedBy: session.username as string,
            type: "book",
            publishYear
        }).catch(err => {
            console.error(`[SMTP-NOTIFICATION] Single request email notification failed:`, err);
        });
    }

    revalidatePath("/library");
}

async function expandSeriesRequest(seriesTitle: string, author: string, requestedBy: string): Promise<boolean> {
    try {
        const query = `series:"${seriesTitle}"`;
        const response = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&fields=key,title,author_name,cover_i,first_publish_year`, {
            headers: { "Accept": "application/json" },
            next: { revalidate: 3600 }
        });
        
        const data = response.ok ? await response.json() : { docs: [] };
        let docs = data.docs || [];
        
        if (docs.length === 0) {
            console.log(`[SERIES-EXPANSION] No books found for series:"${seriesTitle}". Trying general keyword fallback...`);
            const fallbackResponse = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(seriesTitle)}&fields=key,title,author_name,cover_i,first_publish_year`, {
                headers: { "Accept": "application/json" },
                next: { revalidate: 3600 }
            });
            if (fallbackResponse.ok) {
                const fallbackData = await fallbackResponse.json();
                docs = fallbackData.docs || [];
            }
        }
        
        if (docs.length === 0) {
            return false;
        }
        
        const uniqueBooks: any[] = [];
        const seenTitles = new Set<string>();
        
        for (const doc of docs) {
            const normalizedTitle = doc.title.toLowerCase().replace(/[^a-z0-9]/g, "");
            const titleLower = doc.title.toLowerCase();
            const isCompilation = titleLower.includes("box set") || 
                                  titleLower.includes("boxed set") || 
                                  titleLower.includes("collection") || 
                                  titleLower.includes("series 1-") || 
                                  titleLower.includes("pack") || 
                                  titleLower.includes("omnibus") || 
                                  titleLower.includes("bundle") ||
                                  titleLower.includes("boxedset");
                                  
            if (isCompilation) continue;
            
            if (!seenTitles.has(normalizedTitle)) {
                seenTitles.add(normalizedTitle);
                
                const authorName = doc.author_name && doc.author_name.length > 0 
                    ? doc.author_name[0] 
                    : author || "Unknown Author";
                    
                const coverUrl = doc.cover_i 
                    ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` 
                    : "";
                    
                uniqueBooks.push({
                    title: doc.title,
                    author: authorName,
                    coverUrl,
                    publishYear: doc.first_publish_year ? String(doc.first_publish_year) : ""
                });
            }
        }
        
        if (uniqueBooks.length === 0) return false;
        
        for (const book of uniqueBooks) {
            const req = await prisma.bookRequest.create({
                data: {
                    title: book.title,
                    author: book.author,
                    coverUrl: book.coverUrl,
                    publishYear: book.publishYear,
                    requestedBy,
                    type: "book",
                    status: "Pending"
                }
            });
            
            autoDownloadBookRequest(req.id, book.title, book.author).catch(err => {
                console.error(`[AUTO-DOWNLOAD] Background process failed for series book:`, err);
            });
        }
        
        return true;
    } catch (e) {
        console.error("Failed to expand series request:", e);
        return false;
    }
}

export async function updateBookRequestStatus(id: string, status: string) {
    await verifyAdmin();
    await prisma.bookRequest.update({
        where: { id },
        data: { status }
    });
    revalidatePath("/library");
}

export async function processEpubForKindle(filePath: string): Promise<string> {
    if (!fs.existsSync(filePath)) {
        throw new Error("File does not exist.");
    }

    const stats = fs.statSync(filePath);
    if (stats.size > 50 * 1024 * 1024) {
        throw new Error("File size exceeds 50MB Kindle limit.");
    }

    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4);
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);

    if (buffer.toString('hex') !== '504b0304') {
        throw new Error("Invalid file format. File is not a valid ZIP/EPUB archive.");
    }

    return filePath;
}

export async function scanLibrary(libraryId: string) {
    await verifyAdmin();
    return await scanLibraryInternal(libraryId);
}

function cleanSearchQuery(searchQuery: string): string {
    return searchQuery
        .replace(/'s\b/gi, "s") // Convert magician's -> magicians
        .replace(/\b([a-zA-Z]+)\s+s\b/gi, "$1s") // Merge isolated s (magician s -> magicians)
        .replace(/\b\d{4}\b/g, "") // Strip 4-digit years
        .replace(/\b(?:0[1-9]|[1-9]\d|\d)\b/g, "") // Strip separate single/double digits (01, 1)
        .replace(/\b(?:v|vol|bk|book|part|no|#)\.?\s*\d+\b/gi, "") // Strip vol numbers
        .replace(/[()\[\]]/g, "") // Strip brackets
        .replace(/\s+/g, " ") // Clean spaces
        .trim();
}

async function fetchOpenLibraryWithFallback(cleanedQuery: string, signal: AbortSignal): Promise<any> {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(cleanedQuery)}&limit=1`;
    const res = await fetch(url, { headers: { "Accept": "application/json" }, signal });
    if (!res.ok) return null;
    const data = await res.json();
    
    if (data && data.docs && data.docs.length > 0) {
        return data;
    }
    
    // Fallback: Check if prefix is 1-2 chars or standard tags like zlib/libgen/epub/pdf, and retry search without it
    const prefixRegex = /^(?:[a-z]{1,2}|zlib|libgen|epub|pdf)\b\s*/i;
    if (prefixRegex.test(cleanedQuery)) {
        const fallbackQuery = cleanedQuery.replace(prefixRegex, "").trim();
        console.log(`[OPEN-LIBRARY-FALLBACK] No matches for "${cleanedQuery}". Retrying with stripped prefix: "${fallbackQuery}"`);
        const fallbackUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(fallbackQuery)}&limit=1`;
        const fallbackRes = await fetch(fallbackUrl, { headers: { "Accept": "application/json" }, signal });
        if (fallbackRes.ok) {
            return await fallbackRes.json();
        }
    }
    
    return data;
}

export async function scanLibraryInternal(libraryId: string) {
    const library = await prisma.library.findUnique({
        where: { id: libraryId }
    });
    if (!library) throw new Error("Library not found");
    if (!library.path) throw new Error("No folder path configured for this library");
    if (!fs.existsSync(library.path)) {
        throw new Error(`Directory does not exist: ${library.path}`);
    }

    try {
        const dbBooks = await prisma.book.findMany({
            where: { libraryId: libraryId }
        });
        const dbBooksByPathLower = new Map<string, any>();
        for (const b of dbBooks) {
            dbBooksByPathLower.set(b.filePath.toLowerCase(), b);
        }

        const files = fs.readdirSync(library.path);
        const validExtensions = [".pdf", ".epub", ".mobi", ".cbz"];
        const matchedDbBookIds = new Set<string>();

        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            if (validExtensions.includes(ext)) {
                let fullPath = path.join(library.path, file);

                if (ext === ".epub") {
                    try {
                        fullPath = await processEpubForKindle(fullPath);
                    } catch (err: any) {
                        console.warn(`[KINDLE-PROCESS] EPUB check failed for ${file}: ${err.message}`);
                    }
                }

                const existing = dbBooksByPathLower.get(fullPath.toLowerCase());

                if (!existing) {
                    const stats = fs.statSync(fullPath);
                    const cleanBase = path.basename(fullPath, ext);
                    let title = cleanBase.replace(/[_-]/g, ' ').trim();
                    let author = "Unknown Author";
                    let coverUrl = "";

                    if (cleanBase.includes(" - ")) {
                        const parts = cleanBase.split(" - ").map(p => p.trim());
                        if (parts.length >= 2) {
                            author = parts[0];
                            title = parts[1];
                        }
                    }

                    // Dynamic Author Heuristic based on existing DB authors & requested authors
                    try {
                        const dbAuthors = await prisma.book.findMany({
                            where: { author: { not: "Unknown Author" } },
                            select: { author: true },
                            distinct: ['author']
                        });
                        const reqAuthors = await prisma.bookRequest.findMany({
                            where: { author: { not: "Unknown Author" } },
                            select: { author: true },
                            distinct: ['author']
                        });

                        const allAuthorsSet = new Set<string>();
                        for (const row of dbAuthors) {
                            if (row.author) allAuthorsSet.add(row.author.trim());
                        }
                        for (const row of reqAuthors) {
                            if (row.author) allAuthorsSet.add(row.author.trim());
                        }

                        const titleLower = title.toLowerCase();
                        for (const auth of allAuthorsSet) {
                            const authLower = auth.toLowerCase();
                            if (titleLower.startsWith(authLower)) {
                                author = auth;
                                title = title.substring(auth.length).trim();
                                title = title.replace(/^[:\-\s]+/, "").trim();
                                break;
                            } else if (titleLower.endsWith(authLower)) {
                                author = auth;
                                title = title.substring(0, title.length - auth.length).trim();
                                title = title.replace(/[:\-\s]+$/, "").trim();
                                break;
                            }
                        }
                    } catch (e) {}

                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 5000);
                        const searchQuery = author !== "Unknown Author" ? `${title} ${author}` : title;
                        const cleanedQuery = cleanSearchQuery(searchQuery);
                        const olData = await fetchOpenLibraryWithFallback(cleanedQuery, controller.signal);
                        clearTimeout(timeoutId);

                        if (olData) {
                            const doc = olData?.docs?.[0];
                            if (doc) {
                                title = doc.title || title;
                                author = doc.author_name?.[0] || author;
                                if (doc.cover_i) {
                                    coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`;
                                }
                            }
                        }
                    } catch (olErr) { }

                    const newBook = await prisma.book.create({
                        data: {
                            title,
                            author,
                            coverUrl,
                            filePath: fullPath,
                            fileSize: stats.size,
                            fileType: ext.replace(".", ""),
                            libraryId: libraryId
                        }
                    });
                    await renameBookFileOnDisk(newBook.id);
                    matchedDbBookIds.add(newBook.id);
                } else {
                    let finalPath = fullPath;
                    if (existing.author === "Unknown Author" || !existing.coverUrl) {
                        const cleanBase = path.basename(fullPath, ext);
                        let title = existing.title;
                        let author = existing.author;
                        let coverUrl = existing.coverUrl || "";

                        let tempTitle = cleanBase.replace(/[_-]/g, ' ').trim();
                        let tempAuthor = "Unknown Author";

                        if (cleanBase.includes(" - ")) {
                            const parts = cleanBase.split(" - ").map(p => p.trim());
                            if (parts.length >= 2) {
                                tempAuthor = parts[0];
                                tempTitle = parts[1];
                            }
                        }

                        // Dynamic Author Heuristic for backfilling
                        try {
                            const dbAuthors = await prisma.book.findMany({
                                where: { author: { not: "Unknown Author" } },
                                select: { author: true },
                                distinct: ['author']
                            });
                            const reqAuthors = await prisma.bookRequest.findMany({
                                where: { author: { not: "Unknown Author" } },
                                select: { author: true },
                                distinct: ['author']
                            });

                            const allAuthorsSet = new Set<string>();
                            for (const row of dbAuthors) {
                                if (row.author) allAuthorsSet.add(row.author.trim());
                            }
                            for (const row of reqAuthors) {
                                if (row.author) allAuthorsSet.add(row.author.trim());
                            }

                            const titleLower = tempTitle.toLowerCase();
                            for (const auth of allAuthorsSet) {
                                const authLower = auth.toLowerCase();
                                if (titleLower.startsWith(authLower)) {
                                    tempAuthor = auth;
                                    tempTitle = tempTitle.substring(auth.length).trim();
                                    tempTitle = tempTitle.replace(/^[:\-\s]+/, "").trim();
                                    break;
                                } else if (titleLower.endsWith(authLower)) {
                                    tempAuthor = auth;
                                    tempTitle = tempTitle.substring(0, tempTitle.length - auth.length).trim();
                                    tempTitle = tempTitle.replace(/[:\-\s]+$/, "").trim();
                                    break;
                                }
                            }
                        } catch (e) {}

                        try {
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 5000);
                            const searchQuery = tempAuthor !== "Unknown Author" ? `${tempTitle} ${tempAuthor}` : tempTitle;
                            const cleanedQuery = cleanSearchQuery(searchQuery);
                            const olData = await fetchOpenLibraryWithFallback(cleanedQuery, controller.signal);
                            clearTimeout(timeoutId);

                            if (olData) {
                                const doc = olData?.docs?.[0];
                                if (doc) {
                                    title = doc.title || title;
                                    author = doc.author_name?.[0] || author;
                                    if (doc.cover_i) {
                                        coverUrl = `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`;
                                    }
                                } else {
                                    if (author === "Unknown Author" && tempAuthor !== "Unknown Author") {
                                        author = tempAuthor;
                                        title = tempTitle;
                                    }
                                }
                            } else {
                                if (author === "Unknown Author" && tempAuthor !== "Unknown Author") {
                                    author = tempAuthor;
                                    title = tempTitle;
                                }
                            }
                        } catch (olErr) { }

                        const updatedBook = await prisma.book.update({
                            where: { id: existing.id },
                            data: {
                                title,
                                author: existing.author === "Unknown Author" ? author : existing.author,
                                coverUrl: existing.coverUrl ? existing.coverUrl : coverUrl
                            }
                        });
                        await renameBookFileOnDisk(updatedBook.id);
                    } else {
                        await renameBookFileOnDisk(existing.id);
                    }
                    matchedDbBookIds.add(existing.id);
                }
            }
        }

        for (const dbBook of dbBooks) {
            if (!matchedDbBookIds.has(dbBook.id)) {
                await prisma.book.delete({
                    where: { id: dbBook.id }
                });
            }
        }

        try {
            revalidatePath("/library");
        } catch (e) {}
        return { success: true };
    } catch (e: any) {
        console.error("Failed to scan library:", e);
        throw new Error(e.message || "Failed to scan library folder");
    }
}

async function getTargetLibraryForUser(username: string) {
    try {
        const libraries = await prisma.library.findMany();
        if (libraries.length === 0) return null;
        
        // 1. Find library where this specific user is allowed
        const userLib = libraries.find(lib => {
            if (!lib.allowedUsers || lib.allowedUsers === "*") return false;
            const allowed = lib.allowedUsers.split(",").map(u => u.trim());
            return allowed.includes(username);
        });
        if (userLib) return userLib;
        
        // 2. Fallback: Find a library that allows everyone ("*")
        const publicLib = libraries.find(lib => lib.allowedUsers === "*");
        if (publicLib) return publicLib;
        
        // 3. Fallback: return the first library
        return libraries[0];
    } catch (e) {
        return null;
    }
}

function getDownloadCategoryForLibrary(libraryName: string): string {
    const nameLower = libraryName.toLowerCase();
    if (nameLower.includes("kids")) return "kids-books";
    if (nameLower.includes("wife")) return "wife-books";
    return "books";
}

export async function autoDownloadBookRequest(requestId: string, title: string, author: string) {
    console.log(`[AUTO-DOWNLOAD] Starting auto-download check for: ${title} by ${author}`);
    
    try {
        const req = await prisma.bookRequest.findUnique({
            where: { id: requestId }
        });
        const requester = req?.requestedBy || "";
        const targetLib = await getTargetLibraryForUser(requester);
        const category = targetLib ? getDownloadCategoryForLibrary(targetLib.name) : "books";

        const prowlarrApp = await prisma.mediaApp.findFirst({
            where: { type: "prowlarr" }
        });
        if (!prowlarrApp) {
            await prisma.bookRequest.update({
                where: { id: requestId },
                data: { status: "Failed - Prowlarr is not configured under settings" }
            });
            return;
        }

        const prowlarrUrl = cleanUrl(prowlarrApp.url);
        const prowlarrKey = decryptData(prowlarrApp.apiKey as string);
        const queryText = author ? `${title} ${author}` : title;

        const searchUrl = `${prowlarrUrl}/api/v1/search?query=${encodeURIComponent(queryText)}&categories=7000&categories=7010&categories=7020&apikey=${prowlarrKey}`;
        const res = await fetch(searchUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`Prowlarr error: status ${res.status}`);
        
        const results = await res.json();
        if (!results || results.length === 0) {
            await prisma.bookRequest.update({
                where: { id: requestId },
                data: { status: "Failed - No results found on indexers" }
            });
            return;
        }

        const epubReleases = results.filter((r: any) => {
            const hasEpubInTitle = r.title.toLowerCase().includes("epub") || 
                                   (r.downloadUrl && r.downloadUrl.toLowerCase().includes("epub"));
            const isValidSize = r.size > 100 * 1024 && r.size < 50 * 1024 * 1024;
            return hasEpubInTitle && isValidSize;
        });

        if (epubReleases.length === 0) {
            await prisma.bookRequest.update({
                where: { id: requestId },
                data: { status: "Failed - No EPUB releases found under 50MB" }
            });
            return;
        }

        epubReleases.sort((a: any, b: any) => {
            if (a.protocol === "usenet" && b.protocol !== "usenet") return -1;
            if (a.protocol !== "usenet" && b.protocol === "usenet") return 1;
            if (a.protocol === "torrent" && b.protocol === "torrent") {
                return (b.seeders || 0) - (a.seeders || 0);
            }
            return b.size - a.size;
        });

        const selectedRelease = epubReleases[0];
        console.log(`[AUTO-DOWNLOAD] Selected release for grab: ${selectedRelease.title}`);

        let downloadId = "";
        if (selectedRelease.protocol === "usenet") {
            const sabApp = await prisma.mediaApp.findFirst({ where: { type: "sabnzbd" } });
            if (!sabApp) throw new Error("SABnzbd downloader is not configured");
            const sabUrl = cleanUrl(sabApp.url);
            const sabKey = decryptData(sabApp.apiKey as string);
            
            const pushUrl = `${sabUrl}/api?mode=addurl&name=${encodeURIComponent(selectedRelease.downloadUrl)}&nzbname=${encodeURIComponent(selectedRelease.title)}&cat=${category}&output=json&apikey=${sabKey}`;
            const clientRes = await fetch(pushUrl, { cache: "no-store" });
            if (!clientRes.ok) throw new Error(`SABnzbd request failed: ${clientRes.status}`);
            const json = await clientRes.json();
            if (json.status === false) throw new Error(json.error || "SABnzbd refused to queue download");
            downloadId = json.nzo_ids?.[0] || "";
        } else {
            const qbitApp = await prisma.mediaApp.findFirst({
                where: { type: "qbittorrent" }
            }) || await prisma.mediaApp.findFirst({
                where: { type: { contains: "qbit" } }
            });
            if (!qbitApp) throw new Error("qBittorrent downloader is not configured");
            const qbitUrl = cleanUrl(qbitApp.url);
            const qbitKey = decryptData(qbitApp.apiKey as string);
            
            try {
                await fetch(`${qbitUrl}/api/v2/torrents/add`, {
                    method: "POST",
                    body: new URLSearchParams({ urls: selectedRelease.downloadUrl, category: category }),
                    headers: { "Content-Type": "application/x-www-form-urlencoded" }
                });
            } catch (err) {
                const loginRes = await fetch(`${qbitUrl}/api/v2/auth/login`, {
                    method: "POST",
                    body: new URLSearchParams({ username: "admin", password: qbitKey }),
                    headers: { "Content-Type": "application/x-www-form-urlencoded" }
                });
                const cookie = loginRes.headers.get("set-cookie");
                if (!cookie) throw new Error("qBittorrent authentication failed");
                await fetch(`${qbitUrl}/api/v2/torrents/add`, {
                    method: "POST",
                    body: new URLSearchParams({ urls: selectedRelease.downloadUrl, category: category }),
                    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cookie": cookie }
                });
            }
        }

        await prisma.bookRequest.update({
            where: { id: requestId },
            data: { status: "Downloading" }
        });

        // Launch background downloader polling and failover task
        monitorAndRetryDownload(requestId, epubReleases, 0, downloadId).catch(err => {
            console.error(`[AUTO-DOWNLOAD-MONITOR] Background thread crashed:`, err);
        });
        
    } catch (e: any) {
        console.error(`[AUTO-DOWNLOAD] Error:`, e);
        await prisma.bookRequest.update({
            where: { id: requestId },
            data: { status: `Failed - ${e.message || "Unknown error during download client push"}` }
        });
    }
}

export async function searchProwlarrIndexers(query: string) {
    await verifyAdmin();
    
    const prowlarrApp = await prisma.mediaApp.findFirst({
        where: { type: "prowlarr" }
    });
    
    if (!prowlarrApp) {
        throw new Error("Prowlarr is not configured in Portalarr Settings. Please add it first under Settings.");
    }
    
    const prowlarrUrl = cleanUrl(prowlarrApp.url);
    const prowlarrKey = decryptData(prowlarrApp.apiKey as string);
    
    try {
        const searchUrl = `${prowlarrUrl}/api/v1/search?query=${encodeURIComponent(query)}&categories=7000&categories=7010&categories=7020&apikey=${prowlarrKey}`;
        const res = await fetch(searchUrl, { cache: "no-store" });
        if (!res.ok) {
            throw new Error(`Prowlarr returned status ${res.status}`);
        }
        
        const results = await res.json();
        
        return (results || []).map((r: any) => ({
            title: r.title,
            size: r.size,
            downloadUrl: r.downloadUrl,
            indexer: r.indexer,
            protocol: r.protocol,
            infoUrl: r.infoUrl
        }));
    } catch (e: any) {
        console.error("Prowlarr search failed:", e);
        throw new Error(e.message || "Failed to query Prowlarr API");
    }
}

export async function sendReleaseToDownloadClient(requestId: string, downloadUrl: string, title: string, protocol: string) {
    await verifyAdmin();
    
    const req = await prisma.bookRequest.findUnique({
        where: { id: requestId }
    });
    const requester = req?.requestedBy || "";
    const targetLib = await getTargetLibraryForUser(requester);
    const category = targetLib ? getDownloadCategoryForLibrary(targetLib.name) : "books";
    
    if (protocol === "usenet") {
        const sabApp = await prisma.mediaApp.findFirst({
            where: { type: "sabnzbd" }
        });
        
        if (!sabApp) {
            throw new Error("No SABnzbd download client configured in Portalarr Settings.");
        }
        
        const sabUrl = cleanUrl(sabApp.url);
        const sabKey = decryptData(sabApp.apiKey as string);
        
        const pushUrl = `${sabUrl}/api?mode=addurl&name=${encodeURIComponent(downloadUrl)}&nzbname=${encodeURIComponent(title)}&cat=${category}&output=json&apikey=${sabKey}`;
        const res = await fetch(pushUrl, { cache: "no-store" });
        
        if (!res.ok) {
            throw new Error(`SABnzbd returned status ${res.status}`);
        }
        const json = await res.json();
        if (json.status === false) {
            throw new Error(json.error || "SABnzbd failed to accept the NZB file");
        }
    } else {
        const qbitApp = await prisma.mediaApp.findFirst({
            where: { type: "qbittorrent" }
        }) || await prisma.mediaApp.findFirst({
            where: { type: { contains: "qbit" } }
        });
        
        if (!qbitApp) {
            throw new Error("No qBittorrent client configured in Portalarr Settings.");
        }
        
        const qbitUrl = cleanUrl(qbitApp.url);
        const qbitKey = decryptData(qbitApp.apiKey as string);
        
        try {
            const body = new URLSearchParams();
            body.append("urls", downloadUrl);
            body.append("category", category);
            
            const qbitRes = await fetch(`${qbitUrl}/api/v2/torrents/add`, {
                method: "POST",
                body,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            });
            if (!qbitRes.ok) {
                throw new Error(`qBittorrent returned status ${qbitRes.status}`);
            }
        } catch (err: any) {
            console.warn("qBit direct upload failed. Attempting login first.", err);
            const loginRes = await fetch(`${qbitUrl}/api/v2/auth/login`, {
                method: "POST",
                body: new URLSearchParams({ username: "admin", password: qbitKey }),
                headers: { "Content-Type": "application/x-www-form-urlencoded" }
            });
            const cookie = loginRes.headers.get("set-cookie");
            if (!cookie) throw new Error("Failed to authenticate with qBittorrent");
            
            const addRes = await fetch(`${qbitUrl}/api/v2/torrents/add`, {
                method: "POST",
                body: new URLSearchParams({ urls: downloadUrl, category: category }),
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Cookie": cookie
                }
            });
            if (!addRes.ok) throw new Error(`qBittorrent add failed with ${addRes.status}`);
        }
    }
    
    await prisma.bookRequest.update({
        where: { id: requestId },
        data: { status: "Approved" }
    });
    
    revalidatePath("/library");
    return { success: true };
}

// ============================================================================
// --- DOWNLOAD MONITORING & AUTO RETRY AUTOMATION HANDLERS ---
// ============================================================================

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function checkSabnzbdStatus(sabUrl: string, sabKey: string, downloadId: string): Promise<"downloading" | "completed" | "failed" | "unknown"> {
    try {
        const qRes = await fetch(`${sabUrl}/api?mode=queue&output=json&apikey=${sabKey}`);
        if (qRes.ok) {
            const qData = await qRes.json();
            const slots = qData.queue?.slots || [];
            const slot = slots.find((s: any) => s.nzo_id === downloadId);
            if (slot) {
                if (slot.status?.toLowerCase() === "failed") return "failed";
                return "downloading";
            }
        }

        const hRes = await fetch(`${sabUrl}/api?mode=history&output=json&apikey=${sabKey}`);
        if (hRes.ok) {
            const hData = await hRes.json();
            const slots = hData.history?.slots || [];
            const slot = slots.find((s: any) => s.nzo_id === downloadId);
            if (slot) {
                if (slot.status?.toLowerCase() === "failed") return "failed";
                if (slot.status?.toLowerCase() === "completed") return "completed";
            }
        }
        return "unknown";
    } catch (e) {
        console.error("Error checking SABnzbd status:", e);
        return "unknown";
    }
}

async function checkQbitStatus(qbitUrl: string, releaseTitle: string): Promise<{ status: "downloading" | "completed" | "failed" | "unknown", hash?: string }> {
    try {
        const res = await fetch(`${qbitUrl}/api/v2/torrents/info?category=books`);
        if (!res.ok) return { status: "unknown" };
        const torrents = await res.json();
        
        const torrent = torrents.find((t: any) => 
            t.name.toLowerCase().includes(releaseTitle.toLowerCase()) ||
            releaseTitle.toLowerCase().includes(t.name.toLowerCase())
        );

        if (torrent) {
            const hash = torrent.hash;
            const state = torrent.state?.toLowerCase();
            
            if (state === "error" || state === "missingfiles") {
                return { status: "failed", hash };
            }
            if (state === "pausedup" || state === "seeding" || state.includes("complete") || torrent.progress === 1) {
                return { status: "completed", hash };
            }
            if (state === "stalleddl" && torrent.num_seeds === 0) {
                const ageInSeconds = Math.floor(Date.now() / 1000) - torrent.added_on;
                if (ageInSeconds > 300 && torrent.progress === 0) {
                    return { status: "failed", hash };
                }
            }
            return { status: "downloading", hash };
        }
        return { status: "unknown" };
    } catch (e) {
        console.error("Error checking qBit status:", e);
        return { status: "unknown" };
    }
}

async function deleteDownload(protocol: string, downloadId: string, title: string) {
    try {
        if (protocol === "usenet") {
            const sabApp = await prisma.mediaApp.findFirst({ where: { type: "sabnzbd" } });
            if (sabApp) {
                const sabUrl = cleanUrl(sabApp.url);
                const sabKey = decryptData(sabApp.apiKey as string);
                await fetch(`${sabUrl}/api?mode=queue&name=delete&value=${downloadId}&apikey=${sabKey}`);
                await fetch(`${sabUrl}/api?mode=history&name=delete&value=${downloadId}&apikey=${sabKey}`);
            }
        } else {
            const qbitApp = await prisma.mediaApp.findFirst({
                where: { type: "qbittorrent" }
            }) || await prisma.mediaApp.findFirst({
                where: { type: { contains: "qbit" } }
            });
            if (qbitApp) {
                const qbitUrl = cleanUrl(qbitApp.url);
                const qbitKey = decryptData(qbitApp.apiKey as string);
                
                const { hash } = await checkQbitStatus(qbitUrl, title);
                if (hash) {
                    let cookieHeader = "";
                    try {
                        const loginRes = await fetch(`${qbitUrl}/api/v2/auth/login`, {
                            method: "POST",
                            body: new URLSearchParams({ username: "admin", password: qbitKey }),
                            headers: { "Content-Type": "application/x-www-form-urlencoded" }
                        });
                        const cookie = loginRes.headers.get("set-cookie");
                        if (cookie) cookieHeader = cookie;
                    } catch (e) {}

                    await fetch(`${qbitUrl}/api/v2/torrents/delete`, {
                        method: "POST",
                        body: new URLSearchParams({ hashes: hash, deleteFiles: "true" }),
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded",
                            ...(cookieHeader ? { "Cookie": cookieHeader } : {})
                        }
                    });
                }
            }
        }
    } catch (e) {
        console.error("Failed to delete failed download:", e);
    }
}

function findDownloadedFile(dir: string, bookTitle: string): string | null {
    console.log(`[DOWNLOAD-FINDER] Scanning directory: ${dir} for book: "${bookTitle}"`);
    if (!fs.existsSync(dir)) {
        console.log(`[DOWNLOAD-FINDER] Directory does not exist: ${dir}`);
        return null;
    }
    
    const cleanBookTitle = bookTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
    const titleWords = bookTitle.toLowerCase().split(/[^a-z0-9]/).filter(w => w.length > 2);
    
    try {
        const files = fs.readdirSync(dir);
        console.log(`[DOWNLOAD-FINDER] Found ${files.length} items in ${dir}`);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                const found = findDownloadedFile(fullPath, bookTitle);
                if (found) return found;
            } else {
                const ext = path.extname(file).toLowerCase();
                if ([".epub", ".pdf", ".mobi", ".cbz"].includes(ext)) {
                    const cleanFileName = file.toLowerCase().replace(/[^a-z0-9]/g, "");
                    console.log(`[DOWNLOAD-FINDER] Inspecting file: ${file} (clean: ${cleanFileName})`);
                    
                    if (cleanFileName.includes(cleanBookTitle) || cleanBookTitle.includes(cleanFileName.replace(/(epub|pdf|mobi|cbz)$/, ""))) {
                        console.log(`[DOWNLOAD-FINDER] MATCH FOUND: ${fullPath} (direct title match)`);
                        return fullPath;
                    }
                    
                    let matchCount = 0;
                    for (const word of titleWords) {
                        if (file.toLowerCase().includes(word)) {
                            matchCount++;
                        }
                    }
                    console.log(`[DOWNLOAD-FINDER] Word match count: ${matchCount}/${titleWords.length} (needed at least ${Math.min(2, titleWords.length)})`);
                    if (titleWords.length > 0 && matchCount >= Math.min(2, titleWords.length)) {
                        console.log(`[DOWNLOAD-FINDER] MATCH FOUND: ${fullPath} (fuzzy word match)`);
                        return fullPath;
                    }
                }
            }
        }
    } catch (e: any) {
        console.error(`[BACKGROUND-DOWNLOAD-FINDER] Error reading directory ${dir}:`, e.message);
    }
    return null;
}

export async function monitorAndRetryDownload(
    requestId: string,
    releases: any[],
    attemptIndex: number,
    downloadId: string
) {
    const maxPolls = 20; 
    const pollInterval = 30000; 
    const release = releases[attemptIndex];
    
    console.log(`[AUTO-DOWNLOAD-MONITOR] Monitoring release attempt ${attemptIndex + 1}/${releases.length}: ${release.title}`);
    
    for (let poll = 0; poll < maxPolls; poll++) {
        await delay(pollInterval);
        
        const currentReq = await prisma.bookRequest.findUnique({
            where: { id: requestId }
        });
        if (!currentReq || currentReq.status === "Downloaded" || currentReq.status === "Rejected") {
            console.log(`[AUTO-DOWNLOAD-MONITOR] Request ${requestId} was completed or cancelled. Stopping monitor.`);
            return;
        }

        let downloadStatus: "downloading" | "completed" | "failed" | "unknown" = "unknown";
        
        if (release.protocol === "usenet") {
            const sabApp = await prisma.mediaApp.findFirst({ where: { type: "sabnzbd" } });
            if (sabApp) {
                const sabUrl = cleanUrl(sabApp.url);
                const sabKey = decryptData(sabApp.apiKey as string);
                downloadStatus = await checkSabnzbdStatus(sabUrl, sabKey, downloadId);
            }
        } else {
            const qbitApp = await prisma.mediaApp.findFirst({
                where: { type: "qbittorrent" }
            }) || await prisma.mediaApp.findFirst({
                where: { type: { contains: "qbit" } }
            });
            if (qbitApp) {
                const qbitUrl = cleanUrl(qbitApp.url);
                const statusInfo = await checkQbitStatus(qbitUrl, release.title);
                downloadStatus = statusInfo.status;
            }
        }

        console.log(`[AUTO-DOWNLOAD-MONITOR] Attempt ${attemptIndex + 1} Poll ${poll + 1}/${maxPolls} status: ${downloadStatus}`);

        if (downloadStatus === "completed") {
            console.log(`[AUTO-DOWNLOAD-MONITOR] Download completed successfully for: ${release.title}`);
            const req = await prisma.bookRequest.update({
                where: { id: requestId },
                data: { status: "Downloaded" }
            });
            
            await delay(5000);
            
            let targetLib: any = null;
            try {
                targetLib = await getTargetLibraryForUser(req.requestedBy);
                if (targetLib) {
                    const settings = await prisma.settings.findFirst();
                    const configuredPath = settings?.downloadsPath || "/downloads";
                    const searchPaths = [
                        configuredPath,
                        process.env.DOWNLOADS_DIR || "/downloads",
                        "/downloads",
                        "/app/downloads",
                        "./downloads"
                    ];
                    console.log(`[AUTO-DOWNLOAD-MONITOR] Searching for completed download in paths:`, searchPaths);
                    let foundFilePath: string | null = null;
                    for (const p of searchPaths) {
                        if (fs.existsSync(p)) {
                            foundFilePath = findDownloadedFile(p, req.title);
                            if (foundFilePath) break;
                        }
                    }

                    if (foundFilePath) {
                        const destPath = path.join(targetLib.path, path.basename(foundFilePath));
                        console.log(`[AUTO-DOWNLOAD-MONITOR] Moving downloaded file from ${foundFilePath} to ${destPath}`);
                        
                        if (!fs.existsSync(targetLib.path)) {
                            fs.mkdirSync(targetLib.path, { recursive: true });
                        }
                        
                        fs.copyFileSync(foundFilePath, destPath);
                        try {
                            try {
                                console.log(`[AUTO-DOWNLOAD-MONITOR] Requesting client to delete completed download: ${release.title}`);
                                await deleteDownload(release.protocol, downloadId, release.title);
                            } catch (delErr: any) {
                                console.error(`[AUTO-DOWNLOAD-MONITOR] Failed to delete completed download from client:`, delErr.message);
                            }

                            try {
                                fs.chmodSync(foundFilePath, 0o666);
                            } catch (e) {}

                            if (fs.existsSync(foundFilePath)) {
                                fs.unlinkSync(foundFilePath);
                                console.log(`[AUTO-DOWNLOAD-MONITOR] Successfully deleted original file from downloads.`);
                            }
                            
                            const parentDir = path.dirname(foundFilePath);
                            if (parentDir !== configuredPath && parentDir !== "/downloads" && parentDir !== "./downloads" && parentDir !== "/app/downloads") {
                                if (fs.existsSync(parentDir)) {
                                    const remainingFiles = fs.readdirSync(parentDir);
                                    if (remainingFiles.length === 0) {
                                        try {
                                            fs.chmodSync(parentDir, 0o777);
                                        } catch (e) {}
                                        fs.rmdirSync(parentDir);
                                        console.log(`[AUTO-DOWNLOAD-MONITOR] Cleaned up empty parent directory: ${parentDir}`);
                                    }
                                }
                            }
                        } catch (unlinkErr: any) {
                            console.warn(`[AUTO-DOWNLOAD-MONITOR] Copied file successfully but failed to delete the source file/folder from downloads directory:`, unlinkErr.message);
                            console.warn(`[AUTO-DOWNLOAD-MONITOR] TIP: Ensure your Docker volume mounts and PUID/PGID permissions allow the app to write/delete inside the downloads folder.`);
                        }
                        console.log(`[AUTO-DOWNLOAD-MONITOR] Successfully moved file to library path.`);
                    } else {
                        console.warn(`[AUTO-DOWNLOAD-MONITOR] Could not find completed download file for "${req.title}" in download directories.`);
                    }
                }
            } catch (moveErr: any) {
                console.error(`[AUTO-DOWNLOAD-MONITOR] Failed to move downloaded file to library:`, moveErr);
            }
            
            if (targetLib) {
                try {
                    await scanLibraryInternal(targetLib.id);
                } catch (err) {
                    console.error(`[AUTO-DOWNLOAD-MONITOR] Library auto-scan failed for "${targetLib.name}":`, err);
                }
            } else {
                const libraries = await prisma.library.findMany();
                for (const lib of libraries) {
                    try {
                        await scanLibraryInternal(lib.id);
                    } catch (err) {
                        console.error(`[AUTO-DOWNLOAD-MONITOR] Library auto-scan failed for "${lib.name}":`, err);
                    }
                }
            }
            
            const allBooks = await prisma.book.findMany();
            const reqTitleClean = req.title.toLowerCase().replace(/[^a-z0-9]/g, "");
            const matchedBook = allBooks.find(b => {
                const bTitleClean = b.title.toLowerCase().replace(/[^a-z0-9]/g, "");
                const bAuthorClean = b.author ? b.author.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
                
                // 1. Direct title match
                if (bTitleClean.includes(reqTitleClean) || reqTitleClean.includes(bTitleClean)) return true;
                
                // 2. Swapped field fallback (if title/author parsed in reverse in the DB)
                if (bAuthorClean.includes(reqTitleClean) || reqTitleClean.includes(bAuthorClean)) return true;
                
                // 3. File path match
                const pathClean = b.filePath.toLowerCase().replace(/[^a-z0-9]/g, "");
                if (pathClean.includes(reqTitleClean)) return true;
                
                return false;
            });
            
            if (matchedBook) {
                console.log(`[AUTO-DOWNLOAD-MONITOR] Found matching book "${matchedBook.title}". Automatically mailing to ${req.requestedBy}...`);
                await sendBookToUserKindleInternal(matchedBook.id, req.requestedBy);
            } else {
                console.warn(`[AUTO-DOWNLOAD-MONITOR] Could not find registered book in library matching request title: "${req.title}"`);
            }
            
            return;
        }

        if (downloadStatus === "failed") {
            console.log(`[AUTO-DOWNLOAD-MONITOR] Download failed for release: ${release.title}`);
            break; 
        }
    }

    await deleteDownload(release.protocol, downloadId, release.title);

    if (attemptIndex + 1 < releases.length) {
        const nextIndex = attemptIndex + 1;
        const nextRelease = releases[nextIndex];
        console.log(`[AUTO-DOWNLOAD-MONITOR] Attempting backup release ${nextIndex + 1}/${releases.length}: ${nextRelease.title}`);
        
        try {
            let nextDownloadId = "";
            if (nextRelease.protocol === "usenet") {
                const sabApp = await prisma.mediaApp.findFirst({ where: { type: "sabnzbd" } });
                if (!sabApp) throw new Error("SABnzbd not configured");
                const sabUrl = cleanUrl(sabApp.url);
                const sabKey = decryptData(sabApp.apiKey as string);
                
                const pushUrl = `${sabUrl}/api?mode=addurl&name=${encodeURIComponent(nextRelease.downloadUrl)}&nzbname=${encodeURIComponent(nextRelease.title)}&cat=books&output=json&apikey=${sabKey}`;
                const res = await fetch(pushUrl, { cache: "no-store" });
                if (!res.ok) throw new Error(`SABnzbd returned status ${res.status}`);
                const json = await res.json();
                if (json.status === false) throw new Error(json.error || "SABnzbd queue failure");
                nextDownloadId = json.nzo_ids?.[0] || "";
            } else {
                const qbitApp = await prisma.mediaApp.findFirst({
                    where: { type: "qbittorrent" }
                }) || await prisma.mediaApp.findFirst({
                    where: { type: { contains: "qbit" } }
                });
                if (!qbitApp) throw new Error("qBittorrent not configured");
                const qbitUrl = cleanUrl(qbitApp.url);
                const qbitKey = decryptData(qbitApp.apiKey as string);
                
                try {
                    await fetch(`${qbitUrl}/api/v2/torrents/add`, {
                        method: "POST",
                        body: new URLSearchParams({ urls: nextRelease.downloadUrl, category: "books" }),
                        headers: { "Content-Type": "application/x-www-form-urlencoded" }
                    });
                } catch (err) {
                    const loginRes = await fetch(`${qbitUrl}/api/v2/auth/login`, {
                        method: "POST",
                        body: new URLSearchParams({ username: "admin", password: qbitKey }),
                        headers: { "Content-Type": "application/x-www-form-urlencoded" }
                    });
                    const cookie = loginRes.headers.get("set-cookie");
                    if (!cookie) throw new Error("qBit login failure");
                    await fetch(`${qbitUrl}/api/v2/torrents/add`, {
                        method: "POST",
                        body: new URLSearchParams({ urls: nextRelease.downloadUrl, category: "books" }),
                        headers: { "Content-Type": "application/x-www-form-urlencoded", "Cookie": cookie }
                    });
                }
            }

            await prisma.bookRequest.update({
                where: { id: requestId },
                data: { status: `Downloading (Backup attempt ${nextIndex + 1})` }
            });
            
            monitorAndRetryDownload(requestId, releases, nextIndex, nextDownloadId).catch(err => {
                console.error(`[AUTO-DOWNLOAD-MONITOR] Recursive monitor failed:`, err);
            });
        } catch (err: any) {
            console.error(`[AUTO-DOWNLOAD-MONITOR] Failed to launch backup release:`, err);
            monitorAndRetryDownload(requestId, releases, nextIndex, "").catch(err => {
                console.error(`[AUTO-DOWNLOAD-MONITOR] Failed to proceed:`, err);
            });
        }
    } else {
        console.log(`[AUTO-DOWNLOAD-MONITOR] All releases failed.`);
        await prisma.bookRequest.update({
            where: { id: requestId },
            data: { status: "Failed - All release attempts failed" }
        });
    }
}

export async function saveUserKindleSettings(formData: FormData) {
    const session = await verifyUser();
    const email = formData.get("email") as string;
    const kindleEmail = formData.get("kindleEmail") as string;

    await prisma.user.update({
        where: { username: session.username as string },
        data: {
            email: email || undefined,
            kindleEmail: kindleEmail || ""
        }
    });
    revalidatePath("/library");
}

export async function sendBookToKindle(bookId: string) {
    try {
        const session = await verifyUser();
        const user = await prisma.user.findUnique({
            where: { username: session.username as string }
        });
        
        if (!user) return { success: false, error: "User not found" };
        if (!user.kindleEmail) {
            return { success: false, error: "Please configure your Send-to-Kindle email address in your library settings first." };
        }

        const book = await prisma.book.findUnique({
            where: { id: bookId }
        });
        if (!book) return { success: false, error: "Book not found" };
        if (!fs.existsSync(book.filePath)) {
            return { success: false, error: "Ebook file not found on disk. Try scanning the library again." };
        }

        const settings = await prisma.settings.findFirst({ where: { id: "global" } }) || {} as any;
        if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
            return { success: false, error: "SMTP is not configured on this server. Please contact your administrator to configure SMTP." };
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

        const ext = path.extname(book.filePath).toLowerCase();
        const cleanAttachmentName = path.basename(book.filePath, ext)
            .replace(/[^a-zA-Z0-9]/g, "_")
            .replace(/__+/g, "_")
            .toLowerCase() + ext;

        const mailOptions = {
            from: senderEmail,
            to: user.kindleEmail,
            subject: `Deliver Book: ${book.title}`,
            text: `Delivering your ebook "${book.title}" to your Kindle device.`,
            attachments: [
                {
                    filename: cleanAttachmentName,
                    path: book.filePath
                }
            ]
        };

        try {
            await transporter.sendMail(mailOptions);
            return { success: true };
        } catch (e: any) {
            console.error("Kindle SMTP send failed:", e);
            
            if (user.email) {
                try {
                    const failMailOptions = {
                        from: senderEmail,
                        to: user.email,
                        subject: `❌ Failed to Deliver Ebook to Kindle: ${book.title}`,
                        html: `
                            <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                                <h2 style="color: #dc2626; margin-top: 0;">Kindle Delivery Failed</h2>
                                <p>We attempted to send <strong>${book.title}</strong> to your Kindle email (<code>${user.kindleEmail}</code>), but the SMTP server rejected the delivery.</p>
                                
                                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                                
                                <h3 style="color: #0f172a; margin-bottom: 8px;">Troubleshooting Steps:</h3>
                                <ol style="line-height: 1.6; padding-left: 20px;">
                                    <li>
                                        <strong>Approve our Sender Address:</strong> Amazon will silently reject or bounce emails from addresses they don't recognize. 
                                        Make sure you have added our server sender address to your approved list:
                                        <br />
                                        <code style="background-color: #f1f5f9; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 14px; display: inline-block; margin-top: 4px; color: #0f172a;">${senderEmail}</code>
                                    </li>
                                    <li style="margin-top: 10px;">
                                        <strong>How to authorize:</strong>
                                        <ul style="padding-left: 20px; margin-top: 4px;">
                                            <li>Log into your Amazon Account.</li>
                                            <li>Go to <em>Manage Your Content and Devices</em> &rarr; <em>Preferences</em>.</li>
                                            <li>Scroll down to <em>Approved Personal Document E-mail List</em> and add the address above.</li>
                                        </ul>
                                    </li>
                                    <li style="margin-top: 10px;">
                                        <strong>Technical error detail:</strong>
                                        <pre style="background: #f1f5f9; padding: 10px; border-radius: 4px; font-size: 12px; overflow-x: auto; color: #ef4444; border: 1px solid #fecaca; margin-top: 4px;">${e.message || "Unknown SMTP delivery error"}</pre>
                                    </li>
                                </ol>
                            </div>
                        `
                    };
                    await transporter.sendMail(failMailOptions);
                } catch (err) {
                    console.error("Failed to send Kindle failure email to personal address:", err);
                }
            }

            return { success: false, error: `Kindle delivery failed: ${e.message || "Unknown SMTP error"}` };
        }
    } catch (e: any) {
        console.error("Failed to send book to Kindle:", e);
        return { success: false, error: e.message || "An unexpected error occurred." };
    }
}

export async function sendBookToUserKindleInternal(bookId: string, username: string) {
    const user = await prisma.user.findFirst({
        where: { username }
    });
    
    if (!user) {
        console.error(`[AUTO-KINDLE] User not found: ${username}`);
        return;
    }
    if (!user.kindleEmail) {
        console.warn(`[AUTO-KINDLE] User ${username} has no Kindle email configured.`);
        return;
    }

    const book = await prisma.book.findUnique({
        where: { id: bookId }
    });
    if (!book) {
        console.error(`[AUTO-KINDLE] Book not found: ${bookId}`);
        return;
    }
    if (!fs.existsSync(book.filePath)) {
        console.error(`[AUTO-KINDLE] Book file not found on disk: ${book.filePath}`);
        return;
    }

    const settings = await prisma.settings.findFirst({ where: { id: "global" } }) || {} as any;
    if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
        console.error("[AUTO-KINDLE] SMTP is not configured on this server.");
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

    const ext = path.extname(book.filePath).toLowerCase();
    const cleanAttachmentName = path.basename(book.filePath, ext)
        .replace(/[^a-zA-Z0-9]/g, "_")
        .replace(/__+/g, "_")
        .toLowerCase() + ext;

    const mailOptions = {
        from: senderEmail,
        to: user.kindleEmail,
        subject: `Deliver Book: ${book.title}`,
        text: `Delivering your ebook "${book.title}" to your Kindle device.`,
        attachments: [
            {
                filename: cleanAttachmentName,
                path: book.filePath
            }
        ]
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[AUTO-KINDLE] Ebook "${book.title}" successfully emailed to ${user.kindleEmail} for ${username}`);
        return { success: true };
    } catch (e: any) {
        console.error("[AUTO-KINDLE] Kindle SMTP send failed:", e);
        
        if (user.email) {
            try {
                const failMailOptions = {
                    from: senderEmail,
                    to: user.email,
                    subject: `❌ Failed to Deliver Ebook to Kindle: ${book.title}`,
                    html: `
                        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                            <h2 style="color: #dc2626; margin-top: 0;">Kindle Delivery Failed</h2>
                            <p>We attempted to automatically deliver your requested book <strong>"${book.title}"</strong> to your Kindle, but the email transmission failed.</p>
                            
                            <div style="background-color: #f8fafc; border-left: 4px solid #ef4444; padding: 12px; margin: 18px 0; font-family: monospace; font-size: 13px;">
                                <strong>Error Details:</strong><br/>
                                ${e.message || "Unknown SMTP Error"}
                            </div>
                            
                            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                            
                            <h3 style="margin-bottom: 8px;">Troubleshooting Checklist:</h3>
                            <ol style="padding-left: 20px; line-height: 1.6;">
                                <li>
                                    <strong>Add Approved Sender:</strong> Ensure the portal's public sender address <strong><code>${senderEmail}</code></strong> is added to your approved list in your Amazon account:
                                    <br/>
                                    <span style="color: #64748b; font-size: 12px;">Amazon.com &rarr; Preferences &rarr; Personal Document Settings &rarr; Approved Personal Document E-mail List</span>
                                </li>
                                <li><strong>Check File Size:</strong> Kindle has a 50MB email file size limit. Your book size is <code>${(fs.statSync(book.filePath).size / (1024 * 1024)).toFixed(1)} MB</code>.</li>
                                <li><strong>Verify Kindle Email:</strong> Double-check that your Kindle address (currently configured as <code>${user.kindleEmail}</code>) is exactly correct in your library settings.</li>
                            </ol>
                        </div>
                    `
                };
                await transporter.sendMail(failMailOptions);
            } catch (err) {
                console.error("[AUTO-KINDLE] Failed to send troubleshooting email:", err);
            }
        }
    }
}


export async function getPublicSmtpFromEmail() {
    const settings = await prisma.settings.findFirst({ where: { id: "global" } });
    if (!settings) return "";
    return settings.smtpFrom || settings.smtpUser || "";
}

export async function checkUserLibraryAccess(): Promise<boolean> {
    try {
        const session = await verifyUser();
        if (session.role === "ADMIN") return true;

        const username = session.username as string;
        
        const libs = await prisma.library.findMany({
            where: {
                OR: [
                    { allowedUsers: "*" },
                    { allowedUsers: { contains: username } }
                ]
            }
        });

        const filtered = libs.filter(lib => {
            if (lib.allowedUsers === "*") return true;
            const users = lib.allowedUsers.split(",").map(u => u.trim());
            return users.includes(username);
        });

        return filtered.length > 0;
    } catch (e) {
        return false;
    }
}

export async function submitLibraryAccessRequest(email: string, kindleEmail: string) {
    try {
        const session = await verifyUser();
        
        const user = await prisma.user.update({
            where: { username: session.username as string },
            data: {
                email: email || undefined,
                kindleEmail: kindleEmail || ""
            }
        });

        const settings = await prisma.settings.findFirst({ where: { id: "global" } }) || {} as any;
        if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
            return { success: false, error: "SMTP is not configured on the server. Please contact your administrator." };
        }

        const admins = await prisma.user.findMany({
            where: { role: "ADMIN" }
        });

        const adminEmails = admins
            .map(admin => admin.email)
            .filter(email => !!email);

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
            subject: `🚨 Library Access Request from ${user.username}`,
            html: `
                <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                    <h2 style="color: #0f172a; margin-top: 0;">Library Access Request</h2>
                    <p>The user <strong>${user.username}</strong> has requested access to the Book Library.</p>
                    
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                    
                    <h3 style="color: #0f172a; margin-bottom: 8px;">User Details:</h3>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                        <tr>
                            <td style="padding: 6px 0; font-weight: bold; width: 150px;">Username:</td>
                            <td style="padding: 6px 0;">${user.username}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-weight: bold;">Personal Email:</td>
                            <td style="padding: 6px 0;"><code>${user.email || "Not Provided"}</code></td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-weight: bold;">Send-to-Kindle:</td>
                            <td style="padding: 6px 0;"><code>${user.kindleEmail || "Not Provided"}</code></td>
                        </tr>
                    </table>

                    <h3 style="color: #0f172a; margin-bottom: 8px;">How to Approve:</h3>
                    <p style="line-height: 1.6;">
                        To grant access to this user, log into Portalarr and open the Book Library Manage tab. 
                        Edit the library you want them to access (e.g. <em>Wife's Bookshelf</em> or <em>Kids' Bookshelf</em>), 
                        and add their username <strong><code>${user.username}</code></strong> to the <strong>Allowed Users</strong> list.
                    </p>
                </div>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            return { success: true };
        } catch (e: any) {
            console.error("Failed to email admin about access request:", e);
            return { success: false, error: `Failed to send request: ${e.message || "Unknown mail error"}` };
        }
    } catch (e: any) {
        console.error("Failed library access request submission:", e);
        return { success: false, error: e.message || "An unexpected error occurred." };
    }
}

export async function searchOpenLibrary(query: string) {
    if (!query || query.trim().length < 2) return [];
    try {
        const response = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=8`, {
            headers: { "Accept": "application/json" },
            next: { revalidate: 3600 }
        });
        if (!response.ok) throw new Error("Open Library search failed");
        
        const data = await response.json();
        const docs = data.docs || [];
        
        return docs.map((doc: any) => {
            const author = doc.author_name && doc.author_name.length > 0 ? doc.author_name[0] : "Unknown Author";
            const coverUrl = doc.cover_i 
                ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` 
                : "";
            return {
                title: doc.title,
                author,
                coverUrl,
                year: doc.first_publish_year || "Unknown Year"
            };
        });
    } catch (e) {
        console.error("Open Library API Error:", e);
        return [];
    }
}

export async function getSeriesBooksList(seriesTitle: string, author: string = "") {
    try {
        const query = author ? `${seriesTitle} ${author}` : seriesTitle;
        const response = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=45&fields=key,title,author_name,cover_i,first_publish_year`, {
            headers: { "Accept": "application/json" },
            next: { revalidate: 3600 }
        });
        if (!response.ok) throw new Error("Series query failed");
        
        const data = await response.json();
        const docs = data.docs || [];
        
        const uniqueBooks: any[] = [];
        const seenTitles = new Set<string>();
        
        for (const doc of docs) {
            const normalizedTitle = doc.title.toLowerCase().replace(/[^a-z0-9]/g, "");
            const titleLower = doc.title.toLowerCase();
            const isCompilation = titleLower.includes("box set") || 
                                  titleLower.includes("boxed set") || 
                                  titleLower.includes("collection") || 
                                  titleLower.includes("series 1-") || 
                                  titleLower.includes("pack") || 
                                  titleLower.includes("omnibus") || 
                                  titleLower.includes("bundle") ||
                                  titleLower.includes("boxedset");
                                  
            if (isCompilation) continue;
            
            if (author && doc.author_name) {
                const authorLower = author.toLowerCase();
                const matchesAuthor = doc.author_name.some((name: string) => 
                    name.toLowerCase().includes(authorLower)
                );
                if (!matchesAuthor) continue;
            }
            
            if (!seenTitles.has(normalizedTitle)) {
                seenTitles.add(normalizedTitle);
                
                const authorName = doc.author_name && doc.author_name.length > 0 
                    ? doc.author_name[0] 
                    : author || "Unknown Author";
                    
                const coverUrl = doc.cover_i 
                    ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` 
                    : "";
                    
                uniqueBooks.push({
                    title: doc.title,
                    author: authorName,
                    coverUrl,
                    publishYear: doc.first_publish_year ? String(doc.first_publish_year) : ""
                });
            }
        }
        
        return uniqueBooks;
    } catch (e) {
        console.error("Failed to fetch series books list:", e);
        return [];
    }
}

export async function createMultipleBookRequests(booksList: { title: string, author: string, coverUrl: string, publishYear: string }[]) {
    const session = await verifyUser();
    if (!booksList || booksList.length === 0) return;
    
    for (const book of booksList) {
        const request = await prisma.bookRequest.create({
            data: {
                title: book.title,
                author: book.author,
                coverUrl: book.coverUrl,
                publishYear: book.publishYear,
                requestedBy: session.username as string,
                type: "book",
                status: "Pending"
            }
        });
        
        autoDownloadBookRequest(request.id, book.title, book.author).catch(err => {
            console.error(`[AUTO-DOWNLOAD] Failed for series book "${book.title}":`, err);
        });
    }

    if (booksList.length > 0) {
        const listText = booksList.map(b => `- ${b.title} by ${b.author}`).join("\n");
        sendRequestNotificationToAdmins({
            title: `${booksList.length} Books from checklist`,
            author: listText,
            requestedBy: session.username as string,
            type: "checklist",
            publishYear: null
        }).catch(err => {
            console.error(`[SMTP-NOTIFICATION] Checklist request email notification failed:`, err);
        });
    }
    
    revalidatePath("/library");
}

export async function deleteMultipleBookRequests(ids: string[]) {
    const session = await verifyUser();
    if (!ids || ids.length === 0) return;
    
    if (session.role === "ADMIN") {
        await prisma.bookRequest.deleteMany({
            where: { id: { in: ids } }
        });
    } else {
        await prisma.bookRequest.deleteMany({
            where: {
                id: { in: ids },
                requestedBy: session.username as string
            }
        });
    }
    
    revalidatePath("/library");
}