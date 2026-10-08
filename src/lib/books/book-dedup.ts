/**
 * Book Deduplication and Key Normalization Engine
 * Provides deterministic, multi-tier title and composite key normalization
 * across library scanners, database lookups, and post-scan deduplication sweeps.
 */

export function getNormTitle(title?: string | null): string {
    return (title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function getBookCleanTitleKey(title?: string | null): string {
    let cleanStr = (title || "").toLowerCase()
        .replace(/[\(\[]\s*(?:18|19|20)\d\d\s*[\)\]]/gi, " ")
        .replace(/\b(?:audiobook|ebook|epub|retail|mobi|cbz|mp3|flac|aac|m4b|cbr|vbr|unabridged|abridged|audible|narrated|repack|decipher|web|p2p|readarr|uk|us|ca|au|eu|ind)\b/gi, " ");

    if (cleanStr.includes("hobbit")) return "hobbit";
    if (cleanStr.includes("two towers")) return "two towers";
    if (cleanStr.includes("return of the king")) return "return of the king";
    if (cleanStr.includes("fellowship of the ring")) return "fellowship of the ring";

    // Harry Potter canonical subtitles take precedence over raw numbers
    if (cleanStr.includes("philosopher") || cleanStr.includes("sorcerer")) return "harry potter 1";
    if (cleanStr.includes("chamber of secrets")) return "harry potter 2";
    if (cleanStr.includes("prisoner of azkaban")) return "harry potter 3";
    if (cleanStr.includes("goblet of fire")) return "harry potter 4";
    if (cleanStr.includes("order of the phoenix")) return "harry potter 5";
    if (cleanStr.includes("half-blood prince") || cleanStr.includes("half blood prince")) return "harry potter 6";
    if (cleanStr.includes("deathly hallows")) return "harry potter 7";

    if (cleanStr.includes("harry potter")) {
        if (/\b(?:01|1|bk\s*1|book\s*1|vol\s*1)\b/i.test(cleanStr)) return "harry potter 1";
        if (/\b(?:02|2|bk\s*2|book\s*2|vol\s*2)\b/i.test(cleanStr)) return "harry potter 2";
        if (/\b(?:03|3|bk\s*3|book\s*3|vol\s*3)\b/i.test(cleanStr)) return "harry potter 3";
        if (/\b(?:04|4|bk\s*4|book\s*4|vol\s*4)\b/i.test(cleanStr)) return "harry potter 4";
        if (/\b(?:05|5|bk\s*5|book\s*5|vol\s*5)\b/i.test(cleanStr)) return "harry potter 5";
        if (/\b(?:06|6|bk\s*6|book\s*6|vol\s*6)\b/i.test(cleanStr)) return "harry potter 6";
        if (/\b(?:07|7|bk\s*7|book\s*7|vol\s*7)\b/i.test(cleanStr)) return "harry potter 7";
    }

    // Strip bracketed series, volume, or format tags like [Cosmere 01], [Fighting Fantasy 32], (Chestnut Springs #1)
    cleanStr = cleanStr
        .replace(/\[[^\]]+\]/g, " ")
        .replace(/\([^\)]+\)/g, " ")
        .replace(/^\s*\d{1,3}\s*[-._\s]+\s*/g, " ");

    // Strip leading series prefix or book number like "Chestnut Springs 01 - ", "The Founders Trilogy 01 - ", "Bridgerton 06 - ", "Book 1 - "
    const seriesPrefixPattern = /^(?:[a-zA-Z\s'-]+)?(?:#|Book|Vol|Volume)?\s*\d{1,3}(?:\.\d{1,2}|\s+\d{1,2})?\s*[-:]\s*/i;
    if (seriesPrefixPattern.test(cleanStr)) {
        const lower = cleanStr.toLowerCase();
        if (!lower.includes("catch 22") && !lower.includes("fahrenheit 451")) {
            cleanStr = cleanStr.replace(seriesPrefixPattern, " ");
        }
    }

    return cleanStr.replace(/[^a-z0-9]/g, "").trim();
}

export function getBookCompositeDedupKey(item: { mediaType?: string | null, author?: string | null, title?: string | null }): string {
    const cleanKey = getBookCleanTitleKey(item.title);
    if (!cleanKey) return "";
    const bMedia = item.mediaType === "audiobook" ? "audiobook" : "ebook";
    const bAuthorKey = getNormTitle(item.author || "");
    const authorGroupKey = (bAuthorKey && bAuthorKey !== "unknownauthor") ? bAuthorKey : "all";
    return `${bMedia}:::${authorGroupKey}:::${cleanKey}`;
}
