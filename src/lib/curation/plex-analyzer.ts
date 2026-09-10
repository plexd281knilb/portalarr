import { decryptData } from "@/lib/encryption";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getPlexServers, getPlexCloudServersMap } from "@/lib/plex";

export interface PlexMediaStreamInfo {
    ratingKey: string;
    key: string;
    title: string;
    year?: number;
    type: "movie" | "show" | "season" | "episode";
    thumb?: string;
    art?: string;
    duration?: number;
    summary?: string;
    studio?: string;
    contentRating?: string;
    rating?: number;
    audienceRating?: number;
    imdbRating?: number;
    rtCriticsRating?: number;
    rtAudienceRating?: number;
    addedAt?: number;
    lastViewedAt?: number;
    viewCount?: number;
    fileSize?: number;
    filePath?: string;
    guids: {
        imdb?: string;
        tmdb?: string;
        tvdb?: string;
    };
    media: {
        id: number;
        videoResolution?: string; // 4k, 1080, 720, sd
        videoCodec?: string; // hevc, h264, av1, vc1
        videoProfile?: string; // main 10, high
        videoFrameRate?: string; // 24p, 60p
        hdrFormat?: "Dolby Vision" | "HDR10+" | "HDR10" | "HDR" | "SDR";
        audioCodec?: string; // eac3, truehd, dca, aac, flac
        audioProfile?: string; // atmos, dts:x, ma, es
        audioChannels?: number; // 2, 6 (5.1), 8 (7.1)
        audioTitle?: string; // "Dolby Atmos TrueHD 7.1", etc.
        bitrate?: number;
        width?: number;
        height?: number;
        container?: string; // mkv, mp4
    }[];
    detectedBadges: {
        resolution?: "4K" | "1080p" | "720p" | "SD";
        hdr?: "DV" | "HDR10+" | "HDR10" | "HDR";
        audio?: "ATMOS" | "TRUEHD" | "DTS:X" | "DTS-HD" | "5.1" | "7.1";
        audioChannels?: string;
        codec?: string;
        edition?: string;
        studio?: string;
        contentRating?: string;
        audioFormatLabel?: string;
        videoFormatLabel?: string;
    };
    isLeavingSoon?: boolean;
}

/**
 * Parses Plex stream attributes to detect 4K, HDR, Dolby Vision, Atmos, audio channels, codecs, editions, etc.
 */
