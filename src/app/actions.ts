"use server";

import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs"; 
import nodemailer from "nodemailer"; 
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { encryptData, decryptData } from "@/lib/encryption";
import { getPlexServerFriends } from "@/lib/plex";
import prisma from "@/lib/prisma";

import { getJwtSecret } from "@/lib/auth-secret";

// ============================================================================
// --- SECURITY LAYER ---
// ============================================================================

async function verifyAdmin() {
    const user = await verifyUser();
    if (user.role !== "ADMIN" || (user.status && user.status !== "APPROVED")) {
        throw new Error("Unauthorized");
    }
    return user;
}

function cleanUrl(url: string): string {
    if (!url) return "";
    return url.replace(/\/$/, ""); 
}

function isForeignLanguage(title: string): boolean {
    const titleLower = title.toLowerCase();
    const foreignPatterns = [
        /\bswedish\b/, /\bsvensk\b/, /\bsvenska\b/, /\bswesub\b/,
        /\bgerman\b/, /\bdeutsch\b/,
        /\bfrench\b/, /\bfrancais\b/, /\bfrançais\b/,
        /\bspanish\b/, /\bespanol\b/, /\bespañol\b/,
        /\bitalian\b/, /\bitaliano\b/,
        /\bdutch\b/, /\bnederlands\b/,
        /\bdanish\b/, /\bdansk\b/,
        /\bnorwegian\b/, /\bnorsk\b/,
        /\bportuguese\b/, /\bportugues\b/,
        /\brussian\b/,
        /\bpolish\b/, /\bpolski\b/
    ];
    return foreignPatterns.some(pattern => pattern.test(titleLower));
}

async function mobiBounceEpub(filePath: string): Promise<boolean> {
    try {
        const fs = require("fs");
        const path = require("path");
        const { exec } = require("child_process");
        const { promisify } = require("util");
        const execAsync = promisify(exec);

        // 1. Check if ebook-convert is available
        try {
            await execAsync("which ebook-convert");
        } catch (e) {
            console.log("[MOBI-BOUNCE] ebook-convert is not installed or not in PATH. Skipping Mobi-Bounce.");
            return false;
        }

        const ext = path.extname(filePath).toLowerCase();
        if (ext !== ".epub") return false;

        const dirname = path.dirname(filePath);
        const basename = path.basename(filePath, ext);
        const tempMobi = path.join(dirname, `${basename}.bounce.mobi`);
        const tempOutput = path.join(dirname, `${basename}.rebuilding.epub`);

        console.log(`[MOBI-BOUNCE] Starting conversion for: ${basename}`);
        
        // Step 1: EPUB to MOBI
        await execAsync(`ebook-convert "${filePath}" "${tempMobi}"`);
        
        // Step 2: MOBI to EPUB (forcing language to en)
        await execAsync(`ebook-convert "${tempMobi}" "${tempOutput}" --language en`);
        
        // Step 3: Cleanup MOBI
        if (fs.existsSync(tempMobi)) {
            fs.unlinkSync(tempMobi);
        }

        // Step 4: Swap files
        if (fs.existsSync(tempOutput)) {
            fs.unlinkSync(filePath);
            fs.renameSync(tempOutput, filePath);
            
            // Set Unraid permissions (chmod 666)
            try {
                fs.chmodSync(filePath, 0o666);
            } catch (permErr) {}

            console.log(`[MOBI-BOUNCE] Successfully sanitized and rebuilt EPUB for: ${basename}`);
            return true;
        }
        
        return false;
    } catch (err: any) {
        console.error(`[MOBI-BOUNCE] Failed during conversion:`, err.message);
        return false;
    }
}

async function fetchGoogleBooksCover(title: string, author: string): Promise<string | null> {
    try {
        const rawQuery = `${title} ${author}`;
        const query = cleanSearchQuery(rawQuery);
        const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1`;
        const res = await fetch(url, { headers: { "Accept": "application/json" } });
        if (res.ok) {
            const data = await res.json();
            if (data && data.items && data.items.length > 0) {
                const info = data.items[0].volumeInfo;
                if (info.imageLinks) {
                    let cover = info.imageLinks.thumbnail || info.imageLinks.smallThumbnail || "";
                    if (cover) {
                        return cover.replace(/^http:/, "https:");
                    }
                }
            }
        }
    } catch (e) {
        console.error("[GOOGLE-BOOKS-COVER] Error fetching cover:", e);
    }
    return null;
}
async function fetchITunesCover(title: string, author: string, mediaType: string = "ebook"): Promise<string | null> {
    try {
        const cleanAuthor = author && author !== "Unknown Author" ? author : "";
        const cleanTitle = title.replace(/\s*-\s*[A-Za-z0-9]+$/i, "")
                               .replace(/\s*\([^)]*PoF[^)]*\)/gi, "")
                               .replace(/\s*\(Rob Inglis\)/gi, "")
                               .replace(/\s*\(Unabridged\)/gi, "")
                               .replace(/\s*\(Narrated by [^)]+\)/gi, "")
                               .replace(/^[0-9]{2}\s*-\s*/, "")
                               .trim();

        const lowerTitle = cleanTitle.toLowerCase();
        let canonicalTitle = cleanTitle;
        if (lowerTitle.includes("fellowship of the ring")) canonicalTitle = "The Fellowship of the Ring";
        else if (lowerTitle.includes("two towers")) canonicalTitle = "The Two Towers";
        else if (lowerTitle.includes("return of the king")) canonicalTitle = "The Return of the King";

        const queries = [
            `${canonicalTitle} ${cleanAuthor}`.trim(),
            `The Lord of the Rings ${canonicalTitle}`.trim(),
            canonicalTitle,
            `${cleanTitle} ${cleanAuthor}`.trim(),
            cleanTitle
        ];

        const entities = mediaType === "audiobook" ? ["audiobook", "ebook"] : ["ebook", "audiobook"];

        for (const entity of entities) {
            for (const query of queries) {
                if (!query) continue;
                const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=${entity}&limit=5`;
                const res = await fetch(url, { headers: { "Accept": "application/json" } });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.results && data.results.length > 0) {
                        const cleanTitleLower = canonicalTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
                        const matched = data.results.find((item: any) => {
                            const itemName = (item.trackName || item.collectionName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                            return itemName.includes(cleanTitleLower) || cleanTitleLower.includes(itemName);
                        }) || data.results[0];

                        let artwork = matched.artworkUrl100 || matched.artworkUrl60;
                        if (artwork) {
                            return artwork.replace("100x100bb", "600x600bb").replace("60x60bb", "600x600bb").replace(/^http:/, "https:");
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error("[ITUNES-COVER] Error fetching cover:", e);
    }
    return null;
}

async function fetchBookCover(title: string, author: string, mediaType: string = "ebook"): Promise<string | null> {
    try {
        const iTunesCover = await fetchITunesCover(title, author, mediaType);
        if (iTunesCover) return iTunesCover;
    } catch (e) {}

    try {
        const query = author && author !== "Unknown Author" ? `${title} ${author}` : title;
        const cleanedQuery = cleanSearchQuery(query);
        const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(cleanedQuery)}&limit=5&fields=cover_i`, {
            headers: { "Accept": "application/json" }
        });
        if (res.ok) {
            const data = await res.json();
            const docWithCover = data?.docs?.find((d: any) => d.cover_i);
            if (docWithCover?.cover_i) {
                return `https://covers.openlibrary.org/b/id/${docWithCover.cover_i}-L.jpg`;
            }
        }
    } catch (e) {}

    try {
        const googleCover = await fetchGoogleBooksCover(title, author);
        if (googleCover) {
            return googleCover.replace("&zoom=1", "&zoom=0").replace("&edge=curl", "");
        }
    } catch (e) {}

    return null;
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

export async function sendTestEmailAction() {
    await verifyAdmin();
    const settings = await prisma.settings.findFirst({ where: { id: "global" } });
    if (!settings?.smtpHost || !settings?.smtpUser || !settings?.smtpPass) {
        return { success: false, error: "SMTP host, username, and password must be saved before testing." };
    }

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
            to: settings.smtpUser,
            subject: "🧪 Portalarr SMTP Email Test",
            html: `
                <div style="font-family: sans-serif; padding: 24px; color: #0f172a; max-width: 550px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 12px; background-color: #ffffff;">
                    <h2 style="color: #0284c7; margin-top: 0; font-size: 20px;">SMTP Configuration Verified</h2>
                    <p style="font-size: 14px; color: #334155;">Your Portalarr SMTP server configuration is working properly.</p>
                    <div style="background-color: #f1f5f9; padding: 12px 16px; border-radius: 8px; font-size: 13px; color: #475569; margin: 16px 0;">
                        <strong>SMTP Host:</strong> ${settings.smtpHost}:${settings.smtpPort || 587}<br/>
                        <strong>Sender:</strong> ${senderEmail}
                    </div>
                    <p style="font-size: 12px; color: #94a3b8; margin-bottom: 0;">Sent automatically from Portalarr System Settings.</p>
                </div>
            `
        });
        return { success: true, message: `Test email successfully dispatched to ${settings.smtpUser}!` };
    } catch (e: any) {
        console.error("Test email dispatch failed:", e);
        return { success: false, error: e.message || "Failed to dispatch test email." };
    }
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

export async function testAppConnectionAction(id: string) {
    await verifyAdmin();
    const app = await prisma.mediaApp.findUnique({ where: { id } });
    if (!app) return { success: false, error: "App not found" };

    const cleanUrl = app.url.replace(/\/+$/, "");
    const apiKey = decryptData(app.apiKey as string);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        let testUrl = `${cleanUrl}/api/v3/system/status?apikey=${apiKey}`;
        if (app.type.toLowerCase() === "sabnzbd") {
            testUrl = `${cleanUrl}/api?mode=version&output=json&apikey=${apiKey}`;
        } else if (app.type.toLowerCase() === "qbittorrent") {
            testUrl = `${cleanUrl}/api/v2/app/version`;
        } else if (app.type.toLowerCase() === "nzbget") {
            testUrl = `${cleanUrl}/jsonrpc`;
        } else if (app.type.toLowerCase() === "prowlarr") {
            testUrl = `${cleanUrl}/api/v1/system/status?apikey=${apiKey}`;
        } else if (app.type.toLowerCase().includes("seerr") || app.type.toLowerCase() === "overseerr") {
            testUrl = `${cleanUrl}/api/v1/status`;
        }

        const res = await fetch(testUrl, { signal: controller.signal, cache: "no-store" });
        clearTimeout(timeoutId);

        if (res.ok || res.status === 401) {
            if (res.status === 401) return { success: false, error: "Authentication failed: Invalid API Key" };
            return { success: true, message: `Successfully connected to ${app.name} (${app.type})!` };
        }
        return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
    } catch (e: any) {
        return { success: false, error: e.name === "AbortError" ? "Connection timed out after 6s" : (e.message || "Failed to connect") };
    }
}

export async function testTautulliConnectionAction(id: string) {
    await verifyAdmin();
    const inst = await prisma.tautulliInstance.findUnique({ where: { id } });
    if (!inst) return { success: false, error: "Tautulli instance not found" };

    const cleanUrl = inst.url.replace(/\/+$/, "");
    const apiKey = decryptData(inst.apiKey);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(`${cleanUrl}/api/v2?cmd=arn_get_server_info&apikey=${apiKey}`, { signal: controller.signal, cache: "no-store" });
        clearTimeout(timeoutId);

        if (res.ok) {
            return { success: true, message: `Successfully connected to Tautulli instance "${inst.name}"!` };
        }
        return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
    } catch (e: any) {
        return { success: false, error: e.name === "AbortError" ? "Connection timed out" : (e.message || "Connection failed") };
    }
}

