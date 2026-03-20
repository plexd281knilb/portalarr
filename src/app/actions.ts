"use server";

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs"; 
import nodemailer from "nodemailer"; 
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const prisma = new PrismaClient();
// --- SECURITY FIX 1: Enforce JWT_SECRET ---
if (!process.env.JWT_SECRET && process.env.NODE_ENV === "production" && !process.env.NEXT_PHASE) {
    throw new Error("FATAL: JWT_SECRET environment variable is missing. The server cannot start securely.");
}
const SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET || "dev-only-insecure-key-do-not-use-in-production");

// ============================================================================
// --- SECURITY LAYER ---
// ============================================================================

async function verifyAdmin() {
    // --- DEV BYPASS: Stop the "Unauthorized" errors locally ---
    if (process.env.NODE_ENV === "development") {
        return; 
    }

    const cookieStore = await cookies();
    const session = cookieStore.get("session")?.value;
    
    if (!session) throw new Error("Unauthorized");
    
    try {
        await jwtVerify(session, SECRET_KEY);
    } catch (err) {
        // Log the actual error for debugging before throwing
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
    return await prisma.settings.findFirst() || {};
}

export async function saveSettings(formData: FormData) {
  await verifyAdmin();
  const smtpHost = formData.get("smtpHost") as string;
  const smtpPort = formData.get("smtpPort") as string;
  const smtpUser = formData.get("smtpUser") as string;
  const smtpPass = formData.get("smtpPass") as string;

  await prisma.settings.upsert({
    where: { id: "global" },
    update: { smtpHost, smtpPort: Number(smtpPort), smtpUser, smtpPass },
    create: { id: "global", smtpHost, smtpPort: Number(smtpPort), smtpUser, smtpPass },
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
    data: { smtpHost: "", smtpPort: 0, smtpUser: "", smtpPass: "" },
  });
  revalidatePath("/settings");
}

export async function addTautulliInstance(formData: FormData) {
  await verifyAdmin();
  const name = formData.get("name") as string;
  const url = formData.get("url") as string;
  const apiKey = formData.get("apiKey") as string;
  await prisma.tautulliInstance.create({ data: { name, url, apiKey } });
  revalidatePath("/settings");
}

export async function removeTautulliInstance(id: string) {
  await verifyAdmin();
  await prisma.tautulliInstance.delete({ where: { id } });
  revalidatePath("/settings");
}

export async function getTautulliInstances() {
    await verifyAdmin();
    return await prisma.tautulliInstance.findMany();
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

export async function addService(formData: FormData) {
  await verifyAdmin();
  const name = formData.get("name") as string;
  const url = formData.get("url") as string;
  await prisma.service.create({ data: { name, url } });
  revalidatePath("/settings");
}

export async function removeService(id: string) {
  await verifyAdmin();
  await prisma.service.delete({ where: { id } });
  revalidatePath("/settings");
}

export async function getServiceStatus() {
    await verifyAdmin();
    const services = await prisma.service.findMany();
    
    const results = await Promise.all(services.map(async (service) => {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 2000);
            await fetch(service.url, { signal: controller.signal, mode: 'no-cors' });
            clearTimeout(id);
            return { ...service, online: true };
        } catch (e) {
            return { ...service, online: false };
        }
    }));
    return results;
}

export async function getMediaApps() {
    await verifyAdmin();
    return await prisma.mediaApp.findMany();
}

export async function addMediaApp(formData: FormData) {
  await verifyAdmin();
  const type = formData.get("type") as string;
  const name = formData.get("name") as string;
  const url = formData.get("url") as string;
  const externalUrl = formData.get("externalUrl") as string; 
  const apiKey = formData.get("apiKey") as string;
  
  await prisma.mediaApp.create({ 
      data: { type, name, url, externalUrl: externalUrl || null, apiKey } 
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
    const apiKey = formData.get("apiKey") as string;

    await prisma.mediaApp.update({
        where: { id },
        data: { type, name, url, externalUrl: externalUrl || null, apiKey }
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
                auth: { user: settings.smtpUser, pass: settings.smtpPass },
            } as any);

            let emailText = `Hi ${ticket.name},\n\nYour support ticket status has been updated to: ${status}.\n\n`;
            if (adminComment) {
                emailText += `Admin Reply:\n${adminComment}\n\n`;
            }
            emailText += `--- Original Issue ---\n${ticket.issue}\n\nThanks,\nAdminarr Support`;

            try {
                await transporter.sendMail({
                    from: `"Support" <${settings.smtpUser}>`,
                    to: ticket.email,
                    subject: `Support Ticket Update: ${status}`,
                    text: emailText
                });
            } catch (e) {
                console.error("Failed to send ticket update email:", e);
            }
        }
    }

    revalidatePath("/");
    revalidatePath("/admin/tickets");
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
            auth: { user: settings.smtpUser, pass: settings.smtpPass },
        } as any);

        await transporter.sendMail({
            from: `"Adminarr" <${settings.smtpUser}>`,
            to: to,
            subject: subject,
            html: `<div style="font-family: sans-serif; white-space: pre-wrap;">${message}</div>` 
        });

        return { success: true };
    } catch (e: any) {
        console.error("Email Failed:", e);
        // --- SECURITY FIX 4: Sanitize Error Messages ---
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
        // --- SECURITY FIX 2: Rate Limiting (1 per hour per email) ---
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
                auth: { user: settings.smtpUser, pass: settings.smtpPass },
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
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); 
            const cleanUrl = app.url.replace(/\/$/, "");
            
            let data: any = { 
                id: app.id, 
                type: app.type, 
                name: app.name, 
                online: false,
                queue: []
            };

            const res = await fetch(`${cleanUrl}/api?mode=queue&output=json&apikey=${app.apiKey}`, { 
                signal: controller.signal, 
                cache: "no-store" 
            });
            clearTimeout(timeoutId);
            
            const json = await res.json();
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
            return { id: app.id, type: app.type, name: app.name, online: false, queue: [] };
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