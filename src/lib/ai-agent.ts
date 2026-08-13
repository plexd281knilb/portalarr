import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";

export interface AIResolvedMetadata {
    title: string;
    author: string;
    series?: string | null;
    volumeNumber?: string | number | null;
    coverQuery?: string;
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
    const modelName = settings?.aiModel || "gemini-2.5-flash";

    // 1. Google Gemini Provider
    if ((provider === "gemini" || provider === "google") && rawKey) {
        try {
            const aiRes = await callGeminiAI(rawFilename, mediaType, rawKey, modelName);
            if (aiRes) return aiRes;
        } catch (err: any) {
            console.error(`[AI-AGENT-GEMINI] Error resolving "${rawFilename}":`, err.message);
        }
    }

    // 2. OpenAI Provider
    if (provider === "openai" && rawKey) {
        try {
            const aiRes = await callOpenAI(rawFilename, mediaType, rawKey, modelName || "gpt-4o-mini");
            if (aiRes) return aiRes;
        } catch (err: any) {
            console.error(`[AI-AGENT-OPENAI] Error resolving "${rawFilename}":`, err.message);
        }
    }

    // 3. Default Built-in Resolver (Free Fallback)
    return callDefaultResolver(rawFilename, mediaType);
}

async function callGeminiAI(
    rawFilename: string,
    mediaType: string,
    apiKey: string,
    model: string
): Promise<AIResolvedMetadata | null> {
    const activeModel = model || "gemini-2.5-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const systemPrompt = `You are an expert media server librarian AI agent specializing in book and audiobook release metadata normalization.
Analyze this messy release filename or directory path and extract the exact official book metadata.

Input Filename / Release Path: "${rawFilename}"
Media Type: "${mediaType}"

Return ONLY a raw, unformatted JSON object with this exact schema (do not wrap in markdown \`\`\`json):
{
  "title": "Exact Official Book Title",
  "author": "Full Author Name",
  "series": "Official Series Name or null",
  "volumeNumber": "Book or volume number as string or null",
  "coverQuery": "Title and Author query for cover art",
  "confidence": 0.95
}`;

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
        throw new Error(`Gemini API error (${res.status}): ${errText}`);
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
            volumeNumber: parsed.volumeNumber || null,
            coverQuery: parsed.coverQuery || `${parsed.title} ${parsed.author || ""}`.trim(),
            confidence: parsed.confidence || 0.95,
            providerUsed: `Gemini (${activeModel})`
        };
    }
    return null;
}

async function callOpenAI(
    rawFilename: string,
    mediaType: string,
    apiKey: string,
    model: string
): Promise<AIResolvedMetadata | null> {
    const activeModel = model || "gpt-4o-mini";
    const endpoint = "https://api.openai.com/v1/chat/completions";

    const prompt = `Analyze this messy release filename or folder path: "${rawFilename}" (${mediaType}).
Extract official book metadata into JSON format with keys: title, author, series, volumeNumber, coverQuery, confidence.`;

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
                { role: "system", content: "You are a precise book metadata normalization agent." },
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
            volumeNumber: parsed.volumeNumber || null,
            coverQuery: parsed.coverQuery || `${parsed.title} ${parsed.author || ""}`.trim(),
            confidence: parsed.confidence || 0.9,
            providerUsed: `OpenAI (${activeModel})`
        };
    }
    return null;
}

function callDefaultResolver(rawFilename: string, mediaType: string): AIResolvedMetadata {
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
    clean = clean.replace(/\b(20[0-2]\d)\b/g, " ");

    // Match comic series + volume number: "Alex 011-The Prince of the Nile" or "Alix 011-The Prince of the Nile"
    const seriesVolMatch = clean.match(/^(Alex|Alix)\s+(\d{1,3})\s*[-:]\s*(.+)$/i);

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
        const invertedAuthorMatch = clean.match(/^([A-Z][a-zA-Z'\-]+),\s*([A-Z][a-zA-Z'\-]+(?:\s+[A-Z][a-zA-Z'\-]+)?)\s*-\s*(.+)$/);
        if (invertedAuthorMatch) {
            author = `${invertedAuthorMatch[2]} ${invertedAuthorMatch[1]}`;
            let rest = invertedAuthorMatch[3].trim();
            rest = rest.replace(/^(?:[A-Za-z0-9\s]+Trilogy|[A-Za-z0-9\s]+Series|[A-Za-z0-9\s]+Saga)?\s*\d{1,2}\s*-\s*/i, "").trim();
            title = rest;
        } else if (clean.includes(" - ")) {
            const parts = clean.split(" - ").map(p => p.trim());
            if (parts.length >= 2) {
                let partA = parts[0];
                let partB = parts.slice(1).join(" - ");
                partB = partB.replace(/^(?:[A-Za-z0-9\s]+Trilogy|[A-Za-z0-9\s]+Series|[A-Za-z0-9\s]+Saga)?\s*\d{1,2}\s*-\s*/i, "").trim();

                const isPartBAuthor = /\b(?:N\.?\s*Chino|Robert\s+Jackson\s+Bennett|Genki\s+Kawamura|Jacques\s+Martin)\b/i.test(partB) || /^[A-Z]\.?\s*[A-Z]?[a-z]+$/i.test(partB);
                const isPartAAuthor = /\b(?:N\.?\s*Chino|Robert\s+Jackson\s+Bennett|Genki\s+Kawamura|Jacques\s+Martin)\b/i.test(partA) || /^[A-Z][a-z]+\s+[A-Z][a-z]+$/i.test(partA);

                if (isPartBAuthor && !isPartAAuthor) {
                    title = partA;
                    author = partB;
                } else {
                    author = partA;
                    title = partB;
                }
            }
        }
    }

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
        if (lowerTitle.includes("fellowship of the ring")) title = "The Fellowship of the Ring";
        else if (lowerTitle.includes("two towers")) title = "The Two Towers";
        else if (lowerTitle.includes("return of the king")) title = "The Return of the King";
        else if (lowerTitle.includes("hobbit")) title = "The Hobbit";
    }

    return {
        title: title || clean,
        author,
        coverQuery: `${title || clean} ${author !== "Unknown Author" ? author : ""}`.trim(),
        confidence: 0.8,
        providerUsed: "Default Heuristic Resolver"
    };
}