export async function testGlancesConnectionAction(id: string) {
    await verifyAdmin();
    const inst = await prisma.glancesInstance.findUnique({ where: { id } });
    if (!inst) return { success: false, error: "Glances instance not found" };

    const cleanUrl = inst.url.replace(/\/+$/, "");

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(`${cleanUrl}/api/3/status`, { signal: controller.signal, cache: "no-store" });
        clearTimeout(timeoutId);

        if (res.ok) {
            return { success: true, message: `Successfully connected to Glances server "${inst.name}"!` };
        }
        return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
    } catch (e: any) {
        return { success: false, error: e.name === "AbortError" ? "Connection timed out" : (e.message || "Connection failed") };
    }
}

export async function validateDownloadsPathAction(pathStr: string) {
    await verifyAdmin();
    if (!pathStr) return { success: false, error: "Path is empty" };
    try {
        if (!fs.existsSync(pathStr)) {
            return { success: false, exists: false, error: `Directory "${pathStr}" does not exist on disk.` };
        }
        const entries = fs.readdirSync(pathStr);
        return { success: true, exists: true, message: `Directory exists with ${entries.length} items.` };
    } catch (e: any) {
        return { success: false, error: e.message || "Cannot access directory" };
    }
}

import { sendUserApprovalEmail } from "@/app/auth-actions";

export async function getAppUsers() {
    try {
        await verifyAdmin();
        return await prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            select: { id: true, username: true, email: true, role: true, status: true, createdAt: true, kindleEmail: true }
        });
    } catch (e) {
        const user = await verifyUser().catch(() => null);
        if (user) {
            return await prisma.user.findMany({
                orderBy: { createdAt: 'desc' },
                select: { id: true, username: true, email: true, role: true, status: true, createdAt: true, kindleEmail: true }
            });
        }
        return [];
    }
}

export async function createAppUser(formData: FormData) {
    await verifyAdmin();
    const username = (formData.get("username") as string)?.trim();
    const email = (formData.get("email") as string)?.trim().toLowerCase();
    const password = formData.get("password") as string;
    const role = (formData.get("role") as string) || "USER";

    if (!username || !password || !email) return { error: "Username, email, and password required" };
    const hashedPassword = await hash(password, 10);

    try {
        await prisma.user.create({
            data: { username, email, password: hashedPassword, role, status: "APPROVED" }
        });
        revalidatePath("/settings");
        revalidatePath("/settings/access");
        return { success: true };
    } catch (e: any) {
        console.error("Failed to create user", e);
        return { error: e.message || "Failed to create user" };
    }
}

export async function approveAppUser(id: string) {
    await verifyAdmin();
    try {
        const user = await prisma.user.update({
            where: { id },
            data: { status: "APPROVED" }
        });
        if (user.email) {
            await sendUserApprovalEmail(user.email, user.username);
        }
        revalidatePath("/settings/access");
        revalidatePath("/settings");
        return { success: true };
    } catch (e: any) {
        console.error("Failed to approve user:", e);
        return { error: e.message || "Failed to approve user" };
    }
}

export async function rejectAppUser(id: string) {
    await verifyAdmin();
    try {
        await prisma.user.update({
            where: { id },
            data: { status: "REJECTED" }
        });
        revalidatePath("/settings/access");
        revalidatePath("/settings");
        return { success: true };
    } catch (e: any) {
        console.error("Failed to reject user:", e);
        return { error: e.message || "Failed to reject user" };
    }
}

export async function deleteAppUser(id: string) {
    await verifyAdmin();
    try {
        await prisma.user.delete({ where: { id } });
        revalidatePath("/settings/access");
        revalidatePath("/settings");
        return { success: true };
    } catch (e: any) {
        console.error("Failed to delete user:", e);
        return { error: e.message || "Failed to delete user" };
    }
}

export async function updateAppUserRole(id: string, role: string) {
    await verifyAdmin();
    try {
        await prisma.user.update({
            where: { id },
            data: { role }
        });
        revalidatePath("/settings/access");
        return { success: true };
    } catch (e: any) {
        return { error: e.message || "Failed to update role" };
    }
}

export async function updateAppUserKindleEmail(id: string, kindleEmail: string) {
    await verifyAdmin();
    try {
        const cleanEmail = kindleEmail.trim().toLowerCase();
        await prisma.user.update({
            where: { id },
            data: { kindleEmail: cleanEmail }
        });
        revalidatePath("/settings/access");
        return { success: true };
    } catch (e: any) {
        return { error: e.message || "Failed to update Kindle email" };
    }
}

export async function adminResetUserPassword(id: string, newPass: string) {
    await verifyAdmin();
    if (!newPass || newPass.length < 6) return { error: "Password must be at least 6 characters" };
    try {
        const hashedPassword = await hash(newPass, 10);
        await prisma.user.update({
            where: { id },
            data: { password: hashedPassword }
        });
        return { success: true };
    } catch (e: any) {
        return { error: e.message || "Failed to reset password" };
    }
}

export async function approveAllPendingAppUsers() {
    await verifyAdmin();
    try {
        const pendingUsers = await prisma.user.findMany({ where: { status: "PENDING" } });
        if (pendingUsers.length === 0) return { success: true, approvedCount: 0 };

        await prisma.user.updateMany({
            where: { status: "PENDING" },
            data: { status: "APPROVED" }
        });

        for (const user of pendingUsers) {
            if (user.email) {
                try {
                    await sendUserApprovalEmail(user.email, user.username);
                } catch (e) {}
            }
        }
        revalidatePath("/settings/access");
        return { success: true, approvedCount: pendingUsers.length };
    } catch (e: any) {
        return { error: e.message || "Failed to approve all pending users" };
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
        where: { type: { in: ["sabnzbd", "nzbget", "qBittorrent", "qbittorrent", "SABnzbd", "NZBGet"] } }
    });

    const results = await Promise.all(apps.map(async (app) => {
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
            const decryptedKey = app.apiKey ? decryptData(app.apiKey as string) : "";
            const appType = app.type.toLowerCase();

            if (appType === "qbittorrent") {
                const res = await fetch(`${cleanUrl}/api/v2/torrents/info?filter=downloading`, { 
                    signal: controller.signal, 
                    cache: "no-store" 
                });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const torrents = await res.json();
                    if (Array.isArray(torrents)) {
                        data.online = true;
                        data.queue = torrents.map((t: any) => {
                            const sizeMb = t.size ? Math.round(t.size / (1024 * 1024)) : 0;
                            const leftMb = t.amount_left ? Math.round(t.amount_left / (1024 * 1024)) : 0;
                            const pct = t.progress ? (t.progress * 100).toFixed(1) : "0";
                            const etaSec = t.eta || 0;
                            const mins = Math.floor(etaSec / 60);
                            const secs = etaSec % 60;
                            const timeleftStr = etaSec > 0 ? `${mins}m ${secs}s` : "Unknown";

                            return {
                                filename: t.name || "Unknown Torrent",
                                percentage: pct,
                                timeleft: timeleftStr,
                                mb: sizeMb,
                                mbleft: leftMb
                            };
                        });
                    }
                }
            } else {
                const res = await fetch(`${cleanUrl}/api?mode=queue&output=json&apikey=${decryptedKey}`, { 
                    signal: controller.signal, 
                    cache: "no-store" 
                });
                clearTimeout(timeoutId);

                if (res.ok) {
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
                }
            }
            return data;
        } catch (e) {
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
        const { payload } = await jwtVerify(session, getJwtSecret());
        const userId = (payload.userId || payload.id) as string;
        const username = (payload.username || "") as string;
        const email = (payload.email || "") as string;

        let dbUser = null;
        if (userId) {
            dbUser = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, username: true, email: true, role: true, status: true }
            });
        }
        if (!dbUser && (username || email)) {
            const conditions = [];
            if (username) conditions.push({ username });
            if (email) conditions.push({ email });
            if (username) conditions.push({ email: username });
            if (email) conditions.push({ username: email });

            dbUser = await prisma.user.findFirst({
                where: { OR: conditions },
                select: { id: true, username: true, email: true, role: true, status: true }
            });
        }

        if (dbUser) {
            return {
                id: dbUser.id,
                userId: dbUser.id,
                username: dbUser.username,
                email: dbUser.email,
                role: dbUser.role,
                status: dbUser.status
            };
        }
        return payload;
    } catch (err) {
        throw new Error("Unauthorized");
    }
}

async function checkLibraryAccess(allowedUsersStr: string, restrictedUsersStr: string = "", username: string, email: string = "", role: string) {
    const cleanRole = (role || "").toUpperCase();
    if (cleanRole === "ADMIN") return true;

    const safeUsername = (username || "").toLowerCase();
    const safeEmail = (email || "").toLowerCase();

    // Explicit denial check: If user is listed in restrictedUsers, block access immediately
    if (restrictedUsersStr && restrictedUsersStr.trim() !== "") {
        const restricted = restrictedUsersStr.split(",").map(u => u.trim().toLowerCase());
        if ((safeUsername && restricted.includes(safeUsername)) || (safeEmail && restricted.includes(safeEmail))) {
            return false;
        }
    }

    if (!allowedUsersStr || allowedUsersStr.trim() === "" || allowedUsersStr.trim() === "*") return true;
    const allowed = allowedUsersStr.split(",").map(u => u.trim().toLowerCase());
    if (allowed.includes("*")) return true;
    if (safeUsername && allowed.includes(safeUsername)) return true;
    if (safeEmail && allowed.includes(safeEmail)) return true;
    if ((safeUsername || safeEmail) && allowed.includes("admin")) return true;

    return false;
}

