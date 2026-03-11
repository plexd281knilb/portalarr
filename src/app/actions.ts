"use server";

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { scanEmailAccounts } from "@/lib/email-scanner"; 
import { hash } from "bcryptjs"; 
import nodemailer from "nodemailer"; 

const prisma = new PrismaClient();

// --- HELPER: Fix Date Offsets ---
function parseDate(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;
    return dateStr.includes("T") ? new Date(dateStr) : new Date(`${dateStr}T12:00:00Z`);
}

// --- HELPER: Clean URL (Removes trailing slashes) ---
function cleanUrl(url: string): string {
    if (!url) return "";
    return url.replace(/\/$/, ""); // Removes trailing slash if present
}

// --- DATA FETCHERS ---

export async function getSubscribers() {
    await checkOverdueStatus(); 
    return await prisma.subscriber.findMany({ orderBy: { name: 'asc' } });
}

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

export async function getGlancesNodeDetails(id: string) {
  const { fetchGlancesNodeDetails } = await import("@/app/data");
  return await fetchGlancesNodeDetails(id);
}

// --- ACTION: CHECK OVERDUE STATUS ---
export async function checkOverdueStatus() {
    await prisma.subscriber.updateMany({
        where: {
            status: "Active",
            nextPaymentDate: { lt: new Date() } 
        },
        data: {
            status: "Overdue"
        }
    });
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

export async function saveFeeSettings(monthly: number, yearly: number) {
    await prisma.settings.upsert({
        where: { id: "global" },
        update: { monthlyFee: monthly, yearlyFee: yearly },
        create: { id: "global", monthlyFee: monthly, yearlyFee: yearly }
    });
    revalidatePath("/payments");
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
  const externalUrl = formData.get("externalUrl") as string; // <--- Capture this
  const apiKey = formData.get("apiKey") as string;
  
  await prisma.mediaApp.create({ 
      data: { 
          type, 
          name, 
          url, 
          externalUrl: externalUrl || null, // Save as null if empty
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

// --- SUBSCRIBER ACTIONS ---

export async function updateSubscriber(id: string, data: any) {
    await prisma.subscriber.update({
        where: { id },
        data: {
            name: data.name,
            fullName: data.fullName,
            email: data.email,
            status: data.status,
            billingCycle: data.billingCycle,
            nextPaymentDate: parseDate(data.nextPaymentDate),
            // CHANGE THIS LINE: Use 'undefined' instead of 'null'
            lastPaymentAmount: data.lastPaymentAmount ? parseFloat(data.lastPaymentAmount) : undefined, 
            lastPaymentDate: parseDate(data.lastPaymentDate),
            notes: data.notes
        }
    });
    revalidatePath("/users");
    revalidatePath("/payments");
}

export async function addManualSubscriber(data: any) {
    await prisma.subscriber.create({
        data: {
            name: data.name,
            fullName: data.fullName,
            email: data.email,
            status: data.status || "Active",
            billingCycle: data.billingCycle || "Monthly",
            nextPaymentDate: parseDate(data.nextPaymentDate),
            // CHANGE THIS LINE AS WELL
            lastPaymentAmount: data.lastPaymentAmount ? parseFloat(data.lastPaymentAmount) : 0, // Default to 0 for new creation if empty
            lastPaymentDate: parseDate(data.lastPaymentDate),
            notes: data.notes
        }
    });
    revalidatePath("/users");
}

export async function bulkUpdateSubscribers(ids: string[], data: any) {
    const updateData: any = {};
    if (data.status && data.status !== "no-change") updateData.status = data.status;
    if (data.billingCycle && data.billingCycle !== "no-change") updateData.billingCycle = data.billingCycle;
    if (data.nextPaymentDate) updateData.nextPaymentDate = parseDate(data.nextPaymentDate);

    if (Object.keys(updateData).length > 0) {
        await prisma.subscriber.updateMany({
            where: { id: { in: ids } },
            data: updateData
        });
        revalidatePath("/users");
    }
}

export async function deleteSubscriber(id: string) {
    const user = await prisma.subscriber.findUnique({ where: { id } });
    if (user && user.plexId) {
        try {
            await prisma.ignoredUser.create({
                data: { plexId: user.plexId, name: user.name || "Unknown" }
            });
        } catch(e) { /* already ignored */ }
    }
    await prisma.subscriber.delete({ where: { id } });
    revalidatePath("/users");
}

export async function syncTautulliUsers() {
    const { performSync } = await import("@/app/data");
    const result = await performSync();
    revalidatePath("/users");
    return result; 
}

export async function clearIgnoreList() {
    await prisma.ignoredUser.deleteMany({});
    revalidatePath("/users");
}

// --- PAYMENT ACTIONS ---

export async function getPayments() {
    return await prisma.payment.findMany({ 
        orderBy: { date: 'desc' },
        include: { subscriber: true } 
    });
}

export async function addManualPayment(data: any) {
    await prisma.payment.create({
        data: {
            provider: data.provider,
            payerName: data.payerName,
            amount: parseFloat(data.amount),
            date: parseDate(data.date) || new Date(),
            status: "Unlinked",
            externalId: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
        }
    });
    revalidatePath("/payments");
}

export async function linkPaymentToUser(paymentId: string, subscriberId: string) {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    const sub = await prisma.subscriber.findUnique({ where: { id: subscriberId } });
    
    if (!payment || !sub) return;

    // 1. Fetch Global Settings for Fees
    const settings = await prisma.settings.findFirst() || { monthlyFee: 10, yearlyFee: 100 }; // Fallback defaults
    const cycle = sub.billingCycle || "Monthly";
    
    // 2. Determine Expected Fee & Threshold
    let expectedFee = 0;
    let threshold = 0;

    if (cycle === "Yearly") {
        expectedFee = settings.yearlyFee;
        threshold = 5; // $5 Tolerance
    } else {
        expectedFee = settings.monthlyFee;
        threshold = 1; // $1 Tolerance
    }

    // 3. Check if Payment is Sufficient
    const isSufficient = payment.amount >= (expectedFee - threshold);

    let updateData: any = {
        fullName: payment.payerName,
        lastPaymentAmount: payment.amount,
        lastPaymentDate: payment.date
    };

    // 4. Only update Due Date & Status if Sufficient
    if (isSufficient) {
        let newDueDate = sub.nextPaymentDate ? new Date(sub.nextPaymentDate) : new Date(payment.date);
        const paymentDate = new Date(payment.date);

        if (cycle === "Yearly") {
            if (sub.nextPaymentDate) {
                 const anchor = new Date(sub.nextPaymentDate);
                 anchor.setFullYear(anchor.getFullYear() + 1);
                 newDueDate = anchor;
            } else {
                 const anchor = new Date(payment.date);
                 anchor.setFullYear(anchor.getFullYear() + 1);
                 newDueDate = anchor;
            }
        } else {
            // Monthly
            let anchorDate = new Date(newDueDate); 
            if (paymentDate > anchorDate) {
                anchorDate = new Date(paymentDate);
            }
            anchorDate.setMonth(anchorDate.getMonth() + 1);
            newDueDate = anchorDate;
        }

        updateData.nextPaymentDate = newDueDate;
        // Keep Exempt if they are exempt, otherwise set Active
        updateData.status = sub.status === "Exempt" ? "Exempt" : "Active";
    }

    // 5. Always Link the Payment
    await prisma.payment.update({
        where: { id: paymentId },
        data: { subscriberId, status: "Linked" }
    });

    // 6. Update Subscriber (conditionally updates date/status)
    await prisma.subscriber.update({
        where: { id: subscriberId },
        data: updateData
    });

    revalidatePath("/payments");
    revalidatePath("/users");
}

export async function unlinkPayment(id: string) {
    await prisma.payment.update({
        where: { id },
        data: {
            subscriberId: null,
            status: "Unlinked"
        }
    });
    revalidatePath("/payments");
    revalidatePath("/users");
}

export async function splitPayment(originalId: string, splits: any[]) {
    const original = await prisma.payment.findUnique({ where: { id: originalId } });
    if (!original) return;

    await prisma.payment.update({ where: { id: originalId }, data: { status: "Split" } });

    for (const split of splits) {
        const newPayment = await prisma.payment.create({
            data: {
                provider: original.provider,
                payerName: original.payerName + " (Split)",
                amount: split.amount,
                date: original.date,
                status: "Unlinked",
                externalId: `${original.externalId}_split_${Math.random().toString(36).substr(2, 5)}`
            }
        });

        if (split.subscriberId) await linkPaymentToUser(newPayment.id, split.subscriberId);
    }
    revalidatePath("/payments");
}

export async function deletePayment(id: string) {
    await prisma.payment.delete({ where: { id } });
    revalidatePath("/payments");
}

export async function mergePayments(paymentIds: string[]) {
    const payments = await prisma.payment.findMany({ where: { id: { in: paymentIds } } });
    if (payments.length < 2) return;

    const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
    const primary = payments[0]; 

    await prisma.payment.create({
        data: {
            provider: primary.provider,
            payerName: `${primary.payerName} (Merged)`,
            amount: totalAmount,
            date: primary.date,
            status: "Unlinked",
            externalId: `merged_${Date.now()}_${Math.random().toString(36).substring(7)}`
        }
    });

    await prisma.payment.updateMany({
        where: { id: { in: paymentIds } },
        data: { status: "Merged" }
    });
    revalidatePath("/payments");
}

export async function clearAllPayments() {
    await prisma.payment.deleteMany({});
    revalidatePath("/payments");
}

// --- EMAIL SETTINGS ACTIONS ---

export async function getEmailAccounts() {
    return await prisma.emailAccount.findMany();
}

export async function addEmailAccount(data: any) {
    await prisma.emailAccount.create({
        data: {
            name: data.name,
            host: data.host,
            user: data.user,
            pass: data.pass,
            port: parseInt(data.port)
        }
    });
    revalidatePath("/payments");
}

export async function deleteEmailAccount(id: string) {
    await prisma.emailAccount.delete({ where: { id } });
    revalidatePath("/payments");
}

export async function triggerPaymentScan() {
    const result = await scanEmailAccounts();
    revalidatePath("/payments");
    return result;
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
        // FIX: Revalidate the specific access page so the list updates immediately
        revalidatePath("/settings/access");
        revalidatePath("/settings");
    } catch (e) {
        console.error("Failed to delete user:", e);
        // Optional: fail silently or throw, but logging helps debug
    }
}

// --- NEW: LANDING PAGE & SUPPORT ACTIONS ---

export async function getLandingStats() {
    const [tautulli, glances, apps] = await Promise.all([
        prisma.tautulliInstance.findMany(),
        prisma.glancesInstance.findMany(),
        prisma.mediaApp.findMany()
    ]);

    let totalStreams = 0;
    let serverStats: any[] = [];
    let downApps: string[] = [];

    // 1. Tautulli Streams
    await Promise.all(tautulli.map(async (t) => {
        let baseUrl = cleanUrl(t.url).replace(/\/api\/v2\/?$/, "");
        const fullUrl = `${baseUrl}/api/v2?apikey=${t.apiKey}&cmd=get_activity`;

        try {
            const res = await fetch(fullUrl, { next: { revalidate: 10 } });
            
            if (!res.ok) {
                console.error(`Failed Tautulli (${t.name}): ${res.status} ${res.statusText} | URL: ${fullUrl}`);
                return;
            }
            
            const data = await res.json();
            if (data.response?.data?.stream_count) {
                totalStreams += Number(data.response.data.stream_count);
            }
        } catch (e: any) { 
            console.error(`Failed Tautulli (${t.name}): ${e.message} | URL: ${fullUrl}`); 
        }
    }));

    // 2. Glances Stats (Auto-Fallback v4 -> v3 -> v2)
    await Promise.all(glances.map(async (g) => {
        const cleanGlances = cleanUrl(g.url);
        
        // Helper to fetch v4, v3, or v2
        const fetchGlancesMetric = async (endpoint: string) => {
            let errorDetails = "";
            const versions = [4, 3, 2]; // Order of priority

            for (const v of versions) {
                try {
                    const url = `${cleanGlances}/api/${v}/${endpoint}`;
                    const res = await fetch(url, { next: { revalidate: 10 } });
                    
                    if (res.ok) return await res.json();
                    
                    // Keep track of errors for debugging if all fail
                    errorDetails += `[v${v}: ${res.status}] `;
                } catch (e) { /* Check next version */ }
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

    // 3. App Status
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

    return { totalStreams, serverStats, downApps };
}

// ... (submitSupportTicket and other functions remain the same) ...
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
        
        // FIX: Check for BOTH smtpHost AND smtpUser to satisfy TypeScript
        if (settings?.smtpHost && settings?.smtpUser) {
            const transporter = nodemailer.createTransport({
                host: settings.smtpHost,
                port: settings.smtpPort,
                secure: settings.smtpPort === 465, 
                auth: { user: settings.smtpUser, pass: settings.smtpPass },
            } as any);

            await transporter.sendMail({
                from: `"Support" <${settings.smtpUser}>`,
                to: settings.smtpUser, // TypeScript now knows this is a string
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

export async function updateTicketStatus(id: string, status: string) {
    await prisma.supportTicket.update({
        where: { id },
        data: { status }
    });
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
        
        // FIX: Check BOTH here as well
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
    // Fetch all generic services
    const services = await prisma.service.findMany();
    
    // Ping them to check status
    const results = await Promise.all(services.map(async (service) => {
        try {
            // 2-second timeout check
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 2000);
            
            // We use no-cors so we don't crash on CORS errors, just checking connectivity
            await fetch(service.url, { signal: controller.signal, mode: 'no-cors' });
            clearTimeout(id);
            
            return { ...service, online: true };
        } catch (e) {
            return { ...service, online: false };
        }
    }));

    return results;
}