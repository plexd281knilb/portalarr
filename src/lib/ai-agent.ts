import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";

export interface AIResolvedMetadata {
    title: string;
    author: string;
    series?: string | null;
    volumeNumber?: string | number | null;
    coverQuery?: string;
    publishYear?: string | null;
    confidence: number;
    providerUsed: string;
}

export async function assignVolumeNumbersWithAI(
    seriesName: string,
    author: string,
    bookTitles: string[]
): Promise<Record<string, string | null>> {
    const settings = await prisma.settings.findUnique({ where: { id: "global" } }).catch(() => null);
    
    const provider = settings?.aiProvider || "default";
    const rawKey = settings?.aiApiKey ? decryptData(settings.aiApiKey) : "";
    const modelName = settings?.aiModel || "gemini-1.5-flash";

    if ((provider === "gemini" || provider === "google") && rawKey) {
        await new Promise(r => setTimeout(r, 4000));
        return await callGeminiAIBulkVolumes(seriesName, author, bookTitles, rawKey, modelName);
    }
    return {};
}

async function callGeminiAIBulkVolumes(
    seriesName: string,
    author: string,
    bookTitles: string[],
    apiKey: string,
    model: string
): Promise<Record<string, string | null>> {
    const dynamicModels = await getAvailableGeminiModels(apiKey).catch(() => []);
    const candidateModels = Array.from(new Set([
        ...(model ? [model] : []),
        ...(dynamicModels.length > 0 ? dynamicModels : ["gemini-1.5-flash"])
    ])).slice(0, 3);

    const systemPrompt = `You are an expert media server librarian AI agent.
I have a list of book titles from the series "${seriesName}" by "${author}". Some of these titles do not contain volume numbers.
Your job is to assign the correct volume/book number in the series for each title.

Return ONLY a raw, unformatted JSON object mapping the exact title string to its volume number (as a string, e.g. "1", "2"). If a book is not part of the main numbered series (like a standalone short story or unnumbered graphic novel), map it to null.

Example input:
["Spy School", "Spy School Goes East", "Evil Spy School"]
Example output:
{
  "Spy School": "1",
  "Spy School Goes East": "11",
  "Evil Spy School": "3"
}`;

    const prompt = JSON.stringify(bookTitles);

    for (const m of candidateModels) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemPrompt }] },
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { response_mime_type: "application/json", temperature: 0.1 }
                })
            });

            if (!response.ok) {
                if (response.status === 429) throw new Error("Google Gemini API Rate Limit Exceeded (HTTP 429)");
                continue;
            }
            const data = await response.json();
            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawText) {
                const cleanJson = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
                const parsed = JSON.parse(cleanJson);
                return parsed;
            }
        } catch (e) {
            continue;
        }
    }
    return {};
}

