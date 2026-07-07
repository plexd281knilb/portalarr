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
  
  await prisma.settings.upsert({
    where: { id: "global" },
    update: { autoSyncInterval },
    create: { id: "global", autoSyncInterval },
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
    const allowedUsers = formData.get("allowedUsers") as string || "*";
    
    await prisma.library.create({
        data: { name, description, path, allowedUsers }
    });
    revalidatePath("/library");
}

export async function updateLibrary(formData: FormData) {
    await verifyAdmin();
    const id = formData.get("id") as string;
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const path = formData.get("path") as string || "";
    const allowedUsers = formData.get("allowedUsers") as string || "*";
    
    await prisma.library.update({
        where: { id },
        data: { name, description, path, allowedUsers }
    });
    revalidatePath("/library");
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
        if (!response.ok) throw new Error("Series query failed");
        
        const data = await response.json();
        const docs = data.docs || [];
        
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

    const ext = path.extname(filePath).toLowerCase();
    const dirname = path.dirname(filePath);
    const basename = path.basename(filePath, ext);
    const cleanName = basename.replace(/[^a-zA-Z0-9]/g, "_").replace(/__+/g, "_").toLowerCase() + ext;
    const newPath = path.join(dirname, cleanName);

    if (filePath !== newPath) {
        fs.renameSync(filePath, newPath);
        return newPath;
    }

    return filePath;
}

export async function scanLibrary(libraryId: string) {
    await verifyAdmin();
    return await scanLibraryInternal(libraryId);
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
        const files = fs.readdirSync(library.path);
        const validExtensions = [".pdf", ".epub", ".mobi", ".cbz"];
        const diskFilePaths = new Set<string>();

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

                diskFilePaths.add(fullPath);

                const existing = await prisma.book.findFirst({
                    where: { filePath: fullPath }
                });

                if (!existing) {
                    const stats = fs.statSync(fullPath);
                    const cleanBase = path.basename(fullPath, ext);
                    const titleWithoutExt = cleanBase.replace(/[_-]/g, ' ');
                    await prisma.book.create({
                        data: {
                            title: titleWithoutExt,
                            author: "Unknown Author",
                            filePath: fullPath,
                            fileSize: stats.size,
                            fileType: ext.replace(".", ""),
                            libraryId: libraryId
                        }
                    });
                }
            }
        }

        const dbBooks = await prisma.book.findMany({
            where: { libraryId: libraryId }
        });

        for (const dbBook of dbBooks) {
            if (!diskFilePaths.has(dbBook.filePath)) {
                await prisma.book.delete({
                    where: { id: dbBook.id }
                });
            }
        }

        revalidatePath("/library");
        return { success: true };
    } catch (e: any) {
        console.error("Failed to scan library:", e);
        throw new Error(e.message || "Failed to scan library folder");
    }
}

export async function autoDownloadBookRequest(requestId: string, title: string, author: string) {
    console.log(`[AUTO-DOWNLOAD] Starting auto-download check for: ${title} by ${author}`);
    
    try {
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
            
            const pushUrl = `${sabUrl}/api?mode=addurl&name=${encodeURIComponent(selectedRelease.downloadUrl)}&nzbname=${encodeURIComponent(selectedRelease.title)}&cat=books&output=json&apikey=${sabKey}`;
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
                    body: new URLSearchParams({ urls: selectedRelease.downloadUrl, category: "books" }),
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
                    body: new URLSearchParams({ urls: selectedRelease.downloadUrl, category: "books" }),
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
    
    if (protocol === "usenet") {
        const sabApp = await prisma.mediaApp.findFirst({
            where: { type: "sabnzbd" }
        });
        
        if (!sabApp) {
            throw new Error("No SABnzbd download client configured in Portalarr Settings.");
        }
        
        const sabUrl = cleanUrl(sabApp.url);
        const sabKey = decryptData(sabApp.apiKey as string);
        
        const pushUrl = `${sabUrl}/api?mode=addurl&name=${encodeURIComponent(downloadUrl)}&nzbname=${encodeURIComponent(title)}&cat=books&output=json&apikey=${sabKey}`;
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
            body.append("category", "books");
            
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
                body: new URLSearchParams({ urls: downloadUrl, category: "books" }),
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
            
            const libraries = await prisma.library.findMany();
            for (const lib of libraries) {
                try {
                    await scanLibraryInternal(lib.id);
                } catch (err) {
                    console.error(`[AUTO-DOWNLOAD-MONITOR] Library auto-scan failed for "${lib.name}":`, err);
                }
            }
            
            const allBooks = await prisma.book.findMany();
            const reqTitleClean = req.title.toLowerCase().replace(/[^a-z0-9]/g, "");
            const matchedBook = allBooks.find(b => {
                const bTitleClean = b.title.toLowerCase().replace(/[^a-z0-9]/g, "");
                return bTitleClean.includes(reqTitleClean) || reqTitleClean.includes(bTitleClean);
            });
            
            if (matchedBook) {
                console.log(`[AUTO-DOWNLOAD-MONITOR] Found matching book "${matchedBook.title}". Automatically mailing to ${req.requestedBy}...`);
                await sendBookToUserKindleInternal(matchedBook.id, req.requestedBy);
            } else {
                console.warn(`[AUTO-DOWNLOAD-MONITOR] Could not find registered book in library matching: "${req.title}"`);
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
    const session = await verifyUser();
    const user = await prisma.user.findUnique({
        where: { username: session.username as string }
    });
    
    if (!user) throw new Error("User not found");
    if (!user.kindleEmail) {
        throw new Error("Please configure your Send-to-Kindle email address in your library settings first.");
    }

    const book = await prisma.book.findUnique({
        where: { id: bookId }
    });
    if (!book) throw new Error("Book not found");
    if (!fs.existsSync(book.filePath)) {
        throw new Error("Ebook file not found on disk. Try scanning the library again.");
    }

    const settings = await prisma.settings.findFirst({ where: { id: "global" } }) || {} as any;
    if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
        throw new Error("SMTP is not configured on this server. Please contact your administrator to configure SMTP.");
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

    const mailOptions = {
        from: senderEmail,
        to: user.kindleEmail,
        subject: `Deliver Book: ${book.title}`,
        text: `Delivering your ebook "${book.title}" to your Kindle device.`,
        attachments: [
            {
                filename: path.basename(book.filePath),
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

        throw new Error(`Kindle delivery failed: ${e.message || "Unknown SMTP error"}`);
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

    const mailOptions = {
        from: senderEmail,
        to: user.kindleEmail,
        subject: `Deliver Book: ${book.title}`,
        text: `Delivering your ebook "${book.title}" to your Kindle device.`,
        attachments: [
            {
                filename: path.basename(book.filePath),
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
        throw new Error("SMTP is not configured on the server. Please contact your administrator.");
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
        throw new Error(`Failed to send request: ${e.message || "Unknown mail error"}`);
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