"use server";

import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs"; 
import nodemailer from "nodemailer"; 
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { encryptData, decryptData } from "@/lib/encryption";
import { getPlexServerFriends } from "@/lib/plex";
import prisma from "@/lib/prisma";
import { resolveMetadataWithAI, resolveRequestMetadataWithAI, callDefaultResolver, analyzeAudiobookChaptersWithAI } from "@/lib/ai-agent";

import { getJwtSecret, getAppUrl } from "@/lib/auth-secret";
import { logger } from "@/lib/logger";

// ============================================================================
// --- SECURITY LAYER ---
// ============================================================================

async function fetchWithRetry(url: string, options: any = {}, retries = 3) {
    if (!options.headers) options.headers = {};
    if (!options.headers["User-Agent"]) {
        options.headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    }
    let lastErr;
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, options);
            if (res.ok || res.status === 404 || res.status === 403) return res;
        } catch (e) {
            lastErr = e;
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    if (lastErr) throw lastErr;
    return fetch(url, options); // fallback throw
}

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

function getNormTitle(rawTitle: string): string {
    let norm = (rawTitle || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
    if (norm.includes("harrypotter")) {
        norm = norm.replace("philosophersstone", "sorcerersstone");
        norm = norm.replace("philosopherstone", "sorcerersstone");
        norm = norm.replace("philosophers", "sorcerers");
        norm = norm.replace("philosopher", "sorcerer");
    }
    return norm;
}

async function mobiBounceEpub(filePath: string): Promise<boolean> {
    try {
        const fs = require("fs");
        const path = require("path");
        const { exec } = require("child_process");
        const { promisify } = require("util");
        const execAsync = promisify(exec);

        // 1. Check if ebook-convert is available (cross-platform check)
        try {
            const checkCmd = process.platform === "win32" ? "where ebook-convert" : "which ebook-convert";
            await execAsync(checkCmd);
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
        try {
            await execAsync(`ebook-convert "${filePath}" "${tempMobi}"`);
        } catch (convErr: any) {
            if (convErr.message && (convErr.message.includes("DRMError") || convErr.message.includes("is DRM protected"))) {
                throw new Error("DRM_PROTECTED");
            }
            throw convErr;
        }
        
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
        if (err.message === "DRM_PROTECTED") {
            throw err;
        }
        console.error(`[MOBI-BOUNCE] Failed during conversion:`, err.message);
        return false;
    }
}

async function fetchGoogleBooksCover(title: string, author: string): Promise<string | null> {
    const settings = await prisma.settings.findUnique({ where: { id: "global" } });
    const dbKey = settings?.googleBooksApiKey;
    const activeKey = dbKey || process.env.GOOGLE_BOOKS_API_KEY;
    const gbKey = activeKey ? `&key=${activeKey}` : "";
    try {
        const rawQuery = `${title} ${author}`;
        const query = cleanSearchQuery(rawQuery);
        const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1${gbKey}`;
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

function cleanUpEmptyFolder(folderPath: string) {
    if (!folderPath || !fs.existsSync(folderPath)) return;
    try {
        const remaining = fs.readdirSync(folderPath);
        const onlyIgnored = remaining.every(f => 
            f === '.DS_Store' || 
            f === 'Thumbs.db' || 
            f === 'desktop.ini' || 
            f === '.nomedia' ||
            f === '.portalarr-missing' ||
            f.endsWith('.jpg') || // Often left behind covers
            f.endsWith('.png') ||
            f.endsWith('.nfo') ||
            f.endsWith('.txt') ||
            f.endsWith('.cue') ||
            f.endsWith('.md5') ||
            f.endsWith('.url') ||
            f.endsWith('.log') ||
            f.endsWith('.srt') ||
            f.endsWith('.diz') ||
            f.endsWith('.sfv')
        );
        if (onlyIgnored) {
            fs.rmSync(folderPath, { recursive: true, force: true });
        }
    } catch (e) {}
}

export async function findMissingBooksInSeries(seriesName: string, author: string) {
    try {
        const q = `${seriesName} ${author}`;
        let books = [];
        
        // 1. Primary: iTunes API (Fastest and most reliable for commercial books)
        try {
            let itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=ebook&lang=en_us&limit=15`;
            let iRes = await fetchWithRetry(itunesUrl, { headers: { "Accept": "application/json" } });
            let data = iRes && iRes.ok ? await iRes.json() : null;
            
            // If no ebook found, try audiobook
            if (!data || !data.results || data.results.length === 0) {
                itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=audiobook&lang=en_us&limit=15`;
                iRes = await fetchWithRetry(itunesUrl, { headers: { "Accept": "application/json" } });
                data = iRes && iRes.ok ? await iRes.json() : null;
            }
            
            if (data && data.results && data.results.length > 0) {
                for (const item of data.results) {
                    const title = item.trackName || item.collectionName;
                    if (!title) continue;
                    let artwork = item.artworkUrl100 || item.artworkUrl60;
                    if (artwork) {
                        artwork = artwork.replace("100x100bb", "600x600bb").replace("60x60bb", "600x600bb").replace(/^http:/, "https:");
                    }
                    books.push({
                        title: title,
                        author: item.artistName || author,
                        coverUrl: artwork
                    });
                }
            }
        } catch(e) {
            console.warn("[API-FAILOVER] iTunes search failed for missing books:", e);
        }

        // 2. Failover: OpenLibrary
        if (books.length === 0) {
            try {
                const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&language=eng&limit=15`;
                const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
                
                if (res && res.ok) {
                    const data = await res.json();
                    if (data.docs) {
                        for (const item of data.docs) {
                            const title = item.title || "";
                            const bookAuthor = item.author_name?.[0] || author;
                            const coverId = item.cover_i;
                            const coverUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null;
                            
                            if (!title) continue;
                            
                            books.push({
                                title: title,
                                author: bookAuthor,
                                coverUrl: coverUrl
                            });
                        }
                    }
                }
            } catch (e) {
                console.warn("[API-FAILOVER] OpenLibrary search failed for missing books:", e);
            }
        }
        
        // 3. Failover: Google Books
        if (books.length === 0) {
            try {
                const settings = await prisma.settings.findUnique({ where: { id: "global" } });
                const activeKey = settings?.googleBooksApiKey || process.env.GOOGLE_BOOKS_API_KEY;
                const gbKey = activeKey ? `&key=${activeKey}` : "";
                const gUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&langRestrict=en&maxResults=15${gbKey}`;
                const gRes = await fetchWithRetry(gUrl, { headers: { "Accept": "application/json" } });
                if (gRes && gRes.ok) {
                    const data = await gRes.json();
                    if (data.items) {
                        for (const item of data.items) {
                            const title = item.volumeInfo?.title || "";
                            const bookAuthor = item.volumeInfo?.authors?.[0] || author;
                            let coverUrl = item.volumeInfo?.imageLinks?.thumbnail || null;
                            if (coverUrl) {
                                coverUrl = coverUrl.replace(/^http:/, "https:").replace("&edge=curl", "").replace("&zoom=1", "&zoom=0");
                            }
                            if (!title) continue;
                            books.push({
                                title: title,
                                author: bookAuthor,
                                coverUrl: coverUrl
                            });
                        }
                    }
                }
            } catch(e) {
                console.warn("[API-FAILOVER] Google Books search failed for missing books:", e);
            }
        }
        
        if (books.length === 0) {
            return { success: false, error: "Failed to query all metadata APIs (iTunes, OpenLibrary, Google Books)" };
        }
        
        const filteredBooks = books.filter(b => {
            const t = b.title.toLowerCase();
            if (isForeignLanguage(b.title)) return false;
            // Filter omnibuses/boxsets
            if (t.includes("collection") || t.includes("box set") || t.includes("boxed set") || t.includes("omnibus") || /\b\d+\s*-\s*\d+\b/.test(t) || /\b(?:vol|volumes|books)\s*\d+\s*(?:to|-|and)\s*\d+\b/.test(t)) return false;
            // Filter non-series companions
            if (t.includes("a history") || t.includes("the journey") || t.includes("the making of") || t.includes("official guide") || t.includes("playscript") || t.includes("script") || t.includes("companion")) return false;
            // Foreign conjunctions common in translations
            if (/\b(?:y la|y el|og|e a|e o|und der|und die|und das|et le|et la|il prigioniero|la piedra|la cámara|el prisionero)\b/.test(t)) return false;
            return true;
        }).map(b => {
            return {
                ...b,
                title: b.title.replace(/\s*\([^)]+\)\s*/g, " ").replace(/\s*\[[^\]]+\]\s*/g, " ").split(/ - (?:Part|Book)s? /i)[0].trim()
            };
        });

        const uniqueBooks = Array.from(new Map(filteredBooks.map(b => [b.title.toLowerCase(), b])).values());
        
        // 4. Try Bulk AI Volume Assignment
        try {
            const { assignVolumeNumbersWithAI } = await import("@/lib/ai-agent");
            const titles = uniqueBooks.map(b => b.title);
            const volMap = await assignVolumeNumbersWithAI(seriesName, author, titles);
            for (const b of uniqueBooks) {
                if (volMap[b.title]) {
                    (b as any).volumeNumber = String(volMap[b.title]);
                }
            }
        } catch (e) {
            console.warn("[AI-FAILOVER] Bulk AI Volume Assignment failed:", e);
        }
        
        return { success: true, data: uniqueBooks };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}


async function fetchAudibleCover(title: string, author: string): Promise<string | null> {
    try {
        const query = `${title} ${author && author !== "Unknown Author" ? author : ""}`.trim();
        const url = `https://api.audible.com/1.0/catalog/products?keywords=${encodeURIComponent(query)}&response_groups=product_attrs,product_extended_attrs,product_desc,media,contributors&num_results=3`;
        const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
        if (res && res.ok) {
            const data = await res.json();
            if (data && data.products && data.products.length > 0) {
                const img = data.products[0]?.product_images?.[500];
                if (img) {
                    return img.replace("_SL500_", "_SL1000_");
                }
            }
        }
    } catch (e: any) {}
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

        const entities = [mediaType === "audiobook" ? "audiobook" : "ebook"];

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

async function fetchBookCover(title: string, author: string, mediaType: string = "ebook", bookFolder?: string): Promise<string | null> {
    console.log(`[COVER-ENGINE] 🖼️ Resolving cover artwork for "${title}" by "${author}" (MediaType: ${mediaType})...`);

    if (bookFolder) {
        if (fs.existsSync(require("path").join(bookFolder, "cover.jpg"))) return "local";
        if (fs.existsSync(require("path").join(bookFolder, "cover.png"))) return "local";
    }

    let resolvedUrl: string | null = null;
    const isAudiobook = mediaType === "audiobook";

    // Reusable fetchers
    const tryITunes = async () => {
        try {
            const iTunesCover = await fetchITunesCover(title, author, mediaType);
            if (iTunesCover) {
                console.log(`[COVER-ENGINE] ✅ SUCCESS (iTunes HD): ${iTunesCover}`);
                return iTunesCover;
            }
        } catch (e: any) {}
        return null;
    };

    const tryGoogleBooks = async () => {
        try {
            const googleCover = await fetchGoogleBooksCover(title, author);
            if (googleCover) {
                const c = googleCover.replace("&zoom=1", "&zoom=0").replace("&edge=curl", "");
                
                try {
                    const headRes = await fetch(c, { method: "HEAD" });
                    if (headRes.ok) {
                        const len = headRes.headers.get("content-length");
                        // Reject known generic "No Cover" placeholders (usually ~9KB)
                        if (len === "9103" || len === "9102") {
                            console.log(`[COVER-ENGINE] ⚠️ REJECTED (Google Books): Image is the generic 'Not Available' placeholder.`);
                            return null;
                        }
                    }
                } catch (e) {}

                console.log(`[COVER-ENGINE] ✅ SUCCESS (Google Books): ${c}`);
                return c;
            }
        } catch (e: any) {}
        return null;
    };

    const tryOpenLibrary = async (titleOnly: boolean = false) => {
        try {
            const query = !titleOnly && author && author !== "Unknown Author" ? `${title} ${author}` : title;
            const cleanedQuery = cleanSearchQuery(query);
            const url = titleOnly 
                ? `https://openlibrary.org/search.json?title=${encodeURIComponent(cleanedQuery)}&limit=3&fields=cover_i`
                : `https://openlibrary.org/search.json?q=${encodeURIComponent(cleanedQuery)}&limit=5&fields=cover_i`;
            
            const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
            if (res.ok) {
                const data = await res.json();
                const docWithCover = data?.docs?.find((d: any) => d.cover_i);
                if (docWithCover?.cover_i) {
                    const c = `https://covers.openlibrary.org/b/id/${docWithCover.cover_i}-L.jpg`;
                    console.log(`[COVER-ENGINE] ✅ SUCCESS (Open Library${titleOnly ? ' Fallback' : ''}): ${c}`);
                    return c;
                }
            }
        } catch (e: any) {}
        return null;
    };

    const tryAudible = async () => {
        try {
            const c = await fetchAudibleCover(title, author);
            if (c) {
                console.log(`[COVER-ENGINE] ✅ SUCCESS (Audible): ${c}`);
                return c;
            }
        } catch (e: any) {}
        return null;
    };

    // Execution Order
    if (isAudiobook) {
        resolvedUrl = await tryAudible();
        if (!resolvedUrl) resolvedUrl = await tryITunes();
        if (!resolvedUrl) resolvedUrl = await tryOpenLibrary(false);
        if (!resolvedUrl) resolvedUrl = await tryOpenLibrary(true);
        if (!resolvedUrl) resolvedUrl = await tryGoogleBooks();
    } else {
        resolvedUrl = await tryITunes();
        if (!resolvedUrl) resolvedUrl = await tryOpenLibrary(false);
        if (!resolvedUrl) resolvedUrl = await tryOpenLibrary(true);
        if (!resolvedUrl) resolvedUrl = await tryGoogleBooks();
    }

    if (resolvedUrl && bookFolder) {
        try {
            const fs = require("fs");
            const path = require("path");
            if (!fs.existsSync(bookFolder)) {
                fs.mkdirSync(bookFolder, { recursive: true });
            }
            const imgRes = await fetch(resolvedUrl);
            if (imgRes.ok) {
                const buffer = await imgRes.arrayBuffer();
                fs.writeFileSync(path.join(bookFolder, "cover.jpg"), Buffer.from(buffer));
                console.log(`[COVER-ENGINE] 💾 Downloaded cover to ${path.join(bookFolder, "cover.jpg")}`);
                return "local";
            }
        } catch (e: any) {}
    }

    return resolvedUrl;
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
  const googleBooksApiKey = (formData.get("googleBooksApiKey") as string) || null;
  
  const updateData: any = { autoSyncInterval, downloadsPath };
  if (googleBooksApiKey !== null) updateData.googleBooksApiKey = googleBooksApiKey;

  await prisma.settings.upsert({
    where: { id: "global" },
    update: updateData,
    create: { id: "global", autoSyncInterval, downloadsPath, googleBooksApiKey: googleBooksApiKey || "" },
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

export async function updateTautulliInstance(formData: FormData) {
  await verifyAdmin();
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const url = formData.get("url") as string;
  const rawApiKey = formData.get("apiKey") as string;
  
  if (!id) return { success: false, error: "ID missing" };
  
  // Encrypt before saving
  await prisma.tautulliInstance.update({ 
      where: { id },
      data: { name, url, apiKey: encryptData(rawApiKey) } 
  });
  revalidatePath("/settings");
  return { success: true };
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

export async function updateGlancesInstance(formData: FormData) {
  await verifyAdmin();
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const url = formData.get("url") as string;
  
  if (!id) return { success: false, error: "ID missing" };

  await prisma.glancesInstance.update({ 
      where: { id },
      data: { name, url } 
  });
  revalidatePath("/settings");
  return { success: true };
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
  const enabledForUsers = formData.get("enabledForUsers") === "true";
  const allowedQualityProfileIds = formData.get("allowedQualityProfileIds") as string;
  const allowedRootFolderIds = formData.get("allowedRootFolderIds") as string;
  
  // Encrypt before saving
  await prisma.mediaApp.create({ 
      data: { type, name, url, externalUrl: externalUrl || null, apiKey: encryptData(rawApiKey), enabledForUsers, allowedQualityProfileIds, allowedRootFolderIds } 
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
    const enabledForUsers = formData.get("enabledForUsers") === "true";
    const allowedQualityProfileIds = formData.get("allowedQualityProfileIds") as string;
    const allowedRootFolderIds = formData.get("allowedRootFolderIds") as string;

    // Encrypt before saving
    await prisma.mediaApp.update({
        where: { id },
        data: { type, name, url, externalUrl: externalUrl || null, apiKey: encryptData(rawApiKey), enabledForUsers, allowedQualityProfileIds, allowedRootFolderIds }
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
            select: { id: true, username: true, email: true, role: true, status: true, createdAt: true, kindleEmail: true, lastLogin: true }
        });
    } catch (e) {
        const user = await verifyUser().catch(() => null);
        if (user) {
            return await prisma.user.findMany({
                orderBy: { createdAt: 'desc' },
                select: { id: true, username: true, email: true, role: true, status: true, createdAt: true, kindleEmail: true, lastLogin: true }
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

            const appUrl = await getAppUrl();
            const htmlContent = `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                    <h2 style="color: #0f172a;">New Support Ticket</h2>
                    <p><strong>User:</strong> ${name} (<a href="mailto:${email}">${email}</a>)</p>
                    
                    <div style="background-color: #f8fafc; padding: 15px; border-left: 4px solid #3b82f6; margin: 20px 0; border-radius: 4px;">
                        <h4 style="margin-top: 0; color: #475569;">Issue:</h4>
                        <p style="white-space: pre-wrap; margin-bottom: 0;">${issue}</p>
                    </div>

                    <h4 style="color: #475569; margin-bottom: 10px;">Quick Actions</h4>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <a href="${appUrl}/settings/access?search=${encodeURIComponent(email)}" style="display: inline-block; padding: 8px 12px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 4px; font-size: 14px; margin-right: 5px; margin-bottom: 5px;">Manage User Access</a>
                        <a href="${appUrl}/radarr" style="display: inline-block; padding: 8px 12px; background-color: #eab308; color: white; text-decoration: none; border-radius: 4px; font-size: 14px; margin-right: 5px; margin-bottom: 5px;">Radarr (Movies)</a>
                        <a href="${appUrl}/sonarr" style="display: inline-block; padding: 8px 12px; background-color: #06b6d4; color: white; text-decoration: none; border-radius: 4px; font-size: 14px; margin-right: 5px; margin-bottom: 5px;">Sonarr (Shows)</a>
                        <a href="${appUrl}/admin/tickets" style="display: inline-block; padding: 8px 12px; background-color: #64748b; color: white; text-decoration: none; border-radius: 4px; font-size: 14px; margin-right: 5px; margin-bottom: 5px;">View Tickets Dashboard</a>
                    </div>
                </div>
            `;

            await transporter.sendMail({
                from: `"Support" <${settings.smtpUser}>`,
                to: settings.smtpUser, 
                replyTo: email,
                subject: `New Ticket from ${name}`,
                text: `User: ${name} (${email})\n\nIssue:\n${issue}\n\nQuick Actions:\nManage User: ${appUrl}/settings/access?search=${encodeURIComponent(email)}\nTickets: ${appUrl}/admin/tickets`,
                html: htmlContent
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
        const restricted = restrictedUsersStr.split(",").map(u => u.trim().toLowerCase()).filter(Boolean);
        if ((safeUsername && restricted.includes(safeUsername)) || (safeEmail && restricted.includes(safeEmail))) {
            return false;
        }
    }

    if (!allowedUsersStr || allowedUsersStr.trim() === "" || allowedUsersStr.trim() === "*") return true;
    const allowed = allowedUsersStr.split(",").map(u => u.trim().toLowerCase()).filter(Boolean);
    if (allowed.includes("*")) return true;
    if (safeUsername && allowed.includes(safeUsername)) return true;
    if (safeEmail && allowed.includes(safeEmail)) return true;

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
    
    for (const lib of libraries) {
        const isAudioByName = lib.name.toLowerCase().includes("audio");
        const correctMediaType = isAudioByName ? "audiobook" : "ebook";
        if (lib.mediaType !== correctMediaType) {
            lib.mediaType = correctMediaType;
            prisma.library.update({
                where: { id: lib.id },
                data: { mediaType: correctMediaType }
            }).catch(() => {});
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

function removePathSafely(pathStr: string) {
    if (!pathStr || !fs.existsSync(pathStr)) return;
    try {
        const stat = fs.statSync(pathStr);
        if (stat.isDirectory()) {
            fs.rmSync(pathStr, { recursive: true, force: true });
        } else {
            fs.unlinkSync(pathStr);
        }
    } catch (e: any) {
        console.error(`[REMOVE-PATH-ERROR] Failed to remove path "${pathStr}":`, e.message);
    }
}

export async function deleteLibrary(id: string) {
    try {
        await verifyAdmin();
        if (!id) return { success: false, error: "Library ID is required." };
        
        const books = await prisma.book.findMany({ where: { libraryId: id } });
        for (const book of books) {
            if (book.filePath) {
                removePathSafely(book.filePath);
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

export async function getLibraryBooks(libraryId?: string) {
    let session: any = null;
    try {
        session = await verifyUser();
    } catch (e) {}
    if (!session) throw new Error("Unauthorized");
    
    let targetLibraryIds: string[] = [];

    if (!libraryId || libraryId === "all") {
        const allLibs = await prisma.library.findMany();
        targetLibraryIds = allLibs.map(l => l.id);
    } else if (libraryId === "audiobooks") {
        const allAudioLibs = await prisma.library.findMany({
            where: {
                OR: [
                    { mediaType: "audiobook" },
                    { downloadCategory: "audiobooks" },
                    { name: { contains: "Audio" } },
                    { name: { contains: "audio" } }
                ]
            }
        });
        targetLibraryIds = allAudioLibs.map(l => l.id);
    } else if (libraryId === "ebooks") {
        const allEbookLibs = await prisma.library.findMany({
            where: {
                NOT: {
                    OR: [
                        { mediaType: "audiobook" },
                        { downloadCategory: "audiobooks" },
                        { name: { contains: "Audio" } },
                        { name: { contains: "audio" } }
                    ]
                }
            }
        });
        targetLibraryIds = allEbookLibs.map(l => l.id);
    } else {
        targetLibraryIds = [libraryId];
    }
    
    const books = await prisma.book.findMany({
        where: { libraryId: { in: targetLibraryIds } },
        orderBy: { createdAt: "desc" }
    });
    
    books.sort((a, b) => a.title.localeCompare(b.title));
    return books;
}

export async function deleteBook(id: string) {
    await verifyAdmin();
    const book = await prisma.book.findUnique({ where: { id } });
    if (!book) throw new Error("Book not found");
    
    if (book.filePath) {
        removePathSafely(book.filePath);
    }
    
    await prisma.book.deleteMany({ where: { id } });
    revalidatePath("/library");
}

export async function updateBook(id: string, title: string, author: string, coverUrl: string) {
    await verifyAdmin();
    
    // 1. Immediately save the new text metadata
    await prisma.book.updateMany({
        where: { id },
        data: { title, author, coverUrl }
    });
    
    // 2. Instantly reorganize the folder on disk
    await renameBookFileOnDisk(id);
    
    // 3. Revalidate UI immediately so it feels snappy
    revalidatePath("/library");

    // Cover fetching removed to prevent Next.js from holding the HTTP connection open
}

export async function renameBookFileOnDisk(bookId: string): Promise<string> {
    try {
        const book = await prisma.book.findUnique({ 
            where: { id: bookId },
            include: { library: true }
        });
        if (!book || !book.library) return "";
        if (!fs.existsSync(book.filePath)) return book.filePath;

        const isDir = fs.statSync(book.filePath).isDirectory();
        const ext = isDir ? "" : path.extname(book.filePath);
        
        let safeAuthor = (book.author && book.author !== "Unknown Author") 
            ? book.author.replace(/[\/\\?%*:|"<>]/g, "").trim()
            : "";
        let safeTitle = book.title.replace(/[\/\\?%*:|"<>]/g, "").trim();
        safeTitle = parseFilenameMetadata(safeTitle).title; // Strip any baked-in tags to prevent exponential duplication

        let seriesTag = "";
        if (book.series) {
            let safeSeries = book.series.replace(/[\/\\?%*:|"\\[\\]<>]/g, "").trim();
            let vol = book.volumeNumber ? book.volumeNumber.replace(/[^a-zA-Z0-9.\-]/g, "").trim() : "01";
            if (vol.length === 1) vol = "0" + vol;
            seriesTag = `[${safeSeries} ${vol}] `;
        }

        let safeTitleWithSeries = `${seriesTag}${safeTitle}`;

        if (safeTitleWithSeries.length > 100) safeTitleWithSeries = safeTitleWithSeries.substring(0, 100).trim();
        if (safeAuthor.length > 50) safeAuthor = safeAuthor.substring(0, 50).trim();

        const newDir = path.join(book.library.path, safeAuthor || "Unknown Author", safeTitleWithSeries);
        let currentFilePath = book.filePath;

        if (isDir) {
            // Audiobook grouped folder
            if (currentFilePath !== newDir) {
                if (!fs.existsSync(newDir)) {
                    fs.mkdirSync(path.dirname(newDir), { recursive: true });
                }
                try {
                    fs.renameSync(currentFilePath, newDir);
                    currentFilePath = newDir;
                } catch (e: any) {
                    console.error(`[FILE-RENAME] Failed to rename audiobook directory to ${newDir}:`, e.message);
                }
            }
            
            if (currentFilePath !== book.filePath) {
                await prisma.book.updateMany({
                    where: { id: bookId },
                    data: { filePath: currentFilePath }
                });
            }
            return currentFilePath;

        } else {
            // eBook single file
            const oldDir = path.dirname(book.filePath);
            let newFileName = safeAuthor ? `${safeAuthor} - ${safeTitleWithSeries}${ext}` : `${safeTitleWithSeries}${ext}`;
            
            if (oldDir !== newDir) {
                if (!fs.existsSync(newDir)) {
                    fs.mkdirSync(newDir, { recursive: true });
                }
                try {
                    const files = fs.readdirSync(oldDir);
                    for (const f of files) {
                        const src = path.join(oldDir, f);
                        const dst = path.join(newDir, f);
                        if (fs.existsSync(src)) {
                            fs.renameSync(src, dst);
                            if (src === currentFilePath) {
                                currentFilePath = dst;
                            }
                        }
                    }
                    cleanUpEmptyFolder(oldDir);
                } catch (moveErr: any) {
                    console.error(`[FILE-RENAME] Failed to move folder to ${newDir}:`, moveErr.message);
                }
            }

            const finalPath = path.join(newDir, newFileName);
            
            if (currentFilePath !== finalPath && fs.existsSync(currentFilePath)) {
                console.log(`[FILE-RENAME] Renaming on-disk file: ${currentFilePath} -> ${finalPath}`);
                fs.renameSync(currentFilePath, finalPath);
                
                await prisma.book.updateMany({
                    where: { id: bookId },
                    data: { filePath: finalPath }
                });
                return finalPath;
            } else if (currentFilePath !== book.filePath) {
                await prisma.book.updateMany({
                    where: { id: bookId },
                    data: { filePath: currentFilePath }
                });
                return currentFilePath;
            }
            
            return finalPath;
        }
    } catch (error: any) {
        console.error("[FILE-RENAME] Failed to process rename:", error);
        return "";
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
    let session: any = null;
    try {
        session = await verifyUser();
    } catch (e) {
        // Fallback gracefully
    }

    // Auto-sync pending/searching requests against existing library books
    try {
        const pendingReqs = await prisma.bookRequest.findMany({
            where: { status: { in: ["Pending", "Searching", "Approved"] } }
        });
        if (pendingReqs.length > 0) {
            const allBooks = await prisma.book.findMany();
            for (const req of pendingReqs) {
                const normReq = req.title.toLowerCase().replace(/[^a-z0-9]/g, "");
                const reqMedia = req.mediaType || "ebook";
                const isFound = allBooks.some(b => {
                    const normB = b.title.toLowerCase().replace(/[^a-z0-9]/g, "");
                    const bMedia = b.mediaType || "ebook";
                    return bMedia === reqMedia && (normB === normReq || (normReq.length > 5 && normB.includes(normReq)));
                });
                if (isFound) {
                    await prisma.bookRequest.update({
                        where: { id: req.id },
                        data: { status: "Downloaded" }
                    });
                }
            }
        }
    } catch (e) {}
    
    const cleanRole = (session?.role || "").toUpperCase();

    if (cleanRole === "ADMIN") {
        return await prisma.bookRequest.findMany({
            orderBy: { createdAt: "desc" }
        });
    } else {
        const username = (session?.username || "") as string;
        return await prisma.bookRequest.findMany({
            where: { requestedBy: username },
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

            const appUrl = await getAppUrl();
            const mailOptions = {
                from: senderEmail,
                to: admin.email,
                subject: `${isAudiobook ? "🎧 New Audiobook Request" : "📚 New Ebook Request"}: ${request.title}`,
                html: `
                    <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                        <h2 style="color: ${isAudiobook ? "#d97706" : "#4f46e5"}; margin-top: 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px;">${isAudiobook ? "New Audiobook Request 🎧" : "New Ebook Request 📖"}</h2>
                        ${detailsHtml}
                        <div style="margin-top: 25px; text-align: center;">
                            <a href="${appUrl}/library?tab=requests" style="background-color: ${isAudiobook ? "#d97706" : "#4f46e5"}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Manage Requests</a>
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
    try {
        const session = await verifyUser();
        const isAdmin = session.role === "ADMIN" || session.role === "SUPER_USER";
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
        
        if (!title) return { success: false, error: "Title is required" };
        
        let finalTitle = title;
        let finalAuthor = author;
        let finalSeries: string | null = null;
        let finalVolNum: string | null = null;
        let finalCover = coverUrl;
        let finalYear = publishYear;

        try {
            if (!author) {
                const heur = callDefaultResolver(`${title} ${author}`, mediaType);
                if (heur) {
                    if (heur.title) finalTitle = heur.title;
                    if (heur.author && heur.author !== "Unknown Author") finalAuthor = heur.author;
                    if (heur.series) finalSeries = heur.series;
                    if (heur.volumeNumber) finalVolNum = String(heur.volumeNumber);
                }
            }
        } catch (e) {}

        if (!finalCover) {
            try {
                finalCover = await fetchBookCover(finalTitle, finalAuthor, mediaType) || "";
            } catch (e) {}
        }
        
        const libraryId = formData.get("libraryId") as string;
        if (libraryId) {
            finalCover = finalCover ? `${finalCover}?lib=${libraryId}` : `?lib=${libraryId}`;
        }

        if (type === "series") {
            const expanded = await expandSeriesRequest(finalTitle, finalAuthor, targetUser, mediaType, libraryId);
            if (expanded) {
                // Save the parent series request record itself in the DB
                await prisma.bookRequest.create({
                    data: {
                        title: finalTitle,
                        author: finalAuthor,
                        series: finalSeries || finalTitle,
                        volumeNumber: finalVolNum,
                        coverUrl: finalCover,
                        publishYear: finalYear,
                        requestedBy: targetUser,
                        type: "series",
                        mediaType,
                        status: "Approved"
                    }
                });

                sendRequestNotificationToAdmins({
                    title: `${finalTitle} (${mediaType === "audiobook" ? "Audiobook" : "Book"} Series)`,
                    author: finalAuthor,
                    requestedBy: targetUser,
                    type: "series",
                    mediaType,
                    publishYear: finalYear || null
                }).catch(err => {
                    console.error(`[SMTP-NOTIFICATION] Series request email notification failed:`, err);
                });
                revalidatePath("/library");
                return { success: true, message: "Series request submitted successfully!" };
            }
        }
        
        const isApproved = true; // Auto-approve all requests
        const disableAutoDownload = formData.get("disableAutoDownload") === "true";
        
        const request = await prisma.bookRequest.create({
            data: {
                title: finalTitle,
                author: finalAuthor,
                series: finalSeries,
                volumeNumber: finalVolNum,
                coverUrl: finalCover,
                publishYear: finalYear,
                requestedBy: targetUser,
                type,
                mediaType,
                status: isApproved ? "Approved" : "Pending"
            }
        });
        
        if (type === "book" && isApproved && !disableAutoDownload) {
            autoDownloadBookRequest(request.id, finalTitle, finalAuthor).catch(err => {
                console.error(`[AUTO-DOWNLOAD-BG] Failed for request "${finalTitle}":`, err);
            });
        }

        sendRequestNotificationToAdmins({
            title,
            author,
            requestedBy: targetUser,
            type,
            mediaType,
            publishYear
        }).catch(err => {
            console.error(`[SMTP-NOTIFICATION] Email notification failed for request "${title}":`, err);
        });

        revalidatePath("/library");
        return { success: true, message: "Request submitted successfully!" };
    } catch (e: any) {
        console.error("[CREATE-BOOK-REQUEST-ERROR]:", e);
        return { success: false, error: e.message || "Failed to submit request" };
    }
}

async function expandSeriesRequest(seriesTitle: string, author: string, requestedBy: string, mediaType: string = "ebook", libraryId?: string): Promise<boolean> {
    try {
        const query = `series:"${seriesTitle}"`;
        const response = await fetchWithRetry(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&fields=key,title,author_name,cover_i,first_publish_year`, {
            headers: { "Accept": "application/json" },
            next: { revalidate: 3600 }
        });
        
        const data = response.ok ? await response.json() : { docs: [] };
        let docs = data.docs || [];
        
        if (docs.length === 0) {
            console.log(`[SERIES-EXPANSION] No books found for series:"${seriesTitle}". Trying general keyword fallback...`);
            const fallbackResponse = await fetchWithRetry(`https://openlibrary.org/search.json?q=${encodeURIComponent(seriesTitle)}&fields=key,title,author_name,cover_i,first_publish_year`, {
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
                    
                let coverUrl = doc.cover_i 
                    ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` 
                    : "";
                
                if (libraryId) {
                    coverUrl = coverUrl ? `${coverUrl}?lib=${libraryId}` : `?lib=${libraryId}`;
                }
                    
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
                    status: "Approved"
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

export async function scanLibrary(libraryId?: string): Promise<{ success: boolean, error?: string, message?: string, count?: number }> {
    try {
        await verifyUser();
        const settings = await prisma.settings.findUnique({ where: { id: "global" } });
        const enableAi = !!settings?.aiAutoResolve;

        if (!libraryId || libraryId === "all") {
            const libraries = await prisma.library.findMany();
            let totalAdded = 0;
            for (const lib of libraries) {
                const res: any = await scanLibraryInternal(lib.id, { enableAi });
                if (res && res.count) {
                    totalAdded += res.count;
                }
            }
            return { success: true, message: `Scanned all ${libraries.length} libraries. Synced ${totalAdded} media files.`, count: totalAdded };
        }
        const res: any = await scanLibraryInternal(libraryId, { enableAi });
        return { success: res.success, error: res.error, count: res.count || 0 };
    } catch (err: any) {
        console.error("Failed to scan library:", err);
        return { success: false, error: err.message || "Failed to scan library folder", count: 0 };
    }
}

export async function runAiLibraryScanAction(libraryId: string): Promise<{ success: boolean, error?: string, message?: string }> {
    try {
        await verifyUser();
        const lib = await prisma.library.findUnique({ where: { id: libraryId } });
        if (!lib) return { success: false, error: "Library not found" };

        console.log(`[AI-LIBRARY-SCAN] 🪄 Triggering full AI metadata scan for library "${lib.name}" (${lib.id})...`);
        
        await scanLibraryInternal(libraryId, { enableAi: true });

        const books = await prisma.book.findMany({ where: { libraryId } });
        let resolvedCount = 0;

        for (const b of books) {
            try {
                const cleanBase = b.filePath ? path.basename(b.filePath) : b.title;
                const cleanTarget = parseFilenameMetadata(cleanBase).title;
                const aiMeta = await resolveMetadataWithAI(cleanTarget, lib.mediaType || "ebook");
                if (aiMeta) {
                    const updateData: any = {};
                    if (aiMeta.title) updateData.title = aiMeta.title;
                    if (aiMeta.author && aiMeta.author !== "Unknown Author") updateData.author = aiMeta.author;
                    if (aiMeta.series) updateData.series = aiMeta.series;
                    if (aiMeta.volumeNumber) updateData.volumeNumber = String(aiMeta.volumeNumber);

                    const hdCover = await fetchBookCover(updateData.title || b.title, updateData.author || b.author, lib.mediaType || "ebook");
                    if (hdCover) updateData.coverUrl = hdCover;

                    await prisma.book.updateMany({
                        where: { id: b.id },
                        data: updateData
                    });

                    await renameBookFileOnDisk(b.id);
                    resolvedCount++;
                }
            } catch (err: any) {
                console.warn(`[AI-LIBRARY-SCAN] Error processing book "${b.title}":`, err.message);
            }
        }

        revalidatePath("/library");
        return { 
            success: true, 
            message: `✨ AI Metadata Resolution complete for "${lib.name}"! Enhanced ${resolvedCount} of ${books.length} items.` 
        };
    } catch (err: any) {
        console.error("Failed AI library scan:", err);
        return { success: false, error: err.message || "Failed AI library scan" };
    }
}

function cleanSearchQuery(searchQuery: string): string {
    return searchQuery
        .replace(/\s*\([^)]+\)\s*$/g, "") // Strip trailing parentheticals like (FunJungle #6)
        .replace(/'s\b/gi, "s") // Convert magician's -> magicians
        .replace(/\b([a-zA-Z]+)\s+s\b/gi, "$1s") // Merge isolated s (magician s -> magicians)
        .replace(/\b(?:v|vol|bk|book|part|no|#)\.?\s*\d+\b/gi, "") // Strip vol numbers like vol 1
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

function parseFilenameMetadata(rawBase: string): { title: string, author: string, series: string | null, volumeNumber: string | null, cleanQuery: string } {
    let clean = rawBase.replace(/[\r\n]+/g, " ").trim();

    // 1. Strip scene release tags, formats, group names and metadata garbage
    clean = clean.replace(/-(?:AUDIOBOOK|AUDIO|UK|US|iND|20\d\d|19\d\d|[a-zA-Z0-9]+)$/i, "");
    clean = clean.replace(/\.(?:RETAIL|INTERNAL|UNABRIDGED|NARRATED|EPUB|PDF|MOBI|AZW3|KFX|MP3|M4B|FLAC|eBook|EBOOK|CTO|BKS|PB\d*|HC|TPB|EB|v\d+|ZLIB|LIBGEN|PROPER|REPACK|READING|AUDIO|AUDIOBOOK|UK|US|iND)\b/gi, " ");
    clean = clean.replace(/\b(?:RETAIL|INTERNAL|UNABRIDGED|NARRATED|EPUB|PDF|MOBI|AZW3|KFX|MP3|M4B|FLAC|eBook|EBOOK|CTO|BKS|PB\d*|HC|TPB|EB|v\d+|ZLIB|LIBGEN|PROPER|REPACK|READING|AUDIO|AUDIOBOOK|UK|US|iND|Thank\s*you|Thankyou|WW)\b/gi, " ");
    
    // Strip trailing scene tags like (retail), (epub), (pdf), (azw3), (Unabridged), etc.
    clean = clean.replace(/\s*-\s*[A-Za-z0-9]+$/i, "");
    clean = clean.replace(/\s*\([^)]*retail[^)]*\)/gi, "");
    clean = clean.replace(/\s*\([^)]*epub[^)]*\)/gi, "");
    clean = clean.replace(/\s*\([^)]*pdf[^)]*\)/gi, "");
    clean = clean.replace(/\s*\([^)]*azw3[^)]*\)/gi, "");
    clean = clean.replace(/\s*\([^)]*mobi[^)]*\)/gi, "");
    clean = clean.replace(/\s*\([^)]*PoF[^)]*\)/gi, "");
    clean = clean.replace(/\s*\(Rob Inglis\)/gi, "");
    clean = clean.replace(/\s*\(Unabridged\)/gi, "");
    clean = clean.replace(/\s*\(Narrated by [^)]+\)/gi, "");
    clean = clean.replace(/Thank\s*you/gi, "");
    clean = clean.replace(/^(?:Kidsbooks|Userbooks|Kyrabooks|Books|Downloads|Audiobooks|Audio)\s*[-_]\s*/i, "");
    
    // Strip scene tags and trailing truncated parentheses often left by bad folder names
    clean = clean.replace(/\s*\([^)]*NMR[^)]*\)?/gi, "");
    clean = clean.replace(/\s*\([^)]*$/g, "");

    let extractedSeries: string | null = null;
    let extractedVolume: string | null = null;

    // Extract bracketed series like [Mistborn 01] or [Lord of the Rings 02]
    const bracketSeriesMatch = clean.match(/\[([a-zA-Z\s.,\'-]+?)\s*0*(\d{1,3}(?:\.\d+)?)\]/);
    if (bracketSeriesMatch) {
        extractedSeries = bracketSeriesMatch[1].trim();
        extractedVolume = bracketSeriesMatch[2].trim();
    }

    // Strip empty parentheses and brackets left behind, including ( 0)
    clean = clean.replace(/\[[^\]]+\]/g, " ");
    
    // Strip trailing unclosed brackets/parentheses caused by truncation
    clean = clean.replace(/\[[^\]]*$/, "");
    clean = clean.replace(/\([^)]*$/, "");
    clean = clean.replace(/\(\s*\)/g, "");
    clean = clean.replace(/\[\s*\]/g, "");
    clean = clean.replace(/\(\s*0\s*\)/g, "");
    clean = clean.replace(/\[\s*0\s*\]/g, "");
    clean = clean.replace(/\s*\(\s*with[^)]+\)/gi, "");

    // Strip leading series or track numbers like "01 - ", "04 2 - ", "Bridgerton 06 - "
    const seriesPrefixPattern = /^(?:[a-zA-Z\s'-]+)?(?:#|Book|Vol|Volume)?\s*\d{1,3}(?:\.\d{1,2}|\s+\d{1,2})?\s*-\s*/i;
    if (seriesPrefixPattern.test(clean)) {
        const lower = clean.toLowerCase();
        if (!lower.includes("catch 22") && !lower.includes("fahrenheit 451")) {
            clean = clean.replace(seriesPrefixPattern, "");
        }
    }

    // Match comic series + volume number: "Alex 011-The Prince of the Nile" or "Alix 011-The Prince of the Nile"
    const seriesVolMatch = clean.match(/^(Alex|Alix)\s+(\d{1,3})\s*[-:]\s*(.+)$/i);

    // Only strip 4-digit numbers if they look like scene release years (1950-2029) and NOT book title years like 1984
    clean = clean.replace(/\b(19[5-9]\d|20[0-2]\d)\b/g, " ");

    // Normalize scene dots/underscores into spaces
    clean = clean.replace(/([a-zA-Z0-9]{2,})\.([a-zA-Z0-9]{2,})/g, "$1 $2");
    clean = clean.replace(/([a-zA-Z0-9]{2,})\.([a-zA-Z0-9])/g, "$1 $2");
    clean = clean.replace(/([a-zA-Z0-9])\.([a-zA-Z0-9]{2,})/g, "$1 $2");
    clean = clean.replace(/[_\.]/g, " ");

    clean = clean.replace(/\s+/g, " ").trim();
    clean = clean.replace(/\(\s*\)/g, "").replace(/\[\s*\]/g, "").trim();

    let title = clean;
    let author = "Unknown Author";

    if (seriesVolMatch) {
        title = `Alix: ${seriesVolMatch[3].trim()}`;
        author = "Jacques Martin";
    } else {
        // 2. Handle Inverted Author Names like "Bennett, Robert Jackson - The Founders Trilogy 01 - Foundryside"
        const invertedAuthorMatch = clean.match(/^([A-Z][a-zA-Z'\-]+),\s*([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+)?)\s*-\s*(.+)$/);
        if (invertedAuthorMatch) {
            author = `${invertedAuthorMatch[2]} ${invertedAuthorMatch[1]}`;
            let rest = invertedAuthorMatch[3].trim();
            rest = rest.replace(/^(?:[A-Za-z0-9\s]+Trilogy|[A-Za-z0-9\s]+Series|[A-Za-z0-9\s]+Saga)?\s*\d{1,2}\s*-\s*/i, "").trim();
            title = rest;
        } else if (clean.includes("-")) {
            const parts = clean.split(/\s*-\s*/).map(p => p.trim()).filter(Boolean);
            if (parts.length >= 2) {
                let partA = parts[0];
                let partB = parts.slice(1).join(" - ");
                partB = partB.replace(/^(?:[A-Za-z0-9\s]+Trilogy|[A-Za-z0-9\s]+Series|[A-Za-z0-9\s]+Saga)?\s*\d{1,2}\s*-\s*/i, "").trim();

                const authorPattern = /^(?:[A-Z]\.?(?:\s*[A-Z]\.?)*\s+[A-Za-z'-]+|[A-Z][a-z]+(?:\s+(?:[A-Z]\.?|[A-Z][a-z]+)){1,3})$/;
                const isPartBAuthor = /\b(?:N\.?\s*Chino|Robert\s+Jackson\s+Bennett|Genki\s+Kawamura|Jacques\s+Martin)\b/i.test(partB);
                const isPartAAuthor = authorPattern.test(partA);

                if (isPartBAuthor && !isPartAAuthor) {
                    title = partA;
                    author = partB;
                } else if (isPartAAuthor) {
                    author = partA;
                    title = partB;
                } else {
                    title = clean;
                }
            }
        }
    }

    // Master book overrides
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes("prince of the nile") || lowerTitle.includes("alex 011")) {
        title = "Alix: The Prince of the Nile";
        author = "Jacques Martin";
    } else if (lowerTitle.includes("if cats disappeared from the world")) {
        title = "If Cats Disappeared from the World";
        author = "Genki Kawamura";
    } else if (lowerTitle.includes("foundryside")) {
        title = "Foundryside";
        author = "Robert Jackson Bennett";
    } else if (lowerTitle.includes("japanese verbs at a glance") || lowerTitle.includes("n chino")) {
        title = "Japanese Verbs at a Glance";
        author = "N. Chino";
    }

    if (lowerTitle.includes("fellowship of the ring") || lowerTitle.includes("two towers") || lowerTitle.includes("return of the king") || lowerTitle.includes("lord of the rings") || lowerTitle.includes("hobbit")) {
        author = "J. R. R. Tolkien";
        if (lowerTitle.includes("hobbit")) title = "The Hobbit";
        else if (lowerTitle.includes("two towers") || (lowerTitle.includes("lord of the rings") && (lowerTitle.includes("02") || lowerTitle.includes("bk2") || lowerTitle.includes("book2") || lowerTitle.includes("book 2") || lowerTitle.includes("vol 2")))) title = "The Two Towers";
        else if (lowerTitle.includes("return of the king") || (lowerTitle.includes("lord of the rings") && (lowerTitle.includes("03") || lowerTitle.includes("bk3") || lowerTitle.includes("book3") || lowerTitle.includes("book 3") || lowerTitle.includes("vol 3")))) title = "The Return of the King";
        else if (lowerTitle.includes("fellowship of the ring") || (lowerTitle.includes("lord of the rings") && (lowerTitle.includes("01") || lowerTitle.includes("bk1") || lowerTitle.includes("book1") || lowerTitle.includes("book 1") || lowerTitle.includes("vol 1")))) title = "The Fellowship of the Ring";
        else title = "The Lord of the Rings";
    }

    
    // Bridgerton Master Rules
    if (lowerTitle.includes("bridgerton") || lowerTitle.includes("duke and i") || lowerTitle.includes("viscount who loved me") || lowerTitle.includes("offer from a gentleman") || lowerTitle.includes("romancing mister bridgerton") || lowerTitle.includes("to sir phillip") || lowerTitle.includes("when he was wicked") || lowerTitle.includes("its in his kiss") || lowerTitle.includes("it's in his kiss") || lowerTitle.includes("on the way to the wedding") || lowerTitle.includes("second epilogue")) {
        author = "Julia Quinn";
        extractedSeries = "Bridgerton";
        if (lowerTitle.includes("duke and i")) { title = "The Duke and I"; extractedVolume = "1"; }
        else if (lowerTitle.includes("viscount who loved me")) { title = "The Viscount Who Loved Me"; extractedVolume = "2"; }
        else if (lowerTitle.includes("offer from a gentleman")) { title = "An Offer From a Gentleman"; extractedVolume = "3"; }
        else if (lowerTitle.includes("romancing mister bridgerton")) { title = "Romancing Mister Bridgerton"; extractedVolume = "4"; }
        else if (lowerTitle.includes("to sir phillip")) { title = "To Sir Phillip, With Love"; extractedVolume = "5"; }
        else if (lowerTitle.includes("when he was wicked")) { title = "When He Was Wicked"; extractedVolume = "6"; }
        else if (lowerTitle.includes("its in his kiss") || lowerTitle.includes("it\'s in his kiss")) { title = "It's in His Kiss"; extractedVolume = "7"; }
        else if (lowerTitle.includes("on the way to the wedding")) { title = "On the Way to the Wedding"; extractedVolume = "8"; }
        else if (lowerTitle.includes("second epilogue")) { title = "The Bridgertons: Happily Ever After"; extractedVolume = "9"; }
    }

    // Spy School & FunJungle Master Rules
    if (lowerTitle.includes("spy school") || lowerTitle.includes("spy camp") || lowerTitle.includes("evil spy") || lowerTitle.includes("spy ski") || lowerTitle.includes("secret service") || lowerTitle.includes("spy on history")) {
        author = "Stuart Gibbs";
        extractedSeries = "Spy School";
    }
    if (lowerTitle.includes("funjungle") || lowerTitle.includes("belly up") || lowerTitle.includes("poached") || lowerTitle.includes("big game") || lowerTitle.includes("panda-monium") || lowerTitle.includes("lion down") || lowerTitle.includes("tyrannosaurus wrecks") || lowerTitle.includes("bear bottom") || lowerTitle.includes("whale done")) {
        author = "Stuart Gibbs";
        extractedSeries = "FunJungle";
    }

    if (lowerTitle.includes("harry potter") || lowerTitle.includes("chamber of secrets") || lowerTitle.includes("prisoner of azkaban") || lowerTitle.includes("goblet of fire") || lowerTitle.includes("order of the phoenix") || lowerTitle.includes("half-blood prince") || lowerTitle.includes("deathly hallows") || lowerTitle.includes("philosopher") || lowerTitle.includes("sorcerer")) {
        author = "J. K. Rowling";
        if (lowerTitle.includes("chamber of secrets")) title = "Harry Potter and the Chamber of Secrets";
        else if (lowerTitle.includes("prisoner of azkaban")) title = "Harry Potter and the Prisoner of Azkaban";
        else if (lowerTitle.includes("goblet of fire")) title = "Harry Potter and the Goblet of Fire";
        else if (lowerTitle.includes("order of the phoenix")) title = "Harry Potter and the Order of the Phoenix";
        else if (lowerTitle.includes("half-blood prince") || lowerTitle.includes("half blood prince")) title = "Harry Potter and the Half-Blood Prince";
        else if (lowerTitle.includes("deathly hallows")) title = "Harry Potter and the Deathly Hallows";
        else if (lowerTitle.includes("philosopher") || lowerTitle.includes("sorcerer") || (lowerTitle.includes("harry potter") && (lowerTitle.includes("01") || lowerTitle.includes("bk 1") || lowerTitle.includes("book 1")))) title = "Harry Potter and the Sorcerer's Stone";
    }

    if (!title || !title.trim()) {
        title = clean || rawBase.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim();
        // The fallback might contain unclosed brackets from truncation, which causes exponential loops. Strip them.
        title = title.replace(/\[[^\]]*$/, "").replace(/\([^)]*$/, "").trim();
        // Aggressively strip complete brackets from the fallback too, to prevent series loops
        title = title.replace(/\[[^\]]+\]/g, "").trim();
    }
    if (!title || !title.trim()) {
        title = "Unknown Title";
    }

    return {
        title: title || clean,
        author,
        series: extractedSeries,
        volumeNumber: extractedVolume,
        cleanQuery: `${title || clean} ${author !== "Unknown Author" ? author : ""}`.trim()
    };
}

function cleanDiscSuffixFromFolder(folderName: string): string {
    return folderName
        .replace(/[\s._-]+(?:Disc|CD|Part|Vol|Volume|Disk)[\s._-]*\d+$/i, "")
        .replace(/[\s._-]*\((?:Disc|CD|Part|Vol|Volume|Disk)[\s._-]*\d+\)$/i, "")
        .replace(/[\s._-]*\[(?:Disc|CD|Part|Vol|Volume|Disk)[\s._-]*\d+\]$/i, "")
        .replace(/[\s._-]+(?:Disc|CD|Part|Vol|Volume|Disk)[\s._-]*\d+[\s._-]+of[\s._-]*\d+$/i, "")
        .trim();
}

function getEffectiveBookBaseName(fullPath: string, file: string, ext: string): string {
    const rawBase = path.basename(file, ext);
    const parentFolder = path.basename(path.dirname(fullPath));
    const grandParentFolder = path.basename(path.dirname(path.dirname(fullPath)));
    const discPattern = /^(?:Disc|CD|Part|Vol|Volume|Track|Disk)\s*\d+$/i;
    const pureNumPattern = /^\d+$/;

    const cleanedParent = cleanDiscSuffixFromFolder(parentFolder);
    const cleanedGrandParent = cleanDiscSuffixFromFolder(grandParentFolder);

    const isTrackFilename = /^(?:\d{1,3}[\s._-]+)+/i.test(rawBase.trim()) || discPattern.test(rawBase.trim()) || pureNumPattern.test(rawBase.trim());

    if (isTrackFilename && parentFolder && parentFolder !== "." && parentFolder !== "/" && parentFolder.length > 2) {
        if (discPattern.test(parentFolder.trim()) || pureNumPattern.test(parentFolder.trim())) {
            if (cleanedGrandParent && cleanedGrandParent !== "." && cleanedGrandParent !== "/" && cleanedGrandParent.length > 2) {
                return cleanedGrandParent;
            }
        }
        return cleanedParent;
    }

    if (discPattern.test(parentFolder.trim())) {
        if (cleanedGrandParent && cleanedGrandParent !== "." && cleanedGrandParent !== "/" && cleanedGrandParent.length > 2) {
            return cleanedGrandParent;
        }
    }

    if (cleanedParent && cleanedParent !== "." && cleanedParent !== "/" && cleanedParent.length > 2) {
        const parentLower = cleanedParent.toLowerCase();
        const isGenericRoot = parentLower === "books" || 
                              parentLower === "audiobooks" || 
                              parentLower === "userbooks" || 
                              parentLower === "kidsbooks" || 
                              parentLower === "kyrabooks" || 
                              parentLower === "downloads" || 
                              parentLower === "public library" || 
                              parentLower === "public audiobooks" || 
                              parentLower.includes("library") ||
                              parentLower.includes("bookshelf");
        if (!isGenericRoot) {
            return cleanedParent;
        }
    }

    return rawBase;
}

function extractMetadataFromPath(fullPath: string, file: string, ext: string, scanPath: string): { title: string, author: string, series: string | null, volumeNumber: string | null, cleanQuery: string } {
    const rawBase = path.basename(file, ext);
    let title = rawBase;
    let author = "Unknown Author";

    const parsedFile = parseFilenameMetadata(rawBase);
    if (parsedFile.author !== "Unknown Author") {
        return { title: parsedFile.title, author: parsedFile.author, series: parsedFile.series, volumeNumber: parsedFile.volumeNumber, cleanQuery: parsedFile.cleanQuery };
    }

    const discPattern = /^(?:Disc|CD|Part|Vol|Volume|Track|Disk)\s*\d+$/i;
    const pureNumPattern = /^\d+$/;
    const isTrackFilename = /^(?:\d{1,3}[\s._-]+)+/i.test(rawBase.trim()) || discPattern.test(rawBase.trim()) || pureNumPattern.test(rawBase.trim()) || rawBase.length <= 3;

    const relPath = path.relative(scanPath, fullPath);
    const parts = relPath.split(path.sep).filter(Boolean);

    if (parts.length > 0 && parts[parts.length - 1] === file) {
        parts.pop();
    }

    const cleanParts = parts.filter(p => {
        const lower = p.toLowerCase();
        if (lower === "unknown author" || lower === "unknown") return false;
        if (/^(?:Disc|CD|Part|Vol|Volume|Track|Disk)\s*\d+$/i.test(lower)) return false;
        return true;
    });

    if (cleanParts.length >= 2) {
        author = cleanParts[cleanParts.length - 2];
        const folderTitle = cleanParts[cleanParts.length - 1];
        if (isTrackFilename) {
            title = folderTitle;
        } else {
            title = parsedFile.title || rawBase;
            // Extract series info from the parent folder if the file lacked it
            const folderMeta = parseFilenameMetadata(folderTitle);
            if (folderMeta.series && !parsedFile.series) {
                parsedFile.series = folderMeta.series;
                parsedFile.volumeNumber = folderMeta.volumeNumber;
            }
        }
    } else if (cleanParts.length === 1) {
        if (!isTrackFilename) {
            const folder = cleanParts[0];
            const fileTitle = parsedFile.title || rawBase;
            const isExactMatch = folder.toLowerCase() === fileTitle.toLowerCase();
            const isSubstring = fileTitle.toLowerCase().includes(folder.toLowerCase());

            if (isExactMatch || isSubstring) {
                author = "Unknown Author";
                title = fileTitle;
            } else {
                const authorPattern = /^(?:[A-Z]\.?(?:\s*[A-Z]\.?)*\s+[A-Za-z'-]+|[A-Z][a-z]+(?:\s+(?:[A-Z]\.?|[A-Z][a-z]+)){1,3})$/;
                if (authorPattern.test(folder)) {
                    author = folder;
                    title = fileTitle;
                } else {
                    // It was likely split by a previous buggy scan (e.g. folder="Harry Potter and the Half", file="Blood Prince")
                    author = "Unknown Author";
                    title = (folder + "-" + fileTitle).replace(/\s*-\s*/g, "-");
                }
            }
        } else {
            const parsedFolder = parseFilenameMetadata(cleanParts[0]);
            if (parsedFolder.author !== "Unknown Author") {
                author = parsedFolder.author;
                title = parsedFolder.title;
            } else {
                title = parsedFolder.title || cleanParts[0];
            }
        }
    } else {
        title = parsedFile.title || rawBase;
    }
    
    const finalParse = parseFilenameMetadata(title);
    if (finalParse.author !== "Unknown Author" && author === "Unknown Author") {
        author = finalParse.author;
    }
    // ALWAYS clean the title to prevent exponential bracket duplication!
    if (finalParse.title) {
        title = finalParse.title;
    }

    return { title, author, series: finalParse.series || parsedFile.series, volumeNumber: finalParse.volumeNumber || parsedFile.volumeNumber, cleanQuery: `${title} ${author !== "Unknown Author" ? author : ""}`.trim() };
}

function purgeEmptyDirectories(dir: string) {
    if (!fs.existsSync(dir)) return;
    try {
        const files = fs.readdirSync(dir);
        let isEmpty = true;
        
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                purgeEmptyDirectories(fullPath);
                if (fs.existsSync(fullPath)) {
                    isEmpty = false;
                }
            } else {
                const isIgnored = 
                    file === '.DS_Store' || 
                    file === 'Thumbs.db' || 
                    file === 'desktop.ini' || 
                    file === '.nomedia' ||
                    file === '.portalarr-missing' ||
                    file.endsWith('.jpg') ||
                    file.endsWith('.png') ||
                    file.endsWith('.nfo') ||
                    file.endsWith('.txt') ||
                    file.endsWith('.cue') ||
                    file.endsWith('.md5') ||
                    file.endsWith('.url') ||
                    file.endsWith('.log') ||
                    file.endsWith('.srt');
                if (!isIgnored) {
                    isEmpty = false;
                }
            }
        }
        
        if (isEmpty) {
            fs.rmSync(dir, { recursive: true, force: true });
            console.log(`[CLEANUP] 🧹 Purged zombie directory: ${dir}`);
        }
    } catch (e) {}
}

export async function scanLibraryInternal(libraryId: string, options?: { enableAi?: boolean }) {
    const library = await prisma.library.findUnique({
        where: { id: libraryId }
    });
    if (!library) return { success: false, error: "Library entry not found in database" };

    if (library.name.toLowerCase().includes("audio") && library.mediaType !== "audiobook") {
        console.log(`[SCANNER-REPAIR] 🔧 Auto-repairing library "${library.name}" mediaType to "audiobook"...`);
        await prisma.library.update({
            where: { id: libraryId },
            data: { mediaType: "audiobook", downloadCategory: "audiobooks" }
        }).catch(() => {});
        library.mediaType = "audiobook";
    }
    
    let scanPath = library.path || "";
    
    // Auto-discover path only if completely unset
    if (!scanPath) {
        const candidates = [
            "/user/Books",
            "/Userbooks",
            "/user/books",
            "/Kidsbooks",
            "/kidsbooks",
            "/Kyrabooks",
            "/kyrabooks",
            "/books",
            "/audiobooks",
            "/downloads",
            "/mnt/user/Books",
            "/mnt/user/books",
            "./Userbooks",
            "./books"
        ];
        for (const cand of candidates) {
            if (cand && fs.existsSync(cand)) {
                scanPath = cand;
                await prisma.library.update({
                    where: { id: libraryId },
                    data: { path: scanPath }
                }).catch(() => {});
                break;
            }
        }
    }

    if (!scanPath || !fs.existsSync(scanPath)) {
        return { success: false, error: `Library path "${scanPath || 'Unknown'}" does not exist on disk for "${library.name}". Please check your Docker volume mappings or Settings -> Access Control.` };
    }

    try {
        // Purge any accidental generic library folder cards saved as books
        try {
            await prisma.book.deleteMany({
                where: {
                    OR: [
                        { title: { equals: "Userbooks" } },
                        { title: { equals: "User Books" } },
                        { title: { equals: "Kidsbooks" } },
                        { title: { equals: "Kids Books" } },
                        { title: { equals: "Kyrabooks" } },
                        { title: { equals: "Kyra Books" } },
                        { title: { equals: "Books" } },
                        { title: { equals: "Audiobooks" } },
                        { title: { equals: "Downloads" } },
                        { title: { equals: "Info" } }
                    ]
                }
            });
        } catch (e) {}

        const dbBooks = await prisma.book.findMany({
            where: { libraryId: libraryId }
        });
        const allDbBooks = await prisma.book.findMany();

        const dbBooksByPathLower = new Map<string, any>();
        for (const b of dbBooks) {
            dbBooksByPathLower.set(b.filePath.toLowerCase(), b);
        }
        const allDbBooksByPathLower = new Map<string, any>();
        for (const b of allDbBooks) {
            allDbBooksByPathLower.set(b.filePath.toLowerCase(), b);
        }



        // Auto-consolidate any duplicate database entries for multi-disc/multi-part audiobooks
        if (library.mediaType === "audiobook") {
            try {
                const allDbBooks = await prisma.book.findMany({ where: { libraryId } });
                const titleGroups = new Map<string, any[]>();
                for (const b of allDbBooks) {
                    const cleanMeta = parseFilenameMetadata(b.title);
                    const normKey = cleanDiscSuffixFromFolder(cleanMeta.title).toLowerCase().replace(/[^a-z0-9]/g, "");
                    if (normKey.length > 2) {
                        if (!titleGroups.has(normKey)) {
                            titleGroups.set(normKey, []);
                        }
                        titleGroups.get(normKey)!.push(b);
                    }
                }

                for (const group of Array.from(titleGroups.values())) {
                    if (group.length > 1) {
                        const primary = group[0];
                        let totalBytes = 0;
                        for (const item of group) {
                            totalBytes += (item.fileSize || 0);
                        }

                        const targetTitle = primary.title;
                        const targetAuthor = primary.author;

                        await prisma.book.updateMany({
                            where: { id: primary.id },
                            data: {
                                fileSize: totalBytes,
                                title: targetTitle,
                                author: targetAuthor
                            }
                        }).catch(() => {});

                        const deleteIds = group.slice(1).map(item => item.id);
                        await prisma.book.deleteMany({
                            where: { id: { in: deleteIds } }
                        });
                    }
                }
            } catch (e) {}
        }

        console.log(`[SCANNER] 📁 Scanning library "${library.name}" (Type: ${library.mediaType || "ebook"}) at path: "${scanPath}"...`);

        const isAudiobookLib = library.mediaType === "audiobook";
        const validExtensions = isAudiobookLib
            ? [".m4b", ".mp3", ".m4a", ".flac", ".aac", ".ogg", ".opus", ".zip", ".rar"]
            : [".pdf", ".epub", ".mobi", ".cbz", ".cbr", ".azw3"];

        const foundMediaItems: { fullPath: string, file: string, ext: string, stats: fs.Stats }[] = [];
        const seenPaths = new Set<string>();

        function collectFiles(dir: string, depth = 0) {
            if (!dir || !fs.existsSync(dir)) return;
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullP = path.join(dir, entry.name);
                    if (seenPaths.has(fullP.toLowerCase())) continue;
                    seenPaths.add(fullP.toLowerCase());

                    if (entry.isDirectory()) {
                        if (depth < 6) {
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
            } catch (e) {}
        }

        // Build list of paths to scan strictly scoped to this library's configured path
        const pathsToScan = [scanPath];

        for (const targetDir of pathsToScan) {
            collectFiles(targetDir);
        }

        collectFiles(scanPath);

        let finalMediaItems = foundMediaItems;
        if (isAudiobookLib) {
            const consolidatedMap = new Map<string, { fullPath: string, file: string, ext: string, stats: any }>();
            for (const item of foundMediaItems) {
                const parentDir = path.dirname(item.fullPath);
                let groupFolder = item.fullPath; // default for loose files in root

                if (parentDir !== scanPath) {
                    const parentName = path.basename(parentDir);
                    const isDiscFolder = /^(?:Disc|CD|Part|Vol|Volume|Track|Disk)\s*\d+$/i.test(parentName.trim());
                    if (isDiscFolder && path.dirname(parentDir) !== scanPath) {
                        groupFolder = path.dirname(parentDir);
                    } else {
                        groupFolder = parentDir;
                    }
                }

                const folderKey = groupFolder.toLowerCase();
                
                const folderLower = path.basename(groupFolder).toLowerCase();
                const isGenericRootFolder = folderLower === "books" || folderLower === "audiobooks" || folderLower === "userbooks" || folderLower === "kidsbooks" || folderLower === "kyrabooks" || folderLower === "downloads" || folderLower.includes("library") || folderLower.includes("bookshelf");
                if (isGenericRootFolder && groupFolder !== item.fullPath) {
                    // Fallback to grouping by file itself if the parent is a generic root
                    groupFolder = item.fullPath;
                }

                if (!consolidatedMap.has(folderKey)) {
                    consolidatedMap.set(folderKey, {
                        fullPath: groupFolder,
                        file: item.file,
                        ext: item.ext,
                        stats: { size: item.stats.size }
                    });
                } else {
                    const existing = consolidatedMap.get(folderKey)!;
                    existing.stats.size += item.stats.size;
                    const validAudioExts = [".m4b", ".mp3", ".m4a", ".flac", ".aac", ".ogg", ".opus", ".wav"];
                    if (!validAudioExts.includes(existing.ext) && validAudioExts.includes(item.ext)) {
                        existing.file = item.file;
                        existing.ext = item.ext;
                    } else if (item.ext === ".m4b" && existing.ext !== ".m4b") {
                        existing.file = item.file;
                        existing.ext = item.ext;
                    }
                }
            }
            finalMediaItems = Array.from(consolidatedMap.values());
        }

        console.log(`[SCANNER] 🔍 Located ${foundMediaItems.length} media files on disk for "${library.name}". (Consolidated into ${finalMediaItems.length} entries)`);

        // Safety check to prevent database wipeout due to unmounted remote shares
        if (finalMediaItems.length === 0 && dbBooks.length > 0) {
            console.warn(`[SCANNER] ⚠️ Library directory "${library.path}" contains 0 ${isAudiobookLib ? "audiobook" : "ebook"} files, but database contains ${dbBooks.length} items. Skipping scan to prevent database wipe.`);
            return { success: true };
        }

        const matchedDbBookIds = new Set<string>();

        for (const item of finalMediaItems) {
            const { file, ext, stats } = item;
            let fullPath = item.fullPath;
            if (!fs.existsSync(fullPath)) {
                continue; // File was moved/deleted by a concurrent scan thread
            }

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

                const targetMediaType = library.mediaType || "ebook";
                const effectiveFilePath = isAudiobookLib ? path.join(fullPath, file) : fullPath;

                let existing = dbBooksByPathLower.get(fullPath.toLowerCase());
                if (!existing) {
                    const crossMatch = allDbBooksByPathLower.get(fullPath.toLowerCase());
                    if (crossMatch && (crossMatch.mediaType || "ebook") === targetMediaType) {
                        existing = crossMatch;
                    }
                }
                
                if (existing && matchedDbBookIds.has(existing.id)) {
                    const rowIsEpub = (existing.filePath || "").toLowerCase().endsWith(".epub");
                    const newIsEpub = ext === ".epub";
                    if (rowIsEpub && !newIsEpub) {
                        continue; // Skip worse duplicate file
                    } else if (newIsEpub && !rowIsEpub) {
                        // Allow stealing the row
                    } else if (stats.size <= (existing.fileSize || 0)) {
                        continue; // Skip smaller/equal duplicate file
                    }
                }

                // ==== AUTO-ORGANIZE ALL ITEMS (NEW & EXISTING) ====
                let orgTitle = "";
                let orgAuthor = "";
                let orgSeries = "";
                let orgVolume = "";
                if (existing) {
                    orgTitle = existing.title || "";
                    orgAuthor = existing.author || "";
                    orgSeries = existing.series || "";
                    orgVolume = existing.volumeNumber || "";
                }
                
                const cleanBaseCheckForOrg = getEffectiveBookBaseName(effectiveFilePath, file, ext);
                const parsedMetaCheckForOrg = extractMetadataFromPath(effectiveFilePath, file, ext, scanPath);
                
                if (!orgTitle || !orgAuthor || orgAuthor === "Unknown Author") {
                    if (!orgTitle) orgTitle = parsedMetaCheckForOrg.title || cleanBaseCheckForOrg;
                    if (!orgAuthor || orgAuthor === "Unknown Author") orgAuthor = parsedMetaCheckForOrg.author || "Unknown Author";
                    if (!orgSeries) orgSeries = parsedMetaCheckForOrg.series || "";
                    if (!orgVolume) orgVolume = parsedMetaCheckForOrg.volumeNumber || "";
                }

                if (library.path && orgTitle) {
                    try {
                        let seriesTag = "";
                        if (orgSeries) {
                            let safeSeries = orgSeries.replace(/[\\/\\\\?%*:|"\[\]<>]/g, "").trim();
                            let vol = orgVolume ? orgVolume.replace(/[^a-zA-Z0-9.\\-]/g, "").trim() : "01";
                            if (vol.length === 1) vol = "0" + vol;
                            seriesTag = `[${safeSeries} ${vol}] `;
                        }

                        const safeAuthor = (orgAuthor && orgAuthor !== "Unknown Author") 
                            ? orgAuthor.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim() 
                            : "Unknown Author";
                            
                        let safeTitle = orgTitle.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim();
                        safeTitle = parseFilenameMetadata(safeTitle).title; // Strip any baked-in tags
                        let safeTitleWithSeries = `${seriesTag}${safeTitle}`;
                        if (safeTitleWithSeries.length > 100) safeTitleWithSeries = safeTitleWithSeries.substring(0, 100).trim();

                        const destFolder = path.join(library.path, safeAuthor, safeTitleWithSeries);
                        safeTitle = safeTitleWithSeries; // Reassign safeTitle so the file itself gets the tag too!
                        
                        if (!fs.existsSync(destFolder)) {
                            fs.mkdirSync(destFolder, { recursive: true });
                        }
                        const isDir = fs.statSync(fullPath).isDirectory();
                        if (isDir) {
                            if (fullPath !== destFolder) {
                                try {
                                    await fs.promises.rename(fullPath, destFolder);
                                } catch (err: any) {
                                    if (err.code === 'EXDEV' || err.code === 'ENOTEMPTY' || err.code === 'EEXIST' || err.code === 'EPERM') {
                                        await copyFolderRecursiveAsync(fullPath, destFolder);
                                        removePathSafely(fullPath);
                                    } else throw err;
                                }
                                await setPermissionsRecursiveAsync(destFolder);
                                fullPath = destFolder;
                                console.log(`[SCANNER-AUTO-ORGANIZE] Moved folder to ${fullPath}`);
                                logger.addLog("INFO", "SCANNER", `📁 AUTO-ORGANIZE: Moved folder into pristine path -> "${destFolder}"`);
                            }
                        } else {
                            const newFileName = safeAuthor ? `${safeAuthor} - ${safeTitle}${ext}` : `${safeTitle}${ext}`;
                            const destPath = path.join(destFolder, newFileName);
                            if (fullPath !== destPath) {
                                try {
                                    await fs.promises.rename(fullPath, destPath);
                                } catch (err: any) {
                                    if (err.code === 'EXDEV' || err.code === 'EEXIST' || err.code === 'EPERM') {
                                        await fs.promises.copyFile(fullPath, destPath);
                                        removePathSafely(fullPath);
                                    } else throw err;
                                }
                                await setPermissionsRecursiveAsync(destPath);
                                const oldDir = path.dirname(fullPath);
                                fullPath = destPath;
                                console.log(`[SCANNER-AUTO-ORGANIZE] Moved/Renamed file to ${fullPath}`);
                                logger.addLog("INFO", "SCANNER", `📁 AUTO-ORGANIZE: Renamed & moved file into pristine path -> "${destPath}"`);
                                
                                try {
                                    if (fs.existsSync(oldDir)) {
                                        cleanUpEmptyFolder(oldDir);
                                    }
                                } catch (e) {}
                            }
                        }
                    } catch (orgErr: any) {
                        if (orgErr.code === 'ENOENT') continue;
                        console.error(`[SCANNER-AUTO-ORGANIZE] Failed to organize ${fullPath}:`, orgErr.message);
                        logger.addLog("ERROR", "SCANNER", `❌ AUTO-ORGANIZE FAILED for "${fullPath}": ${orgErr.message}`);
                    }
                }
                // ==== END AUTO-ORGANIZE ====

                if (!existing) {
                    const cleanBaseCheck = getEffectiveBookBaseName(effectiveFilePath, file, ext);
                    const parsedMetaCheck = extractMetadataFromPath(effectiveFilePath, file, ext, scanPath);
                    const targetTitleNorm = getNormTitle(parsedMetaCheck.title || cleanBaseCheck);

                    if (targetTitleNorm.length > 3) {
                        const targetMediaType = library.mediaType || "ebook";
                        existing = dbBooks.find(b => {
                            const dbMediaType = b.mediaType || "ebook";
                            if (dbMediaType !== targetMediaType) return false;
                            const dbTitleNorm = getNormTitle(b.title || "");
                            if (dbTitleNorm !== targetTitleNorm) return false;
                            
                            if (matchedDbBookIds.has(b.id)) {
                                const rowIsEpub = (b.filePath || "").toLowerCase().endsWith(".epub");
                                const newIsEpub = ext === ".epub";
                                if (rowIsEpub && !newIsEpub) return false;
                                if (newIsEpub && !rowIsEpub) return true;
                                if (stats.size <= (b.fileSize || 0)) return false;
                            }
                            return true;
                        });
                    }
                }

                if (!existing) {
                    const cleanBase = getEffectiveBookBaseName(effectiveFilePath, file, ext);
                    const parsedMeta = extractMetadataFromPath(effectiveFilePath, file, ext, scanPath);
                    let title = parsedMeta.title;
                    let author = parsedMeta.author;
                    let coverUrl = "";

                    const normT = (title || "").toLowerCase().trim();
                    if (normT === "userbooks" || normT === "user books" || normT === "books" || normT === "audiobooks" || normT === "downloads") {
                        continue;
                    }

                    // Dynamic Author Heuristic based on existing DB authors & requested authors
                    try {
                        const titleLower = (title || "").toLowerCase();
                        const isProtectedTitle = titleLower.startsWith("harry potter") ||
                                                titleLower.startsWith("the lord of the rings") ||
                                                titleLower.startsWith("the hobbit") ||
                                                titleLower.startsWith("alix") ||
                                                titleLower.startsWith("percy jackson");

                        if (!isProtectedTitle && author === "Unknown Author") {
                            const dbAuthors = await prisma.book.findMany({
                                where: { author: { not: "Unknown Author" } },
                                select: { author: true },
                                distinct: ['author']
                            });

                            for (const row of dbAuthors) {
                                if (!row.author) continue;
                                const auth = row.author.trim();
                                const authLower = auth.toLowerCase();
                                if (authLower.length > 3 && !authLower.startsWith("harry potter") && !authLower.startsWith("the lord")) {
                                    if (titleLower.startsWith(authLower) && title.length > auth.length + 3) {
                                        author = auth;
                                        const newT = title.substring(auth.length).replace(/^[:\-\s]+/, "").trim();
                                        if (newT.length >= 3) title = newT;
                                        break;
                                    }
                                }
                            }
                        }
                    } catch (e) {}

                    if (!title || !title.trim()) {
                        title = parsedMeta.title || cleanBase;
                    }

                    let series: string | null = null;
                    let volumeNumber: string | null = null;

                    if (options?.enableAi) {
                        try {
                            const aiMeta = await resolveMetadataWithAI(parsedMeta.cleanQuery || cleanBase, library.mediaType || "ebook");
                            if (aiMeta) {
                                if (aiMeta.title) title = aiMeta.title;
                                if (aiMeta.author && aiMeta.author !== "Unknown Author") author = aiMeta.author;
                                if (aiMeta.series) series = aiMeta.series;
                                if (aiMeta.volumeNumber) volumeNumber = String(aiMeta.volumeNumber);
                            }
                        } catch (e) {}
                    }

                    const fileAddedDate = (stats.birthtime && stats.birthtime.getTime() > 0 && stats.birthtime.getFullYear() > 1970)
                        ? stats.birthtime
                        : (stats.mtime || new Date());

                    try {
                        let newBook = await prisma.book.findFirst({
                            where: { filePath: fullPath }
                        });

                        if (!newBook) {
                            newBook = await prisma.book.create({
                                data: {
                                    title,
                                    author,
                                    series,
                                    volumeNumber,
                                    coverUrl: "",
                                    filePath: fullPath,
                                    fileSize: stats.size,
                                    fileType: ext.replace(".", ""),
                                    mediaType: library.mediaType || "ebook",
                                    libraryId: libraryId,
                                    createdAt: fileAddedDate
                                }
                            });
                            logger.addLog("SUCCESS", "DATABASE", `✍️ DB-WRITE (Create): Created book "${title}" by "${author}" (ID: ${newBook.id}, Path: "${fullPath}", Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
                            console.log(`[SCANNER] 💾 Saved book to DB: "${title}" by "${author}" ${series ? `[Series: ${series} #${volumeNumber || "?"}]` : ""} (ID: ${newBook.id})`);
                        }
                        
                        matchedDbBookIds.add(newBook.id);
                        
                        if (options?.enableAi) {
                            await renameBookFileOnDisk(newBook.id);
                        }

                        // Fetch cover artwork asynchronously in background
                        (async () => {
                            try {
                                const fetchedCover = await fetchBookCover(title, author, library.mediaType || "ebook");
                                if (fetchedCover) {
                                    console.log(`[SCANNER] 🖼️ Cover artwork fetched for "${title}": ${fetchedCover}`);
                                    await prisma.book.updateMany({
                                        where: { id: newBook.id },
                                        data: { coverUrl: fetchedCover }
                                    }).catch(() => {});
                                }
                            } catch (e) {}
                        })();
                    } catch (createErr: any) {
                        logger.addLog("ERROR", "DATABASE", `❌ DB-WRITE FAILED for "${title}" by "${author}": ${createErr.message}`);
                        console.error(`[SCANNER-ERROR] Failed to save book "${title}" to DB:`, createErr.message);
                    }
                } else {
                    matchedDbBookIds.add(existing.id);
                    const updateData: any = {};
                    if (existing.libraryId !== libraryId) updateData.libraryId = libraryId;
                    if (existing.fileSize !== stats.size) updateData.fileSize = stats.size;
                    if (existing.filePath !== fullPath) updateData.filePath = fullPath;
                    if (existing.mediaType !== (library.mediaType || "ebook")) updateData.mediaType = library.mediaType || "ebook";
                    
                    const newFileType = ext.replace(".", "") || "folder";
                    if (existing.fileType !== newFileType) updateData.fileType = newFileType;

                    if (Object.keys(updateData).length > 0) {
                        logger.addLog("INFO", "DATABASE", `🔄 DB-CHANGE (Update): Reassigned/Updated book "${existing.title}" (ID: ${existing.id}, Target Lib: "${library.name}", New Path: "${fullPath}", Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
                        console.log(`[SCANNER] 🔄 Reassigned/Updated book "${existing.title}" to library "${library.name}" (ID: ${existing.id})`);
                        await prisma.book.updateMany({
                            where: { id: existing.id },
                            data: updateData
                        }).catch(() => {});
                        Object.assign(existing, updateData);
                    }
                    const cleanBase = getEffectiveBookBaseName(effectiveFilePath, file, ext);
                    const parsedMeta = extractMetadataFromPath(effectiveFilePath, file, ext, scanPath);
                    let parsedAuthor = parsedMeta.author;
                    let parsedTitle = parsedMeta.title;

                    let title = parsedTitle;
                    let author = parsedAuthor;
                    let coverUrl = existing.coverUrl || "";

                    const needsCleaning = existing.title !== title || 
                                          existing.author !== author || 
                                          existing.author === "Unknown Author" || 
                                          existing.title.includes("[") || 
                                          existing.title.includes("]") ||
                                          existing.title.includes("(");

                    if (needsCleaning || !coverUrl) {
                        (async () => {
                            try {
                                const fetchedCover = await fetchBookCover(title, author, library.mediaType || "ebook");
                                if (fetchedCover) {
                                    coverUrl = fetchedCover;
                                }
                            } catch (e) {}

                            await prisma.book.updateMany({
                                where: { id: existing.id },
                                data: {
                                    title,
                                    author,
                                    coverUrl
                                }
                            }).catch(() => {});
                        })();
                    }
                }
            }

        for (const dbBook of dbBooks) {
            if (!matchedDbBookIds.has(dbBook.id) && dbBook.fileType !== 'missing') {
                try {
                    logger.addLog("WARN", "DATABASE", `🗑️ DB-DELETE: Purged missing book "${dbBook.title}" (ID: ${dbBook.id}) from SQLite.`);
                    await prisma.book.deleteMany({
                        where: { id: dbBook.id }
                    });
                } catch (delErr) {
                    // Ignore record if already deleted
                }
            }
        }

        // Post-scan database deduplication by exact filePath
        try {
            const currentDbBooks = await prisma.book.findMany({ where: { libraryId } });
            const pathMap = new Map<string, string>();
            const duplicateIds: string[] = [];
            
            for (const b of currentDbBooks) {
                const p = b.filePath.toLowerCase();
                if (pathMap.has(p)) {
                    duplicateIds.push(b.id);
                } else {
                    pathMap.set(p, b.id);
                }
            }
            
            if (duplicateIds.length > 0) {
                console.log(`[SCANNER-DEDUP] Purging ${duplicateIds.length} exact file path duplicate rows from SQLite.`);
                await prisma.book.deleteMany({
                    where: { id: { in: duplicateIds } }
                });
            }
        } catch (pathDedupErr) {}

        // Post-scan database deduplication by title key
        try {
            const currentDbBooks = await prisma.book.findMany({ where: { libraryId } });
            const titleMap = new Map<string, typeof currentDbBooks>();
            for (const b of currentDbBooks) {
                let rawLower = (b.title || "").toLowerCase();
                let cleanKey = "";
                if (rawLower.includes("hobbit")) cleanKey = "hobbit";
                else if (rawLower.includes("two towers")) cleanKey = "two towers";
                else if (rawLower.includes("return of the king")) cleanKey = "return of the king";
                else if (rawLower.includes("fellowship of the ring")) cleanKey = "fellowship of the ring";
                else if (rawLower.includes("philosopher") || rawLower.includes("sorcerer") || (rawLower.includes("harry potter") && (rawLower.includes("01") || rawLower.includes("bk 1") || rawLower.includes("book 1") || rawLower.includes(" 1")))) cleanKey = "harry potter 1";
                else if (rawLower.includes("chamber of secrets") || (rawLower.includes("harry potter") && (rawLower.includes("02") || rawLower.includes("bk 2") || rawLower.includes("book 2") || rawLower.includes(" 2")))) cleanKey = "harry potter 2";
                else if (rawLower.includes("prisoner of azkaban") || (rawLower.includes("harry potter") && (rawLower.includes("03") || rawLower.includes("bk 3") || rawLower.includes("book 3") || rawLower.includes(" 3")))) cleanKey = "harry potter 3";
                else if (rawLower.includes("goblet of fire") || (rawLower.includes("harry potter") && (rawLower.includes("04") || rawLower.includes("bk 4") || rawLower.includes("book 4") || rawLower.includes(" 4")))) cleanKey = "harry potter 4";
                else if (rawLower.includes("order of the phoenix") || (rawLower.includes("harry potter") && (rawLower.includes("05") || rawLower.includes("bk 5") || rawLower.includes("book 5") || rawLower.includes(" 5")))) cleanKey = "harry potter 5";
                else if (rawLower.includes("half-blood prince") || rawLower.includes("half blood prince") || (rawLower.includes("harry potter") && (rawLower.includes("06") || rawLower.includes("bk 6") || rawLower.includes("book 6") || rawLower.includes(" 6")))) cleanKey = "harry potter 6";
                else if (rawLower.includes("deathly hallows") || (rawLower.includes("harry potter") && (rawLower.includes("07") || rawLower.includes("bk 7") || rawLower.includes("book 7") || rawLower.includes(" 7")))) cleanKey = "harry potter 7";
                else {
                    let cleanStr = rawLower
                        .replace(/[\(\[]\s*(?:18|19|20)\d\d\s*[\)\]]/gi, " ")
                        .replace(/\b(?:audiobook|ebook|epub|retail|mobi|cbz|mp3|flac|aac|m4b|cbr|vbr|unabridged|abridged|audible|narrated|repack|decipher|web|p2p|readarr|uk|us|ca|au|eu|ind)\b/gi, " ");

                    if (cleanStr.includes("harry potter")) {
                        if (cleanStr.includes("01") || cleanStr.includes("bk 1") || cleanStr.includes("book 1") || cleanStr.includes("vol 1")) cleanKey = "harry potter 1";
                        else if (cleanStr.includes("02") || cleanStr.includes("bk 2") || cleanStr.includes("book 2") || cleanStr.includes("vol 2")) cleanKey = "harry potter 2";
                        else if (cleanStr.includes("03") || cleanStr.includes("bk 3") || cleanStr.includes("book 3") || cleanStr.includes("vol 3")) cleanKey = "harry potter 3";
                        else if (cleanStr.includes("04") || cleanStr.includes("bk 4") || cleanStr.includes("book 4") || cleanStr.includes("vol 4")) cleanKey = "harry potter 4";
                        else if (cleanStr.includes("05") || cleanStr.includes("bk 5") || cleanStr.includes("book 5") || cleanStr.includes("vol 5")) cleanKey = "harry potter 5";
                        else if (cleanStr.includes("06") || cleanStr.includes("bk 6") || cleanStr.includes("book 6") || cleanStr.includes("vol 6")) cleanKey = "harry potter 6";
                        else if (cleanStr.includes("07") || cleanStr.includes("bk 7") || cleanStr.includes("book 7") || cleanStr.includes("vol 7")) cleanKey = "harry potter 7";
                        else cleanKey = cleanStr.replace(/[^a-z0-9]/g, "").trim();
                    } else {
                        cleanKey = cleanStr.replace(/[^a-z0-9]/g, "").trim();
                    }
                }

                if (!cleanKey) continue;
                if (!titleMap.has(cleanKey)) titleMap.set(cleanKey, []);
                titleMap.get(cleanKey)!.push(b);
            }

            for (const [key, group] of titleMap.entries()) {
                if (group.length > 1) {
                    group.sort((a, b) => (b.fileSize || 0) - (a.fileSize || 0));
                    const keepBook = group[0];
                    const deleteIds = group.slice(1).map(b => b.id);
                    console.log(`[SCANNER-DEDUP] Purging ${deleteIds.length} duplicate DB rows for book "${keepBook.title}" (Keeping ID: ${keepBook.id})`);
                    await prisma.book.deleteMany({
                        where: { id: { in: deleteIds } }
                    });
                }
            }
        } catch (dedupErr) {}

        // 8. Clean up empty/zombie directories left behind by the organizer
        if (scanPath && fs.existsSync(scanPath)) {
            console.log(`[SCANNER] 🧹 Running zombie directory sweep on ${scanPath}...`);
            try {
                const topLevelDirs = fs.readdirSync(scanPath);
                for (const d of topLevelDirs) {
                    const fullD = path.join(scanPath, d);
                    if (fs.statSync(fullD).isDirectory()) {
                        purgeEmptyDirectories(fullD);
                    }
                }
            } catch (e) {}
        }

        try {
            revalidatePath("/library");
        } catch (e) {}
        return { success: true };
    } catch (e: any) {
        console.error("Failed to scan library:", e);
        return { success: false, error: e.message || "Failed to scan library folder" };
    }
}

async function getTargetLibraryForUser(username: string, mediaType: string = "ebook", coverUrl?: string | null) {
    try {
        if (coverUrl && coverUrl.includes("?lib=")) {
            const parsedLibId = coverUrl.split("?lib=")[1].split("&")[0];
            const explicitLib = await prisma.library.findUnique({ where: { id: parsedLibId } });
            if (explicitLib) return explicitLib;
        }

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
            // Must NOT be a plain text ebook format (e.g. .epub, (epub), [epub], .azw3, [mobi], .pdf, .cbz)
            const isTextEbook = /\b(?:epub|pdf|mobi|azw3|kfx|cbz|cbr|html)\b/i.test(titleLower) ||
                                /\.(?:epub|pdf|mobi|azw3|kfx|cbz|cbr|html)$/i.test(titleLower) ||
                                /\((?:epub|pdf|mobi|azw3|kfx|cbz|cbr|html)\)/i.test(titleLower) ||
                                /\[(?:epub|pdf|mobi|azw3|kfx|cbz|cbr|html)\]/i.test(titleLower);
            if (isTextEbook) return false;

            // Size: at least 15 MB up to 25 GB for Audiobooks (allowing massive box sets)
            const isValidAudioSize = r.size >= 15 * 1024 * 1024 && r.size <= 25600 * 1024 * 1024;
            if (!isValidAudioSize) return false;

            const categoryStr = r.categories ? JSON.stringify(r.categories) : (r.category ? String(r.category) : "");
            
            // Cannot be purely books category 7000/7010 without audio category
            const isPureEbookCategory = (categoryStr.includes("7000") || categoryStr.includes("7010")) && 
                                        !categoryStr.includes("3030") && 
                                        !categoryStr.includes("3000");
            if (isPureEbookCategory) return false;

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
        
        const targetLib = await getTargetLibraryForUser(requester, reqMediaType, req?.coverUrl);
        const resolvedLibId = targetLib?.id;
        
        // Instant Fulfill: Check if book is already downloaded in the TARGET library
        const normTitleReq = title.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (normTitleReq.length > 2 && resolvedLibId) {
            const allBooks = await prisma.book.findMany({
                where: { mediaType: reqMediaType, libraryId: resolvedLibId }
            });
            const existingBook = allBooks.find(b => {
                const normB = b.title.toLowerCase().replace(/[^a-z0-9]/g, "");
                return normB === normTitleReq || (normTitleReq.length > 5 && normB.includes(normTitleReq));
            });

            if (existingBook) {
                console.log(`[AUTO-DOWNLOAD] Book "${title}" already exists in target library! Fulfilling request ${requestId} immediately.`);
                await prisma.bookRequest.update({
                    where: { id: requestId },
                    data: { status: "Downloaded" }
                });
                return;
            }
        }
        
        // ------------------------------------------------------------------------------------------
        // PORTALARR-RADARR HYBRID: Create "Missing" Book Stub in Library immediately upon approval
        // ------------------------------------------------------------------------------------------
        if (targetLib && resolvedLibId) {
            try {
                const sanitize = (str: string) => str.replace(/[<>:"/\|?*\x00-\x1F]/g, "").trim();
                const seriesTag = req?.series ? `[${sanitize(req.series)}${req.volumeNumber ? ' ' + String(req.volumeNumber).padStart(2, '0') : ''}] ` : "";
                const cleanAuthorStr = sanitize(author || "Unknown Author");
                const cleanTitleStr = sanitize(title);
                
                const folderPath = path.join(targetLib.path, cleanAuthorStr, `${seriesTag}${cleanTitleStr}`);
                
                if (!fs.existsSync(folderPath)) {
                    fs.mkdirSync(folderPath, { recursive: true });
                }
                
                // Add immunity marker for zombie sweeper
                fs.writeFileSync(path.join(folderPath, '.portalarr-missing'), '');

                // Only create DB stub if not already exists (just in case)
                const existingStub = await prisma.book.findFirst({
                    where: { filePath: folderPath }
                });

                if (!existingStub) {
                    const newBook = await prisma.book.create({
                        data: {
                            title: title,
                            author: author || "Unknown Author",
                            series: req?.series || null,
                            volumeNumber: req?.volumeNumber ? String(req.volumeNumber) : null,
                            filePath: folderPath,
                            fileType: 'missing',
                            fileSize: 0,
                            mediaType: reqMediaType,
                            libraryId: resolvedLibId,
                            coverUrl: req?.coverUrl || null
                        }
                    });

                    // Fire off background cover fetcher for the missing stub
                    (async () => {
                        try {
                            const localCov = await fetchBookCover(title, author || "Unknown Author", reqMediaType, folderPath);
                            if (localCov === "local") {
                                await prisma.book.update({ 
                                    where: { id: newBook.id }, 
                                    data: { coverUrl: `/api/cover?id=${newBook.id}` } 
                                });
                                await prisma.bookRequest.update({
                                    where: { id: requestId },
                                    data: { coverUrl: `/api/cover?id=${newBook.id}` }
                                });
                            }
                        } catch (e) {}
                    })();
                }
            } catch (stubErr) {
                console.warn("[AUTO-DOWNLOAD] Failed to generate missing book stub:", stubErr);
            }
        }
        
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
        const cleanTitleBase = title.replace(/\s*\([^)]+\)\s*/g, " ").trim();
        const queryText = author ? `${cleanTitleBase} ${author}` : cleanTitleBase;
        const cleanedQuery = cleanSearchQuery(queryText);
        const cleanTitleOnly = cleanSearchQuery(cleanTitleBase);

        const catQuery = reqMediaType === "audiobook"
            ? "&categories=3030&categories=3000"
            : "&categories=7000&categories=7010&categories=7020&categories=3040";

        // Tier 1: Title + Author in category
        let searchUrl = `${prowlarrUrl}/api/v1/search?query=${encodeURIComponent(cleanedQuery)}${catQuery}&apikey=${prowlarrKey}`;
        let res = await fetch(searchUrl, { cache: "no-store" });
        let results = res.ok ? await res.json() : [];
        let candidates = await filterReleasesForMediaType(results, reqMediaType);

        // Tier 2: Title Only in category if Title + Author returned 0 candidates
        if (candidates.length === 0 && cleanTitleOnly && cleanTitleOnly !== cleanedQuery) {
            console.log(`[AUTO-DOWNLOAD] Tier 1 search yielded 0 candidates. Retrying with Title-only query: "${cleanTitleOnly}"`);
            searchUrl = `${prowlarrUrl}/api/v1/search?query=${encodeURIComponent(cleanTitleOnly)}${catQuery}&apikey=${prowlarrKey}`;
            res = await fetch(searchUrl, { cache: "no-store" });
            if (res.ok) {
                results = await res.json();
                candidates = await filterReleasesForMediaType(results, reqMediaType);
            }
        }

        // Tier 3: Title Only without category filters if initial categories returned 0 candidates
        if (candidates.length === 0 && cleanTitleOnly) {
            console.log(`[AUTO-DOWNLOAD] Tier 2 search yielded 0 candidates. Retrying without category filter for: "${cleanTitleOnly}"`);
            searchUrl = `${prowlarrUrl}/api/v1/search?query=${encodeURIComponent(cleanTitleOnly)}&apikey=${prowlarrKey}`;
            res = await fetch(searchUrl, { cache: "no-store" });
            if (res.ok) {
                results = await res.json();
                candidates = await filterReleasesForMediaType(results, reqMediaType);
            }
        }

        if (candidates.length === 0) {
            await prisma.bookRequest.update({
                where: { id: requestId },
                data: { status: `Failed - No suitable ${reqMediaType} releases found on indexers` }
            });
            return;
        }

        candidates.sort((a: any, b: any) => {
            if (reqMediaType === "ebook") {
                const aTitle = (a.title || "").toLowerCase();
                const bTitle = (b.title || "").toLowerCase();
                const aIsEpub = aTitle.includes("epub");
                const bIsEpub = bTitle.includes("epub");
                
                // Heavily penalize non-epub formats (azw3, mobi, pdf)
                if (aIsEpub && !bIsEpub) return -1;
                if (!aIsEpub && bIsEpub) return 1;
            }

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
            ? "&categories=3030&categories=3000"
            : "&categories=7000&categories=7010&categories=7020&categories=3040";

        // Try raw literal query first
        let searchUrl = `${prowlarrUrl}/api/v1/search?query=${encodeURIComponent(query.trim())}${catQuery}&apikey=${prowlarrKey}`;
        let res = await fetch(searchUrl, { cache: "no-store" });
        let results: any[] = [];
        if (res.ok) {
            results = await res.json();
        }

        // If literal query fails, fallback to cleaned query
        if (results.length === 0 && cleanedQuery && cleanedQuery !== query.trim()) {
            searchUrl = `${prowlarrUrl}/api/v1/search?query=${encodeURIComponent(cleanedQuery)}${catQuery}&apikey=${prowlarrKey}`;
            res = await fetch(searchUrl, { cache: "no-store" });
            if (res.ok) {
                results = await res.json();
            }
        }
        
        // UK Harry Potter Fallback (Sorcerer's -> Philosopher's)
        if (results.length === 0) {
            const ukQuery = query.toLowerCase().replace(/sorcerer'?s?\s*stone/, "philosopher's stone");
            if (ukQuery !== query.toLowerCase()) {
                const cleanUkQuery = cleanSearchQuery(ukQuery);
                // Try literal UK query
                searchUrl = `${prowlarrUrl}/api/v1/search?query=${encodeURIComponent(ukQuery)}${catQuery}&apikey=${prowlarrKey}`;
                res = await fetch(searchUrl, { cache: "no-store" });
                if (res.ok) {
                    results = await res.json();
                }
                
                // Fallback to cleaned UK query if 0
                if (results.length === 0 && cleanUkQuery !== ukQuery) {
                    searchUrl = `${prowlarrUrl}/api/v1/search?query=${encodeURIComponent(cleanUkQuery)}${catQuery}&apikey=${prowlarrKey}`;
                    res = await fetch(searchUrl, { cache: "no-store" });
                    if (res.ok) {
                        results = await res.json();
                    }
                }
            }
        }

        // Final Fallback: Category-less search (Indexers sometimes categorize books broadly)
        if (results.length === 0) {
            searchUrl = `${prowlarrUrl}/api/v1/search?query=${encodeURIComponent(cleanedQuery)}&apikey=${prowlarrKey}`;
            res = await fetch(searchUrl, { cache: "no-store" });
            if (res.ok) {
                results = await res.json();
            }
        }

        // If searching for audiobook and initial query produced few audiobooks, append "audiobook" to query
        if (mediaType === "audiobook") {
            const initialFiltered = await filterReleasesForMediaType(results, mediaType);
            if (initialFiltered.length < 3 && !cleanedQuery.toLowerCase().includes("audiobook")) {
                const audioQueryUrl = `${prowlarrUrl}/api/v1/search?query=${encodeURIComponent(cleanedQuery + " audiobook")}${catQuery}&apikey=${prowlarrKey}`;
                const audioRes = await fetch(audioQueryUrl, { cache: "no-store" });
                if (audioRes.ok) {
                    const audioResults = await audioRes.json();
                    if (Array.isArray(audioResults)) {
                        results = [...results, ...audioResults];
                    }
                }
            }
        }
        
        const filtered = await filterReleasesForMediaType(results, mediaType);
        
        const seen = new Set<string>();
        const uniqueFiltered = filtered.filter((r: any) => {
            const key = (r.downloadUrl || r.title).toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        uniqueFiltered.sort((a: any, b: any) => {
            if (mediaType === "ebook") {
                const aTitle = (a.title || "").toLowerCase();
                const bTitle = (b.title || "").toLowerCase();
                const aIsEpub = aTitle.includes("epub");
                const bIsEpub = bTitle.includes("epub");
                
                if (aIsEpub && !bIsEpub) return -1;
                if (!aIsEpub && bIsEpub) return 1;
            }

            if (a.protocol === "usenet" && b.protocol !== "usenet") return -1;
            if (a.protocol !== "usenet" && b.protocol === "usenet") return 1;
            if (a.protocol === "torrent" && b.protocol === "torrent") {
                return (b.seeders || 0) - (a.seeders || 0);
            }
            return 0;
        });

        return uniqueFiltered.map((r: any) => ({
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

async function cleanOldDownloadsForRequest(requestId: string, title: string) {
    try {
        console.log(`[RE-GRAB CLEANUP] Cleaning previous downloads for request "${title}" (${requestId})...`);

        const qbitApp = await prisma.mediaApp.findFirst({
            where: { type: "qbittorrent" }
        }) || await prisma.mediaApp.findFirst({
            where: { type: { contains: "qbit" } }
        });

        if (qbitApp) {
            const qbitUrl = cleanUrl(qbitApp.url);
            const { hash } = await checkQbitStatus(qbitUrl, title);
            if (hash) {
                await deleteDownload("torrent", hash, title);
            }
        }

        const sabApp = await prisma.mediaApp.findFirst({ where: { type: "sabnzbd" } });
        if (sabApp) {
            const sabUrl = cleanUrl(sabApp.url);
            const sabKey = decryptData(sabApp.apiKey as string);
            await checkSabnzbdStatus(sabUrl, sabKey, "", title);
        }

        const downloadPaths = [
            "/downloads",
            "/downloads/books",
            "/downloads/audiobooks",
            "/downloads/completed",
            "/downloads/complete"
        ];
        
        const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (cleanTitle.length > 3) {
            for (const dp of downloadPaths) {
                if (fs.existsSync(dp)) {
                    try {
                        const entries = fs.readdirSync(dp, { withFileTypes: true });
                        for (const entry of entries) {
                            const entryClean = entry.name.toLowerCase().replace(/[^a-z0-9]/g, "");
                            if (entryClean.includes(cleanTitle) || cleanTitle.includes(entryClean)) {
                                const targetPath = path.join(dp, entry.name);
                                console.log(`[RE-GRAB CLEANUP] Removing old download folder on disk: ${targetPath}`);
                                fs.rmSync(targetPath, { recursive: true, force: true });
                            }
                        }
                    } catch (e) {}
                }
            }
        }
    } catch (e) {
        console.warn("[RE-GRAB CLEANUP] Failed to clean old downloads:", e);
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

    // Wipes old/failed downloads from disk and download client before pushing the new grab!
    await cleanOldDownloadsForRequest(requestId, title);
    
    const requester = req.requestedBy || "";
    const reqMediaType = req.mediaType || "ebook";
    const targetLib = await getTargetLibraryForUser(requester, reqMediaType, req.coverUrl);
    const category = targetLib ? getDownloadCategoryForLibrary(targetLib.name, reqMediaType) : (reqMediaType === "audiobook" ? "audiobooks" : "books");
    
    let downloadId = "";
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
        downloadId = json.nzo_ids?.[0] || "";
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
        data: { status: "Downloading" }
    });

    // Launch background downloader polling for the manually grabbed release
    monitorAndRetryDownload(requestId, [{ title: title, protocol: protocol, downloadUrl: downloadUrl }], 0, downloadId).catch(err => {
        console.error("[RE-GRAB] Auto download monitor failed:", err);
    });

    revalidatePath("/library");
    return { success: true };
}

// ============================================================================
// --- DOWNLOAD MONITORING & AUTO RETRY AUTOMATION HANDLERS ---
// ============================================================================

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function checkSabnzbdStatus(sabUrl: string, sabKey: string, downloadId: string, releaseTitle: string = ""): Promise<"downloading" | "completed" | "failed" | "unknown"> {
    try {
        const titleLower = releaseTitle.toLowerCase().trim();
        const qRes = await fetch(`${sabUrl}/api?mode=queue&output=json&apikey=${sabKey}`);
        if (qRes.ok) {
            const qData = await qRes.json();
            const slots = qData.queue?.slots || [];
            let slot = downloadId ? slots.find((s: any) => s.nzo_id === downloadId) : null;
            if (!slot && titleLower) {
                slot = slots.find((s: any) => 
                    (s.filename || "").toLowerCase().includes(titleLower) || 
                    (s.name || "").toLowerCase().includes(titleLower) ||
                    (titleLower.length > 5 && (s.filename || "").toLowerCase().includes(titleLower.substring(0, 20)))
                );
            }
            if (slot) {
                if (slot.status?.toLowerCase() === "failed") return "failed";
                return "downloading";
            }
        }

        const hRes = await fetch(`${sabUrl}/api?mode=history&output=json&limit=100&apikey=${sabKey}`);
        if (hRes.ok) {
            const hData = await hRes.json();
            const slots = hData.history?.slots || [];
            let slot = downloadId ? slots.find((s: any) => s.nzo_id === downloadId) : null;
            if (!slot && titleLower) {
                slot = slots.find((s: any) => 
                    (s.name || "").toLowerCase().includes(titleLower) || 
                    (s.nzb_name || "").toLowerCase().includes(titleLower) ||
                    (titleLower.length > 5 && (s.name || "").toLowerCase().includes(titleLower.substring(0, 20)))
                );
            }
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
        const res = await fetch(`${qbitUrl}/api/v2/torrents/info`);
        if (!res.ok) return { status: "unknown" };
        const torrents = await res.json();
        
        const torrent = torrents.find((t: any) => 
            t.name.toLowerCase().includes(releaseTitle.toLowerCase()) ||
            releaseTitle.toLowerCase().includes(t.name.toLowerCase())
        );

        if (torrent) {
            const hash = torrent.hash;
            const state = (torrent.state || "").toLowerCase();
            
            if (state === "error" || state === "missingfiles") {
                return { status: "failed", hash };
            }
            if (state === "pausedup" || state === "seeding" || state.includes("complete") || torrent.progress === 1) {
                return { status: "completed", hash };
            }
            if (state.includes("stalled") && torrent.num_seeds === 0) {
                const ageInSeconds = Math.floor(Date.now() / 1000) - torrent.added_on;
                if (ageInSeconds > 180 && torrent.progress === 0) {
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
        let downloadId = "";
    if (protocol === "usenet") {
            const sabApp = await prisma.mediaApp.findFirst({ where: { type: "sabnzbd" } });
            if (sabApp) {
                const sabUrl = cleanUrl(sabApp.url);
                const sabKey = decryptData(sabApp.apiKey as string);
                let targetId = downloadId;
                
                if (!targetId && title) {
                    const titleLower = title.toLowerCase().trim();
                    try {
                        // Search a larger history window (100 items) so we don't miss older completed downloads
                        const hRes = await fetch(`${sabUrl}/api?mode=history&output=json&limit=100&apikey=${sabKey}`);
                        if (hRes.ok) {
                            const hData = await hRes.json();
                            const slot = (hData.history?.slots || []).find((s: any) => 
                                (s.name || "").toLowerCase().includes(titleLower) || 
                                (s.nzb_name || "").toLowerCase().includes(titleLower)
                            );
                            if (slot) targetId = slot.nzo_id;
                        }
                    } catch (e) {}
                }

                if (targetId) {
                    const res1 = await fetch(`${sabUrl}/api?mode=queue&name=delete&value=${targetId}&apikey=${sabKey}`);
                    const res2 = await fetch(`${sabUrl}/api?mode=history&name=delete&value=${targetId}&del_files=1&apikey=${sabKey}`);
                    return res1.ok && res2.ok;
                }
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

function findFirstMediaFileInDir(dir: string, validExtensions: string[], depth = 0): string | null {
    if (!fs.existsSync(dir) || depth > 3) return null;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullP = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                const sub = findFirstMediaFileInDir(fullP, validExtensions, depth + 1);
                if (sub) return sub;
            } else {
                const ext = path.extname(entry.name).toLowerCase();
                if (validExtensions.includes(ext)) {
                    return fullP;
                }
            }
        }
    } catch (e) {}
    return null;
}

function findDownloadedFile(dir: string, bookTitle: string, mediaType: string = "ebook", bookAuthor?: string): string[] {
    if (!fs.existsSync(dir)) {
        return [];
    }
    
    // If the database accidentally saved the author name inside the title string, strip it out for the fuzzy search
    let searchTitle = bookTitle.toLowerCase();
    if (bookAuthor) {
        const authorWords = bookAuthor.toLowerCase().split(/[^a-z0-9]/).filter(w => w.length > 2);
        for (const aw of authorWords) {
            searchTitle = searchTitle.replace(new RegExp(`\\b${aw}\\b`, 'g'), "");
        }
    }

    const cleanBookTitle = searchTitle.replace(/[^a-z0-9]/g, "");
    
    const stopWords = new Set(["and", "the", "for", "with", "from", "that", "this", "these", "those", "a", "an", "of", "to", "in", "on", "at", "by", "or", "but", "as", "is", "are", "was", "were", "be", "been", "has", "have", "had", "do", "does", "did", "epub", "pdf", "mobi", "cbz", "m4b", "mp3", "flac"]);
    
    const titleWords = searchTitle
        .split(/[^a-z0-9]/)
        .filter(w => w.length > 2 && !stopWords.has(w));
        
    let finalTitleWords = titleWords;
    if (finalTitleWords.length === 0) {
        finalTitleWords = searchTitle.split(/[^a-z0-9]/).filter(w => w.length > 0);
    }
    
    const validExtensions = mediaType === "audiobook"
        ? [".m4b", ".mp3", ".m4a", ".flac", ".aac", ".ogg", ".opus", ".zip", ".rar"]
        : [".epub", ".pdf", ".mobi", ".cbz", ".cbr", ".azw3"];
    
    let matches: string[] = [];

    try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                // Skip incomplete SABnzbd folders
                if (file.startsWith("_UNPACK_") || file.startsWith("_FAILED_")) {
                    continue;
                }

                const cleanDirName = file.toLowerCase().replace(/[^a-z0-9]/g, "");
                const cleanFullPath = fullPath.toLowerCase().replace(/[^a-z0-9]/g, "");

                let isDirectoryTitleMatch = false;
                if (cleanDirName.includes(cleanBookTitle) || cleanFullPath.includes(cleanBookTitle)) {
                    isDirectoryTitleMatch = true;
                } else if (finalTitleWords.length > 0) {
                    const combinedStr = `${file} ${fullPath}`.toLowerCase();
                    let matchCount = 0;
                    for (const word of finalTitleWords) {
                        if (combinedStr.includes(word)) {
                            matchCount++;
                        }
                    }
                    const requiredMatches = Math.max(1, Math.ceil(finalTitleWords.length * 0.65));
                    if (matchCount >= requiredMatches) {
                        isDirectoryTitleMatch = true;
                    }
                }

                if (isDirectoryTitleMatch) {
                    const firstMediaFile = findFirstMediaFileInDir(fullPath, validExtensions);
                    if (firstMediaFile) {
                        matches.push(firstMediaFile);
                    }
                }
                
                // Recurse into subdirectories
                const subFound = findDownloadedFile(fullPath, bookTitle, mediaType, bookAuthor);
                if (subFound.length > 0) {
                    matches.push(...subFound);
                }

            } else {
                const ext = path.extname(file).toLowerCase();
                if (validExtensions.includes(ext)) {
                    const cleanFileName = file.toLowerCase().replace(/[^a-z0-9]/g, "");
                    const cleanFullPath = fullPath.toLowerCase().replace(/[^a-z0-9]/g, "");
                    
                    if (cleanFileName.includes(cleanBookTitle) || cleanFullPath.includes(cleanBookTitle) || cleanBookTitle.includes(cleanFileName.replace(/(epub|pdf|mobi|cbz|m4b|mp3|m4a|flac)$/, ""))) {
                        matches.push(fullPath);
                        continue;
                    }
                    
                    const combinedSearchStr = `${file} ${fullPath}`.toLowerCase();
                    let matchCount = 0;
                    for (const word of finalTitleWords) {
                        if (combinedSearchStr.includes(word)) {
                            matchCount++;
                        }
                    }
                    
                    const requiredMatches = Math.max(1, Math.ceil(finalTitleWords.length * 0.65));
                    if (finalTitleWords.length > 0 && matchCount >= requiredMatches) {
                        matches.push(fullPath);
                    }
                }
            }
        }
    } catch (e: any) {
        console.error(`[BACKGROUND-DOWNLOAD-FINDER] Error reading directory ${dir}:`, e.message);
    }
    
    return matches;
}

async function setPermissionsRecursiveAsync(target: string) {
    if (!fs.existsSync(target)) return;
    try {
        const stat = await fs.promises.stat(target);
        if (stat.isDirectory()) {
            await fs.promises.chmod(target, 0o777);
            const files = await fs.promises.readdir(target);
            for (const file of files) {
                await setPermissionsRecursiveAsync(path.join(target, file));
            }
        } else {
            await fs.promises.chmod(target, 0o666);
        }
    } catch (e) {
        // Ignore permission errors if not owned by the node process
    }
}

async function copyFolderRecursiveAsync(source: string, target: string) {
    if (!fs.existsSync(target)) {
        await fs.promises.mkdir(target, { recursive: true });
    }
    if (fs.promises.cp) {
        await fs.promises.cp(source, target, { recursive: true });
    } else {
        const files = await fs.promises.readdir(source, { withFileTypes: true });
        for (const file of files) {
            const srcPath = path.join(source, file.name);
            const destPath = path.join(target, file.name);
            if (file.isDirectory()) {
                await copyFolderRecursiveAsync(srcPath, destPath);
            } else {
                await fs.promises.copyFile(srcPath, destPath);
            }
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
                downloadStatus = await checkSabnzbdStatus(sabUrl, sabKey, downloadId, release.title);
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
            let finalDestPath = "";
            try {
                const reqMedia = currentReq?.mediaType || "ebook";
                targetLib = await getTargetLibraryForUser(currentReq.requestedBy, reqMedia, currentReq.coverUrl);
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
                    let allFound: string[] = [];
                    for (const p of searchPaths) {
                        if (fs.existsSync(p)) {
                            // Try exact release title match first
                            let foundFiles = findDownloadedFile(p, release.title, reqMedia, currentReq.author || undefined);
                            if (foundFiles.length === 0) {
                                // Fallback to fuzzy UI title match
                                foundFiles = findDownloadedFile(p, currentReq.title, reqMedia, currentReq.author || undefined);
                            }
                            if (foundFiles.length > 0) {
                                allFound.push(...foundFiles);
                            }
                        }
                    }

                    if (allFound.length > 0) {
                        if (reqMedia === "ebook") {
                            allFound.sort((a, b) => {
                                const aIsEpub = a.toLowerCase().endsWith(".epub");
                                const bIsEpub = b.toLowerCase().endsWith(".epub");
                                if (aIsEpub && !bIsEpub) return -1;
                                if (!aIsEpub && bIsEpub) return 1;
                                return 0;
                            });
                        }
                        foundFilePath = allFound[0];
                    }

                    if (foundFilePath) {
                        if (isForeignLanguage(path.basename(foundFilePath))) {
                            console.warn(`[AUTO-DOWNLOAD-MONITOR] Completed download file "${path.basename(foundFilePath)}" matches foreign language indicators. Deleting and marking download as failed to retry English releases.`);
                            
                            let clientCleaned = false;
                            try {
                                clientCleaned = await deleteDownload(release.protocol, downloadId, release.title);
                            } catch (e) {}
                            
                            if (!clientCleaned) {
                                try {
                                    if (fs.existsSync(foundFilePath)) {
                                        removePathSafely(foundFilePath);
                                    }
                                } catch (e) {}
                            }
                            
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

                            const safeAuthor = (currentReq.author && currentReq.author !== "Unknown Author") 
                                ? currentReq.author.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim() 
                                : "Unknown Author";
                            const safeTitle = currentReq.title.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim();
                            const destFolder = path.join(targetLib.path, safeAuthor, safeTitle);
                            
                            if (!fs.existsSync(destFolder)) {
                                fs.mkdirSync(destFolder, { recursive: true });
                            }

                            if (!isRootDownloadsDir && fs.existsSync(rootBookFolder) && fs.statSync(rootBookFolder).isDirectory()) {
                                console.log(`[AUTO-DOWNLOAD-MONITOR] Copying complete multi-disc/multi-track folder from ${rootBookFolder} to ${destFolder}`);
                                await copyFolderRecursiveAsync(rootBookFolder, destFolder);
                                await setPermissionsRecursiveAsync(destFolder);
                                copySuccessful = true;
                                finalDestPath = path.join(destFolder, path.basename(foundFilePath));
                            } else {
                                const destPath = path.join(destFolder, path.basename(foundFilePath));
                                console.log(`[AUTO-DOWNLOAD-MONITOR] Moving downloaded file from ${foundFilePath} to ${destPath}`);
                                await fs.promises.copyFile(foundFilePath, destPath);
                                await setPermissionsRecursiveAsync(destPath);
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
                                        const checkCmd = process.platform === "win32" ? "where ebook-convert" : "which ebook-convert";
                                        await execAsync(checkCmd);
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
                            let hasDrm = false;
                            try {
                                await mobiBounceEpub(finalDestPath);
                            } catch (bounceErr: any) {
                                if (bounceErr.message === "DRM_PROTECTED") {
                                    hasDrm = true;
                                    console.warn(`[AUTO-DOWNLOAD-MONITOR] Detected DRM in release "${release.title}". Deleting and marking download as failed to retry another release.`);
                                } else {
                                    console.error(`[AUTO-DOWNLOAD-MONITOR] Mobi-Bounce failed for ${finalDestPath}:`, bounceErr.message);
                                }
                            }

                            if (hasDrm) {
                                copySuccessful = false;
                                downloadStatus = "failed";

                                let clientCleaned = false;
                                try {
                                    clientCleaned = await deleteDownload(release.protocol, downloadId, release.title);
                                } catch (e) {}

                                if (!clientCleaned) {
                                    try {
                                        if (fs.existsSync(foundFilePath)) removePathSafely(foundFilePath);
                                    } catch (e) {}
                                    
                                    if (!isRootDownloadsDir && fs.existsSync(rootBookFolder)) {
                                        try {
                                            removePathSafely(rootBookFolder);
                                        } catch (e) {}
                                    }
                                }
                                removePathSafely(finalDestPath); // Always delete the copied destination file
                                
                                break; // Breaks out of the poll loop to immediately trigger the next release
                            }
                            
                            let clientDeleted = false;
                            try {
                                try {
                                    console.log(`[AUTO-DOWNLOAD-MONITOR] Requesting client to delete completed download: ${release.title}`);
                                    clientDeleted = await deleteDownload(release.protocol, downloadId, release.title);
                                } catch (delErr: any) {
                                    console.error(`[AUTO-DOWNLOAD-MONITOR] Failed to delete completed download from client:`, delErr.message);
                                }

                                if (!clientDeleted) {
                                    try {
                                        fs.chmodSync(foundFilePath, 0o666);
                                    } catch (e) {}

                                    if (fs.existsSync(foundFilePath)) {
                                        removePathSafely(foundFilePath);
                                        console.log(`[AUTO-DOWNLOAD-MONITOR] Successfully deleted original file from downloads.`);
                                    }
                                    if (!isRootDownloadsDir && fs.existsSync(rootBookFolder)) {
                                        try {
                                            removePathSafely(rootBookFolder);
                                            console.log(`[AUTO-DOWNLOAD-MONITOR] Successfully removed completed download folder on disk: ${rootBookFolder}`);
                                        } catch (e) {}
                                    }
                                }
                            } catch (err: any) {
                                console.error(`[AUTO-DOWNLOAD-MONITOR] Unexpected error during cleanup:`, err.message);
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
                        await scanLibraryInternal(targetLib.id, { enableAi: true });

                    // Inherit series metadata from the original BookRequest
                    try {
                        if (currentReq.series) {
                            const ingestedBooks = await prisma.book.findMany({
                                where: {
                                    libraryId: targetLib.id,
                                    filePath: { startsWith: path.dirname(finalDestPath) }
                                }
                            });
                            for (const ib of ingestedBooks) {
                                await prisma.book.update({
                                    where: { id: ib.id },
                                    data: {
                                        series: currentReq.series,
                                        volumeNumber: currentReq.volumeNumber || ib.volumeNumber
                                    }
                                });
                            }
                        }
                    } catch (e) {
                        console.warn("Failed to inherit series metadata for imported download:", e);
                    }
                    } catch (err) {
                        console.error(`[AUTO-DOWNLOAD-MONITOR] Library auto-scan failed for "${targetLib.name}":`, err);
                    }
                } else {
                    const libraries = await prisma.library.findMany();
                    for (const lib of libraries) {
                        try {
                            await scanLibraryInternal(lib.id, { enableAi: true });
                        } catch (err) {
                            console.error(`[AUTO-DOWNLOAD-MONITOR] Library auto-scan failed for "${lib.name}":`, err);
                        }
                    }
                }
                
                const allBooks = await prisma.book.findMany();
                const finalPathClean = finalDestPath ? finalDestPath.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
                const reqTitleClean = req.title.toLowerCase().replace(/[^a-z0-9]/g, "");
                
                const matchedBook = allBooks.find(b => {
                    const bPathClean = b.filePath.toLowerCase().replace(/[^a-z0-9]/g, "");
                    // 1. Direct file path match (safest and most accurate)
                    if (finalPathClean && finalPathClean.length > 5 && bPathClean === finalPathClean) return true;
                    
                    // 2. Fallback: exact title match
                    const bTitleClean = b.title.toLowerCase().replace(/[^a-z0-9]/g, "");
                    if (reqTitleClean && reqTitleClean.length > 3 && bTitleClean === reqTitleClean) return true;
                    
                    // 3. Fallback: filename contains the exact title (and the title is sufficiently long)
                    if (reqTitleClean && reqTitleClean.length > 5 && bPathClean.includes(reqTitleClean)) return true;
                    
                    return false;
                });
                
                if (matchedBook) {
                    if (req.mediaType === "ebook") {
                        console.log(`[AUTO-DOWNLOAD-MONITOR] Found matching ebook "${matchedBook.title}". Automatically mailing to Kindle for ${req.requestedBy}...`);
                        await sendBookToUserKindleInternal(matchedBook.id, req.requestedBy);
                    } else {
                        console.log(`[AUTO-DOWNLOAD-MONITOR] Successfully ingested audiobook "${matchedBook.title}". Skipping email delivery (audiobooks are stored in library for streaming).`);
                    }
                    return;
                } else {
                    console.warn(`[AUTO-DOWNLOAD-MONITOR] Could not find registered book in library matching request title: "${req.title}". Deleting library copy and retrying next release.`);
                    
                    await prisma.bookRequest.update({
                        where: { id: requestId },
                        data: { status: `Failed - Scanner rejected file` }
                    });
                    
                    const targetParent = targetLib ? path.dirname(finalDestPath) : "";
                    if (targetLib && targetParent && targetParent !== targetLib.path) {
                        try {
                            fs.rmSync(targetParent, { recursive: true, force: true });
                        } catch (e) {}
                    } else {
                        removePathSafely(finalDestPath);
                    }
                    
                    downloadStatus = "failed";
                    break;
                }
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
            const backupLib = await getTargetLibraryForUser(requester, reqMedia, currentReq?.coverUrl);
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

export async function getAiAgentSettings() {
    await verifyAdmin();
    const settings = await prisma.settings.findUnique({ where: { id: "global" } });
    return {
        aiProvider: settings?.aiProvider || "default",
        aiApiKey: settings?.aiApiKey ? decryptData(settings.aiApiKey) : "",
        aiModel: settings?.aiModel || "gemini-2.5-flash",
        aiAutoResolve: settings?.aiAutoResolve ?? true
    };
}

export async function saveAiAgentSettings(formData: FormData) {
    try {
        await verifyAdmin();
        const aiProvider = (formData.get("aiProvider") as string) || "default";
        const aiApiKeyRaw = (formData.get("aiApiKey") as string) || "";
        const aiModel = (formData.get("aiModel") as string) || "gemini-2.5-flash";
        const aiAutoResolve = formData.get("aiAutoResolve") === "true";

        const encryptedKey = aiApiKeyRaw ? encryptData(aiApiKeyRaw) : null;

        await prisma.settings.upsert({
            where: { id: "global" },
            create: {
                id: "global",
                aiProvider,
                aiApiKey: encryptedKey,
                aiModel,
                aiAutoResolve
            },
            update: {
                aiProvider,
                aiApiKey: encryptedKey,
                aiModel,
                aiAutoResolve
            }
        });

        revalidatePath("/settings");
        revalidatePath("/library");
        return { success: true, message: "AI Agent settings updated successfully!" };
    } catch (e: any) {
        console.error("[SAVE-AI-SETTINGS-ERROR]:", e);
        return { success: false, error: e.message || "Failed to save AI Agent settings" };
    }
}

export async function testAiAgentConnection(sampleText?: string, tempProvider?: string, tempKey?: string, tempModel?: string) {
    try {
        await verifyAdmin();
        const { resolveMetadataWithAI } = await import("@/lib/ai-agent");
        const targetSample = sampleText || "J.R.R.Tolkien-Lord.of.the.Rings.01-The.Hobbit.Rob.Inglis-PoF";
        console.log(`[AI-AGENT-TEST] 🤖 Testing AI Metadata Agent with query: "${targetSample}"...`);
        const result = await resolveMetadataWithAI(targetSample, "audiobook", true, tempProvider, tempKey, tempModel);
        console.log(`[AI-AGENT-TEST] ✨ Test Result: "${result.title}" by "${result.author}" [Series: ${result.series || "N/A"} #${result.volumeNumber || "N/A"}] via ${result.providerUsed}`);
        return { success: true, result };
    } catch (e: any) {
        console.error("[TEST-AI-AGENT-ERROR]:", e);
        return { success: false, error: e.message || "AI Agent test failed" };
    }
}

export async function resolveBookWithAI(bookId: string) {
    try {
        await verifyAdmin();
        const book = await prisma.book.findUnique({ where: { id: bookId }, include: { library: true } });
        if (!book) return { success: false, error: "Book not found" };

        const { resolveMetadataWithAI } = await import("@/lib/ai-agent");
        
        let cleanTarget = book.title;
        if (book.filePath && book.library) {
            const ext = path.extname(book.filePath);
            const file = path.basename(book.filePath);
            const extracted = extractMetadataFromPath(book.filePath, file, ext, book.library.path);
            cleanTarget = extracted.author !== "Unknown Author" ? `${extracted.author} - ${extracted.title}` : extracted.title;
        } else {
            const rawTarget = book.filePath ? path.basename(book.filePath) : book.title;
            const parsed = parseFilenameMetadata(rawTarget);
            cleanTarget = parsed.author !== "Unknown Author" ? `${parsed.author} - ${parsed.title}` : parsed.title;
        }
        console.log(`[AI-SINGLE-RESOLVE] 🤖 Resolving AI metadata for book ID ${bookId} ("${book.title}")...`);
        const aiResult = await resolveMetadataWithAI(cleanTarget, book.mediaType || "ebook");
        console.log(`[AI-SINGLE-RESOLVE] ✨ Resolved: "${aiResult.title}" by "${aiResult.author}" [Series: ${aiResult.series || book.series || "N/A"}] via ${aiResult.providerUsed}`);

        let coverUrl = book.coverUrl;
        if (aiResult.coverQuery || aiResult.title) {
            try {
                const hdCover = await fetchBookCover(aiResult.title, aiResult.author, book.mediaType || "ebook");
                if (hdCover) coverUrl = hdCover;
            } catch (e) {}
        }

        await prisma.book.updateMany({
            where: { id: bookId },
            data: {
                title: aiResult.title,
                author: aiResult.author,
                series: aiResult.series || book.series,
                volumeNumber: aiResult.volumeNumber ? String(aiResult.volumeNumber) : book.volumeNumber,
                ...(coverUrl ? { coverUrl } : {})
            }
        });
        await renameBookFileOnDisk(bookId);

        revalidatePath("/library");
        return { success: true, message: `Successfully resolved metadata via ${aiResult.providerUsed}!`, result: aiResult };
    } catch (e: any) {
        console.error("[RESOLVE-BOOK-AI-ERROR]:", e);
        return { success: false, error: e.message || "Failed to resolve book with AI" };
    }
}

async function _backgroundAiScan() {
    const { resolveMetadataWithAI } = await import("@/lib/ai-agent");
    const books = await prisma.book.findMany();
    console.log(`[AI-BATCH-SCAN] 🚀 Starting AI Metadata Resolution Batch Job across all ${books.length} items in database...`);

    let updatedCount = 0;
    for (let i = 0; i < books.length; i++) {
        const b = books[i];
        let cleanTarget = b.title;
        if (b.filePath) {
            const ext = path.extname(b.filePath);
            const file = path.basename(b.filePath);
            const lib = await prisma.library.findUnique({ where: { id: b.libraryId } });
            if (lib) {
                const extracted = extractMetadataFromPath(b.filePath, file, ext, lib.path);
                cleanTarget = extracted.author !== "Unknown Author" ? `${extracted.author} - ${extracted.title}` : extracted.title;
            }
        }
        console.log(`[AI-BATCH-SCAN] 🤖 [${i + 1}/${books.length}] Analyzing "${b.title}" (Query: ${cleanTarget})...`);
        
        try {
            const aiResult = await resolveMetadataWithAI(cleanTarget, b.mediaType || "ebook");
            console.log(`[AI-BATCH-SCAN] ✨ Resolved "${aiResult.title}" by "${aiResult.author}" [Series: ${aiResult.series || "N/A"} #${aiResult.volumeNumber || "N/A"}] (Provider: ${aiResult.providerUsed})`);

            let coverUrl = b.coverUrl;
            if (!coverUrl || aiResult.title !== b.title) {
                try {
                    const hdCover = await fetchBookCover(aiResult.title, aiResult.author, b.mediaType || "ebook");
                    if (hdCover) coverUrl = hdCover;
                } catch (e) {}
            }

            await prisma.book.updateMany({
                where: { id: b.id },
                data: {
                    title: aiResult.title || b.title,
                    author: (aiResult.author && aiResult.author !== "Unknown Author") ? aiResult.author : b.author,
                    series: aiResult.series || b.series,
                    volumeNumber: aiResult.volumeNumber ? String(aiResult.volumeNumber) : b.volumeNumber,
                    ...(coverUrl ? { coverUrl } : {})
                }
            }).catch(() => {});
            await renameBookFileOnDisk(b.id);
            updatedCount++;
        } catch (err: any) {
            console.warn(`[AI-BATCH-SCAN] ⚠️ Failed for "${b.title}":`, err.message || err);
        }
    }

    console.log(`[AI-BATCH-SCAN] ✅ Completed AI Metadata Batch Job! ${updatedCount}/${books.length} books updated.`);
    try {
        revalidatePath("/library");
    } catch (e) {}
}

export async function runAiBatchMetadataScanner() {
    try {
        await verifyAdmin();
        
        // Detach from the Next.js request context so it doesn't timeout the HTTP response
        setTimeout(() => {
            _backgroundAiScan().catch(e => console.error("[AI-BATCH-SCAN-ERROR]: Background worker failed:", e));
        }, 500);

        return { success: true, message: `AI Batch Scan successfully started in the background! Please check the server console for live progress.` };
    } catch (e: any) {
        console.error("[AI-BATCH-SCAN-ERROR]:", e);
        return { success: false, error: e.message || "Failed to start AI Batch Scanner" };
    }
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
                                <li><strong>Check File Size:</strong> Kindle has a 50MB email file size limit. Your book size is <code>${fs.existsSync(book.filePath) ? (fs.statSync(book.filePath).size / (1024 * 1024)).toFixed(1) : "0.0"} MB</code>.</li>
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

export async function searchOpenLibrary(query: string, mediaType: "ebook" | "audiobook" = "ebook") {
    if (!query || query.trim().length < 2) return [];
    try {
        let results: any[] = [];
        
        // 1. Audible API (Only for Audiobooks)
        if (mediaType === "audiobook") {
            try {
                const audUrl = `https://api.audible.com/1.0/catalog/products?title=${encodeURIComponent(query)}&response_groups=product_attrs,contributors,product_desc&num_results=8&products_sort_by=Relevance`;
                const audRes = await fetchWithRetry(audUrl, { headers: { "Accept": "application/json" } });
                const audData = audRes && audRes.ok ? await audRes.json() : null;
                
                if (audData && audData.products && audData.products.length > 0) {
                    for (const prod of audData.products) {
                        const title = prod.title;
                        if (!title) continue;
                        
                        let author = "Unknown Author";
                        if (prod.authors && prod.authors.length > 0) {
                            author = prod.authors[0].name;
                        }
                        
                        let coverUrl = "";
                        if (prod.product_images && prod.product_images["500"]) {
                            coverUrl = prod.product_images["500"];
                        }
                        
                        let year = "Unknown Year";
                        if (prod.release_date) {
                            year = prod.release_date.substring(0, 4);
                        }
                        
                        results.push({ title, author, coverUrl, year });
                    }
                }
            } catch (e) {
                console.warn("[API-FAILOVER] Audible search failed:", e);
            }
        }

        // 2. iTunes API
        try {
            const entity = mediaType === "audiobook" ? "audiobook" : "ebook";
            let iUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=${entity}&limit=8`;
            let iRes = await fetchWithRetry(iUrl, { headers: { "Accept": "application/json" } });
            let data = iRes && iRes.ok ? await iRes.json() : null;
            
            if (data && data.results && data.results.length > 0) {
                for (const item of data.results) {
                    const title = item.trackName || item.collectionName;
                    if (!title) continue;
                    let artwork = item.artworkUrl100 || item.artworkUrl60;
                    if (artwork) {
                        artwork = artwork.replace("100x100bb", "600x600bb").replace("60x60bb", "600x600bb").replace(/^http:/, "https:");
                    }
                    results.push({
                        title: title,
                        author: item.artistName || "Unknown Author",
                        coverUrl: artwork || "",
                        year: item.releaseDate ? item.releaseDate.substring(0, 4) : "Unknown Year"
                    });
                }
            }
        } catch(e) {
            console.warn("[API-FAILOVER] iTunes search failed:", e);
        }

        // 3. Open Library
        try {
            const response = await fetchWithRetry(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=8`, {
                headers: { "Accept": "application/json" }
            });
            const data = response && response.ok ? await response.json() : null;
            if (data && data.docs) {
                for (const doc of data.docs) {
                    if (doc.title) {
                        results.push({
                            title: doc.title,
                            author: doc.author_name ? doc.author_name[0] : "Unknown Author",
                            coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : "",
                            year: doc.first_publish_year ? String(doc.first_publish_year) : "Unknown Year"
                        });
                    }
                }
            }
        } catch (e) {
            console.warn("[API-FAILOVER] OpenLibrary search failed:", e);
        }

        // 4. Google Books
        try {
            const gUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=8`;
            const gRes = await fetchWithRetry(gUrl, { headers: { "Accept": "application/json" } });
            const gData = gRes && gRes.ok ? await gRes.json() : null;
            if (gData && gData.items) {
                for (const item of gData.items) {
                    const vol = item.volumeInfo;
                    if (vol && vol.title) {
                        results.push({
                            title: vol.title,
                            author: vol.authors ? vol.authors[0] : "Unknown Author",
                            coverUrl: vol.imageLinks?.thumbnail ? vol.imageLinks.thumbnail.replace("http:", "https:").replace("&edge=curl", "").replace("&zoom=1", "&zoom=0") : "",
                            year: vol.publishedDate ? vol.publishedDate.substring(0, 4) : "Unknown Year"
                        });
                    }
                }
            }
        } catch (e) {
            console.warn("[API-FAILOVER] Google Books API Error:", e);
        }
        
        const uniqueResults = [];
        const seenTitles = new Set();
        for (const res of results) {
            const normalized = (res.title + res.author).toLowerCase().replace(/[^a-z0-9]/g, "");
            if (!seenTitles.has(normalized)) {
                seenTitles.add(normalized);
                uniqueResults.push(res);
            }
        }
        
        return uniqueResults;
    } catch (e) {
        console.error("All metadata APIs failed:", e);
        return [];
    }
}

export async function getSeriesBooksList(seriesTitle: string, author: string = "") {
    try {
        const query = author ? `${seriesTitle} ${author}` : seriesTitle;
        const uniqueBooks: any[] = [];
        const seenTitles = new Set<string>();
        
        // 1. Primary: OpenLibrary (best for series compilations)
        try {
            const response = await fetchWithRetry(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=45&fields=key,title,author_name,cover_i,first_publish_year`, {
                headers: { "Accept": "application/json" },
                next: { revalidate: 3600 }
            });
            if (response && response.ok) {
                const data = await response.json();
                const docs = data.docs || [];
                
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
                            year: doc.first_publish_year || "Unknown Year"
                        });
                    }
                }
            }
        } catch (e) {
            console.warn("[API-FAILOVER] OpenLibrary series search failed:", e);
        }
        
        // 2. Failover: Google Books
        if (uniqueBooks.length === 0) {
            try {
                const gUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=40`;
                const gRes = await fetchWithRetry(gUrl, { headers: { "Accept": "application/json" } });
                if (gRes && gRes.ok) {
                    const data = await gRes.json();
                    if (data.items) {
                        for (const item of data.items) {
                            const title = item.volumeInfo?.title || "";
                            if (!title) continue;
                            
                            const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "");
                            const titleLower = title.toLowerCase();
                            const isCompilation = titleLower.includes("box set") || 
                                                  titleLower.includes("boxed set") || 
                                                  titleLower.includes("collection") || 
                                                  titleLower.includes("series 1-") || 
                                                  titleLower.includes("pack") || 
                                                  titleLower.includes("omnibus");
                            if (isCompilation) continue;
                            
                            if (author && item.volumeInfo?.authors) {
                                const authorLower = author.toLowerCase();
                                const matchesAuthor = item.volumeInfo.authors.some((name: string) => 
                                    name.toLowerCase().includes(authorLower)
                                );
                                if (!matchesAuthor) continue;
                            }
                            
                            if (!seenTitles.has(normalizedTitle)) {
                                seenTitles.add(normalizedTitle);
                                const authorName = item.volumeInfo?.authors?.[0] || author || "Unknown Author";
                                let coverUrl = item.volumeInfo?.imageLinks?.thumbnail || "";
                                if (coverUrl) {
                                    coverUrl = coverUrl.replace(/^http:/, "https:").replace("&edge=curl", "");
                                }
                                uniqueBooks.push({
                                    title,
                                    author: authorName,
                                    coverUrl,
                                    year: item.volumeInfo?.publishedDate ? item.volumeInfo.publishedDate.substring(0, 4) : "Unknown Year"
                                });
                            }
                        }
                    }
                }
            } catch(e) {
                console.warn("[API-FAILOVER] Google Books series search failed:", e);
            }
        }

        return uniqueBooks;
    } catch (e) {
        console.error("Failed to fetch series books list:", e);
        return [];
    }
}

export async function createMultipleBookRequests(booksList: { title: string, author: string, coverUrl: string, publishYear: string }[], requestedFor?: string, mediaType: string = "ebook", libraryId?: string) {
    try {
        const session = await verifyUser();
        const isAdmin = session.role === "ADMIN";
        if (!booksList || booksList.length === 0) return { success: false, error: "No books provided" };
        
        let targetUser = session.username as string;
        if (isAdmin && requestedFor) {
            targetUser = requestedFor;
        }
        
        for (const book of booksList) {
            let finalCover = book.coverUrl;
            if (libraryId) {
                finalCover = finalCover ? `${finalCover}?lib=${libraryId}` : `?lib=${libraryId}`;
            }
            
            const request = await prisma.bookRequest.create({
                data: {
                    title: book.title,
                    author: book.author,
                    coverUrl: finalCover,
                    publishYear: book.publishYear,
                    requestedBy: targetUser,
                    type: "book",
                    mediaType: mediaType,
                    status: "Approved"
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
        return { success: true, message: `${booksList.length} requests submitted successfully!` };
    } catch (e: any) {
        console.error("[CREATE-MULTIPLE-BOOK-REQUESTS-ERROR]:", e);
        return { success: false, error: e.message || "Failed to submit requests" };
    }
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
        data: { status: "Approved" }
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
        if (lowerTitle.includes("philosopher's stone") || lowerTitle.includes("sorcerer's stone")) title = "Harry Potter and the Sorcerer's Stone";
        else if (lowerTitle.includes("chamber of secrets")) title = "Harry Potter and the Chamber of Secrets";
        else if (lowerTitle.includes("prisoner of azkaban")) title = "Harry Potter and the Prisoner of Azkaban";
        else if (lowerTitle.includes("goblet of fire")) title = "Harry Potter and the Goblet of Fire";
        else if (lowerTitle.includes("order of the phoenix")) title = "Harry Potter and the Order of the Phoenix";
        else if (lowerTitle.includes("half-blood prince")) title = "Harry Potter and the Half-Blood Prince";
        else if (lowerTitle.includes("deathly hallows")) title = "Harry Potter and the Deathly Hallows";
    }

    const newCover = await fetchBookCover(title, author, book.mediaType || "ebook");
    if (newCover) {
        await prisma.book.updateMany({
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

export async function importCompletedDownload(requestId: string) {
    await verifyUser();
    const currentReq = await prisma.bookRequest.findUnique({ where: { id: requestId } });
    if (!currentReq) return { success: false, error: "Request not found" };

    const reqMedia = currentReq.mediaType || "ebook";
    const targetLib = await getTargetLibraryForUser(currentReq.requestedBy, reqMedia, currentReq.coverUrl);
    if (!targetLib) return { success: false, error: "No target library shelf configured for user" };

    const settings = await prisma.settings.findFirst();
    const configuredPath = settings?.downloadsPath || "/downloads";
    const searchPaths = [
        configuredPath,
        path.join(configuredPath, "completed"),
        path.join(configuredPath, "complete"),
        path.join(configuredPath, "audiobooks"),
        path.join(configuredPath, "books"),
        process.env.DOWNLOADS_DIR || "/downloads",
        "/downloads",
        "/downloads/completed",
        "/downloads/complete",
        "/downloads/audiobooks",
        "/downloads/books",
        "/user/downloads",
        "/user/Books",
        "/Userbooks",
        "/mnt/user/downloads",
        "/mnt/user/Books",
        "/app/downloads",
        "./downloads"
    ];

    let foundFilePath: string | null = null;
    let allFound: string[] = [];
    for (const p of searchPaths) {
        if (fs.existsSync(p)) {
            const foundFiles = findDownloadedFile(p, currentReq.title, reqMedia, currentReq.author || undefined);
            if (foundFiles.length > 0) {
                allFound.push(...foundFiles);
            }
        }
    }

    if (allFound.length > 0) {
        if (reqMedia === "ebook") {
            allFound.sort((a, b) => {
                const aIsEpub = a.toLowerCase().endsWith(".epub");
                const bIsEpub = b.toLowerCase().endsWith(".epub");
                if (aIsEpub && !bIsEpub) return -1;
                if (!aIsEpub && bIsEpub) return 1;
                return 0;
            });
        }
        foundFilePath = allFound[0];
    }

    if (!foundFilePath) {
        return { success: false, error: `Could not locate downloaded file or folder for "${currentReq.title}" in downloads directory. Please verify SABnzbd/qBittorrent completed path.` };
    }

    if (!fs.existsSync(targetLib.path)) {
        fs.mkdirSync(targetLib.path, { recursive: true });
    }

    const parentFolder = path.dirname(foundFilePath);
    const discPattern = /^(?:Disc|CD|Part|Vol|Volume)\s*\d+$/i;
    const isDiscSubfolder = discPattern.test(path.basename(parentFolder).trim());
    const rootBookFolder = isDiscSubfolder ? path.dirname(parentFolder) : parentFolder;

    const isRootDownloadsDir = searchPaths.includes(rootBookFolder);

    const safeAuthor = (currentReq.author && currentReq.author !== "Unknown Author") 
        ? currentReq.author.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim() 
        : "Unknown Author";
    const safeTitle = currentReq.title.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim();
    const destFolder = path.join(targetLib.path, safeAuthor, safeTitle);
    
    if (!fs.existsSync(destFolder)) {
        fs.mkdirSync(destFolder, { recursive: true });
    }

    let finalDestPath = "";
    if (!isRootDownloadsDir && fs.existsSync(rootBookFolder) && fs.statSync(rootBookFolder).isDirectory()) {
        await copyFolderRecursiveAsync(rootBookFolder, destFolder);
        await setPermissionsRecursiveAsync(destFolder);
        finalDestPath = path.join(destFolder, path.basename(foundFilePath));
    } else {
        const destPath = path.join(destFolder, path.basename(foundFilePath));
        await fs.promises.copyFile(foundFilePath, destPath);
        await setPermissionsRecursiveAsync(destPath);
        finalDestPath = destPath;
    }

    // Clean up original downloaded file/folder and client entries
    let clientCleanedUsenet = false;
    let clientCleanedTorrent = false;
    try {
        clientCleanedUsenet = await deleteDownload("usenet", "", currentReq.title);
        clientCleanedTorrent = await deleteDownload("torrent", "", currentReq.title);
    } catch (e) {}

    // Only manually delete files in Node if the client didn't successfully handle it (prevents EACCES locking)
    if (!clientCleanedUsenet && !clientCleanedTorrent) {
        if (fs.existsSync(foundFilePath)) {
            removePathSafely(foundFilePath);
        }
        if (!isRootDownloadsDir && fs.existsSync(rootBookFolder)) {
            removePathSafely(rootBookFolder);
        }
    }

    // Auto-scan target library shelf so newly imported media is immediately available with AI resolution
    await scanLibraryInternal(targetLib.id, { enableAi: true });

                    // Inherit series metadata from the original BookRequest
                    try {
                        if (currentReq.series) {
                            const ingestedBooks = await prisma.book.findMany({
                                where: {
                                    libraryId: targetLib.id,
                                    filePath: { startsWith: path.dirname(finalDestPath) }
                                }
                            });
                            for (const ib of ingestedBooks) {
                                await prisma.book.update({
                                    where: { id: ib.id },
                                    data: {
                                        series: currentReq.series,
                                        volumeNumber: currentReq.volumeNumber || ib.volumeNumber
                                    }
                                });
                            }
                        }
                    } catch (e) {
                        console.warn("Failed to inherit series metadata for imported download:", e);
                    }

    await prisma.bookRequest.update({
        where: { id: requestId },
        data: { status: "Downloaded" }
    });

    revalidatePath("/library");
    return { success: true, message: `Successfully imported "${currentReq.title}" to ${targetLib.name} shelf!` };
}

export async function getAudiobookChapters(bookId: string) {
    try {
        await verifyUser();

        const book = await prisma.book.findUnique({
            where: { id: bookId },
            include: { library: true }
        });

        if (!book) return { success: false, error: "Audiobook entry not found in database", chapters: [] };

        if (!fs.existsSync(book.filePath)) {
            if (book.library?.path && fs.existsSync(book.library.path)) {
                const normTitle = (book.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
                let resolvedPath: string | null = null;

                function findInDir(dir: string, depth = 0) {
                    if (resolvedPath || depth > 3) return;
                    try {
                        const entries = fs.readdirSync(dir, { withFileTypes: true });
                        for (const entry of entries) {
                            const fullP = path.join(dir, entry.name);
                            const cleanE = entry.name.toLowerCase().replace(/[^a-z0-9]/g, "");
                            if (cleanE.includes(normTitle) || (normTitle.length > 5 && cleanE.length > 5 && normTitle.includes(cleanE))) {
                                resolvedPath = fullP;
                                return;
                            }
                            if (entry.isDirectory()) {
                                findInDir(fullP, depth + 1);
                            }
                        }
                    } catch (e) {}
                }

                findInDir(book.library.path);

                if (resolvedPath) {
                    book.filePath = resolvedPath;
                    await prisma.book.updateMany({
                        where: { id: bookId },
                        data: { filePath: resolvedPath }
                    }).catch(() => {});
                }
            }
        }

        if (!fs.existsSync(book.filePath)) {
            return { success: false, error: `Audiobook path does not exist on disk: ${book.filePath}`, chapters: [] };
        }

        const stat = fs.statSync(book.filePath);
        const libraryPath = book.library?.path ? path.resolve(book.library.path).toLowerCase() : "";

        let isSingleFileBook = false;
        let targetDir = "";

        const validAudioExts = [".m4b", ".mp3", ".m4a", ".flac", ".aac", ".ogg", ".opus"];

        if (stat.isDirectory()) {
            targetDir = book.filePath;
        } else {
            const parentDir = path.dirname(book.filePath);
            const parentResolved = path.resolve(parentDir).toLowerCase();
            
            let parentAudioCount = 0;
            try {
                if (fs.existsSync(parentDir)) {
                    const pEntries = fs.readdirSync(parentDir);
                    parentAudioCount = pEntries.filter(f => validAudioExts.includes(path.extname(f).toLowerCase())).length;
                }
            } catch (e) {}

            if (parentAudioCount > 1 && parentResolved !== libraryPath) {
                targetDir = parentDir;
            } else if (libraryPath && (parentResolved === libraryPath || parentResolved === libraryPath + "/" || parentResolved === libraryPath + "\\" || parentResolved.endsWith(path.sep + path.basename(libraryPath)))) {
                isSingleFileBook = true;
            } else if (parentDir === "/" || parentDir.length <= 3) {
                isSingleFileBook = true;
            } else {
                const parentName = path.basename(parentDir);
                const discPattern = /^(?:Disc|CD|Part|Vol|Volume|Disk|Track)\s*\d+$/i;
                if (discPattern.test(parentName)) {
                    const grandParentDir = path.dirname(parentDir);
                    const grandResolved = path.resolve(grandParentDir).toLowerCase();
                    if (libraryPath && grandResolved === libraryPath) {
                        targetDir = parentDir;
                    } else {
                        targetDir = grandParentDir;
                    }
                } else {
                    targetDir = parentDir;
                }
            }
        }
        const chapters: { trackNumber: number; title: string; fileName: string; relativePath: string; size: number }[] = [];

        function collectAudioFiles(dir: string, baseDir: string, depth = 0) {
            if (!fs.existsSync(dir)) return;
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullP = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        if (depth < 3) {
                            collectAudioFiles(fullP, baseDir, depth + 1);
                        }
                    } else {
                        const ext = path.extname(entry.name).toLowerCase();
                        if (validAudioExts.includes(ext)) {
                            try {
                                const st = fs.statSync(fullP);
                                const relP = path.relative(baseDir, fullP);
                                const cleanName = path.basename(entry.name, ext)
                                    .replace(/^[0-9\s._-]+/, "")
                                    .trim() || entry.name;
                                chapters.push({
                                    trackNumber: 0,
                                    title: cleanName,
                                    fileName: entry.name,
                                    relativePath: relP,
                                    size: st.size
                                });
                            } catch (e) {}
                        }
                    }
                }
            } catch (e) {}
        }

        if (isSingleFileBook || !targetDir) {
            chapters.push({
                trackNumber: 1,
                title: "Full Audiobook (Unabridged)",
                fileName: path.basename(book.filePath),
                relativePath: path.basename(book.filePath),
                size: stat.size
            });
        } else {
            collectAudioFiles(targetDir, targetDir);
            if (chapters.length === 0 && !stat.isDirectory()) {
                chapters.push({
                    trackNumber: 1,
                    title: path.basename(book.filePath, path.extname(book.filePath)),
                    fileName: path.basename(book.filePath),
                    relativePath: path.basename(book.filePath),
                    size: stat.size
                });
            }
        }

        const allFiles = chapters.map(c => c.fileName);

        const allPrefixes = Array.from(new Set(allFiles.map(f => {
            const n = path.basename(f, path.extname(f));
            return n.replace(/_(\d{1,3})$/, "").trim();
        }))).sort((a, b) => b.length - a.length);

        function extractTrackIndex(fileName: string): number {
            const ext = path.extname(fileName);
            const nameWithoutExt = path.basename(fileName, ext);

            const leadingMatch = nameWithoutExt.match(/^(\d{1,3})[\s._-]+/);
            if (leadingMatch) {
                const num = parseInt(leadingMatch[1], 10);
                if (!isNaN(num) && num > 0) return num;
            }

            const prefix = nameWithoutExt.replace(/_(\d{1,3})$/, "").trim();
            const trailingUnderscoreMatch = nameWithoutExt.match(/_(\d{1,3})$/);

            const groupIndex = allPrefixes.indexOf(prefix);
            let baseOffset = 0;
            if (groupIndex > 0) {
                for (let i = 0; i < groupIndex; i++) {
                    const prevPrefix = allPrefixes[i];
                    const countInPrevGroup = allFiles.filter(f => {
                        const n = path.basename(f, path.extname(f));
                        return n.replace(/_(\d{1,3})$/, "").trim() === prevPrefix;
                    }).length;
                    baseOffset += countInPrevGroup;
                }
            }

            if (trailingUnderscoreMatch) {
                const num = parseInt(trailingUnderscoreMatch[1], 10);
                if (!isNaN(num)) return baseOffset + num + 1;
            }

            return baseOffset + 1;
        }

        chapters.sort((a, b) => {
            const idxA = extractTrackIndex(a.fileName);
            const idxB = extractTrackIndex(b.fileName);
            if (idxA !== idxB) return idxA - idxB;
            return a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' });
        });

        const orderOfPhoenixChapters: Record<number, string> = {
            1: "Dudley Demented",
            2: "A Peck of Owls",
            3: "The Advanced Guard",
            4: "Number Twelve, Grimmauld Place",
            5: "The Order of the Phoenix",
            6: "The Noble and Most Ancient House of Black",
            7: "The Ministry of Magic",
            8: "The Hearing",
            9: "The Woes of Mrs. Weasley",
            10: "Luna Lovegood",
            11: "The Sorting Hat's New Song",
            12: "Professor Umbridge",
            13: "Detention with Dolores",
            14: "Percy and Padfoot",
            15: "The Hogwarts High Inquisitor",
            16: "In the Hog's Head",
            17: "Educational Decree Number Twenty-Four",
            18: "Dumbledore's Army",
            19: "The Lion and the Serpent",
            20: "Hagrid's Tale",
            21: "The Eye of the Snake",
            22: "St. Mungo's Hospital for Magical Maladies and Injuries",
            23: "Christmas on the Closed Ward",
            24: "Occlumency",
            25: "The Beetle at Bay",
            26: "Seen and Unforeseen",
            27: "The Centaur and the Sneak",
            28: "Snape's Worst Memory",
            29: "Career Advice",
            30: "Grawp",
            31: "O.W.L.s",
            32: "Out of the Fire",
            33: "Fight and Flight",
            34: "The Department of Mysteries",
            35: "Beyond the Veil",
            36: "The Only One He Ever Feared",
            37: "The Lost Prophecy",
            38: "The Second War Begins"
        };

        chapters.forEach((ch, idx) => {
            const trackNum = idx + 1;
            ch.trackNumber = trackNum;

            if (chapters.length === 1) {
                ch.title = "Full Audiobook (Unabridged)";
            } else if (book.title.toLowerCase().includes("order of the phoenix") && orderOfPhoenixChapters[trackNum]) {
                ch.title = `Chapter ${trackNum}: ${orderOfPhoenixChapters[trackNum]}`;
            } else {
                const ext = path.extname(ch.fileName);
                let name = path.basename(ch.fileName, ext);
                name = name
                    .replace(/^\d+[\s._-]+/, "")
                    .replace(/_(\d{1,3})$/, "")
                    .replace(/ - -$/, "")
                    .replace(/^J\.\s*R\.\s*R\.\s*Tolkien\s*-\s*/i, "")
                    .replace(/^J\.\s*K\.\s*Rowling\s*-\s*/i, "")
                    .replace(/_/g, " ")
                    .trim();

                if (!name || name.toLowerCase().includes(book.title.toLowerCase()) || name.toLowerCase().includes("audiobook")) {
                    ch.title = `Chapter ${trackNum}`;
                } else {
                    ch.title = `Chapter ${trackNum}: ${name.charAt(0).toUpperCase() + name.slice(1)}`;
                }
            }
        });

        return {
            success: true,
            bookId: book.id,
            bookTitle: book.title,
            bookAuthor: book.author,
            coverUrl: book.coverUrl,
            chapters
        };
    } catch (err: any) {
        console.error("Failed to get audiobook chapters:", err);
        return {
            success: false,
            error: err.message || "Failed to load audiobook chapters",
            chapters: []
        };
    }
}

export async function reorderAudiobookChapters(bookId: string, updatedChapters: { relativePath: string; newTrackNumber: number }[]) {
    try {
        await verifyUser();

        const book = await prisma.book.findUnique({
            where: { id: bookId }
        });
        if (!book) return { success: false, error: "Audiobook not found in database" };

        if (!fs.existsSync(book.filePath)) {
            return { success: false, error: "Audiobook folder not found on disk" };
        }

        const stat = fs.statSync(book.filePath);
        const targetDir = stat.isDirectory() ? book.filePath : path.dirname(book.filePath);

        const sortedItems = [...updatedChapters].sort((a, b) => a.newTrackNumber - b.newTrackNumber);

        // Pass 1: Rename all targeted files to temporary unique paths to prevent name collision deadlocks
        const tempMappings: { tempPath: string; finalPath: string }[] = [];

        for (const item of sortedItems) {
            const fullOldPath = path.join(targetDir, item.relativePath);
            if (fs.existsSync(fullOldPath)) {
                const dir = path.dirname(fullOldPath);
                const ext = path.extname(fullOldPath);
                const baseName = path.basename(fullOldPath, ext);
                
                const cleanBase = baseName
                    .replace(/^(?:\d+[\s._-]+)+/, "")
                    .replace(/_(\d{1,3})$/, "")
                    .trim() || baseName;
                
                const padNum = String(item.newTrackNumber).padStart(2, "0");
                const newFileName = `${padNum} - ${cleanBase}${ext}`;
                const fullNewPath = path.join(dir, newFileName);

                const tempPath = path.join(dir, `__reorder_tmp_${Math.random().toString(36).substring(2, 9)}${ext}`);
                try {
                    fs.renameSync(fullOldPath, tempPath);
                    tempMappings.push({ tempPath, finalPath: fullNewPath });
                } catch (e) {
                    console.warn(`[REORDER-CHAPTERS] Temp rename failed for ${fullOldPath}:`, e);
                }
            }
        }

        // Pass 2: Rename all temporary files to their clean final target names
        for (const mapping of tempMappings) {
            if (fs.existsSync(mapping.tempPath)) {
                try {
                    fs.renameSync(mapping.tempPath, mapping.finalPath);
                } catch (e) {
                    console.warn(`[REORDER-CHAPTERS] Final rename failed for ${mapping.tempPath}:`, e);
                }
            }
        }

        // Clean up any stray temporary files in directory
        try {
            const files = fs.readdirSync(targetDir);
            for (const f of files) {
                if (f.startsWith("__reorder_tmp_") || f.startsWith("__temp_")) {
                    const strayP = path.join(targetDir, f);
                    if (fs.existsSync(strayP)) {
                        fs.unlinkSync(strayP);
                    }
                }
            }
        } catch (e) {}

        revalidatePath("/library");
        return { success: true, message: "Chapters reordered and disk files renamed successfully!" };
    } catch (e: any) {
        console.error("reorderAudiobookChapters Error:", e);
        return { success: false, error: e.message || "Failed to reorder audiobook chapters." };
    }
}

export async function analyzeAudiobookChaptersAction(bookId: string) {
    try {
        await verifyUser();
        const book = await prisma.book.findUnique({
            where: { id: bookId }
        });
        if (!book) return { success: false, error: "Audiobook entry not found in database" };

        if (!fs.existsSync(book.filePath)) {
            return { success: false, error: "Audiobook folder not found on disk" };
        }

        const stat = fs.statSync(book.filePath);
        const targetDir = stat.isDirectory() ? book.filePath : path.dirname(book.filePath);
        const isSingleFile = !stat.isDirectory();

        const validAudioExts = [".m4b", ".mp3", ".m4a", ".flac", ".aac", ".ogg", ".opus"];
        const fileList: { fileName: string; fileSize?: number; fullPath: string }[] = [];

        if (isSingleFile) {
            fileList.push({
                fileName: path.basename(book.filePath),
                fileSize: stat.size,
                fullPath: book.filePath
            });
        } else {
            const entries = fs.readdirSync(targetDir);
            for (const f of entries) {
                const ext = path.extname(f).toLowerCase();
                if (validAudioExts.includes(ext)) {
                    const fp = path.join(targetDir, f);
                    try {
                        const st = fs.statSync(fp);
                        fileList.push({
                            fileName: f,
                            fileSize: st.size,
                            fullPath: fp
                        });
                    } catch (e) {}
                }
            }
        }

        if (fileList.length === 0) {
            return { success: false, error: "No audio track files found in audiobook directory" };
        }

        const aiResults = await analyzeAudiobookChaptersWithAI(
            book.title,
            book.author || "Unknown Author",
            fileList
        );

        // Auto-rename disk track files if multi-track audiobook
        if (!isSingleFile && aiResults.length === fileList.length) {
            for (let i = 0; i < aiResults.length; i++) {
                const res = aiResults[i];
                const originalPath = fileList[i]?.fullPath;
                if (originalPath && fs.existsSync(originalPath) && res.suggestedFileName) {
                    const newPath = path.join(targetDir, res.suggestedFileName);
                    if (originalPath !== newPath && !fs.existsSync(newPath)) {
                        try {
                            fs.renameSync(originalPath, newPath);
                        } catch (e) {}
                    }
                }
            }
        }

        revalidatePath("/library");
        return {
            success: true,
            bookTitle: book.title,
            chapters: aiResults
        };
    } catch (e: any) {
        console.error("[AI-CHAPTERS-ACTION] Error:", e);
        return { success: false, error: e.message || "Failed to analyze audiobook chapters with AI" };
    }
}

export async function testFolderPermissions(folderPath: string, targetLibraryPath?: string) {
    try {
        await verifyAdmin();
        const results = {
            folderPath: folderPath || "Not Specified",
            exists: false,
            canRead: false,
            canWrite: false,
            canDelete: false,
            canMoveToTarget: false,
            targetPath: targetLibraryPath || "",
            itemCount: 0,
            totalSizeBytes: 0,
            subfolders: [] as { name: string, count: number }[],
            error: ""
        };

        if (!folderPath) {
            results.error = "Folder path is empty.";
            return { success: false, results };
        }

        // 1. Check folder existence
        if (!fs.existsSync(folderPath)) {
            results.error = `Folder "${folderPath}" does not exist on disk inside the container.`;
            return { success: false, results };
        }
        results.exists = true;

        // 2. Check Read Access & Item Statistics
        try {
            const entries = fs.readdirSync(folderPath, { withFileTypes: true });
            results.canRead = true;
            results.itemCount = entries.length;

            const subfoldersList: { name: string, count: number }[] = [];
            for (const entry of entries) {
                const fullP = path.join(folderPath, entry.name);
                if (entry.isDirectory()) {
                    try {
                        const childEntries = fs.readdirSync(fullP);
                        subfoldersList.push({ name: entry.name, count: childEntries.length });
                    } catch (e) {
                        subfoldersList.push({ name: entry.name, count: 0 });
                    }
                } else if (entry.isFile()) {
                    try {
                        const st = fs.statSync(fullP);
                        results.totalSizeBytes += st.size;
                    } catch (e) {}
                }
            }
            results.subfolders = subfoldersList.slice(0, 8); // Top 8 subfolders
        } catch (readErr: any) {
            results.error = `Read permission denied: ${readErr.message}`;
            return { success: false, results };
        }

        // 3. Check Write & Delete Access
        const testFileName = `.portalarr_perm_test_${Date.now()}.tmp`;
        const testFilePath = path.join(folderPath, testFileName);
        try {
            fs.writeFileSync(testFilePath, "Portalarr Permission Verification Test File", "utf8");
            results.canWrite = true;
        } catch (writeErr: any) {
            results.error = `Write permission denied inside "${folderPath}": ${writeErr.message}`;
            return { success: false, results };
        }

        try {
            if (fs.existsSync(testFilePath)) {
                fs.unlinkSync(testFilePath);
                results.canDelete = true;
            }
        } catch (delErr: any) {
            results.error = `Delete permission denied inside "${folderPath}": ${delErr.message}`;
            return { success: false, results };
        }

        // 4. Check Move/Copy to Target Library Path
        if (targetLibraryPath && fs.existsSync(targetLibraryPath)) {
            const tempSrc = path.join(folderPath, `.portalarr_move_src_${Date.now()}.tmp`);
            const tempDest = path.join(targetLibraryPath, `.portalarr_move_dest_${Date.now()}.tmp`);

            try {
                fs.writeFileSync(tempSrc, "Portalarr Move Test", "utf8");
                fs.copyFileSync(tempSrc, tempDest);
                if (fs.existsSync(tempDest)) {
                    fs.unlinkSync(tempDest);
                }
                if (fs.existsSync(tempSrc)) {
                    fs.unlinkSync(tempSrc);
                }
                results.canMoveToTarget = true;
            } catch (moveErr: any) {
                console.warn(`[PERM-TEST] Move test failed:`, moveErr.message);
                try {
                    if (fs.existsSync(tempSrc)) fs.unlinkSync(tempSrc);
                    if (fs.existsSync(tempDest)) fs.unlinkSync(tempDest);
                } catch (e) {}
            }
        } else {
            results.canMoveToTarget = true; // Default true if target path not provided
        }

        return {
            success: results.canRead && results.canWrite && results.canDelete && results.canMoveToTarget,
            results
        };
    } catch (e: any) {
        return {
            success: false,
            error: e.message || "Failed to test folder permissions",
            results: {
                folderPath,
                exists: false,
                canRead: false,
                canWrite: false,
                canDelete: false,
                canMoveToTarget: false,
                targetPath: targetLibraryPath || "",
                itemCount: 0,
                totalSizeBytes: 0,
                subfolders: [],
                error: e.message
            }
        };
    }
}

export async function getSystemLogsAction() {
    return logger.getLogs();
}

export async function clearSystemLogsAction() {
    await verifyAdmin();
    logger.clearLogs();
    return { success: true };
}

export async function dumpEntireDatabaseAction() {
    await verifyAdmin();
    const libraries = await prisma.library.findMany();
    const books = await prisma.book.findMany();
    const requests = await prisma.bookRequest.findMany();
    const users = await prisma.user.findMany({ select: { id: true, username: true, role: true, status: true } });

    logger.addLog("SYSTEM", "DATABASE", `=================== DUMPING ENTIRE SQLITE DATABASE ===================`);
    logger.addLog("SYSTEM", "DATABASE", `📚 Libraries Count: ${libraries.length}`);
    libraries.forEach(l => logger.addLog("INFO", "DATABASE", `  - [Lib ID: ${l.id}] Name: "${l.name}" | Path: "${l.path}" | MediaType: ${l.mediaType}`));
    
    logger.addLog("SYSTEM", "DATABASE", `📖 Books Count: ${books.length}`);
    books.forEach(b => logger.addLog("INFO", "DATABASE", `  - [Book ID: ${b.id}] Title: "${b.title}" | Author: "${b.author}" | Path: "${b.filePath}" | Size: ${(((b.fileSize || 0)) / 1024 / 1024).toFixed(2)} MB`));
    
    logger.addLog("SYSTEM", "DATABASE", `👥 Users Count: ${users.length}`);
    users.forEach(u => logger.addLog("INFO", "DATABASE", `  - [User ID: ${u.id}] Username: "${u.username}" | Role: ${u.role} | Status: ${u.status}`));

    logger.addLog("SYSTEM", "DATABASE", `=====================================================================`);
    return { librariesCount: libraries.length, booksCount: books.length, usersCount: users.length };
}









export async function fetchAvailableAiModels(provider: string, apiKey: string) {
    await verifyAdmin();
    try {
        const { getAvailableGeminiModels, getAvailableOpenAIModels } = await import("@/lib/ai-agent");
        if (provider === "gemini" || provider === "google") {
            return { success: true, data: await getAvailableGeminiModels(apiKey) };
        } else if (provider === "openai") {
            return { success: true, data: await getAvailableOpenAIModels(apiKey) };
        }
        return { success: true, data: [] };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