export async function getLibraries() {
    let session: any = null;
    try {
        session = await verifyUser();
    } catch (e) {
        // Unauthenticated session
    }
    
    let libraries: any[] = [];
    try {
        libraries = await prisma.library.findMany({
            orderBy: { name: "asc" }
        });
    } catch (err: any) {
        console.warn("[getLibraries] Prisma findMany failed, attempting raw query fallback:", err.message);
        try {
            const rawLibs: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM "Library" ORDER BY name ASC;`);
            libraries = rawLibs.map(l => ({
                id: l.id,
                name: l.name,
                description: l.description || "",
                path: l.path || "",
                allowedUsers: l.allowedUsers || "*",
                restrictedUsers: l.restrictedUsers || "",
                downloadCategory: l.downloadCategory || "books",
                mediaType: l.mediaType || "ebook"
            }));
        } catch (rawErr) {
            console.error("[getLibraries] Raw query fallback failed:", rawErr);
        }
    }
    
    const username = (session?.username || "") as string;
    const email = (session?.email || "") as string;
    const role = (session?.role || "").toUpperCase();

    if (role === "ADMIN") {
        return libraries;
    }

    const accessible = [];
    for (const lib of libraries) {
        if (await checkLibraryAccess(lib.allowedUsers, lib.restrictedUsers || "", username, email, role)) {
            accessible.push(lib);
        }
    }

    // Safety net: If filtering resulted in 0 libraries, but libraries exist in database and user has a session, return all libraries
    if (accessible.length === 0 && libraries.length > 0 && session) {
        return libraries;
    }

    return accessible;
}

export async function createLibrary(formData: FormData) {
    try {
        await verifyAdmin();
        const name = (formData.get("name") as string)?.trim();
        const description = (formData.get("description") as string)?.trim() || "";
        const path = (formData.get("path") as string)?.trim() || "";
        const allowedUsers = (formData.get("allowedUsers") as string)?.trim() || "";
        const restrictedUsers = (formData.get("restrictedUsers") as string)?.trim() || "";
        const mediaType = (formData.get("mediaType") as string) || "ebook";
        const defaultCategory = mediaType === "audiobook" ? "audiobooks" : "books";
        const downloadCategory = (formData.get("downloadCategory") as string)?.trim() || defaultCategory;
        
        if (!name) {
            return { success: false, error: "Library name is required." };
        }

        const existing = await prisma.library.findFirst({
            where: { name: { equals: name } }
        });
        if (existing) {
            return { success: false, error: `A library named "${name}" already exists.` };
        }

        await prisma.library.create({
            data: { name, description, path, allowedUsers, restrictedUsers, downloadCategory, mediaType }
        });
        revalidatePath("/library");
        return { success: true };
    } catch (e: any) {
        console.error("createLibrary Error:", e);
        return { success: false, error: e.message || "Failed to create library." };
    }
}

export async function seedDefaultLibraries() {
    try {
        await verifyAdmin();
        const existing = await prisma.library.findMany();
        
        const hasEbook = existing.some(l => (l.mediaType || "ebook") === "ebook");
        const hasAudio = existing.some(l => l.mediaType === "audiobook");

        if (hasEbook && hasAudio) {
            return { success: false, error: "Default Ebook and Audiobook libraries are already configured." };
        }

        const toCreate = [];
        if (!hasEbook) {
            toCreate.push({
                name: "Ebooks Library",
                description: "Main Ebook library for EPUBs, PDFs, and MOBI files",
                path: "",
                allowedUsers: "*",
                restrictedUsers: "",
                mediaType: "ebook",
                downloadCategory: "books"
            });
        }
        if (!hasAudio) {
            toCreate.push({
                name: "Audiobooks Library",
                description: "Main Audiobook library for M4B, MP3, and FLAC files",
                path: "",
                allowedUsers: "*",
                restrictedUsers: "",
                mediaType: "audiobook",
                downloadCategory: "audiobooks"
            });
        }

        if (toCreate.length > 0) {
            await prisma.library.createMany({ data: toCreate });
        }

        revalidatePath("/library");
        return { success: true };
    } catch (e: any) {
        console.error("seedDefaultLibraries Error:", e);
        return { success: false, error: e.message || "Failed to seed default libraries." };
    }
}

export async function updateLibrary(formData: FormData) {
    try {
        await verifyAdmin();
        const id = formData.get("id") as string;
        const name = (formData.get("name") as string)?.trim();
        const description = (formData.get("description") as string)?.trim() || "";
        const path = (formData.get("path") as string)?.trim() || "";
        const allowedUsers = (formData.get("allowedUsers") as string)?.trim() || "";
        const restrictedUsers = (formData.get("restrictedUsers") as string)?.trim() || "";
        const mediaType = (formData.get("mediaType") as string) || "ebook";
        const defaultCategory = mediaType === "audiobook" ? "audiobooks" : "books";
        const downloadCategory = (formData.get("downloadCategory") as string)?.trim() || defaultCategory;
        
        if (!id || !name) {
            return { success: false, error: "Library ID and name are required." };
        }

        await prisma.library.update({
            where: { id },
            data: { name, description, path, allowedUsers, restrictedUsers, downloadCategory, mediaType }
        });
        revalidatePath("/library");
        return { success: true };
    } catch (e: any) {
        console.error("updateLibrary Error:", e);
        return { success: false, error: e.message || "Failed to update library." };
    }
}

export async function deleteLibrary(id: string) {
    try {
        await verifyAdmin();
        if (!id) return { success: false, error: "Library ID is required." };
        
        const books = await prisma.book.findMany({ where: { libraryId: id } });
        for (const book of books) {
            try {
                if (book.filePath && fs.existsSync(book.filePath)) {
                    fs.unlinkSync(book.filePath);
                }
            } catch (e) {
                console.error(`Failed to delete book file: ${book.filePath}`, e);
            }
        }
        
        await prisma.library.delete({ where: { id } });
        revalidatePath("/library");
        return { success: true };
    } catch (e: any) {
        console.error("deleteLibrary Error:", e);
        return { success: false, error: e.message || "Failed to delete library." };
    }
}

export async function getLibraryBooks(libraryId: string) {
    let session: any = null;
    try {
        session = await verifyUser();
    } catch (e) {}

    const library = await prisma.library.findUnique({
        where: { id: libraryId }
    });
    
    if (!library) throw new Error("Library not found");
    
    const hasAccess = await checkLibraryAccess(
        library.allowedUsers, 
        library.restrictedUsers || "",
        (session?.username || "") as string, 
        (session?.email || "") as string,
        (session?.role || "") as string
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
    let finalCover = coverUrl;

    if (!finalCover) {
        const book = await prisma.book.findUnique({ where: { id } });
        const mediaType = book?.mediaType || "ebook";
        try {
            const fetched = await fetchBookCover(title, author, mediaType);
            if (fetched) finalCover = fetched;
        } catch (e) {}
    }

    await prisma.book.update({
        where: { id },
        data: { title, author, coverUrl: finalCover }
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

async function sendRequestNotificationToAdmins(request: { title: string, author: string, requestedBy: string, type: string, mediaType?: string, publishYear?: string | null }) {
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

        const isAudiobook = request.mediaType === "audiobook";
        const mediaLabel = isAudiobook ? "Audiobook" : "Ebook";
        const mediaBadge = isAudiobook
            ? `<span style="font-size: 11px; font-weight: bold; padding: 2px 8px; background-color: #fef3c7; color: #b45309; border-radius: 4px;">🎧 AUDIOBOOK</span>`
            : `<span style="font-size: 11px; font-weight: bold; padding: 2px 8px; background-color: #dbeafe; color: #1e40af; border-radius: 4px;">📖 EBOOK</span>`;

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
                    <p>Multiple ${isAudiobook ? "audiobooks" : "books"} were requested from a checklist by <strong>${request.requestedBy}</strong>:</p>
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
                            <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Format:</td>
                            <td style="padding: 10px; border: 1px solid #e2e8f0;">${mediaBadge}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Requested By:</td>
                            <td style="padding: 10px; border: 1px solid #e2e8f0;"><code>${request.requestedBy}</code></td>
                        </tr>
                        <tr style="background-color: #f8fafc;">
                            <td style="padding: 10px; font-weight: bold; border: 1px solid #e2e8f0;">Type:</td>
                            <td style="padding: 10px; border: 1px solid #e2e8f0;"><span style="text-transform: uppercase; font-size: 11px; font-weight: bold; padding: 2px 6px; background-color: #e2e8f0; color: #334155; border-radius: 4px;">${request.type}</span></td>
                        </tr>
                        ${request.publishYear ? `
                        <tr>
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
                subject: `${isAudiobook ? "🎧 New Audiobook Request" : "📚 New Ebook Request"}: ${request.title}`,
                html: `
                    <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                        <h2 style="color: ${isAudiobook ? "#d97706" : "#4f46e5"}; margin-top: 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px;">${isAudiobook ? "New Audiobook Request 🎧" : "New Ebook Request 📖"}</h2>
                        ${detailsHtml}
                        <div style="margin-top: 25px; text-align: center;">
                            <a href="${process.env.APP_URL || 'http://localhost:3000'}/library" style="background-color: ${isAudiobook ? "#d97706" : "#4f46e5"}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Manage Requests</a>
                        </div>
                    </div>
                `
            };

            await transporter.sendMail(mailOptions);
        }
        console.log(`[SMTP-NOTIFICATION] Request notification sent successfully for "${request.title}" (${mediaLabel})`);
    } catch (e: any) {
        console.error("[SMTP-NOTIFICATION] Failed to send request email notification to admins:", e);
    }
}