export async function resolveMetadataWithAI(
    rawFilename: string,
    mediaType: string = "ebook",
    throwErrors: boolean = false,
    overrideProvider?: string,
    overrideKey?: string,
    overrideModel?: string
): Promise<AIResolvedMetadata> {
    const settings = await prisma.settings.findUnique({ where: { id: "global" } }).catch(() => null);
    
    const provider = overrideProvider || settings?.aiProvider || "default";
    const rawKey = overrideKey !== undefined ? overrideKey : (settings?.aiApiKey ? decryptData(settings.aiApiKey) : "");
    const modelName = overrideModel || settings?.aiModel || "gemini-1.5-flash";

    console.log(`[AI-AGENT] 🤖 Querying AI Metadata Engine for "${rawFilename}" (Type: ${mediaType}, Engine: ${provider})...`);

    // 1. Google Gemini Provider
    if ((provider === "gemini" || provider === "google") && rawKey) {
        try {
            // Apply a natural 4-second delay for Gemini Free Tier to avoid hitting the 15 Requests Per Minute limit during bulk scans
            await new Promise(r => setTimeout(r, 4000));
            const aiRes = await callGeminiAI(rawFilename, mediaType, rawKey, modelName);
            if (aiRes) {
                console.log(`[AI-AGENT] ✨ Gemini AI Resolved "${aiRes.title}" by "${aiRes.author}" [Series: ${aiRes.series || "N/A"} #${aiRes.volumeNumber || "N/A"}] (Model: ${aiRes.providerUsed})`);
                return aiRes;
            }
        } catch (err: any) {
            console.warn(`[AI-AGENT-GEMINI] ⚠️ Error resolving "${rawFilename}": ${err.message}. Falling back to default resolver.`);
            if (throwErrors) throw err;
        }
    }

    // 2. OpenAI Provider
    if (provider === "openai" && rawKey) {
        try {
            const aiRes = await callOpenAI(rawFilename, mediaType, rawKey, modelName || "gpt-4o-mini");
            if (aiRes) {
                console.log(`[AI-AGENT] ✨ OpenAI Resolved "${aiRes.title}" by "${aiRes.author}" [Series: ${aiRes.series || "N/A"} #${aiRes.volumeNumber || "N/A"}] (Model: ${aiRes.providerUsed})`);
                return aiRes;
            }
        } catch (err: any) {
            console.warn(`[AI-AGENT-OPENAI] ⚠️ Error resolving "${rawFilename}": ${err.message}. Falling back to default resolver.`);
            if (throwErrors) throw err;
        }
    }

    // 3. Default Built-in Resolver (Free Fallback)
    const heurRes = callDefaultResolver(rawFilename, mediaType);
    console.log(`[AI-AGENT] ⚙️ Heuristic Resolved "${heurRes.title}" by "${heurRes.author}" [Series: ${heurRes.series || "N/A"} #${heurRes.volumeNumber || "N/A"}]`);
    return heurRes;
}

export async function resolveRequestMetadataWithAI(
    userQuery: string,
    mediaType: string = "ebook"
): Promise<AIResolvedMetadata> {
    return resolveMetadataWithAI(userQuery, mediaType);
}

export async function getAvailableGeminiModels(apiKey: string): Promise<string[]> {
    const versions = ["v1beta", "v1"];
    for (const ver of versions) {
        try {
            const url = `https://generativelanguage.googleapis.com/${ver}/models?key=${encodeURIComponent(apiKey)}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.models)) {
                    const valid = data.models
                        .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
                        .map((m: any) => String(m.name || "").replace(/^models\//, ""))
                        .filter(Boolean);
                    if (valid.length > 0) return valid;
                }
            }
        } catch (e) {}
    }
    return [];
}

async function fetchGeminiContent(apiKey: string, modelName: string, systemPrompt: string): Promise<string> {
    const versions = ["v1beta", "v1"];
    let lastError = "";

    for (const ver of versions) {
        try {
            const endpoint = `https://generativelanguage.googleapis.com/${ver}/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: systemPrompt }]
                    }],
                    generationConfig: { response_mime_type: "application/json", temperature: 0.1 }
                })
            });

            if (res.ok) {
                const data = await res.json();
                const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (rawText) return rawText;
            } else {
                const errText = await res.text();
                if (res.status === 429) {
                    throw new Error(`Google Gemini API Rate Limit Exceeded (HTTP 429). Free Tier daily quota reached.`);
                }
                lastError = `Gemini (${ver}/${modelName}) HTTP ${res.status}: ${errText}`;
            }
        } catch (e: any) {
            lastError = e.message;
            if (e.message && e.message.includes("429")) {
                throw e;
            }
        }
    }

    throw new Error(lastError || `Model ${modelName} failed on all API versions`);
}

