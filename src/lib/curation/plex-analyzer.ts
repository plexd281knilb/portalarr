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
        audioFormatLabel?: string;
        videoFormatLabel?: string;
    };
}

/**
 * Parses Plex stream attributes to detect 4K, HDR, Dolby Vision, Atmos, etc.
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
    let audioFormatLabel: string | undefined;
    let videoFormatLabel: string | undefined;

    for (const m of rawMediaList) {
        const rawRes = (m.videoResolution || "").toLowerCase();
        const width = parseInt(m.width || "0", 10);
        const height = parseInt(m.height || "0", 10);

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
        guids,
        media: mediaList,
        detectedBadges: {
            resolution: detectedRes,
            hdr: detectedHdr,
            audio: detectedAudio,
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

    // 3. Update collection summary or sort title if provided
    if (collectionRatingKey && (options?.summary || options?.sortTitle)) {
        try {
            const params = new URLSearchParams();
            params.set("type", "18"); // Collection metadata type
            params.set("id", collectionRatingKey);
            if (options.summary) {
                params.set("summary.value", options.summary);
                params.set("summary.locked", "1");
            }
            if (options.sortTitle) {
                params.set("titleSort.value", options.sortTitle);
                params.set("titleSort.locked", "1");
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