export function analyzeMediaStreamInfo(metadata: any): PlexMediaStreamInfo {
    const guids: { imdb?: string; tmdb?: string; tvdb?: string } = {};
    
    // Parse Guid tags: imdb://tt1234567, tmdb://12345, tvdb://12345
    if (Array.isArray(metadata.Guid)) {
        for (const g of metadata.Guid) {
            const idStr = String(g.id || "");
            if (idStr.startsWith("imdb://")) guids.imdb = idStr.replace("imdb://", "");
            else if (idStr.startsWith("tmdb://")) guids.tmdb = idStr.replace("tmdb://", "");
            else if (idStr.startsWith("tvdb://")) guids.tvdb = idStr.replace("tvdb://", "");
        }
    }
    if (metadata.guid) {
        const idStr = String(metadata.guid);
        if (idStr.includes("imdb://") && !guids.imdb) guids.imdb = idStr.split("imdb://")[1]?.split("?")[0];
        if (idStr.includes("tmdb://") && !guids.tmdb) guids.tmdb = idStr.split("tmdb://")[1]?.split("?")[0];
        if (idStr.includes("tvdb://") && !guids.tvdb) guids.tvdb = idStr.split("tvdb://")[1]?.split("?")[0];
    }

    const rawMediaList = Array.isArray(metadata.Media) ? metadata.Media : metadata.Media ? [metadata.Media] : [];
    const mediaList: PlexMediaStreamInfo["media"] = [];

    let detectedRes: "4K" | "1080p" | "720p" | "SD" | undefined;
    let detectedHdr: "DV" | "HDR10+" | "HDR10" | "HDR" | undefined;
    let detectedAudio: "ATMOS" | "TRUEHD" | "DTS:X" | "DTS-HD" | "5.1" | "7.1" | undefined;
    let detectedAudioChannels: string | undefined;
    let detectedCodec: string | undefined;
    let detectedEdition: string | undefined;
    let detectedStudio: string | undefined;
    let detectedContentRating: string | undefined;
    let audioFormatLabel: string | undefined;
    let videoFormatLabel: string | undefined;

    // Detect edition from Plex editionTitle, title, or filePath
    const titleLower = (metadata.title || "").toLowerCase();
    const editionTitle = (metadata.editionTitle || "").toLowerCase();
    const firstPartFile = (rawMediaList[0]?.Part?.[0] || rawMediaList[0]?.Part)?.file || "";
    const fileLower = firstPartFile.toLowerCase();

    if (editionTitle.includes("imax") || titleLower.includes("imax") || fileLower.includes("imax")) detectedEdition = "IMAX";
    else if (editionTitle.includes("criterion") || titleLower.includes("criterion") || fileLower.includes("criterion")) detectedEdition = "Criterion";
    else if (editionTitle.includes("director") || titleLower.includes("director's cut") || fileLower.includes("directors.cut") || fileLower.includes("director.cut")) detectedEdition = "Director's Cut";
    else if (editionTitle.includes("extended") || titleLower.includes("extended") || fileLower.includes("extended.cut") || fileLower.includes("extended.edition")) detectedEdition = "Extended";
    else if (editionTitle.includes("remaster") || titleLower.includes("remaster") || fileLower.includes("remastered")) detectedEdition = "Remastered";
    else if (fileLower.includes("remux")) detectedEdition = "Remux";

    // Detect Studio
    const studioRaw = (metadata.studio || "").toLowerCase();
    if (studioRaw.includes("hbo") || studioRaw.includes("max")) detectedStudio = "HBO";
    else if (studioRaw.includes("netflix")) detectedStudio = "Netflix";
    else if (studioRaw.includes("disney")) detectedStudio = "Disney+";
    else if (studioRaw.includes("apple")) detectedStudio = "Apple TV+";
    else if (studioRaw.includes("amazon") || studioRaw.includes("prime")) detectedStudio = "Prime";
    else if (studioRaw.includes("marvel")) detectedStudio = "Marvel";
    else if (studioRaw.includes("dc comics") || studioRaw.includes("dc entertainment")) detectedStudio = "DC";
    else if (studioRaw.includes("a24")) detectedStudio = "A24";
    else if (studioRaw.includes("paramount")) detectedStudio = "Paramount+";
    else if (studioRaw.includes("hulu")) detectedStudio = "Hulu";

    // Detect Content Rating
    const crRaw = (metadata.contentRating || "").toUpperCase();
    if (crRaw) {
        if (crRaw.includes("PG-13") || crRaw.includes("TV-14")) detectedContentRating = "PG-13";
        else if (crRaw.includes("PG") || crRaw.includes("TV-PG")) detectedContentRating = "PG";
        else if (crRaw === "G" || crRaw.includes("TV-G") || crRaw.includes("TV-Y")) detectedContentRating = "G";
        else if (crRaw.includes("NC-17")) detectedContentRating = "NC-17";
        else if (crRaw.includes("TV-MA") || crRaw.includes("R")) detectedContentRating = "R";
    }

    for (const m of rawMediaList) {
        const rawRes = (m.videoResolution || "").toLowerCase();
        const width = parseInt(m.width || "0", 10);
        const height = parseInt(m.height || "0", 10);
        const rawCodec = (m.videoCodec || "").toLowerCase();

        if (rawCodec.includes("hevc") || rawCodec.includes("h265") || rawCodec.includes("x265")) detectedCodec = "HEVC";
        else if (rawCodec.includes("av1")) detectedCodec = "AV1";
        else if (rawCodec.includes("prores")) detectedCodec = "ProRes";
        else if (rawCodec.includes("h264") || rawCodec.includes("avc") || rawCodec.includes("x264")) detectedCodec = "AVC";

        let res: "4K" | "1080p" | "720p" | "SD" = "1080p";
        if (rawRes === "4k" || width >= 3800 || height >= 2100) res = "4K";
        else if (rawRes === "1080" || width >= 1900 || height >= 1000) res = "1080p";
        else if (rawRes === "720" || width >= 1200 || height >= 700) res = "720p";
        else if (rawRes === "sd" || rawRes === "480" || rawRes === "576") res = "SD";

        if (!detectedRes || (res === "4K") || (res === "1080p" && detectedRes !== "4K")) {
            detectedRes = res;
        }

        const rawParts = Array.isArray(m.Part) ? m.Part : m.Part ? [m.Part] : [];
        let itemHdr: "Dolby Vision" | "HDR10+" | "HDR10" | "HDR" | "SDR" = "SDR";
        let itemAudioCodec = (m.audioCodec || "").toLowerCase();
        let itemAudioProfile = (m.audioProfile || "").toLowerCase();
        let itemAudioChannels = parseInt(m.audioChannels || "2", 10);
        let itemAudioTitle = "";

        if (itemAudioChannels >= 8) detectedAudioChannels = "7.1";
        else if (itemAudioChannels >= 6) detectedAudioChannels = "5.1";
        else if (itemAudioChannels === 2) detectedAudioChannels = "2.0";

        for (const part of rawParts) {
            const streams = Array.isArray(part.Stream) ? part.Stream : part.Stream ? [part.Stream] : [];
            
            // Analyze video stream
            const videoStream = streams.find((s: any) => s.streamType === 1 || s.streamType === "1");
            if (videoStream) {
                const colorPrimaries = (videoStream.colorPrimaries || "").toLowerCase();
                const doviTitle = (videoStream.doviTitle || "").toLowerCase();
                const doviProfile = videoStream.doviProfile;
                const displayTitle = (videoStream.displayTitle || "").toLowerCase();
                const extendedDisplayTitle = (videoStream.extendedDisplayTitle || "").toLowerCase();

                if (doviProfile || doviTitle || displayTitle.includes("dovi") || displayTitle.includes("dolby vision") || extendedDisplayTitle.includes("dolby vision")) {
                    itemHdr = "Dolby Vision";
                    detectedHdr = "DV";
                } else if (displayTitle.includes("hdr10+") || extendedDisplayTitle.includes("hdr10+")) {
                    itemHdr = "HDR10+";
                    if (detectedHdr !== "DV") detectedHdr = "HDR10+";
                } else if (colorPrimaries.includes("bt2020") || displayTitle.includes("hdr") || extendedDisplayTitle.includes("hdr") || videoStream.colorSpace?.toLowerCase().includes("bt2020")) {
                    itemHdr = "HDR10";
                    if (!detectedHdr || (detectedHdr !== "DV" && detectedHdr !== "HDR10+")) detectedHdr = "HDR10";
                }
            }

            // Analyze audio streams (pick primary / highest quality)
            const audioStreams = streams.filter((s: any) => s.streamType === 2 || s.streamType === "2");
            for (const as of audioStreams) {
                const aTitle = (as.title || "").toLowerCase();
                const aDisplay = (as.displayTitle || "").toLowerCase();
                const aExtended = (as.extendedDisplayTitle || "").toLowerCase();
                const aCodec = (as.codec || "").toLowerCase();
                const aChannels = parseInt(as.channels || "2", 10);

                if (aChannels >= 8) detectedAudioChannels = "7.1";
                else if (aChannels >= 6 && detectedAudioChannels !== "7.1") detectedAudioChannels = "5.1";

                if (aTitle.includes("atmos") || aDisplay.includes("atmos") || aExtended.includes("atmos") || as.audioChannelLayout?.toLowerCase().includes("atmos")) {
                    detectedAudio = "ATMOS";
                    audioFormatLabel = "Dolby Atmos";
                    itemAudioProfile = "atmos";
                } else if (aCodec === "truehd" || aDisplay.includes("truehd")) {
                    if (!detectedAudio || detectedAudio !== "ATMOS") {
                        detectedAudio = "TRUEHD";
                        audioFormatLabel = aChannels >= 8 ? "TrueHD 7.1" : "TrueHD 5.1";
                    }
                } else if (aTitle.includes("dts:x") || aDisplay.includes("dts:x") || aExtended.includes("dts:x") || as.profile?.toLowerCase().includes("dts:x")) {
                    if (detectedAudio !== "ATMOS") {
                        detectedAudio = "DTS:X";
                        audioFormatLabel = "DTS:X";
                    }
                } else if (aCodec.includes("dca") || aCodec.includes("dts") || aDisplay.includes("dts-hd") || aDisplay.includes("master audio")) {
                    if (!detectedAudio || (detectedAudio !== "ATMOS" && detectedAudio !== "DTS:X" && detectedAudio !== "TRUEHD")) {
                        detectedAudio = "DTS-HD";
                        audioFormatLabel = aChannels >= 8 ? "DTS-HD MA 7.1" : "DTS-HD MA 5.1";
                    }
                } else if (aChannels >= 8) {
                    if (!detectedAudio) {
                        detectedAudio = "7.1";
                        audioFormatLabel = "7.1 Surround";
                    }
                } else if (aChannels >= 6) {
                    if (!detectedAudio) {
                        detectedAudio = "5.1";
                        audioFormatLabel = "5.1 Surround";
                    }
                }

                if (!itemAudioTitle && (aDisplay || aTitle)) {
                    itemAudioTitle = as.displayTitle || as.title || "";
                }
            }
        }

        mediaList.push({
            id: m.id,
            videoResolution: res,
            videoCodec: m.videoCodec,
            videoProfile: m.videoProfile,
            videoFrameRate: m.videoFrameRate,
            hdrFormat: itemHdr,
            audioCodec: itemAudioCodec,
            audioProfile: itemAudioProfile,
            audioChannels: itemAudioChannels,
            audioTitle: itemAudioTitle,
            bitrate: m.bitrate,
            width,
            height,
            container: m.container
        });
    }

    if (detectedRes === "4K") {
        videoFormatLabel = detectedHdr === "DV" ? "4K UHD • Dolby Vision" : detectedHdr ? "4K UHD • HDR" : "4K UHD";
    } else if (detectedRes === "1080p") {
        videoFormatLabel = detectedHdr ? "1080p • HDR" : "1080p FHD";
    }

    const totalSize = rawMediaList.reduce((acc: number, m: any) => {
        const parts = Array.isArray(m.Part) ? m.Part : m.Part ? [m.Part] : [];
        return acc + parts.reduce((pAcc: number, p: any) => pAcc + (parseInt(p.size || "0", 10)), 0);
    }, 0);

    const firstPart = rawMediaList[0]?.Part?.[0] || rawMediaList[0]?.Part;
    const filePath: string | undefined = firstPart?.file;

    return {
        ratingKey: String(metadata.ratingKey),
        key: metadata.key,
        title: metadata.title,
        year: metadata.year ? parseInt(metadata.year, 10) : undefined,
        type: metadata.type || "movie",
        thumb: metadata.thumb,
        art: metadata.art,
        duration: metadata.duration ? parseInt(metadata.duration, 10) : undefined,
        summary: metadata.summary,
        studio: metadata.studio,
        contentRating: metadata.contentRating,
        rating: metadata.rating ? parseFloat(metadata.rating) : undefined,
        audienceRating: metadata.audienceRating ? parseFloat(metadata.audienceRating) : undefined,
        addedAt: metadata.addedAt ? parseInt(metadata.addedAt, 10) * 1000 : undefined,
        lastViewedAt: metadata.lastViewedAt ? parseInt(metadata.lastViewedAt, 10) * 1000 : undefined,
        viewCount: metadata.viewCount ? parseInt(metadata.viewCount, 10) : 0,
        fileSize: totalSize > 0 ? totalSize : undefined,
        filePath,
        guids,
        media: mediaList,
        detectedBadges: {
            resolution: detectedRes,
            hdr: detectedHdr,
            audio: detectedAudio,
            audioChannels: detectedAudioChannels,
            codec: detectedCodec,
            edition: detectedEdition,
            studio: detectedStudio,
            contentRating: detectedContentRating,
            audioFormatLabel,
            videoFormatLabel
        }
    };
}

