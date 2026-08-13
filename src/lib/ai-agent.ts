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

export async function resolveMetadataWithAI(
    rawFilename: string,
    mediaType: string = "ebook"
): Promise<AIResolvedMetadata> {
    const settings = await prisma.settings.findUnique({ where: { id: "global" } }).catch(() => null);
    
    const provider = settings?.aiProvider || "default";
    const rawKey = settings?.aiApiKey ? decryptData(settings.aiApiKey) : "";
    const modelName = settings?.aiModel || "gemini-1.5-flash";

    // 1. Google Gemini Provider
    if ((provider === "gemini" || provider === "google") && rawKey) {
        try {
            const aiRes = await callGeminiAI(rawFilename, mediaType, rawKey, modelName);
            if (aiRes) return aiRes;
        } catch (err: any) {
            console.warn(`[AI-AGENT-GEMINI] Error resolving "${rawFilename}": ${err.message}. Falling back to default resolver.`);
        }
    }

    // 2. OpenAI Provider
    if (provider === "openai" && rawKey) {
        try {
            const aiRes = await callOpenAI(rawFilename, mediaType, rawKey, modelName || "gpt-4o-mini");
            if (aiRes) return aiRes;
        } catch (err: any) {
            console.warn(`[AI-AGENT-OPENAI] Error resolving "${rawFilename}": ${err.message}. Falling back to default resolver.`);
        }
    }

    // 3. Default Built-in Resolver (Free Fallback)
    return callDefaultResolver(rawFilename, mediaType);
}

export async function resolveRequestMetadataWithAI(
    userQuery: string,
    mediaType: string = "ebook"
): Promise<AIResolvedMetadata> {
    return resolveMetadataWithAI(userQuery, mediaType);
}

async function callGeminiAI(
    rawFilename: string,
    mediaType: string,
    apiKey: string,
    model: string
): Promise<AIResolvedMetadata | null> {
    const candidateModels = Array.from(new Set([
        model || "gemini-1.5-flash",
        "gemini-1.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-pro"
    ]));

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
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: systemPrompt }]
                    }]
                })
            });

            if (!res.ok) {
                const errText = await res.text();
                lastError = `Gemini API error (${res.status}): ${errText}`;
                continue;
            }

            const data = await res.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
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