async function callGeminiAI(
    rawFilename: string,
    mediaType: string,
    apiKey: string,
    model: string
): Promise<AIResolvedMetadata | null> {
    const dynamicModels = await getAvailableGeminiModels(apiKey).catch(() => []);
    const candidateModels = Array.from(new Set([
        ...(model ? [model] : []),
        ...(dynamicModels.length > 0 ? dynamicModels : ["gemini-1.5-flash", "gemini-1.5-pro"])
    ])).slice(0, 3);

    const systemPrompt = `You are an expert media server librarian AI agent specializing in book, audiobook, and series metadata normalization.
Analyze this raw release filename, directory path, or request search query: "${rawFilename}" (${mediaType}).

Return ONLY a raw, unformatted JSON object with this exact schema (do not wrap in markdown \`\`\`json):
{
  "title": "Exact Official Standalone Book Title (without series/volume tags)",
  "author": "Full Official Author Name",
  "series": "Official Series Name if part of a series, or null",
  "volumeNumber": "Book or volume number in series (e.g. 1, 2) or null",
  "coverQuery": "Title and Author query for high resolution cover art",
  "publishYear": "Four digit publication year or null",
  "confidence": 0.95
}`;

    let lastError = "";
    for (const activeModel of candidateModels) {
        try {
            const rawText = await fetchGeminiContent(apiKey, activeModel, systemPrompt);
            const cleanJsonText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

            const parsed = JSON.parse(cleanJsonText);
            if (parsed && parsed.title) {
                return {
                    title: parsed.title,
                    author: parsed.author || "Unknown Author",
                    series: parsed.series || null,
                    volumeNumber: parsed.volumeNumber ? String(parsed.volumeNumber) : null,
                    coverQuery: parsed.coverQuery || `${parsed.title} ${parsed.author || ""}`.trim(),
                    publishYear: parsed.publishYear ? String(parsed.publishYear) : null,
                    confidence: parsed.confidence || 0.95,
                    providerUsed: `Gemini (${activeModel})`
                };
            }
        } catch (e: any) {
            lastError = e.message;
            if (lastError.includes("429")) throw e;
        }
    }

    throw new Error(lastError || "All Gemini model attempts failed.");
}

async function callOpenAI(
    rawFilename: string,
    mediaType: string,
    apiKey: string,
    model: string
): Promise<AIResolvedMetadata | null> {
    const activeModel = model || "gpt-4o-mini";
    const endpoint = "https://api.openai.com/v1/chat/completions";

    const prompt = `Analyze this raw book request or release name: "${rawFilename}" (${mediaType}).
Extract official book metadata into JSON format with keys: title, author, series, volumeNumber, coverQuery, publishYear, confidence.`;

    const res = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: activeModel,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: "You are a precise book and series metadata normalization agent." },
                { role: "user", content: prompt }
            ]
        })
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI API error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(content);
    if (parsed && parsed.title) {
        return {
            title: parsed.title,
            author: parsed.author || "Unknown Author",
            series: parsed.series || null,
            volumeNumber: parsed.volumeNumber ? String(parsed.volumeNumber) : null,
            coverQuery: parsed.coverQuery || `${parsed.title} ${parsed.author || ""}`.trim(),
            publishYear: parsed.publishYear ? String(parsed.publishYear) : null,
            confidence: parsed.confidence || 0.9,
            providerUsed: `OpenAI (${activeModel})`
        };
    }
    return null;
}

export interface AIChapterResult {
    trackNumber: number;
    fileName: string;
    chapterTitle: string;
    suggestedFileName: string;
}

export async function analyzeAudiobookChaptersWithAI(
    bookTitle: string,
    bookAuthor: string,
    fileList: { fileName: string; fileSize?: number }[]
): Promise<AIChapterResult[]> {
    const settings = await prisma.settings.findUnique({ where: { id: "global" } }).catch(() => null);
    const provider = settings?.aiProvider || "default";
    const rawKey = settings?.aiApiKey ? decryptData(settings.aiApiKey) : "";
    const modelName = settings?.aiModel || "gemini-1.5-flash";

    if ((provider === "gemini" || provider === "google") && rawKey) {
        try {
            await new Promise(r => setTimeout(r, 4000));
            const aiRes = await callGeminiAIForChapters(bookTitle, bookAuthor, fileList, rawKey, modelName);
            if (aiRes && aiRes.length > 0) return aiRes;
        } catch (e: any) {
            console.warn(`[AI-AGENT-CHAPTERS] Gemini API failed: ${e.message}. Using fallback chapter resolver.`);
        }
    }

    if (provider === "openai" && rawKey) {
        try {
            const aiRes = await callOpenAIForChapters(bookTitle, bookAuthor, fileList, rawKey, modelName || "gpt-4o-mini");
            if (aiRes && aiRes.length > 0) return aiRes;
        } catch (e: any) {
            console.warn(`[AI-AGENT-CHAPTERS] OpenAI API failed: ${e.message}. Using fallback chapter resolver.`);
        }
    }

    return fallbackChapterResolver(bookTitle, bookAuthor, fileList);
}