/**
 * Fetches all media items from a Plex library section with stream metadata.
 */
export async function getPlexLibraryMediaItems(
    serverUrl: string,
    token: string,
    sectionKey: string | number,
    limit = 500
): Promise<PlexMediaStreamInfo[]> {
    const cleanBase = serverUrl.replace(/\/+$/, "");
    const url = `${cleanBase}/library/sections/${encodeURIComponent(String(sectionKey))}/all?includeGuids=1&X-Plex-Container-Start=0&X-Plex-Container-Size=${limit}&X-Plex-Token=${encodeURIComponent(token)}`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        const res = await fetch(url, {
            headers: {
                "Accept": "application/json",
                "X-Plex-Token": token,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            },
            signal: controller.signal,
            cache: "no-store"
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
            logger.addLog("WARN", "PLEX", `Failed to query library section ${sectionKey} items: HTTP ${res.status}`);
            return [];
        }

        const data = await res.json();
        const metadata = data.MediaContainer?.Metadata || [];
        const rawItems = Array.isArray(metadata) ? metadata : [metadata];

        return rawItems.map(analyzeMediaStreamInfo);
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Error querying library section ${sectionKey} items: ${e.message}`);
        return [];
    }
}

/**
 * Fetches existing Plex collections for a library section.
 */
export async function getPlexLibraryCollections(
    serverUrl: string,
    token: string,
    sectionKey: string | number
): Promise<{ ratingKey: string; title: string; summary?: string; thumb?: string; childCount: number }[]> {
    const cleanBase = serverUrl.replace(/\/+$/, "");
    const url = `${cleanBase}/library/sections/${encodeURIComponent(String(sectionKey))}/collections?X-Plex-Token=${encodeURIComponent(token)}`;

    try {
        const res = await fetch(url, {
            headers: {
                "Accept": "application/json",
                "X-Plex-Token": token,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            },
            cache: "no-store"
        });

        if (!res.ok) return [];

        const data = await res.json();
        const metadata = data.MediaContainer?.Metadata || [];
        const collections = Array.isArray(metadata) ? metadata : [metadata];

        return collections.map((c: any) => ({
            ratingKey: String(c.ratingKey),
            title: c.title,
            summary: c.summary,
            thumb: c.thumb,
            childCount: parseInt(c.childCount || "0", 10)
        }));
    } catch (e) {
        return [];
    }
}

/**
 * Creates or updates a Plex collection and populates it with item rating keys.
 */
export async function syncPlexCollection(
    serverUrl: string,
    token: string,
    sectionKey: string | number,
    collectionTitle: string,
    itemRatingKeys: string[],
    options?: {
        summary?: string;
        sortTitle?: string;
        posterBuffer?: Buffer;
        posterUrl?: string;
        promotedToHome?: boolean;
        promotedToRecommended?: boolean;
        promotedToSharedHome?: boolean;
        orderIndex?: number;
    }
): Promise<{ success: boolean; collectionRatingKey?: string; message?: string }> {
    if (!collectionTitle || itemRatingKeys.length === 0) {
        return { success: false, message: "Missing collection title or items." };
    }

    const cleanBase = serverUrl.replace(/\/+$/, "");
    let collectionRatingKey: string | undefined;

    // 1. Check if collection already exists
    const existingCollections = await getPlexLibraryCollections(serverUrl, token, sectionKey);
    const existing = existingCollections.find(c => c.title.toLowerCase() === collectionTitle.toLowerCase());

    if (existing) {
        collectionRatingKey = existing.ratingKey;
    } else {
        // Create collection: Plex creates a collection by assigning a collection tag to the first item
        const firstKey = itemRatingKeys[0];
        const tagUrl = `${cleanBase}/library/sections/${encodeURIComponent(String(sectionKey))}/all?type=1&id=${encodeURIComponent(firstKey)}&collection%5B0%5D.tag.tag=${encodeURIComponent(collectionTitle)}&X-Plex-Token=${encodeURIComponent(token)}`;
        
        try {
            await fetch(tagUrl, {
                method: "PUT",
                headers: { "X-Plex-Token": token, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" }
            });
            // Re-fetch collections to get the rating key
            const refreshed = await getPlexLibraryCollections(serverUrl, token, sectionKey);
            const found = refreshed.find(c => c.title.toLowerCase() === collectionTitle.toLowerCase());
            if (found) collectionRatingKey = found.ratingKey;
        } catch (e: any) {
            logger.addLog("WARN", "PLEX", `Failed to create initial collection tag "${collectionTitle}": ${e.message}`);
        }
    }

    // 2. Add all items to the collection
    let addedCount = 0;
    for (const rKey of itemRatingKeys) {
        try {
            const addUrl = `${cleanBase}/library/metadata/${encodeURIComponent(rKey)}?collection%5B%5D.tag.tag=${encodeURIComponent(collectionTitle)}&X-Plex-Token=${encodeURIComponent(token)}`;
            const putRes = await fetch(addUrl, {
                method: "PUT",
                headers: { "X-Plex-Token": token, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" }
            });
            if (putRes.ok) addedCount++;
        } catch (e) {}
    }

    // 3. Update collection summary, sort title, and Home Promotion if provided
    if (collectionRatingKey) {
        try {
            const params = new URLSearchParams();
            params.set("type", "18"); // Collection metadata type
            params.set("id", collectionRatingKey);
            if (options?.summary) {
                params.set("summary.value", options.summary);
                params.set("summary.locked", "1");
            }
            if (options?.sortTitle) {
                params.set("titleSort.value", options.sortTitle);
                params.set("titleSort.locked", "1");
            }
            if (options?.promotedToHome !== undefined) {
                params.set("promotedToHome.value", options.promotedToHome ? "1" : "0");
                params.set("promotedToHome.locked", "1");
            }
            if (options?.promotedToRecommended !== undefined) {
                params.set("promotedToRecommended.value", options.promotedToRecommended ? "1" : "0");
                params.set("promotedToRecommended.locked", "1");
            }
            if (options?.promotedToSharedHome !== undefined) {
                params.set("promotedToSharedHome.value", options.promotedToSharedHome ? "1" : "0");
                params.set("promotedToSharedHome.locked", "1");
            }
            params.set("X-Plex-Token", token);

            await fetch(`${cleanBase}/library/sections/${encodeURIComponent(String(sectionKey))}/all?${params.toString()}`, {
                method: "PUT",
                headers: { "X-Plex-Token": token, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" }
            });
        } catch (e) {}
    }

    // 4. Upload custom collection poster if provided
    if (collectionRatingKey && options?.posterBuffer) {
        await uploadPlexItemPoster(serverUrl, token, collectionRatingKey, options.posterBuffer);
    } else if (collectionRatingKey && options?.posterUrl) {
        await uploadPlexItemPosterFromUrl(serverUrl, token, collectionRatingKey, options.posterUrl);
    }

    logger.addLog("SUCCESS", "PLEX", `Synced collection "${collectionTitle}" (${addedCount}/${itemRatingKeys.length} items added) on section ${sectionKey}`);
    return {
        success: true,
        collectionRatingKey,
        message: `Synced collection "${collectionTitle}" with ${addedCount} items.`
    };
}

/**
 * Updates a Plex collection's sort title and Home / Recommended / Shared Home visibility flags.
 */
export async function updatePlexCollectionPromotionAndOrder(
    serverUrl: string,
    token: string,
    sectionKey: string | number,
    collectionRatingKey: string,
    options: {
        sortTitle?: string;
        promotedToHome?: boolean;
        promotedToRecommended?: boolean;
        promotedToSharedHome?: boolean;
    }
): Promise<{ success: boolean; message?: string }> {
    const cleanBase = serverUrl.replace(/\/+$/, "");
    try {
        const params = new URLSearchParams();
        params.set("type", "18"); // Collection
        params.set("id", collectionRatingKey);

        if (options.sortTitle) {
            params.set("titleSort.value", options.sortTitle);
            params.set("titleSort.locked", "1");
        }
        if (options.promotedToHome !== undefined) {
            params.set("promotedToHome.value", options.promotedToHome ? "1" : "0");
            params.set("promotedToHome.locked", "1");
        }
        if (options.promotedToRecommended !== undefined) {
            params.set("promotedToRecommended.value", options.promotedToRecommended ? "1" : "0");
            params.set("promotedToRecommended.locked", "1");
        }
        if (options.promotedToSharedHome !== undefined) {
            params.set("promotedToSharedHome.value", options.promotedToSharedHome ? "1" : "0");
            params.set("promotedToSharedHome.locked", "1");
        }
        params.set("X-Plex-Token", token);

        const res = await fetch(`${cleanBase}/library/sections/${encodeURIComponent(String(sectionKey))}/all?${params.toString()}`, {
            method: "PUT",
            headers: {
                "X-Plex-Token": token,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            }
        });

        return { success: res.ok };
    } catch (e: any) {
        return { success: false, message: e.message };
    }
}

/**
 * Uploads a poster image buffer directly to a Plex item (Movie, Show, or Collection).
 */
export async function uploadPlexItemPoster(
    serverUrl: string,
    token: string,
    ratingKey: string,
    imageBuffer: Buffer,
    mimeType = "image/jpeg"
): Promise<boolean> {
    const cleanBase = serverUrl.replace(/\/+$/, "");
    const url = `${cleanBase}/library/metadata/${encodeURIComponent(ratingKey)}/posters?X-Plex-Token=${encodeURIComponent(token)}`;

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": mimeType,
                "X-Plex-Token": token,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            },
            body: new Uint8Array(imageBuffer)
        });

        return res.ok;
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Failed to upload poster to item ${ratingKey}: ${e.message}`);
        return false;
    }
}