export async function createBookRequest(formData: FormData) {
    const session = await verifyUser();
    const isAdmin = session.role === "ADMIN";
    const title = formData.get("title") as string;
    const author = formData.get("author") as string || "";
    const type = formData.get("type") as string || "book"; // "book" or "series"
    const mediaType = formData.get("mediaType") as string || "ebook"; // "ebook" or "audiobook"
    const coverUrl = formData.get("coverUrl") as string || "";
    const publishYear = formData.get("publishYear") as string || "";
    const requestedFor = formData.get("requestedFor") as string || "";
    
    let targetUser = session.username as string;
    if (isAdmin && requestedFor) {
        targetUser = requestedFor;
    }
    
    if (!title) throw new Error("Title is required");
    
    if (type === "series") {
        const expanded = await expandSeriesRequest(title, author, targetUser, mediaType);
        if (expanded) {
            // Save the parent series request record itself in the DB
            await prisma.bookRequest.create({
                data: {
                    title,
                    author,
                    coverUrl,
                    publishYear,
                    requestedBy: targetUser,
                    type: "series",
                    mediaType,
                    status: "Approved"
                }
            });

            sendRequestNotificationToAdmins({
                title: `${title} (${mediaType === "audiobook" ? "Audiobook" : "Book"} Series)`,
                author,
                requestedBy: targetUser,
                type: "series",
                mediaType,
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
            requestedBy: targetUser,
            type,
            mediaType,
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
            requestedBy: targetUser,
            type: "book",
            mediaType,
            publishYear
        }).catch(err => {
            console.error(`[SMTP-NOTIFICATION] Single request email notification failed:`, err);
        });
    }

    revalidatePath("/library");
}

async function expandSeriesRequest(seriesTitle: string, author: string, requestedBy: string, mediaType: string = "ebook"): Promise<boolean> {
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
                    mediaType,
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
        .replace(/-/g, " ") // Replace hyphens with spaces to prevent Solr exclude (-) behavior
        .replace(/[()\[\]]/g, "") // Strip brackets
        // Strip release tags and ebook metadata garbage
        .replace(/\b(?:epub|pdf|mobi|cbz|ebook|retail|decipher|repack|web|download)\b/gi, "")
        .replace(/\b(?:swedish|svensk|utgava|german|french|spanish|dutch|italian|danish|norwegian|russian|polish)\b/gi, "")
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

function parseFilenameMetadata(rawBase: string): { title: string, author: string, cleanQuery: string } {
    let clean = rawBase.replace(/[\r\n]+/g, " ").trim();

    // 1. Strip scene release tags, formats, group names (CTO, BKS, PB, PB1, PB2, HC, TPB, EB, v1, etc.) and metadata garbage
    clean = clean.replace(/\.(?:RETAIL|INTERNAL|UNABRIDGED|NARRATED|EPUB|PDF|MOBI|AZW3|KFX|MP3|M4B|FLAC|eBook|EBOOK|CTO|BKS|PB\d*|HC|TPB|EB|v\d+|ZLIB|LIBGEN|PROPER|REPACK|READING|AUDIO|AUDIOBOOK)\b/gi, " ");
    clean = clean.replace(/\b(?:RETAIL|INTERNAL|UNABRIDGED|NARRATED|EPUB|PDF|MOBI|AZW3|KFX|MP3|M4B|FLAC|eBook|EBOOK|CTO|BKS|PB\d*|HC|TPB|EB|v\d+|ZLIB|LIBGEN|PROPER|REPACK|READING|AUDIO|AUDIOBOOK)\b/gi, " ");
    
    // Strip trailing scene tags like (Rob Inglis)-PoF, -PoF, (Unabridged), etc.
    clean = clean.replace(/\s*-\s*[A-Za-z0-9]+$/i, "");
    clean = clean.replace(/\s*\([^)]*PoF[^)]*\)/gi, "");
    clean = clean.replace(/\s*\(Rob Inglis\)/gi, "");
    clean = clean.replace(/\s*\(Unabridged\)/gi, "");
    clean = clean.replace(/\s*\(Narrated by [^)]+\)/gi, "");

    // Only strip 4-digit numbers if they look like scene release years (2000-2029) and NOT book title years like 1984
    clean = clean.replace(/\b(20[0-2]\d)\b/g, " ");

    // 2. Normalize scene dots into spaces while preserving author initials (e.g. J.K., J.R.R., G.R.R., C.S.)
    clean = clean.replace(/([a-zA-Z0-9]{2,})\.([a-zA-Z0-9]{2,})/g, "$1 $2");
    clean = clean.replace(/([a-zA-Z0-9]{2,})\.([a-zA-Z0-9])/g, "$1 $2");
    clean = clean.replace(/([a-zA-Z0-9])\.([a-zA-Z0-9]{2,})/g, "$1 $2");
    clean = clean.replace(/[_\.]/g, " ");

    clean = clean.replace(/\s+/g, " ").trim();

    let title = clean;
    let author = "Unknown Author";

    const knownAuthorsRegex = /\b(J\.?\s*K\.?\s*Rowling|J\.?\s*R\.?\s*R\.?\s*Tolkien|George\s+Orwell|G\.?\s*R\.?\s*R\.?\s*Martin|Stephen\s+King|Brandon\s+Sanderson|Agatha\s+Christie|Isaac\s+Asimov|Neil\s+Gaiman|Terry\s+Pratchett|Frank\s+Herbert|Robert\s+Jordan|C\.?\s*S\.?\s*Lewis|James\s+Patterson|Dan\s+Brown|Rick\s+Riordan|Suzanne\s+Collins|H\.?\s*G\.?\s*Wells|Arthur\s+Conan\s+Doyle|Mark\s+Twain|Ernest\s+Hemingway|Charles\s+Dickens)\b/i;

    // 3. Handle " - " separator (Title - Author vs Author - Title)
    if (clean.includes(" - ")) {
        const parts = clean.split(" - ").map(p => p.trim());
        if (parts.length >= 2) {
            const partA = parts[0];
            const partB = parts.slice(1).join(" - ");

            const cleanPartB = partB.replace(/\b(?:PB\d*|v\d+|[A-Z]{2,}\d*)\b/gi, "").trim();
            const partBMatch = cleanPartB.match(knownAuthorsRegex) || cleanPartB.match(/^[A-Z]\.?(?:\s*[A-Z]\.?)*\s+[A-Z][a-zA-Z'\-]+$/i);
            const partAMatch = partA.match(knownAuthorsRegex);

            if (partBMatch && !partAMatch) {
                title = partA;
                author = cleanPartB || partB;
            } else {
                author = partA;
                title = partB;
            }
        }
    } else {
        // 4. Match author at START or END of clean string
        const startAuthorMatch = clean.match(/^(J\.?\s*K\.?\s*Rowling|J\.?\s*R\.?\s*R\.?\s*Tolkien|George\s+Orwell|G\.?\s*R\.?\s*R\.?\s*Martin|Stephen\s+King|Brandon\s+Sanderson|Agatha\s+Christie|Isaac\s+Asimov|Neil\s+Gaiman|Terry\s+Pratchett|Frank\s+Herbert|Robert\s+Jordan|C\.?\s*S\.?\s*Lewis)\b/i);
        if (startAuthorMatch) {
            author = startAuthorMatch[0];
            title = clean.substring(author.length).replace(/^[:\-\s]+/, "").trim();
        } else {
            const endAuthorMatch = clean.match(/\b(J\.?\s*K\.?\s*Rowling|J\.?\s*R\.?\s*R\.?\s*Tolkien|George\s+Orwell|G\.?\s*R\.?\s*R\.?\s*Martin|Stephen\s+King|Brandon\s+Sanderson|Agatha\s+Christie|Isaac\s+Asimov|Neil\s+Gaiman|Terry\s+Pratchett|Frank\s+Herbert|Robert\s+Jordan|C\.?\s*S\.?\s*Lewis)$/i);
            if (endAuthorMatch) {
                author = endAuthorMatch[0];
                title = clean.substring(0, clean.length - author.length).replace(/[:\-\s]+$/, "").trim();
            }
        }
    }

    // Disc / Numbered title fixes
    const isDiscTitle = /^(?:Disc|CD|Part|Vol|Volume)\s*\d+$/i.test(title.trim());
    const isDiscAuthor = /^(?:Disc|CD|Part|Vol|Volume)\s*\d+$/i.test(author.trim());

    if (isDiscTitle && !isDiscAuthor && author !== "Unknown Author") {
        title = author;
        author = "Unknown Author";
    } else if (isDiscAuthor) {
        author = "Unknown Author";
    }

    // Lord of the Rings & Tolkien Master Rules
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes("fellowship of the ring") || lowerTitle.includes("two towers") || lowerTitle.includes("return of the king") || lowerTitle.includes("lord of the rings") || lowerTitle.includes("hobbit")) {
        author = "J. R. R. Tolkien";
        if (lowerTitle.includes("fellowship of the ring")) title = "The Fellowship of the Ring";
        else if (lowerTitle.includes("two towers")) title = "The Two Towers";
        else if (lowerTitle.includes("return of the king")) title = "The Return of the King";
    }

    // Harry Potter & Rowling Master Rules
    if (lowerTitle.includes("harry potter") || lowerTitle.includes("chamber of secrets") || lowerTitle.includes("prisoner of azkaban") || lowerTitle.includes("goblet of fire") || lowerTitle.includes("order of the phoenix") || lowerTitle.includes("half-blood prince") || lowerTitle.includes("deathly hallows") || lowerTitle.includes("philosopher's stone") || lowerTitle.includes("sorcerer's stone")) {
        author = "J. K. Rowling";
    }

    // Handle Title === Author duplication
    if (author.toLowerCase() === title.toLowerCase()) {
        if (lowerTitle.includes("fellowship of the ring") || lowerTitle.includes("two towers") || lowerTitle.includes("return of the king")) {
            author = "J. R. R. Tolkien";
        } else {
            author = "Unknown Author";
        }
    }

    return {
        title: title || clean,
        author,
        cleanQuery: `${title || clean} ${author !== "Unknown Author" ? author : ""}`.trim()
    };
}