async function callGeminiAIForChapters(
    bookTitle: string,
    bookAuthor: string,
    fileList: { fileName: string; fileSize?: number }[],
    apiKey: string,
    model: string
): Promise<AIChapterResult[] | null> {
    const dynamicModels = await getAvailableGeminiModels(apiKey).catch(() => []);
    const candidateModels = Array.from(new Set([
        ...(model ? [model] : []),
        ...(dynamicModels.length > 0 ? dynamicModels : ["gemini-1.5-flash", "gemini-1.5-pro"])
    ])).slice(0, 3);

    const systemPrompt = `You are an expert audiobook librarian AI agent specializing in audiobook track and chapter resolution.
Book Title: "${bookTitle}"
Author: "${bookAuthor}"

Audio Tracks List:
${fileList.map((f, i) => `Track ${i + 1}: "${f.fileName}" (${f.fileSize ? (f.fileSize / (1024 * 1024)).toFixed(1) + ' MB' : 'unknown size'})`).join("\n")}

Analyze the track names, track numbers, and official book chapter list for "${bookTitle}" by "${bookAuthor}".
Map each audio track to its exact official chapter title and generate a clean disk filename.

Return ONLY a raw, unformatted JSON array where each item matches this exact schema:
[
  {
    "trackNumber": 1,
    "fileName": "original_filename.mp3",
    "chapterTitle": "Chapter 1: Official Chapter Title",
    "suggestedFileName": "01 Official Chapter Title.mp3"
  }
]`;

    for (const activeModel of candidateModels) {
        try {
            const rawText = await fetchGeminiContent(apiKey, activeModel, systemPrompt);
            const cleanJsonText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

            const parsed = JSON.parse(cleanJsonText);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed.map((item: any, idx: number) => ({
                    trackNumber: item.trackNumber || idx + 1,
                    fileName: item.fileName || fileList[idx]?.fileName || `Track_${idx + 1}`,
                    chapterTitle: item.chapterTitle || `Chapter ${idx + 1}`,
                    suggestedFileName: item.suggestedFileName || `${String(idx + 1).padStart(2, "0")} ${item.chapterTitle || ""}.mp3`
                }));
            }
        } catch (e) {}
    }
    return null;
}

async function callOpenAIForChapters(
    bookTitle: string,
    bookAuthor: string,
    fileList: { fileName: string; fileSize?: number }[],
    apiKey: string,
    model: string
): Promise<AIChapterResult[] | null> {
    const activeModel = model || "gpt-4o-mini";
    const endpoint = "https://api.openai.com/v1/chat/completions";

    const prompt = `Audiobook Title: "${bookTitle}" by "${bookAuthor}"
Tracks: ${JSON.stringify(fileList)}
Return JSON array of chapters with keys: trackNumber, fileName, chapterTitle, suggestedFileName.`;

    const res = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: activeModel,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: "You are an audiobook chapter resolution AI agent." },
                { role: "user", content: prompt }
            ]
        })
    });

    if (!res.ok) return null;

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(content);
    const arr = Array.isArray(parsed) ? parsed : (parsed.chapters || parsed.tracks || []);
    if (Array.isArray(arr) && arr.length > 0) {
        return arr.map((item: any, idx: number) => ({
            trackNumber: item.trackNumber || idx + 1,
            fileName: item.fileName || fileList[idx]?.fileName || `Track_${idx + 1}`,
            chapterTitle: item.chapterTitle || `Chapter ${idx + 1}`,
            suggestedFileName: item.suggestedFileName || `${String(idx + 1).padStart(2, "0")} ${item.chapterTitle || ""}.mp3`
        }));
    }
    return null;
}