/**
 * Uploads a poster image from a URL to a Plex item.
 */
export async function uploadPlexItemPosterFromUrl(
    serverUrl: string,
    token: string,
    ratingKey: string,
    imageUrl: string
): Promise<boolean> {
    const cleanBase = serverUrl.replace(/\/+$/, "");
    const url = `${cleanBase}/library/metadata/${encodeURIComponent(ratingKey)}/posters?url=${encodeURIComponent(imageUrl)}&X-Plex-Token=${encodeURIComponent(token)}`;

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "X-Plex-Token": token,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            }
        });

        return res.ok;
    } catch (e) {
        return false;
    }
}

/**
 * Deletes a collection from Plex.
 */
export async function deletePlexCollection(
    serverUrl: string,
    token: string,
    collectionRatingKey: string
): Promise<boolean> {
    const cleanBase = serverUrl.replace(/\/+$/, "");
    const url = `${cleanBase}/library/metadata/${encodeURIComponent(collectionRatingKey)}?X-Plex-Token=${encodeURIComponent(token)}`;

    try {
        const res = await fetch(url, {
            method: "DELETE",
            headers: {
                "X-Plex-Token": token,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            }
        });
        return res.ok;
    } catch (e) {
        return false;
    }
}

/**
 * Fetches the active raw image buffer of an item's poster from Plex.
 */
