"use server";

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs"; 
import nodemailer from "nodemailer"; 

const prisma = new PrismaClient();

// --- HELPER: Clean URL (Removes trailing slashes) ---
function cleanUrl(url: string): string {
    if (!url) return "";
    return url.replace(/\/$/, ""); 
}

// --- DATA FETCHERS ---
export async function getSettings() {
    return await prisma.settings.findFirst() || {};
}

// --- DASHBOARD ACCESSORS ---
export async function getDashboardActivity() {
  const { fetchDashboardData } = await import("@/app/data");
  return await fetchDashboardData();
}

export async function getMediaAppsActivity() {
  const { fetchMediaAppsActivity } = await import("@/app/data");
  return await fetchMediaAppsActivity();
}

// --- SETTINGS ACTIONS ---
export async function saveSettings(formData: FormData) {
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
  const autoSyncInterval = Number(formData.get("autoSyncInterval"));
  
  await prisma.settings.upsert({
    where: { id: "global" },
    update: { autoSyncInterval },
    create: { id: "global", autoSyncInterval },
  });
  revalidatePath("/settings");
}

export async function clearSmtpSettings() {
  await prisma.settings.update({
    where: { id: "global" },
    data: { smtpHost: "", smtpPort: 0, smtpUser: "", smtpPass: "" },
  });
  revalidatePath("/settings");
}

// --- TAUTULLI ACTIONS ---
export async function addTautulliInstance(formData: FormData) {
  const name = formData.get("name") as string;
  const url = formData.get("url") as string;
  const apiKey = formData.get("apiKey") as string;
  await prisma.tautulliInstance.create({ data: { name, url, apiKey } });
  revalidatePath("/settings");
}

export async function removeTautulliInstance(id: string) {
  await prisma.tautulliInstance.delete({ where: { id } });
  revalidatePath("/settings");
}

export async function getTautulliInstances() {
    return await prisma.tautulliInstance.findMany();
}

// --- GLANCES ACTIONS ---
export async function addGlancesInstance(formData: FormData) {
  const name = formData.get("name") as string;
  const url = formData.get("url") as string;
  await prisma.glancesInstance.create({ data: { name, url } });
  revalidatePath("/settings");
}

export async function removeGlancesInstance(id: string) {
  await prisma.glancesInstance.delete({ where: { id } });
  revalidatePath("/settings");
}

export async function getGlancesInstances() {
    return await prisma.glancesInstance.findMany();
}

// --- SERVICE ACTIONS ---
export async function addService(formData: FormData) {
  const name = formData.get("name") as string;
  const url = formData.get("url") as string;
  await prisma.service.create({ data: { name, url } });
  revalidatePath("/settings");
}

export async function removeService(id: string) {
  await prisma.service.delete({ where: { id } });
  revalidatePath("/settings");
}

// --- MEDIA APP ACTIONS ---
export async function addMediaApp(formData: FormData) {
  const type = formData.get("type") as string;
  const name = formData.get("name") as string;
  const url = formData.get("url") as string;
  const externalUrl = formData.get("externalUrl") as string; 
  const apiKey = formData.get("apiKey") as string;
  
  await prisma.mediaApp.create({ 
      data: { 
          type, 
          name, 
          url, 
          externalUrl: externalUrl || null, 
          apiKey 
      } 
  });
  revalidatePath("/settings");
}

export async function updateMediaApp(formData: FormData) {
    const id = formData.get("id") as string;
    const type = formData.get("type") as string;
    const name = formData.get("name") as string;
    const url = formData.get("url") as string;
    const externalUrl = formData.get("externalUrl") as string;
    const apiKey = formData.get("apiKey") as string;

    await prisma.mediaApp.update({
        where: { id },
        data: {
            type,
            name,
            url,
            externalUrl: externalUrl || null,
            apiKey
        }
    });
    revalidatePath("/settings");
}

export async function removeMediaApp(id: string) {
  await prisma.mediaApp.delete({ where: { id } });
  revalidatePath("/settings");
}

export async function getMediaApps() {
    return await prisma.mediaApp.findMany();
}

// --- USER AUTHENTICATION ACTIONS ---
export async function getAppUsers() {
    return await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, username: true, email: true, role: true, createdAt: true }
    });
}

export async function createAppUser(formData: FormData) {
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
    try {
        await prisma.user.delete({ where: { id } });
        revalidatePath("/settings/access");
        revalidatePath("/settings");
    } catch (e) {
        console.error("Failed to delete user:", e);
    }
}

// --- LANDING PAGE & SUPPORT ACTIONS ---
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
                console.error(`Failed Tautulli (${t.name}): ${res.status} ${res.statusText}`);
                streamStats.push({ name: t.name, count: 0 }); 
                return;
            }
            
            const data = await res.json();
            const count = data.response?.data?.stream_count ? Number(data.response.data.stream_count) : 0;
            streamStats.push({ name: t.name, count: count });

        } catch (e: any) { 
            console.error(`Failed Tautulli (${t.name}): ${e.message}`); 
            streamStats.push({ name: t.name, count: 0 }); 
        }
    }));

    await Promise.all(glances.map(async (g) => {
        const cleanGlances = cleanUrl(g.url);
        
        const fetchGlancesMetric = async (endpoint: string) => {
            let errorDetails = "";
            const versions = [4, 3, 2]; 

            for (const v of versions) {
                try {
                    const url = `${cleanGlances}/api/${v}/${endpoint}`;
                    const res = await fetch(url, { next: { revalidate: 10 } });
                    
                    if (res.ok) return await res.json();
                    
                    errorDetails += `[v${v}: ${res.status}] `;
                } catch (e) { }
            }
            throw new Error(`All versions failed. Tried: ${errorDetails}`);
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
            console.error(`Failed Glances (${g.name}): ${e.message}`);
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

export async function submitSupportTicket(formData: FormData) {
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const issue = formData.get("issue") as string;

    if (!name || !email || !issue) return { error: "All fields required" };

    try {
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
        return { error: "Failed to submit ticket." };
    }
}

export async function getSupportTickets() {
    return await prisma.supportTicket.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50
    });
}

export async function updateTicketStatus(id: string, status: string, adminComment?: string) {
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
    const to = formData.get("to") as string;
    const subject = formData.get("subject") as string;
    const message = formData.get("message") as string;

    if (!to || !subject || !message) return { error: "All fields are required." };

    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        
        if (!settings?.smtpHost || !settings?.smtpUser) {
            return { error: "SMTP settings (Host & User) not configured in Settings." };
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
        return { error: e.message || "Failed to send email." };
    }
}

export async function getServiceStatus() {
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

export async function getActiveDownloads() {
    const { fetchMediaAppsActivity } = await import("@/app/data");
    const allApps = await fetchMediaAppsActivity();
    
    return allApps.filter((app: any) => 
        app.type === "sabnzbd" || 
        app.type === "nzbget" ||
        app.type === "qBittorrent" 
    );
}