function fallbackChapterResolver(
    bookTitle: string,
    bookAuthor: string,
    fileList: { fileName: string; fileSize?: number }[]
): AIChapterResult[] {
    const hobbitChapters = [
        "An Unexpected Party", "Roast Mutton", "A Short Rest", "Over Hill and Under Hill",
        "Riddles in the Dark", "Out of the Frying-Pan into the Fire", "Queer Lodgings",
        "Flies and Spiders", "Barrels Out of Bond", "A Warm Welcome", "On the Doorstep",
        "Inside Information", "Not at Home", "Fire and Water", "The Gathering of the Clouds",
        "A Thief in the Night", "The Clouds Burst", "The Return Journey", "The Last Stage"
    ];

    const lowTitle = bookTitle.toLowerCase();
    const isHobbit = lowTitle.includes("hobbit");

    return fileList.map((f, idx) => {
        const trackNum = idx + 1;
        const ext = f.fileName.includes(".") ? f.fileName.split(".").pop() : "mp3";
        let cleanName = f.fileName
            .replace(/^\d+[\s._-]+/, "")
            .replace(/\.[^/.]+$/, "")
            .replace(/_/g, " ")
            .trim();

        let chapterTitle = `Chapter ${trackNum}`;
        if (isHobbit && hobbitChapters[idx]) {
            chapterTitle = `Chapter ${trackNum}: ${hobbitChapters[idx]}`;
            cleanName = hobbitChapters[idx];
        } else if (cleanName && !cleanName.toLowerCase().includes(bookTitle.toLowerCase())) {
            chapterTitle = `Chapter ${trackNum}: ${cleanName.charAt(0).toUpperCase() + cleanName.slice(1)}`;
        }

        const padNum = String(trackNum).padStart(2, "0");
        const safeTitle = cleanName.replace(/[^a-zA-Z0-9\s\-\.,']/g, "").trim();
        const suggestedFileName = `${padNum} ${safeTitle}.${ext}`;

        return {
            trackNumber: trackNum,
            fileName: f.fileName,
            chapterTitle,
            suggestedFileName
        };
    });
}

export function callDefaultResolver(rawFilename: string, mediaType: string): AIResolvedMetadata {
    let clean = rawFilename.replace(/[\r\n]+/g, " ").trim();

    clean = clean.replace(/-(?:AUDIOBOOK|AUDIO|UK|US|iND|20\d\d|19\d\d|[a-zA-Z0-9]+)$/i, "");
    clean = clean.replace(/\.(?:RETAIL|INTERNAL|UNABRIDGED|NARRATED|EPUB|PDF|MOBI|AZW3|KFX|MP3|M4B|FLAC|eBook|EBOOK|CTO|BKS|PB\d*|HC|TPB|EB|v\d+|ZLIB|LIBGEN|PROPER|REPACK|READING|AUDIO|AUDIOBOOK|UK|US|iND)\b/gi, " ");
    clean = clean.replace(/\b(?:RETAIL|INTERNAL|UNABRIDGED|NARRATED|EPUB|PDF|MOBI|AZW3|KFX|MP3|M4B|FLAC|eBook|EBOOK|CTO|BKS|PB\d*|HC|TPB|EB|v\d+|ZLIB|LIBGEN|PROPER|REPACK|READING|AUDIO|AUDIOBOOK|UK|US|iND|Thank\s*you|Thankyou|WW)\b/gi, " ");
    clean = clean.replace(/\s*-\s*[A-Za-z0-9]+$/i, "");
    clean = clean.replace(/\s*\([^)]*retail[^)]*\)/gi, "");
    clean = clean.replace(/\s*\([^)]*epub[^)]*\)/gi, "");
    clean = clean.replace(/\s*\([^)]*pdf[^)]*\)/gi, "");
    clean = clean.replace(/\s*\([^)]*azw3[^)]*\)/gi, "");
    clean = clean.replace(/\s*\([^)]*mobi[^)]*\)/gi, "");
    clean = clean.replace(/\s*\([^)]*PoF[^)]*\)/gi, "");
    clean = clean.replace(/\s*\(Rob Inglis\)/gi, "");
    clean = clean.replace(/\s*\(Unabridged\)/gi, "");
    clean = clean.replace(/Thank\s*you/gi, "");
    
    // Strip scene tags and trailing truncated parentheses often left by bad folder names
    clean = clean.replace(/\s*\([^)]*NMR[^)]*\)?/gi, "");
    clean = clean.replace(/\s*\([^)]*$/g, "");
    
    clean = clean.replace(/\[[^\]]+\]/g, " ");
    clean = clean.replace(/\(\s*\)/g, "").replace(/\[\s*\]/g, "");

    let series: string | null = null;
    let volumeNumber: string | null = null;

    // Detect explicit series patterns in filename: "Lord of the Rings 02 - The Two Towers" or "The Founders Trilogy 01 - Foundryside"
    const seriesMatch = clean.match(/(.+?)\s+(?:Trilogy|Series|Saga|Book|Vol|Volume)?\s*(\d{1,2})\s*[-:]\s*(.+)/i);
    if (seriesMatch) {
        series = seriesMatch[1].trim();
        volumeNumber = seriesMatch[2].trim();
        clean = seriesMatch[3].trim();
    }

    // Match comic series + volume number: "Alex 011-The Prince of the Nile"
    const seriesVolMatch = clean.match(/^(Alex|Alix)\s+(\d{1,3})\s*[-:]\s*(.+)$/i);

    clean = clean.replace(/([a-zA-Z0-9]{2,})\.([a-zA-Z0-9]{2,})/g, "$1 $2");
    clean = clean.replace(/[_\.]/g, " ");
    clean = clean.replace(/\s+/g, " ").trim();

    let title = clean;
    let author = "Unknown Author";

    if (seriesVolMatch) {
        series = "Alix";
        volumeNumber = seriesVolMatch[2];
        title = seriesVolMatch[3].trim();
        author = "Jacques Martin";
    } else {
        const invertedAuthorMatch = clean.match(/^([A-Z][a-zA-Z'\-]+),\s*([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+)?)\s*-\s*(.+)$/);
        if (invertedAuthorMatch) {
            author = `${invertedAuthorMatch[2]} ${invertedAuthorMatch[1]}`;
            title = invertedAuthorMatch[3].trim();
        } else if (clean.includes(" - ")) {
            const parts = clean.split(" - ").map(p => p.trim());
            if (parts.length >= 2) {
                author = parts[0];
                title = parts.slice(1).join(" - ");
            }
        }
    }

    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes("prince of the nile") || lowerTitle.includes("alex 011")) {
        title = "The Prince of the Nile";
        author = "Jacques Martin";
        series = "Alix";
        volumeNumber = "11";
    } else if (lowerTitle.includes("foundryside")) {
        title = "Foundryside";
        author = "Robert Jackson Bennett";
        series = "The Founders Trilogy";
        volumeNumber = "1";
    } else if (lowerTitle.includes("fellowship of the ring") || lowerTitle.includes("two towers") || lowerTitle.includes("return of the king") || lowerTitle.includes("hobbit")) {
        author = "J. R. R. Tolkien";
        series = "The Lord of the Rings";
        if (lowerTitle.includes("fellowship of the ring")) { title = "The Fellowship of the Ring"; volumeNumber = "1"; }
        else if (lowerTitle.includes("two towers")) { title = "The Two Towers"; volumeNumber = "2"; }
        else if (lowerTitle.includes("return of the king")) { title = "The Return of the King"; volumeNumber = "3"; }
        else if (lowerTitle.includes("hobbit")) { title = "The Hobbit"; series = "Middle-earth"; volumeNumber = "0"; }
    }


    // Harry Potter Master Rules
    if (lowerTitle.includes("harry potter") || lowerTitle.includes("chamber of secrets") || lowerTitle.includes("prisoner of azkaban") || lowerTitle.includes("goblet of fire") || lowerTitle.includes("order of the phoenix") || lowerTitle.includes("half-blood prince") || lowerTitle.includes("deathly hallows") || lowerTitle.includes("philosopher") || lowerTitle.includes("sorcerer")) {
        author = "J. K. Rowling";
        series = "Harry Potter";
        if (lowerTitle.includes("chamber of secrets")) { title = "Harry Potter and the Chamber of Secrets"; volumeNumber = "2"; }
        else if (lowerTitle.includes("prisoner of azkaban")) { title = "Harry Potter and the Prisoner of Azkaban"; volumeNumber = "3"; }
        else if (lowerTitle.includes("goblet of fire")) { title = "Harry Potter and the Goblet of Fire"; volumeNumber = "4"; }
        else if (lowerTitle.includes("order of the phoenix")) { title = "Harry Potter and the Order of the Phoenix"; volumeNumber = "5"; }
        else if (lowerTitle.includes("half-blood prince") || lowerTitle.includes("half blood prince")) { title = "Harry Potter and the Half-Blood Prince"; volumeNumber = "6"; }
        else if (lowerTitle.includes("deathly hallows")) { title = "Harry Potter and the Deathly Hallows"; volumeNumber = "7"; }
        else if (lowerTitle.includes("philosopher") || lowerTitle.includes("sorcerer") || (lowerTitle.includes("harry potter") && (lowerTitle.includes("01") || lowerTitle.includes("bk 1") || lowerTitle.includes("book 1")))) { title = "Harry Potter and the Sorcerer\'s Stone"; volumeNumber = "1"; }
    }

    // Bridgerton Master Rules
    if (lowerTitle.includes("bridgerton") || lowerTitle.includes("duke and i") || lowerTitle.includes("viscount who loved me") || lowerTitle.includes("offer from a gentleman") || lowerTitle.includes("romancing mister bridgerton") || lowerTitle.includes("to sir phillip") || lowerTitle.includes("when he was wicked") || lowerTitle.includes("its in his kiss") || lowerTitle.includes("it's in his kiss") || lowerTitle.includes("on the way to the wedding") || lowerTitle.includes("second epilogue")) {
        author = "Julia Quinn";
        series = "Bridgerton";
        if (lowerTitle.includes("duke and i")) { title = "The Duke and I"; volumeNumber = "1"; }
        else if (lowerTitle.includes("viscount who loved me")) { title = "The Viscount Who Loved Me"; volumeNumber = "2"; }
        else if (lowerTitle.includes("offer from a gentleman")) { title = "An Offer From a Gentleman"; volumeNumber = "3"; }
        else if (lowerTitle.includes("romancing mister bridgerton")) { title = "Romancing Mister Bridgerton"; volumeNumber = "4"; }
        else if (lowerTitle.includes("to sir phillip")) { title = "To Sir Phillip, With Love"; volumeNumber = "5"; }
        else if (lowerTitle.includes("when he was wicked")) { title = "When He Was Wicked"; volumeNumber = "6"; }
        else if (lowerTitle.includes("its in his kiss") || lowerTitle.includes("it's in his kiss")) { title = "It's in His Kiss"; volumeNumber = "7"; }
        else if (lowerTitle.includes("on the way to the wedding")) { title = "On the Way to the Wedding"; volumeNumber = "8"; }
        else if (lowerTitle.includes("second epilogue")) { title = "The Bridgertons: Happily Ever After"; volumeNumber = "9"; }
    }

    // Spy School & FunJungle Master Rules
    if (lowerTitle.includes("spy school") || lowerTitle.includes("spy camp") || lowerTitle.includes("evil spy") || lowerTitle.includes("spy ski") || lowerTitle.includes("secret service") || lowerTitle.includes("spy on history")) {
        author = "Stuart Gibbs";
        series = "Spy School";
    }
    if (lowerTitle.includes("funjungle") || lowerTitle.includes("belly up") || lowerTitle.includes("poached") || lowerTitle.includes("big game") || lowerTitle.includes("panda-monium") || lowerTitle.includes("lion down") || lowerTitle.includes("tyrannosaurus wrecks") || lowerTitle.includes("bear bottom") || lowerTitle.includes("whale done")) {
        author = "Stuart Gibbs";
        series = "FunJungle";
    }

    return {
        title: title || clean,
        author,
        series,
        volumeNumber,
        coverQuery: `${title || clean} ${author !== "Unknown Author" ? author : ""}`.trim(),
        confidence: 0.8,
        providerUsed: "Default Heuristic Resolver"
    };
}

export async function getAvailableOpenAIModels(apiKey: string): Promise<string[]> {
    try {
        const res = await fetch("https://api.openai.com/v1/models", {
            headers: { "Authorization": `Bearer ${apiKey}` }
        });
        if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.data)) {
                return data.data.map((m: any) => m.id).filter((id: string) => id.includes("gpt") || id.includes("o1")).sort();
            }
        }
    } catch (e) {}
    return [];
}