export async function fetchPlexPosterBuffer(
    serverUrl: string,
    token: string,
    thumbPath: string
): Promise<Buffer | null> {
    if (!thumbPath) return null;
    const cleanBase = serverUrl.replace(/\/+$/, "");
    const fullUrl = thumbPath.startsWith("http")
        ? thumbPath
        : `${cleanBase}${thumbPath.startsWith("/") ? "" : "/"}${thumbPath}?X-Plex-Token=${encodeURIComponent(token)}`;

    try {
        const res = await fetch(fullUrl, {
            headers: {
                "X-Plex-Token": token,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            },
            cache: "no-store"
        });

        if (!res.ok) return null;
        const arrayBuf = await res.arrayBuffer();
        return Buffer.from(arrayBuf);
    } catch (e) {
        return null;
    }
}

/**
 * Prune candidate representation with disk footprint and watch stats.
 */
export interface PruneCandidateItem {
    ratingKey: string;
    title: string;
    year?: number;
    type: "movie" | "show" | "season" | "episode";
    sectionKey: string;
    sectionTitle?: string;
    serverId: string;
    serverName?: string;
    addedAt?: number;
    lastViewedAt?: number;
    viewCount: number;
    fileSizeGb: number;
    filePath?: string;
    imdbId?: string;
    tmdbId?: string;
    reason: string;
    daysOld: number;
}