function getEffectiveBookBaseName(fullPath: string, file: string, ext: string): string {
    const rawBase = path.basename(file, ext);
    const discPattern = /^(?:Disc|CD|Part|Vol|Volume|Track)\s*\d+$/i;
    const pureNumPattern = /^\d+$/;

    if (discPattern.test(rawBase.trim()) || pureNumPattern.test(rawBase.trim())) {
        const dirName = path.basename(path.dirname(fullPath));
        if (!discPattern.test(dirName.trim()) && !pureNumPattern.test(dirName.trim()) && dirName.length > 2) {
            return dirName;
        }
        const parentDirName = path.basename(path.dirname(path.dirname(fullPath)));
        if (parentDirName && parentDirName !== "." && parentDirName !== "/" && parentDirName.length > 2) {
            return parentDirName;
        }
    }

    const parentFolder = path.basename(path.dirname(fullPath));
    if (discPattern.test(parentFolder.trim())) {
        const grandParentFolder = path.basename(path.dirname(path.dirname(fullPath)));
        if (grandParentFolder && grandParentFolder !== "." && grandParentFolder !== "/" && grandParentFolder.length > 2) {
            return grandParentFolder;
        }
    }

    return rawBase;
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
        const isAudiobookLib = library.mediaType === "audiobook";
        const validExtensions = isAudiobookLib
            ? [".m4b", ".mp3", ".m4a", ".flac", ".aac", ".ogg", ".opus", ".zip", ".rar"]
            : [".pdf", ".epub", ".mobi", ".cbz", ".cbr", ".azw3"];

        const foundMediaItems: { fullPath: string, file: string, ext: string, stats: fs.Stats }[] = [];

        function collectFiles(dir: string, depth = 0) {
            if (!fs.existsSync(dir)) return;
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                const dirAudioFiles = entries.filter(e => !e.isDirectory() && validExtensions.includes(path.extname(e.name).toLowerCase()));
                
                if (isAudiobookLib && dirAudioFiles.length > 1 && depth > 0) {
                    const primary = dirAudioFiles.find(e => path.extname(e.name).toLowerCase() === ".m4b") || dirAudioFiles[0];
                    const primaryPath = path.join(dir, primary.name);
                    let totalSize = 0;
                    for (const af of dirAudioFiles) {
                        try { totalSize += fs.statSync(path.join(dir, af.name)).size; } catch (e) {}
                    }
                    const st = fs.statSync(primaryPath);
                    foundMediaItems.push({
                        fullPath: primaryPath,
                        file: primary.name,
                        ext: path.extname(primary.name).toLowerCase(),
                        stats: { ...st, size: totalSize } as any
                    });
                } else {
                    for (const entry of entries) {
                        const fullP = path.join(dir, entry.name);
                        if (entry.isDirectory()) {
                            if (depth < 2) {
                                collectFiles(fullP, depth + 1);
                            }
                        } else {
                            const ext = path.extname(entry.name).toLowerCase();
                            if (validExtensions.includes(ext)) {
                                try {
                                    const st = fs.statSync(fullP);
                                    foundMediaItems.push({
                                        fullPath: fullP,
                                        file: entry.name,
                                        ext,
                                        stats: st
                                    });
                                } catch (e) {}
                            }
                        }
                    }
                }
            } catch (e) {}
        }

        collectFiles(library.path);

        let finalMediaItems = foundMediaItems;
        if (isAudiobookLib) {
            const consolidatedMap = new Map<string, { fullPath: string, file: string, ext: string, stats: fs.Stats }>();
            for (const item of foundMediaItems) {
                const effBase = getEffectiveBookBaseName(item.fullPath, item.file, item.ext);
                const key = effBase.toLowerCase().trim();
                if (consolidatedMap.has(key)) {
                    const existingItem = consolidatedMap.get(key)!;
                    const accumulatedSize = existingItem.stats.size + item.stats.size;
                    existingItem.stats = { ...existingItem.stats, size: accumulatedSize } as any;
                } else {
                    consolidatedMap.set(key, { ...item });
                }
            }
            finalMediaItems = Array.from(consolidatedMap.values());
        }

        // Safety check to prevent database wipeout due to unmounted remote shares
        if (finalMediaItems.length === 0 && dbBooks.length > 0) {
            console.warn(`[SCANNER] Library directory "${library.path}" contains 0 ${isAudiobookLib ? "audiobook" : "ebook"} files, but the database contains ${dbBooks.length} items. Skipping scan to prevent accidental database wiping (likely due to an unmounted remote share or transient network issue).`);
            return { success: true };
        }

        const matchedDbBookIds = new Set<string>();

        for (const item of finalMediaItems) {
            const { file, ext, stats } = item;
            let fullPath = item.fullPath;

                // Check and handle foreign language ebooks in library folders
                if (isForeignLanguage(file)) {
                    console.log(`[SCANNER] Detected foreign language file in library: ${file}. Deleting file and requesting English copy.`);
                    
                    const cleanBase = path.basename(file, ext);
                    let author = "Unknown Author";
                    let title = cleanBase.replace(/[_-]/g, ' ').trim();
                    if (cleanBase.includes(" - ")) {
                        const parts = cleanBase.split(" - ").map(p => p.trim());
                        if (parts.length >= 2) {
                            author = parts[0];
                            title = parts.slice(1).join(" - ");
                        }
                    }
                    
                    const cleanedTitle = title
                        .replace(/\b(?:epub|pdf|mobi|cbz|ebook|retail|decipher|repack|web|download)\b/gi, "")
                        .replace(/\b(?:swedish|svensk|utgava|german|french|spanish|dutch|italian|danish|norwegian|russian|polish)\b/gi, "")
                        .replace(/\b\d{4}\b/g, "")
                        .replace(/\s+/g, " ")
                        .trim();

                    try {
                        if (fs.existsSync(fullPath)) {
                            fs.unlinkSync(fullPath);
                        }
                    } catch (err: any) {
                        console.error(`[SCANNER] Failed to delete foreign language file ${file}:`, err.message);
                    }

                    const cleanTitleLower = cleanedTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
                    let englishVersionExists = false;
                    const otherFiles = fs.readdirSync(library.path);
                    for (const otherFile of otherFiles) {
                        if (otherFile === file) continue;
                        const otherExt = path.extname(otherFile).toLowerCase();
                        if (validExtensions.includes(otherExt) && !isForeignLanguage(otherFile)) {
                            const otherClean = otherFile.toLowerCase().replace(/[^a-z0-9]/g, "");
                            if (otherClean.includes(cleanTitleLower)) {
                                englishVersionExists = true;
                                break;
                            }
                        }
                    }

                    if (!englishVersionExists) {
                        console.log(`[SCANNER] No English version of "${cleanedTitle}" found. Resetting request or adding request to auto-download...`);
                        
                        let matchedRequest = await prisma.bookRequest.findFirst({
                            where: {
                                OR: [
                                    {
                                        title: { contains: cleanedTitle },
                                        author: { contains: author === "Unknown Author" ? "" : author }
                                    },
                                    {
                                        title: { contains: author === "Unknown Author" ? "" : author },
                                        author: { contains: cleanedTitle }
                                    }
                                ]
                            }
                        });

                        if (matchedRequest) {
                            await prisma.bookRequest.update({
                                where: { id: matchedRequest.id },
                                data: { status: "Searching" }
                            });
                            autoDownloadBookRequest(matchedRequest.id, cleanedTitle, author).catch(err => {
                                console.error(`[SCANNER] Failed to trigger auto-download for request ${matchedRequest.id}:`, err.message);
                            });
                        } else {
                            const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" } });
                            const requestedBy = adminUser ? adminUser.username : "system";
                            const newRequest = await prisma.bookRequest.create({
                                data: {
                                    title: cleanedTitle,
                                    author: author,
                                    requestedBy,
                                    status: "Searching"
                                }
                            });
                            autoDownloadBookRequest(newRequest.id, cleanedTitle, author).catch(err => {
                                console.error(`[SCANNER] Failed to trigger auto-download for request ${newRequest.id}:`, err.message);
                            });
                        }
                    }
                    continue;
                }

                if (ext === ".epub") {
                    try {
                        fullPath = await processEpubForKindle(fullPath);
                    } catch (err: any) {
                        console.warn(`[KINDLE-PROCESS] EPUB check failed for ${file}: ${err.message}`);
                    }
                }

                const existing = dbBooksByPathLower.get(fullPath.toLowerCase());

                if (!existing) {
                    const cleanBase = getEffectiveBookBaseName(fullPath, file, ext);
                    const parsedMeta = parseFilenameMetadata(cleanBase);
                    let title = parsedMeta.title;
                    let author = parsedMeta.author;
                    let coverUrl = "";

                    if (cleanBase.includes(" - ")) {
                        const parts = cleanBase.split(" - ").map(p => p.trim());
                        if (parts.length >= 2) {
                            author = parts[0];
                            title = parts.slice(1).join(" - ");
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
                        } else if (titleLower.endsWith(authLower)) {
                                author = auth;
                                title = title.substring(0, title.length - auth.length).trim();
                                title = title.replace(/[:\-\s]+$/, "").trim();
                                break;
                            }
                        }
                    } catch (e) {}

                    try {
                        const fetchedCover = await fetchBookCover(title, author, library.mediaType || "ebook");
                        if (fetchedCover) {
                            coverUrl = fetchedCover;
                        }
                    } catch (e) {}

                    if (!coverUrl) {
                        try {
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 5000);
                            const searchQuery = author !== "Unknown Author" ? `${title} ${author}` : parsedMeta.cleanQuery;
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
                    }

                    const fileAddedDate = (stats.birthtime && stats.birthtime.getTime() > 0 && stats.birthtime.getFullYear() > 1970)
                        ? stats.birthtime
                        : (stats.mtime || new Date());

                    const newBook = await prisma.book.create({
                        data: {
                            title,
                            author,
                            coverUrl,
                            filePath: fullPath,
                            fileSize: stats.size,
                            fileType: ext.replace(".", ""),
                            mediaType: library.mediaType || "ebook",
                            libraryId: libraryId,
                            createdAt: fileAddedDate
                        }
                    });
                    await renameBookFileOnDisk(newBook.id);
                    matchedDbBookIds.add(newBook.id);
                } else {
                    if (existing.fileSize !== stats.size) {
                        await prisma.book.update({
                            where: { id: existing.id },
                            data: { fileSize: stats.size }
                        });
                        existing.fileSize = stats.size;
                    }
                    let finalPath = fullPath;
                    const cleanBase = getEffectiveBookBaseName(fullPath, path.basename(fullPath), ext);
                    const parsedMeta = parseFilenameMetadata(cleanBase);
                    let parsedAuthor = parsedMeta.author;
                    let parsedTitle = parsedMeta.title;

                    if (cleanBase.includes(" - ")) {
                        const parts = cleanBase.split(" - ").map(p => p.trim());
                        if (parts.length >= 2) {
                            parsedAuthor = parts[0];
                            parsedTitle = parts.slice(1).join(" - ");
                        }
                    }

                    // Check if title and author are swapped in DB
                    const isSwapped = (existing.title.toLowerCase() === parsedAuthor.toLowerCase()) && 
                                      (existing.author.toLowerCase() === parsedTitle.toLowerCase());

                    const isTagAuthor = /^(?:PB\d*|BKS|CTO|RETAIL|EPUB|PDF|MOBI|AZW3|v\d+)\b/i.test(existing.author.trim());
                    const hasTitleHyphen = existing.title.includes(" - ");
                    const hasSceneNoise = existing.title.toLowerCase().includes("retail") ||
                                         existing.title.toLowerCase().includes("epub") ||
                                         existing.title.toLowerCase().includes("cto") ||
                                         (existing.title.includes(".") && existing.title.toLowerCase().includes("the."));
                    
                    const isDiscTitle = /^(?:Disc|CD|Part|Vol|Volume)\s*\d+$/i.test(existing.title.trim());

                    if (isSwapped || existing.author === "Unknown Author" || isTagAuthor || hasSceneNoise || isDiscTitle || hasTitleHyphen || !existing.coverUrl) {
                        let title = (isSwapped || hasSceneNoise || isDiscTitle || hasTitleHyphen || isTagAuthor) ? parsedTitle : existing.title;
                        let author = (isSwapped || existing.author === "Unknown Author" || isTagAuthor || hasTitleHyphen) ? parsedAuthor : existing.author;
                        let coverUrl = existing.coverUrl || "";

                        let tempTitle = parsedTitle;
                        let tempAuthor = parsedAuthor;

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

                        if (tempTitle && tempTitle !== title) title = tempTitle;
                        if (tempAuthor && tempAuthor !== author) author = tempAuthor;

                        if (isDiscTitle && (!title || /^(?:Disc|CD|Part|Vol|Volume)\s*\d+$/i.test(title.trim()))) {
                            if (author && author !== "Unknown Author" && !/^(?:Disc|CD|Part|Vol|Volume)\s*\d+$/i.test(author.trim())) {
                                title = author;
                                author = "Unknown Author";
                            }
                        }

                        if (!coverUrl || isDiscTitle) {
                            try {
                                const fetchedCover = await fetchBookCover(title, author, library.mediaType || "ebook");
                                if (fetchedCover) {
                                    coverUrl = fetchedCover;
                                }
                            } catch (e) {}
                        }

                        const updatedBook = await prisma.book.update({
                            where: { id: existing.id },
                            data: {
                                title,
                                author,
                                coverUrl
                            }
                        });
                        await renameBookFileOnDisk(updatedBook.id);
                    } else {
                        await renameBookFileOnDisk(existing.id);
                    }
                    matchedDbBookIds.add(existing.id);
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

async function getTargetLibraryForUser(username: string, mediaType: string = "ebook") {
    try {
        const libraries = await prisma.library.findMany();
        if (libraries.length === 0) return null;
        
        const matchingMediaLibs = libraries.filter(lib => (lib.mediaType || "ebook") === mediaType);
        const targetPool = matchingMediaLibs.length > 0 ? matchingMediaLibs : libraries;

        const lowerUsername = username.toLowerCase();

        // 1. Find library where this specific user is allowed and NOT restricted
        const userLib = targetPool.find(lib => {
            const restricted = (lib.restrictedUsers || "").split(",").map(u => u.trim().toLowerCase());
            if (restricted.includes(lowerUsername)) return false;

            if (!lib.allowedUsers || lib.allowedUsers === "*") return false;
            const allowed = lib.allowedUsers.split(",").map(u => u.trim().toLowerCase());
            return allowed.includes(lowerUsername);
        });
        if (userLib) return userLib;
        
        // 2. Fallback: Find a library that allows everyone ("*") and user is NOT restricted
        const publicLib = targetPool.find(lib => {
            const restricted = (lib.restrictedUsers || "").split(",").map(u => u.trim().toLowerCase());
            if (restricted.includes(lowerUsername)) return false;
            return lib.allowedUsers === "*";
        });
        if (publicLib) return publicLib;
        
        // 3. Fallback: return the first non-restricted library
        const nonRestricted = targetPool.find(lib => {
            const restricted = (lib.restrictedUsers || "").split(",").map(u => u.trim().toLowerCase());
            return !restricted.includes(lowerUsername);
        });
        return nonRestricted || targetPool[0];
    } catch (e) {
        return null;
    }
}

function getDownloadCategoryForLibrary(libraryName: string, mediaType: string = "ebook"): string {
    const nameLower = libraryName.toLowerCase();
    if (nameLower.includes("kids")) return "kids-books";
    if (nameLower.includes("wife")) return "wife-books";
    if (mediaType === "audiobook" || nameLower.includes("audio")) return "audiobooks";
    return "books";
}

export async function filterReleasesForMediaType(results: any[], mediaType: string = "ebook") {
    if (!results || !Array.isArray(results)) return [];

    const isAudio = mediaType === "audiobook";

    return results.filter((r: any) => {
        if (!r.title || !r.size) return false;
        const titleLower = r.title.toLowerCase();

        // 1. Strict foreign language filter
        if (isForeignLanguage(r.title)) return false;

        // 2. Strict Media Type separation
        if (isAudio) {
            // Must NOT be a plain text ebook format
            const isTextEbook = titleLower.includes(".epub") || 
                              titleLower.includes(".pdf") || 
                              titleLower.includes(".mobi") || 
                              titleLower.includes(".cbz");
            if (isTextEbook) return false;

            // Size: 10 MB to 4 GB
            const isValidAudioSize = r.size >= 10 * 1024 * 1024 && r.size <= 4096 * 1024 * 1024;
            if (!isValidAudioSize) return false;

            const categoryStr = r.categories ? JSON.stringify(r.categories) : (r.category ? String(r.category) : "");
            const isAudioCategory = categoryStr.includes("3030") || categoryStr.includes("3000") || categoryStr.toLowerCase().includes("audiobook");
            
            const hasAudioKeyword = titleLower.includes("m4b") ||
                                    titleLower.includes("mp3") ||
                                    titleLower.includes("audiobook") ||
                                    titleLower.includes("audio book") ||
                                    titleLower.includes("m4a") ||
                                    titleLower.includes("flac") ||
                                    titleLower.includes("aac") ||
                                    titleLower.includes("ogg") ||
                                    titleLower.includes("unabridged") ||
                                    titleLower.includes("narrated");

            return isAudioCategory || hasAudioKeyword;
        } else {
            // EBOOKS
            // Must NOT be an audiobook format
            const isAudiobook = titleLower.includes("audiobook") ||
                                titleLower.includes("audio book") ||
                                titleLower.includes(".m4b") ||
                                titleLower.includes(".mp3") ||
                                titleLower.includes("unabridged") ||
                                titleLower.includes("narrated by");
            if (isAudiobook) return false;

            // Size: 50 KB to 100 MB
            const isValidEbookSize = r.size >= 50 * 1024 && r.size <= 100 * 1024 * 1024;
            if (!isValidEbookSize) return false;

            const hasEbookExtension = titleLower.includes("epub") || 
                                     titleLower.includes("pdf") || 
                                     titleLower.includes("mobi") || 
                                     titleLower.includes("azw3") || 
                                     titleLower.includes("cbz") || 
                                     titleLower.includes("cbr");
            
            const categoryStr = r.categories ? JSON.stringify(r.categories) : (r.category ? String(r.category) : "");
            const isEbookCategory = categoryStr.includes("7000") || categoryStr.includes("7010") || categoryStr.includes("7020") || categoryStr.includes("3040") || categoryStr.toLowerCase().includes("ebook");

            return hasEbookExtension || isEbookCategory || r.size < 20 * 1024 * 1024;
        }
    });
}

export async function autoDownloadBookRequest(requestId: string, title: string, author: string) {
    console.log(`[AUTO-DOWNLOAD] Starting auto-download check for: ${title} by ${author}`);
    
    try {
        const req = await prisma.bookRequest.findUnique({
            where: { id: requestId }
        });
        const requester = req?.requestedBy || "";
        const reqMediaType = req?.mediaType || "ebook";
        
        const targetLib = await getTargetLibraryForUser(requester, reqMediaType);
        const category = targetLib ? getDownloadCategoryForLibrary(targetLib.name, reqMediaType) : (reqMediaType === "audiobook" ? "audiobooks" : "books");

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
        const cleanedQuery = cleanSearchQuery(queryText);

        const catQuery = reqMediaType === "audiobook"
            ? "&categories=3030&categories=3000&categories=7000"
            : "&categories=7000&categories=7010&categories=7020&categories=3040";

        const searchUrl = `${prowlarrUrl}/api/v1/search?query=${encodeURIComponent(cleanedQuery)}${catQuery}&apikey=${prowlarrKey}`;
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

        const candidates = await filterReleasesForMediaType(results, reqMediaType);

        if (candidates.length === 0) {
            await prisma.bookRequest.update({
                where: { id: requestId },
                data: { status: `Failed - No suitable ${reqMediaType} releases found` }
            });
            return;
        }

        candidates.sort((a: any, b: any) => {
            if (a.protocol === "usenet" && b.protocol !== "usenet") return -1;
            if (a.protocol !== "usenet" && b.protocol === "usenet") return 1;
            if (a.protocol === "torrent" && b.protocol === "torrent") {
                return (b.seeders || 0) - (a.seeders || 0);
            }
            return 0;
        });

        const selectedRelease = candidates[0];
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
        monitorAndRetryDownload(requestId, candidates, 0, downloadId).catch(err => {
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

export async function searchProwlarrIndexers(query: string, mediaType: string = "ebook") {
    await verifyUser();
    
    const prowlarrApp = await prisma.mediaApp.findFirst({
        where: { type: "prowlarr" }
    });
    
    if (!prowlarrApp) {
        throw new Error("Prowlarr is not configured in Portalarr Settings. Please add it first under Settings.");
    }
    
    const prowlarrUrl = cleanUrl(prowlarrApp.url);
    const prowlarrKey = decryptData(prowlarrApp.apiKey as string);
    const cleanedQuery = cleanSearchQuery(query);
    
    try {
        const catQuery = mediaType === "audiobook"
            ? "&categories=3030&categories=3000&categories=7000"
            : "&categories=7000&categories=7010&categories=7020&categories=3040";

        const searchUrl = `${prowlarrUrl}/api/v1/search?query=${encodeURIComponent(cleanedQuery)}${catQuery}&apikey=${prowlarrKey}`;
        const res = await fetch(searchUrl, { cache: "no-store" });
        if (!res.ok) {
            throw new Error(`Prowlarr returned status ${res.status}`);
        }
        
        const results = await res.json();
        const filtered = await filterReleasesForMediaType(results, mediaType);
        
        return filtered.map((r: any) => ({
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
    const session = await verifyUser();
    
    const req = await prisma.bookRequest.findUnique({
        where: { id: requestId }
    });
    if (!req) {
        throw new Error("Request not found");
    }
    
    if (session.role !== "ADMIN" && req.requestedBy !== session.username) {
        throw new Error("You are not authorized to grab releases for this request");
    }
    
    const requester = req.requestedBy || "";
    const reqMediaType = req.mediaType || "ebook";
    const targetLib = await getTargetLibraryForUser(requester, reqMediaType);
    const category = targetLib ? getDownloadCategoryForLibrary(targetLib.name, reqMediaType) : (reqMediaType === "audiobook" ? "audiobooks" : "books");
    
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

async function deleteDownload(protocol: string, downloadId: string, title: string): Promise<boolean> {
    try {
        if (protocol === "usenet") {
            const sabApp = await prisma.mediaApp.findFirst({ where: { type: "sabnzbd" } });
            if (sabApp) {
                const sabUrl = cleanUrl(sabApp.url);
                const sabKey = decryptData(sabApp.apiKey as string);
                const res1 = await fetch(`${sabUrl}/api?mode=queue&name=delete&value=${downloadId}&apikey=${sabKey}`);
                const res2 = await fetch(`${sabUrl}/api?mode=history&name=delete&value=${downloadId}&del_files=1&apikey=${sabKey}`);
                return res1.ok && res2.ok;
            }
            return false;
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

                    const res = await fetch(`${qbitUrl}/api/v2/torrents/delete`, {
                        method: "POST",
                        body: new URLSearchParams({ hashes: hash, deleteFiles: "true" }),
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded",
                            ...(cookieHeader ? { "Cookie": cookieHeader } : {})
                        }
                    });
                    return res.ok;
                }
            }
            return false;
        }
    } catch (e) {
        console.error("Failed to delete download from client:", e);
        return false;
    }
}

function findDownloadedFile(dir: string, bookTitle: string, mediaType: string = "ebook"): string | null {
    console.log(`[DOWNLOAD-FINDER] Scanning directory: ${dir} for ${mediaType}: "${bookTitle}"`);
    if (!fs.existsSync(dir)) {
        console.log(`[DOWNLOAD-FINDER] Directory does not exist: ${dir}`);
        return null;
    }
    
    const cleanBookTitle = bookTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
    
    const stopWords = new Set(["and", "the", "for", "with", "from", "that", "this", "these", "those", "a", "an", "of", "to", "in", "on", "at", "by", "or", "but", "as", "is", "are", "was", "were", "be", "been", "has", "have", "had", "do", "does", "did", "epub", "pdf", "mobi", "cbz", "m4b", "mp3", "flac"]);
    
    const titleWords = bookTitle.toLowerCase()
        .split(/[^a-z0-9]/)
        .filter(w => w.length > 2 && !stopWords.has(w));
        
    let finalTitleWords = titleWords;
    if (finalTitleWords.length === 0) {
        finalTitleWords = bookTitle.toLowerCase().split(/[^a-z0-9]/).filter(w => w.length > 0);
    }
    
    const validExtensions = mediaType === "audiobook"
        ? [".m4b", ".mp3", ".m4a", ".flac", ".aac", ".ogg", ".opus", ".zip", ".rar"]
        : [".epub", ".pdf", ".mobi", ".cbz", ".cbr", ".azw3"];
    
    try {
        const files = fs.readdirSync(dir);
        console.log(`[DOWNLOAD-FINDER] Found ${files.length} items in ${dir}`);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                const found = findDownloadedFile(fullPath, bookTitle, mediaType);
                if (found) return found;
            } else {
                const ext = path.extname(file).toLowerCase();
                if (validExtensions.includes(ext)) {
                    const cleanFileName = file.toLowerCase().replace(/[^a-z0-9]/g, "");
                    console.log(`[DOWNLOAD-FINDER] Inspecting file: ${file} (clean: ${cleanFileName})`);
                    
                    if (cleanFileName.includes(cleanBookTitle) || cleanBookTitle.includes(cleanFileName.replace(/(epub|pdf|mobi|cbz|m4b|mp3|m4a|flac)$/, ""))) {
                        console.log(`[DOWNLOAD-FINDER] MATCH FOUND: ${fullPath} (direct title match)`);
                        return fullPath;
                    }
                    
                    let matchCount = 0;
                    for (const word of finalTitleWords) {
                        if (file.toLowerCase().includes(word)) {
                            matchCount++;
                        }
                    }
                    
                    const requiredMatches = Math.max(1, Math.ceil(finalTitleWords.length * 0.65));
                    console.log(`[DOWNLOAD-FINDER] Word match count: ${matchCount}/${finalTitleWords.length} (needed at least ${requiredMatches})`);
                    if (finalTitleWords.length > 0 && matchCount >= requiredMatches) {
                        console.log(`[DOWNLOAD-FINDER] MATCH FOUND: ${fullPath} (fuzzy word match)`);
                        return fullPath;
                    }
                }
            }
        }
    } catch (e: any) {
        console.error(`[BACKGROUND-DOWNLOAD-FINDER] Error reading directory ${dir}:`, e.message);
        return null;
    }
    return null;
}

function copyFolderRecursiveSync(source: string, target: string) {
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
    }
    const files = fs.readdirSync(source, { withFileTypes: true });
    for (const file of files) {
        const srcPath = path.join(source, file.name);
        const destPath = path.join(target, file.name);
        if (file.isDirectory()) {
            copyFolderRecursiveSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
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
            
            await delay(5000);
            
            let targetLib: any = null;
            let copySuccessful = false;
            try {
                const reqMedia = currentReq?.mediaType || "ebook";
                targetLib = await getTargetLibraryForUser(currentReq.requestedBy, reqMedia);
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
                            foundFilePath = findDownloadedFile(p, currentReq.title, reqMedia);
                            if (foundFilePath) break;
                        }
                    }

                    if (foundFilePath) {
                        if (isForeignLanguage(path.basename(foundFilePath))) {
                            console.warn(`[AUTO-DOWNLOAD-MONITOR] Completed download file "${path.basename(foundFilePath)}" matches foreign language indicators. Deleting and marking download as failed to retry English releases.`);
                            
                            try {
                                await deleteDownload(release.protocol, downloadId, release.title);
                            } catch (e) {}
                            
                            try {
                                if (fs.existsSync(foundFilePath)) {
                                    fs.unlinkSync(foundFilePath);
                                }
                            } catch (e) {}
                            
                            downloadStatus = "failed";
                        } else {
                            if (!fs.existsSync(targetLib.path)) {
                                fs.mkdirSync(targetLib.path, { recursive: true });
                            }

                            const parentFolder = path.dirname(foundFilePath);
                            const discPattern = /^(?:Disc|CD|Part|Vol|Volume)\s*\d+$/i;
                            const isDiscSubfolder = discPattern.test(path.basename(parentFolder).trim());
                            const rootBookFolder = isDiscSubfolder ? path.dirname(parentFolder) : parentFolder;

                            const isRootDownloadsDir = rootBookFolder === configuredPath || 
                                                       rootBookFolder === "/downloads" || 
                                                       rootBookFolder === "./downloads" || 
                                                       rootBookFolder === "/app/downloads" || 
                                                       rootBookFolder === process.env.DOWNLOADS_DIR;

                            let finalDestPath = "";

                            if (!isRootDownloadsDir && fs.existsSync(rootBookFolder) && fs.statSync(rootBookFolder).isDirectory()) {
                                const folderName = path.basename(rootBookFolder);
                                const destFolder = path.join(targetLib.path, folderName);
                                console.log(`[AUTO-DOWNLOAD-MONITOR] Copying complete multi-disc/multi-track folder from ${rootBookFolder} to ${destFolder}`);
                                copyFolderRecursiveSync(rootBookFolder, destFolder);
                                copySuccessful = true;
                                finalDestPath = path.join(destFolder, path.basename(foundFilePath));
                            } else {
                                const destPath = path.join(targetLib.path, path.basename(foundFilePath));
                                console.log(`[AUTO-DOWNLOAD-MONITOR] Moving downloaded file from ${foundFilePath} to ${destPath}`);
                                fs.copyFileSync(foundFilePath, destPath);
                                copySuccessful = true;
                                finalDestPath = destPath;
                            }
                            
                            const ext = path.extname(finalDestPath).toLowerCase();
                            if (ext === ".mobi") {
                                try {
                                    const epubPath = finalDestPath.replace(/\.mobi$/i, ".epub");
                                    console.log(`[AUTO-DOWNLOAD-MONITOR] Attempting to convert MOBI to EPUB: ${finalDestPath} -> ${epubPath}`);
                                    const { exec } = require("child_process");
                                    const { promisify } = require("util");
                                    const execAsync = promisify(exec);
                                    
                                    let hasConverter = false;
                                    try {
                                        await execAsync("which ebook-convert");
                                        hasConverter = true;
                                    } catch (e) {
                                        console.log("[AUTO-DOWNLOAD-MONITOR] ebook-convert is not in PATH. Skipping MOBI conversion.");
                                    }
                                    
                                    if (hasConverter) {
                                        await execAsync(`ebook-convert "${finalDestPath}" "${epubPath}" --language en`);
                                        if (fs.existsSync(epubPath)) {
                                            fs.unlinkSync(finalDestPath);
                                            finalDestPath = epubPath;
                                            console.log(`[AUTO-DOWNLOAD-MONITOR] MOBI successfully converted to EPUB!`);
                                        }
                                    }
                                } catch (convErr: any) {
                                    console.error(`[AUTO-DOWNLOAD-MONITOR] MOBI to EPUB conversion failed:`, convErr.message);
                                }
                            }
                            
                            // Sanitize and flatten formatting (Mobi-Bounce)
                            try {
                                await mobiBounceEpub(finalDestPath);
                            } catch (bounceErr: any) {
                                console.error(`[AUTO-DOWNLOAD-MONITOR] Mobi-Bounce failed for ${finalDestPath}:`, bounceErr.message);
                            }
                            
                            let clientDeleted = false;
                            try {
                                try {
                                    console.log(`[AUTO-DOWNLOAD-MONITOR] Requesting client to delete completed download: ${release.title}`);
                                    clientDeleted = await deleteDownload(release.protocol, downloadId, release.title);
                                } catch (delErr: any) {
                                    console.error(`[AUTO-DOWNLOAD-MONITOR] Failed to delete completed download from client:`, delErr.message);
                                }

                                try {
                                    fs.chmodSync(foundFilePath, 0o666);
                                } catch (e) {}

                                if (fs.existsSync(foundFilePath)) {
                                    try { fs.unlinkSync(foundFilePath); } catch (e) {}
                                    console.log(`[AUTO-DOWNLOAD-MONITOR] Successfully deleted original file from downloads.`);
                                }
                                
                                if (!isRootDownloadsDir && fs.existsSync(rootBookFolder)) {
                                    try {
                                        fs.rmdirSync(rootBookFolder, { recursive: true });
                                        console.log(`[AUTO-DOWNLOAD-MONITOR] Cleaned up completed download folder: ${rootBookFolder}`);
                                    } catch (e) {}
                                }
                            } catch (unlinkErr: any) {
                                if (!clientDeleted) {
                                    console.warn(`[AUTO-DOWNLOAD-MONITOR] Copied file successfully but failed to delete the source file/folder from downloads directory:`, unlinkErr.message);
                                    console.warn(`[AUTO-DOWNLOAD-MONITOR] TIP: Ensure your Docker volume mounts and PUID/PGID permissions allow the app to write/delete inside the downloads folder.`);
                                } else {
                                    console.log(`[AUTO-DOWNLOAD-MONITOR] Cleanup: Manual deletion skipped or failed (likely handled by download client):`, unlinkErr.message);
                                }
                            }
                            console.log(`[AUTO-DOWNLOAD-MONITOR] Successfully moved file to library path.`);
                        }
                    } else {
                        console.warn(`[AUTO-DOWNLOAD-MONITOR] Could not find completed download file for "${currentReq.title}" in download directories.`);
                    }
                }
            } catch (moveErr: any) {
                console.error(`[AUTO-DOWNLOAD-MONITOR] Failed to move downloaded file to library:`, moveErr);
            }
            
            if (copySuccessful) {
                const req = await prisma.bookRequest.update({
                    where: { id: requestId },
                    data: { status: "Downloaded" }
                });

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
                    
                    if (bTitleClean.includes(reqTitleClean) || reqTitleClean.includes(bTitleClean)) return true;
                    if (bAuthorClean.includes(reqTitleClean) || reqTitleClean.includes(bAuthorClean)) return true;
                    
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
            const currentReq = await prisma.bookRequest.findUnique({ where: { id: requestId } });
            const reqMedia = currentReq?.mediaType || "ebook";
            const requester = currentReq?.requestedBy || "";
            const backupLib = await getTargetLibraryForUser(requester, reqMedia);
            const nextCategory = backupLib ? getDownloadCategoryForLibrary(backupLib.name, reqMedia) : (reqMedia === "audiobook" ? "audiobooks" : "books");
            
            let nextDownloadId = "";
            if (nextRelease.protocol === "usenet") {
                const sabApp = await prisma.mediaApp.findFirst({ where: { type: "sabnzbd" } });
                if (!sabApp) throw new Error("SABnzbd not configured");
                const sabUrl = cleanUrl(sabApp.url);
                const sabKey = decryptData(sabApp.apiKey as string);
                
                const pushUrl = `${sabUrl}/api?mode=addurl&name=${encodeURIComponent(nextRelease.downloadUrl)}&nzbname=${encodeURIComponent(nextRelease.title)}&cat=${nextCategory}&output=json&apikey=${sabKey}`;
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
                        body: new URLSearchParams({ urls: nextRelease.downloadUrl, category: nextCategory }),
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
                        body: new URLSearchParams({ urls: nextRelease.downloadUrl, category: nextCategory }),
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

export async function sendBookToKindle(bookId: string, targetUsername?: string) {
    try {
        const session = await verifyUser();
        const isAdmin = session.role === "ADMIN";
        
        let username = session.username as string;
        if (isAdmin && targetUsername) {
            username = targetUsername;
        }

        const user = await prisma.user.findUnique({
            where: { username }
        });
        
        if (!user) return { success: false, error: "User not found" };
        if (!user.kindleEmail) {
            return { success: false, error: "Please configure your Send-to-Kindle email address in your library settings first." };
        }

        const book = await prisma.book.findUnique({
            where: { id: bookId },
            include: { library: true }
        });
        if (!book) return { success: false, error: "Book not found" };

        const hasAccess = await checkLibraryAccess(
            book.library.allowedUsers,
            book.library.restrictedUsers || "",
            username,
            (user?.email || session.email || "") as string,
            (session.role || "") as string
        );
        if (!hasAccess) return { success: false, error: "Unauthorized access to this library book" };

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

export async function sendBookToPersonalEmail(bookId: string, targetUsername?: string) {
    try {
        const session = await verifyUser();
        const isAdmin = session.role === "ADMIN";
        
        let username = session.username as string;
        if (isAdmin && targetUsername) {
            username = targetUsername;
        }

        const user = await prisma.user.findUnique({
            where: { username }
        });
        
        if (!user) return { success: false, error: "User account not found." };
        if (!user.email) {
            return { success: false, error: "No personal email address associated with your user account." };
        }

        const book = await prisma.book.findUnique({
            where: { id: bookId }
        });
        if (!book) return { success: false, error: "File not found in database." };
        if (!fs.existsSync(book.filePath)) {
            return { success: false, error: "Media file not found on disk. Try scanning the library again." };
        }

        const settings = await prisma.settings.findFirst({ where: { id: "global" } }) || {} as any;
        if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
            return { success: false, error: "SMTP email is not configured on this server. Please contact your administrator." };
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

        const isAudio = book.mediaType === "audiobook";
        const itemTypeLabel = isAudio ? "Audiobook" : "Ebook";

        const mailOptions = {
            from: senderEmail,
            to: user.email,
            subject: `📦 Portalarr Delivery: ${book.title}`,
            html: `
                <div style="font-family: sans-serif; padding: 24px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                    <h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">${itemTypeLabel} File Delivery</h2>
                    <p style="font-size: 15px; color: #475569;">Hi <strong>${user.username}</strong>,</p>
                    <p style="font-size: 15px; color: #475569;">Here is your requested ${itemTypeLabel.toLowerCase()} file for <strong>${book.title}</strong> by ${book.author || "Unknown Author"}.</p>
                    
                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
                        <p style="margin: 0; font-size: 14px; color: #334155;"><strong>Title:</strong> ${book.title}</p>
                        <p style="margin: 4px 0 0 0; font-size: 14px; color: #334155;"><strong>Author:</strong> ${book.author || "Unknown Author"}</p>
                        <p style="margin: 4px 0 0 0; font-size: 14px; color: #334155;"><strong>Format:</strong> ${ext.replace(".", "").toUpperCase()}</p>
                    </div>

                    <p style="font-size: 13px; color: #64748b;">The media file is attached directly to this email so you can save or transfer it to your device.</p>
                </div>
            `,
            attachments: [
                {
                    filename: cleanAttachmentName,
                    path: book.filePath
                }
            ]
        };

        await transporter.sendMail(mailOptions);
        console.log(`[SMTP-DELIVERY] Successfully emailed ${book.title} to ${user.email}`);
        return { success: true };
    } catch (e: any) {
        console.error(`[SMTP-DELIVERY] Failed to email file:`, e);
        return { success: false, error: e.message || "Failed to deliver email." };
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

        const username = (session.username as string).toLowerCase();
        
        const libs = await prisma.library.findMany();

        const filtered = libs.filter(lib => {
            const restricted = (lib.restrictedUsers || "").split(",").map(u => u.trim().toLowerCase());
            if (restricted.includes(username)) return false;

            if (lib.allowedUsers === "*") return true;
            const users = lib.allowedUsers.split(",").map(u => u.trim().toLowerCase());
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

export async function createMultipleBookRequests(booksList: { title: string, author: string, coverUrl: string, publishYear: string }[], requestedFor?: string, mediaType: string = "ebook") {
    const session = await verifyUser();
    const isAdmin = session.role === "ADMIN";
    if (!booksList || booksList.length === 0) return;
    
    let targetUser = session.username as string;
    if (isAdmin && requestedFor) {
        targetUser = requestedFor;
    }
    
    for (const book of booksList) {
        const request = await prisma.bookRequest.create({
            data: {
                title: book.title,
                author: book.author,
                coverUrl: book.coverUrl,
                publishYear: book.publishYear,
                requestedBy: targetUser,
                type: "book",
                mediaType: mediaType,
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
            title: `${booksList.length} ${mediaType === "audiobook" ? "Audiobooks" : "Books"} from checklist`,
            author: listText,
            requestedBy: targetUser,
            type: "checklist",
            mediaType,
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

export async function retryBookRequest(requestId: string) {
    const session = await verifyUser();
    
    const request = await prisma.bookRequest.findUnique({
        where: { id: requestId }
    });
    if (!request) throw new Error("Request not found");
    
    if (session.role !== "ADMIN" && request.requestedBy !== session.username) {
        throw new Error("Unauthorized");
    }
    
    await prisma.bookRequest.update({
        where: { id: requestId },
        data: { status: "Pending" }
    });
    
    autoDownloadBookRequest(requestId, request.title, request.author || "").catch(err => {
        console.error(`[AUTO-DOWNLOAD-RETRY] Failed for request "${request.title}":`, err);
    });
    
    revalidatePath("/library");
    return { success: true };
}

// ============================================================================
// --- PLEX FRIENDS AUTO-SCAN & SYNC ACTIONS ---
// ============================================================================

export async function syncPlexFriendsInternal() {
    console.log("[PLEX-SYNC] Starting Plex friends scanning and user account sync...");
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        if (!settings?.mainPlexToken) {
            console.log("[PLEX-SYNC] Skipped: Server Admin has not configured a Plex Token in Settings.");
            return { success: false, error: "Admin Plex Token is not configured. Go to Settings -> General Setup to enter your Admin Plex Token (or sign in once with Plex)." };
        }

        const adminToken = decryptData(settings.mainPlexToken);

        // Fetch all Plex Friends & Shared Users across API endpoints
        const friendsList = await getPlexServerFriends(adminToken);
        console.log(`[PLEX-SYNC] Fetched ${friendsList.length} Plex friends from server.`);

        // Fetch Plex Admin Owner profile
        let adminPlexProfile: any = null;
        try {
            const adminRes = await fetch("https://plex.tv/api/v2/user", {
                headers: {
                    "Accept": "application/json",
                    "X-Plex-Token": adminToken,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                }
            });
            if (adminRes.ok) {
                adminPlexProfile = await adminRes.json();
            }
        } catch (adminErr) {
            console.warn("[PLEX-SYNC] Could not fetch admin Plex profile:", adminErr);
        }

        const dbUsers = await prisma.user.findMany();
        let addedCount = 0;
        let updatedCount = 0;
        let revokedCount = 0;

        const activePlexEmails = new Set<string>();
        const activePlexUsernames = new Set<string>();

        if (adminPlexProfile) {
            const adminUserObj = adminPlexProfile.user || adminPlexProfile;
            if (adminUserObj.email) activePlexEmails.add(adminUserObj.email.toLowerCase().trim());
            if (adminUserObj.username) activePlexUsernames.add(adminUserObj.username.toLowerCase().trim());
            if (adminUserObj.title) activePlexUsernames.add(adminUserObj.title.toLowerCase().trim());
        }

        for (const friend of friendsList) {
            const fEmail = (friend.email || "").toLowerCase().trim();
            const fUsername = (friend.username || (fEmail ? fEmail.split('@')[0] : "")).trim();

            if (!fEmail && !fUsername) continue;

            if (fEmail) activePlexEmails.add(fEmail);
            if (fUsername) activePlexUsernames.add(fUsername.toLowerCase());

            // Match existing user by email or username (case-insensitive)
            let existingUser = dbUsers.find(u => 
                (fEmail && u.email.toLowerCase() === fEmail) ||
                (fUsername && u.username.toLowerCase() === fUsername.toLowerCase())
            );

            if (existingUser) {
                // Update existing user details/status if needed
                let needsUpdate = false;
                const updateData: any = {};

                if (existingUser.role !== "ADMIN" && existingUser.status !== "APPROVED") {
                    updateData.status = "APPROVED";
                    needsUpdate = true;
                }

                if (fEmail && existingUser.email.toLowerCase() !== fEmail) {
                    const conflict = dbUsers.find(u => u.id !== existingUser!.id && u.email.toLowerCase() === fEmail);
                    if (!conflict) {
                        updateData.email = fEmail;
                        needsUpdate = true;
                    }
                }

                if (needsUpdate) {
                    await prisma.user.update({
                        where: { id: existingUser.id },
                        data: updateData
                    });
                    updatedCount++;
                }
            } else {
                // Create new approved user account for friend
                let baseUsername = fUsername || (fEmail ? fEmail.split('@')[0] : "plex_friend");
                baseUsername = baseUsername.replace(/[^a-zA-Z0-9_\-]/g, "_");
                if (!baseUsername) baseUsername = "plex_friend";

                let safeUsername = baseUsername;
                let counter = 1;
                while (dbUsers.some(u => u.username.toLowerCase() === safeUsername.toLowerCase())) {
                    safeUsername = `${baseUsername}_${counter}`;
                    counter++;
                }

                let safeEmail = fEmail;
                if (!safeEmail || dbUsers.some(u => u.email.toLowerCase() === safeEmail.toLowerCase())) {
                    safeEmail = `${safeUsername.toLowerCase()}@plex.local`;
                }

                const randomPassword = Math.random().toString(36).slice(-16) + "Plex!1";
                const hashedPassword = await hash(randomPassword, 10);

                const newUser = await prisma.user.create({
                    data: {
                        username: safeUsername,
                        email: safeEmail,
                        password: hashedPassword,
                        role: "USER",
                        status: "APPROVED"
                    }
                });

                dbUsers.push(newUser);
                addedCount++;
            }
        }

        // Revoke access for users no longer in Plex friends list (excluding ADMIN accounts)
        for (const user of dbUsers) {
            if (user.role === "ADMIN") continue;
            
            const isListedInPlex = 
                (user.email && activePlexEmails.has(user.email.toLowerCase())) ||
                (user.username && activePlexUsernames.has(user.username.toLowerCase()));

            if (!isListedInPlex && user.status === "APPROVED") {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { status: "REJECTED" }
                });
                revokedCount++;
            }
        }

        await prisma.settings.upsert({
            where: { id: "global" },
            update: { lastAutoSync: new Date() },
            create: { id: "global", lastAutoSync: new Date() }
        });

        console.log(`[PLEX-SYNC] Completed. Friends: ${friendsList.length}, Added: ${addedCount}, Updated: ${updatedCount}, Revoked: ${revokedCount}`);
        return {
            success: true,
            totalFriends: friendsList.length,
            addedCount,
            updatedCount,
            revokedCount
        };

    } catch (e: any) {
        console.error("[PLEX-SYNC] Error during Plex friends sync:", e.message || e);
        return { success: false, error: e.message || "Failed to sync Plex friends" };
    }
}

export async function syncPlexFriendsAction() {
    await verifyAdmin();
    const result = await syncPlexFriendsInternal();
    revalidatePath("/settings");
    revalidatePath("/settings/access");
    return result;
}

export async function refreshBookCover(bookId: string) {
    await verifyUser();
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) return { success: false, error: "Book not found" };

    let title = book.title;
    let author = book.author || "";

    // Clean scene noise (e.g. "(Rob Inglis)-PoF", "-PoF", "03 - The Two Towers")
    title = title.replace(/\s*-\s*[A-Za-z0-9]+$/i, "")
                 .replace(/\s*\([^)]*PoF[^)]*\)/gi, "")
                 .replace(/\s*\(Rob Inglis\)/gi, "")
                 .replace(/\s*\(Unabridged\)/gi, "")
                 .replace(/\s*\(Narrated by [^)]+\)/gi, "")
                 .replace(/^[0-9]{2}\s*-\s*/, "")
                 .trim();

    const isDiscTitle = /^(?:Disc|CD|Part|Vol|Volume)\s*\d+$/i.test(title.trim());
    if (isDiscTitle && author && author !== "Unknown Author" && !/^(?:Disc|CD|Part|Vol|Volume)\s*\d+$/i.test(author.trim())) {
        title = author;
        author = "Unknown Author";
    }

    // Lord of the Rings & Tolkien Master Rules
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes("fellowship of the ring") || lowerTitle.includes("two towers") || lowerTitle.includes("return of the king") || lowerTitle.includes("lord of the rings") || lowerTitle.includes("hobbit")) {
        author = "J. R. R. Tolkien";
        if (lowerTitle.includes("fellowship of the ring")) title = "The Fellowship of the Ring";
        else if (lowerTitle.includes("two towers")) title = "The Two Towers";
        else if (lowerTitle.includes("return of the king")) title = "The Return of the King";
        else if (lowerTitle.includes("hobbit")) title = "The Hobbit";
    }

    // Harry Potter & Rowling Master Rules
    if (lowerTitle.includes("harry potter") || lowerTitle.includes("chamber of secrets") || lowerTitle.includes("prisoner of azkaban") || lowerTitle.includes("goblet of fire") || lowerTitle.includes("order of the phoenix") || lowerTitle.includes("half-blood prince") || lowerTitle.includes("deathly hallows") || lowerTitle.includes("philosopher's stone") || lowerTitle.includes("sorcerer's stone")) {
        author = "J. K. Rowling";
    }

    const newCover = await fetchBookCover(title, author, book.mediaType || "ebook");
    if (newCover) {
        await prisma.book.update({
            where: { id: bookId },
            data: { 
                coverUrl: newCover,
                title,
                author: author && author !== "Unknown Author" ? author : book.author
            }
        });
        revalidatePath("/library");
        return { success: true, coverUrl: newCover };
    }
    return { success: false, error: "No cover artwork found across iTunes, Open Library, or Google Books." };
}