/**
 * Evaluates oldest and unwatched media items across sections for a server to simulate or execute capacity pruning.
 */
export async function evaluatePruneCandidatesForServer(
    serverUrl: string,
    token: string,
    serverId: string,
    serverName: string,
    options: {
        minAgeDays?: number;
        unwatchedOnly?: boolean;
        targetFreeGb?: number;
        maxCandidates?: number;
    } = {}
): Promise<{
    candidates: PruneCandidateItem[];
    totalRecoverableGb: number;
    evaluatedCount: number;
}> {
    const minAgeDays = options.minAgeDays ?? 90;
    const unwatchedOnly = options.unwatchedOnly ?? true;
    const maxCandidates = options.maxCandidates ?? 50;

    const cleanBase = serverUrl.replace(/\/+$/, "");
    const sectionsUrl = `${cleanBase}/library/sections?X-Plex-Token=${encodeURIComponent(token)}`;
    
    let sections: { key: string; title: string; type: string }[] = [];
    try {
        const secRes = await fetch(sectionsUrl, {
            headers: { "Accept": "application/json", "X-Plex-Token": token, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" },
            cache: "no-store"
        });
        if (secRes.ok) {
            const secData = await secRes.json();
            const directories = secData.MediaContainer?.Directory || [];
            sections = (Array.isArray(directories) ? directories : [directories])
                .filter((d: any) => d.type === "movie" || d.type === "show")
                .map((d: any) => ({ key: String(d.key), title: d.title, type: d.type }));
        }
    } catch (e) {}

    const allCandidates: PruneCandidateItem[] = [];
    let totalEvaluated = 0;
    const nowMs = Date.now();
    const minAgeMs = minAgeDays * 24 * 60 * 60 * 1000;

    for (const sec of sections) {
        const items = await getPlexLibraryMediaItems(serverUrl, token, sec.key, 1000);
        totalEvaluated += items.length;

        for (const item of items) {
            const addedAtMs = item.addedAt || nowMs;
            const ageMs = nowMs - addedAtMs;
            const daysOld = Math.floor(ageMs / (24 * 60 * 60 * 1000));

            // Filter out items younger than minAgeDays
            if (daysOld < minAgeDays) continue;

            const viewCount = item.viewCount || 0;
            const lastViewedAtMs = item.lastViewedAt;

            // Filter out items that have been watched recently if unwatchedOnly is true
            if (unwatchedOnly) {
                if (viewCount > 0 && lastViewedAtMs) {
                    const daysSinceViewed = Math.floor((nowMs - lastViewedAtMs) / (24 * 60 * 60 * 1000));
                    if (daysSinceViewed < 180) continue; // Watched in last 6 months
                }
            }

            const sizeBytes = item.fileSize || 0;
            const sizeGb = parseFloat((sizeBytes / (1024 * 1024 * 1024)).toFixed(2));

            let reason = `Added ${daysOld} days ago (Unwatched)`;
            if (viewCount > 0 && lastViewedAtMs) {
                const daysSinceViewed = Math.floor((nowMs - lastViewedAtMs) / (24 * 60 * 60 * 1000));
                reason = `Last watched ${daysSinceViewed} days ago (${viewCount} total plays)`;
            }

            allCandidates.push({
                ratingKey: item.ratingKey,
                title: item.title,
                year: item.year,
                type: item.type,
                sectionKey: sec.key,
                sectionTitle: sec.title,
                serverId,
                serverName,
                addedAt: item.addedAt,
                lastViewedAt: item.lastViewedAt,
                viewCount,
                fileSizeGb: sizeGb > 0 ? sizeGb : (item.type === "movie" ? 4.5 : 12.0),
                filePath: item.filePath,
                imdbId: item.guids.imdb,
                tmdbId: item.guids.tmdb,
                reason,
                daysOld
            });
        }
    }

    // Sort by oldest addedAt ascending (oldest first)
    allCandidates.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));

    const selected = allCandidates.slice(0, maxCandidates);
    const totalRecoverableGb = parseFloat(selected.reduce((acc, c) => acc + c.fileSizeGb, 0).toFixed(2));

    return {
        candidates: selected,
        totalRecoverableGb,
        evaluatedCount: totalEvaluated
    };
}

/**
 * Searches Plex library items across hubs or a specific library section.
 */
export async function searchPlexLibraryItems(
    serverUrl: string,
    token: string,
    query: string,
    sectionKey?: string
): Promise<PlexMediaStreamInfo[]> {
    const cleanBase = serverUrl.replace(/\/+$/, "");
    let endpoint = `${cleanBase}/hubs/search?query=${encodeURIComponent(query)}&limit=25`;
    if (sectionKey) {
        endpoint = `${cleanBase}/library/sections/${encodeURIComponent(sectionKey)}/all?title=${encodeURIComponent(query)}&X-Plex-Container-Start=0&X-Plex-Container-Size=25`;
    }

    try {
        const res = await fetch(endpoint, {
            headers: {
                Accept: "application/json",
                "X-Plex-Token": token,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            }
        });

        if (!res.ok) return [];

        const data = await res.json();
        const results: PlexMediaStreamInfo[] = [];

        if (sectionKey) {
            const rawMetadata = data.MediaContainer?.Metadata || [];
            for (const item of rawMetadata) {
                results.push(analyzeMediaStreamInfo(item));
            }
        } else {
            const hubs = data.MediaContainer?.Hub || [];
            for (const hub of hubs) {
                const metadataList = hub.Metadata || [];
                for (const item of metadataList) {
                    if (item.type === "movie" || item.type === "show" || item.type === "season" || item.type === "episode") {
                        results.push(analyzeMediaStreamInfo(item));
                    }
                }
            }
        }

        return results;
    } catch (e: any) {
        logger.addLog("WARN", "PLEX", `Search failed for query "${query}": ${e.message}`);
        return [];
    }
}

/**
 * Deep inspection of a single Plex media item (full video/audio telemetry, streams, parts, and overlays).
 */
export async function inspectPlexMediaItemFull(
    serverUrl: string,
    token: string,
    ratingKey: string,
    serverId?: string
): Promise<{
    item: PlexMediaStreamInfo;
    rawStreams: {
        video: any[];
        audio: any[];
        subtitles: any[];
    };
    parts: Array<{ id: number; file: string; sizeGb: number; container: string }>;
    hasBackup: boolean;
    isLeavingSoon: boolean;
    leavingSoonDate?: Date | null;
    leavingReason?: string | null;
} | null> {
    const cleanBase = serverUrl.replace(/\/+$/, "");
    const endpoint = `${cleanBase}/library/metadata/${encodeURIComponent(ratingKey)}?includeStreams=1&includeGuids=1`;

    try {
        const res = await fetch(endpoint, {
            headers: {
                Accept: "application/json",
                "X-Plex-Token": token,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            }
        });

        if (!res.ok) return null;

        const data = await res.json();
        const rawItem = data.MediaContainer?.Metadata?.[0];
        if (!rawItem) return null;

        const analyzed = analyzeMediaStreamInfo(rawItem);

        const videoStreams: any[] = [];
        const audioStreams: any[] = [];
        const subtitleStreams: any[] = [];
        const parts: Array<{ id: number; file: string; sizeGb: number; container: string }> = [];

        const mediaList = Array.isArray(rawItem.Media) ? rawItem.Media : rawItem.Media ? [rawItem.Media] : [];
        for (const m of mediaList) {
            const partList = Array.isArray(m.Part) ? m.Part : m.Part ? [m.Part] : [];
            for (const p of partList) {
                const sizeBytes = p.size || 0;
                parts.push({
                    id: p.id,
                    file: p.file || "",
                    sizeGb: parseFloat((sizeBytes / (1024 * 1024 * 1024)).toFixed(2)),
                    container: p.container || m.container || "mkv"
                });

                const streamList = Array.isArray(p.Stream) ? p.Stream : p.Stream ? [p.Stream] : [];
                for (const st of streamList) {
                    if (st.streamType === 1) {
                        videoStreams.push({
                            id: st.id,
                            codec: st.codec,
                            profile: st.profile,
                            width: st.width,
                            height: st.height,
                            bitrate: st.bitrate ? `${Math.round(st.bitrate / 1000)} Mbps` : undefined,
                            frameRate: st.frameRate || (st.displayTitle?.match(/(\d+p|\d+\.\d+fps)/i)?.[0]),
                            bitDepth: st.bitDepth ? `${st.bitDepth}-bit` : undefined,
                            colorSpace: st.colorSpace,
                            colorRange: st.colorRange,
                            colorPrimaries: st.colorPrimaries,
                            dovTitle: st.DOVIBaselinePresent ? "Dolby Vision" : (st.colorPrimaries === "bt2020" ? "HDR10" : "SDR"),
                            displayTitle: st.displayTitle || `${st.width}x${st.height} ${st.codec?.toUpperCase()}`
                        });
                    } else if (st.streamType === 2) {
                        audioStreams.push({
                            id: st.id,
                            codec: st.codec,
                            profile: st.profile,
                            channels: st.channels,
                            channelLayout: st.channelLayout,
                            audioChannelLayout: st.audioChannelLayout,
                            bitrate: st.bitrate ? `${Math.round(st.bitrate / 1000)} kbps` : undefined,
                            language: st.language || "Unknown",
                            languageCode: st.languageCode,
                            title: st.title || st.displayTitle,
                            selected: Boolean(st.selected),
                            default: Boolean(st.default)
                        });
                    } else if (st.streamType === 3) {
                        subtitleStreams.push({
                            id: st.id,
                            codec: st.codec,
                            language: st.language || "Unknown",
                            languageCode: st.languageCode,
                            title: st.title || st.displayTitle,
                            forced: Boolean(st.forced),
                            selected: Boolean(st.selected),
                            default: Boolean(st.default)
                        });
                    }
                }
            }
        }

        // Check if backed up
        let hasBackup = false;
        let isLeavingSoon = false;
        let leavingSoonDate: Date | null = null;
        let leavingReason: string | null = null;

        if (serverId) {
            const backup = await prisma.mediaArtBackup.findUnique({
                where: { serverId_ratingKey: { serverId, ratingKey } }
            });
            hasBackup = Boolean(backup);

            const adv = await prisma.mediaContentAdvisory.findUnique({
                where: { ratingKey_serverId: { ratingKey, serverId } }
            });
            if (adv && adv.isLeavingSoon) {
                isLeavingSoon = true;
                leavingSoonDate = adv.leavingSoonDate;
                leavingReason = adv.leavingReason;
            }
        }

        return {
            item: analyzed,
            rawStreams: {
                video: videoStreams,
                audio: audioStreams,
                subtitles: subtitleStreams
            },
            parts,
            hasBackup,
            isLeavingSoon,
            leavingSoonDate,
            leavingReason
        };
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Deep inspection failed for ratingKey "${ratingKey}": ${e.message}`);
        return null;
    }
}

/**
 * Permanently deletes a media item from Plex Media Server (and disk if Plex media deletion is enabled).
 */
export async function deleteMediaFromPlexServer(
    serverUrl: string,
    token: string,
    ratingKey: string
): Promise<{ success: boolean; message?: string }> {
    try {
        const cleanBase = serverUrl.replace(/\/+$/, "");
        const url = `${cleanBase}/library/metadata/${ratingKey}`;
        const res = await fetch(url, {
            method: "DELETE",
            headers: {
                "X-Plex-Token": token,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            }
        });

        if (res.ok) {
            logger.addLog("SUCCESS", "PLEX", `Deleted media ratingKey "${ratingKey}" from Plex.`);
            return { success: true, message: `Deleted item from Plex.` };
        } else {
            const txt = await res.text();
            logger.addLog("WARN", "PLEX", `Failed to delete ratingKey "${ratingKey}" from Plex (${res.status}): ${txt}`);
            return { success: false, message: `Plex returned HTTP ${res.status}` };
        }
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Exception deleting media from Plex: ${e.message}`);
        return { success: false, message: e.message };
    }
}

